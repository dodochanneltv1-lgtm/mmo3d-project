// settings.js - ระบบปรับแต่งกราฟิก, ควบคุมระยะมองเห็น (Culling) และจดจำแคชแมพถาวร
import * as THREE from 'three';

const SETTINGS_STORAGE_KEY = 'aethel_graphics_settings_v1';
const IDB_NAME = 'AethelgardWorldCacheDB';
const IDB_STORE = 'chunk_blueprints';

export const GRAPHICS_PRESETS = {
  potato: {
    label: '⚡ ต่ำมาก (เน้นลื่นสุด)',
    chunkRadius: 1,         // รัศมีโหลดแมพ 1 Chunk (38m)
    entityCullDist: 42,     // ระยะประมวลผล NPC/Monster
    physicsCullDist: 12,    // ระยะคำนวณคลื่นผม S-Curve
    pixelRatio: 0.75,
    shadows: false,
    shadowMapSize: 512,
    usePostProc: false,
    weatherParticles: false,
    minimapRadius: 75
  },
  low: {
    label: '🟢 ต่ำ (Low)',
    chunkRadius: 1,
    entityCullDist: 55,
    physicsCullDist: 18,
    pixelRatio: 1.0,
    shadows: false,
    shadowMapSize: 1024,
    usePostProc: false,
    weatherParticles: true,
    minimapRadius: 90
  },
  medium: {
    label: '⚖️ กลาง (แนะนำ)',
    chunkRadius: 2,         // รัศมีโหลดแมพ 2 Chunks (76m)
    entityCullDist: 72,
    physicsCullDist: 26,
    pixelRatio: Math.min(window.devicePixelRatio || 1, 1.25),
    shadows: true,
    shadowMapSize: 1024,
    usePostProc: true,
    weatherParticles: true,
    minimapRadius: 110
  },
  high: {
    label: '✨ สูง (High)',
    chunkRadius: 2,
    entityCullDist: 92,
    physicsCullDist: 38,
    pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
    shadows: true,
    shadowMapSize: 2048,
    usePostProc: true,
    weatherParticles: true,
    minimapRadius: 135
  },
  ultra: {
    label: '👑 อัลตร้า (Ultra)',
    chunkRadius: 3,         // รัศมีโหลดแมพ 3 Chunks (114m)
    entityCullDist: 125,
    physicsCullDist: 55,
    pixelRatio: Math.min(window.devicePixelRatio || 1, 2.0),
    shadows: true,
    shadowMapSize: 2048,
    usePostProc: true,
    weatherParticles: true,
    minimapRadius: 165
  }
};

// โหลดค่าที่ผู้เล่นเคยตั้งไว้จาก localStorage
function loadSavedSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) {
      return { preset: 'medium', showFPS: true, ...GRAPHICS_PRESETS.medium, ...JSON.parse(raw) };
    }
  } catch (_) {}
  return { preset: 'medium', showFPS: true, ...GRAPHICS_PRESETS.medium };
}

export const gameSettings = loadSavedSettings();

export function saveGameSettings() {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(gameSettings));
  } catch (_) {}
}

// ============================================================================
// 1. ระบบจดจำและแคชโครงสร้างแมพถาวร (IndexedDB + localStorage Cache)
// ============================================================================
class WorldBlueprintCache {
  constructor() {
    this.db = null;
    this.memCache = new Map();
    this.exploredSet = new Set();
    this.currentSeed = 'AETHELGARD-RP-01';
    this.initPromise = this._initDB();
  }

  _initDB() {
    return new Promise((resolve) => {
      if (typeof indexedDB === 'undefined') {
        resolve(false);
        return;
      }
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(true);
      };
      req.onerror = () => resolve(false);
    });
  }

  async setSeed(seedStr) {
    this.currentSeed = String(seedStr || 'AETHELGARD-RP-01').trim();
    this.exploredSet.clear();
    try {
      const savedList = localStorage.getItem(`aethel_explored_${this.currentSeed}`);
      if (savedList) {
        JSON.parse(savedList).forEach((k) => this.exploredSet.add(k));
      }
    } catch (_) {}

    await this.initPromise;
    if (!this.db) return;

    // โหลดโครงสร้าง Chunk ของ Seed นี้จาก IndexedDB เข้าสู่ Memory ล่วงหน้า
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(IDB_STORE, 'readonly');
        const store = tx.objectStore(IDB_STORE);
        const prefix = `${this.currentSeed}|`;
        const cursorReq = store.openCursor();
        cursorReq.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            if (String(cursor.key).startsWith(prefix)) {
              this.memCache.set(cursor.key, cursor.value);
            }
            cursor.continue();
          } else {
            resolve();
          }
        };
        cursorReq.onerror = () => resolve();
      } catch (_) {
        resolve();
      }
    });
  }

  getChunkBlueprint(cx, cz) {
    const fullKey = `${this.currentSeed}|${cx},${cz}`;
    return this.memCache.get(fullKey) || null;
  }

  saveChunkBlueprint(cx, cz, blueprint) {
    const coordKey = `${cx},${cz}`;
    const fullKey = `${this.currentSeed}|${coordKey}`;
    this.memCache.set(fullKey, blueprint);

    if (!this.exploredSet.has(coordKey)) {
      this.exploredSet.add(coordKey);
      try {
        localStorage.setItem(
          `aethel_explored_${this.currentSeed}`,
          JSON.stringify(Array.from(this.exploredSet))
        );
      } catch (_) {}
    }

    if (this.db) {
      try {
        const tx = this.db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(blueprint, fullKey);
      } catch (_) {}
    }
  }

  clearCurrentSeedCache() {
    const prefix = `${this.currentSeed}|`;
    Array.from(this.memCache.keys()).forEach((k) => {
      if (k.startsWith(prefix)) this.memCache.delete(k);
    });
    this.exploredSet.clear();
    localStorage.removeItem(`aethel_explored_${this.currentSeed}`);
    if (this.db) {
      try {
        const tx = this.db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).clear();
      } catch (_) {}
    }
  }
}

export const worldCache = new WorldBlueprintCache();

// ============================================================================
// 2. ฟังก์ชันปรับใช้ค่ากราฟิกกับ Renderer, Camera, Fog และ Shadows ทันที
// ============================================================================
export function applyGraphicsSettingsToEngine(ctx) {
  if (!ctx) return;
  const { renderer, scene, camera, dirLight, postProc, weatherParticles } = ctx;
  const chunkSize = ctx.CHUNK_SIZE || 38;

  // 1. ปรับความละเอียดภาพ (Pixel Ratio)
  if (renderer) {
    renderer.setPixelRatio(gameSettings.pixelRatio);
    renderer.shadowMap.enabled = !!gameSettings.shadows;
  }

  // 2. ปรับเงาตกกระทบ (Shadows)
  if (dirLight) {
    dirLight.castShadow = !!gameSettings.shadows;
    if (gameSettings.shadows && dirLight.shadow && dirLight.shadow.mapSize) {
      const sz = gameSettings.shadowMapSize || 1024;
      if (dirLight.shadow.mapSize.width !== sz) {
        dirLight.shadow.mapSize.set(sz, sz);
        if (dirLight.shadow.map) {
          dirLight.shadow.map.dispose();
          dirLight.shadow.map = null;
        }
      }
    }
  }

  // 3. ปรับระยะการมองเห็นของกล้อง (Camera Far Plane) และหมอก (FogExp2) ให้สัมพันธ์กับ Chunk Radius
  const maxViewMeters = (gameSettings.chunkRadius + 0.85) * chunkSize;
  if (camera) {
    camera.far = Math.max(85, maxViewMeters + 38);
    camera.updateProjectionMatrix();
  }
  if (scene && scene.fog) {
    // ยิ่งลดระยะมองเห็น หมอกจะช่วยบังขอบแมพให้เนียนตาอย่างเป็นธรรมชาติ
    scene.fog.density = THREE.MathUtils.clamp(2.35 / maxViewMeters, 0.0032, 0.022);
  }

  // 4. ปรับขนาด Post-Processing Composer
  if (postProc && postProc.setSize) {
    postProc.setSize(window.innerWidth, window.innerHeight);
  }

  // 5. ปิดพาร์ติเคิลสภาพอากาศหากตั้งค่าไว้
  if (weatherParticles && !gameSettings.weatherParticles) {
    weatherParticles.visible = false;
  }

  // บันทึกค่าระยะฟิสิกส์ไว้ที่ window เพื่อให้ models.js เรียกเช็คระยะได้ทันที
  window.__AETHEL_PHYSICS_DIST_SQ = Math.pow(gameSettings.physicsCullDist || 26, 2);
}

// ============================================================================
// 3. ระบบ Culling & Chunk Hibernation อัปเดตในเกมลูป (ลดแลค 100%)
// ============================================================================
let _cullTimer = 0;
let _fpsFrames = 0;
let _fpsAccum = 0;
export let currentFPS = 60;

export function updatePerformanceOptimization(dt, ctx) {
  const {
    playerPos,
    CHUNK_SIZE = 38,
    chunkMap,
    generateChunk,
    monsters = [],
    wanderingNPCs = [],
    npcs = [],
    wildlifeList = [],
    farmingNodes = [],
    animatedCarriages = [],
    animatedCampfires = []
  } = ctx;

  // คำนวณ FPS ปัจจุบัน
  _fpsFrames++;
  _fpsAccum += dt;
  if (_fpsAccum >= 0.5) {
    currentFPS = Math.min(240, Math.round(_fpsFrames / _fpsAccum));
    _fpsFrames = 0;
    _fpsAccum = 0;
    const fpsBadge = document.getElementById('fps-counter-badge');
    if (fpsBadge) {
      fpsBadge.style.display = gameSettings.showFPS ? 'flex' : 'none';
      const activeChunks = Array.from(chunkMap.values()).filter((g) => g.visible).length;
      const totalSaved = Math.max(chunkMap.size, worldCache.exploredSet.size);
      const colorClass = currentFPS >= 50 ? 'text-emerald-300' : currentFPS >= 30 ? 'text-amber-300' : 'text-rose-400';
      fpsBadge.innerHTML = `<span class="${colorClass} font-extrabold">${currentFPS} FPS</span> <span class="text-slate-400">|</span> <span class="text-sky-200">แมพ: ${activeChunks}/${totalSaved} Chunks</span>`;
    }
  }

  if (!playerPos) return;
  window.__AETHEL_PLAYER_POS = playerPos;

  // เจนเฉพาะ Chunk ที่อยู่ในรัศมี chunkRadius รอบตัวผู้เล่น (สร้าง 1 Chunk ต่อเฟรมเพื่อป้องกันอาการกระตุกค้าง)
  const curCx = Math.round(playerPos.x / CHUNK_SIZE);
  const curCz = Math.round(playerPos.z / CHUNK_SIZE);
  const R = gameSettings.chunkRadius;
  let generatedThisFrame = 0;

  for (let dx = -R; dx <= R; dx++) {
    for (let dz = -R; dz <= R; dz++) {
      const key = `${curCx + dx},${curCz + dz}`;
      if (!chunkMap.has(key) && generatedThisFrame < 1) {
        generateChunk(curCx + dx, curCz + dz);
        generatedThisFrame++;
      }
    }
  }

  // รันการตรวจสอบซ่อน/แสดงผล (Culling) ทุกๆ 0.20 วินาที (ไม่จำเป็นต้องเช็คทุกเฟรมให้เปลือง CPU)
  _cullTimer += dt;
  if (_cullTimer < 0.20) return;
  _cullTimer = 0;

  // 1. ซ่อน Chunk ที่อยู่นอกระยะมองเห็น (Hibernation) และเปิดแสดงเฉพาะ Chunk ที่อยู่ใกล้
  chunkMap.forEach((chunkGroup, key) => {
    const [cxStr, czStr] = key.split(',');
    const cx = Number(cxStr);
    const cz = Number(czStr);
    const distChunks = Math.max(Math.abs(cx - curCx), Math.abs(cz - curCz));
    const shouldBeVisible = distChunks <= R;
    if (chunkGroup.visible !== shouldBeVisible) {
      chunkGroup.visible = shouldBeVisible;
    }
  });

  const cullDist = gameSettings.entityCullDist;
  const cullDistSq = cullDist * cullDist;

  // 2. Culling มอนสเตอร์
  for (let i = 0; i < monsters.length; i++) {
    const m = monsters[i];
    if (m.hp <= 0) {
      m._culled = true;
      continue;
    }
    const dx = m.mesh.position.x - playerPos.x;
    const dz = m.mesh.position.z - playerPos.z;
    const dSq = dx * dx + dz * dz;
    const inRange = dSq <= cullDistSq;
    m._culled = !inRange;
    if (m.mesh.visible !== inRange) {
      m.mesh.visible = inRange;
    }
  }

  // 3. Culling ชาวเมืองและชาวบ้านที่เดินไปมา
  for (let i = 0; i < wanderingNPCs.length; i++) {
    const w = wanderingNPCs[i];
    const pos = w.char3D.root.position;
    const dx = pos.x - playerPos.x;
    const dz = pos.z - playerPos.z;
    const inRange = (dx * dx + dz * dz) <= cullDistSq;
    w._culled = !inRange;
    if (w.char3D.root.visible !== inRange) {
      w.char3D.root.visible = inRange;
    }
  }

  // 4. Culling NPC ประจำร้าน/กิลด์
  for (let i = 0; i < npcs.length; i++) {
    const n = npcs[i];
    const pos = n.root.position;
    const dx = pos.x - playerPos.x;
    const dz = pos.z - playerPos.z;
    const inRange = (dx * dx + dz * dz) <= cullDistSq;
    n._culled = !inRange;
    if (n.root.visible !== inRange) {
      n.root.visible = inRange;
    }
  }

  // 5. Culling สัตว์ป่า
  for (let i = 0; i < wildlifeList.length; i++) {
    const wl = wildlifeList[i];
    const dx = wl.centerX - playerPos.x;
    const dz = wl.centerZ - playerPos.z;
    const inRange = (dx * dx + dz * dz) <= cullDistSq;
    wl._culled = !inRange;
    if (wl.mesh.visible !== inRange) {
      wl.mesh.visible = inRange;
    }
  }

  // 6. Culling จุดฟาร์มแร่/สมุนไพร
  for (let i = 0; i < farmingNodes.length; i++) {
    const fn = farmingNodes[i];
    if (!fn.active) {
      fn.mesh.visible = false;
      continue;
    }
    const dx = fn.x - playerPos.x;
    const dz = fn.z - playerPos.z;
    const inRange = (dx * dx + dz * dz) <= cullDistSq;
    if (fn.mesh.visible !== inRange) {
      fn.mesh.visible = inRange;
    }
  }

  // 7. Culling รถม้าและกองไฟ
  for (let i = 0; i < animatedCarriages.length; i++) {
    const car = animatedCarriages[i];
    const dx = car.group.position.x - playerPos.x;
    const dz = car.group.position.z - playerPos.z;
    const inRange = (dx * dx + dz * dz) <= (cullDistSq * 1.3);
    car._culled = !inRange;
    if (car.group.visible !== inRange) {
      car.group.visible = inRange;
    }
  }
  for (let i = 0; i < animatedCampfires.length; i++) {
    const cf = animatedCampfires[i];
    if (!cf.group) continue;
    const worldPos = new THREE.Vector3();
    cf.group.getWorldPosition(worldPos);
    const dx = worldPos.x - playerPos.x;
    const dz = worldPos.z - playerPos.z;
    const inRange = (dx * dx + dz * dz) <= cullDistSq;
    cf.group.visible = inRange;
  }
}

// ============================================================================
// 4. สร้าง UI ปุ่มตั้งค่ากราฟิก [O], ป้าย FPS และหน้าต่าง Modal อัตโนมัติ
// ============================================================================
export function initSettingsUI(ctx, onSettingsChanged, onReleaseMouse) {
  const topBar = document.getElementById('clock-badge')?.parentElement;
  if (topBar && !document.getElementById('btn-open-settings')) {
    const fpsBadge = document.createElement('div');
    fpsBadge.id = 'fps-counter-badge';
    fpsBadge.className = 'glass px-2.5 py-1 rounded-full text-[11px] font-mono flex items-center gap-1.5 border border-emerald-400/30';
    fpsBadge.innerHTML = `<span class="text-emerald-300 font-extrabold">60 FPS</span>`;
    topBar.appendChild(fpsBadge);

    const btn = document.createElement('button');
    btn.id = 'btn-open-settings';
    btn.className = 'glass px-3 py-1 rounded-full text-[11px] hover:bg-slate-800 transition flex items-center gap-1 border border-amber-400/50 text-amber-200 font-bold';
    btn.innerHTML = `⚙️ ตั้งค่ากราฟิก [O]`;
    topBar.appendChild(btn);
  }

  if (!document.getElementById('modal-settings')) {
    const modal = document.createElement('div');
    modal.id = 'modal-settings';
    modal.className = 'hidden fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4';
    modal.innerHTML = `
      <div class="glass gold-border rounded-2xl w-full max-w-xl p-5 max-h-[88vh] flex flex-col text-xs text-slate-200">
        <div class="flex justify-between items-center pb-3 border-b border-slate-700">
          <div>
            <h3 class="text-lg font-extrabold text-amber-300">⚙️ ตั้งค่ากราฟิก & ประสิทธิภาพ (Graphics & Optimization)</h3>
            <p class="text-[11px] text-slate-300">ปรับระยะมองเห็นและกราฟิกเพื่อให้เล่นกับเพื่อนได้ลื่นไหลสูงสุด พร้อมระบบจำแคชแมพถาวร</p>
          </div>
          <button id="btn-close-settings" class="px-3 py-1 rounded-lg bg-slate-800 hover:bg-rose-600 text-xs font-bold">✕ ปิด [O]</button>
        </div>

        <div class="space-y-3.5 my-4 overflow-y-auto custom-scroll pr-1">
          <!-- Presets -->
          <div>
            <label class="block text-amber-300 font-bold mb-1.5">1. ระดับกราฟิกสำเร็จรูป (Quick Presets)</label>
            <div id="settings-preset-grid" class="grid grid-cols-2 sm:grid-cols-5 gap-1.5"></div>
          </div>

          <!-- Render Distance (Chunks) -->
          <div class="p-3 rounded-xl bg-slate-900/90 border border-slate-700 space-y-2.5">
            <div>
              <div class="flex justify-between mb-1">
                <span class="font-semibold text-emerald-300">🗺️ ระยะโหลดและแสดงผลแมพ (Chunk View Distance)</span>
                <b id="lbl-chunk-radius" class="text-amber-300 font-mono">2 Chunks (76m)</b>
              </div>
              <input id="sl-chunk-radius" type="range" min="1" max="4" step="1" class="w-full h-1.5 accent-emerald-400 cursor-pointer" />
              <div class="text-[10px] text-slate-400 mt-0.5">ลดเหลือ 1-2 Chunks จะช่วยแก้ปัญหาเห็นบ้านไกลสุดลูกหูลูกตาและลดอาการแลคเวลาเดินสำรวจไกลๆ ได้ทันที</div>
            </div>

            <div>
              <div class="flex justify-between mb-1">
                <span class="font-semibold text-sky-300">👾 ระยะประมวลผล NPC & มอนสเตอร์ (Entity Cull Distance)</span>
                <b id="lbl-entity-dist" class="text-amber-300 font-mono">72 เมตร</b>
              </div>
              <input id="sl-entity-dist" type="range" min="35" max="140" step="5" class="w-full h-1.5 accent-sky-400 cursor-pointer" />
              <div class="text-[10px] text-slate-400 mt-0.5">NPC และมอนสเตอร์ที่อยู่ไกลกว่าระยะนี้จะถูกซ่อนและหยุดคำนวณ AI ชั่วคราว</div>
            </div>

            <div>
              <div class="flex justify-between mb-1">
                <span class="font-semibold text-pink-300">💇‍♀️ ระยะฟิสิกส์คลื่นผม & ผ้าคลุม (Vertex S-Curve Distance)</span>
                <b id="lbl-phys-dist" class="text-amber-300 font-mono">26 เมตร</b>
              </div>
              <input id="sl-phys-dist" type="range" min="8" max="60" step="2" class="w-full h-1.5 accent-pink-400 cursor-pointer" />
            </div>

            <div>
              <div class="flex justify-between mb-1">
                <span class="font-semibold text-purple-300">🖥️ ความละเอียดการเรนเดอร์ (Resolution Scale)</span>
                <b id="lbl-pixel-ratio" class="text-amber-300 font-mono">1.00x</b>
              </div>
              <input id="sl-pixel-ratio" type="range" min="0.5" max="2.0" step="0.05" class="w-full h-1.5 accent-purple-400 cursor-pointer" />
            </div>
          </div>

          <!-- Toggles -->
          <div class="grid grid-cols-2 gap-2">
            <button id="tog-postproc" class="p-2.5 rounded-xl border text-left transition"></button>
            <button id="tog-shadows" class="p-2.5 rounded-xl border text-left transition"></button>
            <button id="tog-weather" class="p-2.5 rounded-xl border text-left transition"></button>
            <button id="tog-fps" class="p-2.5 rounded-xl border text-left transition"></button>
          </div>

          <!-- World Cache Status -->
          <div class="p-3 rounded-xl bg-emerald-950/40 border border-emerald-400/40 flex items-center justify-between gap-2">
            <div>
              <div class="font-bold text-emerald-300">💾 ระบบจดจำขนาดแมพและแคชพื้นที่ถาวร (World Blueprint Cache)</div>
              <div id="lbl-cache-status" class="text-[11px] text-slate-300 mt-0.5">กำลังตรวจสอบแคชแมพ...</div>
            </div>
            <button id="btn-clear-world-cache" class="px-3 py-1.5 rounded-lg bg-rose-600/80 hover:bg-rose-500 text-white font-bold text-[11px] shrink-0">
              🗑️ ล้างแคชแมพ
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  const modalEl = document.getElementById('modal-settings');
  const syncModalUI = () => {
    const presetGrid = document.getElementById('settings-preset-grid');
    presetGrid.innerHTML = '';
    Object.entries(GRAPHICS_PRESETS).forEach(([key, spec]) => {
      const active = gameSettings.preset === key;
      const b = document.createElement('button');
      b.className = `py-2 px-2 rounded-xl font-bold text-[11px] border transition ${
        active
          ? 'bg-amber-500 text-slate-950 border-amber-300 shadow'
          : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700'
      }`;
      b.textContent = spec.label;
      b.onclick = () => {
        Object.assign(gameSettings, spec, { preset: key });
        saveGameSettings();
        applyGraphicsSettingsToEngine(ctx);
        if (onSettingsChanged) onSettingsChanged();
        syncModalUI();
      };
      presetGrid.appendChild(b);
    });

    const slChunk = document.getElementById('sl-chunk-radius');
    const lblChunk = document.getElementById('lbl-chunk-radius');
    slChunk.value = gameSettings.chunkRadius;
    lblChunk.textContent = `${gameSettings.chunkRadius} Chunks (${gameSettings.chunkRadius * (ctx.CHUNK_SIZE || 38)}m)`;
    slChunk.oninput = (e) => {
      gameSettings.chunkRadius = parseInt(e.target.value, 10);
      gameSettings.preset = 'custom';
      lblChunk.textContent = `${gameSettings.chunkRadius} Chunks (${gameSettings.chunkRadius * (ctx.CHUNK_SIZE || 38)}m)`;
      saveGameSettings();
      applyGraphicsSettingsToEngine(ctx);
      if (onSettingsChanged) onSettingsChanged();
    };

    const slEnt = document.getElementById('sl-entity-dist');
    const lblEnt = document.getElementById('lbl-entity-dist');
    slEnt.value = gameSettings.entityCullDist;
    lblEnt.textContent = `${gameSettings.entityCullDist} เมตร`;
    slEnt.oninput = (e) => {
      gameSettings.entityCullDist = parseInt(e.target.value, 10);
      gameSettings.preset = 'custom';
      lblEnt.textContent = `${gameSettings.entityCullDist} เมตร`;
      saveGameSettings();
      if (onSettingsChanged) onSettingsChanged();
    };

    const slPhys = document.getElementById('sl-phys-dist');
    const lblPhys = document.getElementById('lbl-phys-dist');
    slPhys.value = gameSettings.physicsCullDist;
    lblPhys.textContent = `${gameSettings.physicsCullDist} เมตร`;
    slPhys.oninput = (e) => {
      gameSettings.physicsCullDist = parseInt(e.target.value, 10);
      gameSettings.preset = 'custom';
      lblPhys.textContent = `${gameSettings.physicsCullDist} เมตร`;
      saveGameSettings();
      applyGraphicsSettingsToEngine(ctx);
    };

    const slPix = document.getElementById('sl-pixel-ratio');
    const lblPix = document.getElementById('lbl-pixel-ratio');
    slPix.value = gameSettings.pixelRatio;
    lblPix.textContent = `${Number(gameSettings.pixelRatio).toFixed(2)}x`;
    slPix.oninput = (e) => {
      gameSettings.pixelRatio = parseFloat(e.target.value);
      gameSettings.preset = 'custom';
      lblPix.textContent = `${Number(gameSettings.pixelRatio).toFixed(2)}x`;
      saveGameSettings();
      applyGraphicsSettingsToEngine(ctx);
    };

    const bindToggle = (id, key, titleOn, titleOff) => {
      const btn = document.getElementById(id);
      const isOn = !!gameSettings[key];
      btn.className = `p-2.5 rounded-xl border text-left transition font-semibold ${
        isOn
          ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
          : 'bg-slate-900 border-slate-700 text-slate-400'
      }`;
      btn.innerHTML = isOn ? titleOn : titleOff;
      btn.onclick = () => {
        gameSettings[key] = !gameSettings[key];
        gameSettings.preset = 'custom';
        saveGameSettings();
        applyGraphicsSettingsToEngine(ctx);
        if (onSettingsChanged) onSettingsChanged();
        syncModalUI();
      };
    };

    bindToggle('tog-postproc', 'usePostProc', '✨ Reshade & Bloom: <b>เปิด</b>', '✨ Reshade & Bloom: <b>ปิด (เพิ่ม FPS สูง)</b>');
    bindToggle('tog-shadows', 'shadows', '☀️ เงาตกกระทบ 3D: <b>เปิด</b>', '☀️ เงาตกกระทบ 3D: <b>ปิด (ลดภาระ GPU)</b>');
    bindToggle('tog-weather', 'weatherParticles', '🌧️ พาร์ติเคิลอากาศ: <b>เปิด</b>', '🌧️ พาร์ติเคิลอากาศ: <b>ปิด</b>');
    bindToggle('tog-fps', 'showFPS', '📊 แสดง FPS & Chunks: <b>เปิด</b>', '📊 แสดง FPS & Chunks: <b>ปิด</b>');

    const cacheStatus = document.getElementById('lbl-cache-status');
    if (cacheStatus) {
      cacheStatus.innerHTML = `Seed ปัจจุบัน: <b class="text-amber-300">${worldCache.currentSeed}</b> | จดจำพื้นที่สำรวจแล้ว <b class="text-emerald-300">${worldCache.exploredSet.size} Chunks</b> (ไม่ต้องเจนใหม่เมื่อเข้าเกม)`;
    }
  };

  document.getElementById('btn-clear-world-cache').onclick = () => {
    worldCache.clearCurrentSeedCache();
    syncModalUI();
  };

  const toggleSettingsModal = () => {
    const isHidden = modalEl.classList.contains('hidden');
    if (isHidden) {
      if (onReleaseMouse) onReleaseMouse();
      syncModalUI();
      modalEl.classList.remove('hidden');
    } else {
      modalEl.classList.add('hidden');
    }
  };

  document.getElementById('btn-open-settings')?.addEventListener('click', toggleSettingsModal);
  document.getElementById('btn-close-settings')?.addEventListener('click', () => modalEl.classList.add('hidden'));

  window.addEventListener('keydown', (e) => {
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
    if (e.code === 'KeyO' || e.key === 'o' || e.key === 'O' || e.key === 'น') {
      toggleSettingsModal();
    }
  });

  applyGraphicsSettingsToEngine(ctx);
}
import * as THREE from 'three';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";
import { getDatabase, ref, set, get, update, onValue, onDisconnect, push } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  setupReshadePostProcessing,
  createAnimeMaterial,
  getVolumetricMistTexture,
  createWaterShaderMaterial,
  createSkyDomeShader
} from './shaders.js';
import { WEAPONS, ArticulatedCharacter3D } from './models.js';
import { smoothRotateAngle, SoundEngine, CLASSES, SkillFXManager } from './skills.js';
import {
  TOWNS,
  FARM_MATERIALS,
  animatedCampfires,
  animatedTownCrystals,
  SeededWorldNoise,
  registerBoxCollider,
  resolveWorldCollisions,
  createVolumetricCampfire,
  createWildlifeMesh,
  createMonsterMesh,
  updateMonsterAnimation,
  updateWorldEnvironment,
  createFarmingNodeMesh,
  buildRealisticGrandTown,
  createOrnateStreetLamp,
  createFramedWindowMesh,
  createDetailedTableAndChairs,
  createHingedDoor
} from './world.js';
import {
  gameSettings,
  worldCache,
  applyGraphicsSettingsToEngine,
  updatePerformanceOptimization,
  initSettingsUI
} from './settings.js';
const dynamicLightsList = [];

/**
 * ฟังก์ชันสร้างระบบแสงตกกระทบและกระจายแสง (Dynamic Lighting)
 * @param {THREE.Scene|THREE.Group} targetScene - Scene หรือ Group ที่ต้องการเพิ่มแสงเข้าไป
 * @param {string} type - ชนิดของแสง ('lantern', 'bulb', 'campfire')
 * @param {number} x - พิกัดแกน X
 * @param {number} y - พิกัดแกน Y
 * @param {number} z - พิกัดแกน Z
 * @returns {THREE.Group} - คืนค่า Group ของแสงและวัตถุจำลอง
 */
export function createDynamicLight(targetScene, type, x, y, z) {
  const lightGroup = new THREE.Group();
  lightGroup.position.set(x, y, z);

  let light;
  let mesh;

  // 1. ตะเกียง (Lantern): แสงสีส้มอมเหลือง นุ่มนวล กระจายแสงระยะใกล้ มีการกระพริบเบาๆ
  if (type === 'lantern') {
    light = new THREE.PointLight(0xffb74d, 1.5, 12, 2.0); // (สี, ความสว่าง, ระยะกระจายแสง, อัตราการสลายตัว)
    light.castShadow = true;
    
    // จำลองโมเดลตะเกียง
    mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.15, 0.4, 8),
      new THREE.MeshStandardMaterial({ color: 0x2d3748, emissive: 0xffb74d, emissiveIntensity: 0.6 })
    );
    mesh.castShadow = true;
    lightGroup.add(mesh);
    
    // กำหนดค่าตัวแปรสำหรับการกระพริบ
    lightGroup.userData = { type: 'lantern', baseIntensity: 1.5, speed: 2.5, variance: 0.25 };
  }
  
  // 2. หลอดไฟ (Light Bulb): แสงสีขาวอมเหลือง สว่างจ้า คงที่ กระจายแสงวงกว้าง
  else if (type === 'bulb') {
    light = new THREE.PointLight(0xfffae6, 2.5, 25, 2.0);
    light.castShadow = true;
    
    // จำลองโมเดลหลอดไฟ
    mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfffae6, emissiveIntensity: 1.2 })
    );
    lightGroup.add(mesh);
    
    // หลอดไฟจะไม่มีการกระพริบ (variance = 0)
    lightGroup.userData = { type: 'bulb', baseIntensity: 2.5, speed: 0, variance: 0 };
  }
  
  // 3. กองไฟ (Campfire): แสงสีส้มแดง กระพริบแรงและเร็ว กระจายแสงแบบพลิ้วไหว
  else if (type === 'campfire') {
    light = new THREE.PointLight(0xf97316, 3.0, 18, 2.0);
    light.castShadow = true;
    
    // จำลองกองไฟ (หากคุณมีโมเดลกองไฟอยู่แล้ว สามารถลบส่วนนี้ได้)
    mesh = new THREE.Mesh(
      new THREE.ConeGeometry(0.4, 0.8, 8),
      new THREE.MeshStandardMaterial({ color: 0x451a03, emissive: 0xf97316, emissiveIntensity: 0.8 })
    );
    lightGroup.add(mesh);
    
    // กระพริบแรงและเปลี่ยนตำแหน่งแสงเล็กน้อยเพื่อเลียนแบบเปลวไฟ
    lightGroup.userData = { type: 'campfire', baseIntensity: 3.0, speed: 8.0, variance: 0.85 };
  }

  // ตั้งค่าคุณภาพแสงเงาตกกระทบ (Shadow Mapping)
  if (light) {
    light.shadow.bias = -0.001;
    light.shadow.mapSize.width = 1024;
    light.shadow.mapSize.height = 1024;
    light.shadow.camera.near = 0.1;
    light.shadow.camera.far = 30;
    
    // ยกแสงขึ้นเล็กน้อยไม่ให้จมดิน
    light.position.y = 0.2; 
    lightGroup.add(light);
  }

  targetScene.add(lightGroup);
  dynamicLightsList.push({ group: lightGroup, light: light });

  return lightGroup;
}

/**
 * ฟังก์ชันสำหรับอัปเดตการกระพริบและการกระจายแสง (เรียกใช้ในลูป animate)
 * @param {number} elapsedTime - เวลาที่ผ่านไปจาก clock.elapsedTime
 */
export function updateDynamicLighting(elapsedTime) {
  for (let i = 0; i < dynamicLightsList.length; i++) {
    const item = dynamicLightsList[i];
    const data = item.group.userData;
    
    if (data.variance > 0) {
      // ใช้สมการ Sine Wave ซ้อนกันเพื่อสร้าง Noise การกระพริบที่ดูเป็นธรรมชาติ
      const noise = (Math.sin(elapsedTime * data.speed) + Math.cos(elapsedTime * data.speed * 1.63)) * 0.5;
      
      // ปรับความสว่างของแสง
      item.light.intensity = data.baseIntensity + noise * data.variance;

      // หากเป็นกองไฟ ให้ขยับตำแหน่ง PointLight เล็กน้อยเพื่อให้เงาตกกระทบที่พื้นขยับตามเปลวไฟ
      if (data.type === 'campfire') {
        item.light.position.x = Math.sin(elapsedTime * 12) * 0.06;
        item.light.position.z = Math.cos(elapsedTime * 14) * 0.06;
      }
    }
  }
}

// ============================================================================
// 0. ระบบเสริมความลื่นไหล 60FPS (Zero-Lag Ribbon & Hair Sway) + ขยายมหานครขนาดใหญ่
// ============================================================================
const cityNightLights = [];
const streetLampGlowDiscs = [];
const buildingWindowMaterials = [];
const animatedCarriages = [];
const enterableBuildings = [];
const interactiveSeats = [];
const interactiveDoors = [];
const interactiveBeds = [];
const interactiveCabinets = [];
let ridingCarriage = null;
let activeSeatTarget = null;
let activeSittingSeat = null;
let activeBedTarget = null;
let activeSleepingBed = null;
const RESPAWN_COOLDOWN_MS = 20 * 60 * 1000; // 20 นาที (1,200,000 ms)

// ปลดล็อคเมาส์ให้อิสระทันทีเมื่อเปิดหน้าต่าง UI ในโหมด POV 1 และ POV 3
function releaseMouseForUI() {
  if (document.pointerLockElement) {
    document.exitPointerLock?.();
  }
}
// ขยายขนาดเมืองหลักทั้ง 4 แห่งให้เป็นมหานครขนาดใหญ่ (Radius 92-96) และเว้นระยะห่างแต่ละเมืองไม่ให้ทับซ้อนกัน
TOWNS.forEach((t, idx) => {
  if (idx === 0) { t.x = 0; t.z = 0; t.radius = 96; }
  else if (idx === 1) { t.x = -260; t.z = -260; t.radius = 88; }
  else if (idx === 2) { t.x = 260; t.z = -240; t.radius = 88; }
  else if (idx === 3) { t.x = -240; t.z = 260; t.radius = 88; }
});
function attachSoftClothSimulation(charInstance) {
  const ribbonTargets = [];
  if (!charInstance || !charInstance.root) return;
  charInstance.root.traverse((child) => {
    if (!child.isMesh || !child.geometry) return;
    if (
      child.geometry.type === 'BoxGeometry' &&
      Math.abs((child.geometry.parameters?.height || 0) - 0.19) < 0.04 &&
      Math.abs((child.geometry.parameters?.width || 0) - 0.034) < 0.015
    ) {
      ribbonTargets.push({
        mesh: child,
        baseRotZ: child.rotation.z,
        baseRotX: child.rotation.x
      });
    }
  });
  charInstance._ribbonTargets = ribbonTargets;
}
function updateSoftClothSimulation(charInstance, dt, speedRatio = 0, turnDelta = 0) {
  if (!charInstance._ribbonTargets) {
    attachSoftClothSimulation(charInstance);
  }
  const t = charInstance.animTime || 0;
  const moveFactor = Math.min(1.5, speedRatio);
  const ribbons = charInstance._ribbonTargets || [];
  for (let i = 0; i < ribbons.length; i++) {
    const r = ribbons[i];
    const sign = i % 2 === 0 ? -1 : 1;
    r.mesh.rotation.z = r.baseRotZ + Math.sin(t * 5.2 + i) * (0.06 + moveFactor * 0.12) * sign;
    r.mesh.rotation.x = r.baseRotX - 0.06 - moveFactor * 0.15 + Math.cos(t * 4.5 + i) * 0.04;
  }
}
const _origBuildModel = ArticulatedCharacter3D.prototype.buildModel;
ArticulatedCharacter3D.prototype.buildModel = function (...args) {
  const res = _origBuildModel.apply(this, args);
  attachSoftClothSimulation(this);
  return res;
};
const _origUpdateAnimation = ArticulatedCharacter3D.prototype.updateAnimation;
ArticulatedCharacter3D.prototype.updateAnimation = function (dt, speedRatio = 0, isJumping = false, verticalVelocity = 0, turnDelta = 0, isInWater = false) {
  _origUpdateAnimation.call(this, dt, speedRatio, isJumping, verticalVelocity, turnDelta, isInWater);
  updateSoftClothSimulation(this, dt, speedRatio, turnDelta);
};
// ============================================================================
// 1. FIREBASE REALTIME DATABASE & DUAL-CHANNEL MULTIPLAYER INITIALIZATION
// ============================================================================
const firebaseConfig = {
  apiKey: "AIzaSyA1wsO1FYcnUPwKAv_SW-JqBH_HBfr1FO0",
  authDomain: "mmo-game-df60b.firebaseapp.com",
  databaseURL: "https://mmo-game-df60b-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "mmo-game-df60b",
  storageBucket: "mmo-game-df60b.firebasestorage.app",
  messagingSenderId: "729262930419",
  appId: "1:729262930419:web:477d87d5a7764ab621fa86",
  measurementId: "G-B0144WQP7R"
};
let app, db;
let isFirebaseConnected = false;
try {
  app = initializeApp(firebaseConfig);
  try { getAnalytics(app); } catch (_) {}
  db = getDatabase(app);
  onValue(ref(db, ".info/connected"), (snap) => {
    isFirebaseConnected = !!snap.val();
    const dot = document.getElementById('rtdb-dot');
    const txt = document.getElementById('rtdb-text');
    if (dot && txt) {
      dot.className = isFirebaseConnected ? "w-2 h-2 rounded-full bg-emerald-400" : "w-2 h-2 rounded-full bg-amber-400";
      txt.textContent = isFirebaseConnected ? "RTDB Online" : "Local Sync";
    }
  });
} catch (err) {
  console.warn("Firebase init fallback:", err);
}
// ล้างค่า undefined ออกจาก Object ก่อนส่งขึ้น Firebase เพื่อป้องกัน Error เงียบ
function cleanForFirebase(obj) {
  return JSON.parse(JSON.stringify(obj));
}
async function dbGet(path) {
  try {
    if (db) {
      const snap = await get(ref(db, path));
      if (snap.exists()) return snap.val();
    }
  } catch (_) {}
  const raw = localStorage.getItem("aethel_rp2_" + path);
  return raw ? JSON.parse(raw) : null;
}
async function dbSet(path, data) {
  const safeData = cleanForFirebase(data);
  localStorage.setItem("aethel_rp2_" + path, JSON.stringify(safeData));
  try {
    if (db) await set(ref(db, path), safeData);
  } catch (_) {}
}
function sanitizeKey(str) {
  return String(str || "hero").trim().toLowerCase().replace(/[.#$/[\]\s]/g, "_");
}
// สร้าง Client Session ID เฉพาะต่อหน้าจอ เพื่อให้เปิดหลายแท็บหรือใช้ชื่อซ้ำในห้องเดียวกันก็ยังมองเห็นกันครบทุกคน!
const SESSION_SUFFIX = Math.random().toString(36).substring(2, 7);
let myClientId = "hero_" + SESSION_SUFFIX;
// ============================================================================
// 2. SOUND ENGINE & SCENE / NATURAL SHADING & RESHADE POST-PROCESSING SETUP
// ============================================================================
const sound = new SoundEngine();
document.getElementById('btn-audio-toggle').onclick = () => {
  sound.enabled = !sound.enabled;
  document.getElementById('audio-icon').textContent = sound.enabled ? '🔊' : '🔇';
  document.getElementById('audio-label').textContent = sound.enabled ? 'เสียง' : 'ปิดเสียง';
  if (sound.enabled) sound.sfxClick();
};
const container = document.getElementById('canvas-container');
const labelsLayer = document.getElementById('world-labels-layer');
const dmgLayer = document.getElementById('dmg-layer');
const sculptTooltip = document.getElementById('sculpt-hover-tooltip');
const fpsCrosshair = document.getElementById('fps-crosshair');
const scene = new THREE.Scene();
// Fallback color prevents a black viewport if the sky dome is temporarily not rendered.
scene.background = new THREE.Color(0x78bdf0);
scene.fog = new THREE.FogExp2(0x7dd3fc, 0.0028);
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.08, 560);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);
// ติดตั้ง Post-Processing Reshade ที่ลดความฟุ้งแสบตา เน้นเงาลึก เฉดสีคมชัด และมิติ 3D
const postProc = setupReshadePostProcessing(renderer, scene, camera);
document.getElementById('btn-reshade-mode').onclick = () => {
  sound.sfxClick();
  const presetName = postProc.cyclePreset();
  document.getElementById('reshade-label').textContent = presetName;
};
// จัดแสง HemisphereLight และ DirectionalLight ให้มีคอนทราสต์แสง-เงาชัดเจน ไม่ขาวโพลนแสบตา
const hemiLight = new THREE.HemisphereLight(0xfff3e0, 0x1e293b, 0.52);
scene.add(hemiLight);
const dirLight = new THREE.DirectionalLight(0xfff7ed, 1.12);
dirLight.position.set(36, 62, 34);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(2048, 2048);
dirLight.shadow.camera.near = 1;
dirLight.shadow.camera.far = 220;
dirLight.shadow.bias = -0.0004;
dirLight.shadow.normalBias = 0.022;
const shadowBound = 65;
dirLight.shadow.camera.left = -shadowBound;
dirLight.shadow.camera.right = shadowBound;
dirLight.shadow.camera.top = shadowBound;
dirLight.shadow.camera.bottom = -shadowBound;
scene.add(dirLight);
// แสง Rim Light อ่อนๆ ด้านหลังช่วยขับขอบตัวละครและเส้นผมให้ดูมีมิติในหน้าสร้างตัวละคร
const backRimLight = new THREE.DirectionalLight(0x93c5fd, 0.35);
backRimLight.position.set(-22, 28, -26);
scene.add(backRimLight);
const creatorPedestal = new THREE.Mesh(
  new THREE.CylinderGeometry(1.35, 1.6, 0.24, 40),
  createAnimeMaterial({ color: 0x1e293b, metalness: 0.45, roughness: 0.38 })
);
creatorPedestal.position.y = -0.12;
creatorPedestal.receiveShadow = true;
scene.add(creatorPedestal);
const worldGroup = new THREE.Group();
worldGroup.visible = false;
scene.add(worldGroup);
const skyMat = createSkyDomeShader();
const skyDome = new THREE.Mesh(new THREE.SphereGeometry(460, 48, 32), skyMat);
skyDome.name = 'SkyDome';
skyDome.frustumCulled = false;
skyDome.renderOrder = -1000;
scene.add(skyDome);
const WATER_LEVEL = -1.7;
const waterMat = createWaterShaderMaterial();
const waterMesh = new THREE.Mesh(new THREE.PlaneGeometry(650, 650, 96, 96), waterMat);
waterMesh.rotation.x = -Math.PI / 2;
waterMesh.position.y = WATER_LEVEL;
worldGroup.add(waterMesh);
// ============================================================================
// 3. ระบบสภาพอากาศอัตโนมัติตามธรรมชาติ & เวลา 1 วันในเกม = 25 นาทีจริง
// ============================================================================
let currentWeather = 'clear';
let naturalWeatherTimer = 0;
const WEATHER_COUNT = 1200;
const weatherGeo = new THREE.BufferGeometry();
const weatherPositions = new Float32Array(WEATHER_COUNT * 3);
for (let i = 0; i < WEATHER_COUNT; i++) {
  weatherPositions[i * 3] = (Math.random() - 0.5) * 95;
  weatherPositions[i * 3 + 1] = Math.random() * 38;
  weatherPositions[i * 3 + 2] = (Math.random() - 0.5) * 95;
}
weatherGeo.setAttribute('position', new THREE.BufferAttribute(weatherPositions, 3));
const weatherMat = new THREE.PointsMaterial({ color: 0xbae6fd, size: 0.28, transparent: true, opacity: 0.82 });
const weatherParticles = new THREE.Points(weatherGeo, weatherMat);
weatherParticles.visible = false;
worldGroup.add(weatherParticles);
function applyNaturalWeather(type) {
  if (currentWeather === type) return;
  currentWeather = type;
  const iconEl = document.getElementById('weather-icon');
  const txtEl = document.getElementById('weather-text');
  if (type === 'clear') {
    weatherParticles.visible = false;
    iconEl.textContent = '🌤️';
    txtEl.textContent = 'อากาศ: แจ่มใส';
  } else if (type === 'rain') {
    weatherParticles.visible = true;
    weatherMat.color.setHex(0x60a5fa);
    weatherMat.size = 0.22;
    iconEl.textContent = '🌧️';
    txtEl.textContent = 'อากาศ: ฝนโปรยปราย';
  } else if (type === 'snow') {
    weatherParticles.visible = true;
    weatherMat.color.setHex(0xffffff);
    weatherMat.size = 0.36;
    iconEl.textContent = '❄️';
    txtEl.textContent = 'อากาศ: หิมะโปรย';
  } else if (type === 'sakura') {
    weatherParticles.visible = true;
    weatherMat.color.setHex(0xf472b6);
    weatherMat.size = 0.38;
    iconEl.textContent = '🌸';
    txtEl.textContent = 'อากาศ: ลมซากุระ';
  }
}
const REAL_SECONDS_PER_INGAME_DAY = 25 * 60;
const streetLampMaterials = [];
const SOLAR_PALETTES = {
  night:   { sun: new THREE.Color(0x64748b), skyHemi: new THREE.Color(0x1e293b), groundHemi: new THREE.Color(0x090d16), fog: new THREE.Color(0x0b1329) },
  dawn:    { sun: new THREE.Color(0xfb923c), skyHemi: new THREE.Color(0xfdba74), groundHemi: new THREE.Color(0x332218), fog: new THREE.Color(0xd97757) },
  morning: { sun: new THREE.Color(0xfff1d6), skyHemi: new THREE.Color(0xbae6fd), groundHemi: new THREE.Color(0x334155), fog: new THREE.Color(0x7dd3fc) },
  noon:    { sun: new THREE.Color(0xfffbeb), skyHemi: new THREE.Color(0xe0f2fe), groundHemi: new THREE.Color(0x475569), fog: new THREE.Color(0x93c5fd) },
  sunset:  { sun: new THREE.Color(0xf97316), skyHemi: new THREE.Color(0xfb7185), groundHemi: new THREE.Color(0x3b1d2e), fog: new THREE.Color(0xea580c) },
  dusk:    { sun: new THREE.Color(0x6366f1), skyHemi: new THREE.Color(0x312e81), groundHemi: new THREE.Color(0x111827), fog: new THREE.Color(0x1e1b4b) }
};
const _curSunCol = new THREE.Color();
const _curSkyHemiCol = new THREE.Color();
const _curGndHemiCol = new THREE.Color();
const _curFogCol = new THREE.Color();

function sampleSolarKeyframes(gameHours) {
  const keyframes = [
    { h: 0.0,  p: SOLAR_PALETTES.night },
    { h: 4.8,  p: SOLAR_PALETTES.night },
    { h: 6.2,  p: SOLAR_PALETTES.dawn },
    { h: 7.8,  p: SOLAR_PALETTES.morning },
    { h: 12.0, p: SOLAR_PALETTES.noon },
    { h: 16.2, p: SOLAR_PALETTES.morning },
    { h: 17.8, p: SOLAR_PALETTES.sunset },
    { h: 19.2, p: SOLAR_PALETTES.dusk },
    { h: 20.5, p: SOLAR_PALETTES.night },
    { h: 24.0, p: SOLAR_PALETTES.night }
  ];

  let k0 = keyframes[0], k1 = keyframes[1];
  for (let i = 0; i < keyframes.length - 1; i++) {
    if (gameHours >= keyframes[i].h && gameHours <= keyframes[i + 1].h) {
      k0 = keyframes[i];
      k1 = keyframes[i + 1];
      break;
    }
  }
  const span = Math.max(0.001, k1.h - k0.h);
  const rawT = THREE.MathUtils.clamp((gameHours - k0.h) / span, 0, 1);
  const t = rawT * rawT * (3 - 2 * rawT);

  _curSunCol.lerpColors(k0.p.sun, k1.p.sun, t);
  _curSkyHemiCol.lerpColors(k0.p.skyHemi, k1.p.skyHemi, t);
  _curGndHemiCol.lerpColors(k0.p.groundHemi, k1.p.groundHemi, t);
  _curFogCol.lerpColors(k0.p.fog, k1.p.fog, t);
}

function updateDayNightAndNaturalWeather(elapsedTime, dt, playerPos) {
  const worldSec = (Date.now() / 1000) % REAL_SECONDS_PER_INGAME_DAY;
  const gameHours = ((worldSec / REAL_SECONDS_PER_INGAME_DAY) * 24 + 8) % 24;
  const hh = Math.floor(gameHours);
  const mm = Math.floor((gameHours - hh) * 60);
  const timeTextEl = document.getElementById('time-text');
  if (timeTextEl) {
    timeTextEl.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} น.`;
  }

  const sunAngle = ((gameHours - 6) / 24) * Math.PI * 2;
  const sunElevation = Math.sin(sunAngle); // -1 ถึง +1
  const sunHorizontal = Math.cos(sunAngle);

  const dayFactor = THREE.MathUtils.smoothstep(sunElevation, -0.28, 0.38);
  const twilightBell = Math.exp(-Math.pow(sunElevation / 0.24, 2.0));
  const sunsetFactor = THREE.MathUtils.clamp(twilightBell * 0.92, 0.0, 1.0);
  const nightBlend = 1.0 - THREE.MathUtils.smoothstep(sunElevation, -0.15, 0.22);

  const timeIconEl = document.getElementById('time-icon');
  if (timeIconEl) {
    timeIconEl.textContent = dayFactor > 0.65 ? '☀️' : sunsetFactor > 0.40 ? '🌅' : '🌙';
  }

  if (skyMat && skyMat.uniforms) {
    if (skyMat.uniforms.uDayFactor) skyMat.uniforms.uDayFactor.value = dayFactor;
    if (skyMat.uniforms.uSunsetFactor) skyMat.uniforms.uSunsetFactor.value = sunsetFactor;
    if (skyMat.uniforms.uTime) skyMat.uniforms.uTime.value = elapsedTime;
  }
  if (skyDome) skyDome.position.copy(camera.position);

  if (waterMat && waterMat.uniforms) {
    waterMat.uniforms.uTime.value = elapsedTime;
    waterMat.uniforms.uPlayerPos.value.copy(playerPos);
    waterMat.uniforms.uDayFactor.value = dayFactor;
  }

  sampleSolarKeyframes(gameHours);
  if (dirLight) dirLight.color.copy(_curSunCol);
  if (hemiLight) {
    hemiLight.color.copy(_curSkyHemiCol);
    hemiLight.groundColor.copy(_curGndHemiCol);
  }
  if (scene && scene.fog) {
    scene.fog.color.copy(_curFogCol);
  }

  // คำนวณตำแหน่งดวงอาทิตย์/ดวงจันทร์รอบตัวผู้เล่นไม่ให้มุดหายใต้ดิน
  const orbitRadius = 95;
  const sunX = sunHorizontal * orbitRadius;
  const sunY = Math.max(18, sunElevation * orbitRadius + 15);
  const sunZ = 35;
  if (dirLight) {
    dirLight.position.set(playerPos.x + sunX, playerPos.y + sunY, playerPos.z + sunZ);
    dirLight.target.position.copy(playerPos);
    dirLight.target.updateMatrixWorld();
    dirLight.intensity = THREE.MathUtils.lerp(0.35, 1.18, dayFactor);
  }

  let isPlayerIndoors = false;
  for (let i = 0; i < enterableBuildings.length; i++) {
    const eb = enterableBuildings[i];
    if (Math.abs(playerPos.x - eb.wx) < eb.width * 0.52 && Math.abs(playerPos.z - eb.wz) < eb.depth * 0.52) {
      isPlayerIndoors = true;
      break;
    }
  }
  if (hemiLight) {
    hemiLight.intensity = isPlayerIndoors ? 1.15 : THREE.MathUtils.lerp(0.48, 0.70, dayFactor);
  }

  const lampGlow = THREE.MathUtils.lerp(0.18, 3.2, nightBlend);
  streetLampMaterials.forEach(mat => { mat.emissiveIntensity = lampGlow; });
  buildingWindowMaterials.forEach(mat => { mat.emissiveIntensity = THREE.MathUtils.lerp(0.12, 2.6, nightBlend); });
  streetLampGlowDiscs.forEach(disc => {
    disc.visible = nightBlend > 0.08;
    if (disc.visible && disc.material) {
      disc.material.opacity = nightBlend * (0.30 + Math.sin(elapsedTime * 3.5) * 0.04);
    }
  });

  cityNightLights.forEach(item => {
    const dist = Math.hypot(playerPos.x - item.wx, playerPos.z - item.wz);
    if (dist < 110) {
      item.light.visible = true;
      item.light.intensity = item.isIndoorLight
        ? item.maxIntensity
        : THREE.MathUtils.lerp(item.maxIntensity * 0.12, item.maxIntensity, nightBlend);
    } else {
      item.light.visible = false;
    }
  });

  naturalWeatherTimer -= dt;
  if (naturalWeatherTimer <= 0) {
    naturalWeatherTimer = 8.0;
    if (playerPos.x < -45 && playerPos.z > 55) {
      applyNaturalWeather('snow');
    } else if (playerPos.x < -55 && playerPos.z < -55) {
      applyNaturalWeather('sakura');
    } else {
      const cycleSlot = Math.floor((Date.now() / 1000) / 140) % 5;
      if (cycleSlot === 2) applyNaturalWeather('rain');
      else if (cycleSlot === 4) applyNaturalWeather('sakura');
      else applyNaturalWeather('clear');
    }
  }
}
// ============================================================================
// 4. CHUNKS, OUTPOST VILLAGES (FENCES + VOLUMETRIC CAMPFIRE + VILLAGERS),
//    WILDLIFE ANIMALS, MONSTERS & FARMING NODES
// ============================================================================
const worldNoise = new SeededWorldNoise("AETHELGARD-RP-01");
const chunkMap = new Map();
const CHUNK_SIZE = 38;
const terrainMeshes = [];
const worldColliders = [];
const monsters = [];
const wildlifeList = []; // เก็บสัตว์ป่า (กระต่าย, กวาง, นกบินบนฟ้า) ที่เคลื่อนไหวตลอดเวลา
const farmingNodes = []; // เก็บจุดฟาร์มแร่ สมุนไพร ไม้ และข้าวสาลี
const npcs = [];         // NPC ประจำร้าน/กิลด์
const wanderingNPCs = []; // NPC ชาวเมือง ทหารยาม และชาวบ้านในหมู่บ้านชนบทที่เดินไปมา
const floatingLabels = [];
function registerFloatingLabel(targetObj3D, htmlContent, yOffset = 2.4) {
  const el = document.createElement('div');
  el.className = 'world-nametag';
  el.innerHTML = htmlContent;
  labelsLayer.appendChild(el);
  const item = { targetObj3D, el, yOffset };
  floatingLabels.push(item);
  return item;
}
function createTerrainDetailTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4200; i++) {
    const shade = 195 + Math.floor(Math.random() * 50);
    ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 3);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 8);
  return tex;
}
const terrainTex = createTerrainDetailTexture();
// เสริมหมอกเปลวไฟสีส้มและลูกไฟลอยขึ้น (Volumetric Orange Mist & Rising Sparks) ให้กองไฟทุกจุดดูเหมือนภาพอ้างอิง
function enhanceCampfireWithMistCone(campfireGroup) {
  const mistTex = getVolumetricMistTexture();
  const extraPuffs = [];
  const targetEntry = animatedCampfires.find(c => c.group === campfireGroup);
  for (let i = 0; i < 18; i++) {
    const mat = new THREE.SpriteMaterial({
      map: mistTex,
      color: new THREE.Color(i < 6 ? 0xfef08a : 0xf97316),
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const sp = new THREE.Sprite(mat);
    const phase = (i / 18);
    const ang = (i * 2.39996);
    const rad = 0.14 + (1 - phase) * 0.22;
    sp.position.set(Math.cos(ang) * rad, 0.18 + phase * 1.75, Math.sin(ang) * rad);
    const sc = 0.85 * (1 - phase * 0.45);
    sp.scale.set(sc, sc * 1.45, sc);
    campfireGroup.add(sp);
    if (targetEntry) {
      targetEntry.mistPuffs.push({
        sprite: sp,
        phase,
        speed: 0.78 + (i % 5) * 0.12,
        swirlAngle: ang,
        swirlRadius: 0.10 + (1 - phase) * 0.18,
        baseScale: 0.88 + (i % 3) * 0.16
      });
    }
  }
  return campfireGroup;
}
// เสกสัตว์ป่าเคลื่อนไหว (กระต่ายกระโดด, กวางเดินเล็มหญ้า, นกบินบนฟ้า)
function spawnWildlifeAt(wx, wz, forcedType = null) {
  const wy = worldNoise.getHeight(wx, wz);
  if (wy < WATER_LEVEL + 0.35) return;
  const types = ['rabbit', 'deer', 'bird'];
  const type = forcedType || types[Math.floor(Math.abs(wx * 7 + wz * 11)) % types.length];
  const mesh = createWildlifeMesh(type);
  const baseY = type === 'bird' ? wy + 8.5 + (Math.abs(wx) % 4) : wy;
  const radius = type === 'bird' ? 9.5 : type === 'deer' ? 4.8 : 2.8;
  const speed = type === 'bird' ? 1.15 : type === 'deer' ? 0.55 : 1.35;
  const startAngle = (Math.abs(wx + wz) % 6.28);
  mesh.position.set(wx + Math.cos(startAngle) * radius, baseY, wz + Math.sin(startAngle) * radius);
  worldGroup.add(mesh);
  wildlifeList.push({
    type,
    mesh,
    centerX: wx,
    centerZ: wz,
    baseY,
    radius,
    speed,
    angle: startAngle
  });
}
function spawnMonsterAt(wx, wz, lvOverride = null) {
  const wy = worldNoise.getHeight(wx, wz);
  if (wy < WATER_LEVEL + 0.25) return;
  const distFromCenter = Math.hypot(wx, wz);
  const lv = lvOverride || Math.max(1, Math.min(30, Math.floor(distFromCenter / 28) + 1));
  let spec;
  if (wx < -55 && wz < -55) {
    spec = { name: 'หมาป่าเขี้ยวทมิฬ', type: 'wolf', hp: 125 + lv * 36, atk: 16 + lv * 4, exp: 50 + lv * 18, gold: 40 + lv * 12 };
  } else if (wx > 55 && wz < -45) {
    spec = { name: 'โกเลมเพลิงอัคนี', type: 'golem', hp: 190 + lv * 52, atk: 22 + lv * 6, exp: 85 + lv * 25, gold: 70 + lv * 18 };
  } else if (wx < -45 && wz > 55) {
    spec = { name: 'โกเลมน้ำแข็งเหมันต์', type: 'golem', hp: 175 + lv * 46, atk: 19 + lv * 5, exp: 78 + lv * 22, gold: 62 + lv * 16 };
  } else {
    const roll = Math.floor(Math.abs(wx + wz)) % 3;
    if (roll === 0) {
      spec = { name: 'สไลม์วารีคริสตัล', type: 'slime', hp: 90 + lv * 26, atk: 11 + lv * 3, exp: 38 + lv * 14, gold: 30 + lv * 10 };
    } else if (roll === 1) {
      spec = { name: 'ก็อบลินลาดตระเวน', type: 'goblin', hp: 130 + lv * 32, atk: 15 + lv * 4, exp: 52 + lv * 16, gold: 42 + lv * 12 };
    } else {
      spec = { name: 'หมาป่าทุ่งหญ้า', type: 'wolf', hp: 115 + lv * 30, atk: 14 + lv * 4, exp: 48 + lv * 15, gold: 36 + lv * 11 };
    }
  }
  const mesh = createMonsterMesh(spec.type);
  mesh.position.set(wx, wy, wz);
  const monId = `mon_${Math.round(wx)}_${Math.round(wz)}`;
  const monObj = {
    id: monId,
    name: spec.name,
    type: spec.type,
    lv,
    maxHp: spec.hp,
    hp: spec.hp,
    atk: spec.atk,
    exp: spec.exp,
    gold: spec.gold,
    spawnX: wx,
    spawnZ: wz,
    patrolAngle: Math.random() * Math.PI * 2,
    patrolRadius: 2.4 + (Math.abs(wx) % 2.5),
    patrolPause: 0,
    mesh,
    vx: 0, vy: 0, vz: 0,
    atkCooldown: 0,
    animOffset: Math.random() * 10
  };
  // สำคัญมาก: ห้ามเขียนทับ mesh.userData เพราะต้องรักษา mesh.userData.animParts ไว้สำหรับอนิเมชั่นมอนสเตอร์!
  mesh.userData.isMonster = true;
  mesh.userData.monsterRef = monObj;

  const readyAt = playerStats.cooldowns?.monsters?.[monId] || 0;
  if (Date.now() < readyAt) {
    monObj.hp = 0;
    mesh.visible = false;
    setTimeout(() => {
      monObj.hp = monObj.maxHp;
      mesh.position.set(monObj.spawnX, worldNoise.getHeight(monObj.spawnX, monObj.spawnZ), monObj.spawnZ);
      mesh.visible = true;
    }, readyAt - Date.now());
  }

  worldGroup.add(mesh);
  monsters.push(monObj);
}
function spawnFarmingNodeAt(wx, wz, forcedType = null) {
  const wy = worldNoise.getHeight(wx, wz);
  if (wy < WATER_LEVEL + 0.25) return;
  const types = ['mithril_ore', 'moon_herb', 'ancient_wood', 'golden_wheat'];
  const matId = forcedType || types[Math.floor(Math.abs(wx * 13 + wz * 7)) % types.length];
  const matInfo = FARM_MATERIALS[matId];
  const mesh = createFarmingNodeMesh(matId);
  mesh.position.set(wx, wy, wz);
  const labelItem = registerFloatingLabel(
    mesh,
    `<div class="px-2 py-0.5 rounded-full bg-slate-950/85 border border-emerald-400/50 text-[10px] text-emerald-300 font-semibold">${matInfo.icon} ${matInfo.name} [E]</div>`,
    1.65
  );
  const nodeId = `node_${Math.round(wx)}_${Math.round(wz)}`;
  const nodeObj = {
    id: nodeId,
    matId,
    name: matInfo.name,
    icon: matInfo.icon,
    x: wx,
    y: wy,
    z: wz,
    mesh,
    labelItem,
    active: true
  };
  mesh.userData.isFarmNode = true;
  mesh.userData.nodeRef = nodeObj;

  const nodeReadyAt = playerStats.cooldowns?.nodes?.[nodeId] || 0;
  if (Date.now() < nodeReadyAt) {
    nodeObj.active = false;
    mesh.visible = false;
    setTimeout(() => {
      nodeObj.active = true;
      mesh.visible = true;
    }, nodeReadyAt - Date.now());
  }

  worldGroup.add(mesh);
  farmingNodes.push(nodeObj);
}
// สร้างรั้วไม้ล้อมรอบหมู่บ้าน (Wooden Perimeter Fence with Gate Opening)
function buildVillageWoodenFence(vGroup, wx, wz, wy, radiusX = 11.5, radiusZ = 10.5) {
  const woodFenceMat = createAnimeMaterial({ color: 0x78350f, roughness: 0.78 });
  const darkWoodMat = createAnimeMaterial({ color: 0x451a03, roughness: 0.82 });
  const createFenceSegment = (x1, z1, x2, z2) => {
    const segGroup = new THREE.Group();
    const dx = x2 - x1;
    const dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    const angle = Math.atan2(dx, dz);
    const steps = Math.max(2, Math.floor(len / 2.2));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const px = x1 + dx * t;
      const pz = z1 + dz * t;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 1.45, 8), darkWoodMat);
      post.position.set(px, 0.72, pz);
      post.castShadow = true;
      post.receiveShadow = true;
      segGroup.add(post);
    }
    [0.45, 1.02].forEach((railY) => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, len), woodFenceMat);
      rail.position.set((x1 + x2) / 2, railY, (z1 + z2) / 2);
      rail.rotation.y = angle;
      rail.castShadow = true;
      rail.receiveShadow = true;
      segGroup.add(rail);
    });
    vGroup.add(segGroup);
    const w = Math.abs(dx) > Math.abs(dz) ? len : 0.45;
    const d = Math.abs(dz) >= Math.abs(dx) ? len : 0.45;
    registerBoxCollider(worldColliders, wx + (x1 + x2) / 2, wz + (z1 + z2) / 2, w, d, wy + 1.5, false);
  };
  // รั้วด้านหลัง ด้านซ้าย ด้านขวา และด้านหน้า (เว้นช่องประตูทางเข้าตรงกลางด้านหน้า)
  createFenceSegment(-radiusX, -radiusZ, radiusX, -radiusZ);
  createFenceSegment(-radiusX, -radiusZ, -radiusX, radiusZ);
  createFenceSegment(radiusX, -radiusZ, radiusX, radiusZ);
  createFenceSegment(-radiusX, radiusZ, -2.6, radiusZ);
  createFenceSegment(2.6, radiusZ, radiusX, radiusZ);
  // ซุ้มประตูไม้ทางเข้าหมู่บ้านพร้อมคบเพลิงหมอกไฟ
  [-2.6, 2.6].forEach((gx) => {
    const gatePillar = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 3.2, 10), darkWoodMat);
    gatePillar.position.set(gx, 1.6, radiusZ);
    gatePillar.castShadow = true;
    vGroup.add(gatePillar);
  });
  const archBeam = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.28, 0.32), woodFenceMat);
  archBeam.position.set(0, 3.1, radiusZ);
  archBeam.castShadow = true;
  vGroup.add(archBeam);
}
// สร้างหมู่บ้านนักเดินทางพร้อมกองไฟหมอกเปลวไฟสมจริง + รั้วไม้ล้อมรอบ + ชาวบ้านเดินไปมา + สัตว์เลี้ยง!
function buildProceduralOutpostVillage(cx, cz, chunkGroup) {
  const wx = cx * CHUNK_SIZE;
  const wz = cz * CHUNK_SIZE;
  const wy = worldNoise.getHeight(wx, wz);
  if (wy < WATER_LEVEL + 1.0) return;
  const vGroup = new THREE.Group();
  vGroup.position.set(0, wy, 0);
  // 1. กองไฟหมอกสีส้มก่อตัวเป็นเปลวไฟจริงใจกลางหมู่บ้าน (แทนกรวยไฟแบบเก่า!)
  const villageCampfire = enhanceCampfireWithMistCone(createVolumetricCampfire(1.08, true));
  villageCampfire.position.set(0, 0, 0.5);
  vGroup.add(villageCampfire);
  worldColliders.push({ x: wx, z: wz + 0.5, radius: 1.05, topY: wy + 1.2, stepable: false });
  // 2. บ้านไม้ในหมู่บ้าน 3 หลัง พร้อมหน้าต่างเรืองแสงและ Box Collider
  const hutConfigs = [
    { hx: -6.4, hz: -5.2, roofCol: 0x047857, wallCol: 0xfef3c7, rotY: 0.15 },
    { hx: 6.4,  hz: -5.2, roofCol: 0xb45309, wallCol: 0xffedd5, rotY: -0.15 },
    { hx: -6.8, hz: 3.6,  roofCol: 0x991b1b, wallCol: 0xf1f5f9, rotY: Math.PI / 2 }
  ];
  hutConfigs.forEach((hc) => {
    const hut = new THREE.Group();
    hut.position.set(hc.hx, 0, hc.hz);
    hut.rotation.y = hc.rotY;
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(4.8, 3.4, 4.4),
      createAnimeMaterial({ color: hc.wallCol, roughness: 0.72 })
    );
    wall.position.y = 1.7;
    wall.castShadow = true;
    wall.receiveShadow = true;
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(4.1, 2.6, 4),
      createAnimeMaterial({ color: hc.roofCol, roughness: 0.55 })
    );
    roof.position.y = 4.65;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 2.0, 0.12),
      createAnimeMaterial({ color: 0x451a03, roughness: 0.8 })
    );
    door.position.set(0, 1.0, 2.22);
    hut.add(wall, roof, door);
    vGroup.add(hut);
    registerBoxCollider(worldColliders, wx + hc.hx, wz + hc.hz, 5.1, 4.7, wy + 3.6, false);
  });
  // 3. รั้วไม้ล้อมรอบหมู่บ้านครบทุกด้านพร้อมซุ้มประตูทางเข้า
  buildVillageWoodenFence(vGroup, wx, wz, wy, 11.8, 10.6);
  // 4. เสกชาวบ้าน (Villagers) 3 คนเดินพูดคุยรอบกองไฟในหมู่บ้านอย่างมีชีวิตชีวา
  const villagerSpecs = [
    { title: '🌾 ชาวบ้านผู้ดูแลไร่', gender: 'female', primary: '#10b981', hair: 'twintails', radius: 3.4, speed: 1.4, startAng: 0.4 },
    { title: '🪵 ช่างไม้ประจำหมู่บ้าน', gender: 'male', primary: '#d97706', hair: 'spiky', radius: 4.2, speed: 1.6, startAng: 2.5 },
    { title: '🧺 หญิงสาวทอผ้า', gender: 'female', primary: '#ec4899', hair: 'long_flowing', radius: 3.0, speed: 1.25, startAng: 4.6 }
  ];
  const villageChatter = [
    "ผิงไฟอุ่นๆ ที่กองไฟกลางหมู่บ้านก่อนสิท่านนักเดินทาง!",
    "รวงข้าวสาลีในรั้วหมู่บ้านของเราเก็บเกี่ยวได้ตลอดเลยนะ!",
    "ได้รั้วไม้แข็งแรงล้อมรอบหมู่บ้าน ค่อยอุ่นใจเรื่องมอนสเตอร์หน่อย!",
    "คืนนี้ไฟในกองไฟสว่างอบอุ่นดีจังเลย"
  ];
  villagerSpecs.forEach((vs, idx) => {
    const isF = vs.gender === 'female';
    const vChar = new ArticulatedCharacter3D({
      gender: vs.gender,
      bodyType: isF ? 'female_grace' : 'male_hero',
      skinColor: '#ffe9dc',
      jawTaper: isF ? 0.65 : 0.80,
      bangsStyle: isF ? 'hime_frame' : 'parted',
      hairStyle: vs.hair,
      hairColor: ['#1c1917', '#78350f', '#92400e'][idx % 3],
      eyeColor: '#f59e0b',
      expression: 'smile',
      fullOutfit: idx === 0 ? 'sailor_school' : 'none',
      topStyle: isF ? 'sailor_blouse' : 'hunter_jacket',
      bottomStyle: isF ? 'battle_skirt' : 'pants',
      primaryColor: vs.primary,
      secondaryColor: '#1e293b',
      hasCape: false,
      heightScale: isF ? 0.96 : 1.02,
      weaponId: isF ? 'tome_holy' : 'sword_iron'
    });
    const initX = wx + Math.cos(vs.startAng) * vs.radius;
    const initZ = wz + Math.sin(vs.startAng) * vs.radius;
    vChar.root.position.set(initX, wy, initZ);
    vChar.root.userData = { isNPC: true, npcName: vs.title, role: 'citizen' };
    worldGroup.add(vChar.root);
    const labelItem = registerFloatingLabel(
      vChar.root,
      `<div class="px-2 py-0.5 rounded-full bg-slate-900/85 border border-amber-400/50 text-[9px] text-amber-200">${vs.title}</div>`,
      2.3
    );
    wanderingNPCs.push({
      char3D: vChar,
      townCenter: { x: wx, z: wz + 0.5 },
      baseY: wy,
      orbitRadius: vs.radius,
      angle: vs.startAng,
      speed: vs.speed,
      pauseTimer: 0,
      chatTimer: 3 + idx * 2.5,
      title: vs.title,
      labelItem,
      chatterPool: villageChatter
    });
  });
  // 5. สัตว์เลี้ยงและสัตว์ป่ารอบหมู่บ้าน + แปลงข้าวสาลีทองคำ
  spawnWildlifeAt(wx + 4.5, wz + 3.2, 'rabbit');
  spawnWildlifeAt(wx - 14.0, wz + 6.0, 'deer');
  spawnFarmingNodeAt(wx + 5.8, wz + 4.2, 'golden_wheat');
  const signAnchor = new THREE.Object3D();
  signAnchor.position.set(wx, wy + 3.6, wz + 10.6);
  worldGroup.add(signAnchor);
  registerFloatingLabel(
    signAnchor,
    `<span class="px-2.5 py-0.5 rounded-full bg-emerald-950/90 border border-emerald-400/60 text-emerald-200 text-[10px] font-bold shadow">🏕️ หมู่บ้านชนบทเอเธล (${cx},${cz})</span>`,
    0
  );
  chunkGroup.add(vGroup);
}
function generateChunk(cx, cz) {
  const key = `${cx},${cz}`;
  if (chunkMap.has(key)) return;
  const chunkGroup = new THREE.Group();
  chunkGroup.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
  const segs = 22;
  const geo = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, segs, segs);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;

  // ตรวจสอบว่า Chunk นี้เคยถูกสร้างและบันทึกไว้ในแคชหรือยัง
  const cachedBlueprint = worldCache.getChunkBlueprint(cx, cz);
  if (cachedBlueprint && cachedBlueprint.heights && cachedBlueprint.colors) {
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, cachedBlueprint.heights[i]);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cachedBlueprint.colors, 3));
  } else {
    const heights = new Float32Array(pos.count);
    const colors = new Float32Array(pos.count * 3);
    const cObj = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i);
      const lz = pos.getZ(i);
      const wx = lx + cx * CHUNK_SIZE;
      const wz = lz + cz * CHUNK_SIZE;
      const h = worldNoise.getHeight(wx, wz);
      pos.setY(i, h);
      heights[i] = h;

      let inTown = null;
      for (const t of TOWNS) {
        if (Math.hypot(wx - t.x, wz - t.z) < t.radius) { inTown = t; break; }
      }
      if (inTown) {
        cObj.setHex(inTown.groundColor);
      } else if (h < WATER_LEVEL + 0.45) {
        cObj.setHex(0xeab308);
      } else if (wx < -55 && wz < -55) {
        cObj.setHex(0x15803d);
      } else if (wx > 55 && wz < -45) {
        cObj.setHex(0xc2410c);
      } else if (wx < -45 && wz > 55) {
        cObj.setHex(0xcbd5e1);
      } else {
        cObj.setHex(h > 3.8 ? 0x64748b : 0x22c55e);
      }
      const shadeFactor = THREE.MathUtils.clamp(0.76 + (h + 2.0) * 0.032, 0.62, 1.06);
      cObj.multiplyScalar(shadeFactor);
      colors[i * 3] = cObj.r;
      colors[i * 3 + 1] = cObj.g;
      colors[i * 3 + 2] = cObj.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    // บันทึกโครงสร้าง Chunk ลงฐานข้อมูลแคชถาวรทันที
    worldCache.saveChunkBlueprint(cx, cz, { heights, colors });
  }
  geo.computeVertexNormals();
  const terrainMesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, map: terrainTex, roughness: 0.88, metalness: 0.04 })
  );
  terrainMesh.receiveShadow = true;
  chunkGroup.add(terrainMesh);
  terrainMeshes.push(terrainMesh);
  const centerWx = cx * CHUNK_SIZE;
  const centerWz = cz * CHUNK_SIZE;
  let nearMajorTown = false;
  for (const t of TOWNS) {
    if (Math.hypot(centerWx - t.x, centerWz - t.z) < t.radius + 16) {
      nearMajorTown = true;
      break;
    }
  }
  if (!nearMajorTown) {
    // เพิ่มโอกาสพบหมู่บ้านชนบทที่มีรั้ว ชาวบ้าน และกองไฟหมอกส้มให้พบได้ง่ายขึ้น
    const villageRoll = worldNoise.hash2D(cx * 73, cz * 97);
    if (villageRoll > 0.72 || (Math.abs(cx) === 2 && cz === 0)) {
      buildProceduralOutpostVillage(cx, cz, chunkGroup);
    }
    for (let idx = 0; idx < 4; idx++) {
      const rx = worldNoise.hash2D(cx * 31 + idx, cz * 17 + idx);
      const rz = worldNoise.hash2D(cx * 19 + idx, cz * 43 + idx);
      const lx = (rx - 0.5) * (CHUNK_SIZE - 6);
      const lz = (rz - 0.5) * (CHUNK_SIZE - 6);
      const wx = centerWx + lx;
      const wz = centerWz + lz;
      const wy = worldNoise.getHeight(wx, wz);
      if (wy < WATER_LEVEL + 0.3) continue;
      if (rx > 0.35) {
        const tree = new THREE.Group();
        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.28, 0.40, 2.2, 10),
          createAnimeMaterial({ color: 0x78350f, roughness: 0.8 })
        );
        trunk.position.y = 1.1;
        const leafColor = (wx < -45 && wz > 55) ? 0x93c5fd : (wx > 55 && wz < -45) ? 0xea580c : 0x15803d;
        const crown1 = new THREE.Mesh(
          new THREE.ConeGeometry(1.6, 2.6, 12),
          createAnimeMaterial({ color: leafColor, roughness: 0.65 })
        );
        crown1.position.y = 2.6;
        const crown2 = new THREE.Mesh(
          new THREE.ConeGeometry(1.2, 2.2, 12),
          createAnimeMaterial({ color: leafColor, roughness: 0.65 })
        );
        crown2.position.y = 3.7;
        trunk.castShadow = true; crown1.castShadow = true; crown2.castShadow = true;
        crown1.receiveShadow = true; crown2.receiveShadow = true;
        tree.add(trunk, crown1, crown2);
        tree.position.set(lx, wy, lz);
        chunkGroup.add(tree);
        worldColliders.push({ x: wx, z: wz, radius: 0.65, topY: wy + 3.9 });
      } else {
        const rock = new THREE.Mesh(
          new THREE.DodecahedronGeometry(1.05, 0),
          createAnimeMaterial({ color: 0x64748b, roughness: 0.72 })
        );
        rock.position.set(lx, wy + 0.55, lz);
        rock.castShadow = true; rock.receiveShadow = true;
        chunkGroup.add(rock);
        worldColliders.push({ x: wx, z: wz, radius: 1.05, topY: wy + 1.45, stepable: true });
      }
    }
    // สุ่มเกิดจุดฟาร์มแร่/สมุนไพร/ไม้โบราณในแต่ละ Chunk
    const fRx = worldNoise.hash2D(cx * 61, cz * 83);
    const fRz = worldNoise.hash2D(cx * 89, cz * 37);
    spawnFarmingNodeAt(
      centerWx + (fRx - 0.5) * (CHUNK_SIZE - 10),
      centerWz + (fRz - 0.5) * (CHUNK_SIZE - 10)
    );
    // สุ่มเกิดสัตว์ป่า (กระต่าย, กวาง, นกบินบนฟ้า) ในแต่ละ Chunk ให้โลกมีชีวิตชีวา
    const wHash = worldNoise.hash2D(cx * 47, cz * 59);
    if (wHash > 0.32) {
      spawnWildlifeAt(centerWx + (wHash - 0.5) * 18, centerWz - (wHash - 0.5) * 18);
    }
    // สุ่มเกิดมอนสเตอร์ 2 ตัวต่อ Chunk
    for (let mIdx = 0; mIdx < 2; mIdx++) {
      const mHashX = worldNoise.hash2D(cx * 53 + mIdx, cz * 29 + mIdx);
      const mHashZ = worldNoise.hash2D(cx * 41 + mIdx, cz * 67 + mIdx);
      const mwx = centerWx + (mHashX - 0.5) * (CHUNK_SIZE - 8);
      const mwz = centerWz + (mHashZ - 0.5) * (CHUNK_SIZE - 8);
      spawnMonsterAt(mwx, mwz);
    }
  }
  worldGroup.add(chunkGroup);
  chunkMap.set(key, chunkGroup);
}
// สร้างโคมไฟถนนเรืองแสงพร้อมวงแสงตกกระทบพื้นและ PointLight ส่องสว่างจริงตอนกลางคืน
function createGlowingStreetLamp(wx, wy, wz, withPointLight = false, rotY = 0) {
  const lampGroup = createOrnateStreetLamp(wx, wy, wz, rotY, streetLampMaterials, streetLampGlowDiscs);
  if (withPointLight) {
    const pt = new THREE.PointLight(0xffedd5, 2.2, 26, 1.4);
    pt.position.set(0.74, 3.6, 0);
    lampGroup.add(pt);
    cityNightLights.push({ light: pt, wx, wz, maxIntensity: 2.4 });
  }
  worldGroup.add(lampGroup);
  worldColliders.push({ x: wx, z: wz, radius: 0.35, topY: wy + 4.5, stepable: false });
}
// สร้างซุ้มประตูเมืองขนาดใหญ่ (Grand City Gate) ทั้ง 4 ทิศ พร้อมหอคอยคู่และทหารยาม
function buildGrandCityGate(town, gateDir, gateDist) {
  const gx = town.x + gateDir.x * gateDist;
  const gz = town.z + gateDir.z * gateDist;
  const gy = worldNoise.getHeight(gx, gz);
  const gateGroup = new THREE.Group();
  gateGroup.position.set(gx, gy, gz);
  gateGroup.rotation.y = Math.atan2(gateDir.x, gateDir.z);
  const stoneMat = createAnimeMaterial({ color: 0xcbd5e1, roughness: 0.65 });
  const roofMat = createAnimeMaterial({ color: town.themeColor || 0x2563eb, roughness: 0.45 });
  const goldMat = createAnimeMaterial({ color: 0xfbbf24, metalness: 0.8, roughness: 0.25 });
  [-7.2, 7.2].forEach((sideX) => {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.9, 11.5, 16), stoneMat);
    tower.position.set(sideX, 5.75, 0);
    tower.castShadow = true;
    tower.receiveShadow = true;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.4, 4.2, 16), roofMat);
    roof.position.set(sideX, 13.6, 0);
    roof.castShadow = true;
    gateGroup.add(tower, roof);
    const worldTX = gx + Math.cos(gateGroup.rotation.y) * sideX;
    const worldTZ = gz - Math.sin(gateGroup.rotation.y) * sideX;
    worldColliders.push({ x: worldTX, z: worldTZ, radius: 2.8, topY: gy + 12.0, stepable: false });
  });
  // คานสะพานเชื่อมบนซุ้มประตู (เดินลอดใต้ซุ้มประตูได้อย่างอิสระ)
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(15.2, 2.8, 4.4), stoneMat);
  bridge.position.set(0, 9.8, 0);
  bridge.castShadow = true;
  const trim = new THREE.Mesh(new THREE.BoxGeometry(15.6, 0.45, 4.8), goldMat);
  trim.position.set(0, 8.3, 0);
  gateGroup.add(bridge, trim);
  worldGroup.add(gateGroup);
  const gateAnchor = new THREE.Object3D();
  gateAnchor.position.set(gx, gy + 11.8, gz);
  worldGroup.add(gateAnchor);
  registerFloatingLabel(
    gateAnchor,
    `<div class="px-3 py-0.5 rounded-full bg-slate-950/90 border border-amber-400/70 text-[10px] text-amber-200 font-bold shadow">⛩️ ${gateDir.label} (${town.name})</div>`,
    0
  );
}
// สร้างอาคารมีประตูบานพับเปิด-ปิดได้ โต๊ะเก้าอี้ 3D คลิกนั่งได้ และหน้าต่างมีกรอบสวยงาม
function buildEnterableBuilding(spec) {
  const { wx, wz, width, depth, height, wallColor, roofColor, title, subTitle, role, npcSpec, rotY = 0 } = spec;
  const wy = worldNoise.getHeight(wx, wz);
  const bGroup = new THREE.Group();
  bGroup.position.set(wx, wy, wz);
  bGroup.rotation.y = rotY;
  const wallMat = createAnimeMaterial({ color: wallColor, roughness: 0.65 });
  const woodMat = createAnimeMaterial({ color: 0x78350f, roughness: 0.72 });
  const darkWoodMat = createAnimeMaterial({ color: 0x451a03, roughness: 0.78 });
  const floorMat = createAnimeMaterial({ color: 0xe7e5e4, roughness: 0.58 });
  const winMat = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    emissive: 0xf59e0b,
    emissiveIntensity: 1.6,
    roughness: 0.2
  });
  buildingWindowMaterials.push(winMat);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(width, 0.16, depth), floorMat);
  floor.position.y = 0.08;
  floor.receiveShadow = true;
  bGroup.add(floor);
  const wallT = 0.42;
  const doorW = 2.2;
  const doorH = 2.85;
  const frontSideW = (width - doorW) / 2;
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(width, height, wallT), wallMat);
  backWall.position.set(0, height / 2, -depth / 2);
  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(wallT, height, depth), wallMat);
  leftWall.position.set(-width / 2, height / 2, 0);
  const rightWall = new THREE.Mesh(new THREE.BoxGeometry(wallT, height, depth), wallMat);
  rightWall.position.set(width / 2, height / 2, 0);
  const frontL = new THREE.Mesh(new THREE.BoxGeometry(frontSideW, height, wallT), wallMat);
  frontL.position.set(-width / 2 + frontSideW / 2, height / 2, depth / 2);
  const frontR = new THREE.Mesh(new THREE.BoxGeometry(frontSideW, height, wallT), wallMat);
  frontR.position.set(width / 2 - frontSideW / 2, height / 2, depth / 2);
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.2, height - doorH, wallT), wallMat);
  lintel.position.set(0, doorH + (height - doorH) / 2, depth / 2);
  // วงกบไม้ขอบประตู
  const frameL = new THREE.Mesh(new THREE.BoxGeometry(0.16, doorH, wallT + 0.12), darkWoodMat);
  frameL.position.set(-doorW / 2, doorH / 2, depth / 2);
  const frameR = new THREE.Mesh(new THREE.BoxGeometry(0.16, doorH, wallT + 0.12), darkWoodMat);
  frameR.position.set(doorW / 2, doorH / 2, depth / 2);
  const frameTop = new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.32, 0.18, wallT + 0.14), darkWoodMat);
  frameTop.position.set(0, doorH + 0.05, depth / 2);
  [backWall, leftWall, rightWall, frontL, frontR, lintel, frameL, frameR, frameTop].forEach(m => {
    m.castShadow = true;
    m.receiveShadow = true;
    bGroup.add(m);
  });
  // ประตูบานพับเปิด-ปิดได้จริง (ไม่เปิดโล่ง!)
  createHingedDoor(
    0, 0.12, depth / 2, doorW, doorH - 0.12,
    bGroup, wx, wy, wz, rotY,
    interactiveDoors, worldColliders,
    { title: `ประตู ${title}`, initialOpen: false, autoOpen: true }
  );
  // หน้าต่างไม้มีกรอบซ้าย-ขวาและด้านข้าง
  [-width * 0.32, width * 0.32].forEach(vx => {
    const win = createFramedWindowMesh(1.45, 1.55, winMat);
    win.position.set(vx, height * 0.54, depth / 2 + 0.20);
    bGroup.add(win);
  });
  [-depth * 0.24, depth * 0.24].forEach(vz => {
    const winL = createFramedWindowMesh(1.4, 1.45, winMat);
    winL.position.set(-width / 2 - 0.20, height * 0.54, vz);
    winL.rotation.y = Math.PI / 2;
    const winR = createFramedWindowMesh(1.4, 1.45, winMat);
    winR.position.set(width / 2 + 0.20, height * 0.54, vz);
    winR.rotation.y = Math.PI / 2;
    bGroup.add(winL, winR);
  });
  // เคาน์เตอร์ไม้แกะสลักด้านใน
  const counter = new THREE.Mesh(new THREE.BoxGeometry(width * 0.48, 1.08, 1.1), woodMat);
  counter.position.set(0, 0.62, -depth * 0.28);
  const counterTop = new THREE.Mesh(new THREE.BoxGeometry(width * 0.52, 0.10, 1.25), darkWoodMat);
  counterTop.position.set(0, 1.18, -depth * 0.28);
  counter.castShadow = true; counterTop.castShadow = true;
  bGroup.add(counter, counterTop);
  const cosR = Math.cos(rotY), sinR = Math.sin(rotY);
  const toWorld = (lx, lz) => ({
    x: wx + lx * cosR + lz * sinR,
    z: wz - lx * sinR + lz * cosR
  });
  // โต๊ะไม้และเก้าอี้ 3D สมจริงภายในอาคาร (คลิกที่เก้าอี้เพื่อนั่งเข้าที่อัตโนมัติ!)
  [-width * 0.27, width * 0.27].forEach((tx) => {
    const tw = toWorld(tx, depth * 0.12);
    const tableSet = createDetailedTableAndChairs(
      tw.x, wy + 0.14, tw.z, rotY,
      interactiveSeats, worldColliders,
      { isRound: role === 'food', cushionColor: role === 'food' ? 0xdb2777 : 0x2563eb, locationName: `เก้าอี้ใน${title}` }
    );
    worldGroup.add(tableSet);
  });
  const interiorLight = new THREE.PointLight(0xfff4e6, 3.8, width * 2.2, 0.85);
  interiorLight.position.set(0, height * 0.78, 0);
  bGroup.add(interiorLight);
  cityNightLights.push({ light: interiorLight, wx, wz, maxIntensity: 3.8, isIndoorLight: true });
  const roofGroup = new THREE.Group();
  const roofMat = createAnimeMaterial({ color: roofColor, roughness: 0.5 });
  const roofCone = new THREE.Mesh(
    new THREE.ConeGeometry(Math.max(width, depth) * 0.78, 3.8, 4),
    roofMat
  );
  roofCone.position.y = height + 1.9;
  roofCone.rotation.y = Math.PI / 4;
  roofCone.castShadow = true;
  roofGroup.add(roofCone);
  bGroup.add(roofGroup);
  const pBack = toWorld(0, -depth / 2);
  const pLeft = toWorld(-width / 2, 0);
  const pRight = toWorld(width / 2, 0);
  const pFL = toWorld(-width / 2 + frontSideW / 2, depth / 2);
  const pFR = toWorld(width / 2 - frontSideW / 2, depth / 2);
  const isRotated90 = Math.abs(Math.sin(rotY)) > 0.7;
  registerBoxCollider(worldColliders, pBack.x, pBack.z, isRotated90 ? wallT : width, isRotated90 ? width : wallT, wy + height, false);
  registerBoxCollider(worldColliders, pLeft.x, pLeft.z, isRotated90 ? depth : wallT, isRotated90 ? wallT : depth, wy + height, false);
  registerBoxCollider(worldColliders, pRight.x, pRight.z, isRotated90 ? depth : wallT, isRotated90 ? wallT : depth, wy + height, false);
  registerBoxCollider(worldColliders, pFL.x, pFL.z, isRotated90 ? wallT : frontSideW, isRotated90 ? frontSideW : wallT, wy + height, false);
  registerBoxCollider(worldColliders, pFR.x, pFR.z, isRotated90 ? wallT : frontSideW, isRotated90 ? frontSideW : wallT, wy + height, false);
  if (npcSpec) {
    const isF = npcSpec.gender === 'female';
    const npcChar = new ArticulatedCharacter3D({
      gender: npcSpec.gender,
      bodyType: isF ? 'female_grace' : 'male_hero',
      shoulderWidth: isF ? 0.20 : 0.28,
      waistWidth: isF ? 0.135 : 0.19,
      hipWidth: isF ? 0.21 : 0.19,
      bustSize: isF ? 0.065 : 0.01,
      skinColor: '#ffe9dc',
      jawTaper: isF ? 0.68 : 0.82,
      bangsStyle: isF ? 'hime_frame' : 'male_parted',
      hairStyle: npcSpec.hair,
      hairColor: npcSpec.hairColor || (isF ? '#1c1917' : '#38bdf8'),
      eyeStyle: isF ? 'normal' : 'fierce',
      eyeColor: '#f59e0b',
      eyeColorRight: '#f59e0b',
      expression: 'smile',
      fullOutfit: npcSpec.outfit,
      topStyle: isF ? 'knight_vest' : 'noble_coat',
      bottomStyle: isF ? 'battle_skirt' : 'pants',
      primaryColor: npcSpec.primary,
      secondaryColor: '#1e293b',
      hatStyle: role === 'quest' ? 'royal_crown' : 'none',
      hasCape: true,
      capeColor: '#dc2626',
      accessory: 'none',
      heightScale: isF ? 0.98 : 1.04,
      weaponId: npcSpec.weapon
    });
    const npcWorld = toWorld(0, -depth * 0.15);
    npcChar.root.position.set(npcWorld.x, wy + 0.16, npcWorld.z);
    npcChar.root.rotation.y = rotY;
    npcChar.root.userData = { isNPC: true, npcName: npcSpec.name, role };
    worldGroup.add(npcChar.root);
    npcs.push(npcChar);
    registerFloatingLabel(
      npcChar.root,
      `<div class="px-2.5 py-0.5 rounded-full bg-slate-950/90 border border-amber-400/70 text-[10px] text-amber-300 font-bold shadow">💬 ${npcSpec.name}</div>`,
      2.35
    );
  }
  const signWorld = toWorld(0, depth / 2 + 0.8);
  const signAnchor = new THREE.Object3D();
  signAnchor.position.set(signWorld.x, wy + height * 0.82, signWorld.z);
  worldGroup.add(signAnchor);
  registerFloatingLabel(
    signAnchor,
    `<div class="px-3 py-1 rounded-xl bg-slate-950/95 border border-emerald-400/70 text-center shadow-lg">
      <div class="text-[11px] font-extrabold text-amber-300">${title}</div>
      <div class="text-[9px] text-emerald-300">${subTitle} (คลิกประตู/เก้าอี้ได้)</div>
    </div>`,
    0
  );
  worldGroup.add(bGroup);
  enterableBuildings.push({
    wx, wz, width, depth, roofGroup, title, isTwoStory: false
  });
}
// ==================== สร้างโรงเตี๋ยม 2 ชั้น (2-Story Grand Inn) พร้อมห้องพัก กุญแจห้อง ตู้เก็บของ เตียง หน้าต่าง เก้าอี้ และประตู! ====================
function buildTwoStoryInnBuilding(spec) {
  const { wx, wz, rotY = Math.PI, townName = '' } = spec;
  const width = 18.0;
  const depth = 14.0;
  const hFloor1 = 4.5;
  const hFloor2 = 4.2;
  const totalH = hFloor1 + hFloor2;
  const wy = worldNoise.getHeight(wx, wz);
  const innGroup = new THREE.Group();
  innGroup.position.set(wx, wy, wz);
  innGroup.rotation.y = rotY;

  const wallMat1 = createAnimeMaterial({ color: 0xfff7ed, roughness: 0.65 });
  const wallMat2 = createAnimeMaterial({ color: 0xfef3c7, roughness: 0.65 });
  const woodMat = createAnimeMaterial({ color: 0x92400e, roughness: 0.62 });
  const darkWoodMat = createAnimeMaterial({ color: 0x5c2d0c, roughness: 0.75 });
  const floor1Mat = createAnimeMaterial({ color: 0xd6d3d1, roughness: 0.62 });
  const floor2Mat = createAnimeMaterial({ color: 0xb45309, roughness: 0.62 });
  const roofMat = createAnimeMaterial({ color: 0x991b1b, roughness: 0.52 });
  const goldMat = createAnimeMaterial({ color: 0xfbbf24, metalness: 0.78, roughness: 0.25 });
  const winMat = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    emissive: 0xf59e0b,
    emissiveIntensity: 1.8,
    roughness: 0.18
  });
  buildingWindowMaterials.push(winMat);

  const cosR = Math.cos(rotY), sinR = Math.sin(rotY);
  const toWorld = (lx, lz) => ({
    x: wx + lx * cosR + lz * sinR,
    z: wz - lx * sinR + lz * cosR
  });
  const isRotated90 = Math.abs(sinR) > 0.7;

  // ==================== ชั้นที่ 1 (Floor 1) ====================
  const floor1Group = new THREE.Group();
  innGroup.add(floor1Group);
  const groundSlab = new THREE.Mesh(new THREE.BoxGeometry(width, 0.16, depth), floor1Mat);
  groundSlab.position.y = 0.08;
  groundSlab.receiveShadow = true;
  floor1Group.add(groundSlab);

  const wallT = 0.42;
  const doorW = 2.5;
  const doorH = 2.95;
  const frontSideW = (width - doorW) / 2;

  const f1Back = new THREE.Mesh(new THREE.BoxGeometry(width, hFloor1, wallT), wallMat1);
  f1Back.position.set(0, hFloor1 / 2, -depth / 2);
  const f1Left = new THREE.Mesh(new THREE.BoxGeometry(wallT, hFloor1, depth), wallMat1);
  f1Left.position.set(-width / 2, hFloor1 / 2, 0);
  const f1Right = new THREE.Mesh(new THREE.BoxGeometry(wallT, hFloor1, depth), wallMat1);
  f1Right.position.set(width / 2, hFloor1 / 2, 0);
  const f1FrontL = new THREE.Mesh(new THREE.BoxGeometry(frontSideW, hFloor1, wallT), wallMat1);
  f1FrontL.position.set(-width / 2 + frontSideW / 2, hFloor1 / 2, depth / 2);
  const f1FrontR = new THREE.Mesh(new THREE.BoxGeometry(frontSideW, hFloor1, wallT), wallMat1);
  f1FrontR.position.set(width / 2 - frontSideW / 2, hFloor1 / 2, depth / 2);
  const f1Lintel = new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.2, hFloor1 - doorH, wallT), wallMat1);
  f1Lintel.position.set(0, doorH + (hFloor1 - doorH) / 2, depth / 2);

  [f1Back, f1Left, f1Right, f1FrontL, f1FrontR, f1Lintel].forEach(m => {
    m.castShadow = true; m.receiveShadow = true;
    floor1Group.add(m);
  });

  createHingedDoor(
    0, 0.14, depth / 2, doorW, doorH - 0.14,
    floor1Group, wx, wy, wz, rotY,
    interactiveDoors, worldColliders,
    { title: 'ประตูหน้าโรงเตี๋ยม 2 ชั้น', initialOpen: false, autoOpen: true }
  );

  [-5.2, 5.2].forEach(vx => {
    const wFront = createFramedWindowMesh(1.6, 1.6, winMat);
    wFront.position.set(vx, 2.4, depth / 2 + 0.22);
    const wBack = createFramedWindowMesh(1.6, 1.6, winMat);
    wBack.position.set(vx, 2.4, -depth / 2 - 0.22);
    wBack.rotation.y = Math.PI;
    floor1Group.add(wFront, wBack);
  });

  // เคาน์เตอร์บาร์ชั้น 1 (ขยับมาฝั่งซ้ายเพื่อให้ฝั่งขวาด้านหลังเป็นโถงบันไดส่วนกลาง)
  const barCounter = new THREE.Mesh(new THREE.BoxGeometry(5.6, 1.12, 1.2), woodMat);
  barCounter.position.set(-3.8, 0.64, -2.2);
  const barTop = new THREE.Mesh(new THREE.BoxGeometry(5.9, 0.10, 1.35), darkWoodMat);
  barTop.position.set(-3.8, 1.22, -2.2);
  floor1Group.add(barCounter, barTop);
  const barW = toWorld(-3.8, -2.2);
  registerBoxCollider(worldColliders, barW.x, barW.z, isRotated90 ? 1.3 : 5.8, isRotated90 ? 5.8 : 1.3, wy + 1.3, false, wy);

  const hearthStone = new THREE.Mesh(new THREE.BoxGeometry(1.4, 3.2, 2.4), createAnimeMaterial({ color: 0x78716c, roughness: 0.85 }));
  hearthStone.position.set(-width / 2 + 0.8, 1.6, 1.2);
  const hearthFire = createVolumetricCampfire(0.65, false);
  hearthFire.position.set(-width / 2 + 1.1, 0.2, 1.2);
  floor1Group.add(hearthStone, hearthFire);

  [
    [-4.8, 3.2], [0.2, 3.2],
    [5.2, 2.8],  [5.2, -0.8]
  ].forEach(([tx, tz]) => {
    const tw = toWorld(tx, tz);
    const tSet = createDetailedTableAndChairs(
      tw.x, wy + 0.14, tw.z, rotY,
      interactiveSeats, worldColliders,
      { isRound: false, cushionColor: 0xb91c1c, locationName: 'เก้าอี้โถงโรงเตี๋ยม ชั้น 1' }
    );
    worldGroup.add(tSet);
  });

  // ==================== บันไดส่วนกลางขึ้นชั้น 2 (ย้ายไปโซนโถงทางเดินด้านหลัง z = -5.2 นอกเขตห้องพัก!) ====================
  const numSteps = 14;
  const stairZ = -5.2;
  const stairW = 2.2;
  const stairStartX = 6.2; // เดินขึ้นจากฝั่งขวาด้านหลัง (x = 6.2)
  const stairEndX = -0.8;  // ไปทะลุชานพักโถงทางเดินชั้น 2 (x = -0.8, z = -5.2)
  for (let s = 0; s < numSteps; s++) {
    const t = (s + 1) / numSteps;
    const stepY = t * hFloor1;
    const stepX = THREE.MathUtils.lerp(stairStartX, stairEndX, t);
    const stepMesh = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.26, stairW), woodMat);
    stepMesh.position.set(stepX, stepY - 0.13, stairZ);
    stepMesh.castShadow = true; stepMesh.receiveShadow = true;
    floor1Group.add(stepMesh);
    const sw = toWorld(stepX, stairZ);
    registerBoxCollider(
      worldColliders,
      sw.x, sw.z,
      isRotated90 ? stairW : 0.85,
      isRotated90 ? 0.85 : stairW,
      wy + stepY,
      true,
      wy + stepY - 0.85
    );
  }

  const railPostBot = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.1, 8), darkWoodMat);
  railPostBot.position.set(stairStartX, 0.55, stairZ + stairW / 2);
  const railPostTop = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.1, 8), darkWoodMat);
  railPostTop.position.set(stairEndX, hFloor1 + 0.55, stairZ + stairW / 2);
  floor1Group.add(railPostBot, railPostTop);

  const stairSignW = toWorld(stairStartX + 0.5, stairZ + 0.8);
  const stairAnchor = new THREE.Object3D();
  stairAnchor.position.set(stairSignW.x, wy + 2.2, stairSignW.z);
  worldGroup.add(stairAnchor);
  registerFloatingLabel(
    stairAnchor,
    `<div class="px-2.5 py-0.5 rounded-full bg-amber-950/90 border border-amber-400/70 text-[10px] text-amber-200 font-bold shadow">🪜 บันไดส่วนกลางขึ้นโถงชั้น 2 (ห้อง 201-203)</div>`,
    0
  );

  // Colliders ผนังรอบนอกโรงเตี๋ยม
  const pBack = toWorld(0, -depth / 2);
  const pLeft = toWorld(-width / 2, 0);
  const pRight = toWorld(width / 2, 0);
  const pFL = toWorld(-width / 2 + frontSideW / 2, depth / 2);
  const pFR = toWorld(width / 2 - frontSideW / 2, depth / 2);
  registerBoxCollider(worldColliders, pBack.x, pBack.z, isRotated90 ? wallT : width, isRotated90 ? width : wallT, wy + totalH, false);
  registerBoxCollider(worldColliders, pLeft.x, pLeft.z, isRotated90 ? depth : wallT, isRotated90 ? wallT : depth, wy + totalH, false);
  registerBoxCollider(worldColliders, pRight.x, pRight.z, isRotated90 ? depth : wallT, isRotated90 ? wallT : depth, wy + totalH, false);
  registerBoxCollider(worldColliders, pFL.x, pFL.z, isRotated90 ? wallT : frontSideW, isRotated90 ? frontSideW : wallT, wy + totalH, false);
  registerBoxCollider(worldColliders, pFR.x, pFR.z, isRotated90 ? wallT : frontSideW, isRotated90 ? frontSideW : wallT, wy + totalH, false);

  // ==================== ชั้นที่ 2 (Floor 2: พื้นห้องพักเต็ม 100% ไม่แหว่ง + โถงทางเดินแยกต่างหาก) ====================
  const floor2Group = new THREE.Group();
  floor2Group.position.y = hFloor1;
  innGroup.add(floor2Group);

  const timberBelt = new THREE.Mesh(new THREE.BoxGeometry(width + 0.35, 0.32, depth + 0.35), darkWoodMat);
  timberBelt.position.y = 0;
  floor2Group.add(timberBelt);

  const corridorZ = -1.2; // กั้นโซนห้องพัก (z = -1.2 ถึง +6.8) ออกจากโซนโถงทางเดินหลังบันได (z = -6.8 ถึง -1.2)

  // 1) แผ่นพื้นโซนห้องพักทั้ง 3 ห้อง + ทางเดินหน้าห้อง (z = -3.8 ถึง +6.9) เต็มแผ่น 100% ไม่มีรูโหว่!
  const f2RoomsAndHallSlab = new THREE.Mesh(new THREE.BoxGeometry(width - 0.2, 0.24, 10.7), floor2Mat);
  f2RoomsAndHallSlab.position.set(0, -0.10, 1.55);
  f2RoomsAndHallSlab.receiveShadow = true;
  floor2Group.add(f2RoomsAndHallSlab);
  const wRoomsSlab = toWorld(0, 1.55);
  registerBoxCollider(
    worldColliders,
    wRoomsSlab.x, wRoomsSlab.z,
    isRotated90 ? 10.7 : width - 0.2,
    isRotated90 ? width - 0.2 : 10.7,
    wy + hFloor1,
    true,
    wy + hFloor1 - 0.65
  );

  // 2) แผ่นพื้นชานพักบันไดฝั่งซ้ายด้านหลัง (x = -8.9 ถึง -0.6, z = -6.9 ถึง -3.8) เชื่อมกับยอดบันไดพอดี
  const f2StairLandingSlab = new THREE.Mesh(new THREE.BoxGeometry(8.3, 0.24, 3.1), floor2Mat);
  f2StairLandingSlab.position.set(-4.75, -0.10, -5.35);
  f2StairLandingSlab.receiveShadow = true;
  floor2Group.add(f2StairLandingSlab);
  const wLandingSlab = toWorld(-4.75, -5.35);
  registerBoxCollider(
    worldColliders,
    wLandingSlab.x, wLandingSlab.z,
    isRotated90 ? 3.1 : 8.3,
    isRotated90 ? 8.3 : 3.1,
    wy + hFloor1,
    true,
    wy + hFloor1 - 0.65
  );

  // ราวกันตกขอบช่องบันไดบนชั้น 2 เพื่อความปลอดภัย
  const stairGuardRail = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.95, 0.14), darkWoodMat);
  stairGuardRail.position.set(3.2, 0.48, -3.85);
  floor2Group.add(stairGuardRail);
  const wGuard = toWorld(3.2, -3.85);
  registerBoxCollider(worldColliders, wGuard.x, wGuard.z, isRotated90 ? 0.25 : 7.2, isRotated90 ? 7.2 : 0.25, wy + hFloor1 + 1.0, false, wy + hFloor1);

  // ผนังภายนอกชั้น 2
  const f2Back = new THREE.Mesh(new THREE.BoxGeometry(width, hFloor2, wallT), wallMat2);
  f2Back.position.set(0, hFloor2 / 2, -depth / 2);
  const f2Left = new THREE.Mesh(new THREE.BoxGeometry(wallT, hFloor2, depth), wallMat2);
  f2Left.position.set(-width / 2, hFloor2 / 2, 0);
  const f2Right = new THREE.Mesh(new THREE.BoxGeometry(wallT, hFloor2, depth), wallMat2);
  f2Right.position.set(width / 2, hFloor2 / 2, 0);
  const f2Front = new THREE.Mesh(new THREE.BoxGeometry(width, hFloor2, wallT), wallMat2);
  f2Front.position.set(0, hFloor2 / 2, depth / 2);
  [f2Back, f2Left, f2Right, f2Front].forEach(m => {
    m.castShadow = true; m.receiveShadow = true;
    floor2Group.add(m);
  });

  const balconyDeck = new THREE.Mesh(new THREE.BoxGeometry(width * 0.76, 0.20, 1.4), darkWoodMat);
  balconyDeck.position.set(0, 0.0, depth / 2 + 0.7);
  const balconyRail = new THREE.Mesh(new THREE.BoxGeometry(width * 0.76, 0.95, 0.12), woodMat);
  balconyRail.position.set(0, 0.52, depth / 2 + 1.32);
  floor2Group.add(balconyDeck, balconyRail);

  [-6.0, 0, 6.0].forEach(vx => {
    const winF2 = createFramedWindowMesh(1.65, 1.55, winMat);
    winF2.position.set(vx, hFloor2 * 0.55, depth / 2 + 0.22);
    const winB2 = createFramedWindowMesh(1.65, 1.55, winMat);
    winB2.position.set(vx, hFloor2 * 0.55, -depth / 2 - 0.22);
    winB2.rotation.y = Math.PI;
    floor2Group.add(winF2, winB2);
  });

  [-3.2, 3.2].forEach(vz => {
    const winSideL = createFramedWindowMesh(1.5, 1.5, winMat);
    winSideL.position.set(-width / 2 - 0.22, hFloor2 * 0.55, vz);
    winSideL.rotation.y = Math.PI / 2;
    const winSideR = createFramedWindowMesh(1.5, 1.5, winMat);
    winSideR.position.set(width / 2 + 0.22, hFloor2 * 0.55, vz);
    winSideR.rotation.y = Math.PI / 2;
    floor2Group.add(winSideL, winSideR);
  });

  // ==================== ห้องพักส่วนตัว 3 ห้องบนชั้น 2 (201, 202, 203) ====================
  const roomSpecs = [
    { roomId: '201', name: 'ห้องพัก 201 (Standard Room)', price: 40, minX: -8.8, maxX: -3.0, centerX: -5.9, blanketColor: 0x2563eb },
    { roomId: '202', name: 'ห้องพัก 202 (Deluxe Room)',   price: 60, minX: -3.0, maxX: 2.8,  centerX: -0.1, blanketColor: 0x059669 },
    { roomId: '203', name: 'ห้องพัก 203 (Royal Suite)',   price: 90, minX: 2.8,  maxX: 8.8,  centerX: 5.8,  blanketColor: 0xd97706 }
  ];

  // ผนังกั้นระหว่างห้องพัก (จาก z = -1.2 ถึง z = +6.8)
  [-3.0, 2.8].forEach(divX => {
    const divLen = 8.0;
    const divCenterZ = 2.8;
    const divWall = new THREE.Mesh(new THREE.BoxGeometry(0.28, hFloor2, divLen), wallMat1);
    divWall.position.set(divX, hFloor2 / 2, divCenterZ);
    divWall.castShadow = true; divWall.receiveShadow = true;
    floor2Group.add(divWall);
    const dw = toWorld(divX, divCenterZ);
    registerBoxCollider(
      worldColliders,
      dw.x, dw.z,
      isRotated90 ? divLen : 0.32,
      isRotated90 ? 0.32 : divLen,
      wy + totalH,
      false,
      wy + hFloor1 - 0.1
    );
  });
  
  const floor2PropsGroup = new THREE.Group();
  worldGroup.add(floor2PropsGroup);

  roomSpecs.forEach((rm) => {
    const rDoorW = 1.65;
    const rDoorH = 2.65;
    const doorLocalX = rm.centerX;
    const leftSegW = (doorLocalX - rDoorW / 2) - rm.minX;
    const rightSegW = rm.maxX - (doorLocalX + rDoorW / 2);

    if (leftSegW > 0.05) {
      const segL = new THREE.Mesh(new THREE.BoxGeometry(leftSegW, hFloor2, 0.28), wallMat2);
      const lx = rm.minX + leftSegW / 2;
      segL.position.set(lx, hFloor2 / 2, corridorZ);
      floor2Group.add(segL);
      const sw = toWorld(lx, corridorZ);
      registerBoxCollider(worldColliders, sw.x, sw.z, isRotated90 ? 0.32 : leftSegW, isRotated90 ? leftSegW : 0.32, wy + totalH, false, wy + hFloor1 - 0.1);
    }
    if (rightSegW > 0.05) {
      const segR = new THREE.Mesh(new THREE.BoxGeometry(rightSegW, hFloor2, 0.28), wallMat2);
      const rx = rm.maxX - rightSegW / 2;
      segR.position.set(rx, hFloor2 / 2, corridorZ);
      floor2Group.add(segR);
      const sw = toWorld(rx, corridorZ);
      registerBoxCollider(worldColliders, sw.x, sw.z, isRotated90 ? 0.32 : rightSegW, isRotated90 ? rightSegW : 0.32, wy + totalH, false, wy + hFloor1 - 0.1);
    }

    const rLintel = new THREE.Mesh(new THREE.BoxGeometry(rDoorW + 0.16, hFloor2 - rDoorH, 0.28), wallMat2);
    rLintel.position.set(doorLocalX, rDoorH + (hFloor2 - rDoorH) / 2, corridorZ);
    floor2Group.add(rLintel);

    const roomDoorObj = createHingedDoor(
      doorLocalX, hFloor1, corridorZ, rDoorW, rDoorH,
      innGroup, wx, wy, wz, rotY,
      interactiveDoors, worldColliders,
      {
        title: `🚪 ${rm.name}`,
        roomId: rm.roomId,
        roomPrice: rm.price,
        isRoomDoor: true,
        initialOpen: false,
        autoOpen: false
      }
    );
    roomDoorObj.isLocked = true; // เริ่มต้นล็อคประตูห้องพักทุกห้อง

    const doorLabelW = toWorld(doorLocalX, corridorZ - 0.25);
    const doorLabelAnchor = new THREE.Object3D();
    doorLabelAnchor.position.set(doorLabelW.x, wy + hFloor1 + 2.35, doorLabelW.z);
    worldGroup.add(doorLabelAnchor);
    roomDoorObj.labelItem = registerFloatingLabel(
      doorLabelAnchor,
      `<div class="px-2 py-0.5 rounded-lg bg-slate-950/90 border border-amber-400/70 text-[9px] text-amber-200 font-bold shadow">🔒 ห้อง ${rm.roomId} (ล็อค) [คลิกเปิด/ปิด | Shift+คลิก ล็อค/ปลดล็อค]</div>`,
      0
    );

    // 1) เตียงนอน 3D ภายในห้องพัก
    const bedGroup = new THREE.Group();
    const bedLocalX = rm.minX + 1.35;
    const bedLocalZ = 4.5;
    bedGroup.position.set(bedLocalX, 0.04, bedLocalZ);
    const bedFrame = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.42, 2.45), darkWoodMat);
    bedFrame.position.y = 0.21;
    const headboard = new THREE.Mesh(new THREE.BoxGeometry(1.70, 1.25, 0.18), darkWoodMat);
    headboard.position.set(0, 0.62, 1.18);
    const mattress = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.24, 2.28), createAnimeMaterial({ color: 0xf8fafc, roughness: 0.5 }));
    mattress.position.y = 0.48;
    const blanket = new THREE.Mesh(new THREE.BoxGeometry(1.54, 0.26, 1.55), createAnimeMaterial({ color: rm.blanketColor, roughness: 0.6 }));
    blanket.position.set(0, 0.49, -0.34);
    const pillow = new THREE.Mesh(new THREE.BoxGeometry(1.10, 0.16, 0.46), createAnimeMaterial({ color: 0xfef3c7, roughness: 0.5 }));
    pillow.position.set(0, 0.64, 0.78);
    bedGroup.add(bedFrame, headboard, mattress, blanket, pillow);
    floor2Group.add(bedGroup);

    const bedWorld = toWorld(bedLocalX, bedLocalZ);
    const bedObj = {
      roomId: rm.roomId,
      roomName: rm.name,
      wx: bedWorld.x,
      wy: wy + hFloor1 + 0.15,
      wz: bedWorld.z,
      rotY: rotY + Math.PI,
      mesh: bedGroup
    };
    bedGroup.traverse(m => {
      if (m.isMesh) {
        m.castShadow = true; m.receiveShadow = true;
        m.userData.isBed = true;
        m.userData.bedRef = bedObj;
      }
    });
    interactiveBeds.push(bedObj);
    const bedAnchor = new THREE.Object3D();
    bedAnchor.position.set(bedWorld.x, wy + hFloor1 + 1.35, bedWorld.z);
    worldGroup.add(bedAnchor);
    registerFloatingLabel(
      bedAnchor,
      `<div class="px-2 py-0.5 rounded-full bg-emerald-950/90 border border-emerald-400/60 text-[9px] text-emerald-200 font-semibold">🛏️ เตียงห้อง ${rm.roomId} [คลิกเพื่อนอนพักฟื้นฟู 100%]</div>`,
      0
    );

    // 2) ตู้เก็บของไม้ 3D
    const cabGroup = new THREE.Group();
    const cabLocalX = rm.maxX - 0.85;
    const cabLocalZ = 1.45;
    cabGroup.position.set(cabLocalX, 0.04, cabLocalZ);
    cabGroup.rotation.y = -Math.PI / 2;
    const cabBody = new THREE.Mesh(new THREE.BoxGeometry(1.45, 2.35, 0.78), darkWoodMat);
    cabBody.position.y = 1.18;
    const cabCrown = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.14, 0.88), woodMat);
    cabCrown.position.y = 2.40;
    const cabDoorL = new THREE.Mesh(new THREE.BoxGeometry(0.64, 1.95, 0.06), woodMat);
    cabDoorL.position.set(-0.34, 1.22, 0.40);
    const cabDoorR = new THREE.Mesh(new THREE.BoxGeometry(0.64, 1.95, 0.06), woodMat);
    cabDoorR.position.set(0.34, 1.22, 0.40);
    const handleL = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 10), goldMat);
    handleL.position.set(-0.08, 1.22, 0.45);
    const handleR = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 10), goldMat);
    handleR.position.set(0.08, 1.22, 0.45);
    cabGroup.add(cabBody, cabCrown, cabDoorL, cabDoorR, handleL, handleR);
    floor2Group.add(cabGroup);

    const cabWorld = toWorld(cabLocalX, cabLocalZ);
    const cabObj = {
      roomId: rm.roomId,
      roomName: rm.name,
      wx: cabWorld.x,
      wy: wy + hFloor1,
      wz: cabWorld.z,
      mesh: cabGroup
    };
    cabGroup.traverse(m => {
      if (m.isMesh) {
        m.castShadow = true; m.receiveShadow = true;
        m.userData.isCabinet = true;
        m.userData.cabinetRef = cabObj;
      }
    });
    interactiveCabinets.push(cabObj);
    registerBoxCollider(worldColliders, cabWorld.x, cabWorld.z, 0.9, 1.5, wy + hFloor1 + 2.4, false, wy + hFloor1);
    const cabAnchor = new THREE.Object3D();
    cabAnchor.position.set(cabWorld.x, wy + hFloor1 + 2.55, cabWorld.z);
    worldGroup.add(cabAnchor);
    registerFloatingLabel(
      cabAnchor,
      `<div class="px-2 py-0.5 rounded-full bg-amber-950/90 border border-amber-400/60 text-[9px] text-amber-200 font-semibold">🗄️ ตู้เก็บของห้อง ${rm.roomId} [คลิกเปิดตู้เก็บของ]</div>`,
      0
    );

    // 3) โต๊ะริมหน้าต่างและเก้าอี้คลิกนั่งได้ภายในห้องพัก
    const deskWorld = toWorld(rm.maxX - 1.35, 4.8);
    const roomTableSet = createDetailedTableAndChairs(
      deskWorld.x,
      wy + hFloor1 + 0.04,
      deskWorld.z,
      rotY,
      interactiveSeats,
      worldColliders,
      {
        isRound: false,
        tableW: 1.25,
        tableD: 0.85,
        cushionColor: rm.blanketColor,
        locationName: `เก้าอี้ห้องพัก ${rm.roomId}`,
        chairList: [{ cx: 0, cz: -0.82, faceRot: 0 }]
      }
    );
    floor2PropsGroup.add(roomTableSet);
  });

  const lightF1 = new THREE.PointLight(0xfff4e6, 4.5, 36, 0.8);
  lightF1.position.set(0, hFloor1 * 0.82, 0);
  floor1Group.add(lightF1);
  const lightF2 = new THREE.PointLight(0xfff4e6, 4.0, 36, 0.8);
  lightF2.position.set(0, hFloor2 * 0.82, 0);
  floor2Group.add(lightF2);
  cityNightLights.push({ light: lightF1, wx, wz, maxIntensity: 4.5, isIndoorLight: true });
  cityNightLights.push({ light: lightF2, wx, wz, maxIntensity: 4.0, isIndoorLight: true });

  const roofGroup = new THREE.Group();
  const roofCone = new THREE.Mesh(
    new THREE.ConeGeometry(Math.max(width, depth) * 0.78, 4.4, 4),
    roofMat
  );
  roofCone.position.y = totalH + 2.2;
  roofCone.rotation.y = Math.PI / 4;
  roofCone.castShadow = true;
  roofGroup.add(roofCone);
  innGroup.add(roofGroup);

  const npcChar = new ArticulatedCharacter3D({
    gender: 'male',
    bodyType: 'male_hero',
    shoulderWidth: 0.28,
    waistWidth: 0.19,
    hipWidth: 0.19,
    bustSize: 0.01,
    skinColor: '#ffe9dc',
    jawTaper: 0.82,
    bangsStyle: 'male_parted',
    hairStyle: 'wolf_cut',
    hairColor: '#451a03',
    eyeStyle: 'fierce',
    eyeColor: '#f59e0b',
    expression: 'smile',
    fullOutfit: 'none',
    topStyle: 'noble_coat',
    bottomStyle: 'pants',
    primaryColor: '#b45309',
    secondaryColor: '#1e293b',
    hasCape: false,
    heightScale: 1.04,
    weaponId: 'tome_holy'
  });
  const npcW = toWorld(-3.8, -1.0);
  npcChar.root.position.set(npcW.x, wy + 0.16, npcW.z);
  npcChar.root.rotation.y = rotY;
  npcChar.root.userData = { isNPC: true, npcName: 'ผู้ดูแลโรงเตี๋ยม เกรย์ (เช่าห้องพัก/รับกุญแจ)', role: 'tavern' };
  worldGroup.add(npcChar.root);
  npcs.push(npcChar);
  registerFloatingLabel(
    npcChar.root,
    `<div class="px-2.5 py-0.5 rounded-full bg-slate-950/90 border border-amber-400/80 text-[10px] text-amber-300 font-bold shadow">🔑 ผู้ดูแลโรงเตี๋ยม เกรย์ [คลิกเช่าห้องพักชั้น 2]</div>`,
    2.35
  );

  const signW = toWorld(0, depth / 2 + 0.9);
  const signAnchor = new THREE.Object3D();
  signAnchor.position.set(signW.x, wy + 4.4, signW.z);
  worldGroup.add(signAnchor);
  registerFloatingLabel(
    signAnchor,
    `<div class="px-3.5 py-1 rounded-xl bg-slate-950/95 border border-amber-400 text-center shadow-xl">
      <div class="text-[11px] font-extrabold text-amber-300">🏨 โรงเตี๋ยมนักเดินทาง 2 ชั้น (Grand 2-Story Inn)</div>
      <div class="text-[9px] text-emerald-300">ชั้น 1: โถงอาหาร & เช่ากุญแจห้อง | ชั้น 2: ห้องพัก 201-203</div>
    </div>`,
    0
  );

  worldGroup.add(innGroup);
  const f2Colliders = worldColliders.slice(-2); // หรือเก็บไว้ตอนสร้าง wRoomsSlab / wLandingSlab
  enterableBuildings.push({
    wx, wz, width, depth, wy, hFloor1, totalH,
    floor1Group, floor2Group, floor2PropsGroup, roofGroup,
    title: 'โรงเตี๋ยมนักเดินทาง 2 ชั้น',
    isTwoStory: true
  });
}
// สร้างรถม้าเคลื่อนที่รอบเมือง (Animated Horse Carriage) พร้อมม้าลาก ล้อหมุน โคมไฟ และคนขับรถม้า
function spawnAnimatedCityCarriage(town, orbitRadius, startAngle, speed, labelTitle) {
  const cGroup = new THREE.Group();
  const woodMat = createAnimeMaterial({ color: 0x78350f, roughness: 0.65 });
  const canopyMat = createAnimeMaterial({ color: 0x991b1b, roughness: 0.55 });
  const goldMat = createAnimeMaterial({ color: 0xfbbf24, metalness: 0.8, roughness: 0.25 });
  const horseMat = createAnimeMaterial({ color: 0x92400e, roughness: 0.7 });
  // ตัวรถม้า (Cabin & Chassis)
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.45, 3.8), woodMat);
  base.position.y = 0.85;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.85, 2.6), canopyMat);
  cabin.position.set(0, 1.95, -0.35);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(2.32, 0.18, 2.7), goldMat);
  trim.position.set(0, 2.85, -0.35);
  base.castShadow = true; cabin.castShadow = true;
  cGroup.add(base, cabin, trim);
  // ล้อรถม้าทั้ง 4 ล้อ
  const wheels = [];
  [[-1.22, 1.1], [1.22, 1.1], [-1.22, -1.2], [1.22, -1.2]].forEach(([wx, wz]) => {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.18, 16), goldMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.62, wz);
    cGroup.add(wheel);
    wheels.push(wheel);
  });
  // ม้าลากรถด้านหน้า
  const horseGroup = new THREE.Group();
  horseGroup.position.set(0, 0, 3.3);
  const hBody = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.95, 1.9), horseMat);
  hBody.position.y = 1.15;
  const hNeck = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.95, 0.55), horseMat);
  hNeck.position.set(0, 1.65, 0.78);
  hNeck.rotation.x = 0.35;
  const hHead = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.75), horseMat);
  hHead.position.set(0, 2.02, 1.15);
  horseGroup.add(hBody, hNeck, hHead);
  const horseLegs = [];
  [[-0.32, 0.68], [0.32, 0.68], [-0.32, -0.68], [0.32, -0.68]].forEach(([lx, lz]) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.10, 0.95, 10), horseMat);
    leg.position.set(lx, 0.48, lz);
    horseGroup.add(leg);
    horseLegs.push(leg);
  });
  cGroup.add(horseGroup);
  const initX = town.x + Math.cos(startAngle) * orbitRadius;
  const initZ = town.z + Math.sin(startAngle) * orbitRadius;
  const initY = worldNoise.getHeight(initX, initZ);
  cGroup.position.set(initX, initY, initZ);
  const carriageObj = {
    group: cGroup,
    town,
    orbitRadius,
    angle: startAngle,
    speed,
    wheels,
    horseLegs,
    horseGroup
  };
  cGroup.userData = { isCarriage: true, carriageRef: carriageObj, title: labelTitle };
  worldGroup.add(cGroup);
  animatedCarriages.push(carriageObj);
  registerFloatingLabel(
    cGroup,
    `<div class="px-2.5 py-0.5 rounded-full bg-amber-950/90 border border-amber-400/70 text-[10px] text-amber-200 font-bold shadow">🐎 ${labelTitle} [คลิกขึ้น/ลงรถม้า]</div>`,
    3.3
  );
}
// สร้างมหานครขนาดใหญ่ทั้ง 4 เมือง พร้อม 4 ย่านหลัก อาคารเดินเข้าได้ ประตูเมือง 4 ทิศ โคมไฟส่องสว่าง และรถม้า!
function buildAllGrandCities() {
  const chatterLines = [
    "มหานครเอเธลการ์ดกว้างใหญ่มาก ลองนั่งรถม้าชมเมืองดูสิ!",
    "ตอนกลางคืนโคมไฟถนนตามย่านการค้าและย่านขุนนางสว่างสวยมากเลย!",
    "เดินเข้าไปข้างในกิลด์ โรงเตี้ยม ร้านอาวุธ และร้านอาหารได้ทุกหลังเลยนะ!",
    "ย่านการค้าทางทิศตะวันออกมีตลาดและร้านตีเหล็กคึกคักสุดๆ!",
    "กิลด์นักผจญภัยกำลังเปิดรับสมัครผู้กล้าอยู่ด้านในอาคารเลย!"
  ];
  TOWNS.forEach((town) => {
    const R = town.radius; // 88 - 96 เมตร (มหานครขนาดใหญ่)
    buildRealisticGrandTown(town, worldNoise, worldGroup, worldColliders, streetLampMaterials, streetLampGlowDiscs, interactiveSeats);
    const baseY = worldNoise.getHeight(town.x, town.z);
    // 1. จุดพักผิงไฟนักเดินทางในสวนด้านข้างอย่างเป็นระเบียบ (ไม่กีดขวางถนนหลัก)
    const plazaCampfire = createVolumetricCampfire(1.0, true);
    plazaCampfire.position.set(town.x - 24.0, baseY, town.z + 2.5);
    worldGroup.add(plazaCampfire);
    worldColliders.push({ x: town.x - 24.0, z: town.z + 2.5, radius: 1.0, topY: baseY + 1.2, stepable: false });
    animatedCampfires.forEach((cf) => {
      if (!cf._enhanced) {
        cf._enhanced = true;
        enhanceCampfireWithMistCone(cf.group);
      }
    });
    // 2. ป้ายชื่อ 4 ย่านหลักของมหานคร (Central Plaza, Trade District, Noble Quarter, Residential Quarter)
    const districts = [
      { dx: 0, dz: 0, badge: '🏛️ เขตใจกลางเมือง (Central Royal Plaza)', color: 'border-amber-400 text-amber-200' },
      { dx: 48, dz: 0, badge: '⚖️ ย่านการค้าและตลาดเสรี (Trade & Market District)', color: 'border-emerald-400 text-emerald-200' },
      { dx: 0, dz: -48, badge: '👑 ย่านขุนนางและคฤหาสน์ (Noble Quarter)', color: 'border-purple-400 text-purple-200' },
      { dx: -48, dz: 0, badge: '🏘️ ย่านพักอาศัยและกิลด์ (Guild & Residential Quarter)', color: 'border-sky-400 text-sky-200' }
    ];
    districts.forEach(d => {
      const anchor = new THREE.Object3D();
      const dy = worldNoise.getHeight(town.x + d.dx, town.z + d.dz);
      anchor.position.set(town.x + d.dx, dy + 6.8, town.z + d.dz);
      worldGroup.add(anchor);
      registerFloatingLabel(
        anchor,
        `<div class="px-3 py-1 rounded-full bg-slate-950/90 border ${d.color} text-[11px] font-extrabold shadow-lg">${d.badge}</div>`,
        0
      );
    });
    // 3. โคมไฟถนนเรืองแสงพร้อมวงแสงตกกระทบพื้นและ PointLight ส่องสว่างทั่วถนนสายหลักและวงแหวน!
    for (let dist = 20; dist <= 74; dist += 18) {
      createGlowingStreetLamp(town.x + 4.8, worldNoise.getHeight(town.x + 4.8, town.z + dist), town.z + dist, dist === 38, Math.PI);
      createGlowingStreetLamp(town.x - 4.8, worldNoise.getHeight(town.x - 4.8, town.z - dist), town.z - dist, dist === 38, 0);
      createGlowingStreetLamp(town.x + dist, worldNoise.getHeight(town.x + dist, town.z + 4.8), town.z + 4.8, dist === 38, Math.PI / 2);
      createGlowingStreetLamp(town.x - dist, worldNoise.getHeight(town.x - dist, town.z - 4.8), town.z - 4.8, dist === 38, -Math.PI / 2);
    }
    // 4. สร้างอาคารหลักทั้ง 4 แห่งที่ผู้เล่นเดินเข้าข้างในได้จริง (Enterable Buildings) พร้อม NPC ชาย/หญิงด้านใน!
    buildEnterableBuilding({
      wx: town.x - 38, wz: town.z - 16, width: 13, depth: 11, height: 5.4,
      wallColor: 0xfef3c7, roofColor: 0xb45309, rotY: 0,
      title: '🏰 กิลด์นักผจญภัย (Adventurer Guild)', subTitle: 'รับเควสและภารกิจผู้กล้า', role: 'quest',
      npcSpec: { name: 'เอลีน่า (หัวหน้ากิลด์)', gender: 'female', outfit: 'paladin_armor', primary: '#f59e0b', hair: 'long_flowing', weapon: 'sword_flame' }
    });
    buildTwoStoryInnBuilding({
      wx: town.x - 36, wz: town.z + 20, rotY: Math.PI, townName: town.name
    });
    buildEnterableBuilding({
      wx: town.x + 38, wz: town.z - 16, width: 13, depth: 11, height: 5.2,
      wallColor: 0xe2e8f0, roofColor: 0x0284c7, rotY: 0,
      title: '⚒️ โรงตีเหล็กและร้านอาวุธ (Weapon Shop)', subTitle: 'ซื้อขายและสวมใส่อาวุธ', role: 'shop',
      npcSpec: { name: 'ปรมาจารย์โบริน (ช่างตีเหล็กอาวุธ)', gender: 'male', outfit: 'paladin_armor', primary: '#0284c7', hair: 'short_layered', hairColor: '#cbd5e1', weapon: 'shield_aegis' }
    });
    buildEnterableBuilding({
      wx: town.x + 38, wz: town.z + 18, width: 13, depth: 11, height: 5.2,
      wallColor: 0xfff1f2, roofColor: 0xdb2777, rotY: Math.PI,
      title: '🥐 ภัตตาคารอาหารเชฟโรเซ่ (Chef Restaurant)', subTitle: 'ปรุงอาหารบัพสเตตัสถาวร', role: 'food',
      npcSpec: { name: 'เชฟโรเซ่ (ภัตตาคารอาหารบัพ)', gender: 'female', outfit: 'royal_dress', primary: '#ec4899', hair: 'twintails', weapon: 'staff_oak' }
    });
    // 5. สร้างตึกแถว คฤหาสน์ขุนนาง และแผงลอยตลาดในแต่ละย่านให้เมืองดูยิ่งใหญ่อลังการ
    const extraDistrictBuildings = [
      // ย่านขุนนาง (ทิศเหนือ)
      { x: -22, z: -56, w: 12, d: 9, h: 6.5, wall: 0xf8fafc, roof: 0x6d28d9 },
      { x: 22,  z: -56, w: 12, d: 9, h: 6.5, wall: 0xf8fafc, roof: 0x4f46e5 },
      { x: 0,   z: -66, w: 16, d: 11, h: 7.5, wall: 0xfef9c3, roof: 0xd97706 },
      // ย่านการค้า (ทิศตะวันออก)
      { x: 62,  z: -24, w: 10, d: 8, h: 4.8, wall: 0xfef3c7, roof: 0x059669 },
      { x: 62,  z: 24,  w: 10, d: 8, h: 4.8, wall: 0xfef3c7, roof: 0xd97706 },
      // ย่านพักอาศัยทั่วไป (ทิศตะวันตกและทิศใต้)
      { x: -62, z: -24, w: 9,  d: 8, h: 4.6, wall: 0xf1f5f9, roof: 0x0284c7 },
      { x: -62, z: 24,  w: 9,  d: 8, h: 4.6, wall: 0xf1f5f9, roof: 0xdc2626 },
      { x: -24, z: 56,  w: 10, d: 8, h: 4.8, wall: 0xffedd5, roof: 0xb45309 },
      { x: 24,  z: 56,  w: 10, d: 8, h: 4.8, wall: 0xffedd5, roof: 0x15803d }
    ];
    extraDistrictBuildings.forEach(b => {
      const bx = town.x + b.x, bz = town.z + b.z;
      const by = worldNoise.getHeight(bx, bz);
      const meshG = new THREE.Group();
      meshG.position.set(bx, by, bz);
      const body = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), createAnimeMaterial({ color: b.wall, roughness: 0.65 }));
      body.position.y = b.h / 2;
      body.castShadow = true; body.receiveShadow = true;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(b.w, b.d) * 0.76, 3.2, 4), createAnimeMaterial({ color: b.roof, roughness: 0.5 }));
      roof.position.y = b.h + 1.6;
      roof.rotation.y = Math.PI / 4;
      roof.castShadow = true;
      meshG.add(body, roof);
      worldGroup.add(meshG);
      registerBoxCollider(worldColliders, bx, bz, b.w + 0.4, b.d + 0.4, by + b.h, false);
    });
    // 6. สร้างซุ้มประตูเมืองขนาดใหญ่ทั้ง 4 ทิศ (เหนือ, ใต้, ตะวันออก, ตะวันตก)
    [
      { x: 0, z: 1, label: 'ประตูเมืองทิศใต้ (ทางเข้าหลัก)' },
      { x: 0, z: -1, label: 'ประตูเมืองทิศเหนือ (ย่านขุนนาง)' },
      { x: 1, z: 0, label: 'ประตูเมืองทิศตะวันออก (ย่านการค้า)' },
      { x: -1, z: 0, label: 'ประตูเมืองทิศตะวันตก (ย่านกิลด์)' }
    ].forEach(dir => buildGrandCityGate(town, dir, R - 6));
    // 7. เสกรถม้าเคลื่อนที่วิ่งวนรอบถนนวงแหวนชั้นในและชั้นนอกของมหานคร
    spawnAnimatedCityCarriage(town, 28, 0.2, 4.2, 'รถม้าสายใจกลางเมือง');
    spawnAnimatedCityCarriage(town, 50, Math.PI, 4.8, 'รถม้าสายย่านการค้า-ขุนนาง');
    // 8. NPC ชาวเมือง ทหารยาม ขุนนาง และพ่อค้า (อัตราส่วน ชาย 50% : หญิง 50% พร้อมทรงผมและชุดผู้ชายแท้ๆ!)
    const walkerSpecs = [
      { title: '🛡️ แม่ทัพอัศวินตรวจการณ์', gender: 'male', outfit: 'paladin_armor', top: 'noble_coat', hair: 'short_layered', bangs: 'male_parted', primary: '#1d4ed8', weapon: 'sword_flame', radius: 22, speed: 2.6, startAng: 0 },
      { title: '🛡️ อัศวินหญิงลาดตระเวน', gender: 'female', outfit: 'paladin_armor', top: 'knight_vest', hair: 'ponytail', bangs: 'hime_frame', primary: '#f59e0b', weapon: 'sword_iron', radius: 22, speed: 2.6, startAng: Math.PI },
      { title: '👑 ลอร์ดขุนนางแห่งเอเธล', gender: 'male', outfit: 'none', top: 'noble_coat', hair: 'wolf_cut', bangs: 'male_parted', primary: '#7c3aed', weapon: 'sword_iron', radius: 44, speed: 2.1, startAng: 0.8 },
      { title: '👑 เลดี้ราชนิกูล', gender: 'female', outfit: 'royal_dress', top: 'knight_vest', hair: 'long_flowing', bangs: 'hime_frame', primary: '#ec4899', weapon: 'tome_holy', radius: 44, speed: 2.0, startAng: 2.4 },
      { title: '⚒️ พ่อค้าวาณิชย์แห่งตลาดเสรี', gender: 'male', outfit: 'none', top: 'hunter_jacket', hair: 'undercut_fade', bangs: 'spiky_fringe', primary: '#d97706', weapon: 'shield_knight', radius: 36, speed: 2.3, startAng: 1.5 },
      { title: '🎀 นักเรียนเวทกะลาสี', gender: 'female', outfit: 'sailor_school', top: 'sailor_blouse', hair: 'twintails', bangs: 'hime_frame', primary: '#f8fafc', weapon: 'tome_holy', radius: 14, speed: 1.9, startAng: 0.4 },
      { title: '🗡️ จอมยุทธ์พเนจร', gender: 'male', outfit: 'none', top: 'noble_coat', hair: 'samurai_bun', bangs: 'male_parted', primary: '#0f172a', weapon: 'sword_flame', radius: 34, speed: 2.5, startAng: 3.9 },
      { title: '🏹 นักล่าสมบัติกิลด์', gender: 'female', outfit: 'none', top: 'hunter_jacket', hair: 'ponytail', bangs: 'side_swept', primary: '#10b981', weapon: 'bow_hunter', radius: 38, speed: 2.4, startAng: 5.1 },
      { title: '🎻 กวีหนุ่มแห่งเอเธล', gender: 'male', outfit: 'archmage_robe', top: 'noble_coat', hair: 'short_layered', bangs: 'male_parted', primary: '#2563eb', weapon: 'staff_oak', radius: 16, speed: 1.85, startAng: 2.9 },
      { title: '🧺 หญิงสาวชาวเมือง', gender: 'female', outfit: 'none', top: 'casual_crop', hair: 'long_flowing', bangs: 'hime_frame', primary: '#f43f5e', weapon: 'tome_holy', radius: 30, speed: 1.95, startAng: 4.5 }
    ];
    walkerSpecs.forEach((ws, idx) => {
      const isF = ws.gender === 'female';
      const wChar = new ArticulatedCharacter3D({
        gender: ws.gender,
        bodyType: isF ? 'female_grace' : 'male_hero',
        skinColor: '#ffe9dc',
        jawTaper: isF ? 0.68 : 0.84,
        bangsStyle: ws.bangs,
        hairStyle: ws.hair,
        hairColor: ['#1c1917', '#451a03', '#b45309', '#312e81', '#0f172a'][idx % 5],
        eyeStyle: isF ? 'normal' : 'fierce',
        eyeColor: '#f59e0b',
        expression: isF ? 'smile' : 'cool',
        fullOutfit: ws.outfit,
        topStyle: ws.top,
        bottomStyle: isF ? 'battle_skirt' : 'pants',
        primaryColor: ws.primary,
        secondaryColor: '#1e293b',
        hasCape: idx < 4,
        capeColor: '#b91c1c',
        heightScale: isF ? 0.96 : 1.04,
        weaponId: ws.weapon
      });
      const initX = town.x + Math.cos(ws.startAng) * ws.radius;
      const initZ = town.z + Math.sin(ws.startAng) * ws.radius;
      wChar.root.position.set(initX, baseY, initZ);
      wChar.root.userData = { isNPC: true, npcName: ws.title, role: 'citizen' };
      worldGroup.add(wChar.root);
      const labelItem = registerFloatingLabel(
        wChar.root,
        `<div class="px-2 py-0.5 rounded-full bg-slate-900/85 border border-slate-600 text-[9px] text-slate-200">${ws.title}</div>`,
        2.3
      );
      wanderingNPCs.push({
        char3D: wChar,
        townCenter: { x: town.x, z: town.z },
        baseY,
        orbitRadius: ws.radius,
        angle: ws.startAng,
        speed: ws.speed,
        pauseTimer: 0,
        chatTimer: 4 + idx * 2.5,
        title: ws.title,
        labelItem,
        chatterPool: chatterLines
      });
    });
    // 9. สัตว์ป่าและจุดฟาร์มรอบนอกกำแพงมหานคร
    spawnWildlifeAt(town.x - 12.5, town.z + 12.5, 'rabbit');
    spawnWildlifeAt(town.x + 14.5, town.z - 10.0, 'rabbit');
    spawnWildlifeAt(town.x, town.z, 'bird');
    spawnWildlifeAt(town.x + 28.0, town.z + 28.0, 'bird');
    spawnWildlifeAt(town.x + R + 14, town.z + 8, 'deer');
    spawnWildlifeAt(town.x - R - 14, town.z - 8, 'deer');
    [
      [R + 10, 12, 'golden_wheat'],
      [R + 12, -12, 'moon_herb'],
      [-R - 10, 12, 'mithril_ore'],
      [-R - 12, -12, 'ancient_wood'],
      [12, R + 10, 'golden_wheat'],
      [-12, R + 12, 'moon_herb']
    ].forEach(([ox, oz, type]) => {
      spawnFarmingNodeAt(town.x + ox, town.z + oz, type);
    });
  });
}
// ============================================================================
// 5. ข้อมูลตัวละครผู้เล่น (ตั้งค่าเริ่มต้นให้ตรงกับภาพอนิเมะอ้างอิง: โครงหน้า V-Shape, ตาสีอำพันทอง, ผมดำน้ำตาลเข้มปอยหวาน, ชุดกะลาสีโบว์แดงกระโปรงสก๊อต)
// ============================================================================
let currentUsername = "guest_hero";
let currentConfig = {
  name: "AethelHero",
  rpTitle: "นักผจญภัยพเนจร",
  classId: "swordsman",
  weaponId: "sword_iron",
  gender: "female",
  bodyType: "female_grace",
  shoulderWidth: 0.21,
  waistWidth: 0.14,
  hipWidth: 0.23,
  bustSize: 0.065,
  bustCurve: 1.05,
  buttCurve: 0.08,
  torsoLength: 0.68,
  armLength: 1.0,
  armThickness: 0.84,
  legLength: 1.02,
  thighThickness: 1.04,
  heightScale: 1.0,
  skinColor: "#ffe9dc",
  headStyle: "normal",
  headSize: 1.0,
  jawTaper: 0.65,
  eyeStyle: "normal",
  eyeSize: 1.05,
  eyeColor: "#f59e0b",
  eyeColorRight: "#f59e0b",
  expression: "smile",
  bangsStyle: "hime_frame",
  bangsLength: 1.06,
  bangsCurve: 1.04,
  hairStyle: "long_flowing",
  hairLength: 1.28,
  hairCurve: 1.06,
  hairColor: "#1c1917",
  hatStyle: "none",
  fullOutfit: "sailor_school",
  topStyle: "sailor_blouse",
  bottomStyle: "battle_skirt",
  primaryColor: "#f8fafc",
  secondaryColor: "#991b1b",
  hasCape: true,
  capeLength: 1.05,
  capeColor: "#dc2626",
  accessory: "none",
  weaponLength: 1.0
};
let playerStats = {
  level: 1, exp: 0, maxExp: 100,
  hp: 170, maxHp: 170, mp: 65, maxMp: 65,
  stamina: 100, maxStamina: 100,
  atk: 40, matk: 12, def: 16, spd: 12,
  foodBuffAtk: 0, foodBuffHp: 0,
  gold: 300, hpPots: 5, mpPots: 3,
  ownedWeapons: ['sword_iron', 'staff_oak', 'bow_hunter', 'shield_knight', 'tome_holy'],
  inventory: {
    mithril_ore: 2,
    moon_herb: 2,
    ancient_wood: 1,
    golden_wheat: 3,
    monster_core: 1
  },
  roomKeys: [],
  roomStorage: {
    gold: 100,
    mithril_ore: 1,
    moon_herb: 1,
    ancient_wood: 0,
    golden_wheat: 2,
    monster_core: 0
  },
  wellRestedBonus: 0,
  questKills: 0, questTarget: 3, questStep: 1
};
const playerPhysics = {
  vx: 0, vy: 0, vz: 0,
  isGrounded: true,
  isInWater: false,
  jumpCount: 0,
  dashCooldown: 0,
  prevRotY: 0,
  targetRotY: 0
};
let playerChar3D = new ArticulatedCharacter3D(currentConfig);
scene.add(playerChar3D.root);
let mySpeechBubbleText = "";
let mySpeechTimer = 0;
const myNametagObj = registerFloatingLabel(playerChar3D.root, "", 2.45);
function updateMyNametagHTML() {
  if (gameState !== 'world' || cameraMode === 'fps') {
    myNametagObj.el.style.display = 'none';
    return;
  }
  myNametagObj.el.style.display = 'block';
  const bubbleHTML = mySpeechBubbleText
    ? `<div class="rp-speech-bubble">${mySpeechBubbleText}</div>`
    : '';
  myNametagObj.el.innerHTML = `
    ${bubbleHTML}
    <div class="text-[10px] text-emerald-300 font-semibold drop-shadow">《 ${currentConfig.rpTitle || 'นักผจญภัย'} 》</div>
    <div class="text-xs font-extrabold text-white drop-shadow">Lv.${playerStats.level} ${currentConfig.name}</div>
  `;
}
// ============================================================================
// 6. 4 CAMERA MODES (2.5D ROBLOX ORBIT, POV 3 OVER-THE-SHOULDER, POV 1 TRUE HEAD EYE, BIRD'S EYE)
// ============================================================================
let cameraMode = '2.5d'; // '2.5d' | 'tps' | 'fps' | 'bird'
let cameraYawAngle = Math.PI / 4;
let cameraPitchAngle = 0.42;
let cameraDist = 17;
let isRightMouseDragging = false;
const cameraModesList = [
  { id: '2.5d', label: '2.5D (คลิกขวาหมุน)' },
  { id: 'tps',  label: 'บุคคลที่ 3 POV3 (ไหล่ขวาไม่บังจอ)' },
  { id: 'fps',  label: 'บุคคลที่ 1 POV1 (ระดับสายตาหัวตัวละคร)' },
  { id: 'bird', label: 'มุมตานก (Bird-Eye)' }
];
function setCameraMode(modeId) {
  cameraMode = modeId;
  const found = cameraModesList.find(m => m.id === modeId) || cameraModesList[0];
  document.getElementById('camera-mode-label').textContent = found.label;
  // ใช้ setFirstPersonVisibility ซ่อนหัว ลำตัวบน และผ้าคลุมในโหมด POV 1 เพื่อไม่ให้บังกล้อง!
  playerChar3D.setFirstPersonVisibility(modeId === 'fps');
  updateMyNametagHTML();
  if (modeId === 'tps' || modeId === 'fps') {
    fpsCrosshair.classList.remove('hidden');
    if (modeId === 'tps') {
      cameraPitchAngle = THREE.MathUtils.clamp(cameraPitchAngle, -0.25, 0.65);
    } else {
      cameraPitchAngle = THREE.MathUtils.clamp(cameraPitchAngle, -0.55, 0.75);
    }
    if (gameState === 'world' && document.pointerLockElement !== renderer.domElement) {
      renderer.domElement.requestPointerLock?.();
    }
  } else {
    fpsCrosshair.classList.add('hidden');
    if (document.pointerLockElement === renderer.domElement) {
      document.exitPointerLock?.();
    }
  }
}
function cycleCameraMode() {
  const idx = cameraModesList.findIndex(m => m.id === cameraMode);
  const next = cameraModesList[(idx + 1) % cameraModesList.length];
  sound.sfxClick();
  setCameraMode(next.id);
}
document.getElementById('btn-camera-mode').onclick = cycleCameraMode;
// ============================================================================
// 7. CHARACTER CREATOR UI & DIRECT 3D SCULPTING
// ============================================================================
let creatorYaw = 0;
let creatorPitch = 0.06;
let creatorCamDist = 3.2;
let creatorPanY = 1.08;
let creatorPanX = 0.0;
let directSculptEnabled = true;
function setCreatorCameraPreset(mode) {
  if (mode === 'face') {
    creatorPanY = 1.60 * currentConfig.heightScale;
    creatorCamDist = 1.38;
    creatorPitch = 0.03;
  } else if (mode === 'chest') {
    creatorPanY = 1.15 * currentConfig.heightScale;
    creatorCamDist = 1.95;
    creatorPitch = 0.05;
  } else {
    creatorPanY = 1.05 * currentConfig.heightScale;
    creatorCamDist = 3.25;
    creatorPitch = 0.06;
  }
}
document.getElementById('btn-cam-body').onclick = () => { sound.sfxClick(); setCreatorCameraPreset('body'); };
document.getElementById('btn-cam-chest').onclick = () => { sound.sfxClick(); setCreatorCameraPreset('chest'); };
document.getElementById('btn-cam-face').onclick = () => { sound.sfxClick(); setCreatorCameraPreset('face'); };
const sculptToggleBtn = document.getElementById('btn-sculpt-toggle');
sculptToggleBtn.onclick = () => {
  directSculptEnabled = !directSculptEnabled;
  sound.sfxClick();
  sculptToggleBtn.textContent = directSculptEnabled
    ? "✋ โหมดคลิกลากดัดสัดส่วนบนตัวละคร: เปิด"
    : "🔄 โหมดลากเมาส์หมุนดูตัวละครอย่างเดียว (ปิดการดัด)";
  sculptToggleBtn.className = directSculptEnabled
    ? "px-3 py-1.5 rounded-xl bg-amber-500 text-slate-950 font-extrabold text-xs shadow"
    : "px-3 py-1.5 rounded-xl bg-slate-800 text-sky-300 border border-sky-400/50 font-bold text-xs";
};
function applyGenderPreset(gender) {
  currentConfig.gender = gender;
  const btnF = document.getElementById('btn-gender-female');
  const btnM = document.getElementById('btn-gender-male');
  if (gender === 'female') {
    currentConfig.bodyType = 'female_grace';
    currentConfig.shoulderWidth = 0.21;
    currentConfig.waistWidth = 0.14;
    currentConfig.hipWidth = 0.23;
    currentConfig.bustSize = 0.10;
    currentConfig.bustCurve = 1.05;
    currentConfig.buttCurve = 0.08;
    currentConfig.armThickness = 0.84;
    currentConfig.thighThickness = 1.04;
    currentConfig.jawTaper = 0.65;
    currentConfig.eyeSize = 1.05;
    currentConfig.eyeColor = '#f59e0b';
    currentConfig.eyeColorRight = '#f59e0b';
    currentConfig.hairColor = '#1c1917';
    currentConfig.bangsStyle = 'hime_frame';
    currentConfig.hairStyle = 'long_flowing';
    currentConfig.fullOutfit = 'sailor_school';
    currentConfig.topStyle = 'sailor_blouse';
    currentConfig.bottomStyle = 'battle_skirt';
    btnF.className = "py-2 rounded-xl text-xs font-bold border transition bg-pink-500/30 border-pink-400 text-pink-200 shadow";
    btnM.className = "py-2 rounded-xl text-xs font-bold border transition bg-slate-900 border-slate-700 text-slate-300";
  } else {
    currentConfig.bodyType = 'male_hero';
    currentConfig.shoulderWidth = 0.31;
    currentConfig.waistWidth = 0.21;
    currentConfig.hipWidth = 0.20;
    currentConfig.bustSize = 0.01;
    currentConfig.bustCurve = 1.0;
    currentConfig.buttCurve = 0.03;
    currentConfig.armThickness = 1.06;
    currentConfig.thighThickness = 1.02;
    currentConfig.jawTaper = 0.84;
    currentConfig.eyeSize = 0.92;
    currentConfig.eyeStyle = 'fierce';
    currentConfig.bangsStyle = 'male_parted';
    currentConfig.hairStyle = 'short_layered';
    currentConfig.hairLength = 0.85;
    currentConfig.fullOutfit = 'none';
    currentConfig.topStyle = 'noble_coat';
    currentConfig.bottomStyle = 'pants';
    btnM.className = "py-2 rounded-xl text-xs font-bold border transition bg-sky-500/30 border-sky-400 text-sky-200 shadow";
    btnF.className = "py-2 rounded-xl text-xs font-bold border transition bg-slate-900 border-slate-700 text-slate-300";
  }
  rebuildPreviewCharacter();
  renderCreatorTabContent();
}
document.getElementById('btn-gender-female').onclick = () => { sound.sfxClick(); applyGenderPreset('female'); };
document.getElementById('btn-gender-male').onclick = () => { sound.sfxClick(); applyGenderPreset('male'); };
function rebuildPreviewCharacter() {
  const pos = playerChar3D.root.position.clone();
  const rotY = playerChar3D.root.rotation.y;
  playerChar3D.config = JSON.parse(JSON.stringify(currentConfig));
  playerChar3D.buildModel();
  playerChar3D.root.position.copy(pos);
  playerChar3D.root.rotation.y = rotY;
  playerChar3D.setFirstPersonVisibility(gameState === 'world' && cameraMode === 'fps');
  updateMyNametagHTML();
}
function renderClassAndWeaponSelector() {
  const classListEl = document.getElementById('class-list');
  classListEl.innerHTML = '';
  Object.values(CLASSES).forEach(cls => {
    const active = currentConfig.classId === cls.id;
    const btn = document.createElement('button');
    btn.className = `px-2 py-1.5 rounded-xl text-[11px] text-left border transition ${
      active ? 'bg-amber-500 text-slate-950 font-bold border-amber-300' : 'bg-slate-900/90 hover:bg-slate-800 text-slate-200 border-slate-700'
    }`;
    btn.textContent = cls.name.split(' ')[0];
    btn.onclick = () => {
      sound.sfxClick();
      currentConfig.classId = cls.id;
      if (cls.allowedWeapon !== 'any') currentConfig.weaponId = cls.defaultWeapon;
      rebuildPreviewCharacter();
      renderClassAndWeaponSelector();
    };
    classListEl.appendChild(btn);
  });
  const curCls = CLASSES[currentConfig.classId];
  document.getElementById('class-title').textContent = curCls.name;
  document.getElementById('class-weapon-rule').textContent =
    curCls.allowedWeapon === 'any' ? 'อาวุธ: ทุกชนิด!' : `อาวุธ: ${curCls.allowedWeapon.toUpperCase()}`;
  document.getElementById('class-desc').textContent = curCls.desc;
  document.getElementById('class-stats-preview').innerHTML = `
    <div>❤️ HP: <b>${curCls.stats.hp}</b></div>
    <div>💧 MP: <b>${curCls.stats.mp}</b></div>
    <div>⚔️ ATK: <b>${curCls.stats.atk}</b></div>
    <div>🔮 MATK: <b>${curCls.stats.matk}</b></div>
    <div>🛡️ DEF: <b>${curCls.stats.def}</b></div>
    <div>⚡ SPD: <b>${curCls.stats.spd}</b></div>
  `;
  const wListEl = document.getElementById('weapon-select-list');
  wListEl.innerHTML = '';
  ['sword_iron', 'staff_oak', 'bow_hunter', 'shield_knight', 'tome_holy'].forEach(wid => {
    const w = WEAPONS[wid];
    const canUse = curCls.allowedWeapon === 'any' || curCls.allowedWeapon === w.type;
    const selected = currentConfig.weaponId === wid;
    const btn = document.createElement('button');
    btn.disabled = !canUse;
    btn.className = `px-2 py-1 rounded-lg text-[10px] border text-left truncate transition ${
      selected ? 'bg-emerald-500 text-slate-950 font-bold border-emerald-300' :
      canUse ? 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700' :
      'bg-slate-950/50 text-slate-600 border-slate-800 cursor-not-allowed'
    }`;
    btn.textContent = w.name;
    btn.onclick = () => {
      if (!canUse) return;
      sound.sfxClick();
      currentConfig.weaponId = wid;
      rebuildPreviewCharacter();
      renderClassAndWeaponSelector();
    };
    wListEl.appendChild(btn);
  });
  document.getElementById('weapon-hint').textContent = curCls.allowedWeapon === 'any'
    ? '🌟 อาชีพ "ไร้อาชีพ" สามารถเลือกถืออาวุธได้ทุกชนิด!'
    : '🔒 อาชีพนี้สวมใส่ได้เฉพาะอาวุธประจำคลาส';
}
function makeSliderRow(id, label, val, min, max, step, unit = '') {
  return `
    <div>
      <div class="flex justify-between text-[11px] mb-0.5">
        <span class="text-slate-300">${label}</span>
        <b id="val-${id}" class="text-amber-300 font-mono">${Number(val).toFixed(2)}${unit}</b>
      </div>
      <input id="sl-${id}" type="range" min="${min}" max="${max}" step="${step}" value="${val}" class="w-full h-1.5 accent-amber-400 cursor-pointer" />
    </div>
  `;
}
function bindSlider(box, id, configKey, unit = '') {
  const sl = box.querySelector(`#sl-${id}`);
  const vl = box.querySelector(`#val-${id}`);
  if (!sl) return;
  sl.oninput = (e) => {
    const v = parseFloat(e.target.value);
    currentConfig[configKey] = v;
    if (vl) vl.textContent = v.toFixed(2) + unit;
    rebuildPreviewCharacter();
  };
}
let activeCreatorTab = 'body';
function renderCreatorTabContent() {
  const box = document.getElementById('creator-tab-content');
  const c = currentConfig;
  if (activeCreatorTab === 'body') {
    box.innerHTML = `
      <div class="p-2 rounded-xl bg-amber-500/10 border border-amber-400/30 text-[11px] text-amber-200">
        ✨ <b>เคล็ดลับ:</b> ชี้เมาส์ที่ <b>หน้าอก, เอว, สะโพก, แขน, ขา</b> บนตัวโมเดล 3D แล้วคลิกซ้ายลากดัดสัดส่วนได้โดยตรง!
      </div>
      <div>
        <label class="block text-slate-300 mb-1">สีผิวตัวละคร (Warm Anime Skin Shader)</label>
        <div class="flex items-center gap-2">
          ${['#ffe9dc', '#fff1e6', '#ffe4d6', '#fcd5b5', '#eab676', '#c68642'].map(col => `
            <button data-skin="${col}" class="skin-btn w-7 h-7 rounded-full border-2 ${c.skinColor === col ? 'border-amber-400 scale-110' : 'border-slate-600'}" style="background:${col}"></button>
          `).join('')}
          <input type="color" id="custom-skin-picker" value="${c.skinColor}" class="w-7 h-7 rounded bg-transparent cursor-pointer" />
        </div>
      </div>
      <div class="space-y-2 pt-1 border-t border-slate-700/70">
        ${makeSliderRow('shoulder', 'ความกว้างไหล่ (Shoulder Width)', c.shoulderWidth, 0.16, 0.38, 0.01)}
        ${makeSliderRow('bust', 'ขนาดหน้าอก/แผงอก (Bust / Chest Size)', c.bustSize, 0.00, 0.22, 0.01)}
        ${makeSliderRow('bustcurve', 'ทรงโค้ง/ความเชิดหน้าอก (Bust Curve)', c.bustCurve, 0.65, 1.40, 0.02)}
        ${makeSliderRow('waist', 'ความคอดเอว (Waist Width)', c.waistWidth, 0.11, 0.28, 0.01)}
        ${makeSliderRow('hip', 'ความผายสะโพก (Hip Width)', c.hipWidth, 0.16, 0.34, 0.01)}
        ${makeSliderRow('butt', 'ความกลมกลึงสะโพกหลัง (Glutes Curve)', c.buttCurve, 0.01, 0.18, 0.01)}
        ${makeSliderRow('torsolen', 'ความยาวลำตัว (Torso Length)', c.torsoLength, 0.54, 0.84, 0.01)}
        ${makeSliderRow('armlen', 'ความยาวแขน (Arm Length)', c.armLength, 0.75, 1.28, 0.02)}
        ${makeSliderRow('armthick', 'ความเรียว/กล้ามแขน (Arm Thickness)', c.armThickness, 0.65, 1.35, 0.02)}
        ${makeSliderRow('leglen', 'ความยาวเรียวขา (Leg Length)', c.legLength, 0.78, 1.30, 0.02)}
        ${makeSliderRow('thigh', 'ความอวบ/เรียวต้นขา (Thigh Curve)', c.thighThickness, 0.72, 1.35, 0.02)}
        ${makeSliderRow('height', 'ส่วนสูงรวม (Total Scale)', c.heightScale, 0.82, 1.22, 0.01)}
      </div>
    `;
    box.querySelectorAll('.skin-btn').forEach(b => b.onclick = () => { c.skinColor = b.dataset.skin; rebuildPreviewCharacter(); renderCreatorTabContent(); });
    box.querySelector('#custom-skin-picker').oninput = (e) => { c.skinColor = e.target.value; rebuildPreviewCharacter(); };
    bindSlider(box, 'shoulder', 'shoulderWidth');
    bindSlider(box, 'bust', 'bustSize');
    bindSlider(box, 'bustcurve', 'bustCurve');
    bindSlider(box, 'waist', 'waistWidth');
    bindSlider(box, 'hip', 'hipWidth');
    bindSlider(box, 'butt', 'buttCurve');
    bindSlider(box, 'torsolen', 'torsoLength');
    bindSlider(box, 'armlen', 'armLength');
    bindSlider(box, 'armthick', 'armThickness');
    bindSlider(box, 'leglen', 'legLength');
    bindSlider(box, 'thigh', 'thighThickness');
    bindSlider(box, 'height', 'heightScale');
  } else if (activeCreatorTab === 'face') {
    box.innerHTML = `
      <div>
        <label class="block text-slate-300 mb-1">รูปทรงใบหู & โครงหน้าอนิเมะ</label>
        <div class="grid grid-cols-3 gap-1.5">
          ${[['normal', 'หูมนุษย์ V-Shape'], ['sharp', 'หูเอลฟ์เรียว'], ['chibi', 'แก้มมนละมุน']].map(([v, l]) => `
            <button data-head="${v}" class="head-btn py-1.5 rounded-lg border ${c.headStyle === v ? 'bg-amber-500 text-slate-950 font-bold border-amber-300' : 'bg-slate-900 border-slate-700'}">${l}</button>
          `).join('')}
        </div>
      </div>
      <div class="space-y-2 pt-1 border-t border-slate-700/70">
        ${makeSliderRow('jawtaper', 'ความเรียวคาง V-Shape (Jaw Taper)', c.jawTaper, 0.52, 0.95, 0.01)}
        ${makeSliderRow('headsize', 'ขนาดศีรษะ (Head Scale)', c.headSize, 0.80, 1.25, 0.01)}
        ${makeSliderRow('eyesize', 'ขนาดดวงตาอนิเมะ (Anime Eye Size)', c.eyeSize, 0.78, 1.32, 0.02)}
      </div>
      <div>
        <label class="block text-slate-300 mb-1">สไตล์ขนตา & แววตาไล่เฉด</label>
        <div class="grid grid-cols-2 gap-1.5 mb-2">
          ${[['normal', 'ตากลมโตขนตาหนา (ตามภาพ)'], ['fierce', 'ตาเฉี่ยวคมนักรบ']].map(([v, l]) => `
            <button data-eye="${v}" class="eye-btn py-1.5 rounded-lg border ${c.eyeStyle === v ? 'bg-amber-500 text-slate-950 font-bold border-amber-300' : 'bg-slate-900 border-slate-700'}">${l}</button>
          `).join('')}
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <span class="text-[11px] text-slate-400">สีม่านตาซ้าย</span>
            <input type="color" id="eye-col-l" value="${c.eyeColor}" class="w-full h-8 rounded bg-slate-900 border border-slate-700 cursor-pointer" />
          </div>
          <div>
            <span class="text-[11px] text-slate-400">สีม่านตาขวา</span>
            <input type="color" id="eye-col-r" value="${c.eyeColorRight || c.eyeColor}" class="w-full h-8 rounded bg-slate-900 border border-slate-700 cursor-pointer" />
          </div>
        </div>
      </div>
      <div>
        <label class="block text-slate-300 mb-1">สีหน้าและรอยยิ้ม (Expression)</label>
        <div class="grid grid-cols-2 gap-1.5">
          ${[['smile', '😊 ยิ้มละมุน (ตามภาพ)'], ['cheerful', '😄 ร่าเริงสดใส'], ['determined', '😠 มุ่งมั่น'], ['cool', '😎 สุขุมเท่ๆ']].map(([v, l]) => `
            <button data-exp="${v}" class="exp-btn py-1.5 px-2 rounded-lg border text-left ${c.expression === v ? 'bg-amber-500 text-slate-950 font-bold border-amber-300' : 'bg-slate-900 border-slate-700'}">${l}</button>
          `).join('')}
        </div>
      </div>
    `;
    box.querySelectorAll('.head-btn').forEach(b => b.onclick = () => { c.headStyle = b.dataset.head; rebuildPreviewCharacter(); renderCreatorTabContent(); });
    box.querySelectorAll('.eye-btn').forEach(b => b.onclick = () => { c.eyeStyle = b.dataset.eye; rebuildPreviewCharacter(); renderCreatorTabContent(); });
    box.querySelector('#eye-col-l').oninput = (e) => { c.eyeColor = e.target.value; rebuildPreviewCharacter(); };
    box.querySelector('#eye-col-r').oninput = (e) => { c.eyeColorRight = e.target.value; rebuildPreviewCharacter(); };
    box.querySelectorAll('.exp-btn').forEach(b => b.onclick = () => { c.expression = b.dataset.exp; rebuildPreviewCharacter(); renderCreatorTabContent(); });
    bindSlider(box, 'jawtaper', 'jawTaper');
    bindSlider(box, 'headsize', 'headSize');
    bindSlider(box, 'eyesize', 'eyeSize');
  } else if (activeCreatorTab === 'hair') {
    box.innerHTML = `
      <div class="p-2 rounded-xl bg-emerald-500/10 border border-emerald-400/30 text-[11px] text-emerald-200">
        💡 <b>คลิกลากที่เส้นผมบนหัวตัวละคร</b> ขึ้น/ลง เพื่อดึงความยาวผม หรือลากซ้าย/ขวา เพื่อดัดความโค้งพองได้ทันที!
      </div>
      <div>
        <label class="block text-amber-300 font-semibold mb-1">1. ทรงผมหน้า / ปอยผมข้างแก้ม</label>
        <div class="grid grid-cols-2 gap-1.5 mb-2">
          ${[
            ['male_parted', '👦 แสกเท่ผู้ชาย (Male Parted)'],
            ['spiky_fringe', '👦 หน้าม้าซอยเท่ชาย (Spiky Fringe)'],
            ['hime_frame', '👧 ปอยหวานข้างแก้มหญิง'],
            ['parted', 'แสกกลางเปิดหน้า'],
            ['side_swept', 'ปัดข้างเฉียง'],
            ['forehead_open', 'เสยเปิดหน้าผาก']
          ].map(([v, l]) => `
            <button data-bangs="${v}" class="bangs-btn py-1.5 px-2 rounded-lg border text-left ${c.bangsStyle === v ? 'bg-amber-500 text-slate-950 font-bold border-amber-300' : 'bg-slate-900 border-slate-700'}">${l}</button>
          `).join('')}
        </div>
        ${makeSliderRow('bangslen', 'ความยาวปอยผมหน้า (Bangs Length)', c.bangsLength, 0.50, 1.80, 0.02)}
        ${makeSliderRow('bangscurve', 'ความโค้งรับกรอบหน้า (Bangs Curve)', c.bangsCurve, 0.60, 1.60, 0.02)}
      </div>
      <div class="pt-2 border-t border-slate-700/70">
        <label class="block text-emerald-300 font-semibold mb-1">2. ทรงผมด้านหลัง (Back Hair)</label>
        <div class="grid grid-cols-2 gap-1.5 mb-2">
          ${[
            ['short_layered', '👦 ผมซอยสั้นชาย (Short Layered)'],
            ['wolf_cut', '👦 ทรงวูล์ฟคัทชาย (Wolf Cut)'],
            ['undercut_fade', '👦 อันเดอร์คัทเปิดข้าง (Undercut)'],
            ['samurai_bun', '👦 มัดจุกซามูไรชาย (Samurai Bun)'],
            ['spiky', '👦 ผมซอยตั้งอนิเมะ (Spiky)'],
            ['long_flowing', '👧 ผมยาวสลวยพลิ้ว'],
            ['twintails', '👧 มัดทวินเทลคู่'],
            ['ponytail', '👧 มัดหางม้าสูง']
          ].map(([v, l]) => `
            <button data-hair="${v}" class="hair-btn py-1.5 px-2 rounded-lg border text-left ${c.hairStyle === v ? 'bg-emerald-500 text-slate-950 font-bold border-emerald-300' : 'bg-slate-900 border-slate-700'}">${l}</button>
          `).join('')}
        </div>
        ${makeSliderRow('hairlen', 'ความยาวผมด้านหลัง (Back Hair Length)', c.hairLength, 0.50, 2.20, 0.02)}
        ${makeSliderRow('haircurve', 'ความพอง/ดัดโค้งปลายผม (Hair Curve)', c.hairCurve, 0.60, 1.80, 0.02)}
      </div>
      <div>
        <label class="block text-slate-300 mb-1">สีผม (Hair Color)</label>
        <input type="color" id="hair-color-picker" value="${c.hairColor}" class="w-full h-8 rounded bg-slate-900 border border-slate-700 cursor-pointer" />
      </div>
      <div>
        <label class="block text-slate-300 mb-1">หมวก & รัดเกล้า</label>
        <div class="grid grid-cols-2 gap-1.5">
          ${[
            ['none', '❌ ไม่สวมหมวก'],
            ['wizard_hat', '🧙 หมวกแม่มด'],
            ['royal_crown', '👑 มงกุฎทองคำ'],
            ['valkyrie_tiara', '⚜️ รัดเกล้าวัลคีรี']
          ].map(([v, l]) => `
            <button data-hat="${v}" class="hat-btn py-1.5 px-2 rounded-lg border text-left ${c.hatStyle === v ? 'bg-amber-500 text-slate-950 font-bold border-amber-300' : 'bg-slate-900 border-slate-700'}">${l}</button>
          `).join('')}
        </div>
      </div>
    `;
    box.querySelectorAll('.bangs-btn').forEach(b => b.onclick = () => { c.bangsStyle = b.dataset.bangs; rebuildPreviewCharacter(); renderCreatorTabContent(); });
    box.querySelectorAll('.hair-btn').forEach(b => b.onclick = () => { c.hairStyle = b.dataset.hair; rebuildPreviewCharacter(); renderCreatorTabContent(); });
    box.querySelector('#hair-color-picker').oninput = (e) => { c.hairColor = e.target.value; rebuildPreviewCharacter(); };
    box.querySelectorAll('.hat-btn').forEach(b => b.onclick = () => { c.hatStyle = b.dataset.hat; rebuildPreviewCharacter(); renderCreatorTabContent(); });
    bindSlider(box, 'bangslen', 'bangsLength');
    bindSlider(box, 'bangscurve', 'bangsCurve');
    bindSlider(box, 'hairlen', 'hairLength');
    bindSlider(box, 'haircurve', 'hairCurve');
  } else if (activeCreatorTab === 'outfit') {
    const isFull = c.fullOutfit !== 'none' && c.fullOutfit !== 'sailor_school';
    box.innerHTML = `
      <div class="p-2.5 rounded-xl bg-amber-500/10 border border-amber-400/40">
        <label class="block text-amber-300 font-bold mb-1">1. ชุดเซ็ตอนิเมะ & ชุดเกราะเต็มตัว (พลิ้วตามจังหวะเดิน)</label>
        <div class="grid grid-cols-2 gap-1.5">
          ${[
            ['sailor_school', '🎀 ชุดกะลาสีโบว์แดง (ตามภาพ)'],
            ['none', '🔓 แต่งชุดแยกชิ้น'],
            ['paladin_armor', '🛡️ เกราะอัศวินพาราดิน'],
            ['archmage_robe', '🔮 ชุดคลุมจอมเวท'],
            ['royal_dress', '👗 ชุดเดรสราชนิกูล']
          ].map(([v, l]) => `
            <button data-full="${v}" class="full-btn py-1.5 px-2 rounded-lg border text-left ${c.fullOutfit === v ? 'bg-amber-500 text-slate-950 font-bold border-amber-300' : 'bg-slate-900 border-slate-700'}">${l}</button>
          `).join('')}
        </div>
      </div>
      <div class="${isFull ? 'opacity-40 pointer-events-none' : ''}">
        <label class="block text-slate-300 mb-1">2. ชุดท่อนบน ${isFull ? '(ล็อกเพราะสวมชุดเต็มตัว)' : ''}</label>
        <div class="grid grid-cols-2 gap-1.5">
          ${[
            ['noble_coat', '👦 เสื้อโค้ทขุนนาง/อัศวินชาย'],
            ['knight_vest', '🛡️ เสื้อเกราะอัศวิน'],
            ['hunter_jacket', '🏹 แจ็คเก็ตนักล่า'],
            ['sailor_blouse', '🎀 เสื้อกะลาสีโบว์แดง'],
            ['casual_crop', '✨ เสื้อครอปนักผจญภัย']
          ].map(([v, l]) => `
            <button data-top="${v}" class="top-btn py-1.5 px-2 rounded-lg border text-left ${c.topStyle === v ? 'bg-emerald-500 text-slate-950 font-bold border-emerald-300' : 'bg-slate-900 border-slate-700'}">${l}</button>
          `).join('')}
        </div>
      </div>
      <div class="${isFull ? 'opacity-40 pointer-events-none' : ''}">
        <label class="block text-slate-300 mb-1">3. ชุดท่อนล่าง ${isFull ? '(ล็อกเพราะสวมชุดเต็มตัว)' : ''}</label>
        <div class="grid grid-cols-3 gap-1.5">
          ${[['battle_skirt', 'กระโปรงพลีทพลิ้ว'], ['pants', 'กางเกงขายาว'], ['shorts', 'กางเกงขาสั้น']].map(([v, l]) => `
            <button data-bot="${v}" class="bot-btn py-1.5 rounded-lg border ${c.bottomStyle === v ? 'bg-emerald-500 text-slate-950 font-bold border-emerald-300' : 'bg-slate-900 border-slate-700'}">${l}</button>
          `).join('')}
        </div>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="block text-slate-300 mb-1">สีชุดหลัก</label>
          <input type="color" id="primary-col" value="${c.primaryColor}" class="w-full h-8 rounded cursor-pointer" />
        </div>
        <div>
          <label class="block text-slate-300 mb-1">สีกระโปรง/กางเกง</label>
          <input type="color" id="secondary-col" value="${c.secondaryColor}" class="w-full h-8 rounded cursor-pointer" />
        </div>
      </div>
    `;
    box.querySelectorAll('.full-btn').forEach(b => b.onclick = () => {
      c.fullOutfit = b.dataset.full;
      if (c.fullOutfit === 'sailor_school') {
        c.topStyle = 'sailor_blouse';
        c.bottomStyle = 'battle_skirt';
      }
      rebuildPreviewCharacter();
      renderCreatorTabContent();
    });
    box.querySelectorAll('.top-btn').forEach(b => b.onclick = () => {
      c.topStyle = b.dataset.top;
      if (c.topStyle !== 'sailor_blouse' && c.fullOutfit === 'sailor_school') c.fullOutfit = 'none';
      rebuildPreviewCharacter();
      renderCreatorTabContent();
    });
    box.querySelectorAll('.bot-btn').forEach(b => b.onclick = () => { c.bottomStyle = b.dataset.bot; rebuildPreviewCharacter(); renderCreatorTabContent(); });
    box.querySelector('#primary-col').oninput = (e) => { c.primaryColor = e.target.value; rebuildPreviewCharacter(); };
    box.querySelector('#secondary-col').oninput = (e) => { c.secondaryColor = e.target.value; rebuildPreviewCharacter(); };
  } else if (activeCreatorTab === 'extra') {
    box.innerHTML = `
      <div>
        <label class="block text-slate-300 mb-1">ผ้าคลุมไหล่ฟิสิกส์คลื่นลม (สวมหรือไม่ก็ได้)</label>
        <div class="grid grid-cols-2 gap-1.5 mb-2">
          <button id="cape-on" class="py-1.5 rounded-xl border ${c.hasCape ? 'bg-amber-500 text-slate-950 font-bold border-amber-300' : 'bg-slate-900 border-slate-700'}">🦸 สวมผ้าคลุมพลิ้ว</button>
          <button id="cape-off" class="py-1.5 rounded-xl border ${!c.hasCape ? 'bg-amber-500 text-slate-950 font-bold border-amber-300' : 'bg-slate-900 border-slate-700'}">❌ ถอดผ้าคลุม</button>
        </div>
        ${makeSliderRow('capelen', 'ความยาวผ้าคลุม (Cape Length)', c.capeLength, 0.50, 1.80, 0.02)}
        <label class="block text-slate-300 mt-2 mb-1">สีผ้าคลุม</label>
        <input type="color" id="cape-col" value="${c.capeColor}" class="w-full h-8 rounded cursor-pointer" />
      </div>
      <div class="pt-2 border-t border-slate-700/70">
        <label class="block text-slate-300 mb-1">ปีก & เครื่องประดับ</label>
        <div class="grid grid-cols-3 gap-1.5 mb-2">
          ${[['none', 'ไม่ใส่'], ['angel_wings', '🪽 ปีกสวรรค์'], ['halo', '😇 วงแหวนเทพ']].map(([v, l]) => `
            <button data-acc="${v}" class="acc-btn py-1.5 rounded-xl border ${c.accessory === v ? 'bg-amber-500 text-slate-950 font-bold border-amber-300' : 'bg-slate-900 border-slate-700'}">${l}</button>
          `).join('')}
        </div>
        ${makeSliderRow('weplen', 'ขนาด/ความยาวอาวุธ (Weapon Scale)', c.weaponLength, 0.70, 1.60, 0.02)}
      </div>
    `;
    box.querySelector('#cape-on').onclick = () => { c.hasCape = true; rebuildPreviewCharacter(); renderCreatorTabContent(); };
    box.querySelector('#cape-off').onclick = () => { c.hasCape = false; rebuildPreviewCharacter(); renderCreatorTabContent(); };
    box.querySelector('#cape-col').oninput = (e) => { c.capeColor = e.target.value; rebuildPreviewCharacter(); };
    box.querySelectorAll('.acc-btn').forEach(b => b.onclick = () => { c.accessory = b.dataset.acc; rebuildPreviewCharacter(); renderCreatorTabContent(); });
    bindSlider(box, 'capelen', 'capeLength');
    bindSlider(box, 'weplen', 'weaponLength');
  }
}
function switchCreatorTab(tabName) {
  activeCreatorTab = tabName;
  document.querySelectorAll('#creator-tabs .part-chip').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  renderCreatorTabContent();
}
document.querySelectorAll('#creator-tabs .part-chip').forEach(btn => {
  btn.addEventListener('click', () => { sound.sfxClick(); switchCreatorTab(btn.dataset.tab); });
});
document.getElementById('btn-random-char').onclick = () => {
  sound.sfxMagic();
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  applyGenderPreset(pick(['female', 'male']));
  currentConfig.bangsStyle = pick(['hime_frame', 'parted', 'side_swept', 'forehead_open']);
  currentConfig.hairStyle = pick(['long_flowing', 'twintails', 'ponytail', 'spiky']);
  currentConfig.hairLength = 0.90 + Math.random() * 0.95;
  currentConfig.hairCurve = 0.90 + Math.random() * 0.55;
  currentConfig.hairColor = pick(['#1c1917', '#451a03', '#dc2626', '#d97706', '#38bdf8', '#a855f7']);
  currentConfig.eyeColor = pick(['#f59e0b', '#2563eb', '#10b981', '#ef4444']);
  currentConfig.eyeColorRight = currentConfig.eyeColor;
  currentConfig.fullOutfit = pick(['sailor_school', 'none', 'paladin_armor', 'royal_dress']);
  currentConfig.primaryColor = pick(['#f8fafc', '#2563eb', '#dc2626', '#059669', '#7c3aed']);
  rebuildPreviewCharacter();
  renderCreatorTabContent();
};
let previewComboStep = 1;
document.querySelectorAll('.anim-preview-btn').forEach(btn => {
  btn.onclick = () => {
    sound.sfxClick();
    const anim = btn.dataset.anim;
    if (anim === 'attack') {
      playerChar3D.triggerWeaponCombo(previewComboStep);
      sound.sfxCombo(previewComboStep, WEAPONS[currentConfig.weaponId]?.type);
      previewComboStep = (previewComboStep % 3) + 1;
    } else {
      playerChar3D.animState = anim;
    }
  };
});
// ============================================================================
// 8. MOUSE INTERACTION: SCULPTING + ROBLOX RIGHT-CLICK ORBIT + POINTER LOCK
// ============================================================================
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let creatorDragMode = null;
let activeMorphTarget = null;
let dragStartMouse = { x: 0, y: 0 };
let lastRebuildTime = 0;
function applyDirectMorphDelta(morphTarget, dx, dy) {
  const c = currentConfig;
  const clamp = THREE.MathUtils.clamp;
  let statusText = "";
  if (morphTarget === 'bust_chest') {
    c.bustSize = clamp((c.bustSize || 0.1) + dx * 0.0008, 0.0, 0.22);
    c.bustCurve = clamp((c.bustCurve || 1.0) - dy * 0.0025, 0.65, 1.40);
    statusText = `ดัดหน้าอก: ขนาด ${(c.bustSize * 100).toFixed(0)}% | ทรงโค้ง ${c.bustCurve.toFixed(2)}`;
  } else if (morphTarget === 'waist_hip') {
    c.waistWidth = clamp((c.waistWidth || 0.15) + dx * 0.0007, 0.11, 0.28);
    c.torsoLength = clamp((c.torsoLength || 0.68) - dy * 0.0012, 0.54, 0.84);
    statusText = `ดัดเอว/ลำตัว: เอว ${c.waistWidth.toFixed(2)} | ยาว ${c.torsoLength.toFixed(2)}`;
  } else if (morphTarget === 'hips_butt') {
    c.hipWidth = clamp((c.hipWidth || 0.23) + dx * 0.0008, 0.16, 0.34);
    c.buttCurve = clamp((c.buttCurve || 0.08) - dy * 0.0008, 0.01, 0.18);
    statusText = `ดัดสะโพก: ความผาย ${c.hipWidth.toFixed(2)} | ความมน ${c.buttCurve.toFixed(2)}`;
  } else if (morphTarget === 'head_face') {
    c.jawTaper = clamp((c.jawTaper || 0.65) + dx * 0.0012, 0.52, 0.95);
    c.headSize = clamp((c.headSize || 1.0) - dy * 0.0015, 0.80, 1.25);
    statusText = `ดัดใบหน้า: คางเรียว ${c.jawTaper.toFixed(2)} | ขนาดหัว ${c.headSize.toFixed(2)}`;
  } else if (morphTarget === 'hair_bangs') {
    c.bangsLength = clamp((c.bangsLength || 1.0) + dy * 0.0035, 0.50, 1.80);
    c.bangsCurve = clamp((c.bangsCurve || 1.0) + dx * 0.003, 0.60, 1.60);
    statusText = `ดัดปอยผมหน้า: ความยาว ${c.bangsLength.toFixed(2)} | ความโค้ง ${c.bangsCurve.toFixed(2)}`;
  } else if (morphTarget === 'hair_back') {
    c.hairLength = clamp((c.hairLength || 1.2) + dy * 0.0045, 0.50, 2.20);
    c.hairCurve = clamp((c.hairCurve || 1.0) + dx * 0.0035, 0.60, 1.80);
    statusText = `ดัดผมด้านหลัง: ความยาว ${c.hairLength.toFixed(2)} | ความพองโค้ง ${c.hairCurve.toFixed(2)}`;
  } else if (morphTarget === 'arms_morph') {
    c.armLength = clamp((c.armLength || 1.0) + dy * 0.0025, 0.75, 1.28);
    c.armThickness = clamp((c.armThickness || 0.9) + dx * 0.0025, 0.65, 1.35);
    statusText = `ดัดแขน: ความยาว ${c.armLength.toFixed(2)} | ความเรียว ${c.armThickness.toFixed(2)}`;
  } else if (morphTarget === 'legs_morph') {
    c.legLength = clamp((c.legLength || 1.0) - dy * 0.0025, 0.78, 1.30);
    c.thighThickness = clamp((c.thighThickness || 1.05) + dx * 0.0025, 0.72, 1.35);
    statusText = `ดัดเรียวขา: ยาว ${c.legLength.toFixed(2)} | ความอวบต้นขา ${c.thighThickness.toFixed(2)}`;
  } else if (morphTarget === 'cape_morph') {
    c.capeLength = clamp((c.capeLength || 1.0) + dy * 0.0035, 0.50, 1.80);
    statusText = `ดึงความยาวผ้าคลุม: ${c.capeLength.toFixed(2)}`;
  }
  const now = performance.now();
  if (now - lastRebuildTime > 24) {
    lastRebuildTime = now;
    rebuildPreviewCharacter();
    renderCreatorTabContent();
  }
  return statusText;
}
renderer.domElement.addEventListener('mousedown', (e) => {
  dragStartMouse.x = e.clientX;
  dragStartMouse.y = e.clientY;
  if (gameState === 'creator') {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    if (e.shiftKey || e.button === 1) {
      creatorDragMode = 'pan';
      return;
    }
    if (e.button === 2) {
      creatorDragMode = 'orbit';
      return;
    }
    if (e.button === 0 && directSculptEnabled) {
      const hits = raycaster.intersectObjects(playerChar3D.clickableMeshes, true);
      if (hits.length > 0) {
        const hitObj = hits[0].object;
        activeMorphTarget = hitObj.userData.morphTarget;
        creatorDragMode = 'sculpt';
        sound.sfxClick();
        if (hitObj.userData.partCategory) switchCreatorTab(hitObj.userData.partCategory);
        document.getElementById('clicked-part-badge').textContent = `✋ กำลังดัด: ${hitObj.userData.morphTarget}`;
        return;
      }
    }
    creatorDragMode = 'orbit';
    return;
  }
  if (gameState === 'world') {
    if (isAnyModalOpen()) return; // ถ้าหน้าต่างร้านค้า/โรงเตี๋ยมเปิดอยู่ ให้ใช้เมาส์คลิกได้อย่างอิสระ
    if (e.button === 2) {
      isRightMouseDragging = true;
    } else if (e.button === 0 && (cameraMode === 'tps' || cameraMode === 'fps')) {
      if (document.pointerLockElement !== renderer.domElement) {
        renderer.domElement.requestPointerLock?.();
      } else {
        queueOrPerformComboAttack();
      }
    }
  }
});
window.addEventListener('mousemove', (e) => {
  if (gameState === 'creator') {
    const dx = e.clientX - dragStartMouse.x;
    const dy = e.clientY - dragStartMouse.y;
    dragStartMouse.x = e.clientX;
    dragStartMouse.y = e.clientY;
    if (creatorDragMode === 'sculpt' && activeMorphTarget) {
      const info = applyDirectMorphDelta(activeMorphTarget, dx, dy);
      sculptTooltip.classList.remove('hidden');
      sculptTooltip.style.left = `${e.clientX + 16}px`;
      sculptTooltip.style.top = `${e.clientY - 12}px`;
      sculptTooltip.innerHTML = `✨ <b>${info}</b>`;
      return;
    }
    if (creatorDragMode === 'orbit') {
      creatorYaw += dx * 0.014;
      creatorPitch = THREE.MathUtils.clamp(creatorPitch + dy * 0.006, -0.35, 0.55);
      return;
    }
    if (creatorDragMode === 'pan') {
      creatorPanX = THREE.MathUtils.clamp(creatorPanX - dx * 0.003, -0.8, 0.8);
      creatorPanY = THREE.MathUtils.clamp(creatorPanY + dy * 0.004, 0.25, 2.15);
      return;
    }
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(playerChar3D.clickableMeshes, true);
    if (hits.length > 0 && directSculptEnabled) {
      const labelTH = hits[0].object.userData.labelTH;
      renderer.domElement.style.cursor = 'grab';
      sculptTooltip.classList.remove('hidden');
      sculptTooltip.style.left = `${e.clientX + 16}px`;
      sculptTooltip.style.top = `${e.clientY - 10}px`;
      sculptTooltip.innerHTML = `✋ <b>${labelTH}</b>`;
    } else {
      renderer.domElement.style.cursor = 'default';
      sculptTooltip.classList.add('hidden');
    }
    return;
  }
  if (gameState === 'world') {
    if (cameraMode === 'tps' || cameraMode === 'fps') {
      if (document.pointerLockElement === renderer.domElement || isRightMouseDragging) {
        cameraYawAngle -= e.movementX * 0.0032;
        const minPitch = cameraMode === 'fps' ? -0.65 : -0.25;
        const maxPitch = cameraMode === 'fps' ? 0.78 : 0.70;
        cameraPitchAngle = THREE.MathUtils.clamp(cameraPitchAngle + e.movementY * 0.0028, minPitch, maxPitch);
        if (cameraMode === 'fps' || cameraMode === 'tps') {
          playerPhysics.targetRotY = cameraYawAngle + Math.PI;
        }
      }
    } else if (isRightMouseDragging) {
      const dx = e.clientX - dragStartMouse.x;
      const dy = e.clientY - dragStartMouse.y;
      dragStartMouse.x = e.clientX;
      dragStartMouse.y = e.clientY;
      cameraYawAngle -= dx * 0.0075;
      cameraPitchAngle = THREE.MathUtils.clamp(cameraPitchAngle + dy * 0.005, 0.18, 1.15);
    }
  }
});
window.addEventListener('mouseup', () => {
  creatorDragMode = null;
  activeMorphTarget = null;
  isRightMouseDragging = false;
});
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
// ============================================================================
// 9. AUTHENTICATION & DUAL-CHANNEL MULTIPLAYER SYNC (FIREBASE RTDB + BROADCASTCHANNEL + LOCALSTORAGE)
//    แก้ปัญหาผู้เล่นอยู่ห้องเดียวกัน (World Seed เดียวกัน) แต่มองไม่เห็นกัน 100%!
// ============================================================================
const authMsg = document.getElementById('auth-msg');
async function enterCreatorScreen(username, savedData) {
  currentUsername = sanitizeKey(username);
  myClientId = `${currentUsername}_${SESSION_SUFFIX}`;
  const seedVal = document.getElementById('auth-seed').value.trim() || "AETHELGARD-RP-01";
  worldNoise.setSeed(seedVal);
  await worldCache.setSeed(seedVal);

  if (savedData && savedData.config) {
    currentConfig = { ...currentConfig, ...savedData.config };
    if (savedData.stats) {
      playerStats = {
        ...playerStats,
        ...savedData.stats,
        inventory: { ...playerStats.inventory, ...(savedData.stats.inventory || {}) },
        roomKeys: Array.isArray(savedData.stats.roomKeys) ? savedData.stats.roomKeys : [],
        roomStorage: { ...playerStats.roomStorage, ...(savedData.stats.roomStorage || {}) },
        cooldowns: savedData.stats.cooldowns || { monsters: {}, nodes: {} },
        savedSpawn: savedData.stats.savedSpawn || null
      };
    }
  }

  sound.startBGM();

  // หากบัญชีนี้เคยสร้างตัวละครไว้แล้ว ให้ข้ามหน้าสร้างตัวละครและเข้าสู่โลกเกมทันที!
  if (savedData && (savedData.characterCreated || savedData.config)) {
    await startWorldSession();
    return;
  }

  document.getElementById('char-name-input').value = currentConfig.name || username;
  document.getElementById('char-title-input').value = currentConfig.rpTitle || "นักผจญภัยพเนจร";
  document.getElementById('screen-auth').classList.add('hidden');
  document.getElementById('screen-creator').classList.remove('hidden');
  rebuildPreviewCharacter();
  renderClassAndWeaponSelector();
  renderCreatorTabContent();
}


document.getElementById('btn-register').onclick = async () => {
  const u = sanitizeKey(document.getElementById('auth-user').value);
  const p = document.getElementById('auth-pass').value.trim();
  if (!u || !p) { authMsg.textContent = "⚠️ กรุณากรอก Username และ Password"; return; }
  const existing = await dbGet(`users/${u}`);
  if (existing) { authMsg.textContent = "❌ ชื่อผู้ใช้ (Username) นี้ถูกใช้งานแล้ว!"; return; }
  currentConfig.name = u;
  await dbSet(`users/${u}`, { password: p, config: currentConfig, stats: playerStats, updatedAt: Date.now() });
  sound.sfxLevelUp();
  enterCreatorScreen(u, null);
};
document.getElementById('btn-login').onclick = async () => {
  const u = sanitizeKey(document.getElementById('auth-user').value);
  const p = document.getElementById('auth-pass').value.trim();
  if (!u || !p) { authMsg.textContent = "⚠️ กรุณากรอก Username และ Password"; return; }
  const userDoc = await dbGet(`users/${u}`);
  if (!userDoc || userDoc.password !== p) {
    authMsg.textContent = "❌ Username หรือ Password ไม่ถูกต้อง!";
    return;
  }
  sound.sfxLevelUp();
  enterCreatorScreen(u, userDoc);
};
document.getElementById('btn-quickplay').onclick = () => {
  sound.sfxLevelUp();
  enterCreatorScreen("hero_" + Math.floor(Math.random() * 899 + 100), null);
};
const remotePlayers = new Map();
let activeWorldKey = null;
let localBroadcastChannel = null;
// อัปเดตหรือสร้างตัวละครผู้เล่นออนไลน์คนอื่นในห้องเดียวกัน
function upsertRemotePlayerState(clientId, pData) {
  if (!clientId || clientId === myClientId) return;
  if (!pData || !pData.config) return;
  // หากอยู่คนละแท็บแต่ใช้ Username เดียวกัน ให้แสดงชื่อพร้อมหมายเลขแท็บเพื่อไม่ให้สับสน
  const displayName = pData.config.name || pData.username || clientId;
  const px = Number.isFinite(Number(pData.x)) ? Number(pData.x) : 0;
  const py = Number.isFinite(Number(pData.y)) ? Number(pData.y) : worldNoise.getHeight(0, 12);
  const pz = Number.isFinite(Number(pData.z)) ? Number(pData.z) : 12;
  const protY = Number.isFinite(Number(pData.rotY)) ? Number(pData.rotY) : 0;
  let rp = remotePlayers.get(clientId);
  if (!rp) {
    const char3D = new ArticulatedCharacter3D(pData.config);
    char3D.root.position.set(px, py, pz);
    char3D.root.rotation.y = protY;
    worldGroup.add(char3D.root);
    const labelObj = registerFloatingLabel(char3D.root, "", 2.45);
    rp = {
      clientId,
      displayName,
      char3D,
      labelObj,
      targetPos: new THREE.Vector3(px, py, pz),
      targetRotY: protY,
      animState: pData.animState || 'idle',
      speedRatio: Number(pData.speedRatio) || 0,
      isJumping: !!pData.isJumping,
      configHash: JSON.stringify(pData.config),
      lastAttackPulse: pData.attackPulse || 0,
      lastChatSeq: pData.chatSeq || 0,
      chatBubbleExpiresAt: 0,
      chatBubbleText: "",
      lastLocalSeen: performance.now()
    };
    remotePlayers.set(clientId, rp);
    addLog(`🌐 ผู้เล่น <b>${displayName}</b> เข้าร่วมโลกเดียวกันแล้ว! (พิกัด ${Math.round(px)}, ${Math.round(pz)})`, "text-sky-300");
  } else {
    rp.lastLocalSeen = performance.now();
    rp.displayName = displayName;
    const newHash = JSON.stringify(pData.config);
    if (newHash !== rp.configHash) {
      rp.configHash = newHash;
      rp.char3D.config = JSON.parse(newHash);
      rp.char3D.buildModel();
    }
    rp.targetPos.set(px, py, pz);
    rp.targetRotY = protY;
    rp.animState = pData.animState || 'idle';
    rp.speedRatio = Number(pData.speedRatio) || 0;
    rp.isJumping = !!pData.isJumping;
    if (pData.attackPulse && pData.attackPulse !== rp.lastAttackPulse) {
      rp.lastAttackPulse = pData.attackPulse;
      rp.char3D.triggerWeaponCombo(pData.comboStep || 1);
    }
    if (pData.skillPulse && pData.skillPulse !== rp.lastSkillPulse) {
      rp.lastSkillPulse = pData.skillPulse;
      skillFX.spawnClassSkillFX(
        pData.config.classId || 'swordsman',
        !!pData.skillIsUlt,
        rp.char3D.root.position,
        null,
        rp.targetRotY
      );
    }
  }
  if (pData.chatBubble && pData.chatSeq && pData.chatSeq !== rp.lastChatSeq) {
    rp.lastChatSeq = pData.chatSeq;
    rp.chatBubbleText = pData.chatBubble;
    rp.chatBubbleExpiresAt = performance.now() + 7000;
  }
  const showBubble = rp.chatBubbleText && performance.now() < rp.chatBubbleExpiresAt;
  const bubble = showBubble ? `<div class="rp-speech-bubble">${rp.chatBubbleText}</div>` : '';
  rp.labelObj.el.innerHTML = `
    ${bubble}
    <div class="text-[10px] text-sky-300 font-semibold drop-shadow">《 ${pData.config.rpTitle || 'นักผจญภัย'} 》</div>
    <div class="text-xs font-bold text-amber-200 drop-shadow">🟢 Lv.${pData.level || 1} ${displayName}</div>
  `;
  updateOnlinePlayerCountUI();
}
function removeRemotePlayer(clientId) {
  const rp = remotePlayers.get(clientId);
  if (!rp) return;
  worldGroup.remove(rp.char3D.root);
  rp.labelObj.el.remove();
  remotePlayers.delete(clientId);
  updateOnlinePlayerCountUI();
}
function updateOnlinePlayerCountUI() {
  const countEl = document.getElementById('online-count');
  if (countEl) {
    countEl.textContent = String(1 + remotePlayers.size);
  }
}
function initMultiplayerSync() {
  const worldKey = sanitizeKey(worldNoise.seedStr);
  if (activeWorldKey === worldKey) return;
  activeWorldKey = worldKey;
  // ล้างผู้เล่นเก่าหากเปลี่ยนห้อง World Seed
  Array.from(remotePlayers.keys()).forEach(removeRemotePlayer);
  // 1. ระบบซิงค์ผ่าน BroadcastChannel + localStorage (เชื่อมระหว่างแท็บ/หน้าต่างในเครื่องเดียวกันแบบ 0ms แม้เน็ตหลุด!)
  if (localBroadcastChannel) {
    try { localBroadcastChannel.close(); } catch (_) {}
  }
  if (typeof BroadcastChannel !== 'undefined') {
    localBroadcastChannel = new BroadcastChannel(`aethel_mp_${worldKey}`);
    localBroadcastChannel.onmessage = (ev) => {
      const msg = ev.data;
      if (!msg || msg.clientId === myClientId) return;
      if (msg.type === 'player_state') {
        upsertRemotePlayerState(msg.clientId, msg.payload);
      } else if (msg.type === 'player_leave') {
        removeRemotePlayer(msg.clientId);
      } else if (msg.type === 'chat_msg') {
        appendChatEntryIfNew(msg.payload);
      }
    };
  }
  window.addEventListener('storage', (ev) => {
    if (!ev.key || !ev.newValue) return;
    if (ev.key === `aethel_mp_state_${worldKey}`) {
      try {
        const msg = JSON.parse(ev.newValue);
        if (msg && msg.clientId !== myClientId) {
          upsertRemotePlayerState(msg.clientId, msg.payload);
        }
      } catch (_) {}
    } else if (ev.key === `aethel_mp_chat_${worldKey}`) {
      try {
        const chatObj = JSON.parse(ev.newValue);
        if (chatObj) appendChatEntryIfNew(chatObj);
      } catch (_) {}
    }
  });
  window.addEventListener('beforeunload', () => {
    if (localBroadcastChannel) {
      try {
        localBroadcastChannel.postMessage({ type: 'player_leave', clientId: myClientId });
      } catch (_) {}
    }
  });
  // 2. ระบบซิงค์ผ่าน Firebase Realtime Database (เชื่อมผู้เล่นข้ามเครื่องทั่วโลกในห้อง World Seed เดียวกัน!)
  if (db) {
    const playersRef = ref(db, `worlds/${worldKey}/players`);
    const myPlayerRef = ref(db, `worlds/${worldKey}/players/${myClientId}`);
    try { onDisconnect(myPlayerRef).remove(); } catch (_) {}
    onValue(playersRef, (snap) => {
      const all = snap.val() || {};
      const nowMs = Date.now();
      Object.keys(all).forEach((cid) => {
        if (cid === myClientId) return;
        const pData = all[cid];
        if (!pData || !pData.config) return;
        // กรองข้อมูลค้างเก่าที่เกิน 45 วินาทีออก
        if (pData.updatedAt && Math.abs(nowMs - pData.updatedAt) > 45000) return;
        upsertRemotePlayerState(cid, pData);
      });
    });
    const chatRef = ref(db, `worlds/${worldKey}/chat`);
    onValue(chatRef, (snap) => {
      const data = snap.val();
      if (!data) return;
      const entries = Object.values(data).slice(-18);
      entries.forEach(appendChatEntryIfNew);
    });
  }
}
const seenChatIds = new Set();
function appendChatEntryIfNew(c) {
  if (!c || !c.text) return;
  const cid = c.id || `${c.sender}_${c.time}_${c.text}`;
  if (seenChatIds.has(cid)) return;
  seenChatIds.add(cid);
  const logEl = document.getElementById('game-log');
  const div = document.createElement('div');
  div.className = c.isRP ? "text-pink-300 italic" : "text-slate-200";
  div.innerHTML = c.isRP
    ? `🎭 <b>* ${c.sender}</b> ${c.text} *`
    : `<b class="text-amber-300">[${c.sender}]:</b> ${c.text}`;
  logEl.appendChild(div);
  logEl.scrollTop = logEl.scrollHeight;
}
let lastAttackPulse = 0;
let lastSkillPulse = 0;
let lastSkillIsUlt = false;
let myChatSeq = 0;
function broadcastMyStateToRTDB() {
  if (gameState !== 'world') return;
  const worldKey = sanitizeKey(worldNoise.seedStr);
  const pPos = playerChar3D.root.position;
  const horizSpd = Math.hypot(playerPhysics.vx, playerPhysics.vz);
  const payload = cleanForFirebase({
    clientId: myClientId,
    username: currentUsername,
    x: Number(pPos.x.toFixed(2)),
    y: Number(pPos.y.toFixed(2)),
    z: Number(pPos.z.toFixed(2)),
    rotY: Number(playerChar3D.root.rotation.y.toFixed(2)),
    animState: playerChar3D.animState,
    speedRatio: Number((horizSpd / Math.max(1, playerStats.spd * 0.82)).toFixed(2)),
    isJumping: !playerPhysics.isGrounded,
    comboStep: playerChar3D.comboStep,
    attackPulse: lastAttackPulse,
    skillPulse: lastSkillPulse,
    skillIsUlt: lastSkillIsUlt,
    level: playerStats.level,
    config: currentConfig,
    chatBubble: mySpeechBubbleText,
    chatSeq: myChatSeq,
    updatedAt: Date.now()
  });
  // ส่งผ่าน BroadcastChannel และ localStorage ทันที
  if (localBroadcastChannel) {
    try {
      localBroadcastChannel.postMessage({ type: 'player_state', clientId: myClientId, payload });
    } catch (_) {}
  }
  try {
    localStorage.setItem(`aethel_mp_state_${worldKey}`, JSON.stringify({ clientId: myClientId, payload, t: Date.now() }));
  } catch (_) {}
  // ส่งขึ้น Firebase Realtime Database
  if (db) {
    set(ref(db, `worlds/${worldKey}/players/${myClientId}`), payload).catch(() => {});
  }
}
document.getElementById('chat-form').onsubmit = async (e) => {
  e.preventDefault();
  const inp = document.getElementById('chat-input');
  const raw = inp.value.trim();
  if (!raw) return;
  inp.value = '';
  sound.sfxClick();
  const isRP = raw.startsWith('/me ');
  const cleanText = isRP ? raw.slice(4) : raw;
  mySpeechBubbleText = isRP ? `*${cleanText}*` : cleanText;
  mySpeechTimer = 6.5;
  myChatSeq++;
  updateMyNametagHTML();
  broadcastMyStateToRTDB();
  const worldKey = sanitizeKey(worldNoise.seedStr);
  const chatObj = {
    id: `${myClientId}_${Date.now()}`,
    sender: currentConfig.name,
    text: cleanText,
    isRP,
    time: Date.now()
  };
  appendChatEntryIfNew(chatObj);
  if (localBroadcastChannel) {
    try { localBroadcastChannel.postMessage({ type: 'chat_msg', clientId: myClientId, payload: chatObj }); } catch (_) {}
  }
  try {
    localStorage.setItem(`aethel_mp_chat_${worldKey}`, JSON.stringify(chatObj));
  } catch (_) {}
  if (db) {
    try {
      await push(ref(db, `worlds/${worldKey}/chat`), chatObj);
    } catch (_) {}
  }
};
document.querySelectorAll('.rp-emote-btn').forEach(btn => {
  btn.onclick = () => {
    sound.sfxClick();
    const emote = btn.dataset.emote;
    playerChar3D.animState = emote;
    const labels = {
      sit: 'นั่งพักผ่อนหย่อนใจ',
      wave: 'โบกมือทักทายอย่างเป็นมิตร',
      dance: 'ออกลีลาเต้นรำอย่างสนุกสนาน',
      kneel: 'คุกเข่าทำความเคารพอย่างนอบน้อม'
    };
    mySpeechBubbleText = `🎭 ${labels[emote]}`;
    mySpeechTimer = 4.5;
    myChatSeq++;
    updateMyNametagHTML();
    broadcastMyStateToRTDB();
  };
});
// ============================================================================
// 10. COMBAT: SMOOTH COMBO BUFFERING, FARMING SYSTEM, INVENTORY & SEPARATED SHOPS
// ============================================================================
const skillFX = new SkillFXManager(worldGroup);
const vfxRings = [];
const physicsLootDrops = [];
let gameState = 'auth';
let worldBuilt = false;
let targetMonster = null;
let moveTargetPos = null;
let skillCooldowns = { skill1: 0, ult: 0 };
let currentComboStep = 1;
let comboResetTimer = 0;
let comboInputQueued = false;
let activeHarvestNode = null;
let harvestProgress = 0;
function spawnWaterSplashRing(pos, colorHex = 0xe0f2fe, maxRadius = 2.2) {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.45, 0.06, 10, 28),
    new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.9 })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.set(pos.x, Math.max(pos.y + 0.25, WATER_LEVEL + 0.08), pos.z);
  worldGroup.add(ring);
  vfxRings.push({ mesh: ring, age: 0, maxRadius });
}
function showFloatingDamage(worldPos, text, color = '#fbbf24') {
  const v = worldPos.clone();
  v.y += 1.9;
  v.project(camera);
  if (v.z > 1) return;
  const x = (v.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-(v.y * 0.5) + 0.5) * window.innerHeight;
  const el = document.createElement('div');
  el.className = 'dmg-popup text-lg';
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.color = color;
  el.textContent = text;
  dmgLayer.appendChild(el);
  setTimeout(() => el.remove(), 1000);
}
function addLog(msg, colorClass = "text-slate-200") {
  const logEl = document.getElementById('game-log');
  const div = document.createElement('div');
  div.className = colorClass;
  div.innerHTML = `• ${msg}`;
  logEl.appendChild(div);
  logEl.scrollTop = logEl.scrollHeight;
}
function recalculateStats() {
  const cls = CLASSES[currentConfig.classId];
  const w = WEAPONS[currentConfig.weaponId] || WEAPONS.sword_iron;
  const lvBonus = (playerStats.level - 1);
  playerStats.maxHp = cls.stats.hp + lvBonus * 28 + (playerStats.foodBuffHp || 0);
  playerStats.maxMp = cls.stats.mp + lvBonus * 14;
  playerStats.atk = cls.stats.atk + w.atk + lvBonus * 5 + (playerStats.foodBuffAtk || 0);
  playerStats.matk = cls.stats.matk + w.matk + lvBonus * 5 + (playerStats.foodBuffAtk || 0);
  playerStats.def = cls.stats.def + lvBonus * 3 + (currentConfig.classId === 'swordsman' ? 4 : 0);
  playerStats.spd = cls.stats.spd;
  playerStats.hp = Math.min(playerStats.hp, playerStats.maxHp);
  playerStats.mp = Math.min(playerStats.mp, playerStats.maxMp);
  updateHUD();
}
function updateHUD() {
  const cls = CLASSES[currentConfig.classId];
  const w = WEAPONS[currentConfig.weaponId] || WEAPONS.sword_iron;
  document.getElementById('hud-level').textContent = `Lv.${playerStats.level}`;
  document.getElementById('hud-name').textContent = currentConfig.name;
  document.getElementById('hud-rp-title').textContent = currentConfig.rpTitle || 'นักผจญภัย';
  document.getElementById('hud-class').textContent = `${cls.name.split(' ')[0]} | อาวุธ: ${w.name}`;
  document.getElementById('hud-gold').textContent = playerStats.gold;
  document.getElementById('hud-hp-text').textContent = `${Math.ceil(playerStats.hp)} / ${playerStats.maxHp}`;
  document.getElementById('hud-hp-bar').style.width = `${(playerStats.hp / playerStats.maxHp) * 100}%`;
  document.getElementById('hud-mp-text').textContent = `${Math.ceil(playerStats.mp)} / ${playerStats.maxMp}`;
  document.getElementById('hud-mp-bar').style.width = `${(playerStats.mp / playerStats.maxMp) * 100}%`;
  document.getElementById('hud-stamina-text').textContent = `${Math.floor(playerStats.stamina)} / ${playerStats.maxStamina}`;
  document.getElementById('hud-stamina-bar').style.width = `${(playerStats.stamina / playerStats.maxStamina) * 100}%`;
  document.getElementById('hud-exp-text').textContent = `${playerStats.exp} / ${playerStats.maxExp}`;
  document.getElementById('hud-exp-bar').style.width = `${Math.min(100, (playerStats.exp / playerStats.maxExp) * 100)}%`;
  document.getElementById('hud-atk').textContent = playerStats.atk;
  document.getElementById('hud-matk').textContent = playerStats.matk;
  document.getElementById('hud-def').textContent = playerStats.def;
  document.getElementById('hud-spd').textContent = playerStats.spd;
  document.getElementById('skill1-icon').textContent = cls.skills.active.icon;
  document.getElementById('skill1-name').textContent = cls.skills.active.name;
  document.getElementById('passive-icon').textContent = cls.skills.passive.icon;
  document.getElementById('passive-name').textContent = cls.skills.passive.name;
  document.getElementById('ult-icon').textContent = cls.skills.ult.icon;
  document.getElementById('ult-name').textContent = cls.skills.ult.name;
  document.getElementById('count-hp-pot').textContent = playerStats.hpPots;
  document.getElementById('count-mp-pot').textContent = playerStats.mpPots;
  document.getElementById('quest-progress').textContent = `ความคืบหน้า: ${playerStats.questKills} / ${playerStats.questTarget}`;
  const claimBtn = document.getElementById('btn-claim-quest');
  if (playerStats.questKills >= playerStats.questTarget) {
    claimBtn.classList.remove('hidden');
    document.getElementById('quest-status-badge').textContent = "สำเร็จ!";
  } else {
    claimBtn.classList.add('hidden');
    document.getElementById('quest-status-badge').textContent = `เควส #${playerStats.questStep}`;
  }
  const keysListEl = document.getElementById('hud-keys-list');
  if (keysListEl) {
    const keysArr = playerStats.roomKeys || [];
    keysListEl.textContent = keysArr.length > 0
      ? keysArr.map(k => `ห้อง ${k}`).join(', ')
      : 'ยังไม่มี (เช่าที่โรงเตี๋ยม)';
  }
}
function updateTargetUI() {
  const box = document.getElementById('hud-target-box');
  if (!targetMonster || targetMonster.hp <= 0) {
    box.classList.add('hidden');
    return;
  }
  box.classList.remove('hidden');
  document.getElementById('target-name').textContent = targetMonster.name;
  document.getElementById('target-lv').textContent = `Lv.${targetMonster.lv}`;
  document.getElementById('target-hp-bar').style.width = `${Math.max(0, (targetMonster.hp / targetMonster.maxHp) * 100)}%`;
  document.getElementById('target-hp-text').textContent = `${Math.ceil(targetMonster.hp)} / ${targetMonster.maxHp}`;
  document.getElementById('combo-badge').textContent = `COMBO x${playerChar3D.comboStep || 1}`;
}
function queueOrPerformComboAttack() {
  if (playerChar3D.attackTimer > 0.08) {
    comboInputQueued = true;
    return;
  }
  executeComboAttackStep();
}
function executeComboAttackStep() {
  comboInputQueued = false;
  activeHarvestNode = null;
  document.getElementById('hud-gather-box').classList.add('hidden');
  const pPos = playerChar3D.root.position;
  const w = WEAPONS[currentConfig.weaponId] || WEAPONS.sword_iron;
  const isRanged = ['bow', 'staff', 'tome'].includes(w.type);
  const range = isRanged ? 11.5 : 4.2;
  const autoLockRange = isRanged ? 7.5 : 3.2; // ระยะล็อคเป้าอัตโนมัติเฉพาะมอนสเตอร์ที่อยู่ใกล้ตัวจริงๆ

  // หากมอนสเตอร์ที่เคยล็อคไว้อยู่ไกลเกินระยะโจมตี ให้ปลดล็อคทันทีเพื่อไม่ให้หันไปหาหรือวิ่งตามเอง
  if (targetMonster && (targetMonster.hp <= 0 || pPos.distanceTo(targetMonster.mesh.position) > range)) {
    targetMonster = null;
  }

  // ค้นหามอนสเตอร์เฉพาะที่อยู่ในระยะประชิดตรงหน้าเท่านั้น
  if (!targetMonster) {
    let closest = null, minD = 999;
    monsters.forEach(m => {
      if (m.hp <= 0) return;
      const d = pPos.distanceTo(m.mesh.position);
      if (d < minD) { minD = d; closest = m; }
    });
    if (closest && minD <= autoLockRange) {
      targetMonster = closest;
    }
  }

  if (targetMonster && targetMonster.hp > 0 && cameraMode !== 'fps' && cameraMode !== 'tps') {
    const dx = targetMonster.mesh.position.x - pPos.x;
    const dz = targetMonster.mesh.position.z - pPos.z;
    if (Math.hypot(dx, dz) > 0.05) {
      playerPhysics.targetRotY = Math.atan2(dx, dz);
    }
  } else if (cameraMode === 'fps' || cameraMode === 'tps') {
    playerPhysics.targetRotY = cameraYawAngle + Math.PI;
  }

  const step = currentComboStep;
  playerChar3D.triggerWeaponCombo(step);
  sound.sfxCombo(step, w.type);
  lastAttackPulse = Date.now();
  broadcastMyStateToRTDB();
  document.getElementById('combo-step-label').textContent = `คอมโบ ${step}/3`;
  comboResetTimer = 2.2;
  currentComboStep = (currentComboStep % 3) + 1;

  const forwardAngle = playerPhysics.targetRotY;
  if (!isRanged) {
    const stepImpulse = step === 3 ? 6.5 : 2.4; // ลดแรงพุ่งตัวเวลาฟันลมเล่นๆ
    playerPhysics.vx += Math.sin(forwardAngle) * stepImpulse;
    playerPhysics.vz += Math.cos(forwardAngle) * stepImpulse;
  }

  const forwardDir = new THREE.Vector3(Math.sin(forwardAngle), 0, Math.cos(forwardAngle));
  if (isRanged) {
    const projMesh = new THREE.Mesh(
      w.type === 'bow' ? new THREE.ConeGeometry(0.1, 1.1, 8) : new THREE.OctahedronGeometry(0.28, 0),
      new THREE.MeshBasicMaterial({ color: w.color })
    );
    if (w.type === 'bow') projMesh.rotation.x = Math.PI / 2;
    projMesh.position.copy(pPos).add(new THREE.Vector3(0, 1.25, 0));
    worldGroup.add(projMesh);
    skillFX.activeFX.push({
      type: 'projectile',
      mesh: projMesh,
      vel: forwardDir.clone().multiplyScalar(26),
      age: 0,
      maxAge: 0.48
    });
  } else {
    spawnWaterSplashRing(
      pPos.clone().addScaledVector(forwardDir, 1.4),
      step === 3 ? 0xf43f5e : w.color,
      step === 3 ? 2.8 : 1.6
    );
  }

  const power = Math.max(playerStats.atk, playerStats.matk);
  const comboMult = step === 1 ? 1.0 : step === 2 ? 1.35 : 1.95;
  monsters.forEach(mon => {
    if (mon.hp <= 0) return;
    const dist = pPos.distanceTo(mon.mesh.position);
    if ((mon === targetMonster && dist <= range) || (!isRanged && dist <= 3.8)) {
      const dmg = Math.round(power * comboMult * (0.92 + Math.random() * 0.2));
      mon.hp -= dmg;
      targetMonster = mon;
      const ang = Math.atan2(mon.mesh.position.x - pPos.x, mon.mesh.position.z - pPos.z);
      const kb = step === 3 ? 11.5 : 5.2;
      mon.vx = Math.sin(ang) * kb;
      mon.vz = Math.cos(ang) * kb;
      mon.vy = step === 3 ? 6.2 : 3.0;
      sound.sfxHit();
      showFloatingDamage(
        mon.mesh.position,
        step === 3 ? `💥 CRIT -${dmg}!` : `-${dmg}`,
        step === 3 ? '#f43f5e' : '#fbbf24'
      );
      if (mon.hp <= 0) handleMonsterKill(mon);
    }
  });

  // ตัดคำสั่ง moveTargetPos = targetMonster.mesh.position.clone() ออก
  // เพื่อไม่ให้ตัวละครวิ่งเข้าไปหามอนสเตอร์เองตอนกดตีเล่นๆ
  updateTargetUI();
}
function triggerClassSkill(isUlt = false) {
  const cls = CLASSES[currentConfig.classId];
  const sk = isUlt ? cls.skills.ult : cls.skills.active;
  const cdKey = isUlt ? 'ult' : 'skill1';
  if (skillCooldowns[cdKey] > 0) return;
  if (playerStats.mp < sk.mp) {
    addLog("⚠️ Mana ไม่เพียงพอสำหรับการใช้สกิล!", "text-rose-400");
    return;
  }
  playerStats.mp -= sk.mp;
  skillCooldowns[cdKey] = sk.cd;
  isUlt ? sound.sfxUltimate() : sound.sfxMagic();
  const pPos = playerChar3D.root.position;
  if (targetMonster && targetMonster.hp > 0 && cameraMode !== 'fps' && cameraMode !== 'tps') {
    const dx = targetMonster.mesh.position.x - pPos.x;
    const dz = targetMonster.mesh.position.z - pPos.z;
    if (Math.hypot(dx, dz) > 0.05) playerPhysics.targetRotY = Math.atan2(dx, dz);
  }
  const targetPos = (targetMonster && targetMonster.hp > 0) ? targetMonster.mesh.position : null;
  skillFX.spawnClassSkillFX(currentConfig.classId, isUlt, pPos, targetPos, playerPhysics.targetRotY);
  lastSkillPulse = Date.now();
  lastSkillIsUlt = isUlt;
  broadcastMyStateToRTDB();
  if (sk.heal) {
    playerStats.hp = Math.min(playerStats.maxHp, playerStats.hp + sk.heal);
    showFloatingDamage(pPos, `+${sk.heal} HP`, '#34d399');
  }
  const power = Math.max(playerStats.atk, playerStats.matk);
  const hitRadius = isUlt ? 11.5 : 8.5;
  monsters.forEach(mon => {
    if (mon.hp <= 0) return;
    if (pPos.distanceTo(mon.mesh.position) <= hitRadius) {
      const dmg = Math.round(power * sk.mult * (0.95 + Math.random() * 0.2));
      mon.hp -= dmg;
      targetMonster = mon;
      const ang = Math.atan2(mon.mesh.position.x - pPos.x, mon.mesh.position.z - pPos.z);
      mon.vx = Math.sin(ang) * (isUlt ? 14 : 8);
      mon.vz = Math.cos(ang) * (isUlt ? 14 : 8);
      mon.vy = isUlt ? 7.5 : 4.5;
      showFloatingDamage(mon.mesh.position, `✨ -${dmg}`, '#38bdf8');
      if (mon.hp <= 0) handleMonsterKill(mon);
    }
  });
  updateHUD();
  updateTargetUI();
}

function togglePlayerWeaponSheathe() {
  const isSheathed = playerChar3D.toggleWeaponSheathe();
  sound.sfxClick();
  const w = WEAPONS[currentConfig.weaponId] || WEAPONS.sword_iron;
  const actionDesc = {
    sword: isSheathed ? 'เหน็บดาบเข้าฝักข้างเอว' : 'ชักดาบออกจากฝักข้างเอว!',
    shield: isSheathed ? 'เก็บโล่และค้อนสะพายหลัง' : 'ปลดโล่และค้อนจากหลังเตรียมปะทะ!',
    bow: isSheathed ? 'เก็บคันธนูสะพายหลัง' : 'หยิบคันธนูจากหลังเตรียมเล็ง!',
    staff: isSheathed ? 'สลายคทาเวทเป็นละอองแสง' : 'ควบแน่นละอองแสงเป็นคทาเวท!',
    tome: isSheathed ? 'ปล่อยคัมภีร์เวทลอยตามข้างกาย' : 'เรียกคัมภีร์เวทมาถือร่ายมนตร์!'
  }[w.type] || (isSheathed ? 'เก็บอาวุธ' : 'ชักอาวุธ');

  const btnLabel = document.getElementById('sheathe-btn-label');
  const btnIcon = document.getElementById('sheathe-btn-icon');
  if (btnLabel) btnLabel.textContent = isSheathed ? 'ชักอาวุธ' : 'เก็บอาวุธ';
  if (btnIcon) btnIcon.textContent = isSheathed ? '🗡️' : '🛡️';

  addLog(`⚔️ <b>${actionDesc}</b>`, isSheathed ? "text-sky-300" : "text-amber-300 font-bold");
  broadcastMyStateToRTDB();
}

// สร้างปุ่มเก็บ/ชักอาวุธ [R] เพิ่มลงใน Hotbar อัตโนมัติ
(function injectSheatheHotbarButton() {
  const basicSlot = document.getElementById('slot-basic');
  if (!basicSlot || document.getElementById('btn-sheathe-weapon')) return;
  const btn = document.createElement('button');
  btn.id = 'btn-sheathe-weapon';
  btn.className = 'relative w-14 h-14 rounded-xl bg-slate-900 hover:bg-slate-800 border border-sky-400/50 flex flex-col items-center justify-center';
  btn.innerHTML = `
    <span class="absolute top-0.5 left-1.5 text-[10px] font-bold text-sky-300">R</span>
    <span id="sheathe-btn-icon" class="text-lg">🛡️</span>
    <span id="sheathe-btn-label" class="text-[9px] text-sky-200 font-semibold">เก็บอาวุธ</span>
  `;
  btn.onclick = togglePlayerWeaponSheathe;
  basicSlot.parentNode.insertBefore(btn, basicSlot.nextSibling);
})();

function spawnPhysicsLoot(originPos, expVal, goldVal) {
  for (let i = 0; i < 4; i++) {
    const isGold = i % 2 === 0;
    const mesh = new THREE.Mesh(
      isGold ? new THREE.CylinderGeometry(0.22, 0.22, 0.08, 16) : new THREE.OctahedronGeometry(0.22, 0),
      new THREE.MeshStandardMaterial({
        color: isGold ? 0xfacc15 : 0x34d399,
        emissive: isGold ? 0xf59e0b : 0x10b981,
        emissiveIntensity: 0.7
      })
    );
    mesh.position.set(originPos.x, originPos.y + 0.8, originPos.z);
    worldGroup.add(mesh);
    const ang = Math.random() * Math.PI * 2;
    const spd = 3.5 + Math.random() * 3.5;
    physicsLootDrops.push({
      mesh,
      vx: Math.cos(ang) * spd,
      vy: 6.5 + Math.random() * 3.0,
      vz: Math.sin(ang) * spd,
      exp: i === 0 ? expVal : 0,
      gold: i === 1 ? goldVal : 0,
      dropMat: i === 2 ? 'monster_core' : null,
      age: 0
    });
  }
}
function handleMonsterKill(mon) {
  mon.mesh.visible = false;
  playerStats.questKills++;
  if (!playerStats.cooldowns) playerStats.cooldowns = { monsters: {}, nodes: {} };
  playerStats.cooldowns.monsters[mon.id] = Date.now() + RESPAWN_COOLDOWN_MS;

  spawnPhysicsLoot(mon.mesh.position, mon.exp, mon.gold);
  addLog(`ปราบ <b>${mon.name} (Lv.${mon.lv})</b> สำเร็จ! (คูลดาวน์เกิดใหม่ 20 นาที)`, "text-emerald-300");
  updateHUD();
  savePlayerToRTDB();

  setTimeout(() => {
    mon.hp = mon.maxHp;
    mon.vx = 0; mon.vy = 0; mon.vz = 0;
    const wy = worldNoise.getHeight(mon.spawnX, mon.spawnZ);
    mon.mesh.position.set(mon.spawnX, wy, mon.spawnZ);
    mon.mesh.visible = true;
    if (playerStats.cooldowns?.monsters) delete playerStats.cooldowns.monsters[mon.id];
  }, RESPAWN_COOLDOWN_MS);
}
function gainExpAndGold(expVal, goldVal, dropMat = null) {
  playerStats.exp += expVal;
  playerStats.gold += goldVal;
  if (dropMat) {
    playerStats.inventory[dropMat] = (playerStats.inventory[dropMat] || 0) + 1;
  }
  if (playerStats.exp >= playerStats.maxExp) {
    playerStats.level++;
    playerStats.exp -= playerStats.maxExp;
    playerStats.maxExp = Math.round(playerStats.maxExp * 1.35);
    recalculateStats();
    playerStats.hp = playerStats.maxHp;
    playerStats.mp = playerStats.maxMp;
    playerStats.stamina = playerStats.maxStamina;
    sound.sfxLevelUp();
    spawnWaterSplashRing(playerChar3D.root.position, 0xfde047, 4.5);
    showFloatingDamage(playerChar3D.root.position, `LEVEL UP! Lv.${playerStats.level}`, '#34d399');
    addLog(`🎉 เลเวลอัปเป็น <b>Lv.${playerStats.level}</b>! สเตตัสทั้งหมดเพิ่มขึ้น!`, "text-amber-300 font-bold");
    updateMyNametagHTML();
  }
  updateHUD();
  savePlayerToRTDB();
}
function startGatheringNearestNode(specificNode = null) {
  const pPos = playerChar3D.root.position;
  let chosen = specificNode;
  if (!chosen) {
    let minD = 999;
    farmingNodes.forEach(n => {
      if (!n.active) return;
      const d = Math.hypot(n.x - pPos.x, n.z - pPos.z);
      if (d < minD) { minD = d; chosen = n; }
    });
    if (!chosen || minD > 14.0) {
      addLog("⛏️ ไม่มีจุดฟาร์มทรัพยากรอยู่ในระยะใกล้ๆ (เดินไปหาแร่/สมุนไพรนอกกำแพงเมืองได้เลย!)", "text-amber-300");
      return;
    }
  }
  const dist = Math.hypot(chosen.x - pPos.x, chosen.z - pPos.z);
  if (dist > 3.2) {
    moveTargetPos = new THREE.Vector3(chosen.x, chosen.y, chosen.z);
    activeHarvestNode = chosen;
    harvestProgress = 0;
    return;
  }
  activeHarvestNode = chosen;
  harvestProgress = 0;
  playerChar3D.animState = 'harvest';
  playerPhysics.targetRotY = Math.atan2(chosen.x - pPos.x, chosen.z - pPos.z);
  sound.sfxHarvest();
  document.getElementById('hud-gather-box').classList.remove('hidden');
  document.getElementById('gather-title').textContent = `${chosen.icon} กำลังเก็บเกี่ยว ${chosen.name}...`;
}

// ตรวจสอบว่ามีหน้าต่าง Modal เปิดอยู่หรือไม่ (ถ้าเปิดอยู่ไม่ต้องล็อคเมาส์)
function isAnyModalOpen() {
  return ['modal-inventory', 'modal-shop', 'modal-chef', 'modal-inn', 'modal-storage', 'modal-settings']
    .some(id => {
      const el = document.getElementById(id);
      return el && !el.classList.contains('hidden');
    });
}

// ฟังก์ชันกด E ปฏิสัมพันธ์ครอบจักรวาล (ใช้ได้ทั้งโหมด 2.5D, POV 1, POV 3 และ Bird-Eye)
function interactWithNearestObject(isShiftPressed = false) {
  const pPos = playerChar3D.root.position;
  const maxInteractDist = 4.5;

  // 1. เช็คประตูที่อยู่ใกล้ที่สุด (และอยู่ชั้นเดียวกัน)
  let nearestDoor = null, minDoorDist = maxInteractDist;
  interactiveDoors.forEach(d => {
    if (Math.abs(pPos.y - d.wy) > 2.6) return;
    const dist = Math.hypot(pPos.x - d.wx, pPos.z - d.wz);
    if (dist < minDoorDist) { minDoorDist = dist; nearestDoor = d; }
  });
  if (nearestDoor && minDoorDist < 2.8) {
    toggleDoorState(nearestDoor, null, isShiftPressed);
    if (isAnyModalOpen()) releaseMouseForUI();
    return;
  }

  // 2. เช็ค NPC ประจำร้าน/กิลด์/โรงเตี๋ยม และชาวเมือง
  let nearestNPC = null, minNPCDist = maxInteractDist;
  const allNPCs = [...npcs.map(n => n.root), ...wanderingNPCs.map(w => w.char3D.root)];
  allNPCs.forEach(npcRoot => {
    if (Math.abs(pPos.y - npcRoot.position.y) > 2.5) return;
    const dist = Math.hypot(pPos.x - npcRoot.position.x, pPos.z - npcRoot.position.z);
    if (dist < minNPCDist) { minNPCDist = dist; nearestNPC = npcRoot; }
  });
  if (nearestNPC) {
    sound.sfxClick();
    releaseMouseForUI();
    const role = nearestNPC.userData.role;
    if (role === 'shop') {
      renderBlacksmithShopModal();
      document.getElementById('modal-shop').classList.remove('hidden');
    } else if (role === 'food') {
      renderChefRestaurantModal();
      document.getElementById('modal-chef').classList.remove('hidden');
    } else if (role === 'tavern') {
      renderInnModal();
      document.getElementById('modal-inn').classList.remove('hidden');
    } else if (role === 'citizen') {
      addLog(`💬 <b>${nearestNPC.userData.npcName}</b>: "สวัสดีท่านผู้กล้า! ขอให้เป็นการเดินทางที่ปลอดภัยนะ!"`, "text-sky-300");
    } else {
      addLog(`🏰 <b>${nearestNPC.userData.npcName}</b>: "ปราบมอนสเตอร์นอกเมืองให้ครบ ${playerStats.questTarget} ตัว แล้วกดรับรางวัลที่หน้าต่างภารกิจกิลด์ได้เลย!"`, "text-emerald-300");
    }
    return;
  }

  // 3. เช็คตู้เก็บของในห้องพักโรงเตี๋ยม
  let nearestCab = null, minCabDist = 3.4;
  interactiveCabinets.forEach(c => {
    if (Math.abs(pPos.y - c.wy) > 2.2) return;
    const dist = Math.hypot(pPos.x - c.wx, pPos.z - c.wz);
    if (dist < minCabDist) { minCabDist = dist; nearestCab = c; }
  });
  if (nearestCab) {
    releaseMouseForUI();
    const keysArr = playerStats.roomKeys || [];
    if (nearestCab.roomId && !keysArr.includes(nearestCab.roomId)) {
      addLog(`🔒 ต้องมี <b>🔑 กุญแจห้องพัก ${nearestCab.roomId}</b> ก่อนจึงจะเปิดตู้เก็บของได้!`, "text-amber-300");
      renderInnModal(nearestCab.roomId);
      document.getElementById('modal-inn').classList.remove('hidden');
      return;
    }
    sound.sfxClick();
    renderRoomStorageModal(nearestCab.roomId);
    document.getElementById('modal-storage').classList.remove('hidden');
    return;
  }

  // 4. เช็คเตียงนอนในห้องพักโรงเตี๋ยม
  let nearestBed = null, minBedDist = 3.4;
  interactiveBeds.forEach(b => {
    if (Math.abs(pPos.y - b.wy) > 2.2) return;
    const dist = Math.hypot(pPos.x - b.wx, pPos.z - b.wz);
    if (dist < minBedDist) { minBedDist = dist; nearestBed = b; }
  });
  if (nearestBed) {
    restOnInnBed(nearestBed);
    return;
  }

  // 5. เช็คเก้าอี้
  let nearestSeat = null, minSeatDist = 2.6;
  interactiveSeats.forEach(s => {
    if (Math.abs(pPos.y - s.wy) > 2.0) return;
    const dist = Math.hypot(pPos.x - s.wx, pPos.z - s.wz);
    if (dist < minSeatDist) { minSeatDist = dist; nearestSeat = s; }
  });
  if (nearestSeat) {
    sitOnChairSeat(nearestSeat);
    return;
  }

  // 6. เช็ครถม้า
  let nearestCar = null, minCarDist = 4.2;
  animatedCarriages.forEach(car => {
    const dist = Math.hypot(pPos.x - car.group.position.x, pPos.z - car.group.position.z);
    if (dist < minCarDist) { minCarDist = dist; nearestCar = car; }
  });
  if (nearestCar) {
    sound.sfxClick();
    ridingCarriage = (ridingCarriage === nearestCar) ? null : nearestCar;
    addLog(ridingCarriage ? `🐎 ขึ้นนั่งรถม้าชมเมืองแล้ว! (กด WASD เพื่อลง)` : `🐎 ลงจากรถม้าเรียบร้อยแล้ว`, "text-emerald-300");
    return;
  }

  // 7. หากไม่มีวัตถุปฏิสัมพันธ์ใกล้ๆ ให้เก็บเกี่ยวแร่/สมุนไพร
  startGatheringNearestNode(null);
}

document.getElementById('btn-gather-node').onclick = () => startGatheringNearestNode(null);

// เช็คว่าพิกัดอยู่ในอาคารโรงเตี๋ยมหรือไม่
function isPositionInsideInn(pos) {
  if (!pos) return false;
  for (let i = 0; i < enterableBuildings.length; i++) {
    const eb = enterableBuildings[i];
    if (eb.isTwoStory) {
      if (Math.abs(pos.x - eb.wx) <= eb.width * 0.55 && Math.abs(pos.z - eb.wz) <= eb.depth * 0.55) {
        return true;
      }
    }
  }
  return false;
}

// หาเมืองที่อยู่ใกล้พิกัดของผู้เล่นมากที่สุด
function getNearestTownToPosition(pos) {
  const px = pos?.x ?? 0;
  const pz = pos?.z ?? 0;
  let nearest = TOWNS[0];
  let minD = Infinity;
  TOWNS.forEach(t => {
    const d = Math.hypot(px - t.x, pz - t.z);
    if (d < minD) {
      minD = d;
      nearest = t;
    }
  });
  return nearest;
}

async function savePlayerToRTDB() {
  if (gameState === 'world' && playerChar3D?.root) {
    const pPos = playerChar3D.root.position;
    playerStats.lastLogoutPos = { x: pPos.x, y: pPos.y, z: pPos.z };
    // ถ้าผู้เล่นเดินออกมานอกโรงเตี๋ยมแล้ว ให้ยกเลิกจุดเซฟชั่วคราวในโรงเตี๋ยมทันที!
    if (!isPositionInsideInn(pPos)) {
      playerStats.savedSpawn = null;
    }
  }
  await dbSet(`users/${currentUsername}`, {
    password: (await dbGet(`users/${currentUsername}`))?.password || "1234",
    characterCreated: true,
    config: currentConfig,
    stats: playerStats,
    updatedAt: Date.now()
  });
}

// ฟังก์ชันเข้าสู่โลกเกมโดยตรง (พร้อมตรวจสอบจุดเซฟเตียงโรงเตี๋ยม)
async function startWorldSession() {
  sculptTooltip.classList.add('hidden');
  rebuildPreviewCharacter();
  recalculateStats();

  document.getElementById('screen-auth').classList.add('hidden');
  document.getElementById('screen-creator').classList.add('hidden');
  document.getElementById('screen-hud').classList.remove('hidden');
  creatorPedestal.visible = false;
  worldGroup.visible = true;
  gameState = 'world';

  if (!worldBuilt) {
    buildAllGrandCities();
    worldBuilt = true;
  }

  playerPhysics.vx = 0; playerPhysics.vy = 0; playerPhysics.vz = 0;

  // เช็คจุดเกิด: ถ้าตอนออกเกมอยู่ในโรงเตี๋ยมและมีจุดเซฟเตียงโรงเตี๋ยม ให้เกิดในห้องนั้น
  // แต่ถ้าอยู่นอกโรงเตี๋ยม ให้ไปเกิดที่เมืองที่อยู่ใกล้ผู้เล่นมากที่สุดในตอนนั้น!
  const sp = playerStats.savedSpawn;
  const lastPos = playerStats.lastLogoutPos;
  const stillInInn = sp && (!lastPos || isPositionInsideInn(lastPos));

  if (stillInInn && typeof sp.x === 'number' && typeof sp.z === 'number') {
    playerChar3D.root.position.set(sp.x, sp.y, sp.z);
    playerPhysics.targetRotY = sp.rotY || 0;
    playerChar3D.root.rotation.y = sp.rotY || 0;

    if (sp.isSleeping && sp.roomId) {
      const foundBed = interactiveBeds.find(b => b.roomId === sp.roomId);
      if (foundBed) {
        activeSleepingBed = foundBed;
        playerChar3D.animState = 'sleep';
        addLog(`🛌 ตื่นขึ้นมาใน <b>${foundBed.roomName}</b> (จุดเซฟชั่วคราวโรงเตี๋ยม) กด WASD เพื่อลุกจากเตียง`, "text-emerald-300 font-bold");
      } else {
        playerChar3D.animState = 'idle';
      }
    } else {
      playerChar3D.animState = 'idle';
      addLog(`🏨 เข้าสู่เกมที่ห้องพักโรงเตี๋ยม <b>#${sp.roomId || ''}</b>`, "text-amber-300");
    }
  } else {
    playerStats.savedSpawn = null;
    const nearestTown = getNearestTownToPosition(lastPos);
    const spawnX = nearestTown.x;
    const spawnZ = nearestTown.z + 12;
    const spawnY = worldNoise.getHeight(spawnX, spawnZ);
    playerChar3D.root.position.set(spawnX, spawnY, spawnZ);
    playerChar3D.animState = 'idle';
    addLog(`🏰 เกิดที่มหานครที่ใกล้ที่สุด: <b>${nearestTown.name}</b>`, "text-emerald-300 font-bold");
  }

  playerChar3D.setFirstPersonVisibility(cameraMode === 'fps');
  updateMyNametagHTML();
  initMultiplayerSync();
  await savePlayerToRTDB();
  broadcastMyStateToRTDB();
}
// ============================================================================
// 11. INVENTORY MODAL, BLACKSMITH WEAPON SHOP & CHEF ROSE RESTAURANT
// ============================================================================
function renderInventoryModal() {
  const keysBanner = document.getElementById('inv-keys-banner');
  if (keysBanner) {
    const keysArr = playerStats.roomKeys || [];
    keysBanner.innerHTML = keysArr.length > 0
      ? `🔑 <b>กุญแจห้องพักโรงเตี๋ยมในกระเป๋า:</b> ${keysArr.map(k => `<span class="px-2 py-0.5 mx-1 rounded bg-emerald-500/30 border border-emerald-400 text-emerald-200 font-bold">กุญแจห้อง ${k}</span>`).join('')} (นำไปคลิกเปิดประตูห้องพักชั้น 2 และใช้ตู้เก็บของได้ทันที)`
      : `🔑 <b>กุญแจห้องพักโรงเตี๋ยม:</b> ยังไม่มีกุญแจห้องพัก (สามารถติดต่อเช่าห้องพักชั่วคราวได้ที่ <b>ผู้ดูแลโรงเตี๋ยม เกรย์</b> ชั้น 1)`;
  }
  const matList = document.getElementById('inv-materials-list');
  const wepList = document.getElementById('inv-weapons-list');
  matList.innerHTML = '';
  wepList.innerHTML = '';
  Object.values(FARM_MATERIALS).forEach(mat => {
    const qty = playerStats.inventory[mat.id] || 0;
    const row = document.createElement('div');
    row.className = "bg-slate-900/90 border border-slate-700 rounded-xl p-2.5 flex items-center justify-between";
    row.innerHTML = `
      <div>
        <div class="font-bold text-emerald-300 text-xs">${mat.icon} ${mat.name} <span class="text-amber-300 font-extrabold">x${qty}</span></div>
        <div class="text-[11px] text-slate-400">${mat.desc}</div>
      </div>
      <button class="sell-mat-btn px-2.5 py-1 rounded-lg text-xs font-bold ${qty > 0 ? 'bg-amber-500 hover:bg-amber-400 text-slate-950' : 'bg-slate-800 text-slate-600 cursor-not-allowed'}">
        ขาย (+${mat.sellPrice} G)
      </button>
    `;
    row.querySelector('.sell-mat-btn').onclick = () => {
      if (qty <= 0) return;
      playerStats.inventory[mat.id]--;
      playerStats.gold += mat.sellPrice;
      sound.sfxCoin();
      updateHUD();
      renderInventoryModal();
      savePlayerToRTDB();
    };
    matList.appendChild(row);
  });
  const cls = CLASSES[currentConfig.classId];
  playerStats.ownedWeapons.forEach(wid => {
    const w = WEAPONS[wid];
    if (!w) return;
    const equipped = currentConfig.weaponId === wid;
    const canEquip = cls.allowedWeapon === 'any' || cls.allowedWeapon === w.type;
    const row = document.createElement('div');
    row.className = "bg-slate-900/90 border border-slate-700 rounded-xl p-2.5 flex items-center justify-between";
    row.innerHTML = `
      <div>
        <div class="font-bold text-amber-200 text-xs">⚔️ ${w.name}</div>
        <div class="text-[11px] text-slate-400">ATK +${w.atk} | MATK +${w.matk}</div>
      </div>
      <button class="eq-btn px-3 py-1 rounded-lg text-xs font-bold ${
        equipped ? 'bg-emerald-500/30 text-emerald-200 border border-emerald-400' :
        canEquip ? 'bg-sky-500 text-slate-950' : 'bg-slate-800 text-slate-500 cursor-not-allowed'
      }">${equipped ? 'สวมใส่แล้ว' : canEquip ? 'สวมใส่' : 'ติดคลาส'}</button>
    `;
    row.querySelector('.eq-btn').onclick = () => {
      if (!canEquip || equipped) return;
      currentConfig.weaponId = wid;
      sound.sfxClick();
      rebuildPreviewCharacter();
      recalculateStats();
      renderInventoryModal();
      savePlayerToRTDB();
      broadcastMyStateToRTDB();
    };
    wepList.appendChild(row);
  });
}
function renderBlacksmithShopModal() {
  const grid = document.getElementById('shop-items-grid');
  grid.innerHTML = '';
  const cls = CLASSES[currentConfig.classId];
  Object.values(WEAPONS).forEach(w => {
    const owned = playerStats.ownedWeapons.includes(w.id);
    const equipped = currentConfig.weaponId === w.id;
    const canEquip = cls.allowedWeapon === 'any' || cls.allowedWeapon === w.type;
    const card = document.createElement('div');
    card.className = "bg-slate-900/90 border border-slate-700 rounded-xl p-3 flex items-center justify-between";
    card.innerHTML = `
      <div>
        <div class="font-bold text-amber-200 text-sm">${w.name} <span class="text-[10px] uppercase px-1.5 py-0.5 rounded bg-slate-800 text-sky-300">${w.type}</span></div>
        <div class="text-xs text-slate-300">ATK +${w.atk} | MATK +${w.matk}</div>
      </div>
      <button class="w-action-btn px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 ${
        equipped ? 'bg-emerald-500/30 text-emerald-200 border border-emerald-400' :
        !canEquip ? 'bg-slate-800 text-slate-500 cursor-not-allowed' :
        owned ? 'bg-sky-500 text-slate-950' : 'bg-amber-500 text-slate-950'
      }">${equipped ? 'สวมใส่แล้ว' : !canEquip ? 'ติดคลาส' : owned ? 'สวมใส่' : `ซื้อ ${w.price} G`}</button>
    `;
    card.querySelector('.w-action-btn').onclick = () => {
      if (!canEquip || equipped) return;
      if (!owned) {
        if (playerStats.gold < w.price) { addLog("❌ เงิน Gold ไม่พอซื้ออาวุธนี้!", "text-rose-400"); return; }
        playerStats.gold -= w.price;
        playerStats.ownedWeapons.push(w.id);
      }
      currentConfig.weaponId = w.id;
      sound.sfxLevelUp();
      rebuildPreviewCharacter();
      recalculateStats();
      renderBlacksmithShopModal();
      savePlayerToRTDB();
      broadcastMyStateToRTDB();
    };
    grid.appendChild(card);
  });
}
function renderChefRestaurantModal() {
  const grid = document.getElementById('chef-items-grid');
  grid.innerHTML = '';
  const menu = [
    {
      title: '🧪 ชุดโพชั่นฟื้นฟู (HP x2 + MP x2)',
      desc: 'เติมขวดยาฟื้นฟูพลังชีวิตและมานาสำหรับออกผจญภัย',
      btnText: 'ซื้อ 60 G',
      action: () => {
        if (playerStats.gold < 60) { addLog("❌ เงิน Gold ไม่พอ!", "text-rose-400"); return false; }
        playerStats.gold -= 60;
        playerStats.hpPots += 2; playerStats.mpPots += 2;
        return true;
      }
    },
    {
      title: '🍖 สเต็กเนื้อย่างจักรพรรดิ (ซื้อด้วย Gold)',
      desc: 'ฟื้นฟู HP/MP/Stamina เต็ม 100% และเพิ่ม ATK/MATK ถาวร +4',
      btnText: 'ซื้อ 120 G',
      action: () => {
        if (playerStats.gold < 120) { addLog("❌ เงิน Gold ไม่พอ!", "text-rose-400"); return false; }
        playerStats.gold -= 120;
        playerStats.foodBuffAtk = (playerStats.foodBuffAtk || 0) + 4;
        recalculateStats();
        playerStats.hp = playerStats.maxHp; playerStats.mp = playerStats.maxMp; playerStats.stamina = playerStats.maxStamina;
        return true;
      }
    },
    {
      title: '🥐 ขนมปังรวงข้าวทองคำอบสมุนไพร (ใช้วัตถุดิบฟาร์ม)',
      desc: `ใช้ 🌾 รวงข้าวสาลี x2 + 🌿 สมุนไพรแสงจันทร์ x1 ➔ เพิ่ม Max HP ถาวร +25 และ ATK +5!`,
      btnText: `ปรุงอาหาร (มี ${playerStats.inventory.golden_wheat || 0}/2 🌾, ${playerStats.inventory.moon_herb || 0}/1 🌿)`,
      action: () => {
        if ((playerStats.inventory.golden_wheat || 0) < 2 || (playerStats.inventory.moon_herb || 0) < 1) {
          addLog("⚠️ วัตถุดิบไม่พอ! ออกไปเก็บเกี่ยวข้าวสาลีและสมุนไพรแสงจันทร์มาเพิ่มได้เลย!", "text-amber-300");
          return false;
        }
        playerStats.inventory.golden_wheat -= 2;
        playerStats.inventory.moon_herb -= 1;
        playerStats.foodBuffHp = (playerStats.foodBuffHp || 0) + 25;
        playerStats.foodBuffAtk = (playerStats.foodBuffAtk || 0) + 5;
        recalculateStats();
        playerStats.hp = playerStats.maxHp;
        addLog("🥐 เชฟโรเซ่ปรุงขนมปังทองคำให้คุณ! Max HP +25 และ ATK +5 ถาวร!", "text-pink-300 font-bold");
        return true;
      }
    },
    {
      title: '🍲 ซุปแก่นเวทมิธริล (ใช้วัตถุดิบฟาร์ม)',
      desc: `ใช้ 🔮 แก่นเวทมอนสเตอร์ x1 + 💎 แร่มิธริล x1 ➔ เพิ่ม ATK & MATK ถาวร +8!`,
      btnText: `ปรุงอาหาร (มี ${playerStats.inventory.monster_core || 0}/1 🔮, ${playerStats.inventory.mithril_ore || 0}/1 💎)`,
      action: () => {
        if ((playerStats.inventory.monster_core || 0) < 1 || (playerStats.inventory.mithril_ore || 0) < 1) {
          addLog("⚠️ วัตถุดิบไม่พอ! ต้องใช้แก่นเวทมอนสเตอร์ 1 ชิ้น และแร่มิธริล 1 ชิ้น!", "text-amber-300");
          return false;
        }
        playerStats.inventory.monster_core -= 1;
        playerStats.inventory.mithril_ore -= 1;
        playerStats.foodBuffAtk = (playerStats.foodBuffAtk || 0) + 8;
        recalculateStats();
        addLog("🍲 ดื่มซุปแก่นเวทมิธริล! พลังโจมตี ATK/MATK เพิ่มขึ้น +8 ถาวร!", "text-emerald-300 font-bold");
        return true;
      }
    }
  ];
  menu.forEach(item => {
    const card = document.createElement('div');
    card.className = "bg-slate-900/90 border border-slate-700 rounded-xl p-3 flex items-center justify-between gap-2";
    card.innerHTML = `
      <div>
        <div class="font-bold text-pink-300 text-sm">${item.title}</div>
        <div class="text-xs text-slate-300">${item.desc}</div>
      </div>
      <button class="cook-btn bg-pink-500 hover:bg-pink-400 text-slate-950 font-bold px-3 py-1.5 rounded-lg text-xs shrink-0">${item.btnText}</button>
    `;
    card.querySelector('.cook-btn').onclick = () => {
      if (item.action()) {
        sound.sfxLevelUp();
        mySpeechBubbleText = "🍖 อร่อยเหาะ! พลังเพิ่มขึ้นแล้ว!";
        mySpeechTimer = 4.0;
        myChatSeq++;
        updateMyNametagHTML();
        updateHUD();
        renderChefRestaurantModal();
        savePlayerToRTDB();
        broadcastMyStateToRTDB();
      }
    };
    grid.appendChild(card);
  });
}
// ==================== ระบบโรงเตี๋ยม 2 ชั้น: เช่าห้องพักชั่วคราว รับกุญแจห้อง เปิดตู้เก็บของ และนอนเตียง ====================
const INN_ROOMS_CATALOG = [
  { roomId: '201', name: 'ห้องพัก 201 (Standard Single Room)', price: 40, desc: 'ห้องพักชั้น 2 ฝั่งตะวันตก พร้อมเตียงนุ่ม ตู้เก็บของ โต๊ะเก้าอี้ริมหน้าต่าง และกุญแจห้อง 201' },
  { roomId: '202', name: 'ห้องพัก 202 (Deluxe Center Room)',   price: 60, desc: 'ห้องพักชั้น 2 โซนกลางวิวระเบียงเมือง พร้อมเตียงใหญ่ ตู้เก็บของ โต๊ะเขียนหนังสือ และกุญแจห้อง 202' },
  { roomId: '203', name: 'ห้องพัก 203 (Royal Suite VIP)',      price: 90, desc: 'ห้องสวีทชั้น 2 ติดบันไดทางขึ้น พร้อมเตียงหรู ตู้เก็บของส่วนตัว เก้าอี้รับรอง และกุญแจห้อง 203' }
];
function renderInnModal(highlightRoomId = null) {
  const grid = document.getElementById('inn-rooms-grid');
  if (!grid) return;
  grid.innerHTML = '';
  if (!Array.isArray(playerStats.roomKeys)) playerStats.roomKeys = [];

  INN_ROOMS_CATALOG.forEach(rm => {
    const hasKey = playerStats.roomKeys.includes(rm.roomId);
    const isHighlighted = highlightRoomId === rm.roomId;
    const roomDoor = interactiveDoors.find(d => d.roomId === rm.roomId);
    const isOpen = roomDoor ? roomDoor.isOpen : false;
    const isLocked = roomDoor ? !!roomDoor.isLocked : true;

    const card = document.createElement('div');
    card.className = `bg-slate-900/95 border ${isHighlighted ? 'border-amber-400 ring-2 ring-amber-400/40' : 'border-slate-700'} rounded-xl p-3.5 flex flex-col md:flex-row items-start md:items-center justify-between gap-3`;
    card.innerHTML = `
      <div>
        <div class="flex items-center gap-2 flex-wrap">
          <span class="font-extrabold text-amber-300 text-sm">🔑 ${rm.name}</span>
          ${hasKey ? '<span class="px-2 py-0.5 rounded-full bg-emerald-500/25 border border-emerald-400 text-[10px] text-emerald-200 font-bold">มีกุญแจห้องนี้แล้ว</span>' : ''}
          ${hasKey && roomDoor ? `<span class="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-600 text-[10px] ${isLocked ? 'text-rose-300' : 'text-sky-300'}">${isLocked ? '🔒 ล็อคอยู่' : '🔓 ปลดล็อค'} \vert{} ${isOpen ? 'ประตูเปิด' : 'ประตูปิด'}</span>` : ''}
        </div>
        <div class="text-xs text-slate-300 mt-0.5">${rm.desc}</div>
      </div>
      <div class="flex flex-wrap items-center gap-1.5 shrink-0">
        ${hasKey ? `
          <button class="toggle-open-btn px-2.5 py-1.5 rounded-lg text-xs font-bold bg-sky-500 hover:bg-sky-400 text-slate-950">
            ${isOpen ? '🚪 สั่งปิดประตู' : '🚪 สั่งเปิดประตู'}
          </button>
          <button class="toggle-lock-btn px-2.5 py-1.5 rounded-lg text-xs font-bold ${isLocked ? 'bg-amber-500 hover:bg-amber-400 text-slate-950' : 'bg-rose-500 hover:bg-rose-400 text-white'}">
            ${isLocked ? '🔓 ปลดล็อคห้อง' : '🔒 ล็อคห้อง'}
          </button>
        ` : ''}
        <button class="rent-room-btn px-3 py-1.5 rounded-lg text-xs font-bold ${
          hasKey
            ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
            : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
        }">
          ${hasKey ? '⚡ วาร์ปหน้าห้อง ' + rm.roomId : `เช่าห้องรับกุญแจ (${rm.price} G)`}
        </button>
      </div>
    `;

    if (hasKey && roomDoor) {
      card.querySelector('.toggle-open-btn').onclick = () => {
        toggleDoorState(roomDoor, null, false);
        renderInnModal(rm.roomId);
      };
      card.querySelector('.toggle-lock-btn').onclick = () => {
        toggleDoorState(roomDoor, null, true);
        renderInnModal(rm.roomId);
      };
    }

    card.querySelector('.rent-room-btn').onclick = () => {
      if (!hasKey) {
        if (playerStats.gold < rm.price) {
          addLog(`❌ เงิน Gold ไม่พอเช่า ${rm.name} (ต้องการ ${rm.price} G)`, "text-rose-400");
          return;
        }
        playerStats.gold -= rm.price;
        playerStats.roomKeys.push(rm.roomId);
        sound.sfxLevelUp();
        addLog(`🔑 ได้รับ <b>กุญแจ${rm.name}</b> แล้ว! คลิกที่ประตูเพื่อเปิด/ปิด หรือกด Shift+คลิกที่ประตูเพื่อล็อค/ปลดล็อคได้ตลอดเวลา!`, "text-amber-300 font-bold");
        if (roomDoor) {
          roomDoor.isLocked = false;
          updateRoomDoorLabel(roomDoor);
        }
        updateHUD();
        savePlayerToRTDB();
        renderInnModal(rm.roomId);
      } else if (roomDoor) {
        sound.sfxMagic();
        activeSittingSeat = null;
        activeSleepingBed = null;
        playerChar3D.root.position.set(roomDoor.wx, roomDoor.wy + 0.1, roomDoor.wz - 1.4);
        playerPhysics.vx = 0; playerPhysics.vy = 0; playerPhysics.vz = 0;
        playerChar3D.animState = 'idle';
        document.getElementById('modal-inn').classList.add('hidden');
        addLog(`🪜 มาที่หน้า <b>${rm.name}</b> บนชั้น 2 แล้ว!`, "text-emerald-300");
      }
    };
    grid.appendChild(card);
  });
}
function renderRoomStorageModal(roomId = '201') {
  const titleEl = document.getElementById('storage-modal-title');
  if (titleEl) titleEl.textContent = `🗄️ ตู้เก็บของส่วนตัวประจำห้องพัก #${roomId}`;
  const listEl = document.getElementById('storage-items-list');
  if (!listEl) return;
  listEl.innerHTML = '';
  if (!playerStats.roomStorage) {
    playerStats.roomStorage = { gold: 0, mithril_ore: 0, moon_herb: 0, ancient_wood: 0, golden_wheat: 0, monster_core: 0 };
  }
  // แถวฝาก/ถอน Gold
  const goldRow = document.createElement('div');
  goldRow.className = "bg-slate-900/95 border border-amber-400/40 rounded-xl p-3 flex items-center justify-between";
  goldRow.innerHTML = `
    <div>
      <div class="font-bold text-amber-300 text-xs">🪙 เหรียญทองคำ (Gold Storage)</div>
      <div class="text-[11px] text-slate-300">ในกระเป๋า: <b>${playerStats.gold} G</b> | ในตู้เซฟห้องพัก: <b class="text-emerald-300">${playerStats.roomStorage.gold || 0} G</b></div>
    </div>
    <div class="flex gap-1.5">
      <button id="btn-dep-gold" class="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs">ฝาก 50 G</button>
      <button id="btn-wit-gold" class="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs">ถอน 50 G</button>
    </div>
  `;
  goldRow.querySelector('#btn-dep-gold').onclick = () => {
    if (playerStats.gold < 50) return;
    playerStats.gold -= 50;
    playerStats.roomStorage.gold = (playerStats.roomStorage.gold || 0) + 50;
    sound.sfxCoin();
    updateHUD();
    renderRoomStorageModal(roomId);
    savePlayerToRTDB();
  };
  goldRow.querySelector('#btn-wit-gold').onclick = () => {
    if ((playerStats.roomStorage.gold || 0) < 50) return;
    playerStats.roomStorage.gold -= 50;
    playerStats.gold += 50;
    sound.sfxCoin();
    updateHUD();
    renderRoomStorageModal(roomId);
    savePlayerToRTDB();
  };
  listEl.appendChild(goldRow);
  // แถวฝาก/ถอนวัตถุดิบแต่ละชนิด
  Object.values(FARM_MATERIALS).forEach(mat => {
    const bagQty = playerStats.inventory[mat.id] || 0;
    const boxQty = playerStats.roomStorage[mat.id] || 0;
    const row = document.createElement('div');
    row.className = "bg-slate-900/90 border border-slate-700 rounded-xl p-2.5 flex items-center justify-between";
    row.innerHTML = `
      <div>
        <div class="font-bold text-emerald-300 text-xs">${mat.icon} ${mat.name}</div>
        <div class="text-[11px] text-slate-300">ในกระเป๋า: <b class="text-amber-300">x${bagQty}</b> | ในตู้เก็บของ: <b class="text-sky-300">x${boxQty}</b></div>
      </div>
      <div class="flex gap-1.5">
        <button class="dep-mat px-2.5 py-1 rounded-lg text-xs font-bold ${bagQty > 0 ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-600 cursor-not-allowed'}">ฝากเก็บ (+1)</button>
        <button class="wit-mat px-2.5 py-1 rounded-lg text-xs font-bold ${boxQty > 0 ? 'bg-sky-500 text-slate-950' : 'bg-slate-800 text-slate-600 cursor-not-allowed'}">หยิบออก (+1)</button>
      </div>
    `;
    row.querySelector('.dep-mat').onclick = () => {
      if (bagQty <= 0) return;
      playerStats.inventory[mat.id]--;
      playerStats.roomStorage[mat.id] = (playerStats.roomStorage[mat.id] || 0) + 1;
      sound.sfxClick();
      renderRoomStorageModal(roomId);
      savePlayerToRTDB();
    };
    row.querySelector('.wit-mat').onclick = () => {
      if (boxQty <= 0) return;
      playerStats.roomStorage[mat.id]--;
      playerStats.inventory[mat.id] = (playerStats.inventory[mat.id] || 0) + 1;
      sound.sfxClick();
      renderRoomStorageModal(roomId);
      savePlayerToRTDB();
    };
    listEl.appendChild(row);
  });
}
function updateRoomDoorLabel(doorObj) {
  if (!doorObj || !doorObj.roomId || !doorObj.labelItem) return;
  const lockBadge = doorObj.isLocked
    ? `<span class="text-rose-400">🔒 ล็อคอยู่</span>`
    : `<span class="text-emerald-300">🔓 ปลดล็อค</span>`;
  const openBadge = doorObj.isOpen ? 'เปิดอยู่' : 'ปิดอยู่';
  doorObj.labelItem.el.innerHTML = `<div class="px-2 py-0.5 rounded-lg bg-slate-950/90 border border-amber-400/70 text-[9px] text-amber-200 font-bold shadow">🚪 ห้อง ${doorObj.roomId} [${lockBadge} | ${openBadge}] (คลิก: เปิด/ปิด | Shift+คลิก: ล็อค/ปลดล็อค)</div>`;
}

function toggleDoorState(doorObj, forceState = null, toggleLockMode = false) {
  if (!doorObj) return;
  if (doorObj.roomId) {
    const keysArr = playerStats.roomKeys || [];
    const hasKey = keysArr.includes(doorObj.roomId);
    if (!hasKey && forceState !== true) {
      sound.sfxClick();
      addLog(`🔒 <b>${doorObj.title}</b> ล็อกอยู่! เฉพาะผู้ถือ <b>🔑 กุญแจห้อง ${doorObj.roomId}</b> เท่านั้นที่ควบคุมประตูนี้ได้`, "text-amber-300 font-bold");
      renderInnModal(doorObj.roomId);
      document.getElementById('modal-inn').classList.remove('hidden');
      return;
    }

    // โหมดสลับ ล็อค / ปลดล็อค (เมื่อกด Shift+คลิก หรือกดปุ่มล็อคในเมนู)
    if (toggleLockMode) {
      doorObj.isLocked = !doorObj.isLocked;
      if (doorObj.isLocked && doorObj.isOpen) {
        doorObj.isOpen = false;
        doorObj.targetAngle = 0;
        doorObj.collider.disabled = false;
      }
      sound.sfxClick();
      updateRoomDoorLabel(doorObj);
      addLog(`${doorObj.isLocked ? '🔒 ล็อคประตู (คนอื่นเข้าไม่ได้)' : '🔓 ปลดล็อคประตู'} <b>${doorObj.title}</b> เรียบร้อย!`, doorObj.isLocked ? "text-rose-300 font-bold" : "text-emerald-300 font-bold");
      return;
    }

    // หากประตูถูกล็อคอยู่แต่เรามีกุญแจ เมื่อคลิกเปิดจะปลดล็อคให้อัตโนมัติ
    if (doorObj.isLocked && !doorObj.isOpen) {
      doorObj.isLocked = false;
      addLog(`🔑 ใช้กุญแจปลดล็อค <b>${doorObj.title}</b>`, "text-emerald-300");
    }
  }

  doorObj.isOpen = forceState !== null ? forceState : !doorObj.isOpen;
  doorObj.targetAngle = doorObj.isOpen ? -Math.PI * 0.65 : 0;
  doorObj.collider.disabled = doorObj.isOpen;
  sound.sfxClick();
  updateRoomDoorLabel(doorObj);
  addLog(`${doorObj.isOpen ? '🚪 เปิด' : '🚪 ปิด'} <b>${doorObj.title}</b>`, "text-sky-300");
}
function sitOnChairSeat(seatObj) {
  if (!seatObj) return;
  ridingCarriage = null;
  activeSleepingBed = null;
  activeBedTarget = null;
  moveTargetPos = null;
  activeSittingSeat = seatObj;
  playerPhysics.vx = 0; playerPhysics.vy = 0; playerPhysics.vz = 0;
  playerChar3D.root.position.set(seatObj.wx, seatObj.wy, seatObj.wz);
  playerPhysics.targetRotY = seatObj.rotY;
  playerChar3D.root.rotation.y = seatObj.rotY;
  playerChar3D.animState = 'sit';
  sound.sfxClick();
  mySpeechBubbleText = `🪑 นั่งพักที่${seatObj.label}`;
  mySpeechTimer = 3.5;
  myChatSeq++;
  updateMyNametagHTML();
  broadcastMyStateToRTDB();
  addLog(`🪑 นั่งลงบน <b>${seatObj.label}</b> เรียบร้อยแล้ว (กดปุ่มเดิน WASD หรือ Space เพื่อลุกขึ้น)`, "text-emerald-300");
}
function restOnInnBed(bedObj) {
  if (!bedObj) return;
  const keysArr = playerStats.roomKeys || [];
  if (bedObj.roomId && !keysArr.includes(bedObj.roomId)) {
    addLog(`🔑 ต้องมี <b>กุญแจห้องพัก ${bedObj.roomId}</b> ก่อนจึงจะเข้าพักผ่อนบนเตียงนี้ได้!`, "text-amber-300");
    renderInnModal(bedObj.roomId);
    document.getElementById('modal-inn').classList.remove('hidden');
    releaseMouseForUI();
    return;
  }
  ridingCarriage = null;
  activeSittingSeat = null;
  activeSeatTarget = null;
  moveTargetPos = null;
  activeSleepingBed = bedObj;
  playerPhysics.vx = 0; playerPhysics.vy = 0; playerPhysics.vz = 0;
  playerChar3D.root.position.set(bedObj.wx, bedObj.wy, bedObj.wz);
  playerPhysics.targetRotY = bedObj.rotY;
  playerChar3D.root.rotation.y = bedObj.rotY;
  playerChar3D.animState = 'sleep';

  // บันทึกห้องพักโรงเตี๋ยมเป็นจุดเซฟทันที (หากออกเกมขณะหลับ รอบหน้าจะเกิดบนเตียงในห้องนี้)
  playerStats.savedSpawn = {
    x: bedObj.wx,
    y: bedObj.wy,
    z: bedObj.wz,
    rotY: bedObj.rotY,
    roomId: bedObj.roomId,
    isSleeping: true
  };

  if ((playerStats.wellRestedBonus || 0) < 10) {
    playerStats.wellRestedBonus = 10;
    playerStats.foodBuffAtk = (playerStats.foodBuffAtk || 0) + 6;
    recalculateStats();
  }
  playerStats.hp = playerStats.maxHp;
  playerStats.mp = playerStats.maxMp;
  playerStats.stamina = playerStats.maxStamina;
  sound.sfxLevelUp();
  showFloatingDamage(playerChar3D.root.position, '💤 บันทึกจุดเซฟโรงเตี๋ยม & ฟื้นฟู 100%', '#34d399');
  mySpeechBubbleText = `💤 นอนหลับพักผ่อนใน${bedObj.roomName}...`;
  mySpeechTimer = 5.0;
  myChatSeq++;
  updateMyNametagHTML();
  updateHUD();
  savePlayerToRTDB();
  broadcastMyStateToRTDB();
  addLog(`🛏️ นอนพักและ<b>บันทึกจุดเซฟที่ ${bedObj.roomName}</b> เรียบร้อย! หากออกจากเกมตอนนี้ ครั้งต่อไปจะเกิดในห้องนี้ทันที`, "text-emerald-300 font-bold");
}

document.getElementById('btn-start-game').onclick = async () => {
  sound.sfxLevelUp();
  currentConfig.name = document.getElementById('char-name-input').value.trim() || currentUsername;
  currentConfig.rpTitle = document.getElementById('char-title-input').value.trim() || "นักผจญภัยพเนจร";
  playerStats.hp = playerStats.maxHp;
  playerStats.mp = playerStats.maxMp;
  playerStats.stamina = playerStats.maxStamina;
  await startWorldSession();
};

// ปิดการกลับไปสร้างตัวละครใหม่ (สร้างครั้งเดียวจบ)
document.getElementById('btn-open-customize').onclick = () => {
  sound.sfxClick();
  addLog("👗 สร้างตัวละครครั้งเดียวจบ! หากต้องการเปลี่ยนชุดสามารถไปเปลี่ยนได้ที่ร้านเสื้อผ้า (กำลังอัปเดตเร็วๆ นี้)", "text-amber-300 font-bold");
};

document.getElementById('slot-basic').onclick = queueOrPerformComboAttack;
document.getElementById('slot-skill1').onclick = () => triggerClassSkill(false);
document.getElementById('slot-ult').onclick = () => triggerClassSkill(true);
document.getElementById('slot-hp-pot').onclick = () => {
  if (playerStats.hpPots <= 0) return;
  playerStats.hpPots--;
  playerStats.hp = Math.min(playerStats.maxHp, playerStats.hp + 75);
  sound.sfxMagic();
  showFloatingDamage(playerChar3D.root.position, '+75 HP', '#fb7185');
  updateHUD();
};
document.getElementById('slot-mp-pot').onclick = () => {
  if (playerStats.mpPots <= 0) return;
  playerStats.mpPots--;
  playerStats.mp = Math.min(playerStats.maxMp, playerStats.mp + 55);
  sound.sfxMagic();
  showFloatingDamage(playerChar3D.root.position, '+55 MP', '#38bdf8');
  updateHUD();
};
document.getElementById('btn-open-inventory').onclick = () => {
  sound.sfxClick();
  renderInventoryModal();
  document.getElementById('modal-inventory').classList.toggle('hidden');
};
document.getElementById('btn-close-inventory').onclick = () => {
  document.getElementById('modal-inventory').classList.add('hidden');
};
document.getElementById('btn-close-shop').onclick = () => {
  document.getElementById('modal-shop').classList.add('hidden');
};
document.getElementById('btn-close-chef').onclick = () => {
  document.getElementById('modal-chef').classList.add('hidden');
};
const btnCloseInn = document.getElementById('btn-close-inn');
if (btnCloseInn) {
  btnCloseInn.onclick = () => {
    document.getElementById('modal-inn')?.classList.add('hidden');
  };
}
const btnCloseStorage = document.getElementById('btn-close-storage');
if (btnCloseStorage) {
  btnCloseStorage.onclick = () => {
    document.getElementById('modal-storage')?.classList.add('hidden');
  };
}
const btnWarpInn = document.getElementById('btn-warp-inn');
if (btnWarpInn) {
  btnWarpInn.onclick = () => {
    sound.sfxMagic();
    activeSittingSeat = null;
    activeSleepingBed = null;
    const wy = worldNoise.getHeight(-36, 9);
    playerChar3D.root.position.set(-36, wy + 0.3, 9);
    playerPhysics.vx = 0; playerPhysics.vy = 0; playerPhysics.vz = 0;
    playerPhysics.targetRotY = 0;
    playerChar3D.root.rotation.y = 0;
    playerChar3D.animState = 'idle';
    addLog("🏨 วาร์ปมาที่หน้า <b>โรงเตี๋ยมนักเดินทาง 2 ชั้น</b> เรียบร้อย! คลิกที่ประตูเพื่อเดินเข้าโถงชั้น 1 หรือเดินขึ้นบันไดไปชั้น 2 ได้เลย!", "text-amber-300 font-bold");
  };
}
document.getElementById('btn-claim-quest').onclick = () => {
  if (playerStats.questKills < playerStats.questTarget) return;
  sound.sfxLevelUp();
  const rewardGold = playerStats.questStep * 180;
  const rewardExp = playerStats.questStep * 95;
  playerStats.questKills = 0;
  playerStats.questStep++;
  playerStats.questTarget += 2;
  gainExpAndGold(rewardExp, rewardGold);
  addLog(`🏆 สำเร็จภารกิจกิลด์! รับรางวัล +${rewardGold} Gold และ +${rewardExp} EXP!`, "text-amber-300 font-bold");
};
document.getElementById('btn-start-game').onclick = async () => {
  sound.sfxLevelUp();
  sculptTooltip.classList.add('hidden');
  currentConfig.name = document.getElementById('char-name-input').value.trim() || currentUsername;
  currentConfig.rpTitle = document.getElementById('char-title-input').value.trim() || "นักผจญภัยพเนจร";
  rebuildPreviewCharacter();
  recalculateStats();
  playerStats.hp = playerStats.maxHp;
  playerStats.mp = playerStats.maxMp;
  playerStats.stamina = playerStats.maxStamina;
  document.getElementById('screen-creator').classList.add('hidden');
  document.getElementById('screen-hud').classList.remove('hidden');
  creatorPedestal.visible = false;
  worldGroup.visible = true;
  gameState = 'world';
  if (!worldBuilt) {
    buildAllGrandCities();
    worldBuilt = true;
  }
  const startY = worldNoise.getHeight(0, 12);
  playerChar3D.root.position.set(0, startY, 12);
  playerPhysics.vx = 0; playerPhysics.vy = 0; playerPhysics.vz = 0;
  playerChar3D.animState = 'idle';
  playerChar3D.setFirstPersonVisibility(cameraMode === 'fps');
  updateMyNametagHTML();
  initMultiplayerSync();
  await savePlayerToRTDB();
  broadcastMyStateToRTDB();
  addLog(`🌟 ยินดีต้อนรับ <b>${currentConfig.name} 《${currentConfig.rpTitle}》</b> เข้าสู่มหานครเอเธลการ์ด!`, "text-amber-300");
};
document.getElementById('btn-open-customize').onclick = () => {
  sound.sfxClick();
  if (document.pointerLockElement === renderer.domElement) document.exitPointerLock?.();
  fpsCrosshair.classList.add('hidden');
  gameState = 'creator';
  worldGroup.visible = false;
  creatorPedestal.visible = true;
  playerChar3D.root.position.set(0, 0, 0);
  playerChar3D.root.rotation.y = 0;
  playerChar3D.setFirstPersonVisibility(false);
  updateMyNametagHTML();
  document.getElementById('screen-hud').classList.add('hidden');
  document.getElementById('screen-creator').classList.remove('hidden');
};
document.querySelectorAll('.town-warp-btn').forEach(btn => {
  btn.onclick = () => {
    const town = TOWNS[Number(btn.dataset.town)];
    if (!town) return;
    sound.sfxMagic();
    const ty = worldNoise.getHeight(town.x, town.z + 12);
    playerChar3D.root.position.set(town.x, ty + 1.2, town.z + 12);
    playerPhysics.vx = 0; playerPhysics.vy = 2; playerPhysics.vz = 0;
    moveTargetPos = null;
    spawnWaterSplashRing(playerChar3D.root.position, town.themeColor, 3.0);
    broadcastMyStateToRTDB();
    addLog(`⚡ วาร์ปมายัง <b>${town.name}</b> เรียบร้อย!`, "text-emerald-300");
  };
});
// ============================================================================
// 12. KEYBOARD & WORLD CLICK CONTROLS
// ============================================================================
const keys = {};
// แปลงปุ่มกดให้รองรับทั้งปุ่มกายภาพ (e.code) และตัวอักษรภาษาไทย (แก้ปัญหาเผลอเปลี่ยนภาษาเป็นไทยแล้วเดินไม่ได้ 100%!)
const THAI_KEY_MAP = {
  'ไ': 'w', 'ำ': 'e', 'พ': 'r', 'ะ': 't', 'ั': 'y', 'ี': 'u', 'ร': 'i', 'น': 'o', 'ย': 'p',
  'ฟ': 'a', 'ห': 's', 'ก': 'd', 'ด': 'f', 'เ': 'g', '้': 'h', '่': 'j', 'า': 'k', 'ส': 'l',
  'ผ': 'z', 'ป': 'x', 'แ': 'c', 'อ': 'v', 'ิ': 'b', 'ื': 'n', 'ท': 'm',
  'ๆ': '1', '๑': '1', '/': '2', '๒': '2', '-': '3', '๓': '3', 'ภ': '4', '๔': '4'
};
const CODE_KEY_MAP = {
  KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd',
  KeyF: 'f', KeyE: 'e', KeyI: 'i', KeyV: 'v', KeyR: 'r',
  Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4',
  Space: ' ', ShiftLeft: 'shift', ShiftRight: 'shift',
  ArrowUp: 'arrowup', ArrowDown: 'arrowdown', ArrowLeft: 'arrowleft', ArrowRight: 'arrowright'
};
function resolveGameKey(e) {
  if (CODE_KEY_MAP[e.code]) return CODE_KEY_MAP[e.code];
  const raw = (e.key || '').toLowerCase();
  return THAI_KEY_MAP[raw] || raw;
}
window.addEventListener('keydown', (e) => {
  if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
  const k = resolveGameKey(e);
  keys[k] = true;
  if (gameState !== 'world') return;
  if (['w', 'a', 's', 'd', ' '].includes(k)) {
    if (ridingCarriage) {
      ridingCarriage = null;
      addLog("🐎 ลงจากรถม้าเรียบร้อยแล้ว", "text-amber-300");
    }
    if (activeSittingSeat) {
      activeSittingSeat = null;
      activeSeatTarget = null;
      playerChar3D.animState = 'idle';
    }
    if (activeSleepingBed) {
      activeSleepingBed = null;
      activeBedTarget = null;
      playerChar3D.animState = 'idle';
      playerChar3D.root.position.z -= 1.1;
      if (playerStats.savedSpawn) {
        playerStats.savedSpawn.isSleeping = false;
        savePlayerToRTDB();
      }
    }
  }
  if (k === 'f') queueOrPerformComboAttack();
  if (k === '1') triggerClassSkill(false);
  if (k === '2') triggerClassSkill(true);
  if (k === '3') document.getElementById('slot-hp-pot').click();
  if (k === '4') document.getElementById('slot-mp-pot').click();
  if (k === 'e') interactWithNearestObject(e.shiftKey);
  if (k === 'i') {
    releaseMouseForUI();
    document.getElementById('btn-open-inventory').click();
  }
  if (k === 'r') togglePlayerWeaponSheathe();
  if (k === 'v') cycleCameraMode();
  if (k === ' ' && (playerPhysics.jumpCount < 2 || playerPhysics.isInWater)) {
    playerPhysics.vy = playerPhysics.isInWater ? 7.5 : (playerPhysics.jumpCount === 0 ? 10.8 : 9.4);
    playerPhysics.isGrounded = false;
    playerPhysics.jumpCount++;
    sound.sfxJump();
  }
});
window.addEventListener('keyup', (e) => {
  const k = resolveGameKey(e);
  keys[k] = false;
});
window.addEventListener('wheel', (e) => {
  if (gameState === 'creator') {
    creatorCamDist = THREE.MathUtils.clamp(creatorCamDist + e.deltaY * 0.0025, 1.15, 5.2);
  } else if (gameState === 'world' && cameraMode !== 'fps') {
    cameraDist = Math.max(4.5, Math.min(34, cameraDist + e.deltaY * 0.012));
  }
});
renderer.domElement.addEventListener('click', (e) => {
  if (gameState !== 'world') return;
  if (cameraMode === 'tps' || cameraMode === 'fps') return;
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  // 1. คลิกที่จุดฟาร์มแร่/สมุนไพร/ข้าวสาลี
  const nodeMeshes = farmingNodes.filter(n => n.active).map(n => n.mesh);
  const nodeHits = raycaster.intersectObjects(nodeMeshes, true);
  if (nodeHits.length > 0) {
    let obj = nodeHits[0].object;
    while (obj && !obj.userData.isFarmNode) obj = obj.parent;
    if (obj && obj.userData.nodeRef) {
      sound.sfxClick();
      startGatheringNearestNode(obj.userData.nodeRef);
      return;
    }
  }
  // 2. คลิกที่มอนสเตอร์เพื่อโจมตีคอมโบ
  const monMeshes = monsters.filter(m => m.hp > 0 && m.mesh.visible).map(m => m.mesh);
  const monHits = raycaster.intersectObjects(monMeshes, true);
  if (monHits.length > 0) {
    let obj = monHits[0].object;
    while (obj && !obj.userData.isMonster) obj = obj.parent;
    if (obj && obj.userData.monsterRef) {
      targetMonster = obj.userData.monsterRef;
      updateTargetUI();
      queueOrPerformComboAttack();
      return;
    }
  }
  // 2.5 คลิกที่รถม้าเพื่อขึ้น/ลงรถม้าชมเมือง
  const carriageMeshes = animatedCarriages.map(c => c.group);
  const carriageHits = raycaster.intersectObjects(carriageMeshes, true);
  if (carriageHits.length > 0) {
    let obj = carriageHits[0].object;
    while (obj && !obj.userData?.isCarriage) obj = obj.parent;
    if (obj && obj.userData?.carriageRef) {
      sound.sfxClick();
      if (ridingCarriage === obj.userData.carriageRef) {
        ridingCarriage = null;
        addLog("🐎 ลงจากรถม้าเรียบร้อยแล้ว", "text-amber-300");
      } else {
        ridingCarriage = obj.userData.carriageRef;
        moveTargetPos = null;
        addLog(`🐎 ขึ้นนั่ง <b>${obj.userData.title}</b> ชมมหานคร! (กดปุ่มเดิน WASD หรือ Space เพื่อลงจากรถม้า)`, "text-emerald-300 font-bold");
      }
      return;
    }
  }
 // 2.6 คลิกที่ประตูบานพับ (คลิกปกติ = เปิด/ปิด | Shift+คลิก = ล็อค/ปลดล็อคประตูห้องพัก)
  const doorMeshes = interactiveDoors.map(d => d.hingePivot);
  const doorHits = raycaster.intersectObjects(doorMeshes, true);
  if (doorHits.length > 0) {
    let obj = doorHits[0].object;
    while (obj && !obj.userData?.isDoor) obj = obj.parent;
    if (obj && obj.userData?.doorRef) {
      toggleDoorState(obj.userData.doorRef, null, e.shiftKey);
      return;
    }
  }
  // 2.7 คลิกที่เก้าอี้ 3D ตัวไหนก็ได้ ➔ เดินเข้าไปนั่งเข้าที่ให้เองอัตโนมัติ!
  const seatMeshes = interactiveSeats.map(s => s.mesh);
  const seatHits = raycaster.intersectObjects(seatMeshes, true);
  if (seatHits.length > 0) {
    let obj = seatHits[0].object;
    while (obj && !obj.userData?.isSeat) obj = obj.parent;
    if (obj && obj.userData?.seatRef) {
      const seat = obj.userData.seatRef;
      const dist = Math.hypot(seat.wx - playerChar3D.root.position.x, seat.wz - playerChar3D.root.position.z);
      if (dist <= 4.2) {
        sitOnChairSeat(seat);
      } else {
        activeSittingSeat = null;
        activeSeatTarget = seat;
        moveTargetPos = new THREE.Vector3(seat.wx, seat.wy, seat.wz);
        sound.sfxClick();
        addLog(`🪑 กำลังเดินไปนั่งที่ <b>${seat.label}</b>...`, "text-sky-300");
      }
      return;
    }
  }
  // 2.8 คลิกที่เตียงนอนในห้องพักชั้น 2 ➔ เดินไปนอนพักผ่อนฟื้นฟูพลัง 100%
  const bedMeshes = interactiveBeds.map(b => b.mesh);
  const bedHits = raycaster.intersectObjects(bedMeshes, true);
  if (bedHits.length > 0) {
    let obj = bedHits[0].object;
    while (obj && !obj.userData?.isBed) obj = obj.parent;
    if (obj && obj.userData?.bedRef) {
      const bed = obj.userData.bedRef;
      const dist = Math.hypot(bed.wx - playerChar3D.root.position.x, bed.wz - playerChar3D.root.position.z);
      if (dist <= 4.8) {
        restOnInnBed(bed);
      } else {
        activeBedTarget = bed;
        moveTargetPos = new THREE.Vector3(bed.wx, bed.wy, bed.wz);
        sound.sfxClick();
      }
      return;
    }
  }
  // 2.9 คลิกที่ตู้เก็บของในห้องพักชั้น 2 ➔ เปิดหน้าต่างตู้เก็บของส่วนตัว
  const cabMeshes = interactiveCabinets.map(c => c.mesh);
  const cabHits = raycaster.intersectObjects(cabMeshes, true);
  if (cabHits.length > 0) {
    let obj = cabHits[0].object;
    while (obj && !obj.userData?.isCabinet) obj = obj.parent;
    if (obj && obj.userData?.cabinetRef) {
      const cab = obj.userData.cabinetRef;
      const keysArr = playerStats.roomKeys || [];
      if (cab.roomId && !keysArr.includes(cab.roomId)) {
        addLog(`🔒 ต้องมี <b>🔑 กุญแจห้องพัก ${cab.roomId}</b> ก่อนจึงจะเปิดตู้เก็บของประจำห้องนี้ได้!`, "text-amber-300");
        renderInnModal(cab.roomId);
        document.getElementById('modal-inn').classList.remove('hidden');
        return;
      }
      sound.sfxClick();
      renderRoomStorageModal(cab.roomId);
      document.getElementById('modal-storage').classList.remove('hidden');
      return;
    }
  }
  // 3. คลิกที่ NPC ประจำเมืองหรือชาวบ้าน
  const allNPCMeshes = [...npcs.map(n => n.root), ...wanderingNPCs.map(w => w.char3D.root)];
  const npcHits = raycaster.intersectObjects(allNPCMeshes, true);
  if (npcHits.length > 0) {
    let obj = npcHits[0].object;
    while (obj && !obj.userData.isNPC) obj = obj.parent;
    if (obj) {
      sound.sfxClick();
      const dx = obj.position.x - playerChar3D.root.position.x;
      const dz = obj.position.z - playerChar3D.root.position.z;
      if (Math.hypot(dx, dz) > 0.05) playerPhysics.targetRotY = Math.atan2(dx, dz);
      const role = obj.userData.role;
      if (role === 'shop') {
        renderBlacksmithShopModal();
        document.getElementById('modal-shop').classList.remove('hidden');
      } else if (role === 'food') {
        renderChefRestaurantModal();
        document.getElementById('modal-chef').classList.remove('hidden');
      } else if (role === 'tavern') {
        renderInnModal();
        document.getElementById('modal-inn').classList.remove('hidden');
        addLog(`🏨 <b>${obj.userData.npcName}</b>: "ยินดีต้อนรับสู่โรงเตี๋ยม 2 ชั้น! เลือกเช่าห้องพักชั่วคราวเพื่อรับกุญแจห้องขึ้นไปพักผ่อนบนชั้น 2 ได้เลย!"`, "text-amber-300");
      } else if (role === 'citizen') {
        addLog(`💬 <b>${obj.userData.npcName}</b>: "สวัสดีท่านผู้กล้า! ลองเดินดูรอบๆ หมู่บ้านและกองไฟแคมป์ปิ้งสิ คึกคักมากเลย!"`, "text-sky-300");
      } else {
        addLog(`🏰 <b>${obj.userData.npcName}</b>: "ปราบมอนสเตอร์นอกเมืองให้ครบ ${playerStats.questTarget} ตัว แล้วกดรับรางวัลที่หน้าต่างภารกิจกิลด์ได้เลย!"`, "text-emerald-300");
      }
      return;
    }
  }
  // 4. คลิกพื้นเพื่อเดินไปยังจุดหมาย
  const groundHits = raycaster.intersectObjects(terrainMeshes, false);
  if (groundHits.length > 0) {
    activeHarvestNode = null;
    activeSeatTarget = null;
    activeBedTarget = null;
    if (activeSittingSeat || activeSleepingBed) {
      activeSittingSeat = null;
      activeSleepingBed = null;
      playerChar3D.animState = 'idle';
    }
    document.getElementById('hud-gather-box').classList.add('hidden');
    moveTargetPos = groundHits[0].point.clone();
    spawnWaterSplashRing(moveTargetPos, 0x38bdf8, 1.1);
  }
});
// ============================================================================
// 13. MINIMAP RADAR (แสดงผู้เล่นออนไลน์คนอื่นในห้องเดียวกันด้วย!) & 3D FLOATING LABELS
// ============================================================================
const miniCanvas = document.getElementById('minimap-canvas');
const miniCtx = miniCanvas.getContext('2d');
function drawMinimap() {
  miniCtx.fillStyle = '#090d16';
  miniCtx.fillRect(0, 0, 215, 135);
  const px = playerChar3D.root.position.x;
  const pz = playerChar3D.root.position.z;
  const scale = 0.50;
  const cx = 107, cy = 67;
  miniCtx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
  miniCtx.beginPath();
  for (let x = 0; x < 215; x += 24) { miniCtx.moveTo(x, 0); miniCtx.lineTo(x, 135); }
  for (let y = 0; y < 135; y += 24) { miniCtx.moveTo(0, y); miniCtx.lineTo(215, y); }
  miniCtx.stroke();
  TOWNS.forEach(t => {
    const tx = cx + (t.x - px) * scale;
    const tz = cy + (t.z - pz) * scale;
    miniCtx.fillStyle = '#fbbf24';
    miniCtx.beginPath(); miniCtx.arc(tx, tz, 7, 0, Math.PI * 2); miniCtx.fill();
  });
  const radarMaxDist = gameSettings.minimapRadius || 110;
  farmingNodes.forEach(n => {
    if (!n.active) return;
    const nx = cx + (n.x - px) * scale;
    const nz = cy + (n.z - pz) * scale;
    if (nx > 0 && nx < 215 && nz > 0 && nz < 135) {
      miniCtx.fillStyle = '#38bdf8';
      miniCtx.fillRect(nx - 2, nz - 2, 4, 4);
    }
  });
  monsters.forEach(m => {
    if (m.hp <= 0 || !m.mesh.visible || Math.hypot(m.mesh.position.x - px, m.mesh.position.z - pz) > radarMaxDist) return;
    const mx = cx + (m.mesh.position.x - px) * scale;
    const mz = cy + (m.mesh.position.z - pz) * scale;
    if (mx > 0 && mx < 215 && mz > 0 && mz < 135) {
      miniCtx.fillStyle = '#f43f5e';
      miniCtx.beginPath(); miniCtx.arc(mx, mz, 2.3, 0, Math.PI * 2); miniCtx.fill();
    }
  });
  // วาดจุดผู้เล่นออนไลน์คนอื่นๆ ในห้องเดียวกันบน Minimap (จุดสีฟ้าสว่างพร้อมขอบขาว)
  remotePlayers.forEach(rp => {
    const rx = THREE.MathUtils.clamp(cx + (rp.char3D.root.position.x - px) * scale, 6, 209);
    const rz = THREE.MathUtils.clamp(cy + (rp.char3D.root.position.z - pz) * scale, 6, 129);
    miniCtx.fillStyle = '#22d3ee';
    miniCtx.strokeStyle = '#ffffff';
    miniCtx.lineWidth = 1.5;
    miniCtx.beginPath();
    miniCtx.arc(rx, rz, 4.2, 0, Math.PI * 2);
    miniCtx.fill();
    miniCtx.stroke();
  });
  // จุดตัวเราเอง
  miniCtx.fillStyle = '#34d399';
  miniCtx.beginPath(); miniCtx.arc(cx, cy, 4.5, 0, Math.PI * 2); miniCtx.fill();
}
const _tempLabelPos = new THREE.Vector3();

function isObjectAndParentsVisible(obj) {
  let cur = obj;
  while (cur) {
    if (!cur.visible) return false;
    cur = cur.parent;
  }
  return true;
}

function updateFloatingLabelsScreenPos() {
  const pPos = playerChar3D.root.position;
  for (let i = 0; i < floatingLabels.length; i++) {
    const item = floatingLabels[i];
    if (!item.targetObj3D || gameState !== 'world' || !isObjectAndParentsVisible(item.targetObj3D)) {
      if (item.el.style.display !== 'none') item.el.style.display = 'none';
      continue;
    }

    item.targetObj3D.getWorldPosition(_tempLabelPos);
    const dx = _tempLabelPos.x - pPos.x;
    const dz = _tempLabelPos.z - pPos.z;
    const dy = Math.abs(_tempLabelPos.y - pPos.y);
    const horizDistSq = dx * dx + dz * dz;

    // ซ่อนทันทีถ้าอยู่ห่างเกิน 11 เมตร หรืออยู่คนละชั้น (ต่างระดับความสูงเกิน 3.0 เมตร)
    const isSelfLabel = (item.targetObj3D === playerChar3D.root);
    if (!isSelfLabel && (horizDistSq > 121 || dy > 3.0)) {
      if (item.el.style.display !== 'none') item.el.style.display = 'none';
      continue;
    }

    _tempLabelPos.y += item.yOffset;
    _tempLabelPos.project(camera);
    if (_tempLabelPos.z > 1) {
      if (item.el.style.display !== 'none') item.el.style.display = 'none';
      continue;
    }

    if (item.el.style.display !== 'block') item.el.style.display = 'block';
    item.el.style.opacity = '1';
    const sx = (_tempLabelPos.x * 0.5 + 0.5) * window.innerWidth;
    const sy = (-(_tempLabelPos.y * 0.5) + 0.5) * window.innerHeight;
    item.el.style.left = `${sx}px`;
    item.el.style.top = `${sy}px`;
  }
}
// ============================================================================
// 14. MAIN GAME LOOP
// ============================================================================
const clock = new THREE.Clock();
let regenTick = 0;
let syncTick = 0;
let splashTick = 0;
let stepSoundTick = 0;
const _headWorldPos = new THREE.Vector3();
// ==================== แทนที่ฟังก์ชัน resolveCameraObstacleCollision เดิม ====================
const _camRaycaster = new THREE.Raycaster();
let _smoothedCamDist = 17;

function resolveCameraObstacleCollision(pivotPos, desiredCamPos, playerY) {
  const dir = desiredCamPos.clone().sub(pivotPos);
  const totalDist = dir.length();
  if (totalDist < 0.05) return desiredCamPos.clone();
  dir.normalize();

  let safeDist = totalDist;
  const camRadius = 0.28;
  // กำหนดระยะห่างขั้นต่ำจากตัวละคร (1.15m) เพื่อป้องกันไม่ให้กล้องถูกดันเข้ามาซ้อนในหัวหรือลำตัวตัวละครเด็ดขาด!
  const minAllowedDist = 1.15;

  // เช็คเฉพาะเมื่ออยู่ในอาคาร และไม่ได้เปิดโหมด 2.5D มองทะลุหลังคาจากมุมสูง
  const isCutawayTopView = (cameraMode === '2.5d' && cameraPitchAngle > 0.34) || cameraMode === 'bird';

  if (!isCutawayTopView) {
    for (let i = 0; i < enterableBuildings.length; i++) {
      const eb = enterableBuildings[i];
      const halfW = eb.width * 0.5 - 0.35;
      const halfD = eb.depth * 0.5 - 0.35;
      if (Math.abs(pivotPos.x - eb.wx) < halfW && Math.abs(pivotPos.z - eb.wz) < halfD) {
        const minX = eb.wx - halfW, maxX = eb.wx + halfW;
        const minZ = eb.wz - halfD, maxZ = eb.wz + halfD;
        const isUpper = eb.isTwoStory && (playerY >= eb.wy + eb.hFloor1 * 0.52);
        const minY = isUpper ? (eb.wy + eb.hFloor1 + 0.25) : ((eb.wy || 0) + 0.25);
        const maxY = eb.isTwoStory
          ? (isUpper ? eb.wy + eb.totalH - 0.25 : eb.wy + eb.hFloor1 - 0.25)
          : ((eb.wy || 0) + 4.8);

        const bounds = [
          [pivotPos.x, dir.x, minX, maxX],
          [pivotPos.y, dir.y, minY, maxY],
          [pivotPos.z, dir.z, minZ, maxZ]
        ];
        for (let a = 0; a < 3; a++) {
          const [orig, d, bMin, bMax] = bounds[a];
          if (d > 1e-5) {
            const t = (bMax - orig) / d;
            if (t > 0 && t < safeDist) safeDist = Math.max(minAllowedDist, t);
          } else if (d < -1e-5) {
            const t = (bMin - orig) / d;
            if (t > 0 && t < safeDist) safeDist = Math.max(minAllowedDist, t);
          }
        }
      }
    }
  }

  // เช็คการชนเฉพาะกับกำแพงและสิ่งก่อสร้างขนาดใหญ่ (ข้ามเก้าอี้ โต๊ะ ขั้นบันได และเฟอร์นิเจอร์เตี้ยๆ ไม่ให้ดีดกล้องเข้าหาตัวละคร)
  for (let c = 0; c < worldColliders.length; c++) {
    const col = worldColliders[c];
    if (col.disabled || col.stepable) continue;

    const topY = col.topY !== undefined ? col.topY : 999;
    const bottomY = col.bottomY !== undefined ? col.bottomY : -999;
    const colHeight = topY - (col.bottomY !== undefined ? col.bottomY : playerY);

    // ข้ามเฟอร์นิเจอร์เตี้ยๆ เช่น โต๊ะ เก้าอี้ เคาน์เตอร์บาร์ หรือรั้วเตี้ย (ที่มีความสูงไม่ถึง 2.2 เมตร)
    if (colHeight < 2.2) continue;

    let minX, maxX, minZ, maxZ;
    if (col.minX !== undefined && col.maxX !== undefined) {
      minX = col.minX - camRadius;
      maxX = col.maxX + camRadius;
      minZ = col.minZ - camRadius;
      maxZ = col.maxZ + camRadius;
    } else {
      const hw = col.halfW ?? col.hx ?? (col.w !== undefined ? col.w * 0.5 : (col.width !== undefined ? col.width * 0.5 : 0));
      const hd = col.halfD ?? col.hz ?? (col.d !== undefined ? col.d * 0.5 : (col.depth !== undefined ? col.depth * 0.5 : 0));
      if (hw > 0 && hd > 0 && col.x !== undefined) {
        minX = col.x - hw - camRadius;
        maxX = col.x + hw + camRadius;
        minZ = col.z - hd - camRadius;
        maxZ = col.z + hd + camRadius;
      }
    }

    if (minX !== undefined) {
      // ถ้าระนาบจุดหมุนกล้อง (ตัวผู้เล่น) ยืนชิดอยู่ในกรอบ Collider นั้นอยู่แล้ว ให้ข้ามเพื่อไม่ให้ตีกลับเป็นระยะ 0
      if (pivotPos.x >= minX && pivotPos.x <= maxX && pivotPos.z >= minZ && pivotPos.z <= maxZ) {
        continue;
      }
      const minY = bottomY - 0.1;
      const maxY = topY + 0.1;
      let tMin = 0, tMax = safeDist, hitBox = true;
      const axes = [
        [pivotPos.x, dir.x, minX, maxX],
        [pivotPos.y, dir.y, minY, maxY],
        [pivotPos.z, dir.z, minZ, maxZ]
      ];
      for (let a = 0; a < 3; a++) {
        const [orig, d, bMin, bMax] = axes[a];
        if (Math.abs(d) < 1e-6) {
          if (orig < bMin || orig > bMax) { hitBox = false; break; }
        } else {
          let t1 = (bMin - orig) / d;
          let t2 = (bMax - orig) / d;
          if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
          tMin = Math.max(tMin, t1);
          tMax = Math.min(tMax, t2);
          if (tMin > tMax) { hitBox = false; break; }
        }
      }
      if (hitBox && tMax > 0 && tMin > 0.35 && tMin < safeDist) {
        safeDist = Math.min(safeDist, Math.max(minAllowedDist, tMin - 0.15));
      }
    }
  }

  // ป้องกันกล้องมุดใต้พื้นดิน
  const finalPos = pivotPos.clone().addScaledVector(dir, safeDist);
  const finalGround = worldNoise.getHeight(finalPos.x, finalPos.z);
  finalPos.y = Math.max(finalPos.y, finalGround + 0.45);
  return finalPos;
}
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.elapsedTime;
  if (gameState === 'creator' || gameState === 'auth') {
    playerChar3D.root.position.set(0, 0, 0);
    const turnDelta = creatorYaw - playerPhysics.prevRotY;
    playerPhysics.prevRotY = creatorYaw;
    playerChar3D.root.rotation.y = creatorYaw;
    playerChar3D.updateAnimation(
      dt,
      playerChar3D.animState === 'walk' ? 0.85 : 0,
      false,
      0,
      turnDelta,
      playerChar3D.animState === 'swim'
    );
    const targetLook = new THREE.Vector3(creatorPanX, creatorPanY, 0);
    const desiredCam = new THREE.Vector3(
      creatorPanX,
      creatorPanY + Math.sin(creatorPitch) * creatorCamDist,
      Math.cos(creatorPitch) * creatorCamDist
    );
    camera.position.lerp(desiredCam, dt * 10);
    camera.lookAt(targetLook);
  } else if (gameState === 'world') {
    updateDynamicLighting(elapsed);
    const pPos = playerChar3D.root.position;
    // 1. อัปเดตวงจรวัน-คืน และสภาพอากาศตามธรรมชาติ
    updateDayNightAndNaturalWeather(elapsed, dt, pPos);
    // 2. เจน Chunks ตามระยะตั้งค่า และซ่อน Chunks / NPC / มอนสเตอร์ที่อยู่นอกระยะสายตาอัตโนมัติ
    updatePerformanceOptimization(dt, {
      playerPos: pPos,
      CHUNK_SIZE,
      chunkMap,
      generateChunk,
      monsters,
      wanderingNPCs,
      npcs,
      wildlifeList,
      farmingNodes,
      animatedCarriages,
      animatedCampfires
    });
    waterMesh.position.x = pPos.x;
    waterMesh.position.z = pPos.z;
    if (weatherParticles.visible) {
      weatherParticles.position.set(pPos.x, 0, pPos.z);
      const posAttr = weatherGeo.attributes.position;
      const fallSpeed = currentWeather === 'rain' ? 28 : currentWeather === 'snow' ? 6.5 : 4.8;
      for (let i = 0; i < WEATHER_COUNT; i++) {
        let py = posAttr.getY(i) - fallSpeed * dt;
        let px = posAttr.getX(i) + (currentWeather === 'sakura' ? Math.sin(elapsed * 2 + i) * 0.04 : 0);
        if (py < 0) py = 36;
        posAttr.setY(i, py);
        posAttr.setX(i, px);
      }
      posAttr.needsUpdate = true;
    }
    // 3. อัปเดตอนิเมชั่นกองไฟหมอกสีส้ม คริสตัลเมือง สัตว์ป่า (กระต่าย/กวาง/นก) และจุดฟาร์มทุกเฟรม!
    updateWorldEnvironment(dt, elapsed, wildlifeList, farmingNodes, interactiveDoors);
    // 3.1 อัปเดตรถม้าเคลื่อนที่รอบมหานคร (หมุนล้อ ขยับขาม้า และพาลูกค้าหรือผู้เล่นนั่งชมเมือง)
    animatedCarriages.forEach((car) => {
      if (car._culled && ridingCarriage !== car) return;
      const angStep = (car.speed / car.orbitRadius) * dt;
      car.angle += angStep;
      const nx = car.town.x + Math.cos(car.angle) * car.orbitRadius;
      const nz = car.town.z + Math.sin(car.angle) * car.orbitRadius;
      const dx = nx - car.group.position.x;
      const dz = nz - car.group.position.z;
      const gy = worldNoise.getHeight(nx, nz);
      car.group.position.set(nx, gy, nz);
      if (Math.hypot(dx, dz) > 0.001) {
        car.group.rotation.y = Math.atan2(dx, dz);
      }
      car.wheels.forEach(w => { w.rotation.x += dt * car.speed * 1.6; });
      car.horseLegs.forEach((leg, idx) => {
        leg.rotation.x = Math.sin(elapsed * 10 + (idx % 2) * Math.PI) * 0.45;
      });
      car.horseGroup.position.y = Math.abs(Math.sin(elapsed * 10)) * 0.06;
      if (ridingCarriage === car) {
        pPos.set(nx, gy + 1.15, nz);
        playerPhysics.vx = 0; playerPhysics.vy = 0; playerPhysics.vz = 0;
        playerPhysics.isGrounded = true;
        playerChar3D.animState = 'sit';
        playerPhysics.targetRotY = car.group.rotation.y;
      }
    });
    // 3.2 เปิดประตูหน้าอาคารอัตโนมัติเมื่อเดินเข้าใกล้ และสลับการมองเห็นชั้น 1 / ชั้น 2 ของโรงเตี๋ยม 2 ชั้นอัจฉริยะ!
    interactiveDoors.forEach((d) => {
      if (d.autoOpen && !d.roomId) {
        const distToDoor = Math.hypot(pPos.x - d.wx, pPos.z - d.wz);
        if (distToDoor < 3.4 && !d.isOpen) {
          d.isOpen = true;
          d.targetAngle = -Math.PI * 0.65;
          d.collider.disabled = true;
        } else if (distToDoor > 4.6 && d.isOpen) {
          d.isOpen = false;
          d.targetAngle = 0;
          d.collider.disabled = false;
        }
      }
    });
    // ==================== แทนที่ enterableBuildings.forEach ในส่วนที่ 3.2 ของ animate() ====================
    enterableBuildings.forEach((eb) => {
      const insideX = Math.abs(pPos.x - eb.wx) < eb.width * 0.54;
      const insideZ = Math.abs(pPos.z - eb.wz) < eb.depth * 0.54;
      const isInside = insideX && insideZ;

      const isTopDownCutaway =
        cameraMode === 'bird' ||
        (cameraMode === '2.5d' && cameraPitchAngle > 0.34);

      if (!isInside || cameraMode === 'fps' || cameraMode === 'tps' || !isTopDownCutaway) {
        // แสดงตัวอาคารเพดานและหลังคาครบทั้งหมด
        if (eb.isTwoStory) {
          eb.floor2Group.visible = true;
          if (eb.floor2PropsGroup) eb.floor2PropsGroup.visible = true;
          interactiveDoors.forEach(d => {
            if (d.roomId) d.hingePivot.visible = true;
          });
        }
        eb.roofGroup.visible = true;
      } else {
        // กรณีอยู่ด้านในอาคาร + ใช้โหมด 2.5D/Bird-Eye มองจากมุมสูง
        if (eb.isTwoStory) {
          const isOnUpperFloor = pPos.y >= eb.wy + eb.hFloor1 * 0.52;
          if (isOnUpperFloor) {
            eb.floor2Group.visible = true;
            if (eb.floor2PropsGroup) eb.floor2PropsGroup.visible = true;
            eb.roofGroup.visible = false;
          } else {
            eb.floor2Group.visible = false;
            if (eb.floor2PropsGroup) eb.floor2PropsGroup.visible = false;
            eb.roofGroup.visible = false;
          }
          interactiveDoors.forEach(d => {
            if (d.roomId) d.hingePivot.visible = eb.floor2Group.visible;
          });
        } else {
          eb.roofGroup.visible = false;
        }
      }
    });
    if (activeSittingSeat) {
      pPos.set(activeSittingSeat.wx, activeSittingSeat.wy, activeSittingSeat.wz);
      playerPhysics.vx = 0; playerPhysics.vy = 0; playerPhysics.vz = 0;
      playerPhysics.isGrounded = true;
      playerChar3D.animState = 'sit';
      playerPhysics.targetRotY = activeSittingSeat.rotY;
    } else if (activeSleepingBed) {
      pPos.set(activeSleepingBed.wx, activeSleepingBed.wy, activeSleepingBed.wz);
      playerPhysics.vx = 0; playerPhysics.vy = 0; playerPhysics.vz = 0;
      playerPhysics.isGrounded = true;
      playerChar3D.animState = 'sleep';
      playerPhysics.targetRotY = activeSleepingBed.rotY;
    }
    // 4. ระบบคิวต่อคอมโบอัตโนมัติ (Combo Input Buffering)
    if (comboInputQueued && playerChar3D.attackTimer <= 0.06) {
      executeComboAttackStep();
    }
    if (comboResetTimer > 0) {
      comboResetTimer -= dt;
      if (comboResetTimer <= 0) {
        currentComboStep = 1;
        document.getElementById('combo-step-label').textContent = 'คอมโบ 1';
      }
    }
    if (mySpeechTimer > 0) {
      mySpeechTimer -= dt;
      if (mySpeechTimer <= 0) {
        mySpeechBubbleText = "";
        updateMyNametagHTML();
      }
    }
    // 5. ระบบการเคลื่อนที่ WASD + ระบบวิ่งไว (Sprint) & หลอด Stamina
    let inputX = 0, inputZ = 0;
    if (keys['w'] || keys['arrowup']) inputZ -= 1;
    if (keys['s'] || keys['arrowdown']) inputZ += 1;
    if (keys['a'] || keys['arrowleft']) inputX -= 1;
    if (keys['d'] || keys['arrowright']) inputX += 1;
    const isTryingToMove = (inputX !== 0 || inputZ !== 0 || moveTargetPos !== null);
    const isSprinting = isTryingToMove && keys['shift'] && playerStats.stamina > 2;
    if (isSprinting) {
      playerStats.stamina = Math.max(0, playerStats.stamina - 6.0 * dt);
    } else {
      playerStats.stamina = Math.min(playerStats.maxStamina, playerStats.stamina + 16 * dt);
    }
    const sprintMult = isSprinting ? 2.40 : 1.0;
    const waterFactor = playerPhysics.isInWater ? 0.68 : 1.0;
    const maxSpeed = playerStats.spd * 0.82 * waterFactor * sprintMult;
    const accel = (isSprinting ? 68.0 : 46.0) * waterFactor;
    if (inputX !== 0 || inputZ !== 0) {
      moveTargetPos = null;
      if (activeHarvestNode) {
        activeHarvestNode = null;
        document.getElementById('hud-gather-box').classList.add('hidden');
      }
      if (['sit', 'wave', 'dance', 'kneel', 'harvest'].includes(playerChar3D.animState)) {
        playerChar3D.animState = 'idle';
      }
      const inputAngle = Math.atan2(inputX, inputZ) + cameraYawAngle;
      playerPhysics.vx += Math.sin(inputAngle) * accel * dt;
      playerPhysics.vz += Math.cos(inputAngle) * accel * dt;
      if (cameraMode !== 'fps') {
        playerPhysics.targetRotY = inputAngle;
      }
    } else if (moveTargetPos) {
      const dx = moveTargetPos.x - pPos.x;
      const dz = moveTargetPos.z - pPos.z;
      if (Math.hypot(dx, dz) > 0.6) {
        const ang = Math.atan2(dx, dz);
        playerPhysics.vx += Math.sin(ang) * accel * dt;
        playerPhysics.vz += Math.cos(ang) * accel * dt;
        playerPhysics.targetRotY = ang;
      } else {
        moveTargetPos = null;
        if (activeSeatTarget) {
          const s = activeSeatTarget;
          activeSeatTarget = null;
          sitOnChairSeat(s);
        } else if (activeBedTarget) {
          const b = activeBedTarget;
          activeBedTarget = null;
          restOnInnBed(b);
        } else if (activeHarvestNode && activeHarvestNode.active) {
          startGatheringNearestNode(activeHarvestNode);
        }
      }
    }
    playerChar3D.root.rotation.y = smoothRotateAngle(
      playerChar3D.root.rotation.y,
      playerPhysics.targetRotY,
      dt * 14
    );
    const damping = playerPhysics.isGrounded ? 8.5 : 3.5;
    playerPhysics.vx *= Math.exp(-damping * dt);
    playerPhysics.vz *= Math.exp(-damping * dt);
    const horizSpeed = Math.hypot(playerPhysics.vx, playerPhysics.vz);
    if (horizSpeed > maxSpeed) {
      playerPhysics.vx = (playerPhysics.vx / horizSpeed) * maxSpeed;
      playerPhysics.vz = (playerPhysics.vz / horizSpeed) * maxSpeed;
    }
    pPos.x += playerPhysics.vx * dt;
    pPos.z += playerPhysics.vz * dt;
    if (horizSpeed > 1.5 && playerPhysics.isGrounded && !playerPhysics.isInWater) {
      stepSoundTick += dt * (isSprinting ? 1.5 : 1.0);
      if (stepSoundTick > 0.34) {
        stepSoundTick = 0;
        sound.sfxStep();
      }
    }
    // 6. ตรวจจับการชนกำแพงเมือง รั้วหมู่บ้าน และบ้านทุกหลัง
    let supportY = worldNoise.getHeight(pPos.x, pPos.z);
    supportY = resolveWorldCollisions(pPos, 0.48, supportY, worldColliders);
    // 7. ฟิสิกส์การเดินลุยน้ำและว่ายน้ำ
    const wasInWater = playerPhysics.isInWater;
    const isSubmerged = supportY < WATER_LEVEL - 0.45;
    const isWading = supportY < WATER_LEVEL + 0.12 && !isSubmerged;
    playerPhysics.isInWater = isSubmerged;
    const waterStateEl = document.getElementById('hud-water-state');
    if (isSubmerged) {
      waterStateEl.textContent = "🏊 กำลังว่ายน้ำ";
      waterStateEl.className = "text-[10px] text-cyan-300 font-bold";
      if (!wasInWater) {
        sound.sfxSplash();
        spawnWaterSplashRing(pPos, 0xe0f2fe, 2.4);
      }
      const swimSurfaceY = WATER_LEVEL - 0.55;
      playerPhysics.vy -= 10.0 * dt;
      pPos.y += playerPhysics.vy * dt;
      if (pPos.y <= swimSurfaceY) {
        pPos.y = swimSurfaceY;
        playerPhysics.vy = 0;
        playerPhysics.isGrounded = true;
        playerPhysics.jumpCount = 0;
      }
      splashTick += dt;
      if (horizSpeed > 0.8 && splashTick > 0.32) {
        splashTick = 0;
        spawnWaterSplashRing(pPos, 0xe0f2fe, 1.5);
      }
    } else {
      if (isWading) {
        waterStateEl.textContent = "🌊 ลุยน้ำตื้น";
        waterStateEl.className = "text-[10px] text-sky-300";
        splashTick += dt;
        if (horizSpeed > 1.0 && splashTick > 0.38) {
          splashTick = 0;
          sound.sfxSplash();
          spawnWaterSplashRing(pPos, 0xbae6fd, 1.3);
        }
      } else {
        waterStateEl.textContent = isSprinting ? "⚡ กำลังวิ่งไว (Sprint)" : "🏃 อยู่บนบก";
        waterStateEl.className = isSprinting ? "text-[10px] text-amber-300 font-bold" : "text-[10px] text-emerald-300";
      }
      playerPhysics.vy -= 26.0 * dt;
      pPos.y += playerPhysics.vy * dt;
      if (pPos.y <= supportY) {
        pPos.y = supportY;
        playerPhysics.vy = 0;
        playerPhysics.isGrounded = true;
        playerPhysics.jumpCount = 0;
      } else {
        playerPhysics.isGrounded = false;
      }
    }
    // 8. อัปเดตความคืบหน้าการฟาร์มของ
    if (activeHarvestNode && activeHarvestNode.active && !moveTargetPos) {
      harvestProgress += dt * 0.75;
      document.getElementById('gather-bar').style.width = `${Math.min(100, harvestProgress * 100)}%`;
      if (harvestProgress >= 1.0) {
        const node = activeHarvestNode;
        activeHarvestNode = null;
        node.active = false;
        node.mesh.visible = false;
        if (!playerStats.cooldowns) playerStats.cooldowns = { monsters: {}, nodes: {} };
        playerStats.cooldowns.nodes[node.id] = Date.now() + RESPAWN_COOLDOWN_MS;

        playerChar3D.animState = 'idle';
        document.getElementById('hud-gather-box').classList.add('hidden');
        const matId = node.matId;
        const qty = 1 + Math.floor(Math.random() * 2);
        playerStats.inventory[matId] = (playerStats.inventory[matId] || 0) + qty;
        sound.sfxCoin();
        showFloatingDamage(pPos, `+${qty} ${node.icon} ${node.name}`, '#34d399');
        addLog(`⛏️ เก็บเกี่ยว <b>${node.icon} ${node.name} x${qty}</b> สำเร็จ! (จุดฟาร์มนี้จะเกิดใหม่ในอีก 20 นาที)`, "text-emerald-300");
        gainExpAndGold(25, 15);
        setTimeout(() => {
          node.active = true;
          node.mesh.visible = true;
          if (playerStats.cooldowns?.nodes) delete playerStats.cooldowns.nodes[node.id];
        }, RESPAWN_COOLDOWN_MS);
      }
    }
    const baseSpeed = playerStats.spd * 0.82 * waterFactor;
    const speedRatio = Math.min(2.4, horizSpeed / baseSpeed);
    const turnDelta = playerChar3D.root.rotation.y - playerPhysics.prevRotY;
    playerPhysics.prevRotY = playerChar3D.root.rotation.y;
    playerChar3D.updateAnimation(
      dt,
      speedRatio,
      !playerPhysics.isGrounded,
      playerPhysics.vy,
      turnDelta,
      playerPhysics.isInWater
    );
    // 9. อัปเดต NPC ประจำร้าน และชาวเมือง/ชาวบ้านที่เดินไปมาอย่างมีชีวิตชีวา
// ==================== แทนที่ส่วนที่ 9 ใน animate() (แก้ NPC เดินทะลุบ้าน/กำแพง) ====================
    npcs.forEach(n => { if (!n._culled) n.updateAnimation(dt, 0, false, 0, 0, false); });
    wanderingNPCs.forEach(w => {
      if (w._culled) return;
      if (w.pauseTimer > 0) {
        w.pauseTimer -= dt;
        w.char3D.updateAnimation(dt, 0, false, 0, 0, false);
      } else {
        if (!w.walkDir) w.walkDir = 1;
        const angStep = (w.speed / w.orbitRadius) * dt * w.walkDir;
        const nextAngle = w.angle + angStep;
        const candPos = new THREE.Vector3(
          w.townCenter.x + Math.cos(nextAngle) * w.orbitRadius,
          worldNoise.getHeight(w.townCenter.x + Math.cos(nextAngle) * w.orbitRadius, w.townCenter.z + Math.sin(nextAngle) * w.orbitRadius),
          w.townCenter.z + Math.sin(nextAngle) * w.orbitRadius
        );

        const beforeX = candPos.x;
        const beforeZ = candPos.z;
        // ตรวจสอบการชนกับบ้าน กำแพง และรั้วทุกชิ้นในโลก
        const supportY = resolveWorldCollisions(candPos, 0.52, candPos.y, worldColliders);
        const pushedDist = Math.hypot(candPos.x - beforeX, candPos.z - beforeZ);

        if (pushedDist > 0.01) {
          // หากชนบ้านหรือกำแพง ให้ NPC กลับหลังหันเดินไปอีกฝั่งทันที ไม่เดินทะลุสิ่งกีดขวาง!
          w.walkDir *= -1;
          w.pauseTimer = 0.45;
        } else {
          w.angle = nextAngle;
        }

        const dx = candPos.x - w.char3D.root.position.x;
        const dz = candPos.z - w.char3D.root.position.z;
        w.char3D.root.position.set(candPos.x, supportY, candPos.z);
        if (Math.hypot(dx, dz) > 0.001) {
          w.char3D.root.rotation.y = smoothRotateAngle(w.char3D.root.rotation.y, Math.atan2(dx, dz), dt * 10);
        }
        w.char3D.updateAnimation(dt, 0.72, false, 0, 0, false);
        if (Math.random() < 0.002) w.pauseTimer = 2.5 + Math.random() * 2.5;
      }

      w.chatTimer -= dt;
      if (w.chatTimer <= 0) {
        w.chatTimer = 9 + Math.random() * 10;
        const line = w.chatterPool[Math.floor(Math.random() * w.chatterPool.length)];
        w.labelItem.el.innerHTML = `
          <div class="rp-speech-bubble">${line}</div>
          <div class="px-2 py-0.5 rounded-full bg-slate-900/80 border border-slate-600 text-[9px] text-slate-200">${w.title}</div>
        `;
        setTimeout(() => {
          w.labelItem.el.innerHTML = `<div class="px-2 py-0.5 rounded-full bg-slate-900/80 border border-slate-600 text-[9px] text-slate-200">${w.title}</div>`;
        }, 4200);
      }
    });
    // 10. อัปเดตผู้เล่นออนไลน์คนอื่นในห้องเดียวกัน (พร้อมลบคนที่ออกเกมไปแล้วอัตโนมัติ)
    const nowPerf = performance.now();
    remotePlayers.forEach((rp, cid) => {
      if (nowPerf - rp.lastLocalSeen > 22000) {
        removeRemotePlayer(cid);
        return;
      }
      const dist = rp.char3D.root.position.distanceTo(rp.targetPos);
      if (dist > 35) {
        rp.char3D.root.position.copy(rp.targetPos);
      } else {
        rp.char3D.root.position.lerp(rp.targetPos, Math.min(1, dt * 12));
      }
      const prevRot = rp.char3D.root.rotation.y;
      rp.char3D.root.rotation.y = smoothRotateAngle(prevRot, rp.targetRotY, dt * 12);
      const rpTurnDelta = rp.char3D.root.rotation.y - prevRot;
      rp.char3D.animState = rp.animState;
      const moveSpdRatio = Math.max(rp.speedRatio || 0, dist > 0.08 ? 0.85 : 0);
      rp.char3D.updateAnimation(
        dt,
        moveSpdRatio,
        rp.isJumping,
        0,
        rpTurnDelta,
        rp.targetPos.y < WATER_LEVEL - 0.3
      );
    });
    // 11. อัปเดตมุมกล้องทั้ง 4 โหมด:
    //     - POV 1 (fps): เกาะตรงกับตำแหน่งหัว/ดวงตาจริงของโมเดลตัวละคร 100% และซ่อนส่วนหัว/ลำตัวไม่ให้บังจอ
    //     - POV 3 (tps): มุมมอง Over-the-Shoulder เยื้องไหล่ขวา ทำให้ตัวละครไม่บังเป้าเล็งตรงกลางจอ!
 // ==================== แทนที่ส่วนที่ 11 ใน animate() ====================
    playerChar3D.root.updateMatrixWorld(true);
    if (cameraMode === 'fps') {
      playerChar3D.setFirstPersonVisibility(true);
      if (playerChar3D.joints.head) {
        playerChar3D.joints.head.getWorldPosition(_headWorldPos);
      } else {
        _headWorldPos.set(pPos.x, pPos.y + 1.55 * currentConfig.heightScale, pPos.z);
      }
      const hScale = (Number(currentConfig.heightScale) || 1.0) * (Number(currentConfig.headSize) || 1.0);
      const lookDirX = -Math.sin(cameraYawAngle) * Math.cos(cameraPitchAngle);
      const lookDirY = -Math.sin(cameraPitchAngle);
      const lookDirZ = -Math.cos(cameraYawAngle) * Math.cos(cameraPitchAngle);
      camera.position.set(
        _headWorldPos.x + lookDirX * 0.14,
        _headWorldPos.y + 0.25 * hScale,
        _headWorldPos.z + lookDirZ * 0.14
      );
      camera.lookAt(
        camera.position.x + lookDirX * 12,
        camera.position.y + lookDirY * 12,
        camera.position.z + lookDirZ * 12
      );
    } else if (cameraMode === 'tps') {
      playerChar3D.setFirstPersonVisibility(false);
      const hScale = Number(currentConfig.heightScale) || 1.0;
      const tpsDist = THREE.MathUtils.clamp(cameraDist * 0.34, 3.0, 5.6);
      const rightX = Math.cos(cameraYawAngle);
      const rightZ = -Math.sin(cameraYawAngle);
      const shoulderOffset = 0.58 * hScale;

      const centerHead = new THREE.Vector3(pPos.x, pPos.y + 1.50 * hScale, pPos.z);
      const rawPivot = new THREE.Vector3(
        pPos.x + rightX * shoulderOffset,
        pPos.y + 1.50 * hScale,
        pPos.z + rightZ * shoulderOffset
      );
      const pivotPos = rawPivot;

      const camBackX = Math.sin(cameraYawAngle) * Math.cos(cameraPitchAngle) * tpsDist;
      const camBackY = Math.sin(cameraPitchAngle) * tpsDist + 0.35;
      const camBackZ = Math.cos(cameraYawAngle) * Math.cos(cameraPitchAngle) * tpsDist;
      const rawDesiredCamPos = new THREE.Vector3(
        pivotPos.x + camBackX,
        pivotPos.y + camBackY,
        pivotPos.z + camBackZ
      );

      const safeCamPos = resolveCameraObstacleCollision(pivotPos, rawDesiredCamPos, pPos.y);
      const hitDist = safeCamPos.distanceTo(pivotPos);

      // หากมีกำแพงบังให้ดึงกล้องเข้ามาหน้ากำแพงทันที (ไม่ใช้ lerp ลอยทะลุกำแพง)
      if (hitDist < _smoothedCamDist) {
        _smoothedCamDist = hitDist;
      } else {
        _smoothedCamDist = THREE.MathUtils.lerp(_smoothedCamDist, hitDist, Math.min(1, dt * 10));
      }

      const camDir = safeCamPos.clone().sub(pivotPos).normalize();
      camera.position.copy(pivotPos).addScaledVector(camDir, _smoothedCamDist);

      const aimForwardX = -Math.sin(cameraYawAngle) * Math.cos(cameraPitchAngle);
      const aimForwardY = -Math.sin(cameraPitchAngle);
      const aimForwardZ = -Math.cos(cameraYawAngle) * Math.cos(cameraPitchAngle);
      camera.lookAt(
        pivotPos.x + aimForwardX * 20,
        pivotPos.y + aimForwardY * 20,
        pivotPos.z + aimForwardZ * 20
      );
    } else if (cameraMode === 'bird') {
      playerChar3D.setFirstPersonVisibility(false);
      const birdOffset = new THREE.Vector3(
        Math.sin(cameraYawAngle) * 8,
        29,
        Math.cos(cameraYawAngle) * 8
      );
      camera.position.lerp(pPos.clone().add(birdOffset), dt * 8);
      camera.lookAt(pPos.x, pPos.y + 1.0, pPos.z);
    } else {
      // โหมด 2.5D พร้อมระบบดึงกล้องเข้าในห้องทันทีเมื่อติดกำแพงหรือเพดาน
      playerChar3D.setFirstPersonVisibility(false);
      const pivot25D = new THREE.Vector3(pPos.x, pPos.y + 1.30, pPos.z);
      const camOffset = new THREE.Vector3(
        Math.sin(cameraYawAngle) * Math.cos(cameraPitchAngle) * cameraDist,
        Math.sin(cameraPitchAngle) * cameraDist + 0.8,
        Math.cos(cameraYawAngle) * Math.cos(cameraPitchAngle) * cameraDist
      );
      const rawDesired25D = pivot25D.clone().add(camOffset);
      const safeCam25D = resolveCameraObstacleCollision(pivot25D, rawDesired25D, pPos.y);
      const hitDist25D = safeCam25D.distanceTo(pivot25D);

      if (hitDist25D < _smoothedCamDist) {
        _smoothedCamDist = hitDist25D;
      } else {
        _smoothedCamDist = THREE.MathUtils.lerp(_smoothedCamDist, hitDist25D, Math.min(1, dt * 10));
      }

      const camDir25D = safeCam25D.clone().sub(pivot25D).normalize();
      camera.position.copy(pivot25D).addScaledVector(camDir25D, _smoothedCamDist);
      camera.lookAt(pPos.x, pPos.y + 1.15, pPos.z);
    }
    dirLight.target.position.copy(pPos);
    dirLight.target.updateMatrixWorld();
    // 12. อัปเดตมอนสเตอร์ AI (เดินลาดตระเวนอัตโนมัติเมื่อผู้เล่นอยู่ไกล + ไล่ล่าโจมตี + เล่นอนิเมชั่นครบทุกตัว!)
    monsters.forEach(m => {
      if (m.hp <= 0 || m._culled || !m.mesh.visible) return;
      const dist = pPos.distanceTo(m.mesh.position);
      if (dist > 95) return;
      const groundM = worldNoise.getHeight(m.mesh.position.x, m.mesh.position.z);
      m.mesh.position.x += m.vx * dt;
      m.mesh.position.z += m.vz * dt;
      m.vx *= Math.exp(-6 * dt);
      m.vz *= Math.exp(-6 * dt);
      m.vy -= 24 * dt;
      m.mesh.position.y += m.vy * dt;
      if (m.mesh.position.y <= groundM) {
        m.mesh.position.y = groundM;
        m.vy = 0;
      }
      let isMonMoving = false;
      if (dist < 12.0 && dist > 1.85 && Math.hypot(m.vx, m.vz) < 1.5) {
        // ไล่ล่าผู้เล่นเมื่อเข้าใกล้
        isMonMoving = true;
        const ang = Math.atan2(pPos.x - m.mesh.position.x, pPos.z - m.mesh.position.z);
        m.mesh.rotation.y = smoothRotateAngle(m.mesh.rotation.y, ang, dt * 10);
        m.mesh.position.x += Math.sin(ang) * 3.3 * dt;
        m.mesh.position.z += Math.cos(ang) * 3.3 * dt;
      } else if (dist <= 2.1) {
        m.atkCooldown -= dt;
        if (m.atkCooldown <= 0) {
          m.atkCooldown = 1.6;
          const rawDmg = Math.max(2, Math.round(m.atk - playerStats.def * 0.45));
          const finalDmg = currentConfig.classId === 'tank' ? Math.round(rawDmg * 0.7) : rawDmg;
          playerStats.hp = Math.max(1, playerStats.hp - finalDmg);
          const pushAng = Math.atan2(pPos.x - m.mesh.position.x, pPos.z - m.mesh.position.z);
          playerPhysics.vx += Math.sin(pushAng) * 5.2;
          playerPhysics.vz += Math.cos(pushAng) * 5.2;
          sound.sfxHit();
          showFloatingDamage(pPos, `-${finalDmg}`, '#fb7185');
          updateHUD();
        }
      } else if (Math.hypot(m.vx, m.vz) < 0.5) {
        // เดินลาดตระเวนรอบจุดเกิด (Patrol AI) เพื่อให้มอนสเตอร์ทุกตัวขยับและมีอนิเมชั่นตลอดเวลา!
        if (m.patrolPause > 0) {
          m.patrolPause -= dt;
        } else {
          isMonMoving = true;
          m.patrolAngle += dt * 0.85;
          const targetPx = m.spawnX + Math.cos(m.patrolAngle) * m.patrolRadius;
          const targetPz = m.spawnZ + Math.sin(m.patrolAngle) * m.patrolRadius;
          const dx = targetPx - m.mesh.position.x;
          const dz = targetPz - m.mesh.position.z;
          if (Math.hypot(dx, dz) > 0.05) {
            const ang = Math.atan2(dx, dz);
            m.mesh.rotation.y = smoothRotateAngle(m.mesh.rotation.y, ang, dt * 7);
          }
          m.mesh.position.x = targetPx;
          m.mesh.position.z = targetPz;
          if (Math.random() < 0.004) {
            m.patrolPause = 1.2 + Math.random() * 1.8;
          }
        }
      }
      updateMonsterAnimation(m, dt, elapsed, isMonMoving);
    });
    // 13. อัปเดตฟิสิกส์ของดรอป
    for (let i = physicsLootDrops.length - 1; i >= 0; i--) {
      const item = physicsLootDrops[i];
      item.age += dt;
      item.mesh.rotation.y += dt * 4;
      item.mesh.position.x += item.vx * dt;
      item.mesh.position.z += item.vz * dt;
      item.vy -= 22 * dt;
      item.mesh.position.y += item.vy * dt;
      const gh = Math.max(WATER_LEVEL, worldNoise.getHeight(item.mesh.position.x, item.mesh.position.z)) + 0.25;
      if (item.mesh.position.y < gh) {
        item.mesh.position.y = gh;
        item.vy = Math.abs(item.vy) * 0.55;
        item.vx *= 0.75;
        item.vz *= 0.75;
      }
      const dToPlayer = item.mesh.position.distanceTo(pPos);
      if (item.age > 0.45 && dToPlayer < 9.5) {
        item.mesh.position.lerp(new THREE.Vector3(pPos.x, pPos.y + 1.0, pPos.z), dt * 10);
        if (dToPlayer < 1.35) {
          sound.sfxCoin();
          if (item.exp > 0 || item.gold > 0 || item.dropMat) {
            gainExpAndGold(item.exp, item.gold, item.dropMat);
          }
          worldGroup.remove(item.mesh);
          physicsLootDrops.splice(i, 1);
        }
      }
    }
    skillFX.update(dt);
    for (let i = vfxRings.length - 1; i >= 0; i--) {
      const v = vfxRings[i];
      v.age += dt * 2.8;
      const s = 1 + v.age * v.maxRadius;
      v.mesh.scale.set(s, s, 1);
      v.mesh.material.opacity = Math.max(0, 0.9 - v.age);
      if (v.age >= 0.9) {
        worldGroup.remove(v.mesh);
        vfxRings.splice(i, 1);
      }
    }
    ['skill1', 'ult'].forEach(k => {
      if (skillCooldowns[k] > 0) {
        skillCooldowns[k] = Math.max(0, skillCooldowns[k] - dt);
        const el = document.getElementById(k === 'skill1' ? 'cd-skill1' : 'cd-ult');
        if (skillCooldowns[k] > 0) {
          el.classList.remove('hidden');
          el.textContent = skillCooldowns[k].toFixed(1) + 's';
        } else {
          el.classList.add('hidden');
        }
      }
    });
    syncTick += dt;
    if (syncTick >= 0.18) {
      syncTick = 0;
      broadcastMyStateToRTDB();
    }
    regenTick += dt;
    if (regenTick >= 0.5) {
      regenTick = 0;
      if (playerStats.savedSpawn && !isPositionInsideInn(pPos)) {
        playerStats.savedSpawn = null;
        savePlayerToRTDB();
      }
      playerStats.hp = Math.min(playerStats.maxHp, playerStats.hp + (currentConfig.classId === 'support' ? 3 : 1));
      playerStats.mp = Math.min(playerStats.maxMp, playerStats.mp + (currentConfig.classId === 'mage' ? 4 : 1.5));
      document.getElementById('hud-coords').textContent = `${Math.round(pPos.x)}, ${Math.round(pPos.z)}`;
      document.getElementById('hud-biome').textContent = `📍 ${worldNoise.getBiome(pPos.x, pPos.z)}`;
      updateHUD();
      drawMinimap();
    }
    updateFloatingLabelsScreenPos();
  }
  // เรนเดอร์ผ่าน Post-Processing หรือเรนเดอร์ตรงความเร็วสูงหากผู้เล่นปิด Reshade ในตั้งค่า
  if (gameSettings.usePostProc) {
    postProc.composer.render();
  } else {
    renderer.render(scene, camera);
  }
}
  initSettingsUI(
    { renderer, scene, camera, dirLight, postProc, weatherParticles, CHUNK_SIZE },
    () => {},
    releaseMouseForUI
  );

animate();
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  postProc.setSize(window.innerWidth, window.innerHeight);
});
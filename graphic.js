// ==================== ไฟล์ใหม่: graphic.js ====================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createAnimeMaterial, getVolumetricMistTexture } from './shaders.js';

export const graphicsConfig = {
  clothPhysics: true,
  lightDispersion: true
};

const maxActivePhysicalGlowLights = 8;
const glowLightPosition = new THREE.Vector3();
const glowCellSize = 48;
const glowLightCells = new Map();
let dispersionLightUpdateTimer = 0;
const activePhysicalGlowLights = new Set();
const gltfLoader = new GLTFLoader();
const loadedGLTFModels = {};

// 1. เพิ่ม import ด้านบนสุดของไฟล์ graphic.js
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { registerGLTFAnimation } from './anim.js';

// 2. แทนที่ preloadOnline3DAssets และ upgradeEntitiesWithOnlineAssets เดิมด้วยโค้ดนี้:
export function preloadOnline3DAssets(onLoadedCallback) {
  if (Object.keys(loadedGLTFModels).length > 0) {
    if (onLoadedCallback) onLoadedCallback(loadedGLTFModels);
    return;
  }
  if (onLoadedCallback) pendingAssetCallbacks.push(onLoadedCallback);
  if (isPreloadingAssets) return;
  isPreloadingAssets = true;

  const assetList = {
    horse: 'https://threejs.org/examples/models/gltf/Horse.glb',
    flamingo: 'https://threejs.org/examples/models/gltf/Flamingo.glb',
    parrot: 'https://threejs.org/examples/models/gltf/Parrot.glb'
  };
  let remaining = Object.keys(assetList).length;
  const finishOne = () => {
    remaining--;
    if (remaining === 0) {
      while (pendingAssetCallbacks.length > 0) {
        const cb = pendingAssetCallbacks.shift();
        cb(loadedGLTFModels);
      }
    }
  };

  Object.entries(assetList).forEach(([key, url]) => {
    gltfLoader.load(
      url,
      (gltf) => {
        // เก็บทั้ง scene และ animations เพื่อให้ม้าและสัตว์มีอนิเมชั่นวิ่ง/บินจริง!
        loadedGLTFModels[key] = { scene: gltf.scene, animations: gltf.animations || [] };
        finishOne();
      },
      undefined,
      () => finishOne()
    );
  });
}

export function upgradeEntitiesWithOnlineAssets(animatedCarriages = [], wildlifeList = [], monsters = [], enterableBuildings = []) {
  preloadOnline3DAssets((models) => {
    // 1) อัปเกรดรถม้าพร้อมผูก AnimationMixer ให้ม้าวิ่งสมจริง (ไม่แข็งทื่อ)
    for (let i = 0; i < animatedCarriages.length; i++) {
      const car = animatedCarriages[i];
      if (car._upgradedAsset) continue;
      car._upgradedAsset = true;
      if (models.horse?.scene && car.horseGroup) {
        while (car.horseGroup.children.length > 0) car.horseGroup.remove(car.horseGroup.children[0]);
        const horseClone = SkeletonUtils.clone(models.horse.scene);
        horseClone.scale.setScalar(0.012);
        horseClone.position.set(0, 0, 0.4);
        car.horseGroup.add(horseClone);
        car.horseMesh = horseClone;
        car.horseLegs = [];
        registerGLTFAnimation(horseClone, models.horse.animations, 1.35);
      }
    }

    // 2) อัปเกรดสัตว์ป่า (นกแก้ว, นกฟลามิงโก้, กวาง/ม้าป่า) พร้อมอนิเมชั่นจริงทั้งหมด
    for (let i = 0; i < wildlifeList.length; i++) {
      const w = wildlifeList[i];
      if (w._upgradedAsset) continue;
      w._upgradedAsset = true;
      if (w.type === 'bird' && (models.parrot?.scene || models.flamingo?.scene)) {
        while (w.mesh.children.length > 0) w.mesh.remove(w.mesh.children[0]);
        const useFlamingo = i % 2 === 1 && models.flamingo?.scene;
        const asset = useFlamingo ? models.flamingo : models.parrot;
        const birdClone = SkeletonUtils.clone(asset.scene);
        birdClone.scale.setScalar(useFlamingo ? 0.018 : 0.025);
        w.mesh.add(birdClone);
        registerGLTFAnimation(birdClone, asset.animations, 1.4);
      } else if (w.type === 'deer' && models.horse?.scene) {
        while (w.mesh.children.length > 0) w.mesh.remove(w.mesh.children[0]);
        const deerClone = SkeletonUtils.clone(models.horse.scene);
        deerClone.scale.setScalar(0.0085);
        w.mesh.add(deerClone);
        registerGLTFAnimation(deerClone, models.horse.animations, 1.1);
      }
    }
  });
}

// 3. ระบบกระจายแสงแบบ Zero-Lag (ใช้ Volumetric Halo + Ground Light Pool แทนการสร้าง PointLight ร้อยดวง!)
const sharedGlowCircleGeo = new THREE.CircleGeometry(1.0, 16);
const glowMatCache = new Map();
const spriteMatCache = new Map();

export function attachLightDispersion(parentGroup, colorHex = 0x38bdf8, intensity = 6.5, radius = 32) {
  const holder = new THREE.Group();

  let haloMat = spriteMatCache.get(colorHex);
  if (!haloMat) {
    haloMat = new THREE.SpriteMaterial({
      map: getVolumetricMistTexture(),
      color: colorHex,
      transparent: true,
      opacity: 0.82,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    spriteMatCache.set(colorHex, haloMat);
  }
  const haloSprite = new THREE.Sprite(haloMat);
  haloSprite.scale.set(5.5, 5.5, 5.5);
  haloSprite.position.set(0, 1.2, 0);
  holder.add(haloSprite);

  let poolMat = glowMatCache.get(colorHex);
  if (!poolMat) {
    poolMat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.38,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    glowMatCache.set(colorHex, poolMat);
  }
  const groundGlow = new THREE.Mesh(sharedGlowCircleGeo, poolMat);
  groundGlow.scale.setScalar(radius * 0.25);
  groundGlow.rotation.x = -Math.PI / 2;
  groundGlow.position.y = 0.08;
  holder.add(groundGlow);

  const pointLight = new THREE.PointLight(
    colorHex,
    THREE.MathUtils.clamp(intensity * 0.55, 0.8, 4.5),
    radius,
    1.5
  );
  pointLight.position.set(0, 1.5, 0);
  pointLight.visible = false;
  holder.add(pointLight);

  parentGroup.userData.hasPhysicalGlow = true;
  parentGroup.add(holder);
  pointLight.getWorldPosition(glowLightPosition);
  const cellX = Math.floor(glowLightPosition.x / glowCellSize);
  const cellZ = Math.floor(glowLightPosition.z / glowCellSize);
  const cellKey = `${cellX},${cellZ}`;
  let cell = glowLightCells.get(cellKey);
  if (!cell) {
    cell = [];
    glowLightCells.set(cellKey, cell);
  }
  cell.push({ light: pointLight, radius });
  return holder;
}

// ยกระดับชุดแฟชั่นและอุปกรณ์อาวุธด้วย Halo Sprite (ไร้ PointLight เพื่อไม่ให้กระตุกเมื่อมี NPC หลายคน)
export function upgradeCharacterFashionAndEquipment(charInstance) {
  if (!charInstance || !charInstance.root) return;
  const weaponId = charInstance.config?.weaponId || 'sword_iron';
  const isHighTier = ['sword_flame', 'staff_void', 'bow_wind', 'shield_aegis', 'tome_seraph'].includes(weaponId);

  if (charInstance.joints?.handR && isHighTier) {
    const auraColor = weaponId === 'sword_flame' ? 0xf97316
      : weaponId === 'staff_void' ? 0xa855f7
      : weaponId === 'bow_wind' ? 0x10b981
      : 0xfbbf24;
    let mat = spriteMatCache.get(auraColor);
    if (!mat) {
      mat = new THREE.SpriteMaterial({
        map: getVolumetricMistTexture(),
        color: auraColor,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      spriteMatCache.set(auraColor, mat);
    }
    const auraSprite = new THREE.Sprite(mat);
    auraSprite.scale.set(0.85, 0.85, 0.85);
    auraSprite.position.set(0, 0.35, 0);
    charInstance.joints.handR.add(auraSprite);
  }
}

// ฟังก์ชันใหม่: ปรับปรุง UX/UI ให้ทันสมัยขึ้น (Modern Glassmorphism & Hotbar Polish)
export function injectModernUXUIPolish() {
  if (document.getElementById('modern-ux-style')) return;
  const style = document.createElement('style');
  style.id = 'modern-ux-style';
  style.textContent = `
    .glass {
      backdrop-filter: blur(16px) saturate(180%) !important;
      background: linear-gradient(135deg, rgba(15, 23, 42, 0.82), rgba(30, 41, 59, 0.68)) !important;
      box-shadow: 0 10px 30px -5px rgba(0, 0, 0, 0.6), inset 0 1px 1px rgba(255, 255, 255, 0.15) !important;
    }
    #screen-hud button {
      transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1) !important;
    }
    #screen-hud button:hover {
      transform: translateY(-2px) scale(1.04);
      box-shadow: 0 0 16px rgba(251, 191, 36, 0.35);
    }
    #screen-hud button:active {
      transform: translateY(0px) scale(0.96);
    }
    #hud-target-box {
      width: min(20rem, calc(100vw - 1.5rem)) !important;
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
    }
    #hud-target-box.is-boss {
      border-color: rgba(251, 113, 133, 0.9) !important;
      box-shadow: 0 0 26px rgba(244, 63, 94, 0.3), inset 0 1px 1px rgba(255, 255, 255, 0.18) !important;
    }
    #hud-target-box.is-boss #target-hp-bar {
      background: linear-gradient(90deg, #be123c, #f97316, #fbbf24) !important;
    }
    #modal-fishing-minigame, #modal-campfire-cook {
      right: 1.25rem !important;
      bottom: 6.5rem !important;
      animation: slideInSide 0.22s ease-out;
    }
    @keyframes slideInSide {
      from { opacity: 0; transform: translateX(24px); }
      to { opacity: 1; transform: translateX(0); }
    }
    @media (max-width: 640px) {
      #hud-target-box { top: 3.75rem !important; padding: 0.55rem 0.7rem !important; }
      #hud-target-box #target-zone { max-width: 7rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    }
  `;
  document.head.appendChild(style);
}

// 4. สร้างรูปปั้นประจำเมืองทั้ง 4 แห่ง (Unique Monument Statues)
export function replaceTownCrystalsWithStatues(TOWNS, animatedTownCrystals, worldGroup, worldNoise, worldColliders) {
  // ซ่อนแลนด์มาร์กคริสตัลแบบเก่าทั้งหมด
  animatedTownCrystals.forEach(c => {
    c.visible = false;
  });

  TOWNS.forEach((town, idx) => {
    const wy = worldNoise.getHeight(town.x, town.z);
    const statueGroup = new THREE.Group();
    statueGroup.position.set(town.x, wy, town.z);

    const marbleMat = createAnimeMaterial({ color: 0xf8fafc, roughness: 0.35, metalness: 0.15 });
    const goldMat = createAnimeMaterial({ color: 0xfbbf24, roughness: 0.22, metalness: 0.85 });
    const bronzeMat = createAnimeMaterial({ color: 0xd97706, roughness: 0.35, metalness: 0.65 });

    // ฐานเสารูปปั้นแกะสลัก
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.8, 2.2, 16), marbleMat);
    pillar.position.y = 1.1;
    const goldRing = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.12, 12, 28), goldMat);
    goldRing.rotation.x = Math.PI / 2;
    goldRing.position.y = 2.2;
    statueGroup.add(pillar, goldRing);

    if (idx === 0) {
      // เมือง 1 (นครเอเธลการ์ด): รูปปั้นมหาอัศวินราชันย์ชูดาบเอ็กซ์คาลิเบอร์และปีกทองคำ
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.85, 2.8, 12), goldMat);
      body.position.y = 3.6;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.52, 16, 16), marbleMat);
      head.position.y = 5.4;
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.38, 0.35, 8), goldMat);
      crown.position.y = 5.95;
      const sword = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.6, 0.08), marbleMat);
      sword.position.set(0, 4.8, 0.85);
      [-1, 1].forEach(side => {
        const wing = new THREE.Mesh(new THREE.ConeGeometry(0.85, 3.2, 5), goldMat);
        wing.position.set(side * 1.4, 4.6, -0.3);
        wing.rotation.z = -side * 0.55;
        statueGroup.add(wing);
      });
      statueGroup.add(body, head, crown, sword);
    } else if (idx === 1) {
      // เมือง 2 (นครซิลแวนเวล): รูปปั้นเทพธิดาพฤกษาและพญากวางศักดิ์สิทธิ์
      const robe = new THREE.Mesh(new THREE.ConeGeometry(1.1, 3.4, 16), createAnimeMaterial({ color: 0x34d399, roughness: 0.4 }));
      robe.position.y = 3.9;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.48, 16, 16), marbleMat);
      head.position.y = 5.8;
      const halo = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.09, 10, 28), goldMat);
      halo.position.set(0, 5.2, -0.25);
      statueGroup.add(robe, head, halo);
    } else if (idx === 2) {
      // เมือง 3 (ป้อมไพร์โฮลด์): รูปปั้นราชันย์มังกรเพลิงอัคนี
      const dragonCore = new THREE.Mesh(new THREE.TorusKnotGeometry(1.15, 0.34, 64, 12, 2, 3), bronzeMat);
      dragonCore.position.y = 4.3;
      const flameOrb = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.75, 1),
        new THREE.MeshStandardMaterial({ color: 0xf97316, emissive: 0xea580c, emissiveIntensity: 2.0 })
      );
      flameOrb.position.y = 6.4;
      statueGroup.add(dragonCore, flameOrb);
    } else {
      // เมือง 4 (ท่าฟรอสต์เฮเวน): รูปปั้นวัลคีรีน้ำแข็งและตรีศูลสมุทรเหมันต์
      const iceBody = new THREE.Mesh(
        new THREE.CylinderGeometry(0.55, 1.05, 3.3, 8),
        new THREE.MeshStandardMaterial({ color: 0xbae6fd, emissive: 0x0284c7, emissiveIntensity: 0.6, roughness: 0.15 })
      );
      iceBody.position.y = 3.85;
      const trident = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4.5, 8), goldMat);
      trident.position.set(0.75, 4.8, 0.4);
      statueGroup.add(iceBody, trident);
    }

    attachLightDispersion(statueGroup, town.themeColor || 0xfbbf24, 2.2, 24);
    statueGroup.traverse(child => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    worldGroup.add(statueGroup);
    worldColliders.push({ x: town.x, z: town.z, radius: 1.8, topY: wy + 2.2 });
  });
}

// 5. ซ่อมแซมกำแพงเมืองให้เชื่อมต่อกับซุ้มประตูเมืองทั้ง 4 ทิศอย่างสมบูรณ์ (ไม่มีช่องโหว่แบบภาพที่ 3)
export function repairAllCityWalls(TOWNS, worldNoise, worldGroup, worldColliders, registerBoxCollider) {
  TOWNS.forEach((town) => {
    const wallR = town.radius - 6;
    const segments = 64;
    const stoneMat = createAnimeMaterial({ color: 0xcbd5e1, roughness: 0.68 });
    const trimMat = createAnimeMaterial({ color: town.themeColor || 0x3b82f6, roughness: 0.5 });

    for (let i = 0; i < segments; i++) {
      const ang1 = (i / segments) * Math.PI * 2;
      const ang2 = ((i + 1) / segments) * Math.PI * 2;
      const midAng = (ang1 + ang2) * 0.5;

      // เปิดช่องซุ้มประตูเมืองทั้ง 4 ทิศให้กว้างขึ้น (0.18 rad) เพื่อเดินและขี่รถม้าออกได้สบาย
      const distToGateAngle = Math.min(Math.abs(Math.sin(midAng)), Math.abs(Math.cos(midAng)));
      if (distToGateAngle < 0.18) continue;

      const x1 = town.x + Math.cos(ang1) * wallR;
      const z1 = town.z + Math.sin(ang1) * wallR;
      const x2 = town.x + Math.cos(ang2) * wallR;
      const z2 = town.z + Math.sin(ang2) * wallR;
      const mx = (x1 + x2) * 0.5;
      const mz = (z1 + z2) * 0.5;
      const my = worldNoise.getHeight(mx, mz);
      const segLen = Math.hypot(x2 - x1, z2 - z1) + 0.35;

      const wallSeg = new THREE.Group();
      wallSeg.position.set(mx, my, mz);
      wallSeg.rotation.y = Math.atan2(x2 - x1, z2 - z1);

      const mainWall = new THREE.Mesh(new THREE.BoxGeometry(1.8, 7.8, segLen), stoneMat);
      mainWall.position.y = 3.9;
      const topBattlement = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.65, segLen), trimMat);
      topBattlement.position.y = 8.0;
      wallSeg.add(mainWall, topBattlement);
      worldGroup.add(wallSeg);

      registerBoxCollider(worldColliders, mx, mz, 2.2, segLen, my + 8.2, false);
    }
  });
}

// 6. เอฟเฟควิ่งสวนกระแสลม (Sprint Wind Stream Lines)
let windLinesGroup = null;
const windStreaks = [];

export function updateSprintWindFX(scene, playerRoot, isSprinting, dt) {
  if (!windLinesGroup) {
    windLinesGroup = new THREE.Group();
    const lineMat = new THREE.MeshBasicMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    for (let i = 0; i < 18; i++) {
      const streak = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.002, 1.65, 6), lineMat);
      streak.rotation.x = Math.PI / 2;
      windLinesGroup.add(streak);
      windStreaks.push({
        mesh: streak,
        ox: (Math.random() - 0.5) * 1.9,
        oy: 0.4 + Math.random() * 1.5,
        oz: (Math.random() - 0.5) * 2.2,
        speed: 14 + Math.random() * 10
      });
    }
    scene.add(windLinesGroup);
  }

  windLinesGroup.visible = isSprinting;
  if (!isSprinting) return;

  windLinesGroup.position.copy(playerRoot.position);
  windLinesGroup.rotation.y = playerRoot.rotation.y;

  for (let i = 0; i < windStreaks.length; i++) {
    const ws = windStreaks[i];
    ws.oz -= ws.speed * dt;
    if (ws.oz < -1.8) {
      ws.oz = 1.6;
      ws.ox = (Math.random() - 0.5) * 1.9;
      ws.oy = 0.4 + Math.random() * 1.5;
    }
    ws.mesh.position.set(ws.ox, ws.oy, ws.oz);
  }
}

// 7. เอฟเฟคสกิลเฉพาะตัวที่แตกต่างกันชัดเจนของแต่ละอาชีพ (6 Classes Distinct Skill VFX)
export function spawnDistinctClassSkillVFX(worldGroup, classId, isUlt, originPos, forwardAngle) {
  const fxGroup = new THREE.Group();
  fxGroup.position.copy(originPos);
  fxGroup.rotation.y = forwardAngle;
  worldGroup.add(fxGroup);

  const colorMap = {
    swordsman: isUlt ? 0xf97316 : 0x38bdf8,
    mage:      isUlt ? 0xa855f7 : 0x60a5fa,
    archer:    isUlt ? 0x10b981 : 0x4ade80,
    tank:      isUlt ? 0xfacc15 : 0xfbbf24,
    support:   isUlt ? 0xf472b6 : 0x34d399,
    classless: isUlt ? 0xec4899 : 0x22d3ee
  };
  const col = colorMap[classId] || 0xfbbf24;
  const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });

  const parts = [];
  const count = isUlt ? 12 : 6;
  for (let i = 0; i < count; i++) {
    let geo;
    if (classId === 'swordsman') geo = new THREE.TorusGeometry(1.4 + i * 0.35, 0.08, 8, 24, Math.PI);
    else if (classId === 'mage') geo = new THREE.OctahedronGeometry(0.45 + (i % 3) * 0.2, 0);
    else if (classId === 'archer') geo = new THREE.ConeGeometry(0.15, 2.2, 6);
    else if (classId === 'tank') geo = new THREE.BoxGeometry(1.2, 1.8, 0.2);
    else if (classId === 'support') geo = new THREE.RingGeometry(0.8 + i * 0.4, 1.0 + i * 0.4, 24);
    else geo = new THREE.TorusKnotGeometry(0.7, 0.12, 32, 8);

    const m = new THREE.Mesh(geo, mat.clone());
    const ang = (i / count) * Math.PI * 2;
    m.position.set(Math.cos(ang) * 1.5, 0.8 + (i % 3) * 0.4, Math.sin(ang) * 1.5 + 1.5);
    if (classId === 'support') m.rotation.x = Math.PI / 2;
    fxGroup.add(m);
    parts.push({ mesh: m, ang });
  }

  let age = 0;
  const timer = setInterval(() => {
    age += 0.03;
    parts.forEach((p, idx) => {
      p.mesh.rotation.y += 0.18;
      p.mesh.rotation.z += 0.12;
      p.mesh.position.y += 0.06;
      p.mesh.scale.multiplyScalar(1.03);
      p.mesh.material.opacity = Math.max(0, 0.9 - age * 1.4);
    });
    if (age >= 0.65) {
      clearInterval(timer);
      worldGroup.remove(fxGroup);
    }
  }, 30);
}

// 8. อัปเดตเอฟเฟกต์แสงและแผงควบคุมฟิสิกส์เสื้อผ้า
export function updateGraphicsSystem(elapsedTime, playerPos = null, glowRoot = null, dt = 1 / 60) {
  dispersionLightUpdateTimer -= dt;
  if (dispersionLightUpdateTimer > 0) return;
  dispersionLightUpdateTimer = 0.25;

  for (const light of activePhysicalGlowLights) light.visible = false;
  activePhysicalGlowLights.clear();
  if (!playerPos || !graphicsConfig.lightDispersion) return;

  const nearestLights = [];
  const cellX = Math.floor(playerPos.x / glowCellSize);
  const cellZ = Math.floor(playerPos.z / glowCellSize);
  for (let offsetX = -1; offsetX <= 1; offsetX++) {
    for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
      const cell = glowLightCells.get(`${cellX + offsetX},${cellZ + offsetZ}`);
      if (!cell) continue;
      for (let i = 0; i < cell.length; i++) {
        const item = cell[i];
        item.light.getWorldPosition(glowLightPosition);
        const distanceSq = glowLightPosition.distanceToSquared(playerPos);
        let isInRoot = !glowRoot;
        for (let ancestor = item.light; glowRoot && ancestor; ancestor = ancestor.parent) {
          if (ancestor === glowRoot) {
            isInRoot = true;
            break;
          }
        }
        if (distanceSq <= item.radius * item.radius && isInRoot) {
          nearestLights.push({ light: item.light, distanceSq });
        }
      }
    }
  }
  nearestLights.sort((a, b) => a.distanceSq - b.distanceSq);
  for (let i = 0; i < Math.min(maxActivePhysicalGlowLights, nearestLights.length); i++) {
    const light = nearestLights[i].light;
    light.visible = true;
    activePhysicalGlowLights.add(light);
  }
}

export function injectAdvancedGraphicsSettingsUI() {
  if (document.getElementById('adv-graphic-panel')) return;
  const topBar = document.getElementById('btn-reshade-mode')?.parentElement;
  if (!topBar) return;

  const btn = document.createElement('button');
  btn.className = "glass px-2.5 py-1 rounded-full text-[11px] hover:bg-slate-800 transition flex items-center gap-1 border border-lime-400/40 text-lime-200 font-semibold";
  btn.innerHTML = `✨ เสื้อผ้า/แสง`;
  topBar.appendChild(btn);

  const panel = document.createElement('div');
  panel.id = 'adv-graphic-panel';
  panel.className = "hidden fixed top-12 left-1/2 -translate-x-1/2 z-50 glass gold-border rounded-2xl p-4 w-80 space-y-2.5 text-xs pointer-events-auto shadow-2xl";
  panel.innerHTML = `
    <div class="flex justify-between items-center border-b border-slate-700 pb-1.5">
      <span class="font-extrabold text-lime-300">✨ ตั้งค่าเสื้อผ้าและแสง</span>
      <button id="close-adv-gfx" class="text-slate-400 hover:text-white">✕</button>
    </div>
    <label class="flex justify-between items-center cursor-pointer">
      <span>🧣 ฟิสิกส์เสื้อผ้าและโบว์พลิ้ว</span>
      <input type="checkbox" id="chk-cloth-phys" checked class="accent-pink-400 w-4 h-4" />
    </label>
    <label class="flex justify-between items-center cursor-pointer">
      <span>💡 การกระจายแสง (Light Dispersion)</span>
      <input type="checkbox" id="chk-light-disp" checked class="accent-sky-400 w-4 h-4" />
    </label>
  `;
  document.body.appendChild(panel);

  btn.onclick = () => panel.classList.toggle('hidden');
  panel.querySelector('#close-adv-gfx').onclick = () => panel.classList.add('hidden');

  panel.querySelector('#chk-cloth-phys').onchange = (e) => { graphicsConfig.clothPhysics = e.target.checked; };
  panel.querySelector('#chk-light-disp').onchange = (e) => { graphicsConfig.lightDispersion = e.target.checked; };
}
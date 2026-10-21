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
  forEachWorldColliderInBounds,
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
import {
  graphicsConfig,
  attachLightDispersion,
  replaceTownCrystalsWithStatues,
  repairAllCityWalls,
  updateSprintWindFX,
  spawnDistinctClassSkillVFX,
  updateGraphicsSystem,
  injectAdvancedGraphicsSettingsUI,
  upgradeEntitiesWithOnlineAssets,
  upgradeCharacterFashionAndEquipment,
  injectModernUXUIPolish
} from './graphic.js';
import {
  updateAllOnlineAssetAnimations,
  applyAdvancedCharacterAndClothAnim,
  unlockAndAnimateCityGates
} from './anim.js';
import {
  FASHION_CATALOG,
  ensureFashionState,
  equipOwnedFashion,
  updateFashionAuraEffects,
  renderFashionShopUI
} from './fashion.js';
import { generateTerrainBlueprint } from './world-generator.js';

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
    light.castShadow = false;
    
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
    light.castShadow = false;
    
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
    light.castShadow = false;
    
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
const streetLampPointLights = [];
const buildingWindowMaterials = [];
const activeCityNightLights = new Set();
const activeStreetLampPointLights = new Set();
let sceneLightRefreshTimer = 0;
let shadowRefreshTimer = 0;
const reservedBuildingFootprints = [];
const animatedCarriages = [];
const enterableBuildings = [];
const interactiveSeats = [];
const interactiveDoors = [];
const interactiveBeds = [];
const interactiveCabinets = [];
let currentActiveInnTownId = 0;
let ridingCarriage = null;
let carriageBoarding = null;
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
// ขยายทุกเมืองให้มีเขตชานเมืองและถนนวงแหวนชั้นนอกกว้างขึ้น
TOWNS.forEach((t, idx) => {
  if (idx === 0) { t.x = 0; t.z = 0; t.radius = 124; }
  else if (idx === 1) { t.x = -260; t.z = -260; t.radius = 124; }
  else if (idx === 2) { t.x = 260; t.z = -240; t.radius = 124; }
  else if (idx === 3) { t.x = -240; t.z = 260; t.radius = 124; }
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
  if (!graphicsConfig.clothPhysics) return; // รองรับปุ่ม เปิด/ปิด ฟิสิกส์เสื้อผ้าจาก graphic.js
  if (!charInstance._ribbonTargets) {
    attachSoftClothSimulation(charInstance);
  }
  const t = charInstance.animTime || 0;
  const moveFactor = Math.min(2.2, speedRatio);
  const ribbons = charInstance._ribbonTargets || [];
  for (let i = 0; i < ribbons.length; i++) {
    const r = ribbons[i];
    const sign = i % 2 === 0 ? -1 : 1;
    r.mesh.rotation.z = r.baseRotZ + Math.sin(t * 6.5 + i) * (0.08 + moveFactor * 0.18) * sign;
    r.mesh.rotation.x = r.baseRotX - 0.08 - moveFactor * 0.22 + Math.cos(t * 5.5 + i) * 0.06;
  }
  // ผ้าคลุมและกระโปรงพลิ้วแรงขึ้นตามความเร็ววิ่ง
  if (charInstance.joints?.cape) {
    charInstance.joints.cape.rotation.x = 0.12 + moveFactor * 0.28 + Math.sin(t * 8.0) * (0.05 + moveFactor * 0.08);
  }
}

const _origBuildModel = ArticulatedCharacter3D.prototype.buildModel;
ArticulatedCharacter3D.prototype.buildModel = function (...args) {
  const res = _origBuildModel.apply(this, args);
  attachSoftClothSimulation(this);
  upgradeCharacterFashionAndEquipment(this);
  return res;
};

const _origUpdateAnimation = ArticulatedCharacter3D.prototype.updateAnimation;
ArticulatedCharacter3D.prototype.updateAnimation = function (dt, speedRatio = 0, isJumping = false, verticalVelocity = 0, turnDelta = 0, isInWater = false) {
  _origUpdateAnimation.call(this, dt, speedRatio, isJumping, verticalVelocity, turnDelta, isInWater);
  updateSoftClothSimulation(this, dt, speedRatio, turnDelta);

  // ปรับอนิเมชั่นตอนวิ่งไว (Sprint): โน้มตัวไปข้างหน้ามากขึ้น แกว่งแขนมากขึ้น และก้าวขายาวขึ้น
  if (speedRatio > 1.15 && !isJumping && !isInWater && this.attackTimer <= 0) {
    const sprintIntensity = Math.min(1.0, (speedRatio - 1.0) / 1.5);
    const runCycle = this.animTime * 13.5;

    // 1) โน้มลำตัวไปข้างหน้า
    if (this.joints?.torso) {
      this.joints.torso.rotation.x = THREE.MathUtils.lerp(this.joints.torso.rotation.x, 0.34 * sprintIntensity, 0.65);
    }
    if (this.joints?.head) {
      this.joints.head.rotation.x = -0.18 * sprintIntensity; // เงยหน้ามองทางขณะโน้มตัววิ่ง
    }
    // 2) แกว่งแขนกว้างและแรงขึ้น
    if (this.joints?.shoulderL && this.joints?.shoulderR) {
      this.joints.shoulderL.rotation.x = Math.sin(runCycle) * (1.25 * sprintIntensity);
      this.joints.shoulderR.rotation.x = -Math.sin(runCycle) * (1.25 * sprintIntensity);
      if (this.joints.elbowL) this.joints.elbowL.rotation.x = -0.65 * sprintIntensity;
      if (this.joints.elbowR) this.joints.elbowR.rotation.x = -0.65 * sprintIntensity;
    }
    // 3) ก้าวขายาวและกว้างขึ้น
    if (this.joints?.hipL && this.joints?.hipR) {
      this.joints.hipL.rotation.x = -Math.sin(runCycle) * (1.18 * sprintIntensity);
      this.joints.hipR.rotation.x = Math.sin(runCycle) * (1.18 * sprintIntensity);
    }
  }
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
// ยกระดับเสียงฝีเท้ากระทบพื้น (Footstep Ground Impact Sound) แยกจังหวะเดินและวิ่ง
sound.sfxStep = function (isSprinting = false) {
  if (!this.enabled) return;
  try {
    this._init();
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // 1. เสียงส้นเท้ากระแทกพื้นดิน (Low Thump Impact)
    const osc = ctx.createOscillator();
    const thumpGain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(isSprinting ? 135 : 95, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + 0.065);
    thumpGain.gain.setValueAtTime(isSprinting ? 0.28 : 0.16, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    osc.connect(thumpGain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.075);

    // 2. เสียงเสียดสีพื้นหญ้า/กรวดหิน (Crisp Ground Crunch Noise)
    const bufSize = Math.floor(ctx.sampleRate * 0.055);
    const noiseBuf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.35));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = isSprinting ? 1150 : 850;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(isSprinting ? 0.22 : 0.12, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
    noise.connect(filter).connect(noiseGain).connect(ctx.destination);
    noise.start(now);
  } catch (_) {}
};
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
const isCompactDevice = window.matchMedia('(pointer: coarse), (max-width: 900px)').matches;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, gameSettings.pixelRatio || 1, isCompactDevice ? 1 : 1.5));
renderer.shadowMap.enabled = !!gameSettings.shadows;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
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
dirLight.castShadow = !!gameSettings.shadows;
dirLight.shadow.autoUpdate = false;
const initialShadowMapSize = gameSettings.shadowMapSize || 1024;
dirLight.shadow.mapSize.set(initialShadowMapSize, initialShadowMapSize);
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
function getCurrentGameDay() {
  return Math.floor(Date.now() / 1000 / REAL_SECONDS_PER_INGAME_DAY);
}
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
const _streetLampWorldPosition = new THREE.Vector3();

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

  sceneLightRefreshTimer -= dt;
  if (sceneLightRefreshTimer <= 0) {
    sceneLightRefreshTimer = 0.25;
    const lampGlow = THREE.MathUtils.lerp(0.18, 3.2, nightBlend);
    streetLampMaterials.forEach(mat => { mat.emissiveIntensity = lampGlow; });
    buildingWindowMaterials.forEach(mat => {
      mat.emissiveIntensity = THREE.MathUtils.lerp(0.12, 2.6, nightBlend);
    });
    streetLampGlowDiscs.forEach(disc => {
      disc.visible = nightBlend > 0.08;
      if (disc.visible && disc.material) {
        disc.material.opacity = nightBlend * (0.30 + Math.sin(elapsedTime * 3.5) * 0.04);
      }
    });

    for (const light of activeStreetLampPointLights) light.visible = false;
    activeStreetLampPointLights.clear();
    const nearbyStreetLights = [];
    for (const light of streetLampPointLights) {
      light.getWorldPosition(_streetLampWorldPosition);
      const dx = playerPos.x - _streetLampWorldPosition.x;
      const dz = playerPos.z - _streetLampWorldPosition.z;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq < 45 * 45) nearbyStreetLights.push({ light, distanceSq });
    }
    nearbyStreetLights.sort((a, b) => a.distanceSq - b.distanceSq);
    for (let i = 0; i < Math.min(4, nearbyStreetLights.length); i++) {
      const light = nearbyStreetLights[i].light;
      light.visible = true;
      light.intensity = THREE.MathUtils.lerp(light.userData.baseIntensity * 0.12, light.userData.baseIntensity, nightBlend);
      activeStreetLampPointLights.add(light);
    }

    for (const item of activeCityNightLights) item.light.visible = false;
    activeCityNightLights.clear();
    const nearbyCityLights = [];
    for (const item of cityNightLights) {
      const dx = playerPos.x - item.wx;
      const dz = playerPos.z - item.wz;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq < 60 * 60) nearbyCityLights.push({ item, distanceSq });
    }
    nearbyCityLights.sort((a, b) => a.distanceSq - b.distanceSq);
    for (let i = 0; i < Math.min(8, nearbyCityLights.length); i++) {
      const item = nearbyCityLights[i].item;
      item.light.visible = true;
      item.light.intensity = item.isIndoorLight
        ? item.maxIntensity
        : THREE.MathUtils.lerp(item.maxIntensity * 0.12, item.maxIntensity, nightBlend);
      activeCityNightLights.add(item);
    }
  }

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
let floatingLabelsUpdateTimer = 0;
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
  ctx.fillStyle = '#c8c4ad';
  ctx.fillRect(0, 0, 256, 256);
  let seed = 0x5f3759df;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const fleckColors = ['#bbb79e', '#d2ccb0', '#aaa991', '#d8d1b7', '#a8a68e'];
  for (let i = 0; i < 3600; i++) {
    const size = 1 + Math.floor(random() * 3);
    ctx.fillStyle = fleckColors[Math.floor(random() * fleckColors.length)];
    ctx.globalAlpha = 0.2 + random() * 0.32;
    ctx.fillRect(random() * 256, random() * 256, size, size + 1);
  }
  ctx.globalAlpha = 1;
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
const BOSS_SPAWNS = [
  { id: 'boss_treant', name: 'ราชันย์พฤกษาโบราณ', type: 'boss_treant', x: -700, z: -700, lv: 36, hp: 26000, atk: 155, exp: 3200, gold: 1800, tier: 'danger', isBoss: true },
  { id: 'boss_wyrm', name: 'มังกรเพลิงหายนะ', type: 'boss_wyrm', x: 700, z: -700, lv: 40, hp: 32000, atk: 185, exp: 4000, gold: 2400, tier: 'danger', isBoss: true },
  { id: 'boss_voidknight', name: 'อัศวินสุญญะทมิฬ', type: 'boss_voidknight', x: -700, z: 700, lv: 44, hp: 39000, atk: 210, exp: 5000, gold: 3000, tier: 'danger', isBoss: true }
];

function spawnMonsterAt(wx, wz, lvOverride = null, forcedSpec = null) {
  let wy = worldNoise.getHeight(wx, wz);
  if (wy < WATER_LEVEL + 0.25 && forcedSpec?.isBoss) {
    let landFound = false;
    for (let ring = 4; ring <= 24 && !landFound; ring += 4) {
      for (let direction = 0; direction < 8; direction++) {
        const angle = direction * Math.PI / 4;
        const candidateX = forcedSpec.x + Math.cos(angle) * ring;
        const candidateZ = forcedSpec.z + Math.sin(angle) * ring;
        const candidateY = worldNoise.getHeight(candidateX, candidateZ);
        if (candidateY >= WATER_LEVEL + 0.25) {
          wx = candidateX;
          wz = candidateZ;
          wy = candidateY;
          landFound = true;
          break;
        }
      }
    }
  }
  if (wy < WATER_LEVEL + 0.25) return;
  const nearestTownDistance = TOWNS.reduce((nearest, town) =>
    Math.min(nearest, Math.hypot(wx - town.x, wz - town.z)), Infinity);
  const tier = nearestTownDistance < 165 ? 'easy'
    : nearestTownDistance < 330 ? 'intermediate'
      : nearestTownDistance < 560 ? 'high' : 'danger';
  const tierScale = { easy: 1, intermediate: 1.18, high: 1.38, danger: 1.62 }[tier];
  const lv = lvOverride || forcedSpec?.lv || Math.max(1, Math.min(45, Math.floor(nearestTownDistance / 28) + 1));
  let spec = forcedSpec;
  if (!spec && tier === 'easy' && wx < -55 && wz < -55) {
    spec = { name: 'หมาป่าเขี้ยวทมิฬ', type: 'wolf', hp: 125 + lv * 36, atk: 16 + lv * 4, exp: 50 + lv * 18, gold: 40 + lv * 12 };
  } else if (!spec && tier === 'easy' && wx > 55 && wz < -45) {
    spec = { name: 'โกเลมเพลิงอัคนี', type: 'golem', hp: 190 + lv * 52, atk: 22 + lv * 6, exp: 85 + lv * 25, gold: 70 + lv * 18 };
  } else if (!spec && tier === 'easy' && wx < -45 && wz > 55) {
    spec = { name: 'โกเลมน้ำแข็งเหมันต์', type: 'golem', hp: 175 + lv * 46, atk: 19 + lv * 5, exp: 78 + lv * 22, gold: 62 + lv * 16 };
  } else if (!spec) {
    const roll = Math.floor(Math.abs(wx * 13 + wz * 7)) % 3;
    let candidates;
    if (tier === 'easy') {
      candidates = [
        { name: 'สไลม์วารีคริสตัล', type: 'slime', hp: 90, atk: 11, exp: 38, gold: 30 },
        { name: 'ก็อบลินลาดตระเวน', type: 'goblin', hp: 130, atk: 15, exp: 52, gold: 42 },
        { name: 'หมาป่าทุ่งหญ้า', type: 'wolf', hp: 115, atk: 14, exp: 48, gold: 36 }
      ];
    } else if (tier === 'intermediate') {
      candidates = [
        { name: 'โจรทางหลวง', type: 'bandit', hp: 165, atk: 24, exp: 110, gold: 92 },
        { name: 'หมาป่าเขี้ยวเหล็ก', type: 'direwolf', hp: 205, atk: 30, exp: 135, gold: 105 },
        { name: 'ก็อบลินผู้พิทักษ์', type: 'goblin', hp: 185, atk: 26, exp: 120, gold: 98 }
      ];
    } else if (tier === 'high') {
      candidates = [
        { name: 'อสูรพฤกษาหนาม', type: 'thornbeast', hp: 330, atk: 48, exp: 250, gold: 185 },
        { name: 'ภูตน้ำแข็งเร้นเงา', type: 'frost_wraith', hp: 290, atk: 55, exp: 280, gold: 210 },
        { name: 'มังกรเพลิงวัยเยาว์', type: 'infernal_drake', hp: 410, atk: 62, exp: 320, gold: 240 }
      ];
    } else {
      candidates = [
        { name: 'อัศวินสุญญะพเนจร', type: 'void_knight', hp: 620, atk: 82, exp: 520, gold: 360 },
        { name: 'มังกรเพลิงคลั่ง', type: 'infernal_drake', hp: 720, atk: 90, exp: 600, gold: 420 },
        { name: 'ภูตน้ำแข็งอาฆาต', type: 'frost_wraith', hp: 560, atk: 94, exp: 610, gold: 430 }
      ];
    }
    const chosen = candidates[roll];
    spec = {
      ...chosen,
      hp: Math.round((chosen.hp + lv * 24) * tierScale),
      atk: Math.round((chosen.atk + lv * 2) * tierScale),
      exp: Math.round((chosen.exp + lv * 14) * tierScale),
      gold: Math.round((chosen.gold + lv * 10) * tierScale)
    };
  }
  const mesh = createMonsterMesh(spec.type);
  mesh.position.set(wx, wy, wz);
  const monId = spec.isBoss
    ? spec.id
    : `mon_${Math.round(wx)}_${Math.round(wz)}`;
  const monObj = {
    id: monId,
    name: spec.name,
    type: spec.type,
    tier: spec.tier || tier,
    isBoss: !!spec.isBoss,
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
    atkCooldown: spec.isBoss ? 1.2 : 0,
    attackRange: spec.isBoss ? 6.2 : 2.1,
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
  // ทำให้แร่มิธริลและสมุนไพรแสงจันทร์เรืองแสงสว่างกระจายรอบข้างจริง
  if (matId === 'mithril_ore' || matId === 'moon_herb') {
    attachLightDispersion(mesh, matId === 'mithril_ore' ? 0x38bdf8 : 0x34d399, 5.5, 32);
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
async function generateChunk(cx, cz) {
  const key = `${cx},${cz}`;
  if (chunkMap.has(key)) return;
  const chunkGroup = new THREE.Group();
  chunkGroup.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
  const segs = gameSettings.preset === 'potato' ? 12 : gameSettings.preset === 'low' ? 14 : 18;
  const geo = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, segs, segs);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;

  const cachedBlueprint = worldCache.getChunkBlueprint(cx, cz);
  let heights;
  let colors;
  if (cachedBlueprint &&
      cachedBlueprint.heights?.length === pos.count &&
      cachedBlueprint.colors?.length === pos.count * 3) {
    heights = cachedBlueprint.heights;
    colors = cachedBlueprint.colors;
  } else {
    const localCoordinates = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      localCoordinates[i * 2] = pos.getX(i);
      localCoordinates[i * 2 + 1] = pos.getZ(i);
    }
    ({ heights, colors } = await generateTerrainBlueprint({
      cx,
      cz,
      chunkSize: CHUNK_SIZE,
      localCoordinates,
      seedStr: worldNoise.seedStr
    }));
    worldCache.saveChunkBlueprint(cx, cz, { heights, colors });
  }
  for (let i = 0; i < pos.count; i++) pos.setY(i, heights[i]);
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const terrainMesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, map: terrainTex, roughness: 0.88, metalness: 0.04 })
  );
  terrainMesh.receiveShadow = true;
  chunkGroup.add(terrainMesh);
  terrainMeshes.push(terrainMesh);
  worldGroup.add(chunkGroup);
  chunkMap.set(key, chunkGroup);
  await waitForRenderFrame();

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
      await waitForRenderFrame();
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
        await waitForRenderFrame();
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
      await waitForRenderFrame();
    }
    // สุ่มเกิดมอนสเตอร์ 2 ตัวต่อ Chunk
    for (let mIdx = 0; mIdx < 2; mIdx++) {
      const mHashX = worldNoise.hash2D(cx * 53 + mIdx, cz * 29 + mIdx);
      const mHashZ = worldNoise.hash2D(cx * 41 + mIdx, cz * 67 + mIdx);
      const mwx = centerWx + (mHashX - 0.5) * (CHUNK_SIZE - 8);
      const mwz = centerWz + (mHashZ - 0.5) * (CHUNK_SIZE - 8);
      spawnMonsterAt(mwx, mwz);
      await waitForRenderFrame();
    }
    const bossSpawn = BOSS_SPAWNS.find(boss =>
      Math.floor(boss.x / CHUNK_SIZE) === cx && Math.floor(boss.z / CHUNK_SIZE) === cz
    );
    if (bossSpawn && !monsters.some(mon => mon.id === bossSpawn.id)) {
      spawnMonsterAt(bossSpawn.x, bossSpawn.z, bossSpawn.lv, bossSpawn);
      await waitForRenderFrame();
    }
  }
}
// สร้างโคมไฟถนนเรืองแสงพร้อมวงแสงตกกระทบพื้นและ PointLight ส่องสว่างจริงตอนกลางคืน
function createGlowingStreetLamp(wx, wy, wz, withPointLight = false, rotY = 0) {
  const lampGroup = createOrnateStreetLamp(wx, wy, wz, rotY, streetLampMaterials, streetLampGlowDiscs, streetLampPointLights);
  if (withPointLight) {
    const pt = new THREE.PointLight(0xffedd5, 48, 34, 1.4);
    pt.position.set(0.74, 3.6, 0);
    pt.castShadow = false;
    pt.visible = false;
    lampGroup.add(pt);
    cityNightLights.push({ light: pt, wx, wz, maxIntensity: 48 });
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
function resolveBuildingPlacement(spec) {
  const { width, depth, rotY = 0 } = spec;
  const nearestTown = TOWNS.reduce((nearest, town) => {
    const distance = Math.hypot(spec.wx - town.x, spec.wz - town.z);
    return !nearest || distance < nearest.distance ? { town, distance } : nearest;
  }, null);
  const halfX = (width * Math.abs(Math.cos(rotY)) + depth * Math.abs(Math.sin(rotY))) / 2;
  const halfZ = (width * Math.abs(Math.sin(rotY)) + depth * Math.abs(Math.cos(rotY))) / 2;
  const clearance = 1.5;

  const isClear = (wx, wz) => {
    if (nearestTown && nearestTown.distance <= nearestTown.town.radius + 12) {
      const townDx = wx - nearestTown.town.x;
      const townDz = wz - nearestTown.town.z;
      if (Math.hypot(townDx, townDz) + Math.hypot(halfX, halfZ) > nearestTown.town.radius - 3) return false;

      const roadHalfWidth = 5.2;
      const roadReach = nearestTown.town.radius * 0.98;
      const overlapsMainRoad =
        (Math.abs(townDx) < halfX + roadHalfWidth && Math.abs(townDz) < roadReach + halfZ) ||
        (Math.abs(townDz) < halfZ + roadHalfWidth && Math.abs(townDx) < roadReach + halfX);
      if (overlapsMainRoad) return false;

      const nearestX = Math.max(Math.abs(townDx) - halfX, 0);
      const nearestZ = Math.max(Math.abs(townDz) - halfZ, 0);
      const farthestCorner = Math.hypot(Math.abs(townDx) + halfX, Math.abs(townDz) + halfZ);
      const nearestCorner = Math.hypot(nearestX, nearestZ);
      const ringRoadBands = [[24.5, 31.5], [68, 75]];
      if (ringRoadBands.some(([inner, outer]) =>
        farthestCorner >= inner - roadHalfWidth && nearestCorner <= outer + roadHalfWidth
      )) return false;
    }
    for (const footprint of reservedBuildingFootprints) {
      if (Math.abs(wx - footprint.x) < halfX + footprint.halfX + clearance &&
          Math.abs(wz - footprint.z) < halfZ + footprint.halfZ + clearance) {
        return false;
      }
    }
    for (const collider of worldColliders) {
      if (collider.disabled) continue;
      let otherHalfX;
      let otherHalfZ;
      if (collider.type === 'box' && Number.isFinite(collider.minX) && Number.isFinite(collider.maxX)) {
        otherHalfX = (collider.maxX - collider.minX) / 2;
        otherHalfZ = (collider.maxZ - collider.minZ) / 2;
        if (otherHalfX < 2.25 || otherHalfZ < 2.25) continue;
      } else if (Number.isFinite(collider.radius) && collider.radius >= 3.2) {
        otherHalfX = collider.radius;
        otherHalfZ = collider.radius;
      } else {
        continue;
      }
      const otherX = collider.type === 'box' ? (collider.minX + collider.maxX) / 2 : collider.x;
      const otherZ = collider.type === 'box' ? (collider.minZ + collider.maxZ) / 2 : collider.z;
      if (Math.abs(wx - otherX) < halfX + otherHalfX + clearance &&
          Math.abs(wz - otherZ) < halfZ + otherHalfZ + clearance) {
        return false;
      }
    }
    return true;
  };

  if (isClear(spec.wx, spec.wz)) {
    reservedBuildingFootprints.push({ x: spec.wx, z: spec.wz, halfX, halfZ });
    return { wx: spec.wx, wz: spec.wz };
  }

  for (let radius = 10; radius <= 60; radius += 10) {
    for (let x = -radius; x <= radius; x += 10) {
      for (let z = -radius; z <= radius; z += 10) {
        if (Math.max(Math.abs(x), Math.abs(z)) !== radius) continue;
        const wx = spec.wx + x;
        const wz = spec.wz + z;
        if (!isClear(wx, wz)) continue;
        reservedBuildingFootprints.push({ x: wx, z: wz, halfX, halfZ });
        return { wx, wz };
      }
    }
  }

  console.warn(`Unable to place building without overlap: ${spec.title}`);
  return null;
}

// สร้างอาคารมีประตูบานพับเปิด-ปิดได้ โต๊ะเก้าอี้ 3D คลิกนั่งได้ และหน้าต่างมีกรอบสวยงาม
function buildEnterableBuilding(spec) {
  const placement = resolveBuildingPlacement(spec);
  if (!placement) return;
  const { wx, wz } = placement;
  const { width, depth, height, wallColor, roofColor, title, subTitle, role, npcSpec, rotY = 0 } = spec;
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
  interiorLight.visible = false;
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
  const town = TOWNS.reduce((closest, current) =>
    Math.hypot(wx - current.x, wz - current.z) < Math.hypot(wx - closest.x, wz - closest.z) ? current : closest
  , TOWNS[0]);
  enterableBuildings.push({
    wx, wz, width, depth, roofGroup, title, role, rotY, townId: town.id, isTwoStory: false
  });
}
// ==================== สร้างโรงเตี๋ยม 2 ชั้น (2-Story Grand Inn) พร้อมห้องพัก กุญแจห้อง ตู้เก็บของ เตียง หน้าต่าง เก้าอี้ และประตู! ====================
function buildTwoStoryInnBuilding(spec) {
  const { rotY = Math.PI, townName = '', townId = 0 } = spec;
  const width = 18.0;
  const depth = 14.0;
  const placement = resolveBuildingPlacement({ ...spec, width, depth, title: `โรงเตี๊ยม ${townName}` });
  if (!placement) return;
  const { wx, wz } = placement;
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
  const f2StairLandingSlab = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.24, 3.1), floor2Mat);
  f2StairLandingSlab.position.set(1.5, -0.10, -5.35);
  f2StairLandingSlab.receiveShadow = true;
  floor2Group.add(f2StairLandingSlab);
  const wLandingSlab = toWorld(1.5, -5.35);
  registerBoxCollider(
    worldColliders,
    wLandingSlab.x, wLandingSlab.z,
    isRotated90 ? 3.1 : 4.2,
    isRotated90 ? 4.2 : 3.1,
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

  roomSpecs.forEach((roomSpec) => {
    const rm = { ...roomSpec, roomId: `${townId}-${roomSpec.roomId}` };
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
  lightF1.visible = false;
  floor1Group.add(lightF1);
  const lightF2 = new THREE.PointLight(0xfff4e6, 4.0, 36, 0.8);
  lightF2.position.set(0, hFloor2 * 0.82, 0);
  lightF2.visible = false;
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
  const town = TOWNS.reduce((closest, current) =>
    Math.hypot(wx - current.x, wz - current.z) < Math.hypot(wx - closest.x, wz - closest.z) ? current : closest
  , TOWNS[0]);
  enterableBuildings.push({
    wx, wz, width, depth, wy, hFloor1, totalH,
    floor1Group, floor2Group, floor2PropsGroup, roofGroup,
    title: 'โรงเตี๋ยมนักเดินทาง 2 ชั้น',
    role: 'inn', rotY, townId: town.id,
    isTwoStory: true
  });
}
// สร้างรถม้าเคลื่อนที่รอบเมือง (Animated Horse Carriage) พร้อมม้าลาก ล้อหมุน โคมไฟ และคนขับรถม้า
function spawnAnimatedCityCarriage(town, orbitRadius, startAngle, speed, labelTitle) {
  const cGroup = new THREE.Group();
  const woodMat = createAnimeMaterial({ color: 0x78350f, roughness: 0.65 });
  const canopyMat = createAnimeMaterial({ color: 0x991b1b, roughness: 0.55 });
  const goldMat = createAnimeMaterial({ color: 0xfbbf24, metalness: 0.8, roughness: 0.25 });
  const horseMat = createAnimeMaterial({ color: 0x78350f, roughness: 0.72 });
  const darkLeatherMat = createAnimeMaterial({ color: 0x292524, roughness: 0.78 });
  const cushionMat = createAnimeMaterial({ color: 0x7f1d1d, roughness: 0.86 });
  const addCarriagePart = (geometry, material, position, rotation = null) => {
    const part = new THREE.Mesh(geometry, material);
    part.position.set(...position);
    if (rotation) part.rotation.set(...rotation);
    part.castShadow = true;
    part.receiveShadow = true;
    cGroup.add(part);
    return part;
  };

  addCarriagePart(new THREE.BoxGeometry(2.35, 0.28, 3.75), darkLeatherMat, [0, 0.83, -0.12]);
  addCarriagePart(new THREE.BoxGeometry(2.22, 0.16, 2.95), woodMat, [0, 1.22, -0.28]);
  addCarriagePart(new THREE.BoxGeometry(2.2, 0.9, 0.16), woodMat, [0, 1.77, -1.78]);
  addCarriagePart(new THREE.BoxGeometry(0.16, 0.86, 2.65), woodMat, [-1.04, 1.72, -0.4]);
  addCarriagePart(new THREE.BoxGeometry(0.16, 0.86, 2.65), woodMat, [1.04, 1.72, -0.4]);
  addCarriagePart(new THREE.BoxGeometry(2.05, 0.68, 0.16), woodMat, [0, 1.61, 0.95]);
  addCarriagePart(new THREE.BoxGeometry(1.5, 0.2, 0.82), cushionMat, [0, 1.48, -0.58]);
  addCarriagePart(new THREE.BoxGeometry(1.5, 0.8, 0.17), cushionMat, [0, 1.91, -1.0]);
  addCarriagePart(new THREE.BoxGeometry(2.65, 0.16, 2.8), canopyMat, [0, 3.18, -0.42]);
  addCarriagePart(new THREE.BoxGeometry(2.72, 0.1, 2.88), goldMat, [0, 3.08, -0.42]);
  [[-1.08, -1.55], [1.08, -1.55], [-1.08, 0.72], [1.08, 0.72]].forEach(([x, z]) => {
    addCarriagePart(new THREE.CylinderGeometry(0.065, 0.08, 1.82, 8), goldMat, [x, 2.18, z]);
  });
  addCarriagePart(new THREE.BoxGeometry(2.4, 0.12, 3.0), goldMat, [0, 2.22, -0.4]);

  // Carriage wheels have timber spokes, iron rims and gold hubs.
  const wheels = [];
  [[-1.26, 1.1], [1.26, 1.1], [-1.26, -1.2], [1.26, -1.2]].forEach(([wx, wz]) => {
    const wheel = new THREE.Group();
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.72, wz);
    cGroup.add(wheel);
    const wheelDisk = new THREE.Mesh(new THREE.CylinderGeometry(0.69, 0.69, 0.22, 20), woodMat);
    wheelDisk.castShadow = true;
    wheel.add(wheelDisk);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.64, 0.065, 8, 24), goldMat);
    rim.rotation.x = Math.PI / 2;
    rim.castShadow = true;
    wheel.add(rim);
    for (let spokeIndex = 0; spokeIndex < 10; spokeIndex++) {
      const angle = (spokeIndex / 10) * Math.PI * 2;
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.72), woodMat);
      spoke.position.set(Math.sin(angle) * 0.32, 0, Math.cos(angle) * 0.32);
      spoke.rotation.y = angle;
      spoke.castShadow = true;
      wheel.add(spoke);
    }
    const hub = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), goldMat);
    hub.scale.set(0.58, 1, 1);
    hub.castShadow = true;
    wheel.add(hub);
    wheels.push(wheel);
  });

  // Refined, articulated horse with a visible bridle and harness.
  const horseGroup = new THREE.Group();
  horseGroup.position.set(0, 0, 3.3);
  const horsePart = (geometry, material, position, scale = [1, 1, 1], rotation = null) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.scale.set(...scale);
    if (rotation) mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    horseGroup.add(mesh);
    return mesh;
  };
  horsePart(new THREE.SphereGeometry(0.72, 16, 12), horseMat, [0, 1.2, 0], [0.72, 0.72, 1.45]);
  horsePart(new THREE.SphereGeometry(0.42, 14, 12), horseMat, [0, 1.62, 0.84], [0.82, 1.48, 0.88], [0.35, 0, 0]);
  horsePart(new THREE.SphereGeometry(0.32, 14, 12), horseMat, [0, 2.12, 1.43], [0.72, 0.78, 1.0], [0.2, 0, 0]);
  horsePart(new THREE.SphereGeometry(0.2, 12, 10), horseMat, [0, 1.99, 1.72], [0.82, 0.62, 0.85]);
  const maneMat = createAnimeMaterial({ color: 0x1c1917, roughness: 0.82 });
  horsePart(new THREE.ConeGeometry(0.24, 0.85, 8), maneMat, [0, 2.1, 0.92], [1, 1, 0.8], [Math.PI / 2.5, 0, 0]);
  [-1, 1].forEach(side => {
    horsePart(new THREE.ConeGeometry(0.09, 0.38, 7), maneMat, [side * 0.18, 2.48, 1.34], [1, 1, 0.8], [0.18, 0, side * 0.28]);
    horsePart(new THREE.SphereGeometry(0.055, 8, 8), darkLeatherMat, [side * 0.23, 2.19, 1.55]);
    horsePart(new THREE.SphereGeometry(0.05, 8, 8), goldMat, [side * 0.235, 2.2, 1.59]);
  });
  const harness = horsePart(new THREE.TorusGeometry(0.54, 0.055, 8, 18, Math.PI), darkLeatherMat, [0, 1.38, 0.3], [1, 1, 1], [Math.PI / 2, 0, 0]);
  harness.rotation.z = Math.PI;
  const horseLegs = [];
  [[-0.32, 0.68], [0.32, 0.68], [-0.32, -0.68], [0.32, -0.68]].forEach(([lx, lz]) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.085, 0.95, 10), horseMat);
    leg.position.set(lx, 0.57, lz);
    leg.castShadow = true;
    horseGroup.add(leg);
    horseLegs.push(leg);
  });
  cGroup.add(horseGroup);

  const driver = new ArticulatedCharacter3D({
    gender: 'male',
    bodyType: 'male_hero',
    skinColor: '#f2c9a5',
    hairStyle: 'short_layered',
    hairColor: '#292524',
    eyeColor: '#78350f',
    expression: 'smile',
    topStyle: 'noble_coat',
    bottomStyle: 'pants',
    primaryColor: '#1e3a8a',
    secondaryColor: '#fbbf24',
    heightScale: 0.98,
    weaponId: 'sword_iron'
  });
  driver.root.position.set(0, 1.2, 1.48);
  driver.root.rotation.y = 0;
  driver.root.userData = { isNPC: true, npcName: 'คนขับรถม้า', role: 'carriage_driver' };
  driver.animState = 'sit';
  cGroup.add(driver.root);

  [-0.9, 0.9].forEach(x => {
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0xfff7cc, emissive: 0xffb74d, emissiveIntensity: 2.4 })
    );
    lamp.position.set(x, 2.08, 1.1);
    cGroup.add(lamp);
    const light = new THREE.PointLight(0xffc66d, 14, 12, 1.5);
    light.position.set(x, 2.08, 1.16);
    cGroup.add(light);
  });

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
    horseGroup,
    driver
  };
  cGroup.userData = { isCarriage: true, carriageRef: carriageObj, title: labelTitle };
  worldGroup.add(cGroup);
  animatedCarriages.push(carriageObj);
  registerFloatingLabel(
    cGroup,
    `<div class="px-2.5 py-0.5 rounded-full bg-amber-950/90 border border-amber-400/70 text-[10px] text-amber-200 font-bold shadow">🐎 ${labelTitle} [คลิกเพื่อเลือกเมือง/ร้านค้า]</div>`,
    3.3
  );
  registerFloatingLabel(
    driver.root,
    `<div class="px-2 py-0.5 rounded-full bg-slate-950/90 border border-sky-400/70 text-[9px] text-sky-200 font-bold shadow">🧑‍✈️ คนขับรถม้า</div>`,
    2.2
  );
}
// สร้างมหานครขนาดใหญ่ทั้ง 4 เมือง พร้อม 4 ย่านหลัก อาคารเดินเข้าได้ ประตูเมือง 4 ทิศ โคมไฟส่องสว่าง และรถม้า!
async function buildAllGrandCities() {
  const chatterLines = [
    "มหานครเอเธลการ์ดกว้างใหญ่มาก ลองนั่งรถม้าชมเมืองดูสิ!",
    "ตอนกลางคืนโคมไฟถนนตามย่านการค้าและย่านขุนนางสว่างสวยมากเลย!",
    "เดินเข้าไปข้างในกิลด์ โรงเตี้ยม ร้านอาวุธ และร้านอาหารได้ทุกหลังเลยนะ!",
    "ย่านการค้าทางทิศตะวันออกมีตลาดและร้านตีเหล็กคึกคักสุดๆ!",
    "กิลด์นักผจญภัยกำลังเปิดรับสมัครผู้กล้าอยู่ด้านในอาคารเลย!"
  ];
  for (let townIndex = 0; townIndex < TOWNS.length; townIndex++) {
    const town = TOWNS[townIndex];
    setLoadingProgress(18 + (townIndex / TOWNS.length) * 20, `กำลังสร้างเมือง ${townIndex + 1}/${TOWNS.length}...`);
    const R = town.radius; // 88 - 96 เมตร (มหานครขนาดใหญ่)
    await buildRealisticGrandTown(town, worldNoise, worldGroup, worldColliders, streetLampMaterials, streetLampGlowDiscs, interactiveSeats, streetLampPointLights);
    const baseY = worldNoise.getHeight(town.x, town.z);
    // 1. จุดพักผิงไฟนักเดินทางในสวนด้านข้างอย่างเป็นระเบียบ (ไม่กีดขวางถนนหลัก)
    const plazaCampfire = createVolumetricCampfire(1.0, true);
    plazaCampfire.position.set(town.x - 18.0, baseY, town.z + 4.0);
    worldGroup.add(plazaCampfire);
    worldColliders.push({ x: town.x - 18.0, z: town.z + 4.0, radius: 1.0, topY: baseY + 1.2, stepable: false });
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
      wx: town.x - 36, wz: town.z + 20, rotY: Math.PI, townName: town.name, townId: town.id
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
      { x: -28, z: -94, w: 12, d: 9, h: 6.5, wall: 0xf8fafc, roof: 0x6d28d9 },
      { x: 28,  z: -94, w: 12, d: 9, h: 6.5, wall: 0xf8fafc, roof: 0x4f46e5 },
      { x: 0,   z: -101, w: 16, d: 11, h: 7.5, wall: 0xfef9c3, roof: 0xd97706 },
      // ย่านการค้า (ทิศตะวันออก)
      { x: 94,  z: -28, w: 10, d: 8, h: 4.8, wall: 0xfef3c7, roof: 0x059669 },
      { x: 94,  z: 28,  w: 10, d: 8, h: 4.8, wall: 0xfef3c7, roof: 0xd97706 },
      // ย่านพักอาศัยทั่วไป (ทิศตะวันตกและทิศใต้)
      { x: -94, z: -28, w: 9,  d: 8, h: 4.6, wall: 0xf1f5f9, roof: 0x0284c7 },
      { x: -94, z: 28,  w: 9,  d: 8, h: 4.6, wall: 0xf1f5f9, roof: 0xdc2626 },
      { x: -30, z: 94,  w: 10, d: 8, h: 4.8, wall: 0xffedd5, roof: 0xb45309 },
      { x: 30,  z: 94,  w: 10, d: 8, h: 4.8, wall: 0xffedd5, roof: 0x15803d }
    ];
    extraDistrictBuildings.forEach(b => {
      const requestedX = town.x + b.x, requestedZ = town.z + b.z;
      const placement = resolveBuildingPlacement({
        wx: requestedX,
        wz: requestedZ,
        width: b.w,
        depth: b.d,
        title: `อาคารย่านเมือง ${town.name}`
      });
      if (!placement) return;
      const bx = placement.wx, bz = placement.wz;
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
    spawnAnimatedCityCarriage(town, 71.5, Math.PI, 4.8, 'รถม้าสายย่านการค้า-ขุนนาง');
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
    await waitForRenderFrame();
  }

  // สร้างรูปปั้นประจำเมืองไว้กลางลานของแต่ละเมือง
  replaceTownCrystalsWithStatues(TOWNS, animatedTownCrystals, worldGroup, worldNoise, worldColliders);
  // ปลดล็อกประตูเมืองทั้ง 4 ทิศ + สร้างถ้ำเขาวงกตขนาดใหญ่
  unlockAndAnimateCityGates(TOWNS, worldGroup, worldNoise, worldColliders);
  buildDeepLabyrinthCave(worldGroup, worldNoise, worldColliders, registerBoxCollider, registerFloatingLabel);
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
  ownedWeapons: ['sword_iron', 'staff_oak', 'bow_hunter', 'shield_knight', 'tome_holy', 'gloves_brawler'],
  ownedFashion: ['f_sailor', 'h_none', 'w_none', 'fx_none'],
  equippedFashion: ['f_sailor'],
  inventory: {
    mithril_ore: 2,
    moon_herb: 2,
    ancient_wood: 1,
    golden_wheat: 3,
    monster_core: 1
  },
  roomKeys: [],
  roomRentals: {},
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
ensureFashionState(playerStats, currentConfig);
const playerPhysics = {
  vx: 0, vy: 0, vz: 0,
  isGrounded: true,
  isInWater: false,
  jumpCount: 0,
  dashCooldown: 0,
  dashTimer: 0,
  dashInvulnerability: 0,
  dashDirectionX: 0,
  dashDirectionZ: 0,
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
      recalculateStats();
      playerStats.hp = playerStats.maxHp;
      playerStats.mp = playerStats.maxMp;
      updateHUD();
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
  Object.keys(WEAPONS).forEach(wid => {
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
      recalculateStats();
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
        <div class="grid grid-cols-2 gap-1.5 mb-2">
          ${[['none', 'ไม่ใส่'], ['angel_wings', '🦋 ปีกผีเสื้อ'], ['angel_wings_white', '🪽 ปีกนางฟ้าขาว'], ['halo', '😇 วงแหวนเทพ']].map(([v, l]) => `
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
const loadingScreen = document.getElementById('screen-loading');
const loadingStatus = document.getElementById('loading-status');
const loadingProgress = document.getElementById('loading-progress');
const loadingPercent = document.getElementById('loading-percent');

function setLoadingProgress(percent, message) {
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  loadingStatus.textContent = message;
  loadingProgress.style.width = `${value}%`;
  loadingPercent.textContent = `${value}%`;
}

function waitForRenderFrame() {
  return new Promise(resolve => requestAnimationFrame(resolve));
}

async function beginWorldLoading() {
  document.body.classList.remove('in-world');
  window.__syncMobileControls?.(false);
  loadingScreen.classList.remove('hidden');
  setLoadingProgress(4, 'กำลังเตรียมฉากและระบบแสง...');
  document.getElementById('screen-auth').classList.add('hidden');
  document.getElementById('screen-creator').classList.add('hidden');
  document.getElementById('screen-hud').classList.add('hidden');
  sculptTooltip.classList.add('hidden');
  creatorPedestal.visible = false;
  gameState = 'loading';
  await waitForRenderFrame();
  await waitForRenderFrame();
}

async function finishWorldLoading(spawnX, spawnZ) {
  worldGroup.visible = true;
  setLoadingProgress(43, 'กำลังโหลดภูมิประเทศรอบจุดเกิด...');
  const centerChunkX = Math.floor(spawnX / CHUNK_SIZE);
  const centerChunkZ = Math.floor(spawnZ / CHUNK_SIZE);
  const nearbyChunks = [
    [centerChunkX, centerChunkZ],
    [centerChunkX - 1, centerChunkZ],
    [centerChunkX + 1, centerChunkZ],
    [centerChunkX, centerChunkZ - 1],
    [centerChunkX, centerChunkZ + 1]
  ];
  for (let i = 0; i < nearbyChunks.length; i++) {
    const [cx, cz] = nearbyChunks[i];
    await generateChunk(cx, cz);
    setLoadingProgress(43 + ((i + 1) / nearbyChunks.length) * 39, 'กำลังเตรียมพื้นดินและพื้นที่รอบจุดเกิด...');
    await waitForRenderFrame();
  }

  const groundY = worldNoise.getHeight(spawnX, spawnZ);
  camera.position.set(spawnX, groundY + 7, spawnZ + 12);
  camera.lookAt(spawnX, groundY + 1, spawnZ);
  setLoadingProgress(87, 'กำลังเตรียมโมเดลและแสงให้พร้อม...');
  await waitForRenderFrame();
  setLoadingProgress(100, 'พร้อมออกเดินทางแล้ว!');
  gameState = 'world';
  document.body.classList.add('in-world');
  window.__syncMobileControls?.(true);
  document.getElementById('screen-hud').classList.remove('hidden');
  await waitForRenderFrame();
  loadingScreen.classList.add('hidden');
}

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
        ownedFashion: Array.isArray(savedData.stats.ownedFashion) ? savedData.stats.ownedFashion : [],
        equippedFashion: Array.isArray(savedData.stats.equippedFashion) ? savedData.stats.equippedFashion : null,
        roomKeys: Array.isArray(savedData.stats.roomKeys) ? savedData.stats.roomKeys : [],
        roomRentals: savedData.stats.roomRentals || {},
        roomStorage: { ...playerStats.roomStorage, ...(savedData.stats.roomStorage || {}) },
        cooldowns: savedData.stats.cooldowns || { monsters: {}, nodes: {} },
        savedSpawn: savedData.stats.savedSpawn || null
      };
      playerStats.roomKeys = playerStats.roomKeys.map(id => {
        if (String(id).includes('-')) return String(id);
        const qualifiedId = `0-${id}`;
        if (!playerStats.roomRentals[qualifiedId]) {
          playerStats.roomRentals[qualifiedId] = { expiresAtGameDay: getCurrentGameDay() + 1 };
        }
        return qualifiedId;
      });
    }
  }
  ensureFashionState(playerStats, currentConfig);

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
let myPartyId = null;
let partyInviteTo = null;
let partyInvitePulse = 0;
let partyDisbandId = null;
let partyDisbandPulse = 0;
let pendingPartyInvite = null;

function isLocalPartyLeader() {
  return !!myPartyId && myPartyId.startsWith(`${myClientId}_`);
}

function renderPartyPanel() {
  const list = document.getElementById('party-members-list');
  if (!list) return;
  list.replaceChildren();
  const status = document.getElementById('party-status');
  const leaveButton = document.getElementById('btn-leave-party');
  const teammates = Array.from(remotePlayers.values()).filter(remote =>
    myPartyId && remote.partyId === myPartyId
  );
  const memberCount = teammates.length + (myPartyId ? 1 : 0);
  if (status) status.textContent = myPartyId
    ? `ทีม ${memberCount} คน${isLocalPartyLeader() ? ' • หัวหน้าทีม' : ''}`
    : 'ยังไม่ได้เข้าร่วมทีม';
  if (leaveButton) leaveButton.classList.toggle('hidden', !myPartyId);

  const addPlayerRow = (name, stateLabel, actionLabel, onAction) => {
    const row = document.createElement('div');
    row.className = 'flex items-center justify-between gap-2 rounded-lg bg-slate-900/70 px-2 py-1.5';
    const label = document.createElement('span');
    label.className = 'min-w-0 truncate text-slate-100';
    label.textContent = `${stateLabel} ${name}`;
    row.appendChild(label);
    if (actionLabel && onAction) {
      const action = document.createElement('button');
      action.className = 'shrink-0 rounded-md bg-indigo-500/25 px-2 py-1 text-[10px] font-bold text-indigo-100 hover:bg-indigo-500/50';
      action.textContent = actionLabel;
      action.addEventListener('click', onAction);
      row.appendChild(action);
    }
    list.appendChild(row);
  };

  addPlayerRow(
    currentConfig.name || 'ฉัน',
    myPartyId ? '🟢' : '🟡',
    isLocalPartyLeader() ? 'หัวหน้าทีม' : myPartyId ? 'สมาชิก' : 'คนเดียว',
    null
  );
  remotePlayers.forEach(remote => {
    const isTeammate = !!myPartyId && remote.partyId === myPartyId;
    const inOtherParty = !!remote.partyId && remote.partyId !== myPartyId;
    addPlayerRow(
      remote.displayName,
      isTeammate ? '🟢' : inOtherParty ? '🔒' : '⚪',
      isTeammate ? 'สมาชิก' : inOtherParty ? 'ทีมอื่น' : 'เชิญ',
      isTeammate || inOtherParty ? null : () => invitePlayerToParty(remote.clientId)
    );
  });
  if (remotePlayers.size === 0) {
    const empty = document.createElement('p');
    empty.className = 'px-2 py-1 text-[10px] text-slate-400';
    empty.textContent = 'ยังไม่มีผู้เล่นออนไลน์ในโลกนี้';
    list.appendChild(empty);
  }
}

function invitePlayerToParty(clientId) {
  const remote = remotePlayers.get(clientId);
  if (!remote || (remote.partyId && remote.partyId !== myPartyId)) return;
  if (!myPartyId) myPartyId = `${myClientId}_${Date.now()}`;
  partyInviteTo = clientId;
  partyInvitePulse = Date.now();
  addLog(`👥 ส่งคำเชิญปาร์ตี้ให้ ${remote.displayName}`, 'text-indigo-200');
  renderPartyPanel();
  broadcastMyStateToRTDB();
}

function acceptPartyInvite() {
  if (!pendingPartyInvite) return;
  if (myPartyId && myPartyId !== pendingPartyInvite.partyId) {
    addLog('⚠️ ออกจากปาร์ตี้ปัจจุบันก่อนเข้าร่วมทีมใหม่', 'text-rose-300');
    return;
  }
  myPartyId = pendingPartyInvite.partyId;
  addLog(`👥 เข้าร่วมปาร์ตี้ของ ${pendingPartyInvite.displayName} แล้ว`, 'text-indigo-200');
  pendingPartyInvite = null;
  document.getElementById('party-invite-prompt').classList.add('hidden');
  renderPartyPanel();
  broadcastMyStateToRTDB();
}

function declinePartyInvite() {
  pendingPartyInvite = null;
  document.getElementById('party-invite-prompt').classList.add('hidden');
}

function leaveParty() {
  if (!myPartyId) return;
  partyDisbandId = isLocalPartyLeader() ? myPartyId : null;
  partyDisbandPulse = partyDisbandId ? Date.now() : 0;
  addLog(isLocalPartyLeader() ? '👥 ยุบปาร์ตี้แล้ว' : '👥 ออกจากปาร์ตี้แล้ว', 'text-indigo-200');
  myPartyId = null;
  partyInviteTo = null;
  renderPartyPanel();
  broadcastMyStateToRTDB();
}
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
  const wasNewPlayer = !remotePlayers.has(clientId);
  const previousPartyId = remotePlayers.get(clientId)?.partyId || null;
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
      lastSupportHealPulse: pData.supportHealPulse || 0,
      lastTankShieldPulse: pData.tankShieldPulse || 0,
      lastChatSeq: pData.chatSeq || 0,
      lastPartyInvitePulse: 0,
      lastPartyDisbandPulse: 0,
      partyId: null,
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
    rp.partyId = pData.partyId || null;
    if (pData.attackPulse && pData.attackPulse !== rp.lastAttackPulse) {
      rp.lastAttackPulse = pData.attackPulse;
      rp.char3D.triggerWeaponCombo(pData.comboStep || 1);
    }
    if (pData.skillPulse && pData.skillPulse !== rp.lastSkillPulse) {
      rp.lastSkillPulse = pData.skillPulse;
      skillFX.spawnClassSkillFX(
        getSkillClassId(pData.config),
        !!pData.skillIsUlt,
        rp.char3D.root.position,
        null,
        rp.targetRotY
      );
    }
  }
  rp.partyId = pData.partyId || null;
  const invitePulse = Number(pData.partyInvitePulse) || 0;
  if (pData.partyInviteTo === myClientId && invitePulse > rp.lastPartyInvitePulse) {
    rp.lastPartyInvitePulse = invitePulse;
    const invitePartyId = pData.partyId || `${clientId}_${invitePulse}`;
    if (Date.now() - invitePulse <= 20000 && (!myPartyId || myPartyId === invitePartyId)) {
      pendingPartyInvite = { partyId: invitePartyId, displayName };
      document.getElementById('party-invite-text').textContent = `${displayName} ชวนคุณเข้าร่วมปาร์ตี้`;
      document.getElementById('party-invite-prompt').classList.remove('hidden');
    }
  }
  const disbandPulse = Number(pData.partyDisbandPulse) || 0;
  if (disbandPulse > rp.lastPartyDisbandPulse) {
    rp.lastPartyDisbandPulse = disbandPulse;
    if (myPartyId && pData.partyDisbandId === myPartyId) {
      myPartyId = null;
      addLog('👥 หัวหน้าทีมยุบปาร์ตี้แล้ว', 'text-indigo-200');
      renderPartyPanel();
      broadcastMyStateToRTDB();
    }
  }
  if (wasNewPlayer || previousPartyId !== rp.partyId) renderPartyPanel();
  if (pData.supportHealPulse && pData.supportHealPulse !== rp.lastSupportHealPulse) {
    rp.lastSupportHealPulse = pData.supportHealPulse;
    const radius = Number(pData.supportHealRadius) || 0;
    if (gameState === 'world' && myPartyId && rp.partyId === myPartyId && radius > 0 &&
        playerChar3D.root.position.distanceTo(rp.char3D.root.position) <= radius) {
      const percent = Math.max(0, Number(pData.supportHealPercent) || 0);
      const amount = percent > 0
        ? Math.round(playerStats.maxHp * percent)
        : Math.max(0, Number(pData.supportHealAmount) || 0);
      playerStats.hp = Math.min(playerStats.maxHp, playerStats.hp + amount);
      if (amount > 0) {
        showFloatingDamage(playerChar3D.root.position, `+${amount} HP จากเพื่อน`, '#34d399');
        updateHUD();
      }
    }
  }
  if (pData.tankShieldPulse && pData.tankShieldPulse !== rp.lastTankShieldPulse) {
    rp.lastTankShieldPulse = pData.tankShieldPulse;
    if (gameState === 'world' && myPartyId && rp.partyId === myPartyId &&
        playerChar3D.root.position.distanceTo(rp.char3D.root.position) <= 8) {
      classCombatState.tankShield = Math.max(classCombatState.tankShield, Number(pData.tankShieldAmount) || 0);
      classCombatState.tankShieldTimer = 20;
      addLog('🛡️ ได้รับโล่พลังงานจากแทงค์ใกล้ตัว', 'text-sky-300');
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
  renderPartyPanel();
}
function updateOnlinePlayerCountUI() {
  const countEl = document.getElementById('online-count');
  if (countEl) {
    countEl.textContent = String(1 + remotePlayers.size);
  }
}
document.getElementById('btn-party-panel').addEventListener('click', () => {
  const panel = document.getElementById('party-panel');
  panel.classList.toggle('hidden');
  if (!panel.classList.contains('hidden')) renderPartyPanel();
});
document.getElementById('btn-close-party-panel').addEventListener('click', () => {
  document.getElementById('party-panel').classList.add('hidden');
});
document.getElementById('btn-leave-party').addEventListener('click', leaveParty);
document.getElementById('btn-accept-party-invite').addEventListener('click', acceptPartyInvite);
document.getElementById('btn-decline-party-invite').addEventListener('click', declinePartyInvite);
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
let lastSupportHealPulse = 0;
let lastSupportHealAmount = 0;
let lastSupportHealRadius = 0;
let lastSupportHealPercent = 0;
let lastTankShieldPulse = 0;
let lastTankShieldAmount = 0;
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
    supportHealPulse: lastSupportHealPulse,
    supportHealAmount: lastSupportHealAmount,
    supportHealRadius: lastSupportHealRadius,
    supportHealPercent: lastSupportHealPercent,
    tankShieldPulse: lastTankShieldPulse,
    tankShieldAmount: lastTankShieldAmount,
    partyId: myPartyId,
    partyInviteTo,
    partyInvitePulse,
    partyDisbandId,
    partyDisbandPulse,
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
let targetSupportPlayerId = null;
let moveTargetPos = null;
let skillCooldowns = { skill1: 0, ult: 0 };
const classCombatState = {
  fighterStacks: 0,
  fighterComboSets: 0,
  fighterSkill: null,
  fighterUltimate: null,
  swordSpirit: 0,
  swordUltimate: null,
  mageElement: 0,
  mageField: null,
  supportField: 0,
  supportFieldTick: 0,
  tankShield: 0,
  tankShieldTimer: 0
};
const mageElements = [
  { name: 'ไฟ', icon: '🔥', color: 0xf97316 },
  { name: 'น้ำ', icon: '💧', color: 0x38bdf8 },
  { name: 'ลม', icon: '🌪️', color: 0x4ade80 },
  { name: 'ดิน', icon: '🪨', color: 0xa16207 },
  { name: 'ไม้', icon: '🌿', color: 0x22c55e },
  { name: 'ไฟฟ้า', icon: '⚡', color: 0xeab308 },
  { name: 'น้ำแข็ง', icon: '❄️', color: 0x67e8f9 }
];
function getSkillClassId(config = currentConfig) {
  if (config.classId !== 'classless') return config.classId;
  const weaponType = WEAPONS[config.weaponId]?.type;
  return {
    sword: 'swordsman',
    gloves: 'fighter',
    staff: 'mage',
    bow: 'archer',
    shield: 'tank',
    tome: 'support'
  }[weaponType] || 'swordsman';
}
let currentComboStep = 1;
let comboResetTimer = 0;
let comboInputQueued = false;
let archerChargeStartedAt = 0;
let pendingArrowCharge = 1;
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
  playerStats.def = cls.stats.def + lvBonus * 3;
  playerStats.spd = cls.stats.spd * (currentConfig.classId === 'archer' ? 1.25 : 1);
  playerStats.hp = Math.min(playerStats.hp, playerStats.maxHp);
  playerStats.mp = Math.min(playerStats.mp, playerStats.maxMp);
  updateHUD();
}
function updateHUD() {
  const cls = CLASSES[currentConfig.classId];
  const skillClass = CLASSES[getSkillClassId()];
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
  const comboLength = w.type === 'gloves' ? 4 : 3;
  document.getElementById('combo-badge').textContent = `COMBO x${playerChar3D.comboStep || 1}/${comboLength}`;
  document.getElementById('combo-icon').textContent = w.type === 'gloves' ? '🥊' : w.type === 'bow' ? '🏹' : '⚔️';
  const mageElement = mageElements[classCombatState.mageElement % mageElements.length];
  document.getElementById('skill1-icon').textContent =
    getSkillClassId() === 'mage' ? mageElement.icon : skillClass.skills.active.icon;
  document.getElementById('skill1-name').textContent =
    getSkillClassId() === 'mage' ? `ธาตุ${mageElement.name}` : skillClass.skills.active.name;
  document.getElementById('passive-icon').textContent =
    currentConfig.classId === 'classless' ? '🚫' : cls.skills.passive.icon;
  const passiveProgress = currentConfig.classId === 'fighter'
    ? ` ${classCombatState.fighterStacks} ขั้น`
    : currentConfig.classId === 'swordsman'
      ? ` ${classCombatState.swordSpirit} ขั้น`
      : currentConfig.classId === 'tank' && classCombatState.tankShieldTimer > 0
        ? ` ${Math.ceil(classCombatState.tankShieldTimer)} วิ`
        : '';
  document.getElementById('passive-name').textContent =
    currentConfig.classId === 'classless' ? 'ไม่มีพาสซีฟอาชีพ' : `${cls.skills.passive.name}${passiveProgress}`;
  document.getElementById('ult-icon').textContent = skillClass.skills.ult.icon;
  document.getElementById('ult-name').textContent = skillClass.skills.ult.name;
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
  box.classList.toggle('is-boss', !!targetMonster.isBoss);
  document.getElementById('target-name').textContent = `${targetMonster.isBoss ? '👑 ' : ''}${targetMonster.name}`;
  document.getElementById('target-lv').textContent = `Lv.${targetMonster.lv}`;
  const bossBadge = document.getElementById('target-boss-label');
  if (bossBadge) bossBadge.classList.toggle('hidden', !targetMonster.isBoss);
  const tierNames = { easy: 'เขตเริ่มต้น', intermediate: 'เขตระดับกลาง', high: 'เขตระดับสูง', danger: 'เขตอันตราย' };
  const zoneLabel = document.getElementById('target-zone');
  if (zoneLabel) zoneLabel.textContent = targetMonster.isBoss ? 'บอสประจำเขตอันตราย' : (tierNames[targetMonster.tier] || 'เขตสำรวจ');
  document.getElementById('target-hp-bar').style.width = `${Math.max(0, (targetMonster.hp / targetMonster.maxHp) * 100)}%`;
  document.getElementById('target-hp-text').textContent = `${Math.ceil(targetMonster.hp)} / ${targetMonster.maxHp}`;
  const comboLength = WEAPONS[currentConfig.weaponId]?.type === 'gloves' ? 4 : 3;
  document.getElementById('combo-badge').textContent = `COMBO x${playerChar3D.comboStep || 1}/${comboLength}`;
}
function applyCombatDamage(mon, amount, { knockback = 0, color = '#fbbf24', prefix = '', soundHit = true } = {}) {
  if (!mon || mon.hp <= 0) return 0;
  let damage = Math.max(1, Math.round(amount));
  if (getSkillClassId() === 'mage') {
    const element = mageElements[classCombatState.mageElement % mageElements.length];
    const previousElement = mon.elementalMark;
    if (previousElement && previousElement !== element.name) {
      damage = Math.round(damage * 1.5);
      const reactionName = previousElement === 'น้ำ' && element.name === 'ไฟ'
        ? 'ระเหย'
        : previousElement === 'ไฟฟ้า' && element.name === 'น้ำแข็ง'
          ? 'แตกสลาย'
          : 'ปฏิกิริยาธาตุ';
      showFloatingDamage(mon.mesh.position, `${reactionName} ${previousElement}+${element.name}!`, '#f0abfc');
    }
    mon.elementalMark = element.name;
    mon.elementalMarkTimer = 8;
    if (element.name === 'ไฟ') {
      mon.elementalDotTimer = 3;
      mon.elementalDotTick = 0;
      mon.elementalDotDamage = Math.max(1, playerStats.matk * 0.15);
    } else if (element.name === 'น้ำ') {
      mon.slowTimer = 2;
    } else if (element.name === 'ดิน') {
      mon.stunTimer = Math.max(mon.stunTimer || 0, 0.45);
    } else if (element.name === 'น้ำแข็ง') {
      mon.stunTimer = Math.max(mon.stunTimer || 0, 0.7);
    } else if (element.name === 'ไฟฟ้า') {
      mon.stunTimer = Math.max(mon.stunTimer || 0, 0.3);
    } else if (element.name === 'ไม้') {
      playerStats.hp = Math.min(playerStats.maxHp, playerStats.hp + playerStats.matk * 0.04);
    }
  }
  mon.hp = Math.max(0, mon.hp - damage);
  targetMonster = mon;
  if (knockback > 0) {
    const pPos = playerChar3D.root.position;
    const ang = Math.atan2(mon.mesh.position.x - pPos.x, mon.mesh.position.z - pPos.z);
    mon.vx = Math.sin(ang) * knockback;
    mon.vz = Math.cos(ang) * knockback;
    mon.vy = knockback > 9 ? 5.8 : 2.8;
  }
  if (soundHit) sound.sfxHit();
  showFloatingDamage(mon.mesh.position, `${prefix}${damage}`, color);
  if (currentConfig.classId === 'support') {
    const healing = damage * 0.1;
    playerStats.hp = Math.min(playerStats.maxHp, playerStats.hp + healing);
    if (healing >= 1) showFloatingDamage(playerChar3D.root.position, `+${Math.round(healing)} HP`, '#34d399');
  }
  if (currentConfig.classId === 'fighter' && classCombatState.fighterSkill) {
    classCombatState.fighterStacks = Math.min(99, classCombatState.fighterStacks + 1);
  }
  if (mon.hp <= 0) handleMonsterKill(mon);
  updateHUD();
  updateTargetUI();
  return damage;
}
function getForwardCombatTargets(range, halfArc = 1.15) {
  const origin = playerChar3D.root.position;
  const angle = playerPhysics.targetRotY;
  const direction = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
  return monsters.filter(mon => {
    if (mon.hp <= 0) return false;
    const offset = mon.mesh.position.clone().sub(origin);
    if (offset.length() > range) return false;
    return direction.dot(offset.normalize()) >= Math.cos(halfArc);
  });
}
function spawnCombatBurst(position, color, radius) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.65, 0.9, 36),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.copy(position);
  ring.position.y += 0.08;
  worldGroup.add(ring);
  vfxRings.push({ mesh: ring, age: 0, maxRadius: radius / 0.9 });
}
function createFighterCometTrail(position) {
  const geometry = new THREE.BufferGeometry();
  const capacity = 48;
  const positions = new Float32Array(capacity * 3);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setDrawRange(0, 0);
  const outer = new THREE.Line(geometry, new THREE.LineBasicMaterial({
    color: 0xf97316, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false
  }));
  const inner = new THREE.Line(geometry, new THREE.LineBasicMaterial({
    color: 0xfff7cc, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false
  }));
  outer.frustumCulled = false;
  inner.frustumCulled = false;
  worldGroup.add(outer, inner);
  return {
    geometry, outer, inner, points: [{ position: position.clone(), age: 0 }],
    lastPosition: position.clone(), positions, capacity
  };
}
function updateFighterCometTrail(trail, position, dt) {
  if (!trail) return;
  for (const point of trail.points) point.age += dt;
  if (trail.lastPosition.distanceTo(position) >= 0.24) {
    trail.points.push({ position: position.clone(), age: 0 });
    trail.lastPosition.copy(position);
  }
  while (trail.points.length > trail.capacity || (trail.points.length > 1 && trail.points[0].age > 0.48)) {
    trail.points.shift();
  }
  const attribute = trail.geometry.attributes.position;
  trail.points.forEach((point, index) => {
    attribute.setXYZ(index, point.position.x, point.position.y + 0.08, point.position.z);
  });
  attribute.needsUpdate = true;
  trail.geometry.setDrawRange(0, trail.points.length);
  const opacity = trail.points.length < 2 ? 0 : Math.max(0, 1 - trail.points[0].age / 0.48);
  trail.outer.material.opacity = opacity * 0.9;
  trail.inner.material.opacity = opacity;
  trail.outer.visible = opacity > 0;
  trail.inner.visible = opacity > 0;
}
function disposeFighterCometTrail(trail) {
  if (!trail) return;
  worldGroup.remove(trail.outer, trail.inner);
  trail.geometry.dispose();
  trail.outer.material.dispose();
  trail.inner.material.dispose();
}
function updateClassCombatState(dt) {
  const pPos = playerChar3D.root.position;
  monsters.forEach(mon => {
    if (mon.elementalMarkTimer > 0) {
      mon.elementalMarkTimer = Math.max(0, mon.elementalMarkTimer - dt);
      if (mon.elementalMarkTimer === 0) mon.elementalMark = null;
    }
    if (mon.slowTimer > 0) mon.slowTimer = Math.max(0, mon.slowTimer - dt);
    if (mon.elementalDotTimer > 0) {
      mon.elementalDotTimer = Math.max(0, mon.elementalDotTimer - dt);
      mon.elementalDotTick = (mon.elementalDotTick || 0) + dt;
      if (mon.elementalDotTick >= 1 && mon.hp > 0) {
        mon.elementalDotTick -= 1;
        const damage = Math.max(1, Math.round(mon.elementalDotDamage || 1));
        mon.hp = Math.max(0, mon.hp - damage);
        showFloatingDamage(mon.mesh.position, `🔥 -${damage}`, '#fb923c');
        if (mon.hp <= 0) handleMonsterKill(mon);
      }
    }
  });
  const fighterSkill = classCombatState.fighterSkill;
  if (fighterSkill) {
    fighterSkill.elapsed += dt;
    while (fighterSkill.hits < 10 && fighterSkill.elapsed >= fighterSkill.nextHit) {
      fighterSkill.nextHit += 0.2;
      fighterSkill.hits++;
      playerChar3D.triggerWeaponCombo(((fighterSkill.hits - 1) % 4) + 1);
      sound.sfxPunch(fighterSkill.hits);
      getForwardCombatTargets(5.5, 1.35).forEach(mon => {
        applyCombatDamage(mon, playerStats.atk * 0.72, { knockback: 1.5, color: '#fb923c', prefix: '🥊 -', soundHit: false });
      });
    }
    if (fighterSkill.hits >= 10) {
      classCombatState.fighterSkill = null;
      addLog(`🥊 หมัดพายุครบ 10 ครั้ง! สะสม ${classCombatState.fighterStacks} ขั้นนักสู้`, 'text-orange-300');
    }
  }

  const fighterUltimate = classCombatState.fighterUltimate;
  if (fighterUltimate) {
    fighterUltimate.elapsed += dt;
    playerPhysics.vx = 0;
    playerPhysics.vz = 0;
    const center = fighterUltimate.center;

    if (fighterUltimate.phase === 'approach') {
      fighterUltimate.phaseTimer += dt;
      const progress = Math.min(1, fighterUltimate.phaseTimer / fighterUltimate.approachDuration);
      const firstPoint = fighterUltimate.vertices[fighterUltimate.path[0]];
      pPos.x = THREE.MathUtils.lerp(fighterUltimate.approachFrom.x, firstPoint.x, progress);
      pPos.z = THREE.MathUtils.lerp(fighterUltimate.approachFrom.z, firstPoint.z, progress);
      playerPhysics.targetRotY = Math.atan2(firstPoint.x - pPos.x, firstPoint.z - pPos.z);
      if (progress >= 1) {
        fighterUltimate.phase = 'star';
        fighterUltimate.phaseTimer = 0;
      }
    } else if (fighterUltimate.phase === 'star') {
      fighterUltimate.phaseTimer += dt;
      const segmentDuration = 0.18;
      const progress = Math.min(1, fighterUltimate.phaseTimer / segmentDuration);
      const from = fighterUltimate.vertices[fighterUltimate.path[fighterUltimate.segment]];
      const to = fighterUltimate.vertices[fighterUltimate.path[fighterUltimate.segment + 1]];
      pPos.x = THREE.MathUtils.lerp(from.x, to.x, progress);
      pPos.z = THREE.MathUtils.lerp(from.z, to.z, progress);
      playerPhysics.targetRotY = Math.atan2(to.x - from.x, to.z - from.z);

      if (!fighterUltimate.hitApplied && progress >= 0.5) {
        fighterUltimate.hitApplied = true;
        playerChar3D.triggerWeaponCombo((fighterUltimate.segment % 4) + 1);
        sound.sfxPunchUltimate(false);
        monsters.forEach(mon => {
          if (mon.hp > 0 && Math.hypot(mon.mesh.position.x - center.x, mon.mesh.position.z - center.z) <= 2.2) {
            applyCombatDamage(mon, playerStats.atk * 0.55, {
              knockback: 0,
              color: '#fb7185',
              prefix: '🌟 -',
              soundHit: false
            });
          }
        });
        spawnCombatBurst(center, 0xfb7185, 3.2);
      }

      if (progress >= 1) {
        fighterUltimate.segment++;
        fighterUltimate.phaseTimer = 0;
        fighterUltimate.hitApplied = false;
        if (fighterUltimate.segment >= 5) {
          fighterUltimate.phase = 'leap';
          fighterUltimate.phaseTimer = 0;
          playerPhysics.vy = 12;
          playerPhysics.isGrounded = false;
          sound.sfxJump();
        }
      }
    } else if (fighterUltimate.phase === 'leap') {
      fighterUltimate.phaseTimer += dt;
      pPos.x = center.x;
      pPos.z = center.z;
      if (fighterUltimate.phaseTimer >= 0.38) {
        fighterUltimate.phase = 'slam';
        fighterUltimate.phaseTimer = 0;
        playerPhysics.vy = -20;
      }
    } else if (fighterUltimate.phase === 'slam') {
      fighterUltimate.phaseTimer += dt;
      pPos.x = center.x;
      pPos.z = center.z;
      if (playerPhysics.isGrounded || fighterUltimate.phaseTimer >= 0.8) {
        sound.sfxPunchUltimate(true);
        spawnCombatBurst(center, 0xfbbf24, 9);
        const ultimateMultiplier = 1 + fighterUltimate.stacks * 0.12;
        monsters.forEach(mon => {
          if (mon.hp > 0 && Math.hypot(mon.mesh.position.x - center.x, mon.mesh.position.z - center.z) <= 9) {
            applyCombatDamage(mon, playerStats.atk * 2 * ultimateMultiplier, {
              knockback: 14,
              color: '#fbbf24',
              prefix: '☄️ -',
              soundHit: false
            });
          }
        });
        addLog(`🔥 อัลติเมทเสร็จสิ้น พลังจาก ${fighterUltimate.stacks} ขั้นนักสู้ถูกใช้แล้ว`, 'text-amber-300');
        classCombatState.fighterStacks = 0;
        disposeFighterCometTrail(fighterUltimate.trail);
        classCombatState.fighterUltimate = null;
        playerPhysics.jumpCount = 0;
        playerPhysics.vy = 0;
        updateHUD();
      }
    }
    if (classCombatState.fighterUltimate) {
      updateFighterCometTrail(fighterUltimate.trail, pPos, dt);
    }
  }

  const swordUltimate = classCombatState.swordUltimate;
  if (swordUltimate) {
    swordUltimate.elapsed += dt;
    const interval = 5 / swordUltimate.hits;
    while (swordUltimate.completed < swordUltimate.hits && swordUltimate.elapsed >= swordUltimate.nextHit) {
      swordUltimate.nextHit += interval;
      swordUltimate.completed++;
      playerChar3D.triggerWeaponCombo(((swordUltimate.completed - 1) % 3) + 1);
      if (swordUltimate.completed === 1 || swordUltimate.completed % 3 === 0) sound.sfxSwordUltimate();
      const targets = getForwardCombatTargets(15, Math.PI);
      const target = targetMonster?.hp > 0 && pPos.distanceTo(targetMonster.mesh.position) <= 15
        ? targetMonster
        : targets[0];
      if (target) {
        playerPhysics.targetRotY = Math.atan2(target.mesh.position.x - pPos.x, target.mesh.position.z - pPos.z);
        applyCombatDamage(target, playerStats.atk * 1.3, { knockback: 1.2, color: '#fca5a5', prefix: '⚔️ -', soundHit: false });
      }
    }
    if (swordUltimate.completed >= swordUltimate.hits || swordUltimate.elapsed >= 5) {
      classCombatState.swordUltimate = null;
    }
  }

  if (classCombatState.tankShieldTimer > 0) {
    classCombatState.tankShieldTimer = Math.max(0, classCombatState.tankShieldTimer - dt);
    if (classCombatState.tankShieldTimer === 0) classCombatState.tankShield = 0;
  }

  if (classCombatState.supportField > 0) {
    classCombatState.supportField = Math.max(0, classCombatState.supportField - dt);
    classCombatState.supportFieldTick += dt;
    if (classCombatState.supportFieldTick >= 1) {
      classCombatState.supportFieldTick -= 1;
      const amount = Math.round(playerStats.maxHp * 0.05);
      playerStats.hp = Math.min(playerStats.maxHp, playerStats.hp + amount);
      lastSupportHealPulse = Date.now();
      lastSupportHealPercent = 0.05;
      lastSupportHealAmount = 0;
      lastSupportHealRadius = 8;
      showFloatingDamage(pPos, `+${amount} HP`, '#34d399');
      updateHUD();
      broadcastMyStateToRTDB();
    }
    if (classCombatState.supportField === 0) classCombatState.supportFieldTick = 0;
  }

  const mageField = classCombatState.mageField;
  if (mageField) {
    mageField.elapsed -= dt;
    mageField.tick += dt;
    if (mageField.tick >= 1) {
      mageField.tick -= 1;
      spawnCombatBurst(pPos, mageField.element.color, 6.5);
      monsters.forEach(mon => {
        if (mon.hp > 0 && pPos.distanceTo(mon.mesh.position) <= 6.5) {
          applyCombatDamage(mon, playerStats.matk * 0.3, { knockback: 0, color: `#${mageField.element.color.toString(16).padStart(6, '0')}`, prefix: `${mageField.element.icon} -`, soundHit: false });
        }
      });
    }
    if (mageField.elapsed <= 0) classCombatState.mageField = null;
  }
}
function queueOrPerformComboAttack() {
  if (isPlayerDead) return;
  if (playerChar3D.attackTimer > 0.08) {
    comboInputQueued = true;
    return;
  }
  executeComboAttackStep();
}
function executeComboAttackStep() {
  if (isPlayerDead) return;
  comboInputQueued = false;
  activeHarvestNode = null;
  document.getElementById('hud-gather-box').classList.add('hidden');
  const pPos = playerChar3D.root.position;
  const w = WEAPONS[currentConfig.weaponId] || WEAPONS.sword_iron;
  const isRanged = ['bow', 'staff', 'tome'].includes(w.type);
  const comboLength = w.type === 'gloves' ? 4 : 3;
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
  if (w.type === 'gloves') sound.sfxPunch(step);
  else if (currentConfig.classId === 'swordsman') sound.sfxSwordAttack(step);
  else sound.sfxCombo(step, w.type);
  lastAttackPulse = Date.now();
  broadcastMyStateToRTDB();
  document.getElementById('combo-step-label').textContent = `คอมโบ ${step}/${comboLength}`;
  comboResetTimer = 2.2;
  currentComboStep = (currentComboStep % comboLength) + 1;
  if (step === comboLength) {
    if (currentConfig.classId === 'fighter') {
      classCombatState.fighterComboSets++;
      if (classCombatState.fighterComboSets >= 2) {
        classCombatState.fighterComboSets = 0;
        skillCooldowns.skill1 = 0;
        document.getElementById('cd-skill1').classList.add('hidden');
        addLog('🔥 คอมโบครบ 2 ชุด! รีเซ็ตคูลดาวน์สกิลนักสู้', 'text-orange-300');
      }
    }
  }

  const forwardAngle = playerPhysics.targetRotY;
  if (!isRanged) {
    const stepImpulse = step === comboLength ? (w.type === 'gloves' ? 7.5 : 6.5) : 2.4;
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
  const chargedArrowMult = w.type === 'bow' ? pendingArrowCharge : 1;
  pendingArrowCharge = 1;
  const comboMult = (w.type === 'gloves'
    ? (step === 3 ? 1.55 : step === 4 ? 2.1 : 1.0)
    : (step === 1 ? 1.0 : step === 2 ? 1.35 : 1.95)) * chargedArrowMult;
  monsters.forEach(mon => {
    if (mon.hp <= 0) return;
    const dist = pPos.distanceTo(mon.mesh.position);
    const attackAngle = Math.atan2(mon.mesh.position.x - pPos.x, mon.mesh.position.z - pPos.z);
    const facingDiff = Math.abs(Math.atan2(
      Math.sin(attackAngle - forwardAngle),
      Math.cos(attackAngle - forwardAngle)
    ));
    const inForwardArc = dist <= range && facingDiff < (isRanged ? 0.35 : 1.35);
    if ((mon === targetMonster && dist <= range) || (!isRanged && dist <= 3.8) || (isRanged && inForwardArc)) {
      const crit = step === comboLength;
      const dmg = Math.round(power * comboMult * (0.92 + Math.random() * 0.2));
      applyCombatDamage(mon, dmg, {
        knockback: crit ? 11.5 : 5.2,
        color: crit ? '#f43f5e' : '#fbbf24',
        prefix: crit ? '💥 CRIT -' : '-'
      });
      if (currentConfig.classId === 'swordsman') {
        classCombatState.swordSpirit = Math.min(30, classCombatState.swordSpirit + (step === 3 ? 3 : 1));
      }
    }
  });
  if (currentConfig.classId === 'fighter') {
    document.getElementById('combo-step-label').textContent += ` | นักสู้ ${classCombatState.fighterStacks}`;
  }

  // ตัดคำสั่ง moveTargetPos = targetMonster.mesh.position.clone() ออก
  // เพื่อไม่ให้ตัวละครวิ่งเข้าไปหามอนสเตอร์เองตอนกดตีเล่นๆ
  updateTargetUI();
}
function triggerClassSkill(isUlt = false) {
  if (isPlayerDead) return;
  const skillClassId = getSkillClassId();
  const cls = CLASSES[skillClassId];
  const sk = isUlt ? cls.skills.ult : cls.skills.active;
  const cdKey = isUlt ? 'ult' : 'skill1';
  if (skillCooldowns[cdKey] > 0) return;
  let fighterUltimateTarget = null;
  if (skillClassId === 'fighter' && isUlt) {
    if (targetMonster?.hp > 0 && playerChar3D.root.position.distanceTo(targetMonster.mesh.position) <= 18) {
      fighterUltimateTarget = targetMonster;
    } else {
      fighterUltimateTarget = monsters.reduce((closest, mon) => {
        if (mon.hp <= 0) return closest;
        const distance = playerChar3D.root.position.distanceTo(mon.mesh.position);
        if (distance > 18 || (closest && distance >= closest.distance)) return closest;
        return { mon, distance };
      }, null)?.mon || null;
    }
    if (!fighterUltimateTarget) {
      addLog('⚠️ อัลติเมทนักสู้ต้องมีเป้าหมายที่ยังมีชีวิตอยู่ในระยะ 18 เมตร', 'text-rose-300');
      return;
    }
  }
  if (playerStats.mp < sk.mp) {
    addLog("⚠️ Mana ไม่เพียงพอสำหรับการใช้สกิล!", "text-rose-400");
    return;
  }
  playerStats.mp -= sk.mp;
  skillCooldowns[cdKey] = sk.cd;
  const pPos = playerChar3D.root.position;
  const targetPos = fighterUltimateTarget?.mesh.position ||
    ((targetMonster && targetMonster.hp > 0) ? targetMonster.mesh.position : null);
  if (skillClassId === 'fighter') {
    if (isUlt) {
      targetMonster = fighterUltimateTarget;
      moveTargetPos = null;
      playerPhysics.dashTimer = 0;
      playerPhysics.vx = 0;
      playerPhysics.vz = 0;
      const center = new THREE.Vector3(targetMonster.mesh.position.x, pPos.y, targetMonster.mesh.position.z);
      const startAngle = Math.atan2(pPos.x - center.x, pPos.z - center.z);
      const vertices = Array.from({ length: 5 }, (_, index) => {
        const angle = startAngle + index * Math.PI * 2 / 5;
        return new THREE.Vector3(
          center.x + Math.sin(angle) * 5,
          pPos.y,
          center.z + Math.cos(angle) * 5
        );
      });
      classCombatState.fighterUltimate = {
        elapsed: 0,
        phase: 'approach',
        phaseTimer: 0,
        approachFrom: pPos.clone(),
        approachDuration: Math.max(0.08, Math.min(0.24, pPos.distanceTo(vertices[0]) / 34)),
        center,
        target: targetMonster,
        vertices,
        path: [0, 2, 4, 1, 3, 0],
        segment: 0,
        hitApplied: false,
        stacks: classCombatState.fighterStacks,
        trail: createFighterCometTrail(pPos),
      };
      targetMonster.stunTimer = Math.max(targetMonster.stunTimer || 0, 2.2);
      playerChar3D.animState = 'attack';
      sound.sfxUltimate();
    } else {
      classCombatState.fighterSkill = { elapsed: 0, nextHit: 0.2, hits: 0 };
      sound.sfxPunchSkill();
    }
    const effectCenter = isUlt && classCombatState.fighterUltimate
      ? classCombatState.fighterUltimate.center
      : pPos;
    skillFX.spawnClassSkillFX(skillClassId, isUlt, pPos, isUlt ? effectCenter : targetPos, playerPhysics.targetRotY);
    spawnCombatBurst(effectCenter, isUlt ? 0xfb7185 : 0xf97316, isUlt ? 5.5 : 3.4);
    lastSkillPulse = Date.now();
    lastSkillIsUlt = isUlt;
    updateHUD();
    broadcastMyStateToRTDB();
    return;
  }

  if (skillClassId === 'mage' && !isUlt) {
    classCombatState.mageElement = (classCombatState.mageElement + 1) % mageElements.length;
    const element = mageElements[classCombatState.mageElement];
    addLog(`🔮 เปลี่ยนธาตุโจมตีเป็น${element.name}`, 'text-sky-300');
    sound.sfxMagic();
    spawnCombatBurst(pPos, element.color, 3.2);
    lastSkillPulse = Date.now();
    lastSkillIsUlt = false;
    updateHUD();
    broadcastMyStateToRTDB();
    return;
  }

  if (skillClassId === 'support' && isUlt) {
    classCombatState.supportField = 10;
    classCombatState.supportFieldTick = 0;
    sound.sfxUltimate();
    lastSkillPulse = Date.now();
    lastSkillIsUlt = true;
    const dome = new THREE.Mesh(
      new THREE.CylinderGeometry(8, 8, 0.08, 48),
      new THREE.MeshBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0.38, side: THREE.DoubleSide })
    );
    dome.position.copy(playerChar3D.root.position);
    worldGroup.add(dome);
    skillFX.activeFX.push({ type: 'holy_dome', mesh: dome, age: 0, maxAge: 10 });
    addLog('🌿 เขตรักษาทำงาน 10 วินาที', 'text-emerald-300');
    updateHUD();
    broadcastMyStateToRTDB();
    return;
  }

  if (skillClassId === 'tank' && isUlt) {
    classCombatState.tankShield = playerStats.maxHp;
    classCombatState.tankShieldTimer = 20;
    lastTankShieldPulse = Date.now();
    lastTankShieldAmount = playerStats.maxHp;
    sound.sfxUltimate();
    lastSkillPulse = Date.now();
    lastSkillIsUlt = true;
    const shield = new THREE.Mesh(
      new THREE.SphereGeometry(1.45, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.3, wireframe: true })
    );
    shield.position.copy(playerChar3D.root.position).add(new THREE.Vector3(0, 1, 0));
    worldGroup.add(shield);
    skillFX.activeFX.push({ type: 'holy_dome', mesh: shield, age: 0, maxAge: 20 });
    addLog(`🛡️ โล่พลังงาน ${classCombatState.tankShield} HP คงอยู่ 20 วินาที`, 'text-sky-300');
    updateHUD();
    broadcastMyStateToRTDB();
    return;
  }

  if (skillClassId === 'swordsman' && isUlt) {
    classCombatState.swordUltimate = {
      elapsed: 0,
      nextHit: 0,
      hits: Math.max(1, classCombatState.swordSpirit),
      completed: 0
    };
    sound.sfxUltimate();
    skillFX.spawnClassSkillFX(skillClassId, true, pPos, targetPos, playerPhysics.targetRotY);
    spawnDistinctClassSkillVFX(worldGroup, skillClassId, true, pPos, playerPhysics.targetRotY);
    lastSkillPulse = Date.now();
    lastSkillIsUlt = true;
    updateHUD();
    broadcastMyStateToRTDB();
    return;
  }

  playerChar3D.triggerWeaponCombo(isUlt ? 3 : 2);
  if (skillClassId === 'swordsman' && !isUlt) sound.sfxSwordWave();
  else isUlt ? sound.sfxUltimate() : sound.sfxMagic();
  if (targetMonster && targetMonster.hp > 0 && cameraMode !== 'fps' && cameraMode !== 'tps') {
    const dx = targetMonster.mesh.position.x - pPos.x;
    const dz = targetMonster.mesh.position.z - pPos.z;
    if (Math.hypot(dx, dz) > 0.05) playerPhysics.targetRotY = Math.atan2(dx, dz);
  }
  skillFX.spawnClassSkillFX(skillClassId, isUlt, pPos, targetPos, playerPhysics.targetRotY);
  spawnDistinctClassSkillVFX(worldGroup, skillClassId, isUlt, pPos, playerPhysics.targetRotY);
  lastSkillPulse = Date.now();
  lastSkillIsUlt = isUlt;
  broadcastMyStateToRTDB();
  if (skillClassId === 'support' && !isUlt) {
    const healAmount = Math.round(playerStats.matk * 0.5);
    let nearestAlly = remotePlayers.get(targetSupportPlayerId) || null;
    let nearestDistance = 8;
    if (!myPartyId || nearestAlly?.partyId !== myPartyId) nearestAlly = null;
    if (nearestAlly && pPos.distanceTo(nearestAlly.char3D.root.position) > nearestDistance) nearestAlly = null;
    remotePlayers.forEach(remote => {
      if (!myPartyId || remote.partyId !== myPartyId) return;
      const distance = pPos.distanceTo(remote.char3D.root.position);
      if (!nearestAlly && distance < nearestDistance) {
        nearestDistance = distance;
        nearestAlly = remote;
      }
    });
    if (nearestAlly) {
      lastSupportHealPulse = Date.now();
      lastSupportHealAmount = healAmount;
      lastSupportHealRadius = 2;
      lastSupportHealPercent = 0;
      addLog(`💚 รักษาเพื่อน ${nearestAlly.displayName} ${healAmount} HP`, 'text-emerald-300');
    } else {
      playerStats.hp = Math.min(playerStats.maxHp, playerStats.hp + healAmount);
      lastSupportHealPercent = 0;
      lastSupportHealRadius = 0;
      lastSupportHealAmount = 0;
      showFloatingDamage(pPos, `+${healAmount} HP`, '#34d399');
      addLog(`💚 รักษาตัวเอง ${healAmount} HP`, 'text-emerald-300');
    }
    updateHUD();
    broadcastMyStateToRTDB();
    return;
  }
  if (skillClassId === 'mage' && isUlt) {
    classCombatState.mageField = { elapsed: 10, tick: 0, element: mageElements[classCombatState.mageElement] };
  }
  if (sk.heal) {
    playerStats.hp = Math.min(playerStats.maxHp, playerStats.hp + sk.heal);
    showFloatingDamage(pPos, `+${sk.heal} HP`, '#34d399');
  }
  const power = Math.max(playerStats.atk, playerStats.matk);
  const hitRadius = skillClassId === 'tank' ? 6 : isUlt ? 11.5 : 8.5;
  monsters.forEach(mon => {
    if (mon.hp <= 0) return;
    if (pPos.distanceTo(mon.mesh.position) <= hitRadius) {
      if (skillClassId === 'swordsman' && !isUlt) {
        const forward = new THREE.Vector3(Math.sin(playerPhysics.targetRotY), 0, Math.cos(playerPhysics.targetRotY));
        const toMonster = mon.mesh.position.clone().sub(pPos);
        if (toMonster.length() > 15 || forward.dot(toMonster.normalize()) < 0.72) return;
      }
      const dmg = Math.round(power * sk.mult * (0.95 + Math.random() * 0.2));
      applyCombatDamage(mon, dmg, {
        knockback: isUlt ? 14 : 8,
        color: `#${sk.color.toString(16).padStart(6, '0')}`,
        prefix: '✨ -'
      });
      if (skillClassId === 'swordsman' && !isUlt) {
        classCombatState.swordSpirit = Math.min(30, classCombatState.swordSpirit + 1);
      }
      if (skillClassId === 'tank' && !isUlt) mon.stunTimer = 2;
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
  if (isPlayerDead) return;
  const pPos = playerChar3D.root.position;

  // เช็คการเปิดหีบสมบัติในถ้ำเขาวงกตด้วยปุ่ม E
  for (let i = 0; i < caveChests.length; i++) {
    const ch = caveChests[i];
    if (!ch.opened && Math.hypot(pPos.x - ch.wx, pPos.z - ch.wz) < 3.5) {
      ch.opened = true;
      ch.mesh.scale.y = 0.5;
      sound.sfxLevelUp();
      gainExpAndGold(350, 500, 'mithril_ore');
      showFloatingDamage(pPos, '💎 สมบัติถ้ำเขาวงกต +500 G / +350 EXP!', '#fbbf24');
      addLog('🏆 เปิดหีบสมบัติลับในถ้ำเขาวงกตสำเร็จ! ได้รับ <b>+500 Gold, +350 EXP และแร่มิธริล!</b>', 'text-amber-300 font-bold');
      return;
    }
  }

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
      currentActiveInnTownId = nearestNPC.userData.townId ?? TOWNS.reduce((closest, town) =>
        Math.hypot(nearestNPC.position.x - town.x, nearestNPC.position.z - town.z) <
        Math.hypot(nearestNPC.position.x - closest.x, nearestNPC.position.z - closest.z) ? town : closest
      , TOWNS[0]).id;
      renderInnModal(null, currentActiveInnTownId);
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
    expireRoomRentals();
    if (nearestCab.roomId && !hasActiveRoomRental(nearestCab.roomId)) {
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
    if (dist < minCarDist) {
      minCarDist = dist;
      nearestCar = car;
    }
  });
  if (nearestCar) {
    sound.sfxClick();
    toggleCarriageRide(nearestCar);
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
  await beginWorldLoading();
  sculptTooltip.classList.add('hidden');
  rebuildPreviewCharacter();
  recalculateStats();

  if (!worldBuilt) {
    setLoadingProgress(18, 'กำลังสร้างมหานครและเส้นทางรถม้า...');
    worldGroup.visible = true;
    await buildAllGrandCities();
    worldBuilt = true;
  }

  playerPhysics.vx = 0; playerPhysics.vy = 0; playerPhysics.vz = 0;

  // เช็คจุดเกิด: ถ้าตอนออกเกมอยู่ในโรงเตี๋ยมและมีจุดเซฟเตียงโรงเตี๋ยม ให้เกิดในห้องนั้น
  // แต่ถ้าอยู่นอกโรงเตี๋ยม ให้ไปเกิดที่เมืองที่อยู่ใกล้ผู้เล่นมากที่สุดในตอนนั้น!
  const sp = playerStats.savedSpawn;
  const lastPos = playerStats.lastLogoutPos;
  const stillInInn = sp && (!lastPos || isPositionInsideInn(lastPos));
  let spawnX;
  let spawnZ;

  if (stillInInn && typeof sp.x === 'number' && typeof sp.z === 'number') {
    spawnX = sp.x;
    spawnZ = sp.z;
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
    spawnX = nearestTown.x;
    spawnZ = nearestTown.z + 12;
    const spawnY = worldNoise.getHeight(spawnX, spawnZ);
    playerChar3D.root.position.set(spawnX, spawnY, spawnZ);
    playerChar3D.animState = 'idle';
    addLog(`🏰 เกิดที่มหานครที่ใกล้ที่สุด: <b>${nearestTown.name}</b>`, "text-emerald-300 font-bold");
  }

  await finishWorldLoading(spawnX, spawnZ);
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
  { baseRoomId: '201', name: 'ห้องพัก 201 (Standard Single Room)', price: 40, desc: 'ห้องพักชั้น 2 ฝั่งตะวันตก พร้อมเตียงนุ่ม ตู้เก็บของ และตู้เสื้อผ้า' },
  { baseRoomId: '202', name: 'ห้องพัก 202 (Deluxe Center Room)', price: 60, desc: 'ห้องพักชั้น 2 โซนกลางวิวระเบียงเมือง พร้อมเตียงใหญ่และตู้เสื้อผ้า' },
  { baseRoomId: '203', name: 'ห้องพัก 203 (Royal Suite VIP)', price: 90, desc: 'ห้องสวีทชั้น 2 พร้อมเตียงหรู ตู้เก็บของ และตู้เสื้อผ้าส่วนตัว' }
];
function getRoomRental(roomId) {
  return playerStats.roomRentals?.[roomId] || null;
}
function hasActiveRoomRental(roomId) {
  const rental = getRoomRental(roomId);
  return !!rental && Number(rental.expiresAtGameDay) > getCurrentGameDay()
    && (playerStats.roomKeys || []).includes(roomId);
}
function expireRoomRentals() {
  if (!playerStats.roomRentals) playerStats.roomRentals = {};
  const gameDay = getCurrentGameDay();
  for (const [roomId, rental] of Object.entries(playerStats.roomRentals)) {
    if (Number(rental.expiresAtGameDay) > gameDay) continue;
    playerStats.roomKeys = (playerStats.roomKeys || []).filter(id => id !== roomId);
    const door = interactiveDoors.find(entry => entry.roomId === roomId);
    if (door) {
      door.isLocked = true;
      door.isOpen = false;
      door.targetAngle = 0;
      door.collider.disabled = false;
      updateRoomDoorLabel(door);
    }
  }
}
function renderInnModal(highlightRoomId = null, townId = currentActiveInnTownId) {
  const roomTownId = highlightRoomId && String(highlightRoomId).includes('-')
    ? Number(String(highlightRoomId).split('-')[0])
    : Number(townId);
  currentActiveInnTownId = Number.isFinite(roomTownId) ? roomTownId : 0;
  expireRoomRentals();
  const grid = document.getElementById('inn-rooms-grid');
  if (!grid) return;
  grid.innerHTML = '';
  if (!Array.isArray(playerStats.roomKeys)) playerStats.roomKeys = [];

  INN_ROOMS_CATALOG.forEach(room => {
    const rm = { ...room, roomId: `${currentActiveInnTownId}-${room.baseRoomId}` };
    const rental = getRoomRental(rm.roomId);
    const hasKey = hasActiveRoomRental(rm.roomId);
    const isHighlighted = highlightRoomId === rm.roomId || highlightRoomId === rm.baseRoomId;
    const roomDoor = interactiveDoors.find(d => d.roomId === rm.roomId);
    const isOpen = roomDoor ? roomDoor.isOpen : false;
    const isLocked = roomDoor ? !!roomDoor.isLocked : true;

    const card = document.createElement('div');
    card.className = `bg-slate-900/95 border ${isHighlighted ? 'border-amber-400 ring-2 ring-amber-400/40' : 'border-slate-700'} rounded-xl p-3.5 flex flex-col md:flex-row items-start md:items-center justify-between gap-3`;
    card.innerHTML = `
      <div>
        <div class="flex items-center gap-2 flex-wrap">
          <span class="font-extrabold text-amber-300 text-sm">🔑 ${rm.name}</span>
          ${hasKey ? `<span class="px-2 py-0.5 rounded-full bg-emerald-500/25 border border-emerald-400 text-[10px] text-emerald-200 font-bold">เช่าถึงวันในเกม ${rental.expiresAtGameDay}</span>` : ''}
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
        <select class="rent-days bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 text-xs text-white">
          <option value="1">1 วัน (${rm.price} G)</option>
          <option value="7">1 อาทิตย์ (${rm.price * 7} G)</option>
          <option value="30">1 เดือน (${rm.price * 30} G)</option>
        </select>
        <button class="rent-room-btn px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950">${hasKey ? 'ต่ออายุ' : 'เช่าห้อง'}</button>
      </div>
    `;

    if (hasKey && roomDoor) {
      card.querySelector('.toggle-open-btn').onclick = () => {
        toggleDoorState(roomDoor, null, false);
        renderInnModal(rm.roomId, currentActiveInnTownId);
      };
      card.querySelector('.toggle-lock-btn').onclick = () => {
        toggleDoorState(roomDoor, null, true);
        renderInnModal(rm.roomId, currentActiveInnTownId);
      };
    }

    card.querySelector('.rent-room-btn').onclick = () => {
      const days = Number(card.querySelector('.rent-days').value);
      const price = rm.price * days;
      if (!Number.isInteger(days) || ![1, 7, 30].includes(days)) return;
      if (playerStats.gold < price) {
        addLog(`❌ เงิน Gold ไม่พอเช่า ${rm.name} ${days} วัน (ต้องการ ${price} G)`, "text-rose-400");
        return;
      }
      playerStats.gold -= price;
      const startDay = Math.max(getCurrentGameDay(), Number(rental?.expiresAtGameDay) || 0);
      playerStats.roomRentals[rm.roomId] = { expiresAtGameDay: startDay + days };
      if (!playerStats.roomKeys.includes(rm.roomId)) playerStats.roomKeys.push(rm.roomId);
      sound.sfxLevelUp();
      addLog(`🔑 เช่าห้อง <b>${rm.name}</b> เพิ่ม ${days === 1 ? '1 วัน' : days === 7 ? '1 อาทิตย์' : '1 เดือน'}ของเวลาในเกม เรียบร้อย!`, "text-amber-300 font-bold");
      if (roomDoor) {
        roomDoor.isLocked = false;
        updateRoomDoorLabel(roomDoor);
      }
      updateHUD();
      savePlayerToRTDB();
      renderInnModal(rm.roomId, currentActiveInnTownId);
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
  const wardrobeRow = document.createElement('div');
  wardrobeRow.className = 'bg-purple-950/50 border border-purple-400/40 rounded-xl p-3 flex items-center justify-between gap-3';
  wardrobeRow.innerHTML = `
    <div>
      <div class="font-bold text-purple-200 text-xs">👗 ตู้เสื้อผ้า</div>
      <div class="text-[11px] text-slate-300">เปลี่ยนหรือถอดแฟชั่นที่ซื้อไว้ โดยไม่ต้องพกไว้ในกระเป๋า</div>
    </div>
    <button class="open-room-wardrobe px-3 py-1.5 rounded-lg bg-purple-500 hover:bg-purple-400 text-white text-xs font-bold">เปิดตู้เสื้อผ้า</button>
  `;
  wardrobeRow.querySelector('.open-room-wardrobe').onclick = () => {
    document.getElementById('modal-storage').classList.add('hidden');
    renderFashionShopModal(true);
  };
  listEl.appendChild(wardrobeRow);
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
    expireRoomRentals();
    const hasKey = hasActiveRoomRental(doorObj.roomId);
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
  carriageDestinationPanel.classList.add('hidden');
  openCarriageDestinationButton.classList.add('hidden');
  activeSleepingBed = null;
  activeBedTarget = null;
  moveTargetPos = null;
  activeSittingSeat = seatObj;
  playerPhysics.vx = 0; playerPhysics.vy = 0; playerPhysics.vz = 0;
  playerChar3D.root.position.set(seatObj.wx, seatObj.wy, seatObj.wz);
  playerChar3D.sitPelvisY = seatObj.sitPelvisY / (playerChar3D.root.scale.y || 1);
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
  expireRoomRentals();
  if (bedObj.roomId && !hasActiveRoomRental(bedObj.roomId)) {
    addLog(`🔑 ต้องมี <b>กุญแจห้องพัก ${bedObj.roomId}</b> ก่อนจึงจะเข้าพักผ่อนบนเตียงนี้ได้!`, "text-amber-300");
    renderInnModal(bedObj.roomId);
    document.getElementById('modal-inn').classList.remove('hidden');
    releaseMouseForUI();
    return;
  }
  ridingCarriage = null;
  carriageDestinationPanel.classList.add('hidden');
  openCarriageDestinationButton.classList.add('hidden');
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
  playerStats.equippedFashion = null;
  ensureFashionState(playerStats, currentConfig);
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
  currentConfig.name = document.getElementById('char-name-input').value.trim() || currentUsername;
  currentConfig.rpTitle = document.getElementById('char-title-input').value.trim() || "นักผจญภัยพเนจร";
  playerStats.hp = playerStats.maxHp;
  playerStats.mp = playerStats.maxMp;
  playerStats.stamina = playerStats.maxStamina;
  await startWorldSession();
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
function tryPlayerDash() {
  if (gameState !== 'world' || isPlayerDead || ridingCarriage || carriageBoarding) return false;
  if (playerPhysics.dashCooldown > 0 || playerStats.stamina < 18) return false;

  let inputX = (keys['d'] || keys['arrowright'] ? 1 : 0) - (keys['a'] || keys['arrowleft'] ? 1 : 0);
  let inputZ = (keys['s'] || keys['arrowdown'] ? 1 : 0) - (keys['w'] || keys['arrowup'] ? 1 : 0);
  if (inputX || inputZ) {
    const angle = Math.atan2(inputX, inputZ) + cameraYawAngle;
    playerPhysics.dashDirectionX = Math.sin(angle);
    playerPhysics.dashDirectionZ = Math.cos(angle);
    playerPhysics.targetRotY = angle;
  } else {
    playerPhysics.dashDirectionX = Math.sin(playerPhysics.targetRotY);
    playerPhysics.dashDirectionZ = Math.cos(playerPhysics.targetRotY);
  }
  playerPhysics.vx = playerPhysics.dashDirectionX * 34;
  playerPhysics.vz = playerPhysics.dashDirectionZ * 34;
  playerPhysics.dashTimer = 0.24;
  playerPhysics.dashInvulnerability = 0.24;
  playerPhysics.dashCooldown = 1.2;
  playerStats.stamina -= 18;
  playerChar3D.animState = 'jump';
  sound.sfxDash();
  return true;
}
window.addEventListener('keydown', (e) => {
  if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
  if (carriageDestinationPanel.contains(document.activeElement)) return;
  if (isPlayerDead) {
    e.preventDefault();
    return;
  }
  const k = resolveGameKey(e);
  keys[k] = true;
  if (gameState !== 'world') return;
  if (k === ' ' && e.shiftKey) {
    e.preventDefault();
    if (!fishMinigameState.active && !grillMinigameState.active) tryPlayerDash();
    return;
  }
  if (['w', 'a', 's', 'd', ' '].includes(k)) {
    if (ridingCarriage) {
      ridingCarriage = null;
      carriageDestinationPanel.classList.add('hidden');
      openCarriageDestinationButton.classList.add('hidden');
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
  if (k === 'f') {
    if (WEAPONS[currentConfig.weaponId]?.type === 'bow') {
      if (!e.repeat) archerChargeStartedAt = performance.now();
    } else queueOrPerformComboAttack();
  }
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
  if (k === ' ' && currentConfig.classId === 'mage') e.preventDefault();
  if (k === ' ' && currentConfig.classId !== 'mage' && (playerPhysics.jumpCount < 2 || playerPhysics.isInWater)) {
    playerPhysics.vy = playerPhysics.isInWater ? 7.5 : (playerPhysics.jumpCount === 0 ? 10.8 : 9.4);
    playerPhysics.isGrounded = false;
    playerPhysics.jumpCount++;
    sound.sfxJump();
  }
});
window.addEventListener('keyup', (e) => {
  const k = resolveGameKey(e);
  keys[k] = false;
  if (k === 'f' && archerChargeStartedAt > 0 && WEAPONS[currentConfig.weaponId]?.type === 'bow') {
    const chargeSeconds = Math.max(0, (performance.now() - archerChargeStartedAt) / 1000);
    pendingArrowCharge = 1 + Math.min(2, chargeSeconds);
    archerChargeStartedAt = 0;
    queueOrPerformComboAttack();
  }
});
window.addEventListener('wheel', (e) => {
  if (gameState === 'creator') {
    creatorCamDist = THREE.MathUtils.clamp(creatorCamDist + e.deltaY * 0.0025, 1.15, 5.2);
  } else if (gameState === 'world' && cameraMode !== 'fps') {
    cameraDist = Math.max(4.5, Math.min(34, cameraDist + e.deltaY * 0.012));
  }
});
renderer.domElement.addEventListener('click', (e) => {
  if (gameState !== 'world' || isPlayerDead) return;
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
  const remoteEntries = Array.from(remotePlayers.values());
  const remoteHits = raycaster.intersectObjects(remoteEntries.map(remote => remote.char3D.root), true);
  if (remoteHits.length > 0) {
    const hitObject = remoteHits[0].object;
    const selectedAlly = remoteEntries.find(remote => {
      let parent = hitObject;
      while (parent && parent !== remote.char3D.root) parent = parent.parent;
      return parent === remote.char3D.root;
    });
    if (selectedAlly) {
      targetSupportPlayerId = selectedAlly.clientId;
      addLog(`💚 เลือก ${selectedAlly.displayName} เป็นเป้าหมายช่วยเหลือ`, 'text-emerald-300');
      sound.sfxClick();
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
      toggleCarriageRide(obj.userData.carriageRef);
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
      expireRoomRentals();
      if (cab.roomId && !hasActiveRoomRental(cab.roomId)) {
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
        currentActiveInnTownId = obj.userData.townId ?? TOWNS.reduce((closest, town) =>
          Math.hypot(obj.position.x - town.x, obj.position.z - town.z) <
          Math.hypot(obj.position.x - closest.x, obj.position.z - closest.z) ? town : closest
        , TOWNS[0]).id;
        renderInnModal(null, currentActiveInnTownId);
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
  const width = miniCanvas.width;
  const height = miniCanvas.height;
  const px = playerChar3D.root.position.x;
  const pz = playerChar3D.root.position.z;
  const scale = 0.50;
  const cx = width / 2, cy = height / 2;
  const mapX = (x) => cx + (x - px) * scale;
  const mapZ = (z) => cy + (z - pz) * scale;
  const tileSize = 7;
  for (let y = 0; y < height; y += tileSize) {
    for (let x = 0; x < width; x += tileSize) {
      const wx = px + (x + tileSize / 2 - cx) / scale;
      const wz = pz + (y + tileSize / 2 - cy) / scale;
      const town = TOWNS.find(t => Math.hypot(wx - t.x, wz - t.z) <= t.radius);
      let rgb = town
        ? town.style === 'elven' ? [54, 105, 76]
          : town.style === 'volcano' ? [117, 79, 57]
            : town.style === 'frost' ? [88, 123, 139]
              : [123, 107, 76]
        : wx < -55 && wz < -55 ? [40, 83, 63]
          : wx > 55 && wz < -45 ? [102, 69, 49]
            : wx < -45 && wz > 55 ? [83, 117, 132]
              : [83, 112, 68];
      const h = worldNoise.getHeight(wx, wz);
      const shade = Math.max(-16, Math.min(18, Math.round(h * 1.6)));
      miniCtx.fillStyle = `rgb(${rgb.map(v => Math.max(0, Math.min(255, v + shade))).join(',')})`;
      miniCtx.fillRect(x, y, tileSize, tileSize);
    }
  }
  miniCtx.save();
  miniCtx.strokeStyle = 'rgba(226, 232, 240, 0.5)';
  miniCtx.lineWidth = 2.2;
  TOWNS.forEach(t => {
    const tx = mapX(t.x);
    const tz = mapZ(t.z);
    if (tx < -t.radius * scale || tx > width + t.radius * scale || tz < -t.radius * scale || tz > height + t.radius * scale) return;
    miniCtx.beginPath();
    miniCtx.moveTo(mapX(t.x - 72), tz); miniCtx.lineTo(mapX(t.x + 72), tz);
    miniCtx.moveTo(tx, mapZ(t.z - 72)); miniCtx.lineTo(tx, mapZ(t.z + 72));
    miniCtx.stroke();
    miniCtx.strokeStyle = 'rgba(226, 232, 240, 0.24)';
    miniCtx.lineWidth = 1.2;
    miniCtx.beginPath();
    miniCtx.arc(tx, tz, 37 * scale, 0, Math.PI * 2);
    miniCtx.stroke();
    miniCtx.strokeStyle = 'rgba(226, 232, 240, 0.5)';
    miniCtx.lineWidth = 2.2;
  });
  miniCtx.restore();
  TOWNS.forEach(t => {
    const tx = mapX(t.x);
    const tz = mapZ(t.z);
    if (tx < -12 || tx > width + 12 || tz < -12 || tz > height + 12) return;
    miniCtx.fillStyle = '#fbbf24';
    miniCtx.strokeStyle = 'rgba(15, 23, 42, 0.95)';
    miniCtx.lineWidth = 2;
    miniCtx.beginPath(); miniCtx.arc(tx, tz, 7, 0, Math.PI * 2); miniCtx.fill();
    miniCtx.stroke();
    miniCtx.fillStyle = '#fff7cc';
    miniCtx.font = 'bold 8px Kanit, sans-serif';
    miniCtx.textAlign = 'center';
    miniCtx.fillText(`${t.id + 1}`, tx, tz + 2.8);
  });
  enterableBuildings.forEach(building => {
    const bx = mapX(building.wx);
    const bz = mapZ(building.wz);
    if (bx < 1 || bx > width - 1 || bz < 1 || bz > height - 1) return;
    miniCtx.fillStyle = building.role === 'fashion_shop' ? '#e879f9'
      : ['general_shop', 'fish_market', 'shop', 'food'].includes(building.role) ? '#38bdf8'
        : '#fda4af';
    miniCtx.fillRect(bx - 2, bz - 2, 4, 4);
  });
  if (ridingCarriage?.route?.length) {
    miniCtx.strokeStyle = 'rgba(251, 191, 36, 0.9)';
    miniCtx.lineWidth = 2;
    miniCtx.setLineDash([4, 3]);
    miniCtx.beginPath();
    miniCtx.moveTo(mapX(ridingCarriage.group.position.x), mapZ(ridingCarriage.group.position.z));
    for (let i = ridingCarriage.routeIndex; i < ridingCarriage.route.length; i++) {
      miniCtx.lineTo(mapX(ridingCarriage.route[i].x), mapZ(ridingCarriage.route[i].z));
    }
    miniCtx.stroke();
    miniCtx.setLineDash([]);
    if (ridingCarriage.routeTarget) {
      miniCtx.fillStyle = '#fbbf24';
      miniCtx.beginPath();
      miniCtx.arc(mapX(ridingCarriage.routeTarget.x), mapZ(ridingCarriage.routeTarget.z), 4, 0, Math.PI * 2);
      miniCtx.fill();
    }
  }
  const radarMaxDist = gameSettings.minimapRadius || 110;
  farmingNodes.forEach(n => {
    if (!n.active) return;
    const nx = mapX(n.x);
    const nz = mapZ(n.z);
    if (nx > 0 && nx < width && nz > 0 && nz < height) {
      miniCtx.fillStyle = '#38bdf8';
      miniCtx.fillRect(nx - 2, nz - 2, 4, 4);
    }
  });
  monsters.forEach(m => {
    if (m.hp <= 0 || !m.mesh.visible || Math.hypot(m.mesh.position.x - px, m.mesh.position.z - pz) > radarMaxDist) return;
    const mx = mapX(m.mesh.position.x);
    const mz = mapZ(m.mesh.position.z);
    if (mx > 0 && mx < width && mz > 0 && mz < height) {
      miniCtx.fillStyle = m.isBoss ? '#fbbf24' : '#f43f5e';
      miniCtx.beginPath(); miniCtx.arc(mx, mz, m.isBoss ? 4 : 2.3, 0, Math.PI * 2); miniCtx.fill();
    }
  });
  // วาดจุดผู้เล่นออนไลน์คนอื่นๆ ในห้องเดียวกันบน Minimap (จุดสีฟ้าสว่างพร้อมขอบขาว)
  remotePlayers.forEach(rp => {
    const rx = THREE.MathUtils.clamp(mapX(rp.char3D.root.position.x), 6, width - 6);
    const rz = THREE.MathUtils.clamp(mapZ(rp.char3D.root.position.z), 6, height - 6);
    miniCtx.fillStyle = '#22d3ee';
    miniCtx.strokeStyle = '#ffffff';
    miniCtx.lineWidth = 1.5;
    miniCtx.beginPath();
    miniCtx.arc(rx, rz, 4.2, 0, Math.PI * 2);
    miniCtx.fill();
    miniCtx.stroke();
  });
  const facing = playerChar3D.root.rotation.y;
  miniCtx.save();
  miniCtx.translate(cx, cy);
  miniCtx.rotate(-facing);
  miniCtx.fillStyle = '#38bdf8';
  miniCtx.strokeStyle = '#f8fafc';
  miniCtx.lineWidth = 1.5;
  miniCtx.beginPath();
  miniCtx.moveTo(0, 7); miniCtx.lineTo(5, -5); miniCtx.lineTo(0, -2); miniCtx.lineTo(-5, -5);
  miniCtx.closePath();
  miniCtx.fill();
  miniCtx.stroke();
  miniCtx.restore();
}
const CAR_ROUTE_CELL_SIZE = 5;
const CAR_ROUTE_CLEARANCE = 5.0;
const carriageDestinationPanel = document.getElementById('carriage-destination-panel');
const carriageDestinationSelect = document.getElementById('carriage-destination-select');
const carriageRouteStatus = document.getElementById('carriage-route-status');
const openCarriageDestinationButton = document.getElementById('btn-open-carriage-dest');
let currentCarriageDestinations = [];

function carriagePositionClearance(x, z) {
  const groundY = worldNoise.getHeight(x, z);
  let clearance = Math.min(
    groundY - (WATER_LEVEL + 0.35),
    5.2 - groundY
  );
  const slopeSample = 2.5;
  for (const [dx, dz] of [[slopeSample, 0], [-slopeSample, 0], [0, slopeSample], [0, -slopeSample]]) {
    clearance = Math.min(
      clearance,
      1.35 - Math.abs(worldNoise.getHeight(x + dx, z + dz) - groundY)
    );
  }

  // Chunks may not have been generated along a long carriage trip. Rebuild their
  // deterministic obstacle positions from the same world seed before routing.
  const minChunkX = Math.floor((x - CAR_ROUTE_CLEARANCE - 3) / CHUNK_SIZE);
  const maxChunkX = Math.floor((x + CAR_ROUTE_CLEARANCE + 3) / CHUNK_SIZE);
  const minChunkZ = Math.floor((z - CAR_ROUTE_CLEARANCE - 3) / CHUNK_SIZE);
  const maxChunkZ = Math.floor((z + CAR_ROUTE_CLEARANCE + 3) / CHUNK_SIZE);
  for (let cx = minChunkX; cx <= maxChunkX; cx++) {
    for (let cz = minChunkZ; cz <= maxChunkZ; cz++) {
      const centerX = cx * CHUNK_SIZE;
      const centerZ = cz * CHUNK_SIZE;
      const nearTown = TOWNS.some(town =>
        Math.hypot(centerX - town.x, centerZ - town.z) < town.radius + 16
      );
      if (nearTown) continue;

      const villageRoll = worldNoise.hash2D(cx * 73, cz * 97);
      const hasVillage = (villageRoll > 0.72 || (Math.abs(cx) === 2 && cz === 0)) &&
        worldNoise.getHeight(centerX, centerZ) >= WATER_LEVEL + 1.0;
      if (hasVillage) {
        const localX = x - centerX;
        const localZ = z - centerZ;
        const fenceX = Math.max(Math.abs(localX) - 11.8, 0);
        const fenceZ = Math.max(Math.abs(localZ) - 10.6, 0);
        const outsideFence = Math.hypot(fenceX, fenceZ);
        const insideFence = Math.min(11.8 - Math.abs(localX), 10.6 - Math.abs(localZ));
        const fenceDistance = outsideFence > 0 ? outsideFence : -insideFence;
        clearance = Math.min(clearance, fenceDistance - CAR_ROUTE_CLEARANCE - 0.25);

        for (const [hx, hz, radius] of [[-6.4, -5.2, 3.6], [6.4, -5.2, 3.6], [-6.8, 3.6, 3.6]]) {
          clearance = Math.min(
            clearance,
            Math.hypot(localX - hx, localZ - hz) - CAR_ROUTE_CLEARANCE - radius
          );
        }
        clearance = Math.min(
          clearance,
          Math.hypot(localX, localZ - 0.5) - CAR_ROUTE_CLEARANCE - 1.05
        );
      }

      for (let idx = 0; idx < 4; idx++) {
        const rx = worldNoise.hash2D(cx * 31 + idx, cz * 17 + idx);
        const rz = worldNoise.hash2D(cx * 19 + idx, cz * 43 + idx);
        const obstacleX = centerX + (rx - 0.5) * (CHUNK_SIZE - 6);
        const obstacleZ = centerZ + (rz - 0.5) * (CHUNK_SIZE - 6);
        const obstacleY = worldNoise.getHeight(obstacleX, obstacleZ);
        if (obstacleY < WATER_LEVEL + 0.3) continue;
        const isTree = rx > 0.35;
        const radius = isTree ? 1.35 : 1.4;
        clearance = Math.min(
          clearance,
          Math.hypot(x - obstacleX, z - obstacleZ) - CAR_ROUTE_CLEARANCE - radius
        );
      }
    }
  }

  forEachWorldColliderInBounds(
    worldColliders,
    x - CAR_ROUTE_CLEARANCE,
    x + CAR_ROUTE_CLEARANCE,
    z - CAR_ROUTE_CLEARANCE,
    z + CAR_ROUTE_CLEARANCE,
    collider => {
      if (collider.disabled) return;
      if (collider.topY !== undefined && collider.topY < groundY + 0.8) return;
      if (collider.type === 'box') {
        const outsideX = Math.max(collider.minX - x, 0, x - collider.maxX);
        const outsideZ = Math.max(collider.minZ - z, 0, z - collider.maxZ);
        const outsideDistance = Math.hypot(outsideX, outsideZ);
        const edgeDistance = Math.min(x - collider.minX, collider.maxX - x, z - collider.minZ, collider.maxZ - z);
        const signedDistance = outsideDistance > 0 ? outsideDistance : -edgeDistance;
        clearance = Math.min(clearance, signedDistance - CAR_ROUTE_CLEARANCE);
      } else {
        clearance = Math.min(
          clearance,
          Math.hypot(x - collider.x, z - collider.z) - CAR_ROUTE_CLEARANCE - (collider.radius || 0)
        );
      }
    }
  );
  return clearance;
}

function carriagePositionBlocked(x, z) {
  return carriagePositionClearance(x, z) <= 0;
}

function carriagePathSegmentBlocked(fromX, fromZ, toX, toZ) {
  const distance = Math.hypot(toX - fromX, toZ - fromZ);
  const samples = Math.max(1, Math.ceil(distance / 1.2));
  let previousClearance = carriagePositionClearance(fromX, fromZ);
  let exitingInitialOverlap = previousClearance <= 0;
  for (let i = 1; i <= samples; i++) {
    const t = i / samples;
    const clearance = carriagePositionClearance(
      fromX + (toX - fromX) * t,
      fromZ + (toZ - fromZ) * t
    );
    if (exitingInitialOverlap) {
      if (clearance <= previousClearance + 0.01) return true;
      if (clearance > 0) exitingInitialOverlap = false;
    } else if (clearance <= 0) {
      return true;
    }
    previousClearance = clearance;
  }
  return false;
}

function nearestCarriageGridPoint(gx, gz, blockedAt) {
  if (!blockedAt(gx, gz)) return { x: gx, z: gz };
  for (let radius = 1; radius <= 8; radius++) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
        if (!blockedAt(gx + dx, gz + dz)) return { x: gx + dx, z: gz + dz };
      }
    }
  }
  return null;
}

function buildCarriagePath(startX, startZ, goalX, goalZ) {
  const blockedCache = new Map();
  const blockedAt = (gx, gz) => {
    const key = `${gx},${gz}`;
    if (!blockedCache.has(key)) {
      blockedCache.set(key, carriagePositionBlocked(gx * CAR_ROUTE_CELL_SIZE, gz * CAR_ROUTE_CELL_SIZE));
    }
    return blockedCache.get(key);
  };
  const start = nearestCarriageGridPoint(
    Math.round(startX / CAR_ROUTE_CELL_SIZE),
    Math.round(startZ / CAR_ROUTE_CELL_SIZE),
    blockedAt
  );
  const goal = nearestCarriageGridPoint(
    Math.round(goalX / CAR_ROUTE_CELL_SIZE),
    Math.round(goalZ / CAR_ROUTE_CELL_SIZE),
    blockedAt
  );
  if (!start || !goal) return null;
  if (Math.hypot(goal.x * CAR_ROUTE_CELL_SIZE - goalX, goal.z * CAR_ROUTE_CELL_SIZE - goalZ) > 12) return null;

  const minX = Math.min(start.x, goal.x) - 20;
  const maxX = Math.max(start.x, goal.x) + 20;
  const minZ = Math.min(start.z, goal.z) - 20;
  const maxZ = Math.max(start.z, goal.z) + 20;
  const keyOf = (x, z) => `${x},${z}`;
  const heuristic = (x, z) => {
    const dx = Math.abs(goal.x - x);
    const dz = Math.abs(goal.z - z);
    return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
  };
  const nodes = new Map();
  const heap = [];
  const push = entry => {
    heap.push(entry);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (heap[parent].f <= entry.f) break;
      heap[i] = heap[parent];
      i = parent;
    }
    heap[i] = entry;
  };
  const pop = () => {
    const first = heap[0];
    const last = heap.pop();
    if (heap.length) {
      let i = 0;
      while (true) {
        const left = i * 2 + 1;
        const right = left + 1;
        if (left >= heap.length) break;
        const child = right < heap.length && heap[right].f < heap[left].f ? right : left;
        if (heap[child].f >= last.f) break;
        heap[i] = heap[child];
        i = child;
      }
      heap[i] = last;
    }
    return first;
  };
  const startKey = keyOf(start.x, start.z);
  nodes.set(startKey, { x: start.x, z: start.z, g: 0, parent: null, closed: false });
  push({ x: start.x, z: start.z, g: 0, f: heuristic(start.x, start.z) });
  const directions = [
    [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
    [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]
  ];
  let foundKey = null;
  let visited = 0;
  while (heap.length && visited < 36000) {
    const current = pop();
    const currentKey = keyOf(current.x, current.z);
    const currentNode = nodes.get(currentKey);
    if (!currentNode || currentNode.closed || current.g !== currentNode.g) continue;
    currentNode.closed = true;
    visited++;
    if (current.x === goal.x && current.z === goal.z) {
      foundKey = currentKey;
      break;
    }
    for (const [dx, dz, cost] of directions) {
      const nx = current.x + dx;
      const nz = current.z + dz;
      if (nx < minX || nx > maxX || nz < minZ || nz > maxZ || blockedAt(nx, nz)) continue;
      if (dx && dz && (blockedAt(current.x + dx, current.z) || blockedAt(current.x, current.z + dz))) continue;
      const nextKey = keyOf(nx, nz);
      const worldX = nx * CAR_ROUTE_CELL_SIZE;
      const worldZ = nz * CAR_ROUTE_CELL_SIZE;
      const nextG = current.g + cost * (1 + getCarriageRoadPenalty(worldX, worldZ));
      let node = nodes.get(nextKey);
      if (node && node.g <= nextG) continue;
      if (!node) {
        node = { x: nx, z: nz, g: nextG, parent: currentKey, closed: false };
        nodes.set(nextKey, node);
      } else {
        node.g = nextG;
        node.parent = currentKey;
        node.closed = false;
      }
      push({ x: nx, z: nz, g: nextG, f: nextG + heuristic(nx, nz) });
    }
  }
  if (!foundKey) return null;
  const path = [];
  let key = foundKey;
  while (key) {
    const node = nodes.get(key);
    path.push({ x: node.x * CAR_ROUTE_CELL_SIZE, z: node.z * CAR_ROUTE_CELL_SIZE });
    key = node.parent;
  }
  path.reverse();
  if (Math.hypot(path[path.length - 1].x - goalX, path[path.length - 1].z - goalZ) > 1.5 &&
      !carriagePathSegmentBlocked(path[path.length - 1].x, path[path.length - 1].z, goalX, goalZ)) {
    path.push({ x: goalX, z: goalZ });
  }
  if (Math.hypot(path[path.length - 1].x - goalX, path[path.length - 1].z - goalZ) > 8) return null;
  let startConnectionIndex = -1;
  for (let i = Math.min(path.length - 1, 2); i >= 0; i--) {
    if (!carriagePathSegmentBlocked(startX, startZ, path[i].x, path[i].z)) {
      startConnectionIndex = i;
      break;
    }
  }
  if (startConnectionIndex < 0) return null;
  path.splice(0, startConnectionIndex);
  path.unshift({ x: startX, z: startZ });
  return path;
}

function getCarriageRoadPenalty(x, z) {
  const town = TOWNS.find(entry => Math.hypot(x - entry.x, z - entry.z) < entry.radius - 4);
  if (!town) return 0;
  const dx = x - town.x;
  const dz = z - town.z;
  const radius = Math.hypot(dx, dz);
  const roadDistance = Math.min(
    Math.abs(dx),
    Math.abs(dz),
    Math.abs(radius - 28),
    Math.abs(radius - 71.5)
  );
  return Math.min(roadDistance, 24) * 0.24;
}

function getCarriageDestinations() {
  const destinations = [];
  TOWNS.forEach(town => {
    destinations.push({
      id: `town-${town.id}`,
      townId: town.id,
      label: `🏛️ ใจกลางเมือง`,
      x: town.x + 12,
      z: town.z + 10
    });
  });
  const shopRoles = new Set(['quest', 'inn', 'shop', 'food', 'general_shop', 'fish_market', 'fashion_shop']);
  enterableBuildings.forEach((building, index) => {
    if (!shopRoles.has(building.role)) return;
    const town = TOWNS.find(entry => entry.id === building.townId);
    if (!town) return;
    const doorOffset = building.isTwoStory ? building.depth / 2 + 10 : building.depth / 2 + 9;
    destinations.push({
      id: `building-${index}`,
      townId: town.id,
      label: building.title.replace(/<[^>]*>/g, ''),
      x: building.wx + Math.sin(building.rotY || 0) * doorOffset,
      z: building.wz + Math.cos(building.rotY || 0) * doorOffset
    });
  });
  return destinations;
}

function showCarriageDestinationPanel(car) {
  const justBoarded = ridingCarriage !== car;
  car.manualMode = true;
  ridingCarriage = car;
  if (justBoarded) {
    cameraYawAngle = car.group.rotation.y + Math.PI;
    cameraPitchAngle = 0;
  }
  releaseMouseForUI();
  currentCarriageDestinations = getCarriageDestinations();
  carriageDestinationSelect.replaceChildren();
  TOWNS.forEach(town => {
    const group = document.createElement('optgroup');
    group.label = `${town.id + 1}. ${town.name}`;
    currentCarriageDestinations.filter(dest => dest.townId === town.id).forEach(dest => {
      const option = document.createElement('option');
      option.value = dest.id;
      option.textContent = dest.label;
      group.appendChild(option);
    });
    carriageDestinationSelect.appendChild(group);
  });
  carriageRouteStatus.textContent = car.routeTarget
    ? `กำลังเดินทางไป: ${car.routeTarget.label}`
    : 'รถม้าพร้อมออกเดินทาง เลือกเมืองหรือร้านค้าได้เลย';
  carriageDestinationPanel.classList.remove('hidden');
}

function toggleCarriageRide(car) {
  if (ridingCarriage === car) {
    ridingCarriage = null;
    carriageDestinationPanel.classList.add('hidden');
    openCarriageDestinationButton.classList.add('hidden');
    addLog('🐎 ลงจากรถม้าเรียบร้อยแล้ว', 'text-amber-300');
    return;
  }
  if (carriageBoarding) return;
  const playerPos = playerChar3D.root.position;
  if (Math.hypot(playerPos.x - car.group.position.x, playerPos.z - car.group.position.z) > 7.5) {
    addLog('🚶 เดินเข้าไปใกล้รถม้าก่อน แล้วคลิกขึ้นรถอีกครั้ง', 'text-amber-300');
    return;
  }
  if (ridingCarriage) ridingCarriage = null;
  moveTargetPos = null;
  carriageBoarding = {
    car,
    elapsed: 0,
    startPosition: playerPos.clone(),
    startRotation: playerChar3D.root.rotation.y
  };
  car.boardingPaused = true;
  playerPhysics.vx = 0;
  playerPhysics.vy = 0;
  playerPhysics.vz = 0;
  playerChar3D.animState = 'walk';
  addLog(`🐎 กำลังขึ้นรถม้า <b>${car.group.userData.title}</b>...`, 'text-amber-300');
}

function beginCarriageJourney() {
  const car = ridingCarriage;
  const destination = currentCarriageDestinations.find(item => item.id === carriageDestinationSelect.value);
  if (!car || !destination) {
    carriageRouteStatus.textContent = 'ไม่พบปลายทาง กรุณาเลือกจุดหมายใหม่';
    return;
  }
  const route = buildCarriagePath(car.group.position.x, car.group.position.z, destination.x, destination.z);
  if (!route || !route.length) {
    carriageRouteStatus.textContent = 'หาเส้นทางปลอดภัยไม่พบ รถม้ายังอยู่ที่เดิม';
    addLog(`⚠️ ไม่พบเส้นทางปลอดภัยไปยัง <b>${destination.label}</b>`, 'text-rose-300');
    return;
  }
  if (route.length < 2 && Math.hypot(car.group.position.x - destination.x, car.group.position.z - destination.z) > 1.6) {
    route.push({ x: destination.x, z: destination.z });
  }
  if (route.length < 2) {
    car.route = null;
    car.routeTarget = null;
    carriageRouteStatus.textContent = `ถึงปลายทางแล้ว: ${destination.label}`;
    addLog(`📍 รถม้าอยู่ที่ <b>${destination.label}</b> แล้ว`, 'text-emerald-300');
    return;
  }
  car.route = route;
  car.routeIndex = 0;
  car.routeTarget = destination;
  carriageRouteStatus.textContent = `กำลังเดินทางไป: ${destination.label}`;
  carriageDestinationPanel.classList.add('hidden');
  document.activeElement?.blur();
  addLog(`🐎 รถม้าออกเดินทางไปยัง <b>${destination.label}</b> แล้ว`, 'text-amber-300');
}

document.getElementById('btn-close-carriage-panel').addEventListener('click', () => {
  carriageDestinationPanel.classList.add('hidden');
  document.activeElement?.blur();
});
openCarriageDestinationButton.addEventListener('click', () => {
  if (ridingCarriage) showCarriageDestinationPanel(ridingCarriage);
  openCarriageDestinationButton.blur();
});
document.getElementById('btn-start-carriage-route').addEventListener('click', beginCarriageJourney);

function advanceCarriageOnRoute(car, dt, elapsed) {
  const route = car.route;
  if (!route || car.routeIndex >= route.length) {
    car.horseLegs.forEach((leg, idx) => {
      leg.rotation.x = Math.sin(elapsed * 2 + (idx % 2) * Math.PI) * 0.035;
    });
    car.horseGroup.position.y = Math.abs(Math.sin(elapsed * 2)) * 0.015;
    return;
  }
  const target = route[car.routeIndex];
  const position = car.group.position;
  const dx = target.x - position.x;
  const dz = target.z - position.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 1.4) {
    car.routeIndex++;
    if (car.routeIndex >= route.length) {
    if (car.orbitDetour) {
      car.angle = Math.atan2(
        car.group.position.z - car.town.z,
        car.group.position.x - car.town.x
      );
      car.orbitDetour = null;
      car.route = null;
      car.routeTarget = null;
      return;
    }
    const arrivedAt = car.routeTarget;
    car.route = null;
    car.routeTarget = null;
    if (arrivedAt?.silent) return;
    carriageRouteStatus.textContent = `ถึงปลายทางแล้ว: ${arrivedAt?.label || 'ปลายทาง'}`;
    addLog(`📍 รถม้าถึง <b>${arrivedAt?.label || 'ปลายทาง'}</b> แล้ว`, 'text-emerald-300');
    }
    return;
  }
  const moveSpeed = 11;
  const step = Math.min(distance, moveSpeed * dt);
  const nextX = position.x + dx / distance * step;
  const nextZ = position.z + dz / distance * step;
  if (carriagePathSegmentBlocked(position.x, position.z, nextX, nextZ)) {
    const targetDestination = car.routeTarget;
    const reroute = targetDestination && buildCarriagePath(position.x, position.z, targetDestination.x, targetDestination.z);
    if (!reroute || reroute.length < 2) {
      car.route = null;
      car.routeTarget = null;
      carriageRouteStatus.textContent = 'เส้นทางถูกกีดขวาง รถม้าหยุดอย่างปลอดภัย';
      addLog('⚠️ เส้นทางรถม้าถูกปิดกั้นและหาเส้นทางใหม่ไม่สำเร็จ รถม้าหยุดแล้ว', 'text-rose-300');
      return;
    }
    car.route = reroute;
    car.routeIndex = 0;
    return;
  }
  position.set(nextX, worldNoise.getHeight(nextX, nextZ), nextZ);
  car.group.rotation.y = smoothRotateAngle(car.group.rotation.y, Math.atan2(dx, dz), dt * 5.5);
  car.wheels.forEach(wheel => { wheel.rotation.x += dt * moveSpeed * 1.5; });
  car.horseLegs.forEach((leg, idx) => {
    leg.rotation.x = Math.sin(elapsed * 9 + (idx % 2) * Math.PI) * 0.38;
  });
  car.horseGroup.position.y = Math.abs(Math.sin(elapsed * 9)) * 0.055;
}

function advanceCarriageOnOrbit(car, dt, elapsed) {
  const angleStep = (car.speed / car.orbitRadius) * dt;
  const nextAngle = car.angle + angleStep;
  const nextX = car.town.x + Math.cos(nextAngle) * car.orbitRadius;
  const nextZ = car.town.z + Math.sin(nextAngle) * car.orbitRadius;
  const position = car.group.position;
  const dx = nextX - position.x;
  const dz = nextZ - position.z;

  if (carriagePathSegmentBlocked(position.x, position.z, nextX, nextZ)) {
    for (let lookAhead = 0.12; lookAhead <= 1.8; lookAhead += 0.12) {
      const rejoinAngle = nextAngle + lookAhead;
      const rejoinX = car.town.x + Math.cos(rejoinAngle) * car.orbitRadius;
      const rejoinZ = car.town.z + Math.sin(rejoinAngle) * car.orbitRadius;
      if (carriagePositionBlocked(rejoinX, rejoinZ)) continue;
      const route = buildCarriagePath(position.x, position.z, rejoinX, rejoinZ);
      if (!route || !route.length) continue;
      if (route.length === 1 && Math.hypot(position.x - rejoinX, position.z - rejoinZ) > 1.6) {
        route.push({ x: rejoinX, z: rejoinZ });
      }
      if (route.length < 2) continue;
      car.route = route;
      car.routeIndex = 0;
      car.routeTarget = { x: rejoinX, z: rejoinZ, label: '', silent: true };
      car.orbitDetour = { rejoinAngle };
      return;
    }
    car.horseLegs.forEach((leg, idx) => {
      leg.rotation.x = Math.sin(elapsed * 2 + (idx % 2) * Math.PI) * 0.035;
    });
    return;
  }

  car.angle = nextAngle;
  const groundY = worldNoise.getHeight(nextX, nextZ);
  position.set(nextX, groundY, nextZ);
  if (Math.hypot(dx, dz) > 0.001) car.group.rotation.y = Math.atan2(dx, dz);
  car.wheels.forEach(wheel => { wheel.rotation.x += dt * car.speed * 1.6; });
  car.horseLegs.forEach((leg, idx) => {
    leg.rotation.x = Math.sin(elapsed * 10 + (idx % 2) * Math.PI) * 0.45;
  });
  car.horseGroup.position.y = Math.abs(Math.sin(elapsed * 10)) * 0.06;
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
let minimapTick = 0;
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
  const minAllowedDist = 1.15;
  const isCutawayTopView = (cameraMode === '2.5d' && cameraPitchAngle > 0.34) || cameraMode === 'bird';

  if (!isCutawayTopView) {
    for (let i = 0; i < enterableBuildings.length; i++) {
      const eb = enterableBuildings[i];
      if (Math.abs(pivotPos.x - eb.wx) > eb.width || Math.abs(pivotPos.z - eb.wz) > eb.depth) continue;
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

  // กรองเฉพาะ Collider ที่อยู่ใกล้ผู้เล่นในระยะ 16 เมตรก่อนคำนวณ Ray-Box (ลดภาระ CPU 95%)
  const maxCheckRange = totalDist + 6.0;
  forEachWorldColliderInBounds(
    worldColliders,
    pivotPos.x - maxCheckRange,
    pivotPos.x + maxCheckRange,
    pivotPos.z - maxCheckRange,
    pivotPos.z + maxCheckRange,
    col => {
      if (col.disabled || col.stepable) return;
      if (col.x !== undefined && (Math.abs(col.x - pivotPos.x) > maxCheckRange || Math.abs(col.z - pivotPos.z) > maxCheckRange)) {
        return;
      }

      const topY = col.topY !== undefined ? col.topY : 999;
      const bottomY = col.bottomY !== undefined ? col.bottomY : -999;
      if (topY - (col.bottomY !== undefined ? col.bottomY : playerY) < 2.2) return;

      let minX, maxX, minZ, maxZ;
      if (col.minX !== undefined && col.maxX !== undefined) {
        if (pivotPos.x < col.minX - maxCheckRange || pivotPos.x > col.maxX + maxCheckRange ||
            pivotPos.z < col.minZ - maxCheckRange || pivotPos.z > col.maxZ + maxCheckRange) return;
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
        if (pivotPos.x >= minX && pivotPos.x <= maxX && pivotPos.z >= minZ && pivotPos.z <= maxZ) return;
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
  );

  const finalPos = pivotPos.clone().addScaledVector(dir, safeDist);
  const finalGround = worldNoise.getHeight(finalPos.x, finalPos.z);
  finalPos.y = Math.max(finalPos.y, finalGround + 0.45);
  return finalPos;
}
let isPlayerDead = false;
let playerRespawnInvulnerableUntil = 0;
function handlePlayerDeath(reasonText = "พ่ายแพ้ในการต่อสู้") {
  if (isPlayerDead) return;
  isPlayerDead = true;
  playerStats.hp = 0;
  playerPhysics.vx = 0;
  playerPhysics.vy = 0;
  playerPhysics.vz = 0;
  playerPhysics.jumpCount = 0;
  moveTargetPos = null;
  activeHarvestNode = null;
  activeSittingSeat = null;
  activeSleepingBed = null;
  ridingCarriage = null;
  if (carriageBoarding) carriageBoarding.car.boardingPaused = false;
  carriageBoarding = null;
  carriageDestinationPanel.classList.add('hidden');
  openCarriageDestinationButton.classList.add('hidden');
  comboInputQueued = false;
  playerChar3D.attackTimer = 0;
  playerChar3D.deathProgress = 0;
  Object.keys(keys).forEach(key => { keys[key] = false; });
  releaseMouseForUI();
  updateHUD();
  sound.sfxHit();
  playerChar3D.animState = 'death';
  document.getElementById('death-reason').textContent = reasonText;
  const deathScreen = document.getElementById('death-screen');
  const respawnButton = document.getElementById('btn-respawn');
  respawnButton.disabled = true;
  respawnButton.textContent = 'กำลังรอฟื้นคืนชีพ...';
  deathScreen.classList.remove('hidden');
  showFloatingDamage(playerChar3D.root.position, `💀 HP หมด! (${reasonText})`, '#ef4444');
  addLog(`💀 <b>คุณหมดสติ (${reasonText})!</b> กดปุ่มเกิดใหม่เพื่อฟื้นฟูที่เมืองใกล้ที่สุด`, "text-rose-400 font-bold");

  setTimeout(() => {
    if (!isPlayerDead) return;
    respawnButton.disabled = false;
    respawnButton.textContent = '✨ เกิดใหม่ที่เมืองใกล้ที่สุด';
  }, 1400);
}
document.getElementById('btn-respawn').addEventListener('click', () => {
  if (!isPlayerDead) return;
  const nearestTown = getNearestTownToPosition(playerChar3D.root.position);
  const spawnX = nearestTown.x;
  const spawnZ = nearestTown.z + 12;
  const spawnY = worldNoise.getHeight(spawnX, spawnZ);
  playerChar3D.root.position.set(spawnX, spawnY, spawnZ);
  playerPhysics.vx = 0;
  playerPhysics.vy = 0;
  playerPhysics.vz = 0;
  playerPhysics.jumpCount = 0;
  playerPhysics.isGrounded = true;
  playerPhysics.isInWater = false;
  playerPhysics.targetRotY = 0;
  playerChar3D.root.rotation.y = 0;
  playerStats.hp = Math.round(playerStats.maxHp * 0.5);
  playerStats.hunger = Math.max(40, playerStats.hunger || 40);
  playerChar3D.animState = 'idle';
  playerChar3D.deathProgress = 0;
  isPlayerDead = false;
  playerRespawnInvulnerableUntil = Date.now() + 3000;
  document.getElementById('death-screen').classList.add('hidden');
  spawnWaterSplashRing(playerChar3D.root.position, 0x34d399, 3.0);
  updateHUD();
  savePlayerToRTDB();
  addLog(`✨ ฟื้นคืนสติที่ <b>${nearestTown.name}</b> (HP 50% — ใช้โพชั่นหรืออาหารย่างเพื่อฟื้นฟู HP เพิ่มเติม)`, "text-emerald-300 font-bold");
});
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
    window.__AETHEL_PLAYER_POS = pPos;
    updateCombatMusic(dt);
    playerPhysics.dashCooldown = Math.max(0, playerPhysics.dashCooldown - dt);
    playerPhysics.dashTimer = Math.max(0, playerPhysics.dashTimer - dt);
    playerPhysics.dashInvulnerability = Math.max(0, playerPhysics.dashInvulnerability - dt);
    // 1. อัปเดตวงจรวัน-คืน และสภาพอากาศตามธรรมชาติ
    updateDayNightAndNaturalWeather(elapsed, dt, pPos);
    if (renderer.shadowMap.enabled && dirLight.castShadow) {
      shadowRefreshTimer -= dt;
      if (shadowRefreshTimer <= 0) {
        shadowRefreshTimer = 0.45;
        renderer.shadowMap.needsUpdate = true;
        dirLight.shadow.needsUpdate = true;
      }
    }
    // 2. จำกัดการสร้าง Chunk ใหม่ไม่ให้เกิน 1 Chunk ต่อเฟรม (ป้องกันอาการกระตุก/ค้างจังหวะวิ่งไว)
    let chunksGeneratedThisFrame = 0;
    const throttledGenerateChunk = (cx, cz) => {
      const key = `${cx},${cz}`;
      if (chunkMap.has(key)) return;
      if (chunksGeneratedThisFrame >= 1) return; // สร้างสูงสุดแค่วินาทีละ 1 Chunk ต่อเฟรม ที่เหลือทยอยสร้างเฟรมถัดไป
      chunksGeneratedThisFrame++;
      generateChunk(cx, cz).catch(error => {
        console.error(`Unable to generate map chunk ${key}:`, error);
        addLog(`⚠️ สร้างพื้นที่แผนที่ ${key} ไม่สำเร็จ ลองโหลดพื้นที่ใหม่`, 'text-rose-300');
      });
    };

    updatePerformanceOptimization(dt, {
      playerPos: pPos,
      CHUNK_SIZE,
      chunkMap,
      generateChunk: throttledGenerateChunk,
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
      if (car._culled && ridingCarriage !== car && carriageBoarding?.car !== car && !car.manualMode && !car.orbitDetour) return;
      const followingPath = car.manualMode || !!car.orbitDetour;
      if (car.boardingPaused) {
        car.horseLegs.forEach((leg, idx) => {
          leg.rotation.x = Math.sin(elapsed * 2 + (idx % 2) * Math.PI) * 0.025;
        });
      } else if (followingPath) {
        advanceCarriageOnRoute(car, dt, elapsed);
      } else {
        advanceCarriageOnOrbit(car, dt, elapsed);
      }
      car.driver.animState = 'sit';
      car.driver.updateAnimation(dt, followingPath ? 0.08 : 0.02, false, 0, 0, false);
      if (carriageBoarding?.car === car) {
        carriageBoarding.elapsed += dt;
        car.group.updateMatrixWorld(true);
        const progress = Math.min(1, carriageBoarding.elapsed / 1.05);
        const approach = car.group.localToWorld(new THREE.Vector3(-1.65, 0, 0));
        const seat = car.group.localToWorld(new THREE.Vector3(0, 1.18, -0.58));
        const approachY = worldNoise.getHeight(approach.x, approach.z) + 0.06;
        const approachProgress = THREE.MathUtils.clamp(progress / 0.52, 0, 1);
        const seatProgress = THREE.MathUtils.clamp((progress - 0.52) / 0.48, 0, 1);
        const smoothApproach = approachProgress * approachProgress * (3 - 2 * approachProgress);
        const smoothSeat = seatProgress * seatProgress * (3 - 2 * seatProgress);

        if (progress < 0.52) {
          playerChar3D.root.position.lerpVectors(
            carriageBoarding.startPosition,
            new THREE.Vector3(approach.x, approachY, approach.z),
            smoothApproach
          );
          playerChar3D.animState = 'walk';
        } else {
          playerChar3D.root.position.lerpVectors(
            new THREE.Vector3(approach.x, approachY, approach.z),
            seat,
            smoothSeat
          );
          playerChar3D.animState = 'sit';
        }
        playerChar3D.root.rotation.y = smoothRotateAngle(
          playerChar3D.root.rotation.y,
          car.group.rotation.y,
          dt * 9
        );
        playerPhysics.vx = 0;
        playerPhysics.vy = 0;
        playerPhysics.vz = 0;

        if (progress >= 1) {
          carriageBoarding = null;
          car.boardingPaused = false;
          showCarriageDestinationPanel(car);
          openCarriageDestinationButton.classList.remove('hidden');
          playerChar3D.animState = 'sit';
          addLog(`🐎 ขึ้นนั่ง <b>${car.group.userData.title}</b> แล้ว เลือกปลายทางได้จากแผนที่`, 'text-emerald-300 font-bold');
        }
      }
      if (ridingCarriage === car) {
        const seatOffset = 0.58;
        pPos.set(
          car.group.position.x - Math.sin(car.group.rotation.y) * seatOffset,
          car.group.position.y + 1.18,
          car.group.position.z - Math.cos(car.group.rotation.y) * seatOffset
        );
        playerPhysics.vx = 0; playerPhysics.vy = 0; playerPhysics.vz = 0;
        playerPhysics.isGrounded = true;
        playerChar3D.animState = 'sit';
        playerPhysics.targetRotY = car.group.rotation.y;
      }
      if (followingPath) return;
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
    const isMovementLockedBySkill = !!classCombatState.fighterUltimate;
    if (!isPlayerDead && !carriageBoarding && !isMovementLockedBySkill && playerPhysics.dashTimer <= 0) {
      if (keys['w'] || keys['arrowup']) inputZ -= 1;
      if (keys['s'] || keys['arrowdown']) inputZ += 1;
      if (keys['a'] || keys['arrowleft']) inputX -= 1;
      if (keys['d'] || keys['arrowright']) inputX += 1;
    }
    if (isPlayerDead) {
      moveTargetPos = null;
      playerPhysics.vx = 0;
      playerPhysics.vz = 0;
    }
    const isTryingToMove = !carriageBoarding && !isMovementLockedBySkill &&
      (inputX !== 0 || inputZ !== 0 || moveTargetPos !== null || playerPhysics.dashTimer > 0);
    if (isTryingToMove && activeSittingSeat) {
      activeSittingSeat = null;
      playerChar3D.sitPelvisY = undefined;
    }
    const isSprinting = isTryingToMove && keys['shift'] && playerStats.stamina > 2;
    if (isSprinting) {
      playerStats.stamina = Math.max(0, playerStats.stamina - 6.0 * dt);
    } else {
      playerStats.stamina = Math.min(playerStats.maxStamina, playerStats.stamina + 16 * dt);
    }
    const sprintMult = isSprinting ? 2.95 : 1.0; // เพิ่มความเร็วตอนวิ่งให้พุ่งสะใจขึ้น
    updateSprintWindFX(scene, playerChar3D.root, isSprinting || playerPhysics.dashTimer > 0, dt); // แสดงเส้นลมวิ่งสวนกระแส
    updateGraphicsSystem(elapsed, pPos, worldGroup, dt); // อัปเดตฟิสิกส์หญ้าพลิ้วและแสงจากวัตถุเรืองแสงใกล้ผู้เล่น
    const waterFactor = playerPhysics.isInWater ? 0.68 : 1.0;
    const maxSpeed = playerPhysics.dashTimer > 0 ? 34 : playerStats.spd * 0.82 * waterFactor * sprintMult;
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
      dt * (isTryingToMove ? 8.5 : 4.2)
    );
    const damping = playerPhysics.dashTimer > 0 ? 1.8 : playerPhysics.isGrounded ? 8.5 : 3.5;
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
      stepSoundTick += dt * (isSprinting ? 1.85 : 1.0);
      if (stepSoundTick > 0.32) {
        stepSoundTick = 0;
        sound.sfxStep(isSprinting);
      }
    }
    // 6. ตรวจจับการชนกำแพงเมือง รั้วหมู่บ้าน และบ้านทุกหลัง
    let supportY = worldNoise.getHeight(pPos.x, pPos.z);
    if (!ridingCarriage && !carriageBoarding) {
      supportY = resolveWorldCollisions(pPos, 0.48, supportY, worldColliders);
    }
    // 7. ฟิสิกส์การเดินลุยน้ำและว่ายน้ำ
    const wasInWater = playerPhysics.isInWater;
    const isSubmerged = supportY < WATER_LEVEL - 0.45;
    const isWading = supportY < WATER_LEVEL + 0.12 && !isSubmerged;
    playerPhysics.isInWater = isSubmerged;
    const waterStateEl = document.getElementById('hud-water-state');
    if (ridingCarriage) {
      pPos.y = ridingCarriage.group.position.y + 1.18;
      playerPhysics.vy = 0;
      playerPhysics.isGrounded = true;
      playerPhysics.isInWater = false;
    } else if (carriageBoarding) {
      playerPhysics.vy = 0;
      playerPhysics.isGrounded = true;
      playerPhysics.isInWater = false;
    } else if (isSubmerged) {
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
        const mageFlying = currentConfig.classId === 'mage' && keys[' '] && playerStats.mp > 0;
        if (mageFlying) {
          waterStateEl.textContent = "🪽 กำลังบิน (ใช้มานา)";
          waterStateEl.className = "text-[10px] text-violet-300 font-bold";
          playerStats.mp = Math.max(0, playerStats.mp - 8 * dt);
          playerPhysics.vy = keys['shift'] ? -4.5 : 0;
          pPos.y += (keys['shift'] ? -4.5 : 5.2) * dt;
          playerPhysics.isGrounded = false;
        } else {
          waterStateEl.textContent = isSprinting ? "⚡ กำลังวิ่งไว (Sprint)" : "🏃 อยู่บนบก";
          waterStateEl.className = isSprinting ? "text-[10px] text-amber-300 font-bold" : "text-[10px] text-emerald-300";
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
    const speedRatio = carriageBoarding
      ? (carriageBoarding.elapsed < 0.55 ? 0.42 : 0.16)
      : Math.min(2.4, horizSpeed / baseSpeed);
    const turnDelta = Math.atan2(
      Math.sin(playerChar3D.root.rotation.y - playerPhysics.prevRotY),
      Math.cos(playerChar3D.root.rotation.y - playerPhysics.prevRotY)
    );
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
      if (m.stunTimer > 0) {
        m.stunTimer = Math.max(0, m.stunTimer - dt);
      } else if (dist < (m.isBoss ? 24 : 12.0) && dist > (m.attackRange || 2.1) && Math.hypot(m.vx, m.vz) < 1.5) {
        // ไล่ล่าผู้เล่นเมื่อเข้าใกล้
        isMonMoving = true;
        const ang = Math.atan2(pPos.x - m.mesh.position.x, pPos.z - m.mesh.position.z);
        m.mesh.rotation.y = smoothRotateAngle(m.mesh.rotation.y, ang, dt * 10);
        const chaseSpeed = m.slowTimer > 0 ? 1.5 : 3.3;
        m.mesh.position.x += Math.sin(ang) * chaseSpeed * dt;
        m.mesh.position.z += Math.cos(ang) * chaseSpeed * dt;
      } else if (dist <= (m.attackRange || 2.1) && Date.now() >= playerRespawnInvulnerableUntil && playerPhysics.dashInvulnerability <= 0) {
        m.atkCooldown -= dt;
        if (m.atkCooldown <= 0) {
          m.atkCooldown = m.isBoss ? 2.4 : 1.6;
          if (m.isBoss) spawnCombatBurst(m.mesh.position.clone().add(new THREE.Vector3(0, 0.08, 0)), 0xf97316, 7.4);
          const rawDmg = Math.max(2, Math.round(m.atk - playerStats.def * 0.45));
          let remainingDamage = rawDmg;
          if (classCombatState.tankShieldTimer > 0 && classCombatState.tankShield > 0) {
            const absorbed = Math.min(classCombatState.tankShield, remainingDamage);
            classCombatState.tankShield -= absorbed;
            remainingDamage -= absorbed;
            if (absorbed > 0) showFloatingDamage(pPos, `🛡️ โล่ -${absorbed}`, '#60a5fa');
          }
          if (currentConfig.classId === 'tank' && playerStats.hp / playerStats.maxHp < 0.1 && playerStats.mp > 0) {
            const manaAbsorbed = Math.min(playerStats.mp, remainingDamage);
            playerStats.mp -= manaAbsorbed;
            remainingDamage -= manaAbsorbed;
            if (manaAbsorbed > 0) showFloatingDamage(pPos, `💧 มานารับ -${manaAbsorbed}`, '#38bdf8');
          }
          const finalDmg = Math.max(0, Math.round(remainingDamage));
          playerStats.hp = Math.max(0, playerStats.hp - finalDmg);
          const pushAng = Math.atan2(pPos.x - m.mesh.position.x, pPos.z - m.mesh.position.z);
          playerPhysics.vx += Math.sin(pushAng) * 5.2;
          playerPhysics.vz += Math.cos(pushAng) * 5.2;
          if (finalDmg > 0) {
            sound.sfxHit();
            showFloatingDamage(pPos, `-${finalDmg}`, '#fb7185');
          }
          updateHUD();
          if (playerStats.hp <= 0) {
            handlePlayerDeath(`ถูก ${m.name} โจมตี`);
          }
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
    updateClassCombatState(dt);
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
      // เอา Auto HP Regen ออกทั้งหมด! (ฟื้นฟูเฉพาะ MP เล็กน้อยเท่านั้น)
      playerStats.mp = Math.min(playerStats.maxMp, playerStats.mp + (currentConfig.classId === 'mage' ? 2.5 : 1.0));
      document.getElementById('hud-coords').textContent = `${Math.round(pPos.x)}, ${Math.round(pPos.z)}`;
      document.getElementById('hud-biome').textContent = `📍 ${worldNoise.getBiome(pPos.x, pPos.z)}`;
      updateHUD();
    }
    minimapTick += dt;
    if (minimapTick >= 1) {
      minimapTick -= 1;
      drawMinimap();
    }
    floatingLabelsUpdateTimer -= dt;
    if (floatingLabelsUpdateTimer <= 0) {
      floatingLabelsUpdateTimer = 0.1;
      updateFloatingLabelsScreenPos();
    }
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
  injectAdvancedGraphicsSettingsUI();
  injectModernUXUIPolish();

animate();
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  postProc.setSize(window.innerWidth, window.innerHeight);
});

// ============================================================================
// 15. EXPANSION UPDATE: มือถือ, ตกปลา, ย่างปลาแคมป์ไฟ, ความหิว, เพลง MP3,
//     ร้านจิปาถะ, ร้านแฟชั่น, ตลาดปลา, ภูเขา/ถ้ำ/เหมือง, ปีกขยับได้ และ NPC ใหม่
// ============================================================================

// --- 15.1 เพิ่มไอคอนให้อาวุธทุกชนิด (WEAPONS) และเพิ่มวัตถุดิบย่าง/อาหารไหม้ ---
const WEAPON_ICONS = {
  sword_iron: '🗡️',
  sword_flame: '🔥',
  staff_oak: '🪄',
  staff_void: '🔮',
  bow_hunter: '🏹',
  bow_wind: '🌪️',
  shield_knight: '🛡️',
  shield_aegis: '⚜️',
  tome_holy: '📖',
  tome_seraph: '📜'
};
Object.values(WEAPONS).forEach(w => {
  w.icon = WEAPON_ICONS[w.id] || '⚔️';
});

// เพิ่มไอคอนให้วัตถุดิบเดิมและวัตถุดิบใหม่ทุกชนิด
Object.assign(FARM_MATERIALS, {
  fishing_rod:  { id: 'fishing_rod',  name: 'คันเบ็ดไม้ไผ่ชั้นดี',   icon: '🎣', sellPrice: 40,  buyPrice: 120, desc: 'อุปกรณ์จำเป็นสำหรับการตกปลาตามแหล่งน้ำ' },
  fishing_bait: { id: 'fishing_bait', name: 'เหยื่อตกปลาหอมพิเศษ',   icon: '🪱', sellPrice: 5,   buyPrice: 15,  desc: 'ใช้ 1 ชิ้นต่อการตกปลา 1 ครั้ง' },
  raw_carp:     { id: 'raw_carp',     name: 'ปลาคาร์ปแม่น้ำสด',      icon: '🐟', sellPrice: 35,  buyPrice: 50,  desc: 'ปลาสดจากแหล่งน้ำ นำไปย่างที่แคมป์ไฟหรือขายที่ตลาดได้' },
  raw_salmon:   { id: 'raw_salmon',   name: 'ปลาแซลมอนสีเงิน',       icon: '🐠', sellPrice: 65,  buyPrice: 90,  desc: 'ปลาเนื้อแน่นราคาดี ย่างไฟแล้วหอมอร่อยมาก' },
  golden_fish:  { id: 'golden_fish',  name: 'ปลามังกรทองคำโบราณ',    icon: '🐡', sellPrice: 180, buyPrice: 250, desc: 'ปลาหายากในตำนาน ขายที่ตลาดได้ราคาสูงลิ่ว!' },
  raw_meat:     { id: 'raw_meat',     name: 'เนื้อสัตว์ป่าสด',       icon: '🥩', sellPrice: 30,  buyPrice: 45,  desc: 'เนื้อสดชั้นดี สามารถนำไปย่างไฟที่แคมป์ไฟได้' },
  grilled_fish: { id: 'grilled_fish', name: 'ปลาหอมย่างแคมป์ไฟ',     icon: '🍢', sellPrice: 55,  buyPrice: 75,  desc: 'กดกิน [H] เพื่อเพิ่มความหิว +45 และฟื้นฟู HP +60' },
  grilled_meat: { id: 'grilled_meat', name: 'สเต็กเนื้อย่างแคมป์ไฟ', icon: '🍖', sellPrice: 65,  buyPrice: 85,  desc: 'กดกิน [H] เพื่อเพิ่มความหิว +60 และฟื้นฟู HP +85' },
  baked_wheat:  { id: 'baked_wheat',  name: 'ขนมปังข้าวสาลีปิ้งไฟ',  icon: '🥖', sellPrice: 28,  buyPrice: 40,  desc: 'กดกิน [H] เพื่อเพิ่มความหิว +30 และฟื้นฟู Stamina +50' },
  burnt_food:   { id: 'burnt_food',   name: 'อาหารไหม้เกรียม',       icon: '⚫', sellPrice: 2,   buyPrice: 5,   desc: 'ผลลัพธ์จากการย่างไฟพลาด! ขายทิ้งได้ราคาถูกมาก' }
});

// ตารางสูตรของที่ย่างได้บนแคมป์ไฟ (สามารถเพิ่มวัตถุดิบใหม่ๆ ในอนาคตได้ที่นี่เลย!)
const CAMPFIRE_GRILL_RECIPES = [
  { rawId: 'raw_carp',     outId: 'grilled_fish', outQty: 1, speed: 1.15, sweetWidth: 26 },
  { rawId: 'raw_salmon',   outId: 'grilled_fish', outQty: 2, speed: 1.45, sweetWidth: 22 },
  { rawId: 'golden_fish',  outId: 'grilled_fish', outQty: 3, speed: 1.85, sweetWidth: 18 },
  { rawId: 'raw_meat',     outId: 'grilled_meat', outQty: 1, speed: 1.25, sweetWidth: 24 },
  { rawId: 'golden_wheat', outId: 'baked_wheat',  outQty: 1, speed: 1.00, sweetWidth: 28 }
];

playerStats.hunger = playerStats.hunger ?? 100;
playerStats.maxHunger = playerStats.maxHunger ?? 100;
['fishing_rod', 'fishing_bait', 'raw_carp', 'raw_salmon', 'golden_fish', 'raw_meat', 'grilled_fish', 'grilled_meat', 'baked_wheat', 'burnt_food'].forEach(k => {
  playerStats.inventory[k] = playerStats.inventory[k] ?? (k === 'grilled_fish' ? 2 : k === 'raw_meat' ? 1 : 0);
});

// อัปเดตหน้าต่างกระเป๋าและร้านตีเหล็กให้แสดงไอคอนเฉพาะของอาวุธแต่ละชิ้น
const _origRenderInvModal = renderInventoryModal;
renderInventoryModal = function () {
  _origRenderInvModal();
  const wepList = document.getElementById('inv-weapons-list');
  if (!wepList) return;
  const cls = CLASSES[currentConfig.classId];
  wepList.innerHTML = '';
  playerStats.ownedWeapons.forEach(wid => {
    const w = WEAPONS[wid];
    if (!w) return;
    const equipped = currentConfig.weaponId === wid;
    const canEquip = cls.allowedWeapon === 'any' || cls.allowedWeapon === w.type;
    const row = document.createElement('div');
    row.className = "bg-slate-900/90 border border-slate-700 rounded-xl p-2.5 flex items-center justify-between";
    row.innerHTML = `
      <div>
        <div class="font-bold text-amber-200 text-xs">${w.icon || '⚔️'} ${w.name}</div>
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
};

// --- 15.2 เพลงหลักและเพลงต่อสู้จากไฟล์เสียงที่เตรียมไว้ ---
const bgmTracks = {
  main: [
    './sound/BG/main1.mp3',
    './sound/BG/main2.mp3',
    './sound/BG/main3.mp3',
    './sound/BG/main4.mp3'
  ],
  battle: [
    './sound/BG/battle_bgm1.mp3',
    './sound/BG/battle_bgm2.mp3'
  ]
};
const bgmAudio = new Audio();
bgmAudio.loop = false;
bgmAudio.volume = 0.38;
let bgmMode = 'main';
let bgmTrackIndex = -1;
let bgmModeCheckTimer = 0;

function playBGM(mode = bgmMode, advance = false) {
  if (!sound.enabled) return;
  const playlist = bgmTracks[mode];
  if (!playlist?.length) {
    console.error(`No background music tracks configured for "${mode}".`);
    return;
  }
  if (mode !== bgmMode) {
    bgmMode = mode;
    bgmTrackIndex = Math.floor(Math.random() * playlist.length);
  } else if (advance || bgmTrackIndex < 0) {
    bgmTrackIndex = (bgmTrackIndex + 1) % playlist.length;
  }
  const trackPath = playlist[bgmTrackIndex];
  if (!advance && !bgmAudio.paused && bgmAudio.src.endsWith(trackPath.replace('./', ''))) return;
  bgmAudio.src = trackPath;
  bgmAudio.currentTime = 0;
  bgmAudio.play().catch(error => {
    console.warn(`Unable to play background music "${trackPath}":`, error);
    if (error.name !== 'NotAllowedError') _origStartBGM();
  });
}

bgmAudio.addEventListener('ended', () => playBGM(bgmMode, true));

function updateCombatMusic(dt) {
  bgmModeCheckTimer -= dt;
  if (bgmModeCheckTimer > 0) return;
  bgmModeCheckTimer = 0.8;
  const pPos = playerChar3D.root.position;
  const isTargetedCombat = targetMonster?.hp > 0 && pPos.distanceTo(targetMonster.mesh.position) <= 24;
  const isActiveCombat = playerChar3D.attackTimer > 0 ||
    classCombatState.fighterSkill ||
    classCombatState.fighterUltimate ||
    classCombatState.swordUltimate;
  const nextMode = isTargetedCombat || isActiveCombat ? 'battle' : 'main';
  if (nextMode !== bgmMode) playBGM(nextMode);
}

const _origStartBGM = sound.startBGM.bind(sound);
sound.startBGM = function () {
  if (this.enabled) playBGM('main');
};

const audioToggleBtn = document.getElementById('btn-audio-toggle');
if (audioToggleBtn) {
  audioToggleBtn.onclick = () => {
    sound.enabled = !sound.enabled;
    document.getElementById('audio-icon').textContent = sound.enabled ? '🔊' : '🔇';
    document.getElementById('audio-label').textContent = sound.enabled ? 'เสียง' : 'ปิดเสียง';
    if (sound.enabled) {
      sound.sfxClick();
      playBGM(bgmMode);
    } else {
      bgmAudio.pause();
    }
  };
}

// --- 15.3 อนิเมชั่นปีกแฟชั่นขยับได้ (Wing Flapping Animation) ---
const _prevUpdateAnim = ArticulatedCharacter3D.prototype.updateAnimation;
ArticulatedCharacter3D.prototype.updateAnimation = function (dt, speedRatio = 0, isJumping = false, verticalVelocity = 0, turnDelta = 0, isInWater = false) {
  _prevUpdateAnim.call(this, dt, speedRatio, isJumping, verticalVelocity, turnDelta, isInWater);
  if (this.joints.wingL && this.joints.wingR) {
    const frameTime = THREE.MathUtils.clamp(dt, 0, 0.05);
    const state = this.animState || 'idle';
    const isResting = state === 'sit' || state === 'sleep';
    const isDead = state === 'death';
    const isJumpState = isJumping || state === 'jump';
    const isFalling = !isJumpState && verticalVelocity < -1.5;
    const activityTarget = isDead || state === 'sleep'
      ? 0
      : isResting
        ? 0.14
        : isJumpState || isFalling
          ? 1
          : THREE.MathUtils.clamp(speedRatio * 0.62, 0.08, 1);
    this.wingActivity = THREE.MathUtils.damp(this.wingActivity || 0, activityTarget, 5.5, frameTime);
    this.wingFold = THREE.MathUtils.damp(
      this.wingFold || 0,
      isDead ? 1 : isResting ? 0.62 : 0,
      4.5,
      frameTime
    );
    this.wingMotionSpeed = THREE.MathUtils.damp(
      this.wingMotionSpeed || 0,
      THREE.MathUtils.clamp(speedRatio, 0, 2.4) * (isDead || state === 'sleep' ? 0 : 1),
      6,
      frameTime
    );
    this.wingJumpFactor = THREE.MathUtils.damp(
      this.wingJumpFactor || 0,
      isJumpState || isFalling ? 1 : 0,
      8,
      frameTime
    );

    const speed = this.wingMotionSpeed;
    const jumpFactor = this.wingJumpFactor;
    const activity = this.wingActivity;
    const fold = this.wingFold;
    this.wingPhase = (this.wingPhase || 0) + frameTime * (1.8 + Math.min(1.5, speed) * 1.2 + jumpFactor * 1.5) * activity;
    const phase = this.wingPhase;
    const flapAmplitude = 0.025 + activity * (0.13 + Math.min(1.4, speed) * 0.09 + jumpFactor * 0.13);
    const flap = Math.sin(phase) * flapAmplitude;
    const bank = Math.cos(phase) * (0.008 + activity * (0.025 + speed * 0.014 + jumpFactor * 0.025));
    const shoulderSway = Math.sin(phase - 0.25) * activity * (0.025 + speed * 0.018);
    const foldedAngle = fold * 0.48;

    this.joints.wingL.rotation.set(-0.035 + shoulderSway, 0.16 + foldedAngle + flap, -0.035 + bank + fold * 0.08);
    this.joints.wingR.rotation.set(-0.035 + shoulderSway, -0.16 - foldedAngle - flap, 0.035 - bank - fold * 0.08);
  }
};

// --- 15.4 อัปเดต HUD ค่าความหิว + เพิ่มปุ่มตกปลา/ย่างปลา/กินอาหาร บน Hotbar ---
const _origUpdateHUD = updateHUD;
updateHUD = function () {
  _origUpdateHUD();
  const hBar = document.getElementById('hud-hunger-bar');
  const hTxt = document.getElementById('hud-hunger-text');
  if (hBar && hTxt) {
    const hVal = Math.max(0, Math.min(playerStats.maxHunger, playerStats.hunger || 0));
    hTxt.textContent = `${Math.floor(hVal)} / ${playerStats.maxHunger}`;
    hBar.style.width = `${(hVal / playerStats.maxHunger) * 100}%`;
  }
  const fishCountEl = document.getElementById('count-grilled-fish');
  if (fishCountEl) {
    fishCountEl.textContent = playerStats.inventory.grilled_fish || 0;
  }
};

(function injectNewHotbarButtons() {
  const gatherBtn = document.getElementById('btn-gather-node');
  if (!gatherBtn || document.getElementById('btn-fish-action')) return;

  const fishBtn = document.createElement('button');
  fishBtn.id = 'btn-fish-action';
  fishBtn.className = 'relative w-14 h-14 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/50 flex flex-col items-center justify-center';
  fishBtn.innerHTML = `
    <span class="absolute top-0.5 left-1.5 text-[10px] font-bold text-sky-300">G</span>
    <span class="text-lg">🎣</span>
    <span class="text-[9px] text-sky-200 font-semibold">ตกปลา</span>
  `;
  fishBtn.onclick = () => startFishingAction();

  const grillBtn = document.createElement('button');
  grillBtn.id = 'btn-grill-action';
  grillBtn.className = 'relative w-14 h-14 rounded-xl bg-orange-500/20 hover:bg-orange-500/30 border border-orange-400/50 flex flex-col items-center justify-center';
  grillBtn.innerHTML = `
    <span class="absolute top-0.5 left-1.5 text-[10px] font-bold text-orange-300">C</span>
    <span class="text-lg">🔥</span>
    <span class="text-[9px] text-orange-200 font-semibold">ย่างปลา</span>
  `;
  grillBtn.onclick = () => grillFishAtCampfire();

  const eatBtn = document.createElement('button');
  eatBtn.id = 'btn-eat-fish';
  eatBtn.className = 'relative w-14 h-14 rounded-xl bg-lime-500/20 hover:bg-lime-500/30 border border-lime-400/50 flex flex-col items-center justify-center';
  eatBtn.innerHTML = `
    <span class="absolute top-0.5 left-1.5 text-[10px] font-bold text-lime-300">H</span>
    <span class="text-lg">🍢</span>
    <span class="text-[9px] text-lime-200 font-semibold">กิน(<span id="count-grilled-fish">2</span>)</span>
  `;
  eatBtn.onclick = () => eatGrilledFish();

  gatherBtn.parentNode.insertBefore(fishBtn, gatherBtn.nextSibling);
  gatherBtn.parentNode.insertBefore(grillBtn, fishBtn.nextSibling);
  gatherBtn.parentNode.insertBefore(eatBtn, grillBtn.nextSibling);
})();

// เปลี่ยนปุ่มแต่งตัวละครใน HUD ให้เปิดร้านแฟชั่นได้ด้วย
document.getElementById('btn-open-customize').onclick = () => {
  sound.sfxClick();
  releaseMouseForUI();
  renderFashionShopModal();
  document.getElementById('modal-fashion').classList.remove('hidden');
};

// --- 15.5 ระบบมินิเกมตกปลา & ระบบเลือกวัตถุดิบย่างแคมป์ไฟพร้อมมินิเกมคุมไฟ ---
let isFishingActive = false;
let fishingBobberMesh = null;
let fishMinigameState = {
  active: false,
  needlePos: 10,
  needleDir: 1,
  needleSpeed: 68, // ความเร็วเข็ม (% ต่อวินาที)
  zoneStart: 35,
  zoneWidth: 24,
  zoneDir: 1,
  hits: 0,
  misses: 0
};

function startFishingAction() {
  if (gameState !== 'world') return;
  if ((playerStats.inventory.fishing_rod || 0) <= 0) {
    addLog("🎣 คุณยังไม่มี <b>คันเบ็ดตกปลา</b>! ไปหาซื้อได้ที่ <b>ร้านค้าจิปาถะ (พ่อค้ามาร์โค)</b> ก่อนนะ", "text-amber-300 font-bold");
    return;
  }
  if ((playerStats.inventory.fishing_bait || 0) <= 0) {
    addLog("🪱 คุณไม่มี <b>เหยื่อตกปลา</b>! ไปซื้อเหยื่อตกปลาที่ <b>ร้านค้าจิปาถะ</b> ก่อนนะ", "text-amber-300 font-bold");
    return;
  }

  const pPos = playerChar3D.root.position;
  let nearWater = playerPhysics.isInWater || pPos.y <= WATER_LEVEL + 0.85;
  let waterSpot = pPos.clone();
  for (let ang = 0; ang < Math.PI * 2; ang += Math.PI / 4) {
    const tx = pPos.x + Math.cos(ang) * 5.5;
    const tz = pPos.z + Math.sin(ang) * 5.5;
    if (worldNoise.getHeight(tx, tz) <= WATER_LEVEL + 0.35) {
      nearWater = true;
      waterSpot.set(tx, WATER_LEVEL + 0.05, tz);
      playerPhysics.targetRotY = Math.atan2(tx - pPos.x, tz - pPos.z);
      break;
    }
  }

  if (!nearWater) {
    addLog("🌊 กรุณาเดินไปริมแหล่งน้ำหรือชายฝั่งเพื่อเหวี่ยงเบ็ดตกปลา!", "text-sky-300");
    return;
  }

  // หักเหยื่อ 1 ชิ้น และเปิดมินิเกมตกปลา
  playerStats.inventory.fishing_bait--;
  isFishingActive = true;
  playerChar3D.animState = 'harvest';
  sound.sfxSplash();
  releaseMouseForUI();

  if (!fishingBobberMesh) {
    fishingBobberMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xfef08a, emissiveIntensity: 0.5 })
    );
    worldGroup.add(fishingBobberMesh);
  }
  fishingBobberMesh.position.copy(waterSpot);
  fishingBobberMesh.visible = true;
  spawnWaterSplashRing(waterSpot, 0x38bdf8, 1.6);

  // ตั้งค่าเริ่มต้นมินิเกมตกปลา
  fishMinigameState = {
    active: true,
    needlePos: 15,
    needleDir: 1,
    needleSpeed: 72,
    zoneStart: 28 + Math.random() * 35,
    zoneWidth: 24,
    zoneDir: Math.random() < 0.5 ? 1 : -1,
    hits: 0,
    misses: 0
  };
  document.getElementById('fish-catch-score').textContent = `0 / 3`;
  document.getElementById('fish-minigame-msg').textContent = `กดดึงเบ็ดตอนเข็มสีเหลืองทับตัวปลา 🐟! (เหยื่อเหลือ ${playerStats.inventory.fishing_bait})`;
  document.getElementById('modal-fishing-minigame').classList.remove('hidden');
  updateHUD();
}

function handleFishingStrike() {
  if (!fishMinigameState.active) return;
  const n = fishMinigameState.needlePos;
  const zStart = fishMinigameState.zoneStart;
  const zEnd = zStart + fishMinigameState.zoneWidth;

  if (n >= zStart - 2 && n <= zEnd + 2) {
    fishMinigameState.hits++;
    sound.sfxCoin();
    document.getElementById('fish-catch-score').textContent = `${fishMinigameState.hits} / 3`;
    document.getElementById('fish-minigame-msg').textContent = `✨ ดึงเข้าเป้า! อีก ${3 - fishMinigameState.hits} ครั้ง!`;
    // สุ่มย้ายตำแหน่งปลาและเพิ่มความท้าทายขึ้นเล็กน้อย
    fishMinigameState.zoneStart = 12 + Math.random() * 60;
    fishMinigameState.needleSpeed += 12;

    if (fishMinigameState.hits >= 3) {
      closeFishingMinigame();
      const roll = Math.random();
      const caughtId = roll > 0.85 ? 'golden_fish' : roll > 0.42 ? 'raw_salmon' : 'raw_carp';
      const fInfo = FARM_MATERIALS[caughtId];
      playerStats.inventory[caughtId] = (playerStats.inventory[caughtId] || 0) + 1;
      sound.sfxLevelUp();
      showFloatingDamage(playerChar3D.root.position, `🎣 ได้รับ ${fInfo.icon} ${fInfo.name}!`, '#38bdf8');
      addLog(`🎉 ตกปลาสำเร็จ! ได้รับ <b>${fInfo.icon} ${fInfo.name} x1</b>`, "text-emerald-300 font-bold");
      gainExpAndGold(35, 15);
    }
  } else {
    fishMinigameState.misses++;
    sound.sfxHit();
    document.getElementById('fish-minigame-msg').textContent = `⚠️ ดึงพลาดจังหวะ! (${fishMinigameState.misses}/3)`;
    if (fishMinigameState.misses >= 3) {
      closeFishingMinigame();
      addLog(`🐟 ปลาสะบัดหลุดเบ็ดหนีไปแล้ว! ลองตั้งสมาธิเหวี่ยงเบ็ดใหม่อีกครั้งนะ`, "text-rose-400 font-bold");
    }
  }
}

function closeFishingMinigame() {
  fishMinigameState.active = false;
  isFishingActive = false;
  if (fishingBobberMesh) fishingBobberMesh.visible = false;
  playerChar3D.animState = 'idle';
  document.getElementById('modal-fishing-minigame').classList.add('hidden');
}

document.getElementById('btn-fish-strike').onclick = handleFishingStrike;
document.getElementById('btn-fish-cancel').onclick = closeFishingMinigame;

// --- ระบบเลือกของย่างที่แคมป์ไฟ & มินิเกมคุมไฟ (พลาดได้อาหารไหม้!) ---
let grillMinigameState = {
  active: false,
  recipe: null,
  needlePos: 0,
  needleDir: 1,
  sweetStart: 35,
  sweetWidth: 24
};

function grillFishAtCampfire() {
  if (gameState !== 'world') return;
  const pPos = playerChar3D.root.position;
  let nearFire = false;
  for (let i = 0; i < animatedCampfires.length; i++) {
    const cf = animatedCampfires[i];
    const fPos = new THREE.Vector3();
    cf.group.getWorldPosition(fPos);
    if (pPos.distanceTo(fPos) <= 4.8) {
      nearFire = true;
      break;
    }
  }

  if (!nearFire) {
    addLog("🔥 ต้องเดินไปใกล้ๆ <b>กองไฟแคมป์ไฟ (Campfire)</b> ในเมืองหรือในหมู่บ้านเพื่อทำอาหารปิ้งย่าง!", "text-orange-300");
    return;
  }

  sound.sfxClick();
  releaseMouseForUI();
  renderCampfireSelectionList();
  document.getElementById('campfire-minigame-section').classList.add('hidden');
  document.getElementById('modal-campfire-cook').classList.remove('hidden');
}

function renderCampfireSelectionList() {
  const listEl = document.getElementById('campfire-select-section');
  if (!listEl) return;
  listEl.innerHTML = '';

  CAMPFIRE_GRILL_RECIPES.forEach(rc => {
    const rawInfo = FARM_MATERIALS[rc.rawId];
    const outInfo = FARM_MATERIALS[rc.outId];
    const qty = playerStats.inventory[rc.rawId] || 0;

    const row = document.createElement('div');
    row.className = "bg-slate-900/90 border border-slate-700 rounded-xl p-2.5 flex items-center justify-between gap-2";
    row.innerHTML = `
      <div>
        <div class="font-bold text-amber-200 text-xs">
          ${rawInfo.icon} ${rawInfo.name} <span class="text-emerald-300">(มี x${qty})</span>
          ➔ ${outInfo.icon} ${outInfo.name} x${rc.outQty}
        </div>
        <div class="text-[11px] text-slate-400">${outInfo.desc}</div>
      </div>
      <button class="start-grill-btn px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 ${
        qty > 0 ? 'bg-orange-500 hover:bg-orange-400 text-slate-950' : 'bg-slate-800 text-slate-600 cursor-not-allowed'
      }">🔥 เลือกย่าง</button>
    `;
    row.querySelector('.start-grill-btn').onclick = () => {
      if (qty <= 0) {
        addLog(`⚠️ คุณไม่มี <b>${rawInfo.icon} ${rawInfo.name}</b> ในกระเป๋า!`, "text-amber-300");
        return;
      }
      startCampfireGrillMinigame(rc);
    };
    listEl.appendChild(row);
  });
}

function startCampfireGrillMinigame(recipe) {
  const rawInfo = FARM_MATERIALS[recipe.rawId];
  playerStats.inventory[recipe.rawId]--;
  playerChar3D.animState = 'sit';
  sound.sfxClick();

  grillMinigameState = {
    active: true,
    recipe,
    needlePos: 5,
    needleDir: 1,
    sweetStart: 35,
    sweetWidth: recipe.sweetWidth || 24
  };

  const sweetEl = document.getElementById('grill-sweet-spot');
  if (sweetEl) sweetEl.style.width = `${grillMinigameState.sweetWidth}%`;
  document.getElementById('grill-active-title').innerHTML = `🔥 กำลังย่าง <b>${rawInfo.icon} ${rawInfo.name}</b>... กดยกขึ้นเมื่อเข็มอยู่ในโซนสีทอง!`;
  document.getElementById('campfire-minigame-section').classList.remove('hidden');
  renderCampfireSelectionList();
  updateHUD();
}

function finishCampfireGrillMinigame() {
  if (!grillMinigameState.active) return;
  grillMinigameState.active = false;
  const rc = grillMinigameState.recipe;
  const n = grillMinigameState.needlePos;
  const sStart = grillMinigameState.sweetStart;
  const sEnd = sStart + grillMinigameState.sweetWidth;
  const pPos = playerChar3D.root.position;

  document.getElementById('campfire-minigame-section').classList.add('hidden');

  if (n >= sStart && n <= sEnd) {
    // ย่างสำเร็จ!
    const outInfo = FARM_MATERIALS[rc.outId];
    playerStats.inventory[rc.outId] = (playerStats.inventory[rc.outId] || 0) + rc.outQty;
    sound.sfxLevelUp();
    showFloatingDamage(pPos, `✨ สุกหอม! +${rc.outQty} ${outInfo.icon} ${outInfo.name}`, '#fb923c');
    addLog(`🔥 ย่างสำเร็จอย่างสมบูรณ์แบบ! ได้รับ <b>${outInfo.icon} ${outInfo.name} x${rc.outQty}</b>`, "text-emerald-300 font-bold");
  } else {
    // ย่างพลาด ได้อาหารไหม้!
    playerStats.inventory.burnt_food = (playerStats.inventory.burnt_food || 0) + 1;
    sound.sfxHit();
    showFloatingDamage(pPos, `💨 ไฟแรงเกิน! ได้ ⚫ อาหารไหม้เกรียม`, '#94a3b8');
    addLog(`💨 กะจังหวะไฟพลาด! วัตถุดิบไหม้เป็น <b>⚫ อาหารไหม้เกรียม x1</b>`, "text-rose-400 font-bold");
  }

  renderCampfireSelectionList();
  updateHUD();
  savePlayerToRTDB();
}

document.getElementById('btn-grill-stop').onclick = finishCampfireGrillMinigame;
document.getElementById('btn-close-campfire').onclick = () => {
  grillMinigameState.active = false;
  document.getElementById('modal-campfire-cook').classList.add('hidden');
};

// กินอาหารที่ย่างสุกแล้ว (รองรับทั้งเนื้อย่าง ปลาย่าง และขนมปังปิ้ง)
function eatGrilledFish() {
  let foodId = null;
  let hungerGain = 45, hpGain = 60, stamGain = 35;

  if ((playerStats.inventory.grilled_meat || 0) > 0) {
    foodId = 'grilled_meat'; hungerGain = 60; hpGain = 85; stamGain = 50;
  } else if ((playerStats.inventory.grilled_fish || 0) > 0) {
    foodId = 'grilled_fish'; hungerGain = 45; hpGain = 60; stamGain = 40;
  } else if ((playerStats.inventory.baked_wheat || 0) > 0) {
    foodId = 'baked_wheat'; hungerGain = 30; hpGain = 35; stamGain = 55;
  }

  if (!foodId) {
    addLog("🍢 ไม่มีอาหารย่างพร้อมทานในกระเป๋า! นำวัตถุดิบไปย่างที่แคมป์ไฟ [C] ก่อนนะ", "text-amber-300");
    return;
  }

  const fInfo = FARM_MATERIALS[foodId];
  playerStats.inventory[foodId]--;
  playerStats.hunger = Math.min(playerStats.maxHunger, (playerStats.hunger || 0) + hungerGain);
  playerStats.hp = Math.min(playerStats.maxHp, playerStats.hp + hpGain);
  playerStats.stamina = Math.min(playerStats.maxStamina, playerStats.stamina + stamGain);
  sound.sfxLevelUp();
  showFloatingDamage(playerChar3D.root.position, `+${hungerGain} 🍖 ความหิว | +${hpGain} HP`, '#a3e635');
  addLog(`${fInfo.icon} กิน <b>${fInfo.name}</b>! ฟื้นฟูความหิว +${hungerGain} และ HP +${hpGain}`, "text-lime-300 font-bold");
  updateHUD();
  savePlayerToRTDB();
}

// --- 15.6 ระบบร้านค้าใหม่ทั้ง 3 ร้าน (ร้านจิปาถะ, ตลาดซื้อ/ขายปลา, ร้านแฟชั่น) ---
function renderGeneralStoreModal() {
  const grid = document.getElementById('general-items-grid');
  if (!grid) return;
  grid.innerHTML = '';
  const items = [
    {
      title: '🎣 คันเบ็ดไม้ไผ่ชั้นดี (Fishing Rod)',
      desc: `อุปกรณ์สำหรับตกปลาตามแม่น้ำและทะเล (มีแล้ว: ${playerStats.inventory.fishing_rod || 0})`,
      price: 120,
      buy: () => { playerStats.inventory.fishing_rod = (playerStats.inventory.fishing_rod || 0) + 1; }
    },
    {
      title: '🪱 เหยื่อตกปลาหอมพิเศษ x5 ชิ้น',
      desc: `เหยื่อล่อปลาชั้นดี ใช้ตกปลาได้ 5 ครั้ง (มีอยู่: ${playerStats.inventory.fishing_bait || 0})`,
      price: 50,
      buy: () => { playerStats.inventory.fishing_bait = (playerStats.inventory.fishing_bait || 0) + 5; }
    },
    {
      title: '🍢 เสบียงปลาย่างพร้อมทาน x2',
      desc: `เติมค่าความหิว +45 ทันทีเมื่อกด [H] (มีอยู่: ${playerStats.inventory.grilled_fish || 0})`,
      price: 110,
      buy: () => { playerStats.inventory.grilled_fish = (playerStats.inventory.grilled_fish || 0) + 2; }
    },
    {
      title: '🧪 ยาฟื้นฟูฉุกเฉิน (HP Pot x3 + MP Pot x3)',
      desc: 'ชุดยาโพชั่นราคาประหยัดสำหรับนักเดินทาง',
      price: 80,
      buy: () => { playerStats.hpPots += 3; playerStats.mpPots += 3; }
    }
  ];

  items.forEach(it => {
    const card = document.createElement('div');
    card.className = "bg-slate-900/90 border border-slate-700 rounded-xl p-3 flex items-center justify-between gap-2";
    card.innerHTML = `
      <div>
        <div class="font-bold text-emerald-300 text-sm">${it.title}</div>
        <div class="text-xs text-slate-300">${it.desc}</div>
      </div>
      <button class="gen-buy-btn bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-3 py-1.5 rounded-lg text-xs shrink-0">ซื้อ ${it.price} G</button>
    `;
    card.querySelector('.gen-buy-btn').onclick = () => {
      if (playerStats.gold < it.price) {
        addLog("❌ เงิน Gold ไม่พอ!", "text-rose-400");
        return;
      }
      playerStats.gold -= it.price;
      it.buy();
      sound.sfxCoin();
      updateHUD();
      renderGeneralStoreModal();
      savePlayerToRTDB();
    };
    grid.appendChild(card);
  });
}

function renderFishMarketModal() {
  const grid = document.getElementById('market-items-grid');
  if (!grid) return;
  grid.innerHTML = '';
  const fishIds = ['raw_carp', 'raw_salmon', 'golden_fish', 'grilled_fish'];
  fishIds.forEach(fid => {
    const info = FARM_MATERIALS[fid];
    const qty = playerStats.inventory[fid] || 0;
    const card = document.createElement('div');
    card.className = "bg-slate-900/90 border border-slate-700 rounded-xl p-3 flex flex-col justify-between gap-2";
    card.innerHTML = `
      <div>
        <div class="font-bold text-sky-300 text-sm">${info.icon} ${info.name} <span class="text-amber-300">(มี x${qty})</span></div>
        <div class="text-xs text-slate-400">${info.desc}</div>
      </div>
      <div class="flex gap-2 justify-end">
        <button class="mkt-buy px-2.5 py-1 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs">ซื้อ (${info.buyPrice} G)</button>
        <button class="mkt-sell px-2.5 py-1 rounded-lg ${qty > 0 ? 'bg-amber-500 hover:bg-amber-400 text-slate-950' : 'bg-slate-800 text-slate-600 cursor-not-allowed'} font-bold text-xs">ขาย (+${info.sellPrice} G)</button>
      </div>
    `;
    card.querySelector('.mkt-buy').onclick = () => {
      if (playerStats.gold < info.buyPrice) { addLog("❌ เงิน Gold ไม่พอซื้อ!", "text-rose-400"); return; }
      playerStats.gold -= info.buyPrice;
      playerStats.inventory[fid] = (playerStats.inventory[fid] || 0) + 1;
      sound.sfxCoin();
      updateHUD();
      renderFishMarketModal();
      savePlayerToRTDB();
    };
    card.querySelector('.mkt-sell').onclick = () => {
      if (qty <= 0) return;
      playerStats.inventory[fid]--;
      playerStats.gold += info.sellPrice;
      sound.sfxCoin();
      addLog(`⚖️ ขาย <b>${info.name}</b> ได้รับ +${info.sellPrice} G`, "text-amber-300");
      updateHUD();
      renderFishMarketModal();
      savePlayerToRTDB();
    };
    grid.appendChild(card);
  });
}

function setFashionItem(itemId) {
  const result = equipOwnedFashion(playerStats, currentConfig, itemId);
  if (!result.ok) {
    addLog('❌ แฟชั่นนี้ไม่ได้อยู่ในกระเป๋าของคุณ', 'text-rose-400');
    return result;
  }
  if (result.replaced?.length) {
    addLog(`ℹ️ เปลี่ยนสล็อต ${result.replaced.map(item => item.slot).join(', ')} เพื่อไม่ให้แฟชั่นทับตำแหน่งกัน`, 'text-sky-300');
  }
  return result;
}

function renderFashionShopModal(wardrobeOnly = false) {
  renderFashionShopUI(playerStats, currentConfig, {
    wardrobeOnly,
    sound,
    addLog,
    equipFashion: setFashionItem,
    rebuildPreviewCharacter,
    updateHUD,
    savePlayerToRTDB,
    broadcastMyStateToRTDB
  });
  const title = document.querySelector('#modal-fashion h3');
  if (title) title.textContent = wardrobeOnly
    ? '👗 ตู้เสื้อผ้าแฟชั่น (สวมใส่ของที่เป็นเจ้าของ)'
    : '👗 ห้องเสื้อและร้านค้าแฟชั่น (ดีไซเนอร์วิเวียน)';
  const subtitle = document.querySelector('#modal-fashion p');
  if (subtitle) subtitle.textContent = wardrobeOnly
    ? 'เลือกสวมใส่หรือถอดแฟชั่นที่ซื้อแล้ว ช่องที่ทับกันจะเปลี่ยนเป็นชิ้นใหม่'
    : 'ซื้อแฟชั่นแล้วเก็บไว้ในกระเป๋า จากนั้นเปลี่ยนชุดได้ทุกเมื่อที่ตู้เสื้อผ้า';
  const wardrobeButton = document.getElementById('btn-open-fashion-wardrobe');
  if (wardrobeButton) wardrobeButton.classList.toggle('hidden', wardrobeOnly);
  document.getElementById('modal-fashion').classList.remove('hidden');
}

document.getElementById('btn-close-general').onclick = () => document.getElementById('modal-general').classList.add('hidden');
document.getElementById('btn-close-market').onclick = () => document.getElementById('modal-market').classList.add('hidden');
document.getElementById('btn-close-fashion').onclick = () => document.getElementById('modal-fashion').classList.add('hidden');
document.getElementById('btn-open-fashion-wardrobe').onclick = () => renderFashionShopModal(true);

// --- 15.7 ภูเขาหินยักษ์พร้อมโถงถ้ำและเหมืองใต้พิภพขนาดใหญ่ที่เดินสำรวจภายในได้จริง ---
function buildCaveAndMineInChunk(cx, cz, chunkGroup) {
  const wx = cx * CHUNK_SIZE;
  const wz = cz * CHUNK_SIZE;
  const wy = worldNoise.getHeight(wx, wz);
  if (wy < WATER_LEVEL + 1.2) return;

  const isMine = (Math.abs(cx + cz) % 2 === 0);
  const structGroup = new THREE.Group();
  structGroup.position.set(0, wy, 0);

  // ปรับวัสดุหินในถ้ำให้มี Emissive อ่อนๆ รับกับแสงคริสตัล แก้ปัญหาถ้ำมืดตึบ 100%!
  const rockMat = createAnimeMaterial({ color: isMine ? 0x64748b : 0x475569, roughness: 0.75 });
  const innerWallMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    emissive: isMine ? 0x451a03 : 0x0f172a,
    emissiveIntensity: 0.55,
    roughness: 0.72,
    side: THREE.DoubleSide
  });
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    emissive: isMine ? 0x3b1d06 : 0x0c192c,
    emissiveIntensity: 0.50,
    roughness: 0.78
  });
  const woodMat = createAnimeMaterial({ color: 0x92400e, roughness: 0.75 });

  const caveFloor = new THREE.Mesh(new THREE.BoxGeometry(22, 0.25, 26), floorMat);
  caveFloor.position.set(0, 0.08, -6);
  caveFloor.receiveShadow = true;
  structGroup.add(caveFloor);

  const wallBlocks = [
    { lx: -11.5, lz: -6, w: 6.5, h: 18, d: 26 },
    { lx: 11.5,  lz: -6, w: 6.5, h: 18, d: 26 },
    { lx: 0,     lz: -19.5, w: 28, h: 19, d: 6.5 },
    { lx: -8.2,  lz: 6.5, w: 7.5, h: 14, d: 4.5 },
    { lx: 8.2,   lz: 6.5, w: 7.5, h: 14, d: 4.5 }
  ];

  wallBlocks.forEach(b => {
    const wallMesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), innerWallMat);
    wallMesh.position.set(b.lx, b.h / 2, b.lz);
    wallMesh.castShadow = true;
    wallMesh.receiveShadow = true;
    structGroup.add(wallMesh);
    registerBoxCollider(worldColliders, wx + b.lx, wz + b.lz, b.w, b.d, wy + b.h, false);
  });

  const ceilingSlab = new THREE.Mesh(new THREE.BoxGeometry(26, 4.0, 28), rockMat);
  ceilingSlab.position.set(0, 10.5, -6);
  structGroup.add(ceilingSlab);

  const mainPeak = new THREE.Mesh(new THREE.ConeGeometry(19.5, 22.0, 9), rockMat);
  mainPeak.position.set(0, 21.0, -7);
  const subPeakL = new THREE.Mesh(new THREE.ConeGeometry(13.5, 17.0, 7), rockMat);
  subPeakL.position.set(-10, 16.5, -4);
  const subPeakR = new THREE.Mesh(new THREE.ConeGeometry(14.0, 18.5, 8), rockMat);
  subPeakR.position.set(10, 17.5, -8);
  structGroup.add(mainPeak, subPeakL, subPeakR);

  [-4.4, 4.4].forEach(px => {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 7.5, 0.9), woodMat);
    pillar.position.set(px, 3.75, 7.2);
    structGroup.add(pillar);
  });
  const archBeam = new THREE.Mesh(new THREE.BoxGeometry(10.2, 0.9, 1.1), woodMat);
  archBeam.position.set(0, 7.5, 7.2);
  structGroup.add(archBeam);

  // หินคริสตัลเรืองแสงพร้อมระบบกระจายแสง (Light Dispersion) ส่องสว่างทั่วพื้นและผนังถ้ำ!
  const crystalColor = isMine ? 0xfbbf24 : 0x38bdf8;
  const crystalPositions = [
    [-6.5, -4], [6.5, -4], [-7.0, -12], [7.0, -12], [0, -15.5]
  ];
  crystalPositions.forEach(([cxPos, czPos], idx) => {
    const crysHolder = new THREE.Group();
    crysHolder.position.set(cxPos, 0, czPos);

    const crys = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.25, 0),
      new THREE.MeshStandardMaterial({
        color: crystalColor,
        emissive: crystalColor,
        emissiveIntensity: 0.85,
        roughness: 0.25
      })
    );
    crys.scale.set(0.8, 2.1, 0.8);
    crys.position.y = 1.5;
    crysHolder.add(crys);

    // กระจายแสงจริงรอบคริสตัลแต่ละก้อน
    attachLightDispersion(crysHolder, crystalColor, 3.8, 30);
    structGroup.add(crysHolder);

    const stalactite = new THREE.Mesh(new THREE.ConeGeometry(0.9, 3.2, 6), innerWallMat);
    stalactite.rotation.x = Math.PI;
    stalactite.position.set(cxPos * 0.7, 7.2, czPos);
    structGroup.add(stalactite);

    spawnFarmingNodeAt(wx + cxPos * 0.65, wz + czPos, idx % 2 === 0 ? 'mithril_ore' : 'moon_herb');
  });

  // โคมไฟเพดานโถงถ้ำส่องสว่างตรงกลาง
  const centerDomeLight = new THREE.PointLight(0xfff7ed, 4.5, 45, 0.5);
  centerDomeLight.position.set(0, 7.5, -8);
  structGroup.add(centerDomeLight);

  spawnBanditNPCAt(wx - 3.5, wz - 10);
  spawnBanditNPCAt(wx + 3.5, wz - 13);

  const labelAnchor = new THREE.Object3D();
  labelAnchor.position.set(wx, wy + 9.2, wz + 7.5);
  worldGroup.add(labelAnchor);
  registerFloatingLabel(
    labelAnchor,
    `<div class="px-3 py-1 rounded-full bg-slate-950/95 border border-amber-400 text-[11px] text-amber-300 font-extrabold shadow-xl">⛰️ ${isMine ? 'มหาเหมืองแร่ใต้พิภพ (เดินเข้าสำรวจได้)' : 'โถงถ้ำคริสตัลยักษ์ (เดินเข้าสำรวจได้)'}</div>`,
    0
  );

  chunkGroup.add(structGroup);
}
// เสก NPC โจรป่า (Bandits - มอนสเตอร์รูปร่างมนุษย์ถือดาบเข้าโจมตีได้)
function spawnBanditNPCAt(wx, wz) {
  const wy = worldNoise.getHeight(wx, wz);
  if (wy < WATER_LEVEL + 0.35) return;
  const lv = Math.max(2, Math.min(30, Math.floor(Math.hypot(wx, wz) / 26) + 2));
  const banditChar = new ArticulatedCharacter3D({
    gender: 'male',
    bodyType: 'male_hero',
    skinColor: '#eab676',
    hairStyle: 'wolf_cut',
    hairColor: '#090d16',
    eyeStyle: 'fierce',
    eyeColor: '#ef4444',
    expression: 'determined',
    fullOutfit: 'none',
    topStyle: 'hunter_jacket',
    bottomStyle: 'pants',
    primaryColor: '#450a0a',
    secondaryColor: '#0f172a',
    hasCape: true,
    capeColor: '#1e293b',
    weaponId: 'sword_flame'
  });
  banditChar.root.position.set(wx, wy, wz);
  const monObj = {
    id: `bandit_${Math.round(wx)}_${Math.round(wz)}`,
    name: '🗡️ โจรป่าเขี้ยวทมิฬ (Bandit)',
    type: 'goblin',
    lv,
    maxHp: 145 + lv * 35,
    hp: 145 + lv * 35,
    atk: 17 + lv * 4,
    exp: 60 + lv * 18,
    gold: 55 + lv * 15,
    spawnX: wx,
    spawnZ: wz,
    patrolAngle: Math.random() * Math.PI * 2,
    patrolRadius: 3.2,
    patrolPause: 0,
    mesh: banditChar.root,
    char3D: banditChar,
    vx: 0, vy: 0, vz: 0,
    atkCooldown: 0,
    animOffset: Math.random() * 10
  };
  banditChar.root.userData.isMonster = true;
  banditChar.root.userData.monsterRef = monObj;
  worldGroup.add(banditChar.root);
  monsters.push(monObj);
}

// ขยาย generateChunk เพื่อสร้างภูเขาสูง ถ้ำ เหมือง และกองโจรป่าอัตโนมัติ
const _origGenerateChunk = generateChunk;
const _extendedChunkTasks = new Map();
generateChunk = function (cx, cz) {
  const key = `${cx},${cz}`;
  if (chunkMap.has(key)) return Promise.resolve();
  if (_extendedChunkTasks.has(key)) return _extendedChunkTasks.get(key);

  const task = (async () => {
    await _origGenerateChunk(cx, cz);
    const chunkGroup = chunkMap.get(key);
    if (!chunkGroup) return;
    const centerWx = cx * CHUNK_SIZE;
    const centerWz = cz * CHUNK_SIZE;

    let nearTown = false;
    for (const t of TOWNS) {
      if (Math.hypot(centerWx - t.x, centerWz - t.z) < t.radius + 18) { nearTown = true; break; }
    }
    if (!nearTown) {
      const featureHash = worldNoise.hash2D(cx * 91, cz * 47);
      if (featureHash > 0.62) {
        const glowAnchor = new THREE.Group();
        glowAnchor.position.set(CHUNK_SIZE / 2, 0, CHUNK_SIZE / 2);
        chunkGroup.add(glowAnchor);
        attachLightDispersion(glowAnchor, 0x38bdf8, 3.8, 30);
      }
      if (featureHash > 0.45) {
        spawnBanditNPCAt(centerWx + 6, centerWz - 6);
      }
    }
  })();
  _extendedChunkTasks.set(key, task);
  task.finally(() => _extendedChunkTasks.delete(key)).catch(error => {
    console.error(`Unable to finish map chunk ${key}:`, error);
  });
  return task;
};

// --- 15.8 เพิ่มร้านค้าจิปาถะ, ร้านแฟชั่น, ตลาดปลา และ NPC ทหารยาม/อัศวิน/นักผจญภัย ในทุกเมือง ---
const _origBuildAllGrandCities = buildAllGrandCities;
buildAllGrandCities = async function () {
  await _origBuildAllGrandCities();

  let townIndex = 0;
  for (const town of TOWNS) {
    setLoadingProgress(35 + (townIndex / TOWNS.length) * 8, `กำลังเตรียมร้านค้าและ NPC เมือง ${townIndex + 1}/${TOWNS.length}...`);
    // 1) อาคารร้านค้าจิปาถะ (General Store)
    buildEnterableBuilding({
      wx: town.x + 22, wz: town.z - 36, width: 11, depth: 9, height: 5.0,
      wallColor: 0xecfdf5, roofColor: 0x059669, rotY: 0,
      title: '🏪 ร้านค้าจิปาถะ (General Store)', subTitle: 'ซื้อเบ็ดตกปลา & เหยื่อตกปลา', role: 'general_shop',
      npcSpec: { name: 'พ่อค้ามาร์โค (ร้านจิปาถะ)', gender: 'male', outfit: 'none', primary: '#059669', hair: 'short_layered', weapon: 'staff_oak' }
    });

    // 2) อาคารตลาดซื้อ/ขายปลา (Fish Market)
    buildEnterableBuilding({
      wx: town.x + 54, wz: town.z + 2, width: 11, depth: 9, height: 5.0,
      wallColor: 0xf0f9ff, roofColor: 0x0284c7, rotY: -Math.PI / 2,
      title: '⚖️ ตลาดกลางซื้อ/ขายปลา (Fish Market)', subTitle: 'รับซื้อปลาทุกชนิดราคาสูง', role: 'fish_market',
      npcSpec: { name: 'แม่ค้าลินดา (ตลาดซื้อ/ขายปลา)', gender: 'female', outfit: 'none', primary: '#0284c7', hair: 'ponytail', weapon: 'tome_holy' }
    });

    // 3) อาคารร้านค้าแฟชั่น (Fashion Boutique)
    buildEnterableBuilding({
      wx: town.x - 22, wz: town.z - 36, width: 11, depth: 9, height: 5.0,
      wallColor: 0xfaf5ff, roofColor: 0x9333ea, rotY: 0,
      title: '👗 ร้านค้าแฟชั่น (Fashion Boutique)', subTitle: 'ชุดแฟชั่น & ปีกขยับได้', role: 'fashion_shop',
      npcSpec: { name: 'ดีไซเนอร์วิเวียน (ร้านแฟชั่น)', gender: 'female', outfit: 'royal_dress', primary: '#9333ea', hair: 'twintails', weapon: 'staff_void' }
    });

    // 4) เพิ่ม NPC ใหม่: ทหารยาม (Guard), อัศวิน (Knight), นักผจญภัย (Adventurer)
    const extraNPCSpecs = [
      { title: '🛡️ ทหารยามรักษาประตูเมือง', gender: 'male', outfit: 'paladin_armor', top: 'knight_vest', hair: 'short_layered', primary: '#1e40af', weapon: 'shield_knight', radius: 64, speed: 2.2, startAng: 1.2 },
      { title: '⚔️ อัศวินราชองครักษ์', gender: 'male', outfit: 'paladin_armor', top: 'noble_coat', hair: 'wolf_cut', primary: '#b45309', weapon: 'shield_aegis', radius: 19, speed: 2.4, startAng: 3.5 },
      { title: '🧭 นักผจญภัยล่าสมบัติ', gender: 'female', outfit: 'none', top: 'hunter_jacket', hair: 'ponytail', primary: '#047857', weapon: 'bow_wind', radius: 32, speed: 2.7, startAng: 2.1 },
      { title: '🗡️ นักผจญภัยพเนจร', gender: 'male', outfit: 'none', top: 'hunter_jacket', hair: 'spiky', primary: '#7c2d12', weapon: 'sword_flame', radius: 48, speed: 2.6, startAng: 5.0 }
    ];
    const baseY = worldNoise.getHeight(town.x, town.z);
    extraNPCSpecs.forEach((ws, idx) => {
      const isF = ws.gender === 'female';
      const wChar = new ArticulatedCharacter3D({
        gender: ws.gender,
        bodyType: isF ? 'female_grace' : 'male_hero',
        skinColor: '#ffe9dc',
        hairStyle: ws.hair,
        hairColor: '#1c1917',
        fullOutfit: ws.outfit,
        topStyle: ws.top,
        bottomStyle: isF ? 'battle_skirt' : 'pants',
        primaryColor: ws.primary,
        secondaryColor: '#1e293b',
        accessory: idx === 1 ? 'angel_wings' : 'none',
        hasCape: true,
        capeColor: '#991b1b',
        weaponId: ws.weapon
      });
      const initX = town.x + Math.cos(ws.startAng) * ws.radius;
      const initZ = town.z + Math.sin(ws.startAng) * ws.radius;
      wChar.root.position.set(initX, baseY, initZ);
      wChar.root.userData = { isNPC: true, npcName: ws.title, role: 'citizen' };
      worldGroup.add(wChar.root);
      const labelItem = registerFloatingLabel(
        wChar.root,
        `<div class="px-2 py-0.5 rounded-full bg-slate-900/85 border border-amber-400/50 text-[9px] text-amber-200">${ws.title}</div>`,
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
        chatTimer: 5 + idx * 3,
        title: ws.title,
        labelItem,
        chatterPool: [
          "ระวังพวกโจรป่าแถวหน้าถ้ำและเหมืองแร่นอกเมืองด้วยล่ะ!",
          "ซื้อเบ็ดกับเหยื่อที่ร้านจิปาถะ แล้วไปตกปลามาย่างแคมป์ไฟได้เลยนะ!",
          "ปีกแฟชั่นที่ร้านของดีไซเนอร์วิเวียนขยับกระพือได้จริงด้วย สวยสุดๆ!"
        ]
      });
    });
    await waitForRenderFrame();
    townIndex++;
  }
};

// เชื่อมการกดคุย NPC ร้านค้าใหม่เข้ากับทั้งการกดปุ่ม [E] และการคลิกเมาส์
const _origInteractNearest = interactWithNearestObject;
interactWithNearestObject = function (isShiftPressed = false) {
  if (isPlayerDead) return;
  const pPos = playerChar3D.root.position;
  for (const n of npcs) {
    if (pPos.distanceTo(n.root.position) <= 4.5) {
      const role = n.root.userData.role;
      if (role === 'general_shop') {
        sound.sfxClick(); releaseMouseForUI(); renderGeneralStoreModal();
        document.getElementById('modal-general').classList.remove('hidden');
        return;
      }
      if (role === 'fish_market') {
        sound.sfxClick(); releaseMouseForUI(); renderFishMarketModal();
        document.getElementById('modal-market').classList.remove('hidden');
        return;
      }
      if (role === 'fashion_shop') {
        sound.sfxClick(); releaseMouseForUI(); renderFashionShopModal();
        document.getElementById('modal-fashion').classList.remove('hidden');
        return;
      }
    }
  }
  // หากอยู่ใกล้แคมป์ไฟและมีปลาสดในกระเป๋า กด E เพื่อย่างปลาได้ทันที
  for (const cf of animatedCampfires) {
    const fPos = new THREE.Vector3();
    cf.group.getWorldPosition(fPos);
    if (pPos.distanceTo(fPos) <= 3.8 && ((playerStats.inventory.raw_carp || 0) > 0 || (playerStats.inventory.raw_salmon || 0) > 0 || (playerStats.inventory.golden_fish || 0) > 0)) {
      grillFishAtCampfire();
      return;
    }
  }
  _origInteractNearest(isShiftPressed);
};

// เพิ่มการคลิกเมาส์เปิดร้านค้าจิปาถะ/ตลาด/แฟชั่น และปุ่มคีย์ลัด G (ตกปลา), C (ย่างปลา), H (กินปลา)
renderer.domElement.addEventListener('click', (e) => {
  if (gameState !== 'world' || isPlayerDead || cameraMode === 'tps' || cameraMode === 'fps') return;
  const npcHits = raycaster.intersectObjects(npcs.map(n => n.root), true);
  if (npcHits.length > 0) {
    let obj = npcHits[0].object;
    while (obj && !obj.userData.isNPC) obj = obj.parent;
    if (obj) {
      if (obj.userData.role === 'general_shop') { renderGeneralStoreModal(); document.getElementById('modal-general').classList.remove('hidden'); }
      else if (obj.userData.role === 'fish_market') { renderFishMarketModal(); document.getElementById('modal-market').classList.remove('hidden'); }
      else if (obj.userData.role === 'fashion_shop') { renderFashionShopModal(); document.getElementById('modal-fashion').classList.remove('hidden'); }
    }
  }
});

window.addEventListener('keydown', (e) => {
  if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
  if (gameState !== 'world' || isPlayerDead) return;
  const k = (e.key || '').toLowerCase();
  if (k === 'g' || k === 'เ') startFishingAction();
  if (k === 'c' || k === 'แ') grillFishAtCampfire();
  if (k === 'h' || k === '้') eatGrilledFish();
});

// --- 15.9 ระบบรองรับการเล่นบนมือถือ (Mobile Virtual Joystick & Touch Look) ---
(function initMobileTouchControls() {
  const isTouchDevice = ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || window.innerWidth <= 900;
  const mobileUI = document.getElementById('mobile-controls');
  const toggleButton = document.getElementById('btn-toggle-mobile-ui');
  let controlsVisible = isTouchDevice;
  try {
    const savedVisibility = localStorage.getItem('aethel_mobile_controls_visible_v1');
    if (savedVisibility !== null) controlsVisible = savedVisibility === 'true';
  } catch (error) {
    console.warn('Unable to read mobile-control visibility preference:', error);
  }

  const syncMobileControls = (inWorld) => {
    mobileUI?.classList.toggle('hidden', !inWorld || !controlsVisible);
    toggleButton?.classList.toggle('hidden', !inWorld);
    if (!inWorld || !controlsVisible) {
      keys['w'] = keys['a'] = keys['s'] = keys['d'] = keys['shift'] = false;
      joyTouchId = null;
      if (knob) knob.style.transform = 'translate(0px, 0px)';
    }
    if (toggleButton) {
      toggleButton.textContent = controlsVisible ? '🎮 ซ่อนปุ่มมือถือ' : '🎮 แสดงปุ่มมือถือ';
      toggleButton.setAttribute('aria-pressed', String(controlsVisible));
    }
  };
  window.__syncMobileControls = syncMobileControls;
  toggleButton?.addEventListener('click', () => {
    controlsVisible = !controlsVisible;
    try {
      localStorage.setItem('aethel_mobile_controls_visible_v1', String(controlsVisible));
    } catch (error) {
      console.warn('Unable to save mobile-control visibility preference:', error);
    }
    syncMobileControls(gameState === 'world');
  });

  const zone = document.getElementById('joystick-zone');
  const knob = document.getElementById('joystick-knob');
  let joyTouchId = null;

  if (zone && knob) {
    const updateJoystick = (clientX, clientY) => {
      const rect = zone.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const maxR = rect.width / 2 - 12;
      let dx = clientX - cx;
      let dy = clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > maxR) {
        dx = (dx / dist) * maxR;
        dy = (dy / dist) * maxR;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      keys['w'] = dy < -14;
      keys['s'] = dy > 14;
      keys['a'] = dx < -14;
      keys['d'] = dx > 14;
    };

    const resetJoystick = () => {
      joyTouchId = null;
      knob.style.transform = `translate(0px, 0px)`;
      keys['w'] = keys['a'] = keys['s'] = keys['d'] = false;
    };

    zone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      joyTouchId = t.identifier;
      updateJoystick(t.clientX, t.clientY);
    }, { passive: false });

    zone.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === joyTouchId) updateJoystick(t.clientX, t.clientY);
      }
    }, { passive: false });

    zone.addEventListener('touchend', resetJoystick);
    zone.addEventListener('touchcancel', resetJoystick);
  }

  // ลากนิ้วบนหน้าจอฝั่งขวาเพื่อหมุนมุมกล้อง 360 องศาบนมือถือ
  let camTouchId = null;
  let lastTouchX = 0, lastTouchY = 0;
  renderer.domElement.addEventListener('touchstart', (e) => {
    for (const t of e.changedTouches) {
      if (t.clientX > window.innerWidth * 0.35 && camTouchId === null) {
        camTouchId = t.identifier;
        lastTouchX = t.clientX;
        lastTouchY = t.clientY;
      }
    }
  }, { passive: true });

  renderer.domElement.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === camTouchId) {
        const dx = t.clientX - lastTouchX;
        const dy = t.clientY - lastTouchY;
        lastTouchX = t.clientX;
        lastTouchY = t.clientY;
        if (gameState === 'world') {
          cameraYawAngle -= dx * 0.007;
          cameraPitchAngle = THREE.MathUtils.clamp(cameraPitchAngle + dy * 0.005, 0.15, 1.15);
        } else if (gameState === 'creator') {
          creatorYaw += dx * 0.012;
        }
      }
    }
  }, { passive: true });

  renderer.domElement.addEventListener('touchend', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === camTouchId) camTouchId = null;
    }
  });

  // ผูกปุ่มกดบนมือถือ
  const bindMobBtn = (id, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('pointerdown', (e) => { e.preventDefault(); fn(); });
  };
  bindMobBtn('mob-btn-atk', () => queueOrPerformComboAttack());
  bindMobBtn('mob-btn-skill1', () => triggerClassSkill(false));
  bindMobBtn('mob-btn-ult', () => triggerClassSkill(true));
  bindMobBtn('mob-btn-interact', () => interactWithNearestObject(false));
  bindMobBtn('mob-btn-fish', () => startFishingAction());
  bindMobBtn('mob-btn-cook', () => grillFishAtCampfire());
  bindMobBtn('mob-btn-eat', () => eatGrilledFish());
  bindMobBtn('mob-btn-jump', () => {
    if (playerPhysics.jumpCount < 2 || playerPhysics.isInWater) {
      playerPhysics.vy = playerPhysics.isInWater ? 7.5 : 10.5;
      playerPhysics.isGrounded = false;
      playerPhysics.jumpCount++;
      sound.sfxJump();
    }
  });
  bindMobBtn('mob-btn-dash', () => tryPlayerDash());

  const sprintBtn = document.getElementById('mob-btn-sprint');
  if (sprintBtn) {
    sprintBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      keys['shift'] = true;
      sprintBtn.setPointerCapture(e.pointerId);
    });
    const releaseSprint = () => { keys['shift'] = false; };
    sprintBtn.addEventListener('pointerup', releaseSprint);
    sprintBtn.addEventListener('pointercancel', releaseSprint);
  }
})();

// --- 15.10 ลูปอัปเดตมินิเกมตกปลา, มินิเกมย่างไฟ, ความหิวลดแบบสมดุล (ช้าลง 25 เท่า) และโจรป่า ---
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    if (fishMinigameState.active) {
      e.preventDefault();
      handleFishingStrike();
    } else if (grillMinigameState.active) {
      e.preventDefault();
      finishCampfireGrillMinigame();
    }
  }
});

// อัปเดตเข็มมินิเกมตกปลาและย่างไฟแบบลื่นไหล (ทุก 25ms)
setInterval(() => {
  const dt = 0.025;

  if (fishMinigameState.active) {
    fishMinigameState.needlePos += fishMinigameState.needleDir * fishMinigameState.needleSpeed * dt;
    if (fishMinigameState.needlePos >= 96) { fishMinigameState.needlePos = 96; fishMinigameState.needleDir = -1; }
    if (fishMinigameState.needlePos <= 2)  { fishMinigameState.needlePos = 2;  fishMinigameState.needleDir = 1; }

    // ขยับตัวปลาเบาๆ เพิ่มความท้าทาย
    fishMinigameState.zoneStart += fishMinigameState.zoneDir * 18 * dt;
    if (fishMinigameState.zoneStart >= 96 - fishMinigameState.zoneWidth) fishMinigameState.zoneDir = -1;
    if (fishMinigameState.zoneStart <= 4) fishMinigameState.zoneDir = 1;

    const needleEl = document.getElementById('fish-needle');
    const zoneEl = document.getElementById('fish-target-zone');
    if (needleEl) needleEl.style.left = `${fishMinigameState.needlePos}%`;
    if (zoneEl) {
      zoneEl.style.left = `${fishMinigameState.zoneStart}%`;
      zoneEl.style.width = `${fishMinigameState.zoneWidth}%`;
    }
  }

  if (grillMinigameState.active) {
    const spd = (grillMinigameState.recipe?.speed || 1.1) * 75;
    grillMinigameState.needlePos += grillMinigameState.needleDir * spd * dt;
    if (grillMinigameState.needlePos >= 97) { grillMinigameState.needlePos = 97; grillMinigameState.needleDir = -1; }
    if (grillMinigameState.needlePos <= 2)  { grillMinigameState.needlePos = 2;  grillMinigameState.needleDir = 1; }

    const gNeedle = document.getElementById('grill-needle');
    if (gNeedle) gNeedle.style.left = `${grillMinigameState.needlePos}%`;
  }
}, 25);

// ลูปอัปเดตค่าความหิว (ปรับให้ลดช้าลงมาก: อยู่เฉยๆ/เดินปกติใช้เวลา ~20 นาทีจริงกว่าจะหมดหลอด!)
setInterval(() => {
  if (gameState !== 'world') return;

  // ลดเพียง 0.08 ต่อวินาที (จากเดิมลด 2.0 ต่อวินาที)
  const hungerDrainPerSec = keys['shift'] ? 0.16 : 0.07;
  playerStats.hunger = Math.max(0, (playerStats.hunger ?? 100) - hungerDrainPerSec);
  if (playerStats.hunger <= 0) {
    playerStats.hp = Math.max(1, playerStats.hp - 1.0);
  }

  // อัปเดตอนิเมชั่นของ NPC โจรป่า (Bandits)
  monsters.forEach(m => {
    if (m.char3D && m.hp > 0 && m.mesh.visible) {
      m.char3D.updateAnimation(0.2, 0.8, false, 0, 0, false);
    }
  });

  updateHUD();
}, 1000);

// ============================================================================
// 16. PATCH: ระบบความหิวลดถึง 0 แล้วตาย & ระบบไฟส่องสว่างโถงถ้ำ/หินเรืองแสง
// ============================================================================

// ตรวจสอบการตายกรณีปล่อยให้ความหิวลดเหลือ 0 จนเลือดหมด
setInterval(() => {
  if (gameState !== 'world' || isPlayerDead) return;
  if (playerStats.hunger <= 0 && playerStats.hp <= 1) {
    playerStats.hp = 0;
    handlePlayerDeath("ความหิวโหย");
  }
}, 500);

// ระบบไฟส่องสว่างภายในโถงถ้ำและคริสตัลเรืองแสง (แก้ปัญหาถ้ำมืดตึบ 100%)
const caveAmbientLight = new THREE.PointLight(0x38bdf8, 0, 65, 0.35);
scene.add(caveAmbientLight);

export function enhanceCaveCrystalGlowingLight(crystalMesh, colorHex = 0x38bdf8) {
  if (!crystalMesh) return;
  crystalMesh.traverse((child) => {
    if (child.isMesh && child.material) {
      child.material.emissive = new THREE.Color(colorHex);
      child.material.emissiveIntensity = 3.2;
    }
  });
  attachLightDispersion(crystalMesh, colorHex, 8.5, 48);
}

// อัปเดตแสงสว่างเมื่อผู้เล่นเดินเข้าใกล้หรืออยู่ในโถงถ้ำ/เหมืองอัตโนมัติ
setInterval(() => {
  if (gameState !== 'world' || !playerChar3D?.root) return;
  const pPos = playerChar3D.root.position;
  caveAmbientLight.position.set(pPos.x, pPos.y + 3.5, pPos.z);

  let nearGlowingCrystal = false;
  for (let i = 0; i < farmingNodes.length; i++) {
    const n = farmingNodes[i];
    if (n.active && n.matId === 'mithril_ore' && Math.hypot(pPos.x - n.x, pPos.z - n.z) < 28) {
      nearGlowingCrystal = true;
      break;
    }
  }
  caveAmbientLight.intensity = nearGlowingCrystal ? 4.8 : 0.0;
}, 200);


// ----------------------------------------------------------------------------
// A. เชื่อมอนิเมชั่นก้มวิ่ง 45 องศา + ฟิสิกส์เสื้อผ้าจาก anim.js เข้ากับตัวละคร
// ----------------------------------------------------------------------------
const _baseCharAnim = ArticulatedCharacter3D.prototype.updateAnimation;
ArticulatedCharacter3D.prototype.updateAnimation = function (dt, speedRatio = 0, isJumping = false, verticalVelocity = 0, turnDelta = 0, isInWater = false) {
  const previousTurnPose = this._advancedTurnPose;
  if (previousTurnPose) {
    if (this.joints.waist) this.joints.waist.rotation.y -= previousTurnPose.waistY;
    if (this.joints.torso) {
      this.joints.torso.rotation.y -= previousTurnPose.torsoY;
      this.joints.torso.rotation.z -= previousTurnPose.torsoZ;
    }
  }
  this._advancedTurnPose = null;
  _baseCharAnim.call(this, dt, speedRatio, isJumping, verticalVelocity, turnDelta, isInWater);
  applyAdvancedCharacterAndClothAnim(this, dt, speedRatio, isJumping, isInWater, turnDelta, graphicsConfig.clothPhysics);
};

// ----------------------------------------------------------------------------
// B. ระบบตารางเวลารถม้าประจำวัน (จอดพัก / วิ่งตามถนนเชื่อมเมือง A -> B -> C -> D ไม่ชนตึก!)
// ----------------------------------------------------------------------------
function buildSafeCarriageWaypoints(townIdx) {
  const tA = TOWNS[townIdx % TOWNS.length];
  const tB = TOWNS[(townIdx + 1) % TOWNS.length];
  const tC = TOWNS[(townIdx + 2) % TOWNS.length];
  // วิ่งเฉพาะบนถนนสายหลักผ่ากลางประตูเมืองทิศใต้ (x = town.x) ออกไปนอกกำแพงเมือง จึงไม่ชนตึก 100%!
  return [
    new THREE.Vector3(tA.x, 0, tA.z + 10),             // จุดรับผู้โดยสารจัตุรัสกลางเมือง A
    new THREE.Vector3(tA.x, 0, tA.z + tA.radius + 16), // ถนนหน้าประตูทิศใต้เมือง A
    new THREE.Vector3(tB.x, 0, tB.z + tB.radius + 16), // ถนนหลวงเชื่อมไปหน้าประตูเมือง B
    new THREE.Vector3(tB.x, 0, tB.z + 10),             // เข้าจัตุรัสกลางเมือง B
    new THREE.Vector3(tB.x, 0, tB.z + tB.radius + 16), // ออกจากประตูเมือง B
    new THREE.Vector3(tC.x, 0, tC.z + tC.radius + 16), // มุ่งหน้าสู่เมือง C
    new THREE.Vector3(tA.x, 0, tA.z + tA.radius + 16)  // วนกลับเมือง A
  ];
}

export function updateCarriageDailySchedule(car, carIdx, dt, elapsed) {
  if (!car.waypoints) {
    car.waypoints = buildSafeCarriageWaypoints(carIdx);
    car.wpIndex = 0;
  }

  // คำนวณตารางเวลาประจำวัน (อิงจากเวลาในเกม)
  const scheduleSlot = Math.floor((Date.now() / 1000) / 90 + carIdx) % 4;
  // Slot 0 = วันจอดพักหน้าสถานี, Slot 1-3 = วิ่งเดินทางข้ามเมือง A -> B -> C
  const isParkedToday = (scheduleSlot === 0);

  if (isParkedToday && car.wpIndex === 0) {
    // จอดนิ่งๆ ให้ม้ายืนหายใจเบาๆ
    if (car.horseMesh) car.horseMesh.userData.animSpeedMultiplier = 0.0;
    return;
  }

  if (car.horseMesh) car.horseMesh.userData.animSpeedMultiplier = 1.25;

  const targetWP = car.waypoints[car.wpIndex];
  const pos = car.group.position;
  const dx = targetWP.x - pos.x;
  const dz = targetWP.z - pos.z;
  const dist = Math.hypot(dx, dz);

  if (dist < 2.2) {
    car.wpIndex = (car.wpIndex + 1) % car.waypoints.length;
  } else {
    const moveSpd = car.speed * 1.65;
    const stepX = (dx / dist) * moveSpd * dt;
    const stepZ = (dz / dist) * moveSpd * dt;
    const nextX = pos.x + stepX;
    const nextZ = pos.z + stepZ;
    const nextY = worldNoise.getHeight(nextX, nextZ);

    pos.set(nextX, nextY, nextZ);
    const targetRot = Math.atan2(dx, dz);
    car.group.rotation.y = smoothRotateAngle(car.group.rotation.y, targetRot, dt * 6.0);
    car.wheels.forEach(w => { w.rotation.x += dt * moveSpd * 1.5; });
  }

  if (ridingCarriage === car) {
    playerChar3D.root.position.set(pos.x, pos.y + 1.15, pos.z);
    playerPhysics.vx = 0; playerPhysics.vy = 0; playerPhysics.vz = 0;
    playerPhysics.isGrounded = true;
    playerChar3D.animState = 'sit';
    playerPhysics.targetRotY = car.group.rotation.y;
  }
}

// ----------------------------------------------------------------------------
// C. ถ้ำเขาวงกตใต้พิภพขนาดมหึมา (Zero-Lag InstancedMesh Labyrinth Cave)
//    มีหลายห้องโถง, ทางเดินคดเคี้ยว, หลุมเหว, สะพานหิน, กับดักหนาม และหีบสมบัติ
// ----------------------------------------------------------------------------
export const caveChests = [];
export const caveHazards = [];
export const cavePitZones = [];

export function buildDeepLabyrinthCave(worldGroup, worldNoise, worldColliders, registerBoxCollider, registerFloatingLabel) {
  // ปากทางเข้าถ้ำอยู่ที่พิกัด (88, -110) นอกเมืองเอเธลการ์ด
  const entranceX = 88;
  const entranceZ = -110;
  const entranceY = worldNoise.getHeight(entranceX, entranceZ);

  // แผนผังเขาวงกตถ้ำ 15x15 ช่อง (ขนาดช่องละ 12x12 เมตร = ถ้ำกว้าง 180x180 เมตร ลึกสำรวจได้นาน!)
  // 1 = ผนังหินถ้ำ, 0 = ทางเดินคดเคี้ยว, 2 = ห้องโถงใหญ่, 3 = สะพานข้ามเหวลึก, 4 = ห้องสมบัติลับ, 5 = กับดักหนาม
  const CAVE_GRID = [
    [1,1,1,1,1,1,1,0,1,1,1,1,1,1,1],
    [1,4,0,0,1,0,0,0,0,0,1,0,0,4,1],
    [1,1,1,0,1,0,1,1,1,0,1,0,1,1,1],
    [1,0,0,0,5,0,1,2,2,0,0,5,0,0,1],
    [1,0,1,1,1,1,1,2,2,1,1,1,1,0,1],
    [1,0,1,4,0,0,0,0,0,0,0,4,1,0,1],
    [1,0,1,1,1,0,1,3,1,0,1,1,1,0,1],
    [1,0,0,5,0,0,1,3,1,0,0,5,0,0,1],
    [1,1,1,0,1,1,1,3,1,1,1,0,1,1,1],
    [1,2,2,0,0,0,2,2,2,0,0,0,2,2,1],
    [1,2,2,1,1,0,2,2,2,0,1,1,2,2,1],
    [1,0,0,0,1,0,1,3,1,0,1,0,0,0,1],
    [1,0,1,5,1,0,1,3,1,0,1,5,1,0,1],
    [1,4,1,0,0,0,0,2,0,0,0,0,1,4,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
  ];

  const CELL = 12.0;
  const WALL_H = 11.0;
  const startOriginX = entranceX - 7 * CELL;
  const startOriginZ = entranceZ - 12;

  const wallRockMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 });
  const floorRockMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.95 });
  const crystalMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 1.8 });
  const goldChestMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.8, roughness: 0.25 });

  // นับจำนวนบล็อกเพื่อสร้าง InstancedMesh เพียงตัวเดียว (ไม่แล็ค 100%)
  const wallCells = [];
  const floorCells = [];
  const crystalCells = [];

  for (let r = 0; r < 15; r++) {
    for (let c = 0; c < 15; c++) {
      const type = CAVE_GRID[r][c];
      const wx = startOriginX + c * CELL;
      const wz = startOriginZ - r * CELL;

      if (type === 1) {
        wallCells.push({ wx, wz });
      } else {
        floorCells.push({ wx, wz, type, r, c });
        if ((r + c) % 3 === 0) crystalCells.push({ wx, wz });
      }
    }
  }

  const wallInst = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL, WALL_H, CELL), wallRockMat, wallCells.length);
  const ceilingInst = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL + 0.5, 2.5, CELL + 0.5), wallRockMat, floorCells.length);
  const floorInst = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL, 1.0, CELL), floorRockMat, floorCells.length);
  const crystalInst = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.95, 0), crystalMat, crystalCells.length);

  const dummy = new THREE.Object3D();

  // 1) วางผนังเขาวงกตถ้ำ + Collider
  wallCells.forEach((w, idx) => {
    dummy.position.set(w.wx, entranceY + WALL_H * 0.5, w.wz);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    wallInst.setMatrixAt(idx, dummy.matrix);
    registerBoxCollider(worldColliders, w.wx, w.wz, CELL, CELL, entranceY + WALL_H, false, entranceY - 2);
  });

  // 2) วางเพดานถ้ำ พื้นห้องโถง สะพานข้ามเหว กับดัก และหีบสมบัติ
  floorCells.forEach((f, idx) => {
    // เพดานถ้ำมืดสนิทด้านบน
    dummy.position.set(f.wx, entranceY + WALL_H + 1.0, f.wz);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    ceilingInst.setMatrixAt(idx, dummy.matrix);

    if (f.type === 3) {
      // ช่องที่ 3 = เหวลึก (Pit/Cliff) มีเฉพาะสะพานหินแคบๆ กว้าง 2.6 เมตรพาดตรงกลาง!
      dummy.position.set(f.wx, entranceY - 0.4, f.wz);
      dummy.scale.set(0.22, 1, 1); // สะพานแคบ ถ้าเดินตกข้างๆ จะร่วงลงเหว!
      dummy.updateMatrix();
      floorInst.setMatrixAt(idx, dummy.matrix);
      registerBoxCollider(worldColliders, f.wx, f.wz, 2.6, CELL, entranceY + 0.1, true, entranceY - 1.0);
      cavePitZones.push({ wx: f.wx, wz: f.wz, halfSize: CELL * 0.48, bridgeHalfW: 1.35, surfaceY: entranceY });
    } else {
      // พื้นถ้ำปกติและห้องโถงใหญ่
      dummy.position.set(f.wx, entranceY - 0.4, f.wz);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      floorInst.setMatrixAt(idx, dummy.matrix);
      registerBoxCollider(worldColliders, f.wx, f.wz, CELL, CELL, entranceY + 0.05, true, entranceY - 1.0);
    }

    // ช่องที่ 4 = หีบสมบัติโบราณ (Treasure Chest)
    if (f.type === 4) {
      const chestGroup = new THREE.Group();
      chestGroup.position.set(f.wx, entranceY + 0.1, f.wz);
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 1.0), goldChestMat);
      box.position.y = 0.5;
      chestGroup.add(box);
      worldGroup.add(chestGroup);

      const chestObj = { wx: f.wx, wy: entranceY, wz: f.wz, mesh: chestGroup, opened: false };
      caveChests.push(chestObj);
      registerFloatingLabel(
        chestGroup,
        `<div class="px-2.5 py-0.5 rounded-full bg-amber-950/90 border border-amber-400 text-[10px] text-amber-200 font-bold">💎 หีบสมบัติเขาวงกตโบราณ [กด E เปิด]</div>`,
        1.6
      );
    }

    // ช่องที่ 5 = กับดักหนามคริสตัล (Obstacle Hazard)
    if (f.type === 5) {
      const spike = new THREE.Mesh(
        new THREE.ConeGeometry(1.2, 2.8, 6),
        new THREE.MeshStandardMaterial({ color: 0xf43f5e, emissive: 0xe11d48, emissiveIntensity: 1.5 })
      );
      spike.position.set(f.wx, entranceY + 1.2, f.wz);
      worldGroup.add(spike);
      caveHazards.push({ mesh: spike, wx: f.wx, wz: f.wz, baseY: entranceY });
    }
  });

  // 3) คริสตัลเรืองแสงตามผนังถ้ำ
  crystalCells.forEach((cr, idx) => {
    dummy.position.set(cr.wx + 3.8, entranceY + 2.5, cr.wz);
    dummy.scale.set(1, 1.8, 1);
    dummy.updateMatrix();
    crystalInst.setMatrixAt(idx, dummy.matrix);
  });

  [wallInst, ceilingInst, floorInst, crystalInst].forEach(inst => {
    inst.instanceMatrix.needsUpdate = true;
    worldGroup.add(inst);
  });

  // ป้ายหน้าปากถ้ำเขาวงกต
  const entranceAnchor = new THREE.Object3D();
  entranceAnchor.position.set(entranceX, entranceY + 4.5, entranceZ + 4);
  worldGroup.add(entranceAnchor);
  registerFloatingLabel(
    entranceAnchor,
    `<div class="px-3.5 py-1 rounded-xl bg-slate-950/95 border-2 border-cyan-400 text-center shadow-2xl">
      <div class="text-xs font-extrabold text-cyan-300">🕳️ ถ้ำเขาวงกตบาดาลเอเธลการ์ด (Labyrinth Abyss Cave)</div>
      <div class="text-[10px] text-amber-300">ระวังสะพานข้ามเหว & กับดักหนาม | ค้นหาหีบสมบัติลับทั้ง 6 จุด!</div>
    </div>`,
    0
  );
}

// อัปเดตกับดักหนาม + เช็คตกเหวในถ้ำ + เปิดหีบสมบัติ
export function updateLabyrinthCaveMechanics(dt, elapsed, playerPos, playerStats, callbacks) {
  // 1) ขยับหนามคริสตัลขึ้น-ลง
  for (let i = 0; i < caveHazards.length; i++) {
    const h = caveHazards[i];
    const sy = Math.sin(elapsed * 4.5 + i) * 1.3;
    h.mesh.position.y = h.baseY + Math.max(-0.8, sy);
    if (sy > 0.3 && Math.hypot(playerPos.x - h.wx, playerPos.z - h.wz) < 1.65) {
      playerStats.hp = Math.max(1, playerStats.hp - 15 * dt);
      callbacks.updateHUD();
    }
  }

  // 2) เช็คการก้าวพลาดตกสะพานเหวในถ้ำ
  for (let i = 0; i < cavePitZones.length; i++) {
    const pit = cavePitZones[i];
    if (Math.abs(playerPos.x - pit.wx) < pit.halfSize && Math.abs(playerPos.z - pit.wz) < pit.halfSize) {
      // ถ้าออกนอกความกว้างสะพาน (1.35m) จะร่วงตกลงไปในเหว!
      if (Math.abs(playerPos.x - pit.wx) > pit.bridgeHalfW) {
        playerStats.hp = Math.max(10, playerStats.hp - 35);
        playerPos.set(pit.wx, pit.surfaceY + 0.5, pit.wz + pit.halfSize + 1.5);
        callbacks.sound.sfxHit();
        callbacks.showFloatingDamage(playerPos, '⚠️ ตกเหวในถ้ำ! -35 HP', '#f43f5e');
        callbacks.addLog('🕳️ คุณก้าวพลาดตกสะพานหน้าผาในถ้ำ! (-35 HP)', 'text-rose-400 font-bold');
        callbacks.updateHUD();
      }
    }
  }
}

// ----------------------------------------------------------------------------
// D. ระบบกระเป๋า Inventory สไตล์ FiveM (ตามภาพตัวอย่าง)
// ----------------------------------------------------------------------------
let activeFiveMCategory = 'all';
let fiveMSearchQuery = '';

export function renderFiveMInventoryModal() {
  const modal = document.getElementById('modal-inventory');
  if (!modal) return;

  // สร้างโครงสร้าง UI สไตล์ FiveM
  const allItems = [];

  // 1) บัตรประจำตัวผู้กล้า & กุญแจห้องพัก
  allItems.push({
    id: 'id_card', name: `บัตรผู้กล้า ${currentConfig.name}`, icon: '🪪', qty: 1, max: 1, category: 'keys',
    onClick: () => addLog(`🪪 บัตรประจำตัว: ${currentConfig.name} (Lv.${playerStats.level})`, 'text-sky-300')
  });
  (playerStats.roomKeys || []).forEach(k => {
    allItems.push({
      id: `key_${k}`, name: `กุญแจห้องพัก ${k}`, icon: '🔑', qty: 1, max: 1, category: 'keys',
      onClick: () => addLog(`🔑 กุญแจสำหรับไขห้องพักโรงเตี๋ยม #${k}`, 'text-amber-300')
    });
  });

  // 2) น้ำและอาหาร / โพชั่น
  if (playerStats.hpPots > 0) {
    allItems.push({
      id: 'hp_pot', name: 'โพชั่นฟื้นฟู HP', icon: '🧪', qty: playerStats.hpPots, max: 20, category: 'food',
      onClick: () => { document.getElementById('slot-hp-pot')?.click(); renderFiveMInventoryModal(); }
    });
  }
  if (playerStats.mpPots > 0) {
    allItems.push({
      id: 'mp_pot', name: 'โพชั่นฟื้นฟู MP', icon: '💧', qty: playerStats.mpPots, max: 20, category: 'food',
      onClick: () => { document.getElementById('slot-mp-pot')?.click(); renderFiveMInventoryModal(); }
    });
  }

  // 3) วัตถุดิบฟาร์ม อุปกรณ์ทำงาน และปลา
  Object.values(FARM_MATERIALS).forEach(mat => {
    const qty = playerStats.inventory[mat.id] || 0;
    if (qty <= 0) return;
    const isFood = ['grilled_fish', 'grilled_meat', 'baked_wheat'].includes(mat.id);
    const isTool = ['fishing_rod', 'fishing_bait'].includes(mat.id);
    allItems.push({
      id: mat.id,
      name: mat.name,
      icon: mat.icon,
      qty,
      max: isTool ? 50 : 100,
      category: isFood ? 'food' : isTool ? 'tools' : 'materials',
      onClick: () => {
        if (isFood) {
          eatGrilledFish();
          renderFiveMInventoryModal();
        } else {
          playerStats.inventory[mat.id]--;
          playerStats.gold += mat.sellPrice;
          sound.sfxCoin();
          updateHUD();
          renderFiveMInventoryModal();
        }
      }
    });
  });

  // 4) อาวุธในครอบครอง
  playerStats.ownedWeapons.forEach(wid => {
    const w = WEAPONS[wid];
    if (!w) return;
    const isEq = currentConfig.weaponId === wid;
    allItems.push({
      id: wid,
      name: isEq ? `${w.name} (สวมใส่)` : w.name,
      icon: w.icon || '⚔️',
      qty: 1,
      max: 1,
      category: 'weapons',
      equipped: isEq,
      onClick: () => {
        const cls = CLASSES[currentConfig.classId];
        if (cls.allowedWeapon !== 'any' && cls.allowedWeapon !== w.type) {
          addLog('❌ อาชีพของคุณไม่สามารถถืออาวุธชนิดนี้ได้!', 'text-rose-400');
          return;
        }
        currentConfig.weaponId = wid;
        sound.sfxClick();
        rebuildPreviewCharacter();
        recalculateStats();
        renderFiveMInventoryModal();
      }
    });
  });

  ensureFashionState(playerStats, currentConfig);
  playerStats.ownedFashion.forEach(id => {
    const item = FASHION_CATALOG.find(entry => entry.id === id);
    if (!item) return;
    const equipped = playerStats.equippedFashion.includes(id);
    allItems.push({
      id: `fashion_${id}`,
      name: `${equipped ? 'สวมใส่: ' : ''}${item.name}`,
      icon: item.category === 'wing' ? '🪽' : item.category === 'hat' ? '👑' : item.category === 'effect' ? '✨' : '👗',
      qty: 1,
      max: 1,
      category: 'fashion',
      equipped,
      onClick: () => {
        if (setFashionItem(id).ok) {
          rebuildPreviewCharacter();
          updateHUD();
          savePlayerToRTDB();
          broadcastMyStateToRTDB();
        }
        renderFiveMInventoryModal();
      }
    });
  });

  const categories = [
    { id: 'all',       label: '⊞ ทั้งหมด' },
    { id: 'keys',      label: '🔑 กุญแจ/บัตร' },
    { id: 'food',      label: '🍖 น้ำและอาหาร' },
    { id: 'tools',     label: '🛠️ อุปกรณ์ทำงาน' },
    { id: 'materials', label: '💎 ของฟาร์ม' },
    { id: 'weapons',   label: '🗡️ อาวุธ' },
    { id: 'fashion',   label: '👗 แฟชั่น' }
  ];

  const filtered = allItems.filter(it => {
    const matchCat = activeFiveMCategory === 'all' || it.category === activeFiveMCategory;
    const matchSearch = !fiveMSearchQuery || it.name.toLowerCase().includes(fiveMSearchQuery.toLowerCase());
    return matchCat && matchSearch;
  });

  modal.innerHTML = `
    <div class="w-full max-w-5xl rounded-3xl p-5 flex flex-col justify-between shadow-2xl border border-white/10" style="background: rgba(16, 17, 23, 0.96); min-height: 540px; max-height: 88vh;">
      <!-- Top Bar: Categories & Search -->
      <div class="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-white/10">
        <div class="flex flex-wrap items-center gap-1.5">
          ${categories.map(cat => `
            <button data-cat="${cat.id}" class="fivem-cat-btn px-3.5 py-1.5 rounded-full text-xs font-bold transition ${ activeFiveMCategory === cat.id ? 'bg-rose-600 text-white shadow-[0_0_12px_rgba(225,29,72,0.6)]' : 'bg-zinc-900/90 hover:bg-zinc-800 text-zinc-400 border border-white/10' }">${cat.label}</button>
          `).join('')}
        </div>
        <div class="flex items-center gap-2">
          <div class="relative flex items-center bg-zinc-900 border border-white/15 rounded-full overflow-hidden">
            <input id="fivem-search-input" type="text" value="${fiveMSearchQuery}" placeholder="ค้นหาสิ่งของ.." class="bg-transparent px-3.5 py-1 text-xs text-white outline-none w-40" />
            <span class="bg-rose-600 px-3 py-1.5 text-xs text-white font-bold">🔍</span>
          </div>
          <button id="fivem-close-btn" class="px-3 py-1 rounded-full bg-zinc-800 hover:bg-rose-600 text-xs text-white font-bold">✕</button>
        </div>
      </div>

      <!-- Center Grid: 9 Columns FiveM Cards -->
      <div class="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-8 lg:grid-cols-9 gap-2.5 my-4 overflow-y-auto custom-scroll pr-1 flex-1 content-start">
        ${filtered.map((item, idx) => `
          <div data-idx="${idx}" class="fivem-item-card relative rounded-2xl p-2.5 flex flex-col items-center justify-between cursor-pointer transition hover:scale-105 hover:border-rose-500/80 border ${
            item.equipped ? 'border-emerald-400 bg-zinc-800/90' : 'border-white/15 bg-zinc-900/85'
          }" style="height: 118px;">
            <span class="absolute top-2 left-2 text-[9px] text-rose-500">♦</span>
            <div class="text-[11px] font-bold text-zinc-200">${item.qty} / ${item.max}</div>
            <div class="text-3xl my-1 select-none drop-shadow">${item.icon}</div>
            <div class="text-[10px] font-semibold text-zinc-200 text-center leading-tight line-clamp-2 w-full">${item.name}</div>
          </div>
        `).join('')}
      </div>

      <!-- Bottom Status Bar -->
      <div class="flex flex-wrap items-center justify-between pt-3 border-t border-white/10 text-xs text-zinc-300">
        <div class="flex items-center gap-4">
          <label class="flex items-center gap-2 cursor-pointer">
            <span class="w-9 h-5 rounded-full bg-rose-600 flex items-center justify-end px-0.5"><span class="w-4 h-4 rounded-full bg-white"></span></span>
            <span class="font-bold text-white">รับมอบของ</span>
          </label>
          <div>👤 <b>ID: ${myClientId.slice(-4).toUpperCase()}</b></div>
          <div>🪙 <b>${playerStats.gold.toLocaleString()} G</b></div>
          <div>🏛️ <b>ตู้เซฟ: ${(playerStats.roomStorage?.gold || 0).toLocaleString()} G</b></div>
        </div>
        <div class="text-[11px] text-zinc-400">คลิกไอเทมเพื่อ <b>ใช้ / สวมอาวุธ / ขายของ / เปลี่ยนแฟชั่น</b></div>
      </div>
    </div>
  `;

  modal.querySelectorAll('.fivem-cat-btn').forEach(btn => {
    btn.onclick = () => {
      activeFiveMCategory = btn.dataset.cat;
      renderFiveMInventoryModal();
    };
  });
  const searchInp = modal.querySelector('#fivem-search-input');
  if (searchInp) {
    searchInp.oninput = (e) => {
      fiveMSearchQuery = e.target.value;
      renderFiveMInventoryModal();
    };
  }
  modal.querySelector('#fivem-close-btn').onclick = () => modal.classList.add('hidden');
  modal.querySelectorAll('.fivem-item-card').forEach(card => {
    card.onclick = () => {
      const item = filtered[Number(card.dataset.idx)];
      if (item && item.onClick) item.onClick();
    };
  });
}

// แทนที่ renderInventoryModal เดิมด้วย FiveM UI ทันที
renderInventoryModal = renderFiveMInventoryModal;

// บังคับให้การซื้อแฟชั่นต้องเดินไปที่ร้านค้าแฟชั่นในเมืองเท่านั้น (ไม่ให้กดเปิดซื้อเองกลางอากาศ)
document.getElementById('btn-open-customize').onclick = () => {
  sound.sfxClick();
  addLog("👗 กรุณาเดินทางไปคุยกับ <b>ดีไซเนอร์วิเวียน</b> ที่ร้านแฟชั่นในเมือง เพื่อเลือกซื้อและสวมใส่ชุดแฟชั่น!", "text-purple-300 font-bold");
};
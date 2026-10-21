import * as THREE from 'three';
import { createAnimeMaterial, getVolumetricMistTexture, getSoftGlowTexture } from './shaders.js';

export const TOWNS = [
  { id: 0, style: 'capital', name: 'มหานครเอเธลการ์ด (Aethelgard Capital)', x: 0, z: 0, radius: 96, themeColor: 0xf59e0b, roofColor: 0xb91c1c, groundColor: 0xe7e5e4 },
  { id: 1, style: 'elven',   name: 'นครพงไพรซิลแวนเวล (Sylvanvale Sanctuary)', x: -260, z: -260, radius: 88, themeColor: 0x10b981, roofColor: 0x047857, groundColor: 0xd1fae5 },
  { id: 2, style: 'volcano', name: 'ป้อมปราการไพร์โฮลด์ (Pyrehold Bastion)', x: 260, z: -240, radius: 88, themeColor: 0xf97316, roofColor: 0x7c2d12, groundColor: 0xfed7aa },
  { id: 3, style: 'frost',   name: 'เมืองท่าฟรอสต์เฮเวน (Frosthaven Citadel)', x: -240, z: 260, radius: 88, themeColor: 0x38bdf8, roofColor: 0x1d4ed8, groundColor: 0xe0f2fe }
];

export const FARM_MATERIALS = {
  mithril_ore:  { id: 'mithril_ore',  name: 'แร่มิธริลเรืองแสง',   icon: '💎', sellPrice: 45, desc: 'แร่เวทมนตร์บริสุทธิ์สำหรับขายหรือตีอาวุธ' },
  moon_herb:    { id: 'moon_herb',    name: 'สมุนไพรแสงจันทร์',   icon: '🌿', sellPrice: 35, desc: 'สมุนไพรหอมสดชื่น ใช้ปรุงยาและอาหารบัพ' },
  ancient_wood: { id: 'ancient_wood', name: 'ไม้โบราณเอเธล',     icon: '🪵', sellPrice: 30, desc: 'เนื้อไม้แข็งแกร่งจากป่าโบราณ' },
  golden_wheat: { id: 'golden_wheat', name: 'รวงข้าวสาลีทองคำ',   icon: '🌾', sellPrice: 25, desc: 'วัตถุดิบหลักสำหรับให้เชฟโรเซ่ทำขนมปังและสเต็ก' },
  monster_core: { id: 'monster_core', name: 'แก่นเวทมอนสเตอร์',   icon: '🔮', sellPrice: 55, desc: 'ผลึกพลังงานที่ดรอปจากมอนสเตอร์' }
};

export const animatedCampfires = [];
export const animatedTownCrystals = [];

// ==================== PROCEDURAL COBBLESTONE ROAD & PLAZA TEXTURES ====================
let cachedCobbleRoadTex = null;
export function getCobblestoneRoadTexture() {
  if (cachedCobbleRoadTex) return cachedCobbleRoadTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');

  // พื้นหินถนนสีเทาอมน้ำตาลอบอุ่น ไม่มืดดำและไม่เป็นสีน้ำเงินแปลกๆ
  ctx.fillStyle = '#78716c';
  ctx.fillRect(0, 0, 256, 256);

  const rows = 8;
  const cols = 6;
  const bh = 256 / rows;
  const bw = 256 / cols;

  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (bw * 0.5);
    for (let col = -1; col <= cols; col++) {
      const x = col * bw + offset;
      const y = r * bh;
      const shade = 135 + ((r * 17 + col * 31) % 36);
      ctx.fillStyle = `rgb(${shade + 6}, ${shade + 2}, ${shade - 4})`;
      ctx.beginPath();
      ctx.roundRect(x + 2, y + 2, bw - 4, bh - 4, 5);
      ctx.fill();
      ctx.strokeStyle = 'rgba(41, 37, 36, 0.45)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  // ขอบอิฐทางเท้าซ้าย-ขวา
  ctx.fillStyle = '#a8a29e';
  ctx.fillRect(0, 0, 14, 256);
  ctx.fillRect(242, 0, 14, 256);

  cachedCobbleRoadTex = new THREE.CanvasTexture(c);
  cachedCobbleRoadTex.wrapS = THREE.RepeatWrapping;
  cachedCobbleRoadTex.wrapT = THREE.RepeatWrapping;
  cachedCobbleRoadTex.repeat.set(1, 18);
  return cachedCobbleRoadTex;
}

let cachedPlazaTex = null;
export function getPlazaTileTexture() {
  if (cachedPlazaTex) return cachedPlazaTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#d6d3d1';
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = 'rgba(87, 83, 78, 0.35)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 256; i += 32) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke();
  }
  cachedPlazaTex = new THREE.CanvasTexture(c);
  cachedPlazaTex.wrapS = THREE.RepeatWrapping;
  cachedPlazaTex.wrapT = THREE.RepeatWrapping;
  cachedPlazaTex.repeat.set(6, 6);
  return cachedPlazaTex;
}

export class SeededWorldNoise {
  constructor(seedStr = "AETHELGARD-RP-01") { this.setSeed(seedStr); }
  setSeed(seedStr) {
    this.seedStr = String(seedStr || "AETHELGARD-RP-01");
    let h = 1779033703 ^ this.seedStr.length;
    for (let i = 0; i < this.seedStr.length; i++) {
      h = Math.imul(h ^ this.seedStr.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    this.seed = (h >>> 0) || 123456789;
  }
  hash2D(ix, iz) {
    let n = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(this.seed, 1442695041);
    n = (n ^ (n >>> 13)) * 1274126177;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  }
  smoothNoise(x, z) {
    const ix = Math.floor(x), iz = Math.floor(z);
    const fx = x - ix, fz = z - iz;
    const u = fx * fx * (3 - 2 * fx);
    const v = fz * fz * (3 - 2 * fz);
    const a = this.hash2D(ix, iz);
    const b = this.hash2D(ix + 1, iz);
    const c = this.hash2D(ix, iz + 1);
    const d = this.hash2D(ix + 1, iz + 1);
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
  }
  fbm(x, z) {
    let val = 0, amp = 1, freq = 0.015, max = 0;
    for (let i = 0; i < 4; i++) {
      val += this.smoothNoise(x * freq, z * freq) * amp;
      max += amp;
      amp *= 0.5;
      freq *= 2.02;
    }
    return val / max;
  }
  getHeight(x, z) {
    let baseH = (this.fbm(x, z) - 0.43) * 16;
    for (const t of TOWNS) {
      const dist = Math.hypot(x - t.x, z - t.z);
      if (dist <= t.radius + 6) {
        return 0.6;
      } else if (dist < t.radius + 26) {
        const blend = Math.max(0, Math.min(1, (dist - (t.radius + 6)) / 20));
        const smooth = blend * blend * (3 - 2 * blend);
        baseH = baseH * smooth + 0.6 * (1 - smooth);
      }
    }
    return baseH;
  }
  getBiome(x, z) {
    for (const t of TOWNS) {
      if (Math.hypot(x - t.x, z - t.z) <= t.radius + 4) return t.name;
    }
    if (x < -55 && z < -55) return "ป่ามรกตซิลแวน (Emerald Woods)";
    if (x > 55 && z < -45) return "หุบเขาอัคนีไพร์ (Scorched Wastes)";
    if (x < -45 && z > 55) return "ทุ่งน้ำแข็งคริสตัล (Crystal Tundra)";
    return "ทุ่งหญ้าเอเธลการ์ด (Royal Plains)";
  }
}

export function registerBoxCollider(worldColliders, cx, cz, width, depth, topY, stepable = false, minY = -999, extraData = null) {
  const col = {
    type: 'box',
    minX: cx - width / 2,
    maxX: cx + width / 2,
    minZ: cz - depth / 2,
    maxZ: cz + depth / 2,
    minY,
    topY,
    stepable,
    disabled: false
  };
  if (extraData) Object.assign(col, extraData);
  worldColliders.push(col);
  return col;
}

export function resolveWorldCollisions(pPos, playerRadius, currentSupportY, worldColliders) {
  let supportY = currentSupportY;

  for (let i = 0; i < worldColliders.length; i++) {
    const col = worldColliders[i];
    if (col.disabled) continue;
    if (col.minY !== undefined && pPos.y + 1.65 < col.minY) continue;

    if (col.type === 'box') {
      const closestX = Math.max(col.minX, Math.min(pPos.x, col.maxX));
      const closestZ = Math.max(col.minZ, Math.min(pPos.z, col.maxZ));
      const dx = pPos.x - closestX;
      const dz = pPos.z - closestZ;
      const distSq = dx * dx + dz * dz;

      if (distSq < playerRadius * playerRadius) {
        if (col.stepable && pPos.y >= col.topY - 0.72) {
          supportY = Math.max(supportY, col.topY);
        } else if (pPos.y < col.topY - 0.05) {
          const dist = Math.sqrt(distSq);
          if (dist > 0.0001) {
            const overlap = playerRadius - dist;
            pPos.x += (dx / dist) * overlap;
            pPos.z += (dz / dist) * overlap;
          } else {
            const dLeft = Math.abs(pPos.x - col.minX);
            const dRight = Math.abs(col.maxX - pPos.x);
            const dBack = Math.abs(pPos.z - col.minZ);
            const dFront = Math.abs(col.maxZ - pPos.z);
            const m = Math.min(dLeft, dRight, dBack, dFront);
            if (m === dLeft) pPos.x = col.minX - playerRadius;
            else if (m === dRight) pPos.x = col.maxX + playerRadius;
            else if (m === dBack) pPos.z = col.minZ - playerRadius;
            else pPos.z = col.maxZ + playerRadius;
          }
        }
      }
    } else {
      const dx = pPos.x - col.x;
      const dz = pPos.z - col.z;
      const dist = Math.hypot(dx, dz);
      const minDist = col.radius + playerRadius;
      if (dist < minDist && dist > 0.0001) {
        if (col.stepable && pPos.y >= col.topY - 0.72) {
          supportY = Math.max(supportY, col.topY);
        } else if (pPos.y < col.topY - 0.05) {
          const overlap = minDist - dist;
          pPos.x += (dx / dist) * overlap;
          pPos.z += (dz / dist) * overlap;
        }
      }
    }
  }
  return supportY;
}

// ==================== 1. กองไฟแคมป์ปิ้งสมจริง (วงแสงนุ่มนวล ไม่มีแผ่นวงกลมสีแดงขอบแข็ง!) ====================
export function createVolumetricCampfire(scale = 1.0, includeProps = true) {
  const group = new THREE.Group();
  group.scale.setScalar(scale);

  const stoneMat = createAnimeMaterial({ color: 0x78716c, roughness: 0.82 });
  const ashMat = createAnimeMaterial({ color: 0x44403c, roughness: 0.92 });
  const woodMat = createAnimeMaterial({ color: 0x78350f, roughness: 0.78 });
  const emberMat = new THREE.MeshBasicMaterial({ color: 0xf97316 });

  const ashMound = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.88, 0.14, 18), ashMat);
  ashMound.position.y = 0.07;
  const emberCore = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), emberMat);
  emberCore.scale.set(1.15, 0.42, 1.15);
  emberCore.position.y = 0.13;
  group.add(ashMound, emberCore);

  const numStones = 10;
  for (let i = 0; i < numStones; i++) {
    const ang = (i / numStones) * Math.PI * 2;
    const sRadius = 0.20 + (i % 3) * 0.03;
    const stone = new THREE.Mesh(new THREE.SphereGeometry(sRadius, 12, 10), stoneMat);
    stone.scale.set(1.15, 0.72, 0.95);
    stone.position.set(Math.cos(ang) * 0.85, sRadius * 0.52, Math.sin(ang) * 0.85);
    stone.rotation.y = ang;
    stone.castShadow = true;
    stone.receiveShadow = true;
    group.add(stone);
  }

  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2 + 0.2;
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.068, 1.08, 10), woodMat);
    log.position.set(Math.cos(ang) * 0.25, 0.42, Math.sin(ang) * 0.25);
    log.rotation.z = Math.cos(ang) * 0.46;
    log.rotation.x = -Math.sin(ang) * 0.46;
    log.castShadow = true;
    group.add(log);
  }

  const mistTex = getVolumetricMistTexture();
  const mistPuffs = [];
  const puffCount = 14;

  for (let i = 0; i < puffCount; i++) {
    const spriteMat = new THREE.SpriteMaterial({
      map: mistTex,
      color: new THREE.Color(0xffedd5),
      transparent: true,
      opacity: 0.82,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const sprite = new THREE.Sprite(spriteMat);
    const phase = i / puffCount;
    const angle = Math.random() * Math.PI * 2;
    const rad = Math.random() * 0.22;
    sprite.position.set(Math.cos(angle) * rad, 0.2 + phase * 1.45, Math.sin(angle) * rad);
    const s = 0.55 + (1 - phase) * 0.45;
    sprite.scale.set(s, s * 1.25, s);
    group.add(sprite);

    mistPuffs.push({
      sprite,
      phase,
      speed: 0.65 + Math.random() * 0.40,
      swirlAngle: angle,
      swirlRadius: 0.06 + Math.random() * 0.16,
      baseScale: 0.62 + Math.random() * 0.35
    });
  }

  let fireLight = null;
  if (includeProps) {
    fireLight = new THREE.PointLight(0xf97316, 2.2, 18, 1.5);
    fireLight.position.set(0, 1.2, 0);
    group.add(fireLight);
  }

  // ใช้ Soft Radial Glow Texture แทนวงกลมทึบขอบแข็ง
  const softGlowTex = getSoftGlowTexture();
  const fireGroundGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(5.2, 5.2),
    new THREE.MeshBasicMaterial({
      map: softGlowTex,
      color: 0xf97316,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  fireGroundGlow.rotation.x = -Math.PI / 2;
  fireGroundGlow.position.y = 0.03;
  group.add(fireGroundGlow);

  animatedCampfires.push({ group, mistPuffs, fireLight });
  return group;
}

// ==================== 1.5 โคมไฟถนนโครงเหล็กดัดแฟนตาซี + แสงฟุ้งนุ่มนวล (แก้ปัญหาหลอดไฟไม่สวย!) ====================
export function createOrnateStreetLamp(lx, ly, lz, rotY = 0, streetLampMaterials = [], streetLampGlowDiscs = []) {
  const lampGroup = new THREE.Group();
  lampGroup.position.set(lx, ly, lz);
  lampGroup.rotation.y = rotY;

  const stoneMat = createAnimeMaterial({ color: 0xa8a29e, roughness: 0.72 });
  const ironMat = createAnimeMaterial({ color: 0x334155, metalness: 0.68, roughness: 0.32 });
  const goldMat = createAnimeMaterial({ color: 0xfbbf24, metalness: 0.78, roughness: 0.24 });
  const glassBulbMat = new THREE.MeshStandardMaterial({
    color: 0xfef9c3,
    emissive: 0xfacc15,
    emissiveIntensity: 6.5, // เพิ่มความสว่างจ้าของหลอดแก้วให้เด่นชัดขึ้น
    roughness: 0.12,
    transparent: true,
    opacity: 0.92
  });
  streetLampMaterials.push(glassBulbMat);

  // ฐานหินแปดเหลี่ยม 2 ชั้น
  const plinth1 = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.28, 8), stoneMat);
  plinth1.position.y = 0.14;
  const plinth2 = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.36, 8), ironMat);
  plinth2.position.y = 0.46;

  // เสาเหล็กดัดเรียวพร้อมแหวนทองคำประดับ
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.11, 3.6, 10), ironMat);
  post.position.y = 2.40;
  const ringMid = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.022, 8, 16), goldMat);
  ringMid.rotation.x = Math.PI / 2;
  ringMid.position.y = 2.30;
  const ringTop = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.022, 8, 16), goldMat);
  ringTop.rotation.x = Math.PI / 2;
  ringTop.position.y = 4.15;
  const finialTop = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.28, 8), goldMat);
  finialTop.position.y = 4.34;

  // กิ่งเหล็กดัดยื่นแขวนโคมไฟและเหล็กค้ำยันโค้ง
  const armBar = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.07, 0.07), ironMat);
  armBar.position.set(0.38, 4.12, 0);
  const scrollBrace = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.022, 8, 18, Math.PI * 0.75), goldMat);
  scrollBrace.position.set(0.26, 3.84, 0);
  scrollBrace.rotation.z = Math.PI * 0.65;

  // ตัวโคมไฟแก้วหกเหลี่ยมพร้อมโครงเหล็กและยอดแหลม
  const lanternCage = new THREE.Group();
  lanternCage.position.set(0.74, 3.74, 0);
  const topCap = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.22, 6), ironMat);
  topCap.position.y = 0.26;
  const topRim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.04, 6), goldMat);
  topRim.position.y = 0.14;
  const glassCore = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.13, 0.34, 6), glassBulbMat);
  const botCap = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.14, 6), goldMat);
  botCap.rotation.x = Math.PI;
  botCap.position.y = -0.22;
  lanternCage.add(topCap, topRim, glassCore, botCap);

  // Halo แสงฟุ้งรอบตัวโคมไฟ (เพิ่มสเกลและความสว่าง)
  const softGlowTex = getSoftGlowTexture();
  const haloSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: softGlowTex,
      color: 0xfef08a,
      transparent: true,
      opacity: 0.88, // เพิ่มความทึบของแสงฟุ้งรอบหลอด
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  haloSprite.scale.set(3.2, 3.2, 3.2); // ขยายรัศมีการเรืองแสงรอบโคมไฟให้กว้างและเด่นขึ้น
  lanternCage.add(haloSprite);

  // วงแสงไล่ระดับนุ่มนวลตกกระทบบบนพื้นถนน (ขยายขนาดและเพิ่มความสว่าง)
  const groundPool = new THREE.Mesh(
    new THREE.PlaneGeometry(10.5, 10.5), // ขยายพื้นที่วงแสงตกกระทบพื้นให้กว้างขึ้น
    new THREE.MeshBasicMaterial({
      map: softGlowTex,
      color: 0xfef08a,
      transparent: true,
      opacity: 0.65, // เพิ่มความสว่างของวงแสงบนพื้นถนน
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  groundPool.rotation.x = -Math.PI / 2;
  groundPool.position.set(0.55, 0.035, 0);
  streetLampGlowDiscs.push(groundPool);

  lampGroup.add(plinth1, plinth2, post, ringMid, ringTop, finialTop, armBar, scrollBrace, lanternCage, groundPool);
  lampGroup.traverse(c => {
    if (c.isMesh && c !== groundPool && c !== glassCore) {
      c.castShadow = true;
      c.receiveShadow = true;
    }
  });
  return lampGroup;
}

// ==================== 1.6 หน้าต่างไม้มีกรอบและซี่ตารางสมจริง (Framed Mullioned Window) ====================
export function createFramedWindowMesh(w = 1.4, h = 1.5, windowLampMat) {
  const winGroup = new THREE.Group();
  const frameMat = createAnimeMaterial({ color: 0x5c2d0c, roughness: 0.75 });

  // แผ่นกระจกเรืองแสงด้านใน
  const glass = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.06), windowLampMat);
  winGroup.add(glass);

  // กรอบไม้ 4 ด้าน + ขอบธรณีหน้าต่าง
  const topFrame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.18, 0.12, 0.14), frameMat);
  topFrame.position.y = h / 2 + 0.04;
  const botSill = new THREE.Mesh(new THREE.BoxGeometry(w + 0.26, 0.14, 0.20), frameMat);
  botSill.position.y = -h / 2 - 0.04;
  const leftFrame = new THREE.Mesh(new THREE.BoxGeometry(0.12, h, 0.12), frameMat);
  leftFrame.position.x = -w / 2 - 0.04;
  const rightFrame = new THREE.Mesh(new THREE.BoxGeometry(0.12, h, 0.12), frameMat);
  rightFrame.position.x = w / 2 + 0.04;

  // ซี่ตารางหน้าต่าง (Mullions)
  const vBar = new THREE.Mesh(new THREE.BoxGeometry(0.06, h, 0.10), frameMat);
  const hBar = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, 0.10), frameMat);

  winGroup.add(topFrame, botSill, leftFrame, rightFrame, vBar, hBar);
  return winGroup;
}

// ==================== 1.7 โต๊ะไม้และเก้าอี้ 3D สมจริง + คลิกเพื่อนั่งเข้าที่อัตโนมัติ (Click-to-Sit!) ====================
export function createDetailedTableAndChairs(wx, wy, wz, rotY = 0, interactiveSeats = [], worldColliders = [], opts = {}) {
  const group = new THREE.Group();
  group.position.set(wx, wy, wz);
  group.rotation.y = rotY;

  const woodTopMat = createAnimeMaterial({ color: 0x92400e, roughness: 0.58 });
  const darkWoodMat = createAnimeMaterial({ color: 0x5c2d0c, roughness: 0.72 });
  const cushionMat = createAnimeMaterial({ color: opts.cushionColor || 0xb91c1c, roughness: 0.65 });
  const clothMat = createAnimeMaterial({ color: opts.runnerColor || 0xfef3c7, roughness: 0.65 });
  const goldMat = createAnimeMaterial({ color: 0xfbbf24, metalness: 0.75, roughness: 0.25 });
  const ceramicMat = createAnimeMaterial({ color: 0xf8fafc, roughness: 0.3 });

  const isRound = !!opts.isRound;
  const tableW = opts.tableW || 1.75;
  const tableD = opts.tableD || 1.15;
  const tableH = 0.78;

  // 1. แผ่นท็อปโต๊ะไม้ขัดเงา + คิ้วขอบโต๊ะ + ขาโต๊ะทั้ง 4 ขา + คานยึดด้านล่าง
  if (isRound) {
    const topDisk = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.08, 0.09, 24), woodTopMat);
    topDisk.position.y = tableH;
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, tableH - 0.04, 14), darkWoodMat);
    pedestal.position.y = tableH / 2;
    const baseCross1 = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.08, 0.18), darkWoodMat);
    baseCross1.position.y = 0.04;
    const baseCross2 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 1.15), darkWoodMat);
    baseCross2.position.y = 0.04;
    group.add(topDisk, pedestal, baseCross1, baseCross2);
  } else {
    const topPlank = new THREE.Mesh(new THREE.BoxGeometry(tableW, 0.09, tableD), woodTopMat);
    topPlank.position.y = tableH;
    const apron = new THREE.Mesh(new THREE.BoxGeometry(tableW - 0.14, 0.09, tableD - 0.14), darkWoodMat);
    apron.position.y = tableH - 0.07;
    const runner = new THREE.Mesh(new THREE.BoxGeometry(tableW + 0.02, 0.095, tableD * 0.34), clothMat);
    runner.position.y = tableH + 0.004;
    group.add(topPlank, apron, runner);

    const lxOff = tableW / 2 - 0.14;
    const lzOff = tableD / 2 - 0.14;
    [[-lxOff, -lzOff], [lxOff, -lzOff], [-lxOff, lzOff], [lxOff, lzOff]].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.042, tableH - 0.04, 10), darkWoodMat);
      leg.position.set(lx, (tableH - 0.04) / 2, lz);
      group.add(leg);
    });
    const stretcher = new THREE.Mesh(new THREE.BoxGeometry(tableW - 0.28, 0.05, 0.06), darkWoodMat);
    stretcher.position.y = 0.22;
    group.add(stretcher);
  }

  // 2. ของตกแต่งบนโต๊ะ (ตะเกียงเทียนหอมตรงกลาง + แก้วเบียร์ไม้ + จานอาหาร)
  if (opts.withProps !== false) {
    const candleHolder = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 0.06, 12), goldMat);
    candleHolder.position.y = tableH + 0.07;
    const candle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.18, 10),
      new THREE.MeshStandardMaterial({ color: 0xfffbeb, emissive: 0xf59e0b, emissiveIntensity: 1.4 })
    );
    candle.position.y = tableH + 0.17;
    group.add(candleHolder, candle);

    [[-0.45, 0.25], [0.45, -0.25]].forEach(([px, pz]) => {
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.03, 14), ceramicMat);
      plate.position.set(px, tableH + 0.06, pz);
      const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.07, 0.16, 10), woodTopMat);
      mug.position.set(px + 0.22, tableH + 0.12, pz);
      group.add(plate, mug);
    });
  }

  if (worldColliders) {
    registerBoxCollider(
      worldColliders,
      wx,
      wz,
      isRound ? 1.85 : tableW * 0.92,
      isRound ? 1.85 : tableD * 0.92,
      wy + tableH + 0.1,
      false,
      wy - 0.1
    );
  }

  // 3. เก้าอี้ไม้มีพนักพิงและเบาะรองนั่ง (คลิกที่เก้าอี้ตัวไหนก็ได้เพื่อเดินเข้าไปนั่งหันหน้าเข้าหาโต๊ะอัตโนมัติ!)
  const chairConfigs = opts.chairList || (isRound
    ? [
        { cx: 0, cz: 1.38, faceRot: Math.PI },
        { cx: 0, cz: -1.38, faceRot: 0 },
        { cx: 1.38, cz: 0, faceRot: -Math.PI / 2 },
        { cx: -1.38, cz: 0, faceRot: Math.PI / 2 }
      ]
    : [
        { cx: -0.44, cz: tableD / 2 + 0.48, faceRot: Math.PI },
        { cx: 0.44, cz: tableD / 2 + 0.48, faceRot: Math.PI },
        { cx: -0.44, cz: -tableD / 2 - 0.48, faceRot: 0 },
        { cx: 0.44, cz: -tableD / 2 - 0.48, faceRot: 0 }
      ]);

  const cosR = Math.cos(rotY);
  const sinR = Math.sin(rotY);

  chairConfigs.forEach((cc, idx) => {
    const chairG = new THREE.Group();
    chairG.position.set(cc.cx, 0, cc.cz);
    chairG.rotation.y = cc.faceRot;

    const seatH = 0.46;
    const seatW = 0.48;
    const seatD = 0.46;

    // แผ่นที่นั่งไม้ + เบาะรองนั่งสีแดง/ทอง
    const seatBase = new THREE.Mesh(new THREE.BoxGeometry(seatW, 0.055, seatD), woodTopMat);
    seatBase.position.y = seatH;
    const cushion = new THREE.Mesh(new THREE.BoxGeometry(seatW - 0.05, 0.04, seatD - 0.05), cushionMat);
    cushion.position.y = seatH + 0.04;
    chairG.add(seatBase, cushion);

    // ขาเก้าอี้ทั้ง 4 ขา
    const legOffX = seatW / 2 - 0.045;
    const legOffZ = seatD / 2 - 0.045;
    [[-legOffX, -legOffZ], [legOffX, -legOffZ], [-legOffX, legOffZ], [legOffX, legOffZ]].forEach(([lx, lz]) => {
      const cLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.024, seatH, 8), darkWoodMat);
      cLeg.position.set(lx, seatH / 2, lz);
      chairG.add(cLeg);
    });

    // เสาพนักพิงหลัง 2 ข้าง (อยู่ด้าน -Z ของเก้าอี้ เพราะเก้าอี้หันหน้าไปทาง +Z เข้าหาโต๊ะ)
    [-legOffX, legOffX].forEach((lx) => {
      const backPost = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.54, 8), darkWoodMat);
      backPost.position.set(lx, seatH + 0.27, -legOffZ);
      backPost.rotation.x = -0.08;
      chairG.add(backPost);
    });

    // แผ่นไม้พนักพิงหลัง 2 ชั้น
    const slat1 = new THREE.Mesh(new THREE.BoxGeometry(seatW - 0.04, 0.11, 0.035), woodTopMat);
    slat1.position.set(0, seatH + 0.24, -legOffZ - 0.01);
    const slat2 = new THREE.Mesh(new THREE.BoxGeometry(seatW - 0.02, 0.13, 0.04), woodTopMat);
    slat2.position.set(0, seatH + 0.44, -legOffZ - 0.02);
    chairG.add(slat1, slat2);

    // คำนวณพิกัดโลกของเก้าอี้ตัวนี้เพื่อให้คลิกแล้วตัวละครเดินมานั่งตรงเบาะและหันหน้าเข้าหาโต๊ะพอดี!
    const seatWorldX = wx + cc.cx * cosR + cc.cz * sinR;
    const seatWorldZ = wz - cc.cx * sinR + cc.cz * cosR;
    const seatWorldRotY = rotY + cc.faceRot;

    const seatObj = {
      id: `seat_${Math.round(seatWorldX * 10)}_${Math.round(seatWorldZ * 10)}_${idx}`,
      wx: seatWorldX,
      wy: wy,
      wz: seatWorldZ,
      rotY: seatWorldRotY,
      mesh: chairG,
      label: opts.locationName || 'เก้าอี้ไม้'
    };

    chairG.traverse((m) => {
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
        m.userData.isSeat = true;
        m.userData.seatRef = seatObj;
      }
    });

    if (interactiveSeats) interactiveSeats.push(seatObj);
    group.add(chairG);
  });

  group.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
  return group;
}

// ==================== 1.8 ประตูบานพับเปิด-ปิดได้จริง (Hinged Interactive Door) ====================
export function createHingedDoor(localX, localY, localZ, doorW, doorH, buildingGroup, buildingWx, buildingWy, buildingWz, buildingRotY, interactiveDoors, worldColliders, doorSpec = {}) {
  const hingePivot = new THREE.Group();
  // วางจุดหมุนบานพับไว้ที่ขอบซ้ายของช่องประตู
  hingePivot.position.set(localX - doorW / 2, localY, localZ);

  const doorWoodMat = createAnimeMaterial({ color: doorSpec.color || 0x6b3410, roughness: 0.65 });
  const frameTrimMat = createAnimeMaterial({ color: 0x3f1d06, roughness: 0.78 });
  const goldMat = createAnimeMaterial({ color: 0xfbbf24, metalness: 0.85, roughness: 0.22 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xfef3c7,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.85,
    roughness: 0.2
  });

  const panel = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, 0.14), doorWoodMat);
  panel.position.set(doorW / 2, doorH / 2, 0);

  // คิ้วขอบประตูและช่องกระจกด้านบน
  const topInset = new THREE.Mesh(new THREE.BoxGeometry(doorW * 0.65, doorH * 0.28, 0.16), doorSpec.isRoomDoor ? frameTrimMat : glassMat);
  topInset.position.set(doorW / 2, doorH * 0.72, 0);

  const botInset = new THREE.Mesh(new THREE.BoxGeometry(doorW * 0.68, doorH * 0.34, 0.16), frameTrimMat);
  botInset.position.set(doorW / 2, doorH * 0.28, 0);

  // ลูกบิดประตูทองเหลืองทั้งสองฝั่ง
  const knobFront = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 12), goldMat);
  knobFront.position.set(doorW * 0.84, doorH * 0.46, 0.11);
  const knobBack = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 12), goldMat);
  knobBack.position.set(doorW * 0.84, doorH * 0.46, -0.11);

  hingePivot.add(panel, topInset, botInset, knobFront, knobBack);
  buildingGroup.add(hingePivot);

  const cosR = Math.cos(buildingRotY);
  const sinR = Math.sin(buildingRotY);
  const worldDoorX = buildingWx + localX * cosR + localZ * sinR;
  const worldDoorZ = buildingWz - localX * sinR + localZ * cosR;
  const isRotated90 = Math.abs(sinR) > 0.7;

  const collider = registerBoxCollider(
    worldColliders,
    worldDoorX,
    worldDoorZ,
    isRotated90 ? 0.45 : doorW,
    isRotated90 ? doorW : 0.45,
    buildingWy + localY + doorH,
    false,
    buildingWy + localY - 0.1
  );

  const isInitiallyOpen = !!doorSpec.initialOpen;
  collider.disabled = isInitiallyOpen;

  const doorObj = {
    id: doorSpec.id || `door_${Math.round(worldDoorX)}_${Math.round(worldDoorZ)}_${Math.round(localY)}`,
    title: doorSpec.title || 'ประตูไม้',
    roomId: doorSpec.roomId || null,
    roomPrice: doorSpec.roomPrice || 50,
    wx: worldDoorX,
    wy: buildingWy + localY,
    wz: worldDoorZ,
    hingePivot,
    collider,
    isOpen: isInitiallyOpen,
    currentAngle: isInitiallyOpen ? -Math.PI * 0.62 : 0,
    targetAngle: isInitiallyOpen ? -Math.PI * 0.62 : 0,
    autoOpen: !!doorSpec.autoOpen
  };
  hingePivot.rotation.y = doorObj.currentAngle;

  hingePivot.traverse((m) => {
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
      m.userData.isDoor = true;
      m.userData.doorRef = doorObj;
    }
  });

  if (interactiveDoors) interactiveDoors.push(doorObj);
  return doorObj;
}

// ==================== 2. สัตว์ป่าเคลื่อนไหวได้ ====================
export function createWildlifeMesh(type) {
  const g = new THREE.Group();
  const parts = {};

  if (type === 'rabbit') {
    const furMat = createAnimeMaterial({ color: 0xfff7ed, roughness: 0.6 });
    const earMat = createAnimeMaterial({ color: 0xfda4af, roughness: 0.5 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 14), furMat);
    body.scale.set(0.9, 0.85, 1.25);
    body.position.y = 0.24;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 14), furMat);
    head.position.set(0, 0.38, 0.24);
    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 10), furMat);
    tail.position.set(0, 0.26, -0.28);

    const earL = new THREE.Mesh(new THREE.CapsuleGeometry(0.032, 0.20, 6, 10), earMat);
    earL.position.set(-0.06, 0.20, 0);
    earL.rotation.x = -0.2;
    const earR = new THREE.Mesh(new THREE.CapsuleGeometry(0.032, 0.20, 6, 10), earMat);
    earR.position.set(0.06, 0.20, 0);
    earR.rotation.x = -0.2;
    head.add(earL, earR);

    g.add(body, head, tail);
    parts.body = body; parts.head = head; parts.earL = earL; parts.earR = earR;
  } else if (type === 'deer') {
    const coatMat = createAnimeMaterial({ color: 0xb45309, roughness: 0.6 });
    const bellyMat = createAnimeMaterial({ color: 0xfef3c7, roughness: 0.6 });
    const antlerMat = createAnimeMaterial({ color: 0x78350f, roughness: 0.7 });

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.78, 12, 16), coatMat);
    body.rotation.x = Math.PI / 2;
    body.position.y = 0.88;

    const neckPivot = new THREE.Group();
    neckPivot.position.set(0, 1.02, 0.45);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.55, 12), coatMat);
    neck.position.y = 0.22;
    neck.rotation.x = 0.35;
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.45, 12), coatMat);
    head.rotation.x = Math.PI / 2;
    head.position.set(0, 0.46, 0.18);
    [-1, 1].forEach(s => {
      const antler = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.42, 6), antlerMat);
      antler.position.set(s * 0.12, 0.58, 0.05);
      antler.rotation.z = -s * 0.45;
      neckPivot.add(antler);
    });
    neckPivot.add(neck, head);

    const legs = [];
    [[-0.18, 0.36], [0.18, 0.36], [-0.18, -0.36], [0.18, -0.36]].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.04, 0.82, 10), coatMat);
      leg.position.set(lx, 0.41, lz);
      g.add(leg);
      legs.push(leg);
    });
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.25, 8), bellyMat);
    tail.position.set(0, 0.95, -0.55);
    tail.rotation.x = -0.6;

    g.add(body, neckPivot, tail);
    parts.neckPivot = neckPivot; parts.legs = legs; parts.tail = tail;
  } else {
    const birdMat = createAnimeMaterial({ color: 0xf8fafc, roughness: 0.4 });
    const beakMat = createAnimeMaterial({ color: 0xf59e0b, roughness: 0.4 });
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.55, 10), birdMat);
    body.rotation.x = Math.PI / 2;
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 8), beakMat);
    beak.rotation.x = Math.PI / 2;
    beak.position.z = 0.32;

    const wingL = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.03, 0.24), birdMat);
    wingL.position.set(-0.32, 0, 0);
    const wingR = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.03, 0.24), birdMat);
    wingR.position.set(0.32, 0, 0);

    g.add(body, beak, wingL, wingR);
    parts.wingL = wingL; parts.wingR = wingR;
  }

  g.userData.animParts = parts;
  g.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
  return g;
}

// ==================== 3. โมเดลมอนสเตอร์ 3D และอนิเมชั่น ====================
export function createMonsterMesh(type) {
  const g = new THREE.Group();
  const parts = {};

  if (type === 'slime') {
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.82, 28, 24),
      new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.86 })
    );
    body.scale.set(1.18, 0.84, 1.18);
    body.position.y = 0.62;
    const core = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.32, 1),
      new THREE.MeshBasicMaterial({ color: 0xfef08a })
    );
    core.position.y = 0.65;
    [-1, 1].forEach(s => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 12), new THREE.MeshBasicMaterial({ color: 0x0f172a }));
      eye.position.set(s * 0.24, 0.22, 0.72);
      body.add(eye);
    });
    g.add(body, core);
    parts.body = body;
    parts.core = core;
  } else if (type === 'goblin') {
    const skinMat = createAnimeMaterial({ color: 0x4d7c0f, roughness: 0.55 });
    const armorMat = createAnimeMaterial({ color: 0x78350f, roughness: 0.7 });
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.28, 0.68, 16), armorMat);
    torso.position.y = 0.88;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 20), skinMat);
    head.position.y = 1.48;
    [-1, 1].forEach(s => {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.10, 0.42, 10), skinMat);
      ear.position.set(s * 0.42, 0.06, 0);
      ear.rotation.z = -s * 1.25;
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 10), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
      eye.position.set(s * 0.12, 0.04, 0.30);
      head.add(ear, eye);
    });
    const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.36, 8, 12), skinMat);
    armL.position.set(-0.42, 0.96, 0);
    const armR = new THREE.Group();
    armR.position.set(0.42, 1.05, 0);
    const armRMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.36, 8, 12), skinMat);
    armRMesh.position.y = -0.15;
    const club = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.18, 0.95, 10), armorMat);
    club.position.set(0, -0.32, 0.35);
    club.rotation.x = Math.PI / 2.4;
    armR.add(armRMesh, club);

    const legL = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.36, 8, 12), skinMat);
    legL.position.set(-0.16, 0.34, 0);
    const legR = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.36, 8, 12), skinMat);
    legR.position.set(0.16, 0.34, 0);

    g.add(torso, head, armL, armR, legL, legR);
    parts.torso = torso; parts.armL = armL; parts.armR = armR; parts.legL = legL; parts.legR = legR; parts.head = head;
  } else if (type === 'wolf') {
    const furMat = createAnimeMaterial({ color: 0x475569, roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 0.85, 12, 16), furMat);
    body.rotation.x = Math.PI / 2;
    body.position.y = 0.72;
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.65, 12), furMat);
    head.rotation.x = Math.PI / 2;
    head.position.set(0, 1.02, 0.68);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.55, 8), furMat);
    tail.rotation.x = -Math.PI / 3;
    tail.position.set(0, 0.82, -0.68);
    const legs = [];
    [[-0.22, 0.42], [0.22, 0.42], [-0.22, -0.42], [0.22, -0.42]].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.65, 10), furMat);
      leg.position.set(lx, 0.32, lz);
      g.add(leg);
      legs.push(leg);
    });
    g.add(body, head, tail);
    parts.body = body; parts.head = head; parts.legs = legs; parts.tail = tail;
  } else {
    const rockMat = createAnimeMaterial({ color: 0x7f1d1d, metalness: 0.35, roughness: 0.45 });
    const runeMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xf97316, emissiveIntensity: 0.65 });
    const torso = new THREE.Mesh(new THREE.DodecahedronGeometry(0.95, 0), rockMat);
    torso.position.y = 1.45;
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), runeMat);
    core.position.set(0, 1.45, 0.68);
    const head = new THREE.Mesh(new THREE.OctahedronGeometry(0.46, 0), runeMat);
    head.position.y = 2.55;
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.48, 1.25, 0.48), rockMat);
    armL.position.set(-1.18, 1.35, 0);
    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.48, 1.25, 0.48), rockMat);
    armR.position.set(1.18, 1.35, 0);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.85, 0.45), rockMat);
    legL.position.set(-0.45, 0.45, 0);
    const legR = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.85, 0.45), rockMat);
    legR.position.set(0.45, 0.45, 0);
    g.add(torso, core, head, armL, armR, legL, legR);
    parts.torso = torso; parts.armL = armL; parts.armR = armR; parts.legL = legL; parts.legR = legR; parts.head = head; parts.core = core;
  }

  g.userData.animParts = parts;
  g.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
  return g;
}

export function updateMonsterAnimation(mon, dt, elapsedTime, isMoving) {
  const p = mon.mesh.userData.animParts;
  if (!p) return;
  const t = elapsedTime * (isMoving ? 10.5 : 5.2) + (mon.animOffset || 0);

  if (mon.type === 'slime') {
    const bounce = Math.abs(Math.sin(t));
    p.body.scale.set(1.30 - bounce * 0.28, 0.68 + bounce * 0.48, 1.30 - bounce * 0.28);
    p.body.position.y = 0.52 + bounce * 0.65;
    p.core.rotation.y += dt * 5;
    p.core.rotation.x += dt * 3;
    p.core.position.y = p.body.position.y;
  } else if (mon.type === 'wolf') {
    const legAmp = isMoving ? 0.85 : 0.35;
    if (p.legs) {
      p.legs[0].rotation.x = Math.sin(t) * legAmp;
      p.legs[1].rotation.x = -Math.sin(t) * legAmp;
      p.legs[2].rotation.x = -Math.sin(t) * legAmp;
      p.legs[3].rotation.x = Math.sin(t) * legAmp;
    }
    if (p.body) p.body.position.y = 0.72 + Math.abs(Math.sin(t)) * 0.08;
    if (p.head) p.head.position.y = 1.02 + Math.sin(t * 2) * 0.06;
    if (p.tail) p.tail.rotation.z = Math.sin(t * 2.5) * 0.45;
  } else {
    const swing = isMoving ? Math.sin(t) * 0.82 : Math.sin(t) * 0.42;
    if (p.legL) p.legL.rotation.x = swing;
    if (p.legR) p.legR.rotation.x = -swing;
    if (p.armL) p.armL.rotation.x = -swing * 1.1;
    if (p.armR) p.armR.rotation.x = swing * 1.1 - (mon.atkCooldown > 1.0 ? 1.2 : 0.2);
    if (p.torso) p.torso.position.y = (mon.type === 'golem' ? 1.45 : 0.88) + Math.abs(Math.sin(t)) * 0.08;
    if (p.head) {
      p.head.rotation.y = Math.sin(t * 0.8) * 0.38;
      p.head.position.y = (mon.type === 'golem' ? 2.55 : 1.48) + Math.sin(t * 2) * 0.06;
    }
    if (p.core) {
      p.core.rotation.z += dt * 4;
      p.core.rotation.y += dt * 4;
    }
  }
}

export function updateWorldEnvironment(dt, elapsedTime, wildlifeList = [], farmingNodes = [], interactiveDoors = []) {
  for (let i = 0; i < animatedCampfires.length; i++) {
    const cf = animatedCampfires[i];
    if (cf.fireLight) {
      cf.fireLight.intensity = 2.0 + Math.sin(elapsedTime * 12 + i) * 0.35;
    }
    for (let j = 0; j < cf.mistPuffs.length; j++) {
      const puff = cf.mistPuffs[j];
      puff.phase += dt * puff.speed;
      if (puff.phase >= 1.0) puff.phase -= 1.0;

      const p = puff.phase;
      const swayX = Math.sin(elapsedTime * 4.2 + puff.swirlAngle + p * 4.5) * puff.swirlRadius * (0.4 + p * 1.0);
      const swayZ = Math.cos(elapsedTime * 3.6 + puff.swirlAngle + p * 4.5) * puff.swirlRadius * (0.4 + p * 1.0);
      puff.sprite.position.set(swayX, 0.22 + p * 1.65, swayZ);

      const sc = puff.baseScale * Math.sin(p * Math.PI * 0.92) * (1.20 - p * 0.35);
      puff.sprite.scale.set(sc, sc * 1.32, sc);

      if (p < 0.28) {
        puff.sprite.material.color.setHex(0xfef08a);
      } else if (p < 0.65) {
        puff.sprite.material.color.setHex(0xf97316);
      } else {
        puff.sprite.material.color.setHex(0xea580c);
      }
      puff.sprite.material.opacity = Math.sin(p * Math.PI) * 0.82;
    }
  }

  for (let i = 0; i < animatedTownCrystals.length; i++) {
    const cr = animatedTownCrystals[i];
    cr.rotation.y += dt * 1.6;
    cr.position.y = cr.userData.baseY + Math.sin(elapsedTime * 2.5 + i) * 0.28;
  }

  // อัปเดตบานพับประตูทุกบานให้เปิด-ปิดอย่างนุ่มนวล
  for (let i = 0; i < interactiveDoors.length; i++) {
    const d = interactiveDoors[i];
    d.currentAngle = THREE.MathUtils.lerp(d.currentAngle, d.targetAngle, Math.min(1, dt * 9));
    d.hingePivot.rotation.y = d.currentAngle;
  }

  for (let i = 0; i < wildlifeList.length; i++) {
    const w = wildlifeList[i];
    w.angle += dt * w.speed;
    const wx = w.centerX + Math.cos(w.angle) * w.radius;
    const wz = w.centerZ + Math.sin(w.angle) * w.radius;
    const dx = wx - w.mesh.position.x;
    const dz = wz - w.mesh.position.z;
    if (Math.hypot(dx, dz) > 0.001) {
      w.mesh.rotation.y = Math.atan2(dx, dz);
    }

    const p = w.mesh.userData.animParts;
    const t = elapsedTime * 8.5 + i;

    if (w.type === 'bird') {
      w.mesh.position.set(wx, w.baseY + Math.sin(elapsedTime * 2 + i) * 1.2, wz);
      if (p.wingL) p.wingL.rotation.z = Math.sin(t * 1.8) * 0.65;
      if (p.wingR) p.wingR.rotation.z = -Math.sin(t * 1.8) * 0.65;
    } else if (w.type === 'rabbit') {
      const hop = Math.abs(Math.sin(t));
      w.mesh.position.set(wx, w.baseY + hop * 0.42, wz);
      if (p.earL) p.earL.rotation.x = -0.2 + Math.sin(t * 2) * 0.25;
      if (p.earR) p.earR.rotation.x = -0.2 + Math.cos(t * 2) * 0.25;
    } else if (w.type === 'deer') {
      w.mesh.position.set(wx, w.baseY, wz);
      if (p.legs) {
        p.legs[0].rotation.x = Math.sin(t * 0.7) * 0.5;
        p.legs[1].rotation.x = -Math.sin(t * 0.7) * 0.5;
        p.legs[2].rotation.x = -Math.sin(t * 0.7) * 0.5;
        p.legs[3].rotation.x = Math.sin(t * 0.7) * 0.5;
      }
      if (p.neckPivot) {
        p.neckPivot.rotation.x = Math.sin(elapsedTime * 1.5 + i) * 0.35;
      }
    }
  }

  for (let i = 0; i < farmingNodes.length; i++) {
    const n = farmingNodes[i];
    if (!n.active || !n.mesh.visible) continue;
    if (n.matId === 'golden_wheat' || n.matId === 'moon_herb') {
      n.mesh.rotation.z = Math.sin(elapsedTime * 2.8 + i) * 0.08;
    } else if (n.matId === 'mithril_ore') {
      n.mesh.rotation.y += dt * 0.4;
    }
  }
}

export function createFarmingNodeMesh(nodeType) {
  const g = new THREE.Group();
  if (nodeType === 'mithril_ore') {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.95, 0), createAnimeMaterial({ color: 0x64748b, roughness: 0.7 }));
    rock.position.y = 0.45;
    g.add(rock);
    for (let i = 0; i < 4; i++) {
      const crystal = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.35, 0),
        new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 0.55 })
      );
      crystal.position.set((i - 1.5) * 0.35, 0.85 + (i % 2) * 0.2, (i % 2 - 0.5) * 0.4);
      crystal.rotation.set(i * 0.4, i * 0.8, 0);
      g.add(crystal);
    }
  } else if (nodeType === 'moon_herb') {
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2;
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.85, 8), createAnimeMaterial({ color: 0x10b981 }));
      leaf.position.set(Math.cos(ang) * 0.35, 0.35, Math.sin(ang) * 0.35);
      leaf.rotation.z = -Math.cos(ang) * 0.45;
      leaf.rotation.x = Math.sin(ang) * 0.45;
      g.add(leaf);
    }
    const flower = new THREE.Mesh(
      new THREE.SphereGeometry(0.26, 14, 14),
      new THREE.MeshStandardMaterial({ color: 0xa7f3d0, emissive: 0x34d399, emissiveIntensity: 0.55 })
    );
    flower.position.y = 0.72;
    g.add(flower);
  } else if (nodeType === 'golden_wheat') {
    for (let x = -0.6; x <= 0.6; x += 0.4) {
      for (let z = -0.6; z <= 0.6; z += 0.4) {
        const stalk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.03, 1.15, 6),
          createAnimeMaterial({ color: 0xfacc15 })
        );
        stalk.position.set(x, 0.55, z);
        g.add(stalk);
      }
    }
  } else {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.48, 2.2, 10), createAnimeMaterial({ color: 0x78350f }));
    trunk.position.y = 1.1;
    const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(1.45, 1), createAnimeMaterial({ color: 0x15803d }));
    crown.position.y = 2.7;
    g.add(trunk, crown);
  }
  g.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
  return g;
}

// ==================== 4. สร้างผังมหานคร ถนนหิน Cobblestone เรียบเนียน และการจัดวางที่เป็นระเบียบ ====================
export function buildRealisticGrandTown(town, worldNoise, worldGroup, worldColliders, streetLampMaterials, streetLampGlowDiscs = [], interactiveSeats = []) {
  const tg = new THREE.Group();
  const baseY = worldNoise.getHeight(town.x, town.z);
  tg.position.set(town.x, baseY, town.z);

  const stoneWallMat = createAnimeMaterial({ color: town.style === 'volcano' ? 0x57534e : town.style === 'frost' ? 0xbae6fd : 0xcbd5e1, roughness: 0.68 });
  const cobbleRoadMat = createAnimeMaterial({
    color: 0xffffff,
    map: getCobblestoneRoadTexture(),
    roughness: 0.82
  });
  const plazaTileMat = createAnimeMaterial({
    color: 0xf5f5f4,
    map: getPlazaTileTexture(),
    roughness: 0.75
  });
  const ringRoadMat = createAnimeMaterial({
    color: 0xa8a29e,
    map: getPlazaTileTexture(),
    roughness: 0.80
  });
  const curbMat = createAnimeMaterial({ color: 0xd6d3d1, roughness: 0.72 });
  const timberMat = createAnimeMaterial({ color: 0x5c2d0c, roughness: 0.78 });
  const roofMat = createAnimeMaterial({ color: town.roofColor, roughness: 0.5 });
  const goldMat = createAnimeMaterial({ color: 0xfbbf24, metalness: 0.78, roughness: 0.25 });
  const windowLampMat = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    emissive: 0xf59e0b,
    emissiveIntensity: 1.8,
    roughness: 0.15
  });
  streetLampMaterials.push(windowLampMat);

  const R = town.radius;

  // 1. ถนนหิน Cobblestone เรียบแนบไปกับพื้นเมือง (ไม่เป็นแท่งสีน้ำเงินนูนสูงแปลกๆ!) พร้อมขอบทางเท้าหินเตี้ยๆ
  const roadNS = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.04, R * 1.96), cobbleRoadMat);
  roadNS.position.y = 0.02;
  roadNS.receiveShadow = true;

  const roadEW = new THREE.Mesh(new THREE.BoxGeometry(R * 1.96, 0.04, 8.2), cobbleRoadMat);
  roadEW.position.y = 0.022;
  roadEW.receiveShadow = true;

  // ขอบทางเท้าหิน (Sidewalk Curbs) เรียบหรูไม่เกะกะการเดิน
  [-4.25, 4.25].forEach(offset => {
    const curbNS = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.06, R * 1.94), curbMat);
    curbNS.position.set(offset, 0.03, 0);
    const curbEW = new THREE.Mesh(new THREE.BoxGeometry(R * 1.94, 0.06, 0.35), curbMat);
    curbEW.position.set(0, 0.03, offset);
    tg.add(curbNS, curbEW);
  });

  const innerRingRoad = new THREE.Mesh(new THREE.RingGeometry(24.5, 31.5, 72), ringRoadMat);
  innerRingRoad.rotation.x = -Math.PI / 2;
  innerRingRoad.position.y = 0.028;
  innerRingRoad.receiveShadow = true;

  const outerRingRoad = new THREE.Mesh(new THREE.RingGeometry(46.5, 53.5, 72), ringRoadMat);
  outerRingRoad.rotation.x = -Math.PI / 2;
  outerRingRoad.position.y = 0.028;
  outerRingRoad.receiveShadow = true;

  const centralPlaza = new THREE.Mesh(new THREE.CylinderGeometry(14.5, 14.8, 0.08, 48), plazaTileMat);
  centralPlaza.position.y = 0.04;
  centralPlaza.receiveShadow = true;

  const plazaRim = new THREE.Mesh(new THREE.TorusGeometry(14.6, 0.14, 10, 48), curbMat);
  plazaRim.rotation.x = Math.PI / 2;
  plazaRim.position.y = 0.07;

  tg.add(roadNS, roadEW, innerRingRoad, outerRingRoad, centralPlaza, plazaRim);

  // 2. แลนด์มาร์กใจกลางจัตุรัส
  if (town.style === 'elven') {
    const treeTrunk = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 4.0, 16, 16), timberMat);
    treeTrunk.position.y = 8.0;
    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(11.5, 24, 20),
      createAnimeMaterial({ color: 0x10b981, emissive: 0x059669, emissiveIntensity: 0.22 })
    );
    canopy.position.y = 17.5;
    canopy.scale.y = 0.65;
    tg.add(treeTrunk, canopy);
    worldColliders.push({ x: town.x, z: town.z, radius: 3.8, topY: baseY + 16 });
  } else if (town.style === 'volcano') {
    const anvilBase = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.8, 1.2, 16), stoneWallMat);
    anvilBase.position.y = 0.6;
    const brazierFire = createVolumetricCampfire(1.6, false);
    brazierFire.position.y = 1.2;
    tg.add(anvilBase, brazierFire);
    worldColliders.push({ x: town.x, z: town.z, radius: 4.5, topY: baseY + 1.5, stepable: true });
  } else if (town.style === 'frost') {
    const spire = new THREE.Mesh(
      new THREE.ConeGeometry(3.2, 17, 8),
      createAnimeMaterial({ color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 0.35, roughness: 0.2 })
    );
    spire.position.y = 8.5;
    tg.add(spire);
    worldColliders.push({ x: town.x, z: town.z, radius: 3.2, topY: baseY + 17 });
  } else {
    const fountainBasin = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.6, 1.0, 28), stoneWallMat);
    fountainBasin.position.y = 0.5;
    const waterPool = new THREE.Mesh(
      new THREE.CylinderGeometry(3.8, 3.8, 0.85, 24),
      createAnimeMaterial({ color: 0x38bdf8, roughness: 0.2 })
    );
    waterPool.position.y = 0.52;
    const crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.35, 0),
      new THREE.MeshStandardMaterial({ color: town.themeColor, emissive: town.themeColor, emissiveIntensity: 0.85 })
    );
    crystal.position.y = 3.2;
    crystal.userData.baseY = 3.2;
    animatedTownCrystals.push(crystal);
    tg.add(fountainBasin, waterPool, crystal);
    worldColliders.push({ x: town.x, z: town.z, radius: 4.4, topY: baseY + 1.2, stepable: true });
  }

  // 3. กำแพงมหานครหินล้อมรอบ 8 ส่วน
  const wallSegments = [
    { x: -R * 0.54, z: R,  w: R * 0.76, d: 3.0 },
    { x: R * 0.54,  z: R,  w: R * 0.76, d: 3.0 },
    { x: -R * 0.54, z: -R, w: R * 0.76, d: 3.0 },
    { x: R * 0.54,  z: -R, w: R * 0.76, d: 3.0 },
    { x: R,  z: -R * 0.54, w: 3.0, d: R * 0.76 },
    { x: R,  z: R * 0.54,  w: 3.0, d: R * 0.76 },
    { x: -R, z: -R * 0.54, w: 3.0, d: R * 0.76 },
    { x: -R, z: R * 0.54,  w: 3.0, d: R * 0.76 }
  ];
  wallSegments.forEach(wc => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(wc.w, 8.2, wc.d), stoneWallMat);
    wall.position.set(wc.x, 4.1, wc.z);
    wall.castShadow = true; wall.receiveShadow = true;
    tg.add(wall);
    registerBoxCollider(worldColliders, town.x + wc.x, town.z + wc.z, wc.w, wc.d, baseY + 8.2, false);
  });

  [[-R, -R], [R, -R], [-R, R], [R, R]].forEach(([tx, tz]) => {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(4.0, 4.5, 12.5, 18), stoneWallMat);
    tower.position.set(tx, 6.25, tz);
    const tRoof = new THREE.Mesh(new THREE.ConeGeometry(4.8, 4.5, 18), roofMat);
    tRoof.position.set(tx, 14.7, tz);
    tower.castShadow = true; tRoof.castShadow = true;
    tg.add(tower, tRoof);
    worldColliders.push({ x: town.x + tx, z: town.z + tz, radius: 4.5, topY: baseY + 12.5 });
  });

  // 4. อาคารบ้านเรือนจัดวางอย่างเป็นระเบียบตามบล็อกถนน (ไม่ทับถนนและไม่มีกองไฟวางเกะกะมั่วซั่ว!)
  const neatDistrictHouses = [
    { x: -17, z: -17, w: 8.5, h: 6.4, d: 7.5, color: 0xfef3c7, rotY: 0 },
    { x: 17,  z: -17, w: 8.5, h: 6.4, d: 7.5, color: 0xffedd5, rotY: 0 },
    { x: -17, z: 17,  w: 8.5, h: 6.0, d: 7.5, color: 0xf1f5f9, rotY: Math.PI },
    { x: 17,  z: 17,  w: 8.5, h: 6.0, d: 7.5, color: 0xfce7f3, rotY: Math.PI },
    { x: -16, z: -38, w: 8.5, h: 7.6, d: 7.5, color: 0xe2e8f0, rotY: Math.PI / 2 },
    { x: 16,  z: -38, w: 8.5, h: 7.6, d: 7.5, color: 0xe2e8f0, rotY: -Math.PI / 2 },
    { x: -16, z: 38,  w: 8.0, h: 5.8, d: 7.0, color: 0xffedd5, rotY: Math.PI / 2 },
    { x: 16,  z: 38,  w: 8.0, h: 5.8, d: 7.0, color: 0xdcfce7, rotY: -Math.PI / 2 },
    { x: -42, z: -42, w: 9.0, h: 6.5, d: 8.0, color: 0xf8fafc, rotY: 0 },
    { x: 42,  z: -42, w: 9.0, h: 6.5, d: 8.0, color: 0xfef9c3, rotY: 0 },
    { x: -42, z: 42,  w: 9.0, h: 6.2, d: 8.0, color: 0xe0f2fe, rotY: Math.PI },
    { x: 42,  z: 42,  w: 9.0, h: 6.2, d: 8.0, color: 0xfce7f3, rotY: Math.PI }
  ];

  neatDistrictHouses.forEach((b) => {
    const bGroup = new THREE.Group();
    bGroup.position.set(b.x, 0, b.z);
    bGroup.rotation.y = b.rotY || 0;

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(b.w, b.h, b.d),
      createAnimeMaterial({ color: b.color, roughness: 0.65 })
    );
    body.position.y = b.h / 2;
    body.castShadow = true; body.receiveShadow = true;

    const beamH = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.16, 0.24, b.d + 0.16), timberMat);
    beamH.position.y = b.h * 0.52;

    const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.5, 0.18), timberMat);
    doorFrame.position.set(0, 1.25, b.d / 2 + 0.04);

    const roof = new THREE.Mesh(
      town.style === 'frost'
        ? new THREE.SphereGeometry(Math.max(b.w, b.d) * 0.62, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2)
        : new THREE.ConeGeometry(Math.max(b.w, b.d) * 0.78, 3.8, 4),
      roofMat
    );
    roof.position.y = town.style === 'frost' ? b.h : b.h + 1.9;
    if (town.style !== 'frost') roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;

    [-1, 1].forEach(side => {
      const winFront = createFramedWindowMesh(1.25, 1.35, windowLampMat);
      winFront.position.set(side * (b.w * 0.28), b.h * 0.62, b.d / 2 + 0.04);
      const winBack = createFramedWindowMesh(1.25, 1.35, windowLampMat);
      winBack.position.set(side * (b.w * 0.28), b.h * 0.62, -b.d / 2 - 0.04);
      winBack.rotation.y = Math.PI;
      bGroup.add(winFront, winBack);
    });

    bGroup.add(body, beamH, doorFrame, roof);
    tg.add(bGroup);
    registerBoxCollider(worldColliders, town.x + b.x, town.z + b.z, b.w + 0.3, b.d + 0.3, baseY + b.h, false);
  });

  // 5. ชุดโต๊ะเก้าอี้พักผ่อนกลางแจ้งรอบลานน้ำพุ (คลิกเพื่อนั่งพักชมเมืองได้ทุกตัว!)
  [
    { tx: -9.5, tz: -9.5, rot: Math.PI / 4 },
    { tx: 9.5,  tz: -9.5, rot: -Math.PI / 4 },
    { tx: -9.5, tz: 9.5,  rot: -Math.PI / 4 },
    { tx: 9.5,  tz: 9.5,  rot: Math.PI / 4 }
  ].forEach((pt) => {
    const patioSet = createDetailedTableAndChairs(
      town.x + pt.tx,
      baseY,
      town.z + pt.tz,
      pt.rot,
      interactiveSeats,
      worldColliders,
      { isRound: true, cushionColor: 0xd97706, locationName: 'เก้าอี้ลานจัตุรัสกลางเมือง' }
    );
    worldGroup.add(patioSet);
  });

  // 6. แผงลอยตลาดในย่านการค้า (จัดเรียงเป็นระเบียบขนานสองฝั่งถนนตะวันออก)
  const stallColors = [0xdc2626, 0x059669, 0x2563eb, 0xd97706];
  [[-7.5, 56], [7.5, 56], [-7.5, 66], [7.5, 66]].forEach(([sz, sx], idx) => {
    const stallG = new THREE.Group();
    stallG.position.set(sx, 0, sz);
    const table = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.9, 1.6), timberMat);
    table.position.y = 0.45;
    const canopy = new THREE.Mesh(
      new THREE.BoxGeometry(3.5, 0.22, 2.0),
      createAnimeMaterial({ color: stallColors[idx % stallColors.length], roughness: 0.55 })
    );
    canopy.position.y = 2.35;
    canopy.rotation.x = sz < 0 ? 0.14 : -0.14;
    stallG.add(table, canopy);
    tg.add(stallG);
    registerBoxCollider(worldColliders, town.x + sx, town.z + sz, 3.4, 1.8, baseY + 2.4, false);
  });

  // 7. สวนน้ำพุในย่านขุนนางทางทิศเหนือ
  const nobleFountain = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 3.2, 0.85, 24), goldMat);
  nobleFountain.position.set(0, 0.42, -39);
  tg.add(nobleFountain);
  worldColliders.push({ x: town.x, z: town.z - 39, radius: 3.2, topY: baseY + 1.0, stepable: true });

  // 8. โคมไฟถนนเหล็กดัดแฟนตาซีรอบจัตุรัส (ส่องแสงนุ่มนวลสวยงาม)
  [
    [-6.2, 13.5, 0], [6.2, 13.5, Math.PI],
    [-6.2, -13.5, 0], [6.2, -13.5, Math.PI],
    [13.5, 6.2, -Math.PI / 2], [13.5, -6.2, -Math.PI / 2],
    [-13.5, 6.2, Math.PI / 2], [-13.5, -6.2, Math.PI / 2]
  ].forEach(([lx, lz, rot]) => {
    const lamp = createOrnateStreetLamp(lx, 0, lz, rot, streetLampMaterials, streetLampGlowDiscs);
    tg.add(lamp);
  });

  worldGroup.add(tg);
}
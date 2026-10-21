import * as THREE from 'three';
import { createAnimeMaterial } from './shaders.js';

export const WEAPONS = {
  sword_iron:   { id: 'sword_iron',   name: 'ดาบอัศวินเงิน',         type: 'sword',  atk: 14, matk: 0,  price: 0,   color: 0xe2e8f0 },
  sword_flame:  { id: 'sword_flame',  name: 'ดาบเพลิงราชันย์',       type: 'sword',  atk: 38, matk: 12, price: 300, color: 0xf97316 },
  staff_oak:    { id: 'staff_oak',    name: 'ไม้เท้าคริสตัลฟ้า',      type: 'staff',  atk: 2,  matk: 20, price: 0,   color: 0x38bdf8 },
  staff_void:   { id: 'staff_void',   name: 'คทาจักรพรรดิดารา',      type: 'staff',  atk: 8,  matk: 48, price: 350, color: 0xc084fc },
  bow_hunter:   { id: 'bow_hunter',   name: 'คันธนูพรานป่าเอลฟ์',     type: 'bow',    atk: 17, matk: 0,  price: 0,   color: 0x4ade80 },
  bow_wind:     { id: 'bow_wind',     name: 'ธนูพญาวายุสวรรค์',      type: 'bow',    atk: 42, matk: 10, price: 320, color: 0x2dd4bf },
  shield_knight:{ id: 'shield_knight',name: 'โล่และค้อนศึกพาราดิน',   type: 'shield', atk: 12, matk: 0,  price: 0,   color: 0x60a5fa },
  shield_aegis: { id: 'shield_aegis', name: 'โล่ทองคำเอจิสศักดิ์สิทธิ์',type: 'shield', atk: 30, matk: 14, price: 340, color: 0xfacc15 },
  tome_holy:    { id: 'tome_holy',    name: 'คัมภีร์แสงอรุณ',         type: 'tome',   atk: 4,  matk: 18, price: 0,   color: 0xfde047 },
  tome_seraph:  { id: 'tome_seraph',  name: 'คัมภีร์เทวทูตเซราฟิม',   type: 'tome',   atk: 12, matk: 42, price: 310, color: 0x34d399 }
};

// ==================== CACHE TEXTURE & GEOMETRY (ลื่นไหล 60FPS) ====================
const faceTextureCache = new Map();
let cachedPlaidTex = null;

function ensureBrightSkinHex(hexStr) {
  const col = new THREE.Color(hexStr || '#ffe9dc');
  const luma = col.r * 0.299 + col.g * 0.587 + col.b * 0.114;
  if (luma < 0.25) return '#ffe9dc';
  return '#' + col.getHexString();
}

function getRedPlaidTexture() {
  if (cachedPlaidTex) return cachedPlaidTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#991b1b';
  ctx.fillRect(0, 0, 256, 256);

  ctx.fillStyle = 'rgba(15, 23, 42, 0.42)';
  for (let i = 0; i < 256; i += 32) {
    ctx.fillRect(i, 0, 10, 256);
    ctx.fillRect(0, i, 256, 10);
  }
  ctx.strokeStyle = 'rgba(254, 240, 138, 0.6)';
  ctx.lineWidth = 2;
  for (let i = 16; i < 256; i += 32) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke();
  }
  cachedPlaidTex = new THREE.CanvasTexture(c);
  cachedPlaidTex.wrapS = THREE.RepeatWrapping;
  cachedPlaidTex.wrapT = THREE.RepeatWrapping;
  cachedPlaidTex.repeat.set(3, 1);
  return cachedPlaidTex;
}

// 1. วาดใบหน้าอนิเมะสีสันสดใส ขนตาคมชัด แววตาเข้มมีมิติ (ไม่ซีดจางเวลาโดนแสง)
function getCachedAnimeFaceTexture(c, isBlinking = false) {
  const isFemale = c.gender === 'female' || String(c.bodyType).startsWith('female');
  const safeSkin = ensureBrightSkinHex(c.skinColor);
  const key = [
    'V2',
    isFemale ? 'F' : 'M',
    safeSkin,
    c.eyeColor || '#f59e0b',
    c.eyeColorRight || c.eyeColor || '#f59e0b',
    Number(c.eyeSize || 1.0).toFixed(2),
    c.eyeStyle || 'normal',
    c.expression || 'smile',
    c.hairColor || '#1c1917',
    isBlinking ? '1' : '0'
  ].join('|');

  if (faceTextureCache.has(key)) {
    return faceTextureCache.get(key);
  }

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = safeSkin;
  ctx.fillRect(0, 0, 512, 512);

  // แก้มชมพูระเรื่อชัดเจนขึ้น
  const blushAlpha = isFemale ? 0.45 : 0.22;
  const drawBlush = (bx, by) => {
    const g = ctx.createRadialGradient(bx, by, 3, bx, by, 32);
    g.addColorStop(0, `rgba(244, 63, 94, ${blushAlpha})`);
    g.addColorStop(1, 'rgba(244, 63, 94, 0.0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(bx, by, 32, 0, Math.PI * 2);
    ctx.fill();
  };
  drawBlush(204, 288);
  drawBlush(308, 288);

  const eyeScale = (Number(c.eyeSize) || 1.0) * (isFemale ? 1.05 : 0.94);
  const isFierce = !isFemale || c.eyeStyle === 'fierce' || c.expression === 'determined';

  const drawAnimeEye = (cx, cy, isLeft) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(eyeScale * 0.85, eyeScale * (isFemale ? 1.08 : 0.90));

    const baseIris = isLeft ? (c.eyeColor || '#f59e0b') : (c.eyeColorRight || c.eyeColor || '#f59e0b');

    if (isBlinking) {
      ctx.strokeStyle = '#090d16';
      ctx.lineWidth = 8.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, 4, 22, Math.PI * 0.10, Math.PI * 0.90);
      ctx.stroke();
      ctx.restore();
      return;
    }

    // ตาขาวพร้อมขอบเงาอ่อนๆ ไม่ให้กลืนกับสีผิว
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(0, 2, 23, isFemale ? 21 : 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2.0;
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.35)';
    ctx.stroke();

    // ม่านตาสีสดเข้ม มีขอบม่านตาชัดเจน
    const irisH = isFemale ? 19.5 : 15;
    const irisGrad = ctx.createLinearGradient(0, -irisH, 0, irisH);
    irisGrad.addColorStop(0.0, '#020617');
    irisGrad.addColorStop(0.28, baseIris);
    irisGrad.addColorStop(0.75, baseIris);
    irisGrad.addColorStop(1.0, '#fef08a');
    ctx.fillStyle = irisGrad;
    ctx.beginPath();
    ctx.ellipse(0, 2, 16.5, irisH, 0, 0, Math.PI * 2);
    ctx.fill();

    // ขอบวงม่านตาเข้มคมชัด
    ctx.lineWidth = 2.8;
    ctx.strokeStyle = '#090d16';
    ctx.stroke();

    // รูม่านตาดำสนิท
    ctx.fillStyle = '#020617';
    ctx.beginPath();
    ctx.ellipse(0, 2, 7.8, isFemale ? 9.5 : 7.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // ไฮไลท์แววตาขาวคมชัด
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(-6.5, -6.5, 6.5, 7.5, -0.15, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(6.5, 6.5, 3.8, 0, Math.PI * 2); ctx.fill();

    // เส้นชั้นตาบนเข้มชัด
    ctx.strokeStyle = 'rgba(69, 26, 3, 0.75)';
    ctx.lineWidth = 3.0;
    ctx.beginPath();
    ctx.arc(0, -4, 23, Math.PI * 1.12, Math.PI * 1.88);
    ctx.stroke();

    // ขอบขนตาบนดำหนาคมกริบ
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = isFemale ? 9.5 : 7.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 3, 22, Math.PI * 1.04, Math.PI * 1.96);
    ctx.stroke();

    // ขนตาล่างบางๆ ช่วยให้ตาดูคมขึ้น
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.65)';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(0, 5, 20, Math.PI * 0.22, Math.PI * 0.78);
    ctx.stroke();

    // คิ้วเข้มชัด
    ctx.strokeStyle = c.hairColor || '#090d16';
    ctx.lineWidth = isFemale ? 5.8 : 7.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (isFierce) {
      ctx.moveTo(isLeft ? -21 : -19, isLeft ? -27 : -20);
      ctx.lineTo(isLeft ? 19 : 21, isLeft ? -20 : -27);
    } else {
      ctx.arc(0, -19, 23, Math.PI * 1.14, Math.PI * 1.86);
    }
    ctx.stroke();

    ctx.restore();
  };

  drawAnimeEye(216, 250, true);
  drawAnimeEye(296, 250, false);

  // เงาจมูกชัดขึ้น
  ctx.fillStyle = 'rgba(124, 45, 18, 0.58)';
  ctx.beginPath();
  ctx.ellipse(256, 279, 2.8, 4.8, 0, 0, Math.PI * 2);
  ctx.fill();

  // ริมฝีปากและรอยยิ้มสีเข้มคมชัด
  ctx.strokeStyle = isFemale ? '#9f1239' : '#451a03';
  ctx.fillStyle = '#f43f5e';
  ctx.lineWidth = 4.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (c.expression === 'smile') {
    ctx.moveTo(242, 304);
    ctx.quadraticCurveTo(256, 315, 270, 304);
    ctx.stroke();
  } else if (c.expression === 'cheerful') {
    ctx.arc(256, 303, 12, 0, Math.PI);
    ctx.fill();
    ctx.stroke();
  } else if (c.expression === 'determined') {
    ctx.moveTo(243, 309);
    ctx.quadraticCurveTo(256, 303, 269, 309);
    ctx.stroke();
  } else {
    ctx.moveTo(244, 306);
    ctx.quadraticCurveTo(256, 312, 269, 304);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  if (faceTextureCache.size > 160) {
    const firstKey = faceTextureCache.keys().next().value;
    faceTextureCache.delete(firstKey);
  }
  faceTextureCache.set(key, tex);
  return tex;
}

// 2. ปั้นโครงหน้าทรงกลมมนสไตล์อนิเมะ (ตัดการบีบคางแหลมออก)
function createSmoothAnimeHeadGeometry(jawTaper = 0.72, isFemale = true) {
  const geo = new THREE.SphereGeometry(0.265, 32, 28);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    // คงรูปทรงกลมมนสมส่วน ปรับแก้มให้กลมละมุนขึ้นเล็กน้อย
    x *= 0.96;
    y *= 1.0;
    z *= 0.96;
    pos.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  return geo;
}

// 2.5 กะโหลกผมฐานชั้นในคลุมทั้งหัวและท้ายทอย พร้อมคว้านช่องใบหน้าด้านหน้าออกอย่างนุ่มนวล
function createOpenFaceHairCapGeometry(jawTaper = 0.72, isFemale = true) {
  const geo = new THREE.SphereGeometry(0.278, 40, 32);
  const pos = geo.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    const theta = Math.atan2(x, -z); // 0 = ด้านหลัง, ±PI = ด้านหน้า
    const absTheta = Math.abs(theta);

    // เพิ่มวอลลุ่มช่วงกระหม่อมและด้านหลังหัวให้ทุยสวยมีมิติ
    if (y > 0) {
      y *= 1.05;
      x *= 1.02;
    }
    if (z < 0) {
      const backBulge = Math.sin(THREE.MathUtils.clamp((y + 0.25) / 0.52, 0, 1) * Math.PI);
      z -= backBulge * 0.032;
      x *= 1.0 + backBulge * 0.04;
    }

    // ลอนเส้นผมนูนละเอียดรอบศีรษะ
    const strandGroove = Math.cos(theta * 14.0) * 0.005 * (1.0 - Math.abs(y) / 0.30);
    const rad = Math.hypot(x, z);
    if (rad > 0.001) {
      x += (x / rad) * strandGroove;
      z += (z / rad) * strandGroove;
    }

    // ตัด/คว้านส่วนใบหน้าด้านหน้าออก (+Z) เป็นซุ้มโค้งรับหน้าผากและจอนข้างแก้ม
    if (z > -0.02 && y < 0.165) {
      const archY = 0.155 - Math.pow(Math.abs(x) / 0.22, 1.8) * 0.18;
      if (y < archY && Math.abs(x) < 0.215) {
        const faceMask = (1.0 - THREE.MathUtils.smoothstep(Math.abs(x), 0.13, 0.215)) *
                         (1.0 - THREE.MathUtils.smoothstep(y, archY - 0.08, archY));
        // ดันส่วนที่ทับใบหน้าเข้าไปด้านในกะโหลกเพื่อให้ขอบผมด้านหน้าดูหนาและเปิดหน้าชัดเจน
        z = THREE.MathUtils.lerp(z, -0.04, faceMask);
        x *= THREE.MathUtils.lerp(1.0, 0.72, faceMask);
      }
    }

    // โอบรับต้นคอและท้ายทอยด้านล่าง
    if (y < -0.16) {
      const neckT = THREE.MathUtils.smoothstep(y, -0.278, -0.16);
      x *= THREE.MathUtils.lerp(0.68, 1.0, neckT);
      z *= THREE.MathUtils.lerp(0.74, 1.0, neckT);
      y = Math.max(y, -0.24);
    }

    pos.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  return geo;
}
// 2.6 สร้างเลเยอร์ผม 3D แบบคลุมศีรษะแล้วตัดด้านหน้าออก พร้อมความหนาและซอยปลายเลเยอร์ (ไม่แบนเป็นกระดาษ)
function createLayeredHairShellGeometry(opts = {}) {
  const {
    baseRadius = 0.282,
    length = 0.55,
    thickness = 0.046,
    flare = 0.10,
    backFlow = 0.08,
    sideWrapAngle = Math.PI * 0.72, // มุมโอบมาถึงข้างแก้ม/ขมับ (เว้นใบหน้าด้านหน้า)
    lowerWrapAngle = Math.PI * 0.56,
    tuftCount = 11,
    tipNotch = 0.16,
    sideCascade = 0.22,
    phaseShift = 0.0
  } = opts;

  const uSegs = 48;
  const vSegs = 26;
  const ringCols = uSegs + 1;
  const ringRows = vSegs + 1;

  const positions = [];
  const indices = [];

  // สร้างพื้นผิว 2 ด้าน (Outer เปลือกนอกนูนเป็นลอนผม + Inner เปลือกในโอบหัว) เพื่อให้มีมิติความหนา 3D จริงทุกมุมมอง
  const sampleSurfacePoint = (uNorm, vNorm, isInner) => {
    const u = uNorm * 2.0 - 1.0; // -1 (ซ้ายหน้า) -> 0 (กลางหลัง) -> +1 (ขวาหน้า)
    const absU = Math.abs(u);

    // ช่วงบนกระหม่อมคลุมเต็มหัว แล้วค่อยๆ คว้านเปิดช่วงใบหน้าด้านหน้าออกเมื่อไล่ระดับลงมา
    const foreheadCut = THREE.MathUtils.smoothstep(vNorm, 0.08, 0.34);
    const lowerTaper = THREE.MathUtils.smoothstep(vNorm, 0.34, 1.0);
    const maxTheta = THREE.MathUtils.lerp(Math.PI * 0.96, sideWrapAngle, foreheadCut) -
                     lowerTaper * (sideWrapAngle - lowerWrapAngle);
    const theta = u * maxTheta; // 0 = หลังหัว (-Z), ±PI/2 = ข้างหัว (±X)

    // ลอนปอยผมและการซอยปลายแหลมเป็นซี่เลเยอร์ (V-Notched Layered Tips)
    const tuftWave = Math.cos(u * Math.PI * tuftCount + phaseShift);
    const lockProfile = 0.5 + 0.5 * tuftWave; // 1 = สันปอยผม, 0 = ร่องระหว่างปอย
    const edgeFade = 1.0 - Math.pow(absU, 3.0);

    // ซอยปลายผมให้เป็นแฉกเลเยอร์และไล่ระดับด้านข้างสั้นกว่าด้านหลังเล็กน้อย
    const notchShorten = (1.0 - Math.pow(lockProfile, 0.65)) * tipNotch * THREE.MathUtils.smoothstep(vNorm, 0.45, 1.0);
    const sideShorten = Math.pow(absU, 1.6) * sideCascade;
    const vEff = THREE.MathUtils.clamp(vNorm * (1.0 - notchShorten - sideShorten), 0.0, 1.0);

    let y, r, zOffset = 0;
    const domeSplit = 0.42;

    if (vEff <= domeSplit) {
      // ช่วงบน: โค้งโอบตามกะโหลกศีรษะจากกลางกระหม่อมลงมาถึงท้ายทอย
      const tDome = vEff / domeSplit;
      const phi = tDome * Math.PI * 0.68;
      y = Math.cos(phi) * baseRadius;
      r = Math.sin(phi) * baseRadius;
    } else {
      // ช่วงล่าง: ไหลลงมาจากท้ายทอย โค้งรับต้นคอแล้วสะบัดปลายออกเป็นทรง S-Curve
      const tLow = (vEff - domeSplit) / (1.0 - domeSplit);
      const phiEnd = Math.PI * 0.68;
      const yStart = Math.cos(phiEnd) * baseRadius;
      const rStart = Math.sin(phiEnd) * baseRadius;

      y = yStart - tLow * length;
      const neckCurveIn = -Math.sin(tLow * Math.PI) * 0.025;
      const tipFlareOut = Math.pow(tLow, 1.35) * flare * (0.65 + 0.35 * lockProfile);
      r = rStart + neckCurveIn + tipFlareOut;
      zOffset = -Math.pow(tLow, 1.15) * backFlow;
    }

    // ความหนา 3D ของเลเยอร์ผม (ป่องตรงกลางและเรียวคมที่ปลายผมกับขอบหน้า)
    const verticalBell = Math.sin(Math.pow(vNorm, 0.75) * Math.PI);
    const layerThick = thickness * verticalBell * (0.45 + 0.55 * lockProfile) * (0.25 + 0.75 * edgeFade);
    const finalR = isInner ? Math.max(0.02, r - layerThick * 0.25) : (r + layerThick * 0.85);

    const x = Math.sin(theta) * finalR;
    const z = -Math.cos(theta) * finalR + zOffset;
    return [x, y, z];
  };

  // 1) สร้างจุดยอดฝั่งด้านนอก (Outer Shell) และด้านใน (Inner Shell)
  for (let side = 0; side < 2; side++) {
    const isInner = side === 1;
    for (let iv = 0; iv <= vSegs; iv++) {
      const vNorm = iv / vSegs;
      for (let iu = 0; iu <= uSegs; iu++) {
        const uNorm = iu / uSegs;
        const [x, y, z] = sampleSurfacePoint(uNorm, vNorm, isInner);
        positions.push(x, y, z);
      }
    }
  }

  const innerOffset = ringCols * ringRows;

  // 2) เชื่อมหน้าสามเหลี่ยมฝั่ง Outer และ Inner
  for (let iv = 0; iv < vSegs; iv++) {
    for (let iu = 0; iu < uSegs; iu++) {
      const a = iv * ringCols + iu;
      const b = a + 1;
      const c = a + ringCols;
      const d = c + 1;
      // Outer
      indices.push(a, c, b, b, c, d);
      // Inner (กลับด้าน Normal)
      const ia = a + innerOffset;
      const ib = b + innerOffset;
      const ic = c + innerOffset;
      const id = d + innerOffset;
      indices.push(ia, ib, ic, ib, id, ic);
    }
  }

  // 3) เย็บขอบซ้าย-ขวา (ช่องที่ตัดใบหน้าด้านหน้า) และขอบปลายผมด้านล่างให้ปิดสนิทเป็นก้อน 3D
  for (let iv = 0; iv < vSegs; iv++) {
    const lOut1 = iv * ringCols;
    const lOut2 = (iv + 1) * ringCols;
    const lIn1 = lOut1 + innerOffset;
    const lIn2 = lOut2 + innerOffset;
    indices.push(lOut1, lIn1, lOut2, lOut2, lIn1, lIn2);

    const rOut1 = iv * ringCols + uSegs;
    const rOut2 = (iv + 1) * ringCols + uSegs;
    const rIn1 = rOut1 + innerOffset;
    const rIn2 = rOut2 + innerOffset;
    indices.push(rOut1, rOut2, rIn1, rOut2, rIn2, rIn1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}
// 3. ปั้นลำตัวช่วงบนและทรวงอกอนิเมะที่เป็นธรรมชาติ ไม่เป็นลูกกลม 2 ลูกแปะแยกชิ้น (แก้ปัญหาหน้าอกแปลกๆ!)
function createUpperTorsoGeometry(params) {
  const { isFemale, shoulderW, bustSize, bustCurve, waistW, torsoLen } = params;
  const radialSegs = 36;
  const heightSegs = 24;
  const geo = new THREE.CylinderGeometry(1, 1, torsoLen, radialSegs, heightSegs, false);
  const pos = geo.attributes.position;

  const clampedBust = THREE.MathUtils.clamp(Number(bustSize) || 0, 0, 0.16);
  const curveFactor = THREE.MathUtils.clamp(Number(bustCurve) || 1.0, 0.75, 1.30);

  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vy = pos.getY(i);
    const vz = pos.getZ(i);
    const t = (vy + torsoLen / 2) / torsoLen; // 0 = เอว, 1 = ไหล่/คอ
    const angle = Math.atan2(vz, vx);
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    let rx;
    if (t < 0.85) {
      const k = THREE.MathUtils.smoothstep(t, 0.0, 0.85);
      rx = THREE.MathUtils.lerp(waistW, shoulderW, k);
    } else {
      const k = THREE.MathUtils.smoothstep(t, 0.85, 1.0);
      rx = THREE.MathUtils.lerp(shoulderW, isFemale ? 0.080 : 0.096, k);
    }

    let rz = rx * (isFemale ? 0.66 : 0.72);
    let yOffset = 0;

    // ปั้นทรวดทรงหน้าอกอนิเมะให้ผสานเป็นเนื้อเดียวกับลำตัว (ทรงหยดน้ำคู่ละมุน ไม่เป็นลูกบอลกลมแข็ง)
    if (sinA > 0 && t > 0.34 && t < 0.82) {
      const u = (t - 0.34) / 0.48; // 0 = ใต้อก, 1 = เนินอกบนใกล้ไหปลาร้า
      // ทรงหยดน้ำ: อิ่มตัวช่วงล่าง-กลาง (u ~ 0.42) และลาดเนียนขึ้นไปหาไหปลาร้า
      const verticalProfile = Math.sin(u * Math.PI) * Math.pow(1.0 - u * 0.32, 0.65);

      if (isFemale && clampedBust > 0.005) {
        // เว้าช่วงร่องอกตรงกลางเล็กน้อย (cosA ≈ 0) และอิ่มออกด้านหน้าซ้าย-ขวาอย่างสมดุล
        const absX = Math.abs(cosA);
        const dualLobe = THREE.MathUtils.smoothstep(absX, 0.0, 0.38) * (1.0 - THREE.MathUtils.smoothstep(absX, 0.55, 0.92));
        const centerBridge = (1.0 - Math.exp(-absX * absX * 18.0) * 0.28);
        const forwardBulge = verticalProfile * (0.032 + clampedBust * 0.62) * Math.pow(sinA, 1.35) * (0.65 + 0.35 * dualLobe) * centerBridge;
        rz += forwardBulge;
        rx += verticalProfile * clampedBust * 0.14 * Math.pow(sinA, 1.2);
        yOffset += (curveFactor - 1.0) * 0.025 * verticalProfile * sinA;
      } else {
        // แผงอกชายแข็งแกร่งสมส่วน
        rz += verticalProfile * 0.035 * Math.pow(sinA, 1.4);
      }
    }

    // แผ่นหลังเรียบได้รูป (ไม่ให้มีก้อนนูนด้านหลังเด็ดขาด)
    if (sinA < 0) {
      rz *= 0.92;
    }

    const r = Math.hypot(vx, vz);
    if (r > 0.0001) {
      pos.setX(i, cosA * rx);
      pos.setZ(i, sinA * rz);
    }
    pos.setY(i, vy + torsoLen / 2 + yOffset);
  }
  geo.computeVertexNormals();
  return geo;
}

// 4. กระโปรงพลีทจีบรอบเอว
function createPleatedSkirtGeometry(waistW, hipW, length = 0.40, pleats = 20) {
  const rSegs = 56;
  const hSegs = 12;
  const geo = new THREE.CylinderGeometry(waistW * 1.04, hipW * 1.42, length, rSegs, hSegs, true);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const t = (length / 2 - y) / length;
    const ang = Math.atan2(z, x);
    const pleatWave = 1.0 + Math.sin(ang * pleats) * 0.042 * t;
    pos.setX(i, x * pleatWave);
    pos.setZ(i, z * 0.82 * pleatWave);
  }
  geo.computeVertexNormals();
  return geo;
}

// 4.5 ผ้าคลุมไหล่อนิเมะแบบแผ่นผ้าพลิ้วมีจีบ (แทนท่อทรงกระบอกแข็งทื่อในภาพ image_252360.png!)
function createDrapedCapeGeometry(capeLen = 1.0) {
  const h = 1.02 * capeLen;
  const geo = new THREE.PlaneGeometry(0.62, h, 18, 16);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    // t = 0 ที่คอปกด้านบน -> t = 1 ที่ชายผ้าคลุมด้านล่าง
    const t = (h / 2 - y) / h;
    const u = x / 0.31; // -1 .. 1
    // แคบรับช่วงไหล่ด้านบน และบานออกอย่างสง่างามที่ชายผ้าคลุมด้านล่าง
    const widthScale = THREE.MathUtils.lerp(0.52, 1.18, Math.pow(t, 0.85));
    const nx = x * widthScale;
    // โค้งโอบไหล่เล็กน้อยและมีคลื่นจีบผ้าพริ้วตามแนวตั้ง
    const shoulderArch = -Math.pow(u, 2) * 0.045 * (1.0 - t * 0.5);
    const pleatWave = Math.sin(u * Math.PI * 3.0) * 0.022 * t;
    const naturalDrape = -Math.sin(t * Math.PI * 0.5) * 0.06;
    pos.setXYZ(i, nx, y - h / 2, shoulderArch + pleatWave + naturalDrape);
  }
  geo.computeVertexNormals();
  return geo;
}

// 5. ปอยผม 3D ทรงหยดน้ำมีสันคม (ไม่แบนเป็นกระดาษและไม่กลมเป็นสายไฟ)
function createSculptableHairStrand(pointsArr, rStart, rEnd, mat, lenScale = 1.0, curveScale = 1.0) {
  const scaledPts = pointsArr.map((p, idx) => {
    const ratio = idx / Math.max(1, pointsArr.length - 1);
    return new THREE.Vector3(
      p[0] * THREE.MathUtils.lerp(1.0, curveScale, ratio),
      p[1] * (p[1] < 0 ? lenScale : 1.0),
      p[2] * THREE.MathUtils.lerp(1.0, curveScale, ratio * 0.85)
    );
  });
  const curve = new THREE.CatmullRomCurve3(scaledPts);
  const segs = 16;
  const radialSegs = 10;
  const geo = new THREE.TubeGeometry(curve, segs, rStart, radialSegs, false);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    const ringIdx = Math.floor(i / (radialSegs + 1));
    const t = Math.min(1, ringIdx / segs);
    const center = curve.getPointAt(t);
    v.fromBufferAttribute(pos, i).sub(center);

    // ป่องมีวอลลุ่มช่วงบน-กลาง และเรียวแหลมที่ปลายปอย
    const profile = t < 0.7
      ? THREE.MathUtils.lerp(1.0, 1.18, t / 0.7)
      : THREE.MathUtils.lerp(1.18, rEnd / rStart, (t - 0.7) / 0.3);

    // หมุนหน้าตัดปอยผมให้โอบขนานไปกับทรงกลมของศีรษะโดยคงความหนา 3D ไว้ที่ 65%
    const radialAngle = Math.atan2(center.x, center.z);
    const cosA = Math.cos(radialAngle);
    const sinA = Math.sin(radialAngle);

    const tangentX = v.x * cosA - v.z * sinA;
    const normalZ = v.x * sinA + v.z * cosA;

    const sculptedT = tangentX * profile * 1.38;
    const sculptedN = normalZ * profile * 0.65;

    v.x = sculptedT * cosA + sculptedN * sinA;
    v.z = -sculptedT * sinA + sculptedN * cosA;
    v.y *= profile;

    v.add(center);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}

function lerpEuler(rot, tx, ty, tz, alpha) {
  rot.x = THREE.MathUtils.lerp(rot.x, tx, alpha);
  rot.y = THREE.MathUtils.lerp(rot.y, ty, alpha);
  rot.z = THREE.MathUtils.lerp(rot.z, tz, alpha);
}

export class ArticulatedCharacter3D {
  constructor(config) {
    this.config = JSON.parse(JSON.stringify(config));
    this.root = new THREE.Group();
    this.joints = {};
    this.hairSpringNodes = [];
    this.bodyRenderGroups = [];
    this.clickableMeshes = [];
    this.animState = 'idle';
    this.animTime = Math.random() * 10;

    this.attackTimer = 0;
    this.attackDuration = 0.42;
    this.comboStep = 1;

    this.capeAngleX = 0.08;
    this.capeVelX = 0;
    this.leanAngleZ = 0;
    this.blinkTimer = 2.8 + Math.random() * 2.5;
    this.isBlinking = false;

    this.isWeaponSheathed = false;
    this.sheatheAnimTimer = 0;
    this.sheatheAnimDuration = 0.42;

    this.buildModel();
  }

  setFirstPersonVisibility(isFPS) {
    if (this.joints.head) this.joints.head.visible = !isFPS;
    this.bodyRenderGroups.forEach(g => { g.visible = !isFPS; });
  }

  tagPart(mesh, partCategory, morphTarget = null, labelTH = "") {
    mesh.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        child.userData.partCategory = partCategory;
        child.userData.morphTarget = morphTarget || partCategory;
        child.userData.labelTH = labelTH || partCategory;
        this.clickableMeshes.push(child);
      }
    });
  }

  buildModel() {
    while (this.root.children.length > 0) this.root.remove(this.root.children[0]);
    this.clickableMeshes = [];
    this.bodyRenderGroups = [];
    this.hairSpringNodes = [];
    const c = this.config;

    const isFemale = c.gender === 'female' || String(c.bodyType).startsWith('female');

    // บังคับขอบเขตสัดส่วนให้สมดุลสวยงาม ป้องกันค่าเก่าที่เพี้ยนทำให้โมเดลผิดรูป
    const shoulderW   = THREE.MathUtils.clamp(Number(c.shoulderWidth ?? (isFemale ? 0.20 : 0.27)), 0.16, 0.34);
    const waistW      = THREE.MathUtils.clamp(Number(c.waistWidth    ?? (isFemale ? 0.135 : 0.19)), 0.11, 0.26);
    const hipW        = THREE.MathUtils.clamp(Number(c.hipWidth      ?? (isFemale ? 0.21 : 0.19)), 0.16, 0.30);
    const bustSize    = THREE.MathUtils.clamp(Number(c.bustSize      ?? (isFemale ? 0.065 : 0.01)), 0.0, 0.14);
    const bustCurve   = THREE.MathUtils.clamp(Number(c.bustCurve     ?? 1.0), 0.78, 1.25);
    const torsoLen    = THREE.MathUtils.clamp(Number(c.torsoLength   ?? 0.64), 0.54, 0.80);
    const armLen      = THREE.MathUtils.clamp(Number(c.armLength     ?? 1.0), 0.78, 1.25);
    const armThick    = THREE.MathUtils.clamp(Number(c.armThickness  ?? (isFemale ? 0.84 : 1.02)), 0.68, 1.25);
    const legLen      = THREE.MathUtils.clamp(Number(c.legLength     ?? 1.0), 0.80, 1.25);
    const thighThick  = THREE.MathUtils.clamp(Number(c.thighThickness?? (isFemale ? 0.98 : 1.02)), 0.75, 1.25);
    const headScale   = THREE.MathUtils.clamp(Number(c.headSize      ?? 0.94), 0.82, 1.18);
    const jawTaper    = THREE.MathUtils.clamp(Number(c.jawTaper      ?? (isFemale ? 0.68 : 0.82)), 0.56, 0.92);
    const bangsLen    = THREE.MathUtils.clamp(Number(c.bangsLength   ?? 1.0), 0.55, 1.65);
    const bangsCurve  = THREE.MathUtils.clamp(Number(c.bangsCurve    ?? 1.0), 0.65, 1.50);
    const hairLen     = THREE.MathUtils.clamp(Number(c.hairLength    ?? (isFemale ? 1.18 : 0.85)), 0.50, 2.00);
    const hairCurve   = THREE.MathUtils.clamp(Number(c.hairCurve     ?? 1.02), 0.65, 1.65);
    const capeLen     = THREE.MathUtils.clamp(Number(c.capeLength    ?? 1.0), 0.55, 1.65);
    const weaponLen   = THREE.MathUtils.clamp(Number(c.weaponLength  ?? 1.0), 0.70, 1.50);

    const safeSkinColor = ensureBrightSkinHex(c.skinColor);
    c.skinColor = safeSkinColor;

    const skinMat = createAnimeMaterial({ color: safeSkinColor, isSkin: true });
    const hairMat = createAnimeMaterial({
      color: c.hairColor || '#1c1917',
      roughness: 0.38,
      metalness: 0.08,
      rimColor: 0xe2e8f0,
      rimStrength: 0.24
    });

    const isSailor = isFemale && (c.fullOutfit === 'sailor_school' || ((!c.fullOutfit || c.fullOutfit === 'none') && c.topStyle === 'sailor_blouse'));
    const primaryMat = createAnimeMaterial({ color: isSailor ? 0xf8fafc : (c.primaryColor || '#2563eb'), roughness: 0.45, metalness: 0.10 });
    const secondaryMat = createAnimeMaterial({
      color: isSailor ? 0xffffff : (c.secondaryColor || '#1e293b'),
      map: isSailor ? getRedPlaidTexture() : null,
      roughness: 0.50,
      metalness: 0.08,
      side: THREE.DoubleSide
    });
    const navySailorMat = createAnimeMaterial({ color: 0x1e3a8a, roughness: 0.42 });
    const redRibbonMat = createAnimeMaterial({ color: 0xdc2626, roughness: 0.38 });
    const goldMat = createAnimeMaterial({ color: 0xfbbf24, roughness: 0.25, metalness: 0.72 });
    const darkMetalMat = createAnimeMaterial({ color: 0x334155, roughness: 0.38, metalness: 0.55 });
    const capeMat = createAnimeMaterial({ color: c.capeColor || '#dc2626', roughness: 0.52, side: THREE.DoubleSide });

    // ==================== 1. ข้อต่อสะโพก (Pelvis) และข้อต่อเอว (Waist/Spine Joint) ====================
    const pelvis = new THREE.Group();
    pelvis.position.y = 0.88 * legLen;
    this.root.add(pelvis);
    this.joints.pelvis = pelvis;

    const hipBlock = new THREE.Mesh(
      new THREE.CylinderGeometry(waistW * 0.96, hipW * 0.90, 0.20, 24),
      secondaryMat
    );
    hipBlock.scale.z = 0.66;
    hipBlock.position.y = 0.04;
    pelvis.add(hipBlock);
    this.bodyRenderGroups.push(hipBlock);
    this.tagPart(hipBlock, 'body', 'hips_butt', 'สะโพก (คลิกลากซ้าย/ขวา = ปรับความผายสะโพก)');

    const waistJoint = new THREE.Group();
    waistJoint.position.y = 0.11;
    pelvis.add(waistJoint);
    this.joints.waist = waistJoint;

    const torso = new THREE.Group();
    waistJoint.add(torso);
    this.joints.torso = torso;

    const torsoGroup = new THREE.Group();
    torso.add(torsoGroup);
    this.bodyRenderGroups.push(torsoGroup);

    const upperLen = torsoLen * 0.86;
    const isWearingFull = c.fullOutfit && c.fullOutfit !== 'none' && c.fullOutfit !== 'sailor_school';

    // ลำตัวช่วงบนที่ปั้นทรวดทรงหน้าอกผสานเป็นชิ้นเดียวอย่างเป็นธรรมชาติ (ไม่เป็นลูกบอล 2 ลูกแปะแยกชิ้น!)
    const torsoGeo = createUpperTorsoGeometry({
      isFemale,
      shoulderW,
      bustSize: isFemale ? bustSize : 0.01,
      bustCurve,
      waistW,
      torsoLen: upperLen
    });
    const torsoMesh = new THREE.Mesh(torsoGeo, primaryMat);
    torsoGroup.add(torsoMesh);
    this.tagPart(torsoMesh, 'body', 'waist_hip', 'เอวและลำตัว (คลิกลากซ้าย/ขวา = ปรับความคอดเอว | ลากขึ้น/ลง = ความยาวลำตัว)');

    // โซนคลิกดัดหน้าอกแบบแนบเนียนไปกับเสื้อ (ไม่มีก้อนกลมยื่นแยกออกมา)
    const chestGroup = new THREE.Group();
    chestGroup.position.set(0, upperLen * 0.60, 0);
    torsoGroup.add(chestGroup);

    const chestHitProxy = new THREE.Mesh(
      new THREE.CylinderGeometry(shoulderW * 0.72, waistW * 0.88, upperLen * 0.34, 24, 1, true, 0.15, Math.PI - 0.30),
      primaryMat
    );
    chestHitProxy.scale.z = 0.68 + (isFemale ? bustSize * 1.4 : 0.05);
    chestGroup.add(chestHitProxy);

    if (!isFemale && (c.topStyle === 'noble_coat' || c.topStyle === 'hunter_jacket')) {
      const lapel = new THREE.Mesh(new THREE.BoxGeometry(shoulderW * 1.05, upperLen * 0.72, 0.035), goldMat);
      lapel.position.set(0, upperLen * 0.45, 0.11);
      torsoGroup.add(lapel);
    }
    this.tagPart(chestGroup, 'body', 'bust_chest', 'หน้าอก/แผงอก (คลิกลากซ้าย/ขวา = ปรับขนาดหน้าอก | ลากขึ้น/ลง = ปรับทรงโค้ง)');

    const neckRadius = isFemale ? 0.062 : 0.078;
    const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(neckRadius, neckRadius * 1.12, 0.18, 18), skinMat);
    neckMesh.position.y = upperLen + 0.06;
    torsoGroup.add(neckMesh);

    if (isSailor) {
      const sailorCollar = new THREE.Mesh(new THREE.CylinderGeometry(shoulderW * 0.92, shoulderW * 1.04, 0.13, 24), navySailorMat);
      sailorCollar.scale.z = 0.72;
      sailorCollar.position.y = upperLen * 0.85;
      const bowZ = 0.115 + bustSize * 0.36;
      const bowKnot = new THREE.Mesh(new THREE.SphereGeometry(0.030, 12, 12), redRibbonMat);
      bowKnot.position.set(0, upperLen * 0.71, bowZ);
      [-1, 1].forEach(side => {
        const bowWing = new THREE.Mesh(new THREE.ConeGeometry(0.038, 0.095, 10), redRibbonMat);
        bowWing.position.set(side * 0.045, upperLen * 0.72, bowZ);
        bowWing.rotation.z = side * 1.25;
        const ribbonTail = new THREE.Mesh(new THREE.BoxGeometry(0.030, 0.18, 0.01), redRibbonMat);
        ribbonTail.position.set(side * 0.032, upperLen * 0.57, bowZ + 0.008);
        ribbonTail.rotation.z = -side * 0.18;
        torsoGroup.add(bowWing, ribbonTail);
      });
      torsoGroup.add(sailorCollar, bowKnot);
    } else {
      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.098, 0.016, 10, 22), goldMat);
      collar.rotation.x = Math.PI / 2;
      collar.position.y = upperLen - 0.01;
      const belt = new THREE.Mesh(new THREE.CylinderGeometry(waistW * 1.03, waistW * 1.05, 0.055, 28), goldMat);
      belt.scale.z = 0.68;
      belt.position.y = 0.04;
      torsoGroup.add(collar, belt);
    }

    if (isWearingFull) {
      if (c.fullOutfit === 'paladin_armor') {
        [-1, 1].forEach(side => {
          // เกราะไหล่โค้งเพรียวมีขอบทองคำ (ไม่เป็นลูกกลมดำใหญ่เทอะทะ)
          const pauldron = new THREE.Mesh(new THREE.SphereGeometry(0.095, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.48), goldMat);
          pauldron.scale.set(1.15, 0.85, 1.05);
          pauldron.position.set(side * (shoulderW + 0.03), upperLen * 0.86, 0);
          pauldron.rotation.z = -side * 0.32;
          torsoGroup.add(pauldron);
        });
        const armorSkirt = new THREE.Mesh(createPleatedSkirtGeometry(waistW, hipW * 1.08, 0.38, 12), goldMat);
        armorSkirt.position.y = -0.06;
        pelvis.add(armorSkirt);
        this.bodyRenderGroups.push(armorSkirt);
      } else if (c.fullOutfit === 'archmage_robe') {
        const robeSkirt = new THREE.Mesh(createPleatedSkirtGeometry(waistW, hipW * 1.22, 0.72, 16), primaryMat);
        robeSkirt.position.y = -0.22;
        pelvis.add(robeSkirt);
        this.bodyRenderGroups.push(robeSkirt);
      } else if (c.fullOutfit === 'royal_dress') {
        const dressSkirt = new THREE.Mesh(createPleatedSkirtGeometry(waistW, hipW * 1.28, 0.56, 20), primaryMat);
        dressSkirt.position.y = -0.14;
        pelvis.add(dressSkirt);
        this.bodyRenderGroups.push(dressSkirt);
      }
    } else if ((c.bottomStyle === 'battle_skirt' && isFemale) || isSailor) {
      const skirtMesh = new THREE.Mesh(createPleatedSkirtGeometry(waistW, hipW * 1.12, 0.38, 22), secondaryMat);
      skirtMesh.position.y = -0.05;
      pelvis.add(skirtMesh);
      this.bodyRenderGroups.push(skirtMesh);
      this.tagPart(skirtMesh, 'body', 'hips_butt', 'กระโปรงพลีท (คลิกลากซ้าย/ขวา = ปรับความผายสะโพก)');
    } else if (!isFemale && (c.topStyle === 'noble_coat' || c.topStyle === 'knight_vest')) {
      const coatTail = new THREE.Mesh(createPleatedSkirtGeometry(waistW * 1.02, hipW * 1.08, 0.30, 8), primaryMat);
      coatTail.position.y = -0.02;
      pelvis.add(coatTail);
      this.bodyRenderGroups.push(coatTail);
    }

    // ==================== 2. ศีรษะและใบหน้าอนิเมะ (สว่างใส ไม่ถูกหมวกผมสีดำบัง 100%) ====================
    const headJoint = new THREE.Group();
    headJoint.position.y = upperLen + 0.12;
    headJoint.scale.setScalar(headScale);
    torso.add(headJoint);
    this.joints.head = headJoint;

    const initialFaceTex = getCachedAnimeFaceTexture(c, false);
    this.faceMat = createAnimeMaterial({
      color: 0xffffff,
      map: initialFaceTex,
      emissive: 0xffffff,
      emissiveMap: initialFaceTex,
      emissiveIntensity: 0.04,
      roughness: 0.85,
      rimStrength: 0.04,
      isSkin: true
    });
    const headGeo = createSmoothAnimeHeadGeometry(jawTaper, isFemale);
    const headMesh = new THREE.Mesh(headGeo, this.faceMat);
    headMesh.position.y = 0.22;
    headMesh.rotation.y = -Math.PI / 2;
    headJoint.add(headMesh);

    const noseMesh = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.042, 8), skinMat);
    noseMesh.rotation.x = Math.PI * 0.42;
    noseMesh.position.set(0, 0.20, 0.236);
    headJoint.add(noseMesh);

    [-1, 1].forEach(side => {
      const isElf = c.headStyle === 'sharp';
      const ear = new THREE.Mesh(
        isElf ? new THREE.ConeGeometry(0.042, 0.18, 10) : new THREE.SphereGeometry(0.044, 12, 12),
        skinMat
      );
      ear.position.set(side * 0.22 * jawTaper, 0.21, -0.01);
      if (isElf) ear.rotation.z = -side * 1.15;
      else ear.scale.set(0.45, 1.0, 0.72);
      headJoint.add(ear);
    });
    this.tagPart(headJoint, 'face', 'head_face', 'ศีรษะและโครงหน้า (คลิกลากซ้าย/ขวา = ปรับความเรียวคาง | ลากขึ้น/ลง = ปรับขนาดหัว)');

    // ==================== 3. ทรงผม 3D คลุมทั้งหัว คว้านด้านหน้าออก และซ้อนเป็นเลเยอร์มีมิติ ====================
    const hairGroup = new THREE.Group();
    hairGroup.position.y = 0.22;
    headJoint.add(hairGroup);

    // ชั้นฐาน (Base Hood): คลุมกะโหลกทั้งหัวและท้ายทอย เว้นช่องใบหน้าด้านหน้า
    const hairCapMesh = new THREE.Mesh(
      createOpenFaceHairCapGeometry(jawTaper, isFemale),
      hairMat
    );
    hairGroup.add(hairCapMesh);

    const registerSpringStrand = (mesh, ampX = 0.05, ampZ = 0.04, phaseOffset = 0) => {
      const pivot = new THREE.Group();
      pivot.add(mesh);
      this.hairSpringNodes.push({
        pivot,
        baseRotX: pivot.rotation.x,
        baseRotZ: pivot.rotation.z,
        ampX,
        ampZ,
        phaseOffset
      });
      return pivot;
    };

    // เลเยอร์ผมด้านหน้า & ปอยผมโอบกรอบหน้า (Bangs & Side-Framing Layers)
    const bangsGroup = new THREE.Group();
    hairGroup.add(bangsGroup);
    const bangsType = c.bangsStyle || (isFemale ? 'hime_frame' : 'male_parted');

    if (bangsType === 'male_parted' || bangsType === 'spiky_fringe') {
      [-0.11, -0.04, 0.04, 0.11].forEach((bx, idx) => {
        const strand = createSculptableHairStrand([
          [bx * 0.45, 0.25, 0.12],
          [bx * 0.95, 0.18, 0.245],
          [bx * 1.15 + (idx % 2 === 0 ? 0.02 : -0.02), 0.065 - (idx % 2) * 0.02, 0.242]
        ], 0.036, 0.006, hairMat, bangsLen, bangsCurve);
        bangsGroup.add(registerSpringStrand(strand, 0.04, 0.04, idx * 0.6));
      });
      [-1, 1].forEach((side, sIdx) => {
        const sideburn = createSculptableHairStrand([
          [side * 0.17, 0.19, 0.11],
          [side * 0.23, 0.05, 0.14],
          [side * 0.21, -0.11, 0.10]
        ], 0.038, 0.007, hairMat, bangsLen, bangsCurve);
        bangsGroup.add(registerSpringStrand(sideburn, 0.05, 0.05, sIdx));
      });
    } else if (bangsType === 'hime_frame' || bangsType === 'parted') {
      // หน้าม้าเลเยอร์โค้งรับหน้าผาก
      [-0.08, -0.028, 0.028, 0.08].forEach((bx, idx) => {
        const wisp = createSculptableHairStrand([
          [bx * 0.50, 0.255, 0.12],
          [bx * 0.88, 0.185, 0.248],
          [bx * 1.02, 0.08 - (idx % 2) * 0.015, 0.245]
        ], 0.026, 0.005, hairMat, bangsLen, bangsCurve);
        bangsGroup.add(registerSpringStrand(wisp, 0.035, 0.035, idx * 0.5));
      });
      // ปอยหวานข้างแก้ม 2 เลเยอร์ซ้อนกัน (สั้นระดับแก้ม + ยาวระดับไหล่) โอบจากขมับลงมาเนียนไปกับผมหลัง
      [-1, 1].forEach((side, sIdx) => {
        const outerCheekLock = createSculptableHairStrand([
          [side * 0.15, 0.22, 0.12],
          [side * 0.235, 0.08, 0.14],
          [side * 0.23, -0.09, 0.12],
          [side * 0.19, -0.28, 0.09]
        ], 0.042, 0.008, hairMat, bangsLen, bangsCurve);
        const innerTempleLayer = createSculptableHairStrand([
          [side * 0.18, 0.20, 0.06],
          [side * 0.255, 0.04, 0.05],
          [side * 0.24, -0.16, 0.03]
        ], 0.044, 0.010, hairMat, bangsLen * 0.85, bangsCurve);
        bangsGroup.add(
          registerSpringStrand(outerCheekLock, 0.07, 0.06, sIdx * 1.2),
          registerSpringStrand(innerTempleLayer, 0.05, 0.05, sIdx * 1.2 + 0.4)
        );
      });
    } else if (bangsType === 'side_swept') {
      [-0.09, -0.02, 0.05, 0.12].forEach((bx, idx) => {
        const sweep = createSculptableHairStrand([
          [bx - 0.04, 0.25, 0.13],
          [bx + 0.03, 0.17, 0.248],
          [bx + 0.08, 0.06, 0.23]
        ], 0.034, 0.006, hairMat, bangsLen, bangsCurve);
        bangsGroup.add(registerSpringStrand(sweep, 0.04, 0.04, idx * 0.5));
      });
    } else {
      [-1, 1].forEach((side, idx) => {
        const sweptBack = createSculptableHairStrand([
          [side * 0.08, 0.25, 0.14],
          [side * 0.20, 0.19, 0.09],
          [side * 0.25, 0.03, 0.01]
        ], 0.042, 0.008, hairMat, bangsLen, bangsCurve);
        bangsGroup.add(registerSpringStrand(sweptBack, 0.04, 0.04, idx));
      });
    }
    this.tagPart(bangsGroup, 'hair', 'hair_bangs', 'ปอยผมหน้า (คลิกลากขึ้น/ลง = ปรับความยาวปอยผมหน้า | ลากซ้าย/ขวา = ดัดความโค้งกรอบหน้า)');

    // ตั้งจุดหมุนฟิสิกส์ผมไว้ที่ศูนย์กลางกะโหลก (0, 0, 0) เพื่อให้เลเยอร์ผมคลุมหัวหมุนต่อเนื่องไม่แยกหลุดจากศีรษะ
    const hairPhysicsPivot = new THREE.Group();
    hairPhysicsPivot.position.set(0, 0, 0);
    hairGroup.add(hairPhysicsPivot);
    this.joints.hairPhysics = hairPhysicsPivot;

    const hStyle = c.hairStyle || (isFemale ? 'long_flowing' : 'short_layered');

    // เลเยอร์ที่ 1 (Upper Crown Layer): คลุมรอบกระหม่อม ขมับ และท้ายทอย มีซอยปลายแหลมรอบศีรษะสำหรับทุกทรงผม
    const crownLayerMesh = new THREE.Mesh(
      createLayeredHairShellGeometry({
        baseRadius: 0.284,
        length: 0.22 * Math.min(1.25, hairLen),
        thickness: 0.042 * hairCurve,
        flare: 0.05 * hairCurve,
        backFlow: 0.03,
        sideWrapAngle: Math.PI * 0.74,
        lowerWrapAngle: Math.PI * 0.64,
        tuftCount: 12,
        tipNotch: 0.18,
        sideCascade: 0.18,
        phaseShift: 0.0
      }),
      hairMat
    );
    hairGroup.add(crownLayerMesh);

    if (hStyle === 'short_layered' || hStyle === 'undercut_fade') {
      // เลเยอร์ที่ 2 สำหรับผมสั้นซอยทุยรับต้นคอ
      const shortMidLayer = new THREE.Mesh(
        createLayeredHairShellGeometry({
          baseRadius: 0.280,
          length: 0.30 * hairLen,
          thickness: 0.045 * hairCurve,
          flare: 0.06 * hairCurve,
          backFlow: 0.04,
          sideWrapAngle: Math.PI * 0.68,
          lowerWrapAngle: Math.PI * 0.54,
          tuftCount: 14,
          tipNotch: 0.22,
          sideCascade: 0.25,
          phaseShift: 1.1
        }),
        hairMat
      );
      hairPhysicsPivot.add(registerSpringStrand(shortMidLayer, 0.04, 0.03, 0.3));
    } else if (hStyle === 'wolf_cut') {
      // ทรงวูล์ฟคัทซอย 2 เลเยอร์สะบัดปลายช่วงบ่า
      const wolfMidLayer = new THREE.Mesh(
        createLayeredHairShellGeometry({
          baseRadius: 0.286,
          length: 0.38 * hairLen,
          thickness: 0.050 * hairCurve,
          flare: 0.11 * hairCurve,
          backFlow: 0.06,
          sideWrapAngle: Math.PI * 0.72,
          lowerWrapAngle: Math.PI * 0.58,
          tuftCount: 13,
          tipNotch: 0.25,
          sideCascade: 0.20,
          phaseShift: 0.8
        }),
        hairMat
      );
      const wolfLowerLayer = new THREE.Mesh(
        createLayeredHairShellGeometry({
          baseRadius: 0.278,
          length: 0.54 * hairLen,
          thickness: 0.046 * hairCurve,
          flare: 0.16 * hairCurve,
          backFlow: 0.09,
          sideWrapAngle: Math.PI * 0.62,
          lowerWrapAngle: Math.PI * 0.48,
          tuftCount: 11,
          tipNotch: 0.28,
          sideCascade: 0.24,
          phaseShift: 2.1
        }),
        hairMat
      );
      hairPhysicsPivot.add(
        registerSpringStrand(wolfMidLayer, 0.06, 0.05, 0.2),
        registerSpringStrand(wolfLowerLayer, 0.09, 0.07, 0.9)
      );
    } else if (hStyle === 'samurai_bun') {
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.095, 20, 18), hairMat);
      bun.position.set(0, 0.24, -0.22);
      hairPhysicsPivot.add(bun);
      for (let i = -1; i <= 1; i++) {
        const tail = createSculptableHairStrand([
          [i * 0.035, 0.24, -0.24],
          [i * 0.07, 0.10, -0.34],
          [i * 0.09, -0.18, -0.38]
        ], 0.048, 0.009, hairMat, hairLen * 0.85, hairCurve);
        hairPhysicsPivot.add(registerSpringStrand(tail, 0.09, 0.07, i));
      }
    } else if (hStyle === 'spiky') {
      for (let i = 0; i < 9; i++) {
        const ang = (i / 8) * Math.PI * 1.4 - Math.PI * 0.7;
        const spike = createSculptableHairStrand([
          [Math.sin(ang) * 0.16, 0.16, -Math.cos(ang) * 0.16],
          [Math.sin(ang) * 0.30, 0.18, -Math.cos(ang) * 0.28 - 0.06],
          [Math.sin(ang) * 0.40, -0.06, -Math.cos(ang) * 0.36 - 0.12]
        ], 0.058, 0.009, hairMat, hairLen * 0.85, hairCurve);
        hairPhysicsPivot.add(registerSpringStrand(spike, 0.06, 0.05, i * 0.4));
      }
    } else if (hStyle === 'long_flowing') {
      // ผมยาวสลวย 3 เลเยอร์ซ้อนทับกันแบบ 3D เต็มใบหัว (ชั้นบน + ชั้นกลาง + ชั้นล่างยาวพลิ้ว)
      const midLayerShell = new THREE.Mesh(
        createLayeredHairShellGeometry({
          baseRadius: 0.288,
          length: 0.52 * hairLen,
          thickness: 0.054 * hairCurve,
          flare: 0.11 * hairCurve,
          backFlow: 0.09,
          sideWrapAngle: Math.PI * 0.70,
          lowerWrapAngle: Math.PI * 0.56,
          tuftCount: 13,
          tipNotch: 0.20,
          sideCascade: 0.22,
          phaseShift: 0.9
        }),
        hairMat
      );
      const lowerLayerShell = new THREE.Mesh(
        createLayeredHairShellGeometry({
          baseRadius: 0.282,
          length: 0.86 * hairLen,
          thickness: 0.058 * hairCurve,
          flare: 0.17 * hairCurve,
          backFlow: 0.15,
          sideWrapAngle: Math.PI * 0.64,
          lowerWrapAngle: Math.PI * 0.50,
          tuftCount: 11,
          tipNotch: 0.24,
          sideCascade: 0.26,
          phaseShift: 2.0
        }),
        hairMat
      );
      const deepUnderLayerShell = new THREE.Mesh(
        createLayeredHairShellGeometry({
          baseRadius: 0.275,
          length: 1.04 * hairLen,
          thickness: 0.048 * hairCurve,
          flare: 0.14 * hairCurve,
          backFlow: 0.12,
          sideWrapAngle: Math.PI * 0.58,
          lowerWrapAngle: Math.PI * 0.44,
          tuftCount: 9,
          tipNotch: 0.22,
          sideCascade: 0.20,
          phaseShift: 0.4
        }),
        hairMat
      );
      hairPhysicsPivot.add(
        registerSpringStrand(midLayerShell, 0.06, 0.05, 0.2),
        registerSpringStrand(lowerLayerShell, 0.09, 0.07, 0.7),
        registerSpringStrand(deepUnderLayerShell, 0.11, 0.08, 1.3)
      );
    } else if (hStyle === 'twintails') {
      [-1, 1].forEach((side, idx) => {
        const tailBase = new THREE.Mesh(new THREE.SphereGeometry(0.065, 14, 14), hairMat);
        tailBase.position.set(side * 0.24, 0.12, -0.10);
        hairPhysicsPivot.add(tailBase);
        [-0.03, 0.03].forEach((offsetZ, subIdx) => {
          const tail = createSculptableHairStrand([
            [side * 0.24, 0.12, -0.10 + offsetZ],
            [side * 0.38, 0.04, -0.14 + offsetZ * 1.5],
            [side * 0.44, -0.34, -0.18 + offsetZ * 2.0],
            [side * 0.38, -0.76, -0.12 + offsetZ]
          ], 0.068, 0.012, hairMat, hairLen * (1 - subIdx * 0.08), hairCurve);
          hairPhysicsPivot.add(registerSpringStrand(tail, 0.12, 0.10, idx * 1.5 + subIdx * 0.5));
        });
      });
    } else if (hStyle === 'ponytail') {
      const tieRing = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.018, 10, 18), redRibbonMat);
      tieRing.position.set(0, 0.14, -0.26);
      tieRing.rotation.x = Math.PI * 0.35;
      hairPhysicsPivot.add(tieRing);
      [-0.04, 0, 0.04].forEach((ox, idx) => {
        const pony = createSculptableHairStrand([
          [ox * 0.5, 0.14, -0.26],
          [ox * 1.2, 0.18 - idx * 0.02, -0.40],
          [ox * 1.6, -0.18, -0.48],
          [ox * 1.4, -0.58, -0.42]
        ], 0.068, 0.012, hairMat, hairLen * (1.0 - Math.abs(ox) * 1.5), hairCurve);
        hairPhysicsPivot.add(registerSpringStrand(pony, 0.12, 0.09, idx * 0.4));
      });
    }
    this.tagPart(hairGroup, 'hair', 'hair_back', 'ทรงผม (คลิกลากขึ้น/ลง = ดึงความยาวผม | ลากซ้าย/ขวา = ดัดความพอง/ความโค้ง)');

    if (c.hatStyle && c.hatStyle !== 'none') {
      const hatGroup = new THREE.Group();
      hatGroup.position.y = 0.50;
      headJoint.add(hatGroup);
      if (c.hatStyle === 'wizard_hat') {
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.50, 0.50, 0.03, 24), primaryMat);
        const cone = createSculptableHairStrand([[0, 0, 0], [0, 0.30, -0.04], [0, 0.56, -0.20]], 0.26, 0.02, primaryMat);
        hatGroup.add(brim, cone);
      } else if (c.hatStyle === 'royal_crown') {
        hatGroup.add(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.16, 0.12, 18), goldMat));
      } else if (c.hatStyle === 'valkyrie_tiara') {
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.018, 10, 24, Math.PI), goldMat);
        band.position.set(0, -0.14, 0.10);
        hatGroup.add(band);
      }
      this.tagPart(hatGroup, 'hair', 'hair_back', 'หมวกและเครื่องประดับหัว');
    }

    // ==================== 4. ผ้าคลุมแบบแผ่นผ้าพลิ้วและปีก ====================
    const capeJoint = new THREE.Group();
    capeJoint.position.set(0, upperLen * 0.88, -0.12);
    torso.add(capeJoint);
    this.joints.cape = capeJoint;
    this.bodyRenderGroups.push(capeJoint);

    if (c.hasCape) {
      const capeGeo = createDrapedCapeGeometry(capeLen);
      const capeMesh = new THREE.Mesh(capeGeo, capeMat);
      capeJoint.add(capeMesh);
      this.tagPart(capeMesh, 'extra', 'cape_morph', 'ผ้าคลุมไหล่ (คลิกลากขึ้น/ลง = ปรับความยาวผ้าคลุม)');
    }

    if (c.accessory && c.accessory !== 'none') {
      const accGroup = new THREE.Group();
      torso.add(accGroup);
      this.bodyRenderGroups.push(accGroup);
      if (c.accessory === 'angel_wings') {
        const wingMat = createAnimeMaterial({ color: 0xf8fafc, emissive: 0x38bdf8, emissiveIntensity: 0.22 });
        [-1, 1].forEach(side => {
          for (let f = 0; f < 5; f++) {
            const feather = createSculptableHairStrand([
              [side * 0.11, upperLen * 0.75, -0.14],
              [side * (0.38 + f * 0.09), upperLen * 0.90 - f * 0.09, -0.22],
              [side * (0.64 + f * 0.07), upperLen * 0.54 - f * 0.14, -0.28]
            ], 0.048, 0.010, wingMat);
            accGroup.add(feather);
          }
        });
      } else if (c.accessory === 'halo') {
        const halo = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.018, 10, 28), createAnimeMaterial({ color: 0xfef08a, emissive: 0xfacc15, emissiveIntensity: 0.55 }));
        halo.rotation.x = Math.PI / 2;
        halo.position.set(0, upperLen + 0.72, 0);
        accGroup.add(halo);
      }
      this.tagPart(accGroup, 'extra', 'cape_morph', 'เครื่องประดับพิเศษ');
    }

    // ==================== 5. แขน ข้อศอก มือ และอาวุธที่จับในทิศทางพุ่งไปด้านหน้าอย่างถูกต้อง ====================
    const sleeveMat = (isSailor || c.topStyle === 'noble_coat' || c.topStyle === 'hunter_jacket' || isWearingFull) ? primaryMat : skinMat;
    [-1, 1].forEach(side => {
      const armRoot = new THREE.Group();
      armRoot.position.set(side * (shoulderW + 0.018), upperLen * 0.84, 0);
      armRoot.scale.set(armThick, armLen, armThick);
      torso.add(armRoot);
      if (side === -1) this.joints.armL = armRoot;
      else this.joints.armR = armRoot;

      const shoulderBall = new THREE.Mesh(new THREE.SphereGeometry(0.052, 14, 14), sleeveMat);
      const upperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.044, 0.27, 16), sleeveMat);
      upperArm.position.y = -0.135;
      armRoot.add(shoulderBall, upperArm);
      this.bodyRenderGroups.push(shoulderBall, upperArm);

      const foreArm = new THREE.Group();
      foreArm.position.y = -0.27;
      armRoot.add(foreArm);
      if (side === -1) this.joints.foreArmL = foreArm;
      else this.joints.foreArmR = foreArm;

      const elbowBall = new THREE.Mesh(new THREE.SphereGeometry(0.043, 12, 12), skinMat);
      const foreArmMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.036, 0.25, 16), skinMat);
      foreArmMesh.position.y = -0.125;
      const wristCuff = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.044, 0.045, 14), isSailor ? navySailorMat : goldMat);
      wristCuff.position.y = -0.21;
      const palm = new THREE.Mesh(new THREE.SphereGeometry(0.044, 12, 12), skinMat);
      palm.scale.set(0.85, 1.10, 0.72);
      palm.position.y = -0.255;
      foreArm.add(elbowBall, foreArmMesh, wristCuff, palm);

      const socket = new THREE.Group();
      socket.position.set(0, -0.255, 0.03);
      socket.scale.setScalar(weaponLen);
      foreArm.add(socket);
      if (side === -1) this.joints.weaponSocketL = socket;
      else this.joints.weaponSocketR = socket;

      this.tagPart(armRoot, 'body', 'arms_morph', 'แขนและข้อศอก (คลิกลากขึ้น/ลง = ปรับความยาวแขน | ลากซ้าย/ขวา = ปรับความเรียวแขน)');
    });

    // จุดเหน็บดาบข้างเอวซ้าย (Waist Scabbard Socket)
    const hipSheatheSocket = new THREE.Group();
    hipSheatheSocket.position.set(-(waistW + 0.06), 0.04, -0.02);
    pelvis.add(hipSheatheSocket);
    this.joints.hipSheatheSocket = hipSheatheSocket;
    this.bodyRenderGroups.push(hipSheatheSocket);

    // จุดสะพายโล่และธนูกลางหลัง (Back Strap Socket)
    const backSheatheSocket = new THREE.Group();
    backSheatheSocket.position.set(0, upperLen * 0.56, -0.15);
    torso.add(backSheatheSocket);
    this.joints.backSheatheSocket = backSheatheSocket;
    this.bodyRenderGroups.push(backSheatheSocket);

    // จุดสมุดเวทลอยตามข้างไหล่ผู้เล่น (Floating Grimoire Orbit)
    const tomeOrbitSocket = new THREE.Group();
    tomeOrbitSocket.position.set(-0.46, upperLen + 0.25, -0.15);
    torso.add(tomeOrbitSocket);
    this.joints.tomeOrbitSocket = tomeOrbitSocket;

    this.buildEquippedWeapons(c.weaponId);

    // วงแหวนคลื่นดาบ 3D (Slash Arc Trail) ติดตัวละครสำหรับแสดงจังหวะฟันคอมโบให้ดุดันลื่นไหล!
    const wInfo = WEAPONS[c.weaponId] || WEAPONS.sword_iron;
    const slashGeo = new THREE.RingGeometry(0.65, 1.85, 28, 1, -Math.PI * 0.45, Math.PI * 0.90);
    const slashMat = new THREE.MeshBasicMaterial({
      color: wInfo.color || 0xfef08a,
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.slashTrailMesh = new THREE.Mesh(slashGeo, slashMat);
    this.slashTrailMesh.rotation.x = Math.PI / 2;
    this.slashTrailMesh.position.set(0, 1.05, 0.25);
    this.slashTrailMesh.visible = false;
    this.root.add(this.slashTrailMesh);

    // ==================== 6. เรียวขา หัวเข่า และรองเท้า ====================
    const useBareLegs = isFemale && (c.bottomStyle === 'shorts' || c.bottomStyle === 'battle_skirt' || isSailor) && !isWearingFull;
    const thighMatUsed = useBareLegs ? skinMat : secondaryMat;

    [-1, 1].forEach(side => {
      const legRoot = new THREE.Group();
      legRoot.position.set(side * (hipW * 0.48), 0, 0);
      legRoot.scale.set(thighThick, legLen, thighThick);
      pelvis.add(legRoot);
      this.bodyRenderGroups.push(legRoot);
      if (side === -1) this.joints.legL = legRoot;
      else this.joints.legR = legRoot;

      const hipJointBall = new THREE.Mesh(new THREE.SphereGeometry(0.080, 14, 14), thighMatUsed);
      const thighGeo = new THREE.CylinderGeometry(0.082, 0.062, 0.42, 18);
      const thigh = new THREE.Mesh(thighGeo, thighMatUsed);
      thigh.position.y = -0.21;
      legRoot.add(hipJointBall, thigh);

      const shin = new THREE.Group();
      shin.position.y = -0.42;
      legRoot.add(shin);
      if (side === -1) this.joints.shinL = shin;
      else this.joints.shinR = shin;

      const kneeBall = new THREE.Mesh(new THREE.SphereGeometry(0.060, 12, 12), thighMatUsed);
      const calfGeo = new THREE.CylinderGeometry(0.060, 0.046, 0.36, 18);
      const shinMesh = new THREE.Mesh(calfGeo, thighMatUsed);
      shinMesh.position.y = -0.18;

      const bootUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.062, 0.22, 16), darkMetalMat);
      bootUpper.position.y = -0.28;
      const bootFoot = new THREE.Mesh(new THREE.BoxGeometry(0.112, 0.082, 0.22), darkMetalMat);
      bootFoot.position.set(0, -0.38, 0.035);

      shin.add(kneeBall, shinMesh, bootUpper, bootFoot);
      this.tagPart(legRoot, 'body', 'legs_morph', 'เรียวขาและหัวเข่า (คลิกลากขึ้น/ลง = ปรับความยาวขา | ลากซ้าย/ขวา = ปรับความอวบ/เรียวต้นขา)');
    });

    const hScale = Number(c.heightScale) || 1.0;
    this.root.scale.set(hScale, hScale, hScale);
  }

  buildEquippedWeapons(weaponId) {
    const w = WEAPONS[weaponId] || WEAPONS.sword_iron;
    this.currentWeaponType = w.type;
    const metalMat = createAnimeMaterial({ color: w.color, metalness: 0.75, roughness: 0.20, emissive: w.color, emissiveIntensity: 0.25 });
    const hiltMat = createAnimeMaterial({ color: 0xfbbf24, metalness: 0.80, roughness: 0.22 });
    const gripMat = createAnimeMaterial({ color: 0x451a03, roughness: 0.7 });

    const rSocket = this.joints.weaponSocketR;
    const lSocket = this.joints.weaponSocketL;
    const hipSocket = this.joints.hipSheatheSocket;
    const backSocket = this.joints.backSheatheSocket;
    const tomeOrbit = this.joints.tomeOrbitSocket;

    [rSocket, lSocket, hipSocket, backSocket, tomeOrbit].forEach(s => {
      if (!s) return;
      while (s.children.length > 0) s.remove(s.children[0]);
    });

    this.drawnWeaponMeshes = [];
    this.sheathedWeaponMeshes = [];
    this.staffDissolveParticles = null;

    const createSwordMesh = () => {
      const g = new THREE.Group();
      const pommel = new THREE.Mesh(new THREE.OctahedronGeometry(0.042, 0), hiltMat);
      pommel.position.y = -0.15;
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.26, 12), gripMat);
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.045, 0.07), hiltMat);
      guard.position.y = 0.14;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.98, 0.018), metalMat);
      blade.position.y = 0.64;
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.052, 0.18, 4), metalMat);
      tip.scale.z = 0.3;
      tip.rotation.y = Math.PI / 4;
      tip.position.y = 1.22;
      g.add(pommel, grip, guard, blade, tip);
      return g;
    };

    if (w.type === 'sword') {
      // ดาบในมือขวา
      const drawnSword = createSwordMesh();
      drawnSword.rotation.x = Math.PI * 0.68;
      drawnSword.rotation.z = -0.12;
      rSocket.add(drawnSword);
      this.drawnWeaponMeshes.push(drawnSword);

      // ดาบเหน็บในฝักข้างเอวซ้ายเมื่อเก็บอาวุธ
      if (hipSocket) {
        const sheathedSword = createSwordMesh();
        const scabbard = new THREE.Mesh(
          new THREE.BoxGeometry(0.09, 1.08, 0.036),
          createAnimeMaterial({ color: 0x1e293b, roughness: 0.45 })
        );
        scabbard.position.y = 0.68;
        sheathedSword.add(scabbard);
        sheathedSword.rotation.x = -Math.PI * 0.62;
        sheathedSword.rotation.z = 0.18;
        hipSocket.add(sheathedSword);
        this.sheathedWeaponMeshes.push(sheathedSword);
      }
    } else if (w.type === 'staff') {
      // คทาในมือขวา
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 1.50, 12), gripMat);
      pole.position.y = 0.30;
      const haloRing = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.018, 10, 24), hiltMat);
      haloRing.position.y = 1.12;
      const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.095, 1), metalMat);
      orb.position.y = 1.12;
      this.floatingStaffOrb = orb;
      g.add(pole, haloRing, orb);
      g.rotation.x = Math.PI * 0.58;
      rSocket.add(g);
      this.drawnWeaponMeshes.push(g);

      // ละอองแสงเวทมนตร์เมื่อสลายคทาเก็บ
      if (backSocket) {
        const pGroup = new THREE.Group();
        for (let i = 0; i < 14; i++) {
          const sp = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.032, 0),
            new THREE.MeshBasicMaterial({ color: w.color, transparent: true, opacity: 0.85 })
          );
          const ang = (i / 14) * Math.PI * 2;
          sp.position.set(Math.cos(ang) * 0.28, (i % 5 - 2) * 0.14, Math.sin(ang) * 0.18);
          pGroup.add(sp);
        }
        backSocket.add(pGroup);
        this.staffDissolveParticles = pGroup;
        this.sheathedWeaponMeshes.push(pGroup);
      }
    } else if (w.type === 'bow') {
      const createBow = () => {
        const g = new THREE.Group();
        const arc = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.024, 10, 28, Math.PI * 1.15), hiltMat);
        arc.rotation.z = -Math.PI * 0.57;
        const string = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.84, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
        g.add(arc, string);
        return g;
      };
      const drawnBow = createBow();
      drawnBow.rotation.y = Math.PI / 2;
      lSocket.add(drawnBow);
      this.drawnWeaponMeshes.push(drawnBow);

      // ธนูสะพายเฉียงกลางหลังเมื่อเก็บอาวุธ
      if (backSocket) {
        const backBow = createBow();
        backBow.rotation.z = 0.65;
        backBow.rotation.y = 0.2;
        backSocket.add(backBow);
        this.sheathedWeaponMeshes.push(backBow);
      }
    } else if (w.type === 'shield') {
      const createShield = () => {
        const shieldG = new THREE.Group();
        const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.24, 0.64, 6), metalMat);
        plate.scale.z = 0.18;
        const boss = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 14), hiltMat);
        boss.position.z = 0.06;
        shieldG.add(plate, boss);
        return shieldG;
      };
      const createMace = () => {
        const maceG = new THREE.Group();
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.62, 10), gripMat);
        handle.position.y = 0.22;
        const hammerHead = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.14), hiltMat);
        hammerHead.position.y = 0.54;
        maceG.add(handle, hammerHead);
        return maceG;
      };
      const drawnShield = createShield();
      drawnShield.position.set(-0.08, 0.06, 0.10);
      lSocket.add(drawnShield);

      const drawnMace = createMace();
      drawnMace.rotation.x = Math.PI * 0.66;
      rSocket.add(drawnMace);
      this.drawnWeaponMeshes.push(drawnShield, drawnMace);

      // โล่และค้อนสะพายหลังเมื่อเก็บอาวุธ
      if (backSocket) {
        const backPack = new THREE.Group();
        const backShield = createShield();
        backShield.rotation.y = Math.PI;
        backShield.position.set(0, 0, -0.04);
        const backMace = createMace();
        backMace.rotation.z = -0.65;
        backMace.position.set(-0.12, -0.15, 0.02);
        backPack.add(backShield, backMace);
        backSocket.add(backPack);
        this.sheathedWeaponMeshes.push(backPack);
      }
    } else if (w.type === 'tome') {
      const createTome = (isClosed = false) => {
        const bookG = new THREE.Group();
        const leftCover = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.28, 0.026), metalMat);
        leftCover.position.x = isClosed ? -0.015 : -0.085;
        leftCover.rotation.y = isClosed ? 1.35 : 0.25;
        const rightCover = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.28, 0.026), metalMat);
        rightCover.position.x = isClosed ? 0.015 : 0.085;
        rightCover.rotation.y = isClosed ? -1.35 : -0.25;
        const runeRing = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.010, 8, 24), hiltMat);
        runeRing.rotation.x = Math.PI / 2;
        runeRing.position.set(0, 0.0, 0.05);
        bookG.add(leftCover, rightCover, runeRing);
        return bookG;
      };
      const drawnBook = createTome(false);
      drawnBook.position.set(0, 0.16, 0.24);
      this.floatingTome = drawnBook;
      lSocket.add(drawnBook);
      this.drawnWeaponMeshes.push(drawnBook);

      // สมุดเวทลอยตามข้างตัวผู้เล่นเมื่อเก็บอาวุธ
      if (tomeOrbit) {
        const orbitBook = createTome(true);
        tomeOrbit.add(orbitBook);
        this.orbitingTomeMesh = orbitBook;
        this.sheathedWeaponMeshes.push(orbitBook);
      }
    }

    this.applyWeaponSheatheVisibility();
  }

  applyWeaponSheatheVisibility() {
    const sheathed = !!this.isWeaponSheathed;
    (this.drawnWeaponMeshes || []).forEach(m => { m.visible = !sheathed; });
    (this.sheathedWeaponMeshes || []).forEach(m => { m.visible = sheathed; });
  }

  toggleWeaponSheathe(forceSheathed = null) {
    const nextState = forceSheathed !== null ? !!forceSheathed : !this.isWeaponSheathed;
    if (this.isWeaponSheathed === nextState && this.sheatheAnimTimer <= 0) return this.isWeaponSheathed;
    this.isWeaponSheathed = nextState;
    this.sheatheAnimTimer = this.sheatheAnimDuration;
    this.applyWeaponSheatheVisibility();
    return this.isWeaponSheathed;
  }

  triggerWeaponCombo(step = 1) {
    if (this.isWeaponSheathed) {
      this.toggleWeaponSheathe(false);
    }
    this.comboStep = step;
    this.attackDuration = step === 3 ? 0.52 : 0.38;
    this.attackTimer = this.attackDuration;
  }

  updateAnimation(dt, speedRatio = 0, isJumping = false, verticalVelocity = 0, turnDelta = 0, isInWater = false) {
    this.animTime += dt;
    const j = this.joints;
    if (!j.pelvis) return;

    if (this.faceMat) {
      this.blinkTimer -= dt;
      if (this.blinkTimer <= 0) {
        this.isBlinking = !this.isBlinking;
        this.blinkTimer = this.isBlinking ? 0.13 : (2.8 + Math.random() * 2.5);
        const tex = getCachedAnimeFaceTexture(this.config, this.animState === 'sleep' ? true : this.isBlinking);
        this.faceMat.map = tex;
        this.faceMat.emissiveMap = tex;
      } else if (this.animState === 'sleep' && !this.isBlinking) {
        this.isBlinking = true;
        const tex = getCachedAnimeFaceTexture(this.config, true);
        this.faceMat.map = tex;
        this.faceMat.emissiveMap = tex;
      }
    }

    if (this.floatingTome) {
      this.floatingTome.position.y = 0.16 + Math.sin(this.animTime * 4) * 0.045;
      this.floatingTome.rotation.y = Math.sin(this.animTime * 2) * 0.22;
    }
    if (this.orbitingTomeMesh && j.tomeOrbitSocket) {
      j.tomeOrbitSocket.position.y = 0.72 + Math.sin(this.animTime * 3.2) * 0.09;
      j.tomeOrbitSocket.position.x = -0.46 + Math.cos(this.animTime * 2.0) * 0.05;
      this.orbitingTomeMesh.rotation.y = this.animTime * 1.4;
      this.orbitingTomeMesh.rotation.z = Math.sin(this.animTime * 2.5) * 0.15;
    }
    if (this.staffDissolveParticles && this.isWeaponSheathed) {
      this.staffDissolveParticles.rotation.y += dt * 2.4;
      this.staffDissolveParticles.children.forEach((sp, idx) => {
        sp.position.y = Math.sin(this.animTime * 3.5 + idx) * 0.22;
        const s = 0.6 + 0.4 * Math.sin(this.animTime * 5 + idx);
        sp.scale.setScalar(s);
      });
    }
    if (this.floatingStaffOrb) {
      this.floatingStaffOrb.rotation.y += dt * 3;
    }

    
    const stepWave = Math.sin((this.walkCyclePhase || this.animTime * 10) * 2.0);
    const targetCape = 0.08 + speedRatio * 0.38 + stepWave * 0.08 * speedRatio +
                       Math.max(0, -verticalVelocity * 0.035) + (this.attackTimer > 0 ? 0.32 : 0);
    const springF = (targetCape - this.capeAngleX) * 30;
    this.capeVelX = (this.capeVelX + springF * dt) * Math.exp(-5.8 * dt);
    this.capeAngleX += this.capeVelX * dt;

    if (j.cape) {
      j.cape.rotation.x = this.capeAngleX * 0.55 + Math.sin(this.animTime * 6.5) * (0.03 + speedRatio * 0.07);
      j.cape.rotation.z = THREE.MathUtils.clamp(-turnDelta * 1.4, -0.35, 0.35);
    }

    if (j.hairPhysics) {
      // ชดเชยองศาการเงยหน้าขณะโน้มตัววิ่ง (-j.head.rotation.x) เพื่อให้ผมปลิวไปข้างหลังตามแรงลมจริง
      const headPitchComp = j.head ? Math.max(0, -j.head.rotation.x * 0.85) : 0;
      j.hairPhysics.rotation.x = THREE.MathUtils.clamp(
        (this.capeAngleX - 0.06) * 0.32 + headPitchComp,
        -0.04,
        0.38
      ) + Math.sin(this.animTime * 5.5) * (0.02 + speedRatio * 0.045);
      j.hairPhysics.rotation.z = THREE.MathUtils.clamp(-turnDelta * 0.75, -0.22, 0.22);
    }

    for (let i = 0; i < this.hairSpringNodes.length; i++) {
      const hn = this.hairSpringNodes[i];
      const freq = 3.8 + speedRatio * 4.5;
      const wave = Math.sin(this.animTime * freq + hn.phaseOffset);
      const wave2 = Math.cos(this.animTime * (freq * 0.85) + hn.phaseOffset);
      hn.pivot.rotation.x = hn.baseRotX + (wave * 0.5 + 0.5) * hn.ampX * (0.35 + speedRatio * 1.15);
      hn.pivot.rotation.z = hn.baseRotZ + wave2 * hn.ampZ * (0.35 + speedRatio * 0.85) - turnDelta * 0.25;
    }

    // ==================== ระบบดัดคลื่น S-Curve ระดับ Vertex ให้เส้นผมและผ้าคลุมพลิ้วไหวไม่แข็งเป็นเส้นตรง ====================
    if (this._cachedDeformRoot !== j.hairPhysics) {
      this._cachedDeformRoot = j.hairPhysics;
      this._deformableMeshes = [];
      const collectMeshes = (group, isCape) => {
        if (!group) return;
        group.traverse((child) => {
          if (child.isMesh && child.geometry && child.geometry.attributes.position) {
            const posAttr = child.geometry.attributes.position;
            if (!child.userData._origPos) {
              child.userData._origPos = new Float32Array(posAttr.array);
            }
            this._deformableMeshes.push({ mesh: child, isCape });
          }
        });
      };
      collectMeshes(j.cape, true);
      collectMeshes(j.hairPhysics, false);
    }

    const windIntensity = Math.min(1.8, speedRatio + (isJumping ? 0.45 : 0) + (this.attackTimer > 0 ? 0.5 : 0));
    const waveSpeed = 5.5 + windIntensity * 7.5;

    for (let mIdx = 0; mIdx < (this._deformableMeshes || []).length; mIdx++) {
      // หากตัวละครตัวนี้อยู่ไกลเกินระยะฟิสิกส์ที่ตั้งค่าไว้ ให้ข้ามการดัด Vertex เส้นผมและผ้าคลุมทันที
      const pPosRef = window.__AETHEL_PLAYER_POS;
      const maxPhysDistSq = window.__AETHEL_PHYSICS_DIST_SQ || 676; // ค่าเริ่มต้น 26 เมตร (26^2)
      if (pPosRef && this.root.position.distanceToSquared(pPosRef) > maxPhysDistSq) return;
      
      const { mesh, isCape } = this._deformableMeshes[mIdx];
      const posAttr = mesh.geometry.attributes.position;
      const orig = mesh.userData._origPos;
      if (!orig) continue;

      const anchorY = isCape ? 0.0 : 0.12;
      const maxSpan = isCape ? 1.05 : 0.95;

      for (let i = 0; i < posAttr.count; i++) {
        const idx = i * 3;
        const ox = orig[idx];
        const oy = orig[idx + 1];
        const oz = orig[idx + 2];

        // คำนวณระยะห่างจากโคนผม/คอปกเสื้อ (t = 0 คือโคนยึดติดหัว/ไหล่, t = 1 คือปลายสุด)
        const drop = Math.max(0, anchorY - oy);
        const t = THREE.MathUtils.clamp(drop / maxSpan, 0.0, 1.0);

        if (t <= 0.01) {
          posAttr.setXYZ(i, ox, oy, oz);
          continue;
        }

        const tCurve = t * t;
        const phase = this.animTime * waveSpeed - t * (isCape ? 4.8 : 5.6) + ox * 3.5 + mIdx * 0.7;

        // 1. คลื่นสะบัดขึ้น-ลง และดัดโค้งปลายงอนรับลม (แก้ปัญหาเส้นตรงแข็งทื่อ)
        const windBendZ = -tCurve * (0.03 + windIntensity * (isCape ? 0.22 : 0.18));
        const travelingWaveZ = Math.sin(phase) * (0.016 + windIntensity * (isCape ? 0.085 : 0.068)) * Math.pow(t, 1.15);
        const stepBounceZ = stepWave * (0.015 + windIntensity * 0.045) * tCurve;

        // 2. ยกปลายพริ้วขึ้นตามแรงลมและจังหวะก้าววิ่ง
        const liftY = tCurve * (0.015 + windIntensity * 0.085) + Math.cos(phase) * 0.025 * windIntensity * t;

        // 3. พลิ้วส่ายซ้าย-ขวาและแผ่ปลายออกเมื่อวิ่งเร็ว
        const swayX = Math.cos(phase * 0.8) * (0.010 + windIntensity * 0.042) * Math.pow(t, 1.2);
        const flareX = ox * (windIntensity * (isCape ? 0.20 : 0.15) * tCurve);
        const turnWhipX = THREE.MathUtils.clamp(-turnDelta * 0.45, -0.18, 0.18) * tCurve;

        posAttr.setXYZ(
          i,
          ox + flareX + swayX + turnWhipX,
          oy + liftY,
          oz + windBendZ + travelingWaveZ + stepBounceZ
        );
      }
      posAttr.needsUpdate = true;
    }

    this.leanAngleZ = THREE.MathUtils.lerp(this.leanAngleZ, THREE.MathUtils.clamp(-turnDelta * 1.8, -0.22, 0.22), dt * 10);

    let state = this.animState;
    if (this.attackTimer > 0) {
      this.attackTimer -= dt;
      state = 'attack';
    } else if (isInWater) {
      state = 'swim';
    } else if (isJumping && state !== 'sit' && state !== 'sleep') {
      state = 'jump';
    } else if (speedRatio > 0.06 && state !== 'sit' && state !== 'sleep') {
      state = 'walk';
    }

    const wType = this.currentWeaponType || 'sword';
    const basePelvisY = 0.88 * (Number(this.config.legLength) || 1.0);
    const blend = Math.min(1, dt * 16);

    if (state !== 'attack' && this.slashTrailMesh) {
      this.slashTrailMesh.visible = false;
      if (j.weaponSocketR) lerpEuler(j.weaponSocketR.rotation, 0, 0, 0, blend);
    }

    if (state === 'attack') {
      const p = 1 - Math.max(0, this.attackTimer / this.attackDuration);
      const strikeEase = p < 0.22
        ? (p / 0.22) * 0.15
        : 0.15 + Math.pow((p - 0.22) / 0.78, 0.52) * 0.85;
      const swingArc = THREE.MathUtils.lerp(-1.0, 1.0, strikeEase);
      const impactBell = Math.sin(p * Math.PI);

      j.pelvis.rotation.x = THREE.MathUtils.lerp(j.pelvis.rotation.x, 0, blend);
      j.legL.rotation.x = -0.32 * impactBell;
      j.shinL.rotation.x = 0.45 * impactBell;
      j.legR.rotation.x = 0.28 * impactBell;
      j.shinR.rotation.x = 0.35 * impactBell;

      if (wType === 'sword' || wType === 'shield') {
        if (this.slashTrailMesh) {
          this.slashTrailMesh.visible = p > 0.16 && p < 0.86;
          this.slashTrailMesh.material.opacity = Math.sin(((p - 0.16) / 0.70) * Math.PI) * 0.82;
        }
        if (this.comboStep === 1) {
          j.pelvis.position.y = basePelvisY - 0.06 * impactBell;
          j.pelvis.rotation.y = swingArc * 0.28;
          if (j.waist) lerpEuler(j.waist.rotation, 0.14 * impactBell, swingArc * 0.36, -0.08 * swingArc, 0.65);
          lerpEuler(j.torso.rotation, 0.10 * impactBell, swingArc * 0.32, 0, 0.65);
          lerpEuler(j.head.rotation, 0.05, -swingArc * 0.28, 0, 0.65);
          j.armR.rotation.set(-0.95 + swingArc * 0.25, -swingArc * 1.15, -0.45 + swingArc * 0.55);
          j.foreArmR.rotation.set(-0.45 - (1 - Math.abs(swingArc)) * 0.35, 0, 0);
          if (j.weaponSocketR) j.weaponSocketR.rotation.set(0.35, 0, -Math.PI * 0.35);
          j.armL.rotation.set(0.25 * impactBell, 0, -0.35);
          j.foreArmL.rotation.set(-0.65, 0, 0);
          if (this.slashTrailMesh) this.slashTrailMesh.rotation.set(Math.PI / 2 + 0.22, -swingArc * 0.8, 0.25);
        } else if (this.comboStep === 2) {
          j.pelvis.position.y = basePelvisY - 0.04 * impactBell;
          j.pelvis.rotation.y = -swingArc * 0.32;
          if (j.waist) lerpEuler(j.waist.rotation, 0.10 * impactBell, -swingArc * 0.42, 0.10 * swingArc, 0.65);
          lerpEuler(j.torso.rotation, 0.08 * impactBell, -swingArc * 0.36, 0, 0.65);
          lerpEuler(j.head.rotation, 0.04, swingArc * 0.30, 0, 0.65);
          j.armR.rotation.set(-1.05 - swingArc * 0.35, swingArc * 1.20, 0.40 - swingArc * 0.65);
          j.foreArmR.rotation.set(-0.40 - (1 - Math.abs(swingArc)) * 0.30, 0, 0);
          if (j.weaponSocketR) j.weaponSocketR.rotation.set(0.42, 0, Math.PI * 0.38);
          j.armL.rotation.set(-0.35, 0.25, -0.28);
          j.foreArmL.rotation.set(-0.72, 0, 0);
          if (this.slashTrailMesh) this.slashTrailMesh.rotation.set(Math.PI / 2 - 0.28, swingArc * 0.9, -0.30);
        } else {
          const spinAng = strikeEase * Math.PI * 2;
          j.pelvis.position.y = basePelvisY + impactBell * 0.28;
          j.pelvis.rotation.y = spinAng;
          if (j.waist) j.waist.rotation.set(0.18 * impactBell, 0.22 * impactBell, 0);
          j.torso.rotation.set(0.14 * impactBell, 0.18 * impactBell, 0);
          j.head.rotation.set(0.08, 0, 0);
          j.armR.rotation.set(-1.35 + impactBell * 0.45, -0.35, -0.75);
          j.foreArmR.rotation.set(-0.25, 0, 0);
          if (j.weaponSocketR) j.weaponSocketR.rotation.set(0.48, 0, -Math.PI * 0.42);
          j.armL.rotation.set(-0.85, 0.35, 0.55);
          j.foreArmL.rotation.set(-0.55, 0, 0);
          if (this.slashTrailMesh) this.slashTrailMesh.rotation.set(Math.PI / 2, spinAng, 0);
        }
      } else if (wType === 'bow') {
        const drawPhase = p < 0.55 ? (p / 0.55) : 1.0 - ((p - 0.55) / 0.45);
        j.pelvis.rotation.y = -0.55;
        if (j.waist) j.waist.rotation.set(0.06, -0.25, 0);
        j.torso.rotation.set(0.05, -0.22, 0);
        j.head.rotation.set(0, 0.65, 0);
        j.armL.rotation.set(-Math.PI / 2, 0.42, 0);
        j.foreArmL.rotation.set(-0.08, 0, 0);
        j.armR.rotation.set(-Math.PI / 2 + 0.12, -0.35 - drawPhase * 0.45, 0);
        j.foreArmR.rotation.set(-1.15 * drawPhase, 0, 0);
      } else if (wType === 'staff' || wType === 'tome') {
        j.pelvis.rotation.y = swingArc * 0.18;
        if (j.waist) j.waist.rotation.set(0.10 * impactBell, swingArc * 0.25, 0);
        j.torso.rotation.set(0.08 * impactBell, swingArc * 0.22, 0);
        if (this.comboStep < 3) {
          j.armR.rotation.set(-1.35 - impactBell * 0.35, -swingArc * 0.55, -0.25);
          j.foreArmR.rotation.set(-0.35, 0, 0);
          j.armL.rotation.set(-0.85 * impactBell, 0.25, -0.22);
          j.foreArmL.rotation.set(-0.65, 0, 0);
        } else {
          j.pelvis.position.y = basePelvisY + impactBell * 0.22;
          j.armR.rotation.set(-2.15, 0, 0.15);
          j.foreArmR.rotation.set(-0.25, 0, 0);
          j.armL.rotation.set(-1.95, 0, -0.15);
          j.foreArmL.rotation.set(-0.25, 0, 0);
        }
      }
    } else if (state === 'sleep') {
      j.pelvis.position.y = THREE.MathUtils.lerp(j.pelvis.position.y, 0.56, blend);
      lerpEuler(j.pelvis.rotation, -Math.PI / 2, 0, 0, blend);
      if (j.waist) lerpEuler(j.waist.rotation, 0.04, 0, 0, blend);
      lerpEuler(j.torso.rotation, 0.04 + Math.sin(this.animTime * 1.8) * 0.015, 0, 0, blend);
      lerpEuler(j.head.rotation, 0.12, 0, 0, blend);
      lerpEuler(j.legL.rotation, 0.04, 0, -0.04, blend);
      lerpEuler(j.legR.rotation, 0.04, 0, 0.04, blend);
      lerpEuler(j.shinL.rotation, 0.08, 0, 0, blend);
      lerpEuler(j.shinR.rotation, 0.08, 0, 0, blend);
      lerpEuler(j.armL.rotation, -0.25, 0.25, 0.18, blend);
      lerpEuler(j.foreArmL.rotation, -0.85, 0, 0, blend);
      lerpEuler(j.armR.rotation, -0.25, -0.25, -0.18, blend);
      lerpEuler(j.foreArmR.rotation, -0.85, 0, 0, blend);
    } else if (state === 'harvest') {
      const t = this.animTime * 10;
      lerpEuler(j.pelvis.rotation, 0, 0, 0, blend);
      if (j.waist) lerpEuler(j.waist.rotation, 0.28 + Math.sin(t) * 0.18, 0, 0, blend);
      lerpEuler(j.torso.rotation, 0.20 + Math.sin(t) * 0.15, 0, 0, blend);
      j.armR.rotation.set(-1.4 + Math.sin(t) * 0.95, 0, 0);
      j.foreArmR.rotation.set(-0.75 - Math.cos(t) * 0.35, 0, 0);
      j.armL.rotation.set(-1.1 + Math.sin(t) * 0.75, 0, 0);
      j.foreArmL.rotation.set(-0.65, 0, 0);
    } else if (state === 'swim') {
      const t = this.animTime * 6.5;
      j.pelvis.position.y = 0.55 + Math.sin(t) * 0.08;
      lerpEuler(j.pelvis.rotation, 0, 0, 0, blend);
      if (j.waist) j.waist.rotation.set(0.35, Math.sin(t) * 0.15, 0);
      j.torso.rotation.x = 0.45;
      j.armL.rotation.x = -1.1 + Math.sin(t) * 0.85;
      j.foreArmL.rotation.x = -0.65 + Math.cos(t) * 0.35;
      j.armR.rotation.x = -1.1 + Math.cos(t) * 0.85;
      j.foreArmR.rotation.x = -0.65 + Math.sin(t) * 0.35;
      j.legL.rotation.x = Math.sin(t * 1.5) * 0.48;
      j.shinL.rotation.x = 0.35 + Math.max(0, Math.cos(t * 1.5) * 0.4);
      j.legR.rotation.x = -Math.sin(t * 1.5) * 0.48;
      j.shinR.rotation.x = 0.35 + Math.max(0, -Math.cos(t * 1.5) * 0.4);
    } else if (state === 'sit') {
      j.pelvis.position.y = THREE.MathUtils.lerp(j.pelvis.position.y, 0.52, blend);
      lerpEuler(j.pelvis.rotation, 0, 0, 0, blend);
      if (j.waist) lerpEuler(j.waist.rotation, 0.04, 0, 0, blend);
      lerpEuler(j.torso.rotation, 0.02 + Math.sin(this.animTime * 2.0) * 0.015, 0, 0, blend);
      lerpEuler(j.head.rotation, Math.sin(this.animTime * 1.6) * 0.02, 0, 0, blend);
      lerpEuler(j.legL.rotation, -Math.PI / 2.05, 0.06, 0, blend);
      lerpEuler(j.legR.rotation, -Math.PI / 2.05, -0.06, 0, blend);
      lerpEuler(j.shinL.rotation, Math.PI / 2.05, 0, 0, blend);
      lerpEuler(j.shinR.rotation, Math.PI / 2.05, 0, 0, blend);
      lerpEuler(j.armL.rotation, -0.32, 0.15, 0.08, blend);
      lerpEuler(j.foreArmL.rotation, -0.68, 0.22, 0, blend);
      lerpEuler(j.armR.rotation, -0.32, -0.15, -0.08, blend);
      lerpEuler(j.foreArmR.rotation, -0.68, -0.22, 0, blend);
    } else if (state === 'wave') {
      const t = this.animTime * 9;
      j.pelvis.position.y = THREE.MathUtils.lerp(j.pelvis.position.y, basePelvisY, blend);
      lerpEuler(j.pelvis.rotation, 0, 0, 0, blend);
      if (j.waist) j.waist.rotation.set(0, Math.sin(t * 0.5) * 0.08, 0.05);
      j.armR.rotation.set(-2.1, 0, 0.25 + Math.sin(t) * 0.35);
      j.foreArmR.rotation.set(-0.65 + Math.cos(t) * 0.25, 0, Math.sin(t) * 0.35);
      j.armL.rotation.set(0.08, 0, -0.12);
      j.foreArmL.rotation.set(-0.35, 0, 0);
    } else if (state === 'dance') {
      const t = this.animTime * 8;
      j.pelvis.position.y = basePelvisY + Math.abs(Math.sin(t)) * 0.12;
      j.pelvis.rotation.set(0, 0, Math.sin(t) * 0.12);
      if (j.waist) {
        j.waist.rotation.y = Math.sin(t * 0.5) * 0.32;
        j.waist.rotation.z = -Math.sin(t) * 0.14;
      }
      j.torso.rotation.y = Math.cos(t * 0.5) * 0.28;
      j.armL.rotation.set(-1.8 + Math.sin(t) * 0.45, 0, -0.28);
      j.foreArmL.rotation.set(-0.75 + Math.cos(t) * 0.35, 0, 0);
      j.armR.rotation.set(-1.8 - Math.sin(t) * 0.45, 0, 0.28);
      j.foreArmR.rotation.set(-0.75 - Math.cos(t) * 0.35, 0, 0);
      j.legL.rotation.x = Math.sin(t) * 0.42;
      j.shinL.rotation.x = Math.max(0, -Math.cos(t) * 0.55);
      j.legR.rotation.x = -Math.sin(t) * 0.42;
      j.shinR.rotation.x = Math.max(0, Math.cos(t) * 0.55);
    } else if (state === 'kneel') {
      j.pelvis.position.y = THREE.MathUtils.lerp(j.pelvis.position.y, 0.54, blend);
      lerpEuler(j.pelvis.rotation, 0, 0, 0, blend);
      if (j.waist) j.waist.rotation.set(0.18, 0, 0);
      j.legL.rotation.x = -Math.PI / 2;
      j.shinL.rotation.x = Math.PI / 2;
      j.legR.rotation.x = 0.2;
      j.shinR.rotation.x = 1.4;
      j.armL.rotation.set(-0.4, 0.2, 0);
      j.foreArmL.rotation.set(-0.8, 0, 0);
      j.armR.rotation.set(-0.4, -0.2, 0);
      j.foreArmR.rotation.set(-0.8, 0, 0);
      j.head.rotation.x = 0.32;
    } else if (state === 'jump') {
      lerpEuler(j.pelvis.rotation, 0, 0, 0, blend);
      if (j.waist) lerpEuler(j.waist.rotation, 0.12, 0, 0, blend);
      lerpEuler(j.legL.rotation, -0.55, 0, 0, blend);
      lerpEuler(j.shinL.rotation, 0.85, 0, 0, blend);
      lerpEuler(j.legR.rotation, 0.22, 0, 0, blend);
      lerpEuler(j.shinR.rotation, 0.55, 0, 0, blend);
      lerpEuler(j.armL.rotation, -0.65, 0, -0.25, blend);
      lerpEuler(j.foreArmL.rotation, -0.55, 0, 0, blend);
      lerpEuler(j.armR.rotation, -0.65, 0, 0.25, blend);
      lerpEuler(j.foreArmR.rotation, -0.55, 0, 0, blend);
    } else if (state === 'walk') {
      // ==================== อนิเมชั่นเดิน -> วิ่ง -> สปรินต์เต็มสปีด (Natural Run & Sprint) ====================
      // รองรับทั้งปุ่มพรีวิววิ่ง (0.85), วิ่งปกติ (0.8-1.0) และกด Shift สปรินต์ (> 1.1)
      const runFactor = THREE.MathUtils.smoothstep(speedRatio, 0.35, 0.95);
      const sprintFactor = THREE.MathUtils.smoothstep(speedRatio, 1.05, 2.1);

      // สะสมเฟสการก้าวต่อเนื่อง ป้องกันขากระตุกเวลาเปลี่ยนความเร็ว
      const freq = THREE.MathUtils.lerp(8.5, 14.5, runFactor) + sprintFactor * 3.5;
      this.walkCyclePhase = (this.walkCyclePhase || 0) + dt * freq;
      const t = this.walkCyclePhase;

      const amp = Math.min(1.35, Math.max(0.45, speedRatio * 0.95));

      // stride > 0 = ขาซ้ายก้าวไปหน้า (-X rot) / ขาขวาถีบไปหลัง (+X rot)
      const stride = Math.sin(t);
      const stepImpact = Math.sin(t * 2); // จังหวะลงเท้า 2 ครั้งต่อรอบก้าว
      const flightBounce = Math.abs(Math.sin(t)); // ตัวลอยขึ้นช่วงกลางก้าวและย่อลงตอนเท้าแตะพื้น

      // 1. สะโพก (Pelvis): เด้งขึ้นลง + บิดสะโพกส่งขา + เอียงรับน้ำหนักเท้า
      const bounceAmp = THREE.MathUtils.lerp(0.035, 0.085, runFactor) + sprintFactor * 0.025;
      const crouchOffset = (runFactor * 0.035) + (sprintFactor * 0.03);
      j.pelvis.position.y = THREE.MathUtils.lerp(
        j.pelvis.position.y,
        basePelvisY - crouchOffset + (flightBounce - 0.35) * bounceAmp * amp,
        blend
      );

      const pelvisLeanX = THREE.MathUtils.lerp(0.03, 0.14, runFactor) + sprintFactor * 0.08;
      const pelvisTwistY = stride * THREE.MathUtils.lerp(0.08, 0.18, runFactor) * amp;
      const pelvisRollZ = stride * 0.055 * amp;
      lerpEuler(j.pelvis.rotation, pelvisLeanX, pelvisTwistY, pelvisRollZ, blend);

      // 2. เอว (Waist) และ หน้าอก (Torso): โน้มตัวพุ่งไปข้างหน้า + บิดไหล่สวนทางกับสะโพก
      const waistLeanX = THREE.MathUtils.lerp(0.06, 0.24, runFactor) + sprintFactor * 0.12 + stepImpact * 0.03 * runFactor;
      const waistTwistY = -stride * THREE.MathUtils.lerp(0.12, 0.26, runFactor) * amp;
      if (j.waist) {
        lerpEuler(
          j.waist.rotation,
          waistLeanX,
          waistTwistY,
          -pelvisRollZ * 0.6 + this.leanAngleZ * 0.5,
          blend
        );
      }

      const torsoLeanX = THREE.MathUtils.lerp(0.05, 0.20, runFactor) + sprintFactor * 0.10 + stepImpact * 0.025 * runFactor;
      const torsoTwistY = -stride * THREE.MathUtils.lerp(0.10, 0.22, runFactor) * amp;
      lerpEuler(
        j.torso.rotation,
        torsoLeanX,
        torsoTwistY,
        this.leanAngleZ * 0.5 - stride * 0.04 * runFactor,
        blend
      );

      // 3. ศีรษะ (Head): เงยหน้าชดเชยการโน้มตัวเพื่อมองตรงไปข้างหน้า และนิ่งขึ้นเวลาวิ่ง
      const headCompensateX = -(waistLeanX + torsoLeanX) * 0.68 + stepImpact * 0.025 * runFactor;
      const headCompensateY = stride * THREE.MathUtils.lerp(0.08, 0.20, runFactor) * amp;
      lerpEuler(j.head.rotation, headCompensateX, headCompensateY, -this.leanAngleZ * 0.25, blend);

      // 4. ขาและหัวเข่า (Legs & Knees): ก้าวยาว ยกเข่าสูงจังหวะชักขาไปหน้า และเหยียดถีบพื้นตอนส่งตัว
      const legSwingAmp = THREE.MathUtils.lerp(0.55, 0.95, runFactor) + sprintFactor * 0.18;
      const hipForwardBias = -0.08 * runFactor; // ยกต้นขาไปด้านหน้าเล็กน้อยตอนวิ่ง

      // ขาซ้ายก้าวหน้าเมื่อ stride > 0 (rotation.x ติดลบ = ยกไปข้างหน้า)
      const legPitchL = -stride * legSwingAmp * amp + hipForwardBias;
      const legPitchR = stride * legSwingAmp * amp + hipForwardBias;
      lerpEuler(j.legL.rotation, legPitchL, 0, -pelvisRollZ * 0.5, blend);
      lerpEuler(j.legR.rotation, legPitchR, 0, -pelvisRollZ * 0.5, blend);

      // พับเข่าสูงเฉพาะจังหวะเหวี่ยงขาจากหลังมาหน้า (cos(t) > 0 สำหรับขาซ้าย)
      const kneeBendAmp = THREE.MathUtils.lerp(0.62, 1.28, runFactor) + sprintFactor * 0.20;
      const kneeLiftL = Math.max(0, Math.cos(t - 0.25)) * kneeBendAmp + Math.max(0, stride) * 0.22 * runFactor;
      const kneeLiftR = Math.max(0, -Math.cos(t - 0.25)) * kneeBendAmp + Math.max(0, -stride) * 0.22 * runFactor;
      lerpEuler(j.shinL.rotation, (0.12 + kneeLiftL) * amp, 0, 0, blend);
      lerpEuler(j.shinR.rotation, (0.12 + kneeLiftR) * amp, 0, 0, blend);

      // 5. การแกว่งแขนและพับข้อศอก (Dynamic Arm Swing & Elbow Pump)
      // เมื่อขาซ้ายไปหน้า (stride > 0) -> แขนขวาพุ่งไปหน้า (armPitchR < 0) และแขนซ้ายเหวี่ยงไปหลัง (armPitchL > 0)
      const armSwingAmp = THREE.MathUtils.lerp(0.48, 0.92, runFactor) + sprintFactor * 0.18;
      const rightHandFree = this.isWeaponSheathed;
      const rWeaponFactor = rightHandFree ? 1.0 : 0.72; // ถ้ารวมอาวุธยังแกว่งแขนได้ชัดเจนแต่กระชับขึ้น

      const armPitchL = stride * armSwingAmp * amp - (0.10 * runFactor);
      const armPitchR = (-stride * armSwingAmp * amp * rWeaponFactor) - (rightHandFree ? 0.10 * runFactor : 0.22);

      // หุบแขนเข้าหากลางอกเล็กน้อยจังหวะแกว่งขึ้นหน้า และกางออกเล็กน้อยจังหวะดึงศอกไปหลัง
      const armInwardL = Math.max(0, -stride) * 0.22 * runFactor;
      const armInwardR = -Math.max(0, stride) * 0.22 * runFactor * rWeaponFactor;

      lerpEuler(j.armL.rotation, armPitchL, armInwardL, THREE.MathUtils.lerp(-0.08, -0.15, runFactor), blend);
      lerpEuler(j.armR.rotation, armPitchR, armInwardR, THREE.MathUtils.lerp(0.08, 0.15, runFactor), blend);

      // ข้อศอกพับกระชับขึ้นตามความเร็ว และงอเข้าเมื่อเหวี่ยงหมัดขึ้นหน้า
      const baseElbow = THREE.MathUtils.lerp(-0.35, -1.15, runFactor) - sprintFactor * 0.15;
      const elbowPumpL = Math.max(0, -stride) * 0.45 * amp;
      const elbowPumpR = Math.max(0, stride) * 0.45 * amp * rWeaponFactor;

      lerpEuler(j.foreArmL.rotation, baseElbow - elbowPumpL, 0.15 * runFactor, 0, blend);
      lerpEuler(
        j.foreArmR.rotation,
        (rightHandFree ? baseElbow : baseElbow * 0.85) - elbowPumpR,
        -0.15 * runFactor,
        0,
        blend
      );
    } else {
      const t = this.animTime * 2.2;
      j.pelvis.position.y = THREE.MathUtils.lerp(j.pelvis.position.y, basePelvisY + Math.sin(t) * 0.015, blend);
      lerpEuler(j.pelvis.rotation, 0, 0, 0, blend);

      if (j.waist) {
        lerpEuler(j.waist.rotation, Math.sin(t) * 0.02, Math.sin(t * 0.5) * 0.035, 0, blend);
      }
      lerpEuler(j.torso.rotation, 0, Math.sin(t * 0.5) * 0.025, 0, blend);

      lerpEuler(j.legL.rotation, -0.03, 0, 0, blend);
      lerpEuler(j.legR.rotation, 0.03, 0, 0, blend);
      lerpEuler(j.shinL.rotation, 0.06, 0, 0, blend);
      lerpEuler(j.shinR.rotation, 0.06, 0, 0, blend);
      lerpEuler(j.head.rotation, Math.sin(t) * 0.02, 0, 0, blend);

      if (this.isWeaponSheathed) {
        lerpEuler(j.armL.rotation, 0.03 + Math.sin(t) * 0.025, 0, -0.07, blend);
        lerpEuler(j.foreArmL.rotation, -0.18 + Math.cos(t) * 0.02, 0.05, 0, blend);
        lerpEuler(j.armR.rotation, -0.03 + Math.cos(t) * 0.025, 0, 0.07, blend);
        lerpEuler(j.foreArmR.rotation, -0.18 + Math.sin(t) * 0.02, -0.05, 0, blend);
      } else if (wType === 'shield') {
        lerpEuler(j.armL.rotation, -0.42, 0.28, -0.10, blend);
        lerpEuler(j.foreArmL.rotation, -0.58, 0.14, 0, blend);
        lerpEuler(j.armR.rotation, -0.14 + Math.sin(t) * 0.03, 0, 0.12, blend);
        lerpEuler(j.foreArmR.rotation, -0.35, -0.08, 0, blend);
      } else if (wType === 'tome') {
        lerpEuler(j.armL.rotation, -0.52, 0.20, -0.08, blend);
        lerpEuler(j.foreArmL.rotation, -0.68, 0.14, 0, blend);
        lerpEuler(j.armR.rotation, -0.16 + Math.sin(t) * 0.04, 0, 0.10, blend);
        lerpEuler(j.foreArmR.rotation, -0.34, -0.08, 0, blend);
      } else {
        lerpEuler(j.armL.rotation, 0.05 + Math.sin(t) * 0.035, 0, -0.10, blend);
        lerpEuler(j.foreArmL.rotation, -0.30 + Math.cos(t) * 0.035, 0.10, 0, blend);
        lerpEuler(j.armR.rotation, -0.12 + Math.cos(t) * 0.035, 0, 0.12, blend);
        lerpEuler(j.foreArmR.rotation, -0.32 + Math.sin(t) * 0.035, -0.08, 0, blend);
      }
    }

    // ==================== อนิเมชั่นจังหวะเก็บอาวุธ / ชักอาวุธ แยกตามชนิดอาวุธ ====================
    if (this.sheatheAnimTimer > 0) {
      this.sheatheAnimTimer = Math.max(0, this.sheatheAnimTimer - dt);
      const p = 1.0 - (this.sheatheAnimTimer / this.sheatheAnimDuration);
      const bell = Math.sin(p * Math.PI);

      if (wType === 'sword') {
        // ดาบ: เอื้อมมือขวาข้ามลำตัวไปที่ฝักดาบข้างเอวซ้าย
        j.torso.rotation.y += bell * -0.38;
        j.armR.rotation.set(-0.35 * bell, 0.85 * bell, -0.65 * bell);
        j.foreArmR.rotation.set(-1.15 * bell, 0, 0);
      } else if (wType === 'shield' || wType === 'bow') {
        // โล่ / ธนู: ยกมือเอื้อมไปสะพาย/ปลดอาวุธจากด้านหลังไหล่
        j.torso.rotation.x += -0.12 * bell;
        j.armL.rotation.set(-2.35 * bell, 0.35 * bell, 0.45 * bell);
        j.foreArmL.rotation.set(-1.35 * bell, 0, 0);
        if (wType === 'shield') {
          j.armR.rotation.set(-2.25 * bell, -0.35 * bell, -0.45 * bell);
          j.foreArmR.rotation.set(-1.25 * bell, 0, 0);
        }
      } else if (wType === 'staff') {
        // คทา: ชูแขนร่ายเวทสลายคทาเป็นละอองแสง / เรียกคทาจากละอองแสง
        j.armR.rotation.set(-1.45 * bell, -0.35 * bell, 0.45 * bell);
        j.foreArmR.rotation.set(-0.45 * bell, 0, 0);
      } else if (wType === 'tome') {
        // สมุดเวท: ผายมือซ้ายส่งสมุดเวทให้ลอยตามตัวผู้เล่น
        j.armL.rotation.set(-1.25 * bell, 0.55 * bell, -0.35 * bell);
        j.foreArmL.rotation.set(-0.55 * bell, 0, 0);
      }
    }
  }
  
}
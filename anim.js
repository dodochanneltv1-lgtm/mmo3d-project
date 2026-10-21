// ==================== ไฟล์ใหม่: anim.js ====================
import * as THREE from 'three';

const activeMixers = [];
const animatedGates = [];

/**
 * ลงทะเบียน THREE.AnimationMixer สำหรับโมเดล 3D ออนไลน์ (ม้า, นกฟลามิงโก้, นกแก้ว)
 */
export function registerGLTFAnimation(rootMesh, animations, speed = 1.0) {
  if (!rootMesh || !animations || animations.length === 0) return null;
  const mixer = new THREE.AnimationMixer(rootMesh);
  const action = mixer.clipAction(animations[0]);
  action.play();
  const entry = { mixer, action, rootMesh, baseSpeed: speed };
  activeMixers.push(entry);
  return entry;
}

/**
 * อัปเดต AnimationMixer ของ Assets ออนไลน์ทั้งหมด + ประตูเมืองอัตโนมัติ
 */
export function updateAllOnlineAssetAnimations(dt, elapsedTime, playerPos) {
  for (let i = activeMixers.length - 1; i >= 0; i--) {
    const item = activeMixers[i];
    if (!item.rootMesh || !item.rootMesh.parent) {
      activeMixers.splice(i, 1);
      continue;
    }
    // หยุดคำนวณหากอยู่ไกลเกิน 120 เมตรเพื่อประหยัดเฟรมเรต
    const worldPos = new THREE.Vector3();
    item.rootMesh.getWorldPosition(worldPos);
    if (playerPos && worldPos.distanceToSquared(playerPos) > 14400) continue;

    const customMult = item.rootMesh.userData.animSpeedMultiplier ?? 1.0;
    if (customMult <= 0.05) {
      // ท่ายืนหายใจเบาๆ ตอนรถม้าจอดพัก
      item.rootMesh.position.y = Math.sin(elapsedTime * 2.5) * 0.03;
      item.mixer.update(dt * 0.12);
    } else {
      item.mixer.update(dt * item.baseSpeed * customMult);
    }
  }

  // อัปเดตบานประตูเหล็กซุ้มประตูเมือง (เปิดขึ้นอัตโนมัติเมื่อผู้เล่นเดินเข้าใกล้)
  for (let i = 0; i < animatedGates.length; i++) {
    const g = animatedGates[i];
    const dist = playerPos ? Math.hypot(playerPos.x - g.wx, playerPos.z - g.wz) : 999;
    const shouldOpen = dist < 16.0;
    const targetY = shouldOpen ? 6.2 : 0.0;
    g.barsMesh.position.y = THREE.MathUtils.lerp(g.barsMesh.position.y, targetY, dt * 5.0);
  }
}

/**
 * อัปเดตอนิเมชั่นตัวละคร: วิ่งก้มตัว 45 องศา (Math.PI / 4) + ฟิสิกส์เสื้อผ้า/กระโปรง/ผ้าคลุมพลิ้วสมจริง
 */
export function applyAdvancedCharacterAndClothAnim(charInstance, dt, speedRatio = 0, isJumping = false, isInWater = false, turnDelta = 0, clothPhysicsEnabled = true) {
  if (!charInstance || !charInstance.joints) return;
  const t = charInstance.animTime || 0;
  const j = charInstance.joints;
  const isSprinting = speedRatio > 1.15 && !isJumping && !isInWater && charInstance.attackTimer <= 0;

  // 1. ตอนวิ่งไว (Sprint) ก้มตัวไปข้างหน้า 45 องศา (0.785 เรเดียน)
  if (isSprinting) {
    const sprintFactor = Math.min(1.0, (speedRatio - 1.0) / 1.4);
    const lean45Rad = (Math.PI / 4) * sprintFactor; // 45 องศาเป๊ะ
    const runCycle = t * 15.0;

    if (j.torso) {
      j.torso.rotation.x = THREE.MathUtils.lerp(j.torso.rotation.x, lean45Rad, 0.45);
      j.torso.rotation.y = Math.sin(runCycle) * 0.16;
    }
    if (j.head) {
      // เงยหน้าขึ้นชดเชยมุมก้ม 45 องศา เพื่อมองทางข้างหน้า
      j.head.rotation.x = THREE.MathUtils.lerp(j.head.rotation.x, -lean45Rad * 0.65, 0.45);
    }
    if (j.shoulderL && j.shoulderR) {
      j.shoulderL.rotation.x = Math.sin(runCycle) * 1.45;
      j.shoulderR.rotation.x = -Math.sin(runCycle) * 1.45;
    }
    if (j.hipL && j.hipR) {
      j.hipL.rotation.x = -Math.sin(runCycle) * 1.35 - 0.25;
      j.hipR.rotation.x = Math.sin(runCycle) * 1.35 - 0.25;
    }
  }

  // Animate authored outfit pivots instead of rotating arbitrary body meshes.
  const fashionParts = clothPhysicsEnabled ? (charInstance.fashionMotionParts || []) : [];
  const waveSpeed = 3.6 + Math.min(1.8, speedRatio) * 4.2;
  const isSitting = charInstance.animState === 'sit';
  const turnVelocity = charInstance.turnVelocity || 0;
  const playerPos = window.__AETHEL_PLAYER_POS;
  const maxClothDistSq = window.__AETHEL_PHYSICS_DIST_SQ || 676;
  const simulateClothVertices = !playerPos || charInstance.root.position.distanceToSquared(playerPos) <= maxClothDistSq;
  for (let i = 0; i < fashionParts.length; i++) {
    const part = fashionParts[i];
    const object = part.object;
    if (!object) continue;
    const phase = part.phase;
    const wave = Math.sin(t * waveSpeed + phase);
    const sway = Math.cos(t * (waveSpeed * 0.78) + phase);
    const base = part.baseRotation;

    if (part.type === 'top') {
      const position = part.clothMesh?.geometry.attributes.position;
      const original = part.clothOriginalPositions;
      if (position && original && charInstance.root.visible && simulateClothVertices) {
        const height = part.clothMesh.geometry.parameters.height || 0.58;
        const wind = 0.55 + Math.min(1.5, speedRatio);
        for (let vertex = 0; vertex < position.count; vertex++) {
          const offset = vertex * 3;
          const x = original[offset];
          const y = original[offset + 1];
          const z = original[offset + 2];
          const hemWeight = THREE.MathUtils.smoothstep(height - y, height * 0.42, height * 0.92);
          const ripple = Math.sin(t * (4.6 + wind * 2.4) + x * 6.5 + z * 4.0 + phase);
          position.setXYZ(
            vertex,
            x + Math.sin(t * 3.0 + z * 5.0 + phase) * 0.006 * hemWeight,
            y + ripple * 0.008 * wind * hemWeight,
            z + ripple * 0.012 * wind * hemWeight
          );
        }
        position.needsUpdate = true;
        part.clothMesh.geometry.computeVertexNormals();
      }
    } else if (part.type === 'skirt') {
      const motion = 0.07 + Math.min(1.6, speedRatio) * 0.075;
      object.rotation.x = base.x + (isSitting ? 0 : -Math.min(0.25, speedRatio * 0.12)) + wave * (isSitting ? 0.025 : motion);
      object.rotation.z = base.z - THREE.MathUtils.clamp(turnVelocity * 0.055, -0.24, 0.24) + sway * (isSitting ? 0.055 : motion * 1.15);
      object.position.y = part.basePosition.y + Math.sin(t * 3.2 + phase) * (isSitting ? 0.006 : 0.012 + Math.min(1.2, speedRatio) * 0.018);
      object.scale.set(
        part.baseScale.x * (isSitting ? 1.12 : 1),
        part.baseScale.y,
        part.baseScale.z * (isSitting ? 1.10 : 1)
      );

      const clothMesh = part.clothMesh;
      const position = clothMesh?.geometry.attributes.position;
      const original = part.clothOriginalPositions;
      if (position && original && charInstance.root.visible && simulateClothVertices) {
        const length = clothMesh.geometry.parameters.height || 0.4;
        const wind = 0.65 + Math.min(1.8, speedRatio);
        const rootScaleX = Math.abs(charInstance.root.scale.x) || 1;
        const rootScaleY = Math.abs(charInstance.root.scale.y) || 1;
        const rootScaleZ = Math.abs(charInstance.root.scale.z) || 1;
        for (let vertex = 0; vertex < position.count; vertex++) {
          const offset = vertex * 3;
          const x = original[offset];
          const y = original[offset + 1];
          const z = original[offset + 2];
          const drop = THREE.MathUtils.clamp((length * 0.5 - y) / length, 0, 1);
          const angle = Math.atan2(x, z);
          const front = THREE.MathUtils.clamp(z / (Math.hypot(x, z) || 1), 0, 1);
          const clothWave = Math.sin(t * (5.5 + wind * 2.0) - drop * 4.2 + angle * 2.0 + phase);
          const amplitude = (0.018 + wind * 0.024) * drop;
          const flare = 1 + drop * (0.045 + wind * 0.035) + Math.max(0, clothWave) * drop * 0.035;
          let clothY = y + clothWave * amplitude;
          let clothZ = z * flare + clothWave * amplitude * 0.75;
          if (isSitting) {
            clothZ += front * drop * 0.13;
            const seatCoverage = Math.max(
              Math.abs(x) / (0.24 / rootScaleX),
              Math.abs(z) / (0.23 / rootScaleZ)
            );
            const seatBlend = 1 - THREE.MathUtils.smoothstep(seatCoverage, 0.88, 1.16);
            const seatTopInSkirtSpace = 0.535 / rootScaleY - j.pelvis.position.y - object.position.y;
            const clearY = Math.max(clothY, seatTopInSkirtSpace + 0.018 / rootScaleY);
            clothY = THREE.MathUtils.lerp(clothY, clearY, seatBlend);
          }
          position.setXYZ(
            vertex,
            x * flare,
            clothY,
            clothZ
          );
        }
        position.needsUpdate = true;
        clothMesh.geometry.computeVertexNormals();
      }
    } else if (part.type === 'bow') {
      object.rotation.x = base.x + wave * 0.10;
      object.rotation.z = base.z + sway * 0.16 - turnVelocity * 0.04;
    } else if (part.type === 'armor') {
      object.rotation.x = base.x + wave * 0.045;
      object.rotation.z = base.z + sway * 0.055 - turnVelocity * 0.018;
    } else if (part.type === 'halo') {
      object.position.y = part.basePosition.y + Math.sin(t * 2.2 + phase) * 0.035;
      object.rotation.y = base.y + t * 0.45;
    } else if (part.type === 'wing') {
      const wingSide = object.userData.wingSide || 1;
      const movement = Math.min(1, speedRatio * 0.55);
      const jumpLift = isJumping ? 0.24 : 0;
      const sitFold = isSitting ? 0.13 : 0;
      object.rotation.y = base.y + wingSide * (0.1 + movement * 0.12 + sitFold) +
        Math.sin(t * (3.4 + movement * 5.2) + phase) * (0.035 + movement * 0.16 + (isJumping ? 0.13 : 0));
      object.rotation.z = base.z + jumpLift + Math.sin(t * 2.6 + phase) * 0.055 -
        THREE.MathUtils.clamp(turnVelocity * 0.04, -0.12, 0.12);
      object.rotation.x = base.x + Math.cos(t * 3.1 + phase) * (0.025 + movement * 0.07);
    } else if (part.type === 'hat') {
      object.position.y = part.basePosition.y + Math.sin(t * 2.0 + phase) * 0.012;
      object.rotation.z = base.z + sway * 0.018 - turnVelocity * 0.01;
    }
  }

  const turnImpulse = THREE.MathUtils.clamp(turnVelocity * 0.065, -0.24, 0.24);
  const turnPose = {
    waistY: -turnImpulse * 0.45,
    torsoY: -turnImpulse,
    torsoZ: turnImpulse * 0.30
  };
  if (j.waist) j.waist.rotation.y += turnPose.waistY;
  if (j.torso) {
    j.torso.rotation.y += turnPose.torsoY;
    j.torso.rotation.z = THREE.MathUtils.clamp(j.torso.rotation.z + turnPose.torsoZ, -0.24, 0.24);
  }
  charInstance._advancedTurnPose = turnPose;

  if (clothPhysicsEnabled && j.cape) {
    const capeLift = isSprinting ? 0.85 : Math.min(0.55, speedRatio * 0.32);
    j.cape.rotation.x = 0.14 + capeLift + Math.sin(t * (6.0 + speedRatio * 4.0)) * (0.06 + speedRatio * 0.09);
    j.cape.rotation.z = THREE.MathUtils.clamp(-turnVelocity * 0.055, -0.30, 0.30);
  }
}

/**
 * สร้างลูกกรงประตูเมืองที่เลื่อนเปิด-ปิดอัตโนมัติ และลบ Collider ที่ขวางทางออกประตูเมืองทั้งหมด
 */
export function unlockAndAnimateCityGates(TOWNS, worldGroup, worldNoise, worldColliders) {
  const gateDirs = [
    { x: 0, z: 1 }, { x: 0, z: -1 }, { x: 1, z: 0 }, { x: -1, z: 0 }
  ];

  // 1) ลบ Collider ทุกตัวที่ขวางอยู่บริเวณช่องประตูเมืองทั้ง 4 ทิศของทุกเมือง
  for (let i = worldColliders.length - 1; i >= 0; i--) {
    const col = worldColliders[i];
    if (col.x === undefined || col.z === undefined) continue;
    for (const town of TOWNS) {
      for (const dir of gateDirs) {
        const gx = town.x + dir.x * (town.radius - 6);
        const gz = town.z + dir.z * (town.radius - 6);
        // ถ้า Collider อยู่ในรัศมีถนนลอดซุ้มประตูเมือง (กว้าง 6.2 เมตร) ให้ปลดล็อกทันที!
        if (Math.hypot(col.x - gx, col.z - gz) < 5.2) {
          col.disabled = true;
          worldColliders.splice(i, 1);
          break;
        }
      }
    }
  }

  // 2) สร้างแผงประตูเหล็กเลื่อนเปิดอัตโนมัติเมื่อผู้เล่นเดินเข้าใกล้
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8, roughness: 0.3 });
  TOWNS.forEach((town) => {
    gateDirs.forEach((dir) => {
      const gx = town.x + dir.x * (town.radius - 6);
      const gz = town.z + dir.z * (town.radius - 6);
      const gy = worldNoise.getHeight(gx, gz);

      const gateHolder = new THREE.Group();
      gateHolder.position.set(gx, gy, gz);
      gateHolder.rotation.y = Math.atan2(dir.x, dir.z);

      const barsGroup = new THREE.Group();
      for (let bx = -3.6; bx <= 3.6; bx += 0.9) {
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 6.5, 8), ironMat);
        bar.position.set(bx, 3.25, 0);
        barsGroup.add(bar);
      }
      const crossBar = new THREE.Mesh(new THREE.BoxGeometry(8.0, 0.25, 0.25), ironMat);
      crossBar.position.set(0, 5.5, 0);
      barsGroup.add(crossBar);

      gateHolder.add(barsGroup);
      worldGroup.add(gateHolder);
      animatedGates.push({ wx: gx, wz: gz, barsMesh: barsGroup });
    });
  });
}
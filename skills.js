import * as THREE from 'three';

// ฟังก์ชันหมุนมุมตัวละครแบบ Shortest-Path Lerp (แก้ปัญหาตัวละครหันปึบปับหรือหมุนกลับด้าน 360 องศา)
export function smoothRotateAngle(currentAngle, targetAngle, speedDt) {
  let diff = ((targetAngle - currentAngle + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return currentAngle + diff * Math.min(1.0, speedDt);
}

// สตูดิโอสังเคราะห์เสียงเอฟเฟกต์หลายเลเยอร์ (Multi-Layered Noise + FM + Filter Sweep Sound Engine)
export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.bgmTimer = null;
    this.noiseBuffer = null;
    this.assetCache = new Map();
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
      // สร้าง White/Pink Noise Buffer สำหรับเสียงลมดาบ เสียงน้ำกระจาย และเสียงระเบิดเวทมนตร์
      const sr = this.ctx.sampleRate;
      this.noiseBuffer = this.ctx.createBuffer(1, sr * 1.5, sr);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  playFilteredNoise(duration = 0.2, filterType = 'bandpass', startFreq = 1200, endFreq = 300, vol = 0.16, Q = 2.5) {
    if (!this.enabled) return;
    this.init();
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.Q.setValueAtTime(Q, now);
    filter.frequency.setValueAtTime(startFreq, now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), now + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    src.start(now);
    src.stop(now + duration);
  }

  playTone(freq, type = 'sine', duration = 0.18, vol = 0.1, slideTo = null) {
    if (!this.enabled) return;
    this.init();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), now + duration);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  sfxClick() {
    this.playTone(880, 'sine', 0.06, 0.07, 1320);
  }

  sfxSculpt() {
    this.playTone(540, 'triangle', 0.04, 0.04, 620);
  }

  sfxStep() {
    this.playFilteredNoise(0.065, 'lowpass', 380, 120, 0.06, 1.0);
  }

  sfxJump() {
    this.playFilteredNoise(0.16, 'bandpass', 400, 1400, 0.12, 2.0);
    this.playTone(220, 'sine', 0.18, 0.08, 520);
  }

  sfxDash() {
    this.playFilteredNoise(0.22, 'bandpass', 1800, 280, 0.20, 1.8);
  }

  sfxSplash() {
    this.playFilteredNoise(0.38, 'bandpass', 950, 240, 0.22, 1.2);
  }

  sfxCombo(step, weaponType = 'sword') {
    if (weaponType === 'bow') {
      // เสียงดีดสายธนูและลูกศรแหวกอากาศ
      this.playFilteredNoise(0.15, 'bandpass', 2400, 600, 0.16, 3.0);
      this.playTone(190 + step * 40, 'triangle', 0.18, 0.10, 95);
    } else if (weaponType === 'staff' || weaponType === 'tome') {
      // เสียงร่ายเวทคริสตัลกังวาน
      this.playTone(520 + step * 110, 'sine', 0.24, 0.10, 1040 + step * 150);
      this.playFilteredNoise(0.18, 'bandpass', 1600, 2800, 0.10, 4.0);
    } else {
      // เสียงคมดาบ/ค้อนศึกแหวกอากาศหนักแน่น
      const whooshFreq = step === 1 ? 1400 : step === 2 ? 1800 : 2400;
      this.playFilteredNoise(step === 3 ? 0.28 : 0.18, 'bandpass', whooshFreq, 220, 0.22, 2.2);
      this.playTone(160 + step * 35, 'sawtooth', 0.15, 0.08, 65);
    }
  }

  sfxHit() {
    // เสียงปะทะเนื้อและเกราะโลหะหนักๆ
    this.playFilteredNoise(0.14, 'lowpass', 900, 110, 0.24, 1.5);
    this.playTone(110, 'triangle', 0.14, 0.18, 42);
    this.playTone(1480, 'sine', 0.06, 0.06, 820);
  }

  playAsset(path) {
    if (!this.enabled) return;
    let audio = this.assetCache.get(path);
    if (!audio) {
      audio = new Audio(path);
      audio.preload = 'auto';
      this.assetCache.set(path, audio);
    }
    const playback = audio.cloneNode();
    playback.volume = 0.7;
    playback.currentTime = 0;
    playback.play().catch(error => console.warn(`Unable to play audio asset "${path}":`, error));
  }

  sfxPunch(step) {
    const files = ['punch-attack1.mp3', 'punch-attack2.mp3', 'punch-attack3.mp3', 'punch-attack4.mp3'];
    this.playAsset(`./sound/effect/fighting/punch/${files[(step - 1) % files.length]}`);
  }

  sfxPunchSkill() {
    this.playAsset('./sound/effect/fighting/punch/punch-skill.mp3');
  }

  sfxPunchUltimate(finalHit = false) {
    this.playAsset(finalHit
      ? './sound/effect/fighting/punch/punch-ultimat-final%20attack.mp3'
      : './sound/effect/fighting/punch/punch-ultimate-hit%20target.mp3');
  }

  sfxSwordAttack(step) {
    const files = ['sword-attack1.mp3', 'sword-attack2.mp3', 'sword-attack3.mp3'];
    this.playAsset(`./sound/effect/fighting/sword/${files[(step - 1) % files.length]}`);
  }

  sfxSwordWave() {
    this.playAsset('./sound/effect/fighting/sword/sword-skill-wave.mp3');
  }

  sfxSwordUltimate() {
    this.playAsset('./sound/effect/fighting/sword/sword-ultimat-hit.mp3');
  }

  sfxHarvest() {
    // เสียงอีเตอร์ขุดแร่คริสตัล/ตัดไม้กังวาน
    this.playTone(1240, 'triangle', 0.12, 0.12, 1680);
    this.playFilteredNoise(0.09, 'bandpass', 2200, 800, 0.14, 3.5);
  }

  sfxCoin() {
    this.playTone(1046.5, 'sine', 0.09, 0.09, 1567.98);
    setTimeout(() => this.playTone(1567.98, 'sine', 0.14, 0.09, 2093.0), 55);
  }

  sfxMagic() {
    this.playFilteredNoise(0.32, 'bandpass', 800, 2600, 0.16, 3.2);
    this.playTone(440, 'sine', 0.28, 0.10, 880);
    setTimeout(() => this.playTone(659.25, 'triangle', 0.28, 0.09, 1318.5), 70);
  }

  sfxUltimate() {
    this.playFilteredNoise(0.65, 'lowpass', 1200, 80, 0.28, 1.4);
    [130.81, 196.0, 261.63, 329.63, 392.0, 523.25].forEach((f, i) => {
      setTimeout(() => this.playTone(f, 'sawtooth', 0.35, 0.09, f * 1.15), i * 50);
    });
  }

  sfxLevelUp() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      setTimeout(() => this.playTone(f, 'triangle', 0.32, 0.12, f * 1.02), i * 95);
    });
  }

  startBGM() {
    if (this.bgmTimer) return;
    const chords = [
      [261.63, 329.63, 392.00],
      [220.00, 261.63, 329.63],
      [174.61, 220.00, 261.63],
      [196.00, 246.94, 293.66]
    ];
    let idx = 0;
    this.bgmTimer = setInterval(() => {
      if (!this.enabled || document.hidden) return;
      const chord = chords[idx % chords.length];
      chord.forEach(freq => this.playTone(freq, 'sine', 1.8, 0.014));
      idx++;
    }, 2000);
  }
}

export const CLASSES = {
  fighter: {
    id: 'fighter', name: 'นักสู้มือเปล่า (Fighter)', allowedWeapon: 'gloves', defaultWeapon: 'gloves_brawler',
    desc: 'ต่อยคอมโบ 4 จังหวะ ชกรัว 10 ครั้ง และพุ่งโจมตีเป็นรูปดาวด้วยอัลติเมท',
    stats: { hp: 190, mp: 90, atk: 30, matk: 8, def: 18, spd: 15 },
    skills: {
      active: { name: 'หมัดพายุ 10 จังหวะ', icon: '🥊', mp: 22, cd: 10, mult: 0.72, color: 0xf97316 },
      passive: { name: 'นักสู้ (สะสมขั้นจากสกิล)', icon: '🔥' },
      ult: { name: 'ดาวตกหมัดสุริยัน', icon: '🌟', mp: 40, cd: 18, mult: 2.0, color: 0xfb7185 }
    }
  },
  swordsman: {
    id: 'swordsman', name: 'นักดาบ (Swordsman)', allowedWeapon: 'sword', defaultWeapon: 'sword_iron',
    desc: 'โจมตีปกติ 3 จังหวะ สะสมจิตวิญญาณนักดาบจากทุกฮิตและเพิ่มอีก 2 ขั้นในคอมโบที่ 3',
    stats: { hp: 170, mp: 65, atk: 26, matk: 8, def: 16, spd: 12 },
    skills: {
      active: { name: 'คลื่นดาบจันทร์เสี้ยว', icon: '🌙', mp: 15, cd: 5, mult: 2.2, color: 0xf59e0b },
      passive: { name: 'จิตวิญญาณนักดาบ (สะสมขั้น)', icon: '⚔️' },
      ult: { name: 'ดาบสังหารต่อเนื่อง', icon: '🗡️', mp: 35, cd: 18, mult: 1.3, color: 0xef4444 }
    }
  },
  mage: {
    id: 'mage', name: 'นักเวท (Mage)', allowedWeapon: 'staff', defaultWeapon: 'staff_oak',
    desc: 'สลับธาตุทั้ง 7 เพื่อสร้างปฏิกิริยาธาตุ และบินได้โดยใช้มานา',
    stats: { hp: 110, mp: 150, atk: 8, matk: 34, def: 8, spd: 11 },
    skills: {
      active: { name: 'เปลี่ยนธาตุ', icon: '🔥', mp: 12, cd: 3.0, mult: 2.5, color: 0x38bdf8 },
      passive: { name: 'โบยบินด้วยพลังมานา', icon: '🪽' },
      ult: { name: 'มหาอุกกาบาตถล่มปฐพี', icon: '☄️', mp: 45, cd: 11, mult: 4.8, color: 0xa855f7 }
    }
  },
  support: {
    id: 'support', name: 'ซัพพอร์ท (Support)', allowedWeapon: 'tome', defaultWeapon: 'tome_holy',
    desc: 'รักษาเพื่อนที่อยู่ใกล้ และสร้างเขตรักษาฟื้นฟูทีม 5% HP ต่อวินาที',
    stats: { hp: 140, mp: 140, atk: 10, matk: 26, def: 14, spd: 12 },
    skills: {
      active: { name: 'รักษาเป้าหมาย', icon: '💖', mp: 18, cd: 5, mult: 1.9, heal: 0, color: 0x34d399 },
      passive: { name: 'พลังฟื้นฟู (ดูดเลือด 10%)', icon: '🌿' },
      ult: { name: 'เขตรักษาศักดิ์สิทธิ์', icon: '🌟', mp: 40, cd: 20, mult: 0, heal: 0, color: 0xfde047 }
    }
  },
  tank: {
    id: 'tank', name: 'แทงค์ (Tank)', allowedWeapon: 'shield', defaultWeapon: 'shield_knight',
    desc: 'ทุบพื้นสตันศัตรู พร้อมสร้างโล่พลังงานให้ทีมและใช้มานาป้องกันเมื่อตกอยู่ในอันตราย',
    stats: { hp: 240, mp: 65, atk: 19, matk: 6, def: 30, spd: 10 },
    skills: {
      active: { name: 'ค้อนสะเทือนปฐพี', icon: '🔨', mp: 18, cd: 8, mult: 2.1, color: 0x60a5fa },
      passive: { name: 'มานารับความเสียหายเมื่อใกล้ตาย', icon: '🏰' },
      ult: { name: 'โล่พิทักษ์ทีม', icon: '🛡️', mp: 35, cd: 25, mult: 0, color: 0xfbbf24 }
    }
  },
  archer: {
    id: 'archer', name: 'อาร์เชอร์ (Archer)', allowedWeapon: 'bow', defaultWeapon: 'bow_hunter',
    desc: 'ชาร์จยิงธนู ฝนธนู และ Unlimited Blade Works พร้อมความเร็วเคลื่อนที่เพิ่ม 25%',
    stats: { hp: 120, mp: 85, atk: 29, matk: 10, def: 10, spd: 15 },
    skills: {
      active: { name: 'ฝนธนู', icon: '🏹', mp: 15, cd: 7, mult: 2.4, color: 0x4ade80 },
      passive: { name: 'สายลมกรด (+SPD)', icon: '🍃' },
      ult: { name: 'Unlimited Blade Works', icon: '⚔️', mp: 35, cd: 20, mult: 4.2, color: 0x22d3ee }
    }
  },
  classless: {
    id: 'classless', name: 'ไร้อาชีพ (Classless)', allowedWeapon: 'any', defaultWeapon: 'sword_iron',
    desc: 'ใช้อาวุธและสกิลตามอาวุธที่สวมใส่ได้ทุกชนิด แต่ไม่มีพาสซีฟของอาชีพ',
    stats: { hp: 100, mp: 50, atk: 10, matk: 10, def: 10, spd: 12 },
    skills: {
      active: { name: 'ศาสตราไร้ลักษณ์พุ่งชน', icon: '🌀', mp: 12, cd: 2.8, mult: 2.3, color: 0xe879f9 },
      passive: { name: 'ไม่มีพาสซีฟอาชีพ', icon: '🚫' },
      ult: { name: 'คลังศาสตราจักรพรรดิ', icon: '🌌', mp: 30, cd: 7.5, mult: 4.4, color: 0xf43f5e }
    }
  }
};

export class SkillFXManager {
  constructor(worldGroup) {
    this.worldGroup = worldGroup;
    this.activeFX = [];
  }

  faceTarget(playerRoot, targetPos) {
    if (!targetPos) return;
    const dx = targetPos.x - playerRoot.position.x;
    const dz = targetPos.z - playerRoot.position.z;
    if (Math.hypot(dx, dz) > 0.05) {
      playerRoot.rotation.y = Math.atan2(dx, dz);
    }
  }

  spawnClassSkillFX(classId, isUlt, startPos, targetPos, forwardAngle) {
    const dir = new THREE.Vector3(Math.sin(forwardAngle), 0, Math.cos(forwardAngle));
    const dest = targetPos ? targetPos.clone() : startPos.clone().addScaledVector(dir, 6);

    if (classId === 'fighter') {
      if (isUlt) {
        const star = new THREE.Group();
        const color = 0xfb7185;
        const radius = 5;
        const rotation = Math.atan2(startPos.x - dest.x, startPos.z - dest.z);
        const vertices = Array.from({ length: 5 }, (_, index) => {
          const angle = rotation + index * Math.PI * 2 / 5;
          return new THREE.Vector3(
            dest.x + Math.sin(angle) * radius,
            dest.y + 0.12,
            dest.z + Math.cos(angle) * radius
          );
        });
        const starPath = [0, 2, 4, 1, 3, 0].map(index => vertices[index]);
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(starPath),
          new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 })
        );
        star.add(line);
        vertices.forEach(vertex => {
          const spark = new THREE.Mesh(
            new THREE.SphereGeometry(0.14, 8, 6),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 })
          );
          spark.position.copy(vertex);
          star.add(spark);
        });
        this.worldGroup.add(star);
        this.activeFX.push({ type: 'star_path', mesh: star, age: 0, maxAge: 1.55 });
      } else {
        const strikeRing = new THREE.Group();
        for (let i = 0; i < 10; i++) {
          const angle = (i / 10) * Math.PI * 2;
          const pulse = new THREE.Mesh(
            new THREE.TorusGeometry(1.0, 0.045, 6, 18),
            new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.8 })
          );
          pulse.position.set(Math.cos(angle) * 0.28, 0.5 + i * 0.08, Math.sin(angle) * 0.28);
          pulse.rotation.x = Math.PI / 2;
          strikeRing.add(pulse);
        }
        strikeRing.position.copy(startPos);
        this.worldGroup.add(strikeRing);
        this.activeFX.push({ type: 'blade_vortex', mesh: strikeRing, age: 0, maxAge: 0.8 });
      }
    } else if (classId === 'swordsman') {
      if (!isUlt) {
        const crescent = new THREE.Mesh(
          new THREE.TorusGeometry(1.3, 0.12, 8, 24, Math.PI),
          new THREE.MeshBasicMaterial({ color: 0xf59e0b, side: THREE.DoubleSide })
        );
        crescent.position.copy(startPos).add(new THREE.Vector3(0, 1.1, 0));
        crescent.rotation.y = forwardAngle;
        this.worldGroup.add(crescent);
        this.activeFX.push({ type: 'projectile', mesh: crescent, vel: dir.multiplyScalar(22), age: 0, maxAge: 0.6 });
      } else {
        const giantSword = new THREE.Group();
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.45, 5.5, 0.15), new THREE.MeshBasicMaterial({ color: 0xfef08a }));
        const guard = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.3, 0.3), new THREE.MeshBasicMaterial({ color: 0xf59e0b }));
        guard.position.y = 2.2;
        giantSword.add(blade, guard);
        giantSword.position.set(dest.x, dest.y + 14, dest.z);
        this.worldGroup.add(giantSword);
        this.activeFX.push({ type: 'falling_sword', mesh: giantSword, targetY: dest.y + 1.8, age: 0, maxAge: 1.2 });
      }
    } else if (classId === 'mage') {
      if (!isUlt) {
        const fireball = new THREE.Mesh(
          new THREE.DodecahedronGeometry(0.55, 1),
          new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
        );
        fireball.position.copy(startPos).add(new THREE.Vector3(0, 1.3, 0));
        this.worldGroup.add(fireball);
        const toTarget = dest.clone().sub(startPos).normalize().multiplyScalar(20);
        this.activeFX.push({ type: 'projectile', mesh: fireball, vel: toTarget, age: 0, maxAge: 0.7 });
      } else {
        const meteor = new THREE.Mesh(
          new THREE.DodecahedronGeometry(2.2, 1),
          new THREE.MeshStandardMaterial({ color: 0x7c2d12, emissive: 0xf97316, emissiveIntensity: 1.2 })
        );
        meteor.position.set(dest.x - 4, dest.y + 18, dest.z - 4);
        this.worldGroup.add(meteor);
        this.activeFX.push({ type: 'meteor', mesh: meteor, dest: dest.clone(), age: 0, maxAge: 1.1 });
      }
    } else if (classId === 'archer') {
      if (!isUlt) {
        const arrowRain = new THREE.Group();
        for (let i = 0; i < 24; i++) {
          const arrow = new THREE.Mesh(
            new THREE.ConeGeometry(0.08, 1.2, 6),
            new THREE.MeshBasicMaterial({ color: 0x4ade80 })
          );
          arrow.position.set((Math.random() - 0.5) * 10, 5 + Math.random() * 4, (Math.random() - 0.5) * 10);
          arrow.rotation.x = Math.PI;
          arrowRain.add(arrow);
        }
        arrowRain.position.copy(dest);
        this.worldGroup.add(arrowRain);
        this.activeFX.push({ type: 'arrow_rain', mesh: arrowRain, age: 0, maxAge: 0.9 });
      } else {
        const rainGroup = new THREE.Group();
        for (let i = 0; i < 18; i++) {
          const sword = new THREE.Group();
          const blade = new THREE.Mesh(new THREE.BoxGeometry(0.10, 1.65, 0.055), new THREE.MeshBasicMaterial({ color: 0x67e8f9 }));
          blade.position.y = 0.55;
          const guard = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.09, 0.10), new THREE.MeshBasicMaterial({ color: 0xfbbf24 }));
          guard.position.y = -0.26;
          const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.42, 0.08), new THREE.MeshBasicMaterial({ color: 0x475569 }));
          grip.position.y = -0.5;
          sword.add(blade, guard, grip);
          sword.position.set((Math.random() - 0.5) * 12, 8 + Math.random() * 6, (Math.random() - 0.5) * 12);
          sword.rotation.z = Math.PI;
          rainGroup.add(sword);
        }
        rainGroup.position.copy(dest);
        this.worldGroup.add(rainGroup);
        this.activeFX.push({ type: 'arrow_rain', mesh: rainGroup, age: 0, maxAge: 0.9 });
      }
    } else if (classId === 'tank') {
      const count = isUlt ? 8 : 4;
      const spikeGroup = new THREE.Group();
      for (let i = 0; i < count; i++) {
        const ang = (i / count) * Math.PI * 2;
        const pillar = new THREE.Mesh(
          new THREE.ConeGeometry(0.55, isUlt ? 4.2 : 2.5, 6),
          new THREE.MeshStandardMaterial({ color: isUlt ? 0xfbbf24 : 0x60a5fa, emissive: isUlt ? 0xd97706 : 0x1d4ed8, emissiveIntensity: 0.5 })
        );
        pillar.position.set(Math.cos(ang) * 3.2, 1.0, Math.sin(ang) * 3.2);
        spikeGroup.add(pillar);
      }
      spikeGroup.position.copy(startPos);
      this.worldGroup.add(spikeGroup);
      this.activeFX.push({ type: 'rising_pillars', mesh: spikeGroup, age: 0, maxAge: 1.0 });
    } else if (classId === 'support') {
      const geo = isUlt ? new THREE.SphereGeometry(4.5, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2) : new THREE.CylinderGeometry(1.6, 1.6, 8, 24, 1, true);
      const dome = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: isUlt ? 0xfde047 : 0x34d399, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
      dome.position.copy(startPos);
      this.worldGroup.add(dome);
      this.activeFX.push({ type: 'holy_dome', mesh: dome, age: 0, maxAge: 1.1 });
    } else {
      const bladeRing = new THREE.Group();
      const num = isUlt ? 10 : 5;
      for (let i = 0; i < num; i++) {
        const ang = (i / num) * Math.PI * 2;
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.5, 0.06), new THREE.MeshBasicMaterial({ color: isUlt ? 0xf43f5e : 0xe879f9 }));
        b.position.set(Math.cos(ang) * 2.6, 1.3, Math.sin(ang) * 2.6);
        b.rotation.x = Math.PI / 3;
        bladeRing.add(b);
      }
      bladeRing.position.copy(startPos);
      this.worldGroup.add(bladeRing);
      this.activeFX.push({ type: 'blade_vortex', mesh: bladeRing, age: 0, maxAge: 1.0 });
    }
  }

  update(dt) {
    for (let i = this.activeFX.length - 1; i >= 0; i--) {
      const fx = this.activeFX[i];
      fx.age += dt;
      const p = fx.age / fx.maxAge;

      if (fx.type === 'projectile') {
        fx.mesh.position.addScaledVector(fx.vel, dt);
        fx.mesh.rotation.z += dt * 12;
      } else if (fx.type === 'falling_sword') {
        fx.mesh.position.y = Math.max(fx.targetY, fx.mesh.position.y - dt * 45);
      } else if (fx.type === 'meteor') {
        fx.mesh.position.lerp(fx.dest, dt * 7);
        fx.mesh.rotation.x += dt * 5;
        fx.mesh.rotation.y += dt * 5;
      } else if (fx.type === 'arrow_rain') {
        fx.mesh.position.y -= dt * 18;
      } else if (fx.type === 'rising_pillars') {
        fx.mesh.position.y = Math.sin(p * Math.PI) * 1.2;
      } else if (fx.type === 'holy_dome') {
        fx.mesh.rotation.y += dt * 3;
        fx.mesh.material.opacity = (1 - p) * 0.6;
      } else if (fx.type === 'blade_vortex') {
        fx.mesh.rotation.y += dt * 10;
        fx.mesh.scale.setScalar(1 + p * 0.8);
      } else if (fx.type === 'star_path') {
        fx.mesh.scale.setScalar(1 + Math.sin(p * Math.PI) * 0.08);
        fx.mesh.traverse(object => {
          if (object.material?.transparent) object.material.opacity = 0.95 * (1 - p);
        });
      }

      if (fx.age >= fx.maxAge) {
        this.worldGroup.remove(fx.mesh);
        this.activeFX.splice(i, 1);
      }
    }
  }
}
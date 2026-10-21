// ==================== ไฟล์ใหม่: fashion.js ====================
import * as THREE from 'three';
import { getVolumetricMistTexture } from './shaders.js';

export const FASHION_CATALOG = [
  { id: 'f_sailor', category: 'outfit', slot: 'body', occupies: ['top', 'bottom'], name: '🎀 ชุดกะลาสีโบว์แดงพรีเมียม', price: 250, key: 'fullOutfit', val: 'sailor_school', desc: 'ชุดกะลาสีโบว์แดงพร้อมกระโปรงพลีท' },
  { id: 'f_paladin', category: 'outfit', slot: 'body', occupies: ['top', 'bottom'], name: '🛡️ เกราะศักดิ์สิทธิ์พาราดินทองคำ', price: 580, key: 'fullOutfit', val: 'paladin_armor', desc: 'เกราะอัศวินทองคำพร้อมเกราะกระโปรง' },
  { id: 'f_archmage', category: 'outfit', slot: 'body', occupies: ['top', 'bottom'], name: '🔮 ชุดคลุมมหาจอมเวทดารา', price: 520, key: 'fullOutfit', val: 'archmage_robe', desc: 'เสื้อคลุมยาวทอด้วยไหมเวทมนตร์' },
  { id: 'f_royal', category: 'outfit', slot: 'body', occupies: ['top', 'bottom'], name: '👗 ชุดเดรสราชนิกูลเอเธลการ์ด', price: 690, key: 'fullOutfit', val: 'royal_dress', desc: 'ชุดเดรสหรูหราสำหรับชนชั้นสูง' },
  { id: 'top_rose', category: 'clothing', slot: 'top', occupies: ['top'], name: '🌹 เสื้อคลุมกุหลาบทับทิม', price: 180, key: 'primaryColor', val: '#be123c', desc: 'เสื้อท่อนบนโทนทับทิม สามารถใส่คู่กับแฟชั่นช่องอื่นได้' },
  { id: 'top_sky', category: 'clothing', slot: 'top', occupies: ['top'], name: '🌌 เสื้อไหมฟ้าคราม', price: 180, key: 'primaryColor', val: '#0284c7', desc: 'เสื้อท่อนบนสีฟ้าครามแบบผ้านุ่ม' },
  { id: 'top_forest', category: 'clothing', slot: 'top', occupies: ['top'], name: '🌿 เสื้อแจ็กเก็ตพรานไพร', price: 220, key: 'topStyle', val: 'hunter_jacket', color: '#15803d', desc: 'แจ็กเก็ตพรานไพรพร้อมปกเสื้อ' },
  { id: 'top_noble', category: 'clothing', slot: 'top', occupies: ['top'], name: '🎖️ เสื้อโค้ตขุนนาง', price: 250, key: 'topStyle', val: 'noble_coat', color: '#7c3aed', desc: 'เสื้อโค้ตขุนนางประดับปกสีทอง' },
  { id: 'bottom_rose', category: 'clothing', slot: 'bottom', occupies: ['bottom'], name: '🌺 กระโปรงกุหลาบ', price: 160, key: 'secondaryColor', val: '#be123c', desc: 'กระโปรงโทนแดงกุหลาบ' },
  { id: 'bottom_forest', category: 'clothing', slot: 'bottom', occupies: ['bottom'], name: '🍃 กระโปรงพงไพร', price: 160, key: 'secondaryColor', val: '#166534', desc: 'กระโปรงโทนเขียวใบไม้' },
  { id: 'h_crown', category: 'hat', slot: 'head', occupies: ['head'], name: '👑 มงกุฎราชันย์ทองคำ', price: 450, key: 'hatStyle', val: 'royal_crown', desc: 'มงกุฎทองคำฝังมณีส่องประกาย' },
  { id: 'h_valkyrie', category: 'hat', slot: 'head', occupies: ['head'], name: '⚜️ รัดเกล้าวัลคีรีสวรรค์', price: 420, key: 'hatStyle', val: 'valkyrie_tiara', desc: 'รัดเกล้าปีกแห่งเทพธิดานักรบ' },
  { id: 'h_wizard', category: 'hat', slot: 'head', occupies: ['head'], name: '🧙 หมวกจอมเวทโบราณ', price: 300, key: 'hatStyle', val: 'wizard_hat', desc: 'หมวกทรงสูงของปราชญ์หอคอยเวท' },
  { id: 'h_none', category: 'hat', slot: 'head', occupies: ['head'], name: '❌ ถอดหมวก', price: 0, key: 'hatStyle', val: 'none', desc: 'แสดงทรงผมตามธรรมชาติ' },
  { id: 'w_angel', category: 'wing', slot: 'back', occupies: ['back'], name: '🪽 ปีกสวรรค์ขยับได้', price: 850, key: 'fashionBack', val: 'angel_wings', desc: 'ปีกขยับตามการเดิน วิ่ง และกระโดด' },
  { id: 'w_angel_white', category: 'wing', slot: 'back', occupies: ['back'], name: '🤍 ปีกนางฟ้าขนนกขาวหลายชั้น', price: 980, key: 'fashionBack', val: 'angel_wings_white', desc: 'ปีกขนนกสีขาวซ้อนหลายชั้น พริ้วตามสถานะ' },
  { id: 'w_halo', category: 'accessory', slot: 'head', occupies: ['head'], name: '😇 วงแหวนเทวทูตเรืองแสง', price: 600, key: 'fashionHalo', val: true, desc: 'วงแหวนศักดิ์สิทธิ์ลอยเหนือศีรษะ' },
  { id: 'w_none', category: 'wing', slot: 'back', occupies: ['back'], name: '❌ ถอดเครื่องประดับหลัง', price: 0, key: 'fashionBack', val: 'none', desc: 'ไม่แสดงปีก' },
  { id: 'cape_red', category: 'cape', slot: 'back', occupies: ['back'], name: '🦸 ผ้าคลุมไหล่ราชันย์สีชาด', price: 180, key: 'hasCape', val: true, color: '#dc2626', desc: 'ผ้าคลุมสีชาดไหวตามแรงลม' },
  { id: 'cape_blue', category: 'cape', slot: 'back', occupies: ['back'], name: '🌌 ผ้าคลุมไหล่รัตติกาล', price: 180, key: 'hasCape', val: true, color: '#1d4ed8', desc: 'ผ้าคลุมสีน้ำเงินเข้ม' },
  { id: 'fx_sakura', category: 'effect', slot: 'aura', occupies: ['aura'], name: '🌸 ออร่ากลีบซากุระ', price: 750, key: 'fashionEffect', val: 'sakura_aura', color: 0xf472b6, desc: 'ละอองกลีบซากุระหมุนวนรอบตัว' },
  { id: 'fx_star', category: 'effect', slot: 'aura', occupies: ['aura'], name: '✨ ออร่าละอองดาราจักรทองคำ', price: 890, key: 'fashionEffect', val: 'starlight_aura', color: 0xfbbf24, desc: 'ประกายแสงดาวสีทองลอยระยิบระยับ' },
  { id: 'fx_frost', category: 'effect', slot: 'aura', occupies: ['aura'], name: '❄️ ออร่าเกล็ดหิมะเหมันต์', price: 780, key: 'fashionEffect', val: 'frost_aura', color: 0x38bdf8, desc: 'ไอเย็นและเกล็ดคริสตัลน้ำแข็ง' },
  { id: 'fx_flame', category: 'effect', slot: 'aura', occupies: ['aura'], name: '🔥 ออร่าเพลิงราชันย์สุริยัน', price: 920, key: 'fashionEffect', val: 'flame_aura', color: 0xf97316, desc: 'เปลวไฟเวทสีส้มทองรอบกาย' },
  { id: 'fx_none', category: 'effect', slot: 'aura', occupies: ['aura'], name: '❌ ปิดเอฟเฟกต์แฟชั่น', price: 0, key: 'fashionEffect', val: 'none', color: 0x000000, desc: 'ปิดเอฟเฟกต์ออร่าแฟชั่น' }
];

const FASHION_DEFAULTS = {
  fullOutfit: 'none',
  primaryColor: '#2563eb',
  secondaryColor: '#1e293b',
  topStyle: 'basic',
  hatStyle: 'none',
  accessory: 'none',
  fashionBack: 'none',
  fashionHalo: false,
  hasCape: false,
  fashionEffect: 'none'
};

export function ensureFashionState(playerStats, currentConfig) {
  if (!Array.isArray(playerStats.ownedFashion)) playerStats.ownedFashion = [];
  if (currentConfig.fashionBack === undefined) {
    currentConfig.fashionBack = currentConfig.accessory === 'angel_wings' || currentConfig.accessory === 'angel_wings_white'
      ? currentConfig.accessory
      : 'none';
  }
  if (currentConfig.fashionHalo === undefined) currentConfig.fashionHalo = currentConfig.accessory === 'halo';
  if (!Array.isArray(playerStats.equippedFashion)) {
    playerStats.equippedFashion = FASHION_CATALOG
      .filter(item => currentConfig[item.key] === item.val && item.val !== 'none')
      .map(item => item.id);
  }
  FASHION_CATALOG.filter(item => item.price === 0).forEach(item => {
    if (!playerStats.ownedFashion.includes(item.id)) playerStats.ownedFashion.push(item.id);
  });
  for (const id of playerStats.equippedFashion) {
    if (!playerStats.ownedFashion.includes(id)) playerStats.ownedFashion.push(id);
  }
  if (currentConfig.fullOutfit === 'sailor_school' && !playerStats.ownedFashion.includes('f_sailor')) {
    playerStats.ownedFashion.push('f_sailor');
    if (!playerStats.equippedFashion.includes('f_sailor')) playerStats.equippedFashion.push('f_sailor');
  }
  if (currentConfig.hasCape) {
    const capeId = currentConfig.capeColor === '#1d4ed8' ? 'cape_blue' : 'cape_red';
    if (!playerStats.ownedFashion.includes(capeId)) playerStats.ownedFashion.push(capeId);
    if (!playerStats.equippedFashion.includes(capeId)) playerStats.equippedFashion.push(capeId);
  }
  const activeSlots = new Set();
  const conflictsRemoved = [];
  playerStats.equippedFashion = playerStats.equippedFashion.filter(id => {
    const item = FASHION_CATALOG.find(entry => entry.id === id);
    if (!item) return false;
    const occupies = item.occupies || [item.slot];
    if (occupies.some(slot => activeSlots.has(slot))) {
      conflictsRemoved.push(item);
      return false;
    }
    occupies.forEach(slot => activeSlots.add(slot));
    return true;
  });
  conflictsRemoved.forEach(item => {
    currentConfig[item.key] = FASHION_DEFAULTS[item.key];
    if (item.key === 'hasCape') currentConfig.capeColor = '#dc2626';
  });
}

export function equipOwnedFashion(playerStats, currentConfig, itemId) {
  ensureFashionState(playerStats, currentConfig);
  const item = FASHION_CATALOG.find(entry => entry.id === itemId);
  if (!item || !playerStats.ownedFashion.includes(itemId)) return { ok: false, reason: 'not-owned' };
  const equipped = playerStats.equippedFashion;
  const isEquipped = equipped.includes(itemId);
  if (isEquipped) {
    playerStats.equippedFashion = equipped.filter(id => id !== itemId);
    currentConfig[item.key] = FASHION_DEFAULTS[item.key];
    if (item.key === 'hasCape') currentConfig.capeColor = '#dc2626';
    return { ok: true, equipped: false, item };
  }

  const occupied = new Set(item.occupies || [item.slot]);
  const removed = [];
  playerStats.equippedFashion = equipped.filter(id => {
    const current = FASHION_CATALOG.find(entry => entry.id === id);
    const conflicts = current && current.occupies.some(slot => occupied.has(slot));
    if (conflicts) removed.push(current);
    return !conflicts;
  });
  removed.forEach(current => {
    currentConfig[current.key] = FASHION_DEFAULTS[current.key];
    if (current.key === 'hasCape') currentConfig.capeColor = '#dc2626';
  });
  playerStats.equippedFashion.push(itemId);
  currentConfig[item.key] = item.val;
  if (item.color && item.key === 'hasCape') currentConfig.capeColor = item.color;
  if (item.color && item.key === 'topStyle') currentConfig.primaryColor = item.color;
  return { ok: true, equipped: true, item, replaced: removed };
}

let auraGroup = null;
const auraParticles = [];

/**
 * อัปเดตเอฟเฟคแฟชั่นรอบตัวผู้เล่น (Sakura / Starlight / Frost / Flame) แบบไม่กินสเปค
 */
export function updateFashionAuraEffects(scene, playerRoot, currentConfig, elapsedTime) {
  const fxType = currentConfig.fashionEffect || 'none';
  if (fxType === 'none') {
    if (auraGroup) auraGroup.visible = false;
    return;
  }

  const fxInfo = FASHION_CATALOG.find(item => item.val === fxType);
  const colorHex = fxInfo?.color || 0xfbbf24;

  if (!auraGroup) {
    auraGroup = new THREE.Group();
    const mistTex = getVolumetricMistTexture();
    for (let i = 0; i < 14; i++) {
      const mat = new THREE.SpriteMaterial({
        map: mistTex,
        color: colorHex,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const sp = new THREE.Sprite(mat);
      sp.scale.setScalar(0.32 + (i % 3) * 0.12);
      auraGroup.add(sp);
      auraParticles.push({ sprite: sp, phase: (i / 14) * Math.PI * 2, speed: 1.5 + (i % 4) * 0.35, yOffset: (i / 14) * 2.1 });
    }
    scene.add(auraGroup);
  }

  auraGroup.visible = true;
  auraGroup.position.copy(playerRoot.position);

  for (let i = 0; i < auraParticles.length; i++) {
    const p = auraParticles[i];
    p.sprite.material.color.setHex(colorHex);
    const angle = elapsedTime * p.speed + p.phase;
    const radius = 0.75 + Math.sin(elapsedTime * 2.0 + i) * 0.22;
    const py = ((p.yOffset + elapsedTime * 0.65) % 2.2);
    p.sprite.position.set(Math.cos(angle) * radius, py, Math.sin(angle) * radius);
  }
}

/**
 * สร้างอาคารร้านค้าแฟชั่น (Fashion Boutique) ในเมือง เพื่อให้ผู้เล่นเดินเข้าไปซื้อกับ NPC วิเวียน
 */
export function buildCityFashionBoutique(town, buildEnterableBuildingFn) {
  buildEnterableBuildingFn({
    wx: town.x - 38,
    wz: town.z + 44,
    width: 13,
    depth: 11,
    height: 5.4,
    wallColor: 0xfdf4ff,
    roofColor: 0x9333ea,
    rotY: Math.PI / 2,
    title: '👗 ห้องเสื้อและบูติกแฟชั่น (Vivian Fashion Boutique)',
    subTitle: 'ซื้อเสื้อผ้า ปีกขยับได้ และเอฟเฟคออร่าแฟชั่น',
    role: 'fashion',
    npcSpec: {
      name: 'ดีไซเนอร์วิเวียน (ร้านค้าแฟชั่น)',
      gender: 'female',
      outfit: 'royal_dress',
      primary: '#a855f7',
      hair: 'twintails',
      hairColor: '#f472b6',
      weapon: 'staff_void'
    }
  });
}

/**
 * แสดงรายการสินค้าในร้านแฟชั่น (เปิดได้เฉพาะเมื่อคุยกับ NPC ดีไซเนอร์วิเวียนที่ร้านเท่านั้น!)
 */
export function renderFashionShopUI(playerStats, currentConfig, callbacks) {
  const grid = document.getElementById('fashion-items-grid');
  if (!grid) return;
  grid.innerHTML = '';
  if (!Array.isArray(playerStats.ownedFashion)) {
    playerStats.ownedFashion = ['f_sailor', 'h_none', 'w_none', 'fx_none'];
  }
  ensureFashionState(playerStats, currentConfig);
  const wardrobeOnly = callbacks.wardrobeOnly === true;
  const visibleItems = wardrobeOnly
    ? FASHION_CATALOG.filter(item => playerStats.ownedFashion.includes(item.id))
    : FASHION_CATALOG;

  visibleItems.forEach((item) => {
    const owned = item.price === 0 || playerStats.ownedFashion.includes(item.id);
    const equipped = playerStats.equippedFashion.includes(item.id);

    const card = document.createElement('div');
    card.className = "bg-slate-900/95 border border-purple-500/40 rounded-xl p-3 flex items-center justify-between gap-2";
    card.innerHTML = `
      <div>
        <div class="font-bold text-purple-200 text-xs">${item.name}</div>
        <div class="text-[11px] text-slate-400">${item.desc}</div>
      </div>
      <button class="f-buy-btn px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 ${
        equipped ? 'bg-emerald-500/30 text-emerald-200 border border-emerald-400' :
        owned ? 'bg-purple-500 hover:bg-purple-400 text-white' :
        'bg-amber-500 hover:bg-amber-400 text-slate-950'
      }">
        ${equipped ? 'ถอดออก' : owned ? 'สวมใส่' : `ซื้อ ${item.price} G`}
      </button>
    `;

    card.querySelector('.f-buy-btn').onclick = () => {
      if (!owned && wardrobeOnly) return;
      if (!owned) {
        if (playerStats.gold < item.price) {
          callbacks.addLog(`❌ เงิน Gold ไม่พอซื้อ <b>${item.name}</b> (ต้องการ ${item.price} G)`, "text-rose-400");
          return;
        }
        playerStats.gold -= item.price;
        playerStats.ownedFashion.push(item.id);
        callbacks.sound.sfxCoin();
      } else {
        callbacks.sound.sfxClick();
      }
      const result = callbacks.equipFashion(item.id);
      if (!result?.ok) return;
      callbacks.rebuildPreviewCharacter();
      callbacks.updateHUD();
      callbacks.savePlayerToRTDB();
      callbacks.broadcastMyStateToRTDB();
      renderFashionShopUI(playerStats, currentConfig, callbacks);
    };
    grid.appendChild(card);
  });
}
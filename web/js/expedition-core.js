/* =====================================================================
   EXPEDITIONS — expedition-core.js
   Utilitários, áudio, sprites e a camada de integração com os dados
   reais do Idle Fantasy (GameData/Sim/State). O herói e o inventário
   são os mesmos do modo Hub (localStorage idle-fantasy-web-save-v1).
   ===================================================================== */
'use strict';

// Localized string with fallback (same convention as ui-town.js, plus
// {1}-style placeholder substitution on the fallback): prefers the Hub's
// i18n data when loaded, otherwise falls back.
const tt = (key, args, fb) => {
  if (typeof I18n !== 'undefined' && I18n.has(key)) return I18n.t(key, args);
  let s = fb != null ? String(fb) : key;
  if (args) {
    if (Array.isArray(args)) args.forEach((v, i) => { s = s.split('{' + (i + 1) + '}').join(String(v)); });
    else for (const [k, v] of Object.entries(args)) s = s.split('{' + k + '}').join(String(v));
  }
  return s;
};

// ============================================================
// 0. UTILITÁRIOS E ÁUDIO (do protótipo original)
// ============================================================
const XU = {
  clamp(v, a, b) { return v < a ? a : (v > b ? b : v); },
  lerp(a, b, t) { return a + (b - a) * t; },
};
function hash2(x, y) { let h = (x | 0) * 374761393 + (y | 0) * 668265263; h = (h ^ (h >>> 13)) * 1274126177; h = h ^ (h >>> 16); return (h >>> 0) / 4294967296; }
function smooth(t) { return t * t * (3 - 2 * t); }
function valueNoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  const u = smooth(xf), v = smooth(yf);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}
function fbm(x, y, o) { let s = 0, a = 1, f = 1, t = 0; for (let i = 0; i < o; i++) { s += valueNoise(x * f, y * f) * a; t += a; a *= 0.5; f *= 2; } return s / t; }

// ---- Áudio ----
let AC = null;
function audio() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } }
  if (AC && AC.state === 'suspended') AC.resume();
  return AC;
}
function beep(f, d, t, v, s) {
  const a = audio(); if (!a) return;
  try {
    const o = a.createOscillator(), g = a.createGain();
    o.type = t || 'square'; o.frequency.setValueAtTime(f, a.currentTime);
    if (s) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + s), a.currentTime + d);
    g.gain.setValueAtTime(v || 0.12, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + d);
    o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime + d);
  } catch (e) { }
}
function noisefx(d, v) {
  const a = audio(); if (!a) return;
  try {
    const n = (a.sampleRate * d) | 0, b = a.createBuffer(1, n, a.sampleRate), c = b.getChannelData(0);
    for (let i = 0; i < n; i++) c[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = a.createBufferSource(); s.buffer = b; const g = a.createGain(); g.gain.value = v || 0.15;
    s.connect(g).connect(a.destination); s.start();
  } catch (e) { }
}
const SFX = {
  swing() { noisefx(0.06, 0.10); }, chop() { noisefx(0.07, 0.16); beep(180, 0.07, 'square', 0.08, -80); },
  mine() { noisefx(0.08, 0.18); beep(240, 0.06, 'square', 0.07, -60); },
  pickup() { beep(760, 0.07, 'square', 0.09, 260); }, gold() { beep(1050, 0.09, 'square', 0.10, 500); },
  hurt() { beep(150, 0.22, 'sawtooth', 0.16, -110); noisefx(0.1, 0.12); },
  levelup() { beep(523, 0.12, 'square', 0.10); setTimeout(() => beep(659, 0.12, 'square', 0.10), 110); setTimeout(() => beep(784, 0.16, 'square', 0.10), 220); setTimeout(() => beep(1046, 0.22, 'square', 0.12), 330); },
  buy() { beep(660, 0.08, 'square', 0.10, 220); }, error() { beep(140, 0.15, 'sawtooth', 0.10, -40); },
  fish() { beep(320, 0.1, 'sine', 0.1, 240); }, cast() { beep(880, 0.12, 'sine', 0.1, 420); },
  bow() { noisefx(0.05, 0.12); beep(520, 0.06, 'square', 0.08, -200); },
  portal() { beep(220, 0.3, 'sine', 0.12, 660); noisefx(0.2, 0.08); },
};

// ============================================================
// 1. SPRITES (do protótipo)
// ============================================================
function makeSprite(rows, pal) {
  const w = rows.reduce((m, r) => Math.max(m, r.length), 0), h = rows.length;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  for (let y = 0; y < h; y++) {
    const r = rows[y] || '';
    for (let x = 0; x < r.length; x++) {
      const ch = r[x]; if (ch === '.' || ch === ' ' || !pal[ch]) continue;
      g.fillStyle = pal[ch]; g.fillRect(x, y, 1, 1);
    }
  }
  return c;
}
function flipSprite(c) {
  const o = document.createElement('canvas'); o.width = c.width; o.height = c.height;
  const g = o.getContext('2d'); g.translate(c.width, 0); g.scale(-1, 1); g.drawImage(c, 0, 0);
  return o;
}
function hsl(h, s, l) {
  h = ((h % 360) + 360) % 360; h /= 360; let r, g, b;
  if (s === 0) { r = g = b = l; } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = t => { const x = t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; return x; };
    r = f((h + 1 / 3) % 1); g = f(h); b = f((h - 1 / 3 + 1) % 1);
  }
  return 'rgb(' + Math.round(r * 255) + ',' + Math.round(g * 255) + ',' + Math.round(b * 255) + ')';
}
function shadeColor(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) + amt, g = ((n >> 8) & 255) + amt, b = (n & 255) + amt;
  return 'rgb(' + XU.clamp(r, 0, 255) + ',' + XU.clamp(g, 0, 255) + ',' + XU.clamp(b, 0, 255) + ')';
}

const HPAL = { H: '#5b3a1e', h: '#7a4f2a', S: '#f4c79e', s: '#dda678', E: '#1c1c1c', C: '#c0392b', c: '#8e2c21', D: '#3a2c20', B: '#2a1f16' };
const HERO_ROWS = {
  down0: ["....HHHHHHHH....", "...HHHHHHHHHH...", "...HHHHHHHHHH...", "...HSSSSSSSSH...", "...HSESSSSESH...", "...HSSSSSSSSH...", "...HssSSSSssSH...", "....HHHHHHHH....", "....CCCCCCCC....", "...CCCCCCCCCC...", "...CCCCCCCCCC...", "....CCCCCCCC....", "....DDDDDDDD....", "....DDD..DDD....", "....DD....DD....", "....BB....BB...."],
  down1: ["....HHHHHHHH....", "...HHHHHHHHHH...", "...HHHHHHHHHH...", "...HSSSSSSSSH...", "...HSESSSSESH...", "...HSSSSSSSSH...", "...HSSSSSSSSH...", "....HHHHHHHH....", "....CCCCCCCC....", "...CCCCCCCCCC...", "...CCCCCCCCCC...", "....CCCCCCCC....", "....DDDDDDDD....", "...DDD....DDD...", "...DD......DD...", "...BB......BB..."],
  up0: ["....HHHHHHHH....", "...HHHHHHHHHH...", "...HHHHHHHHHH...", "...HSSSSSSSSH...", "...HSESSSSESH...", "...HSSSSSSSSH...", "...HSSSSSSSSH...", "....HHHHHHHH....", "....CCCCCCCC....", "...CCCCCCCCCC...", "...CCCCCCCCCC...", "....CCCCCCCC....", "....DDDDDDDD....", "....DDD..DDD....", "....DD....DD....", "....BB....BB...."],
  up1: ["....HHHHHHHH....", "...HHHHHHHHHH...", "...HHHHHHHHHH...", "...HSSSSSSSSH...", "...HSESSSSESH...", "...HSSSSSSSSH...", "...HSSSSSSSSH...", "....HHHHHHHH....", "....CCCCCCCC....", "...CCCCCCCCCC...", "...CCCCCCCCCC...", "....CCCCCCCC....", "....DDDDDDDD....", "...DDD....DDD...", "...DD......DD...", "...BB......BB..."],
  side0: ["....HHHHHHHH....", "...HHHHHHHHHH...", "...HHHHHHHHHH...", "...HSSSSSSSSH...", "...HSSSSSSESH...", "...HSSSSSSSSH...", "...HSSSSSSSSH...", "....HHHHHHHH....", ".....CCCCCC....", "....CCCCCCCC...", "....CCCCCCCC...", ".....CCCCCC....", ".....DDDDDD....", ".....DDDDD....", ".....DDDDD....", ".....BBBBB...."],
  side1: ["....HHHHHHHH....", "...HHHHHHHHHH...", "...HHHHHHHHHH...", "...HSSSSSSSSH...", "...HSSSSSSESH...", "...HSSSSSSSSH...", "...HSSSSSSSSH...", "....HHHHHHHH....", ".....CCCCCC....", "....CCCCCCCC...", "....CCCCCCCC...", ".....CCCCCC....", ".....DDDDDD....", "....DDDDDD....", "....DDDDDD....", "....BBBBB...."],
};
const T_BLOB = ["................", "....bbbbbbbb....", "..bbbbbbbbbbbb..", ".bbbbbbbbbbbbbb.", ".bbEbbbbbbbbEbb.", "bbbbbbbbbbbbbbbb", "bbbbbbbbbbbbbbbb", "bbbbbbbbbbbbbbbb", ".bbbbbbbbbbbbbb.", "..bbbbbbbbbbbb..", "....bbbbbbbb....", "................"];
const T_HUM = ["......bbbb......", "....bbbbbbbb....", "....bbbbbbbb....", "....bEEbbEEb....", "....bbbbbbbb....", "......bbbb......", "....dbbbbdb.....", "...dbbbbbbbd....", "....bbbbbbb.....", "....bdbdbdb.....", "...bbd..dbb.....", "...bb....bb....."];
const T_BEAST = ["..................", "...bb........bb..", ".bbbbb......bbbb.", ".bbbbbbbbbbbbbbbb", ".bbEbbbbbbbbbbEbb", ".bbbbbbbbbbbbbbbb", "..bbbbbbbbbbbbbb.", "...bbbbbbbbbbbb..", ".....dbbbbbbd....", ".....dbb..bbd....", "......bb..bb....."];

function makeEnemySprite(name) {
  const h = hash2(name.length * 7.3, name.charCodeAt(0) * 3.1 + name.length);
  const tmpl = h < 0.33 ? T_BLOB : (h < 0.66 ? T_HUM : T_BEAST);
  const hue = Math.floor(hash2(name.length * 11.7, name.charCodeAt(1) || 5) * 360);
  const base = hsl(hue, 0.6, 0.45);
  const pal = { b: base, d: shadeColor('#808080', -60), E: '#fff', e: '#1c1c1c' };
  const a = makeSprite(tmpl, pal);
  const fb = document.createElement('canvas'); fb.width = a.width; fb.height = a.height;
  const fg = fb.getContext('2d'); fg.drawImage(a, -1, 0); fg.drawImage(a, 1, 0);
  return { a, b: fb, hue };
}

// ============================================================
// 2. INTEGRAÇÃO — dados reais + textos localizados (i18n do Hub)
// ============================================================
const EXP = {
  /* ---- textos (localizados via i18n; nomes ingleses como fallback) ---- */
  styleName(s) {
    switch (s) {
      case 'attack': return tt('web_exp_style_attack', null, 'Attack');
      case 'strength': return tt('web_exp_style_strength', null, 'Strength');
      case 'defense': return tt('web_exp_style_defense', null, 'Defense');
      case 'ranged': return tt('web_exp_style_ranged', null, 'Ranged');
      case 'magic': return tt('web_exp_style_magic', null, 'Magic');
      default: return s;
    }
  },
  skillName(key) {
    const en = (GameData.skillDefs.find(d => d.key === key) || { name: key }).name;
    switch (key) {
      case 'mining': return tt('web_exp_skill_mining', null, en);
      case 'woodcutting': return tt('web_exp_skill_woodcutting', null, en);
      case 'fishing': return tt('web_exp_skill_fishing', null, en);
      case 'thieving': return tt('web_exp_skill_thieving', null, en);
      case 'agility': return tt('web_exp_skill_agility', null, en);
      case 'smithing': return tt('web_exp_skill_smithing', null, en);
      case 'cooking': return tt('web_exp_skill_cooking', null, en);
      case 'fletching': return tt('web_exp_skill_fletching', null, en);
      case 'crafting': return tt('web_exp_skill_crafting', null, en);
      case 'firemaking': return tt('web_exp_skill_firemaking', null, en);
      case 'runecrafting': return tt('web_exp_skill_runecrafting', null, en);
      case 'construction': return tt('web_exp_skill_construction', null, en);
      case 'prayer': return tt('web_exp_skill_prayer', null, en);
      case 'farming': return tt('web_exp_skill_farming', null, en);
      case 'herblore': return tt('web_exp_skill_herblore', null, en);
      case 'mercantile': return tt('web_exp_skill_mercantile', null, en);
      case 'slayer': return tt('web_exp_skill_slayer', null, en);
      case 'attack': return tt('web_exp_skill_attack', null, en);
      case 'strength': return tt('web_exp_skill_strength', null, en);
      case 'defense': return tt('web_exp_skill_defense', null, en);
      case 'ranged': return tt('web_exp_skill_ranged', null, en);
      case 'magic': return tt('web_exp_skill_magic', null, en);
      case 'hitpoints': return tt('web_exp_skill_hitpoints', null, en);
      default: return en;
    }
  },
  groupName(g) {
    switch (g) {
      case 'Gathering': return tt('web_exp_group_gathering', null, 'Gathering');
      case 'Production': return tt('web_exp_group_production', null, 'Production');
      case 'Combat': return tt('web_exp_group_combat', null, 'Combat');
      default: return g;
    }
  },
  buildingName(b) {
    switch (b.key) {
      case 'shop': return tt('web_exp_building_shop', null, b.nameEn || 'General Store');
      case 'church': return tt('web_exp_building_church', null, b.nameEn || 'Church');
      case 'workshop': return tt('web_exp_building_workshop', null, b.nameEn || 'Workshop (Hub)');
      case 'trade': return tt('web_exp_building_trade', null, b.nameEn || 'Trade Post');
      default: return b.nameEn || b.name || b.key;
    }
  },
  slotName(slot) {
    switch (slot) {
      case 'weapon': return tt('web_exp_slot_weapon', null, 'Weapon');
      case 'shield': return tt('web_exp_slot_shield', null, 'Shield');
      case 'head': return tt('web_exp_slot_head', null, 'Helm');
      case 'body': return tt('web_exp_slot_body', null, 'Platebody');
      case 'legs': return tt('web_exp_slot_legs', null, 'Legs');
      case 'boots': return tt('web_exp_slot_boots', null, 'Boots');
      case 'cape': return tt('web_exp_slot_cape', null, 'Cape');
      case 'ring': return tt('web_exp_slot_ring', null, 'Ring');
      case 'necklace': return tt('web_exp_slot_necklace', null, 'Necklace');
      case 'pickaxe': return tt('web_exp_slot_pickaxe', null, 'Pickaxe');
      case 'axe': return tt('web_exp_slot_axe', null, 'Axe');
      case 'fishing_rod': return tt('web_exp_slot_fishing_rod', null, 'Fishing rod');
      case 'hammer': return tt('web_exp_slot_hammer', null, 'Hammer');
      case 'tinderbox': return tt('web_exp_slot_tinderbox', null, 'Tinderbox');
      case 'grappling_hook': return tt('web_exp_slot_grappling_hook', null, 'Grappling hook');
      case 'frying_pan': return tt('web_exp_slot_frying_pan', null, 'Frying pan');
      case 'lockpick': return tt('web_exp_slot_lockpick', null, 'Lockpick');
      case 'hoe': return tt('web_exp_slot_hoe', null, 'Hoe');
      default: return slot;
    }
  },

  /* ---- listas derivadas dos dados reais ---- */
  ORES: [], TREES: [], FISH: [], BONES: [], SPELLS: [], RAIDS: [],
  ORE_COLORS: {
    rune_essence: '#b39ddb', copper_ore: '#b87333', tin_ore: '#c2c2c2', iron_ore: '#9a6a4a',
    silver_ore: '#c7ccd1', coal: '#3a3a3a', gold_ore: '#f6c453', mithril_ore: '#5a7fc9',
    adamantite_ore: '#3fae5c', runite_ore: '#4a90d9', platinum_ore: '#d8dde3', stone: '#8b97a3',
  },
  TREE_COLORS: { tree: '#3e7d34', oak_tree: '#4a8a3a', willow_tree: '#5a9a44', maple_tree: '#c0502a', yew_tree: '#2f5f28', magic_tree: '#2a7fbf', redwood_tree: '#8a3a2a' },

  buildLists() {
    // Minérios reais (ordem de nível); rune_essence tratado à parte (rocha rara)
    this.ORES = Object.entries(GameData.ores)
      .filter(([k]) => k !== 'rune_essence')
      .map(([k, v]) => ({ key: k, lvl: v.level_required, xp: v.xp_per_ore, name: v.display_name }))
      .sort((a, b) => a.lvl - b.lvl);
    this.TREES = Object.entries(GameData.trees)
      .map(([k, v]) => ({ key: k, lvl: v.level_required, xp: v.xp_per_log, logKey: v.log_name, name: v.display_name }))
      .sort((a, b) => a.lvl - b.lvl);
    this.FISH = Object.entries(GameData.fish)
      .map(([k, v]) => ({ key: k, lvl: v.level_required, xp: v.xp_per_catch, name: v.display_name }))
      .sort((a, b) => a.lvl - b.lvl);
    this.BONES = Object.entries(GameData.bones)
      .map(([k, v]) => ({ key: k, lvl: 1, xp: v.xp_per_bone, name: v.display_name, ash: !!v.is_ash }))
      .sort((a, b) => a.xp - b.xp);
    this.SPELLS = Object.entries(GameData.spells)
      .map(([k, v]) => ({ key: k, lvl: v.magic_level_required, rune: v.rune_type, cost: v.rune_cost, max: v.max_hit, name: v.display_name }))
      .sort((a, b) => a.lvl - b.lvl);
    this.RAIDS = Object.entries(GameData.raidBosses)
      .map(([k, v]) => ({ key: k, ...v }))
      .sort((a, b) => a.combat_level_required - b.combat_level_required);
  },

  /* ---- combate: port fiel das fórmulas do sim.js (OSRS-style) ---- */
  BASE_ATTACK_SPEED_SEC: 2.4,

  hitChance(effAtk, defStat, lo = 0.15, hi = 0.95) {
    return XU.clamp(
      effAtk > defStat ? 1 - defStat / (2 * Math.max(1, effAtk)) : effAtk / (2 * Math.max(1, defStat)),
      lo, hi);
  },

  /** Contexto de combate do herói (mesma fonte do Hub: State.combatContext). */
  ctx() { return State.combatContext(); },

  /** Bônus da melhor flecha disponível no inventário (consome a melhor primeiro). */
  bestArrow() {
    const order = ['runite_arrow', 'adamantite_arrow', 'mithril_arrow', 'steel_arrow', 'iron_arrow', 'bronze_arrow'];
    for (const k of order) if (State.count(k) > 0) return { key: k, bonus: GameData.arrowBonuses[k] || 0 };
    return null;
  },

  /** Máximo de dano do jogador por estilo (port de simulateDungeon). */
  playerMaxHit(ctx, arrowBonus) {
    const style = State.state.combatStyle;
    if (style === 'ranged') return Math.max(1, Sim._rangedMaxHit(ctx.ranged, ctx.rangedStrBonus, arrowBonus || 0));
    if (style === 'magic') return Math.max(1, ctx.spellMaxHit);
    const effStr = ctx.strength + ctx.weaponStrBonus;
    return Math.max(1, Math.floor(1 + effStr * (ctx.weaponStrBonus + 64) / 640));
  },

  /** Chance de acerto do jogador contra um inimigo + defesa usada. */
  playerOffense(ctx, enemy) {
    const style = State.state.combatStyle;
    let effAtk, defStat;
    if (style === 'ranged') { effAtk = ctx.ranged + ctx.weaponAtkBonus; defStat = enemy.defensive_stats.ranged_defense; }
    else if (style === 'magic') { effAtk = ctx.magic + ctx.weaponAtkBonus; defStat = enemy.defensive_stats.magic_defense; }
    else {
      effAtk = ctx.attack + ctx.weaponAtkBonus;
      defStat = style === 'strength' ? enemy.defensive_stats.strength_defense : enemy.defensive_stats.attack_defense;
    }
    return { chance: this.hitChance(effAtk, defStat), maxHit: this.playerMaxHit(ctx) };
  },

  /** Dano do inimigo: chance + max hit (port de simulateDungeon). */
  enemyOffense(enemy, ctx) {
    const effDef = ctx.defense + (ctx.blessingDefBonus || 0);
    const enemyEffStr = enemy.combat_stats.strength_level + enemy.combat_stats.strength_bonus;
    const maxHit = enemyEffStr === 0 ? 0 : Math.max(0, Math.floor(1 + enemyEffStr * (enemy.combat_stats.strength_bonus + 64) / 640));
    const effAtk = enemy.combat_stats.attack_level + enemy.combat_stats.attack_bonus;
    return { chance: this.hitChance(effAtk, effDef, 0.10, 0.95), maxHit };
  },

  /** Distribuição de XP do combate (70/15/15) — Sim._distributeXp. */
  distributeXp(total, style) { return Sim._distributeXp(total, style); },

  /** Intervalo real de ataque do jogador (s). Armas rápidas atacam mais rápido. */
  attackIntervalSec(ctx) {
    const speed = ctx.attackSpeedSec || this.BASE_ATTACK_SPEED_SEC;
    return Math.max(0.34, speed * 0.33);
  },

  /** Nível de combate (fórmula estilo OSRS usada no Hub). */
  combatLevel() {
    const atk = State.level('attack'), str = State.level('strength'), def = State.level('defense');
    const hp = State.level('hitpoints'), rng = State.level('ranged'), mag = State.level('magic');
    const base = (def + hp) / 4;
    const melee = (atk + str) * 0.325;
    const range = Math.floor(rng * 1.5) * 0.325;
    const mage = Math.floor(mag * 1.5) * 0.325;
    return Math.max(3, Math.floor(base + Math.max(melee, range, mage)));
  },

  maxHp() { return State.effectiveHpLevel() * 10; },
};

// ============================================================
// 3. GANHO DE XP COM MULTIPLICADORES DO HUB (bênção / boost 2x)
// ============================================================
const XPGain = {
  /** Aplica bênção da igreja + boost 2x (como o Hub faz ao coletar sessões). */
  apply(skill, amount) {
    if (!amount || amount <= 0) return [];
    const bless = State.blessingXpMultiplier();
    const boost = State.xpBoostActive() ? 2 : 1;
    let amt = Math.floor(amount * bless * boost);
    if (amt < 1) amt = 1;
    const ups = State.addXp(skill, amt);
    if (ups.length === 2) {
      const before = ups[0], after = ups[1];
      if (typeof EXPGUI !== 'undefined' && EXPGUI.onLevelUp) EXPGUI.onLevelUp(skill, before, after);
    }
    return ups;
  },
  /** XP + boost de pet de uma skill específica. */
  withPet(skill, amount) {
    const pet = State.petBoost(skill) + State.capeBonus(skill) * 100;
    return this.apply(skill, Math.floor(amount * (1 + pet / 100)));
  },
};

// ============================================================
// 4. FEED DE ESTATÍSTICAS/QUESTS — espelha Engine._updateQuestCounters
//    para que as 189 quests do Hub progredirem jogando no Expeditions.
// ============================================================
const QuestFeed = {
  gather(skill, items) {
    const st = State.state.stats;
    for (const [k, v] of Object.entries(items)) {
      st.itemsGathered[k] = (st.itemsGathered[k] || 0) + v;
      if (skill === 'fishing' && k.startsWith('raw_')) st.fishCaught = (st.fishCaught || 0) + v;
    }
  },
  craft(skill, outputKey, qty) {
    const st = State.state.stats;
    if (!outputKey) return;
    st.itemsCrafted[outputKey] = (st.itemsCrafted[outputKey] || 0) + qty;
    if (skill === 'cooking') {
      const recipe = Object.values(GameData.recipes.cooking).find(r => r.cooked_item === outputKey);
      if (recipe && recipe.raw_item.startsWith('raw_')) st.fishCooked = (st.fishCooked || 0) + qty;
    }
  },
  kill(enemyKey, items, coins) {
    const st = State.state.stats;
    st.totalKills += 1;
    st.killsByEnemy[enemyKey] = (st.killsByEnemy[enemyKey] || 0) + 1;
    st.combatItems = st.combatItems || {};
    for (const [k, v] of Object.entries(items)) if (k !== 'coins') st.combatItems[k] = (st.combatItems[k] || 0) + v;
    if (coins) st.combatItems; // moedas contam como items.coins no hub; mantém só em combate
  },
  dungeonRun(key, style, usedFood) {
    const st = State.state.stats;
    st.dungeonRuns[key] = (st.dungeonRuns[key] || 0) + 1;
    st.dungeonStyleRuns[key + ':' + style] = (st.dungeonStyleRuns[key + ':' + style] || 0) + 1;
    if (!usedFood) {
      st.dungeonNoFoodByDungeon = st.dungeonNoFoodByDungeon || {};
      st.dungeonNoFoodByDungeon[key] = (st.dungeonNoFoodByDungeon[key] || 0) + 1;
    }
  },
  pickpocket(npcKey, okCount, items) {
    const st = State.state.stats;
    st.pickpockets = (st.pickpockets || 0) + okCount;
    st.pickpocketsByNpc = st.pickpocketsByNpc || {};
    st.pickpocketsByNpc[npcKey] = (st.pickpocketsByNpc[npcKey] || 0) + okCount;
    st.stolen = st.stolen || {};
    for (const [k, v] of Object.entries(items)) if (k !== 'coins') st.stolen[k] = (st.stolen[k] || 0) + v;
  },
  scatter(n) { State.state.stats.bonesScatteredTotal = (State.state.stats.bonesScatteredTotal || 0) + n; },
};

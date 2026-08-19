/* =====================================================================
   EXPEDITIONS — expedition-worldgen.js
   Geração do mundo: BIOMAS, REGIÕES (reinos), CIDADES/VILAS, ESTRADAS
   e TEMAS DE DUNGEON. Tudo determinístico (hash/noise) e puro — o
   expedition-world.js consome estes dados para colisão/recursos e o
   expedition-art.js para desenhar.

   Carregue este arquivo DEPOIS de expedition-core.js (usa hash2/fbm)
   e ANTES de expedition-world.js (define TERRAIN).
   ===================================================================== */
'use strict';

/* ---------------------------------------------------------------------
   TERRENO — classes de tile (movimento + classe genérica de pintura)
   --------------------------------------------------------------------- */
const TERRAIN = {
  WATER: 0,    // água profunda (sólido; pescável)
  SHALLOW: 1,  // água rasa / recife (sólido; pescável)
  SAND: 2,
  GRASS: 3,
  GRASS2: 4,   // vegetação densa (compat)
  MUD: 5,
  SNOW: 6,
  ICE: 7,
  ASH: 8,
  ROCK: 9,     // rocha/montanha (sólido)
  LAVA: 10,    // lava (sólido)
  VOID: 11,    // abismo (sólido)
  ROAD: 12,    // estrada / ponte
  FLOOR: 13,   // dungeon: piso
  FLOOR2: 14,  // dungeon: piso alternativo
  WALL: 15,    // dungeon: parede (sólido)
  HAZARD: 16,  // dungeon: lava/veneno/vazio (sólido)
  PLAZA: 17,   // praça de pedra da cidade
};

const SOLID_TERRAIN = new Set([
  TERRAIN.WATER, TERRAIN.SHALLOW, TERRAIN.ROCK, TERRAIN.LAVA,
  TERRAIN.VOID, TERRAIN.WALL, TERRAIN.HAZARD,
]);
const WATER_TERRAIN = new Set([TERRAIN.WATER, TERRAIN.SHALLOW]);

/* ---------------------------------------------------------------------
   RNG determinístico por string (para dungeons)
   --------------------------------------------------------------------- */
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* =====================================================================
   BIOMAS
   `terrain`  → classe de movimento/pintura
   `ground`   → duas cores base (xadrez suave por hash)
   `deco`     → enfeite procedural do tile
   `tree/ore` → como os recursos aparecem naquele bioma
   ===================================================================== */
const BIOMES = {
  ocean: {
    key: 'ocean', terrain: TERRAIN.WATER, icon: '🌊', name: 'Oceano', nameEn: 'Ocean',
    map: '#1b4a7e', ground: ['#2c6aa8', '#27619c'], water: true,
  },
  reef: {
    key: 'reef', terrain: TERRAIN.SHALLOW, icon: '🐚', name: 'Águas Rasas', nameEn: 'Shallows',
    map: '#3f8fc4', ground: ['#57a7d6', '#4d9ecd'], water: true,
  },
  beach: {
    key: 'beach', terrain: TERRAIN.SAND, icon: '🏖️', name: 'Praia', nameEn: 'Beach',
    map: '#e6d3a0', ground: ['#e9d7a6', '#e2cf9c'], deco: { type: 'shell', color: '#fff6df', chance: 0.10 },
  },
  plains: {
    key: 'plains', terrain: TERRAIN.GRASS, icon: '🌱', name: 'Planície', nameEn: 'Plains',
    map: '#5aa04c', ground: ['#5aa04c', '#549a47'], deco: { type: 'grass', color: 'rgba(24,58,20,.32)', chance: 0.28 },
    tree: { chance: 0.05, bias: 0.15 }, ore: { chance: 0.03, bias: 0.10 },
  },
  meadow: {
    key: 'meadow', terrain: TERRAIN.GRASS, icon: '🌼', name: 'Campina Florida', nameEn: 'Flower Meadow',
    map: '#6cb457', ground: ['#69b055', '#63a950'], deco: { type: 'flower', chance: 0.30 },
    tree: { chance: 0.04, bias: 0.10 }, ore: { chance: 0.012, bias: 0.05 },
  },
  forest: {
    key: 'forest', terrain: TERRAIN.GRASS, icon: '🌳', name: 'Floresta', nameEn: 'Forest',
    map: '#357a35', ground: ['#3d8039', '#377733'], deco: { type: 'grass', color: 'rgba(14,42,12,.38)', chance: 0.42 },
    tree: { chance: 0.30, bias: 0.35 }, ore: { chance: 0.025, bias: 0.15 },
  },
  pinewood: {
    key: 'pinewood', terrain: TERRAIN.GRASS, icon: '🌲', name: 'Pinheiral', nameEn: 'Pinewood',
    map: '#2f6a4f', ground: ['#337050', '#2e684a'], deco: { type: 'pinecone', color: '#4a3826', chance: 0.16 },
    tree: { chance: 0.28, bias: 0.3, pine: true }, ore: { chance: 0.03, bias: 0.25 },
  },
  jungle: {
    key: 'jungle', terrain: TERRAIN.GRASS, icon: '🌴', name: 'Selva', nameEn: 'Jungle',
    map: '#1f7a3a', ground: ['#238040', '#1e7539'], deco: { type: 'fern', color: 'rgba(10,60,25,.5)', chance: 0.55 },
    tree: { chance: 0.34, bias: 0.5, palm: true }, ore: { chance: 0.02, bias: 0.35 },
  },
  swamp: {
    key: 'swamp', terrain: TERRAIN.MUD, icon: '🪵', name: 'Pântano', nameEn: 'Swamp',
    map: '#4a5c3a', ground: ['#4d5f3c', '#465737'], deco: { type: 'reed', color: '#6d7f4a', chance: 0.30 },
    tree: { chance: 0.16, bias: 0.5, dead: true }, ore: { chance: 0.015, bias: 0.2 },
    ambient: 'firefly',
  },
  bog: {
    key: 'bog', terrain: TERRAIN.WATER, icon: '💧', name: 'Charco', nameEn: 'Bog',
    map: '#3c5546', ground: ['#405c4a', '#3a5443'], water: true, ambient: 'firefly',
  },
  desert: {
    key: 'desert', terrain: TERRAIN.SAND, icon: '🏜️', name: 'Deserto', nameEn: 'Desert',
    map: '#dfc276', ground: ['#e2c87f', '#d9bf76'], deco: { type: 'cactus', chance: 0.10 },
    tree: { chance: 0.02, bias: 0.4 }, ore: { chance: 0.045, bias: 0.55 }, ambient: 'sand',
  },
  dunes: {
    key: 'dunes', terrain: TERRAIN.SAND, icon: '🐫', name: 'Dunas', nameEn: 'Great Dunes',
    map: '#eeda9e', ground: ['#efdca2', '#e7d295'], deco: { type: 'dune', chance: 0.35 },
    tree: { chance: 0.005, bias: 0.5 }, ore: { chance: 0.035, bias: 0.7 }, ambient: 'sand',
  },
  oasis: {
    key: 'oasis', terrain: TERRAIN.GRASS, icon: '🌴', name: 'Oásis', nameEn: 'Oasis',
    map: '#4fae72', ground: ['#54b276', '#4aa76c'], deco: { type: 'flower', chance: 0.2 },
    tree: { chance: 0.28, bias: 0.42, palm: true }, ore: { chance: 0.012, bias: 0.3 },
  },
  savanna: {
    key: 'savanna', terrain: TERRAIN.GRASS, icon: '🦁', name: 'Savana', nameEn: 'Savanna',
    map: '#b6a55a', ground: ['#b6a55a', '#ae9d53'], deco: { type: 'grass', color: 'rgba(90,70,20,.35)', chance: 0.34 },
    tree: { chance: 0.07, bias: 0.4, acacia: true }, ore: { chance: 0.03, bias: 0.35 },
  },
  badlands: {
    key: 'badlands', terrain: TERRAIN.SAND, icon: '🪨', name: 'Terras Áridas', nameEn: 'Badlands',
    map: '#b06a45', ground: ['#b26c46', '#a5633f'], deco: { type: 'crack', color: 'rgba(60,30,15,.4)', chance: 0.3 },
    tree: { chance: 0.01, bias: 0.3, dead: true }, ore: { chance: 0.07, bias: 0.62 },
  },
  tundra: {
    key: 'tundra', terrain: TERRAIN.SNOW, icon: '❄️', name: 'Tundra', nameEn: 'Tundra',
    map: '#dfe8f2', ground: ['#e3ecf5', '#d8e3ee'], deco: { type: 'snow', chance: 0.25 },
    tree: { chance: 0.10, bias: 0.3, pine: true }, ore: { chance: 0.035, bias: 0.5 }, ambient: 'snow',
  },
  glacier: {
    key: 'glacier', terrain: TERRAIN.ICE, icon: '🧊', name: 'Geleira', nameEn: 'Glacier',
    map: '#bfe4f5', ground: ['#c7e9f8', '#b9dff2'], deco: { type: 'icecrack', chance: 0.3 },
    tree: { chance: 0, bias: 0 }, ore: { chance: 0.03, bias: 0.75 }, ambient: 'snow',
  },
  mountain: {
    key: 'mountain', terrain: TERRAIN.ROCK, icon: '⛰️', name: 'Montanha', nameEn: 'Mountains',
    map: '#8a8f9c', ground: ['#8f95a2', '#818795'], solid: true,
  },
  highlands: {
    key: 'highlands', terrain: TERRAIN.GRASS, icon: '🏔️', name: 'Planalto', nameEn: 'Highlands',
    map: '#6f8a5e', ground: ['#728e60', '#6a855a'], deco: { type: 'pebble', color: '#8f95a2', chance: 0.26 },
    tree: { chance: 0.09, bias: 0.45, pine: true }, ore: { chance: 0.085, bias: 0.6 },
  },
  volcano: {
    key: 'volcano', terrain: TERRAIN.ROCK, icon: '🌋', name: 'Vulcão', nameEn: 'Volcano',
    map: '#5a3a34', ground: ['#4e3630', '#46302b'], solid: true,
  },
  scorched: {
    key: 'scorched', terrain: TERRAIN.ASH, icon: '🔥', name: 'Terra Calcinada', nameEn: 'Scorched Land',
    map: '#6d4038', ground: ['#6b433a', '#613c34'], deco: { type: 'ember', chance: 0.22 },
    tree: { chance: 0.02, bias: 0.6, dead: true }, ore: { chance: 0.075, bias: 0.8 }, ambient: 'ember',
  },
  lavafield: {
    key: 'lavafield', terrain: TERRAIN.LAVA, icon: '🌋', name: 'Rio de Lava', nameEn: 'Lava Flow',
    map: '#e0561f', ground: ['#e0561f', '#c34415'], solid: true, ambient: 'ember',
  },
  ashlands: {
    key: 'ashlands', terrain: TERRAIN.ASH, icon: '🌫️', name: 'Cinzais', nameEn: 'Ashlands',
    map: '#6b6068', ground: ['#6d626a', '#645a62'], deco: { type: 'ashpile', chance: 0.24 },
    tree: { chance: 0.03, bias: 0.55, dead: true }, ore: { chance: 0.065, bias: 0.7 }, ambient: 'ash',
  },
  blight: {
    key: 'blight', terrain: TERRAIN.MUD, icon: '☠️', name: 'Terra Maldita', nameEn: 'Blightlands',
    map: '#5c4a63', ground: ['#5e4b66', '#54445c'], deco: { type: 'spore', chance: 0.3 },
    tree: { chance: 0.14, bias: 0.6, dead: true }, ore: { chance: 0.04, bias: 0.65 }, ambient: 'spore',
  },
  deadwood: {
    key: 'deadwood', terrain: TERRAIN.GRASS, icon: '🥀', name: 'Bosque Morto', nameEn: 'Deadwood',
    map: '#5a5040', ground: ['#5c5242', '#544b3b'], deco: { type: 'bone', chance: 0.18 },
    tree: { chance: 0.26, bias: 0.55, dead: true }, ore: { chance: 0.03, bias: 0.5 }, ambient: 'spore',
  },
  arcane: {
    key: 'arcane', terrain: TERRAIN.GRASS, icon: '✨', name: 'Ermo Arcano', nameEn: 'Arcane Wastes',
    map: '#5a6fb0', ground: ['#5b6fae', '#5266a4'], deco: { type: 'rune', chance: 0.22 },
    tree: { chance: 0.05, bias: 0.6 }, ore: { chance: 0.06, bias: 0.85 }, ambient: 'mote',
  },
  crystal: {
    key: 'crystal', terrain: TERRAIN.GRASS, icon: '💎', name: 'Campos de Cristal', nameEn: 'Crystal Fields',
    map: '#8f7fe0', ground: ['#7d6fd0', '#7365c4'], deco: { type: 'crystal', chance: 0.3 },
    tree: { chance: 0.01, bias: 0.9 }, ore: { chance: 0.1, bias: 0.95 }, ambient: 'mote',
  },
};

/* =====================================================================
   REGIÕES — os "reinos"/domínios icônicos, ancorados em direções fixas
   (norte = gelo, leste = deserto, oeste = vulcão, sul = pântano…),
   para o mapa ficar memorável em vez de ruído aleatório.
   ===================================================================== */
const REGIONS = [
  {
    key: 'heartlands', name: 'Coração de Aurélia', nameEn: 'Heartlands of Aurelia',
    x: 0, y: 0, r: 62, color: '#5aa04c', icon: '👑',
    core: 'plains', mix: ['plains', 'meadow', 'forest', 'plains', 'forest'],
  },
  {
    key: 'greatwood', name: 'Bosque Ancião', nameEn: 'The Greatwood',
    x: 62, y: -58, r: 52, color: '#357a35', icon: '🌳',
    core: 'forest', mix: ['forest', 'forest', 'pinewood', 'meadow'],
  },
  {
    key: 'frostpeaks', name: 'Coroa Gélida', nameEn: 'The Frost Crown',
    x: -8, y: -122, r: 74, color: '#dfe8f2', icon: '❄️',
    core: 'glacier', mix: ['tundra', 'tundra', 'glacier', 'pinewood'],
  },
  {
    key: 'emberwaste', name: 'Ermo das Brasas', nameEn: 'The Emberwaste',
    x: -148, y: -18, r: 72, color: '#c0451c', icon: '🌋',
    core: 'volcano', mix: ['scorched', 'ashlands', 'scorched', 'badlands'],
  },
  {
    key: 'sunscar', name: 'Deserto da Cicatriz Solar', nameEn: 'The Sunscar Desert',
    x: 152, y: 8, r: 88, color: '#e2c87f', icon: '🏜️',
    core: 'dunes', mix: ['desert', 'desert', 'dunes', 'badlands', 'oasis'],
  },
  {
    key: 'verdance', name: 'Selva Esmeralda', nameEn: 'The Emerald Verdance',
    x: 104, y: 112, r: 66, color: '#1f7a3a', icon: '🌴',
    core: 'jungle', mix: ['jungle', 'jungle', 'swamp', 'oasis'],
  },
  {
    key: 'mirefen', name: 'Pântano de Brumalodo', nameEn: 'The Mirefen',
    x: -6, y: 136, r: 62, color: '#4a5c3a', icon: '🐸',
    core: 'swamp', mix: ['swamp', 'swamp', 'bog', 'deadwood'],
  },
  {
    key: 'sunplains', name: 'Savana de Kaburu', nameEn: 'The Kaburu Savanna',
    x: -124, y: 104, r: 62, color: '#b6a55a', icon: '🦁',
    core: 'savanna', mix: ['savanna', 'savanna', 'plains', 'badlands'],
  },
  {
    key: 'blightlands', name: 'Terras Cinzentas', nameEn: 'The Blightlands',
    x: -112, y: -104, r: 56, color: '#5c4a63', icon: '☠️',
    core: 'blight', mix: ['blight', 'deadwood', 'blight', 'ashlands'],
  },
  {
    key: 'arcanum', name: 'Ermos Arcanos', nameEn: 'The Arcane Wastes',
    x: 124, y: -102, r: 58, color: '#5a6fb0', icon: '✨',
    core: 'crystal', mix: ['arcane', 'arcane', 'crystal', 'highlands'],
  },
  {
    key: 'ironspine', name: 'Espinha de Ferro', nameEn: 'The Ironspine',
    x: -78, y: -66, r: 42, color: '#8a8f9c', icon: '⛰️',
    core: 'mountain', mix: ['highlands', 'mountain', 'highlands', 'pinewood'],
  },
  {
    key: 'lakelands', name: 'Lagos de Salmoura', nameEn: 'The Saltmarrow Lakes',
    x: -66, y: 66, r: 40, color: '#3f8fc4', icon: '⛵',
    core: 'reef', mix: ['plains', 'meadow', 'beach', 'plains'],
  },
];

/* Grandes massas de água fixas (baía do porto, lago sagrado…) */
const WATER_ANCHORS = [
  { x: -72, y: 72, r: 17, name: 'Lago Salmoura' },
  { x: 42, y: 52, r: 9, name: 'Lago Espelho' },
  { x: 168, y: 42, r: 7, name: 'Oásis de Zafira' },
];

/* =====================================================================
   ASSENTAMENTOS — capital + cidades, vilas e postos avançados
   Cada um tem paleta própria, estilo arquitetônico e prédios.
   ===================================================================== */
const SETTLEMENTS = [
  {
    key: 'aurelia', kind: 'capital', icon: '👑',
    name: 'Aurélia, a Capital Dourada', nameEn: 'Aurelia, the Golden Capital',
    short: 'Aurélia', shortEn: 'Aurelia',
    x: 0, y: 0, r: 19, wall: true, wallStyle: 'stone', ground: 'cobble', region: 'heartlands',
    pal: { wall: '#8d939e', wallDark: '#6a7078', roof: '#b8422f', roof2: '#9c3527', house: '#e8dcc0', wood: '#7a4f2a', banner: '#c0392b', banner2: '#3f8ef0', accent: '#f6c453' },
    gates: ['n', 's', 'e', 'w'],
    buildings: [
      { key: 'castle', dx: -7, dy: -16, w: 14, h: 6, style: 'castle', icon: '🏰', nameEn: 'Royal Keep', name: 'Castelo Real' },
      { key: 'church', dx: -14, dy: -7, w: 5, h: 4, style: 'church', icon: '⛪', nameEn: 'Grand Cathedral', name: 'Grande Catedral' },
      { key: 'shop', dx: 8, dy: -7, w: 5, h: 3, style: 'shop', icon: '🛒', nameEn: 'General Store', name: 'Loja Geral' },
      { key: 'workshop', dx: -14, dy: 4, w: 5, h: 3, style: 'workshop', icon: '🏗️', nameEn: 'Workshop (Hub)', name: 'Oficina' },
      { key: 'trade', dx: 9, dy: 4, w: 5, h: 3, style: 'trade', icon: '🐎', nameEn: 'Trade Post', name: 'Posto de Comércio' },
      { key: 'tavern', dx: -8, dy: 9, w: 4, h: 3, style: 'tavern', icon: '🍺', nameEn: 'The Gilded Griffin Inn', name: 'Estalagem do Grifo' },
      { key: 'barracks', dx: 4, dy: 9, w: 5, h: 3, style: 'barracks', icon: '⚔️', nameEn: 'City Barracks', name: 'Quartel da Guarda' },
      { key: 'library', dx: -3, dy: -9, w: 3, h: 3, style: 'tower', icon: '📚', nameEn: 'Arcanum Spire', name: 'Torre do Arcanum' },
    ],
    market: [{ dx: -4, dy: 3 }, { dx: -1, dy: 3 }, { dx: 2, dy: 3 }],
    statue: { dx: 0, dy: -5 },
    // áreas livres: hortas, portal do Hub, Mestre Slayer e a fonte central
    reserved: [{ x: -9, y: 11, w: 14, h: 5 }, { x: 5, y: 5, w: 5, h: 5 },
      { x: -3, y: 4, w: 6, h: 5 }, { x: -3, y: -6, w: 6, h: 6 }],
  },
  {
    key: 'gelaheim', kind: 'kingdom', icon: '❄️',
    name: 'Gélaheim, o Trono de Gelo', nameEn: 'Gelaheim, the Ice Throne',
    short: 'Gélaheim', shortEn: 'Gelaheim',
    x: -8, y: -104, r: 12, wall: true, wallStyle: 'ice', ground: 'snow', region: 'frostpeaks',
    pal: { wall: '#bcd9ec', wallDark: '#93b6cf', roof: '#3f6fa8', roof2: '#33598a', house: '#dfeaf5', wood: '#5d6f84', banner: '#8fd8ff', banner2: '#dfeaf5', accent: '#8fd8ff' },
    gates: ['s', 'e'],
    buildings: [
      { key: 'castle', dx: -5, dy: -10, w: 10, h: 5, style: 'castle', icon: '🏰', nameEn: 'Hall of Frost', name: 'Salão do Gelo' },
      { key: 'shop', dx: -9, dy: 1, w: 4, h: 3, style: 'shop', icon: '🛒', nameEn: 'Frostmarket', name: 'Mercado Gélido' },
      { key: 'church', dx: 5, dy: 1, w: 4, h: 3, style: 'church', icon: '⛪', nameEn: 'Shrine of the Long Night', name: 'Santuário da Noite Longa' },
      { key: 'tavern', dx: -2, dy: 5, w: 4, h: 3, style: 'tavern', icon: '🍺', nameEn: 'The Warm Hearth', name: 'A Lareira Quente' },
    ],
  },
  {
    key: 'zafira', kind: 'kingdom', icon: '🏜️',
    name: 'Zafira, Sultanato das Dunas', nameEn: 'Zafira, Sultanate of Dunes',
    short: 'Zafira', shortEn: 'Zafira',
    x: 130, y: 6, r: 13, wall: true, wallStyle: 'sandstone', ground: 'sand', region: 'sunscar',
    pal: { wall: '#d8b978', wallDark: '#b9995c', roof: '#2f9c8f', roof2: '#25806f', house: '#f0dcae', wood: '#a3763f', banner: '#2f9c8f', banner2: '#f6c453', accent: '#f6c453' },
    gates: ['w', 'n', 's'],
    buildings: [
      { key: 'castle', dx: -5, dy: -10, w: 10, h: 5, style: 'palace', icon: '🕌', nameEn: 'Sunspear Palace', name: 'Palácio Lançasol' },
      { key: 'shop', dx: -10, dy: 1, w: 4, h: 3, style: 'dome', icon: '🛒', nameEn: 'Grand Bazaar', name: 'Grande Bazar' },
      { key: 'trade', dx: 6, dy: 1, w: 4, h: 3, style: 'dome', icon: '🐎', nameEn: 'Caravanserai', name: 'Caravançarai' },
      { key: 'church', dx: -3, dy: 6, w: 4, h: 3, style: 'dome', icon: '⛪', nameEn: 'Temple of the Sun', name: 'Templo do Sol' },
    ],
    market: [{ dx: -1, dy: -3 }, { dx: 2, dy: -3 }],
  },
  {
    key: 'yathran', kind: 'city', icon: '🌴',
    name: 'Yathran, a Cidade nas Copas', nameEn: 'Yathran, the Canopy City',
    short: 'Yathran', shortEn: 'Yathran',
    x: 96, y: 96, r: 11, wall: false, wallStyle: 'palisade', ground: 'jungle', region: 'verdance',
    pal: { wall: '#6b4a2a', wallDark: '#4e3520', roof: '#2f8a4a', roof2: '#25703b', house: '#a97f4c', wood: '#6b4a2a', banner: '#f0a83a', banner2: '#2f8a4a', accent: '#7fe08a' },
    buildings: [
      { key: 'shop', dx: -7, dy: -4, w: 4, h: 3, style: 'hut', icon: '🛒', nameEn: 'Vine Market', name: 'Mercado das Lianas' },
      { key: 'church', dx: 3, dy: -5, w: 4, h: 3, style: 'pagoda', icon: '⛪', nameEn: 'Shrine of the Green Mother', name: 'Santuário da Mãe Verde' },
      { key: 'workshop', dx: -4, dy: 4, w: 4, h: 3, style: 'hut', icon: '🏗️', nameEn: 'Canopy Workshop', name: 'Oficina das Copas' },
      { key: 'tavern', dx: 4, dy: 4, w: 3, h: 3, style: 'hut', icon: '🍺', nameEn: 'The Hanging Gourd', name: 'A Cabaça Pendente' },
    ],
  },
  {
    key: 'mirefoot', kind: 'village', icon: '🐸',
    name: 'Pé-de-Lodo', nameEn: 'Mirefoot',
    short: 'Pé-de-Lodo', shortEn: 'Mirefoot',
    x: -4, y: 118, r: 10, wall: false, ground: 'boardwalk', region: 'mirefen',
    pal: { wall: '#5b5a3c', wallDark: '#43432c', roof: '#6d7f4a', roof2: '#57663a', house: '#8a7a55', wood: '#584a30', banner: '#9fd46f', banner2: '#6d7f4a', accent: '#9fd46f' },
    buildings: [
      { key: 'shop', dx: -6, dy: -3, w: 4, h: 3, style: 'stilt', icon: '🛒', nameEn: 'Bog Trader', name: 'Trocador do Charco' },
      { key: 'church', dx: 3, dy: -4, w: 3, h: 3, style: 'stilt', icon: '⛪', nameEn: 'Witch\'s Hut', name: 'Choupana da Bruxa' },
      { key: 'tavern', dx: -1, dy: 4, w: 4, h: 3, style: 'stilt', icon: '🍺', nameEn: 'The Drowned Lantern', name: 'A Lanterna Afogada' },
    ],
  },
  {
    key: 'emberwatch', kind: 'outpost', icon: '🌋',
    name: 'Vigília das Brasas', nameEn: 'Emberwatch',
    short: 'Vig. das Brasas', shortEn: 'Emberwatch',
    x: -124, y: -14, r: 9, wall: true, wallStyle: 'obsidian', ground: 'ash', region: 'emberwaste',
    pal: { wall: '#40353c', wallDark: '#2c242a', roof: '#8a3a24', roof2: '#6e2c1a', house: '#5a4a48', wood: '#3d2f2a', banner: '#e0561f', banner2: '#f6c453', accent: '#ff8a3c' },
    gates: ['e'],
    buildings: [
      { key: 'shop', dx: -5, dy: -3, w: 4, h: 3, style: 'shop', icon: '🛒', nameEn: 'Slag Market', name: 'Mercado da Escória' },
      { key: 'workshop', dx: 2, dy: -3, w: 4, h: 3, style: 'forge', icon: '🔨', nameEn: 'Cinder Forge', name: 'Forja das Cinzas' },
      { key: 'barracks', dx: -2, dy: 3, w: 4, h: 3, style: 'barracks', icon: '⚔️', nameEn: 'Ashguard Post', name: 'Posto da Guarda Cinzenta' },
    ],
  },
  {
    key: 'ironpeak', kind: 'city', icon: '⛏️',
    name: 'Cume de Ferro', nameEn: 'Ironpeak Hold',
    short: 'Cume de Ferro', shortEn: 'Ironpeak',
    x: -74, y: -62, r: 10, wall: true, wallStyle: 'stone', ground: 'stone', region: 'ironspine',
    pal: { wall: '#7c828f', wallDark: '#5c626e', roof: '#4a5a72', roof2: '#3a4859', house: '#9aa0ac', wood: '#6b5334', banner: '#5aa9ff', banner2: '#c9a05a', accent: '#c9a05a' },
    gates: ['s', 'e'],
    buildings: [
      { key: 'workshop', dx: -6, dy: -4, w: 5, h: 3, style: 'forge', icon: '🔨', nameEn: 'Deep Forge', name: 'Forja Profunda' },
      { key: 'shop', dx: 2, dy: -4, w: 4, h: 3, style: 'shop', icon: '🛒', nameEn: 'Ore Exchange', name: 'Bolsa de Minérios' },
      { key: 'tavern', dx: -2, dy: 3, w: 4, h: 3, style: 'tavern', icon: '🍺', nameEn: 'The Iron Tankard', name: 'A Caneca de Ferro' },
    ],
  },
  {
    key: 'saltmarrow', kind: 'city', icon: '⛵',
    name: 'Porto Salmoura', nameEn: 'Port Saltmarrow',
    short: 'Porto Salmoura', shortEn: 'Saltmarrow',
    x: -52, y: 60, r: 11, wall: false, ground: 'dock', region: 'lakelands',
    pal: { wall: '#8b6f4a', wallDark: '#6a5236', roof: '#3f6f8a', roof2: '#325a72', house: '#e0d3b2', wood: '#7a5a34', banner: '#5aa9ff', banner2: '#e8e0d0', accent: '#8fd8ff' },
    buildings: [
      { key: 'trade', dx: -7, dy: -3, w: 5, h: 3, style: 'shop', icon: '🐎', nameEn: 'Harbour Exchange', name: 'Casa do Porto' },
      { key: 'shop', dx: 2, dy: -4, w: 4, h: 3, style: 'shop', icon: '🛒', nameEn: 'Fishmonger', name: 'Peixaria' },
      { key: 'tavern', dx: -2, dy: 4, w: 4, h: 3, style: 'tavern', icon: '🍺', nameEn: 'The Salted Siren', name: 'A Sereia Salgada' },
    ],
    docks: [{ dx: -3, dy: -8 }, { dx: 0, dy: -9 }],
  },
  {
    key: 'highspire', kind: 'city', icon: '✨',
    name: 'Altaspira, Academia Arcana', nameEn: 'Highspire Academy',
    short: 'Altaspira', shortEn: 'Highspire',
    x: 112, y: -92, r: 10, wall: true, wallStyle: 'arcane', ground: 'arcane', region: 'arcanum',
    pal: { wall: '#6a6fb8', wallDark: '#4c5090', roof: '#7f5fd0', roof2: '#6849b0', house: '#cfd4f0', wood: '#4c5090', banner: '#a98fff', banner2: '#8fd8ff', accent: '#bda6ff' },
    gates: ['s', 'w'],
    buildings: [
      { key: 'library', dx: -4, dy: -8, w: 4, h: 4, style: 'tower', icon: '📚', nameEn: 'Tower of Stars', name: 'Torre das Estrelas' },
      { key: 'shop', dx: 3, dy: -3, w: 4, h: 3, style: 'shop', icon: '🛒', nameEn: 'Reagent Hall', name: 'Salão de Reagentes' },
      { key: 'church', dx: -7, dy: 2, w: 4, h: 3, style: 'tower', icon: '⛪', nameEn: 'Sanctum of Sight', name: 'Sacrário da Visão' },
    ],
  },
  {
    key: 'kaburu', kind: 'village', icon: '🦁',
    name: 'Kaburu', nameEn: 'Kaburu',
    short: 'Kaburu', shortEn: 'Kaburu',
    x: -116, y: 98, r: 9, wall: false, wallStyle: 'palisade', ground: 'savanna', region: 'sunplains',
    pal: { wall: '#a3763f', wallDark: '#7d5a2e', roof: '#c98a3a', roof2: '#a86e2b', house: '#d9b978', wood: '#8a6534', banner: '#e0561f', banner2: '#f6c453', accent: '#f6c453' },
    buildings: [
      { key: 'shop', dx: -5, dy: -3, w: 4, h: 3, style: 'hut', icon: '🛒', nameEn: 'Sun Market', name: 'Mercado do Sol' },
      { key: 'church', dx: 2, dy: -3, w: 3, h: 3, style: 'hut', icon: '⛪', nameEn: 'Ancestor Circle', name: 'Círculo dos Ancestrais' },
      { key: 'tavern', dx: -1, dy: 3, w: 4, h: 3, style: 'hut', icon: '🍺', nameEn: 'The Watering Hole', name: 'O Bebedouro' },
    ],
  },
  {
    key: 'greyvigil', kind: 'outpost', icon: '☠️',
    name: 'Vigília Cinzenta', nameEn: 'The Grey Vigil',
    short: 'Vig. Cinzenta', shortEn: 'Grey Vigil',
    x: -104, y: -96, r: 8, wall: true, wallStyle: 'palisade', ground: 'blight', region: 'blightlands',
    pal: { wall: '#5a4a63', wallDark: '#40364a', roof: '#4a3c58', roof2: '#382c44', house: '#6f6478', wood: '#463a52', banner: '#9a7fd0', banner2: '#5a4a63', accent: '#b79cf0' },
    buildings: [
      { key: 'church', dx: -4, dy: -3, w: 4, h: 3, style: 'church', icon: '⛪', nameEn: 'Chapel of Wardens', name: 'Capela dos Guardiões' },
      { key: 'barracks', dx: 2, dy: -2, w: 4, h: 3, style: 'barracks', icon: '⚔️', nameEn: 'Vigil Barracks', name: 'Quartel da Vigília' },
    ],
  },
  {
    key: 'oakhollow', kind: 'village', icon: '🌳',
    name: 'Carvalhoco', nameEn: 'Oakhollow',
    short: 'Carvalhoco', shortEn: 'Oakhollow',
    x: 56, y: -50, r: 9, wall: false, ground: 'grass', region: 'greatwood',
    pal: { wall: '#7a5a34', wallDark: '#5c4326', roof: '#7d5a3a', roof2: '#63462c', house: '#e0d0a8', wood: '#7a4f2a', banner: '#6fd46f', banner2: '#c9a05a', accent: '#9fd46f' },
    buildings: [
      { key: 'shop', dx: -5, dy: -3, w: 4, h: 3, style: 'shop', icon: '🛒', nameEn: 'Woodsman Store', name: 'Loja do Lenhador' },
      { key: 'workshop', dx: 2, dy: -3, w: 4, h: 3, style: 'workshop', icon: '🏗️', nameEn: 'Sawmill', name: 'Serraria' },
      { key: 'tavern', dx: -2, dy: 3, w: 4, h: 3, style: 'tavern', icon: '🍺', nameEn: 'The Green Acorn', name: 'A Bolota Verde' },
    ],
  },
];

/* =====================================================================
   ESTRADAS — ligam a capital a cada cidade (com curvas suaves).
   Estradas são sempre caminháveis: cortam montanhas e viram ponte
   sobre a água. Isso torna o mapa navegável e "legível".
   ===================================================================== */
function buildRoads() {
  const cap = SETTLEMENTS[0];
  const roads = [];
  for (const s of SETTLEMENTS) {
    if (s.key === cap.key) continue;
    const dx = s.x - cap.x, dy = s.y - cap.y, len = Math.hypot(dx, dy);
    const nx = dx / len, ny = dy / len;
    const px = -ny, py = nx;                     // perpendicular
    const bend = ((hashStr(s.key) % 100) / 100 - 0.5) * len * 0.22;
    const pts = [];
    const start = { x: cap.x + nx * (cap.r + 1), y: cap.y + ny * (cap.r + 1) };
    const end = { x: s.x - nx * (s.r + 1), y: s.y - ny * (s.r + 1) };
    pts.push(start);
    for (let i = 1; i < 4; i++) {
      const t = i / 4;
      const w = Math.sin(t * Math.PI) * bend;
      pts.push({ x: start.x + (end.x - start.x) * t + px * w, y: start.y + (end.y - start.y) * t + py * w });
    }
    pts.push(end);
    for (let i = 0; i < pts.length - 1; i++) roads.push({ a: pts[i], b: pts[i + 1], to: s.key });
  }
  // trilha de anel entre vizinhos do sul (dá vida ao mapa)
  const ring = ['saltmarrow', 'mirefoot', 'yathran'];
  for (let i = 0; i < ring.length - 1; i++) {
    const a = SETTLEMENTS.find(s => s.key === ring[i]), b = SETTLEMENTS.find(s => s.key === ring[i + 1]);
    if (a && b) roads.push({ a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, to: b.key, minor: true });
  }
  return roads;
}

function distToSegment(px, py, a, b) {
  const vx = b.x - a.x, vy = b.y - a.y;
  const wx = px - a.x, wy = py - a.y;
  const L2 = vx * vx + vy * vy || 1;
  let t = (wx * vx + wy * vy) / L2;
  t = t < 0 ? 0 : (t > 1 ? 1 : t);
  const dx = px - (a.x + vx * t), dy = py - (a.y + vy * t);
  return Math.hypot(dx, dy);
}

/* =====================================================================
   TEMAS DE DUNGEON — cada dungeon ganha layout, paleta, adereços e
   clima próprios, coerentes com o nome. Nada de "só caverna".
   ===================================================================== */
const DUNGEON_PALETTES = {
  cave: { floor: '#5c5442', floor2: '#4a4335', wall: '#231f1a', wallTop: '#463f33', accent: '#6d8a3a', hazard: '#2b3a2a', fog: 'rgba(20,26,18,.14)' },
  mine: { floor: '#6b5a44', floor2: '#5f4f3b', wall: '#251f18', wallTop: '#4a3f33', accent: '#c9a05a', hazard: '#2f2a22', fog: 'rgba(30,22,10,.14)' },
  crypt: { floor: '#5b5b66', floor2: '#51515b', wall: '#1e1e26', wallTop: '#3c3c46', accent: '#9fb4c9', hazard: '#26303a', fog: 'rgba(20,24,36,.18)' },
  temple: { floor: '#c6ae7e', floor2: '#b9a173', wall: '#5e4d30', wallTop: '#947d51', accent: '#f6c453', hazard: '#5a4a2a', fog: 'rgba(80,60,20,.10)' },
  forest: { floor: '#4d9146', floor2: '#3c7a38', wall: '#1e3a1c', wallTop: '#2e5c2a', accent: '#9fd46f', hazard: '#2c6a8a', fog: 'rgba(20,50,20,.10)', scenery: 'bush' },
  swamp: { floor: '#5f7248', floor2: '#48583a', wall: '#232d1c', wallTop: '#3a4a2c', accent: '#9fd46f', hazard: '#37656f', fog: 'rgba(30,50,40,.18)', scenery: 'bush' },
  volcanic: { floor: '#6b4a3c', floor2: '#553127', wall: '#1a1210', wallTop: '#3f2a22', accent: '#ff8a3c', hazard: '#e0561f', fog: 'rgba(120,30,0,.14)' },
  forge: { floor: '#665859', floor2: '#5b4d4e', wall: '#221b1c', wallTop: '#453a3b', accent: '#ffb03a', hazard: '#e0561f', fog: 'rgba(90,40,10,.12)' },
  infernal: { floor: '#6d3c39', floor2: '#5f3330', wall: '#1e100f', wallTop: '#4a2622', accent: '#ff5f4a', hazard: '#e0561f', fog: 'rgba(120,10,10,.18)' },
  ice: { floor: '#d3e9f7', floor2: '#c3dff1', wall: '#4f7a99', wallTop: '#8fbcda', accent: '#ffffff', hazard: '#6fb8e0', fog: 'rgba(150,210,255,.10)' },
  fortress: { floor: '#7d7a70', floor2: '#726f65', wall: '#302c26', wallTop: '#565247', accent: '#c0392b', hazard: '#3a3730', fog: 'rgba(30,30,30,.10)' },
  camp: { floor: '#7d8c4e', floor2: '#728146', wall: '#3a2c1a', wallTop: '#5c4a2e', accent: '#f6c453', hazard: '#4a3a24', fog: 'rgba(40,50,20,.05)', scenery: 'bush' },
  farm: { floor: '#6cae59', floor2: '#63a552', wall: '#5c4326', wallTop: '#8a6a3e', accent: '#f6c453', hazard: '#3f8ef0', fog: 'rgba(255,240,180,.05)', scenery: 'hedge' },
  shadow: { floor: '#4a4360', floor2: '#413a54', wall: '#151122', wallTop: '#2c2739', accent: '#a98fff', hazard: '#1a1626', fog: 'rgba(10,6,20,.26)' },
  arcane: { floor: '#4e5c96', floor2: '#45528a', wall: '#191d36', wallTop: '#5766ab', accent: '#8fd8ff', hazard: '#5a6fd0', fog: 'rgba(40,50,120,.14)' },
  sunken: { floor: '#4d8589', floor2: '#43777b', wall: '#163236', wallTop: '#2c585c', accent: '#7fe0d0', hazard: '#2f8ea8', fog: 'rgba(20,80,90,.18)' },
  sky: { floor: '#eef3ff', floor2: '#dce4f7', wall: '#8fa2c9', wallTop: '#c8d4ee', accent: '#ffd97a', hazard: '#7f92c4', fog: 'rgba(190,215,255,.12)' },
  void: { floor: '#453a68', floor2: '#3c325b', wall: '#150f24', wallTop: '#5b4a8f', accent: '#b47fff', hazard: '#100a1c', fog: 'rgba(20,0,40,.22)' },
  abyss: { floor: '#35485f', floor2: '#2d3f54', wall: '#0e151f', wallTop: '#43617e', accent: '#4fd0e0', hazard: '#0d1420', fog: 'rgba(0,20,40,.24)' },
  corrupt: { floor: '#5b4870', floor2: '#513f63', wall: '#1d1526', wallTop: '#3d2f4d', accent: '#c46fe0', hazard: '#6a2f7a', fog: 'rgba(50,10,60,.20)' },
  ruins: { floor: '#7d8071', floor2: '#747767', wall: '#33362d', wallTop: '#5a5d50', accent: '#9fd46f', hazard: '#3c4038', fog: 'rgba(30,40,25,.10)' },
  gold: { floor: '#dcbb6c', floor2: '#cfae60', wall: '#6d5322', wallTop: '#a2833f', accent: '#fff0a8', hazard: '#7a5a20', fog: 'rgba(255,220,140,.10)' },
  dragon: { floor: '#6f5540', floor2: '#634a37', wall: '#1f1512', wallTop: '#443029', accent: '#ffb03a', hazard: '#e0561f', fog: 'rgba(90,40,10,.14)' },
  hideout: { floor: '#5c5046', floor2: '#52463c', wall: '#1d1814', wallTop: '#3a322a', accent: '#c0392b', hazard: '#241e1a', fog: 'rgba(20,16,10,.20)' },
  spider: { floor: '#584c5e', floor2: '#4e4353', wall: '#1c1722', wallTop: '#372f3d', accent: '#d8d0e8', hazard: '#5a3a6a', fog: 'rgba(30,20,40,.20)' },
};

/**
 * gen: cave | rooms | halls | open | islands | maze
 * hazard: lava | water | void | ice | web | poison | none
 * props: adereços espalhados (ver expedition-art.js)
 * ambient: partículas/clima (ember, snow, spore, drip, star, leaf, dust, bubble)
 */
const DUNGEON_THEMES = {
  farm: { gen: 'open', pal: 'farm', hazard: 'water', props: ['fence', 'haystack', 'crop', 'scarecrow', 'tree'], ambient: 'leaf', icon: '🌾', biome: 'plains', light: 1 },
  goblin_cave: { gen: 'cave', pal: 'cave', hazard: 'none', props: ['torch', 'bone', 'mushroom', 'crate'], ambient: 'drip', icon: '🕳️', biome: 'forest' },
  imp_cavern: { gen: 'cave', pal: 'volcanic', hazard: 'lava', props: ['torch', 'lavarock', 'skull'], ambient: 'ember', icon: '👹', biome: 'scorched' },
  collapsed_mine: { gen: 'maze', pal: 'mine', hazard: 'none', props: ['support', 'rail', 'cart', 'orevein', 'lantern'], ambient: 'dust', icon: '⛏️', biome: 'highlands' },
  spider_den: { gen: 'cave', pal: 'spider', hazard: 'web', props: ['web', 'eggsac', 'cocoon', 'bone'], ambient: 'spore', icon: '🕷️', biome: 'forest' },
  bandit_camp: { gen: 'open', pal: 'camp', hazard: 'none', props: ['tent', 'campfire', 'palisade', 'crate', 'barrel'], ambient: 'leaf', icon: '🏕️', biome: 'plains', light: 1 },
  undead_crypt: { gen: 'rooms', pal: 'crypt', hazard: 'none', props: ['coffin', 'skull', 'candle', 'statue', 'grave'], ambient: 'drip', icon: '⚰️', biome: 'deadwood' },
  orc_stronghold: { gen: 'halls', pal: 'fortress', hazard: 'none', props: ['banner', 'brazier', 'weaponrack', 'crate', 'spike'], ambient: 'dust', icon: '🪓', biome: 'badlands' },
  shadow_den: { gen: 'cave', pal: 'shadow', hazard: 'none', props: ['candle', 'shadowrune', 'bone'], ambient: 'shade', icon: '🌑', biome: 'blight' },
  ancient_temple: { gen: 'halls', pal: 'temple', hazard: 'none', props: ['pillar', 'brazier', 'idol', 'glyph', 'urn'], ambient: 'dust', icon: '🏛️', biome: 'desert' },
  ancient_forest_ruins: { gen: 'open', pal: 'forest', hazard: 'water', props: ['tree', 'ruinpillar', 'vine', 'mossstone', 'mushroom'], ambient: 'leaf', icon: '🌳', biome: 'forest', light: 1 },
  arcane_ruins: { gen: 'islands', pal: 'arcane', hazard: 'void', props: ['runestone', 'floatcrystal', 'pillar', 'glyph'], ambient: 'mote', icon: '🔮', biome: 'arcane' },
  rogue_sanctum: { gen: 'rooms', pal: 'hideout', hazard: 'none', props: ['candle', 'crate', 'carpet', 'dagger', 'bookshelf'], ambient: 'dust', icon: '🗡️', biome: 'forest' },
  guild_of_shadows: { gen: 'rooms', pal: 'shadow', hazard: 'none', props: ['candle', 'carpet', 'bookshelf', 'shadowrune', 'statue'], ambient: 'shade', icon: '🎭', biome: 'blight' },
  fortress_ruins: { gen: 'halls', pal: 'ruins', hazard: 'none', props: ['brokenwall', 'ruinpillar', 'banner', 'grass', 'statue'], ambient: 'dust', icon: '🏚️', biome: 'highlands', light: 1 },
  drowned_temple: { gen: 'halls', pal: 'sunken', hazard: 'water', props: ['pillar', 'algae', 'idol', 'coral', 'urn'], ambient: 'bubble', icon: '🌊', biome: 'reef' },
  blightwood: { gen: 'open', pal: 'swamp', hazard: 'poison', props: ['deadtree', 'spore', 'mushroom', 'bone', 'vine'], ambient: 'spore', icon: '🍄', biome: 'blight' },
  hollowfen: { gen: 'open', pal: 'swamp', hazard: 'water', props: ['deadtree', 'grave', 'reed', 'lantern', 'mushroom'], ambient: 'firefly', icon: '🕯️', biome: 'swamp' },
  volcanic_depths: { gen: 'cave', pal: 'volcanic', hazard: 'lava', props: ['lavarock', 'obsidian', 'vent', 'skull'], ambient: 'ember', icon: '🌋', biome: 'volcano' },
  ancient_forge: { gen: 'halls', pal: 'forge', hazard: 'lava', props: ['anvil', 'furnace', 'chain', 'crate', 'gear'], ambient: 'ember', icon: '⚒️', biome: 'scorched' },
  infernal_stronghold: { gen: 'halls', pal: 'infernal', hazard: 'lava', props: ['chain', 'skullpile', 'brazier', 'spike', 'banner'], ambient: 'ember', icon: '😈', biome: 'volcano' },
  dragon_lair: { gen: 'cave', pal: 'dragon', hazard: 'lava', props: ['goldpile', 'egg', 'bone', 'lavarock', 'skullpile'], ambient: 'ember', icon: '🐉', biome: 'volcano' },
  frozen_citadel: { gen: 'halls', pal: 'ice', hazard: 'ice', props: ['icicle', 'icepillar', 'frozenstatue', 'brazier'], ambient: 'snow', icon: '🏰', biome: 'glacier', light: 1 },
  sunspire: { gen: 'halls', pal: 'gold', hazard: 'none', props: ['pillar', 'sunidol', 'brazier', 'glyph', 'banner'], ambient: 'sunray', icon: '☀️', biome: 'dunes', light: 1 },
  cloud_kingdom: { gen: 'islands', pal: 'sky', hazard: 'void', props: ['cloud', 'pillar', 'skyflower', 'statue'], ambient: 'cloud', icon: '☁️', biome: 'highlands', light: 1 },
  corrupted_sanctum: { gen: 'rooms', pal: 'corrupt', hazard: 'poison', props: ['taintedstatue', 'candle', 'glyph', 'vine', 'pillar'], ambient: 'spore', icon: '🕯️', biome: 'blight' },
  abyssal_ruins: { gen: 'islands', pal: 'abyss', hazard: 'void', props: ['ruinpillar', 'coral', 'runestone', 'bone'], ambient: 'bubble', icon: '🌀', biome: 'ocean' },
  abyssal_throne: { gen: 'halls', pal: 'abyss', hazard: 'void', props: ['throne', 'pillar', 'chain', 'skullpile', 'runestone'], ambient: 'bubble', icon: '👑', biome: 'ocean' },
  void_rift: { gen: 'islands', pal: 'void', hazard: 'void', props: ['rift', 'floatcrystal', 'runestone', 'star'], ambient: 'star', icon: '🌌', biome: 'crystal' },
};

/* Fallback por palavra-chave para dungeons futuras. */
function themeByName(key, displayName) {
  const s = ((key || '') + ' ' + (displayName || '')).toLowerCase();
  const has = (...w) => w.some(x => s.includes(x));
  if (has('volcan', 'lava', 'magma', 'ember')) return DUNGEON_THEMES.volcanic_depths;
  if (has('froz', 'ice', 'glaci', 'snow', 'winter')) return DUNGEON_THEMES.frozen_citadel;
  if (has('swamp', 'fen', 'bog', 'marsh')) return DUNGEON_THEMES.hollowfen;
  if (has('forest', 'wood', 'grove')) return DUNGEON_THEMES.ancient_forest_ruins;
  if (has('temple', 'shrine')) return DUNGEON_THEMES.ancient_temple;
  if (has('crypt', 'tomb', 'grave', 'undead')) return DUNGEON_THEMES.undead_crypt;
  if (has('forge', 'foundry')) return DUNGEON_THEMES.ancient_forge;
  if (has('mine', 'quarry')) return DUNGEON_THEMES.collapsed_mine;
  if (has('sky', 'cloud')) return DUNGEON_THEMES.cloud_kingdom;
  if (has('void', 'rift')) return DUNGEON_THEMES.void_rift;
  if (has('abyss', 'drown', 'sunken')) return DUNGEON_THEMES.abyssal_ruins;
  if (has('shadow', 'dark')) return DUNGEON_THEMES.shadow_den;
  if (has('spider', 'web')) return DUNGEON_THEMES.spider_den;
  if (has('camp', 'bandit')) return DUNGEON_THEMES.bandit_camp;
  if (has('fortress', 'strong', 'citadel', 'castle', 'throne')) return DUNGEON_THEMES.fortress_ruins;
  if (has('sanctum', 'corrupt')) return DUNGEON_THEMES.corrupted_sanctum;
  if (has('arcane', 'rune', 'magic')) return DUNGEON_THEMES.arcane_ruins;
  return DUNGEON_THEMES.goblin_cave;
}

/* =====================================================================
   WORLDGEN
   ===================================================================== */
const WorldGen = {
  BIOMES, REGIONS, SETTLEMENTS, WATER_ANCHORS, DUNGEON_THEMES, DUNGEON_PALETTES,
  roads: null,
  _biomeCache: new Map(),
  CONTINENT_R: 214,

  init() {
    if (this.roads) return;
    this.roads = buildRoads();
    // índice de prédios absolutos (marcos + casario gerado)
    this.buildings = [];
    for (const s of SETTLEMENTS) {
      for (const b of (s.buildings || [])) {
        this.buildings.push({
          ...b, x: s.x + b.dx, y: s.y + b.dy, settlement: s.key, settlementRef: s,
        });
      }
    }
    for (const s of SETTLEMENTS) this.buildings.push(...this.housesFor(s));
    // índice tile → prédio (O(1) em colisão/render)
    this._btiles = new Map();
    this._apron = new Set();
    for (const b of this.buildings) {
      for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) this._btiles.set(x + ',' + y, b);
      for (let y = b.y - 1; y <= b.y + b.h; y++) for (let x = b.x - 1; x <= b.x + b.w; x++) this._apron.add(x + ',' + y);
    }
  },

  /** Casario residencial: dá vida às cidades (sólido, sem interação). */
  housesFor(s) {
    const rng = mulberry32(hashStr('houses:' + s.key));
    const count = { capital: 16, kingdom: 12, city: 9, village: 7, outpost: 4 }[s.kind] || 6;
    const style = s.ground === 'sand' ? 'dome' : s.ground === 'jungle' ? 'hut'
      : s.ground === 'boardwalk' ? 'stilt' : s.ground === 'savanna' ? 'hut' : 'house';
    const plazaR = s.kind === 'capital' ? 8 : s.kind === 'kingdom' ? 6 : 4;
    const out = [];
    const taken = (x, y, w, h) => {
      for (const b of (s.buildings || [])) {
        const bx = s.x + b.dx, by = s.y + b.dy;
        if (x - 1 < bx + b.w && x + w + 1 > bx && y - 1 < by + b.h && y + h + 1 > by) return true;
      }
      for (const b of out) if (x - 1 < b.x + b.w && x + w + 1 > b.x && y - 1 < b.y + b.h && y + h + 1 > b.y) return true;
      return false;
    };
    for (let tries = 0; tries < 500 && out.length < count; tries++) {
      const w = 3 + Math.floor(rng() * 2), h = 2 + Math.floor(rng() * 2);
      const a = rng() * Math.PI * 2, rr = plazaR + 2 + rng() * (s.r - plazaR - 5);
      const x = Math.round(s.x + Math.cos(a) * rr), y = Math.round(s.y + Math.sin(a) * rr);
      const dx = x - s.x, dy = y - s.y;
      if (Math.hypot(dx, dy) > s.r - 3.5) continue;
      if (Math.abs(dx) <= 2.5 && Math.abs(dx + w) <= 2.5) continue;     // não fecha a rua
      if (Math.abs(dy) <= 2.5 || Math.abs(dx) <= 2.5) continue;
      if (taken(x, y, w, h)) continue;
      if ((s.reserved || []).some(rz => x - 1 < rz.x + rz.w && x + w + 1 > rz.x && y - 1 < rz.y + rz.h && y + h + 1 > rz.y)) continue;
      out.push({
        key: 'house', x, y, w, h, style, icon: '',
        name: 'Casa', nameEn: 'House', decor: true,
        settlement: s.key, settlementRef: s, tint: 1 + Math.floor(rng() * 5),
      });
    }
    return out;
  },

  localized(obj, field = 'name') {
    const pt = typeof I18n !== 'undefined' && I18n.locale && /^pt/i.test(I18n.locale);
    const en = obj[field + 'En'] || obj[field];
    return pt ? (obj[field] || en) : en;
  },

  /* ---------------- assentamentos ---------------- */

  settlementAt(tx, ty, pad = 0) {
    for (const s of SETTLEMENTS) {
      if (Math.hypot(tx - s.x, ty - s.y) <= s.r + pad) return s;
    }
    return null;
  },
  settlement(key) { return SETTLEMENTS.find(s => s.key === key) || null; },

  /** Muralha de um assentamento (anel de pedra com portões cardeais). */
  wallAt(tx, ty) {
    for (const s of SETTLEMENTS) {
      if (!s.wall) continue;
      const dx = tx - s.x, dy = ty - s.y;
      const r = Math.hypot(dx, dy);
      if (r < s.r + 0.35 || r > s.r + 1.9) continue;
      if (this.gateOpening(s, dx, dy)) return false;
      return true;
    }
    return false;
  },
  gateOpening(s, dx, dy) {
    for (const g of (s.gates || ['s'])) {
      if (g === 's' && dy > 0 && Math.abs(dx) <= 1) return true;
      if (g === 'n' && dy < 0 && Math.abs(dx) <= 1) return true;
      if (g === 'e' && dx > 0 && Math.abs(dy) <= 1) return true;
      if (g === 'w' && dx < 0 && Math.abs(dy) <= 1) return true;
    }
    return false;
  },
  /** Torres de portão: reforço decorativo dos dois lados de cada abertura. */
  gateTowerAt(tx, ty) {
    for (const s of SETTLEMENTS) {
      if (!s.wall) continue;
      const dx = tx - s.x, dy = ty - s.y;
      if (Math.abs(Math.hypot(dx, dy) - (s.r + 1.1)) > 1.1) continue;
      for (const g of (s.gates || ['s'])) {
        if ((g === 's' && dy > 0 || g === 'n' && dy < 0) && Math.abs(dx) >= 1.6 && Math.abs(dx) <= 2.6) return true;
        if ((g === 'e' && dx > 0 || g === 'w' && dx < 0) && Math.abs(dy) >= 1.6 && Math.abs(dy) <= 2.6) return true;
      }
    }
    return false;
  },

  /** Calçada de terra batida em volta de cada prédio. */
  buildingApron(tx, ty) {
    this.init();
    return this._apron.has(tx + ',' + ty);
  },

  buildingAt(tx, ty) {
    this.init();
    return this._btiles.get(tx + ',' + ty) || null;
  },

  /* ---------------- estradas ---------------- */

  roadAt(tx, ty) {
    this.init();
    for (const r of this.roads) {
      const d = distToSegment(tx, ty, r.a, r.b);
      if (d <= (r.minor ? 0.9 : 1.35)) return r;
    }
    return null;
  },

  /* ---------------- biomas ---------------- */

  regionAt(tx, ty) {
    let best = null, bs = Infinity;
    for (const reg of REGIONS) {
      const wx = fbm(tx * 0.012 + 40, ty * 0.012 + 40, 2) - 0.5;
      const wy = fbm(tx * 0.012 - 40, ty * 0.012 - 40, 2) - 0.5;
      const d = Math.hypot(tx - reg.x + wx * 34, ty - reg.y + wy * 34) / reg.r;
      if (d < bs) { bs = d; best = reg; }
    }
    return bs <= 1.12 ? best : null;
  },

  /** Bioma (chave) do tile — determinístico e cacheado. */
  biomeKeyAt(tx, ty) {
    const ck = tx + ',' + ty;
    const hit = this._biomeCache.get(ck);
    if (hit !== undefined) return hit;
    const b = this._computeBiome(tx, ty);
    if (this._biomeCache.size > 240000) this._biomeCache.clear();
    this._biomeCache.set(ck, b);
    return b;
  },
  biomeAt(tx, ty) { return BIOMES[this.biomeKeyAt(tx, ty)] || BIOMES.plains; },

  _computeBiome(tx, ty) {
    this.init();
    // 1. assentamento: chão urbano
    const s = this.settlementAt(tx, ty);
    if (s) return s.ground === 'sand' ? 'desert' : s.ground === 'snow' ? 'tundra'
      : s.ground === 'ash' ? 'ashlands' : s.ground === 'jungle' ? 'jungle'
        : s.ground === 'boardwalk' ? 'swamp' : s.ground === 'savanna' ? 'savanna'
          : s.ground === 'blight' ? 'blight' : s.ground === 'arcane' ? 'arcane' : 'plains';

    // 2. costa/oceano — continente com borda ruidosa
    const dist = Math.hypot(tx, ty);
    const coast = this.CONTINENT_R + (fbm(tx * 0.02 + 900, ty * 0.02 + 900, 3) - 0.5) * 70;
    if (dist > coast + 7) return 'ocean';
    if (dist > coast) return 'reef';
    if (dist > coast - 5) return 'beach';

    // 3. lagos/baías fixas
    for (const w of WATER_ANCHORS) {
      const d = Math.hypot(tx - w.x, ty - w.y) / w.r;
      const wob = (fbm(tx * 0.09 + 33, ty * 0.09 + 33, 2) - 0.5) * 0.35;
      if (d + wob < 0.82) return 'ocean';
      if (d + wob < 1.0) return 'reef';
      if (d + wob < 1.12) return 'beach';
    }

    // 4. lagos e rios — só onde faz sentido no clima da região
    const elev = fbm(tx * 0.045, ty * 0.045, 4);
    const reg = this.regionAt(tx, ty);
    const rk = reg ? reg.key : null;
    const dry = rk === 'sunscar' || rk === 'emberwaste' || rk === 'blightlands';
    const cold = rk === 'frostpeaks';
    if (!dry) {
      if (cold) {
        if (elev < 0.30) return 'glacier';
      } else if (rk === 'mirefen') {
        if (elev < 0.36) return 'bog';
      } else {
        if (elev < 0.288) return 'ocean';
        if (elev < 0.305) return 'reef';
        if (elev < 0.318) return 'beach';
      }
    }

    // 5. cordilheiras (ruído de crista) — barreiras naturais entre reinos
    const ridge = 1 - Math.abs(fbm(tx * 0.028 + 300, ty * 0.028 + 300, 3) - 0.5) * 2.6;
    if (ridge > 0.90 && dist > 26) {
      if (rk === 'emberwaste') return ridge > 0.95 ? 'volcano' : 'scorched';
      return 'mountain';
    }

    // 6. região dominante
    if (reg) {
      const n = fbm(tx * 0.055 + 700, ty * 0.055 + 700, 3);
      const dn = Math.hypot(tx - reg.x, ty - reg.y) / reg.r;
      if (dn < 0.34 && reg.core) {
        if (reg.key === 'emberwaste') {
          const cone = Math.hypot(tx - reg.x, ty - reg.y);
          if (cone < 9) return 'lavafield';
          if (cone < 16) return 'volcano';
        }
        if (reg.key === 'heartlands') return n > 0.56 ? 'forest' : 'meadow';
        return reg.core;
      }
      const mix = reg.mix || [reg.core];
      const idx = Math.min(mix.length - 1, Math.floor(n * mix.length));
      return mix[idx];
    }

    // 7. terra de ninguém: clima por ruído
    const moist = fbm(tx * 0.06 + 100, ty * 0.06 + 100, 3);
    const temp = fbm(tx * 0.03 - 250, ty * 0.03 - 250, 3) + (-ty / 600);
    if (temp < 0.36) return moist > 0.5 ? 'pinewood' : 'tundra';
    if (temp > 0.66) return moist > 0.55 ? 'savanna' : 'desert';
    if (moist > 0.60) return 'forest';
    if (moist > 0.50) return 'meadow';
    return 'plains';
  },

  /* ---------------- terreno final do overworld ---------------- */

  terrainAt(tx, ty) {
    this.init();
    const s = this.settlementAt(tx, ty);
    if (s) {
      const dx = tx - s.x, dy = ty - s.y, r = Math.hypot(dx, dy);
      const plazaR = s.kind === 'capital' ? 8 : s.kind === 'kingdom' ? 6 : 4;
      if (r < plazaR) return TERRAIN.PLAZA;
      // ruas cardeais + avenida em anel; o resto é chão natural (jardins/pátios)
      const street = Math.abs(dx) <= 1.6 || Math.abs(dy) <= 1.6 ||
        Math.abs(r - s.r * 0.62) < 1.2 ||
        !!this.buildingApron(tx, ty);
      if (street) return TERRAIN.ROAD;
      return this.biomeAt(tx, ty).terrain;
    }
    if (this.roadAt(tx, ty)) return TERRAIN.ROAD;
    return this.biomeAt(tx, ty).terrain;
  },
};

/* =====================================================================
   GERAÇÃO DE DUNGEON — layouts por tema
   ===================================================================== */
const DungeonGen = {
  W: 97, H: 73, OX: 48, OY: 36,
  cache: new Map(),

  theme(key, def) {
    return DUNGEON_THEMES[key] || themeByName(key, def && def.display_name);
  },

  layout(key, def) {
    if (this.cache.has(key)) return this.cache.get(key);
    const L = this.build(key, def);
    this.cache.set(key, L);
    return L;
  },

  idx(tx, ty) {
    const x = tx + this.OX, y = ty + this.OY;
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return -1;
    return y * this.W + x;
  },

  build(key, def) {
    const theme = this.theme(key, def);
    const rng = mulberry32(hashStr('dungeon:' + key));
    const W = this.W, H = this.H;
    const grid = new Uint8Array(W * H).fill(TERRAIN.WALL);
    const rooms = [];
    const props = [];
    const put = (x, y, t) => { if (x > 0 && y > 0 && x < W - 1 && y < H - 1) grid[y * W + x] = t; };
    const get = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? TERRAIN.WALL : grid[y * W + x];
    const floorT = () => (rng() < 0.22 ? TERRAIN.FLOOR2 : TERRAIN.FLOOR);
    const carveRect = (cx, cy, w, h) => {
      for (let y = cy - (h >> 1); y <= cy + (h >> 1); y++)
        for (let x = cx - (w >> 1); x <= cx + (w >> 1); x++) put(x, y, floorT());
      rooms.push({ x: cx, y: cy, w, h });
    };
    const carveDisc = (cx, cy, r) => {
      for (let y = Math.floor(cy - r); y <= cy + r; y++)
        for (let x = Math.floor(cx - r); x <= cx + r; x++)
          if (Math.hypot(x - cx, y - cy) <= r) put(x, y, floorT());
      rooms.push({ x: cx, y: cy, w: r * 2, h: r * 2, round: true });
    };
    const corridor = (a, b, wdt = 1) => {
      let x = a.x, y = a.y;
      const step = () => { for (let oy = -wdt; oy <= wdt; oy++) for (let ox = -wdt; ox <= wdt; ox++) put(x + ox, y + oy, floorT()); };
      const horizFirst = rng() < 0.5;
      const walkX = () => { while (x !== b.x) { x += x < b.x ? 1 : -1; step(); } };
      const walkY = () => { while (y !== b.y) { y += y < b.y ? 1 : -1; step(); } };
      if (horizFirst) { walkX(); walkY(); } else { walkY(); walkX(); }
    };

    const center = { x: this.OX, y: this.OY };   // tile (0,0) do mundo

    if (theme.gen === 'cave') {
      // ruído + salas escavadas (caverna orgânica)
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        const n = fbm((x - this.OX) * 0.085 + hashStr(key) % 97, (y - this.OY) * 0.085 + 13, 4);
        if (n < 0.5) grid[y * W + x] = floorT();
      }
      carveDisc(center.x, center.y, 5);
      for (let i = 0; i < 9; i++) {
        const a = rng() * Math.PI * 2, d = 10 + rng() * 34;
        const cx = Math.round(center.x + Math.cos(a) * d), cy = Math.round(center.y + Math.sin(a) * d * 0.7);
        carveDisc(cx, cy, 3 + rng() * 4);
      }
      for (let i = 1; i < rooms.length; i++) corridor(rooms[i - 1], rooms[i], 1);
    } else if (theme.gen === 'rooms' || theme.gen === 'halls') {
      const big = theme.gen === 'halls';
      carveRect(center.x, center.y, big ? 13 : 9, big ? 11 : 9);
      const count = big ? 8 : 11;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + rng() * 0.5;
        const d = 13 + rng() * 26;
        const cx = Math.round(center.x + Math.cos(a) * d);
        const cy = Math.round(center.y + Math.sin(a) * d * 0.72);
        const w = (big ? 11 : 7) + Math.floor(rng() * 7);
        const h = (big ? 9 : 5) + Math.floor(rng() * 5);
        carveRect(cx, cy, w | 1, h | 1);
      }
      for (let i = 1; i < rooms.length; i++) corridor(rooms[i], rooms[i - 1], big ? 1 : 0);
      corridor(rooms[rooms.length - 1], rooms[0], 0);
      // colunas dentro dos salões
      if (big) for (const r of rooms) {
        if (r.w < 9) continue;
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
          const px = r.x + sx * Math.floor(r.w / 3), py = r.y + sy * Math.floor(r.h / 3);
          if (get(px, py) !== TERRAIN.WALL) { grid[py * W + px] = TERRAIN.WALL; props.push({ x: px, y: py, t: 'pillar' }); }
        }
      }
    } else if (theme.gen === 'maze') {
      // túneis longos e cruzados (mina)
      carveDisc(center.x, center.y, 4);
      let cur = { x: center.x, y: center.y };
      for (let i = 0; i < 26; i++) {
        const horiz = i % 2 === 0;
        const len = 6 + Math.floor(rng() * 16);
        const nxt = {
          x: XU.clamp(cur.x + (horiz ? (rng() < 0.5 ? -len : len) : 0), 4, W - 5),
          y: XU.clamp(cur.y + (horiz ? 0 : (rng() < 0.5 ? -len : len)), 4, H - 5),
        };
        corridor(cur, nxt, rng() < 0.25 ? 1 : 0);
        if (rng() < 0.35) carveRect(nxt.x, nxt.y, 5 + Math.floor(rng() * 4) * 2, 5);
        else rooms.push(nxt);
        cur = nxt;
      }
    } else if (theme.gen === 'islands') {
      // plataformas flutuantes ligadas por pontes (céu / vazio / abismo)
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) grid[y * W + x] = TERRAIN.VOID;
      carveDisc(center.x, center.y, 6);
      const isles = [{ x: center.x, y: center.y }];
      for (let i = 0; i < 11; i++) {
        const a = (i / 11) * Math.PI * 2 + rng() * 0.6, d = 12 + rng() * 30;
        const cx = Math.round(center.x + Math.cos(a) * d), cy = Math.round(center.y + Math.sin(a) * d * 0.72);
        carveDisc(cx, cy, 4 + rng() * 4);
        isles.push({ x: cx, y: cy });
      }
      for (let i = 1; i < isles.length; i++) {
        const from = isles[i], to = isles[i % 3 === 0 ? 0 : i - 1];
        let x = from.x, y = from.y;
        while (x !== to.x || y !== to.y) {
          if (x !== to.x) x += x < to.x ? 1 : -1;
          else if (y !== to.y) y += y < to.y ? 1 : -1;
          put(x, y, TERRAIN.FLOOR2); put(x, y + 1, TERRAIN.FLOOR2);
          if (rng() < 0.08) props.push({ x, y, t: 'bridgepost' });
        }
      }
      rooms.length = 0; rooms.push(...isles.map(i => ({ x: i.x, y: i.y, w: 8, h: 8, round: true })));
    } else { // open — acampamentos, fazendas, florestas, pântanos
      const R = 34;
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        const d = Math.hypot(x - center.x, (y - center.y) * 1.35) / R;
        const wob = (fbm(x * 0.07 + 5, y * 0.07 + 5, 3) - 0.5) * 0.5;
        if (d + wob < 1) grid[y * W + x] = floorT();
      }
      // obstáculos naturais (moitas / pedras / cercas)
      for (let i = 0; i < 40; i++) {
        const a = rng() * Math.PI * 2, d = 6 + rng() * (R - 6);
        const cx = Math.round(center.x + Math.cos(a) * d), cy = Math.round(center.y + Math.sin(a) * d * 0.7);
        if (Math.hypot(cx - center.x, cy - center.y) < 6) continue;
        const r = rng() < 0.3 ? 2 : 1;
        for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++)
          if (get(x, y) !== TERRAIN.WALL && rng() < 0.7) grid[y * W + x] = TERRAIN.WALL;
      }
      carveDisc(center.x, center.y, 5);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2, d = 12 + rng() * 18;
        rooms.push({ x: Math.round(center.x + Math.cos(a) * d), y: Math.round(center.y + Math.sin(a) * d * 0.7), w: 6, h: 6 });
      }
    }

    // ---- perigos temáticos (poças de lava/água/veneno/gelo/teia) ----
    const hz = theme.hazard;
    if (hz && hz !== 'none') {
      const blobs = hz === 'ice' ? 10 : (theme.gen === 'open' ? 16 : 8);
      for (let i = 0; i < blobs; i++) {
        const room = rooms[Math.floor(rng() * rooms.length)];
        if (!room) break;
        if (Math.hypot(room.x - center.x, room.y - center.y) < 8) continue;
        const r = (theme.gen === 'open' ? 2.4 : 1.6) + rng() * (theme.gen === 'open' ? 4 : 2.6);
        for (let y = Math.floor(room.y - r); y <= room.y + r; y++)
          for (let x = Math.floor(room.x - r); x <= room.x + r; x++)
            if (Math.hypot(x - room.x, y - room.y) <= r && get(x, y) !== TERRAIN.WALL)
              grid[y * W + x] = (hz === 'ice' ? TERRAIN.FLOOR2 : TERRAIN.HAZARD);
        if (hz === 'ice') props.push({ x: room.x, y: room.y, t: 'icepatch', r });
      }
    }

    // poças extras espalhadas nos temas abertos (pântanos, ruínas alagadas…)
    if (hz && hz !== 'none' && hz !== 'ice' && theme.gen === 'open') {
      for (let i = 0; i < 26; i++) {
        const cx = 6 + Math.floor(rng() * (W - 12)), cy = 6 + Math.floor(rng() * (H - 12));
        if (Math.hypot(cx - center.x, cy - center.y) < 8) continue;
        const r = 1 + rng() * 2.2;
        for (let y = Math.floor(cy - r); y <= cy + r; y++)
          for (let x = Math.floor(cx - r); x <= cx + r; x++)
            if (Math.hypot(x - cx, y - cy) <= r && get(x, y) === TERRAIN.FLOOR || get(x, y) === TERRAIN.FLOOR2)
              if (Math.hypot(x - cx, y - cy) <= r) grid[y * W + x] = TERRAIN.HAZARD;
      }
    }

    // ---- adereços: tochas nas paredes + props do tema nas salas ----
    const propTypes = theme.props || ['torch'];
    for (const r of rooms) {
      const n = 1 + Math.floor(rng() * 3);
      for (let i = 0; i < n; i++) {
        const px = r.x + Math.round((rng() - 0.5) * Math.max(2, r.w - 2));
        const py = r.y + Math.round((rng() - 0.5) * Math.max(2, r.h - 2));
        if (get(px, py) === TERRAIN.WALL || get(px, py) === TERRAIN.HAZARD) continue;
        if (Math.hypot(px - center.x, py - center.y) < 4) continue;
        props.push({ x: px, y: py, t: propTypes[Math.floor(rng() * propTypes.length)] });
      }
    }
    // dispersão geral de adereços pelo piso (deixa o tema visível em toda parte)
    const density = theme.gen === 'open' ? 0.10 : theme.gen === 'islands' ? 0.07 : 0.05;
    for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
      const t = get(x, y);
      if (t !== TERRAIN.FLOOR && t !== TERRAIN.FLOOR2) continue;
      if (Math.hypot(x - center.x, y - center.y) < 6) continue;
      if (rng() > density * 0.25) continue;
      props.push({ x, y, t: propTypes[Math.floor(rng() * propTypes.length)] });
    }

    // tochas/luzes junto às paredes (guiam o caminho)
    if (theme.light !== 1) {
      for (let y = 2; y < H - 2; y += 2) for (let x = 2; x < W - 2; x += 2) {
        if (get(x, y) === TERRAIN.WALL) continue;
        if (get(x, y - 1) !== TERRAIN.WALL) continue;
        if (rng() < 0.055) props.push({ x, y, t: theme.pal === 'ice' ? 'brazier' : 'torch', wall: true });
      }
    }

    return {
      key, theme, grid, W, H, OX: this.OX, OY: this.OY, rooms, props,
      pal: DUNGEON_PALETTES[theme.pal] || DUNGEON_PALETTES.cave,
    };
  },

  terrainAt(L, tx, ty) {
    const x = tx + L.OX, y = ty + L.OY;
    if (x < 0 || y < 0 || x >= L.W || y >= L.H) return L.theme.gen === 'islands' ? TERRAIN.VOID : TERRAIN.WALL;
    return L.grid[y * L.W + x];
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TERRAIN, SOLID_TERRAIN, WATER_TERRAIN, BIOMES, REGIONS, SETTLEMENTS, WorldGen, DungeonGen, DUNGEON_THEMES };
}

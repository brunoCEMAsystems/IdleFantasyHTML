/* =====================================================================
   EXPEDITIONS — expedition-world.js
   Mundo aberto + cidade + dungeons instanciadas + entidades + gameplay
   em tempo real. Dados e fórmulas vêm do repo (GameData/Sim/State);
   coleta e combate aplicam XP/itens direto no save compartilhado.
   ===================================================================== */
'use strict';

const TILE = 32, SCALE = 2;
// TERRAIN / SOLID_TERRAIN / WATER_TERRAIN vêm de expedition-worldgen.js

const World = {
  mode: 'overworld',          // overworld | dungeon
  dungeonKey: null,           // dungeon ativo
  dungeonKills: 0,
  dungeonFoodEaten: 0,
  dungeonLayout: null,        // layout gerado pelo tema da dungeon
  enemies: [], bosses: [], particles: [], floats: [], projectiles: [], npcs: [],
  resources: new Map(), regrowing: new Map(),
  terrainCache: new Map(), enemySprites: new Map(),
  gates: [],                  // entradas de dungeon no overworld
  camera: { x: 0, y: 0, shake: 0, sx: 0, sy: 0 },
  time: 0,
  townR: 19,                  // raio da capital (tiles)
  heroSprites: null,
  player: null,
  interactTarget: null,       // {label, sub, action}
  autoEat: true,
  sessionCoins: 0,
  ambient: [],                // partículas de clima do bioma/dungeon
  _ambientT: 0,

  /* ---------------- terreno & biomas ---------------- */

  /** Capital (compatibilidade: "a cidade" = Aurélia). */
  inTown(tx, ty) { return Math.hypot(tx, ty) <= this.townR; },
  /** Qualquer assentamento (capital, reinos, vilas, postos). */
  settlementAt(tx, ty, pad = 0) { return WorldGen.settlementAt(tx, ty, pad); },
  get SETTLEMENTS() { return WorldGen.SETTLEMENTS; },
  capital() { return WorldGen.SETTLEMENTS[0]; },

  biomeAt(tx, ty) { return WorldGen.biomeAt(tx, ty); },
  regionAt(tx, ty) { return WorldGen.regionAt(tx, ty); },
  roadAt(tx, ty) { return WorldGen.roadAt(tx, ty); },

  terrainAt(tx, ty) {
    if (this.mode === 'dungeon') return this.dungeonTerrainAt(tx, ty);
    const key = tx + ',' + ty;
    const c = this.terrainCache.get(key);
    if (c !== undefined) return c;
    const t = WorldGen.terrainAt(tx, ty);
    if (this.terrainCache.size > 200000) this.terrainCache.clear();
    this.terrainCache.set(key, t);
    return t;
  },

  isWater(tx, ty) { return WATER_TERRAIN.has(this.terrainAt(tx, ty)); },

  // ---- edifícios sólidos de TODOS os assentamentos (retângulos em tiles) ----
  // `name` é o rótulo localizado em tempo real; `nameEn` é o fallback inglês.
  get BUILDINGS() { WorldGen.init(); return WorldGen.buildings; },

  WELL: { x: 0, y: -3 },                                // fonte central (sólida)
  LAMPS: [{ x: -6, y: 0 }, { x: 6, y: 0 }, { x: 0, y: 6 }, { x: -5, y: -7 }, { x: 5, y: -7 },
    { x: -9, y: 7 }, { x: 9, y: 7 }, { x: 0, y: -12 }],
  NPC_HOME: { x: 0, y: 6 },       // Slayer Master fica parado aqui
  PORTAL: { x: 7, y: 7 },         // portal para o modo Hub
  FARM_SPOTS: [{ x: -6, y: 13 }, { x: -4, y: 13 }, { x: -2, y: 13 }, { x: 0, y: 13 }, { x: 2, y: 13 }],

  buildingAt(tx, ty) { return WorldGen.buildingAt(tx, ty); },
  portalTile(tx, ty) { return tx === this.PORTAL.x && ty === this.PORTAL.y; },

  /* ---- muralhas: anéis de pedra/gelo/arenito ao redor das cidades ---- */

  /** Tile de muralha (qualquer assentamento murado), com portões abertos. */
  wallAt(tx, ty) { return WorldGen.wallAt(tx, ty); },
  gateTowerAt(tx, ty) { return WorldGen.gateTowerAt(tx, ty); },

  farmSpotAt(tx, ty) {
    for (let i = 0; i < this.FARM_SPOTS.length; i++) {
      const s = this.FARM_SPOTS[i];
      if (s.x === tx && s.y === ty) return i;
    }
    return -1;
  },

  // ---- dungeon instanciada (layout do tema) ----
  dungeonLayoutFor(key) {
    return DungeonGen.layout(key, GameData.dungeons[key]);
  },
  dungeonTheme() {
    return this.dungeonLayout ? this.dungeonLayout.theme : DungeonGen.theme(this.dungeonKey, GameData.dungeons[this.dungeonKey]);
  },
  dungeonTerrainAt(tx, ty) {
    if (!this.dungeonLayout && this.dungeonKey) this.dungeonLayout = this.dungeonLayoutFor(this.dungeonKey);
    if (!this.dungeonLayout) return TERRAIN.FLOOR;
    if (Math.hypot(tx, ty) < 4.2) return TERRAIN.FLOOR;   // entrada sempre livre
    return DungeonGen.terrainAt(this.dungeonLayout, tx, ty);
  },

  solidTile(tx, ty) {
    if (this.mode === 'overworld') {
      if (this.buildingAt(tx, ty)) return true;
      if (this.WELL && tx >= this.WELL.x - 1 && tx <= this.WELL.x + 1 && ty >= this.WELL.y - 1 && ty <= this.WELL.y + 1) return true;
      if (this.wallAt(tx, ty)) return true;
      if (this.resources.has(tx + ',' + ty)) return true;
    }
    return SOLID_TERRAIN.has(this.terrainAt(tx, ty));
  },
  collidesRect(px, py, pw, ph) {
    const x0 = Math.floor(px / TILE), x1 = Math.floor((px + pw - 1) / TILE),
      y0 = Math.floor(py / TILE), y1 = Math.floor((py + ph - 1) / TILE);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (this.solidTile(tx, ty)) return true;
    return false;
  },

  /* ---------------- recursos (árvores/rochas) ---------------- */

  resourceAt(tx, ty) {
    if (this.mode === 'dungeon') return null;
    // nenhum nó dentro/junto de cidades, nem em cima das estradas
    if (this.settlementAt(tx, ty, 3.2)) return null;
    if (this.roadAt(tx, ty)) return null;
    if (this.gateTiles && this.gateTiles.has(tx + ',' + ty)) return null;
    const t = this.terrainAt(tx, ty);
    if (SOLID_TERRAIN.has(t) || t === TERRAIN.ROAD || t === TERRAIN.PLAZA) return null;
    const biome = this.biomeAt(tx, ty);
    const r = hash2(tx * 7.13 + 3.7, ty * 13.7 + 5.1);

    // ---- árvores: densidade e espécie dependem do bioma ----
    const tcfg = biome.tree;
    if (tcfg && tcfg.chance > 0 && r < tcfg.chance) {
      const rr = hash2(tx * 3.1, ty * 5.7);
      const n = EXP.TREES.length;
      // bias do bioma empurra a espécie para tiers melhores (selva/arcano = madeiras nobres)
      const pos = XU.clamp(Math.pow(rr, 1.8) * 0.55 + tcfg.bias * 0.85, 0, 0.999);
      const ti = Math.min(n - 1, Math.floor(pos * n));
      return { kind: 'tree', id: ti, style: tcfg.palm ? 'palm' : tcfg.pine ? 'pine' : tcfg.dead ? 'dead' : tcfg.acacia ? 'acacia' : 'oak' };
    }

    // ---- rochas: minério ponderado pelo bioma + distância da capital ----
    const ocfg = biome.ore;
    if (ocfg && ocfg.chance > 0 && r >= 0.5 && r < 0.5 + ocfg.chance) {
      const dist = Math.hypot(tx, ty);
      const far = XU.clamp((dist - 20) / 120, 0, 1);
      const rr = hash2(tx * 5.1, ty * 7.7);
      if (rr < 0.012 + ocfg.bias * 0.02) return { kind: 'rock', ore: 'essence' };   // essência rúnica
      const O = EXP.ORES;
      const target = XU.clamp(far * 0.55 + ocfg.bias * 0.55, 0, 1);
      let weights = O.map((o, i) => {
        const pos = i / Math.max(1, O.length - 1);
        return Math.max(0.02, 1 - Math.abs(pos - target) * 1.9);
      });
      const total = weights.reduce((x, y) => x + y, 0);
      let roll = ((rr * 997) % 1) * total;
      let oi = 0;
      for (let i = 0; i < O.length; i++) { roll -= weights[i]; if (roll <= 0) { oi = i; break; } }
      return { kind: 'rock', ore: oi, biome: biome.key };
    }
    return null;
  },

  ensureResources() {
    const cx = Math.floor(this.player.x / TILE), cy = Math.floor(this.player.y / TILE);
    for (let ty = cy - 24; ty <= cy + 24; ty++) for (let tx = cx - 24; tx <= cx + 24; tx++) {
      const key = tx + ',' + ty;
      if (this.resources.has(key) || this.regrowing.has(key)) continue;
      const ra = this.resourceAt(tx, ty);
      if (ra) this.resources.set(key, this.makeResource(tx, ty, ra));
    }
  },

  makeResource(tx, ty, ra) {
    const hp = ra.kind === 'tree' ? 3 : 4;
    return {
      tx, ty, kind: ra.kind, style: ra.style || null, biome: ra.biome || null,
      id: ra.kind === 'tree' ? ra.id : (ra.ore === 'essence' ? 'essence' : ra.ore),
      x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2,
      hp, maxHp: hp, hitT: 0,
    };
  },

  /* ---------------- entradas de dungeon ---------------- */

  buildGates() {
    WorldGen.init();
    this.gates = [];
    const list = GameData.dungeonList();
    // dungeons ordenadas por nível: as fáceis perto da capital, as lendárias
    // no fundo do bioma temático (vulcão, geleira, selva, vazio…).
    const sorted = list.slice().sort((a, b) => (a.recommended_level || 1) - (b.recommended_level || 1));
    sorted.forEach((d, order) => {
      const theme = DungeonGen.theme(d.name, d);
      const i = list.indexOf(d);
      const spot = this.placeGate(d, theme, order, sorted.length);
      this.gates.push({
        key: d.name, x: spot.tx * TILE + TILE / 2, y: spot.ty * TILE + TILE / 2,
        tx: spot.tx, ty: spot.ty, idx: i, theme, biome: WorldGen.biomeKeyAt(spot.tx, spot.ty),
      });
    });
    this.gates.sort((a, b) => a.idx - b.idx);
    this.buildGateTrails();
  },

  /** Trilha de terra ligando cada portal à malha de estradas (garante acesso). */
  buildGateTrails() {
    for (const g of this.gates) {
      let best = null, bd = Infinity;
      for (const r of WorldGen.roads) {
        if (r.trail) continue;
        for (let t = 0; t <= 1; t += 0.1) {
          const px = r.a.x + (r.b.x - r.a.x) * t, py = r.a.y + (r.b.y - r.a.y) * t;
          const d = Math.hypot(px - g.tx, py - g.ty);
          if (d < bd) { bd = d; best = { x: px, y: py }; }
        }
      }
      if (!best) best = { x: 0, y: 0 };
      WorldGen.roads.push({ a: { x: g.tx, y: g.ty }, b: best, minor: true, trail: true, to: g.key });
    }
    this.terrainCache.clear();
  },

  /** Procura um tile livre no bioma preferido do tema (fallback: anel por nível). */
  placeGate(d, theme, order, total) {
    const want = theme.biome;
    const region = WorldGen.REGIONS.find(r => r.core === want || (r.mix || []).includes(want));
    const lvl = d.recommended_level || 1;
    const baseDist = 26 + XU.clamp(lvl / 90, 0, 1) * 120;
    const seed = hashStr('gate:' + d.name);
    const rng = mulberry32(seed);
    const cand = [];
    if (region) {
      for (let i = 0; i < 260; i++) {
        const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * region.r * 0.85;
        const tx = Math.round(region.x + Math.cos(a) * rr), ty = Math.round(region.y + Math.sin(a) * rr);
        if (WorldGen.biomeKeyAt(tx, ty) !== want) continue;
        if (this.badGateSpot(tx, ty)) continue;
        cand.push({ tx, ty });
        if (cand.length > 3) break;
      }
    }
    if (cand.length) return cand[0];
    // fallback: anel em espiral pelo nível
    for (let i = 0; i < 400; i++) {
      const a = (order / Math.max(1, total)) * Math.PI * 2 + i * 0.31;
      const dist = baseDist + i * 1.1;
      const tx = Math.round(Math.cos(a) * dist), ty = Math.round(Math.sin(a) * dist);
      if (!this.badGateSpot(tx, ty)) return { tx, ty };
    }
    return { tx: 30 + order * 3, ty: 0 };
  },

  badGateSpot(tx, ty) {
    if (this.settlementAt(tx, ty, 5)) return true;
    if (WorldGen.roadAt(tx, ty)) return true;
    if (SOLID_TERRAIN.has(WorldGen.terrainAt(tx, ty))) return true;
    // precisa de espaço livre em volta (para o herói chegar)
    let open = 0;
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]])
      if (!SOLID_TERRAIN.has(WorldGen.terrainAt(tx + ox, ty + oy))) open++;
    if (open < 6) return true;
    for (const g of this.gates) if (Math.hypot(g.tx - tx, g.ty - ty) < 9) return true;
    return false;
  },

  /** Anel de obstáculos de agilidade ao redor da muralha (fora dela). */
  buildObstacles() {
    this.obstacles = [];
    const N = 10, R = this.townR + 5.2;
    for (let i = 0; i < N; i++) {
      const ang = (i / N) * Math.PI * 2 + 0.39;
      let tx = Math.round(Math.cos(ang) * R), ty = Math.round(Math.sin(ang) * R);
      if (Math.abs(tx) <= 2 || Math.abs(ty) <= 2) continue;    // não bloqueia os 4 portões
      if (SOLID_TERRAIN.has(WorldGen.terrainAt(tx, ty))) continue;
      this.obstacles.push({
        tx, ty, x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2,
        kind: ['log', 'wall', 'beam', 'pipe'][i % 4], cd: 0,
      });
    }
  },

  obstacleNear(px, py, maxDist = 42) {
    let best = null, bd = maxDist;
    for (const ob of this.obstacles || []) {
      const d = Math.hypot(ob.x - px, ob.y - py);
      if (d < bd) { bd = d; best = ob; }
    }
    return best;
  },

  gateNear(px, py, maxDist = 46) {
    let best = null, bd = maxDist;
    for (const g of this.gates) {
      const d = Math.hypot(g.x - px, g.y - py);
      if (d < bd) { bd = d; best = g; }
    }
    return best;
  },

  /** Célula segura (não-sólida) perto de (tx,ty) para a viagem rápida — prefere o lado da cidade. */
  spotNear(tx, ty) {
    const len = Math.hypot(tx, ty) || 1;
    const dirx = -tx / len, diry = -ty / len;
    const cands = [];
    for (const d of [3.5, 4.5, 3, 5.5, 6.5]) cands.push([Math.round(tx + dirx * d), Math.round(ty + diry * d)]);
    for (const [ox, oy] of [[3, 0], [-3, 0], [0, 3], [0, -3], [4, 2], [4, -2], [-4, 2], [-4, -2], [5, 0], [-5, 0], [0, 5], [0, -5]])
      cands.push([tx + ox, ty + oy]);
    for (const [cx, cy] of cands) if (!this.solidTile(cx, cy)) return { x: cx * TILE + TILE / 2, y: cy * TILE + TILE / 2 };
    return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
  },

  /* ---------------- entidades ---------------- */

  spriteFor(name) {
    let s = this.enemySprites.get(name);
    if (!s) { s = makeEnemySprite(name); this.enemySprites.set(name, s); }
    return s;
  },

  makeEnemy(enemyKey, x, y, isBoss = false, bossDef = null) {
    const def = bossDef || GameData.enemies[enemyKey];
    const hp = def.hp;
    const spr = this.spriteFor(def.display_name || def.name);
    return {
      key: enemyKey, name: def.display_name || def.name, def,
      hp, maxHp: hp, x, y, isBoss,
      speed: isBoss ? 60 : (26 + Math.min(52, hp * 0.10)),
      range: isBoss ? 52 : 28, aggro: isBoss ? 420 : 180,
      spr, dirx: 1, diry: 0, wanderT: 0, attackCd: 1 + Math.random(),
      windup: 0, hitT: 0, animT: 0, frame: 0, size: isBoss ? 1.9 : (hp > 120 ? 1.25 : (hp > 50 ? 1.05 : 0.9)),
    };
  },

  makeNPCs() {
    this.npcs = [];
    GameData.thievingNpcs.forEach((npc, i) => {
      const ang = hash2(i * 3.7, 9.9) * Math.PI * 2;
      const dist = 6 + hash2(i * 8.8, 2.2) * (World.townR - 9);
      this.npcs.push({
        def: npc, key: npc.key, name: npc.display_name,
        x: Math.cos(ang) * dist * TILE, y: Math.sin(ang) * dist * TILE,
        dirx: 0, diry: 0, wanderT: 0, cd: 0, animT: 0, frame: 0,
        spr: this.spriteFor(npc.display_name),
      });
    });
  },

  /* ---------------- geração de inimigos ---------------- */

  overworldEnemyPool() {
    const cap = 12 + EXP.combatLevel() * 7;
    const pool = Object.entries(GameData.enemies).filter(([, e]) => e.hp <= cap).map(([k]) => k);
    return pool.length ? pool : ['giant_rat'];
  },
  pickOverworldEnemy() {
    const pool = this.overworldEnemyPool().slice()
      .sort((a, b) => GameData.enemies[a].hp - GameData.enemies[b].hp);
    const r = Math.random();
    let idx = Math.floor(Math.pow(r, 0.55) * pool.length);
    idx = Math.min(idx, pool.length - 1);
    return pool[idx];
  },
  ensureEnemies(dt) {
    if (this.mode === 'dungeon') return this.ensureDungeonEnemies(dt);
    const target = Math.min(4 + Math.floor(EXP.combatLevel() / 3), 11);
    this._spawnTimer = (this._spawnTimer || 0) - dt;
    if (this.enemies.length >= target || this._spawnTimer > 0) return;
    this._spawnTimer = 1.2;
    const spot = this.findWalkable(300, 560, 26); // fora da cidade, mas não longe demais
    if (!spot) return;
    this.enemies.push(this.makeEnemy(this.pickOverworldEnemy(), spot.tx * TILE + TILE / 2, spot.ty * TILE + TILE / 2));
  },
  ensureDungeonEnemies(dt) {
    const d = GameData.dungeons[this.dungeonKey];
    if (!d) return;
    const maxLive = Math.min(3 + Math.floor((d.recommended_level || 1) / 6), 9);
    this._spawnTimer = (this._spawnTimer || 0) - dt;
    if (this.enemies.length >= maxLive || this._spawnTimer > 0) return;
    this._spawnTimer = Math.max(0.7, 2.6 - (d.encounter_rate || 0.25) * 2);
    const spot = this.findWalkable(160, 480);
    if (!spot) return;
    const pool = [];
    for (const s of d.enemy_spawns) for (let i = 0; i < s.weight; i++) pool.push(s.enemy);
    const key = pool[Math.floor(Math.random() * pool.length)];
    this.enemies.push(this.makeEnemy(key, spot.tx * TILE + TILE / 2, spot.ty * TILE + TILE / 2));
  },

  findWalkable(minD, maxD, minTownDist = 0) {
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2, d = minD + Math.random() * (maxD - minD);
      const tx = Math.round((this.player.x + Math.cos(a) * d) / TILE), ty = Math.round((this.player.y + Math.sin(a) * d) / TILE);
      if (this.solidTile(tx, ty)) continue;
      if (minTownDist && Math.hypot(tx, ty) < minTownDist) continue;
      return { tx, ty };
    }
    return null;
  },

  /* ---------------- partículas / textos ---------------- */

  spawnParticles(x, y, color, n, spd) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = Math.random() * spd + spd * 0.3;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - spd * 0.2, life: 0.5 + Math.random() * 0.5, color, size: 2 + Math.random() * 3 });
    }
  },
  spawnFloat(x, y, text, color) { this.floats.push({ x, y, text, color: color || '#fff', life: 1.1 }); },

  /* ---------------- clima / ambiente ---------------- */

  /** Tipo de partícula ambiente no ponto atual (bioma no overworld, tema na dungeon). */
  ambientKind() {
    if (this.mode === 'dungeon') return this.dungeonTheme()?.ambient || null;
    const b = this.biomeAt(Math.floor(this.player.x / TILE), Math.floor(this.player.y / TILE));
    return b.ambient || null;
  },

  updateAmbient(dt) {
    const kind = this.ambientKind();
    this._ambientT -= dt;
    const cfg = AMBIENT[kind];
    if (cfg && this._ambientT <= 0) {
      this._ambientT = cfg.every;
      const p = this.player;
      for (let i = 0; i < cfg.burst; i++) {
        this.ambient.push({
          kind, x: p.x + (Math.random() - 0.5) * 1000, y: p.y + (Math.random() - 0.5) * 760,
          vx: cfg.vx + (Math.random() - 0.5) * cfg.spread, vy: cfg.vy + (Math.random() - 0.5) * cfg.spread,
          life: cfg.life * (0.6 + Math.random() * 0.8), maxLife: cfg.life,
          size: cfg.size * (0.6 + Math.random() * 0.9), color: cfg.color, seed: Math.random() * 6.28,
        });
      }
    }
    for (let i = this.ambient.length - 1; i >= 0; i--) {
      const a = this.ambient[i];
      a.life -= dt;
      if (a.life <= 0 || Math.abs(a.x - this.player.x) > 900 || Math.abs(a.y - this.player.y) > 700) { this.ambient.splice(i, 1); continue; }
      a.x += a.vx * dt + Math.sin(this.time * 1.6 + a.seed) * 6 * dt;
      a.y += a.vy * dt;
    }
    if (this.ambient.length > 260) this.ambient.splice(0, this.ambient.length - 260);
  },
};

/** Presets de clima: neve, brasas, esporos, vaga-lumes, areia, poeira… */
const AMBIENT = {
  snow: { every: 0.10, burst: 2, vx: -12, vy: 34, spread: 18, life: 6, size: 2.4, color: '#ffffff' },
  ember: { every: 0.09, burst: 2, vx: 8, vy: -30, spread: 26, life: 3.2, size: 2.2, color: '#ff8a3c' },
  ash: { every: 0.13, burst: 2, vx: -16, vy: 20, spread: 14, life: 6, size: 2, color: '#9a8f96' },
  spore: { every: 0.14, burst: 2, vx: 6, vy: -8, spread: 16, life: 5.5, size: 2.6, color: '#9fd46f' },
  firefly: { every: 0.22, burst: 1, vx: 0, vy: -4, spread: 22, life: 6, size: 2.6, color: '#d8ff8a' },
  sand: { every: 0.06, burst: 3, vx: 78, vy: 8, spread: 30, life: 2.6, size: 1.8, color: '#e8d5a0' },
  leaf: { every: 0.5, burst: 1, vx: 26, vy: 16, spread: 20, life: 5.5, size: 3, color: '#8fd46f' },
  mote: { every: 0.18, burst: 2, vx: 0, vy: -14, spread: 18, life: 5, size: 2.2, color: '#bda6ff' },
  drip: { every: 0.6, burst: 1, vx: 0, vy: 120, spread: 4, life: 1.6, size: 2, color: '#8fb4d8' },
  dust: { every: 0.3, burst: 2, vx: 10, vy: -6, spread: 12, life: 5, size: 2, color: 'rgba(220,200,160,.8)' },
  bubble: { every: 0.25, burst: 1, vx: 0, vy: -34, spread: 12, life: 4.5, size: 3, color: 'rgba(160,230,255,.75)' },
  star: { every: 0.2, burst: 2, vx: 0, vy: -10, spread: 26, life: 5, size: 2.4, color: '#c9a6ff' },
  shade: { every: 0.4, burst: 1, vx: 12, vy: -6, spread: 14, life: 5, size: 5, color: 'rgba(30,20,50,.55)' },
  sunray: { every: 0.5, burst: 1, vx: -8, vy: 22, spread: 10, life: 5, size: 3, color: 'rgba(255,232,160,.8)' },
  cloud: { every: 0.7, burst: 1, vx: 22, vy: 0, spread: 8, life: 8, size: 8, color: 'rgba(255,255,255,.55)' },
};

/* =====================================================================
   JOGADOR
   ===================================================================== */
const Player = {
  init() {
    World.player = {
      x: 0, y: 2.5 * TILE, facing: 'down', moving: false, animT: 0, frame: 0,
      hp: EXP.maxHp(), speed: 150, attackCd: 0, attackTimer: 0, invuln: 0,
      stun: 0, channel: null,
    };
  },
  maxHp() { return EXP.maxHp(); },

  update(dt) {
    const p = World.player;
    p.attackCd = Math.max(0, p.attackCd - dt);
    p.attackTimer = Math.max(0, p.attackTimer - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    p.stun = Math.max(0, p.stun - dt);

    const { ax, ay } = EXPGUI.moveAxis();
    p.moving = (ax !== 0 || ay !== 0) && p.stun <= 0;
    const spdMul = 1 + State.level('agility') * 0.006;
    if (p.moving) {
      if (Math.abs(ax) > Math.abs(ay)) p.facing = ax > 0 ? 'right' : 'left';
      else p.facing = ay > 0 ? 'down' : 'up';
      p.animT += dt; if (p.animT > 0.16) { p.animT = 0; p.frame ^= 1; }
      let nx = p.x + ax * p.speed * spdMul * dt;
      if (!World.collidesRect(nx - 7, p.y - 15, 14, 15)) p.x = nx;
      let ny = p.y + ay * p.speed * spdMul * dt;
      if (!World.collidesRect(p.x - 7, ny - 15, 14, 15)) p.y = ny;
    } else { p.frame = 0; p.animT = 0; }

    // auto-comer (como o auto-eat das sessões do Hub: melhor comida <=50% HP)
    if (World.autoEat && p.hp <= this.maxHp() * 0.5) EXPGUI.eatFood(true);
  },

  facingVec() {
    const f = World.player.facing;
    return { dx: f === 'right' ? 1 : f === 'left' ? -1 : 0, dy: f === 'down' ? 1 : f === 'up' ? -1 : 0 };
  },

  hurt(dmg, sx, sy) {
    const p = World.player;
    if (p.invuln > 0) return;
    p.hp -= dmg; p.invuln = 0.7;
    World.camera.shake = 0.35;
    EXPGUI.flash('flash');
    World.spawnParticles(p.x, p.y, '#e05252', 10, 110);
    World.spawnFloat(p.x, p.y - 22, '-' + dmg, '#ff8080');
    SFX.hurt();
    if (p.hp <= 0) {
      // zonas seguras (ex.: Farm) não deixam morrer, como safe_zone do Hub
      const d = World.mode === 'dungeon' ? GameData.dungeons[World.dungeonKey] : null;
      if (d && d.safe_zone) { p.hp = 1; return; }
      p.hp = 0; EXPGUI.onDeath();
    }
  },
};

/* =====================================================================
   COMBATE EM TEMPO REAL (fórmulas do sim.js)
   ===================================================================== */
const Combat = {
  tryAttack() {
    if (EXPGUI.paused || EXPGUI.state !== 'playing') return;
    const p = World.player;
    if (p.attackCd > 0 || p.stun > 0) return;
    const style = State.state.combatStyle;

    if (style === 'ranged') return this.rangedAttack();
    if (style === 'magic') return this.magicAttack();
    return this.meleeAttack();
  },

  meleeAttack() {
    const p = World.player;
    if (Gathering.tryFish()) return;
    const ctx = EXP.ctx();
    p.attackCd = Math.max(0.42, EXP.attackIntervalSec(ctx));
    p.attackTimer = 0.22;
    SFX.swing();

    const range = 36;
    let x = p.x, y = p.y - 10, w = range, h = 30;
    switch (p.facing) {
      case 'left': x = p.x - range; break;
      case 'right': x = p.x; break;
      case 'up': x = p.x - 15; w = 30; y = p.y - 24 - range; h = range; break;
      case 'down': x = p.x - 15; w = 30; y = p.y - 6; h = range; break;
    }
    // golpes atingem nós de recurso (igual ao protótipo)
    for (const [key, res] of World.resources) {
      if (res.x >= x && res.x <= x + w && res.y >= y && res.y <= y + h) Gathering.hitNode(key, res);
    }
    // e inimigos
    const off = (e) => {
      const o = EXP.playerOffense(ctx, e.def);
      return Math.random() < o.chance ? Util.randInt(0, o.maxHit) : 0;
    };
    for (let i = World.enemies.length - 1; i >= 0; i--) {
      const e = World.enemies[i];
      if (Math.abs(e.x - (x + w / 2)) < w / 2 + 13 * e.size && Math.abs(e.y - (y + h / 2)) < h / 2 + 13 * e.size)
        this.damageEnemy(World.enemies, i, off(e), 'melee');
    }
    for (let i = World.bosses.length - 1; i >= 0; i--) {
      const e = World.bosses[i];
      if (Math.abs(e.x - (x + w / 2)) < w / 2 + 16 * e.size && Math.abs(e.y - (y + h / 2)) < h / 2 + 16 * e.size)
        this.damageBoss(i, off(e), 'melee');
    }
  },

  rangedAttack() {
    const p = World.player;
    const weaponKey = State.equippedItem('weapon');
    const weapon = weaponKey ? GameData.equipment[weaponKey] : null;
    if (!weapon || weapon.combat_style !== 'ranged') { EXPGUI.toast(tt('web_exp_toast_equip_bow')); SFX.error(); return; }
    const arrow = EXP.bestArrow();
    if (!arrow) { EXPGUI.toast(tt('web_exp_toast_no_arrows')); SFX.error(); return; }
    const ctx = EXP.ctx();
    p.attackCd = EXP.attackIntervalSec(ctx); p.attackTimer = 0.22;
    State.removeItem(arrow.key, 1);
    SFX.bow();
    const v = Player.facingVec();
    const maxHit = Sim._rangedMaxHit(ctx.ranged, ctx.rangedStrBonus, arrow.bonus);
    this.projectile(v, 380, maxHit, ctx, 'ranged', '#e8d8a0');
  },

  magicAttack() {
    const p = World.player;
    const spellKey = State.state.activeSpell;
    const spell = spellKey ? GameData.spells[spellKey] : null;
    if (!spell) { EXPGUI.toast(tt('web_exp_toast_select_spell')); SFX.error(); return; }
    if (State.level('magic') < spell.magic_level_required) { EXPGUI.toast(tt('web_exp_toast_need_magic', [spell.magic_level_required])); SFX.error(); return; }
    const ctx = EXP.ctx();
    const weaponKey = State.equippedItem('weapon');
    const infinite = (ctx.infiniteRunes && ctx.infiniteRunes === spell.rune_type) ||
      (weaponKey && GameData.equipment[weaponKey]?.infinite_runes === spell.rune_type);
    if (!infinite && State.count(spell.rune_type) < spell.rune_cost) {
      EXPGUI.toast(tt('web_exp_toast_no_runes', [GameData.name(spell.rune_type)])); SFX.error(); return;
    }
    p.attackCd = EXP.attackIntervalSec(ctx); p.attackTimer = 0.22;
    if (!infinite) State.removeItem(spell.rune_type, spell.rune_cost);
    SFX.cast();
    const v = Player.facingVec();
    const maxHit = Math.max(1, ctx.spellMaxHit);
    this.projectile(v, 330, maxHit, ctx, 'magic', this.runeColor(spell.rune_type));
  },

  runeColor(r) {
    return { air_rune: '#d0f0ff', water_rune: '#5aa9ff', earth_rune: '#c9a05a', fire_rune: '#ff7a4a', mind_rune: '#c08aff', chaos_rune: '#ff5ad0', death_rune: '#8a8a8a', blood_rune: '#e04040' }[r] || '#fff';
  },

  projectile(v, speed, maxHit, ctx, kind, color) {
    const p = World.player;
    World.projectiles.push({ x: p.x, y: p.y - 10, vx: v.dx * speed, vy: v.dy * speed, life: 0.9, maxHit, ctx, kind, color });
  },

  updateProjectiles(dt) {
    for (let i = World.projectiles.length - 1; i >= 0; i--) {
      const pr = World.projectiles[i];
      pr.life -= dt; pr.x += pr.vx * dt; pr.y += pr.vy * dt;
      if (pr.life <= 0) { World.projectiles.splice(i, 1); continue; }
      if (World.solidTile(Math.floor(pr.x / TILE), Math.floor(pr.y / TILE))) { World.projectiles.splice(i, 1); continue; }
      let hit = false;
      for (let j = World.enemies.length - 1; j >= 0; j--) {
        const e = World.enemies[j];
        if (Math.abs(e.x - pr.x) < 14 * e.size && Math.abs(e.y - pr.y) < 14 * e.size) {
          const o = EXP.playerOffense(pr.ctx, e.def);
          const dmg = Math.random() < o.chance ? Util.randInt(0, pr.maxHit) : 0;
          this.damageEnemy(World.enemies, j, dmg, pr.kind); hit = true; break;
        }
      }
      if (!hit) for (let j = World.bosses.length - 1; j >= 0; j--) {
        const e = World.bosses[j];
        if (Math.abs(e.x - pr.x) < 17 * e.size && Math.abs(e.y - pr.y) < 17 * e.size) {
          const o = EXP.playerOffense(pr.ctx, e.def);
          const dmg = Math.random() < o.chance ? Util.randInt(0, pr.maxHit) : 0;
          this.damageBoss(j, dmg, pr.kind); hit = true; break;
        }
      }
      if (hit) World.projectiles.splice(i, 1);
    }
  },

  /** Dano num inimigo comum → XP (70/15/15) + drops reais + Slayer + quests. */
  damageEnemy(arr, i, dmg, kind) {
    const e = arr[i];
    if (!e || e.hp <= 0) return;
    e.hp -= dmg; e.hitT = 0.15;
    World.spawnParticles(e.x, e.y, '#fff', 3, 80);
    World.spawnFloat(e.x, e.y - 16, String(dmg), dmg > 0 ? '#ffd0d0' : '#9aa4bd');
    if (e.hp <= 0) {
      arr.splice(i, 1);
      this.onKill(e, kind);
    }
  },

  damageBoss(i, dmg, kind) {
    const e = World.bosses[i];
    e.hp -= dmg; e.hitT = 0.15;
    World.spawnParticles(e.x, e.y, '#fff', 4, 90);
    World.spawnFloat(e.x, e.y - 20, String(dmg), dmg > 0 ? '#ffd0d0' : '#9aa4bd');
    if (e.hp <= 0) {
      World.bosses.splice(i, 1);
      this.onBossKill(e);
    }
  },

  onKill(e, kind) {
    const def = e.def;
    // drops reais
    const items = {};
    for (const d of (def.always_drops || [])) items[d.item] = (items[d.item] || 0) + (d.quantity || 1);
    for (const d of (def.drop_table || [])) {
      if (Math.random() < d.chance) {
        const q = d.quantity_min >= d.quantity_max ? d.quantity_min : Util.randInt(d.quantity_min, d.quantity_max);
        items[d.item] = (items[d.item] || 0) + q;
      }
    }
    // XP de combate (70% estilo / 15% HP / 15% Def) + pet de combate + bênção
    const baseXp = def.xp_drops?.combat || 0;
    const pet = State.combatPetBoost();
    const total = Math.floor(baseXp * (1 + pet / 100));
    for (const [skill, xp] of Object.entries(EXP.distributeXp(total, State.state.combatStyle)))
      XPGain.apply(skill, xp);
    // aplicar itens (pets viram coleção)
    let coins = 0;
    for (const [k, v] of Object.entries(items)) {
      if (GameData.pets[k]) { State.addPet(k); continue; }
      let qty = v;
      if (k === 'coins') {
        coins = v;
        qty = Math.floor(v * State.blessingCoinMultiplier());
      }
      State.addItem(k, qty);
      World.spawnFloat(e.x + (Math.random() - 0.5) * 20, e.y - 30, '+' + qty + ' ' + GameData.name(k), '#cfe0e8');
    }
    if (coins) { World.sessionCoins += coins; }
    World.spawnParticles(e.x, e.y, '#f6c453', 10, 130);
    SFX.gold();
    // Slayer real (pontos, XP de slayer, conclusão de tarefas)
    if (typeof Systems !== 'undefined' && Systems.recordKills) {
      const res = Systems.recordKills({ [e.key]: 1 });
      if (res.xp > 0) XPGain.apply('slayer', res.xp);
      if (res.tasksCompleted > 0) EXPGUI.toast(tt('web_exp_toast_slayer_done', [res.taskPoints || 0]));
      Systems.recordGuildCombat?.({ [e.key]: 1 }, State.state.combatStyle);
    }
    // quests/stats do Hub
    QuestFeed.kill(e.key, items, coins);
    if (World.mode === 'dungeon') World.dungeonKills++;
  },

  onBossKill(e) {
    const def = e.def; // raid boss real
    World.spawnParticles(e.x, e.y, '#f6c453', 26, 180);
    SFX.levelup();
    EXPGUI.toast(tt('web_exp_toast_boss_defeated', [e.name]));
    if (def.xp_rewards) {
      for (const [skill, xp] of Object.entries(def.xp_rewards)) {
        if (State.state.skills[skill]) XPGain.apply(skill, xp);
      }
    }
    const coins = Math.floor((def.combat_level_required || 50) * 60 * State.blessingCoinMultiplier());
    State.addItem('coins', coins);
    State.addItem('dragon_bone', 3);
    State.addItem('big_bones', 5);
    World.sessionCoins += coins;
    World.spawnFloat(e.x, e.y - 40, '+' + coins + ' 🪙', '#f6c453');
    State.state.stats.bossKillsByBoss = State.state.stats.bossKillsByBoss || {};
    State.state.stats.bossKillsByBoss[e.key] = (State.state.stats.bossKillsByBoss[e.key] || 0) + 1;
    State.save();
  },

  /* ---- IA dos inimigos ---- */
  updateEnemies(dt) {
    const p = World.player;
    for (let i = World.enemies.length - 1; i >= 0; i--) {
      const e = World.enemies[i];
      e.hitT -= dt; e.attackCd -= dt; e.wanderT -= dt; e.windup = Math.max(0, e.windup - dt);
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d > 900) { World.enemies.splice(i, 1); continue; }
      const inTown = World.mode === 'overworld' && World.inTown(Math.floor(e.x / TILE), Math.floor(e.y / TILE));
      let mx = 0, my = 0;
      if (d < e.aggro && !inTown && !EXPGUI.paused) {
        mx = (p.x - e.x) / (d || 1); my = (p.y - e.y) / (d || 1);
      } else if (e.wanderT < 0) {
        e.wanderT = 0.8 + Math.random() * 1.6;
        const a = Math.random() * Math.PI * 2; e.dirx = Math.cos(a); e.diry = Math.sin(a);
      } else { mx = e.dirx * 0.5; my = e.diry * 0.5; }
      const nx = e.x + mx * e.speed * dt, ny = e.y + my * e.speed * dt;
      if (!World.collidesRect(nx - 8, ny - 8, 16, 16)) { e.x = nx; e.y = ny; }
      if (mx !== 0 || my !== 0) { e.animT += dt; if (e.animT > 0.28) { e.animT = 0; e.frame ^= 1; } }
      // ataque: prepara (windup) e dispara no ritmo 2.4s do Hub
      if (d < e.range && !inTown) {
        if (e.attackCd <= 0 && e.windup <= 0) e.windup = 0.45;
        if (e.windup > 0 && e.windup < dt * 1.5 && e.attackCd <= 0) {
          e.attackCd = Sim.BASE_ATTACK_SPEED_SEC * 0.9;
          const ctx = EXP.ctx();
          const off = EXP.enemyOffense(e.def, ctx);
          const dmg = Math.random() < off.chance ? Util.randInt(0, off.maxHit) : 0;
          if (dmg > 0) Player.hurt(dmg, e.x, e.y);
          else World.spawnFloat(p.x, p.y - 26, tt('web_exp_float_miss'), '#9aa4bd');
        }
      }
    }
    for (let i = World.bosses.length - 1; i >= 0; i--) {
      const e = World.bosses[i];
      e.hitT -= dt; e.attackCd -= dt; e.windup = Math.max(0, e.windup - dt);
      const d = Math.hypot(e.x - p.x, e.y - p.y) || 1;
      if (d < e.aggro) {
        const nx = e.x + (p.x - e.x) / d * e.speed * dt, ny = e.y + (p.y - e.y) / d * e.speed * dt;
        if (!World.collidesRect(nx - 14, ny - 14, 28, 28)) { e.x = nx; e.y = ny; }
        e.animT += dt; if (e.animT > 0.28) { e.animT = 0; e.frame ^= 1; }
      }
      if (d < e.range) {
        if (e.attackCd <= 0 && e.windup <= 0) e.windup = 0.55;
        if (e.windup > 0 && e.windup < dt * 1.5 && e.attackCd <= 0) {
          e.attackCd = 2.6;
          const ctx = EXP.ctx();
          const off = EXP.enemyOffense(e.def, ctx);
          const dmg = Math.random() < off.chance ? Util.randInt(0, off.maxHit) : 0;
          if (dmg > 0) Player.hurt(dmg, e.x, e.y); else World.spawnFloat(p.x, p.y - 26, tt('web_exp_float_miss'), '#9aa4bd');
        }
      }
      if (d > 1400) World.bosses.splice(i, 1);
    }
  },
};

/* =====================================================================
   COLETA (mineração / madeira / pesca) — dados reais
   ===================================================================== */
const Gathering = {
  acc: { mining: 0, woodcutting: 0, fishing: 0 },

  hitNode(key, res) {
    const p = World.player;
    if (res.kind === 'tree') {
      const tree = EXP.TREES[res.id];
      if (State.level('woodcutting') < tree.lvl) { EXPGUI.toast(tt('web_exp_toast_need_woodcutting', [tree.lvl])); SFX.error(); return; }
      res.hp -= 1; res.hitT = 0.12; SFX.chop();
      World.spawnParticles(res.x, res.y, '#55a23f', 3, 60);
      if (res.hp <= 0) this.depleteNode(key, res, 'woodcutting', tree);
    } else {
      const isEssence = res.id === 'essence';
      const ore = isEssence ? { key: 'rune_essence', lvl: 1, xp: GameData.ores.rune_essence.xp_per_ore, name: GameData.ores.rune_essence.display_name } : EXP.ORES[res.id];
      if (State.level('mining') < ore.lvl) { EXPGUI.toast(tt('web_exp_toast_need_mining', [ore.lvl])); SFX.error(); return; }
      res.hp -= 1; res.hitT = 0.12; SFX.mine();
      World.spawnParticles(res.x, res.y, EXP.ORE_COLORS[ore.key] || '#8b97a3', 3, 60);
      if (res.hp <= 0) this.depleteNode(key, res, 'mining', ore, !isEssence);
    }
  },

  depleteNode(key, res, skill, def, rollGems) {
    World.resources.delete(key);
    World.regrowing.set(key, { until: World.time + (skill === 'mining' ? 22 : 20) });
    const toolSlot = skill === 'mining' ? 'pickaxe' : 'axe';
    const eff = State.toolEfficiency(toolSlot, skill, def.lvl || 1);
    const cape = 1 + State.capeBonus(skill);
    this.acc[skill] = (this.acc[skill] || 0) + eff;
    let n = Math.floor(this.acc[skill]);
    this.acc[skill] -= n;
    if (n < 1) n = 1;
    n = Math.max(1, Math.round(n * cape));
    const itemKey = skill === 'mining' ? def.key : def.logKey;
    State.addItem(itemKey, n);
    XPGain.withPet(skill, Math.floor(def.xp * eff));
    // gemas por minério (drop_rate real)
    if (rollGems) {
      for (let i = 0; i < n; i++)
        for (const [gemKey, gem] of Object.entries(GameData.gems))
          if (Math.random() < gem.drop_rate) {
            State.addItem(gemKey, 1);
            World.spawnFloat(res.x, res.y - 34, '💎 ' + GameData.name(gemKey), '#ffd97a');
          }
    }
    // pet 1/1000 por nó
    const pet = GameData.petBySkill[skill];
    if (pet && Math.random() < 1 / 1000) State.addPet(pet.id);
    QuestFeed.gather(skill, { [itemKey]: n });
    World.spawnFloat(res.x, res.y - 14, '+' + n + ' ' + GameData.name(itemKey), skill === 'mining' ? '#cfe0e8' : '#b9e6a0');
    SFX.pickup();
  },

  /** Atacar água = pescar. Retorna true se pescou. */
  tryFish() {
    const v = Player.facingVec();
    const p = World.player;
    const tx = Math.floor((p.x + v.dx * TILE) / TILE), ty = Math.floor((p.y + v.dy * TILE) / TILE);
    if (World.mode !== 'overworld' || !WATER_TERRAIN.has(World.terrainAt(tx, ty))) return false;
    const ctx = EXP.ctx();
    p.attackCd = Math.max(0.5, EXP.attackIntervalSec(ctx)); p.attackTimer = 0.22;
    SFX.fish();
    const lvl = State.level('fishing');
    const avail = EXP.FISH.filter(f => lvl >= f.lvl);
    if (!avail.length) { EXPGUI.toast(tt('web_exp_toast_no_fish')); return true; }
    const pick = avail[Math.floor(Math.random() * Math.min(avail.length, 4))];
    const eff = State.toolEfficiency('fishing_rod', 'fishing', pick.lvl);
    const cape = 1 + State.capeBonus('fishing');
    this.acc.fishing = (this.acc.fishing || 0) + eff;
    let n = Math.floor(this.acc.fishing); this.acc.fishing -= n; if (n < 1) n = 1;
    n = Math.max(1, Math.round(n * cape));
    State.addItem(pick.key, n);
    XPGain.withPet('fishing', Math.floor(pick.xp * eff));
    const pet = GameData.petBySkill.fishing;
    if (pet && Math.random() < 1 / 1000) State.addPet(pet.id);
    QuestFeed.gather('fishing', { [pick.key]: n });
    World.spawnFloat(p.x, p.y - 18, '+' + n + ' ' + GameData.name(pick.key), '#7fd0e8');
    World.spawnParticles(p.x + v.dx * 26, p.y + v.dy * 26, '#5aa9ff', 6, 60);
    return true;
  },
};

/* =====================================================================
   ROUBO (thieving) — NPCs reais da cidade
   ===================================================================== */
const Thieving = {
  attempt(npc) {
    const p = World.player;
    if (p.stun > 0 || npc.cd > 0) return;
    const def = npc.def;
    if (State.level('thieving') < def.level_required) { EXPGUI.toast(tt('web_exp_toast_need_thieving', [def.level_required])); SFX.error(); return; }
    npc.cd = 1.6;
    const chance = XU.clamp(0.40 + (State.level('thieving') - def.level_required) * 0.02, 0.10, 0.95);
    if (Math.random() >= chance) {
      p.stun = 1.2;
      World.spawnFloat(npc.x, npc.y - 20, tt('web_exp_float_caught'), '#e05252');
      EXPGUI.toast(tt('web_exp_toast_caught', [npc.name]));
      SFX.error();
      return;
    }
    const items = { coins: Util.randInt(def.coins_min, def.coins_max) };
    for (const entry of (def.loot_table || []))
      if (Math.random() < entry.chance) items[entry.item] = (items[entry.item] || 0) + 1;
    for (const [k, v] of Object.entries(items)) State.addItem(k, v);
    XPGain.withPet('thieving', def.base_xp);
    const pet = GameData.petBySkill.thieving;
    if (pet && Math.random() < 1 / 1000) State.addPet(pet.id);
    QuestFeed.pickpocket(npc.key, 1, items);
    Systems.recordGuildThieving?.(npc.key, 1);
    World.spawnFloat(npc.x, npc.y - 20, '+' + items.coins + ' 🪙', '#f6c453');
    SFX.pickup();
  },

  updateNPCs(dt) {
    for (const npc of World.npcs) {
      npc.cd = Math.max(0, npc.cd - dt);
      npc.wanderT -= dt;
      if (npc.wanderT < 0) {
        npc.wanderT = 1.2 + Math.random() * 2.2;
        const a = Math.random() * Math.PI * 2;
        npc.dirx = Math.cos(a) * 0.4; npc.diry = Math.sin(a) * 0.4;
      }
      const spd = 34;
      const nx = npc.x + npc.dirx * spd * dt, ny = npc.y + npc.diry * spd * dt;
      if (!World.collidesRect(nx - 6, ny - 6, 12, 12) && Math.hypot(nx, ny) < (World.townR - 2) * TILE) { npc.x = nx; npc.y = ny; }
      if (npc.dirx || npc.diry) { npc.animT += dt; if (npc.animT > 0.3) { npc.animT = 0; npc.frame ^= 1; } }
    }
  },
};

/* =====================================================================
   AGILITY — circuito de obstáculos ao redor da muralha
   ===================================================================== */
const Agility = {
  _succ: 0,

  /** Maior curso desbloqueado pelo nível (como o treino do Hub). */
  currentCourse() {
    const lvl = State.level('agility');
    let best = null;
    for (const [k, c] of Object.entries(GameData.agilityCourses))
      if (lvl >= c.level_required && (!best || c.level_required > best.def.level_required)) best = { key: k, def: c };
    return best || { key: 'beginner_course', def: GameData.agilityCourses.beginner_course };
  },

  attempt(ob) {
    const p = World.player;
    if (ob.cd > 0 || p.stun > 0) return;
    ob.cd = 1.4;
    const course = this.currentCourse();
    const chance = Math.min(0.95, 0.80 + (State.level('agility') - course.def.level_required) * 0.02);
    if (Math.random() >= chance) {
      p.stun = 1.2;
      EXPGUI.toast(tt('web_exp_toast_stumbled', [course.def.display_name]));
      SFX.error();
      return;
    }
    XPGain.withPet('agility', course.def.xp_per_success);
    const pet = GameData.petBySkill.agility;
    if (pet && Math.random() < 1 / 1000) State.addPet(pet.id);
    this._succ++;
    if (this._succ % 10 === 0) Systems.recordGuildAgility?.(course.key);
    // atravessa o obstáculo com um passinho
    const dx = ob.x - p.x, dy = ob.y - p.y, m = Math.hypot(dx, dy) || 1;
    const nx = p.x + dx / m * 52, ny = p.y + dy / m * 52;
    if (!World.collidesRect(nx - 7, ny - 15, 14, 15)) { p.x = nx; p.y = ny; }
    World.spawnFloat(ob.x, ob.y - 18, tt('web_exp_float_agi', [course.def.xp_per_success]), '#8fd8ff');
    World.spawnParticles(ob.x, ob.y, '#8fd8ff', 5, 70);
    SFX.pickup();
  },

  update(dt) { for (const ob of World.obstacles || []) ob.cd = Math.max(0, ob.cd - dt); },
};

/* =====================================================================
   MERCANTILE — caravanas em tempo real (Posto de Comércio)
   Uma viagem = 90s e rende o equivalente a uma sessão completa do Hub.
   ===================================================================== */
const Trade = {
  KEY: 'expeditions_caravans_v1',
  TRIP_MS: 90000,
  MAX_CARAVANS: 2,

  load() { try { return JSON.parse(localStorage.getItem(this.KEY) || '[]'); } catch (e) { return []; } },
  save(list) { try { localStorage.setItem(this.KEY, JSON.stringify(list)); } catch (e) { } },

  dispatch(routeKey) {
    const r = GameData.tradeRoutes[routeKey];
    if (!r) return;
    if (State.level('mercantile') < r.level_required) { EXPGUI.toast(tt('web_exp_toast_need_mercantile', [r.level_required])); SFX.error(); return; }
    const list = this.load();
    if (list.length >= this.MAX_CARAVANS) { EXPGUI.toast(tt('web_exp_toast_max_caravans', [this.MAX_CARAVANS])); SFX.error(); return; }
    if (State.state.coins < r.coin_cost) { EXPGUI.toast(tt('web_exp_toast_not_enough_coins', [Util.fmt(r.coin_cost)])); SFX.error(); return; }
    State.state.coins -= r.coin_cost;
    list.push({ key: routeKey, returnsAt: Date.now() + this.TRIP_MS, cost: r.coin_cost });
    this.save(list);
    State.save();
    EXPGUI.toast(tt('web_exp_toast_caravan_sent', [r.display_name]));
    SFX.portal();
    EXPGUI.refreshOpenTab?.('trade');
  },

  /** Resolve caravanas que chegaram (chamado no update). */
  update() {
    const list = this.load();
    if (!list.length) return;
    const still = [];
    let changed = false;
    for (const c of list) {
      if (Date.now() < c.returnsAt) { still.push(c); continue; }
      const r = GameData.tradeRoutes[c.key];
      if (r) {
        const lvl = State.level('mercantile');
        const xpR = Util.tierFor(r.xp_ranges, lvl), coinR = Util.tierFor(r.coin_ranges, lvl);
        const xp = Util.randInt(xpR.min, xpR.max) * 60;
        const coins = Math.floor(Util.randInt(coinR.min, coinR.max) * 60 * State.blessingCoinMultiplier());
        XPGain.withPet('mercantile', xp);
        State.addItem('coins', coins);
        QuestFeed.gather('mercantile', { coins });
        Systems.recordGuildTrade?.(c.key, coins);
        EXPGUI.toast(tt('web_exp_toast_caravan_back', [r.display_name, Util.fmt(coins)]));
        if (World.player) World.spawnFloat(World.player.x, World.player.y - 30, '+' + Util.fmt(coins) + ' 🪙', '#f6c453');
        SFX.gold();
      }
      changed = true;
    }
    if (changed) { this.save(still); State.save(); }
  },
};

/* =====================================================================
   DUNGEONS — entrar/sair + contagem de run
   ===================================================================== */
const Dungeons = {
  enter(gate) {
    const d = GameData.dungeons[gate.key];
    if (!d) return;
    if (!State.dungeonUnlocked(gate.key)) {
      EXPGUI.toast(tt('web_exp_toast_dungeon_sealed', [d.display_name]));
      SFX.error(); return;
    }
    World.mode = 'dungeon'; World.dungeonKey = gate.key;
    World.dungeonKills = 0; World.dungeonFoodEaten = 0;
    World.dungeonLayout = World.dungeonLayoutFor(gate.key);
    World.ambient = [];
    World.terrainCache.clear(); World.resources.clear(); World.regrowing.clear();
    World.enemies = []; World.projectiles = []; World.bosses = [];
    const p = World.player; p.x = TILE / 2 + 6; p.y = TILE / 2 + 6; p.facing = 'down';
    World.camera.x = p.x; World.camera.y = p.y;
    EXPGUI.toast(tt('web_exp_toast_dungeon_enter', [d.display_name, d.recommended_level || 1]));
    EXPGUI.flash('lvflash');
    SFX.portal();
    EXPGUI.updateBanner();
  },

  exit(collectRun = true) {
    const d = GameData.dungeons[World.dungeonKey];
    if (collectRun && d && World.dungeonKills >= 8) {
      QuestFeed.dungeonRun(World.dungeonKey, State.state.combatStyle, World.dungeonFoodEaten > 0);
      // drops raros: rolagem por run concluída (como o Hub)
      let got = null;
      for (const rare of (d.rare_drops || []))
        if (Math.random() < rare.chance) {
          State.addItem(rare.item, 1); got = rare.item;
          EXPGUI.toast(tt('web_exp_toast_rare', [GameData.name(rare.item)]));
        }
      EXPGUI.toast(tt('web_exp_toast_dungeon_done', [d.display_name, World.dungeonKills]));
      if (got) SFX.levelup();
    } else if (World.dungeonKills > 0) {
      EXPGUI.toast(tt('web_exp_toast_run_short'));
    }
    const gate = World.gates.find(g => g.key === World.dungeonKey);
    World.mode = 'overworld'; World.dungeonKey = null; World.dungeonLayout = null;
    World.ambient = [];
    World.terrainCache.clear(); World.resources.clear(); World.regrowing.clear();
    World.enemies = []; World.projectiles = [];
    const p = World.player;
    if (gate) { p.x = gate.x; p.y = gate.y + TILE * 0.9; }
    World.camera.x = p.x; World.camera.y = p.y;
    SFX.portal();
    EXPGUI.updateBanner();
  },

  /** Desafio de raid boss real (codex). */
  challenge(raidKey) {
    const r = GameData.raidBosses[raidKey];
    if (!r) return;
    if (EXP.combatLevel() < r.combat_level_required - 10) {
      EXPGUI.toast(tt('web_exp_toast_need_combat', [r.combat_level_required])); SFX.error(); return;
    }
    EXPGUI.closeJournal();
    const p = World.player;
    const a = Math.random() * Math.PI * 2;
    let bx = p.x + Math.cos(a) * 200, by = p.y + Math.sin(a) * 200;
    const boss = World.makeEnemy(raidKey, bx, by, true, {
      name: raidKey, display_name: r.display_name, hp: r.hp,
      combat_stats: r.combat_stats, defensive_stats: r.defensive_stats,
      xp_drops: { combat: 0 }, always_drops: [], drop_table: [],
    });
    World.bosses.push(boss);
    EXPGUI.toast(tt('web_exp_toast_boss_appeared', [r.display_name]));
    SFX.levelup();
  },
};

/* =====================================================================
   UPDATE PRINCIPAL
   ===================================================================== */
function worldUpdate(dt) {
  World.time += dt;
  Player.update(dt);
  Combat.updateEnemies(dt);
  Combat.updateProjectiles(dt);
  Thieving.updateNPCs(dt);
  Agility.update(dt);
  Trade.update();
  updateParticles(dt);
  updateFloats(dt);
  // regenerar nós
  for (const [key, rg] of World.regrowing) {
    if (World.time >= rg.until) World.regrowing.delete(key);
  }
  World.camera.x = XU.lerp(World.camera.x, World.player.x, 0.12);
  World.camera.y = XU.lerp(World.camera.y, World.player.y, 0.12);
  if (World.camera.shake > 0) {
    World.camera.shake = Math.max(0, World.camera.shake - dt);
    World.camera.sx = (Math.random() - 0.5) * World.camera.shake * 14;
    World.camera.sy = (Math.random() - 0.5) * World.camera.shake * 14;
  } else { World.camera.sx = 0; World.camera.sy = 0; }
  if (World.mode === 'overworld') World.ensureResources();
  World.ensureEnemies(dt);
  World.updateAmbient(dt);
}
function updateParticles(dt) {
  for (let i = World.particles.length - 1; i >= 0; i--) {
    const p = World.particles[i];
    p.life -= dt; if (p.life <= 0) { World.particles.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 300 * dt;
  }
}
function updateFloats(dt) {
  for (let i = World.floats.length - 1; i >= 0; i--) {
    const f = World.floats[i];
    f.life -= dt; f.y -= 28 * dt;
    if (f.life <= 0) World.floats.splice(i, 1);
  }
}

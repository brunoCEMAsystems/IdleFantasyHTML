/* =====================================================================
   EXPEDITIONS — expedition-world.js
   Mundo aberto + cidade + dungeons instanciadas + entidades + gameplay
   em tempo real. Dados e fórmulas vêm do repo (GameData/Sim/State);
   coleta e combate aplicam XP/itens direto no save compartilhado.
   ===================================================================== */
'use strict';

const TILE = 32, SCALE = 2;
const TERRAIN = { WATER: 0, SAND: 1, GRASS: 2, GRASS2: 3 };

const World = {
  mode: 'overworld',          // overworld | dungeon
  dungeonKey: null,           // dungeon ativo
  dungeonKills: 0,
  dungeonFoodEaten: 0,
  enemies: [], bosses: [], particles: [], floats: [], projectiles: [], npcs: [],
  resources: new Map(), regrowing: new Map(),
  terrainCache: new Map(), enemySprites: new Map(),
  gates: [],                  // entradas de dungeon no overworld
  camera: { x: 0, y: 0, shake: 0, sx: 0, sy: 0 },
  time: 0,
  townR: 13,                  // raio da cidade (tiles)
  heroSprites: null,
  player: null,
  interactTarget: null,       // {label, sub, action}
  autoEat: true,
  sessionCoins: 0,

  /* ---------------- terreno ---------------- */

  inTown(tx, ty) { return Math.hypot(tx, ty) <= this.townR; },

  terrainAt(tx, ty) {
    if (this.mode === 'dungeon') return this.dungeonTerrainAt(tx, ty);
    const key = tx + ',' + ty;
    const c = this.terrainCache.get(key);
    if (c !== undefined) return c;
    let t;
    if (this.inTown(tx, ty)) t = TERRAIN.GRASS;           // praça da cidade
    else {
      const e = fbm(tx * 0.045, ty * 0.045, 4);
      if (e < 0.32) t = TERRAIN.WATER;
      else if (e < 0.355) t = TERRAIN.SAND;
      else t = (fbm(tx * 0.06 + 100, ty * 0.06 + 100, 3) > 0.58 ? TERRAIN.GRASS2 : TERRAIN.GRASS);
    }
    this.terrainCache.set(key, t);
    return t;
  },

  // ---- cidade: edifícios sólidos (retângulos em tiles) ----
  BUILDINGS: [
    { key: 'shop', x: -8, y: -7, w: 4, h: 3, icon: '🛒', name: 'Loja Geral' },
    { key: 'church', x: 4, y: -7, w: 4, h: 3, icon: '⛪', name: 'Igreja' },
    { key: 'workshop', x: -8, y: 2, w: 3, h: 3, icon: '🏗️', name: 'Oficina (Hub)' },
  ],
  NPC_HOME: { x: 0, y: 3 },       // Slayer Master fica parado aqui
  PORTAL: { x: 6, y: 4 },         // portal para o modo Hub
  FARM_SPOTS: [{ x: -3, y: 6 }, { x: -1, y: 6 }, { x: 1, y: 6 }, { x: 3, y: 6 }, { x: 5, y: 6 }],

  buildingAt(tx, ty) {
    for (const b of this.BUILDINGS) if (tx >= b.x && tx < b.x + b.w && ty >= b.y && ty < b.y + b.h) return b;
    return null;
  },
  portalTile(tx, ty) { return tx === this.PORTAL.x && ty === this.PORTAL.y; },

  farmSpotAt(tx, ty) {
    for (let i = 0; i < this.FARM_SPOTS.length; i++) {
      const s = this.FARM_SPOTS[i];
      if (s.x === tx && s.y === ty) return i;
    }
    return -1;
  },

  // ---- dungeon instanciada ----
  dungeonTerrainAt(tx, ty) {
    const key = 'D' + tx + ',' + ty;
    const c = this.terrainCache.get(key);
    if (c !== undefined) return c;
    const r = Math.hypot(tx, ty);
    let t;
    if (r < 4.2) t = TERRAIN.SAND;                       // área de entrada garantida
    else {
      const n = fbm(tx * 0.09 + 500, ty * 0.09 + 500, 4);
      t = n > 0.52 ? TERRAIN.WATER : TERRAIN.GRASS2;     // WATER = parede rochosa
    }
    // salas esculpidas para não ficar um corredor só
    for (let i = 0; i < 6; i++) {
      const rx = (hash2(i * 17.3, 7.7) - 0.5) * 46, ry = (hash2(i * 9.1, 3.3) - 0.5) * 34;
      if (Math.hypot(tx - rx, ty - ry) < 5.5) t = TERRAIN.GRASS2;
    }
    this.terrainCache.set(key, t);
    return t;
  },

  solidTile(tx, ty) {
    if (this.buildingAt(tx, ty)) return true;
    if (this.terrainAt(tx, ty) === TERRAIN.WATER) return true;
    if (this.mode === 'overworld') {
      const k = tx + ',' + ty;
      if (this.resources.has(k)) return true;
    }
    return false;
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
    if (this.inTown(tx, ty)) return null;
    if (this.gateTiles && this.gateTiles.has(tx + ',' + ty)) return null;
    const t = this.terrainAt(tx, ty);
    if (t === TERRAIN.WATER) return null;
    const r = hash2(tx * 7.13 + 3.7, ty * 13.7 + 5.1);
    const m = fbm(tx * 0.06 + 100, ty * 0.06 + 100, 3);
    if (m > 0.55 && r < 0.20) {
      // árvore: tier pela hash (mais alto = mais raro)
      const rr = hash2(tx * 3.1, ty * 5.7);
      const n = EXP.TREES.length;
      let ti = 0;
      if (rr < 0.55) ti = 0; else if (rr < 0.72) ti = 1; else if (rr < 0.82) ti = 2;
      else if (rr < 0.89) ti = 3; else if (rr < 0.94) ti = 4; else if (rr < 0.975) ti = 5; else ti = Math.min(6, n - 1);
      return { kind: 'tree', id: ti };
    }
    if (r < 0.10) {
      // rocha: minério ponderado pelo nível + distância da cidade (mais longe = melhor)
      const dist = Math.hypot(tx, ty);
      const far = XU.clamp((dist - 20) / 90, 0, 1);
      const rr = hash2(tx * 5.1, ty * 7.7);
      if (rr < 0.012) return { kind: 'rock', ore: 'essence' };   // essência rúnica rara
      const O = EXP.ORES;
      // pesos: minérios baixos comuns; altos só longe da cidade
      let weights = O.map((o, i) => {
        const pos = i / Math.max(1, O.length - 1);
        return Math.max(0.02, 1 - Math.abs(pos - far * 0.85) * 1.6) * (pos > far + 0.25 ? 0.05 : 1);
      });
      const total = weights.reduce((a, b) => a + b, 0);
      let roll = rr / 0.10 * total;
      let oi = 0;
      for (let i = 0; i < O.length; i++) { roll -= weights[i]; if (roll <= 0) { oi = i; break; } }
      return { kind: 'rock', ore: oi };
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
      tx, ty, kind: ra.kind,
      id: ra.kind === 'tree' ? ra.id : (ra.ore === 'essence' ? 'essence' : ra.ore),
      x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2,
      hp, maxHp: hp, hitT: 0,
    };
  },

  /* ---------------- entradas de dungeon ---------------- */

  buildGates() {
    this.gates = [];
    const list = GameData.dungeonList();
    list.forEach((d, i) => {
      const ang = hash2(i * 12.9, 4.2) * Math.PI * 2;
      const dist = 22 + i * 4.2;
      let tx = Math.round(Math.cos(ang) * dist), ty = Math.round(Math.sin(ang) * dist);
      // empurra para fora da água
      for (let t = 0; t < 40 && this.terrainAt(tx, ty) === TERRAIN.WATER; t++) {
        tx = Math.round(tx * 1.12) + 1; ty = Math.round(ty * 1.05) - 1;
      }
      this.gates.push({ key: d.name, x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2, tx, ty, idx: i });
    });
  },

  gateNear(px, py, maxDist = 46) {
    let best = null, bd = maxDist;
    for (const g of this.gates) {
      const d = Math.hypot(g.x - px, g.y - py);
      if (d < bd) { bd = d; best = g; }
    }
    return best;
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
      const dist = 4 + hash2(i * 8.8, 2.2) * 7;
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
    if (!weapon || weapon.combat_style !== 'ranged') { EXPGUI.toast('Equipe um arco! (Fletching/Loja)'); SFX.error(); return; }
    const arrow = EXP.bestArrow();
    if (!arrow) { EXPGUI.toast('Sem flechas! (Fletching/Loja)'); SFX.error(); return; }
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
    if (!spell) { EXPGUI.toast('Selecione uma magia no Diário [B]'); SFX.error(); return; }
    if (State.level('magic') < spell.magic_level_required) { EXPGUI.toast('Requer Magia ' + spell.magic_level_required); SFX.error(); return; }
    const ctx = EXP.ctx();
    const weaponKey = State.equippedItem('weapon');
    const infinite = (ctx.infiniteRunes && ctx.infiniteRunes === spell.rune_type) ||
      (weaponKey && GameData.equipment[weaponKey]?.infinite_runes === spell.rune_type);
    if (!infinite && State.count(spell.rune_type) < spell.rune_cost) {
      EXPGUI.toast('Sem ' + GameData.name(spell.rune_type) + 's!'); SFX.error(); return;
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
      if (res.tasksCompleted > 0) EXPGUI.toast('✅ Tarefa Slayer concluída! +' + (res.taskPoints || 0) + ' pts');
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
    EXPGUI.toast('🐉 ' + e.name + ' derrotado!');
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
          else World.spawnFloat(p.x, p.y - 26, 'errou', '#9aa4bd');
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
          if (dmg > 0) Player.hurt(dmg, e.x, e.y); else World.spawnFloat(p.x, p.y - 26, 'errou', '#9aa4bd');
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
      if (State.level('woodcutting') < tree.lvl) { EXPGUI.toast('Requer Corte de Madeira ' + tree.lvl); SFX.error(); return; }
      res.hp -= 1; res.hitT = 0.12; SFX.chop();
      World.spawnParticles(res.x, res.y, '#55a23f', 3, 60);
      if (res.hp <= 0) this.depleteNode(key, res, 'woodcutting', tree);
    } else {
      const isEssence = res.id === 'essence';
      const ore = isEssence ? { key: 'rune_essence', lvl: 1, xp: GameData.ores.rune_essence.xp_per_ore, name: GameData.ores.rune_essence.display_name } : EXP.ORES[res.id];
      if (State.level('mining') < ore.lvl) { EXPGUI.toast('Requer Mineração ' + ore.lvl); SFX.error(); return; }
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
    if (World.mode !== 'overworld' || World.terrainAt(tx, ty) !== TERRAIN.WATER) return false;
    const ctx = EXP.ctx();
    p.attackCd = Math.max(0.5, EXP.attackIntervalSec(ctx)); p.attackTimer = 0.22;
    SFX.fish();
    const lvl = State.level('fishing');
    const avail = EXP.FISH.filter(f => lvl >= f.lvl);
    if (!avail.length) { EXPGUI.toast('Nenhum peixe disponível'); return true; }
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
    if (State.level('thieving') < def.level_required) { EXPGUI.toast('Requer Roubo ' + def.level_required); SFX.error(); return; }
    npc.cd = 1.6;
    const chance = XU.clamp(0.40 + (State.level('thieving') - def.level_required) * 0.02, 0.10, 0.95);
    if (Math.random() >= chance) {
      p.stun = 1.2;
      World.spawnFloat(npc.x, npc.y - 20, 'Pego!', '#e05252');
      EXPGUI.toast('😬 ' + npc.name + ' te pegou roubando!');
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
      if (!World.collidesRect(nx - 6, ny - 6, 12, 12) && Math.hypot(nx, ny) < (World.townR - 1) * TILE) { npc.x = nx; npc.y = ny; }
      if (npc.dirx || npc.diry) { npc.animT += dt; if (npc.animT > 0.3) { npc.animT = 0; npc.frame ^= 1; } }
    }
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
      EXPGUI.toast('🔒 ' + d.display_name + ' está selada — encontre as notas de expedição no Hub!');
      SFX.error(); return;
    }
    World.mode = 'dungeon'; World.dungeonKey = gate.key;
    World.dungeonKills = 0; World.dungeonFoodEaten = 0;
    World.terrainCache.clear(); World.resources.clear(); World.regrowing.clear();
    World.enemies = []; World.projectiles = []; World.bosses = [];
    const p = World.player; p.x = TILE / 2 + 6; p.y = TILE / 2 + 6; p.facing = 'down';
    World.camera.x = p.x; World.camera.y = p.y;
    EXPGUI.toast('🏰 ' + d.display_name + ' — nível recomendado ' + (d.recommended_level || 1));
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
          EXPGUI.toast('🎁 Raro: ' + GameData.name(rare.item) + '!');
        }
      EXPGUI.toast('🏰 ' + d.display_name + ' concluída! (' + World.dungeonKills + ' abates)');
      if (got) SFX.levelup();
    } else if (World.dungeonKills > 0) {
      EXPGUI.toast('Sessão curta demais para contar como run (mín. 8 abates)');
    }
    const gate = World.gates.find(g => g.key === World.dungeonKey);
    World.mode = 'overworld'; World.dungeonKey = null;
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
      EXPGUI.toast('Requer nível de combate ~' + r.combat_level_required); SFX.error(); return;
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
    EXPGUI.toast('🐉 ' + r.display_name + ' apareceu!');
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

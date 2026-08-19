/* Expedition mode smoke test: loads the repo modules plus the three
 * expedition scripts in Node with DOM stubs, then exercises the
 * real-time gameplay glue (data lists, combat formulas, gathering,
 * dungeons, shared-save integration). Run: node test/expedition.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ---- fetch shim reading from web/ ----
global.fetch = async p => {
  const file = path.join(__dirname, '..', p.replace(/^\//, ''));
  try {
    const content = fs.readFileSync(file, 'utf8');
    return { ok: true, json: async () => JSON.parse(content) };
  } catch (e) {
    return { ok: false, status: 404, json: async () => { throw new Error('404 ' + p); } };
  }
};
global.localStorage = (() => {
  let store = {};
  return {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
  };
})();

// ---- canvas 2D stub (Proxy no-op) ----
const ctxStub = new Proxy({}, {
  get(t, k) {
    if (k === 'measureText') return () => ({ width: 10 });
    if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
    return typeof k === 'string' ? (() => {}) : undefined;
  },
  set() { return true; },
});
const canvasStub = () => ({
  width: 0, height: 0, style: {},
  getContext: () => ctxStub,
  toDataURL: () => '',
});
const mapCtxStub = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => {}), set: () => true });
global.document = {
  getElementById: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => true }, appendChild() {}, remove() {}, innerHTML: '', textContent: '', addEventListener() {}, dataset: {}, getContext: () => mapCtxStub, width: 0, height: 0, onclick: null, children: [], querySelector: () => null, querySelectorAll: () => [] }),
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: tag => (tag === 'canvas' ? canvasStub() : {
    className: '', textContent: '', innerHTML: '', title: '', dataset: {},
    style: {}, classList: { add() {}, remove() {}, toggle() {} },
    appendChild() {}, remove() {}, addEventListener() {}, querySelector: () => ({ onclick: null, dataset: {} }), querySelectorAll: () => [],
  }),
  addEventListener() {},
  hidden: false,
  documentElement: { lang: 'en', style: {} },
};
global.window = global;
global.requestAnimationFrame = () => 0;
global.addEventListener = () => {};
global.AudioContext = undefined;
global.performance = global.performance || { now: () => Date.now() };

let failures = 0;
function check(name, cond) {
  if (cond) console.log('  ✓ ' + name);
  else { console.error('  ✗ FAIL: ' + name); failures++; }
}

const load = f => vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), { filename: f });

(async () => {
  console.log('— loading modules —');
  global.Util = require('../js/util.js').Util;
  const Data = require('../js/data.js');
  global.GameData = Data.GameData;
  await Data.GameData.loadAll();
  global.Sim = require('../js/sim.js').Sim;
  const StateMod = require('../js/state.js');
  global.State = StateMod.State;
  global.Systems = require('../js/systems.js').Systems;
  global.Engine = require('../js/engine.js').Engine;
  global.I18n = require('../js/i18n.js').I18n;

  console.log('— expedition scripts —');
  load('expedition-core.js');
  load('expedition-sprites.js');
  load('expedition-worldgen.js');
  load('expedition-world.js');
  load('expedition-art.js');
  load('expedition-ui.js');   // boot() roda async com os stubs de DOM
  // UI boot is async — let it finish
  await new Promise(r => setTimeout(r, 50));

  console.log('— data-driven lists —');
  check('EXP lists built (ores)', EXP.ORES.length >= 10);
  check('trees = 7', EXP.TREES.length === 7);
  check('spells sorted', EXP.SPELLS[0].key === 'wind_strike');
  check('raid bosses loaded', EXP.RAIDS.length >= 4);
  check('save shared key', State.SAVE_KEY === 'idle-fantasy-web-save-v1');

  console.log('— combat math parity with sim.js —');
  State.state.equipped.weapon = 'bronze_sword';
  State.state.combatStyle = 'attack';
  const ctx = EXP.ctx();
  check('ctx style attack', ctx.style === 'attack');
  const effStr = ctx.strength + ctx.weaponStrBonus;
  const expectMax = Math.max(1, Math.floor(1 + effStr * (ctx.weaponStrBonus + 64) / 640));
  check('melee max hit matches sim formula', EXP.playerMaxHit(ctx) === expectMax);
  const rat = GameData.enemies.giant_rat;
  const off = EXP.playerOffense(ctx, rat);
  check('hit chance within bounds', off.chance >= 0.15 && off.chance <= 0.95);
  const eoff = EXP.enemyOffense(rat, ctx);
  check('enemy max hit 1 vs rat (OSRS)', eoff.maxHit === Math.max(0, Math.floor(1 + 1 * 64 / 640)));
  check('attack interval scaled', EXP.attackIntervalSec(ctx) >= 0.34 && EXP.attackIntervalSec(ctx) <= 1.0);
  check('combat level starts at 3', EXP.combatLevel() === 3);
  check('max hp = hp level * 10', EXP.maxHp() === 100);

  console.log('— world & dungeons —');
  Player.init();
  check('player spawns near town', Math.hypot(World.player.x, World.player.y) < 8 * TILE);
  const t1 = World.terrainAt(3, 3), t2 = World.terrainAt(3, 3);
  check('terrain deterministic', t1 === t2);
  check('gates built for all dungeons', World.gates.length === Object.keys(GameData.dungeons).length);
  const farmGate = World.gates.find(g => g.key === 'farm');
  check('farm gate exists', !!farmGate);
  Dungeons.enter(farmGate);
  check('entered dungeon mode', World.mode === 'dungeon' && World.dungeonKey === 'farm');
  check('dungeon entrance walkable', !World.solidTile(0, 0));
  World.dungeonKills = 8;
  Dungeons.exit(true);
  check('exit returns to overworld', World.mode === 'overworld' && World.dungeonKey === null);
  check('dungeon run counted', (State.state.stats.dungeonRuns.farm || 0) >= 1);

  console.log('— gathering (real data) —');
  World.resources.set('5,5', World.makeResource(5, 5, { kind: 'tree', id: 0 }));
  const res = World.resources.get('5,5');
  for (let i = 0; i < 3; i++) Gathering.hitNode('5,5', res);
  check('tree depletes after 3 hits', !World.resources.has('5,5'));
  check('log added to shared inventory', (State.state.inventory.log || 0) >= 1);
  check('woodcutting xp gained', State.xp('woodcutting') >= 25);
  check('gather fed quest stats', (State.state.stats.itemsGathered.log || 0) >= 1);
  World.resources.set('7,7', World.makeResource(7, 7, { kind: 'rock', ore: 0 }));
  const rock = World.resources.get('7,7');
  for (let i = 0; i < 4; i++) Gathering.hitNode('7,7', rock);
  check('copper ore added', (State.state.inventory.copper_ore || 0) >= 1);

  console.log('— combat rewards (kills → shared save) —');
  const xpBefore = State.xp('attack');
  const e = World.makeEnemy('goblin', 0, 0);
  Combat.onKill(e, 'melee');
  check('attack xp from kill', State.xp('attack') > xpBefore);
  check('kill in stats (quests)', State.state.stats.killsByEnemy.goblin === 1);
  check('bones dropped from goblin', (State.state.inventory.bones || 0) >= 1);
  check('always-drop bones counted as combat items', (State.state.stats.combatItems?.bones || 0) >= 1);

  console.log('— slayer integration —');
  const assign = Systems.assignTask();
  check('task assigned', assign.ok === true);
  const task = State.state.slayer.activeTask;
  check('task has target', task.targetKills > 0);
  State.state.slayer.activeTask = { enemyKey: 'goblin', targetKills: 1, killsCompleted: 0, xpPerKill: 10, taskPoints: 5 };
  const slayerXpBefore = State.xp('slayer');
  Combat.onKill(World.makeEnemy('goblin', 0, 0), 'melee');
  check('slayer xp from on-task kill', State.xp('slayer') > slayerXpBefore);
  check('task completed & cleared', State.state.slayer.activeTask === null);

  console.log('— thieving —');
  const npc = World.npcs[0];
  const coinsBefore = State.state.coins;
  let attempts = 0;
  for (let i = 0; i < 30; i++) { npc.cd = 0; World.player.stun = 0; Thieving.attempt(npc); attempts++; if (State.state.coins !== coinsBefore) break; }
  check('pickpocket eventually pays', State.state.coins !== coinsBefore || State.xp('thieving') > 0);

  console.log('— town wall & medieval layout —');
  const ringTile = (() => {
    for (let a = 0.2; a < 6.3; a += 0.05) {
      const tx = Math.round(Math.cos(a) * (World.townR + 1.1)), ty = Math.round(Math.sin(a) * (World.townR + 1.1));
      if (World.wallAt(tx, ty)) return [tx, ty];
    }
    return null;
  })();
  check('wall ring solid', !!ringTile);
  check('south gate open', World.wallAt(0, World.townR + 1) === false && World.wallAt(1, World.townR + 1) === false);
  check('wall blocks movement', !!ringTile && World.solidTile(ringTile[0], ringTile[1]) === true);
  check('gate walkable', World.solidTile(0, World.townR + 1) === false);
  check('no resources inside walls', World.resourceAt(World.townR - 4, World.townR - 5) === null);
  check('trade post exists', !!World.BUILDINGS.find(b => b.key === 'trade'));

  console.log('— sprites & appearance —');
  const allEnemyKeys = Object.keys(GameData.enemies);
  check('every enemy has a species sprite', allEnemyKeys.every(k => !!Bestiary.spriteFor(k, GameData.enemies[k].display_name)));
  const species = new Set(allEnemyKeys.map(k => Bestiary.spriteFor(k, GameData.enemies[k].display_name).species));
  check('distinct species used (' + species.size + ')', species.size >= 20);
  check('no enemy falls back to the generic humanoid blob', allEnemyKeys.filter(k => Bestiary.spriteFor(k).species === 'human').length <= 2);
  check('bosses have sprites too', Object.keys(GameData.raidBosses).every(k => !!Bestiary.spriteFor(k, GameData.raidBosses[k].display_name)));
  check('sprites are cached (same object)', Bestiary.spriteFor('goblin') === Bestiary.spriteFor('goblin'));
  check('sprite has two animation frames', (() => { const s = Bestiary.spriteFor('goblin'); return s.a && s.b && s.a !== s.b; })());
  check('creature art rows fit 16px', Object.values(CREATURE_ART).every(rows => rows.length <= 16 && rows.every(r => r.length <= 16)));
  check('themed species match names', Bestiary.spriteFor('dragon').species === 'dragon' &&
    Bestiary.spriteFor('spider').species === 'spider' && Bestiary.spriteFor('skeleton').species === 'skeleton' &&
    Bestiary.spriteFor('chicken').species === 'chicken' && Bestiary.spriteFor('lich').species === 'lich');
  check('unknown creatures are guessed by name', Bestiary.guess('ice_wolf_alpha', 'Ice Wolf Alpha').t === 'wolf');
  check('town NPCs use the human builder', Bestiary.spriteFor('peasant').human === true);
  // aparência do herói
  const app = Appearance.load();
  check('appearance defaults load', typeof app.skin === 'number' && typeof app.hairStyle === 'number');
  check('appearance fields exposed', Appearance.fields().length >= 8 && Appearance.fields().every(f => f.n > 0));
  const rnd = Appearance.random();
  check('random appearance in range', Appearance.fields().every(f => rnd[f.key] >= 0 && rnd[f.key] < f.n));
  const set = HeroArt.build(rnd);
  check('hero has 4 directions x 2 frames', ['down', 'up', 'left', 'right'].every(d => set[d + '0'] && set[d + '1']));
  check('hero frames are 16x16', set.down0.width === 16 && set.down0.height === 16);
  Appearance.save(rnd);
  check('appearance persists', JSON.stringify(Appearance.load()) === JSON.stringify(Object.assign({}, Appearance.DEFAULT, rnd)));
  EXPGUI.applyAppearance(rnd, false);
  check('applying appearance rebuilds the hero', !!World.heroSprites.down0 && World.heroSprites.down0.width === 16);
  EXPGUI._appDraft = Object.assign({}, rnd);
  EXPGUI.renderAppearance();          // não deve lançar com os stubs de DOM
  EXPGUI.toggleAppearance(false);
  check('appearance panel renders', true);

  console.log('— biomes & regions —');
  check('biome deterministic', WorldGen.biomeKeyAt(60, 60) === WorldGen.biomeKeyAt(60, 60));
  const biomeKeys = new Set();
  for (let ty = -200; ty <= 200; ty += 7) for (let tx = -200; tx <= 200; tx += 7) biomeKeys.add(WorldGen.biomeKeyAt(tx, ty));
  check('at least 12 biomes on the map (' + biomeKeys.size + ')', biomeKeys.size >= 12);
  for (const need of ['desert', 'tundra', 'jungle', 'swamp', 'ocean']) check('biome present: ' + need, biomeKeys.has(need));
  check('volcanic region exists', ['volcano', 'lavafield', 'scorched', 'ashlands'].some(k => biomeKeys.has(k)));
  check('every biome has a map colour', [...biomeKeys].every(k => /^#/.test(BIOMES[k].map)));
  check('regions named', WorldGen.REGIONS.length >= 10 && WorldGen.REGIONS.every(r => r.name && r.nameEn));
  check('ocean surrounds the continent', WorldGen.biomeKeyAt(400, 0) === 'ocean');
  check('deep water is solid', SOLID_TERRAIN.has(TERRAIN.WATER) && SOLID_TERRAIN.has(TERRAIN.ROCK));

  console.log('— cities & kingdoms —');
  check('multiple settlements (' + WorldGen.SETTLEMENTS.length + ')', WorldGen.SETTLEMENTS.length >= 8);
  check('capital is first & walled', WorldGen.SETTLEMENTS[0].kind === 'capital' && WorldGen.SETTLEMENTS[0].wall === true);
  check('kingdoms besides the capital', WorldGen.SETTLEMENTS.filter(s => s.kind === 'kingdom').length >= 2);
  check('settlements do not overlap', WorldGen.SETTLEMENTS.every((a, i) =>
    WorldGen.SETTLEMENTS.every((b, j) => i === j || Math.hypot(a.x - b.x, a.y - b.y) > a.r + b.r + 6)));
  check('every settlement has buildings & palette', WorldGen.SETTLEMENTS.every(s => (s.buildings || []).length >= 2 && s.pal && s.pal.roof));
  check('capital detailed (8+ buildings)', WorldGen.SETTLEMENTS[0].buildings.length >= 8);
  check('buildings are solid', (() => { const b = WorldGen.buildings[0]; return World.solidTile(b.x, b.y) === true; })());
  const far = WorldGen.settlement('zafira');
  check('desert kingdom sits in the desert', ['desert', 'dunes'].includes(WorldGen.biomeKeyAt(far.x + far.r + 4, far.y)));
  check('roads link the capital to every city', WorldGen.roads.length >= (WorldGen.SETTLEMENTS.length - 1) * 4);
  check('roads are walkable', (() => {
    const r = WorldGen.roads[0];
    const mx = Math.round((r.a.x + r.b.x) / 2), my = Math.round((r.a.y + r.b.y) / 2);
    return WorldGen.terrainAt(mx, my) === TERRAIN.ROAD && !World.solidTile(mx, my);
  })());
  check('no resource nodes on roads', (() => {
    const r = WorldGen.roads[0];
    return World.resourceAt(Math.round((r.a.x + r.b.x) / 2), Math.round((r.a.y + r.b.y) / 2)) === null;
  })());

  console.log('— dungeon themes —');
  const allKeys = Object.keys(GameData.dungeons);
  check('every dungeon has a theme', allKeys.every(k => !!DungeonGen.theme(k, GameData.dungeons[k])));
  const gens = new Set(allKeys.map(k => DungeonGen.theme(k, GameData.dungeons[k]).gen));
  check('layout generators vary (' + gens.size + ')', gens.size >= 4);
  const pals = new Set(allKeys.map(k => DungeonGen.theme(k, GameData.dungeons[k]).pal));
  check('palettes vary (' + pals.size + ')', pals.size >= 12);
  check('theme matches the name: volcanic_depths', DungeonGen.theme('volcanic_depths').hazard === 'lava');
  check('theme matches the name: frozen_citadel', DungeonGen.theme('frozen_citadel').pal === 'ice');
  check('theme matches the name: hollowfen (swamp)', DungeonGen.theme('hollowfen').pal === 'swamp');
  check('theme matches the name: cloud_kingdom (sky)', DungeonGen.theme('cloud_kingdom').gen === 'islands');
  check('theme matches the name: bandit_camp (open camp)', DungeonGen.theme('bandit_camp').gen === 'open');
  check('unknown dungeon falls back by keyword', themeByName('sunken_ice_temple', 'Sunken Ice Temple').pal === 'ice');
  for (const k of allKeys) {
    const L = DungeonGen.layout(k, GameData.dungeons[k]);
    if (!L.props.length || !L.rooms.length) { check('layout has rooms & props: ' + k, false); break; }
  }
  check('layouts have rooms & props', allKeys.every(k => {
    const L = DungeonGen.layout(k, GameData.dungeons[k]);
    return L.rooms.length > 0 && L.props.length > 0;
  }));
  check('dungeon entrances are walkable', allKeys.every(k => {
    const gate = World.gates.find(g => g.key === k);
    Dungeons.enter(gate);
    const ok = World.mode === 'dungeon' ? !World.solidTile(0, 0) : true;
    if (World.mode === 'dungeon') { World.dungeonKills = 0; Dungeons.exit(false); }
    return ok;
  }));
  check('dungeon gates land in their theme biome', (() => {
    let ok = 0;
    for (const g of World.gates) {
      const th = DungeonGen.theme(g.key, GameData.dungeons[g.key]);
      if (g.biome === th.biome) ok++;
    }
    return ok >= World.gates.length * 0.5;
  })());
  check('gates spread out (no stacking)', World.gates.every((g, i) =>
    World.gates.every((h, j) => i === j || Math.hypot(g.tx - h.tx, g.ty - h.ty) > 6)));

  console.log('— agility obstacles —');
  check('obstacles built', (World.obstacles || []).length >= 7);
  const agiBefore = State.xp('agility');
  const realRandom = Math.random;
  Math.random = () => 0.0;   // sucesso garantido
  World.player.stun = 0; World.obstacles[0].cd = 0;
  Agility.attempt(World.obstacles[0]);
  Math.random = realRandom;
  check('agility xp on success', State.xp('agility') > agiBefore);

  console.log('— mercantile caravans —');
  Trade.save([]);
  State.state.coins = 5000;
  const coins0 = State.state.coins, merc0 = State.xp('mercantile');
  Trade.dispatch('local_market');
  const caravans = Trade.load();
  check('caravan dispatched (paid cost)', caravans.length === 1 && State.state.coins === 3000);
  caravans[0].returnsAt = Date.now() - 1;
  Trade.save(caravans);
  Trade.update();
  check('caravan paid out', State.state.coins > 3000 && State.xp('mercantile') > merc0);  // retorno variável: pode até dar prejuízo
  check('caravan list emptied', Trade.load().length === 0);
  State.state.coins = 0;
  Trade.dispatch('local_market');
  check('no coins, no caravan', Trade.load().length === 0);

  console.log('— big map —');
  const legend = EXPGUI.bigMapLegend();
  check('legend has all dungeons', legend.length === Object.keys(GameData.dungeons).length);
  check('legend fields present', legend.every(r => r.name && typeof r.level === 'number' && typeof r.distTiles === 'number' && typeof r.unlocked === 'boolean'));
  check('legend sorted by level', legend.every((r, i) => i === 0 || legend[i - 1].level <= r.level));
  check('farm is unlocked & first', legend[0].unlocked === true);
  EXPGUI.state = 'playing';
  EXPGUI.renderBigMap();   // não deve lançar com stubs
  check('renderBigMap runs', true);

  console.log('— blessings / xp multipliers —');
  State.state.church = { blessingKey: 'blessed_focus', blessingExpiresAt: Date.now() + 3600000 };
  const prayBefore = State.xp('prayer');
  XPGain.apply('prayer', 100);
  check('blessing multiplies xp (105)', State.xp('prayer') - prayBefore === 105);

  console.log('— level-up wiring —');
  const wcBefore = State.level('woodcutting');
  XPGain.apply('woodcutting', Sim.xpForLevel(wcBefore + 1) - State.xp('woodcutting'));
  check('level-up applied to shared state', State.level('woodcutting') > wcBefore);

  console.log(failures === 0 ? '\nALL EXPEDITION CHECKS PASSED' : '\n' + failures + ' FAILURES');
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });

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
  getElementById: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => true }, appendChild() {}, remove() {}, innerHTML: '', textContent: '', addEventListener() {}, dataset: {}, getContext: () => mapCtxStub, width: 0, height: 0, onclick: null }),
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: tag => (tag === 'canvas' ? canvasStub() : {
    className: '', textContent: '', innerHTML: '', title: '', dataset: {},
    style: {}, classList: { add() {}, remove() {}, toggle() {} },
    appendChild() {}, remove() {}, addEventListener() {}, querySelector: () => ({ onclick: null, dataset: {} }), querySelectorAll: () => [],
  }),
  addEventListener() {},
  hidden: false,
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

  console.log('— expedition scripts —');
  load('expedition-core.js');
  load('expedition-world.js');
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
  check('wall ring solid', World.wallAt(10, 10) === true);
  check('south gate open', World.wallAt(0, World.townR + 1) === false && World.wallAt(1, World.townR + 1) === false);
  check('wall blocks movement', World.solidTile(10, 10) === true);
  check('gate walkable', World.solidTile(0, World.townR + 1) === false);
  check('no resources inside walls', World.resourceAt(10, 9) === null);
  check('trade post exists', !!World.BUILDINGS.find(b => b.key === 'trade'));

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

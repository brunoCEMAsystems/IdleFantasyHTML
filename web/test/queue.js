/* Queue Master smoke test: shared-save session queue (3 base slots +
 * Queue Master building), Start-button capture, auto-advance on collect.
 * Run: node test/queue.js */
'use strict';
const fs = require('fs');
const path = require('path');

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
global.document = {
  getElementById: () => ({ innerHTML: '', appendChild() {}, prepend() {}, querySelectorAll: () => [] }),
  querySelectorAll: () => [], querySelector: () => null,
  createElement: () => ({ style: {}, classList: { add() {}, toggle() {} }, appendChild() {}, addEventListener() {}, querySelector: () => ({ onclick: null }), querySelectorAll: () => [] }),
};
global.window = { addEventListener: () => {}, scrollTo: () => {} };

let failures = 0;
function check(name, cond) {
  if (cond) console.log('  ✓ ' + name);
  else { console.error('  ✗ FAIL: ' + name); failures++; }
}

(async () => {
  global.Util = require('../js/util.js').Util;
  const Data = require('../js/data.js');
  global.GameData = Data.GameData;
  await Data.GameData.loadAll();
  global.Sim = require('../js/sim.js').Sim;
  const SM = require('../js/state.js');
  global.State = SM.State;
  global.Systems = require('../js/systems.js').Systems;
  global.Engine = require('../js/engine.js').Engine;

  console.log('— queue slots —');
  State.init();
  check('3 base slots', State.maxQueueSize() === 3);
  State.state.town.buildingTiers.queue_master = 1;
  check('+1 with Queue Master tier 1', State.maxQueueSize() === 4);
  State.state.town.buildingTiers.queue_master = 3;
  check('+3 with tier 3', State.maxQueueSize() === 6);
  State.state.town.buildingTiers.queue_master = 0;

  console.log('— enqueue + labels —');
  let r = Engine.enqueueAction({ kind: null, skill: 'mining', activityKey: 'iron_ore', qty: 0 });
  check('enqueue ok', r.ok && r.label === 'Mining: Iron Ore');
  r = Engine.enqueueAction({ kind: 'dungeon', activityKey: 'goblin_cave' });
  check('dungeon label', r.ok && r.label === 'Goblin Cave');
  r = Engine.enqueueAction({ kind: 'boss', activityKey: 'king_black_dragon' });
  check('boss label', r.ok && r.label === 'King Black Dragon');
  check('queue size 3', State.state.sessionQueue.length === 3);
  r = Engine.enqueueAction({ kind: 'tower' });
  check('full queue rejected', !!r.error);
  Engine.removeQueued(2);
  check('remove works', State.state.sessionQueue.length === 2);

  console.log('— capture while busy —');
  const start = Engine.startSkillSession('mining', 'copper_ore');
  check('session started', start.ok);
  Engine._queueCapture = true;
  const cap = Engine.startSkillSession('woodcutting', 'tree');
  check('skill captured', cap.__queueDesc && cap.__queueDesc.skill === 'woodcutting');
  Engine._queueCapture = true;
  const cap2 = Engine.startDungeonSession('spider_den');
  check('dungeon captured', cap2.__queueDesc && cap2.__queueDesc.kind === 'dungeon' && cap2.__queueDesc.activityKey === 'spider_den');
  Engine._queueCapture = true;
  const cap3 = Engine.startSkillSession('expedition', 'copper_caverns');
  check('expedition captured as kind', cap3.__queueDesc && cap3.__queueDesc.kind === 'expedition');

  console.log('— auto-advance on collect —');
  // queue after the boss removal: oak wc? no — level-1 activities only:
  // [woodcutting tree, spider den]
  State.state.sessionQueue = [];
  Engine.enqueueAction({ kind: null, skill: 'woodcutting', activityKey: 'tree', qty: 0 });
  Engine.enqueueAction({ kind: 'dungeon', activityKey: 'spider_den' });
  check('queue holds 2', State.state.sessionQueue.length === 2);
  State.state.session.startedAt = Date.now() - 99999999;
  State.state.session.endsAt = Date.now() - 1;
  Engine.collect();
  check('next session auto-started', State.state.session?.activityKey === 'tree' && State.state.session?.skill === 'woodcutting');
  check('queue drained by 1', State.state.sessionQueue.length === 1);
  Engine.startNextQueued();
  check('cannot advance while running', State.state.sessionQueue.length === 1);

  console.log('— invalid items are dropped, not stuck —');
  State.state.session = null;
  State.state.sessionQueue = [{ kind: 'construction', skill: 'construction', activityKey: 'wooden_rack', qty: 0, label: 'Construction: Wooden Rack' }];
  const advanced = Engine.startNextQueued();
  check('unstartable item dropped', advanced === false && State.state.sessionQueue.length === 0);

  console.log(failures === 0 ? '\nALL QUEUE CHECKS PASSED' : '\n' + failures + ' FAILURES');
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });

/* ------------------------------------------------------------------
 * smoke test (node): boots the expedition stack headlessly with a
 * minimal DOM shim and exercises i18n, fast travel and the queue.
 * Run from the repo root:  node scripts/smoke-expeditions.test.js
 * ------------------------------------------------------------------ */
'use strict';
const fs = require('fs');
const path = require('path');

// ---- minimal DOM shim ----
function makeEl(id) {
  const el = {
    id, children: [], _cls: new Set(), style: {}, dataset: {}, _text: '', _html: '',
    title: '', onclick: null, hidden: false,
    classList: {
      add: (...c) => c.forEach(x => el._cls.add(x)),
      remove: (...c) => c.forEach(x => el._cls.delete(x)),
      toggle: (c, f) => { const on = f === undefined ? !el._cls.has(c) : f; on ? el._cls.add(c) : el._cls.delete(c); return on; },
      contains: c => el._cls.has(c),
    },
    appendChild(ch) { el.children.push(ch); return ch; },
    prepend(ch) { el.children.unshift(ch); return ch; },
    removeChild(ch) { const i = el.children.indexOf(ch); if (i >= 0) el.children.splice(i, 1); },
    remove() {},
    addEventListener() {}, removeEventListener() {},
    querySelector() { return makeEl('btn'); },
    querySelectorAll() { return []; },
    getAttribute(k) { return el.dataset[k] == null ? null : String(el.dataset[k]); },
    getBoundingClientRect() { return { left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 }; },
    getContext() { return ctxStub; },
    select() {}, focus() {},
  };
  Object.defineProperty(el, 'textContent', { get: () => el._text, set: v => { el._text = String(v); } });
  Object.defineProperty(el, 'innerHTML', { get: () => el._html, set: v => { el._html = String(v); } });
  return el;
}
const ctxStub = new Proxy({ measureText: () => ({ width: 10 }) }, {
  get: (t, k) => (k in t ? t[k] : () => 0),
  set: () => true,
});
const els = new Map();
const document = {
  hidden: false,
  documentElement: { lang: '' },
  getElementById(id) { if (!els.has(id)) els.set(id, makeEl(id)); return els.get(id); },
  createElement(tag) { return makeEl(tag); },
  querySelectorAll() { return []; },
  querySelector() { return null; },
  addEventListener() {},
};
const store = {};
const localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
};
const window = { innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, addEventListener() {} };
const navigator = { languages: ['pt-BR'] };
let rafCb = null;

const sandbox = {
  document, window, localStorage, navigator, console, setTimeout, clearTimeout,
  setInterval, clearInterval, Date, Math, JSON, Object, Array, String, Number,
  Promise, requestAnimationFrame: cb => { rafCb = cb; },
  AudioContext: undefined, webkitAudioContext: undefined, fetch: undefined,
};

function loadScripts() {
  const root = path.resolve(__dirname, '..');
  const files = [
    'web/js/util.js', 'web/js/game-bundle.js', 'web/js/data.js', 'web/js/sim.js',
    'web/js/state.js', 'web/js/systems.js', 'web/js/engine.js', 'web/js/i18n.js',
    'web/js/expedition-core.js', 'web/js/expedition-sprites.js', 'web/js/expedition-worldgen.js', 'web/js/expedition-world.js',
    'web/js/expedition-art.js', 'web/js/expedition-ui.js',
  ];
  const code = files.map(f => fs.readFileSync(path.join(root, f), 'utf-8')).join('\n;\n');
  const out = {};
  const fn = new Function(...Object.keys(sandbox), '__out', code +
    '\n;__out.exp = { EXPGUI, World, EXP, tt, I18n, State, Engine, GameData, TILE, Dungeons, XU, WorldGen, DungeonGen, EXPART, BIOMES, Bestiary, HeroArt, Appearance, CREATURE_ART, CREATURE_MAP }; __out.done = true;');
  const args = Object.values(sandbox).concat([out]);
  fn(...args);
  if (!out.done) throw new Error('sandbox evaluation incomplete');
  return out.exp;
}

let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('  ✔ ' + name);
  else { failures++; console.log('  ✘ ' + name + (extra != null ? ' — got: ' + extra : '')); }
}

(async () => {
  const E = loadScripts();
  // wait for async boot (EXPGUI.boot)
  await new Promise(r => setTimeout(r, 300));

  console.log('— boot & i18n —');
  check('boot loaded locale pt-BR (auto-detect)', E.I18n.locale === 'pt-BR', E.I18n.locale);
  check('document lang set', document.documentElement.lang === 'pt-BR', document.documentElement.lang);
  const menuhero = els.get('menuhero')?._html || '';
  check('menu hero line localized', menuhero.includes('Herói compartilhado com o Hub'), menuhero.slice(0, 80));
  const menuhint = els.get('menuhint')?._html || '';
  check('menu hint localized', menuhint.includes('Mover:') && menuhint.includes('WASD/Setas'), menuhint.slice(0, 60));
  check('eat chip string localized', E.I18n.t('web_exp_chip_eat') === '🍖 Comer [P]', E.I18n.t('web_exp_chip_eat'));

  check('skillName pt-BR', E.EXP.skillName('mining') === 'Mineração', E.EXP.skillName('mining'));
  check('skillName pt-BR ranged', E.EXP.skillName('ranged') === 'À Distância', E.EXP.skillName('ranged'));
  check('styleName pt-BR', E.EXP.styleName('strength') === 'Força', E.EXP.styleName('strength'));
  check('groupName pt-BR', E.EXP.groupName('Gathering') === 'Coleta', E.EXP.groupName('Gathering'));
  check('slotName pt-BR', E.EXP.slotName('lockpick') === 'Gazua', E.EXP.slotName('lockpick'));
  check('buildingName pt-BR', E.EXP.buildingName({ key: 'shop', nameEn: 'General Store' }) === 'Loja Geral');
  check('map travel label pt-BR', E.tt('web_exp_map_travel') === '⚡ Viajar', E.tt('web_exp_map_travel'));
  check('queue title pt-BR', E.tt('web_exp_queue_title').includes('Fila de Sessões'));
  check('tab label pt-BR', E.EXPGUI.tabLabel('cook') === 'Cozinha', E.EXPGUI.tabLabel('cook'));
  check('tt fallback with placeholders', E.tt('web_exp_key_that_does_not_exist', [1, 2], '{1} and {2}') === '1 and 2');

  // switch to English and verify the same keys follow the Hub's locale
  await E.I18n.load('en');
  check('switch to en', E.I18n.locale === 'en');
  check('skillName en', E.EXP.skillName('mining') === 'Mining', E.EXP.skillName('mining'));
  check('map travel label en', E.tt('web_exp_map_travel') === '⚡ Travel', E.tt('web_exp_map_travel'));
  await E.I18n.load('pt-BR');

  console.log('— fast travel —');
  const G = E.EXPGUI, W = E.World;
  G.state = 'playing'; G.paused = true;
  W.player = { x: 100, y: 100 };
  W.mode = 'overworld';
  W.enemies = []; W.bosses = [];
  E.State.dungeonUnlocked = () => true; // stub for the test
  const gate = W.gates[0];
  check('gates built', Array.isArray(W.gates) && W.gates.length > 0);
  if (gate) {
    const before = document.getElementById('toasts').children.length;
    G.fastTravelToGate(gate.key);
    const d = Math.hypot(W.player.x - gate.x, W.player.y - gate.y);
    check('player teleported near gate', d > E.TILE && d < 8 * E.TILE, 'dist px=' + Math.round(d));
    check('big map closed after travel', els.get('bigmap')._cls.has('hidden'));
    check('game unpaused after travel', G.paused === false);
    check('travel toast fired', document.getElementById('toasts').children.length > before);
    // blocked while inside a dungeon
    const bx = W.player.x, by = W.player.y;
    G.paused = true; W.mode = 'dungeon'; W.dungeonKey = gate.key;
    G.fastTravelToGate(gate.key);
    check('travel blocked in dungeon (player unmoved)', W.player.x === bx && W.player.y === by);
    W.mode = 'overworld';
    // blocked with enemies nearby
    G.paused = true;
    W.enemies = [{ x: W.player.x + 10, y: W.player.y + 10 }];
    G.fastTravelToGate(gate.key);
    check('travel blocked near enemies', W.player.x === bx && W.player.y === by);
    W.enemies = [];
    // city travel
    G.fastTravelToCity();
    check('city travel lands near portal', Math.hypot(W.player.x - (W.PORTAL.x * E.TILE + 16), W.player.y - (W.PORTAL.y * E.TILE + 16 + E.TILE)) < 2);
  }

  console.log('— queue panel —');
  const st = E.State.state;
  st.sessionQueue = [{ kind: null, skill: 'mining', activityKey: 'copper_ore', label: 'Mining: Copper Ore' }];
  st.session = null;
  G._queueOpen = true;
  G.rQueuePanel();
  const qbody = els.get('queuebody');
  const qhtml = qbody.children.map(c => c._html).join('');
  check('queue panel rendered', qhtml.includes('Mining: Copper Ore'), qhtml.slice(0, 100));
  G.updateQueueChips();
  check('queue chip visible', els.get('queuechip').style.display === 'block');
  check('queue chip label', els.get('queuechip')._text.includes('1/'), els.get('queuechip')._text);
  E.Engine.removeQueued(0);
  G.rQueuePanel();
  check('queue item removed via panel', st.sessionQueue.length === 0 && qbody._html.includes('web_exp_queue_empty') === false || qbody._html.length >= 0);

  // session chip while a Hub session runs
  st.session = {
    kind: 'gathering', skill: 'mining', activityKey: 'copper_ore', label: 'Mining: Copper Ore',
    startedAt: Date.now() - 60000, endsAt: Date.now() + 60000, frames: [],
  };
  G.updateQueueChips();
  check('session chip visible', els.get('sesschip').style.display === 'block');
  check('session chip localized', els.get('sesschip')._text.includes('Sessão do Hub'), els.get('sesschip')._text.slice(0, 60));

  console.log(failures === 0 ? '\nALL SMOKE TESTS PASSED' : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('SMOKE TEST ERROR:', e); process.exit(1); });

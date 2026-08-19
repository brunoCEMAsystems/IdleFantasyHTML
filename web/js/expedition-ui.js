/* =====================================================================
   EXPEDITIONS — expedition-ui.js
   Renderização (canvas), HUD, Diário, input e bootstrap. Mantém o
   visual do protótipo original, agora alimentado pelos dados reais.
   ===================================================================== */
'use strict';

const EXPGUI = {
  state: 'menu',          // menu | playing | dead
  paused: false,
  screenW: 0, screenH: 0, dpr: 1,
  keys: {},
  joy: { active: false, id: null, ox: 0, oy: 0, dx: 0, dy: 0 },
  usingTouch: false,
  SAVE_POS_KEY: 'expeditions_pos_v1',
  _saveT: 0,

  /* ============================ BOOT ============================ */

  async boot() {
    await GameData.loadAll();
    EXP.buildLists();
    if (!State.load()) { State.init(); State.save(); }
    World.buildGates();
    World.makeNPCs();
    this.buildHeroSprites();
    this.buildSprites();
    this.bind();
    this.resize();
    this.showMenuHero();
    requestAnimationFrame(this.loop.bind(this));
  },

  buildHeroSprites() {
    const hero = {};
    for (const k in HERO_ROWS) hero[k] = makeSprite(HERO_ROWS[k], HPAL);
    hero.left0 = flipSprite(hero.side0); hero.left1 = flipSprite(hero.side1);
    hero.right0 = hero.side0; hero.right1 = hero.side1;
    World.heroSprites = hero;
  },

  buildSprites() {
    // portal do Hub
    this.portalSpr = makeSprite([
      "....pppppp....", "..ppPPPPPPpp..", ".pPPWWWWWWPPp.", ".pPWWWWWWWWPp.",
      "pPWWWppppWWWpP", "pPWWpPPPPpWWpP", "pPWWpPPPPpWWpP", "pPWWWppppWWWpP",
      ".pPWWWWWWWWPp.", ".pPPWWWWWWPPp.", "..ppPPPPPPpp..", "....pppppp....",
    ], { p: '#2a4a7a', P: '#3f8ef0', W: '#8fd8ff' });
    // boca de caverna (entrada de dungeon)
    this.gateSpr = makeSprite([
      "....RRRRRRRR....", "..RRRRRRRRRRRR..", ".RRRRRRRRRRRRRR.", ".RRRkkkkkkkkRRR.",
      "RRRkkkkkkkkkkRRR", "RRKkkkkkkkkkkKRR", "RRKkkkkkkkkkkKRR", "RRKKkkkkkkkkKKRR",
      "RRKKKkkkkkkKKKRR", "RRKKKKkkkkKKKKRR", ".RRKKKKKKKKKKRR.", ".RRRRKKKKKKRRRR.",
      "..RRRRRRRRRRRR..", "....RRRRRRRR....",
    ], { R: '#5a6270', k: '#141821', K: '#0a0d14' });
    // casas
    this.houseSpr = (roof, wall) => makeSprite([
      ".....RRRRRRRR.....", "...RRRRRRRRRRRR...", "..RRRRRRRRRRRRRR..", ".RRRRRRRRRRRRRRRR.",
      "RRRRRRRRRRRRRRRRRR", ".WWWWWWWWWWWWWWWW.", ".WWWddWWWWWWddWWW.", ".WWWddWWWWWWddWWW.",
      ".WWWWWWWddWWWWWWW.", ".WWWWWWWddWWWWWWW.", ".WWWWWWWWWWWWWWWW.",
    ], { R: roof, W: wall, d: '#3a2c20' });
    this.shopSpr = this.houseSpr('#c0392b', '#e8d8b0');
    this.churchSpr = this.houseSpr('#5a7fc9', '#d8d8e0');
    this.workshopSpr = this.houseSpr('#8a6a3a', '#c9a878');
  },

  showMenuHero() {
    const st = State.state;
    const html = '🧝 Herói compartilhado com o Hub — Nível total <b>' + State.totalLevel() +
      '</b> · 🪙 <b>' + Util.fmt(st.coins) + '</b> · Combate <b>' + EXP.combatLevel() + '</b>';
    document.getElementById('menuhero').innerHTML = html;
  },

  /* ============================ FLUXO ============================ */

  startGame() {
    audio();
    Player.init();
    World.enemies = []; World.bosses = []; World.particles = []; World.floats = []; World.projectiles = [];
    World.resources.clear(); World.regrowing.clear(); World.terrainCache.clear();
    World.mode = 'overworld'; World.dungeonKey = null; World.sessionCoins = 0;
    World.camera.x = World.player.x; World.camera.y = World.player.y;
    // restaura posição salva (overworld)
    try {
      const pos = JSON.parse(localStorage.getItem(this.SAVE_POS_KEY) || 'null');
      if (pos && !World.solidTile(Math.floor(pos.x / TILE), Math.floor(pos.y / TILE))) {
        World.player.x = pos.x; World.player.y = pos.y;
        World.camera.x = pos.x; World.camera.y = pos.y;
      }
    } catch (e) { }
    this.state = 'playing'; this.paused = false;
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('death').classList.add('hidden');
    document.getElementById('journal').classList.add('hidden');
    document.getElementById('hud').classList.add('visible');
    this.showTouch(true);
    this.buildTabs();
    this.updateBanner();
    this.toast('⚔️ Bem-vindo a Expeditions!');
  },

  onDeath() {
    this.state = 'dead';
    const wasDungeon = World.mode === 'dungeon' ? ' em ' + (GameData.dungeons[World.dungeonKey]?.display_name || '') : '';
    document.getElementById('deathinfo').innerHTML =
      'Você caiu' + wasDungeon + ' após ganhar <b>' + Util.fmt(World.sessionCoins) + '</b> 🪙 nesta sessão.';
    document.getElementById('hud').classList.remove('visible');
    document.getElementById('death').classList.remove('hidden');
    State.save();
    this.savePos();
  },

  respawn() {
    if (World.mode === 'dungeon') { World.dungeonKey = null; World.mode = 'overworld'; World.terrainCache.clear(); World.resources.clear(); World.regrowing.clear(); World.enemies = []; }
    World.player.hp = EXP.maxHp();
    World.player.x = 0; World.player.y = 2.5 * TILE;
    World.camera.x = World.player.x; World.camera.y = World.player.y;
    this.state = 'playing';
    document.getElementById('death').classList.add('hidden');
    document.getElementById('hud').classList.add('visible');
    this.updateBanner();
    this.toast('Você renasceu na cidade. O XP continua seu!');
  },

  savePos() {
    try {
      localStorage.setItem(this.SAVE_POS_KEY, JSON.stringify({
        x: World.player.x, y: World.player.y, mode: World.mode === 'overworld' ? 'o' : 'd', at: Date.now(),
      }));
    } catch (e) { }
  },

  /* ============================ INPUT ============================ */

  bind() {
    window.addEventListener('keydown', e => {
      const k = e.key;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(k)) e.preventDefault();
      this.keys[k] = true; audio();
      if (this.state === 'playing') {
        if (!this.paused) {
          if (k === ' ' || k === 'j' || k === 'J' || k === 'x' || k === 'X') Combat.tryAttack();
          if (k === 'e' || k === 'E') this.interact();
          if (k === 'p' || k === 'P') this.eatFood(false);
        }
        if (k === 'q' || k === 'Q') this.cycleStyle();
        if (k === 'b' || k === 'B' || k === 'c' || k === 'C' || k === 'Escape') this.toggleJournal();
      } else if (this.state === 'menu') { if (k === 'Enter' || k === ' ') this.startGame(); }
      else if (this.state === 'dead') { if (k === 'Enter' || k === ' ' || k === 'r' || k === 'R') this.respawn(); }
    });
    window.addEventListener('keyup', e => { this.keys[e.key] = false; });
    const cv = document.getElementById('cv');
    cv.addEventListener('mousedown', e => { if (this.state === 'playing' && !this.paused) { audio(); Combat.tryAttack(); } });

    // toque
    const joyzone = document.getElementById('joyzone'), joyEl = document.getElementById('joy');
    const onDown = (x, y, id) => {
      const r = joyzone.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom && !this.joy.active) {
        this.joy.active = true; this.joy.id = id; this.joy.ox = x; this.joy.oy = y;
        joyEl.style.left = x + 'px'; joyEl.style.top = y + 'px'; joyEl.style.display = 'block';
        this.joy.dx = 0; this.joy.dy = 0;
      }
    };
    const onMove = (x, y, id) => {
      if (this.joy.active && this.joy.id === id) {
        let dx = x - this.joy.ox, dy = y - this.joy.oy;
        const m = Math.hypot(dx, dy), mx = 55;
        if (m > mx) { dx = dx / m * mx; dy = dy / m * mx; }
        this.joy.dx = dx / mx; this.joy.dy = dy / mx;
      }
    };
    const onUp = id => { if (this.joy.active && this.joy.id === id) { this.joy.active = false; this.joy.dx = 0; this.joy.dy = 0; joyEl.style.display = 'none'; } };
    window.addEventListener('pointerdown', e => { this.usingTouch = true; this.showTouch(true); audio(); onDown(e.clientX, e.clientY, e.pointerId); });
    window.addEventListener('pointermove', e => onMove(e.clientX, e.clientY, e.pointerId));
    window.addEventListener('pointerup', e => onUp(e.pointerId));
    window.addEventListener('pointercancel', e => onUp(e.pointerId));
    const press = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('pointerdown', e => { e.stopPropagation(); audio(); fn(); }); };
    press('atkbtn', () => { if (this.state === 'playing' && !this.paused) Combat.tryAttack(); });
    press('usebtn', () => { if (this.state === 'playing' && !this.paused) this.interact(); });
    press('journalbtn', () => this.toggleJournal());
    document.getElementById('eatchip').addEventListener('click', () => this.eatFood(false));
    document.getElementById('hubchip').addEventListener('click', () => this.gotoHub());
    document.getElementById('playbtn').addEventListener('click', () => this.startGame());
    document.getElementById('hubbtn').addEventListener('click', () => this.gotoHub());
    document.getElementById('respawnbtn').addEventListener('click', () => this.respawn());
    document.getElementById('closejournal').addEventListener('click', () => this.toggleJournal());
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('visibilitychange', () => { if (document.hidden) { State.save(); this.savePos(); } });
    window.addEventListener('beforeunload', () => { State.save(); this.savePos(); });
  },

  gotoHub() { State.save(); this.savePos(); window.location.href = 'index.html'; },

  showTouch(v) { document.getElementById('touch').classList.toggle('visible', v && this.usingTouch); },

  moveAxis() {
    if (this.paused || this.state !== 'playing') return { ax: 0, ay: 0 };
    let ax = 0, ay = 0;
    const k = this.keys;
    if (k['ArrowLeft'] || k['a'] || k['A']) ax -= 1;
    if (k['ArrowRight'] || k['d'] || k['D']) ax += 1;
    if (k['ArrowUp'] || k['w'] || k['W']) ay -= 1;
    if (k['ArrowDown'] || k['s'] || k['S']) ay += 1;
    if (this.joy.active) { ax += this.joy.dx; ay += this.joy.dy; }
    const m = Math.hypot(ax, ay);
    if (m > 1) { ax /= m; ay /= m; }
    return { ax, ay };
  },

  cycleStyle() {
    const order = ['attack', 'strength', 'defense', 'ranged', 'magic'];
    const s = order[(order.indexOf(State.state.combatStyle) + 1) % order.length];
    State.state.combatStyle = s;
    // troca para a arma lembrada do estilo, se tiver
    const remembered = State.state.styleWeapons?.[s];
    if (remembered && State.count(remembered) > 0 && State.equippedItem('weapon') !== remembered) {
      const err = State.equip(remembered);
      if (!err) this.toast('Equipado: ' + GameData.name(remembered));
    }
    State.save();
    this.toast('Estilo: ' + EXP.styleName(s));
    this.updateHUD();
  },

  /* ============================ INTERAÇÃO [E] ============================ */

  nearestInteract() {
    const p = World.player;
    if (World.mode === 'dungeon') {
      const d = GameData.dungeons[World.dungeonKey];
      const dist = Math.hypot(p.x - (TILE / 2 + 6), p.y - (TILE / 2 + 6));
      if (dist < 60) return { label: '🚪 Sair — ' + (d?.display_name || ''), sub: World.dungeonKills >= 8 ? 'Run concluída (' + World.dungeonKills + ' abates)' : World.dungeonKills + '/8 abates para a run', action: () => Dungeons.exit(true) };
      return null;
    }
    // portal do hub
    if (Math.hypot(p.x - (World.PORTAL.x * TILE + 16), p.y - (World.PORTAL.y * TILE + 16)) < 52)
      return { label: '🌀 Voltar ao modo Hub (idle)', sub: 'mesmo herói, mesmo save', action: () => this.gotoHub() };
    // edifícios
    const ptx = Math.floor(p.x / TILE), pty = Math.floor(p.y / TILE);
    for (const b of World.BUILDINGS) {
      if (ptx >= b.x - 1 && ptx <= b.x + b.w && pty >= b.y - 1 && pty <= b.y + b.h) {
        if (b.key === 'shop') return { label: '🛒 ' + b.name, sub: 'comprar/vender', action: () => this.openJournalTab('shop') };
        if (b.key === 'church') return { label: '⛪ ' + b.name, sub: 'orações e bênçãos', action: () => this.openJournalTab('pray') };
        if (b.key === 'workshop') return { label: '🏗️ ' + b.name, sub: 'Construção e caravanas ficam no Hub', action: () => this.gotoHub() };
      }
    }
    // Slayer Master
    if (Math.hypot(p.x - (World.NPC_HOME.x * TILE + 16), p.y - (World.NPC_HOME.y * TILE + 16)) < 52)
      return { label: '🗡️ Mestre Slayer', sub: 'tarefas de caça', action: () => this.openJournalTab('slayer') };
    // plantações
    for (let i = 0; i < World.FARM_SPOTS.length; i++) {
      const s = World.FARM_SPOTS[i];
      if (Math.hypot(p.x - (s.x * TILE + 16), p.y - (s.y * TILE + 16)) < 40) {
        const patch = State.state.farmingPatches[i];
        if (i >= State.patchCount()) return { label: '🔒 Canteiro travado', sub: 'Agricultura 20/40 desbloqueia mais canteiros', action: () => { } };
        if (!patch) return { label: '🌾 Canteiro vazio', sub: 'plantar semente', action: () => this.openJournalTab('farm') };
        const crop = GameData.crops[patch.crop];
        if (Systems.cropReady(patch)) return { label: '🌾 Colher ' + crop.display_name, action: () => this.harvest(i + 1) };
        const left = Systems.patchTimeLeftMs(patch);
        return { label: '🌱 ' + crop.display_name + ' crescendo', sub: 'pronto em ' + Util.fmtTime(left), action: () => this.openJournalTab('farm') };
      }
    }
    // NPCs (roubo)
    let bestNpc = null, bd = 44;
    for (const npc of World.npcs) {
      const d = Math.hypot(npc.x - p.x, npc.y - p.y);
      if (d < bd) { bd = d; bestNpc = npc; }
    }
    if (bestNpc) return { label: '🥷 Furtar: ' + bestNpc.name, sub: 'Roubo ' + bestNpc.def.level_required + '+', action: () => Thieving.attempt(bestNpc) };
    // entradas de dungeon
    const gate = World.gateNear(p.x, p.y, 56);
    if (gate) {
      const d = GameData.dungeons[gate.key];
      const unlocked = State.dungeonUnlocked(gate.key);
      return {
        label: (unlocked ? '🏰 Entrar: ' : '🔒 Selada: ') + d.display_name,
        sub: 'nível recomendado ' + (d.recommended_level || 1) + (unlocked ? '' : ' — desbloqueie via expedições no Hub'),
        action: () => Dungeons.enter(gate),
      };
    }
    return null;
  },

  interact() {
    const it = this.nearestInteract();
    if (it) it.action();
  },

  harvest(patchNumber) {
    const r = Systems.harvestPatch(patchNumber);
    if (r.error) { this.toast(r.error); SFX.error(); return; }
    if (r.bean) { this.toast('🫘 Você subiu pelo pé de feijão — Cloud Kingdom desbloqueada!'); SFX.levelup(); this.flash('lvflash'); }
    else { this.toast('🌾 Colheita: +' + r.yield + ' ' + GameData.name(r.crop)); SFX.pickup(); }
    State.save();
  },

  /* ============================ COMIDA ============================ */

  bestFood() {
    let best = null;
    for (const [k, v] of Object.entries(State.state.inventory))
      if (GameData.isFood(k) && (!best || GameData.foodHeals[k] > GameData.foodHeals[best])) best = k;
    return best;
  },

  eatFood(auto) {
    const p = World.player;
    const key = this.bestFood();
    if (!key) { if (!auto) { this.toast('Sem comida! Cozinhe no Diário 🍳'); SFX.error(); } return; }
    if (p.hp >= EXP.maxHp()) { if (!auto) this.toast('HP cheio'); return; }
    State.removeItem(key, 1);
    p.hp = Math.min(EXP.maxHp(), p.hp + GameData.foodHeals[key]);
    if (World.mode === 'dungeon') World.dungeonFoodEaten++;
    if (!auto) { this.flash('healflash'); this.toast('🍖 ' + GameData.name(key) + ' +' + GameData.foodHeals[key] + ' HP'); SFX.buy(); }
  },

  /* ============================ AVISOS ============================ */

  toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    document.getElementById('toasts').appendChild(t);
    setTimeout(() => t.remove(), 2300);
  },
  flash(id) {
    const el = document.getElementById(id);
    el.style.opacity = '0.5';
    requestAnimationFrame(() => requestAnimationFrame(() => { el.style.opacity = '0'; }));
  },
  onLevelUp(skill, before, after) {
    this.toast('⭐ ' + EXP.skillName(skill) + ' nível ' + after + '!');
    this.flash('lvflash');
    SFX.levelup();
    if (skill === 'hitpoints') World.player.hp = Math.min(EXP.maxHp(), World.player.hp + 12);
  },

  /* ============================ HUD ============================ */

  updateBanner() {
    const el = document.getElementById('dungbanner');
    if (World.mode === 'dungeon') {
      const d = GameData.dungeons[World.dungeonKey];
      el.style.display = 'block';
      el.textContent = '🏰 ' + (d?.display_name || '') + ' · ' + World.dungeonKills + ' abates';
    } else el.style.display = 'none';
  },

  updateHUD() {
    const p = World.player; if (!p) return;
    const maxHp = EXP.maxHp();
    document.getElementById('hpfill').style.width = XU.clamp(p.hp / maxHp * 100, 0, 100) + '%';
    document.getElementById('hptext').textContent = Math.ceil(p.hp) + '/' + maxHp;
    document.getElementById('lvltext').textContent = 'Combate ' + EXP.combatLevel();
    const style = State.state.combatStyle;
    document.getElementById('stylename').textContent = EXP.styleName(style).toUpperCase();
    // barra de XP da skill principal do estilo
    const mainSkill = style === 'defense' ? 'defense' : style;
    const lvl = State.level(mainSkill), cur = State.xp(mainSkill);
    const nxt = lvl >= 99 ? cur : Sim.xpForLevel(lvl + 1), prv = Sim.xpForLevel(lvl);
    document.getElementById('xpfill').style.width = (lvl >= 99 ? 100 : XU.clamp((cur - prv) / (nxt - prv) * 100, 0, 100)) + '%';
    document.getElementById('ammotext').textContent =
      style === 'ranged' ? ('Flechas: ' + (EXP.bestArrow() ? State.count(EXP.bestArrow().key) : 0))
        : style === 'magic' ? (State.state.activeSpell ? GameData.spells[State.state.activeSpell].display_name : 'sem magia') : '';
    document.getElementById('scoretext').textContent = Util.fmt(State.state.coins);
    document.getElementById('stylechip').textContent = 'Estilo: ' + EXP.styleName(style) + ' [Q]';
    const inv = State.state.inventory;
    const countPred = pred => Object.entries(inv).reduce((s, [k, v]) => pred(k) ? s + v : s, 0);
    document.getElementById('rlog').textContent = countPred(k => k.includes('log'));
    document.getElementById('rore').textContent = countPred(k => k.endsWith('_ore') || k === 'rune_essence' || k === 'coal' || k === 'stone');
    document.getElementById('rfood').textContent = countPred(k => GameData.isFood(k));
    document.getElementById('rbone').textContent = countPred(k => k.includes('bone') || k.includes('ashes'));
    document.getElementById('rrune').textContent = countPred(k => k.endsWith('_rune'));
    // tarefa slayer
    const task = State.state.slayer?.activeTask;
    const tc = document.getElementById('taskchip');
    if (task) {
      const e = GameData.enemies[task.enemyKey];
      tc.textContent = '🗡️ Slayer: ' + (e ? e.display_name : task.enemyKey) + ' (' + task.killsCompleted + '/' + task.targetKills + ')';
    } else tc.textContent = '';
    // sessão do hub em andamento
    const sess = State.state.session;
    const sc = document.getElementById('sesschip');
    if (sess) {
      const left = (sess.endsAt || sess.startedAt + 3600000) - Date.now();
      sc.style.display = 'block';
      sc.textContent = '⏳ Sessão do Hub em andamento — colete no modo Hub (' + Util.fmtTime(left) + ')';
    } else sc.style.display = 'none';
    // prompt de interação
    const it = this.state === 'playing' && !this.paused ? this.nearestInteract() : null;
    this.interactTarget = it;
    const pr = document.getElementById('prompt');
    if (it) {
      pr.style.display = 'block';
      pr.innerHTML = '<b>[E]</b> ' + it.label + (it.sub ? '<small>' + it.sub + '</small>' : '');
    } else pr.style.display = 'none';
    if (World.mode === 'dungeon') {
      const d = GameData.dungeons[World.dungeonKey];
      document.getElementById('dungbanner').textContent = '🏰 ' + (d?.display_name || '') + ' · ' + World.dungeonKills + ' abates';
    }
  },

  /* ============================ DIÁRIO ============================ */

  TABS: [
    ['skills', 'Skills'], ['equip', 'Equipar'], ['forge', 'Forja'], ['fletch', 'Fletching'],
    ['craft', 'Crafting'], ['cook', 'Cozinha'], ['herb', 'Alquimia'], ['runes', 'Runas'],
    ['pray', 'Orações'], ['magic', 'Magias'], ['farm', 'Plantação'], ['slayer', 'Slayer'],
    ['shop', 'Loja'], ['codex', 'Codex'],
  ],

  toggleJournal() {
    if (this.state === 'menu' || this.state === 'dead') return;
    this.paused = !this.paused;
    document.getElementById('journal').classList.toggle('hidden', !this.paused);
    if (this.paused) {
      const active = document.querySelector('.tab.active');
      if (active) this.renderTab(active.dataset.id);
    }
  },
  closeJournal() { if (this.paused) this.toggleJournal(); },
  openJournalTab(id) {
    if (!this.paused) this.toggleJournal();
    this.selectTab(id);
  },

  buildTabs() {
    const el = document.getElementById('tabs');
    el.innerHTML = '';
    this.TABS.forEach((t, i) => {
      const b = document.createElement('div');
      b.className = 'tab' + (i === 0 ? ' active' : '');
      b.textContent = t[1]; b.dataset.id = t[0];
      b.onclick = () => this.selectTab(t[0]);
      el.appendChild(b);
    });
    document.getElementById('tabpages').innerHTML =
      this.TABS.map(t => '<div class="tabpage' + (t[0] !== 'skills' ? ' hidden' : '') + '" id="tab-' + t[0] + '"></div>').join('');
    this.renderTab('skills');
  },
  selectTab(id) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.id === id));
    document.querySelectorAll('.tabpage').forEach(p => p.classList.toggle('hidden', p.id !== 'tab-' + id));
    this.renderTab(id);
  },
  renderTab(id) {
    const el = document.getElementById('tab-' + id);
    if (!el) return;
    el.innerHTML = '';
    const fn = {
      skills: t => this.rSkills(t), equip: t => this.rEquip(t), forge: t => this.rForge(t),
      fletch: t => this.rRecipes(t, 'fletching'), craft: t => this.rRecipes(t, 'crafting'),
      cook: t => this.rCook(t), herb: t => this.rRecipes(t, 'herblore'), runes: t => this.rRunes(t),
      pray: t => this.rPray(t), magic: t => this.rMagic(t), farm: t => this.rFarm(t),
      slayer: t => this.rSlayer(t), shop: t => this.rShop(t), codex: t => this.rCodex(t),
    }[id];
    if (fn) fn(el);
  },

  rowEl(html) { const d = document.createElement('div'); d.className = 'row'; d.innerHTML = html; return d; },
  section(el, txt) { const d = document.createElement('div'); d.innerHTML = '<div class="section-head">' + txt + '</div>'; el.appendChild(d); return d; },

  /* ---- Skills ---- */
  rSkills(el) {
    this.section(el, 'Suas Skills — nível total ' + State.totalLevel() + ' / 2077 · salvas junto com o Hub');
    const bonus = State.blessingXpMultiplier(), boost = State.xpBoostActive();
    if (bonus > 1 || boost) {
      const info = this.rowEl('<span class="nm">' + (boost ? '⚡ Boost 2× XP ativo' : '🙏 Bênção ativa') + '</span><span class="side"><span class="ok">XP ×' + (bonus * (boost ? 2 : 1)).toFixed(2) + '</span></span>');
      el.appendChild(info);
    }
    for (const def of GameData.skillDefs) {
      const lvl = State.level(def.key), cur = State.xp(def.key);
      const nxt = lvl >= 99 ? cur : Sim.xpForLevel(lvl + 1), prv = Sim.xpForLevel(lvl);
      const pct = lvl >= 99 ? 100 : Math.round((cur - prv) / (nxt - prv) * 100);
      const pet = State.petBoost(def.key);
      const d = this.rowEl('<span class="nm">' + def.icon + ' ' + EXP.skillName(def.key) +
        ' <span class="catg">[' + (EXP.GROUP_PT[def.group] || def.group) + ']</span></span>' +
        '<span class="side"><span>Nv ' + lvl + '</span>' + (pet ? '<span class="ok">🐾+' + pet + '%</span>' : '') +
        '<div class="lvlbar"><i style="width:' + pct + '%"></i></div></span>');
      d.title = def.desc;
      el.appendChild(d);
    }
    const note = this.rowEl('<span class="nm">ℹ️ Construction, Mercantile e Agility (pistas)</span><span class="side"><span>melhores no Hub idle</span></span>');
    el.appendChild(note);
  },

  /* ---- Equipar ---- */
  rEquip(el) {
    const b = State.combatBonuses();
    this.section(el, 'Bônus totais — Atq +' + b.attack + ' · For +' + b.strength + ' · Def +' + b.defense +
      ' · Dist +' + b.rangedAttack + ' · Mag +' + b.magicAttack);
    const labels = { weapon: 'Arma', shield: 'Escudo', head: 'Elmo', body: 'Peitoral', legs: 'Pernas', boots: 'Botas', cape: 'Capa', ring: 'Anel', necklace: 'Colar', pickaxe: 'Picareta', axe: 'Machado', fishing_rod: 'Vara', hammer: 'Martelo', tinderbox: 'Isqueiro', grappling_hook: 'Gancho', frying_pan: 'Panela', lockpick: 'Gazua', hoe: 'Enxada' };
    for (const slot of [...State.SLOTS(), ...State.TOOL_SLOTS()]) {
      const key = State.equippedItem(slot);
      const eq = key ? GameData.equipment[key] : null;
      const stats = eq ? [
        eq.attack_bonus ? 'Atq ' + eq.attack_bonus : null, eq.strength_bonus ? 'For ' + eq.strength_bonus : null,
        eq.defense_bonus ? 'Def ' + eq.defense_bonus : null, eq.ranged_attack_bonus ? 'Dist ' + eq.ranged_attack_bonus : null,
        eq.magic_attack_bonus ? 'Mag ' + eq.magic_attack_bonus : null,
        eq[slot.split('_')[0] + '_efficiency'] ? '×' + eq[slot.split('_')[0] + '_efficiency'] : null,
      ].filter(Boolean).join(' · ') : '';
      const d = this.rowEl('<span class="nm">' + (eq ? '▫️ ' + eq.display_name : '▪️ ' + (labels[slot] || slot) + ' (vazio)') + '</span>' +
        '<span class="side">' + (stats ? '<span>' + stats + '</span>' : '') +
        (key ? '<button class="buybtn uneq">Desequipar</button>' : '') + '</span>');
      const btn = d.querySelector('button');
      if (btn) btn.onclick = () => { State.unequip(slot); State.save(); SFX.buy(); this.renderTab('equip'); };
      el.appendChild(d);
    }
    // equipáveis no inventário
    this.section(el, 'No inventário');
    const owned = Object.entries(State.state.inventory).filter(([k]) => GameData.equipment[k]);
    if (!owned.length) { el.appendChild(this.rowEl('<span class="nm" style="color:var(--muted)">Nada equipável — forje na Forja ou compre na Loja</span>')); return; }
    for (const [key] of owned) {
      const eq = GameData.equipment[key];
      const ok = State.meetsRequirements(key);
      const d = this.rowEl('<span class="nm">' + eq.display_name + ' <span class="catg">[' + (labels[eq.slot] || eq.slot) + ']</span></span>' +
        '<span class="side">' + (ok ? '<button class="buybtn equip">Equipar</button>' : '<span class="lock">Requisitos insuficientes</span>') + '</span>');
      const btn = d.querySelector('button');
      if (btn) btn.onclick = () => {
        const err = State.equip(key);
        if (err) { this.toast(err); SFX.error(); } else { SFX.buy(); this.toast('Equipado: ' + eq.display_name); }
        State.save(); this.renderTab('equip');
      };
      el.appendChild(d);
    }
  },

  /* ---- Receitas genéricas (smithing/fletching/crafting/herblore) ---- */
  rForge(el) {
    const all = Object.entries(GameData.recipes.smithing);
    this.rRecipeList(el, 'smithing', all.filter(([, r]) => r.type === 'bar'), '🟨 Fundir barras');
    this.rRecipeList(el, 'smithing', all.filter(([, r]) => r.type === 'equipment'), '⚔️ Forjar equipamento');
    this.rRecipeList(el, 'smithing', all.filter(([, r]) => r.type === 'tool'), '🛠️ Ferramentas (picaretas, machados…)');
  },
  rRecipes(el, skill) {
    const all = Object.entries(GameData.recipes[skill]);
    const titles = {
      fletching: '🏹 Fletching — arcos, bestas e flechas', crafting: '💎 Crafting — joias e vidro',
      herblore: '🧪 Herbologia — poções de combate',
    };
    this.rRecipeList(el, skill, all, titles[skill] || skill);
  },
  rRecipeList(el, skill, entries, title) {
    if (!entries.length) return;
    this.section(el, title);
    for (const [outKey, r] of entries.sort((a, b) => (a[1].level_required || 0) - (b[1].level_required || 0))) {
      const lvlOk = State.level(skill) >= (r.level_required || 1);
      const matsOk = Object.entries(r.materials || {}).every(([m, n]) => State.count(m) >= n);
      const matsHtml = Object.entries(r.materials || {}).map(([m, n]) =>
        '<span class="' + (State.count(m) >= n ? 'ok' : 'lock') + '">' + n + '× ' + GameData.name(m) + '</span>').join(' ');
      const outName = GameData.name(outKey);
      const d = this.rowEl('<span class="nm">' + outName + ' <span class="catg">Nv ' + (r.level_required || 1) + (r.output_quantity > 1 ? ' · x' + r.output_quantity : '') + '</span></span>' +
        '<span class="side">' + matsHtml + '<button class="buybtn' + (lvlOk && matsOk ? '' : ' disabled') + '">Criar</button></span>');
      d.querySelector('button').onclick = () => {
        if (!lvlOk || !matsOk) { SFX.error(); return; }
        for (const [m, n] of Object.entries(r.materials || {})) State.removeItem(m, n);
        State.addItem(outKey, r.output_quantity || 1);
        XPGain.withPet(skill, r.xp_per_item || 0);
        QuestFeed.craft(skill, outKey, r.output_quantity || 1);
        Systems.recordGuildCrafting?.(skill, { [outKey]: r.output_quantity || 1 });
        SFX.buy(); State.save(); this.renderTab(document.querySelector('.tab.active').dataset.id);
      };
      el.appendChild(d);
    }
  },

  /* ---- Cozinha ---- */
  rCook(el) {
    this.section(el, '🍳 Cozinhar — comida cura HP (P come a melhor)');
    for (const [key, r] of Object.entries(GameData.recipes.cooking).sort((a, b) => a[1].level_required - b[1].level_required)) {
      const lvlOk = State.level('cooking') >= r.level_required;
      const has = State.count(r.raw_item) > 0;
      const d = this.rowEl('<span class="nm">🍖 ' + r.display_name + ' <span class="catg">Nv ' + r.level_required + ' · +' + r.healing_value + ' HP</span></span>' +
        '<span class="side"><span class="' + (has ? 'ok' : 'lock') + '">' + State.count(r.raw_item) + '× ' + GameData.name(r.raw_item) + '</span>' +
        '<button class="buybtn' + (lvlOk && has ? '' : ' disabled') + '">Cozinhar</button></span>');
      d.querySelector('button').onclick = () => {
        if (!lvlOk || !has) { SFX.error(); return; }
        State.removeItem(r.raw_item, 1);
        State.addItem(r.cooked_item, 1);
        XPGain.withPet('cooking', r.xp_per_item);
        QuestFeed.craft('cooking', r.cooked_item, 1);
        Systems.recordGuildCrafting?.('cooking', { [r.cooked_item]: 1 });
        SFX.buy(); State.save(); this.renderTab('cook');
      };
      el.appendChild(d);
    }
    // fogueira
    this.section(el, '🔥 Fogueira — queimar toras por XP e cinzas (Oração)');
    for (const [logKey, log] of Object.entries(GameData.logs)) {
      const ashKey = GameData.ashByLog[logKey];
      if (!ashKey) continue;
      const lvlOk = State.level('firemaking') >= log.level_required;
      const has = State.count(logKey) > 0;
      const d = this.rowEl('<span class="nm">🔥 ' + GameData.name(logKey) + ' <span class="catg">Nv ' + log.level_required + ' → ' + GameData.name(ashKey) + '</span></span>' +
        '<span class="side"><span class="' + (has ? 'ok' : 'lock') + '">' + State.count(logKey) + '×</span>' +
        '<button class="buybtn' + (lvlOk && has ? '' : ' disabled') + '">Queimar</button></span>');
      d.querySelector('button').onclick = () => {
        if (!lvlOk || !has) { SFX.error(); return; }
        const eff = State.toolEfficiency('tinderbox', 'firemaking', log.level_required);
        State.removeItem(logKey, 1);
        State.addItem(ashKey, 1);
        XPGain.withPet('firemaking', Math.floor(log.xp_per_log * eff));
        QuestFeed.craft('firemaking', ashKey, 1);
        SFX.buy(); State.save(); this.renderTab('cook');
      };
      el.appendChild(d);
    }
  },

  /* ---- Runas ---- */
  rRunes(el) {
    this.section(el, '🔮 Runecrafting — essência rúnica (minere rochas roxas) em runas');
    const lvl = State.level('runecrafting');
    const mult = lvl >= 75 ? 3 : lvl >= 50 ? 2 : 1;
    el.appendChild(this.rowEl('<span class="nm">Multiplicador atual</span><span class="side"><span class="' + (mult > 1 ? 'ok' : '') + '">×' + mult + (mult > 1 ? '' : ' (×2 no nv 50, ×3 no 75)') + '</span></span>'));
    for (const [key, r] of Object.entries(GameData.runes).sort((a, b) => a[1].level_required - b[1].level_required)) {
      const lvlOk = lvl >= r.level_required;
      const cost = r.essence_cost || 1;
      const has = State.count('rune_essence') >= cost;
      const d = this.rowEl('<span class="nm">🔮 ' + r.display_name + ' <span class="catg">Nv ' + r.level_required + ' → ' + mult + ' runa' + (mult > 1 ? 's' : '') + '</span></span>' +
        '<span class="side"><span class="' + (has ? 'ok' : 'lock') + '">' + cost + '× Essência (' + State.count('rune_essence') + ')</span>' +
        '<button class="buybtn' + (lvlOk && has ? '' : ' disabled') + '">Criar</button></span>');
      d.querySelector('button').onclick = () => {
        if (!lvlOk || !has) { SFX.error(); return; }
        State.removeItem('rune_essence', cost);
        State.addItem(key, mult);
        XPGain.withPet('runecrafting', Math.floor((r.xp_per_rune || 5) * mult));
        QuestFeed.craft('runecrafting', key, mult);
        SFX.buy(); State.save(); this.renderTab('runes');
      };
      el.appendChild(d);
    }
  },

  /* ---- Orações ---- */
  rPray(el) {
    const bless = State.activeBlessing();
    this.section(el, '🙏 Dispersar ossos e cinzas — Prayer');
    if (bless) {
      const left = State.state.church.blessingExpiresAt - Date.now();
      el.appendChild(this.rowEl('<span class="nm">✨ Bênção ativa: ' + GameData.blessingName(bless) + '</span>' +
        '<span class="side"><span class="ok">' + bless.type + ' · ' + Util.fmtTime(left) + '</span></span>'));
    } else {
      el.appendChild(this.rowEl('<span class="nm" style="color:var(--muted)">Sem bênção — ative na Igreja do Hub ( ⛪ aba Town )</span>'));
    }
    for (const b of EXP.BONES) {
      const have = State.count(b.key);
      if (!have) continue;
      const mk = (label, n) => {
        const d = this.rowEl('<span class="nm">🦴 ' + b.name + ' <span class="catg">+' + b.xp + ' XP' + (b.ash ? ' (cinza)' : '') + '</span></span>' +
          '<span class="side"><span class="ok">' + have + '×</span><button class="buybtn' + (have >= n ? '' : ' disabled') + '">' + label + '</button></span>');
        d.querySelector('button').onclick = () => {
          const qty = Math.min(n, State.count(b.key));
          if (qty < 1) { SFX.error(); return; }
          State.removeItem(b.key, qty);
          XPGain.withPet('prayer', b.xp * qty);
          QuestFeed.scatter(qty);
          Systems.recordGuildPrayer?.(qty);
          SFX.buy(); State.save(); this.renderTab('pray');
        };
        return d;
      };
      el.appendChild(mk('Dispersar', 1));
      if (have >= 10) { const d10 = mk('×10', 10); d10.querySelector('.nm').style.opacity = 0; d10.querySelector('span.side span').remove(); el.replaceChild(mk('Dispersar ×10', 10), d10); }
      if (have >= 50) el.appendChild(mk('Dispersar tudo', 9999));
    }
    if (!EXP.BONES.some(b => State.count(b.key) > 0))
      el.appendChild(this.rowEl('<span class="nm" style="color:var(--muted)">Sem ossos/cinzas — mate inimigos ou queime toras</span>'));
  },

  /* ---- Magias ---- */
  rMagic(el) {
    this.section(el, '✨ Magias — selecione a ativa (estilo Magia [Q])');
    for (const s of EXP.SPELLS) {
      const on = State.state.activeSpell === s.key;
      const lvlOk = State.level('magic') >= s.lvl;
      const runes = State.count(s.rune);
      const d = this.rowEl('<span class="nm">' + (on ? '★ ' : '') + s.name + ' <span class="catg">Nv ' + s.lvl + '</span></span>' +
        '<span class="side"><span>Máx ' + s.max + '</span>' +
        '<span class="' + (runes >= s.cost ? 'ok' : 'lock') + '">' + s.cost + '× ' + GameData.name(s.rune) + '</span>' +
        '<button class="buybtn' + (on ? ' equip' : '') + (lvlOk ? '' : ' disabled') + '">' + (on ? 'Ativa' : 'Usar') + '</button></span>');
      d.querySelector('button').onclick = () => {
        if (!lvlOk) { SFX.error(); return; }
        State.state.activeSpell = s.key; SFX.buy(); State.save();
        this.renderTab('magic'); this.updateHUD();
      };
      el.appendChild(d);
    }
  },

  /* ---- Plantação ---- */
  rFarm(el) {
    this.section(el, '🌾 Canteiros — em tempo real (também no mundo, ao sul da cidade)');
    const n = State.patchCount();
    for (let i = 1; i <= 5; i++) {
      const patch = State.state.farmingPatches[i - 1];
      if (i > n) { el.appendChild(this.rowEl('<span class="nm">🔒 Canteiro ' + i + '</span><span class="side"><span class="lock">Agricultura ' + (i === 4 ? 20 : 40) + '</span></span>')); continue; }
      if (!patch) {
        el.appendChild(this.rowEl('<span class="nm">▫️ Canteiro ' + i + ' vazio</span><span class="side"><span class="ok">plante abaixo</span></span>'));
        continue;
      }
      const crop = GameData.crops[patch.crop];
      if (Systems.cropReady(patch)) {
        const d = this.rowEl('<span class="nm">🌾 ' + crop.display_name + ' pronto!</span><span class="side"><button class="buybtn equip">Colher</button></span>');
        d.querySelector('button').onclick = () => { this.harvest(i); this.renderTab('farm'); };
        el.appendChild(d);
      } else {
        el.appendChild(this.rowEl('<span class="nm">🌱 ' + crop.display_name + ' (' + (patch.fert ? 'com cinza' : 'sem cinza') + ')</span><span class="side"><span>' + Util.fmtTime(Systems.patchTimeLeftMs(patch)) + '</span></span>'));
      }
    }
    // semear
    this.section(el, 'Semear (sementes no inventário)');
    let any = false;
    const emptyIdx = (() => { for (let i = 0; i < n; i++) if (!State.state.farmingPatches[i]) return i; return -1; })();
    for (const [cropId, crop] of Object.entries(GameData.crops)) {
      const seedKey = crop.seed_name || cropId;
      const have = State.count(seedKey);
      if (have < 1) continue;
      any = true;
      const lvlOk = State.level('farming') >= (crop.farming_level_required || 1);
      const hasAsh = Object.keys(Systems.ASH_YIELD).some(k => State.count(k) > 0);
      const d = this.rowEl('<span class="nm">' + (crop.emoji || '🌱') + ' ' + crop.display_name + ' <span class="catg">Nv ' + (crop.farming_level_required || 1) + ' · ' + crop.growth_time_hours + 'h</span></span>' +
        '<span class="side"><span class="ok">' + have + '× sementes</span>' +
        (emptyIdx >= 0 ? '<button class="buybtn' + (lvlOk ? '' : ' disabled') + '">Plantar</button>' +
          (hasAsh ? '<button class="buybtn equip' + (lvlOk ? '' : ' disabled') + '">+ Cinzas</button>' : '') : '<span class="lock">sem canteiro livre</span>') +
        '</span>');
      const btns = d.querySelectorAll('button');
      if (btns[0]) btns[0].onclick = () => this.plant(emptyIdx + 1, cropId, false);
      if (btns[1]) btns[1].onclick = () => this.plant(emptyIdx + 1, cropId, true);
      el.appendChild(d);
    }
    if (!any) el.appendChild(this.rowEl('<span class="nm" style="color:var(--muted)">Sem sementes — compre na Loja 🛒 ou furte camponeses</span>'));
  },
  plant(patchNumber, cropId, useAsh) {
    const r = Systems.plantCrop(patchNumber, cropId, useAsh);
    if (r.error) { this.toast(r.error); SFX.error(); return; }
    this.toast('🌱 Plantado!'); SFX.buy(); this.renderTab('farm');
  },

  /* ---- Slayer ---- */
  rSlayer(el) {
    this.section(el, '🗡️ Mestre Slayer — pontos: ' + (State.state.slayer?.points || 0));
    const task = State.state.slayer?.activeTask;
    if (task) {
      const e = GameData.enemies[task.enemyKey];
      el.appendChild(this.rowEl('<span class="nm">⚔️ Tarefa: ' + task.targetKills + '× ' + (e ? e.display_name : task.enemyKey) +
        '</span><span class="side"><span class="ok">' + task.killsCompleted + '/' + task.targetKills + '</span>' +
        '<span>+' + task.xpPerKill + ' XP/abate</span><span>' + task.taskPoints + ' pts</span></span>'));
      el.appendChild(this.rowEl('<span class="nm" style="color:var(--muted)">Inimigos da tarefa aparecem no mundo e nas dungeons</span>'));
    } else {
      const d = this.rowEl('<span class="nm">⚔️ Nova tarefa</span><span class="side"><button class="buybtn">Aceitar</button></span>');
      d.querySelector('button').onclick = () => {
        const r = Systems.assignTask();
        if (r.error) { this.toast(r.error); SFX.error(); } else { SFX.buy(); this.renderTab('slayer'); }
      };
      el.appendChild(d);
    }
    const d2 = this.rowEl('<span class="nm">🔮 Prever próxima (ossos)</span><span class="side"><button class="buybtn">Prever</button></span>');
    d2.querySelector('button').onclick = () => {
      const r = Systems.foretelTask();
      if (r.error) { this.toast(r.error); SFX.error(); } else { SFX.buy(); this.renderTab('slayer'); }
    };
    el.appendChild(d2);
    const d3 = this.rowEl('<span class="nm">⏭️ Abandonar tarefa (' + Systems.SLAYER_SKIP_COST + ' pts)</span><span class="side"><button class="buybtn">Abandonar</button></span>');
    d3.querySelector('button').onclick = () => {
      const r = Systems.skipTask();
      if (r.error) { this.toast(r.error); SFX.error(); } else { this.renderTab('slayer'); }
    };
    el.appendChild(d3);
    // loja de pontos
    this.section(el, 'Loja de pontos Slayer');
    for (const entry of (Systems.SLAYER_SHOP || [])) {
      const can = (State.state.slayer?.points || 0) >= entry.cost;
      const name = entry.xp ? ('Lâmpada de XP (' + Util.fmt(entry.xp) + ')' ) : GameData.name(entry.key);
      const d = this.rowEl('<span class="nm">🏅 ' + name + '</span><span class="side"><span>' + entry.cost + ' pts</span>' +
        '<button class="buybtn' + (can ? '' : ' disabled') + '">Comprar</button></span>');
      d.querySelector('button').onclick = () => {
        const skill = entry.xp ? State.state.combatStyle : null;
        const r = Systems.buySlayerItem(entry.key, skill);
        if (r.error) { this.toast(r.error); SFX.error(); } else { SFX.buy(); this.renderTab('slayer'); }
      };
      el.appendChild(d);
    }
  },

  /* ---- Loja ---- */
  rShop(el) {
    this.section(el, '🛒 Comprar — moedas: ' + Util.fmt(State.state.coins));
    for (const [catKey, cat] of Object.entries(GameData.marketplace)) {
      this.section(el, cat.category_name || catKey);
      for (const [key, item] of Object.entries(cat.items).slice(0, 40)) {
        const price = item.price ?? 0;
        const can = State.state.coins >= price;
        const d = this.rowEl('<span class="nm">' + item.display_name + ' <span class="catg">' + (item.description || '').slice(0, 42) + '</span></span>' +
          '<span class="side"><span class="' + (can ? 'ok' : 'lock') + '">' + Util.fmt(price) + ' 🪙</span>' +
          '<button class="buybtn' + (can ? '' : ' disabled') + '" data-q="1">×1</button>' +
          (State.state.coins >= price * 10 ? '<button class="buybtn' + (can ? '' : ' disabled') + '" data-q="10">×10</button>' : '') +
          '</span>');
        d.querySelectorAll('button').forEach(btn => btn.onclick = () => {
          const r = Engine.buy(key, +btn.dataset.q);
          if (r.error) { this.toast(r.error); SFX.error(); } else { SFX.buy(); }
          this.renderTab('shop');
        });
        el.appendChild(d);
      }
    }
    // boost de XP
    this.section(el, '⚡ Extras');
    const boost = Engine.XP_BOOST;
    const d = this.rowEl('<span class="nm">⚡ Boost 2× XP por 48h</span><span class="side"><span class="' + (State.state.coins >= boost.price ? 'ok' : 'lock') + '">' + Util.fmt(boost.price) + ' 🪙</span>' +
      (State.xpBoostActive() ? '<span class="ok">ativo</span>' : '<button class="buybtn">Ativar</button>') + '</span>');
    const bbtn = d.querySelector('button');
    if (bbtn) bbtn.onclick = () => {
      const r = Engine.buyXpBoost();
      if (r.error) { this.toast(r.error); SFX.error(); } else { this.toast('⚡ 2× XP ativado!'); SFX.levelup(); }
      this.renderTab('shop');
    };
    el.appendChild(d);
    // vender
    this.section(el, '💰 Vender (equipped não aparece)');
    const sellable = Object.entries(State.state.inventory)
      .filter(([k, v]) => !Object.values(State.state.equipped).includes(k))
      .sort((a, b) => Engine.sellPrice(b[0]) * b[1] - Engine.sellPrice(a[0]) * a[1]);
    if (!sellable.length) el.appendChild(this.rowEl('<span class="nm" style="color:var(--muted)">Nada para vender</span>'));
    for (const [key, qty] of sellable.slice(0, 40)) {
      const price = Engine.sellPrice(key);
      const d = this.rowEl('<span class="nm">' + GameData.name(key) + ' ×' + qty + '</span>' +
        '<span class="side"><span class="ok">' + price + ' 🪙/un</span>' +
        '<button class="buybtn" data-q="1">Vender 1</button><button class="buybtn" data-q="all">Tudo</button></span>');
      d.querySelectorAll('button').forEach(btn => btn.onclick = () => {
        const r = Engine.sell(key, btn.dataset.q === 'all' ? qty : 1);
        if (r.error) { this.toast(r.error); SFX.error(); } else { SFX.gold(); }
        this.renderTab('shop');
      });
      el.appendChild(d);
    }
  },

  /* ---- Codex ---- */
  rCodex(el) {
    this.section(el, '🏰 Dungeons (' + Object.keys(GameData.dungeons).length + ') — entre pelos portais no mundo');
    for (const d of GameData.dungeonList()) {
      const unlocked = State.dungeonUnlocked(d.name);
      const runs = State.state.stats.dungeonRuns?.[d.name] || 0;
      const pool = (d.enemy_spawns || []).map(s => GameData.enemies[s.enemy]?.display_name || s.enemy).slice(0, 4).join(', ');
      const el2 = this.rowEl('<span class="nm">' + (unlocked ? '🏰' : '🔒') + ' ' + d.display_name +
        ' <span class="catg">Nv ' + (d.recommended_level || 1) + (d.safe_zone ? ' · segura' : '') + '</span></span>' +
        '<span class="side"><span class="' + (unlocked ? 'ok' : 'lock') + '">' + (unlocked ? runs + ' runs' : 'selada') + '</span></span>' +
        '<div class="dsc">' + (d.description || '') + '<br><i>' + pool + '</i></div>');
      el.appendChild(el2);
    }
    this.section(el, '🐉 Bosses de raid — desafie por aqui');
    for (const r of EXP.RAIDS) {
      const kills = State.state.stats.bossKillsByBoss?.[r.key] || 0;
      const ok = EXP.combatLevel() >= r.combat_level_required - 10;
      const d = this.rowEl('<span class="nm">' + (r.emoji || '🐉') + ' ' + r.display_name + ' <span class="catg">Combate ' + r.combat_level_required + '+</span></span>' +
        '<span class="side"><span>' + r.hp + ' HP</span><span>' + kills + ' abates</span>' +
        '<button class="buybtn' + (ok ? '' : ' disabled') + '">Desafiar</button></span>' +
        '<div class="dsc">' + (r.description || '') + '</div>');
      d.querySelector('button').onclick = () => Dungeons.challenge(r.key);
      el.appendChild(d);
    }
    this.section(el, '🗡️ Bestiário (' + Object.keys(GameData.enemies).length + ')');
    for (const [key, e] of Object.entries(GameData.enemies)) {
      const kills = State.state.stats.killsByEnemy?.[key] || 0;
      el.appendChild(this.rowEl('<span class="nm">🗡️ ' + e.display_name + '</span><span class="side"><span>' + e.hp + ' HP</span><span>' + (e.xp_drops?.combat || 0) + ' XP</span><span>' + kills + ' abates</span></span>'));
    }
  },

  /* ============================ LOOP ============================ */

  resize() {
    const cv = document.getElementById('cv');
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.screenW = window.innerWidth; this.screenH = window.innerHeight;
    cv.width = Math.floor(this.screenW * this.dpr);
    cv.height = Math.floor(this.screenH * this.dpr);
    cv.style.width = this.screenW + 'px';
    cv.style.height = this.screenH + 'px';
  },

  _lastHud: 0,
  loop(now) {
    requestAnimationFrame(t => this.loop(t));
    let dt = now - (this._last || now); this._last = now;
    if (dt > 100) dt = 100;
    this._acc = (this._acc || 0) + dt;
    const STEP = 1000 / 60;
    while (this._acc >= STEP) {
      if (this.state === 'playing' && !this.paused) worldUpdate(STEP / 1000);
      this._acc -= STEP;
    }
    if (this.state !== 'menu') this.render();
    // HUD ~10x/s, autosave 8s
    if (now - this._lastHud > 100 && this.state === 'playing') { this._lastHud = now; this.updateHUD(); }
    this._saveT += dt;
    if (this._saveT > 8000 && this.state === 'playing') { this._saveT = 0; State.save(); this.savePos(); }
  },

  /* ============================ RENDER ============================ */

  render() {
    const cv = document.getElementById('cv');
    const ctx = cv.getContext('2d');
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, this.screenW, this.screenH);
    const p = World.player; if (!p) return;
    const cx = World.camera.x + World.camera.sx, cy = World.camera.y + World.camera.sy;
    const ox = Math.floor(cx - this.screenW / 2), oy = Math.floor(cy - this.screenH / 2);
    const tx0 = Math.floor(ox / TILE) - 1, tx1 = Math.floor((ox + this.screenW) / TILE) + 1;
    const ty0 = Math.floor(oy / TILE) - 1, ty1 = Math.floor((oy + this.screenH) / TILE) + 1;
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) this.drawTile(ctx, tx, ty, ox, oy);
    // recursos (só overworld)
    if (World.mode === 'overworld') {
      for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
        const key = tx + ',' + ty;
        const res = World.resources.get(key);
        if (res) this.drawResource(ctx, res, ox, oy);
        else if (World.regrowing.has(key)) {
          const ra = World.resourceAt(tx, ty);
          if (ra && ra.kind === 'tree') this.drawSprite(ctx, this.treeSprite(EXP.TREE_COLORS[EXP.TREES[ra.id].key], true), tx * TILE + TILE / 2, ty * TILE + TILE / 2, ox, oy, 0.7);
        }
      }
      this.drawTown(ctx, ox, oy);
      this.drawGates(ctx, ox, oy);
      for (const npc of World.npcs) this.drawEnemy(ctx, npc, ox, oy, '#8fd8ff');
    } else {
      // saída da dungeon
      this.drawSprite(ctx, this.portalSpr, TILE / 2 + 6, TILE / 2 + 6, ox, oy, 1);
      const t = '🚪 SAÍDA';
      ctx.font = 'bold 11px "Courier New"'; ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd97a'; ctx.fillText(t, TILE / 2 + 6 - ox, TILE / 2 - 26 - oy);
    }
    for (const e of World.enemies) this.drawEnemy(ctx, e, ox, oy);
    for (const e of World.bosses) this.drawEnemy(ctx, e, ox, oy, '#f6c453');
    this.drawPlayer(ctx, ox, oy);
    for (const pr of World.projectiles) {
      ctx.fillStyle = pr.color;
      ctx.beginPath(); ctx.arc(pr.x - ox, pr.y - oy, 4, 0, 7); ctx.fill();
    }
    for (const pa of World.particles) {
      ctx.globalAlpha = XU.clamp(pa.life * 2, 0, 1);
      ctx.fillStyle = pa.color;
      ctx.fillRect(pa.x - ox - pa.size / 2, pa.y - oy - pa.size / 2, pa.size, pa.size);
    }
    ctx.globalAlpha = 1;
    for (const f of World.floats) {
      ctx.globalAlpha = XU.clamp(f.life * 1.5, 0, 1);
      ctx.font = 'bold 13px "Courier New", monospace'; ctx.textAlign = 'center';
      ctx.fillStyle = '#000'; ctx.fillText(f.text, f.x - ox + 1, f.y - oy + 1);
      ctx.fillStyle = f.color; ctx.fillText(f.text, f.x - ox, f.y - oy);
    }
    ctx.globalAlpha = 1;
    this.drawMinimap(ctx);
  },

  drawTile(ctx, tx, ty, ox, oy) {
    const x = tx * TILE - ox, y = ty * TILE - oy;
    if (x < -TILE || y < -TILE || x > this.screenW + TILE || y > this.screenH + TILE) return;
    const t = World.terrainAt(tx, ty);
    const v = hash2(tx, ty);
    if (World.mode === 'dungeon') {
      if (t === TERRAIN.WATER) { // parede rochosa
        ctx.fillStyle = v < 0.5 ? '#2a2f3d' : '#232733'; ctx.fillRect(x, y, TILE, TILE);
        if (v < 0.22) { ctx.fillStyle = '#39404f'; ctx.fillRect(x + 6 + v * 10, y + 8, 8, 5); }
        ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(x, y + TILE - 4, TILE, 4);
      } else if (t === TERRAIN.SAND) {
        ctx.fillStyle = v < 0.5 ? '#6a5a3f' : '#5f5138'; ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = 'rgba(246,196,83,.15)'; ctx.fillRect(x, y, TILE, TILE);
      } else {
        ctx.fillStyle = v < 0.12 ? '#40465a' : (v > 0.88 ? '#4a5168' : '#454b5e');
        ctx.fillRect(x, y, TILE, TILE);
        if (v > 0.93) { ctx.fillStyle = '#3a4052'; ctx.fillRect(x + 8 + v * 8, y + 10, 6, 4); }
      }
      return;
    }
    if (t === TERRAIN.WATER) {
      ctx.fillStyle = (Math.sin(World.time * 1.6 + tx * 0.6 + ty * 0.4) > 0) ? '#3a86c8' : '#3378b5';
      ctx.fillRect(x, y, TILE, TILE);
      if (hash2(tx, ty) < 0.2) { ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x + hash2(tx, ty + 9) * 20 + 4, y + hash2(tx + 4, ty) * 20 + 4, 6, 2); }
    } else {
      const inTown = World.inTown(tx, ty);
      let base = t === TERRAIN.SAND ? '#e5cd97' : t === TERRAIN.GRASS2 ? '#4f9545' : '#5aa04c';
      if (inTown) base = '#6aa85a';
      ctx.fillStyle = v < 0.12 ? shadeColor2(base, -8) : (v > 0.88 ? shadeColor2(base, 8) : base);
      ctx.fillRect(x, y, TILE, TILE);
      if (inTown && Math.abs(tx) + Math.abs(ty) < 11 && (tx + ty) % 2 === 0) {
        ctx.fillStyle = 'rgba(160,150,140,.35)'; ctx.fillRect(x + 3, y + 3, TILE - 6, TILE - 6);
      }
      if (t === TERRAIN.SAND) {
        if (v < 0.3) { ctx.fillStyle = 'rgba(150,120,70,0.5)'; ctx.fillRect(x + 8 + hash2(tx, ty) * 16, y + 10 + hash2(tx + 3, ty) * 16, 2, 2); }
      } else if (!inTown) {
        const d = hash2(tx * 3 + 1, ty * 5 + 2);
        if (d < 0.25) {
          ctx.fillStyle = 'rgba(20,40,15,0.35)';
          const gx = x + hash2(tx, ty) * 24 + 4, gy = y + hash2(tx + 7, ty) * 24 + 4;
          ctx.fillRect(gx, gy, 1, 4); ctx.fillRect(gx - 2, gy + 2, 1, 3); ctx.fillRect(gx + 2, gy + 2, 1, 3);
        } else if (d > 0.92) {
          ctx.fillStyle = ['#e8e0d0', '#f2d5a0', '#d3a7d3'][Math.floor(hash2(tx, ty + 3) * 3)];
          ctx.fillRect(x + hash2(tx + 1, ty) * 22 + 5, y + hash2(tx + 5, ty) * 22 + 5, 2, 2);
        }
      }
    }
  },

  drawSprite(ctx, spr, wx, wy, ox, oy, alpha) {
    ctx.globalAlpha = alpha || 1;
    ctx.drawImage(spr, wx - spr.width * SCALE / 2 - ox, wy - spr.height * SCALE / 2 - oy, spr.width * SCALE, spr.height * SCALE);
    ctx.globalAlpha = 1;
  },

  treeCache: {}, rockCache: {},
  treeSprite(color, stump) {
    const key = color + (stump ? 's' : '');
    if (this.treeCache[key]) return this.treeCache[key];
    const rows = stump ? ["....tttttttt....", "....ttTTTTtt....", "....ttTTTTtt....", ".....tttttt....."] : [".....ggggg......", "...ggGGGGGGg....", "..gGGGGGGGGGGg..", ".gGGGGGGGGGGGGg.", ".GGGDDGGGGGDGGG.", "gGGDDDGGGGDDDGGg", "gGGGGGGGGGGGGGGg", "gGGGGGGGGGGGGGGg", "..gGGGGGGGGGGg..", "...gGGGGGGGGg...", ".....gggggg.....", "......TTTT......", "......TTTT......", ".....TTTTTT.....", ".....TTTTTT.....", "....tttttttt...."];
    const pal = { G: color, g: shadeColor2(color, -18), D: shadeColor2(color, 22), T: '#7a4f2a', t: '#5b3a1e' };
    this.treeCache[key] = makeSprite(rows, pal);
    return this.treeCache[key];
  },
  rockSprite(oreColor) {
    if (this.rockCache[oreColor]) return this.rockCache[oreColor];
    const rows = ["......RRR.......", "....RRRRRRR.....", "...RRRRRRRRR....", "..RRRrrrRRRRR...", ".RRRrrOOrrRRRR..", ".RRRrOOOOrRRRR..", ".RRrrOOOOrRRRR..", ".RRrrrOOrrRRRR..", "..RRrrrrRRRRR...", "...RRRRRRRRRR...", "....RRRRRRRR....", "......RRRR......"];
    const pal = { R: '#8b97a3', r: '#6b7683', O: oreColor, o: shadeColor2(oreColor, -25) };
    this.rockCache[oreColor] = makeSprite(rows, pal);
    return this.rockCache[oreColor];
  },

  drawResource(ctx, res, ox, oy) {
    let spr;
    if (res.kind === 'tree') spr = this.treeSprite(EXP.TREE_COLORS[EXP.TREES[res.id].key]);
    else if (res.id === 'essence') spr = this.rockSprite('#b39ddb');
    else spr = this.rockSprite(EXP.ORE_COLORS[EXP.ORES[res.id].key] || '#8b97a3');
    this.drawSprite(ctx, spr, res.x, res.y, ox, oy, 1);
    if (res.hitT > 0) {
      ctx.globalAlpha = XU.clamp(res.hitT / 0.12, 0, 1) * 0.8;
      ctx.fillStyle = '#fff'; ctx.fillRect(res.x - TILE / 2 - ox, res.y - TILE / 2 - oy, TILE, TILE);
      ctx.globalAlpha = 1;
    }
    if (res.hp < res.maxHp) {
      const w = 24, h = 4, bx = res.x - w / 2 - ox, by = res.y - 22 - oy;
      ctx.fillStyle = '#0a0d17'; ctx.fillRect(bx - 1, by - 1, w + 2, h + 2);
      ctx.fillStyle = '#6fd46f'; ctx.fillRect(bx, by, w * res.hp / res.maxHp, h);
    }
  },

  drawTown(ctx, ox, oy) {
    const put = (spr, tx, ty, wTiles, hTiles, label) => {
      const x = tx * TILE - ox, y = ty * TILE - oy;
      if (x > this.screenW + 200 || y > this.screenH + 200 || x < -300 || y < -300) return;
      const w = wTiles * TILE, h = hTiles * TILE;
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(spr, 0, 0, spr.width, spr.height, x, y, w, h - TILE * 0.6);
      ctx.restore();
      ctx.font = 'bold 13px "Courier New"'; ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd97a';
      ctx.fillText(label, x + w / 2, y - 8);
    };
    put(this.shopSpr, World.BUILDINGS[0].x, World.BUILDINGS[0].y, 4, 3, '🛒 Loja [E]');
    put(this.churchSpr, World.BUILDINGS[1].x, World.BUILDINGS[1].y, 4, 3, '⛪ Igreja [E]');
    put(this.workshopSpr, World.BUILDINGS[2].x, World.BUILDINGS[2].y, 3, 3, '🏗️ Hub [E]');
    // Slayer Master
    const smx = World.NPC_HOME.x * TILE + 16 - ox, smy = World.NPC_HOME.y * TILE + 16 - oy;
    if (smx > -60 && smy > -60 && smx < this.screenW + 60 && smy < this.screenH + 60) {
      ctx.font = '22px serif'; ctx.textAlign = 'center';
      ctx.fillText('🗡️', smx, smy + 8);
      ctx.font = 'bold 11px "Courier New"'; ctx.fillStyle = '#ffd97a';
      ctx.fillText('Mestre Slayer [E]', smx, smy - 16);
    }
    // portal
    this.drawSprite(ctx, this.portalSpr, World.PORTAL.x * TILE + 16, World.PORTAL.y * TILE + 16, ox, oy, 0.9 + 0.1 * Math.sin(World.time * 3));
    // canteiros
    for (let i = 0; i < World.FARM_SPOTS.length; i++) {
      const s = World.FARM_SPOTS[i];
      const x = s.x * TILE - ox, y = s.y * TILE - oy;
      if (x < -TILE || y < -TILE || x > this.screenW || y > this.screenH) continue;
      const locked = i >= State.patchCount();
      ctx.fillStyle = locked ? '#3a3226' : '#5b432c';
      ctx.fillRect(x + 3, y + 3, TILE - 6, TILE - 6);
      ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.strokeRect(x + 3.5, y + 3.5, TILE - 7, TILE - 7);
      if (locked) { ctx.font = '13px serif'; ctx.textAlign = 'center'; ctx.fillText('🔒', x + TILE / 2, y + TILE / 2 + 5); continue; }
      const patch = State.state.farmingPatches[i];
      if (!patch) { ctx.font = '12px serif'; ctx.textAlign = 'center'; ctx.fillText('▫️', x + TILE / 2, y + TILE / 2 + 4); }
      else {
        const crop = GameData.crops[patch.crop];
        const ready = Systems.cropReady(patch);
        if (ready) {
          ctx.font = 'bold 16px serif'; ctx.textAlign = 'center';
          ctx.fillText(crop.emoji || '🌾', x + TILE / 2, y + TILE / 2 + 6);
          ctx.strokeStyle = 'rgba(246,196,83,' + (0.5 + 0.4 * Math.sin(World.time * 4)) + ')';
          ctx.strokeRect(x + 2.5, y + 2.5, TILE - 5, TILE - 5);
        } else {
          const frac = XU.clamp(1 - Systems.patchTimeLeftMs(patch) / (crop.growth_time_hours * 3600000), 0.08, 1);
          ctx.font = Math.round(8 + frac * 8) + 'px serif'; ctx.textAlign = 'center';
          ctx.fillText('🌱', x + TILE / 2, y + TILE / 2 + 4 * frac);
        }
      }
    }
  },

  drawGates(ctx, ox, oy) {
    for (const g of World.gates) {
      const x = g.x - ox, y = g.y - oy;
      if (x < -120 || y < -120 || x > this.screenW + 120 || y > this.screenH + 120) continue;
      const d = GameData.dungeons[g.key];
      const unlocked = State.dungeonUnlocked(g.key);
      this.drawSprite(ctx, this.gateSpr, g.x, g.y, ox, oy, unlocked ? 1 : 0.55);
      const dist = Math.hypot(World.player.x - g.x, World.player.y - g.y);
      if (dist < 170) {
        ctx.font = 'bold 12px "Courier New"'; ctx.textAlign = 'center';
        const label = (unlocked ? '' : '🔒 ') + d.display_name + ' · Nv ' + (d.recommended_level || 1);
        ctx.fillStyle = 'rgba(0,0,0,.65)';
        const w = ctx.measureText(label).width + 12;
        ctx.fillRect(x - w / 2, y - 58, w, 17);
        ctx.fillStyle = unlocked ? '#ffd97a' : '#e05252';
        ctx.fillText(label, x, y - 46);
      }
    }
  },

  drawEnemy(ctx, e, ox, oy, nameColor) {
    const spr = e.frame ? e.spr.b : e.spr.a;
    const s = SCALE * (e.size || 1);
    const x = e.x - ox, y = e.y - oy;
    if (x < -80 || y < -80 || x > this.screenW + 80 || y > this.screenH + 80) return;
    // sombra
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    ctx.beginPath(); ctx.ellipse(x, y + 8 * (e.size || 1), 10 * (e.size || 1), 4 * (e.size || 1), 0, 0, 7); ctx.fill();
    ctx.drawImage(spr, x - spr.width * s / 2, y - spr.height * s / 2, spr.width * s, spr.height * s);
    if (e.windup > 0) { ctx.strokeStyle = 'rgba(224,82,82,.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 16 * (e.size || 1), 0, 7); ctx.stroke(); }
    if (e.hitT > 0) {
      ctx.globalAlpha = XU.clamp(e.hitT / 0.15, 0, 1) * 0.7;
      ctx.fillStyle = '#fff'; ctx.fillRect(x - 14, y - 14, 28, 28);
      ctx.globalAlpha = 1;
    }
    if (e.hp < e.maxHp) {
      const w = e.isBoss ? 56 : 26, h = 4;
      ctx.fillStyle = '#0a0d17'; ctx.fillRect(x - w / 2 - 1, y - 27, w + 2, h + 2);
      ctx.fillStyle = '#e05252'; ctx.fillRect(x - w / 2, y - 26, w * Math.max(0, e.hp) / e.maxHp, h);
    }
    ctx.font = '10px "Courier New"'; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillText(e.name, x + 1, y - 28 * (e.size || 1) + 1);
    ctx.fillStyle = nameColor || '#ffd0d0'; ctx.fillText(e.name, x, y - 28 * (e.size || 1));
  },

  drawPlayer(ctx, ox, oy) {
    const p = World.player;
    if (p.invuln > 0 && Math.floor(World.time * 14) % 2 === 0) return;
    const key = p.facing + p.frame;
    const spr = World.heroSprites[key] || World.heroSprites.down0;
    const x = p.x - ox, y = p.y - oy;
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    ctx.beginPath(); ctx.ellipse(x, y + 7, 9, 4, 0, 0, 7); ctx.fill();
    ctx.drawImage(spr, x - spr.width * SCALE / 2, y - spr.height * SCALE, spr.width * SCALE, spr.height * SCALE);
    if (p.attackTimer > 0 && State.state.combatStyle !== 'ranged' && State.state.combatStyle !== 'magic') {
      const t = 1 - p.attackTimer / 0.22;
      const ang = { down: Math.PI / 2, up: -Math.PI / 2, left: Math.PI, right: 0 }[p.facing];
      const sweep = -0.9 + t * 1.8;
      ctx.save();
      ctx.translate(x, y - 14); ctx.rotate(ang);
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.85 * (1 - t)) + ')'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(0, 0, 22, sweep - 0.9, sweep + 0.9); ctx.stroke();
      ctx.strokeStyle = 'rgba(246,196,83,' + (0.7 * (1 - t)) + ')'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, 27, sweep - 0.8, sweep + 0.8); ctx.stroke();
      ctx.restore();
    }
    if (p.stun > 0) {
      ctx.font = '14px serif'; ctx.textAlign = 'center';
      ctx.fillText('💫', x, y - 36);
    }
  },

  drawMinimap(ctx) {
    const size = 128, half = size / 2, mx = this.screenW - size - 14, my = 14;
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(10,13,23,0.78)';
    ctx.fillRect(mx - 4, my - 4, size + 8, size + 8);
    const scl = 3.2, r = Math.floor(half / scl);
    const pcx = Math.floor(World.player.x / TILE), pcy = Math.floor(World.player.y / TILE);
    const dungeon = World.mode === 'dungeon';
    for (let ty = pcy - r; ty <= pcy + r; ty++) for (let tx = pcx - r; tx <= pcx + r; tx++) {
      const t = World.terrainAt(tx, ty);
      const px = mx + half + (tx - pcx) * scl, py = my + half + (ty - pcy) * scl;
      ctx.fillStyle = dungeon
        ? (t === TERRAIN.WATER ? '#1c202b' : t === TERRAIN.SAND ? '#8a7345' : '#454b5e')
        : (t === TERRAIN.WATER ? '#2f6fb0' : t === TERRAIN.SAND ? '#d8c084' : t === TERRAIN.GRASS2 ? '#3f7a37' : '#4c8a40');
      ctx.fillRect(px, py, scl, scl);
      if (!dungeon) {
        const key = tx + ',' + ty;
        if (World.resources.has(key)) { ctx.fillStyle = '#c9a05a'; ctx.fillRect(px + scl * 0.2, py + scl * 0.2, scl * 0.6, scl * 0.6); }
        if (World.buildingAt(tx, ty)) { ctx.fillStyle = '#c9a05a'; ctx.fillRect(px, py, scl, scl); }
      }
    }
    ctx.fillStyle = '#e05252';
    for (const e of World.enemies.concat(World.bosses)) {
      const ex = mx + half + (e.x / TILE - pcx) * scl, ey = my + half + (e.y / TILE - pcy) * scl;
      if (ex > mx - 2 && ex < mx + size + 2 && ey > my - 2 && ey < my + size + 2) ctx.fillRect(ex - 1.5, ey - 1.5, 3, 3);
    }
    if (!dungeon) {
      ctx.fillStyle = '#f6c453';
      for (const g of World.gates) {
        const gx = mx + half + (g.x / TILE - pcx) * scl, gy = my + half + (g.y / TILE - pcy) * scl;
        if (gx > mx - 2 && gx < mx + size + 2 && gy > my - 2 && gy < my + size + 2) ctx.fillRect(gx - 1.5, gy - 1.5, 3.5, 3.5);
      }
    }
    ctx.fillStyle = '#fff';
    ctx.fillRect(mx + half - 2.5, my + half - 2.5, 5, 5);
    ctx.globalAlpha = 1;
    ctx.restore();
  },
};

// shadeColor2: versão local que aceita cores hex
function shadeColor2(hex, amt) {
  if (!hex || hex[0] !== '#') return hex;
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) + amt, g = ((n >> 8) & 255) + amt, b = (n & 255) + amt;
  return 'rgb(' + XU.clamp(r, 0, 255) + ',' + XU.clamp(g, 0, 255) + ',' + XU.clamp(b, 0, 255) + ')';
}

/* Boot */
EXPGUI.boot();

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
  _queueOpen: false,      // painel da fila de sessões aberto
  _queueSig: '',          // assinatura da fila/sessão (para re-render sob demanda)
  _lastQueueTick: 0,

  /* ============================ BOOT ============================ */

  async boot() {
    await GameData.loadAll();
    EXP.buildLists();
    if (!State.load()) { State.init(); State.save(); }
    // i18n do Hub: o Expeditions segue o idioma salvo (mesmo save do modo Hub)
    await I18n.load(State.state.lang || I18n.autoDetect());
    document.documentElement.lang = I18n.locale;
    World.buildGates();
    World.buildObstacles();
    World.makeNPCs();
    this.buildHeroSprites();
    this.buildSprites();
    this.bind();
    this.resize();
    this.applyI18n();
    requestAnimationFrame(this.loop.bind(this));
  },

  /** Aplica os textos estáticos do HTML e os re-renderizáveis via i18n. */
  applyI18n() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const v = I18n.t(el.getAttribute('data-i18n'));
      if (v != null) el.textContent = v;
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const v = I18n.t(el.getAttribute('data-i18n-title'));
      if (v != null) el.title = v;
    });
    // dica do menu tem marcação (<b>/<br>), então usa innerHTML
    const hintEl = document.getElementById('menuhint');
    if (hintEl) hintEl.innerHTML = tt('web_exp_menu_hint');
    this.showMenuHero();
    // recria as abas do diário se já existirem (idioma trocado em outra aba)
    if (document.getElementById('tabpages')?.children.length) this.buildTabs();
  },

  buildHeroSprites() {
    this.appearance = Appearance.load();
    World.heroSprites = HeroArt.build(this.appearance);
  },

  /** Reconstrói o herói depois de mudar a aparência. */
  applyAppearance(app, persist) {
    this.appearance = app;
    World.heroSprites = HeroArt.build(app);
    if (persist) Appearance.save(app);
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
    this.tradeSpr = this.houseSpr('#3f7a4a', '#d8c9a0');
  },

  showMenuHero() {
    const st = State.state;
    const html = tt('web_exp_menu_hero', [State.totalLevel(), Util.fmt(st.coins), EXP.combatLevel()],
      '🧝 Herói compartilhado com o Hub — Nível total <b>{1}</b> · 🪙 <b>{2}</b> · Combate <b>{3}</b>');
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
    this.toast(tt('web_exp_toast_welcome'));
  },

  onDeath() {
    this.state = 'dead';
    const dungeon = GameData.dungeons[World.dungeonKey]?.display_name;
    document.getElementById('deathinfo').innerHTML =
      World.mode === 'dungeon' && dungeon
        ? tt('web_exp_death_info_dungeon', [dungeon, Util.fmt(World.sessionCoins)])
        : tt('web_exp_death_info', [Util.fmt(World.sessionCoins)]);
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
    this.toast(tt('web_exp_respawn_toast'));
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
        if (k === 'm' || k === 'M') this.toggleBigMap();
        if (k === 'v' || k === 'V') this.toggleAppearance();
        if (k === 'b' || k === 'B' || k === 'c' || k === 'C' || k === 'Escape') {
          if (!document.getElementById('bigmap').classList.contains('hidden')) this.toggleBigMap();
          else this.toggleJournal();
        }
      } else if (this.state === 'menu') {
        if (k === 'Enter' || k === ' ') this.startGame();
        if (k === 'v' || k === 'V') this.toggleAppearance();
      }
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
    document.getElementById('mapchip').addEventListener('click', () => this.toggleBigMap());
    document.getElementById('queuechip').addEventListener('click', () => this.toggleQueue());
    document.getElementById('closequeue').addEventListener('click', () => this.toggleQueue());
    document.getElementById('closebigmap').addEventListener('click', () => this.toggleBigMap());
    document.getElementById('playbtn').addEventListener('click', () => this.startGame());
    document.getElementById('hubbtn').addEventListener('click', () => this.gotoHub());
    document.getElementById('respawnbtn').addEventListener('click', () => this.respawn());
    document.getElementById('closejournal').addEventListener('click', () => this.toggleJournal());
    const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
    on('appbtn', () => this.toggleAppearance(true));
    on('appchip', () => this.toggleAppearance(true));
    on('apprandom', () => { this._appDraft = Appearance.random(); this.renderAppearance(); SFX.levelup(); });
    on('appreset', () => { this._appDraft = Object.assign({}, Appearance.DEFAULT); this.renderAppearance(); SFX.buy(); });
    on('appsave', () => {
      this.applyAppearance(Object.assign({}, this._appDraft), true);
      this.toggleAppearance(false);
      this.showMenuHero();
      this.toast(tt('web_exp_app_saved', null, 'Hero appearance saved'));
      SFX.levelup();
    });
    on('appcancel', () => this.toggleAppearance(false));
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
      if (!err) this.toast(tt('web_exp_toast_equipped', [GameData.name(remembered)]));
    }
    State.save();
    this.toast(tt('web_exp_toast_style', [EXP.styleName(s)]));
    this.updateHUD();
  },

  /* ============================ INTERAÇÃO [E] ============================ */

  nearestInteract() {
    const p = World.player;
    if (World.mode === 'dungeon') {
      const d = GameData.dungeons[World.dungeonKey];
      const dist = Math.hypot(p.x - (TILE / 2 + 6), p.y - (TILE / 2 + 6));
      if (dist < 60) return {
        label: tt('web_exp_interact_dungeon_exit', [d?.display_name || '']),
        sub: World.dungeonKills >= 8
          ? tt('web_exp_interact_run_done', [World.dungeonKills])
          : tt('web_exp_interact_run_progress', [World.dungeonKills]),
        action: () => Dungeons.exit(true),
      };
      return null;
    }
    // portal do hub
    if (Math.hypot(p.x - (World.PORTAL.x * TILE + 16), p.y - (World.PORTAL.y * TILE + 16)) < 52)
      return { label: tt('web_exp_interact_hub'), sub: tt('web_exp_interact_hub_sub'), action: () => this.gotoHub() };
    // edifícios
    const ptx = Math.floor(p.x / TILE), pty = Math.floor(p.y / TILE);
    for (const b of World.BUILDINGS) {
      if (ptx >= b.x - 1 && ptx <= b.x + b.w && pty >= b.y - 1 && pty <= b.y + b.h) {
        const name = EXP.buildingName(b);
        const icon = b.icon || '🏠';
        if (b.key === 'shop') return { label: icon + ' ' + name, sub: tt('web_exp_interact_shop_sub'), action: () => this.openJournalTab('shop') };
        if (b.key === 'church') return { label: icon + ' ' + name, sub: tt('web_exp_interact_church_sub'), action: () => this.openJournalTab('pray') };
        if (b.key === 'workshop') return { label: icon + ' ' + name, sub: tt('web_exp_interact_workshop_sub'), action: () => this.openJournalTab('build') };
        if (b.key === 'trade') return { label: icon + ' ' + name, sub: tt('web_exp_interact_trade_sub'), action: () => this.openJournalTab('trade') };
        if (b.key === 'barracks') return { label: icon + ' ' + name, sub: tt('web_exp_interact_barracks_sub', null, 'Check your equipment and combat style'), action: () => this.openJournalTab('equip') };
        if (b.key === 'library') return { label: icon + ' ' + name, sub: tt('web_exp_interact_library_sub', null, 'Study spells and runes'), action: () => this.openJournalTab('magic') };
        if (b.key === 'tavern') return { label: icon + ' ' + name, sub: tt('web_exp_interact_tavern_sub', null, 'A hot meal and rumours from the road'), action: () => this.openJournalTab('cook') };
        if (b.key === 'castle') return { label: icon + ' ' + name, sub: tt('web_exp_interact_castle_sub', null, 'The crown assigns hunts and honours'), action: () => this.openJournalTab('slayer') };
      }
    }
    // Slayer Master
    if (Math.hypot(p.x - (World.NPC_HOME.x * TILE + 16), p.y - (World.NPC_HOME.y * TILE + 16)) < 52)
      return { label: tt('web_exp_interact_slayer'), sub: tt('web_exp_interact_slayer_sub'), action: () => this.openJournalTab('slayer') };
    // plantações
    for (let i = 0; i < World.FARM_SPOTS.length; i++) {
      const s = World.FARM_SPOTS[i];
      if (Math.hypot(p.x - (s.x * TILE + 16), p.y - (s.y * TILE + 16)) < 40) {
        const patch = State.state.farmingPatches[i];
        if (i >= State.patchCount()) return { label: tt('web_exp_interact_patch_locked'), sub: tt('web_exp_interact_patch_locked_sub'), action: () => { } };
        if (!patch) return { label: tt('web_exp_interact_patch_empty'), sub: tt('web_exp_interact_patch_empty_sub'), action: () => this.openJournalTab('farm') };
        const crop = GameData.crops[patch.crop];
        if (Systems.cropReady(patch)) return { label: tt('web_exp_interact_harvest', [crop.display_name]), action: () => this.harvest(i + 1) };
        const left = Systems.patchTimeLeftMs(patch);
        return { label: tt('web_exp_interact_growing', [crop.display_name]), sub: tt('web_exp_interact_growing_sub', [Util.fmtTime(left)]), action: () => this.openJournalTab('farm') };
      }
    }
    // obstáculos de agilidade (anel fora da muralha)
    const ob = World.obstacleNear(p.x, p.y);
    if (ob) {
      const course = Agility.currentCourse();
      return {
        label: tt('web_exp_interact_obstacle', [course.def.display_name]),
        sub: tt('web_exp_interact_obstacle_sub', [course.def.level_required, course.def.xp_per_success]),
        action: () => Agility.attempt(ob),
      };
    }
    // NPCs (roubo)
    let bestNpc = null, bd = 44;
    for (const npc of World.npcs) {
      const d = Math.hypot(npc.x - p.x, npc.y - p.y);
      if (d < bd) { bd = d; bestNpc = npc; }
    }
    if (bestNpc) return { label: tt('web_exp_interact_pickpocket', [bestNpc.name]), sub: tt('web_exp_interact_pickpocket_sub', [bestNpc.def.level_required]), action: () => Thieving.attempt(bestNpc) };
    // entradas de dungeon
    const gate = World.gateNear(p.x, p.y, 56);
    if (gate) {
      const d = GameData.dungeons[gate.key];
      const unlocked = State.dungeonUnlocked(gate.key);
      return {
        label: (unlocked ? tt('web_exp_interact_dungeon_enter', [d.display_name]) : tt('web_exp_interact_dungeon_sealed', [d.display_name])),
        sub: unlocked
          ? tt('web_exp_interact_dungeon_sub', [d.recommended_level || 1])
          : tt('web_exp_interact_dungeon_locked_sub', [d.recommended_level || 1]),
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
    if (r.bean) { this.toast(tt('web_exp_toast_bean')); SFX.levelup(); this.flash('lvflash'); }
    else { this.toast(tt('web_exp_toast_harvest', [r.yield, GameData.name(r.crop)])); SFX.pickup(); }
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
    if (!key) { if (!auto) { this.toast(tt('web_exp_toast_no_food')); SFX.error(); } return; }
    if (p.hp >= EXP.maxHp()) { if (!auto) this.toast(tt('web_exp_toast_hp_full')); return; }
    State.removeItem(key, 1);
    p.hp = Math.min(EXP.maxHp(), p.hp + GameData.foodHeals[key]);
    if (World.mode === 'dungeon') World.dungeonFoodEaten++;
    if (!auto) { this.flash('healflash'); this.toast(tt('web_exp_toast_ate', [GameData.name(key), GameData.foodHeals[key]])); SFX.buy(); }
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
    this.toast(tt('web_exp_toast_levelup', [EXP.skillName(skill), after]));
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
      el.textContent = tt('web_exp_dungeon_banner', [d?.display_name || '', World.dungeonKills]);
    } else el.style.display = 'none';
  },

  updateHUD() {
    const p = World.player; if (!p) return;
    const maxHp = EXP.maxHp();
    document.getElementById('hpfill').style.width = XU.clamp(p.hp / maxHp * 100, 0, 100) + '%';
    document.getElementById('hptext').textContent = Math.ceil(p.hp) + '/' + maxHp;
    document.getElementById('lvltext').textContent = tt('web_exp_hud_combat', [EXP.combatLevel()]);
    const style = State.state.combatStyle;
    document.getElementById('stylename').textContent = EXP.styleName(style).toUpperCase();
    // barra de XP da skill principal do estilo
    const mainSkill = style === 'defense' ? 'defense' : style;
    const lvl = State.level(mainSkill), cur = State.xp(mainSkill);
    const nxt = lvl >= 99 ? cur : Sim.xpForLevel(lvl + 1), prv = Sim.xpForLevel(lvl);
    document.getElementById('xpfill').style.width = (lvl >= 99 ? 100 : XU.clamp((cur - prv) / (nxt - prv) * 100, 0, 100)) + '%';
    document.getElementById('ammotext').textContent =
      style === 'ranged' ? tt('web_exp_hud_arrows', [EXP.bestArrow() ? State.count(EXP.bestArrow().key) : 0])
        : style === 'magic' ? (State.state.activeSpell ? GameData.spells[State.state.activeSpell].display_name : tt('web_exp_hud_no_spell')) : '';
    document.getElementById('scoretext').textContent = Util.fmt(State.state.coins);
    document.getElementById('stylechip').textContent = tt('web_exp_hud_style', [EXP.styleName(style)]);
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
      tc.textContent = tt('web_exp_hud_slayer', [e ? e.display_name : task.enemyKey, task.killsCompleted, task.targetKills]);
    } else tc.textContent = '';
    // sessão do hub em andamento + fila do Queue Master
    this.updateQueueChips();
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
      document.getElementById('dungbanner').textContent = tt('web_exp_dungeon_banner', [d?.display_name || '', World.dungeonKills]);
    }
  },

  /** Chips de sessão/fila do Hub no HUD (a fila do Queue Master fica visível aqui também). */
  updateQueueChips() {
    const sess = Engine.session();
    const q = State.state.sessionQueue || [];
    const sc = document.getElementById('sesschip');
    if (sess) {
      const left = (sess.endsAt || sess.startedAt + 3600000) - Date.now();
      sc.style.display = 'block';
      sc.textContent = tt('web_exp_hud_session', [sess.label || 'session', Util.fmtTime(left)]);
    } else sc.style.display = 'none';
    const qc = document.getElementById('queuechip');
    if (qc) {
      if (sess || q.length) {
        qc.style.display = 'block';
        qc.textContent = tt('web_exp_chip_queue', [q.length, State.maxQueueSize()]);
      } else qc.style.display = 'none';
    }
    // re-renderiza o painel aberto só quando a fila/sessão muda de estado
    const sig = (sess ? (Engine.isComplete(sess) ? 'done:' : 'run:') + (sess.label || '') : 'no') +
      '|' + q.map(i => i.label || i.activityKey || '').join(',');
    if (this._queueOpen && sig !== this._queueSig) { this._queueSig = sig; this.rQueuePanel(); }
  },

  /* ============================ DIÁRIO ============================ */

  // [id, chave i18n] — os rótulos são resolvidos via tt() no buildTabs
  TABS: [
    ['skills', 'web_exp_tab_skills'], ['equip', 'web_exp_tab_equip'], ['forge', 'web_exp_tab_forge'], ['fletch', 'web_exp_tab_fletch'],
    ['craft', 'web_exp_tab_craft'], ['cook', 'web_exp_tab_cook'], ['herb', 'web_exp_tab_herb'], ['runes', 'web_exp_tab_runes'],
    ['build', 'web_exp_tab_build'], ['trade', 'web_exp_tab_trade'], ['pray', 'web_exp_tab_pray'], ['magic', 'web_exp_tab_magic'],
    ['farm', 'web_exp_tab_farm'], ['slayer', 'web_exp_tab_slayer'], ['shop', 'web_exp_tab_shop'], ['codex', 'web_exp_tab_codex'],
  ],

  toggleJournal() {
    if (this.state === 'menu' || this.state === 'dead') return;
    document.getElementById('bigmap').classList.add('hidden');
    this.paused = !this.paused;
    document.getElementById('journal').classList.toggle('hidden', !this.paused);
    if (this.paused) {
      const active = document.querySelector('.tab.active');
      if (active) this.renderTab(active.dataset.id);
    }
  },
  closeJournal() { if (this.paused) this.toggleJournal(); },
  /** Re-renderiza uma aba se ela estiver aberta (ex.: caravana despachada). */
  refreshOpenTab(id) {
    if (this.paused && document.querySelector('.tab.active')?.dataset.id === id) this.renderTab(id);
  },
  openJournalTab(id) {
    if (!this.paused) this.toggleJournal();
    this.selectTab(id);
  },

  /* ============================ FILA DE SESSÕES ============================ */

  /** Abre/fecha o painel da fila (Queue Master) visível no modo Expeditions. */
  toggleQueue() {
    const panel = document.getElementById('queuepanel');
    if (!panel || this.state === 'menu' || this.state === 'dead') return;
    this._queueOpen = panel.classList.contains('hidden');
    if (this._queueOpen) {
      this.paused = true;
      panel.classList.remove('hidden');
      this.rQueuePanel();
    } else {
      panel.classList.add('hidden');
      this.paused = false;
    }
  },

  /** Renderiza o painel da fila: sessão atual + itens enfileirados (com remover/coletar). */
  rQueuePanel() {
    const el = document.getElementById('queuebody');
    if (!el) return;
    el.innerHTML = '';
    const sess = Engine.session();
    const q = State.state.sessionQueue || [];
    // sessão atual do Hub
    if (sess) {
      const done = Engine.isComplete(sess);
      const left = sess.endsAt - Date.now();
      const row = this.rowEl('<span class="nm">' + tt('web_exp_queue_current') + ': <b>' + Util.esc(sess.label || 'session') + '</b></span>' +
        '<span class="side"><span class="' + (done ? 'ok' : '') + '">' + (done ? tt('web_exp_queue_ready') : Util.fmtTime(left)) + '</span>' +
        (done ? '<button class="buybtn equip">' + tt('web_exp_btn_collect') + '</button>' : '') + '</span>');
      const btn = row.querySelector('button');
      if (btn) btn.onclick = () => this.collectSession();
      el.appendChild(row);
    }
    // itens na fila
    if (q.length) {
      q.forEach((item, i) => {
        const row = this.rowEl('<span class="nm"><span class="qnum">' + (i + 1) + '</span> ' + Util.esc(item.label || item.activityKey || 'session') + '</span>' +
          '<span class="side"><span class="catg">' + (i === 0 && !sess ? tt('web_exp_queue_starting') : tt('web_exp_queue_item_sub')) + '</span>' +
          '<button class="buybtn uneq" title="' + tt('web_exp_queue_remove') + '">✕</button></span>');
        row.querySelector('button').onclick = () => { Engine.removeQueued(i); this.rQueuePanel(); this.updateQueueChips(); };
        el.appendChild(row);
      });
    }
    if (!sess && !q.length) el.appendChild(this.rowEl('<span class="nm" style="color:var(--muted)">' + tt('web_exp_queue_empty') + '</span>'));
    if (State.maxQueueSize() < 6) el.appendChild(this.rowEl('<span class="nm" style="color:var(--muted)">' + tt('web_exp_queue_upgrade') + '</span>'));
  },

  /** Coleta a sessão do Hub concluída direto do Expeditions. */
  collectSession() {
    const sess = Engine.session();
    if (!sess || !Engine.isComplete(sess)) { SFX.error(); return; }
    const summary = Engine.collect();
    if (summary) {
      const xp = Object.values(summary.xpBySkill || {}).reduce((a, b) => a + b, 0);
      this.toast(tt('web_exp_queue_collected', [sess.label || 'session', Util.fmt(xp)]));
      SFX.levelup();
    }
    this.rQueuePanel(); this.updateQueueChips();
    State.save();
  },

  /**
   * Port do auto-avanço da fila do Hub (main.js): com a fila populada, uma
   * sessão concluída é coletada e a próxima começa — mesmo jogando Expeditions.
   */
  queueTick() {
    const q = State.state.sessionQueue || [];
    const sess = Engine.session();
    if (sess && sess.endsAt <= Date.now() && q.length > 0) {
      const label = sess.label || 'session';
      const summary = Engine.collect();
      if (summary) {
        const xp = Object.values(summary.xpBySkill || {}).reduce((a, b) => a + b, 0);
        this.toast(tt('web_exp_queue_collected', [label, Util.fmt(xp)]));
        SFX.levelup();
      }
      this.rQueuePanel(); this.updateQueueChips();
      State.save();
    } else if (!sess && q.length > 0 && Engine.startNextQueued()) {
      const ns = Engine.session();
      if (ns) this.toast(tt('web_exp_queue_started', [ns.label || 'session']));
      this.rQueuePanel(); this.updateQueueChips();
    }
  },

  /* ====================== PERSONALIZAÇÃO DO HERÓI [V] ====================== */

  toggleAppearance(force) {
    const el = document.getElementById('appearance');
    if (!el) return;
    const opening = force !== undefined ? force : el.classList.contains('hidden');
    if (opening) {
      document.getElementById('journal').classList.add('hidden');
      document.getElementById('bigmap').classList.add('hidden');
      el.classList.remove('hidden');
      if (this.state === 'playing') this.paused = true;
      this._appDraft = Object.assign({}, this.appearance || Appearance.load());
      this.renderAppearance();
      this.appLoop();
    } else {
      el.classList.add('hidden');
      if (this.state === 'playing') this.paused = false;
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this._appRaf);
    }
  },

  /** Lista de opções + preview animado. */
  renderAppearance() {
    const box = document.getElementById('approws');
    if (!box) return;
    box.innerHTML = '';
    const app = this._appDraft;
    for (const f of Appearance.fields()) {
      const row = document.createElement('div');
      row.className = 'row';
      const val = app[f.key] % f.n;
      const label = f.swatch
        ? (f.swatch[val] ? '<span class="dot" style="background:' + f.swatch[val] + '"></span>' : tt('web_exp_app_none', null, 'None'))
        : tt('web_exp_app_opt_' + (f.names ? f.names[val] : val), null, f.names ? f.names[val] : String(val + 1));
      row.innerHTML = '<span class="nm">' + f.label + '</span>' +
        '<span class="side"><button class="buybtn" data-d="-1">◀</button>' +
        '<span style="min-width:96px;text-align:center">' + label + ' <b>' + (val + 1) + '/' + f.n + '</b></span>' +
        '<button class="buybtn" data-d="1">▶</button></span>';
      row.querySelectorAll('button').forEach(btn => {
        btn.onclick = () => {
          const d = +btn.dataset.d;
          app[f.key] = (app[f.key] + d + f.n) % f.n;
          SFX.buy();
          this.renderAppearance();
        };
      });
      box.appendChild(row);
    }
  },

  /** Preview: herói andando nas quatro direções. */
  appLoop() {
    const cv = document.getElementById('appcv');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const draw = () => {
      if (document.getElementById('appearance').classList.contains('hidden')) return;
      const set = HeroArt.build(this._appDraft);
      const t = Date.now() / 260 | 0;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, cv.width, cv.height);
      const dirs = ['down', 'left', 'right', 'up'];
      dirs.forEach((d, i) => {
        const spr = set[d + (t % 2)];
        ctx.drawImage(spr, 8 + i * 62, 6, 16 * 3.4, 16 * 3.4);
      });
      this._appRaf = requestAnimationFrame(draw);
    };
    draw();
  },

  /* ============================ MAPA GRANDE [M] ============================ */

  toggleBigMap() {
    if (this.state !== 'playing') return;
    const mapEl = document.getElementById('bigmap');
    const opening = mapEl.classList.contains('hidden');
    if (opening) {
      document.getElementById('journal').classList.add('hidden');
      mapEl.classList.remove('hidden');
      this.paused = true;
      this.renderBigMap();
    } else {
      mapEl.classList.add('hidden');
      this.paused = false;
    }
  },

  /** Dados da legenda (puro, testável): portais ordenados por nível. */
  bigMapLegend() {
    const p = World.mode === 'dungeon'
      ? (World.gates.find(g => g.key === World.dungeonKey) || World.player)
      : World.player;
    return World.gates.map((g, i) => {
      const d = GameData.dungeons[g.key];
      const unlocked = State.dungeonUnlocked(g.key);
      return {
        idx: i + 1, key: g.key, name: d?.display_name || g.key,
        level: d?.recommended_level || 1, unlocked,
        distTiles: Math.round(Math.hypot(g.x - p.x, g.y - p.y) / TILE),
        desc: d?.description || '',
      };
    });
  },

  renderBigMap() {
    const cv = document.getElementById('mapcv');
    const ctx = cv.getContext('2d');
    const R = 250, S = 1.8, C = 450;
    const px = t => C + t * S;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, 900, 900);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0a1526'; ctx.fillRect(0, 0, 900, 900);
    // terreno por bioma: desenhado uma única vez e reaproveitado (o mundo é estático)
    if (!this._mapLayer) {
      const layer = document.createElement('canvas');
      layer.width = 900; layer.height = 900;
      const lc = layer.getContext('2d');
      const savedMode0 = World.mode;
      World.mode = 'overworld';
      const step = 2;
      for (let ty = -R; ty <= R; ty += step) for (let tx = -R; tx <= R; tx += step) {
        lc.fillStyle = EXPART.mapColor(tx, ty, false);
        lc.fillRect(px(tx), px(ty), S * step + 0.6, S * step + 0.6);
      }
      World.mode = savedMode0;
      this._mapLayer = layer;
    }
    ctx.drawImage(this._mapLayer, 0, 0);
    // nomes das regiões (reinos/domínios)
    const savedMode = World.mode;
    ctx.textAlign = 'center';
    for (const reg of WorldGen.REGIONS) {
      if (reg.key === 'heartlands') continue;
      ctx.font = 'bold 11px "Courier New"';
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      const nm = reg.icon + ' ' + WorldGen.localized(reg, 'name').toUpperCase();
      const w = ctx.measureText(nm).width;
      const ly = px(reg.y - reg.r * 0.62);   // acima do centro: não cobre a cidade
      if (WorldGen.SETTLEMENTS.some(st => Math.abs(st.x - reg.x) < 26 && Math.abs(st.y - (reg.y - reg.r * 0.62)) < 7)) continue;
      ctx.fillRect(px(reg.x) - w / 2 - 4, ly - 10, w + 8, 14);
      ctx.fillStyle = 'rgba(255,245,220,.85)';
      ctx.fillText(nm, px(reg.x), ly);
    }
    World.mode = savedMode;
    // circuito de agilidade
    ctx.fillStyle = '#5aa9ff';
    for (const ob of (World.obstacles || [])) ctx.fillRect(px(ob.tx) - 1, px(ob.ty) - 1, S + 2, S + 2);
    // portais de dungeon numerados
    World.gates.forEach((g, i) => {
      const unlocked = State.dungeonUnlocked(g.key);
      const gx = px(g.tx) + S / 2, gy = px(g.ty) + S / 2;
      ctx.fillStyle = '#0c0f1a'; ctx.beginPath(); ctx.arc(gx, gy, 6, 0, 7); ctx.fill();
      ctx.fillStyle = unlocked ? '#f6c453' : '#e05252';
      ctx.beginPath(); ctx.arc(gx, gy, 4.6, 0, 7); ctx.fill();
      ctx.fillStyle = '#0c0f1a'; ctx.font = 'bold 7px monospace'; ctx.textAlign = 'center';
      ctx.fillText(String(i + 1), gx, gy + 2.5);
    });
    // cidades e reinos
    for (const st of WorldGen.SETTLEMENTS) {
      const x = px(st.x), y = px(st.y);
      const big = st.kind === 'capital' || st.kind === 'kingdom';
      ctx.fillStyle = '#0c0f1a'; ctx.beginPath(); ctx.arc(x, y, big ? 8 : 6, 0, 7); ctx.fill();
      ctx.fillStyle = st.pal.banner; ctx.beginPath(); ctx.arc(x, y, big ? 6 : 4, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, big ? 2.6 : 1.8, 0, 7); ctx.fill();
      const nm = WorldGen.localized(st, 'short');
      ctx.font = (big ? 'bold 12px' : '10px') + ' "Courier New"'; ctx.textAlign = 'center';
      const w = ctx.measureText(nm).width;
      ctx.fillStyle = 'rgba(10,13,23,.7)'; ctx.fillRect(x - w / 2 - 3, y + 8, w + 6, 13);
      ctx.fillStyle = big ? '#ffd97a' : '#e9ecf5'; ctx.fillText(nm, x, y + 18);
    }
    // jogador (dentro de dungeon: marcador no portal correspondente)
    const p = World.mode === 'dungeon'
      ? (World.gates.find(g => g.key === World.dungeonKey) || { x: 0, y: 0 })
      : World.player;
    const ptx = p.x / TILE, pty = p.y / TILE;
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(px(ptx), px(pty), 8, 0, 7); ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(px(ptx), px(pty), 3.5, 0, 7); ctx.fill();
    // rosa dos ventos
    ctx.fillStyle = '#ffd97a'; ctx.font = 'bold 13px "Courier New"'; ctx.textAlign = 'center';
    ctx.fillText('N', C, 20); ctx.fillText('S', C, 892);
    ctx.fillText('O', 12, C); ctx.fillText('L', 888, C);

    // ---------------- legenda ----------------
    const legend = document.getElementById('maplegend');
    legend.innerHTML = '';
    const mkRow = (html, cls, onclick) => {
      const d = document.createElement('div');
      d.className = 'map-row' + (cls ? ' ' + cls : '');
      d.innerHTML = html;
      d.onclick = onclick;
      legend.appendChild(d);
      return d;
    };
    const mkHead = txt => {
      const d = document.createElement('div');
      d.className = 'section-head';
      d.textContent = txt;
      legend.appendChild(d);
    };
    const inDungeon = World.mode === 'dungeon';
    const travelBtn = () => '<button class="map-travel' + (inDungeon ? ' disabled' : '') + '" title="' + tt('web_exp_map_travel_title') + '">' + tt('web_exp_map_travel') + '</button>';

    // cidades e reinos (com viagem rápida)
    mkHead(tt('web_exp_map_head_cities', null, '🏰 Cities & Kingdoms'));
    const pl = World.mode === 'dungeon' ? (World.gates.find(g => g.key === World.dungeonKey) || World.player) : World.player;
    for (const st of WorldGen.SETTLEMENTS) {
      const dTiles = Math.round(Math.hypot(st.x * TILE - pl.x, st.y * TILE - pl.y) / TILE);
      const kind = tt('web_exp_map_kind_' + st.kind, null, st.kind);
      const row = mkRow(
        '<span><span class="dot" style="background:' + st.pal.banner + '"></span>' + st.icon + ' ' + WorldGen.localized(st, 'short') + '</span>' +
        '<span class="side"><span>' + kind + '</span><span>' + tt('web_exp_map_tiles', [dTiles]) + '</span>' + travelBtn() + '</span>',
        '', () => this._mapHint('<b>' + WorldGen.localized(st, 'name') + '</b> — ' +
          tt('web_exp_map_city_of', [tt('web_exp_map_kind_' + st.kind, null, st.kind),
            WorldGen.localized(WorldGen.REGIONS.find(r => r.key === st.region) || { name: '', nameEn: '' }, 'name')],
            '{1} in {2}') + ' · ' + (st.buildings || []).map(b => (b.icon || '') + ' ' + WorldGen.localized(b, 'name')).join(' · ')));
      const tb = row.querySelector('.map-travel');
      if (tb && !inDungeon) tb.onclick = e => { e.stopPropagation(); this.fastTravelToSettlement(st.key); };
    }

    mkRow('<span>' + tt('web_exp_map_agility_row') + '</span><span class="side">' + tt('web_exp_map_agility_side') + '</span>', '',
      () => this._mapHint(tt('web_exp_map_agility_hint', [Agility.currentCourse().def.display_name, Agility.currentCourse().def.xp_per_success])));

    // dungeons por tema/bioma
    mkHead(tt('web_exp_map_head_dungeons', null, '🗡️ Dungeons'));
    const rows = this.bigMapLegend();
    rows.forEach(r => {
      const dist = r.distTiles < 1000 ? tt('web_exp_map_tiles', [r.distTiles]) : tt('web_exp_map_ktiles', [(r.distTiles / 1000).toFixed(1)]);
      const gate = World.gates.find(g => g.key === r.key);
      const theme = gate ? gate.theme : DungeonGen.theme(r.key, GameData.dungeons[r.key]);
      const biome = gate && BIOMES[gate.biome] ? BIOMES[gate.biome] : null;
      const rowEl = mkRow(
        '<span><span class="dot" style="background:' + (r.unlocked ? '#f6c453' : '#e05252') + '"></span>' + r.idx + '. ' + (theme.icon || '') + ' ' + r.name + '</span>' +
        '<span class="side"><span>' + tt('web_exp_map_lv', [r.level]) + '</span>' +
        (biome ? '<span>' + (biome.icon || '') + ' ' + WorldGen.localized(biome, 'name') + '</span>' : '') +
        '<span>' + dist + '</span>' + (r.unlocked ? travelBtn() : '') + '</span>',
        r.unlocked ? '' : 'lock',
        () => this._mapHint((r.unlocked
          ? tt('web_exp_map_dungeon_hint', [r.name, r.level, r.desc])
          : tt('web_exp_map_dungeon_hint_locked', [r.name, r.level, r.desc])) +
          (biome ? ' · ' + (biome.icon || '') + ' ' + WorldGen.localized(biome, 'name') : ''))
      );
      const tb = rowEl.querySelector('.map-travel');
      if (tb && !inDungeon) tb.onclick = e => { e.stopPropagation(); this.fastTravelToGate(r.key); };
    });
    if (World.mode === 'dungeon')
      this._mapHint(tt('web_exp_map_inside', [GameData.dungeons[World.dungeonKey]?.display_name || '']));
  },

  /* ------------------------------ VIAGEM RÁPIDA ------------------------------ */

  /** Inimigos por perto (range de aggro) impedem teleporte para fugir de combate. */
  nearbyEnemies(maxDist = 320) {
    const p = World.player; if (!p) return false;
    return World.enemies.concat(World.bosses).some(e => Math.hypot(e.x - p.x, e.y - p.y) < maxDist);
  },

  /** Viaja rápido para um portal de dungeon desbloqueado (pelo Mapa [M]). */
  fastTravelToGate(key) {
    const gate = World.gates.find(g => g.key === key);
    const d = GameData.dungeons[key];
    if (!gate || !d) return;
    if (!State.dungeonUnlocked(key)) { this.toast(tt('web_exp_map_travel_locked', [d.display_name])); SFX.error(); return; }
    if (World.mode === 'dungeon') { this.toast(tt('web_exp_map_travel_blocked_dungeon')); SFX.error(); return; }
    if (this.nearbyEnemies()) { this.toast(tt('web_exp_map_travel_blocked_enemies')); SFX.error(); return; }
    const pos = World.spotNear(gate.tx, gate.ty);
    World.player.x = pos.x; World.player.y = pos.y;
    World.camera.x = pos.x; World.camera.y = pos.y;
    this.toggleBigMap(); // fecha o mapa e despausa
    SFX.portal(); this.flash('lvflash');
    this.toast(tt('web_exp_map_travel_toast', [d.display_name]));
    this.savePos(); State.save();
  },

  /** Viaja rápido para qualquer cidade/reino do mapa. */
  fastTravelToSettlement(key) {
    const st = WorldGen.settlement(key);
    if (!st) return;
    if (World.mode === 'dungeon') { this.toast(tt('web_exp_map_travel_blocked_dungeon')); SFX.error(); return; }
    if (this.nearbyEnemies()) { this.toast(tt('web_exp_map_travel_blocked_enemies')); SFX.error(); return; }
    const p = World.player;
    let placed = false;
    for (let d = 0; d < st.r && !placed; d++) {
      for (const [ox, oy] of [[0, d], [d, 0], [0, -d], [-d, 0], [d, d], [-d, d], [d, -d], [-d, -d]]) {
        const tx = st.x + ox, ty = st.y + oy;
        if (!World.solidTile(tx, ty)) { p.x = tx * TILE + TILE / 2; p.y = ty * TILE + TILE / 2; placed = true; break; }
      }
    }
    World.camera.x = p.x; World.camera.y = p.y;
    this.toggleBigMap();
    SFX.portal(); this.flash('lvflash');
    this.toast(tt('web_exp_map_travel_toast', [WorldGen.localized(st, 'name')]));
    this.savePos(); State.save();
  },

  /** Viaja rápido de volta à capital. */
  fastTravelToCity() {
    if (World.mode === 'dungeon') { this.toast(tt('web_exp_map_travel_blocked_dungeon')); SFX.error(); return; }
    if (this.nearbyEnemies()) { this.toast(tt('web_exp_map_travel_blocked_enemies')); SFX.error(); return; }
    const p = World.player;
    p.x = World.PORTAL.x * TILE + 16; p.y = World.PORTAL.y * TILE + 16 + TILE;
    World.camera.x = p.x; World.camera.y = p.y;
    this.toggleBigMap(); // fecha o mapa e despausa
    SFX.portal(); this.flash('lvflash');
    this.toast(tt('web_exp_map_travel_city_toast'));
    this.savePos(); State.save();
  },

  _mapHint(txt) { document.getElementById('maphint').innerHTML = txt; },

  buildTabs() {
    const el = document.getElementById('tabs');
    if (!el) return;
    el.innerHTML = '';
    this.TABS.forEach((t, i) => {
      const b = document.createElement('div');
      b.className = 'tab' + (i === 0 ? ' active' : '');
      b.textContent = this.tabLabel(t[0]); b.dataset.id = t[0];
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
  /** Rótulo localizado de uma aba (literais explícitos para o gerador de locales). */
  tabLabel(id) {
    switch (id) {
      case 'skills': return tt('web_exp_tab_skills');
      case 'equip': return tt('web_exp_tab_equip');
      case 'forge': return tt('web_exp_tab_forge');
      case 'fletch': return tt('web_exp_tab_fletch');
      case 'craft': return tt('web_exp_tab_craft');
      case 'cook': return tt('web_exp_tab_cook');
      case 'herb': return tt('web_exp_tab_herb');
      case 'runes': return tt('web_exp_tab_runes');
      case 'build': return tt('web_exp_tab_build');
      case 'trade': return tt('web_exp_tab_trade');
      case 'pray': return tt('web_exp_tab_pray');
      case 'magic': return tt('web_exp_tab_magic');
      case 'farm': return tt('web_exp_tab_farm');
      case 'slayer': return tt('web_exp_tab_slayer');
      case 'shop': return tt('web_exp_tab_shop');
      case 'codex': return tt('web_exp_tab_codex');
      default: return id;
    }
  },
  renderTab(id) {
    const el = document.getElementById('tab-' + id);
    if (!el) return;
    el.innerHTML = '';
    const fn = {
      skills: t => this.rSkills(t), equip: t => this.rEquip(t), forge: t => this.rForge(t),
      fletch: t => this.rRecipes(t, 'fletching'), craft: t => this.rRecipes(t, 'crafting'),
      cook: t => this.rCook(t), herb: t => this.rRecipes(t, 'herblore'), runes: t => this.rRunes(t),
      build: t => this.rBuild(t), trade: t => this.rTrade(t),
      pray: t => this.rPray(t), magic: t => this.rMagic(t), farm: t => this.rFarm(t),
      slayer: t => this.rSlayer(t), shop: t => this.rShop(t), codex: t => this.rCodex(t),
    }[id];
    if (fn) fn(el);
  },

  rowEl(html) { const d = document.createElement('div'); d.className = 'row'; d.innerHTML = html; return d; },
  section(el, txt) { const d = document.createElement('div'); d.innerHTML = '<div class="section-head">' + txt + '</div>'; el.appendChild(d); return d; },

  /* ---- Skills ---- */
  rSkills(el) {
    this.section(el, tt('web_exp_skills_title', [State.totalLevel()]));
    const bonus = State.blessingXpMultiplier(), boost = State.xpBoostActive();
    if (bonus > 1 || boost) {
      const info = this.rowEl('<span class="nm">' + (boost ? tt('web_exp_skills_boost') : tt('web_exp_skills_blessing')) + '</span><span class="side"><span class="ok">' + tt('web_exp_skills_xp_mult', [(bonus * (boost ? 2 : 1)).toFixed(2)]) + '</span></span>');
      el.appendChild(info);
    }
    for (const def of GameData.skillDefs) {
      const lvl = State.level(def.key), cur = State.xp(def.key);
      const nxt = lvl >= 99 ? cur : Sim.xpForLevel(lvl + 1), prv = Sim.xpForLevel(lvl);
      const pct = lvl >= 99 ? 100 : Math.round((cur - prv) / (nxt - prv) * 100);
      const pet = State.petBoost(def.key);
      const d = this.rowEl('<span class="nm">' + def.icon + ' ' + EXP.skillName(def.key) +
        ' <span class="catg">[' + EXP.groupName(def.group) + ']</span></span>' +
        '<span class="side"><span>' + tt('web_exp_lv', [lvl]) + '</span>' + (pet ? '<span class="ok">🐾+' + pet + '%</span>' : '') +
        '<div class="lvlbar"><i style="width:' + pct + '%"></i></div></span>');
      d.title = def.desc;
      el.appendChild(d);
    }
    const note = this.rowEl('<span class="nm">' + tt('web_exp_skills_note') + '</span><span class="side"><span>' + tt('web_exp_skills_note_side') + '</span></span>');
    el.appendChild(note);
  },

  /* ---- Equipar ---- */
  rEquip(el) {
    const b = State.combatBonuses();
    this.section(el, tt('web_exp_equip_bonuses', [b.attack, b.strength, b.defense, b.rangedAttack, b.magicAttack]));
    for (const slot of [...State.SLOTS(), ...State.TOOL_SLOTS()]) {
      const key = State.equippedItem(slot);
      const eq = key ? GameData.equipment[key] : null;
      const stats = eq ? [
        eq.attack_bonus ? 'Atq ' + eq.attack_bonus : null, eq.strength_bonus ? 'For ' + eq.strength_bonus : null,
        eq.defense_bonus ? 'Def ' + eq.defense_bonus : null, eq.ranged_attack_bonus ? 'Dist ' + eq.ranged_attack_bonus : null,
        eq.magic_attack_bonus ? 'Mag ' + eq.magic_attack_bonus : null,
        eq[slot.split('_')[0] + '_efficiency'] ? '×' + eq[slot.split('_')[0] + '_efficiency'] : null,
      ].filter(Boolean).join(' · ') : '';
      const d = this.rowEl('<span class="nm">' + (eq ? '▫️ ' + eq.display_name : '▪️ ' + tt('web_exp_equip_empty', [EXP.slotName(slot)])) + '</span>' +
        '<span class="side">' + (stats ? '<span>' + stats + '</span>' : '') +
        (key ? '<button class="buybtn uneq">' + tt('web_exp_equip_unequip') + '</button>' : '') + '</span>');
      const btn = d.querySelector('button');
      if (btn) btn.onclick = () => { State.unequip(slot); State.save(); SFX.buy(); this.renderTab('equip'); };
      el.appendChild(d);
    }
    // equipáveis no inventário
    this.section(el, tt('web_exp_equip_in_inventory'));
    const owned = Object.entries(State.state.inventory).filter(([k]) => GameData.equipment[k]);
    if (!owned.length) { el.appendChild(this.rowEl('<span class="nm" style="color:var(--muted)">' + tt('web_exp_equip_nothing') + '</span>')); return; }
    for (const [key] of owned) {
      const eq = GameData.equipment[key];
      const ok = State.meetsRequirements(key);
      const d = this.rowEl('<span class="nm">' + eq.display_name + ' <span class="catg">[' + EXP.slotName(eq.slot) + ']</span></span>' +
        '<span class="side">' + (ok ? '<button class="buybtn equip">' + tt('web_exp_equip_equip') + '</button>' : '<span class="lock">' + tt('web_exp_equip_req') + '</span>') + '</span>');
      const btn = d.querySelector('button');
      if (btn) btn.onclick = () => {
        const err = State.equip(key);
        if (err) { this.toast(err); SFX.error(); } else { SFX.buy(); this.toast(tt('web_exp_toast_equipped', [eq.display_name])); }
        State.save(); this.renderTab('equip');
      };
      el.appendChild(d);
    }
  },

  /* ---- Receitas genéricas (smithing/fletching/crafting/herblore) ---- */
  rForge(el) {
    const all = Object.entries(GameData.recipes.smithing);
    this.rRecipeList(el, 'smithing', all.filter(([, r]) => r.type === 'bar'), tt('web_exp_forge_bars'));
    this.rRecipeList(el, 'smithing', all.filter(([, r]) => r.type === 'equipment'), tt('web_exp_forge_gear'));
    this.rRecipeList(el, 'smithing', all.filter(([, r]) => r.type === 'tool'), tt('web_exp_forge_tools'));
  },
  rRecipes(el, skill) {
    const all = Object.entries(GameData.recipes[skill]);
    const titles = {
      fletching: tt('web_exp_recipe_fletching'), crafting: tt('web_exp_recipe_crafting'),
      herblore: tt('web_exp_recipe_herblore'),
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
      const d = this.rowEl('<span class="nm">' + outName + ' <span class="catg">' + tt('web_exp_lv', [r.level_required || 1]) + (r.output_quantity > 1 ? ' · x' + r.output_quantity : '') + '</span></span>' +
        '<span class="side">' + matsHtml + '<button class="buybtn' + (lvlOk && matsOk ? '' : ' disabled') + '">' + tt('web_exp_btn_craft') + '</button></span>');
      d.querySelector('button').onclick = () => {
        if (!lvlOk || !matsOk) { SFX.error(); return; }
        for (const [m, n] of Object.entries(r.materials || {})) State.removeItem(m, n);
        State.addItem(outKey, r.output_quantity || 1);
        // martelo acelera a família smith/fletch/craft/construction (como o Hub)
        const eff = ['smithing', 'fletching', 'crafting', 'construction'].includes(skill)
          ? State.toolEfficiency('hammer', 'smithing', r.level_required || 1) : 1;
        XPGain.withPet(skill, Math.floor((r.xp_per_item || 0) * eff));
        QuestFeed.craft(skill, outKey, r.output_quantity || 1);
        Systems.recordGuildCrafting?.(skill, { [outKey]: r.output_quantity || 1 });
        SFX.buy(); State.save(); this.renderTab(document.querySelector('.tab.active').dataset.id);
      };
      el.appendChild(d);
    }
  },

  /* ---- Cozinha ---- */
  rCook(el) {
    this.section(el, tt('web_exp_cook_title'));
    for (const [key, r] of Object.entries(GameData.recipes.cooking).sort((a, b) => a[1].level_required - b[1].level_required)) {
      const lvlOk = State.level('cooking') >= r.level_required;
      const has = State.count(r.raw_item) > 0;
      const d = this.rowEl('<span class="nm">🍖 ' + r.display_name + ' <span class="catg">' + tt('web_exp_lv', [r.level_required]) + ' · +' + r.healing_value + ' HP</span></span>' +
        '<span class="side"><span class="' + (has ? 'ok' : 'lock') + '">' + State.count(r.raw_item) + '× ' + GameData.name(r.raw_item) + '</span>' +
        '<button class="buybtn' + (lvlOk && has ? '' : ' disabled') + '">' + tt('web_exp_btn_cook') + '</button></span>');
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
    this.section(el, tt('web_exp_cook_fire_title'));
    for (const [logKey, log] of Object.entries(GameData.logs)) {
      const ashKey = GameData.ashByLog[logKey];
      if (!ashKey) continue;
      const lvlOk = State.level('firemaking') >= log.level_required;
      const has = State.count(logKey) > 0;
      const d = this.rowEl('<span class="nm">🔥 ' + GameData.name(logKey) + ' <span class="catg">' + tt('web_exp_lv', [log.level_required]) + ' → ' + GameData.name(ashKey) + '</span></span>' +
        '<span class="side"><span class="' + (has ? 'ok' : 'lock') + '">' + State.count(logKey) + '×</span>' +
        '<button class="buybtn' + (lvlOk && has ? '' : ' disabled') + '">' + tt('web_exp_btn_burn') + '</button></span>');
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
    this.section(el, tt('web_exp_runes_title'));
    const lvl = State.level('runecrafting');
    const mult = lvl >= 75 ? 3 : lvl >= 50 ? 2 : 1;
    el.appendChild(this.rowEl('<span class="nm">' + tt('web_exp_runes_mult') + '</span><span class="side"><span class="' + (mult > 1 ? 'ok' : '') + '">' + tt('web_exp_runes_x', [mult]) + (mult > 1 ? '' : tt('web_exp_runes_mult_hint')) + '</span></span>'));
    for (const [key, r] of Object.entries(GameData.runes).sort((a, b) => a[1].level_required - b[1].level_required)) {
      const lvlOk = lvl >= r.level_required;
      const cost = r.essence_cost || 1;
      const has = State.count('rune_essence') >= cost;
      const d = this.rowEl('<span class="nm">🔮 ' + r.display_name + ' <span class="catg">' + tt('web_exp_lv', [r.level_required]) + ' ' + (mult > 1 ? tt('web_exp_runes_many', [mult]) : tt('web_exp_runes_one', [mult])) + '</span></span>' +
        '<span class="side"><span class="' + (has ? 'ok' : 'lock') + '">' + tt('web_exp_runes_essence', [cost, State.count('rune_essence')]) + '</span>' +
        '<button class="buybtn' + (lvlOk && has ? '' : ' disabled') + '">' + tt('web_exp_btn_craft') + '</button></span>');
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

  /* ---- Construção ---- */
  rBuild(el) {
    this.section(el, tt('web_exp_build_title'));
    const entries = Object.entries(GameData.recipes.construction);
    this.rRecipeList(el, 'construction', entries, tt('web_exp_build_recipes'));
    el.appendChild(this.rowEl('<span class="nm" style="color:var(--muted)">' + tt('web_exp_build_note') + '</span>'));
  },

  /* ---- Comércio (Mercantile) ---- */
  rTrade(el) {
    this.section(el, tt('web_exp_trade_title'));
    const list = Trade.load();
    if (list.length) {
      for (const c of list) {
        const r = GameData.tradeRoutes[c.key];
        const left = c.returnsAt - Date.now();
        el.appendChild(this.rowEl('<span class="nm">' + tt('web_exp_trade_traveling', [r ? r.display_name : c.key]) + '</span>' +
          '<span class="side"><span class="ok">' + tt('web_exp_trade_back_in', [Util.fmtTime(left)]) + '</span></span>'));
      }
    } else {
      el.appendChild(this.rowEl('<span class="nm" style="color:var(--muted)">' + tt('web_exp_trade_none') + '</span>'));
    }
    for (const r of GameData.tradeRouteList) {
      const lvlOk = State.level('mercantile') >= r.level_required;
      const can = lvlOk && State.state.coins >= r.coin_cost && list.length < Trade.MAX_CARAVANS;
      const d = this.rowEl('<span class="nm">🛒 ' + r.display_name + ' <span class="catg">' + tt('web_exp_lv', [r.level_required]) + '</span></span>' +
        '<span class="side"><span class="' + (State.state.coins >= r.coin_cost ? 'ok' : 'lock') + '">' + Util.fmt(r.coin_cost) + ' 🪙</span>' +
        '<button class="buybtn' + (can ? '' : ' disabled') + '">' + tt('web_exp_btn_dispatch') + '</button></span>' +
        '<div class="dsc">' + (r.description || '') + '</div>');
      d.querySelector('button').onclick = () => { Trade.dispatch(r.id || r.name || GameData.tradeRouteList.find(x => x === r)?.id); this.renderTab('trade'); };
      el.appendChild(d);
    }
  },

  /* ---- Orações ---- */
  rPray(el) {
    const bless = State.activeBlessing();
    this.section(el, tt('web_exp_pray_title'));
    if (bless) {
      const left = State.state.church.blessingExpiresAt - Date.now();
      el.appendChild(this.rowEl('<span class="nm">' + tt('web_exp_pray_active', [GameData.blessingName(bless)]) + '</span>' +
        '<span class="side"><span class="ok">' + bless.type + ' · ' + Util.fmtTime(left) + '</span></span>'));
    } else {
      el.appendChild(this.rowEl('<span class="nm" style="color:var(--muted)">' + tt('web_exp_pray_none') + '</span>'));
    }
    for (const b of EXP.BONES) {
      const have = State.count(b.key);
      if (!have) continue;
      const mk = (label, n) => {
        const d = this.rowEl('<span class="nm">🦴 ' + b.name + ' <span class="catg">+' + b.xp + ' XP' + (b.ash ? tt('web_exp_pray_ash') : '') + '</span></span>' +
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
      el.appendChild(mk(tt('web_exp_btn_scatter'), 1));
      if (have >= 10) { const d10 = mk('×10', 10); d10.querySelector('.nm').style.opacity = 0; d10.querySelector('span.side span').remove(); el.replaceChild(mk(tt('web_exp_btn_scatter10'), 10), d10); }
      if (have >= 50) el.appendChild(mk(tt('web_exp_btn_scatter_all'), 9999));
    }
    if (!EXP.BONES.some(b => State.count(b.key) > 0))
      el.appendChild(this.rowEl('<span class="nm" style="color:var(--muted)">' + tt('web_exp_pray_no_bones') + '</span>'));
  },

  /* ---- Magias ---- */
  rMagic(el) {
    this.section(el, tt('web_exp_magic_title'));
    for (const s of EXP.SPELLS) {
      const on = State.state.activeSpell === s.key;
      const lvlOk = State.level('magic') >= s.lvl;
      const runes = State.count(s.rune);
      const d = this.rowEl('<span class="nm">' + (on ? '★ ' : '') + s.name + ' <span class="catg">' + tt('web_exp_lv', [s.lvl]) + '</span></span>' +
        '<span class="side"><span>' + tt('web_exp_magic_max', [s.max]) + '</span>' +
        '<span class="' + (runes >= s.cost ? 'ok' : 'lock') + '">' + s.cost + '× ' + GameData.name(s.rune) + '</span>' +
        '<button class="buybtn' + (on ? ' equip' : '') + (lvlOk ? '' : ' disabled') + '">' + (on ? tt('web_exp_magic_active') : tt('web_exp_magic_use')) + '</button></span>');
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
    this.section(el, tt('web_exp_farm_title'));
    const n = State.patchCount();
    for (let i = 1; i <= 5; i++) {
      const patch = State.state.farmingPatches[i - 1];
      if (i > n) { el.appendChild(this.rowEl('<span class="nm">' + tt('web_exp_farm_patch', [i]) + '</span><span class="side"><span class="lock">' + tt('web_exp_farm_req', [i === 4 ? 20 : 40]) + '</span></span>')); continue; }
      if (!patch) {
        el.appendChild(this.rowEl('<span class="nm">' + tt('web_exp_farm_empty', [i]) + '</span><span class="side"><span class="ok">' + tt('web_exp_farm_plant_below') + '</span></span>'));
        continue;
      }
      const crop = GameData.crops[patch.crop];
      if (Systems.cropReady(patch)) {
        const d = this.rowEl('<span class="nm">' + tt('web_exp_farm_ready', [crop.display_name]) + '</span><span class="side"><button class="buybtn equip">' + tt('web_exp_btn_harvest') + '</button></span>');
        d.querySelector('button').onclick = () => { this.harvest(i); this.renderTab('farm'); };
        el.appendChild(d);
      } else {
        el.appendChild(this.rowEl('<span class="nm">🌱 ' + crop.display_name + ' (' + (patch.fert ? tt('web_exp_farm_with_ash') : tt('web_exp_farm_without_ash')) + ')</span><span class="side"><span>' + Util.fmtTime(Systems.patchTimeLeftMs(patch)) + '</span></span>'));
      }
    }
    // semear
    this.section(el, tt('web_exp_farm_sow'));
    let any = false;
    const emptyIdx = (() => { for (let i = 0; i < n; i++) if (!State.state.farmingPatches[i]) return i; return -1; })();
    for (const [cropId, crop] of Object.entries(GameData.crops)) {
      const seedKey = crop.seed_name || cropId;
      const have = State.count(seedKey);
      if (have < 1) continue;
      any = true;
      const lvlOk = State.level('farming') >= (crop.farming_level_required || 1);
      const hasAsh = Object.keys(Systems.ASH_YIELD).some(k => State.count(k) > 0);
      const d = this.rowEl('<span class="nm">' + (crop.emoji || '🌱') + ' ' + crop.display_name + ' <span class="catg">' + tt('web_exp_lv', [crop.farming_level_required || 1]) + ' · ' + crop.growth_time_hours + 'h</span></span>' +
        '<span class="side"><span class="ok">' + tt('web_exp_farm_seeds', [have]) + '</span>' +
        (emptyIdx >= 0 ? '<button class="buybtn' + (lvlOk ? '' : ' disabled') + '">' + tt('web_exp_btn_plant') + '</button>' +
          (hasAsh ? '<button class="buybtn equip' + (lvlOk ? '' : ' disabled') + '">' + tt('web_exp_btn_plant_ash') + '</button>' : '') : '<span class="lock">' + tt('web_exp_farm_no_patch') + '</span>') +
        '</span>');
      const btns = d.querySelectorAll('button');
      if (btns[0]) btns[0].onclick = () => this.plant(emptyIdx + 1, cropId, false);
      if (btns[1]) btns[1].onclick = () => this.plant(emptyIdx + 1, cropId, true);
      el.appendChild(d);
    }
    if (!any) el.appendChild(this.rowEl('<span class="nm" style="color:var(--muted)">' + tt('web_exp_farm_no_seeds') + '</span>'));
  },
  plant(patchNumber, cropId, useAsh) {
    const r = Systems.plantCrop(patchNumber, cropId, useAsh);
    if (r.error) { this.toast(r.error); SFX.error(); return; }
    this.toast(tt('web_exp_toast_planted')); SFX.buy(); this.renderTab('farm');
  },

  /* ---- Slayer ---- */
  rSlayer(el) {
    this.section(el, tt('web_exp_slayer_title', [State.state.slayer?.points || 0]));
    const task = State.state.slayer?.activeTask;
    if (task) {
      const e = GameData.enemies[task.enemyKey];
      el.appendChild(this.rowEl('<span class="nm">' + tt('web_exp_slayer_task', [task.targetKills, e ? e.display_name : task.enemyKey]) +
        '</span><span class="side"><span class="ok">' + task.killsCompleted + '/' + task.targetKills + '</span>' +
        '<span>' + tt('web_exp_slayer_xp', [task.xpPerKill]) + '</span><span>' + tt('web_exp_slayer_pts', [task.taskPoints]) + '</span></span>'));
      el.appendChild(this.rowEl('<span class="nm" style="color:var(--muted)">' + tt('web_exp_slayer_note') + '</span>'));
    } else {
      const d = this.rowEl('<span class="nm">' + tt('web_exp_slayer_new') + '</span><span class="side"><button class="buybtn">' + tt('web_exp_btn_accept') + '</button></span>');
      d.querySelector('button').onclick = () => {
        const r = Systems.assignTask();
        if (r.error) { this.toast(r.error); SFX.error(); } else { SFX.buy(); this.renderTab('slayer'); }
      };
      el.appendChild(d);
    }
    const d2 = this.rowEl('<span class="nm">' + tt('web_exp_slayer_foretell') + '</span><span class="side"><button class="buybtn">' + tt('web_exp_btn_foretell') + '</button></span>');
    d2.querySelector('button').onclick = () => {
      const r = Systems.foretelTask();
      if (r.error) { this.toast(r.error); SFX.error(); } else { SFX.buy(); this.renderTab('slayer'); }
    };
    el.appendChild(d2);
    const d3 = this.rowEl('<span class="nm">' + tt('web_exp_slayer_skip', [Systems.SLAYER_SKIP_COST]) + '</span><span class="side"><button class="buybtn">' + tt('web_exp_btn_skip') + '</button></span>');
    d3.querySelector('button').onclick = () => {
      const r = Systems.skipTask();
      if (r.error) { this.toast(r.error); SFX.error(); } else { this.renderTab('slayer'); }
    };
    el.appendChild(d3);
    // loja de pontos
    this.section(el, tt('web_exp_slayer_shop'));
    for (const entry of (Systems.SLAYER_SHOP || [])) {
      const can = (State.state.slayer?.points || 0) >= entry.cost;
      const name = entry.xp ? tt('web_exp_slayer_lamp', [Util.fmt(entry.xp)]) : GameData.name(entry.key);
      const d = this.rowEl('<span class="nm">🏅 ' + name + '</span><span class="side"><span>' + tt('web_exp_slayer_pts', [entry.cost]) + '</span>' +
        '<button class="buybtn' + (can ? '' : ' disabled') + '">' + tt('web_exp_btn_buy') + '</button></span>');
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
    this.section(el, tt('web_exp_shop_title', [Util.fmt(State.state.coins)]));
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
    this.section(el, tt('web_exp_shop_extras'));
    const boost = Engine.XP_BOOST;
    const d = this.rowEl('<span class="nm">' + tt('web_exp_shop_boost') + '</span><span class="side"><span class="' + (State.state.coins >= boost.price ? 'ok' : 'lock') + '">' + Util.fmt(boost.price) + ' 🪙</span>' +
      (State.xpBoostActive() ? '<span class="ok">' + tt('web_exp_shop_boost_active') + '</span>' : '<button class="buybtn">' + tt('web_exp_btn_activate') + '</button>') + '</span>');
    const bbtn = d.querySelector('button');
    if (bbtn) bbtn.onclick = () => {
      const r = Engine.buyXpBoost();
      if (r.error) { this.toast(r.error); SFX.error(); } else { this.toast(tt('web_exp_toast_xp_boost')); SFX.levelup(); }
      this.renderTab('shop');
    };
    el.appendChild(d);
    // vender
    this.section(el, tt('web_exp_shop_sell'));
    const sellable = Object.entries(State.state.inventory)
      .filter(([k, v]) => !Object.values(State.state.equipped).includes(k))
      .sort((a, b) => Engine.sellPrice(b[0]) * b[1] - Engine.sellPrice(a[0]) * a[1]);
    if (!sellable.length) el.appendChild(this.rowEl('<span class="nm" style="color:var(--muted)">' + tt('web_exp_shop_nothing') + '</span>'));
    for (const [key, qty] of sellable.slice(0, 40)) {
      const price = Engine.sellPrice(key);
      const d = this.rowEl('<span class="nm">' + GameData.name(key) + ' ×' + qty + '</span>' +
        '<span class="side"><span class="ok">' + tt('web_exp_shop_per_unit', [price]) + '</span>' +
        '<button class="buybtn" data-q="1">' + tt('web_exp_btn_sell1') + '</button><button class="buybtn" data-q="all">' + tt('web_exp_btn_sell_all') + '</button></span>');
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
    this.section(el, tt('web_exp_codex_dungeons', [Object.keys(GameData.dungeons).length]));
    for (const d of GameData.dungeonList()) {
      const unlocked = State.dungeonUnlocked(d.name);
      const runs = State.state.stats.dungeonRuns?.[d.name] || 0;
      const pool = (d.enemy_spawns || []).map(s => GameData.enemies[s.enemy]?.display_name || s.enemy).slice(0, 4).join(', ');
      const el2 = this.rowEl('<span class="nm">' + (unlocked ? '🏰' : '🔒') + ' ' + d.display_name +
        ' <span class="catg">' + tt('web_exp_lv', [d.recommended_level || 1]) + (d.safe_zone ? tt('web_exp_codex_safe') : '') + '</span></span>' +
        '<span class="side"><span class="' + (unlocked ? 'ok' : 'lock') + '">' + (unlocked ? tt('web_exp_codex_runs', [runs]) : tt('web_exp_codex_sealed')) + '</span></span>' +
        '<div class="dsc">' + (d.description || '') + '<br><i>' + pool + '</i></div>');
      el.appendChild(el2);
    }
    this.section(el, tt('web_exp_codex_raids'));
    for (const r of EXP.RAIDS) {
      const kills = State.state.stats.bossKillsByBoss?.[r.key] || 0;
      const ok = EXP.combatLevel() >= r.combat_level_required - 10;
      const d = this.rowEl('<span class="nm">' + (r.emoji || '🐉') + ' ' + r.display_name + ' <span class="catg">' + tt('web_exp_codex_combat_req', [r.combat_level_required]) + '</span></span>' +
        '<span class="side"><span>' + tt('web_exp_codex_hp', [r.hp]) + '</span><span>' + tt('web_exp_codex_kills', [kills]) + '</span>' +
        '<button class="buybtn' + (ok ? '' : ' disabled') + '">' + tt('web_exp_btn_challenge') + '</button></span>' +
        '<div class="dsc">' + (r.description || '') + '</div>');
      d.querySelector('button').onclick = () => Dungeons.challenge(r.key);
      el.appendChild(d);
    }
    this.section(el, tt('web_exp_codex_bestiary', [Object.keys(GameData.enemies).length]));
    for (const [key, e] of Object.entries(GameData.enemies)) {
      const kills = State.state.stats.killsByEnemy?.[key] || 0;
      el.appendChild(this.rowEl('<span class="nm">🗡️ ' + e.display_name + '</span><span class="side"><span>' + tt('web_exp_codex_hp', [e.hp]) + '</span><span>' + tt('web_exp_codex_xp', [e.xp_drops?.combat || 0]) + '</span><span>' + tt('web_exp_codex_kills', [kills]) + '</span></span>'));
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
    // fila do Queue Master: auto-avanço ~1x/s (mesma regra do Hub)
    if (now - this._lastQueueTick > 1000) { this._lastQueueTick = now; this.queueTick(); }
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
          if (ra && ra.kind === 'tree') this.drawSprite(ctx, this.treeSprite(EXP.TREE_COLORS[EXP.TREES[ra.id].key], true, ra.style), tx * TILE + TILE / 2, ty * TILE + TILE / 2, ox, oy, 0.7);
        }
      }
      this.drawTown(ctx, ox, oy);
      this.drawGates(ctx, ox, oy);
      this.drawObstacles(ctx, ox, oy);
      for (const npc of World.npcs) this.drawEnemy(ctx, npc, ox, oy, '#8fd8ff');
    } else {
      // adereços do tema (colunas, tochas, teias, lava, tendas…)
      EXPART.drawProps(ctx, ox, oy, this.screenW, this.screenH);
      // saída da dungeon
      this.drawSprite(ctx, this.portalSpr, TILE / 2 + 6, TILE / 2 + 6, ox, oy, 1);
      const t = tt('web_exp_interact_dungeon_exit', ['']).replace(/\s*—\s*$/, '');
      ctx.font = 'bold 11px "Courier New"'; ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd97a'; ctx.fillText(t, TILE / 2 + 6 - ox, TILE / 2 - 26 - oy);
    }
    for (const e of World.enemies) this.drawEnemy(ctx, e, ox, oy);
    for (const e of World.bosses) this.drawEnemy(ctx, e, ox, oy, '#f6c453');
    this.drawPlayer(ctx, ox, oy);
    this.drawAmbient(ctx, ox, oy);
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
    if (World.mode === 'dungeon') EXPART.drawDungeonFog(ctx, this.screenW, this.screenH);
    this.drawBiomeBanner(ctx);
    this.drawMinimap(ctx);
  },

  /** Partículas de clima (neve, brasas, esporos, areia, vaga-lumes…). */
  drawAmbient(ctx, ox, oy) {
    for (const a of World.ambient) {
      const x = a.x - ox, y = a.y - oy;
      if (x < -20 || y < -20 || x > this.screenW + 20 || y > this.screenH + 20) continue;
      ctx.globalAlpha = XU.clamp(a.life / (a.maxLife * 0.5), 0, 1) * (a.kind === 'firefly' ? 0.5 + 0.5 * Math.sin(World.time * 4 + a.seed) : 0.85);
      ctx.fillStyle = a.color;
      if (a.kind === 'cloud' || a.kind === 'shade') {
        ctx.beginPath(); ctx.ellipse(x, y, a.size * 3, a.size * 1.4, 0, 0, 7); ctx.fill();
      } else if (a.kind === 'bubble') {
        ctx.beginPath(); ctx.arc(x, y, a.size, 0, 7); ctx.stroke ? (ctx.strokeStyle = a.color, ctx.stroke()) : ctx.fill();
      } else if (a.kind === 'sunray') {
        ctx.fillRect(x, y, 2, a.size * 6);
      } else {
        ctx.fillRect(x, y, a.size, a.size);
      }
    }
    ctx.globalAlpha = 1;
  },

  /** Faixa discreta com o bioma/região atual — orienta o jogador no mapa. */
  drawBiomeBanner(ctx) {
    const p = World.player; if (!p) return;
    const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
    let title, sub;
    if (World.mode === 'dungeon') {
      const d = GameData.dungeons[World.dungeonKey];
      const th = World.dungeonTheme();
      title = (th?.icon || '🗡️') + ' ' + (d?.display_name || '');
      sub = tt('web_exp_theme_' + (th?.pal || 'cave'), null, th?.pal || '');
    } else {
      const st = World.settlementAt(tx, ty, 2);
      const b = World.biomeAt(tx, ty);
      const reg = World.regionAt(tx, ty);
      title = st ? st.icon + ' ' + WorldGen.localized(st, 'name') : (b.icon || '') + ' ' + WorldGen.localized(b, 'name');
      sub = reg ? WorldGen.localized(reg, 'name') : '';
    }
    if (this._bannerTxt !== title) { this._bannerTxt = title; this._bannerT = World.time; }
    const age = World.time - (this._bannerT || 0);
    if (age > 4.5) return;
    const alpha = XU.clamp(Math.min(age * 3, (4.5 - age) * 2), 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.font = 'bold 20px "Courier New"';
    const w = Math.max(ctx.measureText(title).width, sub ? ctx.measureText(sub).width : 0) + 40;
    const cx = this.screenW / 2, cy = this.screenH - 92;
    ctx.fillStyle = 'rgba(10,13,23,.55)'; ctx.fillRect(cx - w / 2, cy - 26, w, sub ? 46 : 32);
    ctx.strokeStyle = 'rgba(246,196,83,.35)'; ctx.strokeRect(cx - w / 2 + 0.5, cy - 25.5, w - 1, (sub ? 46 : 32) - 1);
    ctx.fillStyle = '#ffd97a'; ctx.fillText(title, cx, cy - 4);
    if (sub) { ctx.font = '11px "Courier New"'; ctx.fillStyle = '#9aa4bd'; ctx.fillText(sub.toUpperCase(), cx, cy + 13); }
    ctx.restore();
  },

  drawTile(ctx, tx, ty, ox, oy) {
    EXPART.drawTile(ctx, tx, ty, ox, oy, this.screenW, this.screenH);
  },

  drawSprite(ctx, spr, wx, wy, ox, oy, alpha) {
    ctx.globalAlpha = alpha || 1;
    ctx.drawImage(spr, wx - spr.width * SCALE / 2 - ox, wy - spr.height * SCALE / 2 - oy, spr.width * SCALE, spr.height * SCALE);
    ctx.globalAlpha = 1;
  },

  treeCache: {}, rockCache: {},
  TREE_ROWS: {
    oak: [".....ggggg......", "...ggGGGGGGg....", "..gGGGGGGGGGGg..", ".gGGGGGGGGGGGGg.", ".GGGDDGGGGGDGGG.", "gGGDDDGGGGDDDGGg", "gGGGGGGGGGGGGGGg", "gGGGGGGGGGGGGGGg", "..gGGGGGGGGGGg..", "...gGGGGGGGGg...", ".....gggggg.....", "......TTTT......", "......TTTT......", ".....TTTTTT.....", ".....TTTTTT.....", "....tttttttt...."],
    pine: [".......GG.......", "......GGGG......", "......gDDg......", ".....GGGGGG.....", "....gGGDDGGg....", "....GGGGGGGG....", "...gGGGDDGGGg...", "..GGGGGGGGGGGG..", "..gGGGGDDGGGGg..", ".GGGGGGGGGGGGGG.", ".gGGGGGGGGGGGGg.", "......TTTT......", "......TTTT......", "......TTTT......", ".....TTTTTT.....", "....tttttttt...."],
    palm: ["...gg......gg...", "..gGGg....gGGg..", ".gGGGGg..gGGGGg.", "gGGGGGGDDGGGGGGg", ".gGGGGgDDgGGGGg.", "...gg..DD..gg...", "......TDDT......", "......TTTT......", ".....TTTTt......", ".....TTTT.......", "....tTTTT.......", "....TTTTt.......", "....TTTT........", "...tTTTT........", "...TTTTt........", "..tttttt........"],
    dead: ["................", "..g...........g.", "...g...TT....g..", "....gg.TT..gg...", "......TTTT......", ".....TTTTTg.....", "....gTTTT.......", "......TTTT......", "....TTTTTT......", "......TTTT......", "......TTTT......", ".....TTTTTT.....", ".....TTTTTT.....", "....TTTTTTTT....", "....tttttttt....", "...tttttttttt..."],
    acacia: ["................", "..gggggggggggg..", ".gGGGGGGGGGGGGg.", "gGGGDDGGGGDDGGGg", ".gGGGGGGGGGGGGg.", "..gggggggggggg..", ".......TT.......", "......TTTT......", "......TTTT......", ".....TTTTTT.....", ".....TTTTTT.....", "....TTTTTTTT....", "....TTTTTTTT....", "...TTTTTTTTTT...", "...tttttttttt...", "..tttttttttttt.."],
  },
  treeSprite(color, stump, style) {
    style = style || 'oak';
    const key = color + (stump ? 's' : '') + style;
    if (this.treeCache[key]) return this.treeCache[key];
    const rows = stump
      ? ["....tttttttt....", "....ttTTTTtt....", "....ttTTTTtt....", ".....tttttt....."]
      : (this.TREE_ROWS[style] || this.TREE_ROWS.oak);
    const trunk = style === 'dead' ? '#5a4736' : style === 'palm' ? '#8a6a3e' : '#7a4f2a';
    const pal = { G: color, g: shadeColor2(color, -18), D: shadeColor2(color, 22), T: trunk, t: shadeColor2(trunk, -22) };
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
    if (res.kind === 'tree') spr = this.treeSprite(EXP.TREE_COLORS[EXP.TREES[res.id].key], false, res.style);
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
    // cidades, reinos e vilas (prédios procedurais + rótulos)
    EXPART.drawSettlements(ctx, ox, oy, this.screenW, this.screenH);

    // poço central
    const wx = World.WELL.x * TILE - ox, wy = World.WELL.y * TILE - oy;
    if (wx > -TILE * 2 && wy > -TILE * 2 && wx < this.screenW + TILE && wy < this.screenH + TILE) {
      ctx.fillStyle = '#8b97a3'; ctx.fillRect(wx + 3, wy + 3, TILE - 6, TILE - 6);
      ctx.fillStyle = '#3a4a5a'; ctx.fillRect(wx + 7, wy + 7, TILE - 14, TILE - 14);
      ctx.fillStyle = '#5b3a1e'; ctx.fillRect(wx + 4, wy - 2, 4, 10); ctx.fillRect(wx + TILE - 8, wy - 2, 4, 10);
      ctx.fillStyle = '#7a4f2a'; ctx.fillRect(wx + 2, wy - 6, TILE - 4, 5);
      ctx.fillStyle = 'rgba(143,216,255,.8)'; ctx.fillRect(wx + TILE / 2 - 1, wy - 14, 2, 6);
    }

    // lampiões com brilho
    for (const lamp of World.LAMPS) {
      const lx = lamp.x * TILE + TILE / 2 - ox, ly = lamp.y * TILE + TILE / 2 - oy;
      if (lx < -TILE || ly < -TILE || lx > this.screenW + TILE || ly > this.screenH + TILE) continue;
      const glow = 0.5 + 0.2 * Math.sin(World.time * 2 + lamp.x);
      ctx.fillStyle = 'rgba(246,196,83,' + (0.10 * glow) + ')';
      ctx.beginPath(); ctx.arc(lx, ly - 14, 26, 0, 7); ctx.fill();
      ctx.fillStyle = '#3a2c20'; ctx.fillRect(lx - 1, ly - 18, 3, 22);
      ctx.fillStyle = '#f6c453'; ctx.fillRect(lx - 3, ly - 26, 7, 9);
      ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(lx - 1, ly - 24, 2, 5);
    }

    // bandeiras nas torres do portão sul
    for (const tx2 of [-2, 2]) {
      const bx = tx2 * TILE + TILE / 2 - ox, by = (World.townR + 1) * TILE - oy;
      if (bx < -TILE || by < -TILE * 2 || bx > this.screenW + TILE || by > this.screenH + TILE) continue;
      ctx.fillStyle = '#5b3a1e'; ctx.fillRect(bx - 1, by - 26, 2, 26);
      const wave = Math.sin(World.time * 3 + tx2) * 2;
      ctx.fillStyle = tx2 < 0 ? '#c0392b' : '#3f8ef0';
      ctx.beginPath();
      ctx.moveTo(bx + 1, by - 26);
      ctx.lineTo(bx + 16, by - 22 + wave);
      ctx.lineTo(bx + 1, by - 16);
      ctx.closePath(); ctx.fill();
    }

    // carroças estacionadas enquanto há caravanas em viagem
    const caravans = (typeof Trade !== 'undefined' ? Trade.load() : []).length;
    for (let i = 0; i < caravans; i++) {
      const cx2 = (World.BUILDINGS[3].x + World.BUILDINGS[3].w / 2) * TILE - ox + (i - 0.5) * 30;
      const cy2 = (World.BUILDINGS[3].y + World.BUILDINGS[3].h + 0.6) * TILE - oy + Math.sin(World.time * 2 + i) * 2;
      if (cx2 < -TILE || cy2 < -TILE || cx2 > this.screenW + TILE || cy2 > this.screenH + TILE) continue;
      ctx.font = '18px serif'; ctx.textAlign = 'center';
      ctx.fillText('🐎', cx2, cy2);
    }
    // Slayer Master
    const smx = World.NPC_HOME.x * TILE + 16 - ox, smy = World.NPC_HOME.y * TILE + 16 - oy;
    if (smx > -60 && smy > -60 && smx < this.screenW + 60 && smy < this.screenH + 60) {
      const sm = Bestiary.spriteFor('slayer_master', 'Slayer Master');
      const spr = (Math.floor(World.time * 2) % 2) ? sm.b : sm.a;
      ctx.fillStyle = 'rgba(0,0,0,.28)';
      ctx.beginPath(); ctx.ellipse(smx, smy + 8, 9, 4, 0, 0, 7); ctx.fill();
      ctx.drawImage(spr, smx - spr.width, smy - spr.height * 2 + 10, spr.width * 2, spr.height * 2);
      ctx.font = '13px serif'; ctx.textAlign = 'center';
      ctx.fillText('🗡️', smx + 14, smy);
      ctx.font = 'bold 11px "Courier New"'; ctx.fillStyle = '#ffd97a';
      ctx.fillText(tt('web_exp_town_label_slayer'), smx, smy - 16);
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

  /** Obstáculos do circuito de agilidade (anel fora da muralha). */
  drawObstacles(ctx, ox, oy) {
    const course = Agility.currentCourse();
    for (const ob of World.obstacles || []) {
      const x = ob.x - ox, y = ob.y - oy;
      if (x < -TILE || y < -TILE || x > this.screenW + TILE || y > this.screenH + TILE) continue;
      if (ob.kind === 'log') {
        ctx.fillStyle = '#7a4f2a'; ctx.fillRect(x - 16, y - 5, 32, 10);
        ctx.fillStyle = '#5b3a1e'; ctx.fillRect(x - 16, y - 5, 32, 3); ctx.fillRect(x - 16, y + 2, 32, 3);
      } else if (ob.kind === 'wall') {
        ctx.fillStyle = '#8b97a3'; ctx.fillRect(x - 14, y - 14, 28, 28);
        ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(x - 14, y - 14, 28, 4); ctx.fillRect(x - 14, y + 2, 28, 4);
      } else if (ob.kind === 'beam') {
        ctx.fillStyle = '#c9a05a'; ctx.fillRect(x - 18, y - 3, 36, 6);
        ctx.fillStyle = '#5b3a1e'; ctx.fillRect(x - 18, y + 3, 4, 8); ctx.fillRect(x + 14, y + 3, 4, 8);
      } else { // pipe
        ctx.fillStyle = '#5a6480'; ctx.fillRect(x - 13, y - 12, 26, 24);
        ctx.fillStyle = '#454e66'; ctx.beginPath(); ctx.ellipse(x, y - 12, 13, 6, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#232733'; ctx.beginPath(); ctx.ellipse(x, y - 12, 8, 3, 0, 0, 7); ctx.fill();
      }
      if (ob.cd > 0) { ctx.globalAlpha = 0.5; ctx.fillStyle = '#fff'; ctx.fillRect(x - 12, y - 12, 24, 24); ctx.globalAlpha = 1; }
    }
    // placa do circuito perto do portão
    const sign = World.obstacles?.[0];
    if (sign) {
      const sx = sign.x - ox, sy = sign.y - oy;
      if (sx > -100 && sx < this.screenW + 100 && sy > -100 && sy < this.screenH + 100) {
        ctx.font = 'bold 10px "Courier New"'; ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(0,0,0,.6)';
        const label = '🤸 ' + course.def.display_name + ' [E]'; // nome do curso vem dos dados
        const w = ctx.measureText(label).width + 10;
        ctx.fillRect(sx - w / 2, sy - 34, w, 15);
        ctx.fillStyle = '#8fd8ff'; ctx.fillText(label, sx, sy - 23);
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
        const label = (unlocked ? '' : '🔒 ') + d.display_name + ' · ' + tt('web_exp_map_lv', [d.recommended_level || 1]);
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
    const size = 132, half = size / 2, mx = this.screenW - size - 14, my = 14;
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(10,13,23,0.78)';
    ctx.fillRect(mx - 4, my - 4, size + 8, size + 8);
    ctx.strokeStyle = 'rgba(246,196,83,.35)'; ctx.strokeRect(mx - 3.5, my - 3.5, size + 7, size + 7);
    const scl = 3.2, r = Math.floor(half / scl);
    const pcx = Math.floor(World.player.x / TILE), pcy = Math.floor(World.player.y / TILE);
    const dungeon = World.mode === 'dungeon';
    for (let ty = pcy - r; ty <= pcy + r; ty++) for (let tx = pcx - r; tx <= pcx + r; tx++) {
      const px = mx + half + (tx - pcx) * scl, py = my + half + (ty - pcy) * scl;
      ctx.fillStyle = EXPART.mapColor(tx, ty, dungeon);
      ctx.fillRect(px, py, scl, scl);
      if (!dungeon) {
        const key = tx + ',' + ty;
        if (World.resources.has(key)) { ctx.fillStyle = World.resources.get(key).kind === 'tree' ? '#2f6a2f' : '#c9a05a'; ctx.fillRect(px + scl * 0.2, py + scl * 0.2, scl * 0.6, scl * 0.6); }
        if (World.buildingAt(tx, ty)) { ctx.fillStyle = '#e0c48a'; ctx.fillRect(px, py, scl, scl); }
      }
    }
    ctx.fillStyle = '#e05252';
    for (const e of World.enemies.concat(World.bosses)) {
      const ex = mx + half + (e.x / TILE - pcx) * scl, ey = my + half + (e.y / TILE - pcy) * scl;
      if (ex > mx - 2 && ex < mx + size + 2 && ey > my - 2 && ey < my + size + 2) ctx.fillRect(ex - 1.5, ey - 1.5, 3, 3);
    }
    if (!dungeon) {
      for (const g of World.gates) {
        const gx = mx + half + (g.x / TILE - pcx) * scl, gy = my + half + (g.y / TILE - pcy) * scl;
        if (gx > mx - 2 && gx < mx + size + 2 && gy > my - 2 && gy < my + size + 2) {
          ctx.fillStyle = State.dungeonUnlocked(g.key) ? '#f6c453' : '#e05252';
          ctx.fillRect(gx - 2, gy - 2, 4, 4);
        }
      }
      for (const st of WorldGen.SETTLEMENTS) {
        const sx = mx + half + (st.x - pcx) * scl, sy = my + half + (st.y - pcy) * scl;
        if (sx > mx - 2 && sx < mx + size + 2 && sy > my - 2 && sy < my + size + 2) {
          ctx.fillStyle = '#ffffff'; ctx.fillRect(sx - 2.5, sy - 2.5, 5, 5);
          ctx.fillStyle = st.pal.banner; ctx.fillRect(sx - 1.5, sy - 1.5, 3, 3);
        }
      }
    }
    ctx.fillStyle = '#fff';
    ctx.fillRect(mx + half - 2.5, my + half - 2.5, 5, 5);
    // rosa dos ventos
    ctx.fillStyle = 'rgba(246,196,83,.8)'; ctx.font = 'bold 9px "Courier New"'; ctx.textAlign = 'center';
    ctx.fillText('N', mx + half, my + 9);
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

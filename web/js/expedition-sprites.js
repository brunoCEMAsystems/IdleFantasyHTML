/* =====================================================================
   EXPEDITIONS — expedition-sprites.js
   Arte de personagens: herói customizável (montado por partes) e um
   bestiário de sprites por espécie — cada criatura tem silhueta própria
   (rato, goblin, esqueleto, aranha, dragão, golem, wisp, treant…),
   não mais "o mesmo monstro com outra cor".

   Carregue depois de expedition-core.js e antes de expedition-world.js.
   ===================================================================== */
'use strict';

/* =====================================================================
   0. UTILIDADES DE PIXEL
   ===================================================================== */
function pxCanvas(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  return c;
}
/** Segundo quadro de animação: corpo sobe 1px e as "pernas" trocam de lado. */
function walkFrame(a, legRows) {
  const b = pxCanvas(a.width, a.height);
  const g = b.getContext('2d');
  const legs = legRows || 3;
  const top = Math.max(0, a.height - legs);
  g.drawImage(a, 0, 0, a.width, top, 0, -1, a.width, top);              // corpo sobe
  g.save();
  g.translate(a.width, 0); g.scale(-1, 1);                              // pernas espelhadas
  g.drawImage(a, 0, top, a.width, legs, 0, top, a.width, legs);
  g.restore();
  return b;
}
/** Quadro alternativo para criaturas flutuantes: apenas flutua. */
function floatFrame(a) {
  const b = pxCanvas(a.width, a.height);
  b.getContext('2d').drawImage(a, 0, 1);
  return b;
}

/* =====================================================================
   1. HERÓI CUSTOMIZÁVEL
   O sprite é montado por partes (corpo, pele, cabelo, barba, roupa,
   capa, chapéu) em 4 direções × 2 quadros.
   ===================================================================== */
const Appearance = {
  KEY: 'expeditions_hero_v2',

  SKINS: ['#f6d3b0', '#f0c49a', '#e0a878', '#c68642', '#8d5524', '#5c3317', '#d9b8a0', '#a9d6c0'],
  HAIRS: ['#2a1f16', '#5b3a1e', '#8a5a2b', '#c9a05a', '#e8d8b0', '#b8422f', '#6a6f7a', '#7f5fd0', '#3f8ef0', '#e86a9a'],
  EYES: ['#2a2420', '#3f6f2a', '#3f8ef0', '#7f5fd0', '#8a5a2b', '#c0392b'],
  CLOTHS: ['#c0392b', '#3f6f8a', '#3f7a4a', '#7a4f9a', '#c9a05a', '#2f4a6f', '#a03f6f', '#4a4a55', '#e8dcc0', '#1f5f5f'],
  PANTS: ['#3a2c20', '#2f3a4a', '#4a3a2a', '#2a2a33', '#5b432c', '#3f4a3a'],
  CAPES: [null, '#c0392b', '#3f8ef0', '#6fd46f', '#f6c453', '#7f5fd0', '#e9ecf5', '#2a2a33'],
  HAIR_STYLES: ['short', 'long', 'ponytail', 'braids', 'mohawk', 'bald', 'topknot'],
  BEARDS: ['none', 'stubble', 'full', 'goatee'],
  HATS: ['none', 'hood', 'strawhat', 'circlet', 'horned', 'wizard', 'helm'],
  BODIES: ['slim', 'normal', 'broad'],

  DEFAULT: {
    body: 1, skin: 1, hair: 1, hairStyle: 0, beard: 0, eyes: 0,
    cloth: 0, pants: 0, cape: 0, hat: 0,
  },

  /** Preferências salvas (chave própria: não mexe no save compartilhado). */
  load() {
    try {
      const raw = JSON.parse(localStorage.getItem(this.KEY) || 'null');
      if (raw && typeof raw === 'object') return Object.assign({}, this.DEFAULT, raw);
    } catch (e) { }
    return Object.assign({}, this.DEFAULT);
  },
  save(app) { try { localStorage.setItem(this.KEY, JSON.stringify(app)); } catch (e) { } },

  /** Lista de opções para a tela de personalização. */
  fields() {
    return [
      { key: 'body', label: tt('web_exp_app_body', null, 'Build'), n: this.BODIES.length, names: this.BODIES },
      { key: 'skin', label: tt('web_exp_app_skin', null, 'Skin'), n: this.SKINS.length, swatch: this.SKINS },
      { key: 'hairStyle', label: tt('web_exp_app_hairstyle', null, 'Hair'), n: this.HAIR_STYLES.length, names: this.HAIR_STYLES },
      { key: 'hair', label: tt('web_exp_app_haircolor', null, 'Hair colour'), n: this.HAIRS.length, swatch: this.HAIRS },
      { key: 'beard', label: tt('web_exp_app_beard', null, 'Beard'), n: this.BEARDS.length, names: this.BEARDS },
      { key: 'eyes', label: tt('web_exp_app_eyes', null, 'Eyes'), n: this.EYES.length, swatch: this.EYES },
      { key: 'cloth', label: tt('web_exp_app_cloth', null, 'Tunic'), n: this.CLOTHS.length, swatch: this.CLOTHS },
      { key: 'pants', label: tt('web_exp_app_pants', null, 'Trousers'), n: this.PANTS.length, swatch: this.PANTS },
      { key: 'cape', label: tt('web_exp_app_cape', null, 'Cape'), n: this.CAPES.length, swatch: this.CAPES },
      { key: 'hat', label: tt('web_exp_app_hat', null, 'Headgear'), n: this.HATS.length, names: this.HATS },
    ];
  },

  random() {
    const r = n => Math.floor(Math.random() * n);
    return {
      body: r(this.BODIES.length), skin: r(this.SKINS.length), hair: r(this.HAIRS.length),
      hairStyle: r(this.HAIR_STYLES.length), beard: r(this.BEARDS.length), eyes: r(this.EYES.length),
      cloth: r(this.CLOTHS.length), pants: r(this.PANTS.length), cape: r(this.CAPES.length), hat: r(this.HATS.length),
    };
  },
};

const HeroArt = {
  W: 16, H: 16,

  colors(app) {
    const A = Appearance;
    return {
      skin: A.SKINS[app.skin % A.SKINS.length],
      skinDark: shadeColor(A.SKINS[app.skin % A.SKINS.length], -34),
      hair: A.HAIRS[app.hair % A.HAIRS.length],
      hairDark: shadeColor(A.HAIRS[app.hair % A.HAIRS.length], -28),
      eye: A.EYES[app.eyes % A.EYES.length],
      cloth: A.CLOTHS[app.cloth % A.CLOTHS.length],
      clothDark: shadeColor(A.CLOTHS[app.cloth % A.CLOTHS.length], -30),
      pants: A.PANTS[app.pants % A.PANTS.length],
      cape: A.CAPES[app.cape % A.CAPES.length],
      boots: '#2a1f16',
      belt: '#3a2c20',
      metal: '#b9c0cc',
    };
  },

  /** Desenha um quadro do herói (dir: down|up|left|right, f: 0|1). */
  frame(app, dir, f) {
    const c = pxCanvas(this.W, this.H);
    const g = c.getContext('2d');
    const col = this.colors(app);
    const A = Appearance;
    const style = A.HAIR_STYLES[app.hairStyle % A.HAIR_STYLES.length];
    const beard = A.BEARDS[app.beard % A.BEARDS.length];
    const hat = A.HATS[app.hat % A.HATS.length];
    const build = A.BODIES[app.body % A.BODIES.length];
    const side = dir === 'left' || dir === 'right';
    const back = dir === 'up';
    const faceRight = dir === 'right';
    const R = (x, y, w, h, color) => { if (!color) return; g.fillStyle = color; g.fillRect(x, y, w, h); };

    // ---------- medidas ----------
    const hw = side ? 5 : 6;                    // largura da cabeça
    const hx = side ? (faceRight ? 6 : 5) : 5;  // x da cabeça
    const hy = 2, hh = 5;                        // topo/altura da cabeça
    const bw = build === 'slim' ? 6 : build === 'broad' ? 10 : 8;
    const bx = 8 - (bw >> 1);
    const bTop = 8, bH = 4;

    // ---------- capa (atrás de tudo) ----------
    if (col.cape) {
      R(bx - 1, 7, bw + 2, 7, col.cape);
      R(bx - 1, 7, bw + 2, 1, shadeColor(col.cape, 28));
      R(bx, 14, bw, 1, shadeColor(col.cape, -34));
    }

    // ---------- pescoço ----------
    R(7, 7, 2, 1, col.skinDark);

    // ---------- cabeça ----------
    R(hx, hy, hw, hh, col.skin);
    R(hx, hy + hh - 1, hw, 1, col.skinDark);
    if (!side) { R(hx - 1, hy + 2, 1, 2, col.skin); R(hx + hw, hy + 2, 1, 2, col.skin); }  // orelhas

    // ---------- cabelo ----------
    if (style !== 'bald') {
      R(hx, hy - 1, hw, 1, col.hair);                       // topo
      R(hx, hy, hw, 1, col.hair);                           // franja
      R(hx - 1, hy, 1, 3, col.hair); R(hx + hw, hy, 1, 3, col.hair);   // laterais
      R(hx, hy, hw, 1, col.hairDark);
      if (back) R(hx, hy, hw, hh - 1, col.hair);
      if (style === 'long') {
        R(hx - 1, hy, 1, hh + 2, col.hair); R(hx + hw, hy, 1, hh + 2, col.hair);
        if (back) R(hx, hy, hw, hh + 2, col.hair);
      }
      if (style === 'ponytail') { R(hx + hw, hy, 2, 4, col.hair); R(hx + hw + 1, hy + 3, 1, 3, col.hairDark); }
      if (style === 'braids') { R(hx - 2, hy + 1, 1, 5, col.hair); R(hx + hw + 1, hy + 1, 1, 5, col.hair); }
      if (style === 'mohawk') { R(hx + (hw >> 1) - 1, hy - 3, 2, 3, col.hair); R(hx, hy, hw, 1, col.hairDark); }
      if (style === 'topknot') { R(hx + (hw >> 1) - 1, hy - 3, 3, 2, col.hair); }
    }

    // ---------- rosto ----------
    if (!back) {
      const ey = hy + 2;
      if (side) {
        const ex = faceRight ? hx + 3 : hx + 1;
        R(ex, ey, 2, 2, '#ffffff'); R(faceRight ? ex + 1 : ex, ey, 1, 2, col.eye);
        R(faceRight ? hx + hw : hx - 1, ey + 1, 1, 1, col.skin);          // nariz
      } else {
        R(hx + 1, ey, 1, 2, '#ffffff'); R(hx + 4, ey, 1, 2, '#ffffff');
        R(hx + 1, ey + 1, 1, 1, col.eye); R(hx + 4, ey + 1, 1, 1, col.eye);
        R(hx + 2, ey + 2, 2, 1, col.skinDark);                            // boca
      }
      if (beard === 'stubble') R(hx, hy + hh - 2, hw, 1, col.hairDark);
      if (beard === 'full') { R(hx, hy + hh - 2, hw, 2, col.hair); R(hx + 1, hy + hh, hw - 2, 1, col.hair); }
      if (beard === 'goatee') R(hx + (hw >> 1) - 1, hy + hh - 2, 2, 3, col.hair);
    }

    // ---------- chapéu / elmo ----------
    if (hat === 'hood') {
      R(hx - 1, hy - 1, hw + 2, 3, col.cloth);
      R(hx - 1, hy - 1, hw + 2, 1, shadeColor(col.cloth, 24));
      R(hx - 1, hy + 2, 1, 3, col.cloth); R(hx + hw, hy + 2, 1, 3, col.cloth);
    }
    if (hat === 'strawhat') {
      R(hx - 2, hy, hw + 4, 1, '#e0b849'); R(hx, hy - 2, hw, 2, '#e0b849');
      R(hx - 2, hy + 1, hw + 4, 1, '#c99f34');
    }
    if (hat === 'circlet') { R(hx - 1, hy, hw + 2, 1, '#f6c453'); R(hx + (hw >> 1) - 1, hy - 1, 2, 2, '#8fd8ff'); }
    if (hat === 'horned') {
      R(hx - 1, hy - 1, hw + 2, 2, col.metal);
      R(hx - 2, hy - 2, 1, 3, '#e8e0d0'); R(hx + hw + 1, hy - 2, 1, 3, '#e8e0d0');
      R(hx - 1, hy + 1, hw + 2, 1, shadeColor(col.metal, -44));
    }
    if (hat === 'wizard') {
      R(hx - 2, hy, hw + 4, 1, col.cloth);
      R(hx + 1, hy - 4, 3, 4, col.cloth);
      R(hx + 2, hy - 5, 2, 2, shadeColor(col.cloth, 26));
    }
    if (hat === 'helm') {
      R(hx - 1, hy - 1, hw + 2, 3, col.metal);
      R(hx - 1, hy - 1, hw + 2, 1, shadeColor(col.metal, 28));
      R(hx + 1, hy + 2, hw - 2, 1, '#2b3140');
      R(hx + (hw >> 1) - 1, hy - 3, 2, 2, col.cape || '#c0392b');   // penacho
    }

    // ---------- tronco ----------
    R(bx, bTop, bw, bH, col.cloth);
    R(bx, bTop, bw, 1, shadeColor(col.cloth, 22));
    R(bx, bTop + bH - 1, bw, 1, col.belt);
    if (!back && !side) R(bx + (bw >> 1), bTop, 1, bH - 1, col.clothDark);

    // ---------- braços ----------
    const swing = f ? 1 : 0;
    if (side) {
      const ax = faceRight ? bx + bw - 2 : bx;
      R(ax, bTop + swing, 2, 3, shadeColor(col.cloth, -14));
      R(ax, bTop + 3 + swing, 2, 1, col.skin);
    } else {
      R(bx - 1, bTop + swing, 1, 3, col.cloth);
      R(bx + bw, bTop - swing, 1, 3, col.cloth);
      R(bx - 1, bTop + 3 + swing, 1, 1, col.skin);
      R(bx + bw, bTop + 3 - swing, 1, 1, col.skin);
    }

    // ---------- pernas / botas ----------
    const lx1 = bx + 1, lx2 = bx + bw - 3, lw = 2;
    if (f) {
      R(lx1, 12, lw, 3, col.pants); R(lx2, 12, lw, 2, col.pants);
      R(lx1 - (side ? 1 : 0), 15, lw + 1, 1, col.boots); R(lx2, 14, lw + 1, 2, col.boots);
    } else {
      R(lx1, 12, lw, 3, col.pants); R(lx2, 12, lw, 3, col.pants);
      R(lx1 - 1, 15, lw + 1, 1, col.boots); R(lx2, 15, lw + 1, 1, col.boots);
    }
    return c;
  },

  /** Conjunto completo de sprites (4 direções × 2 quadros). */
  build(app) {
    const s = {};
    for (const dir of ['down', 'up', 'left', 'right'])
      for (const f of [0, 1]) s[dir + f] = this.frame(app, dir, f);
    return s;
  },
};

/* =====================================================================
   2. BESTIÁRIO — silhuetas por espécie
   Legenda: b corpo · B corpo escuro · l realce · E olho claro · e pupila
            m dentes/boca · h chifre/osso · w metal · c pano/detalhe
            f brilho/fogo · g garra/sombra
   ===================================================================== */
const CREATURE_ART = {
  rat: ["................", "................", "..............b.", "...........bbbb.", "BB.......bbbbbbb", ".BB.....bbbEebbb", "..BBbbbbbbbbbbbm", "..bbbbbbbbbbbbb.", ".bbbbbbbbbbbbbb.", ".bbbbbbbbbbbbb..", "..bbbbbbbbbbb...", "..bb..bb..bb....", "..gg..gg..gg...."],
  wolf: ["................", "...........b..b.", "..........bbbbb.", "B........bbbbbbb", "BB......bbbEebbb", ".BB....bbbbbbbbm", "..bbbbbbbbbbbbmm", ".bbbbbbbbbbbbbb.", ".bbbbbbbbbbbbbb.", ".bbbbbbbbbbbbb..", "..bb...bb..bb...", "..bb...bb..bb...", "..gg...gg..gg..."],
  hound: ["................", "...........b..b.", "......ff..bbbbb.", "f...fff.fbbbbbbb", "ff.ffffbbbbEfbbb", ".fffffbbbbbbbbbm", "..fbbbbbbbbbbbmm", ".bbbbbbbbbbbbbb.", ".bbfbbbbfbbbbbb.", ".bbbbbbbbbbbbb..", "..bb...bb..bb...", "..bb...bb..bb...", "..ff...ff..ff..."],
  sheep: ["................", "................", "...llllllll.....", "..llllllllll....", ".lllllllllllBBB.", ".lllllllllBEebB.", ".llllllllllBBmB.", ".lllllllllllBB..", "..llllllllll....", "...ll..ll..l....", "...gg..gg..g...."],
  cow: ["................", "..............h.", "...........hbbb.", "..........bbEebb", "bB........bbbbbm", "bBBbbbbbbbbbbbb.", ".bbBBbbbbbbbbb..", ".bbbbbbBBbbbb...", ".bbbbbbBBbbbb...", ".bb..bb..bb.....", ".gg..gg..gg....."],
  chicken: ["................", ".........c......", "........bbb.....", "........bbbEe...", "........bbbbmm..", "...bbbbbbbbb....", "..bbbbbbbbbb....", ".bbbbbbbbbbb....", ".bbbbbbbbbb.....", "..bbbbbbbb......", "....ww..ww......", "...www..www....."],
  monkey: ["................", "..bb......bb....", ".bBBb....bBBb...", "..bbbbbbbbbb....", "..bllllllllb....", "..blEebbeElb....", "..bllmmmmllb....", "...bbbbbbbb.....", "..bbbbbbbbbb..BB", ".bbbbbbbbbbb.BB.", "..bbbbbbbbbbBB..", "...bb....bb.....", "...gg....gg....."],
  spider: ["g..............g", ".g.....bb.....g.", "..g...bbbb...g..", "..gg.bbbbbb.gg..", "g..gbbbbbbbbg..g", ".g..bEebbeEb..g.", "..gbbbbbbbbbbg..", "..gbbbBBBBbbbg..", ".g.bbBBBBBBbb.g.", "g..bbbBBBBbbb..g", ".g..bbbbbbbb..g.", "..g..bbbbbb..g..", ".g.g........g.g."],
  goblin: ["................", "................", "..b.........b...", "..bb.bbbbb.bb...", "..bbbbbbbbbbb...", "...bEebbbeEb....", "...bbbbbbbbb....", "...bbmmmmmbb....", "....bbbbbbb..w..", "..cccccccccc.w..", "..cccccccccc.w..", "...cc....cc..w..", "...bb....bb.....", "...gg....gg....."],
  orc: ["................", "...bbbbbbbbbb...", "..bbbbbbbbbbbb..", "..bbEebbbbeEbb..", "..bbbbbbbbbbbb..", "..bhbmmmmmmbhb..", "...bbbbbbbbbb...", ".ccbbbbbbbbbbcc.", "cccbbbbbbbbbbccc", "ccc.bbbbbbbb.ccc", "c...bbb..bbb...c", "....bb....bb....", "...ggg....ggg..."],
  skeleton: ["................", ".....hhhhhh.....", "....hhhhhhhh....", "....heehheeh....", "....hhhhhhhh....", ".....hmmmmh.....", "......hhhh......", "...h.hhhhhh.h...", "..hh.h.hh.h.hh..", "..h..hhhhhh..h..", ".....h.hh.h.....", ".....hh..hh.....", ".....hh..hh.....", "....hhh..hhh...."],
  zombie: ["................", "................", ".....bbbbbb.....", "....bBbbbbbb....", "....bEebbeEb....", "....bbbbbbbb....", "....bbmmmmbb....", "bbb..cccccc.....", "bbbccccccccc....", "..ccccccccccbbb.", "...cccccccc.bbb.", "....bb..bb......", "....bb..bb......", "...ggg..ggg....."],
  ghoul: ["................", "................", "......bbbb......", ".....bbbbbb.....", ".....bEebEb.....", "....bbbbbbbb....", "...bbmmmmmmbb...", "g..bbbbbbbbbb..g", "gg.bbbbbbbbbb.gg", "ggg.bbbbbbbb.ggg", "g...bbb..bbb...g", "....bb....bb....", "...ggg....ggg..."],
  human: ["................", "....bbbbbbbb....", "...bcccccccb....", "...bbEebeEbb....", "...bbbbbbbbb....", "....cccccccc....", "...cccccccccc...", "..wcccccccccc...", "..wcccccccccc...", "...cccccccccc...", "....ccc..ccc....", "....bbb..bbb....", "....ggg..ggg...."],
  guard: ["................", "......w.........", "....wwwwwwww.w..", "...wwwwwwwwwww..", "...wwbbbbbww.w..", "....bbEebEb..w..", "....bbbbbbb..w..", "...wwwwwwwww.w..", "..wwwwwwwwwww...", "..w.wwwwwww.w...", "....wwwwwww.....", "....ww...ww.....", "....ww...ww.....", "...ggg...ggg...."],
  knight: ["......f.........", "....wwwwww......", "...wwwwwwww.....", "...wwEwwEww.....", "...wwwwwwww.....", "..cwwwwwwwwc....", ".ccwwwwwwwwcc.w.", "cccwwwwwwwwccww.", "ccc.wwwwww..cw..", "cc..wwwwww...w..", "....www.www.....", "....www.www.....", "...wwww.wwww...."],
  wizard: ["........c.......", ".......ccc......", "......ccccc.....", ".....ccccccc....", "....ccccccccc...", "......bbbbb.....", "......bEeEb..f..", "......bbbbb..w..", ".....cccccc..w..", "....cccccccc.w..", "....cccccccc.w..", "...cccccccccc...", "...cccccccccc...", "....cc....cc...."],
  cultist: ["................", ".....cccccc.....", "....cccccccc....", "....cckkkkcc....", "....ckfeefkc....", "....cccccccc....", "...cccccccccc...", "...cccccccccc...", "..cccccccccccc..", "..cccccccccccc..", "...cccccccccc...", "....cccccccc....", "....cc....cc...."],
  rogue: ["................", "....cccccc......", "...cccccccc.....", "...cckkkkcc.....", "...ckEeeEkc.....", "....cccccc......", "..w.cccccc.w....", "..w.cccccc.w....", "..w.cccccc.w....", "...cccccccc.....", "....cc..cc......", "....bb..bb......", "....gg..gg......"],
  assassin: ["................", "....cccccc......", "...cccccccc.....", "...cckkkkcc.....", "...ckffffkc.....", "....cccccc......", ".w..cccccc..w...", ".ww.cccccc.ww...", "..w.ccccccc.w...", "...cccccccc.....", "...ccc..ccc.....", "...ccc..ccc.....", "...ggg..ggg....."],
  golem: ["................", "................", "...wwwwwwwwww...", "...wwffwwffww...", "...wwwwwwwwww...", "ww..wwwwwwww..ww", "ww..wwwwwwww..ww", "ww..wwwwwwww..ww", "ww..wwwwwwww..ww", "....wwwwwwww....", "....www..www....", "...wwww..wwww...", "..wwwww..wwwww.."],
  colossus: ["................", "......wwww......", ".....wffffw.....", "....wwwwwwww....", "..wwwwwwwwwwww..", ".wwwwwwwwwwwwww.", "www.wwwwwwww.www", "www.wwwwwwww.www", ".w..wwwwwwww..w.", "....wwwwwwww....", "....www..www....", "...wwww..wwww...", "...wwww..wwww...", "..wwwww..wwwww.."],
  giant: ["................", ".....bbbbbb..w..", "....bbbbbbbb.w..", "....bEebbeEb.w..", "....bbbbbbbb.w..", ".....bmmmmb..w..", "...cccccccccww..", "..ccccccccccww..", "bbcccccccccc....", "bb.cccccccc.....", "....bbb.bbb.....", "...bbbb.bbbb....", "...gggg.gggg...."],
  troll: ["................", "...bbbbbbbb.....", "..bbbbbbbbbb....", "..bEebbbbeEb....", "..bbbbbbbbbb....", "..bbhmmmmhbb....", "bbbbbbbbbbbbbb..", "bbbbbbbbbbbbbb..", "bbb.bbbbbbb.bb..", "bb..bbbbbbb..b..", "....bbb.bbb.....", "...bbbb.bbbb....", "...gggg.gggg...."],
  demon: ["h............h..", "hh...bbbbbb..hh.", "gh..bbbbbbbb.hg.", "gg.bbffbbffbb.gg", "ggg.bbbbbbbb.ggg", "gg.bbmmmmmmbb.gg", "g..bbbbbbbbbb..g", "...bbbbbbbbbb...", "...bbbbbbbbbb.BB", "....bbb..bbb.BB.", "....hhh..hhh....", "...hhhh..hhhh..."],
  imp: ["................", "................", "..h........h....", "g.hh.bbbb.hh..g.", "gg..bbbbbb...gg.", "g..bbffbbb....g.", "...bbbbbbb......", "...bbmmmbb......", "....bbbbb.......", "....bb.bb....BB.", "....hh.hh...BB.."],
  dragon: ["..........hh....", ".........bbbb...", "g........bfeb...", "gg.......bbbbm..", "ggg.....bbbbmm..", "gggg...bbbb.....", ".ggg..bbbb......", "..bbbbbbbbbb....", ".bbbbbbbbbbbb...", "BBbbbbbbbbbbb...", ".BBbbbbbbbbb....", "..BB.bb..bb.....", "......gg..gg...."],
  wyvern: ["g..............g", "gg....hbbh....gg", "ggg..bbbbbb..ggg", "gggg.bfebbfb.ggg", "ggg..bbmmmbb..gg", "g.....bbbbb....g", "......bbbbb.....", ".....bbbbbbb....", "....bbbbbbb.....", "...bbbbbb.......", "..bbbb..........", ".BB............."],
  serpent: ["................", "..bbbb..........", ".bEebbb.........", ".bbmbbbb........", "..bbbbbbb.......", "...bbbbbbbb.....", ".....bbbbbbb....", "........bbbbb...", "..........bbbb..", "....bbb....bbb..", "...bbbbb...bbb..", "....bbbbbbbbb...", ".....bbbbbbb...."],
  slime: ["................", "................", ".....llllll.....", "...llllllllll...", "..lllEeellEell..", "..llllllllllll..", ".bbbbbbbbbbbbbb.", ".bbbbmmmmmmbbbb.", "bbbbbbbbbbbbbbbb", "bbbbbbbbbbbbbbbb", ".bbbbbbbbbbbbbb.", "..bbbbbbbbbbbb.."],
  wisp: ["................", ".......f........", "......fff.......", ".....fflff......", "....fflllff.....", "....fllEllf.....", "....fllllll.....", ".....ffllf......", "......fff...f...", ".......f...ff...", "..........f....."],
  ghost: ["................", ".....bbbbbb.....", "....bbbbbbbb....", "...bbbbbbbbbb...", "...bbeebbeebb...", "...bbbbbbbbbb...", "...bbbbmmbbbb...", "...bbbbbbbbbb...", "..bbbbbbbbbbbb..", "..bbbbbbbbbbbb..", "..bb.bbb.bbb.b..", "...b..b...b....."],
  wight: ["......ffff......", ".....hhhhhh.....", "....hheehheh....", "....hhhhhhhh....", "....chhhhhhc....", "...ccchhhhccc...", "..cccccccccccc..", "..cccccccccccc..", "..cccccccccccc..", "...cccccccccc...", "...ccc....ccc...", "...ccc....ccc..."],
  lich: ["......ffff...f..", ".....hhhhhh..w..", "....hheehheh.w..", "....hhmmmmhh.w..", ".....hhhhhh..w..", "...cccccccccww..", "..cccccccccccc..", ".cccccccccccccc.", ".cccccccccccccc.", "..cccccccccccc..", "..cccccccccccc..", "...cccccccccc..."],
  treant: ["...lll..lll.....", "..lllllllllll...", ".lllllllllllll..", "..llbbbbbbbll...", "....bEebbeEb....", "....bbbbbbbb....", "....bbmmmmbb....", "g...bbbbbbbb..g.", "gg..bbbbbbbb.gg.", "g...bbbbbbbb..g.", "....bbbbbbbb....", "....bb....bb....", "...bbb....bbb...", "..ggggg..ggggg.."],
  vine: ["....ll....ll....", "...lfl....lfl...", "...lll.bb.lll...", "....l.bbbb.l....", "....bbEbbEbb....", "...bbbbbbbbbb...", ".l.bbmmmmmmbb.l.", "ll.bbbbbbbbbb.ll", "l..bbbbbbbbbb..l", "...bbbbbbbbbb...", "....bbb..bbb....", "...lll....lll..."],
  elemental: [".....f...f......", "...ff.fff..f....", "..f.fffffff.f...", "..f.ffbbbff.f...", ".f.ffbfffbff.f..", ".f.ffbfEfbff.f..", "..f.ffbbbff.f...", "..ff.fffff.ff...", "...f..fff..f....", "....f..f..f.....", "......f.f......."],
  construct: ["................", "....w......w....", "...www....www...", "....w.wwww.w....", "......wwww......", ".....wffffw.....", "..w..wfeefw..w..", ".www.wffffw.www.", "..w..wwwwww..w..", "......wwww......", "....w.wwww.w....", "...www....www...", "....w......w...."],
  dullahan: ["................", "................", "....wwwwwwww....", "...wwwwwwwwww...", "..cwwwwwwwwwwc..", "..cwwwwwwwwwwc..", ".ccwwwwwwwwwwcc.", "hh.wwwwwwwwww...", "hEe.wwwwwwww....", "hh..wwwwwwww....", "....www..www....", "....www..www....", "...gggg..gggg..."],
  kraken: ["................", ".....bbbbbb.....", "....bbbbbbbb....", "...bbEeebEebb...", "...bbbbbbbbbb...", "...bbbmmmmbb....", "..bbbbbbbbbbbb..", "..bbbbbbbbbbbb..", ".b.bb.bbbb.bb.b.", ".bb.bb.bb.bb.bb.", "b.bb.bb..bb.bb.b", "bb..bb....bb..bb"],
  bat: ["................", "................", "g...........g...", "gg...bbbb...gg..", "ggg.bbbbbb.ggg..", "gggg.bEeb.gggg..", "ggg..bmmb..ggg..", "g.....bb.....g..", "......bb........", ".....g..g......."],
  fishman: ["......cc..cc....", ".....bbbbbb.....", "....bbEeebEb....", "....bbbbbbbb....", "....bbmmmmbb....", "...cbbbbbbbbc...", "..ccbbbbbbbbcc..", "..cbbbbbbbbbbc..", "...bbbbbbbbbb...", "....bbb..bbb....", "....ccc..ccc...."],
  crystalbeast: ["................", ".....l..l.......", "....ll.ll.......", "...lllllll......", "..llfEEfll......", "..lllllllll.....", ".llllllllllll...", "l.lllllllllll.l.", "..lll....lll....", "..ll......ll....", ".lll......lll..."],
};

/** Espécie + paleta de cada inimigo (a cor separa variantes da mesma espécie). */
const CREATURE_MAP = {
  giant_rat: { t: 'rat', c: '#8a7a6a' },
  goblin: { t: 'goblin', c: '#6fa04a', c2: '#7a4f2a' },
  skeleton: { t: 'skeleton', c: '#d8d0bc' },
  zombie: { t: 'zombie', c: '#6f8a5e', c2: '#4a3a2a' },
  bandit: { t: 'human', c: '#e0b48a', c2: '#8a4a3a' },
  guard: { t: 'guard', c: '#e0b48a', c2: '#b9c0cc', c3: '#c0392b' },
  dark_wizard: { t: 'wizard', c: '#e0b48a', c2: '#4a3a6a', f: '#b47fff' },
  orc_warrior: { t: 'orc', c: '#5f7a45', c2: '#7a4f2a' },
  spider: { t: 'spider', c: '#4a3a52' },
  wild_monkey: { t: 'monkey', c: '#8a6a3e' },
  rogue: { t: 'rogue', c: '#e0b48a', c2: '#3a3a46' },
  knight: { t: 'knight', c: '#e0b48a', c2: '#c3cad6', c3: '#3f6f8a' },
  hellhound: { t: 'hound', c: '#3a2430', f: '#ff6a2a' },
  troll: { t: 'troll', c: '#7a8a6a' },
  demon: { t: 'demon', c: '#a83a2a', f: '#ffd24a' },
  dragon: { t: 'dragon', c: '#3f7a45', f: '#ffd24a' },
  imp: { t: 'imp', c: '#c04a2a', f: '#ffd24a' },
  chicken: { t: 'chicken', c: '#efe4c8', c2: '#e05252' },
  sheep: { t: 'sheep', c: '#efeade' },
  cow: { t: 'cow', c: '#e8e0d0' },
  fire_giant: { t: 'giant', c: '#c0562a', c2: '#8a3a1a', f: '#ffb03a' },
  ancient_guardian: { t: 'golem', c: '#9aa0ac', f: '#8fd8ff' },
  lich: { t: 'lich', c: '#d8d0bc', c2: '#3a2a55', f: '#a98fff' },
  cave_troll: { t: 'troll', c: '#6a6f6a' },
  mine_spider: { t: 'spider', c: '#5a4a3a' },
  rock_golem: { t: 'golem', c: '#8a8579' },
  iron_golem: { t: 'golem', c: '#7b8494', f: '#ffb03a' },
  forge_demon: { t: 'demon', c: '#8a3a22', f: '#ff8a3c' },
  dwarven_guardian: { t: 'knight', c: '#e0b48a', c2: '#c9a05a', c3: '#8a3a22' },
  drowned_cultist: { t: 'cultist', c: '#7fa8a0', c2: '#2f5f66', f: '#7fe0d0' },
  sea_spirit: { t: 'ghost', c: '#6fd4d0' },
  cursed_fisherman: { t: 'fishman', c: '#4f8a7a', c2: '#c9a05a' },
  abyssal_leech: { t: 'slime', c: '#7a3a5a' },
  deep_horror: { t: 'kraken', c: '#3a4a7a' },
  void_guardian: { t: 'construct', c: '#5a4a8a', f: '#b47fff' },
  corrupted_druid: { t: 'wizard', c: '#c0a880', c2: '#4a6a3a', f: '#9fd46f' },
  vine_beast: { t: 'vine', c: '#3f7a45' },
  forest_spirit: { t: 'wisp', c: '#9fd46f', f: '#d8ff8a' },
  shadow_beast: { t: 'wolf', c: '#2f2a3a', f: '#a98fff' },
  twisted_treant: { t: 'treant', c: '#5a4a34', c2: '#3f6a3a' },
  corrupted_mage: { t: 'wizard', c: '#c9a8b8', c2: '#6a2f7a', f: '#c46fe0' },
  cutpurse: { t: 'rogue', c: '#e0b48a', c2: '#5a4a34' },
  arcane_construct: { t: 'construct', c: '#8fa0d8', f: '#8fd8ff' },
  void_stalker: { t: 'ghost', c: '#4a3a6a', f: '#b47fff' },
  rift_guardian: { t: 'colossus', c: '#4a4468', f: '#b47fff' },
  chaos_elemental: { t: 'elemental', c: '#a83a6a', f: '#ff7fd0' },
  frost_giant: { t: 'giant', c: '#8fbcda', c2: '#5f8aa8', f: '#e8f6ff' },
  ice_golem: { t: 'golem', c: '#bcd9ec', f: '#ffffff' },
  glacial_mage: { t: 'wizard', c: '#cfe4f2', c2: '#3f6fa8', f: '#8fd8ff' },
  abyssal_lord: { t: 'demon', c: '#2a3a5a', f: '#4fd0e0' },
  eternal_sentinel: { t: 'colossus', c: '#8a8f9c', f: '#f6c453' },
  void_archon: { t: 'lich', c: '#c9c0e0', c2: '#2a1f45', f: '#b47fff' },
  assassin: { t: 'assassin', c: '#2a2a33', f: '#e05252' },
  shadow_assassin: { t: 'assassin', c: '#1f1a2a', f: '#a98fff' },
  vault_guardian: { t: 'golem', c: '#c9a05a', f: '#fff0a8' },
  guild_master: { t: 'rogue', c: '#e0b48a', c2: '#2a2a44', f: '#f6c453' },
  storm_imp: { t: 'imp', c: '#5a7fc0', f: '#8fd8ff' },
  sky_serpent: { t: 'serpent', c: '#7fc0e0', f: '#ffffff' },
  cloud_giant: { t: 'giant', c: '#cfd8ee', c2: '#8fa0c8', f: '#ffd97a' },
  frost_wyvern: { t: 'wyvern', c: '#9fd0ea', f: '#e8f6ff' },
  abyssal_guardian: { t: 'kraken', c: '#2f4a66', f: '#4fd0e0' },
  shadow_thief: { t: 'assassin', c: '#33304a', f: '#8fd8ff' },
  elder_lich: { t: 'lich', c: '#e0d8c0', c2: '#2a3a2a', f: '#6fd46f' },
  sun_wisp: { t: 'wisp', c: '#ffd97a', f: '#fff0a8' },
  ember_hound: { t: 'hound', c: '#5a2a1a', f: '#ff8a3c' },
  cinder_colossus: { t: 'colossus', c: '#5a3a30', f: '#ff6a2a' },
  will_o_wisp: { t: 'wisp', c: '#8fd8ff', f: '#d8f6ff' },
  grave_ghoul: { t: 'ghoul', c: '#8a9a7a' },
  husk_horror: { t: 'treant', c: '#6a5a44', c2: '#8a7a4a' },
  barrow_wight: { t: 'wight', c: '#d8d0bc', c2: '#4a4a6a', f: '#8fd8ff' },
  shade_stalker: { t: 'ghost', c: '#3a3450', f: '#a98fff' },
  bone_colossus: { t: 'colossus', c: '#ded4c2', f: '#6fd46f' },
  dread_dullahan: { t: 'dullahan', c: '#3a3a4a', c2: '#c0392b', f: '#e05252' },
  // raid bosses
  king_black_dragon: { t: 'dragon', c: '#2a2a33', f: '#6fd46f' },
  demon_lord: { t: 'demon', c: '#7a1f2a', f: '#ff8a3c' },
  kraken: { t: 'kraken', c: '#3f6f8a', f: '#7fe0d0' },
  balrog: { t: 'demon', c: '#4a2218', f: '#ff6a2a' },
  void_sovereign: { t: 'lich', c: '#b7a6e0', c2: '#1f1533', f: '#b47fff' },
  sol_invictus: { t: 'colossus', c: '#e0b84a', f: '#fff0a8' },
  the_hollow_king: { t: 'wight', c: '#c8c0aa', c2: '#3a2f4a', f: '#9fd46f' },
  the_vault_guardian: { t: 'golem', c: '#c9a05a', f: '#8fd8ff' },
};

/** Espécies que flutuam (animação de flutuar em vez de andar). */
const FLOATERS = new Set(['wisp', 'ghost', 'wight', 'elemental', 'construct', 'bat', 'serpent', 'wyvern', 'crystalbeast', 'slime', 'kraken']);

/** Aparências fixas dos NPCs da cidade (usam o mesmo montador do herói). */
const NPC_LOOKS = {
  peasant: { body: 1, skin: 2, hair: 1, hairStyle: 0, beard: 1, eyes: 0, cloth: 4, pants: 4, cape: 0, hat: 2 },
  merchant: { body: 2, skin: 1, hair: 3, hairStyle: 0, beard: 2, eyes: 0, cloth: 2, pants: 0, cape: 0, hat: 0 },
  guardsman: { body: 2, skin: 3, hair: 0, hairStyle: 5, beard: 1, eyes: 0, cloth: 5, pants: 1, cape: 0, hat: 6 },
  artisan: { body: 1, skin: 4, hair: 0, hairStyle: 2, beard: 0, eyes: 0, cloth: 8, pants: 2, cape: 0, hat: 0 },
  noble: { body: 0, skin: 0, hair: 7, hairStyle: 1, beard: 0, eyes: 3, cloth: 3, pants: 3, cape: 5, hat: 3 },
  city_guard: { body: 2, skin: 2, hair: 0, hairStyle: 5, beard: 2, eyes: 0, cloth: 7, pants: 1, cape: 0, hat: 6 },
  royal_guard: { body: 2, skin: 1, hair: 0, hairStyle: 5, beard: 0, eyes: 0, cloth: 4, pants: 1, cape: 1, hat: 4 },
  knight: { body: 2, skin: 0, hair: 2, hairStyle: 0, beard: 2, eyes: 0, cloth: 1, pants: 3, cape: 1, hat: 6 },
  bishop: { body: 1, skin: 5, hair: 4, hairStyle: 1, beard: 2, eyes: 0, cloth: 8, pants: 0, cape: 6, hat: 5 },
  high_priest: { body: 1, skin: 6, hair: 4, hairStyle: 1, beard: 2, eyes: 2, cloth: 4, pants: 0, cape: 4, hat: 3 },
  slayer_master: { body: 2, skin: 5, hair: 6, hairStyle: 1, beard: 2, eyes: 5, cloth: 7, pants: 3, cape: 7, hat: 4 },
};

const Bestiary = {
  cache: new Map(),

  /** Espécie para uma chave/nome desconhecidos (fallback por palavra-chave). */
  guess(key, name) {
    const s = ((key || '') + ' ' + (name || '')).toLowerCase();
    const has = (...w) => w.some(x => s.includes(x));
    if (has('rat', 'rodent')) return { t: 'rat', c: '#8a7a6a' };
    if (has('goblin')) return { t: 'goblin', c: '#6fa04a' };
    if (has('orc')) return { t: 'orc', c: '#5f7a45' };
    if (has('skeleton', 'bone')) return { t: 'skeleton', c: '#d8d0bc' };
    if (has('zombie', 'husk')) return { t: 'zombie', c: '#6f8a5e' };
    if (has('ghoul')) return { t: 'ghoul', c: '#8a9a7a' };
    if (has('wight', 'revenant')) return { t: 'wight', c: '#d8d0bc' };
    if (has('lich')) return { t: 'lich', c: '#d8d0bc' };
    if (has('ghost', 'spirit', 'shade', 'wraith', 'spectre')) return { t: 'ghost', c: '#8fb4d8' };
    if (has('wisp')) return { t: 'wisp', c: '#8fd8ff' };
    if (has('spider')) return { t: 'spider', c: '#4a3a52' };
    if (has('wolf', 'jackal')) return { t: 'wolf', c: '#6a6a72' };
    if (has('hound', 'dog')) return { t: 'hound', c: '#4a3a30' };
    if (has('bat')) return { t: 'bat', c: '#4a3a52' };
    if (has('dragon', 'drake')) return { t: 'dragon', c: '#3f7a45' };
    if (has('wyvern')) return { t: 'wyvern', c: '#7a8a9a' };
    if (has('serpent', 'snake')) return { t: 'serpent', c: '#4f9a5a' };
    if (has('imp')) return { t: 'imp', c: '#c04a2a' };
    if (has('demon', 'devil', 'balrog')) return { t: 'demon', c: '#a83a2a' };
    if (has('golem', 'construct', 'sentinel')) return { t: 'golem', c: '#8a8f9c' };
    if (has('colossus', 'titan')) return { t: 'colossus', c: '#8a8f9c' };
    if (has('giant', 'ogre')) return { t: 'giant', c: '#9a8a6a' };
    if (has('troll')) return { t: 'troll', c: '#7a8a6a' };
    if (has('treant', 'ent ', 'tree')) return { t: 'treant', c: '#5a4a34' };
    if (has('vine', 'plant', 'flower')) return { t: 'vine', c: '#3f7a45' };
    if (has('elemental', 'chaos')) return { t: 'elemental', c: '#a83a6a' };
    if (has('slime', 'leech', 'ooze')) return { t: 'slime', c: '#6fa04a' };
    if (has('kraken', 'horror', 'tentacle')) return { t: 'kraken', c: '#3f6f8a' };
    if (has('wizard', 'mage', 'sorcer', 'druid', 'shaman')) return { t: 'wizard', c: '#e0b48a', c2: '#4a3a6a' };
    if (has('cultist', 'priest', 'monk')) return { t: 'cultist', c: '#8a7a9a' };
    if (has('assassin', 'thief', 'shadow')) return { t: 'assassin', c: '#2a2a33' };
    if (has('rogue', 'bandit', 'cutpurse', 'pirate')) return { t: 'rogue', c: '#e0b48a', c2: '#5a4a34' };
    if (has('knight', 'paladin', 'champion')) return { t: 'knight', c: '#e0b48a', c2: '#c3cad6' };
    if (has('guard', 'soldier', 'warrior')) return { t: 'guard', c: '#e0b48a', c2: '#b9c0cc' };
    if (has('chicken', 'bird', 'raven')) return { t: 'chicken', c: '#efe4c8' };
    if (has('sheep', 'goat')) return { t: 'sheep', c: '#efeade' };
    if (has('cow', 'bull', 'ox')) return { t: 'cow', c: '#e8e0d0' };
    if (has('monkey', 'ape')) return { t: 'monkey', c: '#8a6a3e' };
    if (has('crystal')) return { t: 'crystalbeast', c: '#b79cf0' };
    if (has('fish', 'siren', 'merfolk')) return { t: 'fishman', c: '#4f8a7a' };
    if (has('dullahan', 'rider')) return { t: 'dullahan', c: '#3a3a4a' };
    // último recurso: humanoide colorido pela hash do nome (nunca acontece com os dados atuais)
    const hue = Math.floor(hash2((key || 'x').length * 11.7, (name || 'x').charCodeAt(0) || 5) * 360);
    return { t: 'human', c: hsl(hue, 0.55, 0.5) };
  },

  palette(def) {
    const base = def.c || '#8a8a8a';
    return {
      b: base,
      B: shadeColor(base, -36),
      l: shadeColor(base, 30),
      c: def.c2 || shadeColor(base, -18),
      w: def.c2 || '#b9c0cc',
      h: '#e8e0d0',
      f: def.f || '#ffd24a',
      E: '#ffffff',
      e: '#141018',
      m: '#f2ece0',
      g: shadeColor(base, -52),
      k: '#141018',
    };
  },

  /** Sprite {a,b} de uma criatura (cacheado por chave). */
  spriteFor(key, name) {
    const ck = key || name || '?';
    const hit = this.cache.get(ck);
    if (hit) return hit;
    // NPCs da cidade usam o montador humano (mesmo do herói)
    if (NPC_LOOKS[key]) {
      const look = NPC_LOOKS[key];
      const s = { a: HeroArt.frame(look, 'down', 0), b: HeroArt.frame(look, 'down', 1), human: true };
      this.cache.set(ck, s);
      return s;
    }
    const def = CREATURE_MAP[key] || this.guess(key, name);
    const rows = CREATURE_ART[def.t] || CREATURE_ART.human;
    const a = makeSprite(rows, this.palette(def));
    const b = FLOATERS.has(def.t) ? floatFrame(a) : walkFrame(a, 3);
    const s = { a, b, species: def.t };
    this.cache.set(ck, s);
    return s;
  },
};

/** Compatibilidade: o mundo pede sprites por chave (nome como fallback). */
function makeEnemySprite(key, name) { return Bestiary.spriteFor(key, name); }

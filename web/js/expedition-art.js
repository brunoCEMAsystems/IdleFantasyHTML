/* =====================================================================
   EXPEDITIONS — expedition-art.js
   Toda a pintura do mundo: tiles por bioma, muralhas, cidades e seus
   prédios (sprites procedurais), adereços de dungeon por tema, clima
   e cores de mapa/minimapa.

   Carregue depois de expedition-worldgen.js / expedition-world.js.
   ===================================================================== */
'use strict';

const EXPART = {
  _bcache: new Map(),     // sprites de prédio
  _propCache: new Map(),

  /* =================================================================
     UTILIDADES
     ================================================================= */
  shade(hex, amt) {
    if (!hex || hex[0] !== '#') return hex;
    const n = parseInt(hex.slice(1), 16);
    const r = XU.clamp((n >> 16) + amt, 0, 255), g = XU.clamp(((n >> 8) & 255) + amt, 0, 255), b = XU.clamp((n & 255) + amt, 0, 255);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  },

  /* =================================================================
     TILES — OVERWORLD
     ================================================================= */
  drawTile(ctx, tx, ty, ox, oy, screenW, screenH) {
    const x = tx * TILE - ox, y = ty * TILE - oy;
    if (x < -TILE || y < -TILE || x > screenW + TILE || y > screenH + TILE) return;
    if (World.mode === 'dungeon') return this.drawDungeonTile(ctx, tx, ty, x, y);

    const v = hash2(tx, ty);
    // muralha de cidade
    if (World.wallAt(tx, ty)) return this.drawWallTile(ctx, tx, ty, x, y, v);

    const t = World.terrainAt(tx, ty);
    if (t === TERRAIN.PLAZA) return this.drawPlazaTile(ctx, tx, ty, x, y, v);
    if (t === TERRAIN.ROAD) return this.drawRoadTile(ctx, tx, ty, x, y, v);

    const b = World.biomeAt(tx, ty);
    if (t === TERRAIN.WATER || t === TERRAIN.SHALLOW) return this.drawWaterTile(ctx, tx, ty, x, y, v, b);
    if (t === TERRAIN.LAVA) return this.drawLavaTile(ctx, tx, ty, x, y, v);
    if (t === TERRAIN.ROCK) return this.drawRockTile(ctx, tx, ty, x, y, v, b);
    if (t === TERRAIN.ICE) return this.drawIceTile(ctx, tx, ty, x, y, v, b);

    // chão comum do bioma
    const base = v < 0.5 ? b.ground[0] : b.ground[1];
    ctx.fillStyle = v < 0.12 ? this.shade(base, -10) : (v > 0.88 ? this.shade(base, 10) : base);
    ctx.fillRect(x, y, TILE, TILE);
    if (t === TERRAIN.SNOW) {
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(x, y, TILE, TILE);
    }
    if (b.deco) this.drawDeco(ctx, b, tx, ty, x, y, v);
  },

  /** Enfeites procedurais que dão personalidade a cada bioma. */
  drawDeco(ctx, b, tx, ty, x, y, v) {
    const d = b.deco;
    const r = hash2(tx * 3 + 1, ty * 5 + 2);
    if (r > d.chance) return;
    const px = x + hash2(tx, ty + 3) * 20 + 6, py = y + hash2(tx + 5, ty) * 20 + 6;
    switch (d.type) {
      case 'grass':
        ctx.fillStyle = d.color || 'rgba(20,40,15,.35)';
        ctx.fillRect(px, py, 1, 5); ctx.fillRect(px - 3, py + 2, 1, 4); ctx.fillRect(px + 3, py + 2, 1, 4);
        break;
      case 'flower': {
        const c = ['#e86a9a', '#f2d04a', '#8fb4ff', '#ff9c5a'][Math.floor(hash2(tx + 9, ty) * 4)];
        ctx.fillStyle = 'rgba(24,60,20,.4)'; ctx.fillRect(px, py + 2, 1, 4);
        ctx.fillStyle = c; ctx.fillRect(px - 1, py - 1, 3, 3);
        break;
      }
      case 'fern':
        ctx.fillStyle = d.color;
        for (let i = 0; i < 3; i++) { ctx.fillRect(px - 4 + i * 4, py + 2 - i % 2 * 2, 2, 7); }
        ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fillRect(x, y, TILE, TILE);
        break;
      case 'reed':
        ctx.fillStyle = d.color; ctx.fillRect(px, py - 4, 1, 9); ctx.fillRect(px + 3, py - 2, 1, 7);
        ctx.fillStyle = '#3a4a2a'; ctx.fillRect(px - 1, py + 4, 6, 2);
        break;
      case 'cactus':
        ctx.fillStyle = '#3f8a45'; ctx.fillRect(px, py - 6, 4, 13);
        ctx.fillRect(px - 3, py - 2, 3, 3); ctx.fillRect(px + 4, py - 4, 3, 3);
        ctx.fillStyle = '#2d6b32'; ctx.fillRect(px, py - 6, 1, 13);
        break;
      case 'dune':
        ctx.strokeStyle = 'rgba(180,150,90,.35)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x + 2, y + 20); ctx.quadraticCurveTo(x + 16, y + 10, x + 30, y + 20); ctx.stroke();
        break;
      case 'crack':
        ctx.strokeStyle = d.color; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(px - 6, py - 4); ctx.lineTo(px, py + 1); ctx.lineTo(px + 5, py - 3); ctx.stroke();
        break;
      case 'pebble':
        ctx.fillStyle = d.color; ctx.fillRect(px, py, 4, 3); ctx.fillRect(px + 5, py + 3, 3, 2);
        break;
      case 'snow':
        ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fillRect(px, py, 2, 2); ctx.fillRect(px + 5, py + 4, 2, 2);
        ctx.fillStyle = 'rgba(160,190,220,.5)'; ctx.fillRect(px - 4, py + 5, 6, 2);
        break;
      case 'icecrack':
        ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(px - 7, py); ctx.lineTo(px, py - 4); ctx.lineTo(px + 7, py + 2); ctx.stroke();
        break;
      case 'ember': {
        const g = 0.4 + 0.5 * Math.sin(World.time * 3 + tx);
        ctx.fillStyle = 'rgba(255,120,40,' + g + ')'; ctx.fillRect(px, py, 3, 3);
        ctx.fillStyle = 'rgba(255,220,120,' + (g * 0.6) + ')'; ctx.fillRect(px + 1, py + 1, 1, 1);
        break;
      }
      case 'ashpile':
        ctx.fillStyle = 'rgba(180,175,180,.35)'; ctx.fillRect(px - 3, py + 2, 8, 3); ctx.fillRect(px - 1, py, 4, 2);
        break;
      case 'spore': {
        const g = 0.35 + 0.35 * Math.sin(World.time * 2 + ty);
        ctx.fillStyle = 'rgba(150,220,110,' + g + ')'; ctx.fillRect(px, py, 2, 2);
        ctx.fillStyle = '#6a4a7a'; ctx.fillRect(px - 4, py + 4, 5, 2);
        break;
      }
      case 'bone':
        ctx.fillStyle = '#d8cfc0'; ctx.fillRect(px - 4, py, 8, 2); ctx.fillRect(px - 5, py - 1, 2, 4); ctx.fillRect(px + 3, py - 1, 2, 4);
        break;
      case 'rune': {
        const g = 0.35 + 0.4 * Math.sin(World.time * 2.2 + tx * 0.7);
        ctx.strokeStyle = 'rgba(160,190,255,' + g + ')'; ctx.lineWidth = 1;
        ctx.strokeRect(px - 4, py - 4, 8, 8);
        ctx.beginPath(); ctx.moveTo(px - 4, py + 4); ctx.lineTo(px + 4, py - 4); ctx.stroke();
        break;
      }
      case 'crystal': {
        const c = ['#b79cf0', '#8fd8ff', '#f0a8e8'][Math.floor(hash2(tx + 2, ty + 7) * 3)];
        ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(px - 3, py + 6, 8, 2);
        ctx.fillStyle = c;
        ctx.beginPath(); ctx.moveTo(px, py - 8); ctx.lineTo(px + 4, py + 6); ctx.lineTo(px - 4, py + 6); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(px - 1, py - 4, 1, 8);
        break;
      }
      case 'shell':
        ctx.fillStyle = d.color; ctx.fillRect(px, py, 3, 2); ctx.fillRect(px + 1, py - 1, 1, 1);
        break;
      case 'pinecone':
        ctx.fillStyle = d.color; ctx.fillRect(px, py, 2, 4); ctx.fillRect(px - 1, py + 1, 4, 2);
        break;
    }
  },

  drawWaterTile(ctx, tx, ty, x, y, v, b) {
    const shallow = b.key === 'reef' || World.terrainAt(tx, ty) === TERRAIN.SHALLOW;
    const wave = Math.sin(World.time * 1.5 + tx * 0.6 + ty * 0.4) > 0;
    ctx.fillStyle = wave ? b.ground[0] : b.ground[1];
    ctx.fillRect(x, y, TILE, TILE);
    if (v < 0.24) {
      ctx.fillStyle = 'rgba(255,255,255,' + (shallow ? 0.3 : 0.16) + ')';
      ctx.fillRect(x + hash2(tx, ty + 9) * 18 + 4, y + hash2(tx + 4, ty) * 18 + 6, 7, 2);
    }
    if (shallow && v > 0.86) { ctx.fillStyle = 'rgba(240,200,140,.35)'; ctx.fillRect(x + 8, y + 14, 12, 6); }
    if (b.key === 'bog' && v > 0.7) { ctx.fillStyle = 'rgba(90,130,70,.5)'; ctx.fillRect(x + 6, y + 8, 12, 8); }
  },

  drawLavaTile(ctx, tx, ty, x, y, v) {
    const g = 0.5 + 0.5 * Math.sin(World.time * 1.6 + tx * 0.8 + ty * 0.5);
    ctx.fillStyle = v < 0.5 ? '#c9400f' : '#bb3b0d';
    ctx.fillRect(x, y, TILE, TILE);
    // veios brilhantes irregulares
    const ox2 = hash2(tx + 3, ty) * 8, oy2 = hash2(tx, ty + 7) * 8;
    ctx.fillStyle = 'rgba(255,150,40,' + (0.30 + g * 0.4) + ')';
    ctx.fillRect(x + ox2 * 0.5, y + oy2 * 0.5, TILE - ox2, TILE - oy2);
    ctx.fillStyle = 'rgba(255,240,150,' + (0.20 + g * 0.35) + ')';
    ctx.fillRect(x + 8 + ox2 * 0.6, y + 10 + oy2 * 0.4, 7 + ox2 * 0.4, 4);
    // crosta escura
    if (v > 0.62) {
      ctx.fillStyle = '#4a1f0d';
      ctx.beginPath();
      ctx.moveTo(x + 2 + ox2, y + 3); ctx.lineTo(x + 14 + ox2, y + 6 + oy2); ctx.lineTo(x + 6, y + 14 + oy2); ctx.closePath(); ctx.fill();
    }
  },

  drawRockTile(ctx, tx, ty, x, y, v, b) {
    const volcanic = b.key === 'volcano';
    const base = v < 0.5 ? b.ground[0] : b.ground[1];
    ctx.fillStyle = base; ctx.fillRect(x, y, TILE, TILE);
    const w = hash2(tx * 1.7, ty * 2.3), h2 = hash2(tx * 3.1, ty * 1.1);
    // faces de rocha irregulares (dá volume às cordilheiras, sem repetir)
    ctx.fillStyle = 'rgba(255,255,255,.12)';
    ctx.beginPath();
    ctx.moveTo(x - 1, y + TILE);
    ctx.lineTo(x + TILE * (0.28 + w * 0.4), y + 2 + h2 * 8);
    ctx.lineTo(x + TILE + 1, y + TILE);
    ctx.closePath(); ctx.fill();
    if (w > 0.55) {   // segundo pico
      ctx.fillStyle = 'rgba(255,255,255,.07)';
      ctx.beginPath();
      ctx.moveTo(x + TILE * 0.35, y + TILE); ctx.lineTo(x + TILE * (0.62 + h2 * 0.2), y + 8 + w * 6); ctx.lineTo(x + TILE + 2, y + TILE);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(x, y + TILE - 5, TILE, 5);
    if (volcanic && v > 0.72) {
      const g = 0.35 + 0.4 * Math.sin(World.time * 3 + tx);
      ctx.fillStyle = 'rgba(255,110,30,' + g + ')'; ctx.fillRect(x + 8 + w * 12, y + 14 + h2 * 8, 5, 3);
    } else if (v > 0.88) { ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.fillRect(x + 8 + w * 8, y + 3 + h2 * 4, 11, 4); }
  },

  drawIceTile(ctx, tx, ty, x, y, v, b) {
    ctx.fillStyle = v < 0.5 ? b.ground[0] : b.ground[1];
    ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(x, y, TILE, 4);
    if (v > 0.7) {
      ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + 4, y + 22); ctx.lineTo(x + 14, y + 12); ctx.lineTo(x + 26, y + 18); ctx.stroke();
    }
  },

  drawRoadTile(ctx, tx, ty, x, y, v) {
    // ponte de madeira quando a estrada cruza água
    const b = World.biomeAt(tx, ty);
    if (b.water) {
      ctx.fillStyle = b.ground[0]; ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = '#7a5a34'; ctx.fillRect(x, y + 4, TILE, TILE - 8);
      ctx.fillStyle = '#5c4326';
      for (let i = 0; i < TILE; i += 8) ctx.fillRect(x + i, y + 4, 1, TILE - 8);
      ctx.fillStyle = '#8a6a3e'; ctx.fillRect(x, y + 3, TILE, 2); ctx.fillRect(x, y + TILE - 5, TILE, 2);
      return;
    }
    // a estrada se adapta ao terreno: neve batida, pedra clara no deserto, cinzas…
    const road = b.terrain === TERRAIN.SNOW || b.key === 'glacier' ? ['#cfd8e2', '#c3ccd8']
      : b.terrain === TERRAIN.SAND ? ['#d9c391', '#cfb886']
        : b.terrain === TERRAIN.ASH ? ['#5d545b', '#554d53']
          : b.key === 'blight' ? ['#6b5a70', '#5f5064']
            : ['#a58a5f', '#9c8158'];
    ctx.fillStyle = v < 0.5 ? road[0] : road[1];
    ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = 'rgba(0,0,0,.14)';
    if (v < 0.45) ctx.fillRect(x + 5 + hash2(tx, ty + 5) * 16, y + 7 + hash2(tx + 2, ty) * 14, 3, 2);
    ctx.fillStyle = 'rgba(255,255,255,.06)';
    if (v > 0.8) ctx.fillRect(x + 12, y + 6, 6, 4);
  },

  drawPlazaTile(ctx, tx, ty, x, y, v) {
    const s = World.settlementAt(tx, ty) || World.capital();
    const warm = s.pal.accent;
    const alt = (tx + ty) % 2 === 0;
    ctx.fillStyle = alt ? '#a8a091' : '#9a9285';
    ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = 'rgba(0,0,0,.14)';
    ctx.fillRect(x, y + TILE - 2, TILE, 2); ctx.fillRect(x + TILE - 2, y, 2, TILE);
    if (v > 0.9) { ctx.fillStyle = 'rgba(120,110,100,.6)'; ctx.fillRect(x + 11, y + 13, 7, 5); }
    // mosaico dourado no centro exato da praça
    const d = Math.hypot(tx - s.x, ty - s.y);
    if (d < 3.2) {
      ctx.fillStyle = 'rgba(246,196,83,.20)'; ctx.fillRect(x, y, TILE, TILE);
      ctx.strokeStyle = warm; ctx.globalAlpha = 0.35; ctx.strokeRect(x + 3.5, y + 3.5, TILE - 7, TILE - 7); ctx.globalAlpha = 1;
    }
  },

  drawWallTile(ctx, tx, ty, x, y, v) {
    const s = World.settlementAt(tx, ty, 4) || World.capital();
    const pal = s.pal;
    const tower = World.gateTowerAt(tx, ty);
    const style = s.wallStyle || 'stone';
    let face = tower ? this.shade(pal.wall, 14) : (v < 0.5 ? pal.wall : this.shade(pal.wall, -8));
    ctx.fillStyle = face; ctx.fillRect(x, y, TILE, TILE);
    if (style === 'ice') {
      ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fillRect(x, y, TILE, TILE);
      ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + 4, y + TILE); ctx.lineTo(x + 14, y + 6); ctx.lineTo(x + 26, y + TILE); ctx.stroke();
    } else if (style === 'arcane') {
      const g = 0.3 + 0.3 * Math.sin(World.time * 2 + tx * 0.6);
      ctx.fillStyle = 'rgba(160,140,255,' + g * 0.5 + ')'; ctx.fillRect(x + 6, y + 8, TILE - 12, TILE - 16);
    } else if (style === 'palisade') {
      ctx.fillStyle = pal.wood;
      for (let i = 0; i < TILE; i += 6) { ctx.fillRect(x + i, y + 4, 5, TILE - 4); ctx.fillStyle = this.shade(pal.wood, i % 12 ? -12 : 8); }
      ctx.fillStyle = this.shade(pal.wood, 20);
      for (let i = 0; i < TILE; i += 6) { ctx.beginPath(); ctx.moveTo(x + i, y + 5); ctx.lineTo(x + i + 2.5, y); ctx.lineTo(x + i + 5, y + 5); ctx.closePath(); ctx.fill(); }
      return;
    } else {
      // tijolos
      ctx.fillStyle = 'rgba(0,0,0,.22)';
      for (let by = 4; by < TILE; by += 8) ctx.fillRect(x, y + by, TILE, 1);
      for (let bx = ((tx + ty) % 2) * 8; bx < TILE; bx += 16) ctx.fillRect(x + bx + 4, y + ((bx / 16 | 0) % 2) * 8, 1, 8);
    }
    // ameias viradas para dentro
    const inside = Math.hypot(tx - s.x, ty - s.y) < s.r + 1.1;
    if (inside) {
      ctx.fillStyle = tower ? this.shade(pal.wall, 22) : this.shade(pal.wall, 8);
      ctx.fillRect(x, y, TILE, 6);
      ctx.fillStyle = pal.wallDark;
      ctx.fillRect(x + 4, y, 6, 10); ctx.fillRect(x + 20, y, 6, 10);
    }
    if (tower) {
      ctx.fillStyle = this.shade(pal.wall, 26);
      ctx.fillRect(x + 2, y + 2, 6, 6); ctx.fillRect(x + TILE - 8, y + TILE - 8, 6, 6);
    }
  },

  /* =================================================================
     TILES — DUNGEON (paleta e detalhes por tema)
     ================================================================= */
  drawDungeonTile(ctx, tx, ty, x, y) {
    const L = World.dungeonLayout;
    const pal = L ? L.pal : DUNGEON_PALETTES.cave;
    const theme = L ? L.theme : DUNGEON_THEMES.goblin_cave;
    const t = World.terrainAt(tx, ty);
    const v = hash2(tx, ty);
    const T = (ax, ay) => World.terrainAt(ax, ay);

    if (t === TERRAIN.WALL) {
      // temas ao ar livre: a "parede" é vegetação/rocha, não bloco de masmorra
      if (pal.scenery) return this.drawScenery(ctx, tx, ty, x, y, v, pal, theme);
      const openBelow = T(tx, ty + 1) !== TERRAIN.WALL;
      ctx.fillStyle = v < 0.5 ? pal.wall : this.shade(pal.wall, -6);
      ctx.fillRect(x, y, TILE, TILE);
      // textura
      if (theme.gen === 'rooms' || theme.gen === 'halls') {
        ctx.fillStyle = 'rgba(255,255,255,.05)';
        for (let by = 4; by < TILE; by += 8) ctx.fillRect(x, y + by, TILE, 1);
        for (let bx = ((tx + ty) % 2) * 8; bx < TILE; bx += 16) ctx.fillRect(x + bx + 4, y + ((bx / 16 | 0) % 2) * 8, 1, 8);
      } else if (v < 0.3) {
        ctx.fillStyle = this.shade(pal.wall, 16); ctx.fillRect(x + 5 + v * 12, y + 8, 8, 6);
      }
      // face superior iluminada quando há piso logo abaixo (dá volume 3D)
      if (openBelow) {
        ctx.fillStyle = pal.wallTop; ctx.fillRect(x, y + TILE - 9, TILE, 9);
        ctx.fillStyle = this.shade(pal.wallTop, 22); ctx.fillRect(x, y + TILE - 9, TILE, 2);
        ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(x, y + TILE - 3, TILE, 3);
      }
      // contorno escuro nas bordas viradas para o piso
      ctx.fillStyle = 'rgba(0,0,0,.4)';
      if (T(tx - 1, ty) !== TERRAIN.WALL) ctx.fillRect(x, y, 2, TILE);
      if (T(tx + 1, ty) !== TERRAIN.WALL) ctx.fillRect(x + TILE - 2, y, 2, TILE);
      if (T(tx, ty - 1) !== TERRAIN.WALL) ctx.fillRect(x, y, TILE, 2);
      return;
    }
    if (t === TERRAIN.VOID) {
      ctx.fillStyle = '#07060f'; ctx.fillRect(x, y, TILE, TILE);
      const st = hash2(tx * 2.1, ty * 3.7);
      if (st > 0.82) {
        const tw = 0.35 + 0.45 * Math.sin(World.time * 2 + st * 12);
        ctx.fillStyle = 'rgba(200,180,255,' + tw + ')';
        ctx.fillRect(x + st * 22 + 4, y + hash2(tx, ty + 1) * 22 + 4, 2, 2);
      }
      return;
    }
    if (t === TERRAIN.HAZARD) {
      const hz = theme.hazard;
      const g = 0.5 + 0.5 * Math.sin(World.time * 2 + tx * 0.7 + ty * 0.4);
      if (hz === 'lava') { this.drawLavaTile(ctx, tx, ty, x, y, v); return; }
      if (hz === 'water') {
        ctx.fillStyle = v < 0.5 ? pal.hazard : this.shade(pal.hazard, -12); ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = 'rgba(255,255,255,' + (0.10 + g * 0.10) + ')'; ctx.fillRect(x + 5, y + 10, 14, 3);
        return;
      }
      if (hz === 'poison') {
        ctx.fillStyle = v < 0.5 ? '#3f6a34' : '#39602f'; ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = 'rgba(150,230,90,' + (0.18 + g * 0.22) + ')'; ctx.fillRect(x + 3, y + 5, TILE - 6, TILE - 10);
        return;
      }
      if (hz === 'web') {
        ctx.fillStyle = pal.hazard; ctx.fillRect(x, y, TILE, TILE);
        ctx.strokeStyle = 'rgba(230,225,240,.5)'; ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < 4; i++) { ctx.moveTo(x + 16, y + 16); ctx.lineTo(x + 16 + Math.cos(i * 1.57) * 15, y + 16 + Math.sin(i * 1.57) * 15); }
        ctx.arc(x + 16, y + 16, 9, 0, 7); ctx.stroke();
        return;
      }
      if (hz === 'void') {
        ctx.fillStyle = '#07060f'; ctx.fillRect(x, y, TILE, TILE);
        return;
      }
      ctx.fillStyle = pal.hazard; ctx.fillRect(x, y, TILE, TILE);
      return;
    }

    // ---- piso ----
    const base = t === TERRAIN.FLOOR2 ? pal.floor2 : pal.floor;
    ctx.fillStyle = v < 0.14 ? this.shade(base, -8) : (v > 0.86 ? this.shade(base, 8) : base);
    ctx.fillRect(x, y, TILE, TILE);
    if (theme.gen === 'rooms' || theme.gen === 'halls') {
      ctx.fillStyle = 'rgba(0,0,0,.16)';
      ctx.fillRect(x, y, TILE, 1); ctx.fillRect(x, y, 1, TILE);
      if (v > 0.93) { ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(x + 8, y + 12, 12, 3); }
    } else if (v > 0.9) {
      ctx.fillStyle = this.shade(base, -14); ctx.fillRect(x + 7 + v * 8, y + 11, 7, 4);
    }
    if (theme.pal === 'ice' && v > 0.7) {
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + 3, y + 20); ctx.lineTo(x + 15, y + 10); ctx.lineTo(x + 28, y + 17); ctx.stroke();
    }
    if (theme.pal === 'farm' && v > 0.55) {
      ctx.fillStyle = 'rgba(20,60,20,.25)';
      ctx.fillRect(x + 8 + v * 10, y + 12, 1, 5); ctx.fillRect(x + 6 + v * 10, y + 14, 1, 4);
    }
    // sombra projetada pelas paredes vizinhas
    if (T(tx, ty - 1) === TERRAIN.WALL && !pal.scenery) { ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(x, y, TILE, 6); }
    if (T(tx - 1, ty) === TERRAIN.WALL && !pal.scenery) { ctx.fillStyle = 'rgba(0,0,0,.14)'; ctx.fillRect(x, y, 5, TILE); }
    // borda das plataformas flutuantes (ilhas sobre o vazio)
    if (theme.gen === 'islands') {
      const rim = (ax, ay) => T(ax, ay) === TERRAIN.VOID;
      ctx.fillStyle = pal.wallTop;
      if (rim(tx, ty + 1)) ctx.fillRect(x, y + TILE - 6, TILE, 6);
      if (rim(tx, ty - 1)) ctx.fillRect(x, y, TILE, 3);
      if (rim(tx - 1, ty)) ctx.fillRect(x, y, 3, TILE);
      if (rim(tx + 1, ty)) ctx.fillRect(x + TILE - 3, y, 3, TILE);
      if (rim(tx, ty + 1)) { ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(x, y + TILE - 2, TILE, 2); }
    }
  },

  /** "Paredes" dos temas ao ar livre: moitas, rochas ou sebes. */
  drawScenery(ctx, tx, ty, x, y, v, pal, theme) {
    // chão por baixo
    ctx.fillStyle = v < 0.5 ? pal.floor : pal.floor2;
    ctx.fillRect(x, y, TILE, TILE);
    const cx = x + TILE / 2, cy = y + TILE / 2;
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.beginPath(); ctx.ellipse(cx, cy + 10, 13, 5, 0, 0, 7); ctx.fill();
    if (pal.scenery === 'hedge') {
      ctx.fillStyle = '#3f7a3a'; ctx.fillRect(x + 1, y + 4, TILE - 2, TILE - 8);
      ctx.fillStyle = '#4f9545'; ctx.fillRect(x + 1, y + 4, TILE - 2, 5);
      ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(x + 1, y + TILE - 6, TILE - 2, 2);
      return;
    }
    if (v > 0.72) { // pedregulho
      ctx.fillStyle = '#6f7480';
      ctx.beginPath(); ctx.moveTo(cx - 13, cy + 9); ctx.lineTo(cx - 6, cy - 10); ctx.lineTo(cx + 7, cy - 8); ctx.lineTo(cx + 13, cy + 9); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#878d99'; ctx.fillRect(cx - 6, cy - 7, 8, 4);
      return;
    }
    // moita / arbusto (mais escuro = tema pântano)
    const leaf = theme.pal === 'swamp' ? '#3c5a2e' : theme.pal === 'camp' ? '#4a6a2c' : '#2f6a30';
    ctx.fillStyle = leaf;
    ctx.beginPath(); ctx.arc(cx - 7, cy + 1, 9, 0, 7); ctx.arc(cx + 7, cy + 2, 9, 0, 7); ctx.arc(cx, cy - 6, 11, 0, 7); ctx.fill();
    ctx.fillStyle = this.shade(leaf, 22);
    ctx.beginPath(); ctx.arc(cx - 3, cy - 8, 5, 0, 7); ctx.fill();
    if (v < 0.16) { ctx.fillStyle = '#e05252'; ctx.fillRect(cx + 3, cy - 3, 3, 3); ctx.fillRect(cx - 5, cy + 3, 3, 3); }
  },

  /** Névoa/atmosfera do tema por cima dos tiles da dungeon. */
  drawDungeonFog(ctx, w, h) {
    const L = World.dungeonLayout;
    if (!L || !L.pal.fog) return;
    ctx.fillStyle = L.pal.fog;
    ctx.fillRect(0, 0, w, h);
    if (L.theme.light !== 1) {
      // vinheta de tocha em volta do herói
      const g = ctx.createRadialGradient && ctx.createRadialGradient(w / 2, h / 2, 60, w / 2, h / 2, Math.max(w, h) * 0.62);
      if (g && g.addColorStop) {
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(0,0,0,.45)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      }
    }
  },

  /* =================================================================
     ADEREÇOS DE DUNGEON
     ================================================================= */
  drawProps(ctx, ox, oy, screenW, screenH) {
    const L = World.dungeonLayout;
    if (!L) return;
    for (const p of L.props) {
      const wx = (p.x - L.OX) * TILE + TILE / 2, wy = (p.y - L.OY) * TILE + TILE / 2;
      const x = wx - ox, y = wy - oy;
      if (x < -40 || y < -60 || x > screenW + 40 || y > screenH + 40) continue;
      this.drawProp(ctx, p, x, y);
    }
  },

  drawProp(ctx, p, x, y) {
    const pal = World.dungeonLayout.pal;
    const t = p.t;
    const flick = 0.6 + 0.4 * Math.sin(World.time * 6 + x * 0.1);
    const shadow = () => { ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(x, y + 9, 9, 4, 0, 0, 7); ctx.fill(); };
    switch (t) {
      case 'torch':
        ctx.fillStyle = '#4a3423'; ctx.fillRect(x - 2, y - 12, 4, 16);
        ctx.fillStyle = 'rgba(255,150,40,' + (0.15 * flick) + ')';
        ctx.beginPath(); ctx.arc(x, y - 16, 30, 0, 7); ctx.fill();
        ctx.fillStyle = '#ff8a3c'; ctx.beginPath(); ctx.ellipse(x, y - 17, 4, 7 * flick, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#ffe27a'; ctx.beginPath(); ctx.ellipse(x, y - 16, 2, 4 * flick, 0, 0, 7); ctx.fill();
        break;
      case 'brazier':
      case 'lantern': {
        shadow();
        ctx.fillStyle = '#59606e'; ctx.fillRect(x - 6, y - 2, 12, 6); ctx.fillRect(x - 3, y + 3, 6, 5);
        const c = t === 'lantern' ? '#8fd8ff' : '#ff9c3c';
        ctx.fillStyle = 'rgba(255,180,90,' + (0.16 * flick) + ')'; ctx.beginPath(); ctx.arc(x, y - 6, 34, 0, 7); ctx.fill();
        ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(x, y - 8, 5, 8 * flick, 0, 0, 7); ctx.fill();
        break;
      }
      case 'pillar':
        ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(x - 12, y + 4, 24, 6);
        ctx.fillStyle = this.shade(pal.wallTop, 16); ctx.fillRect(x - 10, y - 26, 20, 30);
        ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(x + 4, y - 26, 6, 30);
        ctx.fillStyle = this.shade(pal.wallTop, 30); ctx.fillRect(x - 12, y - 30, 24, 6); ctx.fillRect(x - 12, y + 0, 24, 5);
        break;
      case 'icepillar':
        ctx.fillStyle = 'rgba(180,230,255,.85)'; ctx.fillRect(x - 8, y - 28, 16, 32);
        ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillRect(x - 5, y - 26, 4, 28);
        break;
      case 'ruinpillar':
        ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(x - 10, y + 4, 20, 5);
        ctx.fillStyle = this.shade(pal.wallTop, 20); ctx.fillRect(x - 8, y - 12, 16, 18);
        ctx.fillStyle = '#6d8a3a'; ctx.fillRect(x - 8, y - 12, 16, 3);
        break;
      case 'brokenwall':
        ctx.fillStyle = pal.wall; ctx.fillRect(x - 14, y - 10, 28, 18);
        ctx.fillStyle = pal.wallTop; ctx.fillRect(x - 14, y - 10, 28, 4);
        ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(x - 2, y - 10, 7, 18);
        break;
      case 'coffin':
        shadow();
        ctx.fillStyle = '#6a5a48'; ctx.fillRect(x - 8, y - 14, 16, 26);
        ctx.fillStyle = '#4e4235'; ctx.fillRect(x - 8, y - 14, 16, 3); ctx.fillRect(x - 8, y + 9, 16, 3);
        ctx.fillStyle = '#c9b98a'; ctx.fillRect(x - 1, y - 8, 2, 12); ctx.fillRect(x - 5, y - 4, 10, 2);
        break;
      case 'grave':
        shadow();
        ctx.fillStyle = '#8e97a4'; ctx.fillRect(x - 7, y - 14, 14, 18);
        ctx.beginPath(); ctx.arc(x, y - 14, 7, Math.PI, 0); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(x - 4, y - 10, 8, 2); ctx.fillRect(x - 4, y - 6, 8, 2);
        break;
      case 'statue':
      case 'frozenstatue':
      case 'taintedstatue': {
        shadow();
        const c = t === 'frozenstatue' ? '#bfe4f5' : t === 'taintedstatue' ? '#7a5a8a' : '#9aa0ac';
        ctx.fillStyle = this.shade(c, -25); ctx.fillRect(x - 9, y + 2, 18, 6);
        ctx.fillStyle = c; ctx.fillRect(x - 6, y - 22, 12, 24);
        ctx.beginPath(); ctx.arc(x, y - 24, 5, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(x - 5, y - 20, 3, 20);
        break;
      }
      case 'idol':
      case 'sunidol': {
        shadow();
        const c = t === 'sunidol' ? '#f6c453' : '#c9a860';
        ctx.fillStyle = this.shade(c, -30); ctx.fillRect(x - 10, y + 2, 20, 6);
        ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y - 8, 11, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.35)';
        for (let i = 0; i < 8; i++) { const a = i * 0.785; ctx.fillRect(x + Math.cos(a) * 13 - 1, y - 8 + Math.sin(a) * 13 - 1, 3, 3); }
        break;
      }
      case 'throne':
        shadow();
        ctx.fillStyle = '#2a2436'; ctx.fillRect(x - 14, y - 30, 28, 38);
        ctx.fillStyle = '#3c3450'; ctx.fillRect(x - 10, y - 8, 20, 14);
        ctx.fillStyle = pal.accent; ctx.fillRect(x - 3, y - 34, 6, 8);
        break;
      case 'anvil':
        shadow();
        ctx.fillStyle = '#3e434e'; ctx.fillRect(x - 10, y - 8, 20, 6); ctx.fillRect(x - 4, y - 2, 8, 6); ctx.fillRect(x - 8, y + 4, 16, 4);
        ctx.fillStyle = '#5a616e'; ctx.fillRect(x - 10, y - 8, 20, 2);
        break;
      case 'furnace': {
        shadow();
        ctx.fillStyle = '#4a4046'; ctx.fillRect(x - 13, y - 24, 26, 32);
        ctx.fillStyle = 'rgba(255,140,40,' + (0.18 * flick) + ')'; ctx.beginPath(); ctx.arc(x, y - 6, 36, 0, 7); ctx.fill();
        ctx.fillStyle = '#ff8a3c'; ctx.fillRect(x - 7, y - 12, 14, 12);
        ctx.fillStyle = '#ffe27a'; ctx.fillRect(x - 4, y - 8, 8, 8);
        break;
      }
      case 'vent': {
        ctx.fillStyle = '#2b1e1b'; ctx.beginPath(); ctx.ellipse(x, y, 12, 6, 0, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,120,40,' + (0.25 + 0.3 * flick) + ')'; ctx.beginPath(); ctx.ellipse(x, y, 7, 3, 0, 0, 7); ctx.fill();
        break;
      }
      case 'lavarock':
      case 'obsidian': {
        shadow();
        const c = t === 'obsidian' ? '#2a2230' : '#43312c';
        ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x - 11, y + 6); ctx.lineTo(x - 4, y - 10); ctx.lineTo(x + 7, y - 6); ctx.lineTo(x + 11, y + 6); ctx.closePath(); ctx.fill();
        ctx.fillStyle = t === 'obsidian' ? 'rgba(160,120,255,.4)' : 'rgba(255,120,40,' + (0.3 * flick + 0.2) + ')';
        ctx.fillRect(x - 3, y - 3, 6, 3);
        break;
      }
      case 'goldpile':
        shadow();
        ctx.fillStyle = '#c9a04a'; ctx.beginPath(); ctx.ellipse(x, y + 2, 15, 7, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#f6c453'; ctx.beginPath(); ctx.ellipse(x - 3, y - 1, 8, 4, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff0a8'; ctx.fillRect(x + 3, y - 4, 4, 3); ctx.fillRect(x - 8, y + 1, 3, 2);
        break;
      case 'egg':
        shadow();
        ctx.fillStyle = '#c2b09a'; ctx.beginPath(); ctx.ellipse(x, y - 4, 8, 12, 0, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,140,60,.35)'; ctx.beginPath(); ctx.ellipse(x - 2, y - 6, 4, 6, 0, 0, 7); ctx.fill();
        break;
      case 'skull':
      case 'bone':
        ctx.fillStyle = '#ded4c2';
        if (t === 'skull') {
          ctx.beginPath(); ctx.arc(x, y, 6, 0, 7); ctx.fill(); ctx.fillRect(x - 4, y + 3, 8, 4);
          ctx.fillStyle = '#2a2420'; ctx.fillRect(x - 3, y - 1, 2, 3); ctx.fillRect(x + 1, y - 1, 2, 3);
        } else { ctx.fillRect(x - 8, y, 16, 3); ctx.fillRect(x - 9, y - 2, 3, 7); ctx.fillRect(x + 6, y - 2, 3, 7); }
        break;
      case 'skullpile':
        shadow();
        ctx.fillStyle = '#ded4c2';
        for (const [dx, dy] of [[-7, 2], [0, 0], [7, 3], [-3, -6], [4, -5]]) { ctx.beginPath(); ctx.arc(x + dx, y + dy, 5, 0, 7); ctx.fill(); }
        break;
      case 'web':
        ctx.strokeStyle = 'rgba(230,225,240,.55)'; ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) { ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(i * 1.05) * 18, y + Math.sin(i * 1.05) * 18); }
        for (const r of [7, 12, 17]) ctx.arc(x, y, r, 0, 7);
        ctx.stroke();
        break;
      case 'eggsac':
        shadow();
        ctx.fillStyle = '#e6dff0'; ctx.beginPath(); ctx.ellipse(x, y - 4, 9, 11, 0, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(120,80,160,.5)'; ctx.beginPath(); ctx.ellipse(x, y - 4, 5, 7, 0, 0, 7); ctx.fill();
        break;
      case 'cocoon':
        ctx.fillStyle = '#ddd6e8'; ctx.beginPath(); ctx.ellipse(x, y - 6, 7, 14, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.moveTo(x, y - 20); ctx.lineTo(x, y - 30); ctx.stroke();
        break;
      case 'mushroom': {
        const c = ['#e05252', '#b47fff', '#f6c453'][Math.floor(hash2(x | 0, y | 0) * 3)];
        ctx.fillStyle = '#e8e0d0'; ctx.fillRect(x - 2, y - 4, 4, 8);
        ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(x, y - 5, 8, 5, 0, Math.PI, 0); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillRect(x - 3, y - 7, 2, 2); ctx.fillRect(x + 2, y - 8, 2, 2);
        break;
      }
      case 'crate':
      case 'barrel':
        shadow();
        ctx.fillStyle = '#8a6a3e'; ctx.fillRect(x - 9, y - 12, 18, 20);
        ctx.fillStyle = '#6b5230'; ctx.fillRect(x - 9, y - 6, 18, 3); ctx.fillRect(x - 9, y + 2, 18, 3);
        if (t === 'crate') { ctx.fillStyle = '#a3814d'; ctx.fillRect(x - 9, y - 12, 18, 3); }
        break;
      case 'tent':
        shadow();
        ctx.fillStyle = '#8a6a3a'; ctx.beginPath(); ctx.moveTo(x - 18, y + 8); ctx.lineTo(x, y - 20); ctx.lineTo(x + 18, y + 8); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#6d5230'; ctx.beginPath(); ctx.moveTo(x - 5, y + 8); ctx.lineTo(x, y - 6); ctx.lineTo(x + 5, y + 8); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#c0392b'; ctx.fillRect(x - 1, y - 24, 2, 6);
        break;
      case 'campfire':
        ctx.fillStyle = 'rgba(255,150,40,' + (0.16 * flick) + ')'; ctx.beginPath(); ctx.arc(x, y, 38, 0, 7); ctx.fill();
        ctx.fillStyle = '#5b3a1e'; ctx.fillRect(x - 10, y + 2, 20, 4); ctx.fillRect(x - 4, y - 1, 12, 4);
        ctx.fillStyle = '#ff8a3c'; ctx.beginPath(); ctx.ellipse(x, y - 6, 6, 10 * flick, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#ffe27a'; ctx.beginPath(); ctx.ellipse(x, y - 4, 3, 5 * flick, 0, 0, 7); ctx.fill();
        break;
      case 'palisade':
      case 'spike':
        ctx.fillStyle = '#6b4a2a';
        for (let i = -12; i <= 12; i += 8) {
          ctx.fillRect(x + i, y - 14, 5, 22);
          ctx.beginPath(); ctx.moveTo(x + i, y - 14); ctx.lineTo(x + i + 2.5, y - 22); ctx.lineTo(x + i + 5, y - 14); ctx.closePath(); ctx.fill();
        }
        break;
      case 'fence':
        ctx.fillStyle = '#a3814d'; ctx.fillRect(x - 16, y - 6, 32, 3); ctx.fillRect(x - 16, y + 1, 32, 3);
        ctx.fillStyle = '#7a5a34'; ctx.fillRect(x - 14, y - 12, 4, 20); ctx.fillRect(x + 10, y - 12, 4, 20);
        break;
      case 'haystack':
        shadow();
        ctx.fillStyle = '#e0b849'; ctx.beginPath(); ctx.ellipse(x, y - 2, 14, 11, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#c99f34'; ctx.beginPath(); ctx.ellipse(x, y + 3, 14, 6, 0, 0, 7); ctx.fill();
        break;
      case 'crop':
        ctx.fillStyle = '#5b432c'; ctx.fillRect(x - 14, y + 2, 28, 5);
        ctx.fillStyle = '#6fd46f';
        for (let i = -10; i <= 10; i += 7) { ctx.fillRect(x + i, y - 8, 2, 11); ctx.fillRect(x + i - 2, y - 5, 6, 2); }
        break;
      case 'scarecrow':
        shadow();
        ctx.fillStyle = '#7a5a34'; ctx.fillRect(x - 2, y - 26, 4, 32); ctx.fillRect(x - 14, y - 18, 28, 3);
        ctx.fillStyle = '#c0392b'; ctx.fillRect(x - 8, y - 18, 16, 14);
        ctx.fillStyle = '#e0b849'; ctx.beginPath(); ctx.arc(x, y - 24, 7, 0, 7); ctx.fill();
        ctx.fillStyle = '#2a2420'; ctx.fillRect(x - 3, y - 26, 2, 2); ctx.fillRect(x + 1, y - 26, 2, 2);
        break;
      case 'tree':
      case 'deadtree': {
        shadow();
        const dead = t === 'deadtree';
        ctx.fillStyle = dead ? '#4a3a2a' : '#5b3a1e';
        ctx.fillRect(x - 4, y - 18, 8, 24);
        if (dead) {
          ctx.strokeStyle = '#4a3a2a'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(x, y - 14); ctx.lineTo(x - 14, y - 26); ctx.moveTo(x, y - 18); ctx.lineTo(x + 13, y - 30); ctx.stroke();
        } else {
          ctx.fillStyle = '#2f7a34'; ctx.beginPath(); ctx.arc(x, y - 26, 17, 0, 7); ctx.fill();
          ctx.fillStyle = '#3f9440'; ctx.beginPath(); ctx.arc(x - 5, y - 30, 11, 0, 7); ctx.fill();
        }
        break;
      }
      case 'vine':
        ctx.strokeStyle = '#3f8a45'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, y - 22); ctx.quadraticCurveTo(x + 8, y - 10, x - 2, y + 4); ctx.stroke();
        ctx.fillStyle = '#57b05a'; ctx.fillRect(x + 3, y - 14, 4, 3); ctx.fillRect(x - 5, y - 4, 4, 3);
        break;
      case 'algae':
      case 'coral':
        ctx.fillStyle = t === 'coral' ? '#e07f9a' : '#4fae72';
        for (let i = 0; i < 3; i++) ctx.fillRect(x - 6 + i * 5, y - 4 - i % 2 * 4, 3, 10 + i % 2 * 4);
        break;
      case 'mossstone':
        shadow();
        ctx.fillStyle = '#7c8288'; ctx.beginPath(); ctx.ellipse(x, y, 12, 8, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#5f8a3a'; ctx.beginPath(); ctx.ellipse(x - 2, y - 4, 8, 4, 0, 0, 7); ctx.fill();
        break;
      case 'reed':
        ctx.fillStyle = '#7f9450';
        for (let i = -6; i <= 6; i += 4) { ctx.fillRect(x + i, y - 14, 2, 18); ctx.fillRect(x + i - 1, y - 17, 4, 4); }
        break;
      case 'icicle':
        ctx.fillStyle = 'rgba(200,240,255,.9)';
        for (const dx of [-8, 0, 9]) { ctx.beginPath(); ctx.moveTo(x + dx - 3, y - 18); ctx.lineTo(x + dx + 3, y - 18); ctx.lineTo(x + dx, y + 2); ctx.closePath(); ctx.fill(); }
        break;
      case 'icepatch':
        ctx.fillStyle = 'rgba(190,235,255,.35)';
        ctx.beginPath(); ctx.ellipse(x, y, (p.r || 2) * TILE * 0.8, (p.r || 2) * TILE * 0.5, 0, 0, 7); ctx.fill();
        break;
      case 'candle':
        ctx.fillStyle = '#e8e0d0'; ctx.fillRect(x - 2, y - 8, 4, 10);
        ctx.fillStyle = 'rgba(255,200,120,' + (0.14 * flick) + ')'; ctx.beginPath(); ctx.arc(x, y - 12, 22, 0, 7); ctx.fill();
        ctx.fillStyle = '#ffd97a'; ctx.beginPath(); ctx.ellipse(x, y - 11, 2, 4 * flick, 0, 0, 7); ctx.fill();
        break;
      case 'carpet':
        ctx.fillStyle = '#7a2e2e'; ctx.fillRect(x - 22, y - 12, 44, 26);
        ctx.fillStyle = '#a3453f'; ctx.fillRect(x - 18, y - 8, 36, 18);
        ctx.fillStyle = '#c9a05a'; ctx.fillRect(x - 12, y - 3, 24, 8);
        break;
      case 'bookshelf':
        ctx.fillStyle = '#4a3628'; ctx.fillRect(x - 14, y - 26, 28, 34);
        for (let r = 0; r < 3; r++) for (let i = 0; i < 6; i++) {
          ctx.fillStyle = ['#c0392b', '#3f8ef0', '#6fd46f', '#f6c453'][(i + r) % 4];
          ctx.fillRect(x - 12 + i * 4, y - 24 + r * 11, 3, 9);
        }
        break;
      case 'dagger':
        ctx.fillStyle = '#9aa0ac'; ctx.fillRect(x - 1, y - 12, 2, 14);
        ctx.fillStyle = '#5b3a1e'; ctx.fillRect(x - 4, y + 1, 8, 3);
        break;
      case 'weaponrack':
        ctx.fillStyle = '#5b3a1e'; ctx.fillRect(x - 14, y + 4, 28, 4);
        ctx.fillStyle = '#9aa0ac';
        for (const dx of [-8, 0, 8]) { ctx.fillRect(x + dx - 1, y - 18, 2, 22); ctx.fillRect(x + dx - 4, y - 12, 8, 2); }
        break;
      case 'banner':
        ctx.fillStyle = '#3a2c20'; ctx.fillRect(x - 1, y - 34, 2, 12);
        ctx.fillStyle = pal.accent; ctx.fillRect(x - 8, y - 32, 16, 24);
        ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.moveTo(x - 8, y - 8); ctx.lineTo(x, y - 14); ctx.lineTo(x + 8, y - 8); ctx.closePath(); ctx.fill();
        break;
      case 'chain':
        ctx.strokeStyle = '#6a6a72'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, y - 34); ctx.lineTo(x, y + 2); ctx.stroke();
        ctx.fillStyle = '#8a8a94'; for (let i = -30; i < 0; i += 7) ctx.fillRect(x - 3, y + i, 6, 3);
        break;
      case 'gear':
        ctx.fillStyle = '#6a6a72'; ctx.beginPath(); ctx.arc(x, y, 11, 0, 7); ctx.fill();
        ctx.fillStyle = pal.floor; ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill();
        ctx.fillStyle = '#8a8a94'; for (let i = 0; i < 8; i++) { const a = i * 0.785; ctx.fillRect(x + Math.cos(a) * 12 - 2, y + Math.sin(a) * 12 - 2, 4, 4); }
        break;
      case 'support':
        ctx.fillStyle = '#7a5a34'; ctx.fillRect(x - 16, y - 26, 5, 34); ctx.fillRect(x + 11, y - 26, 5, 34); ctx.fillRect(x - 18, y - 30, 36, 6);
        break;
      case 'rail':
        ctx.fillStyle = '#5b4a34'; ctx.fillRect(x - 16, y - 6, 32, 3); ctx.fillRect(x - 16, y + 4, 32, 3);
        ctx.fillStyle = '#8a8a94'; ctx.fillRect(x - 16, y - 4, 32, 2); ctx.fillRect(x - 16, y + 6, 32, 2);
        break;
      case 'cart':
        shadow();
        ctx.fillStyle = '#6a5230'; ctx.fillRect(x - 12, y - 12, 24, 16);
        ctx.fillStyle = '#3e434e'; ctx.beginPath(); ctx.arc(x - 8, y + 6, 4, 0, 7); ctx.arc(x + 8, y + 6, 4, 0, 7); ctx.fill();
        ctx.fillStyle = '#c9a05a'; ctx.fillRect(x - 8, y - 14, 16, 4);
        break;
      case 'orevein':
        ctx.fillStyle = '#6b7683'; ctx.beginPath(); ctx.ellipse(x, y, 13, 9, 0, 0, 7); ctx.fill();
        ctx.fillStyle = pal.accent;
        for (const [dx, dy] of [[-4, -2], [3, 1], [0, 4], [6, -3]]) ctx.fillRect(x + dx, y + dy, 3, 3);
        break;
      case 'urn':
        shadow();
        ctx.fillStyle = '#a3814d'; ctx.beginPath(); ctx.ellipse(x, y - 5, 8, 11, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#7a5a34'; ctx.fillRect(x - 5, y - 16, 10, 4);
        break;
      case 'glyph': {
        const g = 0.35 + 0.4 * Math.sin(World.time * 2 + x * 0.05);
        ctx.strokeStyle = pal.accent; ctx.globalAlpha = g; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, 13, 0, 7); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - 9, y - 9); ctx.lineTo(x + 9, y + 9); ctx.moveTo(x + 9, y - 9); ctx.lineTo(x - 9, y + 9); ctx.stroke();
        ctx.globalAlpha = 1;
        break;
      }
      case 'runestone':
      case 'shadowrune': {
        shadow();
        const c = t === 'shadowrune' ? '#a98fff' : pal.accent;
        ctx.fillStyle = '#4a4a55'; ctx.fillRect(x - 8, y - 20, 16, 26);
        ctx.fillStyle = c; ctx.globalAlpha = 0.5 + 0.4 * Math.sin(World.time * 2.4 + x * 0.07);
        ctx.fillRect(x - 4, y - 15, 8, 3); ctx.fillRect(x - 4, y - 8, 8, 3); ctx.fillRect(x - 2, y - 1, 4, 3);
        ctx.globalAlpha = 1;
        break;
      }
      case 'floatcrystal': {
        const bob = Math.sin(World.time * 1.6 + x * 0.05) * 5;
        ctx.fillStyle = 'rgba(150,120,255,.18)'; ctx.beginPath(); ctx.arc(x, y - 16 + bob, 22, 0, 7); ctx.fill();
        ctx.fillStyle = '#b79cf0';
        ctx.beginPath(); ctx.moveTo(x, y - 30 + bob); ctx.lineTo(x + 8, y - 14 + bob); ctx.lineTo(x, y - 4 + bob); ctx.lineTo(x - 8, y - 14 + bob); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(x - 2, y - 24 + bob, 2, 14);
        break;
      }
      case 'rift': {
        const s2 = 1 + 0.15 * Math.sin(World.time * 2 + x);
        ctx.fillStyle = 'rgba(120,60,220,.28)'; ctx.beginPath(); ctx.ellipse(x, y - 10, 16 * s2, 30 * s2, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#0a0714'; ctx.beginPath(); ctx.ellipse(x, y - 10, 7 * s2, 22 * s2, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = '#b47fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y - 10, 7 * s2, 22 * s2, 0, 0, 7); ctx.stroke();
        break;
      }
      case 'star': {
        const tw = 0.4 + 0.5 * Math.sin(World.time * 3 + x * 0.1);
        ctx.fillStyle = 'rgba(230,220,255,' + tw + ')';
        ctx.fillRect(x - 1, y - 6, 2, 12); ctx.fillRect(x - 6, y - 1, 12, 2);
        break;
      }
      case 'cloud':
        ctx.fillStyle = 'rgba(255,255,255,.75)';
        ctx.beginPath(); ctx.ellipse(x, y, 22, 10, 0, 0, 7); ctx.ellipse(x - 12, y + 3, 12, 7, 0, 0, 7); ctx.ellipse(x + 13, y + 2, 13, 8, 0, 0, 7); ctx.fill();
        break;
      case 'skyflower':
        ctx.fillStyle = '#6fd4c4'; ctx.fillRect(x - 1, y - 6, 2, 10);
        ctx.fillStyle = '#ffd97a'; for (let i = 0; i < 5; i++) { const a = i * 1.256; ctx.fillRect(x + Math.cos(a) * 5 - 2, y - 8 + Math.sin(a) * 5 - 2, 4, 4); }
        break;
      case 'bridgepost':
        ctx.fillStyle = '#6a5230'; ctx.fillRect(x - 3, y - 12, 6, 14);
        break;
      case 'spore': {
        const g = 0.4 + 0.4 * Math.sin(World.time * 2 + x * 0.08);
        ctx.fillStyle = 'rgba(150,220,110,' + g * 0.4 + ')'; ctx.beginPath(); ctx.arc(x, y - 6, 16, 0, 7); ctx.fill();
        ctx.fillStyle = '#7ab04a'; ctx.beginPath(); ctx.ellipse(x, y - 4, 8, 9, 0, 0, 7); ctx.fill();
        break;
      }
      case 'grass':
        ctx.fillStyle = 'rgba(120,180,90,.7)';
        for (let i = -8; i <= 8; i += 5) ctx.fillRect(x + i, y - 6, 2, 9);
        break;
      default:
        ctx.fillStyle = pal.accent; ctx.fillRect(x - 3, y - 3, 6, 6);
    }
  },

  /* =================================================================
     CIDADES — sprites procedurais de prédio
     ================================================================= */
  buildingSprite(b, pal) {
    if (b.tint) {
      // telhados variados dão personalidade ao casario
      const ROOFS = [['#b8422f', '#9c3527'], ['#4a6b8a', '#3a5570'], ['#7d5a3a', '#63462c'],
        ['#5f7a4a', '#4b6239'], ['#8a6a9a', '#6f5480'], ['#c07a3a', '#a1622b']];
      const [r1, r2] = ROOFS[b.tint % ROOFS.length];
      pal = Object.assign({}, pal, { roof: r1, roof2: r2, house: this.shade(pal.house, (b.tint % 3 - 1) * 10) });
    }
    const key = [b.style, b.w, b.h, pal.roof, pal.house, pal.wall].join('|');
    if (this._bcache.has(key)) return this._bcache.get(key);
    const W = b.w * TILE, H = (b.h + 1) * TILE;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    this.paintBuilding(g, b.style, W, H, pal);
    this._bcache.set(key, c);
    return c;
  },

  paintBuilding(g, style, W, H, pal) {
    const roof = pal.roof, roof2 = pal.roof2, house = pal.house, wood = pal.wood, stone = pal.wall;
    const bodyTop = Math.round(H * 0.42), bodyH = H - bodyTop - 4;
    const win = (x, y, w, h) => {
      g.fillStyle = '#2b3448'; g.fillRect(x, y, w, h);
      g.fillStyle = 'rgba(246,196,83,.85)'; g.fillRect(x + 1, y + 1, w - 2, h - 2);
      g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(x + w / 2 - 0.5, y, 1, h); g.fillRect(x, y + h / 2 - 0.5, w, 1);
    };
    const door = (cx) => {
      const dw = Math.max(10, W * 0.13), dh = bodyH * 0.55;
      g.fillStyle = wood; g.fillRect(cx - dw / 2, H - 4 - dh, dw, dh);
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(cx - dw / 2, H - 4 - dh, dw, 2);
      g.fillStyle = pal.accent; g.fillRect(cx + dw / 4, H - 4 - dh / 2, 2, 2);
    };
    const gableRoof = (topY, overhang) => {
      g.fillStyle = roof;
      g.beginPath(); g.moveTo(-overhang, bodyTop); g.lineTo(W / 2, topY); g.lineTo(W + overhang, bodyTop); g.closePath(); g.fill();
      g.fillStyle = roof2;
      g.beginPath(); g.moveTo(W / 2, topY); g.lineTo(W + overhang, bodyTop); g.lineTo(W / 2, bodyTop); g.closePath(); g.fill();
      // telhas
      g.fillStyle = 'rgba(0,0,0,.16)';
      for (let y = bodyTop; y > topY; y -= 6) {
        const t = (bodyTop - y) / (bodyTop - topY);
        const half = (W / 2 + overhang) * (1 - t);
        g.fillRect(W / 2 - half, y, half * 2, 1);
      }
    };
    const timberBody = () => {
      g.fillStyle = house; g.fillRect(2, bodyTop, W - 4, bodyH);
      g.fillStyle = 'rgba(0,0,0,.16)'; g.fillRect(2, H - 8, W - 4, 4);
      g.fillStyle = stone; g.fillRect(2, H - 10, W - 4, 6);      // alicerce de pedra
      g.fillStyle = wood;                                        // enxaimel
      g.fillRect(2, bodyTop, 3, bodyH); g.fillRect(W - 5, bodyTop, 3, bodyH);
      g.fillRect(2, bodyTop, W - 4, 3);
      for (let x = W * 0.25; x < W - 6; x += W * 0.25) g.fillRect(x, bodyTop, 2, bodyH - 6);
    };

    switch (style) {
      case 'castle':
      case 'palace': {
        const towerW = Math.max(16, W * 0.16);
        g.fillStyle = stone; g.fillRect(0, bodyTop - 8, W, H - bodyTop + 4);
        g.fillStyle = 'rgba(0,0,0,.14)';
        for (let y = bodyTop; y < H; y += 8) g.fillRect(0, y, W, 1);
        for (let x = 0; x < W; x += 14) g.fillRect(x, bodyTop - 8, 1, H);
        // torres laterais
        for (const tx of [0, W - towerW]) {
          g.fillStyle = this.shade(stone, 12); g.fillRect(tx, 18, towerW, H - 22);
          g.fillStyle = this.shade(stone, 26);
          for (let i = 0; i < towerW; i += 8) g.fillRect(tx + i, 12, 5, 8);
          g.fillStyle = style === 'palace' ? pal.roof : roof;
          g.beginPath(); g.moveTo(tx - 3, 18); g.lineTo(tx + towerW / 2, style === 'palace' ? -2 : 0); g.lineTo(tx + towerW + 3, 18); g.closePath(); g.fill();
          g.fillStyle = '#2b3448'; g.fillRect(tx + towerW / 2 - 3, 34, 6, 9);
          g.fillStyle = 'rgba(246,196,83,.8)'; g.fillRect(tx + towerW / 2 - 2, 35, 4, 7);
        }
        // ameias centrais
        g.fillStyle = this.shade(stone, 22);
        for (let x = towerW + 2; x < W - towerW - 4; x += 12) g.fillRect(x, bodyTop - 14, 7, 8);
        // portão
        const gw = Math.max(18, W * 0.16);
        g.fillStyle = '#2a2018'; g.fillRect(W / 2 - gw / 2, H - 4 - bodyH * 0.62, gw, bodyH * 0.62);
        g.beginPath(); g.arc(W / 2, H - 4 - bodyH * 0.62, gw / 2, Math.PI, 0); g.fill();
        g.fillStyle = wood; g.fillRect(W / 2 - gw / 2 + 3, H - 4 - bodyH * 0.55, gw - 6, bodyH * 0.55);
        g.fillStyle = 'rgba(0,0,0,.35)';
        for (let i = 0; i < gw - 6; i += 5) g.fillRect(W / 2 - gw / 2 + 3 + i, H - 4 - bodyH * 0.55, 1, bodyH * 0.55);
        // janelas
        for (let x = towerW + 10; x < W - towerW - 10; x += 20) win(x, bodyTop + 6, 7, 11);
        if (style === 'palace') { // cúpula dourada
          g.fillStyle = pal.accent;
          g.beginPath(); g.ellipse(W / 2, bodyTop - 12, W * 0.16, 16, 0, Math.PI, 0); g.fill();
          g.fillRect(W / 2 - 1, bodyTop - 34, 2, 10);
        }
        break;
      }
      case 'church': {
        timberBody();
        gableRoof(4, 4);
        // campanário
        const sw = Math.max(12, W * 0.2);
        g.fillStyle = house; g.fillRect(W / 2 - sw / 2, 6, sw, bodyTop + 8);
        g.fillStyle = roof;
        g.beginPath(); g.moveTo(W / 2 - sw / 2 - 3, 8); g.lineTo(W / 2, -14); g.lineTo(W / 2 + sw / 2 + 3, 8); g.closePath(); g.fill();
        g.fillStyle = pal.accent; g.fillRect(W / 2 - 1, -24, 2, 12); g.fillRect(W / 2 - 5, -20, 10, 2);
        // rosácea
        g.fillStyle = '#2b3448'; g.beginPath(); g.arc(W / 2, bodyTop + 12, 7, 0, 7); g.fill();
        g.fillStyle = '#8fd8ff'; g.beginPath(); g.arc(W / 2, bodyTop + 12, 5, 0, 7); g.fill();
        g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(W / 2 - 5, bodyTop + 11, 10, 1); g.fillRect(W / 2 - 1, bodyTop + 7, 1, 10);
        door(W / 2);
        break;
      }
      case 'tower': {
        const tw = Math.min(W - 6, W * 0.8);
        g.fillStyle = stone; g.fillRect(W / 2 - tw / 2, 26, tw, H - 30);
        g.fillStyle = 'rgba(0,0,0,.16)';
        for (let y = 30; y < H; y += 9) g.fillRect(W / 2 - tw / 2, y, tw, 1);
        g.fillStyle = roof;
        g.beginPath(); g.moveTo(W / 2 - tw / 2 - 5, 28); g.lineTo(W / 2, -8); g.lineTo(W / 2 + tw / 2 + 5, 28); g.closePath(); g.fill();
        g.fillStyle = pal.accent; g.fillRect(W / 2 - 1, -16, 2, 10);
        win(W / 2 - 4, 44, 8, 11);
        win(W / 2 - 4, 68, 8, 11);
        door(W / 2);
        break;
      }
      case 'dome': {
        g.fillStyle = house; g.fillRect(2, bodyTop, W - 4, bodyH);
        g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(2, H - 8, W - 4, 4);
        g.fillStyle = roof;
        g.beginPath(); g.ellipse(W / 2, bodyTop + 2, W * 0.44, bodyTop * 0.8, 0, Math.PI, 0); g.fill();
        g.fillStyle = roof2;
        g.beginPath(); g.ellipse(W / 2 + W * 0.1, bodyTop + 2, W * 0.32, bodyTop * 0.62, 0, Math.PI, 0); g.fill();
        g.fillStyle = pal.accent; g.fillRect(W / 2 - 1, bodyTop - bodyTop * 0.8 - 10, 2, 12);
        for (let x = W * 0.2; x < W * 0.85; x += W * 0.3) {  // arcos
          g.fillStyle = '#3a2c20'; g.beginPath(); g.arc(x, H - 4 - bodyH * 0.4, bodyH * 0.2, Math.PI, 0); g.fill();
          g.fillRect(x - bodyH * 0.2, H - 4 - bodyH * 0.4, bodyH * 0.4, bodyH * 0.4);
        }
        break;
      }
      case 'hut': {
        g.fillStyle = house; g.fillRect(4, bodyTop, W - 8, bodyH);
        g.fillStyle = roof;
        g.beginPath(); g.moveTo(-2, bodyTop + 2); g.lineTo(W / 2, 2); g.lineTo(W + 2, bodyTop + 2); g.closePath(); g.fill();
        g.fillStyle = 'rgba(0,0,0,.15)';
        for (let y = bodyTop; y > 4; y -= 5) { const t = (bodyTop - y) / bodyTop, half = (W / 2 + 2) * (1 - t); g.fillRect(W / 2 - half, y, half * 2, 1); }
        door(W / 2);
        win(W * 0.2, bodyTop + 8, 6, 6); win(W * 0.75, bodyTop + 8, 6, 6);
        break;
      }
      case 'stilt': {
        g.fillStyle = wood;
        for (const x of [W * 0.18, W * 0.5, W * 0.82]) g.fillRect(x - 2, H - 22, 4, 20);
        g.fillStyle = this.shade(wood, 14); g.fillRect(2, H - 26, W - 4, 6);
        g.fillStyle = house; g.fillRect(4, bodyTop, W - 8, H - bodyTop - 26);
        g.fillStyle = roof;
        g.beginPath(); g.moveTo(-3, bodyTop + 3); g.lineTo(W / 2, 3); g.lineTo(W + 3, bodyTop + 3); g.closePath(); g.fill();
        win(W * 0.3, bodyTop + 7, 7, 7);
        g.fillStyle = wood; for (let i = 0; i < 4; i++) g.fillRect(W * 0.5 - 5, H - 20 + i * 5, 10, 2);
        break;
      }
      case 'pagoda': {
        g.fillStyle = house; g.fillRect(5, bodyTop + 4, W - 10, bodyH - 4);
        for (let i = 0; i < 3; i++) {
          const y = bodyTop + 2 - i * 12, half = (W / 2 + 4) * (1 - i * 0.22);
          g.fillStyle = i % 2 ? roof2 : roof;
          g.beginPath(); g.moveTo(W / 2 - half, y); g.lineTo(W / 2, y - 12); g.lineTo(W / 2 + half, y); g.closePath(); g.fill();
        }
        door(W / 2);
        break;
      }
      case 'forge': {
        g.fillStyle = stone; g.fillRect(2, bodyTop - 4, W - 4, H - bodyTop);
        g.fillStyle = 'rgba(0,0,0,.15)';
        for (let y = bodyTop; y < H; y += 7) g.fillRect(2, y, W - 4, 1);
        g.fillStyle = roof;
        g.beginPath(); g.moveTo(-3, bodyTop - 2); g.lineTo(W / 2, 8); g.lineTo(W + 3, bodyTop - 2); g.closePath(); g.fill();
        // chaminé + brilho da fornalha
        g.fillStyle = this.shade(stone, -16); g.fillRect(W * 0.72, 0, 12, bodyTop + 4);
        g.fillStyle = '#ff8a3c'; g.fillRect(W * 0.2, H - 4 - bodyH * 0.5, bodyH * 0.42, bodyH * 0.5);
        g.fillStyle = '#ffe27a'; g.fillRect(W * 0.2 + 4, H - 4 - bodyH * 0.4, bodyH * 0.3, bodyH * 0.4);
        g.fillStyle = '#3e434e'; g.fillRect(W * 0.6, H - 16, 16, 6); g.fillRect(W * 0.64, H - 10, 8, 6);
        break;
      }
      case 'barracks': {
        timberBody();
        g.fillStyle = roof; g.fillRect(-3, bodyTop - 10, W + 6, 12);
        g.fillStyle = roof2; g.fillRect(-3, bodyTop - 4, W + 6, 6);
        g.fillStyle = this.shade(stone, 20);
        for (let x = 2; x < W; x += 12) g.fillRect(x, bodyTop - 18, 7, 8);
        door(W / 2);
        win(W * 0.18, bodyTop + 8, 7, 8); win(W * 0.75, bodyTop + 8, 7, 8);
        // escudo na fachada
        g.fillStyle = pal.banner; g.beginPath(); g.moveTo(W / 2 - 6, bodyTop + 5); g.lineTo(W / 2 + 6, bodyTop + 5); g.lineTo(W / 2, bodyTop + 18); g.closePath(); g.fill();
        break;
      }
      case 'shop':
      case 'trade':
      case 'tavern':
      case 'workshop':
      default: {
        timberBody();
        gableRoof(6, 4);
        door(W / 2);
        win(W * 0.16, bodyTop + 9, 8, 9); win(W * 0.72, bodyTop + 9, 8, 9);
        // toldo/placa
        g.fillStyle = pal.banner;
        g.fillRect(W / 2 - W * 0.2, bodyTop + bodyH * 0.42, W * 0.4, 5);
        g.fillStyle = pal.banner2; g.fillRect(W / 2 - W * 0.2, bodyTop + bodyH * 0.42, W * 0.4, 2);
        if (style === 'workshop') { g.fillStyle = this.shade(stone, -10); g.fillRect(W * 0.78, 2, 9, bodyTop + 6); }
        break;
      }
    }
  },

  /* =================================================================
     CORES DE MAPA (minimapa e mapa grande)
     ================================================================= */
  mapColor(tx, ty, dungeon) {
    if (dungeon) {
      const pal = World.dungeonLayout ? World.dungeonLayout.pal : DUNGEON_PALETTES.cave;
      const t = World.terrainAt(tx, ty);
      if (t === TERRAIN.WALL) return pal.wall;
      if (t === TERRAIN.VOID) return '#07060f';
      if (t === TERRAIN.HAZARD) return pal.hazard;
      return t === TERRAIN.FLOOR2 ? pal.floor2 : pal.floor;
    }
    if (World.wallAt(tx, ty)) {
      const s = World.settlementAt(tx, ty, 4);
      return s ? s.pal.wall : '#8d939e';
    }
    const st = World.settlementAt(tx, ty);
    if (st) {
      if (WorldGen.buildingAt(tx, ty)) return st.pal.roof;
      return Math.hypot(tx - st.x, ty - st.y) < 8 ? '#b3ab9c' : '#a58a5f';
    }
    if (WorldGen.roadAt(tx, ty)) return '#a58a5f';
    return WorldGen.biomeAt(tx, ty).map;
  },

  /** Desenha todas as cidades visíveis: prédios, decoração e rótulos. */
  drawSettlements(ctx, ox, oy, screenW, screenH) {
    WorldGen.init();
    const pl = World.player;
    for (const s of WorldGen.SETTLEMENTS) {
      const sx = s.x * TILE - ox, sy = s.y * TILE - oy;
      const rad = (s.r + 6) * TILE;
      if (sx < -rad - screenW * 0.2 || sy < -rad - screenH * 0.2 || sx > screenW + rad || sy > screenH + rad) continue;
      this.drawSettlement(ctx, s, ox, oy, screenW, screenH);
      // rótulo da cidade
      const d = Math.hypot(pl.x - s.x * TILE, pl.y - s.y * TILE) / TILE;
      if (d < s.r + 26) {
        const label = s.icon + ' ' + WorldGen.localized(s, 'name');
        ctx.font = 'bold 15px "Courier New"'; ctx.textAlign = 'center';
        const w = ctx.measureText(label).width + 16;
        const ly = (s.y - s.r - 2) * TILE - oy;
        ctx.fillStyle = 'rgba(10,13,23,.72)'; ctx.fillRect(sx - w / 2, ly - 15, w, 20);
        ctx.strokeStyle = 'rgba(246,196,83,.45)'; ctx.strokeRect(sx - w / 2 + 0.5, ly - 14.5, w - 1, 19);
        ctx.fillStyle = s.pal.accent; ctx.fillText(label, sx, ly);
      }
    }
  },

  /** Decoração urbana determinística (árvores, bancos, hortas, poços…). */
  settlementDecor(s) {
    if (this._decor && this._decor[s.key]) return this._decor[s.key];
    this._decor = this._decor || {};
    const rng = mulberry32(hashStr('decor:' + s.key));
    const list = [];
    const kinds = s.ground === 'sand' ? ['palm', 'urnpot', 'bench', 'crate']
      : s.ground === 'snow' ? ['pine', 'snowpile', 'bench', 'crate']
        : s.ground === 'ash' ? ['deadtree', 'crate', 'barrel']
          : s.ground === 'jungle' ? ['palm', 'flowerbed', 'crate']
            : s.ground === 'boardwalk' ? ['reeds', 'barrel', 'boat']
              : ['tree', 'flowerbed', 'bench', 'barrel', 'cart', 'hedge'];
    for (let i = 0; i < s.r * 6; i++) {
      const a = rng() * Math.PI * 2, rr = 3 + Math.sqrt(rng()) * (s.r - 2.5);
      const tx = Math.round(s.x + Math.cos(a) * rr), ty = Math.round(s.y + Math.sin(a) * rr);
      const t = WorldGen.terrainAt(tx, ty);
      if (t === TERRAIN.ROAD || t === TERRAIN.PLAZA) continue;
      if (WorldGen.buildingAt(tx, ty) || WorldGen.wallAt(tx, ty)) continue;
      if (list.some(d => d.tx === tx && d.ty === ty)) continue;
      list.push({ tx, ty, kind: kinds[Math.floor(rng() * kinds.length)] });
    }
    // poço/fonte da praça nas cidades menores
    if (s.kind !== 'capital') list.push({ tx: s.x, ty: s.y + Math.max(2, s.r - 7), kind: 'well' });
    this._decor[s.key] = list;
    return list;
  },

  drawDecor(ctx, d, x, y, pal) {
    switch (d.kind) {
      case 'tree': case 'pine': case 'palm': case 'deadtree': {
        ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(x, y + 10, 12, 5, 0, 0, 7); ctx.fill();
        const trunk = d.kind === 'deadtree' ? '#4a3a2a' : '#6b4a2a';
        ctx.fillStyle = trunk; ctx.fillRect(x - 4, y - 16, 8, 26);
        if (d.kind === 'deadtree') {
          ctx.strokeStyle = trunk; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(x, y - 12); ctx.lineTo(x - 13, y - 24); ctx.moveTo(x, y - 16); ctx.lineTo(x + 12, y - 28); ctx.stroke();
        } else if (d.kind === 'palm') {
          ctx.strokeStyle = '#3f8a45'; ctx.lineWidth = 4;
          for (let i = 0; i < 5; i++) {
            const a = -0.4 + i * 0.65;
            ctx.beginPath(); ctx.moveTo(x, y - 18); ctx.quadraticCurveTo(x + Math.cos(a) * 16, y - 30, x + Math.cos(a) * 26, y - 16 + Math.sin(a) * 6); ctx.stroke();
          }
          ctx.fillStyle = '#a3763f'; ctx.beginPath(); ctx.arc(x + 4, y - 15, 3, 0, 7); ctx.fill();
        } else if (d.kind === 'pine') {
          ctx.fillStyle = '#2f6a4f';
          for (let i = 0; i < 3; i++) {
            const w = 20 - i * 5, yy = y - 12 - i * 10;
            ctx.beginPath(); ctx.moveTo(x - w / 2, yy); ctx.lineTo(x, yy - 16); ctx.lineTo(x + w / 2, yy); ctx.closePath(); ctx.fill();
          }
          ctx.fillStyle = 'rgba(255,255,255,.65)';
          ctx.beginPath(); ctx.moveTo(x - 6, y - 36); ctx.lineTo(x, y - 44); ctx.lineTo(x + 6, y - 36); ctx.closePath(); ctx.fill();
        } else {
          ctx.fillStyle = '#2f7a34'; ctx.beginPath(); ctx.arc(x, y - 26, 18, 0, 7); ctx.fill();
          ctx.fillStyle = '#3f9440'; ctx.beginPath(); ctx.arc(x - 6, y - 32, 11, 0, 7); ctx.fill();
          ctx.fillStyle = '#e05252'; ctx.fillRect(x + 6, y - 24, 3, 3); ctx.fillRect(x - 10, y - 20, 3, 3);
        }
        break;
      }
      case 'hedge':
        ctx.fillStyle = '#3f7a3a'; ctx.fillRect(x - 15, y - 8, 30, 16);
        ctx.fillStyle = '#4f9545'; ctx.fillRect(x - 15, y - 8, 30, 5);
        break;
      case 'flowerbed':
        ctx.fillStyle = '#5b432c'; ctx.fillRect(x - 13, y - 7, 26, 15);
        ctx.fillStyle = '#7a5a34'; ctx.fillRect(x - 13, y - 7, 26, 3);
        for (let i = 0; i < 6; i++) {
          ctx.fillStyle = ['#e86a9a', '#f2d04a', '#8fb4ff'][i % 3];
          ctx.fillRect(x - 10 + (i % 3) * 8, y - 3 + Math.floor(i / 3) * 6, 4, 4);
        }
        break;
      case 'bench':
        ctx.fillStyle = '#7a5a34'; ctx.fillRect(x - 13, y - 2, 26, 5); ctx.fillRect(x - 13, y - 12, 26, 4);
        ctx.fillStyle = '#5c4326'; ctx.fillRect(x - 11, y + 3, 3, 7); ctx.fillRect(x + 8, y + 3, 3, 7);
        break;
      case 'barrel':
        ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(x, y + 9, 9, 4, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#8a6a3e'; ctx.fillRect(x - 8, y - 12, 16, 21);
        ctx.fillStyle = '#6b5230'; ctx.fillRect(x - 8, y - 6, 16, 3); ctx.fillRect(x - 8, y + 2, 16, 3);
        break;
      case 'crate':
        ctx.fillStyle = '#a3814d'; ctx.fillRect(x - 9, y - 10, 18, 19);
        ctx.fillStyle = '#7a5a34'; ctx.fillRect(x - 9, y - 10, 18, 3); ctx.fillRect(x - 2, y - 10, 4, 19);
        break;
      case 'cart':
        ctx.fillStyle = '#6a5230'; ctx.fillRect(x - 16, y - 12, 32, 15);
        ctx.fillStyle = '#c9a05a'; ctx.fillRect(x - 12, y - 16, 24, 5);
        ctx.fillStyle = '#3e434e'; ctx.beginPath(); ctx.arc(x - 10, y + 6, 5, 0, 7); ctx.arc(x + 10, y + 6, 5, 0, 7); ctx.fill();
        break;
      case 'urnpot':
        ctx.fillStyle = '#a3763f'; ctx.beginPath(); ctx.ellipse(x, y - 2, 9, 12, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#2f9c8f'; ctx.fillRect(x - 6, y - 16, 12, 5);
        break;
      case 'snowpile':
        ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.ellipse(x, y + 2, 14, 8, 0, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(190,220,240,.9)'; ctx.beginPath(); ctx.ellipse(x + 4, y + 4, 8, 4, 0, 0, 7); ctx.fill();
        break;
      case 'reeds':
        ctx.fillStyle = '#7f9450';
        for (let i = -8; i <= 8; i += 4) { ctx.fillRect(x + i, y - 14, 2, 20); ctx.fillRect(x + i - 1, y - 18, 4, 5); }
        break;
      case 'boat':
        ctx.fillStyle = '#7a5a34'; ctx.beginPath(); ctx.ellipse(x, y + 2, 18, 8, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#5c4326'; ctx.beginPath(); ctx.ellipse(x, y, 14, 5, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#e8e0d0'; ctx.fillRect(x - 1, y - 24, 2, 24);
        break;
      case 'well':
        ctx.fillStyle = '#8b97a3'; ctx.fillRect(x - 12, y - 6, 24, 16);
        ctx.fillStyle = '#3a4a5a'; ctx.fillRect(x - 8, y - 2, 16, 8);
        ctx.fillStyle = '#5b3a1e'; ctx.fillRect(x - 11, y - 22, 4, 18); ctx.fillRect(x + 7, y - 22, 4, 18);
        ctx.fillStyle = pal.roof; ctx.beginPath(); ctx.moveTo(x - 16, y - 20); ctx.lineTo(x, y - 32); ctx.lineTo(x + 16, y - 20); ctx.closePath(); ctx.fill();
        break;
    }
  },

  drawSettlement(ctx, s, ox, oy, screenW, screenH) {
    WorldGen.init();
    const pal = s.pal;
    // decoração (atrás dos prédios)
    for (const d of this.settlementDecor(s)) {
      const x = d.tx * TILE + TILE / 2 - ox, y = d.ty * TILE + TILE / 2 - oy;
      if (x < -60 || y < -80 || x > screenW + 60 || y > screenH + 60) continue;
      this.drawDecor(ctx, d, x, y, pal);
    }
    // prédios
    for (const b of WorldGen.buildings) {
      if (b.settlement !== s.key) continue;
      const x = b.x * TILE - ox, y = b.y * TILE - oy;
      if (x > screenW + 240 || y > screenH + 240 || x < -320 || y < -320) continue;
      const spr = this.buildingSprite(b, pal);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(spr, x, y - TILE * 0.9);
      if (b.decor) continue;                      // casario não recebe placa
      // placa com nome
      const label = (b.icon || '') + ' ' + (EXP.buildingName ? EXP.buildingName(b) : WorldGen.localized(b, 'name'));
      ctx.font = 'bold 12px "Courier New"'; ctx.textAlign = 'center';
      const w = ctx.measureText(label).width + 10;
      ctx.fillStyle = 'rgba(10,13,23,.6)';
      ctx.fillRect(x + b.w * TILE / 2 - w / 2, y - TILE * 0.9 - 16, w, 14);
      ctx.fillStyle = pal.accent;
      ctx.fillText(label, x + b.w * TILE / 2, y - TILE * 0.9 - 5);
    }
    // barracas de mercado
    for (const m of (s.market || [])) {
      const x = (s.x + m.dx) * TILE - ox, y = (s.y + m.dy) * TILE - oy;
      if (x < -60 || y < -60 || x > screenW + 60 || y > screenH + 60) continue;
      ctx.fillStyle = '#6b4a2a'; ctx.fillRect(x + 2, y + 10, 3, 18); ctx.fillRect(x + 25, y + 10, 3, 18);
      ctx.fillStyle = pal.banner; ctx.fillRect(x - 2, y + 2, 34, 9);
      ctx.fillStyle = pal.banner2;
      for (let i = 0; i < 34; i += 8) ctx.fillRect(x - 2 + i, y + 2, 4, 9);
      ctx.fillStyle = '#8a6a3e'; ctx.fillRect(x, y + 16, 30, 5);
      ctx.fillStyle = ['#e05252', '#6fd46f', '#f6c453'][(m.dx + 9) % 3];
      ctx.fillRect(x + 6, y + 12, 5, 4); ctx.fillRect(x + 16, y + 12, 5, 4);
    }
    // estátua do fundador
    if (s.statue) {
      const x = (s.x + s.statue.dx) * TILE + TILE / 2 - ox, y = (s.y + s.statue.dy) * TILE + TILE / 2 - oy;
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(x, y + 10, 14, 6, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#8e97a4'; ctx.fillRect(x - 11, y + 2, 22, 8);
      ctx.fillStyle = '#a8b0bc'; ctx.fillRect(x - 6, y - 22, 12, 24);
      ctx.beginPath(); ctx.arc(x, y - 26, 6, 0, 7); ctx.fill();
      ctx.fillStyle = pal.accent; ctx.fillRect(x + 5, y - 30, 3, 26);   // lança
      ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(x - 5, y - 20, 3, 22);
    }
    // docas
    for (const d of (s.docks || [])) {
      const x = (s.x + d.dx) * TILE - ox, y = (s.y + d.dy) * TILE - oy;
      ctx.fillStyle = '#7a5a34'; ctx.fillRect(x, y, TILE * 2, TILE * 0.7);
      ctx.fillStyle = '#5c4326';
      for (let i = 0; i < TILE * 2; i += 8) ctx.fillRect(x + i, y, 1, TILE * 0.7);
      ctx.fillStyle = '#3a2c20'; ctx.fillRect(x + 4, y + TILE * 0.7, 4, 8); ctx.fillRect(x + TILE * 1.6, y + TILE * 0.7, 4, 8);
    }
    // bandeiras nas torres de portão
    if (s.wall) {
      for (const g of (s.gates || ['s'])) {
        const dirs = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[g];
        for (const side of [-1, 1]) {
          const tx = s.x + dirs[0] * (s.r + 1) + (dirs[0] ? 0 : side * 2);
          const ty = s.y + dirs[1] * (s.r + 1) + (dirs[1] ? 0 : side * 2);
          const bx = tx * TILE + TILE / 2 - ox, by = ty * TILE - oy;
          if (bx < -40 || by < -60 || bx > screenW + 40 || by > screenH + 40) continue;
          ctx.fillStyle = '#3a2c20'; ctx.fillRect(bx - 1, by - 28, 2, 28);
          const wave = Math.sin(World.time * 3 + tx) * 2;
          ctx.fillStyle = side < 0 ? pal.banner : pal.banner2;
          ctx.beginPath(); ctx.moveTo(bx, by - 28); ctx.lineTo(bx + 15, by - 24 + wave); ctx.lineTo(bx, by - 16); ctx.closePath(); ctx.fill();
        }
      }
    }
  },
};

// ============================================================
// GAME.JS — Core game loop, state, rendering, fog of war
// ============================================================

const TICK_RATE = 1 / 60;
const ATTACK_COOLDOWN = 0.5; // seconds between attacks

// Settlement names & populations
const SETTLEMENT_DATA = [
  { col: 17, row: 7,  name: 'Kerem',   pop: 1200 },
  { col: 19, row: 19, name: 'Havela',  pop: 800  },
  { col: 23, row: 13, name: 'Misgav', pop: 950  },
];

// ---- Game state ----
function createGameState() {
  const fog = new Uint8Array(COLS * ROWS); // 0=fogged, 1=revealed
  const fogOpacity = new Float32Array(COLS * ROWS).fill(1.0); // 1=black, 0=clear
  const grid = new Uint8Array(COLS * ROWS); // 0=passable, 1=blocked

  // Pre-reveal player start zone (cols 27-39)
  for (let r = 0; r < ROWS; r++)
    for (let c = 27; c < COLS; c++) {
      fog[r * COLS + c] = 1;
      fogOpacity[r * COLS + c] = 0;
    }

  const buildings = [];
  const units = [];

  // Player Command Base at col 35, row 14 (center)
  const cb = createBuilding('command_base', 35, 14, 'player');
  cb.buildProgress = 1;
  _markGrid(grid, 35, 14, 2, 2, 1);
  buildings.push(cb);

  // Enemy Command Base (hidden, col 3, row 13)
  const ecb = createBuilding('veil_command', 3, 13, 'enemy');
  ecb.buildProgress = 1;
  _markGrid(grid, 3, 13, 2, 2, 1);
  buildings.push(ecb);

  // Enemy initial barracks
  const eb1 = createBuilding('veil_barracks', 6, 10, 'enemy');
  eb1.buildProgress = 1;
  _markGrid(grid, 6, 10, 2, 2, 1);
  eb1.trainTimer = 10;
  buildings.push(eb1);

  // Enemy initial watch post
  const ewp = createBuilding('veil_watch_post', 8, 4, 'enemy');
  ewp.buildProgress = 1;
  _markGrid(grid, 8, 4, 1, 1, 1);
  ewp.trainTimer = 12;
  buildings.push(ewp);

  // Enemy initial radar
  const erad = createBuilding('veil_radar', 5, 17, 'enemy');
  erad.buildProgress = 1;
  _markGrid(grid, 5, 17, 1, 1, 1);
  buildings.push(erad);

  // Neutral settlements
  for (const sd of SETTLEMENT_DATA) {
    const s = createSettlement(sd.col, sd.row, sd.name, sd.pop);
    s.buildProgress = 1;
    _markGrid(grid, sd.col, sd.row, 2, 2, 1);
    buildings.push(s);
  }

  // Player starting units: 3 soldiers near command base
  for (let i = 0; i < 3; i++) {
    units.push(createUnit('soldier', 33 + i, 15, 'player'));
  }

  // ---- Terrain enrichment precomputation ----

  // fogLit: which tiles are currently in a unit's sight (reset each frame)
  const fogLit = new Uint8Array(COLS * ROWS);
  // Pre-lit player start zone
  for (let r = 0; r < ROWS; r++)
    for (let c = 27; c < COLS; c++)
      fogLit[r * COLS + c] = 1;

  // Zone base colors [R, G, B]
  const _DIRT = [58, 48, 32];
  const _NEUT = [34, 46, 20];
  const _GRAS = [42, 58, 26];
  function _lerp3(a, b, t) {
    return [Math.round(a[0]+(b[0]-a[0])*t), Math.round(a[1]+(b[1]-a[1])*t), Math.round(a[2]+(b[2]-a[2])*t)];
  }

  // Per-tile color strings with noise + zone transitions
  const tileColors = new Array(COLS * ROWS);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      let base;
      if      (c <= 8)  base = _DIRT;
      else if (c <= 12) base = _lerp3(_DIRT, _NEUT, (c - 9) / 4);
      else if (c <= 24) base = _NEUT;
      else if (c <= 28) base = _lerp3(_NEUT, _GRAS, (c - 25) / 4);
      else              base = _GRAS;
      const noise = (Math.random() * 0.16) - 0.08;
      const R = Math.max(0, Math.min(255, Math.round(base[0] * (1 + noise))));
      const G = Math.max(0, Math.min(255, Math.round(base[1] * (1 + noise))));
      const B = Math.max(0, Math.min(255, Math.round(base[2] * (1 + noise))));
      tileColors[r * COLS + c] = `rgb(${R},${G},${B})`;
    }
  }

  // Road network (Set of tile indices)
  const roads = new Set();
  // Main east-west corridor row 14: player base → bridge
  _markRoad(roads, 35, 14, 15, 14);
  // Misgav (23,13) spur north to main corridor
  _markRoad(roads, 23, 13, 23, 14);
  // Kerem (17,7) → down to corridor row 14
  _markRoad(roads, 17, 7, 17, 14);
  // Havela (19,19) → up to corridor row 14
  _markRoad(roads, 19, 19, 19, 14);
  // Connect Kerem and Havela spurs along row 14 to main corridor
  _markRoad(roads, 15, 14, 19, 14);
  // Misgav to Kerem spur connection
  _markRoad(roads, 17, 7, 23, 13);

  // River: column 15, all rows except bridge rows 13-14
  const riverTiles = new Set();
  for (let r = 0; r < ROWS; r++) {
    const isBridge = (r === 13 || r === 14);
    const idx = r * COLS + 15;
    riverTiles.add(idx);
    if (!isBridge) {
      grid[idx] = 1; // impassable
    }
  }

  // Decorative features: 0=none, 1=tree, 2=rock, 3=ruin
  const features = new Uint8Array(COLS * ROWS);
  // Build exclusion set: tiles within 2 of any initial building, river, or road
  const exclusion = new Set();
  for (const b of buildings) {
    for (let dc = -2; dc <= b.w + 1; dc++)
      for (let dr = -2; dr <= b.h + 1; dr++) {
        const ec = b.col + dc, er = b.row + dr;
        if (ec >= 0 && ec < COLS && er >= 0 && er < ROWS)
          exclusion.add(er * COLS + ec);
      }
  }
  for (const idx of roads) exclusion.add(idx);
  for (const idx of riverTiles) exclusion.add(idx);

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const idx = r * COLS + c;
      if (exclusion.has(idx)) continue;
      const rnd = Math.random();
      if (c >= 12 && c <= 27) {
        // neutral zone: trees and ruins
        if (rnd < 0.03) features[idx] = 3;       // ruin
        else if (rnd < 0.15) features[idx] = 1;   // tree
      } else if (c < 12) {
        // enemy dirt zone: rocks
        if (rnd < 0.08) features[idx] = 2;
      } else {
        // player grass zone: sparse trees
        if (rnd < 0.06) features[idx] = 1;
      }
    }
  }

  return {
    ic: 200,
    elapsedTime: 0,
    fog, fogOpacity, fogLit, grid, buildings, units,
    tileColors, roads, features, riverTiles,
    selected: [],
    settlementsFallen: 0,
    gameState: 'playing', // playing | paused | win | lose
    upgrades: {},
    airstrikeAvailable: false,
    airstrikeMode: false,
    buildMode: null, // { type, w, h } or null
    placeCursorCol: 0, placeCursorRow: 0,
    droneCooldown: 0,
    icEarnedUnits: new Set(),
    icEarnedBuildings: new Set(),
    icEarnedTiles: 0,
    _firstEnemyUnitFound: false,
    _firstEnemyBuildingFound: false,
    _firstScoutSent: false,
    // Path cache: key = "sc,sr-ec,er" → path array. Invalidated on grid changes.
    pathCache: new Map(),
    pathCacheVersion: 0,
    // Unit command state
    attackMoveMode: false,
    groups: {1:[], 2:[], 3:[], 4:[], 5:[]},
    // Wave/AI state
    aiBuildPhase: 0,
    aiWaveTimer: 0,
    aiLastWaveTime: 0,
  };
}

function _markGrid(grid, col, row, w, h, val) {
  for (let dc = 0; dc < w; dc++)
    for (let dr = 0; dr < h; dr++) {
      const idx = (row + dr) * COLS + (col + dc);
      if (idx >= 0 && idx < grid.length) grid[idx] = val;
    }
}

// Mark a line of road tiles between two points (Bresenham)
function _markRoad(roads, c1, r1, c2, r2) {
  const steps = Math.max(Math.abs(c2 - c1), Math.abs(r2 - r1));
  if (steps === 0) { roads.add(r1 * COLS + c1); return; }
  for (let i = 0; i <= steps; i++) {
    const c = Math.round(c1 + (c2 - c1) * i / steps);
    const r = Math.round(r1 + (r2 - r1) * i / steps);
    if (c >= 0 && c < COLS && r >= 0 && r < ROWS) roads.add(r * COLS + c);
  }
}

// Cached A* pathfinding — avoids recomputing identical paths.
// Cache is keyed by "sc,sr-ec,er" and version-stamped to grid changes.
function _cachedPath(G, sc, sr, ec, er) {
  const key = `${sc},${sr}-${ec},${er}`;
  const entry = G.pathCache.get(key);
  if (entry && entry.version === G.pathCacheVersion) return entry.path;
  const path = aStarPath(G.grid, sc, sr, ec, er);
  if (G.pathCache.size >= 200) {
    // Evict oldest entry
    G.pathCache.delete(G.pathCache.keys().next().value);
  }
  G.pathCache.set(key, { path, version: G.pathCacheVersion });
  return path;
}

// Call this whenever G.grid changes (building placed/destroyed)
function _invalidatePathCache(G) {
  G.pathCacheVersion++;
}

// ============================================================
// RENDERER
// ============================================================
class Renderer {
  constructor(canvas, minimapCanvas) {
    this.ctx = canvas.getContext('2d');
    this.mctx = minimapCanvas.getContext('2d');
    this.mW = minimapCanvas.width;
    this.mH = minimapCanvas.height;
  }

  drawFrame(G) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    this._drawTerrain(ctx, G);
    this._drawBuildings(ctx, G);
    this._drawUnits(ctx, G);
    this._drawFog(ctx, G);
    this._drawSelectionHighlights(ctx, G);
    this._drawHpBars(ctx, G);

    this._drawMinimap(G);
  }

  _drawTerrain(ctx, G) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const idx = r * COLS + c;
        const x = c * TILE, y = r * TILE;

        // Base tile color (precomputed with noise + zone transitions)
        if (G.riverTiles.has(idx)) {
          const isBridge = (r === 13 || r === 14);
          ctx.fillStyle = isBridge ? '#5a4a30' : '#1a2a3a';
        } else if (G.roads.has(idx)) {
          // Roads: slightly lighter/more tan version of zone color
          const base = G.tileColors[idx];
          ctx.fillStyle = base; // draw base first, then lighten below
          ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = 'rgba(200,160,90,0.22)';
        } else {
          ctx.fillStyle = G.tileColors[idx];
        }
        ctx.fillRect(x, y, TILE, TILE);

        // Road overlay (already handled above for road base, add road center strip)
        if (G.roads.has(idx) && !G.riverTiles.has(idx)) {
          ctx.fillStyle = 'rgba(160,120,60,0.18)';
          ctx.fillRect(x + 10, y + 10, TILE - 20, TILE - 20);
        }

        // Bridge planks
        if (G.riverTiles.has(idx) && (r === 13 || r === 14)) {
          ctx.fillStyle = 'rgba(90,70,40,0.5)';
          ctx.fillRect(x + 3, y + 3, TILE - 6, TILE - 6);
          // planks
          ctx.fillStyle = 'rgba(120,90,50,0.4)';
          for (let pl = 4; pl < TILE - 4; pl += 6) {
            ctx.fillRect(x + 3, y + pl, TILE - 6, 3);
          }
        }

        // Decorative features
        const feat = G.features[idx];
        if (feat === 1) {
          // Tree: two small triangles
          ctx.fillStyle = 'rgba(20,50,15,0.75)';
          const tx = x + 8, ty = y + 18;
          ctx.beginPath(); ctx.moveTo(tx, ty - 10); ctx.lineTo(tx - 5, ty); ctx.lineTo(tx + 5, ty); ctx.closePath(); ctx.fill();
          const tx2 = x + 22, ty2 = y + 20;
          ctx.beginPath(); ctx.moveTo(tx2, ty2 - 9); ctx.lineTo(tx2 - 4, ty2); ctx.lineTo(tx2 + 4, ty2); ctx.closePath(); ctx.fill();
        } else if (feat === 2) {
          // Rock: two small gray rectangles
          ctx.fillStyle = 'rgba(80,75,70,0.7)';
          ctx.fillRect(x + 7, y + 16, 7, 5);
          ctx.fillRect(x + 18, y + 14, 5, 6);
        } else if (feat === 3) {
          // Ruin: crumbled rectangle outline + some fragments
          ctx.strokeStyle = 'rgba(70,60,50,0.65)';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x + 6, y + 8, 12, 14);
          ctx.fillStyle = 'rgba(60,50,40,0.5)';
          ctx.fillRect(x + 6, y + 8, 4, 4);
          ctx.fillRect(x + 14, y + 18, 4, 4);
        }

        // Subtle grid lines
        ctx.strokeStyle = 'rgba(0,0,0,0.1)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x, y, TILE, TILE);
      }
    }
  }

  _drawBuildings(ctx, G) {
    for (const b of G.buildings) {
      if (b.dead) continue;
      const fogIdx = Math.floor(b.row + b.h/2) * COLS + Math.floor(b.col + b.w/2);
      const visible = b.faction === 'player' || G.fog[fogIdx] === 1;
      if (!visible) continue;

      const def = BUILDING_DEF[b.type];
      const x = b.col * TILE, y = b.row * TILE;
      const pw = b.w * TILE, ph = b.h * TILE;

      // building body
      ctx.fillStyle = def.color;
      ctx.globalAlpha = b.buildProgress < 1 ? 0.4 + b.buildProgress * 0.6 : 1;
      ctx.fillRect(x + 2, y + 2, pw - 4, ph - 4);
      ctx.globalAlpha = 1;

      // border
      ctx.strokeStyle = b.faction === 'player' ? '#88bbff' :
                        b.faction === 'enemy'  ? '#ffaaaa' : '#aaccaa';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 2, y + 2, pw - 4, ph - 4);

      // label
      if (G.fog[Math.floor(b.row) * COLS + Math.floor(b.col)] === 1) {
        ctx.fillStyle = '#fff';
        ctx.font = '8px Courier New';
        ctx.textAlign = 'center';
        const shortLabel = def.label.substring(0, 6);
        ctx.fillText(shortLabel, x + pw / 2, y + ph / 2 + 3);
      }

      // building progress bar
      if (b.buildProgress < 1) {
        ctx.fillStyle = '#333';
        ctx.fillRect(x + 2, y + ph - 6, pw - 4, 4);
        ctx.fillStyle = '#4aff4a';
        ctx.fillRect(x + 2, y + ph - 6, (pw - 4) * b.buildProgress, 4);
      }

      // train progress for selected buildings
      if (b.trainQueue && b.trainQueue.length > 0 && b.trainTimer > 0) {
        const uDef = UNIT_DEF[b.trainQueue[0]];
        if (uDef) {
          const prog = 1 - b.trainTimer / uDef.buildTime;
          ctx.fillStyle = '#222';
          ctx.fillRect(x + 2, y + 2, pw - 4, 4);
          ctx.fillStyle = '#4a9eff';
          ctx.fillRect(x + 2, y + 2, (pw - 4) * Math.max(0, Math.min(1, prog)), 4);
        }
      }
    }
  }

  _drawUnits(ctx, G) {
    for (const u of G.units) {
      if (u.dead) continue;
      const fc = Math.floor(u.row) * COLS + Math.floor(u.col);
      const currentlyVisible = u.faction === 'player' || G.fogLit[fc] === 1;
      const isGhost = !currentlyVisible && u.faction === 'enemy' && (u.ghostTimer || 0) > 0;
      if (!currentlyVisible && !isGhost) continue;

      const x = u.col * TILE;
      const y = u.row * TILE;
      const def = UNIT_DEF[u.type];
      const r = (u.type === 'tank' || u.type === 'veil_tank') ? 10 :
                (u.type === 'drone' || u.type === 'veil_drone') ? 7 :
                (u.type === 'apc' || u.type === 'artillery' || u.type === 'helicopter') ? 9 : 6;

      // Ghost units render at reduced opacity
      if (isGhost) ctx.globalAlpha = 0.35;

      if (def.flying) {
        // Draw flying units as diamonds
        ctx.beginPath();
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + r, y);
        ctx.lineTo(x, y + r);
        ctx.lineTo(x - r, y);
        ctx.closePath();
      } else {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
      }
      ctx.fillStyle = def.color;
      ctx.fill();
      ctx.strokeStyle = u.faction === 'player' ? '#ffffff' : '#330000';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Ghost indicator: question mark above unit
      if (isGhost) {
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = '#ffcc44';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('?', x, y - r - 2);
        ctx.textAlign = 'left';
      }

      ctx.globalAlpha = 1;

      // directional dot for moving units (only visible ones)
      if (!isGhost && u.path.length > 0) {
        const next = u.path[0];
        const dx = next.col + 0.5 - u.col, dy = next.row + 0.5 - u.row;
        const len = Math.hypot(dx, dy) || 1;
        ctx.beginPath();
        ctx.arc(x + (dx / len) * r * 0.6, y + (dy / len) * r * 0.6, 2, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
      }
    }
  }

  _drawFog(ctx, G) {
    // Draw fog as black cells with varying opacity
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const op = G.fogOpacity[r * COLS + c];
        if (op <= 0.01) continue;
        ctx.globalAlpha = op;
        ctx.fillStyle = '#000';
        ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
      }
    }
    ctx.globalAlpha = 1;
  }

  _drawSelectionHighlights(ctx, G) {
    for (const e of G.selected) {
      ctx.strokeStyle = COL.select;
      ctx.lineWidth = 2;
      if (e.path !== undefined) {
        // unit
        ctx.beginPath();
        ctx.arc(e.col * TILE, e.row * TILE, 12, 0, Math.PI * 2);
        ctx.stroke();
        // draw path
        if (e.path.length > 0) {
          ctx.strokeStyle = 'rgba(232,216,122,0.3)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(e.col * TILE, e.row * TILE);
          for (const p of e.path) ctx.lineTo((p.col + 0.5) * TILE, (p.row + 0.5) * TILE);
          ctx.stroke();
        }
      } else {
        // building
        ctx.strokeRect(e.col * TILE + 1, e.row * TILE + 1, e.w * TILE - 2, e.h * TILE - 2);
      }
    }

    // sight radius for selected player units/buildings
    for (const e of G.selected) {
      const sight = e.sight || 0;
      if (sight <= 0) continue;
      const cx = (e.col + (e.w ? e.w / 2 : 0)) * TILE;
      const cy = (e.row + (e.h ? e.h / 2 : 0)) * TILE;
      ctx.strokeStyle = 'rgba(100,200,255,0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, sight * TILE, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  _drawHpBars(ctx, G) {
    for (const e of [...G.units, ...G.buildings]) {
      if (e.dead) continue;
      const isUnit = e.path !== undefined;
      const fogIdx = isUnit
        ? Math.floor(e.row) * COLS + Math.floor(e.col)
        : Math.floor(e.row + (e.h || 1) / 2) * COLS + Math.floor(e.col + (e.w || 1) / 2);
      if (e.faction !== 'player' && G.fog[fogIdx] !== 1) continue;

      const pct = e.hp / e.maxHp;
      if (pct >= 1) continue; // don't show full health

      const x = isUnit ? e.col * TILE - 12 : e.col * TILE + 2;
      const y = isUnit ? e.row * TILE - 14  : e.row * TILE - 6;
      const w = isUnit ? 24 : (e.w || 1) * TILE - 4;

      ctx.fillStyle = '#111';
      ctx.fillRect(x, y, w, 3);
      ctx.fillStyle = pct > 0.5 ? '#4aff4a' : pct > 0.25 ? '#e8d87a' : '#ff4444';
      ctx.fillRect(x, y, w * pct, 3);
    }
  }

  _drawMinimap(G) {
    const mctx = this.mctx;
    mctx.clearRect(0, 0, this.mW, this.mH);
    const tw = this.mW / COLS;
    const th = this.mH / ROWS;

    // terrain
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const fogIdx = r * COLS + c;
        if (G.fogOpacity[fogIdx] > 0.9) { mctx.fillStyle = '#000'; }
        else if (c < 12) { mctx.fillStyle = '#2a2010'; }
        else if (c > 27) { mctx.fillStyle = '#1a2a0a'; }
        else mctx.fillStyle = '#182010';
        mctx.fillRect(c * tw, r * th, tw, th);
      }
    }
    // buildings
    for (const b of G.buildings) {
      if (b.dead) continue;
      const fi = Math.floor(b.row + b.h/2) * COLS + Math.floor(b.col + b.w/2);
      if (b.faction !== 'player' && G.fog[fi] !== 1) continue;
      const def = BUILDING_DEF[b.type];
      mctx.fillStyle = def.color;
      mctx.fillRect(b.col * tw, b.row * th, b.w * tw, b.h * th);
    }
    // units
    for (const u of G.units) {
      if (u.dead) continue;
      const fi = Math.floor(u.row) * COLS + Math.floor(u.col);
      if (u.faction !== 'player' && G.fog[fi] !== 1) continue;
      mctx.fillStyle = UNIT_DEF[u.type].color;
      mctx.fillRect(u.col * tw - 1, u.row * th - 1, 2, 2);
    }
    // viewport indicator
    mctx.strokeStyle = 'rgba(255,255,255,0.5)';
    mctx.lineWidth = 0.5;
    mctx.strokeRect(0, 0, this.mW, this.mH);
  }
}

// ============================================================
// GAME CLASS
// ============================================================
class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.minimapCanvas = document.getElementById('minimap');
    this.renderer = new Renderer(this.canvas, this.minimapCanvas);
    this.G = null;
    this._lastTime = 0;
    this._raf = null;
    this._boxStart = null;
    this._isDragging = false;

    this._bindEvents();
    this._showStartScreen();
  }

  _showStartScreen() {
    document.getElementById('overlay').style.display = 'flex';
    document.getElementById('start-btn').onclick = () => {
      document.getElementById('overlay').style.display = 'none';
      this.start();
    };
  }

  start() {
    if (this._raf) cancelAnimationFrame(this._raf);
    _nextId = 1;
    this.G = createGameState();
    window.G = this; // expose for UI callbacks
    UI.resetVoice();
    AI.state.buildIndex = 0;
    AI.state.resources = 500;
    AI.state.assaultTriggered = false;
    AI.state.heaviesUnlocked = false;
    AI.state.tanksUnlocked = false;

    setTimeout(() => UI.voice('game_start'), 500);
    this._lastTime = performance.now();
    this._loop(this._lastTime);
  }

  _loop(now) {
    const dt = Math.min((now - this._lastTime) / 1000, 0.1);
    this._lastTime = now;

    if (this.G.gameState === 'playing') {
      this._update(dt);
    }
    this.renderer.drawFrame(this.G);
    this._updateHUD();

    this._raf = requestAnimationFrame((t) => this._loop(t));
  }

  // ---- UPDATE ----
  _update(dt) {
    const G = this.G;
    G.elapsedTime += dt;
    if (G.droneCooldown > 0) G.droneCooldown -= dt;

    this._updateBuildings(dt);
    AI.tick(G, dt);
    this._updateUnits(dt);
    this._updateFog();
    G._settlementDt = dt;
    this._updateSettlements();
    this._checkWinLose();
  }

  _updateBuildings(dt) {
    const G = this.G;
    for (const b of G.buildings) {
      if (b.dead || b.faction !== 'player') continue;
      if (b.buildProgress < 1) {
        b.buildProgress += dt / b.buildTimeTotal;
        if (b.buildProgress >= 1) {
          b.buildProgress = 1;
          _markGrid(G.grid, b.col, b.row, b.w, b.h, 1);
          _invalidatePathCache(G);
          // comms_tower: grant +1 sight to all existing player units
          if (b.type === 'comms_tower') {
            for (const u of G.units) {
              if (!u.dead && u.faction === 'player') u.sight += 1;
            }
          }
          // Voice on first scout vehicle readiness
          if (b.type === 'motor_pool' && !G._motorPoolBuilt) {
            G._motorPoolBuilt = true;
            UI.voice('first_scout');
          }
        }
        continue;
      }
      // radar_station: periodic ping that briefly reveals extra ring around it
      if (b.type === 'radar_station') {
        b._pingTimer = (b._pingTimer || 0) - dt;
        if (b._pingTimer <= 0) {
          b._pingTimer = 20; // ping every 20 seconds
          const bcx = b.col + b.w / 2, bcy = b.row + b.h / 2;
          const pingR = 16; // reveal radius
          for (let r2 = Math.max(0, Math.floor(bcy - pingR)); r2 <= Math.min(ROWS - 1, Math.ceil(bcy + pingR)); r2++) {
            for (let c2 = Math.max(0, Math.floor(bcx - pingR)); c2 <= Math.min(COLS - 1, Math.ceil(bcx + pingR)); c2++) {
              if (Math.hypot(c2 + 0.5 - bcx, r2 + 0.5 - bcy) <= pingR) {
                const idx = r2 * COLS + c2;
                if (G.fog[idx] === 0) {
                  G.fog[idx] = 1;
                  G.fogOpacity[idx] = 0;
                  G.ic += 1; // small IC bonus per newly revealed tile
                  G.icEarnedTiles++;
                }
                // Mark as lit this frame so discoveries are checked
                G.fogLit[idx] = 1;
              }
            }
          }
        }
      }
      // hospital: heal nearby player units
      if (b.type === 'hospital') {
        const bx = b.col + b.w / 2, by = b.row + b.h / 2;
        for (const u of G.units) {
          if (u.dead || u.faction !== 'player') continue;
          if (Math.hypot(u.col - bx, u.row - by) <= 4) {
            u.hp = Math.min(u.hp + 3 * dt, u.maxHp);
          }
        }
      }
      // training
      if (b.trainQueue && b.trainQueue.length > 0) {
        b.trainTimer -= dt;
        if (b.trainTimer <= 0) {
          const uType = b.trainQueue.shift();
          const u = createUnit(uType, b.col + b.w, b.row + b.h - 1, 'player');
          if (uType === 'drone') {
            if (G.upgrades.drone_resilience) { u.hp = 90; u.maxHp = 90; }
          }
          if (uType === 'scout_vehicle') {
            if (G.upgrades.scout_speed_1)    u.speed = UNIT_DEF.scout_vehicle.speed * 1.4;
            if (G.upgrades.extended_reveal_1) u.sight = 10;
          }
          // Apply comms tower sight bonus to newly trained units
          const commsTowers = G.buildings.filter(
            b2 => b2.type === 'comms_tower' && !b2.dead && b2.buildProgress >= 1).length;
          u.sight += commsTowers;
          G.units.push(u);
          if (b.trainQueue.length > 0) {
            b.trainTimer = UNIT_DEF[b.trainQueue[0]].buildTime;
          }
        }
      }
    }
  }

  _updateUnits(dt) {
    const G = this.G;
    const dead = [];

    for (const u of G.units) {
      if (u.dead) continue;

      // Decrement ghost timer for enemy units
      if (u.ghostTimer > 0) u.ghostTimer -= dt;

      // Attack-move: check for enemies in range while moving; if found, engage
      if (u.attackMoveTarget && u.faction === 'player' && !u.attackTarget) {
        const nearEnemy = this._findAttackTarget(u);
        if (nearEnemy) {
          u.attackTarget = nearEnemy;
          u.path = []; // pause movement to fight
        }
      }
      // Clear attackMoveTarget once destination reached
      if (u.attackMoveTarget && u.path.length === 0 && !u.attackTarget) {
        const d = Math.hypot(u.col - (u.attackMoveTarget.col + 0.5), u.row - (u.attackMoveTarget.row + 0.5));
        if (d < 1.5) u.attackMoveTarget = null;
      }

      // Hold position: skip movement, still attack in range
      if (u.holdPosition) {
        // fall through to auto-attack below, skip path following
      } else if (u.path.length > 0 && !u.attackTarget) {
        // movement
        const next = u.path[0];
        const tx = next.col + 0.5, ty = next.row + 0.5;
        const dx = tx - u.col, dy = ty - u.row;
        const dist = Math.hypot(dx, dy);
        const step = u.speed * dt;
        if (dist <= step) {
          u.col = tx; u.row = ty;
          u.path.shift();
        } else {
          u.col += (dx / dist) * step;
          u.row += (dy / dist) * step;
        }
      }

      const def = UNIT_DEF[u.type];

      // medic: heal nearby allies
      if (def.healer && u.faction === 'player') {
        for (const ally of G.units) {
          if (ally.dead || ally.faction !== 'player' || ally === u) continue;
          if (Math.hypot(ally.col - u.col, ally.row - u.row) <= 3) {
            ally.hp = Math.min(ally.hp + 5 * dt, ally.maxHp);
          }
        }
      }

      // engineer: repair nearby friendly buildings
      if (def.repairTarget && u.faction === 'player') {
        let repaired = false;
        for (const b of G.buildings) {
          if (b.dead || b.faction !== 'player' || b.hp >= b.maxHp || b.buildProgress < 1) continue;
          if (Math.hypot(b.col + b.w / 2 - u.col, b.row + b.h / 2 - u.row) <= 2) {
            b.hp = Math.min(b.hp + 10 * dt, b.maxHp);
            repaired = true;
            break;
          }
        }
      }

      // auto-attack
      u.attackCooldown -= dt;
      if (!u.attackTarget) {
        u.attackTarget = this._findAttackTarget(u);
      }
      if (u.attackTarget) {
        if (u.attackTarget.dead) { u.attackTarget = null; continue; }
        if (!def.damage) { u.attackTarget = null; continue; }
        const range = def.attackRange;
        const tx = u.attackTarget.col + (u.attackTarget.w ? u.attackTarget.w / 2 : 0);
        const ty = u.attackTarget.row + (u.attackTarget.h ? u.attackTarget.h / 2 : 0);
        const dist = Math.hypot(tx - u.col, ty - u.row);
        if (dist > range + 0.5) {
          // Hold position units don't chase — they lose the target instead
          if (u.holdPosition) {
            u.attackTarget = null;
          } else if (def.flying) {
            u.path = [{ col: Math.floor(tx), row: Math.floor(ty) }];
          } else {
            const path = _cachedPath(G,
              Math.floor(u.col), Math.floor(u.row),
              Math.floor(tx), Math.floor(ty));
            if (path) u.path = path.slice(0, 6);
          }
          if (!u.holdPosition) u.attackTarget = null;
        } else if (u.attackCooldown <= 0) {
          u.attackCooldown = ATTACK_COOLDOWN;
          u.attackTarget.hp -= def.damage;
          // splash for tanks, artillery, bombers
          if (def.splash && def.splashRange) {
            for (const other of G.units) {
              if (other === u.attackTarget || other.dead || other.faction === u.faction) continue;
              if (Math.hypot(other.col - tx, other.row - ty) <= def.splashRange) {
                other.hp -= def.damage * 0.5;
              }
            }
          }
          if (u.attackTarget.hp <= 0) {
            this._handleDeath(u.attackTarget);
            u.attackTarget = null;
          }
          // suicide bomber dies after attack
          if (def.suicideBomber) {
            this._handleDeath(u);
          }
        }
      }
    }
  }

  _findAttackTarget(u) {
    const G = this.G;
    const def = UNIT_DEF[u.type];
    if (!def.damage) return null;
    const range = def.attackRange + 0.5;

    let best = null, bestDist = Infinity;
    // enemy units
    for (const other of G.units) {
      if (other.dead || other.faction === u.faction) continue;
      // anti-air prioritizes flying units
      if (def.antiAirOnly && !UNIT_DEF[other.type]?.flying) continue;
      // stealthy units can't be auto-targeted by enemies
      if (u.faction === 'enemy' && UNIT_DEF[other.type]?.stealthy) continue;
      const dist = Math.hypot(other.col - u.col, other.row - u.row);
      if (dist <= range && dist < bestDist) { best = other; bestDist = dist; }
    }
    // anti-air fallback: if no flying targets in range, engage ground units at reduced range
    if (!best && def.antiAirOnly) {
      const fallbackRange = (def.attackRange * 0.6) + 0.5;
      for (const other of G.units) {
        if (other.dead || other.faction === u.faction) continue;
        if (u.faction === 'enemy' && UNIT_DEF[other.type]?.stealthy) continue;
        const dist = Math.hypot(other.col - u.col, other.row - u.row);
        if (dist <= fallbackRange && dist < bestDist) { best = other; bestDist = dist; }
      }
    }
    // enemy buildings (only if explicitly ordered or for enemy units)
    if (!best && (def.canAttackBuildings || u.faction === 'enemy')) {
      for (const b of G.buildings) {
        if (b.dead || b.faction === u.faction || b.faction === 'neutral') continue;
        // enemy: can attack neutral settlements
        if (u.faction === 'enemy' && b.faction === 'player') {
          const bx = b.col + b.w / 2, by = b.row + b.h / 2;
          const dist = Math.hypot(bx - u.col, by - u.row);
          if (dist <= range && dist < bestDist) { best = b; bestDist = dist; }
        }
      }
      // enemy attacks settlements
      if (!best && u.faction === 'enemy') {
        for (const b of G.buildings) {
          if (b.dead || b.type !== 'settlement') continue;
          const bx = b.col + b.w / 2, by = b.row + b.h / 2;
          const dist = Math.hypot(bx - u.col, by - u.row);
          if (dist <= range + 1 && dist < bestDist) { best = b; bestDist = dist; }
        }
      }
    }
    return best;
  }

  _handleDeath(entity) {
    const G = this.G;
    entity.dead = true;
    entity.hp = 0;

    // Remove from grid if building
    if (entity.w !== undefined) {
      _markGrid(G.grid, entity.col, entity.row, entity.w, entity.h, 0);
      _invalidatePathCache(G);
    }

    // IC rewards for destroying enemy entities (offensive incentive)
    if (entity.faction === 'enemy') {
      if (entity.w !== undefined) {
        // Enemy building destroyed
        G.ic += 30;
      } else {
        // Enemy unit killed
        G.ic += 5;
      }
    }

    // Voice line triggers
    if (entity.faction === 'player') {
      if (entity.type === 'scout_vehicle') UI.voice('scout_killed');
      if (entity.type === 'drone') {
        G.droneCooldown = UNIT_DEF.drone.cooldownAfterDeath || 60;
        UI.voice('drone_down');
      }
      if (entity.type === 'barracks') UI.voice('barracks_destroyed');
      if (entity.type === 'command_base') {
        G.gameState = 'lose';
      }
    }
  }

  _updateFog() {
    const G = this.G;

    // Save previous fogLit state to detect tiles going dark (for ghost fog)
    const prevFogLit = new Uint8Array(G.fogLit);

    // Reset currently-lit array each frame
    G.fogLit.fill(0);

    // Gather all sight sources for player
    const sightSources = [];
    for (const u of G.units) {
      if (u.dead || u.faction !== 'player') continue;
      sightSources.push({ col: u.col, row: u.row, sight: u.sight });
    }
    for (const b of G.buildings) {
      if (b.dead || b.faction !== 'player' || b.buildProgress < 1) continue;
      if (b.sight > 0) {
        sightSources.push({ col: b.col + b.w / 2, row: b.row + b.h / 2, sight: b.sight });
      }
    }

    // Reveal tiles, mark lit, and grant IC
    for (const src of sightSources) {
      const sr = Math.round(src.sight);
      const minC = Math.max(0, Math.floor(src.col - sr));
      const maxC = Math.min(COLS - 1, Math.ceil(src.col + sr));
      const minR = Math.max(0, Math.floor(src.row - sr));
      const maxR = Math.min(ROWS - 1, Math.ceil(src.row + sr));

      for (let r = minR; r <= maxR; r++) {
        for (let c = minC; c <= maxC; c++) {
          if (Math.hypot(c + 0.5 - src.col, r + 0.5 - src.row) > src.sight) continue;
          const idx = r * COLS + c;
          G.fogLit[idx] = 1; // currently lit this frame
          if (G.fog[idx] === 0) {
            // First reveal — grant IC
            G.fog[idx] = 1;
            G.fogOpacity[idx] = 0;
            G.ic += 2;
            G.icEarnedTiles++;
          }
        }
      }
    }

    // Check enemy discoveries once per frame (inverted loop for performance)
    this._checkDiscoveries();

    // Ghost fog: enemy units that just left sight get a 4s ghost timer
    for (const u of G.units) {
      if (u.dead || u.faction !== 'enemy') continue;
      const idx = Math.floor(u.row) * COLS + Math.floor(u.col);
      const wasVisible = prevFogLit[idx] === 1;
      const isVisible = G.fogLit[idx] === 1;
      if (wasVisible && !isVisible) {
        u.ghostTimer = 4.0; // start ghost countdown
      }
    }
  }

  _checkDiscoveries() {
    const G = this.G;
    // Iterate entities once; check if their tile is currently lit (O(entities) not O(tiles × entities))
    for (const u of G.units) {
      if (u.discovered || u.dead || u.faction !== 'enemy') continue;
      const idx = Math.floor(u.row) * COLS + Math.floor(u.col);
      if (G.fogLit[idx] !== 1) continue;
      u.discovered = true;
      G.ic += 25;
      if (!G._firstEnemyUnitFound) {
        G._firstEnemyUnitFound = true;
        UI.voice('first_enemy_unit');
      }
    }
    for (const b of G.buildings) {
      if (b.discovered || b.dead || b.faction !== 'enemy') continue;
      const bc = Math.floor(b.col + b.w / 2);
      const br = Math.floor(b.row + b.h / 2);
      const idx = br * COLS + bc;
      if (G.fogLit[idx] !== 1) continue;
      b.discovered = true;
      const bonus = G.upgrades.deep_intel ? 100 : 50;
      if (b.type === 'veil_command') {
        G.ic += 150;
        UI.voice('command_base_found');
      } else {
        G.ic += bonus;
        if (!G._firstEnemyBuildingFound) {
          G._firstEnemyBuildingFound = true;
          UI.voice('first_enemy_building');
        }
      }
    }
  }

  _updateSettlements() {
    const G = this.G;
    const dt = G._settlementDt || 0; // passed from _update via G
    for (const b of G.buildings) {
      if (b.dead || b.type !== 'settlement') continue;
      const bx = b.col + b.w / 2, by = b.row + b.h / 2;
      const nearbyUnits = G.units.filter(u =>
        !u.dead && Math.hypot(u.col - bx, u.row - by) <= 6
      );
      const attackers = nearbyUnits.filter(u => u.faction === 'enemy');
      const defenders = nearbyUnits.filter(u => u.faction === 'player');

      // IC income: player controls if more defenders than attackers (or uncontested)
      if (dt > 0) {
        if (attackers.length === 0) {
          // Uncontested alive settlement: +1 IC/s base income
          G.ic += 1 * dt;
          b.icIncome = 1;
        } else if (defenders.length > attackers.length) {
          // Player controls under pressure: +3 IC/s
          G.ic += 3 * dt;
          b.icIncome = 3;
        } else {
          b.icIncome = 0;
        }
      }

      if (attackers.length > 0 && !b.underAttack) {
        b.underAttack = true;
        if (!b.alertFired) {
          b.alertFired = true;
          UI.voice('settlement_attack', b.name);
          UI.triggerAlertFlash();
        }
      }
      if (attackers.length === 0) b.underAttack = false;
      const pct = b.hp / b.maxHp;
      if (pct <= 0.5 && !b.alert50Fired) {
        b.alert50Fired = true;
        UI.voice('settlement_50hp', b.name);
        UI.triggerAlertFlash();
      }
      if (b.hp <= 0 && !b.dead) {
        b.dead = true;
        _markGrid(G.grid, b.col, b.row, b.w, b.h, 0);
        _invalidatePathCache(G);
        G.settlementsFallen++;
        UI.voice('settlement_falls', b.name, b.population);
        UI.triggerAlertFlash();
        if (G.settlementsFallen === 2) UI.voice('second_settlement_falls');
      }
    }
  }

  _checkWinLose() {
    const G = this.G;
    const ecb = G.buildings.find(b => b.type === 'veil_command');
    if (ecb && ecb.dead) {
      G.gameState = 'win';
    }
    if (G.settlementsFallen >= 3) {
      G.gameState = 'lose';
    }
    if (G.gameState === 'win' || G.gameState === 'lose') {
      UI.voice(G.gameState);
      setTimeout(() => this._showEndScreen(), 2500);
    }
  }

  _showEndScreen() {
    const G = this.G;
    const overlay = document.getElementById('overlay');
    overlay.innerHTML = '';
    overlay.style.display = 'flex';

    const title = document.createElement('h1');
    title.textContent = G.gameState === 'win' ? 'MISSION COMPLETE' : 'MISSION FAILED';
    title.style.color = G.gameState === 'win' ? '#4aff4a' : '#ff4a4a';
    overlay.appendChild(title);

    const sub = document.createElement('h2');
    const mins = Math.floor(G.elapsedTime / 60);
    const secs = Math.floor(G.elapsedTime % 60);
    sub.textContent = `Time: ${mins}:${secs.toString().padStart(2,'0')}`;
    overlay.appendChild(sub);

    const stats = document.createElement('p');
    const unitsKilled = G.units.filter(u => u.dead && u.faction === 'enemy').length;
    const settlementsHeld = 3 - G.settlementsFallen;
    stats.innerHTML = `Enemy units eliminated: ${unitsKilled}<br>Settlements held: ${settlementsHeld}/3<br>Intelligence Credits earned: ${G.ic}`;
    overlay.appendChild(stats);

    const btn = document.createElement('button');
    btn.className = 'overlay-btn';
    btn.textContent = 'RESTART MISSION';
    btn.onclick = () => { overlay.style.display = 'none'; this.start(); };
    overlay.appendChild(btn);
  }

  // ---- HUD update ----
  _updateHUD() {
    if (!this.G) return;
    const G = this.G;
    UI.updateResource(G.ic);
    UI.updateTimer(G.elapsedTime);
    const settlements = G.buildings.filter(b => b.type === 'settlement');
    UI.updateSettlementHps(settlements);
    UI.updateGroups(G.groups, G.units);
    UI.updateCommandMode(G.attackMoveMode, G.airstrikeMode, G.airstrikeAvailable, G.selected);
    UI.updateDroneCooldown(G.droneCooldown);
  }

  // ---- INPUT ----
  _bindEvents() {
    const canvas = this.canvas;

    canvas.addEventListener('mousedown', (e) => this._onMouseDown(e));
    canvas.addEventListener('mousemove', (e) => this._onMouseMove(e));
    canvas.addEventListener('mouseup',   (e) => this._onMouseUp(e));
    canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); this._onRightClick(e); });

    document.addEventListener('keydown', (e) => this._onKey(e));
  }

  _canvasPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width  / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top)  * scaleY,
      col: Math.floor((e.clientX - rect.left) * scaleX / TILE),
      row: Math.floor((e.clientY - rect.top)  * scaleY / TILE),
    };
  }

  _onMouseDown(e) {
    if (!this.G || this.G.gameState !== 'playing') return;
    const pos = this._canvasPos(e);
    if (e.button === 0) {
      if (this.G.buildMode) {
        this._tryPlaceBuilding(pos.col, pos.row);
        return;
      }
      this._boxStart = pos;
      this._isDragging = false;
    }
  }

  _onMouseMove(e) {
    if (!this.G) return;
    const pos = this._canvasPos(e);
    if (this.G.buildMode) {
      const def = BUILDING_DEF[this.G.buildMode];
      const [w, h] = def.size;
      const valid = this._canPlaceAt(pos.col, pos.row, w, h);
      UI.showPlacementCursor(pos.col, pos.row, w, h, valid);
      return;
    }
    if (this._boxStart) {
      const dx = pos.x - this._boxStart.x, dy = pos.y - this._boxStart.y;
      if (Math.hypot(dx, dy) > 6) this._isDragging = true;
    }
  }

  _onMouseUp(e) {
    if (!this.G || this.G.gameState !== 'playing') return;
    if (e.button !== 0) return;
    const pos = this._canvasPos(e);
    if (this.G.buildMode) return;

    if (this._isDragging && this._boxStart) {
      // Box select
      const x1 = Math.min(this._boxStart.x, pos.x);
      const x2 = Math.max(this._boxStart.x, pos.x);
      const y1 = Math.min(this._boxStart.y, pos.y);
      const y2 = Math.max(this._boxStart.y, pos.y);
      const selected = this.G.units.filter(u =>
        !u.dead && u.faction === 'player' &&
        u.col * TILE >= x1 && u.col * TILE <= x2 &&
        u.row * TILE >= y1 && u.row * TILE <= y2
      );
      this.G.selected = selected;
    } else {
      // Single click — check unit then building
      const clicked = this._entityAt(pos.col, pos.row);
      if (clicked) {
        this.G.selected = [clicked];
      } else {
        this.G.selected = [];
      }
    }

    UI.updateSelectionInfo(this.G.selected, this.G);
    this._boxStart = null;
    this._isDragging = false;
  }

  _onRightClick(e) {
    if (!this.G || this.G.gameState !== 'playing') return;
    const pos = this._canvasPos(e);
    const G = this.G;

    // Airstrike mode: handle before unit checks — does not require selection
    if (G.airstrikeMode && G.airstrikeAvailable) {
      const tc = pos.col, tr = pos.row;
      for (const entity of [...G.units, ...G.buildings]) {
        if (entity.dead || entity.faction !== 'enemy') continue;
        const ex = entity.col + (entity.w ? entity.w / 2 : 0);
        const ey = entity.row + (entity.h ? entity.h / 2 : 0);
        if (Math.hypot(ex - tc, ey - tr) <= 3) {
          entity.hp -= 200;
          if (entity.hp <= 0) this._handleDeath(entity);
        }
      }
      // Reveal fog in strike area
      for (let r2 = Math.max(0, tr - 4); r2 <= Math.min(ROWS - 1, tr + 4); r2++) {
        for (let c2 = Math.max(0, tc - 4); c2 <= Math.min(COLS - 1, tc + 4); c2++) {
          if (Math.hypot(c2 + 0.5 - tc, r2 + 0.5 - tr) <= 4) {
            const idx = r2 * COLS + c2;
            G.fog[idx] = 1;
            G.fogOpacity[idx] = 0;
            G.fogLit[idx] = 1;
          }
        }
      }
      G.airstrikeAvailable = false;
      G.airstrikeMode = false;
      return;
    }

    const playerUnits = G.selected.filter(u => u.path !== undefined && u.faction === 'player' && !u.dead);
    if (playerUnits.length === 0) return;

    // Check if right-clicking on an enemy entity to attack
    const target = this._entityAt(pos.col, pos.row);
    if (target && target.faction === 'enemy') {
      for (const u of playerUnits) {
        u.attackTarget = target;
        u.path = [];
        u.holdPosition = false;
        u.attackMoveTarget = null;
      }
      return;
    }
    if (G.attackMoveMode) {
      for (let i = 0; i < playerUnits.length; i++) {
        const u = playerUnits[i];
        const offset = _formationOffset(i);
        const tc = Math.max(0, Math.min(COLS - 1, pos.col + offset.dc));
        const tr = Math.max(0, Math.min(ROWS - 1, pos.row + offset.dr));
        const p = _cachedPath(G, Math.floor(u.col), Math.floor(u.row), tc, tr);
        if (p) {
          u.path = p;
          u.attackMoveTarget = { col: tc, row: tr };
          u.attackTarget = null;
          u.holdPosition = false;
        }
      }
      G.attackMoveMode = false;
      return;
    }

    // Regular move order (clears hold position)
    let anyMoved = false;
    for (let i = 0; i < playerUnits.length; i++) {
      const u = playerUnits[i];
      const offset = _formationOffset(i);
      const tc = Math.max(0, Math.min(COLS - 1, pos.col + offset.dc));
      const tr = Math.max(0, Math.min(ROWS - 1, pos.row + offset.dr));
      const p = _cachedPath(G, Math.floor(u.col), Math.floor(u.row), tc, tr);
      if (p) { u.path = p; u.attackTarget = null; u.holdPosition = false; u.attackMoveTarget = null; anyMoved = true; }
    }
    if (!anyMoved && playerUnits.length > 0) {
      UI.flashResourceRed(); // no path found — flash HUD as feedback
    }

    // If first scout, fire voice
    const hasScout = playerUnits.some(u => u.type === 'scout_vehicle' || u.type === 'drone');
    if (hasScout && !G._firstScoutFired) {
      G._firstScoutFired = true;
      UI.voice('first_scout');
    }
  }

  _onKey(e) {
    if (!this.G) return;
    const G = this.G;

    // Hotkey groups: Ctrl+1-5 assign, 1-5 recall
    if (e.ctrlKey && e.key >= '1' && e.key <= '5') {
      e.preventDefault();
      const n = parseInt(e.key);
      G.groups[n] = G.selected.filter(u => u.faction === 'player' && !u.dead).map(u => u.id);
      return;
    }
    if (!e.ctrlKey && e.key >= '1' && e.key <= '5' && G.gameState === 'playing') {
      const n = parseInt(e.key);
      const ids = new Set(G.groups[n]);
      if (ids.size > 0) {
        G.selected = G.units.filter(u => ids.has(u.id) && !u.dead);
        UI.updateSelectionInfo(G.selected, G);
      }
      return;
    }

    switch (e.key) {
      case 'Escape':
        if (G.attackMoveMode) { G.attackMoveMode = false; break; }
        if (G.airstrikeMode) { G.airstrikeMode = false; break; }
        if (G.buildMode) { this.cancelBuildMode(); break; }
        if (G.gameState === 'playing') {
          G.gameState = 'paused';
          this._showPauseMenu();
        } else if (G.gameState === 'paused') {
          G.gameState = 'playing';
          document.getElementById('overlay').style.display = 'none';
        }
        break;
      case 'b': case 'B':
        if (G.gameState === 'playing') {
          const cb = G.buildings.find(b => b.type === 'command_base' && !b.dead);
          if (cb) UI.showBuildMenu(G, (type) => this._enterBuildMode(type));
        }
        break;
      case 'a': case 'A':
        if (G.gameState === 'playing' && !G.buildMode) {
          G.attackMoveMode = !G.attackMoveMode;
          G.airstrikeMode = false;
        }
        break;
      case 'x': case 'X':
        if (G.gameState === 'playing' && G.airstrikeAvailable) {
          G.airstrikeMode = !G.airstrikeMode;
          G.attackMoveMode = false;
        }
        break;
      case 'h': case 'H':
        if (G.gameState === 'playing') {
          const sel = G.selected.filter(u => u.faction === 'player' && !u.dead);
          for (const u of sel) {
            u.holdPosition = true;
            u.path = [];
            u.attackMoveTarget = null;
          }
        }
        break;
    }
  }

  _showPauseMenu() {
    const overlay = document.getElementById('overlay');
    overlay.innerHTML = `
      <h1 style="font-size:32px">PAUSED</h1>
      <button class="overlay-btn" id="resume-btn">RESUME</button>
      <button class="overlay-btn" id="restart-btn2">RESTART</button>
    `;
    overlay.style.display = 'flex';
    document.getElementById('resume-btn').onclick = () => {
      overlay.style.display = 'none';
      this.G.gameState = 'playing';
    };
    document.getElementById('restart-btn2').onclick = () => {
      overlay.style.display = 'none';
      this.start();
    };
  }

  _entityAt(col, row) {
    const G = this.G;
    // units first
    for (const u of G.units) {
      if (u.dead) continue;
      if (Math.abs(u.col - (col + 0.5)) < 0.8 && Math.abs(u.row - (row + 0.5)) < 0.8) {
        return u;
      }
    }
    // buildings
    for (const b of G.buildings) {
      if (b.dead) continue;
      if (col >= b.col && col < b.col + b.w && row >= b.row && row < b.row + b.h) {
        return b;
      }
    }
    return null;
  }

  _canPlaceAt(col, row, w, h) {
    const G = this.G;
    const def = BUILDING_DEF[G.buildMode] || {};
    if (def.forwardPost) {
      // Forward post can be placed anywhere revealed, not just player zone
      if (col < 0 || col + w > COLS || row < 0 || row + h > ROWS) return false;
      const fogIdx = (row + Math.floor(h / 2)) * COLS + (col + Math.floor(w / 2));
      if (G.fog[fogIdx] !== 1) return false;
    } else {
      if (col < 27 || col + w > COLS || row < 0 || row + h > ROWS) return false; // player zone only
    }
    for (let dc = 0; dc < w; dc++)
      for (let dr = 0; dr < h; dr++)
        if (G.grid[(row + dr) * COLS + (col + dc)] !== 0) return false;
    return true;
  }

  _enterBuildMode(type) {
    this.G.buildMode = type;
    this.canvas.style.cursor = 'crosshair';
  }

  cancelBuildMode() {
    if (!this.G) return;
    this.G.buildMode = null;
    this.canvas.style.cursor = 'default';
    UI.hidePlacementCursor();
    UI.updateSelectionInfo(this.G.selected, this.G);
  }

  _tryPlaceBuilding(col, row) {
    const G = this.G;
    const type = G.buildMode;
    const def = BUILDING_DEF[type];
    const [w, h] = def.size;

    if (!this._canPlaceAt(col, row, w, h)) return; // invalid placement
    if (G.ic < def.cost) { UI.voice('insufficient_resources'); UI.flashResourceRed(); return; }

    const maxCount = def.maxCount;
    if (maxCount !== undefined && maxCount !== Infinity) {
      const count = G.buildings.filter(b => b.type === type && b.faction === 'player' && !b.dead).length;
      if (count >= maxCount) return;
    }

    G.ic -= def.cost;
    const b = createBuilding(type, col, row, 'player');
    G.buildings.push(b);
    // mark grid immediately to prevent overlap during construction
    _markGrid(G.grid, col, row, w, h, 1);
    _invalidatePathCache(G);

    this.cancelBuildMode();
    G.selected = [b];
    UI.updateSelectionInfo(G.selected, G);
  }

  trainUnit(building, uType) {
    const G = this.G;
    if (!G || G.gameState !== 'playing') return;
    const def = UNIT_DEF[uType];
    if (!def) return;
    const hasDepot = G.buildings.some(b => b.type === 'supply_depot' && !b.dead && b.buildProgress >= 1);
    const actualCost = hasDepot ? Math.floor(def.cost * 0.9) : def.cost;
    if (G.ic < actualCost) { UI.voice('insufficient_resources'); UI.flashResourceRed(); return; }

    const activeCount = G.units.filter(u => u.type === uType && u.faction === 'player' && !u.dead).length;
    if (activeCount >= def.maxActive) return;

    if (uType === 'drone' && G.droneCooldown > 0) {
      UI.voice('insufficient_resources'); return;
    }

    if (building.trainQueue.length >= 3) return; // queue full

    G.ic -= actualCost;
    building.trainQueue.push(uType);
    if (building.trainQueue.length === 1) {
      building.trainTimer = def.buildTime;
    }
    UI.updateSelectionInfo(G.selected, G);
  }

  purchaseUpgrade(upg) {
    const G = this.G;
    if (!G || G.ic < upg.cost) return;
    if (G.upgrades[upg.id]) return;
    G.ic -= upg.cost;
    upg.apply(G);
    UI.updateSelectionInfo(G.selected, G);
    if (upg.id === 'emergency_airstrike') UI.voice('airstrike_ready');
  }
}

// ---- Formation offset helper ----
function _formationOffset(i) {
  const offsets = [
    {dc:0,dr:0},{dc:1,dr:0},{dc:-1,dr:0},{dc:0,dr:1},{dc:0,dr:-1},
    {dc:1,dr:1},{dc:-1,dr:1},{dc:1,dr:-1},{dc:-1,dr:-1},
    {dc:2,dr:0},{dc:-2,dr:0},{dc:0,dr:2},
  ];
  return offsets[i % offsets.length];
}

// ---- Boot ----
const gameInstance = new Game();

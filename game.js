// ============================================================
// GAME.JS — Core game loop, state, rendering, fog of war
// ============================================================

const TICK_RATE = 1 / 60;
const ATTACK_COOLDOWN = 0.5; // seconds between attacks

// ---- Mission definitions ----
const MISSION_DATA = [
  {
    id: 1,
    title: 'Operation Veil',
    subtitle: 'Hold the settlements. Destroy the enemy command.',
    desc: 'Three civilian settlements stand between you and the Veil. Keep them alive while you push west to eliminate the Command Base.',
    settlements: [
      { col: 17, row: 7,  name: 'Kerem',  pop: 1200 },
      { col: 19, row: 19, name: 'Havela', pop: 800  },
      { col: 23, row: 13, name: 'Misgav', pop: 950  },
    ],
    playerBase: { col: 35, row: 14 },
    enemyBase: { col: 3, row: 13 },
    startIc: 200,
    waveInterval: 90,
  },
  {
    id: 2,
    title: 'Operation Spectre',
    subtitle: 'Urban corridor. No room to maneuver.',
    desc: 'The Veil controls a fortified urban corridor. Enemy forces are denser and waves come faster. Infiltrators spawn earlier. Protect the supply lines at all costs.',
    settlements: [
      { col: 25, row: 5,  name: 'Arvat',   pop: 600  },
      { col: 21, row: 14, name: 'Dekel',   pop: 1100 },
      { col: 26, row: 22, name: 'Tsipori', pop: 750  },
    ],
    playerBase: { col: 34, row: 14 },
    enemyBase: { col: 2, row: 14 },
    startIc: 150,        // less starting IC
    waveInterval: 65,    // faster waves
  },
];

let _currentMission = MISSION_DATA[0]; // default mission 1

// Settlement names & populations — resolved from active mission at game start
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

  const missionDef = _currentMission;

  // Player Command Base
  const pbCol = missionDef.playerBase.col, pbRow = missionDef.playerBase.row;
  const cb = createBuilding('command_base', pbCol, pbRow, 'player');
  cb.buildProgress = 1;
  _markGrid(grid, pbCol, pbRow, 2, 2, 1);
  buildings.push(cb);

  // Enemy Command Base (hidden)
  const ebCol = missionDef.enemyBase.col, ebRow = missionDef.enemyBase.row;
  const ecb = createBuilding('veil_command', ebCol, ebRow, 'enemy');
  ecb.buildProgress = 1;
  _markGrid(grid, ebCol, ebRow, 2, 2, 1);
  buildings.push(ecb);

  // Enemy initial barracks (near enemy base)
  const ebc1 = Math.min(ebCol + 3, 11), ebr1 = Math.max(ebRow - 3, 2);
  const eb1 = createBuilding('veil_barracks', ebc1, ebr1, 'enemy');
  eb1.buildProgress = 1;
  _markGrid(grid, ebc1, ebr1, 2, 2, 1);
  eb1.trainTimer = 10;
  buildings.push(eb1);

  // Enemy initial watch post
  const ewpc = Math.min(ebCol + 5, 13), ewpr = Math.max(2, ebRow - 10);
  const ewp = createBuilding('veil_watch_post', ewpc, ewpr, 'enemy');
  ewp.buildProgress = 1;
  _markGrid(grid, ewpc, ewpr, 1, 1, 1);
  ewp.trainTimer = 12;
  buildings.push(ewp);

  // Enemy initial radar
  const eradc = Math.min(ebCol + 2, 10), eradr = Math.min(ebRow + 4, ROWS - 2);
  const erad = createBuilding('veil_radar', eradc, eradr, 'enemy');
  erad.buildProgress = 1;
  _markGrid(grid, eradc, eradr, 1, 1, 1);
  buildings.push(erad);

  // Neutral settlements — from mission definition
  for (const sd of missionDef.settlements) {
    const s = createSettlement(sd.col, sd.row, sd.name, sd.pop);
    s.buildProgress = 1;
    _markGrid(grid, sd.col, sd.row, 2, 2, 1);
    buildings.push(s);
  }

  // Intel caches: scattered resource nodes across neutral/enemy zones
  const INTEL_CACHE_SPOTS = [
    [18,  5], [22, 10], [20, 20], [24, 25],  // neutral zone
    [14, 17], [16,  3], [25, 14],             // closer to river / deep neutral
  ];
  for (const [ic_col, ic_row] of INTEL_CACHE_SPOTS) {
    const ic = createBuilding('intel_cache', ic_col, ic_row, 'neutral');
    ic.buildProgress = 1;
    ic.icRemaining = 300;
    _markGrid(grid, ic_col, ic_row, 1, 1, 0); // passable — harvesters walk onto it
    buildings.push(ic);
  }

  // Player starting units: 3 soldiers near command base
  for (let i = 0; i < 3; i++) {
    units.push(createUnit('soldier', pbCol - 2 + i, pbRow + 1, 'player'));
  }

  // ---- Terrain enrichment precomputation ----

  // fogLit: which tiles are currently in a unit's sight (reset each frame)
  const fogLit = new Uint8Array(COLS * ROWS);
  // Pre-lit player start zone
  for (let r = 0; r < ROWS; r++)
    for (let c = 27; c < COLS; c++)
      fogLit[r * COLS + c] = 1;

  // Zone base colors [R, G, B] — Red Alert military palette
  const _DIRT = [78, 58, 32];   // enemy zone: warm barren brown
  const _NEUT = [52, 78, 24];   // neutral: vibrant olive
  const _GRAS = [48, 92, 22];   // player zone: bright military green
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
    ic: missionDef.startIc,
    elapsedTime: 0,
    fog, fogOpacity, fogLit, grid, buildings, units,
    tileColors, roads, features, riverTiles,
    particles: [],
    projectiles: [],
    powerLevel: 0,
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
// VISUAL HELPERS — Red Alert style rendering utilities
// ============================================================

// Get unit facing angle from its path
function _getFacing(u) {
  if (u.path && u.path.length > 0) {
    const next = u.path[0];
    return Math.atan2(next.row + 0.5 - u.row, next.col + 0.5 - u.col);
  }
  return 0;
}

// Darken a #rrggbb hex color by factor (0..1)
function _darken(hex, factor) {
  if (!hex || hex[0] !== '#' || hex.length < 7) return hex;
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  return `rgb(${Math.max(0,Math.round(r*factor))},${Math.max(0,Math.round(g*factor))},${Math.max(0,Math.round(b*factor))})`;
}

// Lighten a #rrggbb hex color by factor (0..1)
function _lighten(hex, factor) {
  if (!hex || hex[0] !== '#' || hex.length < 7) return hex;
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  return `rgb(${Math.min(255,Math.round(r+(255-r)*factor))},${Math.min(255,Math.round(g+(255-g)*factor))},${Math.min(255,Math.round(b+(255-b)*factor))})`;
}

// ============================================================
// RENDERER — Red Alert Style Visual Engine
// ============================================================
class Renderer {
  constructor(canvas, minimapCanvas) {
    this.ctx = canvas.getContext('2d');
    this.mctx = minimapCanvas.getContext('2d');
    this.mW = minimapCanvas.width;
    this.mH = minimapCanvas.height;
    this._frame = 0;
  }

  drawFrame(G) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    this._frame++;
    this._drawTerrain(ctx, G);
    this._drawBuildings(ctx, G);
    this._drawUnits(ctx, G);
    this._drawProjectiles(ctx, G);
    this._drawParticles(ctx, G);
    this._drawFog(ctx, G);
    this._drawSelectionHighlights(ctx, G);
    this._drawHpBars(ctx, G);
    this._drawMinimap(G);
  }

  // ─── TERRAIN ────────────────────────────────────────────────
  _drawTerrain(ctx, G) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const idx = r * COLS + c;
        const x = c * TILE, y = r * TILE;
        const isRiver = G.riverTiles.has(idx);
        const isBridge = isRiver && (r === 13 || r === 14);
        const isRoad = G.roads.has(idx);

        if (isRiver && !isBridge) {
          // Water — deep military blue with ripple lines
          ctx.fillStyle = '#1c3a5a';
          ctx.fillRect(x, y, TILE, TILE);
          ctx.strokeStyle = 'rgba(70,130,200,0.28)';
          ctx.lineWidth = 1;
          const rippleOff = (this._frame * 0.18 + c * 1.3) % TILE;
          for (let rl = 0; rl < TILE; rl += 9) {
            const yy = y + ((rl + rippleOff) % TILE);
            ctx.beginPath(); ctx.moveTo(x + 2, yy); ctx.lineTo(x + TILE - 4, yy); ctx.stroke();
          }
        } else if (isBridge) {
          // Wooden bridge planks
          ctx.fillStyle = '#6a5030';
          ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = '#7a5a38';
          for (let pl = 1; pl < TILE - 1; pl += 6) {
            ctx.fillRect(x + 1, y + pl, TILE - 2, 4);
          }
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.fillRect(x, y, 3, TILE);
          ctx.fillRect(x + TILE - 3, y, 3, TILE);
        } else {
          ctx.fillStyle = G.tileColors[idx];
          ctx.fillRect(x, y, TILE, TILE);
          if (isRoad) {
            // Dirt road — tan overlay + edge shadows
            ctx.fillStyle = 'rgba(160,120,55,0.32)';
            ctx.fillRect(x, y, TILE, TILE);
            ctx.fillStyle = 'rgba(60,42,15,0.22)';
            ctx.fillRect(x, y, 3, TILE);
            ctx.fillRect(x + TILE - 3, y, 3, TILE);
          }
        }

        // Decorative features
        const feat = G.features[idx];
        if (feat === 1) {
          // Trees — round canopy with trunk + shadow
          const drawTree = (tx, ty, sz) => {
            ctx.fillStyle = 'rgba(0,0,0,0.22)';
            ctx.beginPath(); ctx.ellipse(tx + 2, ty + 2, sz + 2, sz - 1, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#5a3810';
            ctx.fillRect(tx - 1, ty - 2, 2, sz - 1);
            ctx.fillStyle = '#254a0e';
            ctx.beginPath(); ctx.arc(tx, ty - sz + 2, sz, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#326614';
            ctx.beginPath(); ctx.arc(tx - 1, ty - sz, sz - 2, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#3d7a18';
            ctx.beginPath(); ctx.arc(tx - 1, ty - sz - 1, sz - 4, 0, Math.PI * 2); ctx.fill();
          };
          drawTree(x + 9, y + 20, 7);
          drawTree(x + 22, y + 17, 6);
        } else if (feat === 2) {
          // Rocks — 3D polygon outcropping with highlight
          ctx.fillStyle = 'rgba(0,0,0,0.28)';
          ctx.beginPath(); ctx.ellipse(x + 18, y + 22, 9, 4, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#6a6458';
          ctx.beginPath();
          ctx.moveTo(x + 8,y+20); ctx.lineTo(x+12,y+11); ctx.lineTo(x+20,y+10);
          ctx.lineTo(x+25,y+18); ctx.lineTo(x+19,y+22); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#8a8478';
          ctx.beginPath();
          ctx.moveTo(x+11,y+14); ctx.lineTo(x+15,y+12); ctx.lineTo(x+18,y+15);
          ctx.lineTo(x+14,y+18); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#585048';
          ctx.beginPath();
          ctx.moveTo(x+20,y+20); ctx.lineTo(x+24,y+16); ctx.lineTo(x+27,y+17);
          ctx.lineTo(x+26,y+22); ctx.closePath(); ctx.fill();
        } else if (feat === 3) {
          // Ruins — destroyed building foundation with rubble
          ctx.fillStyle = 'rgba(0,0,0,0.32)';
          ctx.fillRect(x + 5, y + 7, 22, 18);
          ctx.fillStyle = '#4a3a2a';
          ctx.fillRect(x + 6, y + 8, 20, 16);
          ctx.fillStyle = '#6a5a48';
          ctx.fillRect(x + 6, y + 8, 4, 12);
          ctx.fillRect(x + 18, y + 8, 3, 8);
          ctx.fillRect(x + 6, y + 8, 16, 3);
          ctx.fillStyle = '#5a4a38';
          ctx.fillRect(x + 12, y + 16, 5, 4);
          ctx.fillRect(x + 20, y + 12, 4, 4);
          ctx.strokeStyle = 'rgba(25,16,10,0.65)';
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(x+8,y+10); ctx.lineTo(x+14,y+16);
          ctx.moveTo(x+20,y+9); ctx.lineTo(x+16,y+14);
          ctx.stroke();
        }

        // Very subtle grid
        ctx.strokeStyle = 'rgba(0,0,0,0.055)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x, y, TILE, TILE);
      }
    }
  }

  // ─── BUILDINGS ──────────────────────────────────────────────
  _drawBuildings(ctx, G) {
    for (const b of G.buildings) {
      if (b.dead) continue;
      const fogIdx = Math.floor(b.row + b.h/2) * COLS + Math.floor(b.col + b.w/2);
      const visible = b.faction === 'player' || G.fog[fogIdx] === 1;
      if (!visible) continue;

      const x = b.col * TILE, y = b.row * TILE;
      const pw = b.w * TILE, ph = b.h * TILE;

      ctx.globalAlpha = b.buildProgress < 1 ? 0.35 + b.buildProgress * 0.65 : 1;
      this._drawBuildingShape(ctx, b.type, b.faction, x, y, pw, ph);
      ctx.globalAlpha = 1;

      // Build progress bar
      if (b.buildProgress < 1) {
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(x + 2, y + ph - 6, pw - 4, 4);
        ctx.fillStyle = '#44cc22';
        ctx.fillRect(x + 2, y + ph - 6, (pw - 4) * b.buildProgress, 4);
      }
      // Train progress bar
      if (b.trainQueue && b.trainQueue.length > 0 && b.trainTimer > 0) {
        const uDef = UNIT_DEF[b.trainQueue[0]];
        if (uDef) {
          const prog = 1 - b.trainTimer / uDef.buildTime;
          ctx.fillStyle = '#1a1a1a';
          ctx.fillRect(x + 2, y + 2, pw - 4, 4);
          ctx.fillStyle = '#4488ff';
          ctx.fillRect(x + 2, y + 2, (pw - 4) * Math.max(0, Math.min(1, prog)), 4);
        }
      }

      // Rally point flag marker on the building
      if (b.rallyPoint) {
        const rpx = b.rallyPoint.col * TILE + TILE / 2;
        const rpy = b.rallyPoint.row * TILE + TILE / 2;
        // Draw dashed line from building center to rally point
        ctx.save();
        ctx.strokeStyle = 'rgba(68,255,68,0.55)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(x + pw / 2, y + ph / 2);
        ctx.lineTo(rpx, rpy);
        ctx.stroke();
        ctx.setLineDash([]);
        // Flag icon at rally point
        ctx.fillStyle = '#44ff44';
        ctx.beginPath();
        ctx.arc(rpx, rpy, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#22aa22';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(rpx, rpy, 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  _drawBuildingShape(ctx, type, faction, x, y, pw, ph) {
    const isEnemy  = faction === 'enemy';
    const isNeutral = faction === 'neutral';
    const def = BUILDING_DEF[type];
    const mc  = def ? def.color : '#888888';
    const dk  = _darken(mc, 0.5);
    const lt  = _lighten(mc, 0.38);
    const border = isEnemy ? '#cc3333' : isNeutral ? '#88aa88' : '#4499cc';

    const fill = (c, rx, ry, rw, rh) => { ctx.fillStyle = c; ctx.fillRect(rx,ry,rw,rh); };
    const stroke = (c, lw, rx, ry, rw, rh) => {
      ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.strokeRect(rx,ry,rw,rh);
    };
    const outline = () => stroke(border, 1.8, x+2,y+2,pw-4,ph-4);

    switch (type) {
      /* ── COMMAND BASE ── */
      case 'command_base': {
        fill(mc, x+3,y+3,pw-6,ph-6);
        fill(lt, x+8,y+3,pw-16,ph/2-4);
        // windows
        ctx.fillStyle = 'rgba(150,210,255,0.7)';
        for (let i=0;i<3;i++) ctx.fillRect(x+10+i*14, y+ph/2, 8, 5);
        // central tower
        fill(dk, x+pw/2-6,y+2,12,ph-4);
        fill(lt, x+pw/2-4,y+4,8,6);
        // antenna mast
        ctx.strokeStyle = '#bbbbcc'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x+pw/2,y+2); ctx.lineTo(x+pw/2,y-11); ctx.stroke();
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x+pw/2-7,y-8); ctx.lineTo(x+pw/2+7,y-8); ctx.stroke();
        // satellite dish
        ctx.strokeStyle = '#88aacc'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x+pw-10,y+9,6,Math.PI*0.75,Math.PI*1.85); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x+pw-10,y+15); ctx.lineTo(x+pw-10,y+9); ctx.stroke();
        outline(); break;
      }
      /* ── BARRACKS ── */
      case 'barracks': case 'veil_barracks': {
        fill(mc, x+3,y+3,pw-6,ph-6);
        fill(dk, x+3,y+3,pw-6,6);
        fill(lt, x+3,y+4,pw-6,3);
        // windows
        ctx.fillStyle = isEnemy ? '#220000' : '#334455';
        for (let i=0;i<3;i++) {
          ctx.fillRect(x+8+i*16, y+14, 8, 6);
          ctx.fillRect(x+8+i*16, y+ph/2+6, 8, 6);
        }
        // door
        fill('#111', x+pw/2-5,y+ph-12,10,10);
        ctx.strokeStyle = '#555'; ctx.lineWidth = 0.8; ctx.strokeRect(x+pw/2-5,y+ph-12,10,10);
        outline(); break;
      }
      /* ── WATCHTOWER ── */
      case 'watchtower': case 'veil_watch_post': {
        ctx.strokeStyle = isEnemy ? '#661111' : dk; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x+8,y+ph-2); ctx.lineTo(x+pw/2-1,y+8);
        ctx.moveTo(x+pw-8,y+ph-2); ctx.lineTo(x+pw/2+1,y+8);
        ctx.moveTo(x+4,y+ph/2); ctx.lineTo(x+pw/2,y+8);
        ctx.moveTo(x+pw-4,y+ph/2); ctx.lineTo(x+pw/2,y+8);
        ctx.stroke();
        fill(mc, x+4,y+5,pw-8,13);
        fill(lt, x+5,y+6,pw-10,5);
        fill('#111', x+8,y+8,pw-16,3); // slit
        const blink = (this._frame>>5)&1;
        ctx.fillStyle = blink ? '#ffff44' : '#887700';
        ctx.beginPath(); ctx.arc(x+pw/2,y+4,2.5,0,Math.PI*2); ctx.fill();
        outline(); break;
      }
      /* ── BUNKER ── */
      case 'bunker': case 'veil_bunker': {
        fill(dk, x+4,y+8,pw-4,ph-6);
        ctx.fillStyle = mc;
        ctx.beginPath();
        ctx.moveTo(x+3,y+ph-4); ctx.lineTo(x+2,y+10);
        ctx.lineTo(x+6,y+6); ctx.lineTo(x+pw-6,y+6);
        ctx.lineTo(x+pw-2,y+10); ctx.lineTo(x+pw-3,y+ph-4);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = lt;
        ctx.beginPath();
        ctx.moveTo(x+2,y+10); ctx.lineTo(x+6,y+6);
        ctx.lineTo(x+pw-6,y+6); ctx.lineTo(x+pw-2,y+10);
        ctx.closePath(); ctx.fill();
        fill('#111', x+8,y+ph/2-1,pw-16,3); // gun slit
        ctx.fillStyle = '#7a6a44';
        for (let i=0;i<4;i++) {
          ctx.beginPath(); ctx.ellipse(x+6+i*6,y+ph-3,3,2,0,0,Math.PI*2); ctx.fill();
        }
        outline(); break;
      }
      /* ── WALLS ── */
      case 'wall': case 'fortified_wall': case 'veil_wall': {
        fill(mc, x+1,y+1,pw-2,ph-2);
        ctx.strokeStyle = dk; ctx.lineWidth = 0.6;
        for (let bi=0;bi<Math.ceil(ph/5);bi++) {
          const off = (bi%2===0)?0:8;
          for (let bj=-1;bj<Math.ceil(pw/16)+1;bj++) {
            ctx.strokeRect(x+off+bj*16, y+bi*5, 14, 4);
          }
        }
        if (type==='fortified_wall') {
          fill(lt, x+2,y+1,7,5); fill(lt, x+14,y+1,7,5);
        }
        stroke(border, 1.5, x+1,y+1,pw-2,ph-2); break;
      }
      /* ── MOTOR POOL ── */
      case 'motor_pool': {
        fill(mc, x+3,y+3,pw-6,ph-6);
        fill(dk, x+3,y+3,pw-6,8);
        fill(lt, x+4,y+4,pw-8,4);
        fill('#1a1a1a', x+8,y+16,pw-16,ph-22); // bay door opening
        ctx.strokeStyle = '#333'; ctx.lineWidth = 1;
        for (let d=4;d<ph-22;d+=5) {
          ctx.beginPath(); ctx.moveTo(x+8,y+16+d); ctx.lineTo(x+pw-8,y+16+d); ctx.stroke();
        }
        ctx.fillStyle = 'rgba(80,60,30,0.55)';
        ctx.fillRect(x+14,y+24,pw-28,12);
        outline(); break;
      }
      /* ── RADAR STATION ── */
      case 'radar_station': case 'veil_radar': {
        fill(mc, x+3,y+ph/2,pw-6,ph/2-3);
        fill(lt, x+3,y+ph/2,pw-6,4);
        fill(dk, x+pw/2-3,y+ph/2-5,6,ph/2-2);
        // animated dish
        const da = (this._frame*0.025)%(Math.PI*2);
        ctx.strokeStyle = isEnemy ? '#cc4433' : '#33ccaa'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x+pw/2,y+ph/2-6,10,da,da+Math.PI); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x+pw/2,y+ph/2-6);
        ctx.lineTo(x+pw/2+Math.cos(da)*10, y+ph/2-6+Math.sin(da)*10); ctx.stroke();
        const bl = (this._frame>>4)&1;
        ctx.fillStyle = bl ? '#ff3333' : '#771111';
        ctx.beginPath(); ctx.arc(x+pw-6,y+ph/2+5,2.5,0,Math.PI*2); ctx.fill();
        outline(); break;
      }
      /* ── HOSPITAL ── */
      case 'hospital': case 'veil_hospital': {
        fill(mc, x+3,y+3,pw-6,ph-6);
        fill(lt, x+3,y+3,pw-6,5);
        const cx=x+pw/2, cy=y+ph/2;
        ctx.fillStyle = isEnemy ? '#990000' : '#ee2222';
        ctx.fillRect(cx-8,cy-3,16,6); ctx.fillRect(cx-3,cy-8,6,16);
        ctx.fillStyle = 'rgba(180,220,255,0.5)';
        ctx.fillRect(x+5,y+10,6,5); ctx.fillRect(x+pw-11,y+10,6,5);
        outline(); break;
      }
      /* ── QUARRY ── */
      case 'quarry': {
        fill(mc, x+3,y+3,pw-6,ph-6);
        fill(dk, x+5,y+8,pw-10,5);
        fill('#886633', x+6,y+16,6,ph-20);
        fill(lt, x+6,y+16,6,4);
        fill('#5a4a3a', x+pw-12,y+2,5,10);
        outline(); break;
      }
      /* ── FIELD OPS ── */
      case 'field_ops': {
        fill(mc, x+3,y+3,pw-6,ph-6);
        fill(lt, x+3,y+3,pw-6,5);
        fill('#2a3a2a', x+10,y+12,pw-20,ph/2-8);
        ctx.strokeStyle = '#3a5a3a'; ctx.lineWidth = 0.5;
        for (let gi=1;gi<3;gi++) {
          ctx.beginPath(); ctx.moveTo(x+10+gi*(pw-20)/3,y+12); ctx.lineTo(x+10+gi*(pw-20)/3,y+ph/2+4); ctx.stroke();
        }
        ctx.fillStyle = '#aaccff';
        ctx.fillRect(x+8,y+ph/2+2,8,6); ctx.fillRect(x+pw-16,y+ph/2+2,8,6);
        outline(); break;
      }
      /* ── DEFENSE WORKS ── */
      case 'defense_works': {
        fill(mc, x+3,y+3,pw-6,ph-6);
        fill(dk, x+3,y+3,5,ph-6); fill(dk, x+pw-8,y+3,5,ph-6);
        fill(dk, x+3,y+3,pw-6,5); fill(dk, x+3,y+ph-8,pw-6,5);
        ctx.strokeStyle = lt; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x+pw/2,y+ph/2); ctx.lineTo(x+pw/2-8,y+ph/2-14);
        ctx.moveTo(x+pw/2,y+ph/2); ctx.lineTo(x+pw/2+8,y+ph/2-14);
        ctx.stroke();
        outline(); break;
      }
      /* ── COMMS TOWER ── */
      case 'comms_tower': {
        fill(mc, x+8,y+ph-10,pw-16,9);
        fill(lt, x+pw/2-2,y+2,4,ph-12);
        ctx.strokeStyle = mc; ctx.lineWidth = 2;
        for (let ti=0;ti<3;ti++) {
          const ty=y+ph*0.18+ti*(ph*0.2);
          ctx.beginPath(); ctx.moveTo(x+pw/2-8+ti*2,ty); ctx.lineTo(x+pw/2+8-ti*2,ty); ctx.stroke();
        }
        const bl2=(this._frame>>5)&1;
        ctx.fillStyle = bl2 ? '#ffff44' : '#888800';
        ctx.beginPath(); ctx.arc(x+pw/2,y+3,2.5,0,Math.PI*2); ctx.fill();
        outline(); break;
      }
      /* ── SUPPLY DEPOT ── */
      case 'supply_depot': {
        fill(mc, x+3,y+3,pw-6,ph-6);
        fill('#7a6a3a', x+5,y+5,10,8); fill('#7a6a3a', x+17,y+5,8,8);
        fill('#8a7a4a', x+5,y+5,10,4); fill('#8a7a4a', x+17,y+5,8,4);
        ctx.strokeStyle = '#5a4a28'; ctx.lineWidth = 0.5;
        ctx.strokeRect(x+5,y+5,10,8); ctx.strokeRect(x+17,y+5,8,8);
        outline(); break;
      }
      /* ── FORWARD POST ── */
      case 'forward_post': {
        fill(mc, x+4,y+6,pw-8,ph-10);
        ctx.fillStyle = '#7a6a44';
        for (let i=0;i<5;i++) {
          const a=(i/5)*Math.PI*2;
          ctx.beginPath(); ctx.ellipse(x+pw/2+Math.cos(a)*9,y+ph/2+Math.sin(a)*7,4,3,a,0,Math.PI*2); ctx.fill();
        }
        fill(lt, x+pw/2-1,y+2,1,8);
        fill('#4488ff', x+pw/2,y+2,6,4);
        outline(); break;
      }
      /* ── SETTLEMENT ── */
      case 'settlement': {
        fill(mc, x+4,y+4,pw-8,ph-8);
        fill('#5a7a48', x+6,y+6,20,14); fill('#6a8a5a', x+6,y+6,20,5);
        fill('#4a6a38', x+30,y+12,14,18); fill('#5a7a48', x+30,y+12,14,5);
        ctx.fillStyle='rgba(150,120,60,0.5)'; ctx.fillRect(x+26,y+10,4,22);
        stroke('#88aa88', 1.5, x+3,y+3,pw-6,ph-6); break;
      }
      /* ── VEIL COMMAND ── */
      case 'veil_command': {
        fill(mc, x+3,y+3,pw-6,ph-6);
        fill(dk, x+pw/2-7,y+2,14,ph-4);
        fill('#cc2222', x+pw/2-5,y+4,10,8);
        fill('#661111', x+pw/2-6,y+2,4,4);
        fill('#661111', x+pw/2-1,y+2,4,4);
        fill('#661111', x+pw/2+4,y+2,4,4);
        // Soviet star
        ctx.fillStyle='#ff3333';
        const sx=x+pw/2, sy=y+ph/2+4;
        for (let pi=0;pi<5;pi++) {
          const a1=(pi*4*Math.PI/5)-Math.PI/2, a2=((pi*4+2)*Math.PI/5)-Math.PI/2;
          ctx.beginPath(); ctx.moveTo(sx,sy);
          ctx.lineTo(sx+Math.cos(a1)*7,sy+Math.sin(a1)*7);
          ctx.lineTo(sx+Math.cos(a2)*7,sy+Math.sin(a2)*7);
          ctx.closePath(); ctx.fill();
        }
        stroke('#ff4444', 2, x+2,y+2,pw-4,ph-4); break;
      }
      /* ── TUNNEL ENTRANCE ── */
      case 'tunnel_entrance': {
        fill('#2a2018', x+2,y+2,pw-4,ph-4);
        fill('#1a1210', x+pw/2-10,y+ph/2-6,20,16);
        ctx.beginPath(); ctx.ellipse(x+pw/2,y+ph/2+2,9,7,0,0,Math.PI*2);
        ctx.fillStyle='#0a0806'; ctx.fill();
        stroke('#553311', 1.5, x+2,y+2,pw-4,ph-4); break;
      }
      /* ── ROCKET PLATFORM ── */
      case 'rocket_platform': {
        fill('#443322', x+2,y+2,pw-4,ph-4);
        ctx.fillStyle='#553322'; ctx.beginPath(); ctx.arc(x+pw/2,y+ph/2,10,0,Math.PI*2); ctx.fill();
        fill('#cc3322', x+pw/2-2,y+4,4,14);
        ctx.fillStyle='#cc3322';
        ctx.beginPath(); ctx.moveTo(x+pw/2-2,y+4); ctx.lineTo(x+pw/2,y+1); ctx.lineTo(x+pw/2+2,y+4); ctx.fill();
        stroke('#774422', 1.5, x+2,y+2,pw-4,ph-4); break;
      }
      /* ── ARMORY / WORKSHOP ── */
      case 'armory': case 'veil_workshop': {
        fill(mc, x+2,y+2,pw-4,ph-4);
        ctx.strokeStyle='#cc4444'; ctx.lineWidth=1;
        for (let ri=0;ri<3;ri++) {
          ctx.beginPath(); ctx.moveTo(x+7+ri*7,y+6); ctx.lineTo(x+7+ri*7,y+22); ctx.stroke();
        }
        stroke('#cc3333', 1.5, x+2,y+2,pw-4,ph-4); break;
      }
      /* ── VEIL DEPOT ── */
      case 'veil_depot': {
        fill(mc, x+2,y+2,pw-4,ph-4);
        fill(dk, x+2,y+2,pw-4,6);
        for (let bi=0;bi<2;bi++) {
          ctx.fillStyle='#774422';
          ctx.beginPath(); ctx.arc(x+8+bi*10,y+ph/2+4,4,0,Math.PI*2); ctx.fill();
          ctx.fillStyle='#993322';
          ctx.beginPath(); ctx.arc(x+8+bi*10,y+ph/2+4,3,Math.PI,Math.PI*2); ctx.fill();
        }
        stroke(border, 1.5, x+2,y+2,pw-4,ph-4); break;
      }
      /* ── VEIL AIRBASE ── */
      case 'veil_airbase': {
        fill(mc, x+3,y+3,pw-6,ph-6);
        fill('#2a2020', x+3,y+ph/2-3,pw-6,6);
        ctx.fillStyle='#553333';
        for (let ri=0;ri<4;ri++) ctx.fillRect(x+8+ri*14,y+ph/2-1,8,2);
        stroke('#cc3344', 1.5, x+2,y+2,pw-4,ph-4); break;
      }
      /* ── VEIL FOUNDRY ── */
      case 'veil_foundry': {
        fill(mc, x+3,y+3,pw-6,ph-6);
        fill('#5a3322', x+10,y+2,5,12); fill('#5a3322', x+pw-15,y+2,5,12);
        ctx.fillStyle='rgba(255,90,15,0.45)';
        ctx.beginPath(); ctx.arc(x+12,y+14,5,0,Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(x+pw-12,y+14,5,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='rgba(255,50,0,0.28)';
        ctx.fillRect(x+16,y+20,pw-32,ph-26);
        stroke('#aa2211', 1.5, x+2,y+2,pw-4,ph-4); break;
      }
      /* ── VEIL FORT ── */
      case 'veil_fort': {
        fill(mc, x+3,y+3,pw-6,ph-6);
        fill(dk, x+3,y+3,10,10); fill(dk, x+pw-13,y+3,10,10);
        fill(dk, x+3,y+ph-13,10,10); fill(dk, x+pw-13,y+ph-13,10,10);
        fill('#551111', x+13,y+3,pw-26,5); fill('#551111', x+13,y+ph-8,pw-26,5);
        fill('#551111', x+3,y+13,5,ph-26); fill('#551111', x+pw-8,y+13,5,ph-26);
        stroke('#cc2222', 2, x+2,y+2,pw-4,ph-4); break;
      }
      /* ── INTEL CACHE ── */
      case 'intel_cache': {
        // Pulsing blue glow — crate full of intel
        const pulse = 0.45 + 0.3 * Math.abs(Math.sin(this._frame * 0.05));
        ctx.fillStyle = `rgba(30,80,180,${pulse})`;
        ctx.beginPath(); ctx.arc(x+pw/2,y+ph/2,pw/2+2,0,Math.PI*2); ctx.fill();
        fill('#1a3a6a', x+3,y+3,pw-6,ph-6);
        fill('#2a5aaa', x+5,y+5,pw-10,7); // lid highlight
        // stencil lines
        ctx.strokeStyle='rgba(80,160,255,0.7)'; ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(x+4,y+ph/2); ctx.lineTo(x+pw-4,y+ph/2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x+pw/2,y+4); ctx.lineTo(x+pw/2,y+ph-4); ctx.stroke();
        stroke('rgba(100,180,255,0.8)', 1.5, x+2,y+2,pw-4,ph-4);
        break;
      }
      /* ── DEFAULT fallback ── */
      default: {
        fill(mc, x+2,y+2,pw-4,ph-4);
        stroke(border, 1.5, x+2,y+2,pw-4,ph-4);
      }
    }
  }

  // ─── UNITS ──────────────────────────────────────────────────
  _drawUnits(ctx, G) {
    for (const u of G.units) {
      if (u.dead) continue;
      const fc = Math.floor(u.row) * COLS + Math.floor(u.col);
      const currentlyVisible = u.faction === 'player' || G.fogLit[fc] === 1;
      const isGhost = !currentlyVisible && u.faction === 'enemy' && (u.ghostTimer||0) > 0;
      if (!currentlyVisible && !isGhost) continue;

      const x = u.col * TILE;
      const y = u.row * TILE;
      const def = UNIT_DEF[u.type];
      const angle = _getFacing(u);

      if (isGhost) ctx.globalAlpha = 0.35;
      this._drawUnitSprite(ctx, u.type, u.faction, x, y, def.color, angle);
      if (isGhost) {
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = '#ffcc44';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('?', x, y - 14);
        ctx.textAlign = 'left';
      }
      ctx.globalAlpha = 1;

      // Veterancy stars (player units only)
      if (u.faction === 'player' && u.stars > 0) {
        ctx.save();
        ctx.font = '8px monospace';
        ctx.textAlign = 'center';
        const starColors = ['', '#d4aa00', '#c8c8c8', '#ffdd44'];
        ctx.fillStyle = starColors[u.stars];
        ctx.shadowColor = starColors[u.stars];
        ctx.shadowBlur = 4;
        ctx.fillText('★'.repeat(u.stars), x, y - 16);
        ctx.shadowBlur = 0;
        ctx.restore();
      }

      // APC: show passenger count badge
      if (u.type === 'apc' && u.loadedUnits && u.loadedUnits.length > 0) {
        ctx.save();
        ctx.fillStyle = '#44aaff';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`[${u.loadedUnits.length}]`, x, y - 16);
        ctx.restore();
      }
    }
  }

  _drawUnitSprite(ctx, type, faction, x, y, color, angle) {
    const isEnemy = faction === 'enemy';
    const outlineC = isEnemy ? '#660000' : '#1a3a6a';
    const dk = _darken(color, 0.5);
    const lt = _lighten(color, 0.4);
    const shadow = 'rgba(0,0,0,0.32)';

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    switch (type) {
      /* ─ INFANTRY ─ */
      case 'soldier': case 'veil_soldier': case 'veil_raider': {
        ctx.fillStyle = shadow;
        ctx.beginPath(); ctx.ellipse(1,3,5,3,0,0,Math.PI*2); ctx.fill();
        ctx.fillStyle = color; ctx.fillRect(-3,-2,6,7);
        ctx.fillStyle = dk;
        ctx.beginPath(); ctx.arc(0,-5,4,0,Math.PI*2); ctx.fill();
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(0,-5,3,-Math.PI*0.85,Math.PI*0.1); ctx.fill(); // helmet brim
        ctx.strokeStyle = dk; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(2,0); ctx.lineTo(10,-1); ctx.stroke();
        ctx.strokeStyle = outlineC; ctx.lineWidth = 0.6; ctx.strokeRect(-3,-2,6,7);
        break;
      }
      case 'veil_heavy': {
        ctx.fillStyle = shadow;
        ctx.beginPath(); ctx.ellipse(1,4,8,4,0,0,Math.PI*2); ctx.fill();
        ctx.fillStyle = dk; ctx.fillRect(-5,-4,10,10);
        ctx.fillStyle = color; ctx.fillRect(-4,-3,8,8);
        ctx.fillStyle = lt; ctx.fillRect(-4,-3,8,3); ctx.fillRect(-4,-3,3,8);
        ctx.fillStyle = '#330000';
        ctx.beginPath(); ctx.arc(0,-6,5,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#222'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(3,-1); ctx.lineTo(13,-2); ctx.stroke();
        break;
      }
      case 'engineer': case 'veil_engineer': {
        ctx.fillStyle = shadow;
        ctx.beginPath(); ctx.ellipse(1,3,5,3,0,0,Math.PI*2); ctx.fill();
        ctx.fillStyle = color; ctx.fillRect(-3,-2,6,7);
        ctx.fillStyle = '#d4aa66';
        ctx.beginPath(); ctx.arc(0,-4,3,0,Math.PI*2); ctx.fill();
        ctx.fillStyle = dk;
        ctx.beginPath(); ctx.arc(0,-5,3.5,-Math.PI,0); ctx.fill(); // hard hat
        ctx.strokeStyle = '#888'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(2,1); ctx.lineTo(8,-3); ctx.stroke();
        ctx.fillStyle = '#888';
        ctx.beginPath(); ctx.arc(8,-3,2.5,0,Math.PI*2); ctx.fill();
        break;
      }
      case 'medic': {
        ctx.fillStyle = shadow;
        ctx.beginPath(); ctx.ellipse(1,3,5,3,0,0,Math.PI*2); ctx.fill();
        ctx.fillStyle = '#e8e8e8'; ctx.fillRect(-3,-2,6,7);
        ctx.fillStyle = '#dd2222'; ctx.fillRect(-1,-1,2,5); ctx.fillRect(-3,1,6,2);
        ctx.fillStyle = '#d4aa66';
        ctx.beginPath(); ctx.arc(0,-5,3,0,Math.PI*2); ctx.fill();
        ctx.fillStyle = '#888';
        ctx.beginPath(); ctx.arc(0,-6,3,-Math.PI,0); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.fillRect(-6,0,4,4);
        ctx.fillStyle = '#dd2222'; ctx.fillRect(-5,1,2,2); ctx.fillRect(-6,1.5,4,1);
        break;
      }
      case 'sniper': case 'veil_sniper': {
        ctx.fillStyle = shadow;
        ctx.beginPath(); ctx.ellipse(4,2,10,3,0,0,Math.PI*2); ctx.fill();
        ctx.fillStyle = color; ctx.fillRect(-4,-2,12,4);
        ctx.fillStyle = dk;
        ctx.beginPath(); ctx.arc(-2,0,3,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#444'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(-2,0); ctx.lineTo(17,-1); ctx.stroke();
        ctx.fillStyle = '#222'; ctx.fillRect(4,-2,4,2); // scope
        break;
      }
      case 'spec_ops': {
        ctx.fillStyle = shadow;
        ctx.beginPath(); ctx.ellipse(1,3,5,3,0,0,Math.PI*2); ctx.fill();
        ctx.fillStyle = '#1a1a2a'; ctx.fillRect(-3,-2,6,7);
        ctx.fillStyle = color; ctx.fillRect(-2,-1,2,3); ctx.fillRect(1,1,2,2);
        ctx.fillStyle = '#1a1a22';
        ctx.beginPath(); ctx.arc(0,-5,3.5,0,Math.PI*2); ctx.fill();
        ctx.fillStyle = '#aaaacc'; ctx.fillRect(-2,-6,4,1); // eyes
        ctx.strokeStyle = '#333344'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(2,0); ctx.lineTo(10,-0.5); ctx.stroke();
        ctx.fillStyle = '#333344'; ctx.fillRect(4,-1,4,2);
        break;
      }
      case 'infiltrator': {
        ctx.fillStyle = shadow;
        ctx.beginPath(); ctx.ellipse(1,3,5,3,0,0,Math.PI*2); ctx.fill();
        ctx.fillStyle = '#2a1a3a'; ctx.fillRect(-3,-2,6,7);
        ctx.fillStyle = color; ctx.fillRect(-1,0,2,3);
        ctx.fillStyle = '#1a0a22';
        ctx.beginPath(); ctx.arc(0,-5,3.5,0,Math.PI*2); ctx.fill();
        ctx.fillStyle = '#ff4488'; ctx.fillRect(-2,-6,4,1);
        ctx.strokeStyle = '#440044'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(2,0); ctx.lineTo(10,-1); ctx.stroke();
        break;
      }
      case 'veil_scout': {
        ctx.fillStyle = shadow;
        ctx.beginPath(); ctx.ellipse(1,2,4,2,0,0,Math.PI*2); ctx.fill();
        ctx.fillStyle = color; ctx.fillRect(-2,-2,5,6);
        ctx.fillStyle = dk;
        ctx.beginPath(); ctx.arc(0,-3,3,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#551111'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(2,0); ctx.lineTo(8,0); ctx.stroke();
        break;
      }
      /* ─ SCOUT VEHICLE ─ */
      case 'scout_vehicle': {
        ctx.fillStyle = shadow;
        ctx.beginPath(); ctx.ellipse(0,5,10,4,0,0,Math.PI*2); ctx.fill();
        // wheels
        ctx.fillStyle = '#222';
        for (const [wx,wy] of [[-6,4],[6,4],[-6,-4],[6,-4]]) {
          ctx.beginPath(); ctx.arc(wx,wy,3,0,Math.PI*2); ctx.fill();
          ctx.fillStyle = '#444'; ctx.beginPath(); ctx.arc(wx,wy,1.5,0,Math.PI*2); ctx.fill();
          ctx.fillStyle = '#222';
        }
        ctx.fillStyle = color; ctx.fillRect(-7,-5,14,10);
        ctx.fillStyle = 'rgba(140,200,255,0.55)'; ctx.fillRect(1,-4,5,4);
        ctx.strokeStyle = lt; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-4,-5); ctx.lineTo(-4,-13); ctx.stroke();
        ctx.strokeStyle = outlineC; ctx.lineWidth = 1; ctx.strokeRect(-7,-5,14,10);
        break;
      }
      /* ─ APC / VEIL TRUCK ─ */
      case 'apc': case 'veil_truck': {
        ctx.fillStyle = shadow;
        ctx.beginPath(); ctx.ellipse(0,6,12,4,0,0,Math.PI*2); ctx.fill();
        ctx.fillStyle = '#2a2a2a'; ctx.fillRect(-10,-5,4,10); ctx.fillRect(6,-5,4,10);
        ctx.fillStyle = '#3a3a3a';
        for (let ti=-4;ti<6;ti+=3) {
          ctx.fillRect(-10,ti,4,1.5); ctx.fillRect(6,ti,4,1.5);
        }
        ctx.fillStyle = color; ctx.fillRect(-6,-5,12,10);
        ctx.fillStyle = dk; ctx.fillRect(-5,-5,10,3);
        ctx.fillStyle = lt;
        ctx.beginPath(); ctx.arc(0,-3,3,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#333'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(0,-3); ctx.lineTo(8,-5); ctx.stroke();
        ctx.strokeStyle = outlineC; ctx.lineWidth = 1; ctx.strokeRect(-6,-5,12,10);
        break;
      }
      /* ─ TANK ─ */
      case 'tank': case 'veil_tank': {
        ctx.fillStyle = shadow;
        ctx.beginPath(); ctx.ellipse(0,7,13,5,0,0,Math.PI*2); ctx.fill();
        // tracks
        ctx.fillStyle = '#2a2a2a';
        ctx.fillRect(-11,-7,4,14); ctx.fillRect(7,-7,4,14);
        ctx.fillStyle = '#3a3a3a';
        for (let ti=-6;ti<8;ti+=2.5) {
          ctx.fillRect(-11,ti,4,1.5); ctx.fillRect(7,ti,4,1.5);
        }
        ctx.fillStyle = dk; ctx.fillRect(-7,-6,14,12);
        ctx.fillStyle = color; ctx.fillRect(-6,-5,12,10);
        ctx.fillStyle = lt; ctx.fillRect(-5,-5,10,3);
        // turret ring
        ctx.fillStyle = '#2a2a2a';
        ctx.beginPath(); ctx.arc(0,0,6,0,Math.PI*2); ctx.fill();
        ctx.fillStyle = dk; ctx.fillRect(-5,-4,10,8);
        ctx.fillStyle = color; ctx.fillRect(-4,-3,8,6);
        // barrel
        ctx.fillStyle = '#1a1a1a'; ctx.fillRect(3,-1.5,12,3);
        ctx.fillStyle = '#111'; ctx.fillRect(3,0.5,12,1.5);
        ctx.fillStyle = lt;
        ctx.beginPath(); ctx.arc(-1,-1,3,0,Math.PI*2); ctx.fill(); // cupola
        ctx.strokeStyle = outlineC; ctx.lineWidth = 1.5; ctx.strokeRect(-7,-6,14,12);
        break;
      }
      /* ─ ARTILLERY ─ */
      case 'artillery': case 'veil_artillery': {
        ctx.fillStyle = shadow;
        ctx.beginPath(); ctx.ellipse(0,7,14,5,0,0,Math.PI*2); ctx.fill();
        ctx.fillStyle = '#2a2a2a';
        ctx.fillRect(-11,-6,4,12); ctx.fillRect(7,-6,4,12);
        ctx.fillStyle = '#3a3a3a';
        for (let ti=-5;ti<7;ti+=2.5) {
          ctx.fillRect(-11,ti,4,1.5); ctx.fillRect(7,ti,4,1.5);
        }
        ctx.fillStyle = dk; ctx.fillRect(-7,-5,14,10);
        ctx.fillStyle = color; ctx.fillRect(-6,-4,12,8);
        ctx.fillStyle = dk; ctx.fillRect(-4,-4,8,8);
        // long barrel
        ctx.fillStyle = '#1a1a1a'; ctx.fillRect(3,-2,19,4);
        ctx.fillStyle = '#2a2a2a'; ctx.fillRect(3,-2,19,2);
        ctx.fillStyle = '#333'; ctx.fillRect(-2,-4,6,8); // breech
        ctx.strokeStyle = outlineC; ctx.lineWidth = 1.5; ctx.strokeRect(-7,-5,14,10);
        break;
      }
      /* ─ ANTI-AIR ─ */
      case 'anti_air': {
        ctx.fillStyle = shadow;
        ctx.beginPath(); ctx.ellipse(0,5,9,3,0,0,Math.PI*2); ctx.fill();
        ctx.fillStyle = '#222';
        for (const [wx,wy] of [[-6,4],[6,4],[-6,-4],[6,-4]]) {
          ctx.beginPath(); ctx.arc(wx,wy,3,0,Math.PI*2); ctx.fill();
        }
        ctx.fillStyle = color; ctx.fillRect(-6,-5,12,10);
        ctx.fillStyle = lt; ctx.fillRect(-5,-5,10,3);
        // twin AA guns
        ctx.strokeStyle = '#333'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-2,-2); ctx.lineTo(-2,-14); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(2,-2); ctx.lineTo(2,-14); ctx.stroke();
        ctx.fillStyle = '#444';
        ctx.beginPath(); ctx.arc(-2,-13,2.5,0,Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(2,-13,2.5,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle = outlineC; ctx.lineWidth = 1; ctx.strokeRect(-6,-5,12,10);
        break;
      }
      /* ─ HELICOPTER / BOMBER ─ */
      case 'helicopter': case 'veil_bomber': {
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.beginPath(); ctx.ellipse(0,13,12,5,0,0,Math.PI*2); ctx.fill();
        ctx.fillStyle = dk;
        ctx.beginPath(); ctx.ellipse(0,0,8,5,0,0,Math.PI*2); ctx.fill();
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.ellipse(-1,-1,6,3.5,0,0,Math.PI*2); ctx.fill();
        ctx.fillStyle = 'rgba(100,185,255,0.7)';
        ctx.beginPath(); ctx.ellipse(3,-1,4,3,0.3,0,Math.PI*2); ctx.fill();
        // spinning rotor
        const ra = (this._frame*0.22)%(Math.PI*2);
        ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ra)*14,Math.sin(ra)*14);
        ctx.lineTo(-Math.cos(ra)*14,-Math.sin(ra)*14); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(Math.cos(ra+Math.PI/2)*14,Math.sin(ra+Math.PI/2)*14);
        ctx.lineTo(-Math.cos(ra+Math.PI/2)*14,-Math.sin(ra+Math.PI/2)*14); ctx.stroke();
        ctx.fillStyle = dk; ctx.fillRect(-14,-2,8,4); // tail boom
        ctx.strokeStyle = '#444'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-14,-4); ctx.lineTo(-14,4); ctx.stroke();
        ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(-6,5); ctx.lineTo(8,5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-4,5); ctx.lineTo(-4,3); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(4,5); ctx.lineTo(4,3); ctx.stroke();
        break;
      }
      /* ─ DRONE ─ */
      case 'drone': case 'veil_drone': {
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.beginPath(); ctx.ellipse(0,10,8,3,0,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle = dk; ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(-9,-9); ctx.lineTo(9,9);
        ctx.moveTo(9,-9); ctx.lineTo(-9,9);
        ctx.stroke();
        ctx.strokeStyle = color; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-8,-8); ctx.lineTo(8,8);
        ctx.moveTo(8,-8); ctx.lineTo(-8,8);
        ctx.stroke();
        for (const [tx,ty] of [[-9,-9],[9,9],[9,-9],[-9,9]]) {
          ctx.fillStyle = '#1a1a1a';
          ctx.beginPath(); ctx.arc(tx,ty,3,0,Math.PI*2); ctx.fill();
        }
        ctx.fillStyle = dk;
        ctx.beginPath(); ctx.arc(0,0,4,0,Math.PI*2); ctx.fill();
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(0,0,3,0,Math.PI*2); ctx.fill();
        ctx.fillStyle = '#0a0a0a';
        ctx.beginPath(); ctx.arc(0,0,2,0,Math.PI*2); ctx.fill();
        ctx.fillStyle = 'rgba(80,140,255,0.85)';
        ctx.beginPath(); ctx.arc(0,0,1,0,Math.PI*2); ctx.fill();
        break;
      }
      /* ─ HARVESTER ─ */
      case 'harvester': {
        ctx.fillStyle = shadow;
        ctx.beginPath(); ctx.ellipse(0,7,13,5,0,0,Math.PI*2); ctx.fill();
        // tracks
        ctx.fillStyle = '#2a2a2a';
        ctx.fillRect(-11,-6,4,12); ctx.fillRect(7,-6,4,12);
        ctx.fillStyle = '#3a3a3a';
        for (let ti=-5;ti<7;ti+=2.5) {
          ctx.fillRect(-11,ti,4,1.5); ctx.fillRect(7,ti,4,1.5);
        }
        // body — wide yellow industrial
        ctx.fillStyle = dk; ctx.fillRect(-7,-5,14,10);
        ctx.fillStyle = color; ctx.fillRect(-6,-4,12,8);
        ctx.fillStyle = lt; ctx.fillRect(-5,-4,10,3);
        // collection arm
        ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(6,0); ctx.lineTo(13,-4); ctx.stroke();
        ctx.fillStyle = '#ddaa22';
        ctx.beginPath(); ctx.arc(13,-4,3,0,Math.PI*2); ctx.fill();
        // IC indicator — small glowing blue light
        ctx.fillStyle = 'rgba(80,180,255,0.9)';
        ctx.beginPath(); ctx.arc(-2,0,2.5,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle = outlineC; ctx.lineWidth = 1.5; ctx.strokeRect(-7,-5,14,10);
        break;
      }
      /* ─ DEFAULT fallback ─ */
      default: {
        ctx.fillStyle = shadow;
        ctx.beginPath(); ctx.ellipse(1,3,7,4,0,0,Math.PI*2); ctx.fill();
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(0,0,6,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle = outlineC; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(0,0,6,0,Math.PI*2); ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(5,0,2,0,Math.PI*2); ctx.fill();
      }
    }
    ctx.restore();
  }

  // ─── FOG ────────────────────────────────────────────────────
  _drawFog(ctx, G) {
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

  // ─── SELECTION ──────────────────────────────────────────────
  _drawSelectionHighlights(ctx, G) {
    for (const e of G.selected) {
      if (e.path !== undefined) {
        // Unit — bright green glow ring
        ctx.strokeStyle = '#44ff44';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#44ff44';
        ctx.shadowBlur = 7;
        ctx.beginPath();
        ctx.arc(e.col * TILE, e.row * TILE, 13, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
        // Dashed movement path
        if (e.path.length > 0) {
          ctx.strokeStyle = 'rgba(68,255,68,0.28)';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(e.col * TILE, e.row * TILE);
          for (const p of e.path) ctx.lineTo((p.col + 0.5) * TILE, (p.row + 0.5) * TILE);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      } else {
        // Building
        ctx.strokeStyle = '#44ff44';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#44ff44';
        ctx.shadowBlur = 8;
        ctx.strokeRect(e.col * TILE + 1, e.row * TILE + 1, e.w * TILE - 2, e.h * TILE - 2);
        ctx.shadowBlur = 0;
      }
    }
    // Sight radius
    for (const e of G.selected) {
      const sight = e.sight || 0;
      if (sight <= 0) continue;
      const cx = (e.col + (e.w ? e.w / 2 : 0)) * TILE;
      const cy = (e.row + (e.h ? e.h / 2 : 0)) * TILE;
      ctx.strokeStyle = 'rgba(68,200,255,0.2)';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.arc(cx, cy, sight * TILE, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // ─── HP BARS ────────────────────────────────────────────────
  _drawHpBars(ctx, G) {
    for (const e of [...G.units, ...G.buildings]) {
      if (e.dead) continue;
      const isUnit = e.path !== undefined;
      const fogIdx = isUnit
        ? Math.floor(e.row) * COLS + Math.floor(e.col)
        : Math.floor(e.row + (e.h||1)/2) * COLS + Math.floor(e.col + (e.w||1)/2);
      if (e.faction !== 'player' && G.fog[fogIdx] !== 1) continue;
      const pct = e.hp / e.maxHp;
      if (pct >= 1) continue;
      const bx = isUnit ? e.col * TILE - 12 : e.col * TILE + 2;
      const by = isUnit ? e.row * TILE - 16  : e.row * TILE - 5;
      const bw = isUnit ? 24 : (e.w||1) * TILE - 4;
      ctx.fillStyle = '#1a1a1a'; ctx.fillRect(bx, by, bw, 4);
      ctx.strokeStyle = '#333'; ctx.lineWidth = 0.5; ctx.strokeRect(bx, by, bw, 4);
      ctx.fillStyle = pct > 0.5 ? '#44cc22' : pct > 0.25 ? '#ccaa22' : '#cc2222';
      ctx.fillRect(bx + 0.5, by + 0.5, (bw - 1) * pct, 3);
    }
  }

  // ─── PARTICLES ──────────────────────────────────────────────
  _drawParticles(ctx, G) {
    for (const p of G.particles) {
      const alpha = p.life / p.maxLife; // 1=fresh → 0=dead
      let r = p.r;
      if (p.type === 'smoke')  r = p.r * (0.4 + (1 - alpha) * 0.6); // smoke grows
      else if (p.type === 'fire') r = p.r * alpha;                    // fire shrinks
      if (r < 0.3) continue;
      ctx.globalAlpha = p.type === 'smoke' ? alpha * 0.55 : alpha;
      ctx.fillStyle = `rgba(${p.rgb},1)`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ─── PROJECTILES ────────────────────────────────────────────
  _drawProjectiles(ctx, G) {
    if (!G.projectiles || G.projectiles.length === 0) return;
    for (const p of G.projectiles) {
      const dx = p.tx - p.x, dy = p.ty - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.1) continue;
      const nx = dx / dist, ny = dy / dist;
      ctx.globalAlpha = 0.9;
      if (p.type === 'bullet') {
        // Short yellow line
        const len = Math.min(dist, p.speed * 0.04);
        ctx.strokeStyle = '#ffe840';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - nx * len, p.y - ny * len);
        ctx.stroke();
      } else if (p.type === 'shell') {
        // Orange circle
        ctx.fillStyle = '#ff7700';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === 'missile') {
        // White dot with small trail
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(200,200,255,0.5)';
        ctx.lineWidth = 2;
        const tlen = Math.min(dist, 18);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - nx * tlen, p.y - ny * tlen);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1;
  }

  // ─── MINIMAP ────────────────────────────────────────────────
  _drawMinimap(G) {
    const mctx = this.mctx;
    mctx.clearRect(0, 0, this.mW, this.mH);
    const tw = this.mW / COLS;
    const th = this.mH / ROWS;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const idx = r * COLS + c;
        if (G.fogOpacity[idx] > 0.9) { mctx.fillStyle = '#000'; }
        else if (G.riverTiles.has(idx)) { mctx.fillStyle = '#1c3a5a'; }
        else if (c < 12) { mctx.fillStyle = '#4a3018'; }
        else if (c > 27) { mctx.fillStyle = '#305218'; }
        else               { mctx.fillStyle = '#384818'; }
        mctx.fillRect(c * tw, r * th, tw, th);
      }
    }
    for (const idx of G.roads) {
      const r2 = Math.floor(idx / COLS), c2 = idx % COLS;
      if (G.fogOpacity[idx] < 0.9) { mctx.fillStyle = '#7a6030'; mctx.fillRect(c2*tw,r2*th,tw,th); }
    }
    for (const b of G.buildings) {
      if (b.dead) continue;
      const fi = Math.floor(b.row + b.h/2) * COLS + Math.floor(b.col + b.w/2);
      if (b.faction !== 'player' && G.fog[fi] !== 1) continue;
      mctx.fillStyle = BUILDING_DEF[b.type].color;
      mctx.fillRect(b.col * tw, b.row * th, b.w * tw, b.h * th);
    }
    for (const u of G.units) {
      if (u.dead) continue;
      const fi = Math.floor(u.row) * COLS + Math.floor(u.col);
      if (u.faction !== 'player' && G.fog[fi] !== 1) continue;
      mctx.fillStyle = u.faction === 'player' ? '#44ff44' : '#ff3333';
      mctx.fillRect(u.col * tw - 1, u.row * th - 1, 2.5, 2.5);
    }
    mctx.strokeStyle = 'rgba(255,255,255,0.55)';
    mctx.lineWidth = 0.5;
    mctx.strokeRect(0, 0, this.mW, this.mH);
  }
}

// ============================================================
// SOUND ENGINE — Procedural Web Audio (no external files)
// ============================================================
class SoundEngine {
  constructor() {
    try {
      this._ac = new (window.AudioContext || window.webkitAudioContext)();
      this._master = this._ac.createGain();
      this._master.gain.value = 0.3;
      this._master.connect(this._ac.destination);
      this._ok = true;
    } catch(e) { this._ok = false; }
  }

  _resume() { if (this._ac && this._ac.state === 'suspended') this._ac.resume(); }

  _noiseBuf() {
    const len = this._ac.sampleRate;
    const buf = this._ac.createBuffer(1, len, this._ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // White noise burst filtered to freq, with volume decay over dur seconds
  _noise(freq, Q, vol, dur, freqEnd) {
    if (!this._ok) return;
    this._resume();
    const ac = this._ac, t = ac.currentTime;
    const src = ac.createBufferSource();
    src.buffer = this._noiseBuf();
    const filt = ac.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.setValueAtTime(freq, t);
    if (freqEnd) filt.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    filt.Q.value = Q;
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filt); filt.connect(g); g.connect(this._master);
    src.start(t); src.stop(t + dur + 0.05);
  }

  // Oscillator tone with freq sweep and volume decay
  _tone(freq, vol, dur, freqEnd, shape = 'square') {
    if (!this._ok) return;
    this._resume();
    const ac = this._ac, t = ac.currentTime;
    const osc = ac.createOscillator();
    osc.type = shape;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g); g.connect(this._master);
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  // ── Public SFX ──
  shootInfantry()  { this._noise(1800 + Math.random()*600, 2.5, 0.35, 0.09); }
  shootVehicle()   { this._noise(700, 1.8, 0.45, 0.13); this._tone(110, 0.25, 0.1, 55); }
  shootTank()      { this._noise(380, 1.2, 0.75, 0.20); this._tone(75, 0.55, 0.18, 38); }
  shootArtillery() { this._noise(280, 1.0, 1.0, 0.28, 75); this._tone(55, 0.7, 0.28, 28); }
  shootAA()        { this._noise(2200, 3, 0.4, 0.06); this._noise(2200, 3, 0.35, 0.06); }
  hit()            { this._noise(1100, 4, 0.25, 0.05); }
  explodeSmall()   { this._noise(480, 0.9, 0.85, 0.38, 55); this._tone(95, 0.45, 0.24, 38); }
  explodeLarge()   { this._noise(320, 0.65, 1.1, 0.65, 38); this._tone(62, 0.75, 0.48, 22); this._tone(38, 0.4, 0.5, 18, 'sawtooth'); }
  buildPlace()     { this._tone(420, 0.28, 0.07); this._tone(640, 0.18, 0.06); }
  uiClick()        { this._tone(780, 0.12, 0.04, 580); }
  alertSound()     { this._tone(860, 0.38, 0.11); this._tone(640, 0.28, 0.11); }
}
const SFX = new SoundEngine();

// ============================================================
// PARTICLE SYSTEM — combat visual effects
// ============================================================

// Spawn muzzle flash sparks at (px,py) aimed at angle
function _spawnMuzzle(G, px, py, angle) {
  for (let i = 0; i < 7; i++) {
    const a = angle + (Math.random() - 0.5) * 0.9;
    const spd = 25 + Math.random() * 70;
    G.particles.push({ x: px, y: py, vx: Math.cos(a)*spd, vy: Math.sin(a)*spd,
      life: 0.07 + Math.random()*0.06, maxLife: 0.13,
      r: 1.5 + Math.random()*2.5, rgb: `255,${160+Math.random()*80|0},20`,
      type: 'spark', grav: 0 });
  }
}

// Spawn hit sparks at impact position
function _spawnHit(G, px, py, isEnemy) {
  const n = 4 + Math.random()*5|0;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const spd = 35 + Math.random() * 90;
    G.particles.push({ x: px, y: py, vx: Math.cos(a)*spd, vy: Math.sin(a)*spd,
      life: 0.12 + Math.random()*0.18, maxLife: 0.3,
      r: 1.2 + Math.random()*2, rgb: isEnemy ? '255,70,15' : '255,190,40',
      type: 'spark', grav: 80 });
  }
}

// Spawn full explosion at (px, py) — size: 'small'|'large'
function _spawnExplosion(G, px, py, size) {
  const big = size === 'large';
  const n = big ? 18 : 10;
  // Fireballs
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const spd = (big ? 65 : 42) + Math.random() * 85;
    const cols = ['255,80,10', '255,145,20', '255,205,50'];
    G.particles.push({ x: px+(Math.random()-.5)*10, y: py+(Math.random()-.5)*10,
      vx: Math.cos(a)*spd, vy: Math.sin(a)*spd,
      life: 0.28 + Math.random()*0.38, maxLife: 0.66,
      r: (big ? 7 : 4) + Math.random()*4,
      rgb: cols[Math.floor(Math.random()*cols.length)],
      type: 'fire', grav: -18 });
  }
  // Smoke puffs
  const ns = big ? 9 : 5;
  for (let i = 0; i < ns; i++) {
    const a = Math.random() * Math.PI * 2;
    const spd = 12 + Math.random() * 28;
    G.particles.push({ x: px, y: py, vx: Math.cos(a)*spd, vy: Math.sin(a)*spd - 22,
      life: 0.55 + Math.random()*0.55, maxLife: 1.1,
      r: (big ? 9 : 5) + Math.random()*5,
      rgb: '75,65,55', type: 'smoke', grav: -28 });
  }
  // Debris chunks
  const nd = big ? 11 : 6;
  for (let i = 0; i < nd; i++) {
    const a = Math.random() * Math.PI * 2;
    const spd = 55 + Math.random() * 130;
    G.particles.push({ x: px, y: py, vx: Math.cos(a)*spd, vy: Math.sin(a)*spd - 35,
      life: 0.35 + Math.random()*0.35, maxLife: 0.7,
      r: 1.8 + Math.random()*2.8,
      rgb: '55,45,35', type: 'debris', grav: 130 });
  }
}

// ============================================================
// PROJECTILE SYSTEM HELPERS
// ============================================================

// Spawn a traveling projectile for ranged combat
function _spawnProjectile(G, shooter, target, def, tx, ty) {
  const projType = def.projType;
  if (!projType) return false; // no projectile — instant damage fallback
  const ax = shooter.col * TILE, ay = shooter.row * TILE;
  G.projectiles.push({
    x: ax, y: ay,
    tx: tx * TILE, ty: ty * TILE,
    damage: def.damage,
    dmgType: def.dmgType || 'small_arms',
    splash: def.splash, splashRange: def.splashRange,
    target,         // ref for on-arrival damage; may die before arrival
    shooter,        // for kill credit
    speed: def.projSpeed || 180,
    type: projType, // 'bullet' | 'shell' | 'missile' | 'laser'
    life: 3.0,      // failsafe TTL
  });
  return true;
}

// Emit continuous damage smoke/fire from wounded entities
function _emitDamageSmoke(G, dt) {
  for (const e of [...G.units, ...G.buildings]) {
    if (e.dead) continue;
    const pct = e.hp / e.maxHp;
    if (pct > 0.5) continue;
    if (!e._smokeTimer) e._smokeTimer = 0;
    e._smokeTimer += dt;
    const rate = pct <= 0.25 ? 0.15 : 0.35;
    if (e._smokeTimer < rate) continue;
    e._smokeTimer = 0;
    const px = (e.col + (e.w ? e.w / 2 : 0)) * TILE;
    const py = (e.row + (e.h ? e.h / 2 : 0)) * TILE;
    if (pct <= 0.25) {
      _spawnHit(G, px, py, e.faction === 'enemy');
    } else {
      G.particles.push({
        x: px + (Math.random() - 0.5) * 8, y: py,
        vx: (Math.random() - 0.5) * 8, vy: -15 - Math.random() * 10,
        life: 0.8 + Math.random() * 0.5, maxLife: 1.3,
        r: 4 + Math.random() * 3, rgb: '160,160,160', type: 'smoke', grav: 0,
      });
    }
  }
}

// Recompute power balance from all player buildings
function _calcPower(G) {
  let total = 0;
  for (const b of G.buildings) {
    if (b.dead || b.faction !== 'player' || b.buildProgress < 1) continue;
    total += BUILDING_DEF[b.type].power || 0;
  }
  G.powerLevel = total;
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
    const overlay = document.getElementById('overlay');
    overlay.innerHTML = `
      <h1>THE CONCEPTION</h1>
      <h2>Intelligence is your most scarce resource.</h2>
      <p style="font-size:12px;color:#4a6a38;max-width:520px;text-align:center;line-height:1.8">Select your mission, Commander.</p>
      <div id="mission-select" style="display:flex;gap:16px;margin:8px 0"></div>
      <p style="font-size:11px;color:#555">Left-click: select &nbsp;|&nbsp; Shift+click: add to selection &nbsp;|&nbsp; Right-click: move &nbsp;|&nbsp; Shift+right-click: queue waypoint &nbsp;|&nbsp; A+Right-click: attack-move &nbsp;|&nbsp; H: hold &nbsp;|&nbsp; G: garrison APC &nbsp;|&nbsp; Right-click building: set rally &nbsp;|&nbsp; Ctrl+1-5: group &nbsp;|&nbsp; B: build &nbsp;|&nbsp; X: airstrike &nbsp;|&nbsp; Esc: pause</p>
    `;
    const ms = overlay.querySelector('#mission-select');
    for (const mission of MISSION_DATA) {
      const card = document.createElement('div');
      card.style.cssText = 'border:1px solid #2a5a18;padding:14px;width:230px;cursor:pointer;background:rgba(0,8,0,0.7);transition:all 0.15s;text-align:left;';
      card.innerHTML = `
        <div style="font-size:13px;color:#88ee44;letter-spacing:2px;margin-bottom:6px">MISSION ${mission.id}</div>
        <div style="font-size:12px;color:#6aaa44;margin-bottom:6px">${mission.title}</div>
        <div style="font-size:10px;color:#4a6a38;line-height:1.6">${mission.subtitle}</div>
        <div style="font-size:9px;color:#3a5a28;margin-top:8px;line-height:1.5">${mission.desc}</div>
        <div style="font-size:9px;color:#ccee44;margin-top:8px">Start IC: ${mission.startIc} &nbsp;|&nbsp; Wave: ${mission.waveInterval}s</div>
      `;
      card.onmouseover = () => { card.style.borderColor = '#44ff22'; card.style.background = 'rgba(20,50,10,0.8)'; };
      card.onmouseout = () => { card.style.borderColor = '#2a5a18'; card.style.background = 'rgba(0,8,0,0.7)'; };
      card.onclick = () => {
        _currentMission = mission;
        overlay.style.display = 'none';
        this.start();
      };
      ms.appendChild(card);
    }
    overlay.style.display = 'flex';
  }

  start() {
    if (this._raf) cancelAnimationFrame(this._raf);
    _nextId = 1;
    this.G = createGameState();
    window.G = this; // expose for UI callbacks
    UI.resetVoice();
    AI.state.buildIndex = 0;
    AI.state.resources = 500;
    AI.state.heaviesUnlocked = false;
    AI.state.tanksUnlocked = false;
    AI.state.waveTimer = _currentMission.waveInterval;
    AI.state.buildQueues = [
      ['veil_barracks','veil_barracks'],
      ['armory','tunnel_entrance','rocket_platform','veil_watch_post'],
      ['veil_depot','veil_workshop','veil_airbase','veil_foundry'],
    ];

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

    _calcPower(G);
    this._updateBuildings(dt);
    AI.tick(G, dt);
    this._updateUnits(dt);
    this._updateProjectiles(dt);
    _emitDamageSmoke(G, dt);
    this._updateFog();
    this._updateParticles(dt);
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
      // radar_station: periodic ping — disabled when grid is underpowered
      if (b.type === 'radar_station') {
        if (G.powerLevel < 0) { b._pingTimer = 20; continue; } // dark — skip
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
      // training — slows by 40% when grid is underpowered
      if (b.trainQueue && b.trainQueue.length > 0) {
        const powerDrain = G.powerLevel < 0 ? 1 / 1.4 : 1.0;
        b.trainTimer -= dt * powerDrain;
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
          if (G.upgrades.field_comms) u.sight += 1;
          if (G.upgrades.ghost_protocol && uType === 'spec_ops') u.damage = Math.round(u.damage * 1.25);
          // Rally point: send to rally if set
          if (b.rallyPoint) {
            const rp = b.rallyPoint;
            const p = _cachedPath(G, Math.floor(u.col), Math.floor(u.row), rp.col, rp.row);
            if (p) u.path = p;
          }
          G.units.push(u);
          if (b.trainQueue.length > 0) {
            const mult = G.upgrades.rapid_training ? 0.8 : 1.0;
            b.trainTimer = UNIT_DEF[b.trainQueue[0]].buildTime * mult;
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

        // Terrain speed modifier
        const tileIdx = Math.floor(u.row) * COLS + Math.floor(u.col);
        let terrainMult = 1.0;
        if (G.roads && G.roads.has(tileIdx)) terrainMult = 1.35;          // road: +35%
        else if (G.features && G.features[tileIdx] === 1) terrainMult = 0.65; // trees: -35%
        else if (G.features && G.features[tileIdx] === 2) terrainMult = 0.75; // rocks: -25%

        const step = u.speed * terrainMult * dt;
        if (dist <= step) {
          u.col = tx; u.row = ty;
          u.path.shift();
          // Dequeue next waypoint when path exhausted
          if (u.path.length === 0 && u.pathQueue && u.pathQueue.length > 0) {
            const nextWp = u.pathQueue.shift();
            const p = _cachedPath(G, Math.floor(u.col), Math.floor(u.row), nextWp.col, nextWp.row);
            if (p) u.path = p;
          }
          // Patrol: loop between two waypoints
          if (u.path.length === 0 && u.patrolPoints && !u.attackTarget) {
            u.patrolIdx = 1 - (u.patrolIdx || 0);
            const wp = u.patrolPoints[u.patrolIdx];
            const p = _cachedPath(G, Math.floor(u.col), Math.floor(u.row), wp.col, wp.row);
            if (p) u.path = p;
          }
          // Dequeue queued attack when path exhausted
          if (u.path.length === 0 && u._queuedAttack && !u._queuedAttack.dead) {
            u.attackTarget = u._queuedAttack;
            u._queuedAttack = null;
          }
        } else {
          u.col += (dx / dist) * step;
          u.row += (dy / dist) * step;
        }
      }

      // Full boid steering: separation + cohesion + alignment
      if (!u.holdPosition) {
        let sepX = 0, sepY = 0;
        let cohX = 0, cohY = 0, cohN = 0;
        let aliVx = 0, aliVy = 0, aliN = 0;
        const SAME_FACTION = u.faction;

        for (const other of G.units) {
          if (other === u || other.dead || other.faction !== SAME_FACTION) continue;
          const sdx = u.col - other.col, sdy = u.row - other.row;
          const sd = Math.hypot(sdx, sdy);

          // Separation (< 0.85 tile)
          if (sd < 0.85 && sd > 0.01) {
            const f = (0.85 - sd) * 1.8;
            sepX += (sdx / sd) * f;
            sepY += (sdy / sd) * f;
          }

          // Cohesion + alignment (only within 3 tiles, only moving units in same group)
          if (sd < 3.0 && sd > 0.01 && other.path.length > 0 && u.path.length > 0) {
            cohX += other.col; cohY += other.row; cohN++;
            // Alignment: estimate velocity from path
            if (other.path.length > 0) {
              const nx = (other.path[0].col + 0.5) - other.col;
              const ny = (other.path[0].row + 0.5) - other.row;
              const nm = Math.hypot(nx, ny);
              if (nm > 0.01) { aliVx += nx / nm; aliVy += ny / nm; aliN++; }
            }
          }
        }

        // Apply separation
        u.col += sepX * dt;
        u.row += sepY * dt;

        // Apply cohesion (gentle drift toward group center, only while moving)
        if (cohN > 0 && u.path.length > 0) {
          const cx = cohX / cohN - u.col, cy = cohY / cohN - u.row;
          const cm = Math.hypot(cx, cy);
          if (cm > 0.5) { // only pull when drifted >0.5 tiles from center
            u.col += (cx / cm) * 0.25 * dt;
            u.row += (cy / cm) * 0.25 * dt;
          }
        }

        // Apply alignment (steer toward average heading, only while moving)
        if (aliN > 0 && u.path.length > 0) {
          const ax = aliVx / aliN, ay = aliVy / aliN;
          u.col += ax * 0.12 * dt;
          u.row += ay * 0.12 * dt;
        }

        u.col = Math.max(0, Math.min(COLS - 0.5, u.col));
        u.row = Math.max(0, Math.min(ROWS - 0.5, u.row));
      }

      const def = UNIT_DEF[u.type];

      // Follow command: re-path toward followed unit every 4 steps
      if (u.followTarget && u.faction === 'player') {
        const ft = G.units.find(u2 => u2.id === u.followTarget && !u2.dead);
        if (ft) {
          const fdist = Math.hypot(ft.col - u.col, ft.row - u.row);
          if (fdist > 1.5 && u.path.length === 0) {
            const p = _cachedPath(G, Math.floor(u.col), Math.floor(u.row),
              Math.floor(ft.col), Math.floor(ft.row));
            if (p) u.path = p.slice(0, 4);
          }
        } else {
          u.followTarget = null;
        }
      }

      // harvester: autonomous seek→harvest→return→unload loop
      if (def.isHarvester && u.faction === 'player') {
        if (!u.harvState) u.harvState = 'seeking';
        if (!u.harvestedIc) u.harvestedIc = 0;
        const CARRY_MAX = 100;

        if (u.harvState === 'seeking') {
          // Find nearest intel_cache with IC remaining
          let bestCache = null, bestDist = Infinity;
          for (const b of G.buildings) {
            if (b.type !== 'intel_cache' || b.dead || (b.icRemaining || 0) <= 0) continue;
            const d = Math.hypot(b.col - u.col, b.row - u.row);
            if (d < bestDist) { bestDist = d; bestCache = b; }
          }
          if (bestCache) {
            u.harvestTarget = bestCache;
            const path = _cachedPath(G, Math.floor(u.col), Math.floor(u.row),
              bestCache.col, bestCache.row);
            if (path) { u.path = path; u.harvState = 'moving_to_cache'; }
          }
        } else if (u.harvState === 'moving_to_cache') {
          if (u.path.length === 0) {
            // arrived — check if target still has IC
            if (u.harvestTarget && !u.harvestTarget.dead && (u.harvestTarget.icRemaining || 0) > 0) {
              u.harvState = 'harvesting';
              u.harvestTimer = 0;
            } else {
              u.harvState = 'seeking';
            }
          }
        } else if (u.harvState === 'harvesting') {
          u.harvestTimer += dt;
          if (u.harvestTimer >= 1.0 && u.harvestTarget && !u.harvestTarget.dead) {
            const amount = Math.min(10, u.harvestTarget.icRemaining || 0, CARRY_MAX - u.harvestedIc);
            u.harvestedIc += amount;
            u.harvestTarget.icRemaining = (u.harvestTarget.icRemaining || 0) - amount;
            u.harvestTimer = 0;
            if (u.harvestedIc >= CARRY_MAX || (u.harvestTarget.icRemaining || 0) <= 0) {
              u.harvState = 'returning';
              // Path back to command base
              const cb = G.buildings.find(b => b.type === 'command_base' && !b.dead);
              if (cb) {
                const path = _cachedPath(G, Math.floor(u.col), Math.floor(u.row),
                  cb.col + 1, cb.row + 1);
                if (path) u.path = path;
              }
            }
          }
        } else if (u.harvState === 'returning') {
          if (u.path.length === 0) {
            // Unload at command base
            G.ic += u.harvestedIc;
            u.harvestedIc = 0;
            u.harvState = 'seeking';
          }
        }
        continue; // harvesters don't auto-attack
      }

      // medic: heal nearby allies
      if (def.healer && u.faction === 'player') {
        for (const ally of G.units) {
          if (ally.dead || ally.faction !== 'player' || ally === u) continue;
          if (Math.hypot(ally.col - u.col, ally.row - u.row) <= 3) {
            ally.hp = Math.min(ally.hp + 5 * dt, ally.maxHp);
          }
        }
      }

      // engineer: repair nearby friendly buildings + capture neutral/enemy buildings
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
        // Capture logic: walk into neutral/damaged-enemy buildings
        if (!repaired) {
          for (const b of G.buildings) {
            if (b.dead || b.faction === 'player') continue;
            const dist = Math.hypot(b.col + b.w / 2 - u.col, b.row + b.h / 2 - u.row);
            if (dist > 1.2) continue;
            if (b.faction === 'neutral') {
              b.faction = 'player';
              G.ic += 50;
              _spawnHit(G, (b.col + b.w / 2) * TILE, (b.row + b.h / 2) * TILE, false);
              break;
            }
            if (b.faction === 'enemy' && b.hp / b.maxHp < 0.35) {
              b.faction = 'player';
              b.hp = Math.round(b.maxHp * 0.25);
              _markGrid(G.grid, b.col, b.row, b.w, b.h, 1);
              _invalidatePathCache(G);
              G.ic += 100;
              _spawnHit(G, (b.col + b.w / 2) * TILE, (b.row + b.h / 2) * TILE, false);
              break;
            }
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

          // ── Muzzle flash ──
          const ax = u.col * TILE, ay = u.row * TILE;
          const bx2 = tx * TILE, by2 = ty * TILE;
          const shotAngle = Math.atan2(by2 - ay, bx2 - ax);
          _spawnMuzzle(G, ax, ay, shotAngle);

          // ── Shoot sound based on unit type ──
          switch (def.label) {
            case 'Tank': case 'Veil Tank': SFX.shootTank(); break;
            case 'Artillery': case 'Veil Artillery': SFX.shootArtillery(); break;
            case 'Anti-Air': SFX.shootAA(); break;
            case 'Scout Vehicle': case 'APC': case 'Veil Raider':
            case 'Veil Troop Truck': SFX.shootVehicle(); break;
            default: SFX.shootInfantry(); break;
          }

          // ── Spawn traveling projectile (or instant hit for units without projType) ──
          const launched = _spawnProjectile(G, u, u.attackTarget, def, tx, ty);
          if (!launched || def.suicideBomber) {
            // Instant damage fallback (melee / suicide bombers)
            const dmgType  = def.dmgType || 'small_arms';
            const armorCls = (UNIT_DEF[u.attackTarget.type] || BUILDING_DEF[u.attackTarget.type])?.armor || 'structure';
            const mult = ARMOR_MULT[dmgType]?.[ARMOR_IDX[armorCls]] ?? 1.0;
            u.attackTarget.hp -= def.damage * mult;
            _spawnHit(G, bx2, by2, u.attackTarget.faction === 'enemy');
            if (def.splash && def.splashRange) {
              _spawnExplosion(G, bx2, by2, def.splashRange >= 2 ? 'large' : 'small');
              for (const other of G.units) {
                if (other === u.attackTarget || other.dead || other.faction === u.faction) continue;
                if (Math.hypot(other.col - tx, other.row - ty) <= def.splashRange) {
                  const aCls = UNIT_DEF[other.type]?.armor || 'infantry';
                  const sm = ARMOR_MULT[dmgType]?.[ARMOR_IDX[aCls]] ?? 1.0;
                  other.hp -= def.damage * 0.5 * sm;
                }
              }
            }
            if (u.attackTarget.hp <= 0) {
              if (u.faction === 'player' && u.attackTarget.path !== undefined) {
                u.kills = (u.kills || 0) + 1;
                const prevStars = u.stars || 0;
                u.stars = u.kills >= 20 ? 3 : u.kills >= 10 ? 2 : u.kills >= 5 ? 1 : 0;
                if (u.stars > prevStars) {
                  const bonus = [0, 1.10, 1.20, 1.35][u.stars];
                  u.damage = Math.round(UNIT_DEF[u.type].damage * bonus);
                  u.maxHp   = Math.round(UNIT_DEF[u.type].hp    * (1 + (u.stars - 1) * 0.08));
                  u.hp = Math.min(u.hp + 20, u.maxHp);
                }
              }
              this._handleDeath(u.attackTarget);
              u.attackTarget = null;
            }
            if (def.suicideBomber) this._handleDeath(u);
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

    // ── Death explosion particles + sound ──
    const isBuilding = entity.w !== undefined;
    const ex = (entity.col + (isBuilding ? entity.w / 2 : 0)) * TILE;
    const ey = (entity.row + (isBuilding ? entity.h / 2 : 0)) * TILE;
    if (isBuilding) {
      _spawnExplosion(G, ex, ey, 'large');
      SFX.explodeLarge();
    } else {
      _spawnExplosion(G, ex, ey, 'small');
      SFX.explodeSmall();
    }

    // Remove from grid if building
    if (isBuilding) {
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

  _updateParticles(dt) {
    const p = this.G.particles;
    for (let i = p.length - 1; i >= 0; i--) {
      const pt = p[i];
      pt.life -= dt;
      if (pt.life <= 0) { p.splice(i, 1); continue; }
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      if (pt.grav) pt.vy += pt.grav * dt;
      pt.vx *= 0.97;
      pt.vy *= 0.97;
    }
  }

  _updateProjectiles(dt) {
    const G = this.G;
    const projs = G.projectiles;
    for (let i = projs.length - 1; i >= 0; i--) {
      const p = projs[i];
      p.life -= dt;
      if (p.life <= 0) { projs.splice(i, 1); continue; }

      const dx = p.tx - p.x, dy = p.ty - p.y;
      const dist = Math.hypot(dx, dy);
      const step = p.speed * dt;

      if (dist <= step + 4) {
        // Arrived — apply damage
        projs.splice(i, 1);
        if (!p.target || p.target.dead) continue; // target died already

        const dmgType  = p.dmgType || 'small_arms';
        const armorCls = (UNIT_DEF[p.target.type] || BUILDING_DEF[p.target.type])?.armor || 'structure';
        const mult = ARMOR_MULT[dmgType]?.[ARMOR_IDX[armorCls]] ?? 1.0;
        p.target.hp -= p.damage * mult;

        _spawnHit(G, p.tx, p.ty, p.target.faction === 'enemy');

        // Splash
        if (p.splash && p.splashRange) {
          _spawnExplosion(G, p.tx, p.ty, p.splashRange >= 2 ? 'large' : 'small');
          const tcol = p.tx / TILE, trow = p.ty / TILE;
          for (const other of G.units) {
            if (other === p.target || other.dead || other.faction === p.shooter.faction) continue;
            if (Math.hypot(other.col - tcol, other.row - trow) <= p.splashRange) {
              const aCls = UNIT_DEF[other.type]?.armor || 'infantry';
              const sm = ARMOR_MULT[dmgType]?.[ARMOR_IDX[aCls]] ?? 1.0;
              other.hp -= p.damage * 0.5 * sm;
              if (other.hp <= 0 && !other.dead) this._handleDeath(other);
            }
          }
        }

        // Kill check
        if (p.target.hp <= 0 && !p.target.dead) {
          // Veterancy kill credit
          const shooter = p.shooter;
          if (shooter && !shooter.dead && shooter.faction === 'player' && p.target.path !== undefined) {
            shooter.kills = (shooter.kills || 0) + 1;
            const prevStars = shooter.stars || 0;
            shooter.stars = shooter.kills >= 20 ? 3 : shooter.kills >= 10 ? 2 : shooter.kills >= 5 ? 1 : 0;
            if (shooter.stars > prevStars) {
              const bonus = [0, 1.10, 1.20, 1.35][shooter.stars];
              shooter.damage = Math.round(UNIT_DEF[shooter.type].damage * bonus);
              shooter.maxHp  = Math.round(UNIT_DEF[shooter.type].hp * (1 + (shooter.stars - 1) * 0.08));
              shooter.hp = Math.min(shooter.hp + 20, shooter.maxHp);
            }
          }
          this._handleDeath(p.target);
          if (p.shooter && p.shooter.attackTarget === p.target) p.shooter.attackTarget = null;
        }
      } else {
        // Move toward target
        p.x += (dx / dist) * step;
        p.y += (dy / dist) * step;
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
    UI.updatePower(G.powerLevel);
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
      const inBox = this.G.units.filter(u =>
        !u.dead && u.faction === 'player' &&
        u.col * TILE >= x1 && u.col * TILE <= x2 &&
        u.row * TILE >= y1 && u.row * TILE <= y2
      );
      if (e.shiftKey) {
        // Shift+drag: add to existing selection (no duplicates)
        const ids = new Set(this.G.selected.map(s => s.id));
        for (const u of inBox) if (!ids.has(u.id)) this.G.selected.push(u);
      } else {
        this.G.selected = inBox;
      }
    } else {
      // Single click — check unit then building
      const clicked = this._entityAt(pos.col, pos.row);
      if (clicked) {
        if (e.shiftKey) {
          // Shift+click: toggle in/out of selection
          const idx = this.G.selected.indexOf(clicked);
          if (idx === -1) this.G.selected = [...this.G.selected, clicked];
          else this.G.selected = this.G.selected.filter((_, i) => i !== idx);
        } else {
          this.G.selected = [clicked];
        }
      } else {
        if (!e.shiftKey) this.G.selected = [];
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

    // Rally point: if a building is the only selected entity, set its rally point
    const selBuildings = G.selected.filter(b => b.w !== undefined && b.faction === 'player' && !b.dead);
    if (selBuildings.length > 0 && playerUnits.length === 0) {
      for (const b of selBuildings) {
        b.rallyPoint = { col: pos.col, row: pos.row };
      }
      // Visual flash at rally target
      _spawnHit(G, pos.col * TILE + TILE / 2, pos.row * TILE + TILE / 2, false);
      SFX.uiClick();
      return;
    }

    if (playerUnits.length === 0) return;

    // Check if right-clicking on an enemy entity to attack
    const target = this._entityAt(pos.col, pos.row);
    if (target && target.faction === 'enemy') {
      for (const u of playerUnits) {
        if (e.shiftKey) {
          // Queue: finish current path then attack
          u._queuedAttack = target;
        } else {
          u.attackTarget = target;
          u.path = [];
          u.holdPosition = false;
          u.attackMoveTarget = null;
        }
      }
      return;
    }

    // Check right-click on friendly APC to unload garrisoned units
    const clickedFriendly = this._entityAt(pos.col, pos.row);
    if (clickedFriendly && clickedFriendly.faction === 'player' && clickedFriendly.type === 'apc') {
      this._unloadAPC(clickedFriendly, pos.col, pos.row);
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

    // Regular move order — shift queues, normal clears
    let anyMoved = false;
    for (let i = 0; i < playerUnits.length; i++) {
      const u = playerUnits[i];
      const offset = _formationOffset(i);
      const tc = Math.max(0, Math.min(COLS - 1, pos.col + offset.dc));
      const tr = Math.max(0, Math.min(ROWS - 1, pos.row + offset.dr));
      if (e.shiftKey) {
        // Shift+right-click: queue a waypoint after the current path
        if (!u.pathQueue) u.pathQueue = [];
        u.pathQueue.push({ col: tc, row: tr });
        anyMoved = true;
      } else {
        const p = _cachedPath(G, Math.floor(u.col), Math.floor(u.row), tc, tr);
        if (p) {
          u.path = p; u.attackTarget = null; u.holdPosition = false;
          u.attackMoveTarget = null; u.pathQueue = [];
          u.patrolPoints = null; u.followTarget = null; // cancel patrol/follow
          anyMoved = true;
        }
      }
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
      case 'g': case 'G':
        if (G.gameState === 'playing') {
          // Load selected infantry into selected APC (or nearest APC)
          const selectedApc = G.selected.find(u => !u.dead && u.type === 'apc' && u.faction === 'player');
          if (selectedApc) {
            this._loadIntoAPC(selectedApc);
          } else {
            // Find nearest friendly APC to any selected unit
            const anyUnit = G.selected.find(u => !u.dead && u.faction === 'player');
            if (anyUnit) {
              const nearApc = G.units.find(u => !u.dead && u.type === 'apc' && u.faction === 'player' &&
                Math.hypot(u.col - anyUnit.col, u.row - anyUnit.row) <= 2.5);
              if (nearApc) this._loadIntoAPC(nearApc);
            }
          }
        }
        break;
      case 'p': case 'P':
        if (G.gameState === 'playing') {
          // Patrol: toggle between current position and the last queued waypoint
          const patrolUnits = G.selected.filter(u => u.faction === 'player' && !u.dead && u.path !== undefined);
          for (const u of patrolUnits) {
            if (u.patrolPoints) {
              // Cancel patrol
              u.patrolPoints = null;
              u.patrolIdx = 0;
            } else if (u.pathQueue && u.pathQueue.length > 0) {
              // Set patrol between current position and first queued waypoint
              const wp = u.pathQueue[0];
              u.patrolPoints = [
                { col: Math.floor(u.col), row: Math.floor(u.row) },
                { col: wp.col, row: wp.row },
              ];
              u.patrolIdx = 0;
              u.pathQueue = [];
              u.path = [];
              // Kick off first leg immediately
              const p = _cachedPath(G, Math.floor(u.col), Math.floor(u.row), wp.col, wp.row);
              if (p) u.path = p;
            }
          }
        }
        break;
      case 'f': case 'F':
        if (G.gameState === 'playing') {
          // Follow: selected units follow the clicked/hovered unit
          // Toggle: if already following, cancel
          const followSel = G.selected.filter(u => u.faction === 'player' && !u.dead && u.path !== undefined);
          // If all already following same target, cancel
          const allFollowing = followSel.every(u => u.followTarget);
          if (allFollowing && followSel.length > 0) {
            for (const u of followSel) { u.followTarget = null; }
          } else {
            // Find the nearest non-selected friendly unit to the selection center
            if (followSel.length > 0) {
              const cx = followSel.reduce((s, u) => s + u.col, 0) / followSel.length;
              const cy = followSel.reduce((s, u) => s + u.row, 0) / followSel.length;
              const selIds = new Set(followSel.map(u => u.id));
              const leader = G.units.find(u2 => !u2.dead && u2.faction === 'player' && !selIds.has(u2.id) &&
                Math.hypot(u2.col - cx, u2.row - cy) <= 4);
              if (leader) {
                for (const u of followSel) {
                  u.followTarget = leader.id;
                  u.patrolPoints = null;
                }
              }
            }
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
    SFX.buildPlace();
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
      const trainMult = G.upgrades.rapid_training ? 0.8 : 1.0;
      building.trainTimer = def.buildTime * trainMult;
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

  // APC garrison: load nearby infantry into selected/clicked APC
  _loadIntoAPC(apc) {
    const G = this.G;
    const CAPACITY = 3;
    if (!apc || apc.type !== 'apc' || apc.dead) return;
    if (apc.loadedUnits.length >= CAPACITY) return;
    // Load selected infantry units within 2 tiles
    const infantry = G.selected.filter(u =>
      u !== apc && !u.dead && u.faction === 'player' && !u.path?.includes && // not another apc
      UNIT_DEF[u.type] && !UNIT_DEF[u.type].flying && u.type !== 'apc' && u.type !== 'harvester' &&
      Math.hypot(u.col - apc.col, u.row - apc.row) <= 2.5
    );
    const toLoad = infantry.slice(0, CAPACITY - apc.loadedUnits.length);
    for (const u of toLoad) {
      u.dead = true; // remove from world — stored inside APC
      apc.loadedUnits.push({ type: u.type, hp: u.hp, maxHp: u.maxHp, damage: u.damage, kills: u.kills, stars: u.stars });
    }
    if (toLoad.length) SFX.uiClick();
  }

  _unloadAPC(apc, col, row) {
    const G = this.G;
    if (!apc || apc.type !== 'apc' || apc.dead || !apc.loadedUnits.length) return;
    const unloaded = [...apc.loadedUnits];
    apc.loadedUnits = [];
    for (let i = 0; i < unloaded.length; i++) {
      const data = unloaded[i];
      const uc = Math.max(0, Math.min(COLS - 1, col + i - 1));
      const ur = Math.max(0, Math.min(ROWS - 1, row));
      const u = createUnit(data.type, uc, ur, 'player');
      u.hp = data.hp; u.maxHp = data.maxHp; u.damage = data.damage;
      u.kills = data.kills || 0; u.stars = data.stars || 0;
      G.units.push(u);
    }
    SFX.uiClick();
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

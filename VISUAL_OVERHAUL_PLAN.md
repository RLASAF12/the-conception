# The Conception — Comprehensive Overhaul Plan

Covers: visual overhaul, gameplay bugs, UI fixes, AI prep. Excludes color palette changes.

---

## Section 1 — UI & Layout Fixes

### 1.1 Sidebar Covers the Game Canvas
**Bug**: The build sidebar (192px, `position: absolute; right: 0; z-index: 20`) overlaps the game canvas because the game container is 1280px wide and the sidebar sits on top of it.

**Fix** (`index.html`):
- When sidebar is visible (`.sidebar-visible`), shrink the canvas rendering viewport or offset the game container left by 192px.
- Option A (recommended): Change `#game-container` to `width: 1280 + 192 = 1472px` when sidebar is open, placing the sidebar outside the canvas.
- Option B: Keep 1280px but add CSS rule `.sidebar-visible #game-canvas { width: calc(100% - 192px); }` so the canvas scales down to make room.
- Also ensure the sidebar `pointer-events: all` doesn't block the canvas when collapsed.

### 1.2 Building Construction Percentage Display
**Current state**: A thin green progress bar (4px) at the bottom of the building sprite (game.js ~line 527). The percentage text only appears in the selection info panel when the building is clicked (ui.js ~line 271).

**Fix** (`game.js`, `_drawBuildings` ~line 527):
After drawing the progress bar, add a centered percentage text label ON the building:
```js
if (b.buildProgress < 1) {
  // Existing progress bar...
  // NEW: percentage text overlay
  const pct = Math.floor(b.buildProgress * 100);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(pct + '%', x + pw/2, y + ph/2 + 4);
}
```
Also make the progress bar thicker (4px → 6px) and add a dark background outline for readability.

---

## Section 2 — Gameplay Bug Fixes

### 2.1 Can't Expand Territory by Building
**Bug**: Player can ONLY build in the hard-coded player zone (`col >= 27` — game.js line ~3207). Building new structures does NOT expand the buildable area. The green territory is fixed.

**Fix** (`game.js`, `_canPlaceAt` ~line 3200 + new territory expansion function):

A. **Dynamic territory system**: Each completed player building radiates a "control zone" of N tiles around it (similar to fog-of-war reveal radius). Tiles within any player building's control zone become buildable.

B. Implementation:
- Add `controlRadius` to building definitions in `entities.js` (e.g., Command Base: 6, Barracks: 3, Forward Post: 5, Power Plant: 2).
- Create `_isInPlayerTerritory(col, row, G)` function:
  ```js
  _isInPlayerTerritory(col, row, G) {
    for (const b of G.buildings) {
      if (b.faction !== 'player' || b.dead || b.buildProgress < 1) continue;
      const def = BUILDING_DEF[b.type];
      const cr = def.controlRadius || 3;
      const dx = col - (b.col + b.w/2), dy = row - (b.row + b.h/2);
      if (dx*dx + dy*dy <= cr*cr) return true;
    }
    return false;
  }
  ```
- Replace the hard-coded `col < 27` check in `_canPlaceAt` with `_isInPlayerTerritory(col, row, G)`.
- Keep the Forward Post exception (can build anywhere revealed).

C. **Visual indicator**: Draw a faint green tint on tiles within player territory so the player can see where they can build. Add to `_drawTerrain`:
  ```js
  // After drawing the base tile, before fog:
  if (_isInPlayerTerritory(c, r, G)) {
    ctx.fillStyle = 'rgba(68, 170, 34, 0.08)';
    ctx.fillRect(x, y, TILE, TILE);
  }
  ```

### 2.2 Trees, Rocks, and Ruins Should Block Building Placement
**Bug**: Trees (`G.features[idx] === 1`), rocks (`=== 2`), and ruins (`=== 3`) are never checked during building placement. Players can place buildings on top of trees.

**Fix** (`game.js`, `_canPlaceAt` ~line 3211):
Add feature check inside the grid validation loop:
```js
for (let dc = 0; dc < w; dc++)
  for (let dr = 0; dr < h; dr++) {
    const idx = (row + dr) * COLS + (col + dc);
    if (G.grid[idx] !== 0) return false;
    if (G.features[idx] !== 0) return false;  // NEW: block on trees/rocks/ruins
  }
```

### 2.3 Trees and Rocks Should Be Pathfinding Obstacles (Slow, Not Block)
**Current state**: Trees slow units by 35% and rocks by 25% (game.js ~line 2088), but pathfinding ignores them entirely (entities.js ~line 628 only checks `grid[nIdx] === 1`).

**Fix** (`entities.js`, `aStarPath` ~line 628):
Make pathfinding AWARE of features by increasing movement cost through them (not blocking):
- Pass `features` array as an additional parameter to `aStarPath`
- Modify the cost calculation:
  ```js
  let moveCost = cost; // base cost (1.0 or SQRT2 for diagonal)
  if (features) {
    const feat = features[nIdx];
    if (feat === 1) moveCost *= 2.0;   // trees: much more expensive to path through
    if (feat === 2) moveCost *= 1.8;   // rocks: expensive
    if (feat === 3) moveCost *= 1.3;   // ruins: slightly expensive
  }
  const ng = gCost[cur] + moveCost;
  ```
- Update all callers of `aStarPath` to pass `G.features`.
- This means units will naturally prefer roads and open ground but CAN go through trees if needed.

### 2.4 Clear Building on Features (Auto-Clear)
When a building IS placed on a tile with features (after 2.2 fix prevents it), also clear features when an engineer builds a road or when we explicitly allow clearing:
- Add an "engineer clear" ability: right-click engineer on a tree/rock tile to remove the feature and make it buildable.

---

## Section 3 — Visual Overhaul (Isometric Projection)

### 3.1 New Constants (`entities.js`)
```js
const ISO_W = 40;          // iso tile width in screen pixels
const ISO_H = 20;          // iso tile height (always ISO_W / 2)
const ISO_OX = ROWS * ISO_W / 2;  // = 600 — horizontal origin
const ISO_OY = 40;         // vertical top margin
const CANVAS_W = 1400;     // updated from 1280
const CANVAS_H = 900;      // updated from 840
```

### 3.2 `_isoXY(col, row)` Helper (Renderer class)
Central projection function used by ALL rendering code:
```js
_isoXY(col, row) {
  return {
    x: (col - row) * (ISO_W / 2) + ISO_OX,
    y: (col + row) * (ISO_H / 2) + ISO_OY,
  };
}
```
Diamond vertices for tile (col, row):
- top: `(x, y)`, right: `(x+ISO_W/2, y+ISO_H/2)`, bottom: `(x, y+ISO_H)`, left: `(x-ISO_W/2, y+ISO_H/2)`

### 3.3 Inverse Transform — `_canvasPos` (~line 2817)
Replace floor-divide-by-TILE with iso inverse:
```js
_canvasPos(e) {
  const rect = this.canvas.getBoundingClientRect();
  const sx = (e.clientX - rect.left) * (this.canvas.width / rect.width);
  const sy = (e.clientY - rect.top)  * (this.canvas.height / rect.height);
  const dx = sx - ISO_OX, dy = sy - ISO_OY;
  const col = Math.floor((dx / (ISO_W/2) + dy / (ISO_H/2)) / 2);
  const row = Math.floor((dy / (ISO_H/2) - dx / (ISO_W/2)) / 2);
  return { x: sx, y: sy,
    col: Math.max(0, Math.min(COLS-1, col)),
    row: Math.max(0, Math.min(ROWS-1, row)),
  };
}
```

### 3.4 Canvas Element (`index.html`)
Update `<canvas>` to `width="1400" height="900"`. Update `#game-container` width accordingly.

---

## Section 4 — Isometric Terrain Rendering

### 4.1 Painter's Algorithm (back-to-front)
Replace nested `r/c` loop with diagonal sweep:
```js
for (let d = 0; d < COLS + ROWS - 1; d++) {
  for (let c = Math.max(0, d-ROWS+1); c <= Math.min(COLS-1, d); c++) {
    const r = d - c;
    // draw tile (c, r)
  }
}
```

### 4.2 Diamond Tile Helper — `_drawIsoDiamond(ctx, col, row, fillStyle)`
Draws a filled iso diamond at the given grid position.

### 4.3 Water, Bridge, Road in Iso
- **Water**: Diamond fill + clipped animated ripple lines
- **Bridge**: Diamond in wood color + diagonal plank stripes
- **Road**: Diamond base + faint center-stripe along major iso axis

### 4.4 Per-Tile Procedural Texture
After the base diamond, add seeded deterministic noise:
- Grass: 2–3 dark-green tufts (tiny ellipses)
- Dirt: 2–3 pebble dots (warm gray)
- Seed: `col * 1000 + row` through simple LCG

### 4.5 Decorative Features in Iso
- **Trees**: shadow ellipse at ground, trunk, round canopy offset up by `~ISO_H*2`
- **Rocks**: 3D wedge with top face + south side (darker)
- **Ruins**: partial-height stone walls with iso side faces

### 4.6 Fog as Iso Diamonds
Replace `fillRect` in `_drawFog` with `_drawIsoDiamond` per tile.

---

## Section 5 — 3D Procedural Buildings

### 5.1 Building Height Constants (`entities.js`)
Add `isoHeight` to each `BUILDING_DEF` entry:
- Walls: `isoHeight: 12`
- Bunker, Forward Post: `isoHeight: 16`
- Barracks, Hospital, Field Ops: `isoHeight: 24`
- Command Base, Motor Pool: `isoHeight: 36`
- Watchtower, Comms Tower: `isoHeight: 44`
- Power Plant: `isoHeight: 40`

### 5.2 Depth-Sort Buildings
Sort `G.buildings` by `b.col + b.row` ascending before rendering.

### 5.3 Three-Layer 3D Shape
For every building, draw in order:
1. **East side wall** — `_darken(baseColor, 40)` parallelogram (right face)
2. **South side wall** — `_darken(baseColor, 60)` parallelogram (front face)
3. **Top face** — normal base color iso diamond at height offset

### 5.4 Building-Specific Top Face Features
Move existing detail (antenna, windows, radar dish, etc.) onto the top face only, centered at `(isoX, isoY - isoHeight + ISO_H/2)`.

### 5.5 Faction Flag
Small triangular flag above each building's peak in faction color (green=player, red=enemy).

### 5.6 Multi-Tile Footprint (2×2)
Top face spans the full 2×2 rhombus. Side walls scale proportionally.

### 5.7 Construction Scaffold Visual
While `buildProgress < 1`:
- Draw the building at reduced opacity (0.4)
- Overlay a scaffold pattern (diagonal crosshatch lines)
- Show the percentage text centered on the building (from Section 1.2)

---

## Section 6 — Unit Token Rendering

### 6.1 Unified Token Style (replaces all per-type drawings)
Every unit rendered as:
1. **Ground shadow** — dark semi-transparent ellipse, offset right+down
2. **Faction ring** — filled circle (player=blue, enemy=crimson), radius 12px
3. **Inner gradient** — radial gradient: light top-left → dark bottom-right
4. **Type abbreviation** — 2-letter code centered in white, bold 8px
5. **Facing dot** — small triangle at ring edge showing direction

### 6.2 Drone Exception — Distinct Visual
Drones get a special token shape to stand out:
- **Hexagonal outline** instead of circle
- **Propeller animation**: 4 small rotating lines at corners (simplified from current)
- **Blue glow center**: pulsing blue dot in the middle
- Clearly labeled "DR" in the center

### 6.3 Vehicle vs Infantry Distinction
- **Infantry tokens**: circular (radius 10)
- **Vehicle tokens**: rounded rectangle (16×12)
- **Air units (drone/helicopter)**: hexagonal with subtle shadow offset (looks "floating")

### 6.4 Depth-Sort Units
Sort by `col + row` ascending before rendering.

### 6.5 HP Bars Above Iso Position
Reposition to `_isoXY(e.col, e.row).y - 18`.

---

## Section 7 — UI Overlays in Iso

### 7.1 Selection Ring (Units)
Circle centered at `_isoXY(e.col, e.row)`.

### 7.2 Selection Box (Buildings)
Iso rhombus outline matching the building's top face.

### 7.3 Movement Path Dashes
Use `_isoXY(p.col + 0.5, p.row + 0.5)` for each waypoint.

### 7.4 Sight Radius
Iso ellipse: `rx = sight * ISO_W/2`, `ry = rx * (ISO_H/ISO_W)`.

### 7.5 Territory Boundary Glow
Faint green border glow around the edge tiles of player territory (from Section 2.1).

### 7.6 Minimap
Keep as top-down — no iso transform (strategic overview stays simple).

---

## Section 8 — Enemy AI Improvements & AI API Prep

### 8.1 Current AI Assessment
The enemy AI (ai.js) already has:
- Multi-building unit production (8+ building types)
- FSM unit states (IDLE, PATROL, ASSAULT, RETREAT, GUARD)
- Coordinated wave attacks every 90s with flank detection
- Build phase progression

**Observed problem**: Early game feels like "one drone at a time" because:
- The first AI building (veil_airbase) trains drones slowly
- Wave timer is 90s — very long for early game
- Only units near the border (col < 16) join waves

### 8.2 Early Game AI Improvements (`ai.js`)
- **Reduce initial wave timer** from 90s to 60s for phase 1
- **Early harassment**: Have 1–2 veil_scouts probe player territory within the first 60 seconds
- **Vary attack angles**: Don't always target the same tile — pick from 3–4 approach routes randomly
- **Build faster in early phases**: Reduce phase 0 → phase 1 transition from current timer

### 8.3 AI API Plugin System (Preparation)
Create a new file `ai_plugin.js` with an interface for external AI decision-making:

```js
// ai_plugin.js — API-powered enemy AI decisions
const AIPlugin = {
  enabled: false,
  apiEndpoint: null,  // proxy URL, set by user
  apiKey: null,       // set via config

  // Called each wave decision point
  async getWaveStrategy(gameState) {
    if (!this.enabled || !this.apiEndpoint) return null;
    const snapshot = {
      playerUnits: gameState.playerUnits.map(u => ({type:u.type, col:u.col, row:u.row, hp:u.hp})),
      enemyUnits:  gameState.enemyUnits.map(u => ({type:u.type, col:u.col, row:u.row, hp:u.hp})),
      playerBuildings: gameState.playerBuildings.map(b => ({type:b.type, col:b.col, row:b.row})),
      enemyBuildings:  gameState.enemyBuildings.map(b => ({type:b.type, col:b.col, row:b.row})),
      phase: gameState.phase,
      elapsed: gameState.elapsed,
    };
    try {
      const res = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.apiKey}` },
        body: JSON.stringify({ action: 'wave_strategy', state: snapshot }),
      });
      return await res.json(); // { targets: [{col, row}], unitTypes: ['veil_tank', ...], flank: 'north'|'south'|'center' }
    } catch(e) { return null; }
  },

  // Called each build decision point
  async getBuildOrder(gameState) { /* similar pattern */ },
};
```

- Hook into `ai.js` `_launchWave()`: before the default logic, call `await AIPlugin.getWaveStrategy()`. If it returns a strategy, use it; otherwise fall back to the existing hard-coded logic.
- Add a settings panel entry in the UI to enable/disable AI plugin and set the proxy URL.

---

## Section 9 — Kenney Sprite Integration

### 9.1 Current State
The sprite system (`sprites/sprites.js`) is fully built with a `SPRITE_MAP` mapping 40+ keys to PNG paths in `sprites/buildings/`, `sprites/units/`, `sprites/terrain/`. All directories are **empty** — the system gracefully falls back to procedural drawing.

### 9.2 Plan
Since we can't download Kenney assets automatically, the plan is:
- **Keep the procedural drawing as primary renderer** (what we're improving in Sections 4–6)
- **Enhance `sprites.js` SPRITE_MAP** to include more granular keys per building state (e.g., `command_base:player:building`, `command_base:player:complete`)
- **Add a sprite drop guide** in README: list exactly which Kenney packs to download and which PNGs to rename/place where
- **When sprites ARE present**, the system already uses them via `GameSprites.get(key)` — no code changes needed

### 9.3 Procedural Sprites as Fallback Enhancement
For each building type, make the procedural drawing more distinctive:
- **Unique silhouette per building type** — current code already does this with 21 cases, but at small tile sizes (32px) they look similar. With iso tiles (40px wide), there's more room.
- **Animate under-construction buildings** differently from complete ones
- **Add building name label** when zoomed in or when building is selected

---

## Execution Order

| Step | Section | What | Files | Risk |
|------|---------|------|-------|------|
| 1 | 1.1 | Fix sidebar overlap | `index.html` | Low |
| 2 | 2.2 | Block building on features | `game.js` | Low |
| 3 | 2.3 | Feature-aware pathfinding | `entities.js`, `game.js` | Medium |
| 4 | 2.1 | Dynamic territory expansion | `game.js`, `entities.js` | Medium |
| 5 | 1.2 + 5.7 | Construction % display + scaffold | `game.js` | Low |
| 6 | 3.1–3.4 | Iso constants + helper + canvas | `entities.js`, `index.html`, `game.js` | Medium |
| 7 | 4.1–4.6 | Iso terrain + fog | `game.js` | Medium |
| 8 | 5.1–5.6 | 3D buildings | `entities.js`, `game.js` | High |
| 9 | 6.1–6.5 | Unit tokens | `game.js` | Medium |
| 10 | 7.1–7.6 | UI overlays in iso | `game.js` | Low |
| 11 | 8.2 | AI early-game improvements | `ai.js` | Low |
| 12 | 8.3 | AI API plugin skeleton | `ai_plugin.js`, `ai.js`, `index.html` | Low |

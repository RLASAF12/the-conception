# Visual Overhaul Plan — Kingshot-Vibe

## Goal
Transform the flat 2D top-down view into an isometric 2.5D look with:
1. **Isometric projection** — tiles as diamonds, full perspective shift
2. **3D-look procedural buildings** — top face + side walls per building
3. **Unit tokens with shadow** — chunky circles with depth cues
4. **Terrain texture** — procedural noise patterns per tile type

No changes to game mechanics, fog of war logic, AI, pathfinding, or color palette.

---

## Phase 1 — Isometric Infrastructure
*Files: `entities.js`, `game.js` (Renderer constructor + `_canvasPos` + `drawFrame`)*

### 1.1 New constants (`entities.js`)
Add alongside existing `TILE`, `COLS`, `ROWS`:
```
ISO_W = 40          // screen width of one iso tile diamond
ISO_H = 20          // screen height of one iso tile diamond (always ISO_W / 2)
ISO_OX = ROWS * ISO_W / 2   // = 600 — horizontal origin (top-center of grid)
ISO_OY = 40         // vertical top margin in pixels
CANVAS_W = 1400     // updated from 1280
CANVAS_H = 900      // updated from 840
```

### 1.2 `_isoXY(col, row)` helper (`game.js`, Renderer class)
Central projection function used by ALL rendering code:
```js
_isoXY(col, row) {
  return {
    x: (col - row) * (ISO_W / 2) + ISO_OX,
    y: (col + row) * (ISO_H / 2) + ISO_OY,
  };
}
```
The top vertex of the diamond at grid position (col, row) is at this screen point.
The full diamond:
- top:    `{ x,          y             }`
- right:  `{ x + ISO_W/2, y + ISO_H/2 }`
- bottom: `{ x,          y + ISO_H     }`
- left:   `{ x - ISO_W/2, y + ISO_H/2 }`

### 1.3 Inverse transform — `_canvasPos` (`game.js`, line ~2817)
Replace the current floor-divide by TILE with iso inverse:
```js
_canvasPos(e) {
  const rect = this.canvas.getBoundingClientRect();
  const sx = (e.clientX - rect.left) * (this.canvas.width  / rect.width);
  const sy = (e.clientY - rect.top)  * (this.canvas.height / rect.height);
  const dx = sx - ISO_OX, dy = sy - ISO_OY;
  const col = Math.floor((dx / (ISO_W / 2) + dy / (ISO_H / 2)) / 2);
  const row = Math.floor((dy / (ISO_H / 2) - dx / (ISO_W / 2)) / 2);
  return { x: sx, y: sy,
    col: Math.max(0, Math.min(COLS - 1, col)),
    row: Math.max(0, Math.min(ROWS - 1, row)),
  };
}
```

### 1.4 Canvas element (`index.html`)
Change `width="1280" height="840"` → `width="1400" height="900"` on the `<canvas>` element.

### 1.5 `drawFrame` clearRect
Update `ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)` — will pick up automatically since CANVAS_W/H change.

---

## Phase 2 — Isometric Terrain Rendering
*File: `game.js`, `_drawTerrain` (~line 361)*

### 2.1 Painter's algorithm order
Replace the nested `r/c` loop with a depth-sorted diagonal sweep:
```js
for (let d = 0; d < COLS + ROWS - 1; d++) {
  const cStart = Math.max(0, d - ROWS + 1);
  const cEnd   = Math.min(COLS - 1, d);
  for (let c = cStart; c <= cEnd; c++) {
    const r = d - c;
    // draw tile (c, r)
  }
}
```
This renders tiles back-to-front so buildings and units in front always occlude those behind.

### 2.2 Diamond tile drawing helper
Add `_drawIsoDiamond(ctx, col, row, fillStyle)`:
```js
const {x, y} = this._isoXY(col, row);
ctx.beginPath();
ctx.moveTo(x,            y           );   // top
ctx.lineTo(x + ISO_W/2,  y + ISO_H/2);   // right
ctx.lineTo(x,            y + ISO_H   );   // bottom
ctx.lineTo(x - ISO_W/2,  y + ISO_H/2);   // left
ctx.closePath();
ctx.fillStyle = fillStyle;
ctx.fill();
```

### 2.3 Water tiles — iso animated ripples
Draw diamond, then clip to diamond path and draw horizontal ripple lines clipped inside.

### 2.4 Bridge planks — iso style
Draw diamond in wood color, then draw diagonal plank stripes in iso perspective.

### 2.5 Terrain texture (procedural per-tile noise)
After drawing the base diamond color, add per-tile deterministic detail:
- Compute a per-tile seed: `seed = col * 1000 + row`; use a simple LCG for 2–4 random positions
- **Grass tiles**: 2–3 small dark-green tufts (2×2 ellipses) at seeded positions inside the diamond
- **Dirt/enemy tiles**: 2–3 small pebble dots (1×1 ellipses, warm gray) at seeded positions
- **Road tiles**: draw a faint center-stripe along the tile's major iso axis

### 2.6 Decorative features in iso
Re-draw trees, rocks, ruins using `_isoXY` for their base position:
- **Trees**: base ellipse (shadow) at ground level, trunk rect offset up, round canopy above — all positioned relative to iso tile center. Height offset: ~`-ISO_H * 2`
- **Rocks**: draw top face + one visible south side face (darker) — like a mini 3D wedge
- **Ruins**: draw partial-height stone walls using iso side-face technique (see Phase 3)

---

## Phase 3 — Isometric Fog Rendering
*File: `game.js`, `_drawFog` (~line 1465)*

Replace `ctx.fillRect` with diamond polygon:
```js
_drawFog(ctx, G) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const op = G.fogOpacity[r * COLS + c];
      if (op <= 0.01) continue;
      ctx.globalAlpha = op;
      ctx.fillStyle = '#000';
      this._drawIsoDiamond(ctx, c, r, '#000');   // reuse helper, but set alpha before
    }
  }
  ctx.globalAlpha = 1;
}
```
*(Painter's order within fog is less critical since all fog tiles are the same color)*

---

## Phase 4 — 3D Procedural Buildings
*Files: `entities.js` (height values), `game.js` (`_drawBuildings` + `_drawBuildingShape`)*

### 4.1 Add `isoHeight` to building definitions (`entities.js`)
Add a `isoHeight` field (in screen pixels) to each entry in `BUILDING_DEF`:
- Small 1×1 buildings (bunker, wall): `isoHeight: 16`
- Medium 1×1 buildings (barracks, watchtower): `isoHeight: 28`
- Large 2×2 buildings (command_base, motor_pool): `isoHeight: 40`
- Towers/comms: `isoHeight: 48`

### 4.2 Depth-sort buildings in `_drawBuildings`
Before iterating, sort `G.buildings` by `b.col + b.row` ascending (painter's algorithm).

### 4.3 3D building shape approach in `_drawBuildingShape`
For every building, the 3D look is constructed from three layers drawn in order:

**A. East side wall** (right face, darker shade)
Vertices (for a 1×1 building at iso position):
```
top-right of footprint  → (isoX + ISO_W/2,  isoY - h + ISO_H/2)  [top corner]
bottom-right            → (isoX,            isoY - h + ISO_H    )  [going down]
ground bottom-right     → (isoX,            isoY + ISO_H        )  [ground right]
ground right            → (isoX + ISO_W/2,  isoY + ISO_H/2      )  [ground corner]
```
Fill with `_darken(baseColor, 40)`.

**B. South side wall** (front face, darkest shade)
Vertices:
```
bottom-left of footprint → (isoX - ISO_W/2,  isoY - h + ISO_H/2)
bottom                   → (isoX,            isoY - h + ISO_H   )
ground bottom            → (isoX,            isoY + ISO_H       )
ground left              → (isoX - ISO_W/2,  isoY + ISO_H/2     )
```
Fill with `_darken(baseColor, 60)`.

**C. Top face** (roof — iso diamond at height h above ground)
Same as `_drawIsoDiamond` but with `y - isoHeight` offset:
```
_isoXY adjusted upward by isoHeight pixels
```
Fill with the building's normal base color.

**D. Building features** (drawn on the top face only)
All existing building-specific details (antenna, windows, doors, etc.) move to draw on the top face — re-centered to the top-face diamond center at `(isoX, isoY - isoHeight + ISO_H/2)`.

**E. Colored flag/banner** (new for all buildings)
A small triangular flag above the building's highest point, in faction color:
- Pole: vertical line from top vertex of roof up by 8px
- Triangle: small filled triangle (faction color) at the top

### 4.4 Multi-tile buildings (2×2 footprint)
For buildings with `size: [2, 2]`:
- The top face footprint is an iso rhombus spanning 2 tiles wide and 2 tiles deep
- Top face vertices:
  ```
  top:    _isoXY(col,     row    ) → adjusted up by h
  right:  _isoXY(col + 2, row    ) → adjusted up by h
  bottom: _isoXY(col + 2, row + 2) → adjusted up by h
  left:   _isoXY(col,     row + 2) → adjusted up by h
  ```
- Side walls scale proportionally

### 4.5 HP bars and progress bars
Update to position above the building's top face:
- Use `_isoXY(b.col + b.w/2, b.row + b.h/2)` as center, then offset upward by `isoHeight + 12`

---

## Phase 5 — Unit Tokens with Shadow
*File: `game.js`, `_drawUnits` + `_drawUnitSprite` (~line 995)*

### 5.1 Unit position in iso
Units have float `col`/`row` positions. Replace `e.col * TILE, e.row * TILE` with:
```js
const {x, y} = this._isoXY(e.col, e.row);
```

### 5.2 Depth-sort units
Before the render loop: `[...G.units].sort((a,b) => (a.col+a.row) - (b.col+b.row))`

### 5.3 New `_drawUnitSprite` — token style
Remove all the detailed per-type procedural infantry/vehicle drawings.
Replace with a unified token approach for all unit types:

```
1. Ground shadow — dark semi-transparent ellipse, slightly offset right+down
   ctx.fillStyle = 'rgba(0,0,0,0.35)'
   ctx.ellipse(x+3, y+4, 10, 5, 0, 0, Math.PI*2)

2. Faction ring — filled circle in faction color (blue=player, crimson=enemy)
   radius = 12px

3. Inner fill — radial gradient: light top-left to dark bottom-right
   gradient from rgba(255,255,255,0.3) at (x-4, y-4) to faction color darkened

4. Type icon — 2-letter abbreviation drawn centered in white, font size 8px bold
   (reuse existing type badge abbreviation from badges system)

5. Facing indicator — small filled triangle at the edge of the ring pointing in
   the unit's current facing direction (e.angle)
```

### 5.4 Veterancy, garrison badges
Keep existing veterancy stars and APC passenger count, just re-positioned relative to iso unit center.

### 5.5 Unit HP bars
Reposition to `y - 18` above iso unit center (instead of `row * TILE - 5`).

---

## Phase 6 — Fix UI Overlays
*File: `game.js`, `_drawSelectionHighlights` + `_drawHpBars`*

### 6.1 Selection ring (units)
Arc center: `_isoXY(e.col, e.row)` — circle stays circular (not ellipse) for simplicity.

### 6.2 Selection box (buildings)
Replace `strokeRect` with iso rhombus outline matching the building footprint's top face:
```
Use the same 4 top-face vertices as Phase 4.4 but just stroke, don't fill
```

### 6.3 Movement path dashes
Replace `(p.col + 0.5) * TILE` with `_isoXY(p.col + 0.5, p.row + 0.5)`.

### 6.4 Sight radius circle
Replace circle arc with iso ellipse:
```js
const {x, y} = this._isoXY(e.col, e.row);
const rx = (e.sight || 5) * ISO_W / 2;
const ry = rx * (ISO_H / ISO_W);
ctx.ellipse(x, y + ISO_H/2, rx, ry, 0, 0, Math.PI * 2);
```

---

## Phase 7 — Minimap
*File: `game.js`, `_drawMinimap` (~line 1609)*

Keep minimap as top-down (no iso transform here — it's a strategic overview).
No changes needed.

---

## Execution Order

| Step | Phase | Scope | Risk |
|------|-------|-------|------|
| 1 | Constants + canvas size | `entities.js`, `index.html` | Low |
| 2 | `_isoXY` helper + `_canvasPos` inverse | `game.js` | Medium (input breaks until done) |
| 3 | `_drawTerrain` rewrite | `game.js` | Low |
| 4 | `_drawFog` rewrite | `game.js` | Low |
| 5 | Building height constants | `entities.js` | Low |
| 6 | `_drawBuildingShape` 3D rewrite | `game.js` | Medium |
| 7 | `_drawBuildings` depth sort + positions | `game.js` | Low |
| 8 | `_drawUnitSprite` token rewrite | `game.js` | Low |
| 9 | `_drawUnits` depth sort + iso positions | `game.js` | Low |
| 10 | `_drawSelectionHighlights` + HP bars | `game.js` | Low |

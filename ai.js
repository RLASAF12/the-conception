// ============================================================
// AI.JS — Enemy (Veil) AI logic
// ============================================================

const AI = (() => {
  // Preset build order for enemy
  const BUILD_ORDER = [
    'veil_barracks', 'veil_barracks', 'armory', 'tunnel_entrance', 'rocket_platform',
  ];

  // Internal AI state
  const state = {
    buildIndex: 0,
    resources: 500, // enemy doesn't use IC, uses internal counter
    raidGroups: [],
    assaultTriggered: false,
    heaviesUnlocked: false,
    droneDeathCooldown: 0,
  };

  function tick(G, dt) {
    state.resources += 20 * dt; // enemy gains resources over time

    _build(G);
    _train(G, dt);
    _moveUnits(G, dt);
    _raidLogic(G);
    if (state.droneDeathCooldown > 0) state.droneDeathCooldown -= dt;

    // unlock heavies at 8 minutes
    if (G.elapsedTime >= 480 && !state.heaviesUnlocked) {
      const armory = G.buildings.find(b => b.type === 'armory' && b.faction === 'enemy' && !b.dead);
      if (armory) {
        state.heaviesUnlocked = true;
        UI.voice('enemy_armory_found_8min');
      }
    }
  }

  function _build(G) {
    if (state.buildIndex >= BUILD_ORDER.length) return;
    if (state.resources < 300) return;

    const type = BUILD_ORDER[state.buildIndex];
    const def = BUILDING_DEF[type];
    const [w, h] = def.size;

    // find empty spot near enemy base (left side cols 2-11)
    for (let attempt = 0; attempt < 30; attempt++) {
      const col = 2 + Math.floor(Math.random() * 9);
      const row = 2 + Math.floor(Math.random() * 26);
      if (_canPlace(G, col, row, w, h)) {
        const b = createBuilding(type, col, row, 'enemy');
        b.buildProgress = 1; // enemy builds instantly for v1 simplicity
        G.buildings.push(b);
        _markGrid(G, col, row, w, h, 1);
        state.resources -= 300;
        state.buildIndex++;
        return;
      }
    }
  }

  function _train(G, dt) {
    const barracks = G.buildings.filter(b =>
      b.faction === 'enemy' && !b.dead && b.buildProgress >= 1 &&
      (b.type === 'veil_barracks' || b.type === 'armory' || b.type === 'tunnel_entrance')
    );

    for (const b of barracks) {
      b.trainTimer -= dt;
      if (b.trainTimer <= 0) {
        let unitType = 'veil_soldier';
        if (b.type === 'armory' && state.heaviesUnlocked) unitType = 'veil_heavy';
        if (b.type === 'tunnel_entrance') unitType = 'infiltrator';
        else if (Math.random() < 0.3 && state.resources > 100) unitType = 'veil_raider';

        // Infiltrators spawn near player settlements
        let spawnCol = b.col + 1, spawnRow = b.row + 1;
        if (unitType === 'infiltrator') {
          const settle = G.buildings.filter(s => s.type === 'settlement' && !s.dead);
          if (settle.length) {
            const s = settle[Math.floor(Math.random() * settle.length)];
            spawnCol = s.col + Math.floor(Math.random() * 4) - 2;
            spawnRow = s.row + Math.floor(Math.random() * 4) - 2;
            spawnCol = Math.max(0, Math.min(COLS - 1, spawnCol));
            spawnRow = Math.max(0, Math.min(ROWS - 1, spawnRow));
          }
        }

        const u = createUnit(unitType, spawnCol, spawnRow, 'enemy');
        G.units.push(u);
        b.trainTimer = UNIT_DEF[unitType].buildTime + Math.random() * 5;
      }
    }
  }

  function _moveUnits(G, dt) {
    const enemyUnits = G.units.filter(u => u.faction === 'enemy' && !u.dead);
    const idleUnits = enemyUnits.filter(u => u.path.length === 0 && !u.attackTarget);

    for (const u of idleUnits) {
      // Decide target
      let target = null;

      const def = UNIT_DEF[u.type];
      if (def.targetCommandBase) {
        const cb = G.buildings.find(b => b.type === 'command_base' && !b.dead);
        if (cb) target = { col: cb.col + 0.5, row: cb.row + 0.5 };
      } else if (def.prioritizeSettlements) {
        const settle = _nearestBuilding(u, G.buildings.filter(b =>
          b.type === 'settlement' && !b.dead));
        if (settle) target = { col: settle.col + 0.5, row: settle.row + 0.5 };
      } else if (def.spawnInsidePerimeter) {
        const settle = _nearestBuilding(u, G.buildings.filter(b =>
          (b.type === 'settlement' || b.type === 'command_base') && !b.dead));
        if (settle) target = { col: settle.col + 0.5, row: settle.row + 0.5 };
      } else {
        // general: march toward player territory
        // pick a random settlement or march east
        const targets = G.buildings.filter(b =>
          b.faction !== 'enemy' && !b.dead &&
          (b.type === 'settlement' || b.type === 'barracks' || b.type === 'command_base')
        );
        const t = _nearestBuilding(u, targets);
        if (t) target = { col: t.col + 0.5, row: t.row + 0.5 };
        else target = { col: COLS - 3, row: 14 }; // march east
      }

      if (target) {
        const path = bfsPath(G.grid, Math.floor(u.col), Math.floor(u.row),
          Math.floor(target.col), Math.floor(target.row));
        if (path) u.path = path;
      }
    }
  }

  function _raidLogic(G) {
    const combatUnits = G.units.filter(u =>
      u.faction === 'enemy' && !u.dead &&
      (u.type === 'veil_soldier' || u.type === 'veil_raider' || u.type === 'veil_heavy')
    );
    // Assault if 3+ groups reached player territory
    const inPlayerTerritory = combatUnits.filter(u => u.col > 27);
    if (inPlayerTerritory.length >= 10 && !state.assaultTriggered) {
      state.assaultTriggered = true;
    }
  }

  function _canPlace(G, col, row, w, h) {
    if (col + w > COLS || row + h > ROWS) return false;
    for (let dc = 0; dc < w; dc++)
      for (let dr = 0; dr < h; dr++)
        if (G.grid[(row + dr) * COLS + (col + dc)] !== 0) return false;
    return true;
  }

  function _markGrid(G, col, row, w, h, val) {
    for (let dc = 0; dc < w; dc++)
      for (let dr = 0; dr < h; dr++)
        G.grid[(row + dr) * COLS + (col + dc)] = val;
  }

  function _nearestBuilding(unit, buildings) {
    let best = null, bestDist = Infinity;
    for (const b of buildings) {
      const d = Math.hypot(b.col - unit.col, b.row - unit.row);
      if (d < bestDist) { bestDist = d; best = b; }
    }
    return best;
  }

  return { tick, state };
})();

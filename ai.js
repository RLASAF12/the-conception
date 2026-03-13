// ============================================================
// AI.JS — Enemy (Veil) AI logic
// ============================================================

const AI = (() => {
  // Build sequences per phase
  const BUILD_PHASE = [
    // Phase 0 (0-3 min): basic barracks
    ['veil_barracks', 'veil_barracks'],
    // Phase 1 (3-6 min): heavier infrastructure
    ['armory', 'tunnel_entrance', 'rocket_platform', 'veil_watch_post'],
    // Phase 2 (6+ min): full arsenal
    ['veil_depot', 'veil_workshop', 'veil_airbase', 'veil_foundry'],
  ];

  // Internal AI state
  const state = {
    buildQueues: [
      [...BUILD_PHASE[0]],
      [...BUILD_PHASE[1]],
      [...BUILD_PHASE[2]],
    ],
    resources: 500,
    assaultTriggered: false,
    heaviesUnlocked: false,
    tanksUnlocked: false,
    droneDeathCooldown: 0,
    waveTimer: 90,      // first wave fires at 90s mark
    lastPhaseCheck: 0,
  };

  function tick(G, dt) {
    state.resources = Math.min(state.resources + 20 * dt, 1500);

    // Phase transitions
    const elapsed = G.elapsedTime;

    if (G.aiBuildPhase === 0 && elapsed >= 180) G.aiBuildPhase = 1; // 3 min
    if (G.aiBuildPhase === 1 && elapsed >= 360) G.aiBuildPhase = 2; // 6 min

    // Emergency escalation: if player unit crosses col 18, rush to phase 2
    if (G.aiBuildPhase < 2) {
      const playerCrossed = G.units.some(u => !u.dead && u.faction === 'player' && u.col < 18);
      if (playerCrossed) G.aiBuildPhase = 2;
    }

    _build(G);
    _train(G, dt);
    _moveUnits(G, dt);

    // Wave timer: start from phase 1, every 90s
    if (G.aiBuildPhase >= 1) {
      state.waveTimer -= dt;
      if (state.waveTimer <= 0) {
        _launchWave(G);
        state.waveTimer = 90;
      }
    }

    if (state.droneDeathCooldown > 0) state.droneDeathCooldown -= dt;

    // unlock heavies at 8 minutes
    if (elapsed >= 480 && !state.heaviesUnlocked) {
      const armory = G.buildings.find(b => b.type === 'armory' && b.faction === 'enemy' && !b.dead);
      if (armory) {
        state.heaviesUnlocked = true;
        UI.voice('enemy_armory_found_8min');
      }
    }
    // unlock veil_tank at 10 minutes
    if (elapsed >= 600 && !state.tanksUnlocked) {
      state.tanksUnlocked = true;
    }
  }

  function _build(G) {
    const phase = G.aiBuildPhase;
    const queue = state.buildQueues[phase];
    if (!queue || queue.length === 0) return;
    if (state.resources < 300) return;

    const type = queue[0];
    const def = BUILDING_DEF[type];
    if (!def) { queue.shift(); return; }
    const [w, h] = def.size;

    // find empty spot near enemy base (left side cols 2-11)
    for (let attempt = 0; attempt < 30; attempt++) {
      const col = 2 + Math.floor(Math.random() * 9);
      const row = 2 + Math.floor(Math.random() * 26);
      if (_canPlace(G, col, row, w, h)) {
        const b = createBuilding(type, col, row, 'enemy');
        b.buildProgress = 1;
        G.buildings.push(b);
        _markGrid(G, col, row, w, h, 1);
        _invalidatePathCache(G);
        state.resources -= 300;
        queue.shift();
        return;
      }
    }
  }

  function _train(G, dt) {
    const trainBuildings = G.buildings.filter(b =>
      b.faction === 'enemy' && !b.dead && b.buildProgress >= 1 &&
      (b.type === 'veil_barracks' || b.type === 'armory' || b.type === 'tunnel_entrance' ||
       b.type === 'veil_watch_post' || b.type === 'veil_depot' || b.type === 'veil_workshop' ||
       b.type === 'veil_airbase' || b.type === 'veil_foundry')
    );

    for (const b of trainBuildings) {
      b.trainTimer -= dt;
      if (b.trainTimer <= 0) {
        let unitType = null;

        if (b.type === 'veil_barracks') {
          unitType = Math.random() < 0.3 && state.resources > 100 ? 'veil_raider' : 'veil_soldier';
        } else if (b.type === 'armory') {
          if (state.heaviesUnlocked) unitType = Math.random() < 0.5 ? 'veil_heavy' : 'veil_artillery';
          else unitType = 'veil_soldier';
        } else if (b.type === 'tunnel_entrance') {
          unitType = 'infiltrator';
        } else if (b.type === 'veil_watch_post') {
          unitType = Math.random() < 0.4 ? 'veil_sniper' : 'veil_scout';
        } else if (b.type === 'veil_depot') {
          unitType = Math.random() < 0.35 ? 'veil_truck' : 'veil_bomber';
        } else if (b.type === 'veil_workshop') {
          unitType = 'veil_engineer';
        } else if (b.type === 'veil_airbase') {
          unitType = 'veil_drone';
        } else if (b.type === 'veil_foundry') {
          unitType = state.tanksUnlocked ? 'veil_tank' : null;
        }

        if (!unitType) {
          b.trainTimer = 10;
          continue;
        }

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

  // Launch a coordinated wave with optional flanking
  function _launchWave(G) {
    const readyUnits = G.units.filter(u =>
      u.faction === 'enemy' && !u.dead && u.path.length === 0 && !u.attackTarget &&
      !u.retreating && u.col < 16 // only units still in enemy territory
    );
    if (readyUnits.length < 3) return; // not enough units to form a wave

    // Detect player concentration at bridge area (center corridor)
    const bridgeCount = G.units.filter(u =>
      !u.dead && u.faction === 'player' &&
      u.col >= 16 && u.col <= 27 && u.row >= 10 && u.row <= 18
    ).length;

    // Detect player coverage of flanks
    const northCoverage = G.units.filter(u =>
      !u.dead && u.faction === 'player' && u.col >= 16 && u.col <= 27 && u.row < 10
    ).length;
    const southCoverage = G.units.filter(u =>
      !u.dead && u.faction === 'player' && u.col >= 16 && u.col <= 27 && u.row > 18
    ).length;

    // Decide wave composition and routing
    for (let i = 0; i < readyUnits.length; i++) {
      const u = readyUnits[i];
      const def = UNIT_DEF[u.type];

      // Flank routing: if player is heavily concentrated at bridge, split 40% to flanks
      let targetRow = 14; // default: center bridge corridor
      if (bridgeCount >= 4) {
        const flankRoll = i % 5; // every 5th unit goes to a flank
        if (flankRoll === 1 || flankRoll === 2) {
          // North flank (only if not already covered)
          targetRow = northCoverage < 2 ? 4 : 14;
        } else if (flankRoll === 3) {
          // South flank
          targetRow = southCoverage < 2 ? 24 : 14;
        }
      }

      _assignTargetSmart(u, G, def, targetRow);
    }
  }

  function _moveUnits(G, dt) {
    const enemyUnits = G.units.filter(u => u.faction === 'enemy' && !u.dead);

    for (const u of enemyUnits) {
      const def = UNIT_DEF[u.type];

      // Retreat logic: units at <25% HP retreat toward base (unless very close to it)
      if (u.hp / u.maxHp < 0.25 && u.col > 8) {
        u.retreating = true;
      }
      // Recover from retreat once HP > 50%
      if (u.retreating && u.hp / u.maxHp >= 0.5) {
        u.retreating = false;
      }

      if (u.retreating) {
        if (u.path.length === 0) {
          const retreatPath = _cachedPath(G, Math.floor(u.col), Math.floor(u.row), 5, Math.floor(u.row));
          if (retreatPath) u.path = retreatPath;
          u.attackTarget = null;
        }
        continue;
      }

      // Only reassign idle units
      if (u.path.length > 0 || u.attackTarget) continue;

      // Veil engineers: find damaged enemy buildings
      if (def.repairEnemy) {
        const damaged = G.buildings.filter(b => b.faction === 'enemy' && !b.dead && b.hp < b.maxHp);
        if (damaged.length) {
          const target = _nearestBuilding(u, damaged);
          if (target) {
            const dist = Math.hypot(target.col - u.col, target.row - u.row);
            if (dist <= 2) {
              target.hp = Math.min(target.hp + 15 * dt, target.maxHp);
            } else {
              const path = _cachedPath(G, Math.floor(u.col), Math.floor(u.row),
                Math.floor(target.col + target.w / 2), Math.floor(target.row + target.h / 2));
              if (path) u.path = path;
            }
          }
        }
        continue;
      }

      // Troop trucks: deploy when deep in neutral/player territory
      if (def.troopDeploy && u.col >= 20) {
        for (let i = 0; i < 3; i++) {
          const sc = Math.max(0, Math.min(COLS - 1, Math.floor(u.col) + (i - 1)));
          const sr = Math.max(0, Math.min(ROWS - 1, Math.floor(u.row)));
          G.units.push(createUnit('veil_soldier', sc, sr, 'enemy'));
        }
        u.dead = true;
        continue;
      }

      _assignTargetSmart(u, G, def, 14);
    }
  }

  function _assignTargetSmart(u, G, def, preferredRow) {
    let target = null;

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
    } else if (def.targetWatchtowers) {
      const wt = _nearestBuilding(u, G.buildings.filter(b =>
        b.type === 'watchtower' && b.faction === 'player' && !b.dead));
      if (wt) target = { col: wt.col + 0.5, row: wt.row + 0.5 };
      else {
        const targets = G.buildings.filter(b =>
          b.faction !== 'enemy' && !b.dead &&
          (b.type === 'settlement' || b.type === 'barracks' || b.type === 'command_base')
        );
        const t = _nearestBuilding(u, targets);
        if (t) target = { col: t.col + 0.5, row: t.row + 0.5 };
        else target = { col: COLS - 3, row: preferredRow };
      }
    } else if (def.flying) {
      target = { col: COLS - 3, row: preferredRow };
    } else {
      const targets = G.buildings.filter(b =>
        b.faction !== 'enemy' && !b.dead &&
        (b.type === 'settlement' || b.type === 'barracks' || b.type === 'command_base')
      );
      const t = _nearestBuilding(u, targets);
      if (t) target = { col: t.col + 0.5, row: t.row + 0.5 };
      else target = { col: COLS - 3, row: preferredRow };
    }

    if (target) {
      if (def.flying) {
        u.path = [{ col: Math.floor(target.col), row: Math.floor(target.row) }];
      } else {
        const path = _cachedPath(G, Math.floor(u.col), Math.floor(u.row),
          Math.floor(target.col), Math.floor(target.row));
        if (path) u.path = path;
      }
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

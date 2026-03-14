// ============================================================
// AI.JS — Enemy (Veil) AI logic — FSM-enhanced
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

  // Per-unit AI states
  const STATE = { IDLE: 'idle', PATROL: 'patrol', ASSAULT: 'assault', RETREAT: 'retreat', GUARD: 'guard' };

  // Internal AI state
  const state = {
    buildQueues: [
      [...BUILD_PHASE[0]],
      [...BUILD_PHASE[1]],
      [...BUILD_PHASE[2]],
    ],
    resources: 500,
    heaviesUnlocked: false,
    tanksUnlocked: false,
    waveTimer: 60,      // first wave fires at 60s mark (was 90)
    earlyProbesSent: 0, // track early harassment probes
  };

  function tick(G, dt) {
    // Faster resource gain in early phases to build up quicker
    const resRate = G.aiBuildPhase === 0 ? 30 : 20;
    state.resources = Math.min(state.resources + resRate * dt, 1500);

    // Phase transitions
    const elapsed = G.elapsedTime;

    if (G.aiBuildPhase === 0 && elapsed >= 120) G.aiBuildPhase = 1; // 2 min (was 3)
    if (G.aiBuildPhase === 1 && elapsed >= 300) G.aiBuildPhase = 2; // 5 min (was 6)

    // Emergency escalation: if player unit crosses col 18, rush to phase 2
    if (G.aiBuildPhase < 2) {
      const playerCrossed = G.units.some(u => !u.dead && u.faction === 'player' && u.col < 18);
      if (playerCrossed) G.aiBuildPhase = 2;
    }

    // Update AI plugin cooldown
    if (typeof AIPlugin !== 'undefined') AIPlugin.update(dt);

    _build(G);
    _train(G, dt);
    _updateFSM(G, dt);

    // Early harassment probes: send small groups before phase 1
    if (G.aiBuildPhase === 0 && state.earlyProbesSent < 3) {
      const probeThresholds = [30, 50, 80]; // seconds
      if (elapsed >= probeThresholds[state.earlyProbesSent]) {
        _launchProbe(G);
        state.earlyProbesSent++;
      }
    }

    // Wave timer: start from phase 1, every 70s (was 90)
    if (G.aiBuildPhase >= 1) {
      state.waveTimer -= dt;
      if (state.waveTimer <= 0) {
        _launchWave(G);
        state.waveTimer = 70;
      }
    }

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
        // Initialize FSM state
        u.aiState = STATE.IDLE;
        u.aiStateTimer = 5 + Math.random() * 10; // idle duration before patrol/assault
        // 15% of units start as guards (stay near base to defend)
        if (Math.random() < 0.15) {
          u.aiState = STATE.GUARD;
          u.aiStateTimer = 30 + Math.random() * 30;
        }
        G.units.push(u);
        b.trainTimer = UNIT_DEF[unitType].buildTime + Math.random() * 5;
      }
    }
  }

  // Main per-unit FSM update
  function _updateFSM(G, dt) {
    const enemyUnits = G.units.filter(u => u.faction === 'enemy' && !u.dead);

    for (const u of enemyUnits) {
      const def = UNIT_DEF[u.type];
      if (!u.aiState) u.aiState = STATE.IDLE;
      if (u.aiStateTimer === undefined) u.aiStateTimer = 0;

      // HP-based retreat transition (any state)
      if (u.hp / u.maxHp < 0.25 && u.col > 8 && u.aiState !== STATE.RETREAT) {
        u.aiState = STATE.RETREAT;
        u.path = [];
        u.attackTarget = null;
        u.retreating = true;
      }
      // Recover from retreat
      if (u.aiState === STATE.RETREAT && u.hp / u.maxHp >= 0.55 && u.col <= 8) {
        u.aiState = STATE.IDLE;
        u.aiStateTimer = 8 + Math.random() * 8;
        u.retreating = false;
      }

      u.aiStateTimer -= dt;

      switch (u.aiState) {
        case STATE.IDLE:
          // Engineers repair immediately; no idle wait
          if (def.repairEnemy) { _doRepair(u, G, dt); break; }
          // Drone/scout: patrol after short idle
          if (u.aiStateTimer <= 0) {
            const isScout = (u.type === 'veil_scout' || u.type === 'veil_drone');
            u.aiState = isScout ? STATE.PATROL : STATE.ASSAULT;
            u.aiStateTimer = isScout ? (20 + Math.random() * 20) : 0;
          }
          break;

        case STATE.PATROL: {
          // Scouts patrol the boundary col 12-16, random row
          if (u.path.length === 0 && !u.attackTarget) {
            const patrolRow = 3 + Math.floor(Math.random() * 24);
            const patrolCol = 12 + Math.floor(Math.random() * 5);
            const path = _cachedPath(G, Math.floor(u.col), Math.floor(u.row), patrolCol, patrolRow);
            if (path) u.path = path;
          }
          // Transition to assault when timer runs out or wave is active
          if (u.aiStateTimer <= 0) {
            u.aiState = STATE.ASSAULT;
          }
          break;
        }

        case STATE.ASSAULT: {
          // Retreat override handled above
          if (u.retreating) break;
          // Troop trucks: deploy when deep in neutral/player territory
          if (def.troopDeploy && u.col >= 20) {
            for (let i = 0; i < 3; i++) {
              const sc = Math.max(0, Math.min(COLS - 1, Math.floor(u.col) + (i - 1)));
              const sr = Math.max(0, Math.min(ROWS - 1, Math.floor(u.row)));
              const newU = createUnit('veil_soldier', sc, sr, 'enemy');
              newU.aiState = STATE.ASSAULT;
              newU.aiStateTimer = 0;
              G.units.push(newU);
            }
            u.dead = true;
            break;
          }
          // Only assign new target when idle
          if (u.path.length === 0 && !u.attackTarget) {
            _assignTargetSmart(u, G, def, 14);
          }
          break;
        }

        case STATE.RETREAT: {
          u.retreating = true;
          if (u.path.length === 0) {
            const path = _cachedPath(G, Math.floor(u.col), Math.floor(u.row), 5, Math.floor(u.row));
            if (path) u.path = path;
            u.attackTarget = null;
          }
          break;
        }

        case STATE.GUARD: {
          // Guard: stay near enemy base cols 5-10, attack anything that enters
          if (u.aiStateTimer <= 0) {
            // Switch to assault after guard duty
            u.aiState = STATE.ASSAULT;
            break;
          }
          if (u.path.length === 0 && !u.attackTarget) {
            // Patrol within guard zone
            const gc = 5 + Math.floor(Math.random() * 6);
            const gr = 3 + Math.floor(Math.random() * 24);
            const path = _cachedPath(G, Math.floor(u.col), Math.floor(u.row), gc, gr);
            if (path) u.path = path;
          }
          break;
        }
      }
    }
  }

  function _doRepair(u, G, dt) {
    const damaged = G.buildings.filter(b => b.faction === 'enemy' && !b.dead && b.hp < b.maxHp);
    if (!damaged.length) return;
    const target = _nearestBuilding(u, damaged);
    if (!target) return;
    const dist = Math.hypot(target.col - u.col, target.row - u.row);
    if (dist <= 2) {
      target.hp = Math.min(target.hp + 15 * dt, target.maxHp);
    } else if (u.path.length === 0) {
      const path = _cachedPath(G, Math.floor(u.col), Math.floor(u.row),
        Math.floor(target.col + target.w / 2), Math.floor(target.row + target.h / 2));
      if (path) u.path = path;
    }
  }

  // Launch small early harassment probe (1-3 scouts/soldiers)
  function _launchProbe(G) {
    const scouts = G.units.filter(u =>
      u.faction === 'enemy' && !u.dead && u.path.length === 0 && !u.attackTarget &&
      u.aiState !== STATE.RETREAT && u.col < 14 &&
      (u.type === 'veil_scout' || u.type === 'veil_soldier' || u.type === 'veil_drone')
    );
    if (scouts.length === 0) return;
    const probeSize = Math.min(scouts.length, 1 + Math.floor(Math.random() * 2));
    // Pick a random row to approach from (vary attack angle)
    const targetRows = [4, 10, 14, 18, 24];
    const targetRow = targetRows[Math.floor(Math.random() * targetRows.length)];
    for (let i = 0; i < probeSize; i++) {
      const u = scouts[i];
      u.aiState = STATE.ASSAULT;
      u.aiStateTimer = 0;
      u.retreating = false;
      _assignTargetSmart(u, G, UNIT_DEF[u.type], targetRow);
    }
  }

  // Launch a coordinated wave with optional flanking
  function _launchWave(G) {
    const readyUnits = G.units.filter(u =>
      u.faction === 'enemy' && !u.dead && u.path.length === 0 && !u.attackTarget &&
      u.aiState !== STATE.RETREAT && u.col < 16
    );
    if (readyUnits.length < 3) return;

    // Try external AI for wave targeting (non-blocking, uses last response if available)
    if (typeof AIPlugin !== 'undefined' && AIPlugin.isEnabled()) {
      AIPlugin.requestDecision(G, 'wave_target'); // fire-and-forget, result used next wave
    }

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

    // Decide wave routing — vary attack angles even without heavy bridge defense
    const attackAngles = [4, 8, 14, 20, 24]; // spread across map rows
    const baseAngle = attackAngles[Math.floor(Math.random() * attackAngles.length)];

    for (let i = 0; i < readyUnits.length; i++) {
      const u = readyUnits[i];
      const def = UNIT_DEF[u.type];
      u.aiState = STATE.ASSAULT;
      u.aiStateTimer = 0;
      u.retreating = false;

      let targetRow = baseAngle; // randomized base angle per wave
      if (bridgeCount >= 4) {
        // Heavy bridge defense: force flanking
        const flankRoll = i % 5;
        if (flankRoll <= 1) {
          targetRow = northCoverage < southCoverage ? (3 + Math.floor(Math.random() * 6)) : (22 + Math.floor(Math.random() * 5));
        } else if (flankRoll === 2) {
          targetRow = southCoverage < 2 ? 24 : 14;
        }
      } else {
        // Spread units across 2-3 angles for variety
        const spread = [-4, 0, 0, 4][i % 4];
        targetRow = Math.max(2, Math.min(ROWS - 2, baseAngle + spread));
      }

      _assignTargetSmart(u, G, def, targetRow);
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

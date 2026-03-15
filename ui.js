// ============================================================
// UI.JS — HUD, voice lines, build panel, upgrade panel
// ============================================================

const UI = (() => {
  const voiceLog = document.getElementById('voice-log');
  const resBar   = document.getElementById('resource-bar');
  const selName  = document.getElementById('sel-name');
  const selDet   = document.getElementById('sel-details');
  const selQueue = document.getElementById('sel-queue');
  const buildPanel = document.getElementById('build-panel');
  const upgradePanel = document.getElementById('upgrade-panel');
  const upgradeList  = document.getElementById('upgrade-list');
  const timerDisplay = document.getElementById('timer-display');
  const settlementHps = document.getElementById('settlement-hps');
  const alertFlash = document.getElementById('alert-flash');
  const placementCursor = document.getElementById('placement-cursor');

  // ---- Sidebar state ----
  const sidebar = document.getElementById('build-sidebar');
  const sidebarIC = document.getElementById('sidebar-ic');
  const sidebarPower = document.getElementById('sidebar-power');
  const sidebarList = document.getElementById('sidebar-building-list');
  const sidebarTabs = document.querySelectorAll('.sidebar-tab');
  const sidebarToggle = document.getElementById('sidebar-toggle');
  let _sidebarCat = 'base';
  let _sidebarOnPlace = null;
  let _sidebarG = null;
  let _sidebarLastBuildingCount = -1;
  let _sidebarLastIC = -1;

  // Tab switching
  sidebarTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      sidebarTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      _sidebarCat = tab.dataset.cat;
      if (_sidebarG) _buildSidebarCards(_sidebarG);
    });
  });

  // Toggle button
  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', () => {
      const gc = document.getElementById('game-container');
      if (sidebar.classList.contains('sidebar-visible')) {
        sidebar.classList.remove('sidebar-visible');
        if (gc) gc.classList.remove('sidebar-open');
        sidebarToggle.style.right = '0';
      } else {
        sidebar.classList.add('sidebar-visible');
        if (gc) gc.classList.add('sidebar-open');
        sidebarToggle.style.right = '192px';
        if (_sidebarG) _buildSidebarCards(_sidebarG);
      }
    });
  }

  // Upgrade button in sidebar footer
  document.getElementById('sidebar-upgrade-btn').addEventListener('click', () => {
    if (_sidebarG) showUpgradePanel(_sidebarG);
  });

  // HUD action buttons — mouse-clickable fallbacks for keyboard shortcuts
  document.getElementById('btn-build')?.addEventListener('click', () => window._hudBuild?.());
  document.getElementById('btn-upgrades')?.addEventListener('click', () => { if (_sidebarG) showUpgradePanel(_sidebarG); });
  document.getElementById('btn-atkmove')?.addEventListener('click', () => window._hudAtkMove?.());
  document.getElementById('btn-hold')?.addEventListener('click', () => window._hudHold?.());
  document.getElementById('btn-airstrike')?.addEventListener('click', () => window._hudAirstrike?.());

  const PLAYER_BUILDINGS = [
    'barracks','quarry','watchtower','wall','fortified_wall',
    'field_ops','motor_pool','defense_works',
    'radar_station','bunker','supply_depot','comms_tower','hospital','forward_post',
    'power_plant',
  ];

  function _prereqsMet(def, G) {
    const prereqs = def.prereq || [];
    for (const req of prereqs) {
      const has = G.buildings.some(b => b.type === req && b.faction === 'player' && !b.dead && b.buildProgress >= 1);
      if (!has) return false;
    }
    return true;
  }

  function _buildSidebarCards(G) {
    sidebarList.innerHTML = '';
    const filtered = PLAYER_BUILDINGS.filter(t => BUILDING_DEF[t].category === _sidebarCat);
    for (const bType of filtered) {
      const def = BUILDING_DEF[bType];
      const count = G.buildings.filter(b => b.type === bType && b.faction === 'player' && !b.dead).length;
      const atMax = def.maxCount !== undefined && def.maxCount !== Infinity && count >= def.maxCount;
      const locked = !_prereqsMet(def, G);
      const cantAfford = G.ic < def.cost;

      const card = document.createElement('div');
      card.className = 'sidebar-building-card';
      if (locked) card.classList.add('locked');
      else if (atMax) card.classList.add('maxed');

      const lockIcon = locked ? `<span class="sbc-lock-icon">&#128274;</span>` : '';
      const badge = atMax ? `<span class="sbc-badge">[MAX]</span>` :
                    cantAfford && !locked ? `<span class="sbc-badge" style="color:#887733">[NO IC]</span>` : '';
      const prereqNames = (def.prereq || []).map(r => BUILDING_DEF[r]?.label || r).join(', ');
      const prereqNote = locked && prereqNames ? `<div style="font-size:9px;color:#885522;margin-top:2px">Needs: ${prereqNames}</div>` : '';

      card.innerHTML = `
        <div class="sbc-name">${lockIcon}${def.label}${badge}</div>
        <div class="sbc-cost">${def.cost} IC &nbsp; ⚡${def.power > 0 ? '+' : ''}${def.power || 0}</div>
        ${prereqNote}
        <div class="sbc-bonus">${def.bonus || ''}</div>
      `;

      if (!locked && !atMax) {
        card.addEventListener('click', () => {
          if (window.SFX) SFX.uiClick();
          if (_sidebarOnPlace) _sidebarOnPlace(bType);
        });
      }
      sidebarList.appendChild(card);
    }
    _sidebarLastBuildingCount = G.buildings.filter(b => b.faction === 'player' && !b.dead).length;
    _sidebarLastIC = Math.floor(G.ic);
  }

  const VOICE_LINES = {
    game_start:          'All quiet on the border, Commander. For now.',
    first_scout:         'Scout is moving. Keep them alive.',
    first_enemy_unit:    'Contact. We\'re not alone out there.',
    first_enemy_building:'They\'ve been busy, Commander. This wasn\'t built overnight.',
    command_base_found:  'Target confirmed. Your call.',
    settlement_attack:   (name) => `We're taking fire at ${name}. Respond immediately.`,
    settlement_50hp:     (name) => `${name} is taking heavy losses. Commander — we need units now.`,
    settlement_falls:    (name, pop) => `We've lost ${name}. ${pop} civilians. That's on the board.`,
    second_settlement_falls: 'Two settlements lost. One more and it\'s over.',
    scout_killed:        'We lost the scout. The ground they covered stays with us.',
    drone_down:          'Drone down. 60 seconds before we can put another up.',
    barracks_destroyed:  'Barracks is gone. We\'re down to whatever we have in the field.',
    enemy_armory_found_8min: 'They have heavies now. This changes things.',
    insufficient_resources: 'Insufficient resources, Commander.',
    airstrike_ready:     'Airstrike is live. Press X, then right-click the target.',
    win:                 'Command Base destroyed. It\'s over. For now.',
    lose:                'The line is broken, Commander. We couldn\'t hold them.',
  };

  const firedLines = new Set();

  function voice(key, ...args) {
    let text = VOICE_LINES[key];
    if (!text) return;
    if (typeof text === 'function') text = text(...args);
    // don't repeat one-shot lines
    const repeatKeys = ['settlement_attack','settlement_50hp','settlement_falls',
                        'second_settlement_falls','insufficient_resources'];
    const dedupeKey = key + args.join(',');
    if (!repeatKeys.includes(key) && firedLines.has(dedupeKey)) return;
    firedLines.add(dedupeKey);

    const el = document.createElement('div');
    el.className = 'voice-line';
    el.textContent = `"${text}"`;
    voiceLog.appendChild(el);
    // keep max 2
    while (voiceLog.children.length > 2) voiceLog.removeChild(voiceLog.firstChild);
    setTimeout(() => { el.remove(); }, 5200);
  }

  function updateResource(ic) {
    resBar.textContent = `IC: ${Math.floor(ic)}`;
    resBar.style.color = ic < 50 ? '#ff6666' : '#e8d87a';
    if (sidebarIC) {
      sidebarIC.textContent = `IC: ${Math.floor(ic)}`;
      sidebarIC.style.color = ic < 50 ? '#ff6666' : '#ccee44';
    }
    // Refresh sidebar cards if IC crossed affordability thresholds
    if (_sidebarG && sidebar.classList.contains('sidebar-visible')) {
      const newIC = Math.floor(ic);
      const bCount = _sidebarG.buildings.filter(b => b.faction === 'player' && !b.dead).length;
      if (Math.abs(newIC - _sidebarLastIC) >= 10 || bCount !== _sidebarLastBuildingCount) {
        _buildSidebarCards(_sidebarG);
      }
    }
  }

  function updatePower(level) {
    const el = document.getElementById('power-display');
    if (!el) return;
    const sign = level >= 0 ? '+' : '';
    el.textContent = `⚡ ${sign}${level}`;
    el.style.color = level >= 0 ? '#aaee44' : level >= -3 ? '#eecc22' : '#ff4444';
    if (sidebarPower) {
      sidebarPower.textContent = `⚡ ${sign}${level}`;
      sidebarPower.style.color = level >= 0 ? '#88cc44' : level >= -3 ? '#eecc22' : '#ff4444';
    }
  }

  function flashResourceRed() {
    resBar.style.color = '#ff2222';
    resBar.style.borderColor = '#ff2222';
    setTimeout(() => {
      resBar.style.color = '';
      resBar.style.borderColor = '';
    }, 600);
  }

  function updateTimer(seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2,'0');
    const s = Math.floor(seconds % 60).toString().padStart(2,'0');
    timerDisplay.textContent = `${m}:${s}`;
  }

  function updateSettlementHps(settlements) {
    settlementHps.innerHTML = '';
    for (const s of settlements) {
      if (s.dead) continue;
      const pct = s.hp / s.maxHp;
      const color = pct > 0.5 ? '#88cc88' : pct > 0.25 ? '#e8d87a' : '#ff4444';
      const div = document.createElement('div');
      div.className = 'settlement-hp-label';
      div.style.color = color;
      const incomeText = s.icIncome > 0 ? ` <span style="color:#4aff88;font-size:9px">+${s.icIncome}/s</span>` : '';
      div.innerHTML = `${s.name}: ${Math.ceil(s.hp)}/${s.maxHp}${incomeText}`;
      settlementHps.appendChild(div);
    }
  }

  function triggerAlertFlash() {
    if (window.SFX) SFX.alertSound();
    alertFlash.classList.remove('alert-flash-active');
    void alertFlash.offsetWidth; // reflow
    alertFlash.classList.add('alert-flash-active');
    setTimeout(() => alertFlash.classList.remove('alert-flash-active'), 1600);
  }

  function updateSelectionInfo(selected, G) {
    if (!selected || selected.length === 0) {
      selName.textContent = '—';
      selDet.textContent = '';
      selQueue.textContent = '';
      _renderBuildPanel(null, G);
      return;
    }
    if (selected.length > 1) {
      const vets = selected.filter(u => u.stars > 0).length;
      selName.textContent = `${selected.length} units selected${vets > 0 ? ` (${vets} veterans)` : ''}`;
      selDet.textContent = selected.map(u => {
        const s = u.stars > 0 ? '★'.repeat(u.stars) + ' ' : '';
        return s + (UNIT_DEF[u.type]?.label || '');
      }).join(', ');
      selQueue.textContent = '';
      _renderBuildPanel(null, G);
      return;
    }
    const e = selected[0];
    // Unit
    if (e.path !== undefined) {
      const def = UNIT_DEF[e.type];
      const starStr = e.stars > 0 ? '  ' + '★'.repeat(e.stars) + ` (${e.kills} kills)` : '';
      const garStr  = (e.type === 'apc' && e.loadedUnits && e.loadedUnits.length > 0)
        ? `  Garrison: ${e.loadedUnits.length}/3 — press G near infantry to load, Right-click APC to unload` : '';
      const queueStr = (e.pathQueue && e.pathQueue.length > 0) ? `  Waypoints queued: ${e.pathQueue.length} — press P to patrol` : '';
      const patrolStr = e.patrolPoints ? '  [PATROL — press P to cancel]' : '';
      const followStr = e.followTarget ? '  [FOLLOWING — press F to cancel]' : (def.damage ? '  Shift+right-click waypoint then P=patrol, F=follow' : '');
      selName.textContent = def.label + starStr;
      selDet.textContent = `HP: ${Math.ceil(e.hp)}/${e.maxHp}  Speed: ${e.speed.toFixed(1)}  Sight: ${e.sight}${garStr}${queueStr}${patrolStr}${followStr}`;
      selQueue.textContent = '';
      _renderBuildPanel(null, G);
    } else {
      // Building
      const def = BUILDING_DEF[e.type];
      selName.textContent = def.label;
      const hpText = `HP: ${Math.ceil(e.hp)}/${e.maxHp}`;
      const prog = e.buildProgress < 1 ? `  Building: ${Math.floor(e.buildProgress*100)}%` : '';
      const rallyStr = e.rallyPoint ? `  Rally: (${e.rallyPoint.col},${e.rallyPoint.row}) — right-click ground to move` : '  Right-click ground to set rally point';
      selDet.textContent = hpText + prog + (def.trainable && def.trainable.length ? rallyStr : '');
      if (e.trainQueue && e.trainQueue.length > 0) {
        selQueue.textContent = `Queue: ${e.trainQueue.map(t => UNIT_DEF[t]?.label).join(', ')}`;
      } else {
        selQueue.textContent = '';
      }
      _renderBuildPanel(e, G);
    }
  }

  function _renderBuildPanel(building, G) {
    buildPanel.innerHTML = '';
    if (!building) return;
    const def = BUILDING_DEF[building.type];
    if (!def.trainable || def.trainable.length === 0) {
      // quarry → upgrades button
      if (building.type === 'quarry' && building.buildProgress >= 1) {
        const btn = document.createElement('button');
        btn.className = 'build-btn';
        btn.textContent = 'UPGRADES';
        btn.onclick = () => showUpgradePanel(G);
        buildPanel.appendChild(btn);
      }
      return;
    }
    // Train buttons
    for (const uType of def.trainable) {
      const uDef = UNIT_DEF[uType];
      if (!uDef) continue;
      const btn = document.createElement('button');
      btn.className = 'build-btn';
      btn.textContent = `Train ${uDef.label} (${uDef.cost} IC / ${uDef.buildTime}s)`;
      const activeCount = G.units.filter(u => u.type === uType && u.faction === 'player' && !u.dead).length;
      if (activeCount >= uDef.maxActive) {
        btn.disabled = true;
        btn.textContent += ' [MAX]';
      }
      btn.onclick = () => {
        if (window.SFX) SFX.uiClick();
        if (window.G) window.G.trainUnit(building, uType);
      };
      buildPanel.appendChild(btn);
    }
  }

  // Register callbacks and close sidebar — called on game start/restart
  function initBuildMenu(G, onPlace) {
    _sidebarG = G;
    _sidebarOnPlace = onPlace;
    // Ensure sidebar is closed so player opens it intentionally with B
    if (sidebar.classList.contains('sidebar-visible')) {
      sidebar.classList.remove('sidebar-visible');
      const gc = document.getElementById('game-container');
      if (gc) gc.classList.remove('sidebar-open');
      if (sidebarToggle) sidebarToggle.style.right = '0';
    }
  }

  function showBuildMenu(G, onPlace) {
    _sidebarG = G;
    _sidebarOnPlace = onPlace;
    // Toggle sidebar visibility; if already open just refresh
    if (sidebar.classList.contains('sidebar-visible')) {
      _buildSidebarCards(G);
      return;
    }
    sidebar.classList.add('sidebar-visible');
    const gc = document.getElementById('game-container');
    if (gc) gc.classList.add('sidebar-open');
    if (sidebarToggle) sidebarToggle.style.right = '192px';
    _buildSidebarCards(G);
  }

  function showUpgradePanel(G) {
    // Build visual tech tree
    upgradeList.innerHTML = '';

    // Canvas-based tree rendering
    const CELL_W = 128, CELL_H = 74, PAD_X = 16, PAD_Y = 12;
    const maxTx = Math.max(...UPGRADE_DEF.map(u => u.tx)) + 1;
    const maxTy = Math.max(...UPGRADE_DEF.map(u => u.ty)) + 1;
    const cw = maxTx * (CELL_W + PAD_X) + PAD_X;
    const ch = maxTy * (CELL_H + PAD_Y) + PAD_Y;

    const cv = document.createElement('canvas');
    cv.width = cw; cv.height = ch;
    cv.style.display = 'block';
    upgradeList.appendChild(cv);
    const ctx = cv.getContext('2d');

    // Helper: cell top-left pixel
    const cellX = tx => PAD_X + tx * (CELL_W + PAD_X);
    const cellY = ty => PAD_Y + ty * (CELL_H + PAD_Y);

    // Draw connector lines first
    for (const upg of UPGRADE_DEF) {
      if (!upg.prereq) continue;
      const from = UPGRADE_DEF.find(u => u.id === upg.prereq);
      if (!from) continue;
      const fx = cellX(from.tx) + CELL_W, fy = cellY(from.ty) + CELL_H / 2;
      const tx2 = cellX(upg.tx), ty2 = cellY(upg.ty) + CELL_H / 2;
      ctx.strokeStyle = G.upgrades[upg.prereq] ? '#44aa22' : '#2a4a18';
      ctx.lineWidth = 2;
      ctx.setLineDash(G.upgrades[upg.prereq] ? [] : [4, 3]);
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      const mx = (fx + tx2) / 2;
      ctx.bezierCurveTo(mx, fy, mx, ty2, tx2, ty2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw nodes
    for (const upg of UPGRADE_DEF) {
      const already = G.upgrades[upg.id];
      const prereqMet = !upg.prereq || G.upgrades[upg.prereq];
      const bldgMet = !upg.prereqBuilding ||
        G.buildings.filter(b => b.type === upg.prereqBuilding && !b.dead).length >= (upg.prereqBuildingCount || 1);
      const canAfford = G.ic >= upg.cost;
      const available = !already && prereqMet && bldgMet;

      const nx = cellX(upg.tx), ny = cellY(upg.ty);

      // Node background
      ctx.fillStyle = already ? 'rgba(20,60,10,0.95)' :
                      available ? 'rgba(0,15,0,0.95)' : 'rgba(0,5,0,0.88)';
      ctx.strokeStyle = already ? '#44cc22' : available ? '#2a8a18' : '#1a3a10';
      ctx.lineWidth = already ? 2 : 1;
      ctx.beginPath();
      ctx.roundRect(nx, ny, CELL_W, CELL_H, 3);
      ctx.fill(); ctx.stroke();

      // Status tint
      if (already) {
        ctx.fillStyle = 'rgba(40,120,20,0.18)';
        ctx.beginPath(); ctx.roundRect(nx, ny, CELL_W, CELL_H, 3); ctx.fill();
      }

      // Label
      ctx.font = 'bold 10px Courier New';
      ctx.fillStyle = already ? '#88ff44' : available ? '#88cc44' : '#3a5a28';
      ctx.fillText(upg.label, nx + 6, ny + 16);

      // Desc
      ctx.font = '9px Courier New';
      ctx.fillStyle = already ? '#66aa44' : '#4a6a38';
      // word-wrap simple
      const words = upg.desc.split(' ');
      let line = '', lineY = ny + 30;
      for (const word of words) {
        const test = line ? line + ' ' + word : word;
        if (ctx.measureText(test).width > CELL_W - 12) {
          ctx.fillText(line, nx + 6, lineY); lineY += 11; line = word;
        } else { line = test; }
      }
      if (line) ctx.fillText(line, nx + 6, lineY);

      // Cost & button
      const btnY = ny + CELL_H - 18;
      ctx.font = '9px Courier New';
      if (already) {
        ctx.fillStyle = '#44cc22';
        ctx.fillText('✓ DONE', nx + 6, btnY + 11);
      } else {
        ctx.fillStyle = canAfford && available ? '#ccee44' : '#4a5a28';
        ctx.fillText(`${upg.cost} IC`, nx + 6, btnY + 11);
        // Buy button
        const btnX = nx + CELL_W - 40;
        ctx.fillStyle = (available && canAfford) ? '#1a4a10' : '#0a1a08';
        ctx.strokeStyle = (available && canAfford) ? '#44aa22' : '#1a3a10';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect(btnX, btnY, 34, 14, 2); ctx.fill(); ctx.stroke();
        ctx.font = 'bold 9px Courier New';
        ctx.fillStyle = (available && canAfford) ? '#88ff44' : '#2a4a20';
        ctx.fillText('BUY', btnX + 8, btnY + 10);
      }
    }

    // Click handler
    cv.onclick = (e) => {
      const rect = cv.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      for (const upg of UPGRADE_DEF) {
        const already = G.upgrades[upg.id];
        if (already) continue;
        const prereqMet = !upg.prereq || G.upgrades[upg.prereq];
        const bldgMet = !upg.prereqBuilding ||
          G.buildings.filter(b => b.type === upg.prereqBuilding && !b.dead).length >= (upg.prereqBuildingCount || 1);
        const canAfford = G.ic >= upg.cost;
        if (!prereqMet || !bldgMet || !canAfford) continue;
        const nx = cellX(upg.tx), ny = cellY(upg.ty);
        const btnX = nx + CELL_W - 40, btnY = ny + CELL_H - 18;
        if (mx >= btnX && mx <= btnX + 34 && my >= btnY && my <= btnY + 14) {
          if (window.G) window.G.purchaseUpgrade(upg);
          showUpgradePanel(G);
          return;
        }
      }
    };

    upgradePanel.style.display = 'block';
    upgradePanel.style.width = (cw + 36) + 'px';
  }

  document.getElementById('close-upgrade').onclick = () => {
    upgradePanel.style.display = 'none';
  };

  function showPlacementCursor(col, row, w, h, valid) {
    // Store placement data for canvas-based iso rendering
    placementCursor.style.display = 'none'; // hide DOM cursor — draw on canvas instead
    window._placementCursor = { col, row, w, h, valid };
  }

  function hidePlacementCursor() {
    placementCursor.style.display = 'none';
    window._placementCursor = null;
  }

  function resetVoice() {
    firedLines.clear();
    voiceLog.innerHTML = '';
  }

  // Group chips display (bottom-left of HUD)
  let _groupChipsEl = null;
  function updateGroups(groups, units) {
    if (!_groupChipsEl) {
      _groupChipsEl = document.createElement('div');
      _groupChipsEl.id = 'group-chips';
      _groupChipsEl.style.cssText = 'position:absolute;bottom:130px;left:8px;display:flex;gap:4px;z-index:10;';
      document.getElementById('game-container').appendChild(_groupChipsEl);
    }
    _groupChipsEl.innerHTML = '';
    for (let n = 1; n <= 5; n++) {
      const ids = new Set(groups[n] || []);
      if (ids.size === 0) continue;
      const count = units.filter(u => ids.has(u.id) && !u.dead).length;
      if (count === 0) continue;
      const chip = document.createElement('div');
      chip.style.cssText = 'background:#1a2a18;border:1px solid #4a7a3a;color:#88cc66;font-size:10px;padding:2px 5px;cursor:pointer;';
      chip.textContent = `[${n}] ${count}`;
      _groupChipsEl.appendChild(chip);
    }
  }

  // Attack-move / airstrike mode indicator
  let _cmdModeEl = null;
  function updateCommandMode(attackMoveMode, airstrikeMode, airstrikeAvailable, selected) {
    if (!_cmdModeEl) {
      _cmdModeEl = document.createElement('div');
      _cmdModeEl.id = 'cmd-mode';
      _cmdModeEl.style.cssText = 'position:absolute;bottom:130px;left:50%;transform:translateX(-50%);color:#ff9933;font-size:11px;font-weight:bold;letter-spacing:1px;z-index:10;pointer-events:none;';
      document.getElementById('game-container').appendChild(_cmdModeEl);
    }
    if (airstrikeMode) {
      _cmdModeEl.style.color = '#ff4444';
      _cmdModeEl.textContent = '[ AIRSTRIKE — Right-click target ]';
    } else if (attackMoveMode) {
      _cmdModeEl.style.color = '#ff9933';
      _cmdModeEl.textContent = '[ ATTACK-MOVE — Right-click destination ]';
    } else if (airstrikeAvailable) {
      _cmdModeEl.style.color = '#ff6666';
      _cmdModeEl.textContent = '[ X — AIRSTRIKE READY ]';
    } else {
      _cmdModeEl.style.color = '#ff9933';
      const holdUnits = selected && selected.filter(u => u.holdPosition && !u.dead).length;
      _cmdModeEl.textContent = holdUnits > 0 ? `[ ${holdUnits} HOLDING POSITION ]` : '';
    }
  }

  // Drone cooldown display
  let _droneCdEl = null;
  function updateDroneCooldown(cooldown) {
    if (!_droneCdEl) {
      _droneCdEl = document.createElement('div');
      _droneCdEl.id = 'drone-cd';
      _droneCdEl.style.cssText = 'position:absolute;top:8px;right:12px;color:#888;font-size:11px;pointer-events:none;';
      document.getElementById('game-container').appendChild(_droneCdEl);
    }
    if (cooldown > 0) {
      _droneCdEl.textContent = `DRONE COOLDOWN: ${Math.ceil(cooldown)}s`;
      _droneCdEl.style.color = '#ff8844';
    } else {
      _droneCdEl.textContent = '';
    }
  }

  return {
    voice, updateResource, flashResourceRed, updateTimer, updatePower,
    updateSettlementHps, triggerAlertFlash,
    updateSelectionInfo, initBuildMenu, showBuildMenu, showUpgradePanel,
    showPlacementCursor, hidePlacementCursor, resetVoice,
    updateGroups, updateCommandMode, updateDroneCooldown,
  };
})();

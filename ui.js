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
    resBar.textContent = `IC: ${ic}`;
    resBar.style.color = ic < 50 ? '#ff6666' : '#e8d87a';
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
      div.textContent = `${s.name}: ${Math.ceil(s.hp)}/${s.maxHp}`;
      settlementHps.appendChild(div);
    }
  }

  function triggerAlertFlash() {
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
      selName.textContent = `${selected.length} units selected`;
      selDet.textContent = selected.map(u => UNIT_DEF[u.type]?.label || '').join(', ');
      selQueue.textContent = '';
      _renderBuildPanel(null, G);
      return;
    }
    const e = selected[0];
    // Unit
    if (e.path !== undefined) {
      const def = UNIT_DEF[e.type];
      selName.textContent = def.label;
      selDet.textContent = `HP: ${Math.ceil(e.hp)}/${e.maxHp}  Speed: ${e.speed}  Sight: ${e.sight}`;
      selQueue.textContent = '';
      _renderBuildPanel(null, G);
    } else {
      // Building
      const def = BUILDING_DEF[e.type];
      selName.textContent = def.label;
      const hpText = `HP: ${Math.ceil(e.hp)}/${e.maxHp}`;
      const prog = e.buildProgress < 1 ? `  Building: ${Math.floor(e.buildProgress*100)}%` : '';
      selDet.textContent = hpText + prog;
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
        if (window.G) window.G.trainUnit(building, uType);
      };
      buildPanel.appendChild(btn);
    }
  }

  function showBuildMenu(G, onPlace) {
    buildPanel.innerHTML = '';
    const playerBuildings = [
      'barracks','quarry','watchtower','wall','fortified_wall',
      'field_ops','motor_pool','defense_works',
      'radar_station','bunker','supply_depot','comms_tower','hospital','forward_post',
    ];
    for (const bType of playerBuildings) {
      const def = BUILDING_DEF[bType];
      const count = G.buildings.filter(b => b.type === bType && b.faction === 'player' && !b.dead).length;
      const atMax = def.maxCount !== undefined && count >= def.maxCount;
      const btn = document.createElement('button');
      btn.className = 'build-btn';
      btn.textContent = `${def.label}  (${def.cost} IC)${atMax ? ' [MAX]' : ''}`;
      if (atMax || G.ic < def.cost) btn.disabled = true;
      btn.onclick = () => {
        if (!atMax && G.ic >= def.cost) onPlace(bType);
      };
      buildPanel.appendChild(btn);
    }
    // cancel
    const cancel = document.createElement('button');
    cancel.className = 'build-btn';
    cancel.textContent = '— CANCEL —';
    cancel.onclick = () => { if (window.G) window.G.cancelBuildMode(); };
    buildPanel.appendChild(cancel);
  }

  function showUpgradePanel(G) {
    upgradeList.innerHTML = '';
    for (const upg of UPGRADE_DEF) {
      const already = G.upgrades[upg.id];
      const prereqMet = !upg.prereq || G.upgrades[upg.prereq];
      const bldgMet = !upg.prereqBuilding ||
        G.buildings.filter(b => b.type === upg.prereqBuilding && !b.dead).length >= (upg.prereqBuildingCount || 1);
      const canAfford = G.ic >= upg.cost;

      const row = document.createElement('div');
      row.className = 'upgrade-item';
      row.innerHTML = `
        <span>${upg.label} — ${upg.desc}</span>
        <span class="cost">${upg.cost} IC</span>
        <button id="upg-${upg.id}" ${already || !prereqMet || !bldgMet || !canAfford ? 'disabled' : ''}>
          ${already ? 'DONE' : 'BUY'}
        </button>`;
      const btn = row.querySelector('button');
      if (!already && prereqMet && bldgMet && canAfford) {
        btn.onclick = () => {
          if (window.G) window.G.purchaseUpgrade(upg);
          showUpgradePanel(G);
        };
      }
      upgradeList.appendChild(row);
    }
    upgradePanel.style.display = 'block';
  }

  document.getElementById('close-upgrade').onclick = () => {
    upgradePanel.style.display = 'none';
  };

  function showPlacementCursor(col, row, w, h, valid) {
    const x = col * TILE;
    const y = row * TILE;
    placementCursor.style.display = 'block';
    placementCursor.style.left = x + 'px';
    placementCursor.style.top  = y + 'px';
    placementCursor.style.width  = (w * TILE) + 'px';
    placementCursor.style.height = (h * TILE) + 'px';
    placementCursor.style.borderColor = valid ? 'rgba(100,200,100,0.8)' : 'rgba(200,60,60,0.8)';
    placementCursor.style.background  = valid ? 'rgba(100,200,100,0.12)' : 'rgba(200,60,60,0.12)';
  }

  function hidePlacementCursor() {
    placementCursor.style.display = 'none';
  }

  function resetVoice() {
    firedLines.clear();
    voiceLog.innerHTML = '';
  }

  return {
    voice, updateResource, flashResourceRed, updateTimer,
    updateSettlementHps, triggerAlertFlash,
    updateSelectionInfo, showBuildMenu, showUpgradePanel,
    showPlacementCursor, hidePlacementCursor, resetVoice,
  };
})();

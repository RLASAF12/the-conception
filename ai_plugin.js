// ============================================================
// AI_PLUGIN.JS — External AI decision-making interface
// ============================================================
// This module provides a hook for LLM-powered enemy AI via a proxy API.
// When configured, wave decisions and unit behavior can be influenced
// by an external AI model instead of the built-in FSM logic.

const AIPlugin = (() => {
  let config = {
    enabled: false,
    proxyUrl: '',        // e.g. 'http://localhost:3001/ai'
    apiKey: '',
    model: 'claude-sonnet-4-6',
    timeout: 5000,       // ms
    fallbackToFSM: true, // use built-in AI if API fails
  };

  let lastResponse = null;
  let pendingRequest = false;
  let requestCooldown = 0; // seconds until next API call allowed

  function configure(opts) {
    Object.assign(config, opts);
    console.log('[AIPlugin] Configured:', config.enabled ? 'ENABLED' : 'disabled');
  }

  function isEnabled() {
    return config.enabled && config.proxyUrl.length > 0;
  }

  // Build a game state summary for the AI to reason about
  function _buildContext(G) {
    const enemyUnits = G.units.filter(u => u.faction === 'enemy' && !u.dead);
    const playerUnits = G.units.filter(u => u.faction === 'player' && !u.dead);
    const enemyBuildings = G.buildings.filter(b => b.faction === 'enemy' && !b.dead);
    const playerBuildings = G.buildings.filter(b => b.faction === 'player' && !b.dead);

    return {
      elapsed: Math.floor(G.elapsedTime),
      phase: G.aiBuildPhase,
      enemy: {
        units: enemyUnits.map(u => ({ type: u.type, col: Math.floor(u.col), row: Math.floor(u.row), hp: u.hp, state: u.aiState })),
        buildings: enemyBuildings.map(b => ({ type: b.type, col: b.col, row: b.row, hp: b.hp })),
        unitCount: enemyUnits.length,
        buildingCount: enemyBuildings.length,
      },
      player: {
        units: playerUnits.map(u => ({ type: u.type, col: Math.floor(u.col), row: Math.floor(u.row), hp: u.hp })),
        buildings: playerBuildings.map(b => ({ type: b.type, col: b.col, row: b.row, hp: b.hp })),
        unitCount: playerUnits.length,
        buildingCount: playerBuildings.length,
      },
      mapSize: { cols: COLS, rows: ROWS },
    };
  }

  // Request a strategic decision from the external AI
  async function requestDecision(G, decisionType) {
    if (!isEnabled() || pendingRequest || requestCooldown > 0) return null;

    const context = _buildContext(G);
    const prompt = _buildPrompt(decisionType, context);

    pendingRequest = true;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.timeout);

      const response = await fetch(config.proxyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.apiKey ? { 'Authorization': `Bearer ${config.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: config.model,
          prompt: prompt,
          context: context,
          decision_type: decisionType,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn(`[AIPlugin] API returned ${response.status}`);
        return null;
      }

      const data = await response.json();
      lastResponse = data;
      requestCooldown = 10; // min 10s between API calls
      return data.decision || null;
    } catch (err) {
      if (err.name === 'AbortError') {
        console.warn('[AIPlugin] Request timed out');
      } else {
        console.warn('[AIPlugin] Request failed:', err.message);
      }
      return null;
    } finally {
      pendingRequest = false;
    }
  }

  function _buildPrompt(decisionType, context) {
    const base = `You are the enemy AI commander in a real-time strategy game. ` +
      `The map is ${context.mapSize.cols}x${context.mapSize.rows}. ` +
      `Game time: ${context.elapsed}s. Phase: ${context.phase}. ` +
      `You have ${context.enemy.unitCount} units and ${context.enemy.buildingCount} buildings. ` +
      `The player has ${context.player.unitCount} units and ${context.player.buildingCount} buildings.`;

    switch (decisionType) {
      case 'wave_target':
        return base + ` Decide the target row (0-${context.mapSize.rows - 1}) for the next attack wave. ` +
          `Consider where the player's defenses are weakest. ` +
          `Respond with JSON: { "targetRow": <number>, "strategy": "flank"|"rush"|"siege" }`;

      case 'build_priority':
        return base + ` Decide what building to prioritize next. ` +
          `Options: veil_barracks, armory, tunnel_entrance, veil_watch_post, veil_depot, veil_airbase, veil_foundry. ` +
          `Respond with JSON: { "building": "<type>", "reason": "<brief>" }`;

      case 'unit_tactic':
        return base + ` Suggest a tactic for idle enemy units. ` +
          `Options: patrol, assault, guard, retreat. ` +
          `Respond with JSON: { "tactic": "<action>", "focusRow": <number> }`;

      default:
        return base + ` Provide a general strategic suggestion. Respond with JSON.`;
    }
  }

  // Called from AI.tick() to update cooldown
  function update(dt) {
    if (requestCooldown > 0) requestCooldown -= dt;
  }

  // Get last AI response for debug display
  function getLastResponse() {
    return lastResponse;
  }

  return {
    configure,
    isEnabled,
    requestDecision,
    update,
    getLastResponse,
  };
})();

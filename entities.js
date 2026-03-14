// ============================================================
// ENTITIES.JS — All constants, unit/building definitions
// ============================================================

const TILE = 32;
const COLS = 40;
const ROWS = 30;
const CANVAS_W = 1280;
const CANVAS_H = 840; // 960 - 120px HUD

// ---- Faction colours — Red Alert military palette ----
const COL = {
  player:   '#44aa22',      // Allied military green
  enemy:    '#cc2222',      // Soviet red
  neutral:  '#aaaaaa',      // Gray
  fog:      '#000000',      // Black
  revealed: 'rgba(0,0,0,0.5)',
  grass:    '#385818',      // Military green
  dirt:     '#5a4828',      // Warm brown
  select:   '#44ff44',      // Bright green selection
  settle:   '#88cc88',      // Settlement green
};

// ---- Building definitions ----
const BUILDING_DEF = {
  // --- Player ---
  command_base: {
    label: 'Command Base', faction: 'player',
    hp: 500, cost: 0, buildTime: 0, size: [2,2], sight: 6,
    color: '#2a6acc', trainable: ['drone','helicopter'],
  },
  barracks: {
    label: 'Barracks', faction: 'player',
    hp: 250, cost: 200, buildTime: 20, size: [2,2], sight: 0,
    color: '#4a7a22', trainable: ['soldier','scout_vehicle','tank','spec_ops'], maxCount: 2,
  },
  quarry: {
    label: 'Quarry', faction: 'player',
    hp: 200, cost: 150, buildTime: 15, size: [1,2], sight: 0,
    color: '#7a5a28', trainable: [], maxCount: 3,
  },
  watchtower: {
    label: 'Watchtower', faction: 'player',
    hp: 150, cost: 100, buildTime: 10, size: [1,1], sight: 8,
    color: '#3a6a2a', trainable: [], maxCount: 5,
  },
  wall: {
    label: 'Wall', faction: 'player',
    hp: 300, cost: 30, buildTime: 5, size: [1,1], sight: 0,
    color: '#7a7a7a', trainable: [], maxCount: Infinity,
  },
  field_ops: {
    label: 'Field Ops', faction: 'player',
    hp: 220, cost: 175, buildTime: 18, size: [2,2], sight: 0,
    color: '#4a6a8a', trainable: ['engineer','medic','sniper'], maxCount: 2,
  },
  motor_pool: {
    label: 'Motor Pool', faction: 'player',
    hp: 280, cost: 300, buildTime: 25, size: [2,2], sight: 0,
    color: '#7a6a22', trainable: ['apc','artillery','harvester'], maxCount: 1,
  },
  defense_works: {
    label: 'Defense Works', faction: 'player',
    hp: 240, cost: 225, buildTime: 20, size: [2,2], sight: 0,
    color: '#4a6a44', trainable: ['anti_air'], maxCount: 2,
  },
  radar_station: {
    label: 'Radar Station', faction: 'player',
    hp: 160, cost: 200, buildTime: 15, size: [1,2], sight: 12,
    color: '#2a8a8a', trainable: [], maxCount: 2,
  },
  bunker: {
    label: 'Bunker', faction: 'player',
    hp: 500, cost: 120, buildTime: 12, size: [1,1], sight: 0,
    color: '#5a6a5a', trainable: [], maxCount: 6,
  },
  supply_depot: {
    label: 'Supply Depot', faction: 'player',
    hp: 180, cost: 140, buildTime: 14, size: [1,2], sight: 0,
    color: '#8a7a3a', trainable: [], maxCount: 2,
  },
  comms_tower: {
    label: 'Comms Tower', faction: 'player',
    hp: 120, cost: 160, buildTime: 12, size: [1,1], sight: 5,
    color: '#2a9a7a', trainable: [], maxCount: 3,
  },
  hospital: {
    label: 'Hospital', faction: 'player',
    hp: 200, cost: 180, buildTime: 16, size: [2,1], sight: 0,
    color: '#cc3355', trainable: [], maxCount: 2,
  },
  forward_post: {
    label: 'Forward Post', faction: 'player',
    hp: 150, cost: 100, buildTime: 10, size: [1,1], sight: 4,
    color: '#4a5a6a', trainable: [], maxCount: 3, forwardPost: true,
  },
  fortified_wall: {
    label: 'Fortified Wall', faction: 'player',
    hp: 600, cost: 50, buildTime: 8, size: [1,1], sight: 0,
    color: '#8a8a8a', trainable: [], maxCount: Infinity,
  },
  // --- Enemy (Veil) — Soviet red palette ---
  veil_command: {
    label: 'Veil Command Base', faction: 'enemy',
    hp: 600, cost: 0, buildTime: 0, size: [2,2], sight: 0,
    color: '#aa1a1a', trainable: [],
  },
  veil_barracks: {
    label: 'Veil Barracks', faction: 'enemy',
    hp: 300, cost: 0, buildTime: 0, size: [2,2], sight: 0,
    color: '#881a1a', trainable: ['veil_soldier','veil_raider'],
  },
  tunnel_entrance: {
    label: 'Tunnel Entrance', faction: 'enemy',
    hp: 180, cost: 0, buildTime: 0, size: [1,1], sight: 0,
    color: '#4a2a0a', trainable: ['infiltrator'],
  },
  rocket_platform: {
    label: 'Rocket Platform', faction: 'enemy',
    hp: 220, cost: 0, buildTime: 0, size: [1,1], sight: 0,
    color: '#6a3a18', trainable: [],
  },
  armory: {
    label: 'Armory', faction: 'enemy',
    hp: 250, cost: 0, buildTime: 0, size: [1,1], sight: 0,
    color: '#882222', trainable: ['veil_heavy','veil_artillery'],
  },
  veil_watch_post: {
    label: 'Veil Watch Post', faction: 'enemy',
    hp: 150, cost: 0, buildTime: 0, size: [1,1], sight: 6,
    color: '#772232', trainable: ['veil_scout','veil_sniper'],
  },
  veil_workshop: {
    label: 'Veil Workshop', faction: 'enemy',
    hp: 200, cost: 0, buildTime: 0, size: [1,1], sight: 0,
    color: '#6a2a18', trainable: ['veil_engineer'],
  },
  veil_depot: {
    label: 'Veil Depot', faction: 'enemy',
    hp: 220, cost: 0, buildTime: 0, size: [1,2], sight: 0,
    color: '#8a2a18', trainable: ['veil_bomber','veil_truck'],
  },
  veil_airbase: {
    label: 'Veil Airbase', faction: 'enemy',
    hp: 200, cost: 0, buildTime: 0, size: [2,2], sight: 0,
    color: '#6a2233', trainable: ['veil_drone'],
  },
  veil_foundry: {
    label: 'Veil Foundry', faction: 'enemy',
    hp: 280, cost: 0, buildTime: 0, size: [2,2], sight: 0,
    color: '#7a1a0a', trainable: ['veil_tank'],
  },
  veil_bunker: {
    label: 'Veil Bunker', faction: 'enemy',
    hp: 450, cost: 0, buildTime: 0, size: [1,1], sight: 0,
    color: '#4a2a2a', trainable: [],
  },
  veil_wall: {
    label: 'Veil Wall', faction: 'enemy',
    hp: 250, cost: 0, buildTime: 0, size: [1,1], sight: 0,
    color: '#5a3333', trainable: [],
  },
  veil_hospital: {
    label: 'Veil Field Hospital', faction: 'enemy',
    hp: 180, cost: 0, buildTime: 0, size: [1,2], sight: 0,
    color: '#882233', trainable: [],
  },
  veil_radar: {
    label: 'Veil Radar', faction: 'enemy',
    hp: 160, cost: 0, buildTime: 0, size: [1,1], sight: 10,
    color: '#6a2244', trainable: [],
  },
  veil_fort: {
    label: 'Veil Fortress', faction: 'enemy',
    hp: 500, cost: 0, buildTime: 0, size: [2,2], sight: 0,
    color: '#5a0a0a', trainable: [],
  },
  // --- Neutral ---
  settlement: {
    label: 'Settlement', faction: 'neutral',
    hp: 300, cost: 0, buildTime: 0, size: [2,2], sight: 0,
    color: '#88cc88', trainable: [],
  },
  intel_cache: {
    label: 'Intel Cache', faction: 'neutral',
    hp: 60, cost: 0, buildTime: 0, size: [1,1], sight: 0,
    color: '#4488cc', trainable: [], icCapacity: 300, icRemaining: 300,
    isResource: true,
  },
};

// ---- Unit definitions ----
const UNIT_DEF = {
  // --- Player ---
  soldier: {
    label: 'Soldier', faction: 'player',
    hp: 60, damage: 5, speed: 1.5, sight: 3, cost: 50, buildTime: 8,
    maxActive: 12, color: '#5a8a22', attackRange: 2, splash: false,
    canAttackBuildings: false,
  },
  scout_vehicle: {
    label: 'Scout Vehicle', faction: 'player',
    hp: 80, damage: 8, speed: 2.5, sight: 8, cost: 150, buildTime: 12,
    maxActive: 4, color: '#2a9a7a', attackRange: 2, splash: false,
    canAttackBuildings: false,
  },
  tank: {
    label: 'Tank', faction: 'player',
    hp: 250, damage: 25, speed: 1.0, sight: 3, cost: 350, buildTime: 25,
    maxActive: 3, color: '#4a6a9a', attackRange: 3, splash: true, splashRange: 1,
    canAttackBuildings: true,
  },
  drone: {
    label: 'Drone', faction: 'player',
    hp: 40, damage: 0, speed: 3.5, sight: 12, cost: 300, buildTime: 20,
    maxActive: 2, color: '#88ccee', attackRange: 0, splash: false,
    canAttackBuildings: false, cooldownAfterDeath: 60, flying: true,
  },
  engineer: {
    label: 'Engineer', faction: 'player',
    hp: 50, damage: 3, speed: 1.5, sight: 3, cost: 75, buildTime: 10,
    maxActive: 4, color: '#cc8822', attackRange: 1, splash: false,
    canAttackBuildings: false, repairTarget: true,
  },
  sniper: {
    label: 'Sniper', faction: 'player',
    hp: 45, damage: 20, speed: 1.0, sight: 6, cost: 200, buildTime: 15,
    maxActive: 3, color: '#6a8a5a', attackRange: 4, splash: false,
    canAttackBuildings: false,
  },
  medic: {
    label: 'Medic', faction: 'player',
    hp: 55, damage: 0, speed: 1.5, sight: 3, cost: 100, buildTime: 10,
    maxActive: 3, color: '#44cc88', attackRange: 0, splash: false,
    canAttackBuildings: false, healer: true,
  },
  spec_ops: {
    label: 'Spec Ops', faction: 'player',
    hp: 70, damage: 12, speed: 2.5, sight: 5, cost: 250, buildTime: 18,
    maxActive: 3, color: '#3344aa', attackRange: 2, splash: false,
    canAttackBuildings: false, stealthy: true,
  },
  apc: {
    label: 'APC', faction: 'player',
    hp: 180, damage: 6, speed: 2.0, sight: 3, cost: 275, buildTime: 20,
    maxActive: 2, color: '#4a6a88', attackRange: 2, splash: false,
    canAttackBuildings: true,
  },
  artillery: {
    label: 'Artillery', faction: 'player',
    hp: 200, damage: 40, speed: 0.5, sight: 3, cost: 400, buildTime: 30,
    maxActive: 2, color: '#c8aa28', attackRange: 6, splash: true, splashRange: 2,
    canAttackBuildings: true,
  },
  helicopter: {
    label: 'Helicopter', faction: 'player',
    hp: 90, damage: 10, speed: 3.0, sight: 7, cost: 320, buildTime: 22,
    maxActive: 2, color: '#5aaa66', attackRange: 3, splash: false,
    canAttackBuildings: true, flying: true,
  },
  anti_air: {
    label: 'Anti-Air', faction: 'player',
    hp: 100, damage: 18, speed: 1.0, sight: 4, cost: 180, buildTime: 14,
    maxActive: 3, color: '#cc5566', attackRange: 4, splash: false,
    canAttackBuildings: false, antiAirOnly: true,
  },
  harvester: {
    label: 'Harvester', faction: 'player',
    hp: 160, damage: 0, speed: 1.2, sight: 3, cost: 220, buildTime: 20,
    maxActive: 2, color: '#ddaa22', attackRange: 0, splash: false,
    canAttackBuildings: false, isHarvester: true,
  },
  // --- Enemy (Veil) — Soviet red palette ---
  veil_soldier: {
    label: 'Veil Soldier', faction: 'enemy',
    hp: 50, damage: 4, speed: 1.5, sight: 3, cost: 0, buildTime: 8,
    maxActive: 999, color: '#cc2222', attackRange: 2, splash: false,
    canAttackBuildings: true,
  },
  veil_raider: {
    label: 'Veil Raider', faction: 'enemy',
    hp: 90, damage: 10, speed: 2.0, sight: 3, cost: 0, buildTime: 10,
    maxActive: 999, color: '#bb1111', attackRange: 2, splash: false,
    canAttackBuildings: true, prioritizeSettlements: true,
  },
  veil_heavy: {
    label: 'Veil Heavy', faction: 'enemy',
    hp: 300, damage: 30, speed: 0.8, sight: 3, cost: 0, buildTime: 20,
    maxActive: 999, color: '#880000', attackRange: 3, splash: false,
    canAttackBuildings: true, targetCommandBase: true,
  },
  infiltrator: {
    label: 'Infiltrator', faction: 'enemy',
    hp: 40, damage: 6, speed: 2.5, sight: 3, cost: 0, buildTime: 6,
    maxActive: 999, color: '#881a44', attackRange: 1, splash: false,
    canAttackBuildings: true, spawnInsidePerimeter: true,
  },
  veil_scout: {
    label: 'Veil Scout', faction: 'enemy',
    hp: 35, damage: 2, speed: 3.0, sight: 6, cost: 0, buildTime: 6,
    maxActive: 999, color: '#cc4433', attackRange: 2, splash: false,
    canAttackBuildings: false,
  },
  veil_sniper: {
    label: 'Veil Sniper', faction: 'enemy',
    hp: 40, damage: 18, speed: 0.8, sight: 5, cost: 0, buildTime: 12,
    maxActive: 999, color: '#993322', attackRange: 4, splash: false,
    canAttackBuildings: false, targetWatchtowers: true,
  },
  veil_engineer: {
    label: 'Veil Engineer', faction: 'enemy',
    hp: 45, damage: 0, speed: 1.5, sight: 2, cost: 0, buildTime: 8,
    maxActive: 999, color: '#884422', attackRange: 0, splash: false,
    canAttackBuildings: false, repairEnemy: true,
  },
  veil_artillery: {
    label: 'Veil Artillery', faction: 'enemy',
    hp: 180, damage: 35, speed: 0.4, sight: 2, cost: 0, buildTime: 20,
    maxActive: 999, color: '#773322', attackRange: 5, splash: true, splashRange: 2,
    canAttackBuildings: true,
  },
  veil_bomber: {
    label: 'Veil Bomber', faction: 'enemy',
    hp: 30, damage: 50, speed: 2.5, sight: 3, cost: 0, buildTime: 8,
    maxActive: 999, color: '#882233', attackRange: 1, splash: true, splashRange: 1,
    canAttackBuildings: true, suicideBomber: true,
  },
  veil_truck: {
    label: 'Veil Troop Truck', faction: 'enemy',
    hp: 120, damage: 5, speed: 2.5, sight: 2, cost: 0, buildTime: 10,
    maxActive: 999, color: '#774422', attackRange: 1, splash: false,
    canAttackBuildings: false, troopDeploy: true,
  },
  veil_drone: {
    label: 'Veil Drone', faction: 'enemy',
    hp: 30, damage: 0, speed: 3.5, sight: 8, cost: 0, buildTime: 8,
    maxActive: 999, color: '#881122', attackRange: 0, splash: false,
    canAttackBuildings: false, flying: true,
  },
  veil_tank: {
    label: 'Veil Tank', faction: 'enemy',
    hp: 280, damage: 28, speed: 0.9, sight: 3, cost: 0, buildTime: 22,
    maxActive: 999, color: '#771111', attackRange: 3, splash: false,
    canAttackBuildings: true, targetCommandBase: true,
  },
};

// ---- Intelligence Upgrade definitions ----
// tx/ty: grid position in tech tree (col, row), 0-indexed
const UPGRADE_DEF = [
  {
    id: 'scout_speed_1', label: 'Scout Speed I', cost: 150,
    desc: 'Scout Vehicles +40% speed',
    prereq: null, tx: 0, ty: 0,
    apply(state) {
      state.upgrades.scout_speed_1 = true;
      state.units.filter(u => u.type === 'scout_vehicle' && u.faction === 'player')
        .forEach(u => u.speed = UNIT_DEF.scout_vehicle.speed * 1.4);
    },
  },
  {
    id: 'extended_reveal_1', label: 'Extended Reveal I', cost: 200,
    desc: 'Scout Vehicle sight: 8 → 10',
    prereq: null, tx: 0, ty: 1,
    apply(state) {
      state.upgrades.extended_reveal_1 = true;
      state.units.filter(u => u.type === 'scout_vehicle' && u.faction === 'player')
        .forEach(u => u.sight = 10);
    },
  },
  {
    id: 'drone_resilience', label: 'Drone Resilience', cost: 250,
    desc: 'Drone HP: 40 → 90',
    prereq: null, tx: 0, ty: 2,
    apply(state) {
      state.upgrades.drone_resilience = true;
      state.units.filter(u => u.type === 'drone' && u.faction === 'player')
        .forEach(u => { u.maxHp = 90; u.hp = Math.min(u.hp + 50, 90); });
    },
  },
  {
    id: 'deep_intel', label: 'Deep Intel', cost: 300,
    desc: 'Enemy building discovery: 50 → 100 IC',
    prereq: 'scout_speed_1', tx: 1, ty: 0,
    apply(state) { state.upgrades.deep_intel = true; },
  },
  {
    id: 'overwatch', label: 'Overwatch', cost: 300,
    desc: 'Watchtower sight: 8 → 12 tiles',
    prereq: null, prereqBuilding: 'watchtower', prereqBuildingCount: 2, tx: 1, ty: 1,
    apply(state) {
      state.upgrades.overwatch = true;
      state.buildings.filter(b => b.type === 'watchtower' && b.faction === 'player')
        .forEach(b => b.sight = 12);
    },
  },
  {
    id: 'emergency_airstrike', label: 'Emergency Airstrike', cost: 400,
    desc: 'One-time: reveals + deals 200 dmg to one sector',
    prereq: 'deep_intel', tx: 2, ty: 0,
    apply(state) { state.upgrades.emergency_airstrike = true; state.airstrikeAvailable = true; },
  },
  {
    id: 'field_comms', label: 'Field Comms', cost: 250,
    desc: 'Unit sight radius +1 globally',
    prereq: 'extended_reveal_1', tx: 1, ty: 2,
    apply(state) {
      state.upgrades.field_comms = true;
      state.units.filter(u => u.faction === 'player').forEach(u => u.sight += 1);
    },
  },
  {
    id: 'armor_plating', label: 'Armor Plating', cost: 350,
    desc: 'Tanks and APCs +30% max HP',
    prereq: null, tx: 0, ty: 3,
    prereqBuilding: 'motor_pool',
    apply(state) {
      state.upgrades.armor_plating = true;
      state.units.filter(u => (u.type === 'tank' || u.type === 'apc') && u.faction === 'player')
        .forEach(u => { u.maxHp = Math.round(u.maxHp * 1.3); u.hp = Math.min(u.hp + 50, u.maxHp); });
    },
  },
  {
    id: 'rapid_training', label: 'Rapid Training', cost: 300,
    desc: 'All unit train time -20%',
    prereq: 'armor_plating', tx: 1, ty: 3,
    apply(state) { state.upgrades.rapid_training = true; },
  },
  {
    id: 'ghost_protocol', label: 'Ghost Protocol', cost: 450,
    desc: 'Spec Ops: ignore enemy sight, +25% damage',
    prereq: 'field_comms', tx: 2, ty: 2,
    apply(state) {
      state.upgrades.ghost_protocol = true;
      state.units.filter(u => u.type === 'spec_ops' && u.faction === 'player')
        .forEach(u => { u.damage = Math.round(u.damage * 1.25); });
    },
  },
];

// ---- Pathfinding (simple BFS on tile grid) ----
function bfsPath(grid, startCol, startRow, endCol, endRow) {
  if (startCol === endCol && startRow === endRow) return [];
  const visited = new Uint8Array(COLS * ROWS);
  const prev = new Int16Array(COLS * ROWS).fill(-1);
  const queue = [startRow * COLS + startCol];
  visited[startRow * COLS + startCol] = 1;
  const dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
  while (queue.length) {
    const cur = queue.shift();
    const cr = Math.floor(cur / COLS);
    const cc = cur % COLS;
    if (cc === endCol && cr === endRow) {
      // reconstruct
      const path = [];
      let node = cur;
      while (node !== startRow * COLS + startCol) {
        path.unshift({ col: node % COLS, row: Math.floor(node / COLS) });
        node = prev[node];
      }
      return path;
    }
    for (const [dc, dr] of dirs) {
      const nc = cc + dc, nr = cr + dr;
      if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
      const idx = nr * COLS + nc;
      if (visited[idx]) continue;
      if (grid[idx] === 1) continue; // blocked (wall/building)
      visited[idx] = 1;
      prev[idx] = cur;
      queue.push(idx);
    }
  }
  return null; // no path
}

// ---- A* Pathfinding (replaces BFS for smoother, faster paths) ----
// Uses octile distance heuristic; diagonal cost = 1.414, straight = 1.0
// Falls back to null if no path found within 800 node expansions.
function aStarPath(grid, startCol, startRow, endCol, endRow) {
  if (startCol === endCol && startRow === endRow) return [];
  const MAX_EXPAND = 800;
  const SQRT2 = 1.4142135623730951;

  // Min-heap operations (index array: [f, idx, ...])
  const heap = [];
  const heapPush = (f, idx) => {
    heap.push([f, idx]);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const heapPop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      while (true) {
        let s = i, l = 2*i+1, r = 2*i+2;
        if (l < heap.length && heap[l][0] < heap[s][0]) s = l;
        if (r < heap.length && heap[r][0] < heap[s][0]) s = r;
        if (s === i) break;
        [heap[s], heap[i]] = [heap[i], heap[s]];
        i = s;
      }
    }
    return top;
  };

  const SIZE = COLS * ROWS;
  const gCost = new Float32Array(SIZE).fill(Infinity);
  const prev = new Int32Array(SIZE).fill(-1);
  const closed = new Uint8Array(SIZE);

  const startIdx = startRow * COLS + startCol;
  const endIdx = endRow * COLS + endCol;

  // Octile distance heuristic
  const heuristic = (c, r) => {
    const dc = Math.abs(c - endCol), dr = Math.abs(r - endRow);
    return Math.max(dc, dr) + (SQRT2 - 1) * Math.min(dc, dr);
  };

  gCost[startIdx] = 0;
  heapPush(heuristic(startCol, startRow), startIdx);

  const dirs = [[-1,0,1],[1,0,1],[0,-1,1],[0,1,1],[-1,-1,SQRT2],[1,-1,SQRT2],[-1,1,SQRT2],[1,1,SQRT2]];
  let expanded = 0;

  while (heap.length > 0) {
    const [, cur] = heapPop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    expanded++;
    if (expanded > MAX_EXPAND) break;

    if (cur === endIdx) {
      const path = [];
      let node = cur;
      while (node !== startIdx) {
        path.unshift({ col: node % COLS, row: Math.floor(node / COLS) });
        node = prev[node];
      }
      return path;
    }

    const cc = cur % COLS, cr = Math.floor(cur / COLS);
    for (const [dc, dr, cost] of dirs) {
      const nc = cc + dc, nr = cr + dr;
      if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
      const nIdx = nr * COLS + nc;
      if (closed[nIdx] || grid[nIdx] === 1) continue;
      const ng = gCost[cur] + cost;
      if (ng < gCost[nIdx]) {
        gCost[nIdx] = ng;
        prev[nIdx] = cur;
        heapPush(ng + heuristic(nc, nr), nIdx);
      }
    }
  }
  return null; // no path found
}

// ---- Factory functions ----
let _nextId = 1;
function mkId() { return _nextId++; }

function createUnit(type, col, row, faction) {
  const def = UNIT_DEF[type];
  return {
    id: mkId(), type, faction,
    col: col + 0.5, row: row + 0.5, // center of tile
    hp: def.hp, maxHp: def.hp,
    damage: def.damage,
    speed: def.speed,
    sight: def.sight,
    path: [], pathQueue: [], target: null,
    attackTarget: null, attackCooldown: 0,
    discovered: false, // for IC reward
    dead: false,
    buildTime: def.buildTime,
    kills: 0, stars: 0,   // veterancy
    loadedUnits: [],       // APC garrison
  };
}

function createBuilding(type, col, row, faction) {
  const def = BUILDING_DEF[type];
  const [w, h] = def.size;
  return {
    id: mkId(), type, faction,
    col, row, w, h,
    hp: def.hp, maxHp: def.hp,
    sight: def.sight || 0,
    buildProgress: (faction === 'player' && def.buildTime > 0) ? 0 : 1, // 0..1
    buildTimeTotal: def.buildTime,
    trainQueue: [],
    trainTimer: 0,
    discovered: false,
    dead: false,
  };
}

function createSettlement(col, row, name, population) {
  const b = createBuilding('settlement', col, row, 'neutral');
  b.name = name;
  b.population = population;
  b.underAttack = false;
  b.alertFired = false;
  b.alert50Fired = false;
  return b;
}

// ============================================================
// ENTITIES.JS — All constants, unit/building definitions
// ============================================================

const TILE = 32;
const COLS = 40;
const ROWS = 30;
const CANVAS_W = 1280;
const CANVAS_H = 840; // 960 - 120px HUD

// ---- Faction colours ----
const COL = {
  player:   '#4a9eff',
  enemy:    '#ff4a4a',
  neutral:  '#aaaaaa',
  fog:      '#000000',
  revealed: 'rgba(0,0,0,0.35)',  // dim overlay for "seen but not currently lit"
  grass:    '#2a3a1a',
  dirt:     '#3a3020',
  select:   '#e8d87a',
  settle:   '#88cc88',
};

// ---- Building definitions ----
const BUILDING_DEF = {
  // --- Player ---
  command_base: {
    label: 'Command Base', faction: 'player',
    hp: 500, cost: 0, buildTime: 0, size: [2,2], sight: 6,
    color: '#3a7aff', trainable: ['drone'],
  },
  barracks: {
    label: 'Barracks', faction: 'player',
    hp: 250, cost: 200, buildTime: 20, size: [2,2], sight: 0,
    color: '#2a5aaa', trainable: ['soldier','scout_vehicle','tank'], maxCount: 2,
  },
  quarry: {
    label: 'Quarry', faction: 'player',
    hp: 200, cost: 150, buildTime: 15, size: [1,2], sight: 0,
    color: '#6a4a2a', trainable: [], maxCount: 3,
  },
  watchtower: {
    label: 'Watchtower', faction: 'player',
    hp: 150, cost: 100, buildTime: 10, size: [1,1], sight: 8,
    color: '#4a8a4a', trainable: [], maxCount: 5,
  },
  wall: {
    label: 'Wall', faction: 'player',
    hp: 300, cost: 30, buildTime: 5, size: [1,1], sight: 0,
    color: '#888888', trainable: [], maxCount: Infinity,
  },
  // --- Enemy (Veil) ---
  veil_command: {
    label: 'Veil Command Base', faction: 'enemy',
    hp: 600, cost: 0, buildTime: 0, size: [2,2], sight: 0,
    color: '#aa2222', trainable: [],
  },
  veil_barracks: {
    label: 'Veil Barracks', faction: 'enemy',
    hp: 300, cost: 0, buildTime: 0, size: [2,2], sight: 0,
    color: '#882222', trainable: ['veil_soldier','veil_raider'],
  },
  tunnel_entrance: {
    label: 'Tunnel Entrance', faction: 'enemy',
    hp: 180, cost: 0, buildTime: 0, size: [1,1], sight: 0,
    color: '#553311', trainable: ['infiltrator'],
  },
  rocket_platform: {
    label: 'Rocket Platform', faction: 'enemy',
    hp: 220, cost: 0, buildTime: 0, size: [1,1], sight: 0,
    color: '#774422', trainable: [],
  },
  armory: {
    label: 'Armory', faction: 'enemy',
    hp: 250, cost: 0, buildTime: 0, size: [1,1], sight: 0,
    color: '#992222', trainable: ['veil_heavy'],
  },
  // --- Neutral ---
  settlement: {
    label: 'Settlement', faction: 'neutral',
    hp: 300, cost: 0, buildTime: 0, size: [2,2], sight: 0,
    color: '#88cc88', trainable: [],
  },
};

// ---- Unit definitions ----
const UNIT_DEF = {
  // --- Player ---
  soldier: {
    label: 'Soldier', faction: 'player',
    hp: 60, damage: 5, speed: 1.5, sight: 3, cost: 50, buildTime: 8,
    maxActive: 12, color: '#4a9eff', attackRange: 2, splash: false,
    canAttackBuildings: false,
  },
  scout_vehicle: {
    label: 'Scout Vehicle', faction: 'player',
    hp: 80, damage: 8, speed: 2.5, sight: 8, cost: 150, buildTime: 12,
    maxActive: 4, color: '#44ddff', attackRange: 2, splash: false,
    canAttackBuildings: false,
  },
  tank: {
    label: 'Tank', faction: 'player',
    hp: 250, damage: 25, speed: 1.0, sight: 3, cost: 350, buildTime: 25,
    maxActive: 3, color: '#8888ff', attackRange: 3, splash: true, splashRange: 1,
    canAttackBuildings: true,
  },
  drone: {
    label: 'Drone', faction: 'player',
    hp: 40, damage: 0, speed: 3.5, sight: 12, cost: 300, buildTime: 20,
    maxActive: 2, color: '#aaffff', attackRange: 0, splash: false,
    canAttackBuildings: false, cooldownAfterDeath: 60,
  },
  // --- Enemy (Veil) ---
  veil_soldier: {
    label: 'Veil Soldier', faction: 'enemy',
    hp: 50, damage: 4, speed: 1.5, sight: 3, cost: 0, buildTime: 8,
    maxActive: 999, color: '#ff6666', attackRange: 2, splash: false,
    canAttackBuildings: true,
  },
  veil_raider: {
    label: 'Veil Raider', faction: 'enemy',
    hp: 90, damage: 10, speed: 2.0, sight: 3, cost: 0, buildTime: 10,
    maxActive: 999, color: '#ff4444', attackRange: 2, splash: false,
    canAttackBuildings: true, prioritizeSettlements: true,
  },
  veil_heavy: {
    label: 'Veil Heavy', faction: 'enemy',
    hp: 300, damage: 30, speed: 0.8, sight: 3, cost: 0, buildTime: 20,
    maxActive: 999, color: '#ff2222', attackRange: 3, splash: false,
    canAttackBuildings: true, targetCommandBase: true,
  },
  infiltrator: {
    label: 'Infiltrator', faction: 'enemy',
    hp: 40, damage: 6, speed: 2.5, sight: 3, cost: 0, buildTime: 6,
    maxActive: 999, color: '#cc3333', attackRange: 1, splash: false,
    canAttackBuildings: true, spawnInsidePerimeter: true,
  },
};

// ---- Intelligence Upgrade definitions ----
const UPGRADE_DEF = [
  {
    id: 'scout_speed_1', label: 'Scout Speed I', cost: 150,
    desc: 'Scout Vehicles +40% speed',
    prereq: null, // quarry already checked globally
    apply(state) {
      state.upgrades.scout_speed_1 = true;
      state.units.filter(u => u.type === 'scout_vehicle' && u.faction === 'player')
        .forEach(u => u.speed = UNIT_DEF.scout_vehicle.speed * 1.4);
    },
  },
  {
    id: 'extended_reveal_1', label: 'Extended Reveal I', cost: 200,
    desc: 'Scout Vehicle sight: 8 → 10',
    prereq: null,
    apply(state) {
      state.upgrades.extended_reveal_1 = true;
      state.units.filter(u => u.type === 'scout_vehicle' && u.faction === 'player')
        .forEach(u => u.sight = 10);
    },
  },
  {
    id: 'drone_resilience', label: 'Drone Resilience', cost: 250,
    desc: 'Drone HP: 40 → 90',
    prereq: null,
    apply(state) {
      state.upgrades.drone_resilience = true;
      state.units.filter(u => u.type === 'drone' && u.faction === 'player')
        .forEach(u => { u.maxHp = 90; u.hp = Math.min(u.hp + 50, 90); });
    },
  },
  {
    id: 'deep_intel', label: 'Deep Intel', cost: 300,
    desc: 'Enemy building discovery: 50 → 100 IC',
    prereq: 'scout_speed_1',
    apply(state) { state.upgrades.deep_intel = true; },
  },
  {
    id: 'overwatch', label: 'Overwatch', cost: 300,
    desc: 'Watchtower sight: 8 → 12 tiles',
    prereq: null, prereqBuilding: 'watchtower', prereqBuildingCount: 2,
    apply(state) {
      state.upgrades.overwatch = true;
      state.buildings.filter(b => b.type === 'watchtower' && b.faction === 'player')
        .forEach(b => b.sight = 12);
    },
  },
  {
    id: 'emergency_airstrike', label: 'Emergency Airstrike', cost: 400,
    desc: 'One-time: reveals + deals 200 dmg to one sector',
    prereq: 'deep_intel',
    apply(state) { state.upgrades.emergency_airstrike = true; state.airstrikeAvailable = true; },
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
    path: [], target: null,
    attackTarget: null, attackCooldown: 0,
    discovered: false, // for IC reward
    dead: false,
    buildTime: def.buildTime,
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

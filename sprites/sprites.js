// ============================================================
// SPRITES.JS — Asset map and async preloader
// Drop PNG files from Kenney.nl packs into the folders below,
// using the filenames listed in SPRITE_MAP. Any missing sprite
// gracefully falls back to procedural canvas drawing.
//
// Recommended Kenney.nl packs (all CC0/public domain):
//   kenney.nl/assets/topdown-tanks-redux  → units/  (tanks, APC, helicopters)
//   kenney.nl/assets/topdown-shooter      → units/  (soldiers, infantry)
//   kenney.nl/assets/military-top-down    → buildings/ + units/
//   kenney.nl/assets/grassy-tiles         → terrain/
// ============================================================

const SPRITE_MAP = {
  // ── Units  (key format: "unitType:faction") ─────────────────
  'tank:player':           'sprites/units/tank_green.png',
  'tank:enemy':            'sprites/units/tank_red.png',
  'scout_vehicle:player':  'sprites/units/jeep_green.png',
  'scout_vehicle:enemy':   'sprites/units/jeep_red.png',
  'apc:player':            'sprites/units/apc_green.png',
  'apc:enemy':             'sprites/units/apc_red.png',
  'artillery:player':      'sprites/units/artillery_green.png',
  'artillery:enemy':       'sprites/units/artillery_red.png',
  'harvester:player':      'sprites/units/truck_green.png',
  'soldier:player':        'sprites/units/soldier_green.png',
  'soldier:enemy':         'sprites/units/soldier_red.png',
  'veil_soldier:enemy':    'sprites/units/soldier_red.png',
  'veil_raider:enemy':     'sprites/units/soldier_red.png',
  'veil_heavy:enemy':      'sprites/units/heavy_red.png',
  'spec_ops:player':       'sprites/units/spec_ops_green.png',
  'sniper:player':         'sprites/units/sniper_green.png',
  'sniper:enemy':          'sprites/units/sniper_red.png',
  'veil_sniper:enemy':     'sprites/units/sniper_red.png',
  'medic:player':          'sprites/units/medic_green.png',
  'engineer:player':       'sprites/units/engineer_green.png',
  'veil_engineer:enemy':   'sprites/units/engineer_red.png',
  'helicopter:player':     'sprites/units/helicopter_green.png',
  'helicopter:enemy':      'sprites/units/helicopter_red.png',
  'drone:player':          'sprites/units/drone_green.png',
  'veil_drone:enemy':      'sprites/units/drone_red.png',
  'anti_air:player':       'sprites/units/antiair_green.png',
  'anti_air:enemy':        'sprites/units/antiair_red.png',
  'infiltrator:enemy':     'sprites/units/infiltrator_red.png',
  'veil_scout:enemy':      'sprites/units/scout_red.png',
  'veil_bomber:enemy':     'sprites/units/bomber_red.png',
  'veil_truck:enemy':      'sprites/units/truck_red.png',
  'veil_tank:enemy':       'sprites/units/tank_red.png',
  'veil_artillery:enemy':  'sprites/units/artillery_red.png',

  // ── Buildings  (key format: "buildingType:faction") ─────────
  'command_base:player':   'sprites/buildings/command_base_green.png',
  'veil_command:enemy':    'sprites/buildings/command_base_red.png',
  'barracks:player':       'sprites/buildings/barracks_green.png',
  'veil_barracks:enemy':   'sprites/buildings/barracks_red.png',
  'quarry:player':         'sprites/buildings/quarry_green.png',
  'watchtower:player':     'sprites/buildings/watchtower_green.png',
  'veil_watch_post:enemy': 'sprites/buildings/watchtower_red.png',
  'bunker:player':         'sprites/buildings/bunker_green.png',
  'veil_bunker:enemy':     'sprites/buildings/bunker_red.png',
  'wall:player':           'sprites/buildings/wall_green.png',
  'fortified_wall:player': 'sprites/buildings/wall_fortified_green.png',
  'veil_wall:enemy':       'sprites/buildings/wall_red.png',
  'field_ops:player':      'sprites/buildings/field_ops_green.png',
  'motor_pool:player':     'sprites/buildings/motor_pool_green.png',
  'defense_works:player':  'sprites/buildings/defense_works_green.png',
  'radar_station:player':  'sprites/buildings/radar_green.png',
  'veil_radar:enemy':      'sprites/buildings/radar_red.png',
  'supply_depot:player':   'sprites/buildings/supply_depot_green.png',
  'veil_depot:enemy':      'sprites/buildings/supply_depot_red.png',
  'comms_tower:player':    'sprites/buildings/comms_tower_green.png',
  'hospital:player':       'sprites/buildings/hospital_green.png',
  'veil_hospital:enemy':   'sprites/buildings/hospital_red.png',
  'forward_post:player':   'sprites/buildings/forward_post_green.png',
  'power_plant:player':    'sprites/buildings/power_plant_green.png',
  'armory:enemy':          'sprites/buildings/armory_red.png',
  'tunnel_entrance:enemy': 'sprites/buildings/tunnel_red.png',
  'rocket_platform:enemy': 'sprites/buildings/rocket_red.png',
  'veil_workshop:enemy':   'sprites/buildings/workshop_red.png',
  'veil_airbase:enemy':    'sprites/buildings/airbase_red.png',
  'veil_foundry:enemy':    'sprites/buildings/foundry_red.png',
  'veil_fort:enemy':       'sprites/buildings/fort_red.png',

  // ── Terrain  (key format: "terrain_TYPE") ───────────────────
  'terrain_grass':         'sprites/terrain/grass.png',
  'terrain_dirt':          'sprites/terrain/dirt.png',
  'terrain_road':          'sprites/terrain/road.png',
  'terrain_water':         'sprites/terrain/water.png',
};

// ── Preloader ────────────────────────────────────────────────
const GameSprites = {
  images: {},
  loaded: false,

  async preload() {
    const entries = Object.entries(SPRITE_MAP);
    await Promise.all(entries.map(([key, src]) =>
      new Promise(resolve => {
        const img = new Image();
        img.onload  = () => { this.images[key] = img; resolve(); };
        img.onerror = () => resolve(); // missing sprite → procedural fallback
        img.src = src;
      })
    ));
    this.loaded = true;
    const n = Object.keys(this.images).length;
    if (n > 0) console.log(`[Sprites] Loaded ${n}/${entries.length} sprites`);
    else        console.log('[Sprites] No sprites found — using procedural rendering');
  },

  // Returns the Image for a given key, or null (triggers fallback)
  get(key) { return this.images[key] || null; },
};

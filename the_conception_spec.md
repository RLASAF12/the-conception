**THE CONCEPTION**

Technical Spec · v0.1 · Entity definitions, properties, edge cases

This document defines every object in the game with exact values.
**Numbers are tuned for a 15--20 minute session.** All values are
starting points --- adjust after first playtest.

**1 --- Resource System**

There is one resource: **Intelligence Credits (IC).** You earn IC by
revealing the unknown. You spend IC on everything.

**How IC is Earned**

  ---------------------- ------------- ----------------------------------
  **Source**             **Amount**    **Trigger**

  **New tile revealed**  \+ 2 IC       First time any scout uncovers a
                                       fogged tile. Once only per tile.

  **Enemy unit           \+ 25 IC      First time a scout sights an enemy
  discovered**                         unit. Per unit, once.

  **Enemy building       \+ 50 IC      First time a scout sights an enemy
  discovered**                         building. Per building, once.

  **Enemy Command Base   \+ 150 IC     One-time bonus when Command Base
  found**                              tile is first revealed.
  ---------------------- ------------- ----------------------------------

> **⚠** Tiles already revealed grant no repeat income. Sending a second
> scout over the same ground earns nothing. Every IC earned is a
> decision to push further into fog.

**How IC is Spent**

All spending is categorized into four buckets. No hidden costs.

  ---------------- ------------------------------ -------------------------
  **Category**     **Examples**                   **Cost Range**

  **Units**        Soldier, Scout Vehicle, Tank,  50 -- 350 IC
                   Drone                          

  **Buildings**    Barracks, Watchtower, Wall     100 -- 400 IC
                   segment, Quarry upgrade        

  **Intelligence   Drone range +2, Scout speed    150 -- 300 IC
  Upgrades**       +30%, Reveal radius +1         

  **Emergency      Airstrike (v1 placeholder ---  400 IC
  Abilities**      costs IC, reveals + damages    
                   one sector)                    
  ---------------- ------------------------------ -------------------------

> **⚠** Starting IC: 200. This is enough for two scouts and one
> building, or one tank and nothing else. The opening decision is the
> first test of the mechanic.

**2 --- Buildings (Player)**

Five buildings. Each can be destroyed by the enemy. No HP regeneration
on any structure.

+-----------------------------------------------------------------------+
| **Command Base**                                                      |
|                                                                       |
| **PROPERTIES**                                                        |
|                                                                       |
| > **HP:** 500                                                         |
| >                                                                     |
| > **Cost:** Free --- placed at game start                             |
| >                                                                     |
| > **Build time:** N/A                                                 |
| >                                                                     |
| > **Size:** 2×2 tiles                                                 |
| >                                                                     |
| > **Sight:** 6 tile radius (always active, no scout needed)           |
|                                                                       |
| **BEHAVIOR**                                                          |
|                                                                       |
| > **→** Destruction = instant LOSE, regardless of settlement count    |
| >                                                                     |
| > **→** Always visible to the player --- cannot be fogged             |
| >                                                                     |
| > **→** Produces no income. No garrison. No auto-defense.             |
| >                                                                     |
| > **→** If enemy reaches it, player has already lost map control      |
|                                                                       |
| **EDGE CASES**                                                        |
|                                                                       |
| > **→** Enemy cannot capture it --- only destroy (HP → 0)             |
| >                                                                     |
| > **→** Player cannot sell or demolish it                             |
+-----------------------------------------------------------------------+

+-----------------------------------------------------------------------+
| **Barracks**                                                          |
|                                                                       |
| **PROPERTIES**                                                        |
|                                                                       |
| > **HP:** 250                                                         |
| >                                                                     |
| > **Cost:** 200 IC                                                    |
| >                                                                     |
| > **Build time:** 20 seconds                                          |
| >                                                                     |
| > **Size:** 2×2 tiles                                                 |
| >                                                                     |
| > **Max count:** 2 (one is enough for v1 pacing)                      |
|                                                                       |
| **BEHAVIOR**                                                          |
|                                                                       |
| > **→** Produces Soldier and Scout Vehicle units                      |
| >                                                                     |
| > **→** One unit trained at a time --- queue up to 3                  |
| >                                                                     |
| > **→** If destroyed: all queued units are lost, IC refunded 50%      |
| >                                                                     |
| > **→** Player can rebuild at same or new location                    |
|                                                                       |
| **EDGE CASES**                                                        |
|                                                                       |
| > **→** If both Barracks are destroyed: player can only use Drones    |
| > (built from Command Base)                                           |
| >                                                                     |
| > **→** Rebuilding while under attack is possible but risky ---       |
| > construction pauses if builder dies                                 |
+-----------------------------------------------------------------------+

+-----------------------------------------------------------------------+
| **Quarry**                                                            |
|                                                                       |
| **PROPERTIES**                                                        |
|                                                                       |
| > **HP:** 200                                                         |
| >                                                                     |
| > **Cost:** 150 IC                                                    |
| >                                                                     |
| > **Build time:** 15 seconds                                          |
| >                                                                     |
| > **Size:** 1×2 tiles                                                 |
| >                                                                     |
| > **Max count:** 3                                                    |
|                                                                       |
| **BEHAVIOR**                                                          |
|                                                                       |
| > **→** Quarry does NOT generate passive income in v1 --- IC comes    |
| > from scouting only                                                  |
| >                                                                     |
| > **→** Quarry v1 role: unlocks the Intelligence Upgrade menu when    |
| > built                                                               |
| >                                                                     |
| > **→** Future v2: Quarry exports processed data --- generates +5     |
| > IC/sec when connected to a revealed sector                          |
|                                                                       |
| **EDGE CASES**                                                        |
|                                                                       |
| > **→** If Quarry is destroyed: upgrade menu locks until rebuilt      |
| >                                                                     |
| > **→** Destroying all Quarries cuts off upgrade path entirely ---    |
| > player is locked at base scout tier                                 |
+-----------------------------------------------------------------------+

+-----------------------------------------------------------------------+
| **Watchtower**                                                        |
|                                                                       |
| **PROPERTIES**                                                        |
|                                                                       |
| > **HP:** 150                                                         |
| >                                                                     |
| > **Cost:** 100 IC                                                    |
| >                                                                     |
| > **Build time:** 10 seconds                                          |
| >                                                                     |
| > **Size:** 1×1 tile                                                  |
| >                                                                     |
| > **Sight radius:** 8 tiles (static --- no unit needed)               |
| >                                                                     |
| > **Max count:** 5                                                    |
|                                                                       |
| **BEHAVIOR**                                                          |
|                                                                       |
| > **→** Reveals fog in a fixed radius permanently while standing      |
| >                                                                     |
| > **→** Does not move. Cannot attack. Pure vision.                    |
| >                                                                     |
| > **→** Each tile revealed by a Watchtower earns IC on first reveal,  |
| > same as scouts                                                      |
| >                                                                     |
| > **→** Placing near the border early is the most cost-efficient      |
| > scouting option                                                     |
|                                                                       |
| **EDGE CASES**                                                        |
|                                                                       |
| > **→** If destroyed: fog immediately returns to all tiles it was     |
| > solely responsible for revealing                                    |
| >                                                                     |
| > **→** If a scout already revealed a tile the Watchtower also covers |
| > --- fog does NOT return on tower destruction                        |
+-----------------------------------------------------------------------+

+-----------------------------------------------------------------------+
| **Wall Segment**                                                      |
|                                                                       |
| **PROPERTIES**                                                        |
|                                                                       |
| > **HP:** 300                                                         |
| >                                                                     |
| > **Cost:** 30 IC per segment                                         |
| >                                                                     |
| > **Build time:** 5 seconds per segment                               |
| >                                                                     |
| > **Size:** 1×1 tile                                                  |
| >                                                                     |
| > **Max count:** Unlimited                                            |
|                                                                       |
| **BEHAVIOR**                                                          |
|                                                                       |
| > **→** Blocks enemy movement --- enemy must destroy before passing   |
| >                                                                     |
| > **→** Does not reveal fog. Does not generate IC.                    |
| >                                                                     |
| > **→** Can be placed in any configuration --- player designs their   |
| > own perimeter                                                       |
| >                                                                     |
| > **→** Destroyed segments leave a gap immediately --- no rubble      |
| > blocking                                                            |
|                                                                       |
| **EDGE CASES**                                                        |
|                                                                       |
| > **→** Enemy AI targets lowest-HP wall segment in range first        |
| >                                                                     |
| > **→** Wall segments adjacent to a Watchtower do not inherit its     |
| > sight radius                                                        |
| >                                                                     |
| > **→** Player cannot build walls inside enemy-controlled territory   |
+-----------------------------------------------------------------------+

**3 --- Units (Player)**

Four units. All trained at Barracks except Drone (Command Base). Values
tuned for 15--20 min session.

  --------------- -------- ----------------- ----------- ----------- ---------- --------- ----------
  **Unit**        **HP**   **Damage/tick**   **Speed**   **Sight**   **Cost**   **Build   **Max
                                                                                time**    active**

  **Soldier**     60       5                 1.5 t/s     3 tiles     50 IC      8s        12

  **Scout         80       8                 2.5 t/s     8 tiles     150 IC     12s       4
  Vehicle**                                                                               

  **Tank**        250      25                1.0 t/s     3 tiles     350 IC     25s       3

  **Drone**       40       0                 3.5 t/s     12 tiles    300 IC     20s       2
  --------------- -------- ----------------- ----------- ----------- ---------- --------- ----------

+-----------------------------------------------------------------------+
| **Soldier**                                                           |
|                                                                       |
| **BEHAVIOR**                                                          |
|                                                                       |
| > **→** Attacks any enemy unit or building within 2-tile range        |
| > automatically                                                       |
| >                                                                     |
| > **→** Follows move orders. Will auto-attack when idle and enemy     |
| > enters range.                                                       |
| >                                                                     |
| > **→** Group-selectable --- player can box-select up to 12 soldiers  |
| > and move as one                                                     |
|                                                                       |
| **EDGE CASES**                                                        |
|                                                                       |
| > **→** If ordered to move through an enemy-occupied tile --- stops   |
| > and engages before continuing                                       |
| >                                                                     |
| > **→** Death generates no IC. No bounty on player unit deaths.       |
| >                                                                     |
| > **→** Will not auto-attack enemy buildings unless player explicitly |
| > orders it                                                           |
+-----------------------------------------------------------------------+

+-----------------------------------------------------------------------+
| **Scout Vehicle**                                                     |
|                                                                       |
| **BEHAVIOR**                                                          |
|                                                                       |
| > **→** Primary scouting unit. Reveals 8-tile radius while moving and |
| > while stationary.                                                   |
| >                                                                     |
| > **→** All revealed tiles are permanent --- scout death does not     |
| > remove fog reveal.                                                  |
| >                                                                     |
| > **→** Earns IC per new tile revealed and per enemy unit/building    |
| > first sighted.                                                      |
| >                                                                     |
| > **→** Visible to enemy AI --- will be targeted and attacked if      |
| > spotted near enemy units.                                           |
|                                                                       |
| **EDGE CASES**                                                        |
|                                                                       |
| > **→** If Scout Vehicle is killed mid-route: all tiles revealed up   |
| > to death point remain permanent                                     |
| >                                                                     |
| > **→** Two Scout Vehicles covering same tile: fog does not return    |
| > when one dies (other still alive counts)                            |
| >                                                                     |
| > **→** Scout Vehicle can be ordered to retreat --- does not need to  |
| > reach target to earn IC from tiles en route                         |
+-----------------------------------------------------------------------+

+-----------------------------------------------------------------------+
| **Tank**                                                              |
|                                                                       |
| **BEHAVIOR**                                                          |
|                                                                       |
| > **→** Highest damage output. Slow. Used for base assault and        |
| > settlement defense.                                                 |
| >                                                                     |
| > **→** Area damage: hits all units within 1 tile of target (splash). |
| > Friendly fire OFF in v1.                                            |
| >                                                                     |
| > **→** Cannot scout --- sight radius equals Soldier. Do not send     |
| > alone into fog.                                                     |
|                                                                       |
| **EDGE CASES**                                                        |
|                                                                       |
| > **→** Tank attacking a Wall: deals full damage to wall, no splash   |
| > on adjacent tiles                                                   |
| >                                                                     |
| > **→** If Tank enters a tile with no visible enemy: stops and waits  |
| > for player order                                                    |
| >                                                                     |
| > **→** Maximum 3 active tanks --- hard cap. Fourth tank cannot be    |
| > queued until one dies.                                              |
+-----------------------------------------------------------------------+

+-----------------------------------------------------------------------+
| **Drone**                                                             |
|                                                                       |
| **BEHAVIOR**                                                          |
|                                                                       |
| > **→** Largest sight radius in the game. Cannot attack. Cannot be    |
| > ordered to engage.                                                  |
| >                                                                     |
| > **→** Built from Command Base, not Barracks --- survives Barracks   |
| > destruction.                                                        |
| >                                                                     |
| > **→** Earns IC aggressively: 12-tile reveal radius means high IC    |
| > per mission run.                                                    |
| >                                                                     |
| > **→** Enemy has anti-air capability --- Drone can be shot down if   |
| > it flies over armed enemy positions.                                |
|                                                                       |
| **EDGE CASES**                                                        |
|                                                                       |
| > **→** Drone shot down: all revealed tiles remain permanent          |
| >                                                                     |
| > **→** Drone over enemy Command Base: reveals exact location ---     |
| > Commander voice: \"Target confirmed.\"                              |
| >                                                                     |
| > **→** Maximum 2 active Drones. Cooldown after death: 60 seconds     |
| > before a new one can be built.                                      |
| >                                                                     |
| > **→** Drone cannot enter tiles blocked by mountains or impassable   |
| > terrain (v2 terrain feature)                                        |
|                                                                       |
| **FUTURE (V2+)**                                                      |
|                                                                       |
| > **→** Iron Dome upgrade: Drone can be tasked to intercept incoming  |
| > rockets from northern front (Levara faction)                        |
| >                                                                     |
| > **→** Drone escort mode: follows a Tank group, reveals path ahead   |
| > automatically                                                       |
+-----------------------------------------------------------------------+

**4 --- Intelligence Upgrades**

Unlocked when a Quarry is built. One-time purchases. Cannot be sold.

  ------------------ ---------- --------------------------- ------------------
  **Upgrade**        **Cost**   **Effect**                  **Prerequisite**

  **Scout Speed I**  150 IC     All Scout Vehicles +40%     1× Quarry built
                                movement speed              

  **Extended Reveal  200 IC     Scout Vehicle sight radius: 1× Quarry built
  I**                           8 → 10 tiles                

  **Drone            250 IC     Drone HP: 40 → 90. Harder   1× Quarry built
  Resilience**                  to shoot down.              

  **Deep Intel**     300 IC     Enemy building discovery    Scout Speed I
                                bounty: 50 → 100 IC         purchased

  **Overwatch**      300 IC     Watchtower sight radius: 8  2× Watchtowers
                                → 12 tiles                  built

  **Emergency        400 IC     One-time use. Reveals +     Deep Intel
  Airstrike**                   deals 200 dmg to one sector purchased
  ------------------ ---------- --------------------------- ------------------

> **⚠** Upgrades are permanent for the session. There is no tech tree in
> v1 --- all upgrades are flat leaf nodes. Order of purchase is the
> player\'s only strategic choice here.

**5 --- Enemy Entities (Veil faction, AI-controlled)**

Enemy values are intentionally asymmetric. The Veil builds faster early,
hits harder in raids, but has no upgrades.

**Enemy Buildings**

  ---------------- -------- -------------------------------------------------
  **Building**     **HP**   **Function**

  **Command Base** 600      Primary target. Hidden in fog. Finding it earns
                            +150 IC bonus.

  **Veil           300      Produces Veil Soldiers and Raider units.
  Barracks**                Destroying it slows raids.

  **Tunnel         180      Spawns infiltrators directly near player
  Entrance**                settlements. High priority target.

  **Rocket         220      v1 placeholder: fires rockets at watchtowers.
  Platform**                Destroys sight infrastructure.

  **Armory**       250      Unlocks Veil Heavy units after 8 min. Destroying
                            it prevents escalation.
  ---------------- -------- -------------------------------------------------

**Enemy Units**

  ----------------- -------- ----------------- ----------- ----------------------------------------
  **Unit**          **HP**   **Damage/tick**   **Speed**   **Behavior**

  **Veil Soldier**  50       4                 1.5 t/s     Basic raider. Attacks settlements and
                                                           player units on sight.

  **Veil Raider**   90       10                2.0 t/s     Fast assault unit. Prioritizes
                                                           settlements over player units.

  **Veil Heavy**    300      30                0.8 t/s     Spawns after 8 min if Armory alive.
                                                           Targets Command Base.

  **Infiltrator**   40       6                 2.5 t/s     Spawns from Tunnel Entrance. Appears
                                                           inside player perimeter.
  ----------------- -------- ----------------- ----------- ----------------------------------------

> **⚠** Enemy units are never visible until a player scout or Watchtower
> reveals them. Discovering a Veil Heavy before it reaches the base is
> worth 25 IC and likely saves the game.

**6 --- Map Spec**

  --------------------- -------------------------------------------------
  **Property**          **Value**

  **Grid size**         40 × 30 tiles

  **Tile size           32 × 32 pixels → canvas: 1280 × 960px
  (rendered)**          

  **Player start**      Right side --- columns 28--40. Pre-revealed.
                        Command Base at col 36, row 15.

  **Enemy start**       Left side --- columns 1--12. Fully fogged at game
                        start.

  **Neutral zone**      Columns 13--27. Fogged. Settlements placed here
                        (3 settlements total).

  **Settlement          Fixed: (col 18, row 8), (col 20, row 20), (col
  positions**           24, row 14)

  **Fog default**       All tiles outside player start = fully fogged
                        (black overlay, 100% opacity)

  **Fog reveal**        Permanent for the session. Opacity drops to 0 on
                        reveal. Never returns.

  **Impassable tiles**  None in v1. Flat map. Terrain features deferred
                        to v2.
  --------------------- -------------------------------------------------

> **⚠** The map is the same every game in v1. Procedural generation
> deferred to v2. Fixed map allows tuning of session pacing before
> adding variance.

**7 --- Commander Voice Lines (text only, v1)**

Displayed as text in the top-right corner. Appears on trigger. Fades
after 5 seconds. Max 2 lines visible at once.

  ------------------------ ----------------------------------------------
  **Trigger**              **Line**

  **Game start**           \"All quiet on the border, Commander. For
                           now.\"

  **First scout deployed** \"Scout is moving. Keep them alive.\"

  **First enemy unit       \"Contact. We\'re not alone out there.\"
  discovered**             

  **First enemy building   \"They\'ve been busy, Commander. This wasn\'t
  found**                  built overnight.\"

  **Command Base found**   \"Target confirmed. Your call.\"

  **Settlement under       \"We\'re taking fire at \[name\]. Respond
  attack**                 immediately.\"

  **Settlement at 50% HP** \"\[Name\] is taking heavy losses. Commander
                           --- we need units now.\"

  **Settlement falls**     \"We\'ve lost \[name\]. \[population\]
                           civilians. That\'s on the board.\"

  **Second settlement      \"Two settlements lost. One more and it\'s
  falls**                  over.\"

  **Scout killed**         \"We lost the scout. The ground they covered
                           stays with us.\"

  **Drone shot down**      \"Drone down. 60 seconds before we can put
                           another up.\"

  **Barracks destroyed**   \"Barracks is gone. We\'re down to whatever we
                           have in the field.\"

  **Enemy Armory found     \"They have heavies now. This changes
  after 8min**             things.\"

  **WIN**                  \"Command Base destroyed. It\'s over. For
                           now.\"

  **LOSE**                 \"The line is broken, Commander. We couldn\'t
                           hold them.\"
  ------------------------ ----------------------------------------------

> **⚠** All voice lines are text in v1. Audio implementation deferred.
> Lines must be short enough to read in under 3 seconds while managing
> units.

THE CONCEPTION · Technical Spec v0.1 · **Three documents complete. Next:
write code.**

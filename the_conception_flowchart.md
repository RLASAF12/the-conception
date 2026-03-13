**THE CONCEPTION**

Game Flowchart · v0.1 · All core loops and decision trees

+-----------------------------------------------------------------------+
| **Design Decisions Baked Into This Flowchart**                        |
|                                                                       |
| > **→** Enemy runs at full speed when player is idle --- inaction is  |
| > always punished                                                     |
| >                                                                     |
| > **→** Scout death: tiles already revealed stay visible permanently  |
| > for the mission                                                     |
| >                                                                     |
| > **→** Settlement under attack: visual flash + escalating commander  |
| > voice line                                                          |
| >                                                                     |
| > **→** Fog return: never --- once a tile is seen, it stays seen for  |
| > the whole mission                                                   |
| >                                                                     |
| > **→** Command Base: always attackable, but early assault loses to   |
| > enemy\'s build head-start                                           |
| >                                                                     |
| > **→** Settlement falls via HP bar --- enemy units deal damage until |
| > HP = 0                                                              |
+-----------------------------------------------------------------------+

**1 --- Game States**

The game exists in one of four states at all times. Every input, AI
action, and UI element is only valid in specific states.

  ------------- ----------------------------- -----------------------------
  **STATE**     **WHAT\'S ACTIVE**            **TRANSITIONS TO**

  **BOOT**      Load assets, generate map,    → PLAYING on Start
                place units                   

  **PLAYING**   Full game loop running.       → PAUSED on Esc → WIN on
                Player input live. AI         Command Base destroyed → LOSE
                ticking.                      on 3 settlements fallen

  **PAUSED**    Game loop frozen. Menu        → PLAYING on Resume → BOOT on
                overlay. No AI ticks.         Quit

  **END**       WIN or LOSE screen. Final     → BOOT on Restart
                stats shown. No input except  
                Restart / Quit.               
  ------------- ----------------------------- -----------------------------

**2 --- Main Game Loop (PLAYING state, every tick)**

This runs 60 times per second via requestAnimationFrame. Order of
operations matters.

+---+------------------------------------------------------------------+
| * | **Process Player Input**                                         |
| * |                                                                  |
| 1 | Read mouse/keyboard events. Queue commands for selected units.   |
| * |                                                                  |
| * |                                                                  |
+---+------------------------------------------------------------------+

> **▼**

+---+------------------------------------------------------------------+
| * | **Tick AI**                                                      |
| * |                                                                  |
| 2 | Enemy builds, moves, and attacks. Runs every tick regardless of  |
| * | player action. No waiting.                                       |
| * |                                                                  |
+---+------------------------------------------------------------------+

> **▼**

+---+------------------------------------------------------------------+
| * | **Update Units**                                                 |
| * |                                                                  |
| 3 | Move all units toward their targets. Resolve combat. Apply HP    |
| * | changes.                                                         |
| * |                                                                  |
+---+------------------------------------------------------------------+

> **▼**

+---+------------------------------------------------------------------+
| * | **Update Fog of War**                                            |
| * |                                                                  |
| 4 | For each unit alive: reveal tiles within sight radius. Revealed  |
| * | tiles stay revealed permanently.                                 |
| * |                                                                  |
+---+------------------------------------------------------------------+

> **▼**

+---+------------------------------------------------------------------+
| * | **Update Settlements**                                           |
| * |                                                                  |
| 5 | Check each settlement HP. Trigger alerts if under attack. Check  |
| * | lose condition.                                                  |
| * |                                                                  |
+---+------------------------------------------------------------------+

> **▼**

+---+------------------------------------------------------------------+
| * | **Check Win / Lose Conditions**                                  |
| * |                                                                  |
| 6 | Enemy Command Base HP = 0? → WIN. Settlements fallen ≥ 3? →      |
| * | LOSE.                                                            |
| * |                                                                  |
+---+------------------------------------------------------------------+

> **▼**

+---+------------------------------------------------------------------+
| * | **Render Frame**                                                 |
| * |                                                                  |
| 7 | Draw map tiles, fog overlay, units, UI, alerts, resource         |
| * | counters.                                                        |
| * |                                                                  |
+---+------------------------------------------------------------------+

**3 --- Scout Flow (the core mechanic)**

Every scout action follows this exact path. This is the most important
flowchart in the document.

+---+------------------------------------------------------------------+
| * | **Player clicks \'Send Scout\'**                                 |
| * |                                                                  |
| 1 | UI button or keyboard shortcut triggers scout creation command.  |
| * |                                                                  |
| * |                                                                  |
+---+------------------------------------------------------------------+

> **▼**

+---+----------------------------------+----------------------------------+
|   | **? Does player have enough      |                                  |
|   | resources?**                     |                                  |
+---+----------------------------------+----------------------------------+
|   | **✓ YES --- Deduct cost. Create  | **✗ NO --- Reject command. Flash |
|   | scout unit at Barracks.**        | resource counter red. No unit    |
|   |                                  | created.**                       |
|   | Scout type determines cost:      |                                  |
|   | Foot=50 / Vehicle=150 /          | Commander voice: \"Insufficient  |
|   | Drone=300                        | resources, Commander.\"          |
+---+----------------------------------+----------------------------------+

> **▼** if YES

+---+------------------------------------------------------------------+
| * | **Player selects target tile**                                   |
| * |                                                                  |
| 3 | Click anywhere on map --- fogged or visible. Scout will pathfind |
| * | there.                                                           |
| * |                                                                  |
+---+------------------------------------------------------------------+

> **▼**

+---+------------------------------------------------------------------+
| * | **Scout moves toward target**                                    |
| * |                                                                  |
| 4 | Each tick: move along path. Reveal tiles within sight radius.    |
| * | Revealed tiles are permanent.                                    |
| * |                                                                  |
+---+------------------------------------------------------------------+

> **▼**

+---+----------------------------------+----------------------------------+
|   | **? Does scout encounter an      |                                  |
|   | enemy unit?**                    |                                  |
+---+----------------------------------+----------------------------------+
|   | **✓ YES --- Combat begins. Both  | **✗ NO --- Scout continues       |
|   | units exchange damage each       | moving. Keeps revealing tiles.** |
|   | tick.**                          |                                  |
|   |                                  | Scout reaches target --- see     |
|   | Scout may die --- see step 6.    | step 7.                          |
+---+----------------------------------+----------------------------------+

> **▼** if YES --- combat

+---+----------------------------------+----------------------------------+
|   | **? Scout HP reaches 0?**        |                                  |
+---+----------------------------------+----------------------------------+
|   | **✓ YES --- Scout destroyed. All | **✗ NO --- Scout wins combat.    |
|   | tiles revealed so far remain     | Continues moving to target.**    |
|   | visible permanently.**           |                                  |
|   |                                  | Scout resumes path. No HP loss   |
|   | Tiles stay visible. Info is      | from this encounter.             |
|   | never lost on death.             |                                  |
+---+----------------------------------+----------------------------------+

> **▼** if scout reaches target

+---+------------------------------------------------------------------+
| * | **Scout arrives at target tile**                                 |
| * |                                                                  |
| 7 | Full reveal of sight radius around target. Scout holds position  |
| * | until ordered elsewhere or killed.                               |
| * |                                                                  |
+---+------------------------------------------------------------------+

> **Note:** Fog never returns. Tiles revealed by any scout --- alive or
> dead --- stay visible for the entire mission. Sending a scout is an
> investment with permanent returns.

**4 --- Settlement Under Attack**

What happens from the moment an enemy unit enters settlement range to
the moment it falls.

+---+------------------------------------------------------------------+
| * | **Enemy unit enters settlement attack radius**                   |
| * |                                                                  |
| 1 | Radius = 3 tiles from settlement center. Triggers alert system.  |
| * |                                                                  |
| * |                                                                  |
+---+------------------------------------------------------------------+

> **▼**

+---+------------------------------------------------------------------+
| * | **Alert fires simultaneously**                                   |
| * |                                                                  |
| 2 | Visual: settlement border flashes red. Commander voice: \"We\'re |
| * | taking fire at \[settlement name\]\"                             |
| * |                                                                  |
+---+------------------------------------------------------------------+

> **▼**

+---+------------------------------------------------------------------+
| * | **Enemy deals damage every tick**                                |
| * |                                                                  |
| 3 | Settlement HP bar decreases. Rate depends on number of enemy     |
| * | units attacking.                                                 |
| * |                                                                  |
+---+------------------------------------------------------------------+

> **▼**

+---+----------------------------------+----------------------------------+
|   | **? Does player send defending   |                                  |
|   | units within 15 seconds?**       |                                  |
+---+----------------------------------+----------------------------------+
|   | **✓ YES --- Defenders arrive.    | **✗ NO --- No defenders.         |
|   | Combat begins. Settlement stops  | Commander voice escalates:       |
|   | taking damage while defenders    | \"Commander --- they\'re         |
|   | engage enemy.**                  | breaking through. We need units  |
|   |                                  | NOW.\"**                         |
|   | If defenders kill all attackers: |                                  |
|   | settlement is safe. HP does not  | Damage continues every tick.     |
|   | regenerate.                      | Second alert fires at 50% HP.    |
+---+----------------------------------+----------------------------------+

> **▼** if no defense --- HP continues dropping

+---+----------------------------------+----------------------------------+
|   | **? Settlement HP reaches 0?**   |                                  |
+---+----------------------------------+----------------------------------+
|   | **✓ YES --- Settlement falls.    | **✗ NO --- HP above 0. Player    |
|   | Commander voice: \"We\'ve lost   | sent late defenders --- fighting |
|   | \[name\]. \[population\]         | continues.**                     |
|   | civilians.\" Count +1 toward     |                                  |
|   | lose condition.**                | Combat resolves. Settlement      |
|   |                                  | survives at low HP --- no        |
|   | Check: fallen settlements ≥ 3?   | regeneration.                    |
|   | If yes → LOSE state.             |                                  |
+---+----------------------------------+----------------------------------+

> **Note:** Settlements do not regenerate HP. A damaged settlement is
> permanently weakened for the rest of the mission. Losing one early is
> not game over --- but it narrows the margin for the rest.

**5 --- Enemy AI Loop (runs every tick, player or not)**

The AI has no pause button. It runs whether the player is building,
scouting, or doing nothing. Inaction is always punished.

+-----------------------------------------------------------------------+
| **AI Priority Queue --- executes in this order each tick**            |
|                                                                       |
| > **→** 1. Build: if resource threshold met, queue next building in   |
| > preset build order                                                  |
| >                                                                     |
| > **→** 2. Expand: if base footprint below target size, place new     |
| > structure                                                           |
| >                                                                     |
| > **→** 3. Train: produce combat units if Barracks available and      |
| > resources allow                                                     |
| >                                                                     |
| > **→** 4. Raid: if combat units ≥ 6, assign raid group to nearest    |
| > unscouted settlement                                                |
| >                                                                     |
| > **→** 5. Assault Command: if raid groups ≥ 3, escalate to full      |
| > assault on player base                                              |
+-----------------------------------------------------------------------+

> **Note:** Early game (0--3 min): AI focuses almost entirely on Build +
> Expand. Attacking at this stage finds a weak base, but player\'s own
> forces are also minimal. The power gap is real --- early aggression is
> risky, not gated artificially.
>
> **Note:** The AI does not adapt to player strategy in v1. It follows a
> fixed priority queue. This is intentional --- complexity comes from
> the Fog of War, not from AI cleverness.

**6 --- Win and Lose Conditions**

+-----------------------------------+-----------------------------------+
| **WIN**                           | **LOSE**                          |
|                                   |                                   |
| **Enemy Command Base HP reaches   | **Three settlements fall (HP →    |
| 0.**                              | 0).**                             |
|                                   |                                   |
| The base location is never shown  | Settlements do not regenerate.    |
| on the map. Player must scout to  | Each lost settlement permanently  |
| find it.                          | reduces your population resource  |
|                                   | income.                           |
| Early assault is possible but the |                                   |
| enemy\'s build head-start means   | Commander voice on third fall:    |
| the player will face a fortified  | \"We\'ve lost too many. The line  |
| base with few defenders of their  | is broken, Commander.\"           |
| own.                              |                                   |
|                                   | → Trigger: END state, LOSE        |
| → Trigger: END state, WIN screen, | screen, session stats.            |
| session stats.                    |                                   |
+-----------------------------------+-----------------------------------+

THE CONCEPTION · Flowchart v0.1 · Next: Technical Spec → Entity
definitions, properties, edge cases

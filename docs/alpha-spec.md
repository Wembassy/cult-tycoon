# Cult Tycoon Alpha Specification

Status: source of truth for the Alpha implementation plan  
Branch: `alpha/vertical-slice`  
Supersedes conflicting assumptions in older gameplay/backlog documents.

## 1. Alpha destination

Cult Tycoon Alpha is a stable, playable colony-management sandbox where the player:

1. Starts with 4-6 followers.
2. Selects a global-world starting location.
3. Previews the generated local map and chooses the settlement point.
4. Gathers wood, stone, berries and crops.
5. Builds a compound with walls, floors, doors, beds, stockpiles and work areas.
6. Assigns autonomous work priorities and can issue direct overrides.
7. Maintains health, hunger, rest, recreation, comfort, social needs and mood.
8. Defines a cult ideology whose beliefs materially influence NPC behavior.
9. Encounters outsiders and recruits/converts them.
10. Grows the cult indefinitely without a formal Alpha game-over state.
11. Saves and reloads the complete simulation reliably.

Alpha art can be placeholder-quality, but nothing may appear accidentally broken, debug-only, structurally wrong, T-posed, unusable or misleading.

## 2. Spatial architecture

Cult Tycoon uses four distinct spatial layers.

### 2.1 Global World Space
A strategic world layer used in Alpha only for starting-location selection.

A global location exposes:
- terrain type / biome
- tree and rock density
- food availability
- temperature
- outsider traffic
- proximity to cities / settlements / travel routes

The global layer must be designed for future travel and multiple settlements, but those features are out of Alpha scope.

### 2.2 Local World Space
Continuous coordinates for the active settlement:
- followers
- outsiders
- vegetation
- rocks
- dropped resource stacks
- effects
- furniture / props
- interaction targets

The local map has a fixed RimWorld-like playable size. Walking and hauling distance must be strategically meaningful.

Terrain may contain mild visual elevation and natural obstacles, but Alpha does not support true multi-level terrain pathfinding.

### 2.3 Navigation Space
A dedicated representation used only for movement and reachability.

Navigation MUST NOT derive walkability from a single coarse `TileMap.occupied` flag.

It must support:
- world obstacles
- edge-based walls
- doors that open/close while remaining room boundaries
- local obstacle updates
- path-cache invalidation

Construction geometry and resource placement must not accidentally block an entire coarse terrain tile.

### 2.4 Construction Space
A fine snapping lattice for architectural placement.

Rules:
- walls occupy edges between construction cells
- doors occupy wall-edge segments
- floors occupy cell areas
- furniture may use finer snapping or free placement
- construction resolution is a tunable spatial constant, not encoded throughout gameplay logic
- current 10x subdivision code is a prototype, not a compatibility requirement

## 3. World generation and start flow

1. Generate a lightweight global world with cities/settlements/travel routes and biome data.
2. Player selects a global location after reviewing its stats.
3. Generate a deterministic local map from global tile metadata + seed.
4. Present a local preview.
5. Player selects the exact settlement point.
6. Spawn 4-6 starting followers around the chosen point.

Global selection affects:
- biome visuals
- terrain composition
- temperature
- trees
- rocks
- wild food
- outsider traffic frequency

## 4. Construction, rooms and roofs

### Walls and doors
- walls are edge-based
- doors replace/occupy compatible wall-edge segments
- closed doors block passage
- followers automatically open/close doors
- doors count as room boundaries
- access ownership/locking is post-Alpha

### Floors
- floor cells occupy construction areas
- drag placement supports rectangular areas

### Rooms
Rooms are automatically detected from enclosed wall/door boundaries.
Room purpose is inferred primarily from furniture/designations:
- beds -> sleeping room / bedroom
- stockpile designation -> storage
- workstation -> relevant work room

Manual room naming/override may be added later.

### Roofs
- enclosed valid rooms automatically generate roofs/ceilings after construction
- roofs affect shelter/comfort
- temperature integration should be supported
- roof visibility can be toggled
- no manual roof painting is required in Alpha
- data model should permit future manual roof control and Z-levels

Alpha supports one playable floor plus roofs, while save/data structures should avoid assumptions that make future Z-levels impossible.

## 5. Resources and economy

Initial chains:
- Tree -> Wood
- Rock -> Stone
- Berry bush -> Food
- Farm -> Crops -> Food
- Wood/Stone -> Buildings
- Wood -> Furniture
- Food -> Meals

Advanced crafting is post-baseline Alpha.

Harvesting:
- player designates targets
- designations create autonomous work opportunities
- skill, priority, distance and reservation affect claiming
- resources drop into Local World Space
- hauling moves physical stacks to storage

## 6. Stockpiles and hauling

Stockpiles use a RimWorld-like painted-zone system.
Each stockpile supports item filters.

Hauling:
- is a normal work type
- physical items may remain on the ground
- followers haul eligible items into available stockpile space
- reservations prevent double claiming
- direct player haul orders override normal priorities
- construction/food urgency may raise effective hauling priority

## 7. Construction jobs

1. Player places a blueprint.
2. Blueprint records required materials.
3. Haulers deliver materials.
4. Once requirements are satisfied, a follower with Construction enabled claims the job.
5. Construction skill affects work speed and may later affect quality.
6. A small build task has one active builder at a time.
7. Multiple followers may work different blueprint segments simultaneously.
8. Direct orders can prioritize a specific blueprint.

## 8. Food and farming

Food:
- berries are edible immediately
- farms produce crops after a growth cycle
- raw food may be eaten in emergencies with mood/efficiency consequences
- a basic cooking station converts food into meals
- followers automatically seek food
- meals are preferred to raw food
- ideology can allow/forbid/prefer food categories

Farming:
- player paints a grow zone on suitable terrain
- selects a crop type
- Farming work handles planting, tending and harvesting
- temperature influences crop growth
- Alpha starts with a small crop catalog

## 9. Followers

Alpha follower simulation includes:
- health
- hunger
- rest
- recreation
- comfort
- social
- beliefs
- relationships
- memories/thoughts
- traits
- skill levels
- skill passions
- injuries
- mood modifiers
- inventory
- current job
- work priorities

### Sleeping
- followers use assigned or available beds
- ground sleeping is allowed with penalties
- bedroom quality affects rest/comfort
- shared rooms are supported
- ideology may prefer private or communal sleeping

### Schedule
Hourly schedule blocks:
- Sleep
- Work
- Recreation
- Anything

Urgent survival behavior may override schedules.

### Work priorities
- work types can be disabled or assigned numeric priority 1-4
- 1 is highest
- normal job scoring uses work priority, urgency, distance and skill
- direct player orders override autonomous work selection

### Skills and passions
- skills increase through related work
- higher skills improve speed and/or quality
- passion levels: none / minor / major
- passion changes learning rate and can influence mood

## 10. Mood, memories and mental breaks

Mood is explainable, not a single opaque value.

Temporary memories/thoughts have:
- mood value
- duration
- source/category
- stacking behavior
- ideology/trait conditions when relevant

Examples:
- ate a good meal
- slept on the ground
- pleasant conversation
- insulted
- successful ritual
- violated doctrine
- witnessed doctrine violation

Low morale effects:
- Low: slower work / unhappy behavior
- Very low: ignores lower-priority work, seeks recreation/socialization
- Critical: mental break

Initial mental breaks:
- refuse work
- isolate
- binge eat
- argue/fight
- attempt to leave

## 11. Social relationships

Followers periodically socialize while nearby, eating or recreating.

Relationship model:
- directional opinion score
- familiarity
- friendship
- rivalry
- simple romance
- family metadata
- recent social memories

Interactions affect social need, mood, conflict and recruitment/conversion.

Complex marriage, pregnancy, children and jealousy systems are post-Alpha.

## 12. Ideology

Ideology is a simulation ruleset, not cosmetic flavor.

Structure:
1. Core Beliefs
2. Precepts
3. Roles
4. Rituals

Players define the foundation at game start and can unlock/change doctrine as the cult develops.

Followers have individual belief strength.

Alpha ideology supports both:
- hard rules: required / prohibited
- soft rules: preferred / accepted / disapproved

Start with 8-12 belief/precept categories, including:
- work ethic
- wealth/materialism
- food
- relationships
- community vs individuality
- authority/leadership
- violence
- outsiders/recruitment
- nature
- comfort/luxury
- ritual participation
- spirituality

Behavior hierarchy:
1. immediate survival
2. direct player order
3. ideology prohibitions/requirements
4. job priorities
5. personal needs
6. traits/preferences
7. relationships/social behavior

Traits and personal preferences can conflict with doctrine and generate thoughts, belief changes and social consequences.

Formal cult roles are in Alpha and should use thematic names. Initial implementation should include the leader plus a small set such as recruiter/evangelist and ritual guide, with room for later expansion.

## 13. Recruitment and conversion

Recruitment begins with random outsider events.

Outsider frequency is influenced by global-world traffic data:
- nearby cities
- settlements
- roads/travel routes
- remoteness

Initial Alpha flow:
1. outsider enters local area
2. cultists can socialize/recruit
3. social/recruitment skill, relationships, ideology compatibility and cult conditions affect progress
4. successful outsider joins as a follower with their own traits, skills and belief level

A deeper explicit conversion/indoctrination system may be layered on after the baseline is stable.

## 14. UI and controls

Required:
- reliable Pause / 1x / 2x / 3x controls
- clear build/demolish/select mode
- follower selection by clicking character
- bottom-left follower inspector
- inspector tabs: General / Job / Skills / Inventory / Traits
- wall visibility toggle
- roof/ceiling visibility toggle
- stockpile and grow-zone designation tools
- schedule UI
- work-priority UI
- ideology UI
- global location stats panel
- local-map settlement preview/selection

HUD elements must not overlap or make core controls inaccessible.

## 15. Visual and animation quality bar

Placeholder art is acceptable. Broken presentation is not.

Alpha blockers include:
- T-poses
- fake idle bobbing as the only movement
- unusable camera
- unreadable fog
- visibly separated/chunky terrain tiles when continuous terrain is intended
- oversized walls/floors
- incorrect follower/building scale
- inaccessible controls
- overlapping inspector/minimap/time controls
- interiors hidden without visibility tools

Follower semantic animation states:
- idle
- walk
- work
- pray/ritual
- eat
- sleep

## 16. Save/load

Save data must round-trip:
- global starting location and seed
- local map seed/state
- settlement point
- follower transforms and simulation state
- traits, skills, passions
- needs, injuries, memories
- relationships
- beliefs / ideology state
- schedules and work priorities
- inventories
- dropped items
- harvest orders
- stockpiles
- grow zones/crops
- construction blueprints/material delivery
- built architecture, doors and roofs
- rooms
- outsider/recruitment state
- game clock

Any incompatible spatial-model change requires explicit save-version migration or safe rejection of obsolete Alpha saves.

## 17. Performance rules

- do not recompute room topology every render frame
- do not recompute full navigation globally for every pawn tick
- use dirty regions / invalidation for construction changes
- use reservation tables for jobs/items
- use fixed simulation ticks
- visual rendering is decoupled from simulation state
- expensive social/ideology checks run on scheduled simulation intervals or events

## 18. Out of Alpha scope

- multiple playable settlements
- global travel/caravans
- true terrain Z-level pathfinding
- multi-story construction
- advanced crafting chains
- complex family/reproduction systems
- sophisticated door ownership/permissions
- full endgame/win condition
- forced game-over
- production-final art

## 19. Alpha acceptance

A new player can:
- select an informed starting region and settlement point
- understand camera/time/basic controls
- gather resources
- create stockpiles
- build enclosed, roofed, navigable rooms
- furnish sleeping/work/storage spaces
- establish farms and cook meals
- configure autonomous work and schedules
- inspect followers and understand their mood
- experience social relationships and mental breaks
- define an ideology and observe it changing NPC behavior
- encounter and recruit outsiders
- grow beyond the starting 4-6 followers
- save/reload and continue the same simulation

Target play session: at least 30-60 minutes without obvious broken-state blockers.

## 20. Implementation order

### Milestone A - Spatial foundation
- explicit spatial constants/conversions
- separate world/navigation/construction state
- edge-based wall/door representation
- navigation blockers independent of terrain/decor
- mode-aware picking
- correct fine-scale rendering

### Milestone B - Compound loop
- blueprints/material delivery/build jobs
- automatic room detection
- roofs/visibility
- physical item stacks
- stockpiles/hauling
- harvesting

### Milestone C - Survival loop
- beds/sleep
- food/meals
- grow zones/crops
- expanded needs
- schedules/work priorities

### Milestone D - Social simulation
- memories/thoughts
- relationships/social interactions
- passions/injuries
- mental breaks

### Milestone E - Cult identity
- ideology schema
- start-game ideology creation
- belief strength/conflict
- thematic roles
- ideology-driven behavior/thoughts
- rituals

### Milestone F - Growth
- global start map/stats
- local preview/settlement placement
- outsider traffic
- recruitment/conversion baseline

### Milestone G - Alpha hardening
- save migration/versioning
- animation asset/controller validation
- UI/UX cleanup
- performance profiling
- 30-60 minute regression playthrough

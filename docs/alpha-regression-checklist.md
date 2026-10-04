# Cult Tycoon Alpha Regression Playthrough

Use this checklist for the final 30–60 minute Alpha validation pass. A blocker is any issue that prevents continuing the core sandbox loop, corrupts a save, loses follower state, makes primary controls unusable, or visibly breaks spatial/animation presentation.

## 1. New game and world start
- [ ] New Game opens the Global World selector instead of immediately spawning a map.
- [ ] Region cards visibly differ in biome, temperature, resource density, food, and outsider traffic.
- [ ] Selecting the same region/seed produces the same local preview.
- [ ] Local preview accepts a valid clear settlement point and rejects water/stone/tree/rock cells.
- [ ] Ideology foundation can be chosen before founding the cult.
- [ ] Confirming starts the local game centered on the chosen settlement point.
- [ ] Six starting followers and physical starter wood/stone/food appear near the camp.

## 2. Camera, HUD, and time
- [ ] Camera pan/zoom/rotation remain controllable at start and after loading.
- [ ] Pause, 1×, 2×, and 3× are clickable and visibly indicate the current speed.
- [ ] Hamburger/management menu does not overlap the time controls.
- [ ] Follower inspector appears bottom-left and does not obscure primary build controls.
- [ ] General / Job / Skills / Inventory / Traits tabs all render.
- [ ] Wall and roof visibility toggles work without deleting architecture.
- [ ] Event log remains readable during normal play.

## 3. Followers and work
- [ ] Clicking each follower selects the correct visible pawn.
- [ ] Multiple followers can occupy/pass through nearby space without becoming permanently stuck.
- [ ] Work panel exposes 1–4/disabled priorities for Cook, Research, Pray, Build, Clean, Haul, Harvest, Grow.
- [ ] Skills and passion flames display.
- [ ] Followers autonomously choose expected high-priority reachable jobs.
- [ ] Shift-click direct work orders can preempt safe non-hauling work.
- [ ] Construction/growing/cooking experience increases related skills over time.

## 4. Harvesting and physical logistics
- [ ] Trees can be designated and produce physical Wood.
- [ ] Rocks can be designated and produce physical Stone.
- [ ] Berry bushes can be designated and produce physical Food.
- [ ] Resources remain on the ground until hauled/consumed.
- [ ] Painted stockpile zones are visible and cannot overlap.
- [ ] Clicking a stockpile allows All / Materials / Food filtering.
- [ ] Haulers do not double-claim the same stack/destination.
- [ ] Removing a stockpile leaves its physical contents valid in the world.

## 5. Construction
- [ ] Fine-grid wall/floor placement is substantially smaller than legacy terrain tiles.
- [ ] Walls occupy edges rather than entire floor cells.
- [ ] Doors place on completed wall edges and remain pathable.
- [ ] Doors visibly swing for approaching followers.
- [ ] Blueprints require physical delivered materials before construction begins.
- [ ] Construction skill affects completion speed.
- [ ] Cancelling a delivered blueprint returns materials.
- [ ] Failed placement/build does not silently delete delivered resources.
- [ ] Small bedrooms/rooms can be built without oversized legacy dimensions.

## 6. Rooms and roofs
- [ ] Closing an enclosure automatically creates a room.
- [ ] Removing/opening a boundary invalidates/recomputes the room.
- [ ] Doors count as room boundaries.
- [ ] Roofs automatically appear over valid enclosed rooms.
- [ ] Roof toggle exposes the interior.
- [ ] Beds/workstations influence inferred room purpose as expected.

## 7. Survival
- [ ] Hunger, energy, recreation, comfort, social and other needs decay visibly.
- [ ] Hungry followers seek physical food.
- [ ] Meals are preferred over raw food/crops when available.
- [ ] Raw food produces the expected negative thought/comfort consequence.
- [ ] A cookpot/cauldron consumes 2 raw food and creates 1 physical meal.
- [ ] Tired followers seek a bed.
- [ ] No-bed followers can ground-sleep rather than deadlocking.
- [ ] Enclosed/roofed bed sleep restores more rest/comfort than exposed sleep.

## 8. Farming
- [ ] Fast Root and Hearty Grain grow zones can be painted.
- [ ] Grow work appears in work priorities.
- [ ] Followers plant, tend and harvest autonomously.
- [ ] Crops visibly progress through growing/ready states.
- [ ] Harvest creates physical crop stacks.
- [ ] Temperature affects growth without freezing the simulation.
- [ ] Large grow zones do not create obvious frame-time stalls.

## 9. Schedule
- [ ] Schedule panel shows 24 hourly cells per follower.
- [ ] Cells cycle Anything → Work → Recreation → Sleep.
- [ ] Sleep blocks make followers seek rest.
- [ ] Recreation blocks influence recreation behavior without overriding critical survival.
- [ ] Work/Anything still allow autonomous jobs.
- [ ] Reset Defaults restores a valid schedule.

## 10. Mood and social simulation
- [ ] Inspector shows mood score and active thoughts.
- [ ] Meal/raw-food/sleep events create understandable temporary thoughts.
- [ ] Nearby followers develop familiarity/opinion through interactions.
- [ ] Social interactions restore social need.
- [ ] Strong positive relationships can eventually form romance.
- [ ] Low mood slows work.
- [ ] Very low mood suppresses lower-priority work and favors recovery/recreation.
- [ ] Critical mood can trigger a bounded mental break.
- [ ] Mental breaks end and the follower returns to normal AI instead of deadlocking.

## 11. Ideology
- [ ] Ideology management opens from the management menu.
- [ ] Communal Path and Ascetic Order show visibly different precepts.
- [ ] Switching foundations changes follower thoughts/behavior, especially meal/work/community/spirituality responses.
- [ ] Followers have individual belief strength.
- [ ] Trait/doctrine conflicts generate negative thoughts/belief pressure.
- [ ] Leader / Evangelist / Ritual Guide / Enforcer can be assigned/unassigned.
- [ ] Formal roles have observable simulation effects.

## 12. Outsiders and recruitment
- [ ] Visitors enter from map edges and walk into the settlement.
- [ ] High-traffic starts receive visitors materially more often than remote starts.
- [ ] Visitors remain separate from colony job/schedule systems before joining.
- [ ] Clicking a visitor opens recruitment status.
- [ ] Player can choose which follower makes a recruitment attempt.
- [ ] Social skill, opinion, ideology compatibility and cult mood affect progress.
- [ ] Unrecruited visitors eventually leave the map.
- [ ] Reaching 100 recruitment converts the visitor into a normal follower.
- [ ] Recruited follower appears in follower/work/schedule systems.

## 13. Animation and presentation
- [ ] No normal follower is visibly stuck in a T-pose.
- [ ] Semantic idle/walk/work/pray/eat/sleep clips are used when matching clips exist.
- [ ] Missing semantic clips use a stable rest pose—not vertical idle bobbing or arbitrary animation.
- [ ] Moving followers face movement direction.
- [ ] Construction walls/doors/furniture look proportional to followers.
- [ ] Continuous terrain does not read as giant separated construction tiles.
- [ ] Fog does not reduce the playable map to black except where genuinely unexplored.

## 14. Save/load round-trip
Perform this after at least 20 minutes of play with buildings, crops, relationships, outsiders and ideology state.

- [ ] Save manually.
- [ ] Continue/load restores the same global region and settlement context.
- [ ] Camera returns to the settlement.
- [ ] Follower names remain the same.
- [ ] Follower IDs/relationships still point to the correct people.
- [ ] Ideology foundation, belief strength and role assignments remain intact.
- [ ] Active thoughts/mental breaks survive appropriately.
- [ ] Work priorities, skills, passions and schedules remain intact.
- [ ] Physical item stacks and stockpiles remain intact.
- [ ] Grow zones/crop progress remain intact.
- [ ] In-progress construction and delivered materials remain intact.
- [ ] Active visitor/recruitment state remains intact.
- [ ] No duplicate jobs/resources appear after load.

## 15. Long-session Alpha acceptance
Continue until at least 30–60 minutes total.

- [ ] Cult can grow beyond the starting population through recruitment.
- [ ] Player can maintain food/rest/morale indefinitely.
- [ ] No forced formal game-over interrupts the Alpha sandbox.
- [ ] Bankruptcy/heat/population-zero conditions appear as crises, not terminal screens.
- [ ] Ascension is a non-terminal milestone.
- [ ] Simulation remains responsive as buildings, crops, items and followers accumulate.
- [ ] No blocker defects prevent continuing the sandbox.

## Regression result
Record:
- Commit SHA:
- Browser / desktop build:
- Session duration:
- Starting region/biome:
- Peak follower count:
- Peak active item stacks:
- Approx. grow-zone cells:
- Save/load performed at minute:
- Blockers:
- Major issues:
- Minor issues:
- Pass / Fail:

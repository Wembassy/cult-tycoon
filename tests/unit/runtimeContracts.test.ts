import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { World } from '../../src/ecs/World';
import { TileMap } from '../../src/world/TileMap';
import { Pathfinder } from '../../src/world/Pathfinder';
import { FogOfWar } from '../../src/world/FogOfWar';
import { FollowerFactory } from '../../src/systems/FollowerFactory';
import { AISystem } from '../../src/systems/AISystem';
import { NeedsSystem } from '../../src/systems/NeedsSystem';
import { JobSystem } from '../../src/systems/JobSystem';
import { SchedulingSystem, getScheduledActivity } from '../../src/systems/SchedulingSystem';
import { BuildingSystem } from '../../src/systems/BuildingSystem';
import { ResourceSystem } from '../../src/systems/ResourceSystem';
import { GameState } from '../../src/game/GameState';
import { SceneManager } from '../../src/engine/SceneManager';
import { MissionSystem } from '../../src/systems/MissionSystem';
import { HeatSystem } from '../../src/systems/HeatSystem';
import { TechTreeSystem } from '../../src/systems/TechTreeSystem';
import { FollowerAI } from '../../src/components/FollowerAI';
import { Transform } from '../../src/components/Transform';
import { Job } from '../../src/components/Job';
import { Needs } from '../../src/components/Needs';
import { Schedule } from '../../src/components/Schedule';
import { WorkPreferences } from '../../src/components/WorkPreferences';
import { OnMission } from '../../src/components/OnMission';

function fixture() {
  const world=new World(),map=new TileMap(20,20),pathfinder=new Pathfinder(map);
  const id=new FollowerFactory(1).spawn(world,{x:1,y:1,traits:[]}).entityId;
  const needs=world.getComponent(id,Needs)!;
  for(const key of ['hunger','faith','energy','fun','sanity','bladder','hygiene'] as const)needs[key]=100;
  const ai=world.getComponent(id,FollowerAI)!,position=world.getComponent(id,Transform)!,job=world.getComponent(id,Job)!;
  return {world,map,pathfinder,id,needs,ai,position,job,system:new AISystem(map,pathfinder)};
}
function tick(f:ReturnType<typeof fixture>, seconds:number, dt=1/30) {
  for(let t=0;t<seconds-0.00001;t+=dt)f.system.update(f.world,dt);
}

describe('Runtime contracts: real self-care and navigation',()=>{
  it('movement is invariant to simulation update frequency',()=>{
    const fast=fixture(),slow=fixture();
    for(const f of [fast,slow]){f.job.type='research';f.job.targetTile={x:15,y:1};f.ai.state='moving';}
    tick(fast,2,1/60);tick(slow,2,1/10);
    expect(fast.position.x).toBeCloseTo(slow.position.x,5);
    expect(fast.position.x).toBeCloseTo(5.8,4);
  });
  it('a critical need walks to a facility before receiving recovery',()=>{
    const f=fixture();f.needs.hunger=10;const decay=new NeedsSystem();
    f.system.setNeedFacilityProvider(()=>({id:'kitchen',x:12,y:1}));
    for(let i=0;i<60;i++){decay.update(f.world,1/30);f.system.update(f.world,1/30);}
    expect(f.position.x).toBeGreaterThan(4);
    expect(f.needs.hunger).toBeLessThan(10);
    for(let i=0;i<300;i++){decay.update(f.world,1/30);f.system.update(f.world,1/30);}
    expect(f.needs.hunger).toBeGreaterThan(70);
  });
  it('an unreachable facility cannot heal remotely',()=>{
    const f=fixture();f.needs.hunger=10;
    for(let y=0;y<20;y++)f.map.setOccupied(5,y,true);
    f.system.setNeedFacilityProvider(()=>({x:10,y:1}));tick(f,20);
    expect(f.needs.hunger).toBe(10);expect(f.position.x).toBeLessThan(5);
  });
  it('removing a facility invalidates an in-progress self-care target',()=>{
    const f=fixture();f.needs.hunger=10;let exists=true;
    f.system.setNeedFacilityProvider(()=>exists?{id:'food',x:12,y:1}:null,()=>exists);
    tick(f,2);exists=false;tick(f,8);
    expect(f.needs.hunger).toBe(10);expect(f.ai.needTargetTile).toBeNull();
  });
  it('zero food supply does not produce free hunger recovery',()=>{
    const f=fixture();f.needs.hunger=10;
    f.system.setNeedFacilityProvider(()=>({x:1,y:1}),undefined,()=>0);tick(f,10);
    expect(f.needs.hunger).toBe(10);
  });
  it('away cultists do not move, consume local needs or produce work resources',()=>{
    const f=fixture();f.world.addComponent(f.id,new OnMission(f.id));f.ai.state='working';f.job.type='cook';
    const state=new GameState({food:0});new ResourceSystem(state,{foodConsumptionPerFollower:0}).update(f.world,10);
    new NeedsSystem().update(f.world,10);tick(f,10);
    expect(state.resources.food).toBe(0);expect(f.needs.hunger).toBe(100);expect(f.position.x).toBe(1);
  });
  it('a building edit invalidates a previously cached route automatically',()=>{
    const f=fixture();const old=f.pathfinder.findPath(1,1,10,1);
    expect(old.path.every(t=>t.y===1)).toBe(true);f.map.setOccupied(5,1,true);
    const next=f.pathfinder.findPath(1,1,10,1);
    expect(next.success).toBe(true);expect(next.path.some(t=>f.map.isOccupied(t.x,t.y))).toBe(false);
  });
});

describe('Runtime contracts: jobs and schedules',()=>{
  it('disabled work is not assigned even with a very high station priority',()=>{
    const f=fixture(),jobs=new JobSystem();f.world.getComponent(f.id,WorkPreferences)!.setPriority('cook',0);
    jobs.postJob({id:'cook',type:'cook',targetTile:{x:1,y:1},priority:100,duration:8});jobs.update(f.world,1/30);
    expect(f.job.type).toBe('idle');
  });
  it('self-care releases a station so another follower can cover it',()=>{
    const f=fixture(),jobs=new JobSystem();jobs.postJob({id:'cook',type:'cook',targetTile:{x:1,y:1},priority:1,duration:8,repeat:true});jobs.update(f.world,.01);
    const second=new FollowerFactory(2).spawn(f.world,{x:2,y:1,traits:[]}).entityId;
    f.ai.needTarget='hunger';f.ai.state='needs';jobs.update(f.world,.01);
    expect(f.job.jobId).toBeNull();expect(f.world.getComponent(second,Job)!.jobId).toBe('cook');
  });
  it('cancelling a job also clears the worker component and stops production',()=>{
    const f=fixture(),jobs=new JobSystem();jobs.postJob({id:'cook',type:'cook',targetTile:{x:1,y:1},priority:1,duration:8});jobs.update(f.world,.01);
    expect(jobs.cancelJob('cook')).toBe(true);expect(f.job.jobId).toBeNull();expect(f.job.type).toBe('idle');
  });
  it('a repeating station does not disappear after one production cycle',()=>{
    const f=fixture(),jobs=new JobSystem();jobs.postJob({id:'station:1:1',type:'cook',targetTile:{x:1,y:1},priority:1,duration:1,repeat:true});
    for(let i=0;i<150;i++){jobs.update(f.world,1/30);f.system.update(f.world,1/30);}
    expect(jobs.getPostedJobs().length+jobs.getAssignedJobs().length).toBe(1);
  });
  it('each shift has eight sleep hours and a real work window',()=>{
    for(const shift of ['morning','afternoon','night'] as const){
      const hours=Array.from({length:24},(_,h)=>getScheduledActivity(shift,h));
      expect(hours.filter(x=>x==='sleeping')).toHaveLength(8);expect(hours.filter(x=>x==='working')).toHaveLength(10);
    }
  });
  it('sleep/eating schedule does not manufacture a fake working state',()=>{
    const f=fixture();f.world.addComponent(f.id,new Schedule(f.id));const schedule=new SchedulingSystem();schedule.setHour(8);schedule.update(f.world,.01);
    expect(f.ai.state).toBe('idle');expect(f.job.type).toBe('idle');
  });
});

describe('Runtime contracts: building and room validity',()=>{
  it('a door can replace a wall and the opening is traversable',()=>{
    const map=new TileMap(12,12),building=new BuildingSystem(map);
    for(let y=0;y<12;y++)building.placeWall(6,y);
    expect(new Pathfinder(map).findPath(3,5,8,5).success).toBe(false);
    expect(building.placeDoor(6,5).success).toBe(true);
    expect(new Pathfinder(map).findPath(3,5,8,5).success).toBe(true);
    expect(building.placeObject(6,5,'bed').success).toBe(false);
  });
  it('a multi-tile object validates and occupies its entire footprint',()=>{
    const map=new TileMap(12,12),b=new BuildingSystem(map);map.setTerrain(3,3,'water');
    expect(b.placeObject(2,2,'warehouse').success).toBe(false);
    map.setTerrain(3,3,'grass');expect(b.placeObject(2,2,'warehouse').success).toBe(true);
    expect(b.placeObject(3,3,'bed').success).toBe(false);
    expect(b.demolish(3,3).success).toBe(true);expect(map.isOccupied(2,2)).toBe(false);
  });
  it('floor replacement is free of accidental double charging and can be removed',()=>{
    const map=new TileMap(12,12),b=new BuildingSystem(map);
    expect(b.placeFloor(2,2).success).toBe(true);expect(b.placeFloor(2,2).cost).toBe(0);expect(b.demolish(2,2).success).toBe(true);
    map.setTerrain(2,2,'water');expect(b.placeFloor(2,2).success).toBe(false);
  });
  it('a dormitory is not operational until floor, enclosure and bed exist',()=>{
    const map=new TileMap(12,12),b=new BuildingSystem(map);
    const room=b.designateRoomArea(3,3,5,5,'bedroom','dormitory')!;
    b.placeObject(3,3,'bed');expect(b.getRoomStatus(room.id).complete).toBe(false);
    b.placeFloorArea(3,3,5,5);
    b.placeWallLine(2,2,6,2);b.placeWallLine(2,6,6,6);b.placeWallLine(2,2,2,6);b.placeWallLine(6,2,6,6);b.placeDoor(2,4);
    expect(b.getRoomStatus(room.id).complete).toBe(true);
    b.demolish(3,3);expect(b.getRoomStatus(room.id).complete).toBe(false);expect(map.getTile(3,3)!.roomId).toBe(room.id);
  });
  it('an invalid water/out-of-bounds room selection does not partially designate',()=>{
    const map=new TileMap(12,12),b=new BuildingSystem(map);map.setTerrain(3,3,'water');
    expect(b.designateRoomArea(2,2,4,4,'bedroom','dormitory')).toBeNull();expect(b.getAllRooms()).toHaveLength(0);
  });
  it('restoring a compound reconstructs multi-tile occupancy and walkable doors',()=>{
    const map=new TileMap(12,12),b=new BuildingSystem(map);b.placeObject(2,2,'warehouse');b.placeWall(6,5);b.placeDoor(6,5);
    const fresh=new TileMap(12,12),restored=new BuildingSystem(fresh);restored.restoreSnapshot(b.getSnapshot());
    expect(fresh.isOccupied(3,3)).toBe(true);expect(fresh.isOccupied(6,5)).toBe(false);expect(restored.doorTiles.has('6,5')).toBe(true);
  });
});

describe('Runtime contracts: persistent progression and rendering',()=>{
  it('entity identities survive non-contiguous restoration',()=>{
    const world=new World();world.createEntity(3);world.createEntity(19);expect(world.createEntity()).toBe(20);expect(world.hasEntity(3)).toBe(true);
  });
  it('heat-reduction rewards are not undone by the next notoriety synchronization',()=>{
    const heat=new HeatSystem();heat.syncNotoriety(80);heat.reduceHeat(25);heat.syncNotoriety(80);expect(heat.getHeat()).toBe(55);
    heat.syncNotoriety(85);expect(heat.getHeat()).toBe(60);
  });
  it('completed research survives a restore without recharging or firing reward callbacks',()=>{
    let callbacks=0;const tech=new TechTreeSystem(()=>callbacks++);tech.unlock('recruitment_ii',1000,100);
    const ids=tech.getUnlocked().map(n=>n.id);tech.restore(ids);expect(callbacks).toBe(1);expect(tech.getEffectBonus('maxPopulationPlus')).toBe(10);
    tech.restore();expect(tech.getUnlocked()).toHaveLength(0);
  });
  it('mission snapshots preserve team IDs, elapsed time and pending choices',()=>{
    const f=fixture();const missions=new MissionSystem(undefined,undefined,2);const template=missions.getAvailableMissions().find(m=>m.minCultists===1)!;
    expect(missions.startMission(template.id,[f.id],f.world).success).toBe(true);missions.update(f.world,template.duration/2);
    const snapshot=JSON.parse(JSON.stringify(missions.snapshot()));const restored=new MissionSystem();restored.restore(snapshot,f.world);
    expect(restored.snapshot()).toEqual(snapshot);expect(f.world.hasComponent(f.id,OnMission)).toBe(true);
  });
  it('the starter clearing remains visible when followers leave it',()=>{
    const fog=new FogOfWar(3);fog.revealArea(10,10,5);fog.update([]);expect(fog.isVisible(10,10)).toBe(true);
  });
  it('repeated fog redraws are idempotent instead of multiplying terrain toward black',()=>{
    const world=new World(),map=new TileMap(4,4),fog=new FogOfWar(1),scene=new SceneManager(new THREE.Scene(),world,map);
    scene.setFog(fog);scene.buildTiles();fog.update([{x:1,y:1}]);scene.updateFog();fog.update([]);scene.updateFog();
    const mesh=scene.getTileMesh(1,1) as THREE.InstancedMesh;const before=new THREE.Color(),after=new THREE.Color();mesh.getColorAt(5,before);
    for(let i=0;i<300;i++)scene.updateFog();mesh.getColorAt(5,after);expect(after.toArray()).toEqual(before.toArray());
    scene.dispose();
  });
});

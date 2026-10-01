/**
 * DataManager — Loads and provides typed access to game data files.
 * All data is loaded synchronously from JSON imports.
 */

import traitsData from '../data/traits.json';
import objectsData from '../data/objects.json';
import roomsData from '../data/rooms.json';
import ritualsData from '../data/rituals.json';
import eventsData from '../data/events.json';
import techData from '../data/tech.json';
import patronsData from '../data/patrons.json';

export interface TraitDef {
  id: string;
  name: string;
  description: string;
  effects: Record<string, number>;
}

export interface ObjectDef {
  id: string;
  name: string;
  category: string;
  cost: number;
  size: { w: number; h: number };
  meshId: string;
  effects: Record<string, number>;
}

export interface RoomDef {
  id: string;
  name: string;
  minSize: number;
  requiredObjects: string[];
  effects: Record<string, number>;
}

export interface RitualDef {
  id: string;
  name: string;
  duration: number;
  minFollowers: number;
  faithCost: number;
  wealthCost?: number;
  influenceGain: number;
  faithGain?: number;
  notorietyGain?: number;
  requirements: string[];
  description: string;
}

export interface EventConditions {
  minFollowers?: number;
  minNotoriety?: number;
  minFaith?: number;
  minFunds?: number;
  minInfluence?: number;
  requiresTech?: string;
}

export interface EventChoice {
  label: string;
  description?: string;
  effects: Record<string, number | boolean>;
}

export interface EventDef {
  id: string;
  name: string;
  type: 'positive' | 'negative' | 'danger';
  probability: number;
  minDay: number;
  description: string;
  effects: Record<string, number | boolean>;
  conditions?: EventConditions;
  choices?: EventChoice[];
}

export interface TechDef {
  id: string;
  name: string;
  cost: number;
  tier: number;
  requires?: string[];
  description: string;
  unlocks: string[];
  effects?: Record<string, number>;
}

export interface PatronDef {
  id: string;
  name: string;
  tier: number;
  giftInterval: number;
  description: string;
  gifts: { type: string; amount: number }[];
}

export class DataManager {
  static getTraits(): TraitDef[] {
    return (traitsData as any).traits;
  }

  static getObjects(): ObjectDef[] {
    return (objectsData as any).objects;
  }

  static getRooms(): RoomDef[] {
    return (roomsData as any).rooms;
  }

  static getRituals(): RitualDef[] {
    return (ritualsData as any).rituals;
  }

  static getEvents(): EventDef[] {
    return (eventsData as any).events;
  }

  static getTech(): TechDef[] {
    return (techData as any).tech;
  }

  static getPatrons(): PatronDef[] {
    return (patronsData as any).patrons;
  }

  static getObject(id: string): ObjectDef | undefined {
    return this.getObjects().find(o => o.id === id);
  }

  static getRoom(id: string): RoomDef | undefined {
    return this.getRooms().find(r => r.id === id);
  }

  static getRitual(id: string): RitualDef | undefined {
    return this.getRituals().find(r => r.id === id);
  }

  static getTechNode(id: string): TechDef | undefined {
    return this.getTech().find(t => t.id === id);
  }
}
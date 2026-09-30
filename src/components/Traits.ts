import type { Component } from '../ecs/Component';

export type TraitType =
  | 'insomniac'
  | 'zealous'
  | 'doubter'
  | 'charismatic'
  | 'lazy'
  | 'scholar'
  | 'hardy'
  | 'fragile';

export class Traits implements Component {
  constructor(public readonly entity: number) {}
  traits: TraitType[] = [];
}
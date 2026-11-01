// The per-kit part of a HeroView (perception/kits/*.ts build one each; perceive.ts only dispatches).
// Owner: contracts.

import type { AbilityView, GunnerView, HeroView, ResourceView } from '../types.ts';

export interface HeroParts {
  readonly kit: HeroView['kit'];
  readonly role: HeroView['role'];
  readonly resources: ResourceView[];
  readonly abilities: AbilityView[];
  readonly lineAllies: number[];
  readonly gunner?: GunnerView;
}

import { describe, it, expect } from 'vitest';
import {
  doubleEdgePool,
  soakPools,
  attributeTestPool,
  autosoftPool,
  findActiveCombatant,
  actionCategories,
} from '../src/utils.js';

function makeActor({ id = 'a1', attrs = {}, system = {} } = {}) {
  return { id, system, getAttribute: key => attrs[key] ?? 0 };
}

describe('dice pools', () => {
  it('doubles Edge', () => {
    expect(doubleEdgePool(makeActor({ attrs: { EDGE: 4 } }))).toBe(8);
  });

  it('adds armor to Body for the soak pools', () => {
    const actor = makeActor({ attrs: { BODY: 4, WILLPOWER: 3 }, system: { armor: { ballistic: 6, impact: 2 } } });
    expect(soakPools(actor)).toEqual({
      body: 4, will: 3, ballistic: 6, impact: 2,
      pools: { 'willpower': 3, 'body': 4, 'body-impact': 6, 'body-ballistic': 10 },
    });
  });

  it('treats missing armor as 0', () => {
    const { ballistic, impact } = soakPools(makeActor({ attrs: { BODY: 4 } }));
    expect([ballistic, impact]).toEqual([0, 0]);
  });

  it('sums both attributes of a test', () => {
    const actor = makeActor({ attrs: { LOGIC: 4, WILLPOWER: 3 } });
    expect(attributeTestPool(actor, { attr1: 'LOGIC', attr2: 'WILLPOWER' })).toEqual({ v1: 4, v2: 3, total: 7 });
  });

  it('adds Pilot and autosoft rating, defaulting both to 0', () => {
    expect(autosoftPool(makeActor({ system: { pilot: 3 } }), { system: { rating: 2 } }))
      .toEqual({ pilot: 3, rating: 2, total: 5 });
    expect(autosoftPool(makeActor(), { system: {} })).toEqual({ pilot: 0, rating: 0, total: 0 });
  });
});

describe('findActiveCombatant', () => {
  function withCombat(combatants, fn) {
    const combat = game.combat;
    game.combat = { combatants };
    try { return fn(); } finally { game.combat = combat; }
  }

  it('returns nothing outside of combat', () => {
    expect(findActiveCombatant(makeActor(), null)).toBeUndefined();
  });

  it('matches by token first', () => withCombat([{ tokenId: 't1', actor: { id: 'other' } }], () => {
    expect(findActiveCombatant(makeActor(), { id: 't1' })).toEqual({ tokenId: 't1', actor: { id: 'other' } });
  }));

  it('falls back to the actor id without a token', () => withCombat([{ tokenId: 't9', actor: { id: 'a1' } }], () => {
    expect(findActiveCombatant(makeActor(), null)?.tokenId).toBe('t9');
  }));
});

describe('actionCategories', () => {
  it('prefers the system enum', () => {
    expect(actionCategories()).toEqual(['MATRIX', 'RIGGING']);
  });

  it('falls back to the static list when the system enum is missing', () => {
    const enumValue = game.sr4.ActionCategory;
    delete game.sr4.ActionCategory;
    try {
      expect(actionCategories()).toEqual(['MATRIX', 'RIGGING']);
    } finally {
      game.sr4.ActionCategory = enumValue;
    }
  });
});

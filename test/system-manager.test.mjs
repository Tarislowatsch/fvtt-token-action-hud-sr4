import { describe, it, expect, vi, beforeAll } from 'vitest';
import '../src/system-manager.js';

// The module registers its bootstrap on import; grab it before clearMocks wipes the call log.
const [, bootstrap] = Hooks.once.mock.calls.find(([event]) => event === 'tokenActionHudCoreApiReady');

const coreModule = {
  api: {
    SystemManager: class {},
    ActionHandler: class { addActions = vi.fn(); },
    RollHandler:   class {},
  },
};

let module;
let manager;
let layout;
let groups;
let calledHooks;
let registeredHooks;

beforeAll(async () => {
  module = { id: 'token-action-hud-sr4' };
  game.modules = { get: vi.fn(() => module) };
  Hooks.on = vi.fn();
  await bootstrap(coreModule);
  // clearMocks resets call logs before each test, so keep copies.
  calledHooks = [...Hooks.call.mock.calls];
  registeredHooks = Hooks.on.mock.calls.map(([event]) => event);
  manager = new module.api.SystemManager();
  ({ layout, groups } = await manager.registerDefaults());
});

// -----------------------------------------------------------------------
// Bootstrap
// -----------------------------------------------------------------------

describe('bootstrap', () => {
  it('exposes the system manager and signals readiness to the HUD core', () => {
    expect(module.api.SystemManager).toBeTypeOf('function');
    expect(calledHooks).toContainEqual(['tokenActionHudSystemReady', module]);
  });

  it('registers the linked-actor refresh hooks', () => {
    expect(registeredHooks).toEqual(expect.arrayContaining(['updateActor', 'createActor', 'deleteActor']));
  });

  it('hands out action and roll handlers built on the core classes', () => {
    expect(manager.getActionHandler()).toBeInstanceOf(coreModule.api.ActionHandler);
    expect(manager.getRollHandler()).toBeInstanceOf(coreModule.api.RollHandler);
    expect(manager.getAvailableRollHandlers()).toEqual({ core: 'SR4 Default' });
  });
});

// -----------------------------------------------------------------------
// Layout
// -----------------------------------------------------------------------

describe('registerDefaults', () => {
  it('derives a flat group registry without nestIds from the layout', () => {
    const layoutIds = layout.flatMap(tab => [tab.id, ...tab.groups.map(g => g.id)]);
    expect(groups.map(g => g.id)).toEqual(layoutIds);
    expect(groups.every(g => !('nestId' in g) && !('groups' in g))).toBe(true);
  });

  it('nests every sub-group under its tab', () => {
    for (const tab of layout) {
      expect(tab.nestId).toBe(tab.id);
      for (const group of tab.groups) expect(group.nestId).toBe(`${tab.id}_${group.id}`);
    }
  });

  it('uses unique group ids', () => {
    const ids = groups.map(g => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// -----------------------------------------------------------------------
// Every group the action handler fills must exist in the layout,
// otherwise its actions silently never show up in the HUD.
// -----------------------------------------------------------------------

describe('layout covers every group the action handler uses', () => {
  const layoutNestIds = () => new Set(layout.flatMap(tab => tab.groups.map(g => g.nestId)));

  function makeActor({ type, items = [], system = {}, attrs = {} }) {
    return {
      type,
      uuid: `Actor.${type}`,
      isOwner: true,
      system: { conditionMonitor: { physical: { value: 0, max: 10 }, stun: { value: 0, max: 10 } }, ...system },
      getAttribute: key => attrs[key] ?? 3,
      items: {
        filter: fn => items.filter(fn),
        some:   fn => items.some(fn),
        get:    id => items.find(i => i.id === id),
      },
      effects: { contents: [{ id: 'e1', name: 'Effect', disabled: false, changes: [] }] },
    };
  }

  function itemsForEverything() {
    const effects = { contents: [{ id: 'ie1', name: 'Item Effect', disabled: false }] };
    const items = [];
    for (const category of ['combat', 'physical', 'social', 'technical', 'matrix', 'magic', 'vehicle', 'misc', 'resonance']) {
      items.push({ id: `as-${category}`, type: 'Skill', name: category, system: { type: 'active', rating: 1, category } });
    }
    for (const category of ['academic', 'street', 'language', 'hobby', 'misc']) {
      items.push({ id: `ks-${category}`, type: 'Skill', name: category, system: { type: 'knowledge', rating: 1, category } });
    }
    for (const category of ['COMBAT', 'DETECTION', 'HEALTH', 'ILLUSION', 'GEOMANCY', 'MANIPULATION']) {
      items.push({ id: `sp-${category}`, type: 'Spell', name: category, system: { category }, effects });
    }
    for (const [type, id] of [['Power', 'pow'], ['CritterPower', 'cp'], ['Implant', 'imp'], ['Program', 'prog']]) {
      items.push({ id, type, name: type, system: { complexform: false }, effects });
      items.push({ id: `act-${id}`, type: 'Action', name: `${type} action`, system: { linkedItemId: id } });
    }
    items.push({ id: 'act-spell', type: 'Action', name: 'Spell action', system: { linkedItemId: 'sp-COMBAT' } });
    items.push({ id: 'act-free', type: 'Action', name: 'Free', system: {} });
    items.push({ id: 'act-matrix', type: 'Action', name: 'Hack', system: { category: 'MATRIX' } });
    items.push({ id: 'act-rigging', type: 'Action', name: 'Ram', system: { category: 'RIGGING' } });
    items.push({ id: 'w1', type: 'Ranged Weapon', name: 'Pistol', system: {} });
    items.push({ id: 'arm1', type: 'Armor', name: 'Vest', system: {} });
    items.push({ id: 'cl1', type: 'Commlink', name: 'Commlink', system: { equipped: true } });
    items.push({ id: 'auto1', type: 'Autosoft', name: 'Clearsight', system: { rating: 2 } });
    return items;
  }

  async function usedNestIds(actor) {
    const handler = manager.getActionHandler();
    handler.actor = actor;
    await handler.buildSystemActions([]);
    return handler.addActions.mock.calls.map(([, group]) => group.nestId);
  }

  const CHARACTER_SYSTEM = { technomancy: { technomancer: true }, matrix: { jammedBy: 'x' } };

  /** Builds a fully equipped actor of the given type and returns the nestIds it filled. */
  async function buildEverything(type, system) {
    const templates = game.sr4.effects;
    const realms = game.sr4.initiative.getAvailableRealms;
    game.sr4.effects = { getAllEffectTemplates: () => [{ key: 't1', name: 'Template', changes: [] }] };
    game.sr4.initiative.getAvailableRealms = () => ['physical', 'astral'];
    game.sr4.linkedActors.findLinkedActors.mockReturnValueOnce([{ id: 's1', uuid: 'Actor.s1', name: 'S', isOwner: true }]);
    try {
      return await usedNestIds(makeActor({ type, items: itemsForEverything(), system, attrs: { MAGIC: 5 } }));
    } finally {
      game.sr4.effects = templates;
      game.sr4.initiative.getAvailableRealms = realms;
    }
  }

  function unknownGroups(used) {
    const known = layoutNestIds();
    return used.filter(id => !known.has(id));
  }

  it.each([
    ['vehicle', { controlMode: 'remote', pilot: 2 }],
    ['spirit',  { ownerUuid: 'Actor.character' }],
    ['device',  {}],
  ])('for a fully equipped %s', async (type, system) => {
    const used = await buildEverything(type, system);
    expect(used.length).toBeGreaterThan(0);
    expect(unknownGroups(used)).toEqual([]);
  });

  it('for a fully equipped character', async () => {
    expect(unknownGroups(await buildEverything('character', CHARACTER_SYSTEM))).toEqual([]);
  });

  it('the character fixture reaches every layout group a character can fill', async () => {
    const used = new Set(await buildEverything('character', CHARACTER_SYSTEM));
    const vehicleOnly = ['basics_basics-control-mode', 'basics_basics-drone-actions'];
    const unreached = [...layoutNestIds()].filter(id => !used.has(id) && !vehicleOnly.includes(id));
    expect(unreached).toEqual([]);
  });
});

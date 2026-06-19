import { describe, it, expect, vi } from 'vitest';
import { createActionHandler } from '../src/action-handler.js';

// Returns a fresh handler instance with its own addActions spy per test.
function makeHandler() {
  const coreModule = {
    api: {
      ActionHandler: class {
        addActions = vi.fn();
      },
    },
  };
  const HandlerClass = createActionHandler(coreModule);
  return new HandlerClass();
}

// Finds the addActions call for a given group id and returns the actions array.
// Throws if the group was never called, so a missing group surfaces as a clear error.
function actionsFor(handler, groupId) {
  const call = handler.addActions.mock.calls.find(([, group]) => group.id === groupId);
  if (!call) throw new Error(`addActions was never called with group "${groupId}"`);
  return call[0];
}

async function build(actor) {
  const handler = makeHandler();
  handler.actor = actor;
  await handler.buildSystemActions([]);
  return handler;
}

function makeActor({ type = 'character', attrs = {}, items = [], effects = [] } = {}) {
  return {
    type,
    system: { conditionMonitor: null },
    getAttribute: vi.fn(key => attrs[key] ?? 0),
    items: {
      filter: vi.fn(fn => items.filter(fn)),
      get:    vi.fn(id  => items.find(i => i.id === id)),
    },
    effects: { contents: effects },
  };
}

// -----------------------------------------------------------------------
// Skills
// -----------------------------------------------------------------------

describe('skills', () => {
  function makeSkill(overrides = {}) {
    return {
      id:     's1',
      type:   'Skill',
      name:   'Pistols',
      img:    null,
      ...overrides,        // spread id/name/etc. first
      system: {            // define system after so ...overrides.system can't clobber it
        type:           'active',
        category:       'combat',
        rating:         3,
        attribute:      'AGILITY',
        label:          null,
        specialization: null,
        ...overrides.system,
      },
    };
  }

  it('only includes skills with rating > 0', async () => {
    const items = [
      makeSkill({ id: 's1', name: 'Pistols', system: { rating: 3 } }),
      makeSkill({ id: 's2', name: 'Blades',  system: { rating: 0 } }),
    ];
    const actor = makeActor({ items, attrs: { AGILITY: 5 } });
    const handler = await build(actor);

    const actions = actionsFor(handler, 'skills-combat');
    expect(actions).toHaveLength(1);
    expect(actions[0].id).toBe('s1');
  });

  it('builds button label with rating and attribute value', async () => {
    const items = [makeSkill({ system: { rating: 4, attribute: 'AGILITY' } })];
    const actor = makeActor({ items, attrs: { AGILITY: 5 } });
    const handler = await build(actor);

    const actions = actionsFor(handler, 'skills-combat');
    // loc() returns the key, so i18n keys appear verbatim in the label
    expect(actions[0].name).toBe('Pistols (4 sr4.skills.rating + 5 sr4.attributeAbr.agility)');
  });

  it('includes specialization in tooltip when present', async () => {
    const items = [makeSkill({ system: { rating: 3, specialization: 'sr4.spec.semiauto' } })];
    const actor = makeActor({ items, attrs: { AGILITY: 5 } });
    const handler = await build(actor);

    const actions = actionsFor(handler, 'skills-combat');
    expect(actions[0].tooltip).toContain('(+2) sr4.hud.specialization (sr4.spec.semiauto)');
  });

  it('omits specialization from tooltip when absent', async () => {
    const items = [makeSkill({ system: { rating: 3, specialization: null } })];
    const actor = makeActor({ items, attrs: { AGILITY: 5 } });
    const handler = await build(actor);

    const actions = actionsFor(handler, 'skills-combat');
    expect(actions[0].tooltip).not.toContain('(+2)');
  });

  it('places skills into their correct category group', async () => {
    const items = [
      makeSkill({ id: 's1', system: { category: 'combat',   rating: 2 } }),
      makeSkill({ id: 's2', system: { category: 'physical', rating: 2 } }),
    ];
    const actor = makeActor({ items, attrs: { AGILITY: 4 } });
    const handler = await build(actor);

    expect(actionsFor(handler, 'skills-combat'  )?.[0].id).toBe('s1');
    expect(actionsFor(handler, 'skills-physical')?.[0].id).toBe('s2');
  });
});

// -----------------------------------------------------------------------
// Spell tooltips
// -----------------------------------------------------------------------

describe('spell tooltip', () => {
  function makeSpell({ id = 'sp1', name = 'Fireball', category = 'COMBAT', system = {} } = {}) {
    return {
      id,
      type: 'Spell',
      name,
      img: null,
      system: {
        category,
        type:       'P',
        range:      'LOS',
        duration:   'S',
        dv:         '(F/2)+3',
        combatType: 'direct',
        damageType: 'P',
        element:    null,
        area:       false,
        ...system,
      },
    };
  }

  it('includes combatType and damageType for COMBAT spells', async () => {
    const actor = makeActor({ attrs: { MAGIC: 5 }, items: [makeSpell()] });
    const handler = await build(actor);

    const actions = actionsFor(handler, 'spells-combat');
    expect(actions[0].tooltip).toContain('sr4.spell.combatTypes.direct');
    expect(actions[0].tooltip).toContain('sr4.damage.P');
  });

  it('omits combat info for non-COMBAT spells', async () => {
    const spell = makeSpell({ category: 'DETECTION', system: { combatType: null, damageType: null } });
    const actor = makeActor({ attrs: { MAGIC: 5 }, items: [spell] });
    const handler = await build(actor);

    const actions = actionsFor(handler, 'spells-detection');
    expect(actions[0].tooltip).not.toContain('sr4.spell.combatTypes');
    expect(actions[0].tooltip).not.toContain('sr4.damage');
  });

  it('includes area marker for area spells', async () => {
    const spell = makeSpell({ system: { area: true } });
    const actor = makeActor({ attrs: { MAGIC: 5 }, items: [spell] });
    const handler = await build(actor);

    const actions = actionsFor(handler, 'spells-combat');
    expect(actions[0].tooltip).toContain('sr4.spell.area');
  });

  it('does not appear in HUD when MAGIC attribute is 0', async () => {
    const actor = makeActor({ attrs: { MAGIC: 0 }, items: [makeSpell()] });
    const handler = await build(actor);

    const calledGroups = handler.addActions.mock.calls.map(([, g]) => g.id);
    expect(calledGroups).not.toContain('spells-combat');
  });
});

// -----------------------------------------------------------------------
// Effect tooltips
// -----------------------------------------------------------------------

describe('effect tooltip', () => {
  function makeEffect(overrides = {}) {
    return { id: 'e1', name: 'Sustained', icon: null, disabled: false, changes: [], ...overrides };
  }

  it('prefixes positive change values with +', async () => {
    const actor = makeActor({ effects: [makeEffect({ changes: [{ value: '3' }] })] });
    const handler = await build(actor);

    const actions = actionsFor(handler, 'effects-active');
    expect(actions[0].tooltip).toContain('+3');
  });

  it('does not add + prefix to negative values', async () => {
    const actor = makeActor({ effects: [makeEffect({ changes: [{ value: '-2' }] })] });
    const handler = await build(actor);

    const actions = actionsFor(handler, 'effects-active');
    expect(actions[0].tooltip).toContain('-2');
    expect(actions[0].tooltip).not.toContain('+-2');
  });

  it('falls back to name + delete hint when no changes are present', async () => {
    const actor = makeActor({ effects: [makeEffect({ name: 'Blind', changes: [] })] });
    const handler = await build(actor);

    const actions = actionsFor(handler, 'effects-active');
    expect(actions[0].tooltip).toBe('Blind\nsr4.hud.effects.deleteHint');
  });
});

// -----------------------------------------------------------------------
// Weapon filter
// -----------------------------------------------------------------------

describe('weapons', () => {
  it('only includes Ranged Weapon and Melee Weapon types', async () => {
    const items = [
      { id: 'w1', type: 'Ranged Weapon', name: 'Pistol',  img: null, system: { damage: 8, ap: -4 } },
      { id: 'w2', type: 'Melee Weapon',  name: 'Knife',   img: null, system: { damage: 4, ap:  0 } },
      { id: 'w3', type: 'Skill',         name: 'Shooting', img: null,
        system: { type: 'active', category: 'combat', rating: 3, attribute: 'AGILITY', label: null } },
    ];
    const actor = makeActor({ items });
    const handler = await build(actor);

    const actions = actionsFor(handler, 'weapons-list');
    const weapons = actions.filter(a => !a.id.startsWith('equip-') && !a.id.startsWith('reload-'));
    expect(weapons).toHaveLength(2);
    expect(weapons.map(a => a.id)).toEqual(['w1', 'w2']);
  });

  it('appends a reload action for a ranged weapon with maxAmmo > 0', async () => {
    const items = [
      { id: 'w1', type: 'Ranged Weapon', name: 'Pistol', img: null,
        system: { damage: 8, ap: -4, loadedAmmoId: 'ammo1', maxAmmo: 15, currentAmmo: 7 } },
    ];
    const actor = makeActor({ items });
    const handler = await build(actor);

    const actions = actionsFor(handler, 'weapons-list');
    expect(actions).toHaveLength(2);
    const reload = actions.find(a => a.id === 'reload-w1');
    expect(reload).toBeDefined();
    expect(reload.encodedValue).toBe('reload|w1');
    expect(reload.img).toBe('icons/svg/refresh.svg');
    expect(reload.name).toBe('↺ Pistol (7/15)');
    expect(reload.tooltip).toBe('sr4.weapon.reload: 7/15');
  });

  it('appends a reload action even without loaded ammo', async () => {
    const items = [
      { id: 'w1', type: 'Ranged Weapon', name: 'Pistol', img: null,
        system: { damage: 8, ap: -4, loadedAmmoId: null, maxAmmo: 15, currentAmmo: 0 } },
    ];
    const actor = makeActor({ items });
    const handler = await build(actor);

    const actions = actionsFor(handler, 'weapons-list');
    expect(actions).toHaveLength(2);
    expect(actions.find(a => a.id === 'reload-w1')).toBeDefined();
  });

  it('does not add a reload action when maxAmmo is 0', async () => {
    const items = [
      { id: 'w1', type: 'Ranged Weapon', name: 'SMG', img: null,
        system: { damage: 6, ap: 0, loadedAmmoId: 'ammo1', maxAmmo: 0, currentAmmo: 0 } },
    ];
    const actor = makeActor({ items });
    const handler = await build(actor);

    const actions = actionsFor(handler, 'weapons-list');
    expect(actions).toHaveLength(1);
    expect(actions[0].id).toBe('w1');
  });

  it('does not add a reload action for a melee weapon', async () => {
    const items = [
      { id: 'w1', type: 'Melee Weapon', name: 'Sword', img: null,
        system: { damage: 6, ap: -1, loadedAmmoId: 'ammo1', maxAmmo: 1, currentAmmo: 1 } },
    ];
    const actor = makeActor({ items });
    const handler = await build(actor);

    const actions = actionsFor(handler, 'weapons-list');
    expect(actions.find(a => a.id.startsWith('reload-'))).toBeUndefined();
    expect(actions.find(a => a.id === 'w1')).toBeDefined();
  });

  it('prefers effectiveDamage/effectiveAP over base values in the tooltip', async () => {
    const items = [
      { id: 'w1', type: 'Melee Weapon', name: 'Katana', img: null,
        system: { damage: 6, ap: -1, effectiveDamage: 8, effectiveAP: -3 } },
    ];
    const actor = makeActor({ items });
    const handler = await build(actor);

    const weapon = actionsFor(handler, 'weapons-list').find(a => a.id === 'w1');
    expect(weapon.tooltip).toBe('Katana · DMG: 8 AP: -3');
  });

  it('appends an equip toggle for a melee weapon', async () => {
    const items = [
      { id: 'w1', type: 'Melee Weapon', name: 'Knife', img: null,
        system: { damage: 4, ap: 0, equipped: false } },
    ];
    const actor = makeActor({ items });
    const handler = await build(actor);

    const equip = actionsFor(handler, 'weapons-list').find(a => a.id === 'equip-w1');
    expect(equip).toBeDefined();
    expect(equip.encodedValue).toBe('equip|w1');
    expect(equip.cssClass).toBe('');
    expect(equip.name).toBe('○ Knife');
  });

  it('marks an equipped melee weapon with the active css class', async () => {
    const items = [
      { id: 'w1', type: 'Melee Weapon', name: 'Knife', img: null,
        system: { damage: 4, ap: 0, equipped: true } },
    ];
    const actor = makeActor({ items });
    const handler = await build(actor);

    const equip = actionsFor(handler, 'weapons-list').find(a => a.id === 'equip-w1');
    expect(equip.cssClass).toBe('active');
    expect(equip.name).toBe('✦ Knife');
    expect(equip.img).toBe('icons/svg/sword.svg');
  });

  it('does not add an equip toggle for a ranged weapon', async () => {
    const items = [
      { id: 'w1', type: 'Ranged Weapon', name: 'Pistol', img: null,
        system: { damage: 8, ap: -4, maxAmmo: 0, equipped: false } },
    ];
    const actor = makeActor({ items });
    const handler = await build(actor);

    const actions = actionsFor(handler, 'weapons-list');
    expect(actions.find(a => a.id === 'equip-w1')).toBeUndefined();
  });

  it('appends an equip toggle for each armor item', async () => {
    const items = [
      { id: 'a1', type: 'Armor', name: 'Jacket', img: null, system: { equipped: true } },
      { id: 'a2', type: 'Armor', name: 'Vest',   img: null, system: { equipped: false } },
    ];
    const actor = makeActor({ items });
    const handler = await build(actor);

    const actions = actionsFor(handler, 'weapons-list');
    const equipped = actions.find(a => a.id === 'equip-a1');
    const unequipped = actions.find(a => a.id === 'equip-a2');

    expect(equipped.encodedValue).toBe('equip|a1');
    expect(equipped.cssClass).toBe('active');
    expect(equipped.img).toBe('icons/svg/shield.svg');
    expect(unequipped.cssClass).toBe('');
  });

  it('does not call addActions for armor when no armor items exist', async () => {
    const items = [
      { id: 'w1', type: 'Melee Weapon', name: 'Knife', img: null, system: { damage: 4, ap: 0, equipped: false } },
    ];
    const actor = makeActor({ items });
    const handler = await build(actor);

    // weapons-list is added exactly once (the weapons call); no extra armor call
    const weaponListCalls = handler.addActions.mock.calls.filter(([, g]) => g.id === 'weapons-list');
    expect(weaponListCalls).toHaveLength(1);
  });
});

// -----------------------------------------------------------------------
// Item Actions & Effects (Powers / Implants)
// -----------------------------------------------------------------------

describe('buildItemActionsEffects', () => {
  function makePower(overrides = {}) {
    return {
      id: 'p1', type: 'Power', name: 'Astral Perception', img: null,
      system: { description: 'See the astral plane' },
      effects: { contents: [] },
      ...overrides,
    };
  }

  it('places items into the prefix-list group', async () => {
    const actor = makeActor({ items: [makePower()] });
    const handler = await build(actor);

    const actions = actionsFor(handler, 'powers-list');
    expect(actions).toHaveLength(1);
    expect(actions[0].id).toBe('p1');
    expect(actions[0].encodedValue).toBe('itemSheet|p1');
  });

  it('collects linked actions into prefix-actions group', async () => {
    const items = [
      makePower({ id: 'p1', name: 'Innate Spell' }),
      { id: 'a1', type: 'Action', name: 'Cast', img: null, system: { linkedItemId: 'p1', actionType: 'complex' } },
    ];
    const actor = makeActor({ items });
    const handler = await build(actor);

    const actions = actionsFor(handler, 'powers-actions');
    expect(actions).toHaveLength(1);
    expect(actions[0].name).toBe('Innate Spell: Cast');
    expect(actions[0].encodedValue).toBe('action|a1');
  });

  it('collects item effects into prefix-effects group', async () => {
    const items = [
      makePower({
        id: 'p1', name: 'Guard',
        effects: { contents: [{ id: 'e1', name: 'Shield', img: null, disabled: true }] },
      }),
    ];
    const actor = makeActor({ items });
    const handler = await build(actor);

    const actions = actionsFor(handler, 'powers-effects');
    expect(actions).toHaveLength(1);
    expect(actions[0].id).toBe('p1-e1');
    expect(actions[0].encodedValue).toBe('itemEffectToggle|p1:e1');
    expect(actions[0].cssClass).toBe('');
  });

  it('marks enabled effects with active css class', async () => {
    const items = [
      makePower({
        effects: { contents: [{ id: 'e1', name: 'Aura', img: null, disabled: false }] },
      }),
    ];
    const actor = makeActor({ items });
    const handler = await build(actor);

    const actions = actionsFor(handler, 'powers-effects');
    expect(actions[0].cssClass).toBe('active');
  });

  it('skips all groups when no items match the type', async () => {
    const actor = makeActor({ items: [] });
    const handler = await build(actor);

    const calledGroups = handler.addActions.mock.calls.map(([, g]) => g.id);
    expect(calledGroups).not.toContain('powers-list');
    expect(calledGroups).not.toContain('implants-list');
  });

  it('omits actions and effects groups when none exist', async () => {
    const items = [makePower()];
    const actor = makeActor({ items });
    const handler = await build(actor);

    const calledGroups = handler.addActions.mock.calls.map(([, g]) => g.id);
    expect(calledGroups).toContain('powers-list');
    expect(calledGroups).not.toContain('powers-actions');
    expect(calledGroups).not.toContain('powers-effects');
  });
});

// -----------------------------------------------------------------------
// Actions filter (linked actions excluded)
// -----------------------------------------------------------------------

describe('actions', () => {
  it('excludes actions with a linkedItemId from the actions tab', async () => {
    const items = [
      { id: 'a1', type: 'Action', name: 'Sprint', img: null, system: { actionType: 'simple' } },
      { id: 'a2', type: 'Action', name: 'Linked Cast', img: null, system: { actionType: 'complex', linkedItemId: 'sp1' } },
    ];
    const actor = makeActor({ items });
    const handler = await build(actor);

    const actions = actionsFor(handler, 'actions-list');
    expect(actions).toHaveLength(1);
    expect(actions[0].id).toBe('a1');
  });
});

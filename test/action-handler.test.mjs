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

function makeActor({ type = 'character', attrs = {}, items = [], effects = [], technomancer = false } = {}) {
  return {
    type,
    system: { conditionMonitor: null, technomancy: { technomancer } },
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
// Magic summoning (Summon/Banish/Bind)
// -----------------------------------------------------------------------

describe('magic summoning', () => {
  it('includes summon, banish and bind buttons for magicians', async () => {
    const actor = makeActor({ attrs: { MAGIC: 5 } });
    const handler = await build(actor);

    const actions = actionsFor(handler, 'magic-summoning');
    expect(actions.map(a => a.encodedValue)).toEqual([
      'summon|spirit', 'summon|watcher', 'banish|spirit', 'bind|spirit',
    ]);
  });

  it('does not appear in HUD when MAGIC attribute is 0', async () => {
    const actor = makeActor({ attrs: { MAGIC: 0 } });
    const handler = await build(actor);

    const calledGroups = handler.addActions.mock.calls.map(([, g]) => g.id);
    expect(calledGroups).not.toContain('magic-summoning');
  });
});

// -----------------------------------------------------------------------
// Matrix
// -----------------------------------------------------------------------

describe('matrix', () => {
  function makeProgram(overrides = {}) {
    const { system, ...rest } = overrides;
    return {
      id:     'p1',
      type:   'Program',
      name:   'Attack',
      img:    null,
      ...rest,
      system: { complexform: false, description: null, ...system },
    };
  }

  it('lists programs, excluding complex forms', async () => {
    const items = [
      makeProgram({ id: 'p1', name: 'Attack' }),
      makeProgram({ id: 'p2', name: 'Threading', system: { complexform: true } }),
    ];
    const actor = makeActor({ items });
    const handler = await build(actor);

    const actions = actionsFor(handler, 'matrix-list');
    expect(actions).toHaveLength(1);
    expect(actions[0].id).toBe('p1');
    expect(actions[0].encodedValue).toBe('itemSheet|p1');
  });

  it('shows resonance actions for technomancers', async () => {
    const actor = makeActor({ technomancer: true });
    const handler = await build(actor);

    const actions = actionsFor(handler, 'matrix-resonance');
    expect(actions.map(a => a.encodedValue)).toEqual([
      'summon|sprite', 'threading|thread', 'decompile|sprite', 'bind|sprite',
    ]);
  });

  it('hides resonance actions for non-technomancers', async () => {
    const actor = makeActor({ technomancer: false });
    const handler = await build(actor);

    const calledGroups = handler.addActions.mock.calls.map(([, g]) => g.id);
    expect(calledGroups).not.toContain('matrix-resonance');
  });

  it('mirrors MATRIX-categorised Action items into matrix-category-actions, even for non-technomancers', async () => {
    const items = [
      { id: 'a1', type: 'Action', name: 'Data Search', img: null, system: { actionType: 'complex', category: 'MATRIX' } },
      { id: 'a2', type: 'Action', name: 'Sprint',      img: null, system: { actionType: 'simple' } },
    ];
    const actor = makeActor({ items, technomancer: false });
    const handler = await build(actor);

    const actions = actionsFor(handler, 'matrix-category-actions');
    expect(actions).toHaveLength(1);
    expect(actions[0].id).toBe('a1');
    expect(actions[0].encodedValue).toBe('action|a1');
  });

  it('does not call addActions for matrix-category-actions when no MATRIX actions exist', async () => {
    const actor = makeActor();
    const handler = await build(actor);

    const calledGroups = handler.addActions.mock.calls.map(([, g]) => g.id);
    expect(calledGroups).not.toContain('matrix-category-actions');
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
    expect(actions).toHaveLength(2);
    expect(actions.map(a => a.id)).toEqual(['w1', 'w2']);
  });

  it('builds exactly one button per weapon', async () => {
    const items = [
      { id: 'w1', type: 'Ranged Weapon', name: 'Pistol', img: null,
        system: { damage: 8, ap: -4, maxAmmo: 15, currentAmmo: 7 } },
      { id: 'w2', type: 'Melee Weapon', name: 'Knife', img: null,
        system: { damage: 4, ap: 0, equipped: true } },
    ];
    const actor = makeActor({ items });
    const handler = await build(actor);

    const actions = actionsFor(handler, 'weapons-list');
    expect(actions).toHaveLength(2);
    expect(actions.every(a => a.encodedValue.startsWith('weapon|'))).toBe(true);
  });

  it('shows ammo in the name and both hints in the tooltip for a ranged weapon with maxAmmo > 0', async () => {
    const items = [
      { id: 'w1', type: 'Ranged Weapon', name: 'Pistol', img: null,
        system: { damage: 8, ap: -4, maxAmmo: 15, currentAmmo: 7 } },
    ];
    const actor = makeActor({ items });
    const handler = await build(actor);

    const weapon = actionsFor(handler, 'weapons-list')[0];
    expect(weapon.name).toBe('Pistol (7/15)');
    expect(weapon.encodedValue).toBe('weapon|w1');
    expect(weapon.tooltip).toBe('Pistol · DMG: 8 AP: -4\nsr4.hud.weapons.equipHint\nsr4.hud.weapons.reloadHint');
  });

  it('omits ammo and reload hint when maxAmmo is 0', async () => {
    const items = [
      { id: 'w1', type: 'Ranged Weapon', name: 'SMG', img: null,
        system: { damage: 6, ap: 0, maxAmmo: 0, currentAmmo: 0 } },
    ];
    const actor = makeActor({ items });
    const handler = await build(actor);

    const weapon = actionsFor(handler, 'weapons-list')[0];
    expect(weapon.name).toBe('SMG');
    expect(weapon.tooltip).toBe('SMG · DMG: 6 AP: 0\nsr4.hud.weapons.equipHint');
  });

  it('marks an equipped ranged weapon with the active css class', async () => {
    const items = [
      { id: 'w1', type: 'Ranged Weapon', name: 'Pistol', img: null,
        system: { damage: 8, ap: -4, maxAmmo: 15, currentAmmo: 7, equipped: true } },
    ];
    const actor = makeActor({ items });
    const handler = await build(actor);

    expect(actionsFor(handler, 'weapons-list')[0].cssClass).toBe('active');
  });

  it('prefers effectiveDamage/effectiveAP over base values in the tooltip', async () => {
    const items = [
      { id: 'w1', type: 'Melee Weapon', name: 'Katana', img: null,
        system: { damage: 6, ap: -1, effectiveDamage: 8, effectiveAP: -3 } },
    ];
    const actor = makeActor({ items });
    const handler = await build(actor);

    const weapon = actionsFor(handler, 'weapons-list').find(a => a.id === 'w1');
    expect(weapon.tooltip).toBe('Katana · DMG: 8 AP: -3\nsr4.hud.weapons.equipHint');
  });

  it('does not show the reload hint for a melee weapon', async () => {
    const items = [
      { id: 'w1', type: 'Melee Weapon', name: 'Sword', img: null,
        system: { damage: 6, ap: -1, maxAmmo: 1, currentAmmo: 1 } },
    ];
    const actor = makeActor({ items });
    const handler = await build(actor);

    const weapon = actionsFor(handler, 'weapons-list')[0];
    expect(weapon.name).toBe('Sword');
    expect(weapon.tooltip).not.toContain('sr4.hud.weapons.reloadHint');
  });

  it('shows the equip hint and no active class for an unequipped melee weapon', async () => {
    const items = [
      { id: 'w1', type: 'Melee Weapon', name: 'Knife', img: null,
        system: { damage: 4, ap: 0, equipped: false } },
    ];
    const actor = makeActor({ items });
    const handler = await build(actor);

    const weapon = actionsFor(handler, 'weapons-list')[0];
    expect(weapon.encodedValue).toBe('weapon|w1');
    expect(weapon.cssClass).toBe('');
    expect(weapon.tooltip).toContain('sr4.hud.weapons.equipHint');
  });

  it('marks an equipped melee weapon with the active css class', async () => {
    const items = [
      { id: 'w1', type: 'Melee Weapon', name: 'Knife', img: null,
        system: { damage: 4, ap: 0, equipped: true } },
    ];
    const actor = makeActor({ items });
    const handler = await build(actor);

    const weapon = actionsFor(handler, 'weapons-list')[0];
    expect(weapon.cssClass).toBe('active');
  });

  it('does not list armor items in the weapons tab', async () => {
    const items = [
      { id: 'w1', type: 'Melee Weapon', name: 'Knife', img: null, system: { damage: 4, ap: 0, equipped: false } },
      { id: 'a1', type: 'Armor', name: 'Jacket', img: null, system: { equipped: true } },
    ];
    const actor = makeActor({ items });
    const handler = await build(actor);

    const actions = actionsFor(handler, 'weapons-list');
    expect(actions.map(a => a.id)).toEqual(['w1']);
  });

  it('does not call addActions for weapons-list when no weapons exist', async () => {
    const actor = makeActor({ items: [] });
    const handler = await build(actor);

    const calledGroups = handler.addActions.mock.calls.map(([, g]) => g.id);
    expect(calledGroups).not.toContain('weapons-list');
  });
});

// -----------------------------------------------------------------------
// Armor (equip toggles in the soak group)
// -----------------------------------------------------------------------

describe('armor', () => {
  it('appends an equip toggle for each armor item to the soak group', async () => {
    const items = [
      { id: 'a1', type: 'Armor', name: 'Jacket', img: null, system: { equipped: true } },
      { id: 'a2', type: 'Armor', name: 'Vest',   img: null, system: { equipped: false } },
    ];
    const actor = makeActor({ items });
    const handler = await build(actor);

    const actions = actionsFor(handler, 'basics-soak');
    const equipped   = actions.find(a => a.id === 'equip-a1');
    const unequipped = actions.find(a => a.id === 'equip-a2');

    expect(equipped.encodedValue).toBe('equip|a1');
    expect(equipped.cssClass).toBe('active');
    expect(equipped.img).toBe('icons/svg/shield.svg');
    expect(unequipped.cssClass).toBe('');
  });

  it('keeps the soak group intact when no armor items exist', async () => {
    const actor = makeActor({ items: [] });
    const handler = await build(actor);

    const actions = actionsFor(handler, 'basics-soak');
    expect(actions.map(a => a.id)).toEqual([
      'soak-willpower', 'soak-body', 'soak-body-impact', 'soak-body-ballistic',
    ]);
  });
});

// -----------------------------------------------------------------------
// Basics: standard attribute tests
// -----------------------------------------------------------------------

describe('basics-tests', () => {
  it('builds one action per standard test with its summed dice pool', async () => {
    const actor = makeActor({
      attrs: { WILLPOWER: 4, CHARISMA: 3, INTUITION: 5, LOGIC: 2, STRENGTH: 6, BODY: 4 },
    });
    const handler = await build(actor);

    const actions = actionsFor(handler, 'basics-tests');
    expect(actions.map(a => a.id)).toEqual([
      'test-composure', 'test-judgeIntentions', 'test-memory', 'test-liftCarry',
    ]);
  });

  it('uses the attrTest encoded value with the test key', async () => {
    const actor = makeActor({ attrs: { WILLPOWER: 4, CHARISMA: 3 } });
    const handler = await build(actor);

    const composure = actionsFor(handler, 'basics-tests').find(a => a.id === 'test-composure');
    expect(composure.encodedValue).toBe('attrTest|composure');
  });

  it('includes the summed dice pool in the name', async () => {
    const actor = makeActor({ attrs: { STRENGTH: 6, BODY: 4 } });
    const handler = await build(actor);

    const liftCarry = actionsFor(handler, 'basics-tests').find(a => a.id === 'test-liftCarry');
    expect(liftCarry.name).toContain('(10)');
  });
});

// -----------------------------------------------------------------------
// Basics: initiative realm switch
// -----------------------------------------------------------------------

describe('basics-realm', () => {
  it('is omitted when only one realm is available', async () => {
    game.sr4.initiative.getAvailableRealms.mockReturnValueOnce(['physical']);
    const handler = await build(makeActor());

    const calledGroups = handler.addActions.mock.calls.map(([, g]) => g.id);
    expect(calledGroups).not.toContain('basics-realm');
  });

  it('builds one action per available realm with the current one active', async () => {
    game.sr4.initiative.getAvailableRealms.mockReturnValueOnce([
      'physical', 'matrix',
    ]);
    const actor = makeActor();
    actor.system.realm = 'matrix';
    const handler = await build(actor);

    const actions = actionsFor(handler, 'basics-realm');
    expect(actions.map(a => a.id)).toEqual(['realm-physical', 'realm-matrix']);
    expect(actions.map(a => a.encodedValue)).toEqual([
      'realm|physical', 'realm|matrix',
    ]);
    expect(actions.find(a => a.id === 'realm-matrix').cssClass).toBe('active');
    expect(actions.find(a => a.id === 'realm-physical').cssClass).toBe('');
  });

  it('prefers the combatant realm over the actor default while in combat', async () => {
    game.sr4.initiative.getAvailableRealms.mockReturnValueOnce([
      'physical', 'matrix', 'astral',
    ]);
    game.sr4.initiative.getCombatantRealm.mockReturnValueOnce('astral');
    const actor = makeActor();
    actor.id = 'a1';
    actor.system.realm = 'physical';
    game.combat = {
      combatants: { find: (fn) => [{ actor: { id: 'a1' } }].find(fn) },
    };

    try {
      const handler = await build(actor);
      const actions = actionsFor(handler, 'basics-realm');
      expect(actions.find(a => a.id === 'realm-astral').cssClass).toBe('active');
    } finally {
      game.combat = null;
    }
  });

  it('is omitted when the system initiative API is unavailable', async () => {
    const initiative = game.sr4.initiative;
    delete game.sr4.initiative;

    try {
      const handler = await build(makeActor());
      const calledGroups = handler.addActions.mock.calls.map(([, g]) => g.id);
      expect(calledGroups).not.toContain('basics-realm');
    } finally {
      game.sr4.initiative = initiative;
    }
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

  it('splits MATRIX-categorised actions into actions-category-matrix, leaving uncategorised ones in actions-list', async () => {
    const items = [
      { id: 'a1', type: 'Action', name: 'Sprint',      img: null, system: { actionType: 'simple' } },
      { id: 'a2', type: 'Action', name: 'Data Search', img: null, system: { actionType: 'complex', category: 'MATRIX' } },
    ];
    const actor = makeActor({ items });
    const handler = await build(actor);

    expect(actionsFor(handler, 'actions-list').map(a => a.id)).toEqual(['a1']);
    expect(actionsFor(handler, 'actions-category-matrix').map(a => a.id)).toEqual(['a2']);
  });

  it('does not call addActions for actions-category-matrix when no MATRIX actions exist', async () => {
    const items = [{ id: 'a1', type: 'Action', name: 'Sprint', img: null, system: { actionType: 'simple' } }];
    const actor = makeActor({ items });
    const handler = await build(actor);

    const calledGroups = handler.addActions.mock.calls.map(([, g]) => g.id);
    expect(calledGroups).not.toContain('actions-category-matrix');
  });
});

// -----------------------------------------------------------------------
// Vehicle: control mode + drone actions
// -----------------------------------------------------------------------

describe('vehicle control mode', () => {
  function makeVehicle({ controlMode = 'autonomous', items = [] } = {}) {
    const actor = makeActor({ type: 'vehicle', items });
    actor.system = { conditionMonitor: null, controlMode, pilot: 2, body: 3, armor: 1, sensor: 3, handling: 0 };
    return actor;
  }

  it('builds one toggle per control mode with the current mode marked active', async () => {
    const handler = await build(makeVehicle({ controlMode: 'remote' }));

    const actions = actionsFor(handler, 'basics-control-mode');
    expect(actions.map(a => a.id)).toEqual(['mode-autonomous', 'mode-remote', 'mode-jumped']);
    expect(actions.find(a => a.id === 'mode-remote').cssClass).toBe('active');
    expect(actions.find(a => a.id === 'mode-autonomous').cssClass).toBe('');
    expect(actions[0].encodedValue).toBe('controlMode|autonomous');
  });

  it('defaults to autonomous when no controlMode is stored', async () => {
    const vehicle = makeVehicle();
    delete vehicle.system.controlMode;
    const handler = await build(vehicle);

    const actions = actionsFor(handler, 'basics-control-mode');
    expect(actions.find(a => a.id === 'mode-autonomous').cssClass).toBe('active');
  });
});

describe('vehicle drone actions', () => {
  function makeVehicle({ controlMode = 'autonomous' } = {}) {
    const actor = makeActor({ type: 'vehicle' });
    actor.system = { conditionMonitor: null, controlMode, pilot: 2, body: 3, armor: 1, sensor: 3, handling: 0 };
    return actor;
  }

  it('builds maneuvering, perception and infiltration with the resolved pool', async () => {
    const handler = await build(makeVehicle());

    const actions = actionsFor(handler, 'basics-drone-actions');
    expect(actions.map(a => a.id)).toEqual(['drone-maneuvering', 'drone-perception', 'drone-infiltration']);
    expect(actions[0].name).toBe('sr4.vehicle.actions.maneuvering (5)');
    expect(actions[0].encodedValue).toBe('droneAction|maneuvering');
  });

  it('falls back to autonomous pools when a rigger mode is stored but no rigger is linked', async () => {
    const vehicle = makeVehicle({ controlMode: 'jumped' });
    await build(vehicle);

    expect(game.sr4.rigging.resolveDronePool)
      .toHaveBeenCalledWith(vehicle, null, 'autonomous', 'maneuvering');
  });

  it('uses the stored mode when a rigger is linked', async () => {
    const rigger = { id: 'rigger1' };
    game.sr4.rigging.resolveRigger.mockResolvedValueOnce(rigger);
    const vehicle = makeVehicle({ controlMode: 'jumped' });
    await build(vehicle);

    expect(game.sr4.rigging.resolveDronePool)
      .toHaveBeenCalledWith(vehicle, rigger, 'jumped', 'maneuvering');
  });

  it('omits the drone actions group when the system rigging API is unavailable', async () => {
    const rigging = game.sr4.rigging;
    delete game.sr4.rigging;
    try {
      const handler = await build(makeVehicle());
      const calledGroups = handler.addActions.mock.calls.map(([, g]) => g.id);
      expect(calledGroups).not.toContain('basics-drone-actions');
      expect(calledGroups).toContain('basics-control-mode');
    } finally {
      game.sr4.rigging = rigging;
    }
  });
});

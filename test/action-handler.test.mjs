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
      some:   vi.fn(fn => items.some(fn)),
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

  it('shows Matrix Attack for technomancers', async () => {
    const actor = makeActor({ technomancer: true });
    const handler = await build(actor);

    const actions = actionsFor(handler, 'matrix-combat');
    expect(actions.map(a => a.encodedValue)).toEqual(['matrixAttack|attack']);
  });

  it('shows Matrix Attack for actors with an equipped Commlink', async () => {
    const items = [
      { id: 'c1', type: 'Commlink', name: 'Renraku Sensei', img: null, system: { equipped: true } },
    ];
    const actor = makeActor({ items, technomancer: false });
    const handler = await build(actor);

    const actions = actionsFor(handler, 'matrix-combat');
    expect(actions.map(a => a.encodedValue)).toEqual(['matrixAttack|attack']);
  });

  it('hides Matrix Attack for actors without matrix access', async () => {
    const actor = makeActor({ technomancer: false });
    const handler = await build(actor);

    const calledGroups = handler.addActions.mock.calls.map(([, g]) => g.id);
    expect(calledGroups).not.toContain('matrix-combat');
  });

  it('adds Jack Out only when jammed', async () => {
    const actor = makeActor({ technomancer: true });
    actor.system.matrix = { jammedBy: 'ic1' };
    const handler = await build(actor);

    const actions = actionsFor(handler, 'matrix-combat');
    expect(actions.map(a => a.encodedValue)).toEqual(['matrixAttack|attack', 'jackOut|jackOut']);
  });
});

// -----------------------------------------------------------------------
// Device actors
// -----------------------------------------------------------------------

describe('device actor', () => {
  it('only builds Matrix Attack, monitor and effects', async () => {
    const actor = makeActor({ type: 'device' });
    const handler = await build(actor);

    const actions = actionsFor(handler, 'matrix-combat');
    expect(actions.map(a => a.encodedValue)).toEqual(['matrixAttack|attack']);

    const calledGroups = handler.addActions.mock.calls.map(([, g]) => g.id);
    expect(calledGroups).not.toContain('active-skills');
    expect(calledGroups).not.toContain('matrix-resonance');
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
    expect(actions[0].tooltip).toBe('Blind<br>sr4.hud.effects.deleteHint');
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
    expect(weapon.tooltip).toBe('Pistol · sr4.hud.weapons.damage: 8 sr4.hud.weapons.ap: -4<br>sr4.hud.weapons.equipHint<br>sr4.hud.weapons.reloadHint');
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
    expect(weapon.tooltip).toBe('SMG · sr4.hud.weapons.damage: 6 sr4.hud.weapons.ap: 0<br>sr4.hud.weapons.equipHint');
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
    expect(weapon.tooltip).toBe('Katana · sr4.hud.weapons.damage: 8 sr4.hud.weapons.ap: -3<br>sr4.hud.weapons.equipHint');
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

// -----------------------------------------------------------------------
// Linked actors: unlink from the owner side and from the linked side
// -----------------------------------------------------------------------

describe('basics-links', () => {
  function makeLinked({ id, type = 'spirit', isOwner = true, bound = false, system = {} }) {
    return { id, uuid: `Actor.${id}`, name: `Linked ${id}`, img: `${id}.png`, type, isOwner, system: { bound, ...system } };
  }

  function calledGroups(handler) {
    return handler.addActions.mock.calls.map(([, g]) => g.id);
  }

  async function buildCharacterWith(linked, { magic = 4, technomancer = true } = {}) {
    const actor = makeActor({ attrs: { MAGIC: magic }, technomancer });
    actor.uuid = 'Actor.char1';
    game.sr4.linkedActors.findLinkedActors.mockReturnValueOnce(linked);
    return build(actor);
  }

  it('puts spirits in the magic tab and sprites in the matrix tab', async () => {
    const handler = await buildCharacterWith([
      makeLinked({ id: 'spirit1' }),
      makeLinked({ id: 'sprite1', type: 'sprite' }),
      makeLinked({ id: 'foreign1', isOwner: false }),
    ]);

    expect(game.sr4.linkedActors.findLinkedActors).toHaveBeenCalledWith('Actor.char1');
    const groups = handler.addActions.mock.calls.map(([actions, g]) => [g.nestId, actions.map(a => a.encodedValue)]);
    expect(groups).toEqual(expect.arrayContaining([
      ['magic_magic-spirits',   ['linkedActor|Actor.spirit1']],
      ['matrix_matrix-sprites', ['linkedActor|Actor.sprite1']],
    ]));
  });

  it('does not list linked vehicles; unlinking a drone is left to the sheet', async () => {
    const handler = await buildCharacterWith([makeLinked({ id: 'drone1', type: 'vehicle' })]);

    const encoded = handler.addActions.mock.calls.flatMap(([actions]) => actions.map(a => a.encodedValue));
    expect(encoded).not.toContain('linkedActor|Actor.drone1');
  });

  it.each([
    ['spirit', false, { services: 2 }, 'magic-spirits',  'sr4.hud.links.unbound',      '2', '2 sr4.hud.links.services.other', ''],
    ['spirit', true,  { services: 1 }, 'magic-spirits',  'sr4.hud.links.bound',        '1', '1 sr4.hud.links.services.one',   'active'],
    ['sprite', false, {},              'matrix-sprites', 'sr4.hud.links.unregistered', '0', '0 sr4.hud.links.tasks.other',    ''],
    ['sprite', true,  { tasks: 3 },    'matrix-sprites', 'sr4.hud.links.registered',   '3', '3 sr4.hud.links.tasks.other',    'active'],
  ])('shows binding status and services of a %s (bound: %s) next to the name', async (type, bound, system, group, status, count, countTitle, cssClass) => {
    const handler = await buildCharacterWith([makeLinked({ id: 'x1', type, bound, system })]);

    expect(actionsFor(handler, group)[0]).toMatchObject({
      name: 'Linked x1',
      img: 'x1.png',
      cssClass,
      info1: { text: status },
      info2: { text: count, title: countTitle },
    });
  });

  it('falls back to the "other" plural form when a language lacks the exact category', async () => {
    const has = game.i18n.has;
    game.i18n.has = key => !key.endsWith('.one');
    try {
      const handler = await buildCharacterWith([makeLinked({ id: 'x1', system: { services: 1 } })]);
      expect(actionsFor(handler, 'magic-spirits')[0].info2.title).toBe('1 sr4.hud.links.services.other');
    } finally {
      game.i18n.has = has;
    }
  });

  it('hides spirits from a character without Magic', async () => {
    const handler = await buildCharacterWith([makeLinked({ id: 'spirit1' })], { magic: 0 });

    expect(calledGroups(handler)).not.toContain('magic-spirits');
  });

  it('hides sprites from a character who is not a technomancer', async () => {
    const handler = await buildCharacterWith([makeLinked({ id: 'sprite1', type: 'sprite' })], { technomancer: false });

    expect(calledGroups(handler)).not.toContain('matrix-sprites');
  });

  it.each([
    ['spirit', false, 'sr4.hud.links.bindHint'],
    ['spirit', true,  'sr4.hud.links.rebindHint'],
    ['sprite', false, 'sr4.hud.links.registerHint'],
    ['sprite', true,  'sr4.hud.links.reregisterHint'],
  ])('explains click and Ctrl+Click for a %s (bound: %s)', async (type, bound, hint) => {
    const handler = await buildCharacterWith([makeLinked({ id: 'x1', type, bound })]);
    const group = type === 'spirit' ? 'magic-spirits' : 'matrix-sprites';

    expect(actionsFor(handler, group)[0].tooltip).toBe(`${hint}<br>sr4.hud.links.unlinkHint`);
  });

  it('only adds the groups that have linked actors', async () => {
    const handler = await buildCharacterWith([makeLinked({ id: 'spirit1' })]);

    expect(calledGroups(handler)).toContain('magic-spirits');
    expect(calledGroups(handler)).not.toContain('matrix-sprites');
    expect(calledGroups(handler)).not.toContain('basics-links');
  });

  it('omits the group for a character without linked actors', async () => {
    const handler = await build(makeActor());

    expect(calledGroups(handler)).not.toContain('basics-links');
  });

  it.each([
    ['spirit', { ownerUuid: 'Actor.char1' }],
    ['sprite', { ownerUuid: 'Actor.char1' }],
  ])('offers a linked %s to remove itself from its owner', async (type, link) => {
    const actor = makeActor({ type });
    actor.uuid = `Actor.${type}1`;
    actor.isOwner = true;
    actor.system = { ...actor.system, ...link };

    const handler = await build(actor);

    const actions = actionsFor(handler, 'basics-links');
    expect(actions).toHaveLength(1);
    expect(actions[0].encodedValue).toBe(`unlink|Actor.${type}1`);
    expect(game.sr4.linkedActors.findLinkedActors).not.toHaveBeenCalledWith(`Actor.${type}1`);
  });

  it('offers no self-unlink to a linked vehicle', async () => {
    const actor = makeActor({ type: 'vehicle' });
    actor.uuid = 'Actor.vehicle1';
    actor.isOwner = true;
    actor.system = { ...actor.system, riggerUuid: 'Actor.char1' };

    const handler = await build(actor);

    expect(calledGroups(handler)).not.toContain('basics-links');
  });

  it('offers nothing to an unlinked spirit', async () => {
    const actor = makeActor({ type: 'spirit' });
    actor.isOwner = true;
    actor.system = { ...actor.system, ownerUuid: '' };

    const handler = await build(actor);

    expect(calledGroups(handler)).not.toContain('basics-links');
  });

  it('offers nothing to a user who does not own the linked spirit', async () => {
    const actor = makeActor({ type: 'spirit' });
    actor.isOwner = false;
    actor.system = { ...actor.system, ownerUuid: 'Actor.char1' };

    const handler = await build(actor);

    expect(calledGroups(handler)).not.toContain('basics-links');
  });

  it('omits the group when the system linked actors API is unavailable', async () => {
    const linkedActors = game.sr4.linkedActors;
    delete game.sr4.linkedActors;
    try {
      const actor = makeActor({ type: 'spirit' });
      actor.isOwner = true;
      actor.system = { ...actor.system, ownerUuid: 'Actor.char1' };

      const handler = await build(actor);

      expect(calledGroups(handler)).not.toContain('basics-links');
    } finally {
      game.sr4.linkedActors = linkedActors;
    }
  });
});

// -----------------------------------------------------------------------
// Displayed dice pools (must match what the roll handler rolls)
// -----------------------------------------------------------------------

describe('displayed dice pools', () => {
  function makeCharacter() {
    const actor = makeActor({ attrs: { BODY: 4, WILLPOWER: 3, EDGE: 5, CURRENTEDGE: 2, AGILITY: 6 } });
    actor.system.armor = { ballistic: 5, impact: 2 };
    return actor;
  }

  it.each([
    ['soak-willpower',      3],
    ['soak-body',           4],
    ['soak-body-impact',    6],
    ['soak-body-ballistic', 9],
  ])('shows the %s pool in name and tooltip', async (id, dice) => {
    const handler = await build(makeCharacter());
    const action = actionsFor(handler, 'basics-soak').find(a => a.id === id);
    expect(action.name).toMatch(new RegExp(`\\(${dice}\\)$`));
    expect(action.tooltip).toContain(`${dice}`);
  });

  it('treats missing armor as 0 in the soak pools', async () => {
    const actor = makeCharacter();
    delete actor.system.armor;
    const handler = await build(actor);
    const action = actionsFor(handler, 'basics-soak').find(a => a.id === 'soak-body-ballistic');
    expect(action.name).toMatch(/\(4\)$/);
  });

  it('shows double Edge in the edge roll button', async () => {
    const handler = await build(makeCharacter());
    expect(actionsFor(handler, 'basics-edge-rolls')[0].name).toBe('sr4.hud.edge.double (10)');
  });

  it('shows current/max Edge on the add button', async () => {
    const handler = await build(makeCharacter());
    const add = actionsFor(handler, 'basics-edge-management').find(a => a.id === 'edge-add');
    expect(add.name).toBe('sr4.hud.edge.add (2/5)');
  });

  it('shows attribute - 1 in the improvised roll tooltip', async () => {
    const handler = await build(makeCharacter());
    const agility = actionsFor(handler, 'basics-improvise').find(a => a.id === 'AGILITY');
    expect(agility.tooltip).toBe('sr4.hud.improvisedRoll sr4.stats.AGILITY 6 - 1');
  });
});

// -----------------------------------------------------------------------
// Condition monitor (characters)
// -----------------------------------------------------------------------

describe('monitor', () => {
  it('lists physical and stun tracks with their state', async () => {
    const actor = makeActor();
    actor.system.conditionMonitor = { physical: { value: 1, max: 10 }, stun: { value: 4, max: 9 } };
    const handler = await build(actor);

    const actions = actionsFor(handler, 'monitor-list');
    expect(actions.map(a => [a.id, a.name, a.encodedValue])).toEqual([
      ['physical', 'sr4.hud.monitor.physical: 1/10', 'monitor-deal|physical'],
      ['stun',     'sr4.hud.monitor.stun: 4/9',      'monitor-deal|stun'],
    ]);
  });

  it('skips tracks the actor does not have', async () => {
    const actor = makeActor();
    actor.system.conditionMonitor = { physical: { value: 0, max: 8 } };
    const handler = await build(actor);

    expect(actionsFor(handler, 'monitor-list').map(a => a.id)).toEqual(['physical']);
  });
});

// -----------------------------------------------------------------------
// Vehicle stats, autosofts and monitor
// -----------------------------------------------------------------------

describe('vehicle basics', () => {
  function makeVehicle(items = []) {
    const actor = makeActor({ type: 'vehicle', items });
    actor.system = {
      conditionMonitor: { physical: { value: 3, max: 12 }, stun: { value: 0, max: 0 } },
      controlMode: 'autonomous', pilot: 2, body: 3, armor: 1, sensor: 3, handling: 0,
    };
    return actor;
  }

  it('lists the vehicle stats as free roll buttons', async () => {
    const handler = await build(makeVehicle());
    const actions = actionsFor(handler, 'basics-improvise');
    expect(actions.map(a => a.name)).toEqual([
      'sr4.vehicle.body (3)', 'sr4.vehicle.pilot (2)', 'sr4.vehicle.armor (1)',
      'sr4.vehicle.sensor (3)', 'sr4.vehicle.handling (0)',
    ]);
    expect(actions.every(a => a.encodedValue === 'freeRoll|free-roll')).toBe(true);
  });

  it('shows Pilot + Rating on autosoft buttons', async () => {
    const autosoft = { id: 'as1', type: 'Autosoft', name: 'Clearsight', img: null, system: { rating: 3 } };
    const handler = await build(makeVehicle([autosoft]));
    const [action] = actionsFor(handler, 'basics-free-roll');
    expect(action).toMatchObject({
      id: 'as1', name: 'Clearsight (5)', encodedValue: 'autosoft|as1', img: 'icons/svg/d20.svg',
    });
  });

  it('omits the autosoft group when the vehicle has none', async () => {
    const handler = await build(makeVehicle());
    const groups = handler.addActions.mock.calls.map(([, g]) => g.id);
    expect(groups).not.toContain('basics-free-roll');
  });

  it('only shows the physical track for vehicles', async () => {
    const handler = await build(makeVehicle());
    expect(actionsFor(handler, 'monitor-list')).toEqual([expect.objectContaining({
      id: 'physical', name: 'sr4.hud.monitor.physical: 3/12', encodedValue: 'monitor-deal|physical',
    })]);
  });
});

// -----------------------------------------------------------------------
// Sorting
// -----------------------------------------------------------------------

describe('sorting', () => {
  it('sorts skills alphabetically by their localized label within a category', async () => {
    const skill = (id, name, label) => ({
      id, type: 'Skill', name, img: null,
      system: { type: 'active', rating: 1, category: 'combat', attribute: 'AGILITY', label },
    });
    const actor = makeActor({ items: [skill('s1', 'Zeta'), skill('s2', 'Ignored', 'Alpha'), skill('s3', 'Mid')] });
    const handler = await build(actor);

    expect(actionsFor(handler, 'skills-combat').map(a => a.id)).toEqual(['s2', 's3', 's1']);
  });

  it('sorts spells alphabetically within a category', async () => {
    const spell = (id, name) => ({ id, type: 'Spell', name, img: null, system: { category: 'HEALTH' } });
    const actor = makeActor({ attrs: { MAGIC: 4 }, items: [spell('b', 'Heal'), spell('a', 'Antidote')] });
    const handler = await build(actor);

    expect(actionsFor(handler, 'spells-health').map(a => a.id)).toEqual(['a', 'b']);
  });

  it('sorts programs alphabetically', async () => {
    const program = (id, name) => ({ id, type: 'Program', name, img: null, system: { complexform: false } });
    const actor = makeActor({ items: [program('p2', 'Stealth'), program('p1', 'Browse')] });
    const handler = await build(actor);

    expect(actionsFor(handler, 'matrix-list').map(a => a.id)).toEqual(['p1', 'p2']);
  });

  it('sorts categorised actions alphabetically', async () => {
    const action = (id, name) => ({ id, type: 'Action', name, img: null, system: { category: 'RIGGING' } });
    const actor = makeActor({ items: [action('a2', 'Ram'), action('a1', 'Evade')] });
    const handler = await build(actor);

    expect(actionsFor(handler, 'actions-category-rigging').map(a => a.id)).toEqual(['a1', 'a2']);
  });
});

// -----------------------------------------------------------------------
// Effect templates and durations
// -----------------------------------------------------------------------

describe('effect templates', () => {
  function withTemplates(templates, fn) {
    const effects = game.sr4.effects;
    game.sr4.effects = { getAllEffectTemplates: () => templates };
    return fn().finally(() => { game.sr4.effects = effects; });
  }

  it('lists templates with an apply hint and duration', () => withTemplates(
    [{ key: 'blind', name: 'Blind', img: null, changes: [{ value: '-6' }], duration: { turns: 3 } }],
    async () => {
      const handler = await build(makeActor());
      const [action] = actionsFor(handler, 'effects-templates');
      expect(action).toMatchObject({ id: 'effect-blind-add', encodedValue: 'effectTemplate|blind', img: 'icons/svg/aura.svg' });
      expect(action.tooltip).toBe('Blind · -6 (3 sr4.hud.effects.turns)<br>sr4.hud.effects.applyHint');
    },
  ));

  it('uses the singular unit for a one-turn duration', () => withTemplates(
    [{ key: 'stun', name: 'Stunned', changes: [{ value: '2' }], duration: { turns: 1 } }],
    async () => {
      const handler = await build(makeActor());
      expect(actionsFor(handler, 'effects-templates')[0].tooltip)
        .toBe('Stunned · +2 (1 sr4.hud.effects.turn)<br>sr4.hud.effects.applyHint');
    },
  ));

  it('keeps non-numeric change values as they are', () => withTemplates(
    [{ key: 'x', name: 'Odd', changes: [{ value: 'upgrade' }] }],
    async () => {
      const handler = await build(makeActor());
      expect(actionsFor(handler, 'effects-templates')[0].tooltip).toBe('Odd · upgrade<br>sr4.hud.effects.applyHint');
    },
  ));
});

// -----------------------------------------------------------------------
// Labels and group placement fixed after the refactoring
// -----------------------------------------------------------------------

describe('soak labels', () => {
  it('uses single spacing in names and tooltips', async () => {
    const actor = makeActor({ attrs: { BODY: 4, WILLPOWER: 3 } });
    actor.system.armor = { ballistic: 5, impact: 2 };
    const handler = await build(actor);

    const soak = actionsFor(handler, 'basics-soak').filter(a => a.id.startsWith('soak-'));
    expect(soak.map(a => [a.name, a.tooltip])).toEqual([
      ['sr4.hud.soak.willpower (3)',     'sr4.hud.soak.willpower · 3 sr4.skills.dice'],
      ['sr4.hud.soak.body (4)',          'sr4.hud.soak.body · 4 sr4.skills.dice'],
      ['sr4.hud.soak.bodyImpact (6)',    'sr4.hud.soak.bodyImpact · 4 + 2 = 6'],
      ['sr4.hud.soak.bodyBallistic (9)', 'sr4.hud.soak.bodyBallistic · 4 + 5 = 9'],
    ]);
  });
});

describe('autosoft tooltip', () => {
  it('uses localized Pilot and Rating labels', async () => {
    const actor = makeActor({ type: 'vehicle', items: [
      { id: 'as1', type: 'Autosoft', name: 'Clearsight', img: null, system: { rating: 3 } },
    ] });
    actor.system = { conditionMonitor: null, controlMode: 'autonomous', pilot: 2 };
    const handler = await build(actor);

    expect(actionsFor(handler, 'basics-free-roll')[0].tooltip)
      .toBe('sr4.vehicle.autonomous: sr4.vehicle.pilot 2 + sr4.hud.rating 3');
  });
});

describe('spell-linked actions and effects', () => {
  it('are nested under the magic tab', async () => {
    const spell = {
      id: 'sp1', type: 'Spell', name: 'Armor', img: null, system: { category: 'MANIPULATION' },
      effects: { contents: [{ id: 'e1', name: 'Sustained', disabled: false }] },
    };
    const linked = { id: 'a1', type: 'Action', name: 'Sustain', img: null, system: { linkedItemId: 'sp1' } };
    const handler = await build(makeActor({ attrs: { MAGIC: 4 }, items: [spell, linked] }));

    const groups = handler.addActions.mock.calls.map(([, g]) => g);
    expect(groups).toContainEqual({ id: 'spells-actions', nestId: 'magic_spells-actions', type: 'system' });
    expect(groups).toContainEqual({ id: 'spells-effects', nestId: 'magic_spells-effects', type: 'system' });
  });
});

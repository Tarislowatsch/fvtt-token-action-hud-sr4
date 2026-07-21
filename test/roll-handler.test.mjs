import { describe, it, expect, vi } from 'vitest';
import { createRollHandler } from '../src/roll-handler.js';

const coreModule = {
  api: {
    RollHandler: class { actor = null; },
  },
};

const SR4RollHandler = createRollHandler(coreModule);

function makeActor({ currentEdge = 3, maxEdge = 5, body = 4, armor = {}, attrs = {} } = {}) {
  const allAttrs = { CURRENTEDGE: currentEdge, EDGE: maxEdge, BODY: body, ...attrs };
  return {
    getAttribute: vi.fn(key => allAttrs[key] ?? 0),
    update: vi.fn().mockResolvedValue(undefined),
    items: {},
    system: {
      conditionMonitor: {},
      armor: { ballistic: armor.ballistic ?? 0, impact: armor.impact ?? 0 },
    },
  };
}

function makeHandler(actor) {
  const h = new SR4RollHandler();
  h.actor = actor;
  return h;
}

// -----------------------------------------------------------------------
// Edge management
// -----------------------------------------------------------------------

describe('edge|add', () => {
  it('increments current edge by 1', async () => {
    const actor = makeActor({ currentEdge: 3, maxEdge: 5 });
    await makeHandler(actor).handleActionClick({}, 'edge|add');
    expect(actor.update).toHaveBeenCalledWith({ 'system.sheetStats.CURRENTEDGE': 4 });
  });

  it('warns and skips update when already at max', async () => {
    const actor = makeActor({ currentEdge: 5, maxEdge: 5 });
    await makeHandler(actor).handleActionClick({}, 'edge|add');
    expect(actor.update).not.toHaveBeenCalled();
    expect(ui.notifications.warn).toHaveBeenCalled();
  });
});

describe('edge|spend', () => {
  it('decrements current edge by 1', async () => {
    const actor = makeActor({ currentEdge: 3, maxEdge: 5 });
    await makeHandler(actor).handleActionClick({}, 'edge|spend');
    expect(actor.update).toHaveBeenCalledWith({ 'system.sheetStats.CURRENTEDGE': 2 });
  });

  it('warns and skips update when edge is already 0', async () => {
    const actor = makeActor({ currentEdge: 0, maxEdge: 5 });
    await makeHandler(actor).handleActionClick({}, 'edge|spend');
    expect(actor.update).not.toHaveBeenCalled();
    expect(ui.notifications.warn).toHaveBeenCalled();
  });
});

describe('edge|reset', () => {
  it('sets edge back to max', async () => {
    const actor = makeActor({ currentEdge: 2, maxEdge: 5 });
    await makeHandler(actor).handleActionClick({}, 'edge|reset');
    expect(actor.update).toHaveBeenCalledWith({ 'system.sheetStats.CURRENTEDGE': 5 });
  });
});

// -----------------------------------------------------------------------
// Initiative realm switch
// -----------------------------------------------------------------------

describe('realm|<realm>', () => {
  it('updates the actor default realm outside of combat', async () => {
    const actor = makeActor();
    await makeHandler(actor).handleActionClick({}, 'realm|matrix');
    expect(actor.update).toHaveBeenCalledWith({ 'system.realm': 'matrix' });
  });

  it('sets the combatant flag and rerolls a rolled initiative in combat', async () => {
    const actor = makeActor();
    actor.id = 'a1';
    const rollInitiative = vi.fn().mockResolvedValue(undefined);
    const combatant = {
      id: 'c1',
      actor: { id: 'a1' },
      initiative: 12,
      setFlag: vi.fn().mockResolvedValue(undefined),
      combat: { rollInitiative },
    };
    game.combat = {
      combatants: { find: (fn) => [combatant].find(fn) },
    };

    try {
      await makeHandler(actor).handleActionClick({}, 'realm|astral');
      expect(combatant.setFlag).toHaveBeenCalledWith('shadowrun4e', 'realm', 'astral');
      expect(rollInitiative).toHaveBeenCalledWith(['c1']);
      expect(actor.update).not.toHaveBeenCalled();
    } finally {
      game.combat = null;
    }
  });

  it('does not reroll when the combatant has no initiative yet', async () => {
    const actor = makeActor();
    actor.id = 'a1';
    const rollInitiative = vi.fn();
    const combatant = {
      id: 'c1',
      actor: { id: 'a1' },
      initiative: null,
      setFlag: vi.fn().mockResolvedValue(undefined),
      combat: { rollInitiative },
    };
    game.combat = {
      combatants: { find: (fn) => [combatant].find(fn) },
    };

    try {
      await makeHandler(actor).handleActionClick({}, 'realm|matrix');
      expect(combatant.setFlag).toHaveBeenCalledWith('shadowrun4e', 'realm', 'matrix');
      expect(rollInitiative).not.toHaveBeenCalled();
    } finally {
      game.combat = null;
    }
  });
});

// -----------------------------------------------------------------------
// Soak
// -----------------------------------------------------------------------

describe('soak|body-ballistic', () => {
  it('uses pre-computed actor armor totals', async () => {
    const actor = makeActor({ body: 4, armor: { ballistic: 5, impact: 3 } });
    await makeHandler(actor).handleActionClick({}, 'soak|body-ballistic');
    expect(game.sr4.dialogUtility.openActionDialog)
      .toHaveBeenCalledWith(actor, 'sr4.hud.soak.bodyBallistic', 9); // 4+5
  });

  it('defaults to 0 when no armor is present', async () => {
    const actor = makeActor({ body: 4 });
    await makeHandler(actor).handleActionClick({}, 'soak|body-ballistic');
    expect(game.sr4.dialogUtility.openActionDialog)
      .toHaveBeenCalledWith(actor, 'sr4.hud.soak.bodyBallistic', 4);
  });
});

// -----------------------------------------------------------------------
// Attribute rolls
// -----------------------------------------------------------------------

describe('attribute roll', () => {
  it('opens dialog with attribute value minus 1', async () => {
    const actor = makeActor({ body: 5 });
    await makeHandler(actor).handleActionClick({}, 'attribute|BODY');
    expect(game.sr4.dialogUtility.openActionDialog)
      .toHaveBeenCalledWith(actor, 'sr4.stats.BODY', 4);
  });

  it('clamps to minimum 1 die when attribute is 1', async () => {
    const actor = makeActor({ body: 1 });
    await makeHandler(actor).handleActionClick({}, 'attribute|BODY');
    expect(game.sr4.dialogUtility.openActionDialog)
      .toHaveBeenCalledWith(actor, 'sr4.stats.BODY', 1);
  });
});

// -----------------------------------------------------------------------
// Attribute tests (composure, judge intentions, memory, lift/carry)
// -----------------------------------------------------------------------

describe('attrTest', () => {
  it('sums Willpower + Charisma for composure', async () => {
    const actor = makeActor({ attrs: { WILLPOWER: 4, CHARISMA: 3 } });
    await makeHandler(actor).handleActionClick({}, 'attrTest|composure');
    expect(game.sr4.dialogUtility.openActionDialog)
      .toHaveBeenCalledWith(actor, 'sr4.hud.tests.composure', 7);
  });

  it('sums Intuition + Charisma for judgeIntentions', async () => {
    const actor = makeActor({ attrs: { INTUITION: 5, CHARISMA: 2 } });
    await makeHandler(actor).handleActionClick({}, 'attrTest|judgeIntentions');
    expect(game.sr4.dialogUtility.openActionDialog)
      .toHaveBeenCalledWith(actor, 'sr4.hud.tests.judgeIntentions', 7);
  });

  it('sums Logic + Willpower for memory', async () => {
    const actor = makeActor({ attrs: { LOGIC: 3, WILLPOWER: 4 } });
    await makeHandler(actor).handleActionClick({}, 'attrTest|memory');
    expect(game.sr4.dialogUtility.openActionDialog)
      .toHaveBeenCalledWith(actor, 'sr4.hud.tests.memory', 7);
  });

  it('sums Strength + Body for liftCarry', async () => {
    const actor = makeActor({ attrs: { STRENGTH: 6, BODY: 4 } });
    await makeHandler(actor).handleActionClick({}, 'attrTest|liftCarry');
    expect(game.sr4.dialogUtility.openActionDialog)
      .toHaveBeenCalledWith(actor, 'sr4.hud.tests.liftCarry', 10);
  });

  it('does nothing for an unknown test key', async () => {
    const actor = makeActor();
    await makeHandler(actor).handleActionClick({}, 'attrTest|unknown');
    expect(game.sr4.dialogUtility.openActionDialog).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------
// Weapon Ctrl+Click shortcuts
// -----------------------------------------------------------------------

describe('weapon shortcuts', () => {
  function makeActorWithWeapon(weapon) {
    const actor = makeActor();
    actor.type = 'character';
    actor.items.get = vi.fn(id => id === weapon.id ? weapon : undefined);
    return actor;
  }

  it('Ctrl+Click toggles equip for a melee weapon', async () => {
    const weapon = { id: 'w1', type: 'Melee Weapon', system: { equipped: false }, update: vi.fn().mockResolvedValue(undefined) };
    const actor = makeActorWithWeapon(weapon);

    await makeHandler(actor).handleActionClick({ ctrlKey: true }, 'weapon|w1');

    expect(weapon.update).toHaveBeenCalledWith({ 'system.equipped': true });
    expect(game.sr4.dialogUtility.handleAttackRoll).not.toHaveBeenCalled();
  });

  it('Ctrl+Click toggles equip for a ranged weapon', async () => {
    const weapon = { id: 'w1', type: 'Ranged Weapon', system: { equipped: true, maxAmmo: 15, currentAmmo: 3 }, update: vi.fn().mockResolvedValue(undefined) };
    const actor = makeActorWithWeapon(weapon);

    await makeHandler(actor).handleActionClick({ ctrlKey: true }, 'weapon|w1');

    expect(weapon.update).toHaveBeenCalledWith({ 'system.equipped': false });
    expect(game.sr4.reloadWeapon).not.toHaveBeenCalled();
  });

  it('Shift+Click reloads a ranged weapon with maxAmmo > 0', async () => {
    const weapon = { id: 'w1', type: 'Ranged Weapon', system: { maxAmmo: 15, currentAmmo: 3 } };
    const actor = makeActorWithWeapon(weapon);

    await makeHandler(actor).handleActionClick({ shiftKey: true }, 'weapon|w1');

    expect(game.sr4.reloadWeapon).toHaveBeenCalledWith(actor, 'w1');
    expect(game.tokenActionHud.update).toHaveBeenCalled();
    expect(game.sr4.dialogUtility.handleAttackRoll).not.toHaveBeenCalled();
  });

  it('Shift+Click falls back to a normal roll for a ranged weapon without ammo store', async () => {
    const weapon = { id: 'w1', type: 'Ranged Weapon', system: { maxAmmo: 0, attackSkill: 'pistols' } };
    const actor = makeActorWithWeapon(weapon);
    actor.findByAttackSkill = vi.fn(() => ({ name: 'Pistols' }));

    await makeHandler(actor).handleActionClick({ shiftKey: true }, 'weapon|w1');

    expect(game.sr4.reloadWeapon).not.toHaveBeenCalled();
    expect(game.sr4.dialogUtility.handleAttackRoll).toHaveBeenCalledWith(actor, 'Pistols', weapon);
  });

  it('Shift+Click falls back to a normal roll for a melee weapon', async () => {
    const weapon = { id: 'w1', type: 'Melee Weapon', system: { attackSkill: 'blades' } };
    const actor = makeActorWithWeapon(weapon);
    actor.findByAttackSkill = vi.fn(() => ({ name: 'Blades' }));

    await makeHandler(actor).handleActionClick({ shiftKey: true }, 'weapon|w1');

    expect(game.sr4.reloadWeapon).not.toHaveBeenCalled();
    expect(game.sr4.dialogUtility.handleAttackRoll).toHaveBeenCalledWith(actor, 'Blades', weapon);
  });

  it('does nothing when the weapon is not found', async () => {
    const actor = makeActor();
    actor.items.get = vi.fn(() => undefined);
    await expect(makeHandler(actor).handleActionClick({ shiftKey: true }, 'weapon|missing')).resolves.toBeUndefined();
  });

  it('rolls normally without modifier keys', async () => {
    const weapon = { id: 'w1', type: 'Ranged Weapon', system: { maxAmmo: 15, currentAmmo: 3, attackSkill: 'pistols' } };
    const actor = makeActorWithWeapon(weapon);
    actor.findByAttackSkill = vi.fn(() => ({ name: 'Pistols' }));

    await makeHandler(actor).handleActionClick({}, 'weapon|w1');

    expect(game.sr4.reloadWeapon).not.toHaveBeenCalled();
    expect(game.sr4.dialogUtility.handleAttackRoll).toHaveBeenCalledWith(actor, 'Pistols', weapon);
  });
});

// -----------------------------------------------------------------------
// Item effect toggle
// -----------------------------------------------------------------------

describe('itemEffectToggle', () => {
  function makeActorWithItemEffect({ disabled = false } = {}) {
    const effect = { id: 'e1', disabled, update: vi.fn().mockResolvedValue(undefined) };
    const item = { id: 'i1', effects: { get: vi.fn(id => id === 'e1' ? effect : undefined) } };
    const actor = makeActor();
    actor.items.get = vi.fn(id => id === 'i1' ? item : undefined);
    return { actor, effect };
  }

  it('toggles a disabled effect to enabled', async () => {
    const { actor, effect } = makeActorWithItemEffect({ disabled: true });
    await makeHandler(actor).handleActionClick({}, 'itemEffectToggle|i1:e1');
    expect(effect.update).toHaveBeenCalledWith({ disabled: false });
  });

  it('toggles an enabled effect to disabled', async () => {
    const { actor, effect } = makeActorWithItemEffect({ disabled: false });
    await makeHandler(actor).handleActionClick({}, 'itemEffectToggle|i1:e1');
    expect(effect.update).toHaveBeenCalledWith({ disabled: true });
  });

  it('does nothing when item is not found', async () => {
    const actor = makeActor();
    actor.items.get = vi.fn(() => undefined);
    await expect(makeHandler(actor).handleActionClick({}, 'itemEffectToggle|missing:e1')).resolves.toBeUndefined();
  });

  it('does nothing when effect is not found on item', async () => {
    const item = { id: 'i1', effects: { get: vi.fn(() => undefined) } };
    const actor = makeActor();
    actor.items.get = vi.fn(() => item);
    await expect(makeHandler(actor).handleActionClick({}, 'itemEffectToggle|i1:missing')).resolves.toBeUndefined();
  });

  it('updates the HUD after toggling', async () => {
    const { actor } = makeActorWithItemEffect();
    await makeHandler(actor).handleActionClick({}, 'itemEffectToggle|i1:e1');
    expect(game.tokenActionHud.update).toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------
// Equip toggle
// -----------------------------------------------------------------------

describe('equip', () => {
  function makeActorWithItem({ equipped = false } = {}) {
    const item = { id: 'i1', system: { equipped }, update: vi.fn().mockResolvedValue(undefined) };
    const actor = makeActor();
    actor.items.get = vi.fn(id => id === 'i1' ? item : undefined);
    return { actor, item };
  }

  it('toggles an unequipped item to equipped', async () => {
    const { actor, item } = makeActorWithItem({ equipped: false });
    await makeHandler(actor).handleActionClick({}, 'equip|i1');
    expect(item.update).toHaveBeenCalledWith({ 'system.equipped': true });
  });

  it('toggles an equipped item to unequipped', async () => {
    const { actor, item } = makeActorWithItem({ equipped: true });
    await makeHandler(actor).handleActionClick({}, 'equip|i1');
    expect(item.update).toHaveBeenCalledWith({ 'system.equipped': false });
  });

  it('does nothing when the item is not found', async () => {
    const actor = makeActor();
    actor.items.get = vi.fn(() => undefined);
    await expect(makeHandler(actor).handleActionClick({}, 'equip|missing')).resolves.toBeUndefined();
  });

  it('updates the HUD after toggling', async () => {
    const { actor } = makeActorWithItem();
    await makeHandler(actor).handleActionClick({}, 'equip|i1');
    expect(game.tokenActionHud.update).toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------
// Item sheet
// -----------------------------------------------------------------------

describe('itemSheet', () => {
  it('opens the item sheet via render', async () => {
    const render = vi.fn();
    const item = { id: 'i1', sheet: { render } };
    const actor = makeActor();
    actor.items.get = vi.fn(() => item);
    await makeHandler(actor).handleActionClick({}, 'itemSheet|i1');
    expect(render).toHaveBeenCalledWith(true);
  });

  it('does nothing when item is not found', async () => {
    const actor = makeActor();
    actor.items.get = vi.fn(() => undefined);
    await expect(makeHandler(actor).handleActionClick({}, 'itemSheet|missing')).resolves.toBeUndefined();
  });
});

// -----------------------------------------------------------------------
// Magic/Matrix flows: summon, banish/decompile, bind
// -----------------------------------------------------------------------

describe('banish', () => {
  it('starts DismissalFlow for a spirit and refreshes the HUD', async () => {
    const actor = makeActor();
    await makeHandler(actor).handleActionClick({}, 'banish|spirit');
    expect(game.sr4.DismissalFlow.start).toHaveBeenCalledWith(actor, 'spirit');
    expect(game.tokenActionHud.update).toHaveBeenCalled();
  });
});

describe('decompile', () => {
  it('starts DismissalFlow for a sprite and refreshes the HUD', async () => {
    const actor = makeActor();
    await makeHandler(actor).handleActionClick({}, 'decompile|sprite');
    expect(game.sr4.DismissalFlow.start).toHaveBeenCalledWith(actor, 'sprite');
    expect(game.tokenActionHud.update).toHaveBeenCalled();
  });
});

describe('bind', () => {
  it('starts BindingFlow.startTargeted for a spirit', async () => {
    const actor = makeActor();
    await makeHandler(actor).handleActionClick({}, 'bind|spirit');
    expect(game.sr4.BindingFlow.startTargeted).toHaveBeenCalledWith(actor, 'spirit');
    expect(game.tokenActionHud.update).toHaveBeenCalled();
  });

  it('starts BindingFlow.startTargeted for a sprite', async () => {
    const actor = makeActor();
    await makeHandler(actor).handleActionClick({}, 'bind|sprite');
    expect(game.sr4.BindingFlow.startTargeted).toHaveBeenCalledWith(actor, 'sprite');
    expect(game.tokenActionHud.update).toHaveBeenCalled();
  });

  it('passes the id segment through unmodified, whatever it is', async () => {
    const actor = makeActor();
    await makeHandler(actor).handleActionClick({}, 'bind|foo');
    expect(game.sr4.BindingFlow.startTargeted).toHaveBeenCalledWith(actor, 'foo');
  });
});

// -----------------------------------------------------------------------
// Action rolls: category-aware dialog branching
// -----------------------------------------------------------------------

describe('action roll category branching', () => {
  it('routes an uncategorised action to openActionDialog', async () => {
    const action = { id: 'a1', name: 'Sprint', system: { rating1: 3, rating2: 2 } };
    const actor = makeActor();
    actor.items.get = vi.fn(() => action);

    await makeHandler(actor).handleActionClick({}, 'action|a1');

    expect(game.sr4.dialogUtility.openActionDialog).toHaveBeenCalledWith(actor, 'Sprint', 5);
    expect(game.sr4.dialogUtility.openMatrixActionDialog).not.toHaveBeenCalled();
  });

  it('routes a MATRIX-categorised action to openMatrixActionDialog', async () => {
    const action = { id: 'a2', name: 'Data Search', system: { rating1: 4, rating2: 3, category: 'MATRIX' } };
    const actor = makeActor();
    actor.items.get = vi.fn(() => action);

    await makeHandler(actor).handleActionClick({}, 'action|a2');

    expect(game.sr4.dialogUtility.openMatrixActionDialog).toHaveBeenCalledWith(actor, 'Data Search', 7, 'MATRIX');
    expect(game.sr4.dialogUtility.openActionDialog).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------
// Vehicle: control mode + drone actions
// -----------------------------------------------------------------------

describe('controlMode', () => {
  it('persists the selected mode and refreshes the HUD', async () => {
    const actor = makeActor();
    await makeHandler(actor).handleActionClick({}, 'controlMode|jumped');
    expect(actor.update).toHaveBeenCalledWith({ 'system.controlMode': 'jumped' });
    expect(game.tokenActionHud.update).toHaveBeenCalled();
  });
});

describe('droneAction', () => {
  it('opens the drone roll dialog for the given action', async () => {
    const actor = makeActor();
    await makeHandler(actor).handleActionClick({}, 'droneAction|perception');
    expect(game.sr4.rigging.openDroneRollDialog).toHaveBeenCalledWith(actor, 'perception');
  });
});

describe('vehicle weapon roll', () => {
  it('routes vehicle weapons to the drone attack dialog', async () => {
    const weapon = { id: 'w1', name: 'Turret', system: {} };
    const actor = makeActor();
    actor.type = 'vehicle';
    actor.items.get = vi.fn(id => id === 'w1' ? weapon : undefined);

    await makeHandler(actor).handleActionClick({}, 'weapon|w1');

    expect(game.sr4.rigging.openDroneAttackDialog).toHaveBeenCalledWith(actor, weapon);
    expect(game.sr4.dialogUtility.handleAttackRoll).not.toHaveBeenCalled();
  });

  it('keeps the skill-based attack flow for characters', async () => {
    const weapon = { id: 'w1', name: 'Pistol', system: { attackSkill: 'pistols' } };
    const skill = { name: 'Pistols' };
    const actor = makeActor();
    actor.type = 'character';
    actor.items.get = vi.fn(() => weapon);
    actor.findByAttackSkill = vi.fn(() => skill);

    await makeHandler(actor).handleActionClick({}, 'weapon|w1');

    expect(game.sr4.dialogUtility.handleAttackRoll).toHaveBeenCalledWith(actor, 'Pistols', weapon);
    expect(game.sr4.rigging.openDroneAttackDialog).not.toHaveBeenCalled();
  });
});

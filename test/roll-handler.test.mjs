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

describe('matrixAttack', () => {
  it('starts CybercombatFlow for the actor and refreshes the HUD', async () => {
    const actor = makeActor();
    await makeHandler(actor).handleActionClick({}, 'matrixAttack|attack');
    expect(game.sr4.CybercombatFlow.start).toHaveBeenCalledWith(actor);
    expect(game.tokenActionHud.update).toHaveBeenCalled();
  });
});

describe('jackOut', () => {
  it('calls CybercombatFlow.jackOut for the actor and refreshes the HUD', async () => {
    const actor = makeActor();
    await makeHandler(actor).handleActionClick({}, 'jackOut|jackOut');
    expect(game.sr4.CybercombatFlow.jackOut).toHaveBeenCalledWith(actor);
    expect(game.tokenActionHud.update).toHaveBeenCalled();
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

describe('linkedActor', () => {
  it('click binds the linked spirit or sprite and refreshes the HUD', async () => {
    const target = { uuid: 'Actor.spirit1', type: 'spirit' };
    fromUuid.mockResolvedValueOnce(target);
    const actor = makeActor();

    await makeHandler(actor).handleActionClick({}, 'linkedActor|Actor.spirit1');

    expect(game.sr4.BindingFlow.start).toHaveBeenCalledWith(actor, target);
    expect(game.sr4.linkedActors.confirmAndUnlink).not.toHaveBeenCalled();
    expect(game.tokenActionHud.update).toHaveBeenCalled();
  });

  it('Ctrl+Click unlinks instead of binding', async () => {
    const target = { uuid: 'Actor.spirit1', type: 'spirit' };
    fromUuid.mockResolvedValueOnce(target);

    await makeHandler(makeActor()).handleActionClick({ ctrlKey: true }, 'linkedActor|Actor.spirit1');

    expect(game.sr4.linkedActors.confirmAndUnlink).toHaveBeenCalledWith(target);
    expect(game.sr4.BindingFlow.start).not.toHaveBeenCalled();
  });

  it('ignores a right-click so binding never starts by accident', async () => {
    const handler = makeHandler(makeActor());
    handler.isRightClick = true;

    await handler.handleActionClick({}, 'linkedActor|Actor.spirit1');

    expect(fromUuid).not.toHaveBeenCalled();
    expect(game.sr4.BindingFlow.start).not.toHaveBeenCalled();
  });

  it('warns when the linked actor no longer exists', async () => {
    fromUuid.mockResolvedValueOnce(null);

    await makeHandler(makeActor()).handleActionClick({}, 'linkedActor|Actor.gone');

    expect(ui.notifications.warn).toHaveBeenCalledWith('sr4.ui.linkedActorNotFound');
    expect(game.sr4.BindingFlow.start).not.toHaveBeenCalled();
  });
});

describe('unlink', () => {
  it('confirms and unlinks the linked actor, then refreshes the HUD', async () => {
    const linked = { uuid: 'Actor.spirit1' };
    fromUuid.mockResolvedValueOnce(linked);
    game.tokenActionHud.update.mockClear();

    await makeHandler(makeActor()).handleActionClick({}, 'unlink|Actor.spirit1');

    expect(fromUuid).toHaveBeenCalledWith('Actor.spirit1');
    expect(game.sr4.linkedActors.confirmAndUnlink).toHaveBeenCalledWith(linked);
    expect(game.tokenActionHud.update).toHaveBeenCalled();
  });

  it('keeps the HUD as it is when the confirmation is declined', async () => {
    fromUuid.mockResolvedValueOnce({ uuid: 'Actor.spirit1' });
    game.sr4.linkedActors.confirmAndUnlink.mockResolvedValueOnce(false);
    game.tokenActionHud.update.mockClear();

    await makeHandler(makeActor()).handleActionClick({}, 'unlink|Actor.spirit1');

    expect(game.tokenActionHud.update).not.toHaveBeenCalled();
  });

  it('warns when the linked actor no longer exists', async () => {
    fromUuid.mockResolvedValueOnce(null);
    game.sr4.linkedActors.confirmAndUnlink.mockClear();

    await makeHandler(makeActor()).handleActionClick({}, 'unlink|Actor.gone');

    expect(ui.notifications.warn).toHaveBeenCalledWith('sr4.ui.linkedActorNotFound');
    expect(game.sr4.linkedActors.confirmAndUnlink).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------
// Skill / spell / free roll
// -----------------------------------------------------------------------

describe('skill', () => {
  it('opens the skill roll dialog with the skill name', async () => {
    const actor = makeActor();
    actor.items.get = vi.fn(() => ({ id: 's1', name: 'Pistols' }));
    await makeHandler(actor).handleActionClick({}, 'skill|s1');
    expect(game.sr4.dialogUtility.handleSkillRoll).toHaveBeenCalledWith(actor, 'Pistols');
  });

  it('does nothing when the skill is not found', async () => {
    const actor = makeActor();
    actor.items.get = vi.fn(() => undefined);
    await makeHandler(actor).handleActionClick({}, 'skill|gone');
    expect(game.sr4.dialogUtility.handleSkillRoll).not.toHaveBeenCalled();
  });
});

describe('spell', () => {
  it('starts the spellcasting flow for the spell', async () => {
    const spell = { id: 'sp1', name: 'Fireball' };
    const actor = makeActor();
    actor.items.get = vi.fn(() => spell);
    await makeHandler(actor).handleActionClick({}, 'spell|sp1');
    expect(game.sr4.SpellcastingFlow.start).toHaveBeenCalledWith(actor, spell);
  });

  it('does nothing when the spell is not found', async () => {
    const actor = makeActor();
    actor.items.get = vi.fn(() => undefined);
    await makeHandler(actor).handleActionClick({}, 'spell|gone');
    expect(game.sr4.SpellcastingFlow.start).not.toHaveBeenCalled();
  });
});

describe('freeRoll', () => {
  it('opens the free roll dialog', async () => {
    await makeHandler(makeActor()).handleActionClick({}, 'freeRoll|free-roll');
    expect(game.sr4.dialogUtility.handleFreeRoll).toHaveBeenCalled();
  });
});

describe('edgeRoll', () => {
  it('doubles the Edge attribute for a double edge roll', async () => {
    const actor = makeActor({ maxEdge: 5 });
    await makeHandler(actor).handleActionClick({}, 'edgeRoll|double');
    expect(game.sr4.dialogUtility.openActionDialog).toHaveBeenCalledWith(actor, 'sr4.hud.edge.double', 10);
  });
});

describe('edge|<unknown>', () => {
  it('does not update the actor', async () => {
    const actor = makeActor();
    await makeHandler(actor).handleActionClick({}, 'edge|bogus');
    expect(actor.update).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------
// Soak (all modes)
// -----------------------------------------------------------------------

describe('soak modes', () => {
  it.each([
    ['willpower',      'sr4.hud.soak.willpower',     3],
    ['body',           'sr4.hud.soak.body',          4],
    ['body-impact',    'sr4.hud.soak.bodyImpact',    6],
    ['body-ballistic', 'sr4.hud.soak.bodyBallistic', 9],
  ])('rolls %s soak with the matching pool', async (mode, label, dice) => {
    const actor = makeActor({ body: 4, armor: { ballistic: 5, impact: 2 }, attrs: { WILLPOWER: 3 } });
    await makeHandler(actor).handleActionClick({}, `soak|${mode}`);
    expect(game.sr4.dialogUtility.openActionDialog).toHaveBeenCalledWith(actor, label, dice);
  });

  it('does nothing for an unknown soak mode', async () => {
    await makeHandler(makeActor()).handleActionClick({}, 'soak|bogus');
    expect(game.sr4.dialogUtility.openActionDialog).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------
// Autosoft
// -----------------------------------------------------------------------

describe('autosoft', () => {
  it('rolls Pilot + Rating', async () => {
    const actor = makeActor();
    actor.system.pilot = 3;
    actor.items.get = vi.fn(() => ({ id: 'a1', name: 'Clearsight', system: { rating: 2 } }));
    await makeHandler(actor).handleActionClick({}, 'autosoft|a1');
    expect(game.sr4.dialogUtility.openActionDialog)
      .toHaveBeenCalledWith(actor, 'sr4.vehicle.autonomous: Clearsight', 5);
  });

  it('treats missing pilot and rating as 0', async () => {
    const actor = makeActor();
    actor.items.get = vi.fn(() => ({ id: 'a1', name: 'Clearsight', system: {} }));
    await makeHandler(actor).handleActionClick({}, 'autosoft|a1');
    expect(game.sr4.dialogUtility.openActionDialog)
      .toHaveBeenCalledWith(actor, 'sr4.vehicle.autonomous: Clearsight', 0);
  });

  it('does nothing when the autosoft is not found', async () => {
    const actor = makeActor();
    actor.items.get = vi.fn(() => undefined);
    await makeHandler(actor).handleActionClick({}, 'autosoft|gone');
    expect(game.sr4.dialogUtility.openActionDialog).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------
// Condition monitor dialog
// -----------------------------------------------------------------------

describe('monitor-deal', () => {
  const dialogWait = () => foundry.applications.api.DialogV2.wait;

  function makeMonitorActor() {
    const actor = makeActor();
    actor.system.conditionMonitor = { physical: { value: 2, max: 10 } };
    actor.dealMonitorDamage = vi.fn().mockResolvedValue(undefined);
    actor.resetMonitor = vi.fn().mockResolvedValue(undefined);
    return actor;
  }

  async function openDialog(actor, track = 'physical') {
    await makeHandler(actor).handleActionClick({}, `monitor-deal|${track}`);
    return dialogWait().mock.calls[0]?.[0];
  }

  function buttonWithInput(value) {
    return { form: { querySelector: vi.fn(() => ({ value })) } };
  }

  it('shows the track state in the dialog title', async () => {
    const config = await openDialog(makeMonitorActor());
    expect(config.window.title).toBe('sr4.hud.monitor.physical — 2/10');
  });

  it('deals the entered amount of damage', async () => {
    const actor = makeMonitorActor();
    const config = await openDialog(actor);
    await config.buttons.find(b => b.action === 'deal').callback({}, buttonWithInput('3'));
    expect(actor.dealMonitorDamage).toHaveBeenCalledWith('physical', 3);
  });

  it.each([['-2'], ['abc'], ['']])('clamps the invalid input %j to 0 damage', async (input) => {
    const actor = makeMonitorActor();
    const config = await openDialog(actor);
    await config.buttons.find(b => b.action === 'deal').callback({}, buttonWithInput(input));
    expect(actor.dealMonitorDamage).toHaveBeenCalledWith('physical', 0);
  });

  it('resets the track via the reset button', async () => {
    const actor = makeMonitorActor();
    const config = await openDialog(actor);
    await config.buttons.find(b => b.action === 'reset').callback();
    expect(actor.resetMonitor).toHaveBeenCalledWith('physical');
  });

  it('opens no dialog for a track the actor does not have', async () => {
    await openDialog(makeMonitorActor(), 'stun');
    expect(dialogWait()).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------
// Effects
// -----------------------------------------------------------------------

describe('effects', () => {
  it('toggles an actor effect and refreshes the HUD', async () => {
    const actor = makeActor();
    actor.toggleEffect = vi.fn().mockResolvedValue(undefined);
    await makeHandler(actor).handleActionClick({}, 'effectToggle|e1');
    expect(actor.toggleEffect).toHaveBeenCalledWith('e1');
    expect(game.tokenActionHud.update).toHaveBeenCalled();
  });

  it('Ctrl+Click deletes the effect instead of toggling it', async () => {
    const effect = { delete: vi.fn().mockResolvedValue(undefined) };
    const actor = makeActor();
    actor.toggleEffect = vi.fn();
    actor.effects = { get: vi.fn(() => effect) };
    await makeHandler(actor).handleActionClick({ ctrlKey: true }, 'effectToggle|e1');
    expect(actor.effects.get).toHaveBeenCalledWith('e1');
    expect(effect.delete).toHaveBeenCalled();
    expect(actor.toggleEffect).not.toHaveBeenCalled();
    expect(game.tokenActionHud.update).toHaveBeenCalled();
  });

  it('Ctrl+Click on a vanished effect does not throw', async () => {
    const actor = makeActor();
    actor.effects = { get: vi.fn(() => undefined) };
    await expect(makeHandler(actor).handleActionClick({ ctrlKey: true }, 'effectToggle|gone')).resolves.toBeUndefined();
  });

  it('applies an effect template and refreshes the HUD', async () => {
    const actor = makeActor();
    actor.applyEffectTemplate = vi.fn().mockResolvedValue(undefined);
    await makeHandler(actor).handleActionClick({}, 'effectTemplate|blind');
    expect(actor.applyEffectTemplate).toHaveBeenCalledWith('blind');
    expect(game.tokenActionHud.update).toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------
// Summoning / threading
// -----------------------------------------------------------------------

describe('summon', () => {
  it.each([['spirit'], ['sprite']])('starts the summoning flow for a %s', async (entity) => {
    const actor = makeActor();
    await makeHandler(actor).handleActionClick({}, `summon|${entity}`);
    expect(game.sr4.SummoningFlow.start).toHaveBeenCalledWith(actor, entity);
    expect(game.sr4.SummoningFlow.startWatcher).not.toHaveBeenCalled();
    expect(game.tokenActionHud.update).toHaveBeenCalled();
  });

  it('starts the watcher flow for a watcher', async () => {
    const actor = makeActor();
    await makeHandler(actor).handleActionClick({}, 'summon|watcher');
    expect(game.sr4.SummoningFlow.startWatcher).toHaveBeenCalledWith(actor);
    expect(game.sr4.SummoningFlow.start).not.toHaveBeenCalled();
  });
});

describe('threading', () => {
  it('starts the threading flow and refreshes the HUD', async () => {
    const actor = makeActor();
    await makeHandler(actor).handleActionClick({}, 'threading|thread');
    expect(game.sr4.ThreadingFlow.start).toHaveBeenCalledWith(actor);
    expect(game.tokenActionHud.update).toHaveBeenCalled();
  });
});

describe('unknown action type', () => {
  it('is ignored', async () => {
    const actor = makeActor();
    await expect(makeHandler(actor).handleActionClick({}, 'bogus|x')).resolves.toBeUndefined();
    expect(actor.update).not.toHaveBeenCalled();
    expect(game.tokenActionHud.update).not.toHaveBeenCalled();
  });
});

describe('weapon without attack skill', () => {
  it('warns with a localized message naming the weapon', async () => {
    const actor = makeActor();
    actor.type = 'character';
    actor.items.get = vi.fn(() => ({ id: 'w1', name: 'Bow', system: { attackSkill: 'archery' } }));
    actor.findByAttackSkill = vi.fn(() => undefined);

    await makeHandler(actor).handleActionClick({}, 'weapon|w1');

    expect(ui.notifications.warn).toHaveBeenCalledWith('sr4.hud.weapons.noAttackSkill Bow');
    expect(game.sr4.dialogUtility.handleAttackRoll).not.toHaveBeenCalled();
  });
});

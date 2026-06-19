import { describe, it, expect, vi } from 'vitest';
import { createRollHandler } from '../src/roll-handler.js';

const coreModule = {
  api: {
    RollHandler: class { actor = null; },
  },
};

const SR4RollHandler = createRollHandler(coreModule);

function makeActor({ currentEdge = 3, maxEdge = 5, body = 4, armorItems = [] } = {}) {
  const attrs = { CURRENTEDGE: currentEdge, EDGE: maxEdge, BODY: body };
  return {
    getAttribute: vi.fn(key => attrs[key] ?? 0),
    update: vi.fn().mockResolvedValue(undefined),
    items: { filter: vi.fn(fn => armorItems.filter(fn)) },
    system: { conditionMonitor: {} },
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
// Soak
// -----------------------------------------------------------------------

describe('soak|body-ballistic', () => {
  it('sums BODY + ballistic armor across all equipped armor items', async () => {
    const armorItems = [
      { type: 'Armor', system: { ballisticarmor: 3, impactarmor: 1 } },
      { type: 'Armor', system: { ballisticarmor: 2, impactarmor: 4 } },
    ];
    const actor = makeActor({ body: 4, armorItems });
    await makeHandler(actor).handleActionClick({}, 'soak|body-ballistic');
    expect(game.sr4.dialogUtility.openActionDialog)
      .toHaveBeenCalledWith(actor, 'sr4.hud.soak.bodyBallistic', 9); // 4+3+2
  });

  it('treats missing ballisticarmor as 0', async () => {
    const armorItems = [
      { type: 'Armor', system: { impactarmor: 3 } }, // no ballisticarmor property
    ];
    const actor = makeActor({ body: 4, armorItems });
    await makeHandler(actor).handleActionClick({}, 'soak|body-ballistic');
    expect(game.sr4.dialogUtility.openActionDialog)
      .toHaveBeenCalledWith(actor, 'sr4.hud.soak.bodyBallistic', 4); // BODY only
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
// Weapon reload
// -----------------------------------------------------------------------

describe('reload', () => {
  it('calls game.sr4.reloadWeapon with actor and weapon id', async () => {
    const actor = makeActor();
    await makeHandler(actor).handleActionClick({}, 'reload|w1');
    expect(game.sr4.reloadWeapon).toHaveBeenCalledWith(actor, 'w1');
  });

  it('triggers tokenActionHud update after reload', async () => {
    const actor = makeActor();
    await makeHandler(actor).handleActionClick({}, 'reload|w1');
    expect(game.tokenActionHud.update).toHaveBeenCalled();
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

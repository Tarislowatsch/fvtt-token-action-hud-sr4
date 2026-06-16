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

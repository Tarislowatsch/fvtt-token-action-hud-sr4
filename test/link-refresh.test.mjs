import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerLinkRefresh } from '../src/link-refresh.js';

let handlers;

beforeEach(() => {
  handlers = new Map();
  Hooks.on = vi.fn((event, handler) => handlers.set(event, handler));
  registerLinkRefresh();
});

describe('registerLinkRefresh', () => {
  it.each([
    ['spirit', { ownerUuid: '' }],
    ['sprite', { bound: true }],
    ['vehicle', { riggerUuid: '' }],
  ])('refreshes the HUD when the link of a %s changes', (type, system) => {
    handlers.get('updateActor')({ type }, { system });

    expect(game.tokenActionHud.update).toHaveBeenCalledOnce();
  });

  it.each([
    ['spirit', { services: 2 }],
    ['sprite', { tasks: 1 }],
  ])('refreshes the HUD when the owed services/tasks of a %s change', (type, system) => {
    handlers.get('updateActor')({ type }, { system });

    expect(game.tokenActionHud.update).toHaveBeenCalledOnce();
  });

  it('ignores updates to fields the HUD does not show', () => {
    handlers.get('updateActor')({ type: 'spirit' }, { system: { force: 5 } });

    expect(game.tokenActionHud.update).not.toHaveBeenCalled();
  });

  it('ignores actor types that cannot be linked', () => {
    handlers.get('updateActor')({ type: 'character' }, { system: { ownerUuid: '' } });

    expect(game.tokenActionHud.update).not.toHaveBeenCalled();
  });

  it.each(['createActor', 'deleteActor'])('refreshes the HUD on %s of a linked spirit', (event) => {
    handlers.get(event)({ type: 'spirit', system: { ownerUuid: 'Actor.char1' } });

    expect(game.tokenActionHud.update).toHaveBeenCalledOnce();
  });

  it('ignores a created spirit without an owner', () => {
    handlers.get('createActor')({ type: 'spirit', system: { ownerUuid: '' } });

    expect(game.tokenActionHud.update).not.toHaveBeenCalled();
  });

  it('does nothing when the system linked actors API is unavailable', () => {
    const linkedActors = game.sr4.linkedActors;
    delete game.sr4.linkedActors;
    try {
      handlers.get('updateActor')({ type: 'spirit' }, { system: { ownerUuid: '' } });
      expect(game.tokenActionHud.update).not.toHaveBeenCalled();
    } finally {
      game.sr4.linkedActors = linkedActors;
    }
  });
});

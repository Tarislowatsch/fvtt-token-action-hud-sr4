/**
 * @fileoverview Refreshes the HUD when a spirit, sprite or vehicle is linked
 * to or unlinked from its owner elsewhere (sheet, other client, other HUD),
 * or when a spirit's or sprite's binding state or owed services/tasks change.
 * Vehicles stay included: a vehicle's drone pools depend on its linked rigger.
 */

// Fields shown in the HUD besides the owner link itself.
const DISPLAYED_FIELDS = ['bound', 'services', 'tasks'];

function linkField(actor) {
  return game.sr4?.linkedActors?.OWNER_LINK_FIELDS?.[actor.type];
}

function refresh() {
  game.tokenActionHud?.update();
}

export function registerLinkRefresh() {
  Hooks.on('updateActor', (actor, changes) => {
    const field = linkField(actor);
    if (!field) return;
    const system = changes?.system ?? {};
    if (field in system || DISPLAYED_FIELDS.some(f => f in system)) refresh();
  });

  const onCreateOrDelete = (actor) => {
    const field = linkField(actor);
    if (field && actor.system?.[field]) refresh();
  };
  Hooks.on('createActor', onCreateOrDelete);
  Hooks.on('deleteActor', onCreateOrDelete);
}

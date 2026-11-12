/**
 * @fileoverview Shared helpers — Token Action HUD SR4
 *
 * Dice pools live here so the HUD button and the roll it triggers are always
 * computed by the same code.
 */

import { ACTION_CATEGORIES } from './constants.js';

export const loc = (key) => game.i18n.localize(key);
export const fmt = (key, data) => game.i18n.format(key, data);

// ---------------------------------------------------------------------------
// Dice pools
// ---------------------------------------------------------------------------

export function doubleEdgePool(actor) {
  return actor.getAttribute('EDGE') * 2;
}

/** Soak inputs and the resulting pool per soak mode. */
export function soakPools(actor) {
  const body = actor.getAttribute('BODY');
  const will = actor.getAttribute('WILLPOWER');
  const ballistic = actor.system.armor?.ballistic ?? 0;
  const impact    = actor.system.armor?.impact    ?? 0;

  return {
    body, will, ballistic, impact,
    pools: {
      'willpower':      will,
      'body':           body,
      'body-impact':    body + impact,
      'body-ballistic': body + ballistic,
    },
  };
}

/** Two-attribute test pool, e.g. Composure = Willpower + Charisma. */
export function attributeTestPool(actor, { attr1, attr2 }) {
  const v1 = actor.getAttribute(attr1);
  const v2 = actor.getAttribute(attr2);
  return { v1, v2, total: v1 + v2 };
}

/** Autonomous drone test: Pilot + Autosoft rating. */
export function autosoftPool(actor, autosoft) {
  const pilot  = actor.system.pilot ?? 0;
  const rating = autosoft.system.rating ?? 0;
  return { pilot, rating, total: pilot + rating };
}

// ---------------------------------------------------------------------------
// System lookups
// ---------------------------------------------------------------------------

/** The combatant for this token or actor in the active combat, if any. */
export function findActiveCombatant(actor, token) {
  return game.combat?.combatants.find(
    c => (token && c.tokenId === token.id) || c.actor?.id === actor.id
  );
}

/** Action-item category tags, preferring the system API over the static fallback list. */
export function actionCategories() {
  const api = Object.values(game.sr4?.ActionCategory ?? {});
  return api.length ? api : ACTION_CATEGORIES;
}

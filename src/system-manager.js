/**
 * @fileoverview System Manager & Bootstrap — Token Action HUD SR4
 */

import {
  MODULE_ID,
  ACTIVE_SKILL_CATEGORIES,
  KNOWLEDGE_SKILL_CATEGORIES,
  SPELL_CATEGORIES,
} from './constants.js';
import { createActionHandler } from './action-handler.js';
import { createRollHandler }   from './roll-handler.js';

// Shared i18n helper — imported by the other modules
export const loc = (key) => game.i18n.localize(key);

export function collectArmor(actor) {
  return {
    ballistic: actor.system.armor?.ballistic ?? 0,
    impact:    actor.system.armor?.impact    ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Helpers for registerDefaults
// ---------------------------------------------------------------------------

const ITEM_TABS = ['powers', 'implants'];

/** Build a nestId-aware layout entry (top-level tab or sub-group). */
const layoutGroup = (nestId, id, nameKey, type = 'system') => ({
  nestId,
  id,
  name: loc(nameKey),
  type,
});

/** Derive the flat group registry from the layout — single source of truth. */
function flattenLayout(layout) {
  return layout.flatMap(({ nestId: _nestId, groups: subGroups, ...tab }) => [
    tab,
    ...subGroups.map(({ nestId: _subNestId, ...sub }) => sub),
  ]);
}

// ---------------------------------------------------------------------------

function createSystemManager(coreModule) {
  return class SR4SystemManager extends coreModule.api.SystemManager {

    getActionHandler() { return new (createActionHandler(coreModule))(); }
    getRollHandler()   { return new (createRollHandler(coreModule))();   }

    getAvailableRollHandlers() { return { core: 'SR4 Default' }; }

    registerSettings() {}

    async registerDefaults() {
      // ------------------------------------------------------------------
      // Layout (tabs with nested sub-groups) — the flat group registry
      // required by the HUD core is derived from this below, so every
      // group only needs to be declared once.
      // ------------------------------------------------------------------
      const layout = [
        {
          ...layoutGroup('basics', 'basics', 'sr4.hud.basics'),
          groups: [
            layoutGroup('basics_basics-improvise',       'basics-improvise',       'sr4.hud.improvise'),
            layoutGroup('basics_basics-realm',           'basics-realm',           'sr4.hud.realm.tab'),
            layoutGroup('basics_basics-edge-rolls',      'basics-edge-rolls',      'sr4.hud.edge.tab'),
            layoutGroup('basics_basics-free-roll',       'basics-free-roll',       'sr4.hud.freeRoll'),
            layoutGroup('basics_basics-edge-management', 'basics-edge-management', 'sr4.hud.edge.management'),
            layoutGroup('basics_basics-soak',            'basics-soak',            'sr4.hud.soak.tab'),
            layoutGroup('basics_basics-tests',           'basics-tests',           'sr4.hud.tests.tab'),
            layoutGroup('basics_basics-control-mode',    'basics-control-mode',    'sr4.hud.vehicle.controlMode'),
            layoutGroup('basics_basics-drone-actions',   'basics-drone-actions',   'sr4.hud.vehicle.droneActions'),
          ],
        },
        {
          ...layoutGroup('active-skills', 'active-skills', 'sr4.hud.activeSkills'),
          groups: ACTIVE_SKILL_CATEGORIES.map(cat =>
            layoutGroup(`active-skills_skills-${cat}`, `skills-${cat}`, `sr4.hud.skills.${cat}`)
          ),
        },
        {
          ...layoutGroup('knowledge-skills', 'knowledge-skills', 'sr4.hud.knowledgeSkills'),
          groups: KNOWLEDGE_SKILL_CATEGORIES.map(cat =>
            layoutGroup(`knowledge-skills_knowledge-${cat}`, `knowledge-${cat}`, `sr4.hud.skills.${cat}`)
          ),
        },
        {
          ...layoutGroup('weapons', 'weapons', 'sr4.hud.weapons.tab'),
          groups: [ layoutGroup('weapons_weapons-list', 'weapons-list', 'sr4.hud.weapons.tab') ],
        },
        {
          ...layoutGroup('magic', 'magic', 'sr4.hud.magic.tab'),
          groups: [
            ...SPELL_CATEGORIES.map(cat =>
              layoutGroup(`magic_spells-${cat.toLowerCase()}`, `spells-${cat.toLowerCase()}`, `sr4.spell.categories.${cat.toLowerCase()}`)
            ),
            layoutGroup('magic_spells-actions', 'spells-actions', 'sr4.hud.spells.actions'),
            layoutGroup('magic_spells-effects', 'spells-effects', 'sr4.hud.spells.effects'),
            layoutGroup('magic_magic-summoning', 'magic-summoning', 'sr4.hud.magic.summoning'),
          ],
        },
        {
          ...layoutGroup('matrix', 'matrix', 'sr4.hud.matrix.tab'),
          groups: [
            layoutGroup('matrix_matrix-list',      'matrix-list',      'sr4.hud.matrix.tab'),
            layoutGroup('matrix_matrix-actions',    'matrix-actions',   'sr4.hud.matrix.actions'),
            layoutGroup('matrix_matrix-effects',    'matrix-effects',   'sr4.hud.matrix.effects'),
            layoutGroup('matrix_matrix-resonance',  'matrix-resonance', 'sr4.hud.matrix.resonanceActions'),
          ],
        },
        {
          ...layoutGroup('monitor', 'monitor', 'sr4.hud.monitor.tab'),
          groups: [ layoutGroup('monitor_monitor-list', 'monitor-list', 'sr4.hud.monitor.tab') ],
        },
        {
          ...layoutGroup('actions', 'actions', 'sr4.hud.actions.tab'),
          groups: [ layoutGroup('actions_actions-list', 'actions-list', 'sr4.hud.actions.tab') ],
        },
        ...ITEM_TABS.map(t => ({
          ...layoutGroup(t, t, `sr4.hud.${t}.tab`),
          groups: [
            layoutGroup(`${t}_${t}-list`,    `${t}-list`,    `sr4.hud.${t}.tab`),
            layoutGroup(`${t}_${t}-actions`, `${t}-actions`, `sr4.hud.${t}.actions`),
            layoutGroup(`${t}_${t}-effects`, `${t}-effects`, `sr4.hud.${t}.effects`),
          ],
        })),
        {
          ...layoutGroup('effects', 'effects', 'sr4.hud.effects.tab'),
          groups: [
            layoutGroup('effects_effects-templates', 'effects-templates', 'sr4.hud.effects.templates'),
            layoutGroup('effects_effects-active',    'effects-active',    'sr4.hud.effects.active'),
          ],
        },
      ];

      return { groups: flattenLayout(layout), layout };
    }
  };
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

Hooks.once('tokenActionHudCoreApiReady', async (coreModule) => {
  const module = game.modules.get(MODULE_ID);

  module.api = { SystemManager: createSystemManager(coreModule) };

  console.log('[SR4-HUD] Registering module API');
  Hooks.call('tokenActionHudSystemReady', module);
});
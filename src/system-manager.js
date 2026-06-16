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

// Aggregates ballistic and impact armor totals across all Armor items
export function collectArmor(actor) {
  const armorItems = actor.items.filter(i => i.type === 'Armor');
  return {
    ballistic: armorItems.reduce((sum, i) => sum + (i.system.ballisticarmor ?? 0), 0),
    impact:    armorItems.reduce((sum, i) => sum + (i.system.impactarmor    ?? 0), 0),
  };
}

// ---------------------------------------------------------------------------
// Helpers for registerDefaults
// ---------------------------------------------------------------------------

/** Build a flat group entry. */
const group = (id, nameKey, type = 'system') => ({
  id,
  name: loc(nameKey),
  type,
});

/** Build a nestId-aware layout entry (top-level tab or sub-group). */
const layoutGroup = (nestId, id, nameKey, type = 'system') => ({
  nestId,
  id,
  name: loc(nameKey),
  type,
});

// ---------------------------------------------------------------------------

function createSystemManager(coreModule) {
  return class SR4SystemManager extends coreModule.api.SystemManager {

    getActionHandler() { return new (createActionHandler(coreModule))(); }
    getRollHandler()   { return new (createRollHandler(coreModule))();   }

    getAvailableRollHandlers() { return { core: 'SR4 Default' }; }

    registerSettings() {}

    async registerDefaults() {
      // ------------------------------------------------------------------
      // Flat group registry
      // ------------------------------------------------------------------
      const groups = [

        // Top-level tabs
        group('basics',           'sr4.hud.basics'),
        group('active-skills',    'sr4.hud.activeSkills'),
        group('knowledge-skills', 'sr4.hud.knowledgeSkills'),
        group('weapons',          'sr4.hud.weapons'),
        group('spells',           'sr4.hud.spells.tab'),
        group('monitor',          'sr4.hud.monitor.tab'),
        group('actions',          'sr4.hud.actions.tab'),

        // Basics sub-groups
        group('basics-improvise',        'sr4.hud.improvise'),
        group('basics-edge-rolls',       'sr4.hud.edge.tab'),
        group('basics-free-roll',        'sr4.hud.freeRoll'),
        group('basics-edge-management',  'sr4.hud.edge.management'),
        group('basics-soak',             'sr4.hud.soak.tab'),

        // Skill sub-groups
        ...ACTIVE_SKILL_CATEGORIES.map(cat =>
          group(`skills-${cat}`,    `sr4.hud.skills.${cat}`)
        ),
        ...KNOWLEDGE_SKILL_CATEGORIES.map(cat =>
          group(`knowledge-${cat}`, `sr4.hud.skills.${cat}`)
        ),

        // Spell sub-groups
        ...SPELL_CATEGORIES.map(cat =>
          group(`spells-${cat.toLowerCase()}`, `sr4.spell.categories.${cat.toLowerCase()}`)
        ),

        // List groups
        group('weapons-list',  'sr4.hud.weapons'),
        group('monitor-list',  'sr4.hud.monitor.tab'),
        group('actions-list',  'sr4.hud.actions.tab'),

        // Effects tab
        group('effects',           'sr4.hud.effects.tab'),
        group('effects-templates', 'sr4.hud.effects.templates'),
        group('effects-active',    'sr4.hud.effects.active'),
      ];

      // ------------------------------------------------------------------
      // Layout (tabs with nested sub-groups)
      // ------------------------------------------------------------------
      const layout = [
        {
          ...layoutGroup('basics', 'basics', 'sr4.hud.basics'),
          groups: [
            layoutGroup('basics_basics-improvise',       'basics-improvise',       'sr4.hud.improvise'),
            layoutGroup('basics_basics-edge-rolls',      'basics-edge-rolls',      'sr4.hud.edge.tab'),
            layoutGroup('basics_basics-free-roll',       'basics-free-roll',       'sr4.hud.freeRoll'),
            layoutGroup('basics_basics-edge-management', 'basics-edge-management', 'sr4.hud.edge.management'),
            layoutGroup('basics_basics-soak',            'basics-soak',            'sr4.hud.soak.tab'),
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
          ...layoutGroup('weapons', 'weapons', 'sr4.hud.weapons'),
          groups: [ layoutGroup('weapons_weapons-list', 'weapons-list', 'sr4.hud.weapons') ],
        },
        {
          ...layoutGroup('spells', 'spells', 'sr4.hud.spells.tab'),
          groups: SPELL_CATEGORIES.map(cat =>
            layoutGroup(`spells_spells-${cat.toLowerCase()}`, `spells-${cat.toLowerCase()}`, `sr4.spell.categories.${cat.toLowerCase()}`)
          ),
        },
        {
          ...layoutGroup('monitor', 'monitor', 'sr4.hud.monitor.tab'),
          groups: [ layoutGroup('monitor_monitor-list', 'monitor-list', 'sr4.hud.monitor.tab') ],
        },
        {
          ...layoutGroup('actions', 'actions', 'sr4.hud.actions.tab'),
          groups: [ layoutGroup('actions_actions-list', 'actions-list', 'sr4.hud.actions.tab') ],
        },
        {
          ...layoutGroup('effects', 'effects', 'sr4.hud.effects.tab'),
          groups: [
            layoutGroup('effects_effects-templates', 'effects-templates', 'sr4.hud.effects.templates'),
            layoutGroup('effects_effects-active',    'effects-active',    'sr4.hud.effects.active'),
          ],
        },
      ];

      return { groups, layout };
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
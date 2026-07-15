/**
 * @fileoverview Shared constants — Token Action HUD SR4
 */

export const MODULE_ID = 'token-action-hud-sr4';

export const ACTIVE_SKILL_CATEGORIES = [
  'combat',
  'physical',
  'social',
  'technical',
  'matrix',
  'magic',
  'vehicle',
  'misc',
  'resonance',
];

export const KNOWLEDGE_SKILL_CATEGORIES = [
  'academic',
  'street',
  'language',
  'hobby',
  'misc',
];

export const SPELL_CATEGORIES = [
  'COMBAT',
  'DETECTION',
  'HEALTH',
  'ILLUSION',
  'GEOMANCY',
];

export const ATTRIBUTE_KEYS = [
  'BODY',
  'AGILITY',
  'REACTION',
  'STRENGTH',
  'CHARISMA',
  'INTUITION',
  'LOGIC',
  'WILLPOWER',
];

/** Vehicle control modes (fallback when the system API is unavailable). */
export const CONTROL_MODES = ['autonomous', 'remote', 'jumped'];

/** Drone actions rollable from the HUD (SR4 rigger table). */
export const DRONE_ACTIONS = ['maneuvering', 'perception', 'infiltration'];

/** Standard two-attribute tests (SR4, p.139). */
export const ATTRIBUTE_TESTS = [
  { key: 'composure',       attr1: 'WILLPOWER', attr2: 'CHARISMA' },
  { key: 'judgeIntentions', attr1: 'INTUITION',  attr2: 'CHARISMA' },
  { key: 'memory',          attr1: 'LOGIC',      attr2: 'WILLPOWER' },
  { key: 'liftCarry',       attr1: 'STRENGTH',   attr2: 'BODY' },
];

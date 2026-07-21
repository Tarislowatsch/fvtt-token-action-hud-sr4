/**
 * @fileoverview Action Handler — Token Action HUD SR4
 */

import { loc, collectArmor } from './system-manager.js';
import {
  ACTIVE_SKILL_CATEGORIES,
  KNOWLEDGE_SKILL_CATEGORIES,
  SPELL_CATEGORIES,
  ATTRIBUTE_KEYS,
  ATTRIBUTE_TESTS,
  CONTROL_MODES,
  DRONE_ACTIONS,
  ACTION_CATEGORIES,
} from './constants.js';

const CONTROL_MODE_ICONS = {
  autonomous: 'icons/svg/mystery-man.svg',
  remote:     'icons/svg/net.svg',
  jumped:     'icons/svg/eye.svg',
};

const DRONE_ACTION_ICONS = {
  maneuvering:  'icons/svg/wingfoot.svg',
  perception:   'icons/svg/eye.svg',
  infiltration: 'icons/svg/cowled.svg',
};

const REALM_ICONS = {
  physical: 'icons/svg/mystery-man.svg',
  matrix:   'icons/svg/net.svg',
  astral:   'icons/svg/eye.svg',
};

const EFFECT_TEMPLATES = [
  { key: 'sustain',        icon: 'aura.svg' },
  { key: 'disoriented',    icon: 'stoned.svg' },
  { key: 'blind',          icon: 'blind.svg' },
  { key: 'blindFlareComp', icon: 'blind.svg' },
  { key: 'knockedDown',    icon: 'falling.svg' },
];

export function createActionHandler(coreModule) {
  return class SR4ActionHandler extends coreModule.api.ActionHandler {

    async buildSystemActions(_groupIds) {
      const actor = this.actor;
      if (!actor) return;

      if (actor.type === 'vehicle') {
        await this.#buildVehicle(actor);
        return;
      }

      if (actor.type === 'spirit') {
        this.#buildSpirit(actor);
        return;
      }

      this.#buildBasics(actor);
      this.#buildSkills(actor, 'active',    ACTIVE_SKILL_CATEGORIES,    'active-skills',    s => s.system.category ?? 'misc');
      this.#buildSkills(actor, 'knowledge', KNOWLEDGE_SKILL_CATEGORIES, 'knowledge-skills', s => s.system.category ?? 'misc');
      this.#buildWeapons(actor);
      this.#buildMagic(actor);
      this.#buildMatrix(actor);
      this.#buildMonitor(actor);
      this.#buildActions(actor);
      this.#buildItemActionsEffects(actor, 'Power', 'powers');
      this.#buildItemActionsEffects(actor, 'CritterPower', 'powers');
      this.#buildItemActionsEffects(actor, 'Implant', 'implants');
      this.#buildEffects(actor);
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    #addToGroup(actions, parent, groupId) {
      this.addActions(actions, { id: groupId, nestId: `${parent}_${groupId}`, type: 'system' });
    }

    #equipAction(item, equippedIcon) {
      return {
        id:           `equip-${item.id}`,
        name:         `${item.system.equipped ? '✦' : '○'} ${item.name}`,
        img:          item.system.equipped ? equippedIcon : 'icons/svg/item-bag.svg',
        encodedValue: `equip|${item.id}`,
        cssClass:     item.system.equipped ? 'active' : '',
        tooltip:      `${loc('sr4.hud.weapons.equip')}: ${item.name}`,
      };
    }

    #addLinkedActionsAndEffects(actor, items, groupPrefix) {
      const { linkedActions, effectActions } = this.#collectLinkedActionsAndEffects(actor, items);
      if (linkedActions.length) this.#addToGroup(linkedActions, groupPrefix, `${groupPrefix}-actions`);
      if (effectActions.length) this.#addToGroup(effectActions, groupPrefix, `${groupPrefix}-effects`);
    }

    /** Filter items into per-category groups, sort, map to actions, and add non-empty groups. */
    #buildByCategory(items, categories, parentId, groupIdFor, categorize, compare, toAction) {
      for (const category of categories) {
        const actions = items
          .filter(item => categorize(item) === category)
          .sort(compare)
          .map(toAction);

        if (!actions.length) continue;

        this.#addToGroup(actions, parentId, groupIdFor(category));
      }
    }

    /** Action-item category tags, preferring the system API over the static fallback list. */
    #actionCategories() {
      const api = Object.values(game.sr4?.ActionCategory ?? {});
      return api.length ? api : ACTION_CATEGORIES;
    }

    #matrixCategoryValue() {
      return game.sr4?.ActionCategory?.MATRIX ?? 'MATRIX';
    }

    #actionButton(a) {
      return {
        id:           a.id,
        name:         a.name,
        img:          a.img,
        encodedValue: `action|${a.id}`,
        tooltip:      `${a.name} · ${a.system.actionType ?? ''}`,
      };
    }

    // -----------------------------------------------------------------------
    // Vehicle
    // -----------------------------------------------------------------------

    async #buildVehicle(actor) {
      const sys = actor.system;
      const pilot = sys.pilot ?? 0;

      this.#buildControlModes(actor);
      await this.#buildDroneActions(actor);

      const statActions = [
        { id: 'veh-body',     name: `${loc('sr4.vehicle.body')} (${sys.body ?? 0})`,       encodedValue: 'freeRoll|free-roll', img: 'icons/svg/shield.svg' },
        { id: 'veh-pilot',    name: `${loc('sr4.vehicle.pilot')} (${sys.pilot ?? 0})`,      encodedValue: 'freeRoll|free-roll', img: 'icons/svg/d20.svg' },
        { id: 'veh-armor',    name: `${loc('sr4.vehicle.armor')} (${sys.armor ?? 0})`,      encodedValue: 'freeRoll|free-roll', img: 'icons/svg/shield.svg' },
        { id: 'veh-sensor',   name: `${loc('sr4.vehicle.sensor')} (${sys.sensor ?? 0})`,    encodedValue: 'freeRoll|free-roll', img: 'icons/svg/d20.svg' },
        { id: 'veh-handling', name: `${loc('sr4.vehicle.handling')} (${sys.handling ?? 0})`,encodedValue: 'freeRoll|free-roll', img: 'icons/svg/d20.svg' },
      ];
      this.#addToGroup(statActions, 'basics', 'basics-improvise');

      const autosoftActions = actor.items
        .filter(i => i.type === 'Autosoft')
        .map(a => ({
          id:           a.id,
          name:         `${a.name} (${pilot + (a.system.rating ?? 0)})`,
          img:          a.img ?? 'icons/svg/d20.svg',
          encodedValue: `autosoft|${a.id}`,
          tooltip:      `${loc('sr4.vehicle.autonomous')}: Pilot ${pilot} + Rating ${a.system.rating ?? 0}`,
        }));
      if (autosoftActions.length) {
        this.#addToGroup(autosoftActions, 'basics', 'basics-free-roll');
      }

      this.#buildWeapons(actor);
      this.#buildVehicleMonitor(actor);
      this.#buildEffects(actor);
    }

    #buildControlModes(actor) {
      const current = actor.system.controlMode ?? 'autonomous';
      const apiModes = Object.values(game.sr4?.rigging?.ControlModes ?? {});
      const modes = apiModes.length ? apiModes : CONTROL_MODES;

      const actions = modes.map(mode => ({
        id:           `mode-${mode}`,
        name:         loc(`sr4.vehicle.controlModes.${mode}`),
        img:          CONTROL_MODE_ICONS[mode] ?? 'icons/svg/d20-grey.svg',
        encodedValue: `controlMode|${mode}`,
        cssClass:     mode === current ? 'active' : '',
        tooltip:      loc('sr4.hud.vehicle.modeTooltip'),
      }));

      this.#addToGroup(actions, 'basics', 'basics-control-mode');
    }

    async #buildDroneActions(actor) {
      const rigging = game.sr4?.rigging;
      if (!rigging) return;

      const rigger = await rigging.resolveRigger(actor);
      const stored = actor.system.controlMode ?? 'autonomous';
      const mode = stored !== 'autonomous' && !rigger ? 'autonomous' : stored;

      const actions = DRONE_ACTIONS.map(action => {
        const { pool } = rigging.resolveDronePool(actor, rigger, mode, action);
        return {
          id:           `drone-${action}`,
          name:         `${loc(`sr4.vehicle.actions.${action}`)} (${pool})`,
          img:          DRONE_ACTION_ICONS[action] ?? 'icons/svg/d20.svg',
          encodedValue: `droneAction|${action}`,
          tooltip:      `${loc(`sr4.vehicle.actions.${action}`)} · ${loc(`sr4.vehicle.controlModes.${mode}`)}`,
        };
      });

      this.#addToGroup(actions, 'basics', 'basics-drone-actions');
    }

    #buildVehicleMonitor(actor) {
      const cm = actor.system?.conditionMonitor;
      if (!cm?.physical) return;
      this.#addToGroup([{
        id:           'physical',
        name:         `${loc('sr4.hud.monitor.physical')}: ${cm.physical.value}/${cm.physical.max}`,
        img:          'icons/svg/regen.svg',
        encodedValue: 'monitor-deal|physical',
      }], 'monitor', 'monitor-list');
    }

    // -----------------------------------------------------------------------
    // Spirit / Sprite
    // -----------------------------------------------------------------------

    #buildSpirit(actor) {
      this.#buildAttributes(actor);
      this.#buildFreeRoll();
      this.#buildEdge(actor);
      this.#buildItemActionsEffects(actor, 'CritterPower', 'powers');
      this.#buildSkills(actor, 'active', ACTIVE_SKILL_CATEGORIES, 'active-skills', s => s.system.category ?? 'misc');
      this.#buildMonitor(actor);
      this.#buildEffects(actor);
    }

    #buildItemActionsEffects(actor, type, groupPrefix) {
      const items = actor.items.filter(i => i.type === type);
      if (!items.length) return;

      const itemActions = items.map(item => ({
        id:           item.id,
        name:         item.name,
        img:          item.img ?? 'icons/svg/aura.svg',
        encodedValue: `itemSheet|${item.id}`,
        tooltip:      item.system.description ?? item.name,
      }));

      this.#addToGroup(itemActions, groupPrefix, `${groupPrefix}-list`);
      this.#addLinkedActionsAndEffects(actor, items, groupPrefix);
    }

    #collectLinkedActionsAndEffects(actor, items) {
      const actionsByLinkedId = new Map();
      for (const a of actor.items.filter(i => i.type === 'Action' && i.system.linkedItemId)) {
        const list = actionsByLinkedId.get(a.system.linkedItemId);
        if (list) list.push(a);
        else actionsByLinkedId.set(a.system.linkedItemId, [a]);
      }

      const linkedActions = [];
      const effectActions = [];

      for (const item of items) {
        for (const a of actionsByLinkedId.get(item.id) ?? []) {
          linkedActions.push({
            id:           a.id,
            name:         `${item.name}: ${a.name}`,
            img:          a.img ?? 'icons/svg/d20.svg',
            encodedValue: `action|${a.id}`,
            tooltip:      `${a.name} · ${a.system.actionType ?? ''}`,
          });
        }

        for (const e of item.effects?.contents ?? []) {
          effectActions.push({
            id:           `${item.id}-${e.id}`,
            name:         `${item.name}: ${e.name}`,
            img:          e.img ?? 'icons/svg/aura.svg',
            encodedValue: `itemEffectToggle|${item.id}:${e.id}`,
            cssClass:     e.disabled ? '' : 'active',
            tooltip:      `${e.name} — ${loc('sr4.hud.effects.toggleHint')}`,
          });
        }
      }

      return { linkedActions, effectActions };
    }

    // -----------------------------------------------------------------------
    // Basics
    // -----------------------------------------------------------------------

    #buildBasics(actor) {
      this.#buildAttributes(actor);
      this.#buildRealms(actor);
      this.#buildEdgeRolls(actor);
      this.#buildFreeRoll();
      this.#buildEdge(actor);
      this.#buildSoak(actor);
      this.#buildTests(actor);
    }

    #buildRealms(actor) {
      const api = game.sr4?.initiative;
      if (!api) return;

      const realms = api.getAvailableRealms(actor);
      if (realms.length < 2) return;

      const combatant = this.#activeCombatant(actor);
      const current = combatant
        ? api.getCombatantRealm(combatant)
        : (actor.system.realm ?? 'physical');

      const actions = realms.map(realm => ({
        id:           `realm-${realm}`,
        name:         loc(`sr4.combat.realm.${realm}`),
        img:          REALM_ICONS[realm] ?? 'icons/svg/d20-grey.svg',
        encodedValue: `realm|${realm}`,
        cssClass:     realm === current ? 'active' : '',
        tooltip:      loc('sr4.hud.realm.tooltip'),
      }));

      this.#addToGroup(actions, 'basics', 'basics-realm');
    }

    #activeCombatant(actor) {
      return game.combat?.combatants.find(
        c => (this.token && c.tokenId === this.token.id) || c.actor?.id === actor.id
      );
    }

    #buildAttributes(actor) {
      const actions = ATTRIBUTE_KEYS.map(attr => ({
        id:           attr,
        name:         loc(`sr4.stats.${attr}`),
        img:          'icons/svg/d20.svg',
        encodedValue: `attribute|${attr}`,
        tooltip:
          `${loc('sr4.hud.improvisedRoll')} ` +
          `${loc(`sr4.stats.${attr}`)} ` +
          `${actor.getAttribute(attr)} - 1`,
      }));

      this.#addToGroup(actions, 'basics', 'basics-improvise');
    }

    #buildEdgeRolls(actor) {
      const edge = actor.getAttribute('EDGE');

      this.#addToGroup([{
        id:           'edge-roll-double',
        name:         `${loc('sr4.hud.edge.double')} (${edge * 2})`,
        img:          'icons/svg/explosion.svg',
        encodedValue: 'edgeRoll|double',
        tooltip:      loc('sr4.hud.edge.doubleTooltip'),
      }], 'basics', 'basics-edge-rolls');
    }

    #buildSoak(actor) {
      const body     = actor.getAttribute('BODY');
      const will     = actor.getAttribute('WILLPOWER');

      const { ballistic, impact } = collectArmor(actor);

      const soakActions = [
        { id: 'soak-willpower',      name: `${loc('sr4.hud.soak.willpower')}    (${will})`,           tooltip: `${loc('sr4.hud.soak.willpower')}    · ${will} ${loc('sr4.skills.dice')}`,                                  encodedValue: 'soak|willpower' },
        { id: 'soak-body',           name: `${loc('sr4.hud.soak.body')}         (${body})`,           tooltip: `${loc('sr4.hud.soak.body')}         · ${body} ${loc('sr4.skills.dice')}`,                                  encodedValue: 'soak|body' },
        { id: 'soak-body-impact',    name: `${loc('sr4.hud.soak.bodyImpact')}   (${body + impact})`,  tooltip: `${loc('sr4.hud.soak.bodyImpact')}   · BODY ${body} + Impact ${impact} = ${body + impact}`,                  encodedValue: 'soak|body-impact' },
        { id: 'soak-body-ballistic', name: `${loc('sr4.hud.soak.bodyBallistic')}(${body + ballistic})`,tooltip: `${loc('sr4.hud.soak.bodyBallistic')} · BODY ${body} + Ballistic ${ballistic} = ${body + ballistic}`,       encodedValue: 'soak|body-ballistic' },
      ].map(a => ({ ...a, img: 'icons/svg/shield.svg' }));

      const armorActions = actor.items
        .filter(i => i.type === 'Armor')
        .map(a => this.#equipAction(a, 'icons/svg/shield.svg'));

      this.#addToGroup([...soakActions, ...armorActions], 'basics', 'basics-soak');
    }

    #buildTests(actor) {
      const actions = ATTRIBUTE_TESTS.map(({ key, attr1, attr2 }) => {
        const v1 = actor.getAttribute(attr1);
        const v2 = actor.getAttribute(attr2);
        return {
          id:           `test-${key}`,
          name:         `${loc(`sr4.hud.tests.${key}`)} (${v1 + v2})`,
          img:          'icons/svg/d20.svg',
          encodedValue: `attrTest|${key}`,
          tooltip:      `${loc(`sr4.hud.tests.${key}`)} · ${loc(`sr4.stats.${attr1}`)} ${v1} + ${loc(`sr4.stats.${attr2}`)} ${v2} = ${v1 + v2}`,
        };
      });

      this.#addToGroup(actions, 'basics', 'basics-tests');
    }

    #buildFreeRoll() {
      this.#addToGroup([{
        id:           'free-roll',
        name:         loc('sr4.hud.freeRoll'),
        img:          'icons/svg/d20-grey.svg',
        encodedValue: 'freeRoll|free-roll',
      }], 'basics', 'basics-free-roll');
    }

    #buildEdge(actor) {
      const current = actor.getAttribute('CURRENTEDGE');
      const max     = actor.getAttribute('EDGE');

      this.#addToGroup([
        { id: 'edge-add',   name: `${loc('sr4.hud.edge.add')} (${current}/${max})`, img: 'icons/svg/upgrade.svg',   encodedValue: 'edge|add',   tooltip: loc('sr4.hud.edge.addTooltip')   },
        { id: 'edge-spend', name: loc('sr4.hud.edge.spend'),                        img: 'icons/svg/downgrade.svg', encodedValue: 'edge|spend', tooltip: loc('sr4.hud.edge.spendTooltip') },
        { id: 'edge-reset', name: loc('sr4.hud.edge.reset'),                        img: 'icons/svg/regen.svg',     encodedValue: 'edge|reset', tooltip: loc('sr4.hud.edge.resetTooltip') },
      ], 'basics', 'basics-edge-management');
    }

    // -----------------------------------------------------------------------
    // Skills
    // -----------------------------------------------------------------------

    #buildSkills(actor, type, categories, parentId, categorize) {
      const skills = actor.items.filter(
        i => i.type === 'Skill' && i.system.type === type && i.system.rating > 0
      );
      const prefix = type === 'active' ? 'skills' : 'knowledge';

      this.#buildByCategory(
        skills, categories, parentId,
        category => `${prefix}-${category}`,
        categorize,
        (a, b) => this.#skillName(a).localeCompare(this.#skillName(b)),
        skill => ({
          id:           skill.id,
          name:         this.#skillButtonLabel(skill, actor),
          img:          skill.img,
          encodedValue: `skill|${skill.id}`,
          tooltip:      this.#skillTooltip(skill),
        })
      );
    }

    #skillName(skill) {
      return skill.system.label ? loc(skill.system.label) : skill.name;
    }

    #skillButtonLabel(skill, actor) {
      const attrKey  = skill.system.attribute;
      const attrVal  = actor.getAttribute(attrKey);
      return (
        `${this.#skillName(skill)} ` +
        `(${skill.system.rating} ${loc('sr4.skills.rating')} + ` +
        `${attrVal} ${loc(`sr4.attributeAbr.${attrKey?.toLowerCase()}`)})`
      );
    }

    #skillTooltip(skill) {
      const attr    = loc(`sr4.attributeAbr.${skill.system.attribute?.toLowerCase()}`);
      const rating  = skill.system.rating ?? '?';
      const spec    = skill.system.specialization;
      const specStr = spec
        ? `(+2) ${loc('sr4.hud.specialization')} (${loc(spec)})`
        : '';

      return `${this.#skillName(skill)} · ${attr} · ${loc('sr4.hud.rating')} ${rating} ${specStr}`.trimEnd();
    }

    // -----------------------------------------------------------------------
    // Weapons
    // -----------------------------------------------------------------------

    #buildWeapons(actor) {
      const actions = actor.items
        .filter(i => i.type === 'Ranged Weapon' || i.type === 'Melee Weapon')
        .map(w => this.#weaponAction(w));

      if (!actions.length) return;
      this.#addToGroup(actions, 'weapons', 'weapons-list');
    }

    /** One button per weapon: click rolls, Ctrl+Click toggles equip, Shift+Click reloads (ranged). */
    #weaponAction(w) {
      const dmg   = w.system.effectiveDamage ?? w.system.damage ?? '?';
      const ap    = w.system.effectiveAP ?? w.system.ap ?? '?';
      const stats = `${w.name} · DMG: ${dmg} AP: ${ap}`;

      const hasAmmo = w.type === 'Ranged Weapon' && w.system.maxAmmo > 0;
      const hints   = [loc('sr4.hud.weapons.equipHint')];
      if (hasAmmo) hints.push(loc('sr4.hud.weapons.reloadHint'));

      return {
        id:           w.id,
        name:         hasAmmo ? `${w.name} (${w.system.currentAmmo}/${w.system.maxAmmo})` : w.name,
        img:          w.img,
        encodedValue: `weapon|${w.id}`,
        cssClass:     w.system.equipped ? 'active' : '',
        tooltip:      `${stats}\n${hints.join('\n')}`,
      };
    }

    // -----------------------------------------------------------------------
    // Magic (Spells + Summoning)
    // -----------------------------------------------------------------------

    #buildMagic(actor) {
      if (!actor.getAttribute('MAGIC')) return;

      const spells = actor.items.filter(i => i.type === 'Spell');

      this.#buildByCategory(
        spells, SPELL_CATEGORIES, 'magic',
        category => `spells-${category.toLowerCase()}`,
        spell => spell.system.category,
        (a, b) => a.name.localeCompare(b.name),
        spell => ({
          id:           spell.id,
          name:         spell.name,
          img:          spell.img,
          encodedValue: `spell|${spell.id}`,
          tooltip:      this.#spellTooltip(spell),
        })
      );

      this.#addLinkedActionsAndEffects(actor, spells, 'spells');

      this.#addToGroup([
        {
          id:           'summon-spirit',
          name:         loc('sr4.hud.magic.summonSpirit'),
          img:          'icons/svg/aura.svg',
          encodedValue: 'summon|spirit',
          tooltip:      loc('sr4.hud.magic.summonSpiritTooltip'),
        },
        {
          id:           'summon-watcher',
          name:         loc('sr4.hud.magic.summonWatcher'),
          img:          'icons/svg/eye.svg',
          encodedValue: 'summon|watcher',
          tooltip:      loc('sr4.hud.magic.summonWatcherTooltip'),
        },
        {
          id:           'banish-spirit',
          name:         loc('sr4.hud.magic.banishSpirit'),
          img:          'icons/svg/falling.svg',
          encodedValue: 'banish|spirit',
          tooltip:      loc('sr4.hud.magic.banishSpiritTooltip'),
        },
        {
          id:           'bind-spirit',
          name:         loc('sr4.hud.magic.bindSpirit'),
          img:          'icons/svg/net.svg',
          encodedValue: 'bind|spirit',
          tooltip:      loc('sr4.hud.magic.bindSpiritTooltip'),
        },
      ], 'magic', 'magic-summoning');
    }

    #spellTooltip(spell) {
      const s = spell.system;
      const t = (key, val) => val ? loc(`sr4.spell.${key}.${val.toLowerCase()}`) : '?';

      const combatInfo = s.category === 'COMBAT'
        ? ` · ${t('combatTypes', s.combatType)} · ${s.damageType ? loc(`sr4.damage.${s.damageType}`) : '?'}`
        : '';
      const element = s.element ? ` · ${t('elements', s.element)}` : '';
      const area    = s.area    ? ` · ${loc('sr4.spell.area')}`     : '';

      return `${t('types', s.type)} · ${t('ranges', s.range)} · ${t('durations', s.duration)} · DV ${s.dv}${combatInfo}${element}${area}`;
    }

    // -----------------------------------------------------------------------
    // Matrix (Programs + Compiling/Threading)
    // -----------------------------------------------------------------------

    #buildMatrix(actor) {
      const programs = actor.items.filter(i => i.type === 'Program' && !i.system.complexform);
      if (programs.length) {
        const actions = programs
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(p => ({
            id:           p.id,
            name:         p.name,
            img:          p.img ?? 'icons/svg/item-bag.svg',
            encodedValue: `itemSheet|${p.id}`,
            tooltip:      p.system.description ?? p.name,
          }));

        this.#addToGroup(actions, 'matrix', 'matrix-list');
        this.#addLinkedActionsAndEffects(actor, programs, 'matrix');
      }

      const matrixCategoryActions = actor.items
        .filter(i => i.type === 'Action' && !i.system.linkedItemId && i.system.category === this.#matrixCategoryValue())
        .map(a => this.#actionButton(a));
      if (matrixCategoryActions.length) {
        this.#addToGroup(matrixCategoryActions, 'matrix', 'matrix-category-actions');
      }

      if (!actor.system.technomancy?.technomancer) return;

      this.#addToGroup([
        {
          id:           'compile-sprite',
          name:         loc('sr4.hud.matrix.compileSprite'),
          img:          'icons/svg/aura.svg',
          encodedValue: 'summon|sprite',
          tooltip:      loc('sr4.hud.matrix.compileSpriteTooltip'),
        },
        {
          id:           'thread-complex-form',
          name:         loc('sr4.hud.matrix.threadComplexForm'),
          img:          'icons/svg/d20.svg',
          encodedValue: 'threading|thread',
          tooltip:      loc('sr4.hud.matrix.threadComplexFormTooltip'),
        },
        {
          id:           'decompile-sprite',
          name:         loc('sr4.hud.matrix.decompileSprite'),
          img:          'icons/svg/downgrade.svg',
          encodedValue: 'decompile|sprite',
          tooltip:      loc('sr4.hud.matrix.decompileSpriteTooltip'),
        },
        {
          id:           'bind-sprite',
          name:         loc('sr4.hud.matrix.bindSprite'),
          img:          'icons/svg/net.svg',
          encodedValue: 'bind|sprite',
          tooltip:      loc('sr4.hud.matrix.bindSpriteTooltip'),
        },
      ], 'matrix', 'matrix-resonance');
    }

    // -----------------------------------------------------------------------
    // Monitor / Actions
    // -----------------------------------------------------------------------

    #buildMonitor(actor) {
      const cm = actor.system?.conditionMonitor;
      if (!cm) return;

      const actions = ['physical', 'stun']
        .filter(track => cm[track])
        .map(track => ({
          id:           track,
          name:         `${loc(`sr4.hud.monitor.${track}`)}: ${cm[track].value}/${cm[track].max}`,
          img:          track === 'physical' ? 'icons/svg/regen.svg' : 'icons/svg/daze.svg',
          encodedValue: `monitor-deal|${track}`,
        }));

      this.#addToGroup(actions, 'monitor', 'monitor-list');
    }

    #buildActions(actor) {
      const items = actor.items.filter(i => i.type === 'Action' && !i.system.linkedItemId);
      if (!items.length) return;

      const categories = this.#actionCategories();

      const uncategorized = items
        .filter(a => !categories.includes(a.system.category))
        .map(a => this.#actionButton(a));
      if (uncategorized.length) this.#addToGroup(uncategorized, 'actions', 'actions-list');

      this.#buildByCategory(
        items, categories, 'actions',
        category => `actions-category-${category.toLowerCase()}`,
        a => a.system.category,
        (a, b) => a.name.localeCompare(b.name),
        a => this.#actionButton(a)
      );
    }

    // -----------------------------------------------------------------------
    // Effects
    // -----------------------------------------------------------------------

    #buildEffects(actor) {
      const templateActions = EFFECT_TEMPLATES.map(({ key, icon }) => {
        const locKey = `add${key[0].toUpperCase()}${key.slice(1)}`;
        return {
          id:           `effect-${key}-add`,
          name:         loc(`sr4.hud.effects.${locKey}`),
          img:          `icons/svg/${icon}`,
          encodedValue: `effectTemplate|${key}`,
          tooltip:      loc(`sr4.hud.effects.${locKey}Tooltip`),
        };
      });
      this.#addToGroup(templateActions, 'effects', 'effects-templates');

      const effectActions = actor.effects.contents.map(effect => ({
        id:           effect.id,
        name:         effect.name,
        img:          effect.icon ?? 'icons/svg/aura.svg',
        encodedValue: `effectToggle|${effect.id}`,
        cssClass:     effect.disabled ? '' : 'active',
        tooltip:      this.#effectTooltip(effect),
      }));

      if (!effectActions.length) return;
      this.#addToGroup(effectActions, 'effects', 'effects-active');
    }

    #effectTooltip(effect) {
      const change = effect.changes[0];
      const hint = loc('sr4.hud.effects.deleteHint');
      if (!change) return `${effect.name}\n${hint}`;
      const sign = Number(change.value) > 0 ? '+' : '';
      return `${effect.name} · ${sign}${change.value}\n${hint}`;
    }
  };
}

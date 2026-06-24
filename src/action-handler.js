/**
 * @fileoverview Action Handler — Token Action HUD SR4
 */

import { loc, collectArmor } from './system-manager.js';
import {
  ACTIVE_SKILL_CATEGORIES,
  KNOWLEDGE_SKILL_CATEGORIES,
  SPELL_CATEGORIES,
  ATTRIBUTE_KEYS,
} from './constants.js';

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
        this.#buildVehicle(actor);
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
      this.#buildSpells(actor);
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

    // -----------------------------------------------------------------------
    // Vehicle
    // -----------------------------------------------------------------------

    #buildVehicle(actor) {
      const sys = actor.system;
      const pilot = sys.pilot ?? 0;

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
      this.#buildEdgeRolls(actor);
      this.#buildFreeRoll();
      this.#buildEdge(actor);
      this.#buildSoak(actor);
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

      this.#addToGroup([
        { id: 'soak-willpower',      name: `${loc('sr4.hud.soak.willpower')}    (${will})`,           tooltip: `${loc('sr4.hud.soak.willpower')}    · ${will} ${loc('sr4.skills.dice')}`,                                  encodedValue: 'soak|willpower' },
        { id: 'soak-body',           name: `${loc('sr4.hud.soak.body')}         (${body})`,           tooltip: `${loc('sr4.hud.soak.body')}         · ${body} ${loc('sr4.skills.dice')}`,                                  encodedValue: 'soak|body' },
        { id: 'soak-body-impact',    name: `${loc('sr4.hud.soak.bodyImpact')}   (${body + impact})`,  tooltip: `${loc('sr4.hud.soak.bodyImpact')}   · BODY ${body} + Impact ${impact} = ${body + impact}`,                  encodedValue: 'soak|body-impact' },
        { id: 'soak-body-ballistic', name: `${loc('sr4.hud.soak.bodyBallistic')}(${body + ballistic})`,tooltip: `${loc('sr4.hud.soak.bodyBallistic')} · BODY ${body} + Ballistic ${ballistic} = ${body + ballistic}`,       encodedValue: 'soak|body-ballistic' },
      ].map(a => ({ ...a, img: 'icons/svg/shield.svg' })),
      'basics', 'basics-soak');
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

      for (const category of categories) {
        const actions = skills
          .filter(s => categorize(s) === category)
          .sort((a, b) => this.#skillName(a).localeCompare(this.#skillName(b)))
          .map(skill => ({
            id:           skill.id,
            name:         this.#skillButtonLabel(skill, actor),
            img:          skill.img,
            encodedValue: `skill|${skill.id}`,
            tooltip:      this.#skillTooltip(skill),
          }));

        if (!actions.length) continue;

        this.#addToGroup(actions, parentId, `${prefix}-${category}`);
      }
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
      const actions = [];

      for (const w of actor.items.filter(i => i.type === 'Ranged Weapon' || i.type === 'Melee Weapon')) {
        const dmg = w.system.effectiveDamage ?? w.system.damage ?? '?';
        const ap = w.system.effectiveAP ?? w.system.ap ?? '?';
        actions.push({
          id:           w.id,
          name:         w.name,
          img:          w.img,
          encodedValue: `weapon|${w.id}`,
          tooltip:      `${w.name} · DMG: ${dmg} AP: ${ap}`,
        });

        if (w.type === 'Melee Weapon') {
          actions.push(this.#equipAction(w, 'icons/svg/sword.svg'));
        }

        if (w.type === 'Ranged Weapon' && w.system.maxAmmo > 0) {
          actions.push({
            id:           `reload-${w.id}`,
            name:         `↺ ${w.name} (${w.system.currentAmmo}/${w.system.maxAmmo})`,
            img:          'icons/svg/regen.svg',
            encodedValue: `reload|${w.id}`,
            tooltip:      `${loc('sr4.weapon.reload')}: ${w.system.currentAmmo}/${w.system.maxAmmo}`,
          });
        }
      }

      for (const a of actor.items.filter(i => i.type === 'Armor')) {
        actions.push(this.#equipAction(a, 'icons/svg/shield.svg'));
      }

      this.#addToGroup(actions, 'weapons', 'weapons-list');
    }

    // -----------------------------------------------------------------------
    // Spells
    // -----------------------------------------------------------------------

    #buildSpells(actor) {
      if (!actor.getAttribute('MAGIC')) return;

      const spells = actor.items.filter(i => i.type === 'Spell');
      for (const category of SPELL_CATEGORIES) {
        const actions = spells
          .filter(s => s.system.category === category)
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(spell => ({
            id:           spell.id,
            name:         spell.name,
            img:          spell.img,
            encodedValue: `spell|${spell.id}`,
            tooltip:      this.#spellTooltip(spell),
          }));

        if (!actions.length) continue;

        this.#addToGroup(actions, 'spells', `spells-${category.toLowerCase()}`);
      }

      this.#addLinkedActionsAndEffects(actor, spells, 'spells');
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
      const actions = actor.items
        .filter(i => i.type === 'Action' && !i.system.linkedItemId)
        .map(a => ({
          id:           a.id,
          name:         a.name,
          img:          a.img,
          encodedValue: `action|${a.id}`,
          tooltip:      `${a.name} · ${a.system.actionType ?? ''}`,
        }));

      if (!actions.length) return;
      this.#addToGroup(actions, 'actions', 'actions-list');
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

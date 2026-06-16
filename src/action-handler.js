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
      this.#buildEffects(actor);
    }

    // -----------------------------------------------------------------------
    // Vehicle
    // -----------------------------------------------------------------------

    #buildVehicle(actor) {
      const sys = actor.system;
      const pilot = sys.pilot ?? 0;

      // Vehicle stats as improvised rolls in the basics-improvise group
      const statActions = [
        { id: 'veh-body',     name: `${loc('sr4.vehicle.body')} (${sys.body ?? 0})`,       encodedValue: 'freeRoll|free-roll', img: 'icons/svg/shield.svg' },
        { id: 'veh-pilot',    name: `${loc('sr4.vehicle.pilot')} (${sys.pilot ?? 0})`,      encodedValue: 'freeRoll|free-roll', img: 'icons/svg/d20.svg' },
        { id: 'veh-armor',    name: `${loc('sr4.vehicle.armor')} (${sys.armor ?? 0})`,      encodedValue: 'freeRoll|free-roll', img: 'icons/svg/shield.svg' },
        { id: 'veh-sensor',   name: `${loc('sr4.vehicle.sensor')} (${sys.sensor ?? 0})`,    encodedValue: 'freeRoll|free-roll', img: 'icons/svg/d20.svg' },
        { id: 'veh-handling', name: `${loc('sr4.vehicle.handling')} (${sys.handling ?? 0})`,encodedValue: 'freeRoll|free-roll', img: 'icons/svg/d20.svg' },
      ];
      this.addActions(statActions, { id: 'basics-improvise', nestId: 'basics_basics-improvise', type: 'system' });

      // Autosofts as rollable actions — pilot + rating dice
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
        this.addActions(autosoftActions, { id: 'basics-free-roll', nestId: 'basics_basics-free-roll', type: 'system' });
      }

      this.#buildWeapons(actor);
      this.#buildVehicleMonitor(actor);
      this.#buildEffects(actor);
    }

    #buildVehicleMonitor(actor) {
      const cm = actor.system?.conditionMonitor;
      if (!cm?.physical) return;
      this.addActions([{
        id:           'physical',
        name:         `${loc('sr4.hud.monitor.physical')}: ${cm.physical.value}/${cm.physical.max}`,
        img:          'icons/svg/regen.svg',
        encodedValue: 'monitor-deal|physical',
      }], { id: 'monitor-list', nestId: 'monitor_monitor-list', type: 'system' });
    }

    // -----------------------------------------------------------------------
    // Spirit / Sprite
    // -----------------------------------------------------------------------

    #buildSpirit(actor) {
      this.#buildAttributes(actor);
      this.#buildFreeRoll();
      this.#buildEdge(actor);
      this.#buildSpiritPowers(actor);
      this.#buildSkills(actor, 'active', ACTIVE_SKILL_CATEGORIES, 'active-skills', s => s.system.category ?? 'misc');
      this.#buildMonitor(actor);
      this.#buildEffects(actor);
    }

    #buildSpiritPowers(actor) {
      const actions = actor.items
        .filter(i => i.type === 'Power')
        .map(p => ({
          id:           p.id,
          name:         p.name,
          img:          p.img ?? 'icons/svg/d20.svg',
          encodedValue: 'freeRoll|free-roll',
          tooltip:      p.system.description ?? p.name,
        }));
      if (actions.length) {
        this.addActions(actions, { id: 'weapons-list', nestId: 'weapons_weapons-list', type: 'system' });
      }
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

      this.addActions(actions, { id: 'basics-improvise', nestId: 'basics_basics-improvise', type: 'system' });
    }

    #buildEdgeRolls(actor) {
      const edge = actor.getAttribute('EDGE');

      this.addActions([{
        id:           'edge-roll-double',
        name:         `${loc('sr4.hud.edge.double')} (${edge * 2})`,
        img:          'icons/svg/explosion.svg',
        encodedValue: 'edgeRoll|double',
        tooltip:      loc('sr4.hud.edge.doubleTooltip'),
      }], { id: 'basics-edge-rolls', nestId: 'basics_basics-edge-rolls', type: 'system' });
    }

    #buildSoak(actor) {
      const body     = actor.getAttribute('BODY');
      const will     = actor.getAttribute('WILLPOWER');

      const { ballistic, impact } = collectArmor(actor);

      this.addActions([
        { id: 'soak-willpower',      name: `${loc('sr4.hud.soak.willpower')}    (${will})`,           tooltip: `${loc('sr4.hud.soak.willpower')}    · ${will} ${loc('sr4.skills.dice')}`,                                  encodedValue: 'soak|willpower' },
        { id: 'soak-body',           name: `${loc('sr4.hud.soak.body')}         (${body})`,           tooltip: `${loc('sr4.hud.soak.body')}         · ${body} ${loc('sr4.skills.dice')}`,                                  encodedValue: 'soak|body' },
        { id: 'soak-body-impact',    name: `${loc('sr4.hud.soak.bodyImpact')}   (${body + impact})`,  tooltip: `${loc('sr4.hud.soak.bodyImpact')}   · BODY ${body} + Impact ${impact} = ${body + impact}`,                  encodedValue: 'soak|body-impact' },
        { id: 'soak-body-ballistic', name: `${loc('sr4.hud.soak.bodyBallistic')}(${body + ballistic})`,tooltip: `${loc('sr4.hud.soak.bodyBallistic')} · BODY ${body} + Ballistic ${ballistic} = ${body + ballistic}`,       encodedValue: 'soak|body-ballistic' },
      ].map(a => ({ ...a, img: 'icons/svg/shield.svg' })),
      { id: 'basics-soak', nestId: 'basics_basics-soak', type: 'system' });
    }

    #buildFreeRoll() {
      this.addActions([{
        id:           'free-roll',
        name:         loc('sr4.hud.freeRoll'),
        img:          'icons/svg/d20-grey.svg',
        encodedValue: 'freeRoll|free-roll',
      }], { id: 'basics-free-roll', nestId: 'basics_basics-free-roll', type: 'system' });
    }

    #buildEdge(actor) {
      const current = actor.getAttribute('CURRENTEDGE');
      const max     = actor.getAttribute('EDGE');

      this.addActions([
        { id: 'edge-add',   name: `${loc('sr4.hud.edge.add')} (${current}/${max})`, img: 'icons/svg/upgrade.svg',   encodedValue: 'edge|add',   tooltip: loc('sr4.hud.edge.addTooltip')   },
        { id: 'edge-spend', name: loc('sr4.hud.edge.spend'),                        img: 'icons/svg/downgrade.svg', encodedValue: 'edge|spend', tooltip: loc('sr4.hud.edge.spendTooltip') },
        { id: 'edge-reset', name: loc('sr4.hud.edge.reset'),                        img: 'icons/svg/refresh.svg',   encodedValue: 'edge|reset', tooltip: loc('sr4.hud.edge.resetTooltip') },
      ], { id: 'basics-edge-management', nestId: 'basics_basics-edge-management', type: 'system' });
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

        this.addActions(actions, {
          id:     `${prefix}-${category}`,
          nestId: `${parentId}_${prefix}-${category}`,
          type:   'system',
        });
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
        actions.push({
          id:           w.id,
          name:         w.name,
          img:          w.img,
          encodedValue: `weapon|${w.id}`,
          tooltip:      `${w.name} · DMG: ${w.system.damage ?? '?'} AP: ${w.system.ap ?? '?'}`,
        });

        if (w.type === 'Ranged Weapon' && w.system.maxAmmo > 0) {
          actions.push({
            id:           `reload-${w.id}`,
            name:         `↺ ${w.name} (${w.system.currentAmmo}/${w.system.maxAmmo})`,
            img:          'icons/svg/refresh.svg',
            encodedValue: `reload|${w.id}`,
            tooltip:      `${loc('sr4.weapon.reload')}: ${w.system.currentAmmo}/${w.system.maxAmmo}`,
          });
        }
      }

      this.addActions(actions, { id: 'weapons-list', nestId: 'weapons_weapons-list', type: 'system' });
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

        this.addActions(actions, {
          id:     `spells-${category.toLowerCase()}`,
          nestId: `spells_spells-${category.toLowerCase()}`,
          type:   'system',
        });
      }
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

      this.addActions(actions, { id: 'monitor-list', nestId: 'monitor_monitor-list', type: 'system' });
    }

    #buildActions(actor) {
      const actions = actor.items
        .filter(i => i.type === 'Action')
        .map(a => ({
          id:           a.id,
          name:         a.name,
          img:          a.img,
          encodedValue: `action|${a.id}`,
          tooltip:      `${a.name} · ${a.system.actionType ?? ''}`,
        }));

      if (!actions.length) return;
      this.addActions(actions, { id: 'actions-list', nestId: 'actions_actions-list', type: 'system' });
    }

    // -----------------------------------------------------------------------
    // Effects
    // -----------------------------------------------------------------------

    #buildEffects(actor) {
      // Premade templates (always shown, additive — each click creates a new instance)
      this.addActions([
        {
          id:           'effect-sustain-add',
          name:         loc('sr4.hud.effects.addSustain'),
          img:          'icons/svg/aura.svg',
          encodedValue: 'effectTemplate|sustain',
          tooltip:      loc('sr4.hud.effects.addSustainTooltip'),
        },
        {
          id:           'effect-disoriented-add',
          name:         loc('sr4.hud.effects.addDisoriented'),
          img:          'icons/svg/stoned.svg',
          encodedValue: 'effectTemplate|disoriented',
          tooltip:      loc('sr4.hud.effects.addDisorientedTooltip'),
        },
        {
          id:           'effect-blind-add',
          name:         loc('sr4.hud.effects.addBlind'),
          img:          'icons/svg/blind.svg',
          encodedValue: 'effectTemplate|blind',
          tooltip:      loc('sr4.hud.effects.addBlindTooltip'),
        },
        {
          id:           'effect-blind-flare-comp-add',
          name:         loc('sr4.hud.effects.addBlindFlareComp'),
          img:          'icons/svg/blind.svg',
          encodedValue: 'effectTemplate|blindFlareComp',
          tooltip:      loc('sr4.hud.effects.addBlindFlareCompTooltip'),
        },
        {
          id:           'effect-knocked-down-add',
          name:         loc('sr4.hud.effects.addKnockedDown'),
          img:          'icons/svg/falling.svg',
          encodedValue: 'effectTemplate|knockedDown',
          tooltip:      loc('sr4.hud.effects.addKnockedDownTooltip'),
        },
      ], { id: 'effects-templates', nestId: 'effects_effects-templates', type: 'system' });

      // Active effects on the actor — each is independently toggleable
      const effectActions = actor.effects.contents.map(effect => ({
        id:           effect.id,
        name:         effect.name,
        img:          effect.icon ?? 'icons/svg/aura.svg',
        encodedValue: `effectToggle|${effect.id}`,
        cssClass:     effect.disabled ? '' : 'active',
        tooltip:      this.#effectTooltip(effect),
      }));

      if (!effectActions.length) return;
      this.addActions(effectActions, { id: 'effects-active', nestId: 'effects_effects-active', type: 'system' });
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

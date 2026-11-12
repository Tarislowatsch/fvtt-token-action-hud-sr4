/**
 * @fileoverview Roll Handler — Token Action HUD SR4
 */

import {
  loc,
  fmt,
  doubleEdgePool,
  soakPools,
  attributeTestPool,
  autosoftPool,
  findActiveCombatant,
  actionCategories,
} from './utils.js';
import { ATTRIBUTE_TESTS, SOAK_MODES } from './constants.js';

export function createRollHandler(coreModule) {
  return class SR4RollHandler extends coreModule.api.RollHandler {
    get #dialog() { return game.sr4.dialogUtility; }

    async handleActionClick(event, encodedValue) {
      const [type, id] = encodedValue.split('|');
      const actor = this.actor;
      const sr4 = game.sr4;

      if (event.ctrlKey && type === 'effectToggle') return this.#refreshAfter(actor.effects.get(id)?.delete());
      if (event.ctrlKey && type === 'weapon')       return this.#toggleEquip(actor, id);
      if (event.shiftKey && type === 'weapon')      return this.#weaponReloadShortcut(actor, id);

      switch (type) {
        case 'skill':            return this.#rollSkill(actor, id);
        case 'weapon':           return this.#rollWeapon(actor, id);
        case 'monitor-deal':     return this.#dealDamage(actor, id);
        case 'action':           return this.#rollAction(actor, id);
        case 'spell':            return this.#castSpell(actor, id);
        case 'edge':             return this.#adjustEdge(actor, id);
        case 'attribute':        return this.#rollAttribute(actor, id);
        case 'edgeRoll':         return this.#rollEdge(actor);
        case 'freeRoll':         return this.#dialog.handleFreeRoll();
        case 'soak':             return this.#rollSoak(actor, id);
        case 'attrTest':         return this.#rollAttrTest(actor, id);
        case 'autosoft':         return this.#rollAutosoft(actor, id);
        case 'controlMode':      return this.#refreshAfter(actor.update({ 'system.controlMode': id }));
        case 'realm':            return this.#setRealm(actor, id);
        case 'droneAction':      return sr4.rigging?.openDroneRollDialog?.(actor, id);
        case 'effectToggle':     return this.#refreshAfter(actor.toggleEffect(id));
        case 'effectTemplate':   return this.#refreshAfter(actor.applyEffectTemplate(id));
        case 'itemEffectToggle': return this.#toggleItemEffect(actor, id);
        case 'itemSheet':        return this.#openItemSheet(actor, id);
        case 'equip':            return this.#toggleEquip(actor, id);
        case 'summon':           return this.#refreshAfter(id === 'watcher'
                                   ? sr4.SummoningFlow.startWatcher(actor)
                                   : sr4.SummoningFlow.start(actor, id));
        case 'threading':        return this.#refreshAfter(sr4.ThreadingFlow.start(actor));
        case 'banish':           return this.#refreshAfter(sr4.DismissalFlow.start(actor, 'spirit'));
        case 'decompile':        return this.#refreshAfter(sr4.DismissalFlow.start(actor, 'sprite'));
        case 'bind':             return this.#refreshAfter(sr4.BindingFlow.startTargeted(actor, id));
        case 'matrixAttack':     return this.#refreshAfter(sr4.CybercombatFlow.start(actor));
        case 'jackOut':          return this.#refreshAfter(sr4.CybercombatFlow.jackOut(actor));
        case 'unlink':           return this.#unlink(id);
      }
    }

    #updateHud() { game.tokenActionHud?.update?.(); }

    /** Waits for an action that changes actor or world state, then redraws the HUD. */
    async #refreshAfter(pending) {
      await pending;
      this.#updateHud();
    }

    // -----------------------------------------------------------------------
    // Skills / Weapons / Spells
    // -----------------------------------------------------------------------

    async #rollAutosoft(actor, autosoftId) {
      const autosoft = actor.items.get(autosoftId);
      if (!autosoft) return;
      this.#dialog.openActionDialog(
        actor,
        `${loc('sr4.vehicle.autonomous')}: ${autosoft.name}`,
        autosoftPool(actor, autosoft).total
      );
    }

    async #rollSkill(actor, skillId) {
      const skill = actor.items.get(skillId);
      if (skill) this.#dialog.handleSkillRoll(actor, skill.name);
    }

    /** Shift+Click on a weapon: ranged with an ammo store reloads, everything else rolls. */
    async #weaponReloadShortcut(actor, weaponId) {
      const weapon = actor.items.get(weaponId);
      if (!weapon) return;

      if (weapon.type === 'Ranged Weapon' && weapon.system.maxAmmo > 0) {
        return this.#refreshAfter(game.sr4.reloadWeapon(actor, weaponId));
      }
      return this.#rollWeapon(actor, weaponId);
    }

    async #rollWeapon(actor, weaponId) {
      const weapon = actor.items.get(weaponId);
      if (!weapon) return;

      if (actor.type === 'vehicle' && game.sr4.rigging?.openDroneAttackDialog) {
        return game.sr4.rigging.openDroneAttackDialog(actor, weapon);
      }

      const skill = actor.findByAttackSkill(weapon.system.attackSkill);
      if (!skill) return ui.notifications?.warn(fmt('sr4.hud.weapons.noAttackSkill', { name: weapon.name }));

      await this.#dialog.handleAttackRoll(actor, skill.name, weapon);
    }

    async #setRealm(actor, realm) {
      const combatant = findActiveCombatant(actor, this.token);

      if (combatant) {
        await combatant.setFlag('shadowrun4e', 'realm', realm);
        if (combatant.initiative !== null) {
          await combatant.combat.rollInitiative([combatant.id]);
        }
      } else {
        await actor.update({ 'system.realm': realm });
      }

      this.#updateHud();
    }

    async #castSpell(actor, spellId) {
      const spell = actor.items.get(spellId);
      if (!spell) return;
      await game.sr4.SpellcastingFlow.start(actor, spell);
    }

    // -----------------------------------------------------------------------
    // Attribute / Edge / Soak / Test rolls
    // -----------------------------------------------------------------------

    async #rollAttribute(actor, attribute) {
      const value = Math.max(actor.getAttribute(attribute) - 1, 1);
      this.#dialog.openActionDialog(actor, loc(`sr4.stats.${attribute}`), value);
    }

    async #rollEdge(actor) {
      this.#dialog.openActionDialog(actor, loc('sr4.hud.edge.double'), doubleEdgePool(actor));
    }

    async #rollSoak(actor, mode) {
      const soak = SOAK_MODES.find(s => s.mode === mode);
      if (!soak) return;
      this.#dialog.openActionDialog(actor, loc(soak.label), soakPools(actor).pools[mode]);
    }

    async #rollAttrTest(actor, key) {
      const test = ATTRIBUTE_TESTS.find(t => t.key === key);
      if (!test) return;
      this.#dialog.openActionDialog(actor, loc(`sr4.hud.tests.${key}`), attributeTestPool(actor, test).total);
    }

    // -----------------------------------------------------------------------
    // Monitor / Action
    // -----------------------------------------------------------------------

    async #dealDamage(actor, track) {
      const monitor = actor.system.conditionMonitor[track];
      if (!monitor) return;

      await foundry.applications.api.DialogV2.wait({
        window: {
          title: `${loc(`sr4.hud.monitor.${track}`)} — ${monitor.value}/${monitor.max}`,
        },
        content: `
          <div style="display:flex;flex-direction:column;gap:8px;padding:8px;">
            <label>${loc('sr4.hud.monitor.dealAmount')}</label>
            <input
              id="monitor-value"
              type="number"
              min="0"
              value="0"
              style="width:100%;"
            >
          </div>
        `,
        buttons: [
          {
            label: loc('sr4.hud.monitor.deal'),
            action: 'deal',
            callback: async (_event, button) => {
              const dmg = Math.max(parseInt(button.form.querySelector('#monitor-value').value) || 0, 0);
              await actor.dealMonitorDamage(track, dmg);
            },
          },
          {
            label: loc('sr4.hud.monitor.reset'),
            action: 'reset',
            callback: async () => actor.resetMonitor(track),
          },
        ],
      });
    }

    async #rollAction(actor, id) {
      const action = actor.items.get(id);
      if (!action) return;

      const numDice = (action.system.rating1 ?? 0) + (action.system.rating2 ?? 0);
      const category = action.system.category;

      if (actionCategories().includes(category) && this.#dialog.openMatrixActionDialog) {
        return this.#dialog.openMatrixActionDialog(actor, action.name, numDice, category);
      }
      this.#dialog.openActionDialog(actor, action.name, numDice);
    }

    // -----------------------------------------------------------------------
    // Edge management
    // -----------------------------------------------------------------------

    async #adjustEdge(actor, action) {
      const current = actor.getAttribute('CURRENTEDGE');
      const max     = actor.getAttribute('EDGE');
      let newValue;

      switch (action) {
        case 'add':
          if (current >= max) { ui.notifications?.warn(loc('sr4.hud.edge.maxreached')); return; }
          newValue = current + 1;
          break;
        case 'spend':
          if (current <= 0)  { ui.notifications?.warn(loc('sr4.hud.edge.nocurrent')); return; }
          newValue = current - 1;
          break;
        case 'reset':
          newValue = max;
          break;
        default:
          return;
      }

      await actor.update({ 'system.sheetStats.CURRENTEDGE': newValue });
    }

    // -----------------------------------------------------------------------
    // Items / Effects
    // -----------------------------------------------------------------------

    async #toggleItemEffect(actor, compoundId) {
      const [itemId, effectId] = compoundId.split(':');
      const effect = actor.items.get(itemId)?.effects.get(effectId);
      if (!effect) return;
      await this.#refreshAfter(effect.update({ disabled: !effect.disabled }));
    }

    async #openItemSheet(actor, id) {
      actor.items.get(id)?.sheet?.render(true);
    }

    async #toggleEquip(actor, itemId) {
      const item = actor.items.get(itemId);
      if (!item) return;
      await this.#refreshAfter(item.update({ 'system.equipped': !item.system.equipped }));
    }

    // -----------------------------------------------------------------------
    // Linked actors
    // -----------------------------------------------------------------------

    async #unlink(uuid) {
      const linked = await fromUuid(uuid);
      if (!linked) return ui.notifications?.warn(loc('sr4.ui.linkedActorNotFound'));
      if (await game.sr4.linkedActors?.confirmAndUnlink(linked)) this.#updateHud();
    }
  };
}

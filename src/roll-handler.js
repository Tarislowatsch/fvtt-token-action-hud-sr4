/**
 * @fileoverview Roll Handler — Token Action HUD SR4
 */

import { loc, collectArmor } from './system-manager.js';

export function createRollHandler(coreModule) {
  return class SR4RollHandler extends coreModule.api.RollHandler {
    #dialog = game.sr4.dialogUtility;

    async handleActionClick(event, encodedValue) {
      const [type, id] = encodedValue.split('|');
      const actor = this.actor;

      if (event.ctrlKey && type === 'effectToggle') return this.#deleteEffect(actor, id);

      switch (type) {
        case 'skill':          return this.#rollSkill(actor, id);
        case 'weapon':         return this.#rollWeapon(actor, id);
        case 'monitor-deal':   return this.#dealDamage(actor, id);
        case 'action':         return this.#rollAction(actor, id);
        case 'spell':          return this.#castSpell(actor, id);
        case 'edge':           return this.#adjustEdge(actor, id);
        case 'attribute':      return this.#rollAttribute(actor, id);
        case 'edgeRoll':       return this.#rollEdge(actor, id);
        case 'freeRoll':       return this.#dialog.handleFreeRoll();
        case 'soak':           return this.#rollSoak(actor, id);
        case 'autosoft':       return this.#rollAutosoft(actor, id);
        case 'effectToggle':      return this.#toggleEffect(actor, id);
        case 'effectTemplate':    return this.#applyTemplate(actor, id);
        case 'itemEffectToggle':  return this.#toggleItemEffect(actor, id);
        case 'itemSheet':         return this.#openItemSheet(actor, id);
        case 'equip':             return this.#toggleEquip(actor, id);
        case 'reload':            return this.#reloadWeapon(actor, id);
      }
    }

    // -----------------------------------------------------------------------
    // Skills / Weapons / Spells
    // -----------------------------------------------------------------------

    async #rollAutosoft(actor, autosoftId) {
      const autosoft = actor.items.get(autosoftId);
      if (!autosoft) return;
      const pilot = actor.system.pilot ?? 0;
      const rating = autosoft.system.rating ?? 0;
      this.#dialog.openActionDialog(
        actor,
        `${loc('sr4.vehicle.autonomous')}: ${autosoft.name}`,
        pilot + rating
      );
    }

    async #rollSkill(actor, skillId) {
      const skill = actor.items.get(skillId);
      if (skill) this.#dialog.handleSkillRoll(actor, skill.name);
    }

    async #rollWeapon(actor, weaponId) {
      const weapon = actor.items.get(weaponId);
      if (!weapon) return;

      const skill = actor.findByAttackSkill(weapon.system.attackSkill);
      if (!skill) return ui.notifications?.warn(`No attack skill found for ${weapon.name}`);

      await this.#dialog.handleAttackRoll(actor, skill.name, weapon);
    }

    async #castSpell(actor, spellId) {
      const spell = actor.items.get(spellId);
      if (!spell) return;
      await game.sr4.SpellcastingFlow.start(actor, spell);
    }

    // -----------------------------------------------------------------------
    // Attribute / Edge rolls
    // -----------------------------------------------------------------------

    async #rollAttribute(actor, attribute) {
      const value = Math.max(actor.getAttribute(attribute) - 1, 1);
      this.#dialog.openActionDialog(actor, loc(`sr4.stats.${attribute}`), value);
    }

    async #rollEdge(actor, mode) {
      const edge = actor.getAttribute('EDGE');
      const dice  = mode === 'double' ? edge * 2 : edge;
      this.#dialog.openActionDialog(actor, loc('sr4.hud.edge.double'), dice);
    }

    // -----------------------------------------------------------------------
    // Soak
    // -----------------------------------------------------------------------

    async #rollSoak(actor, mode) {
      const body = actor.getAttribute('BODY');
      const will = actor.getAttribute('WILLPOWER');

      const { ballistic, impact } = collectArmor(actor);

      const config = {
        'willpower':      { label: 'sr4.hud.soak.willpower',     dice: will },
        'body':           { label: 'sr4.hud.soak.body',          dice: body },
        'body-impact':    { label: 'sr4.hud.soak.bodyImpact',    dice: body + impact },
        'body-ballistic': { label: 'sr4.hud.soak.bodyBallistic', dice: body + ballistic },
      }[mode];

      if (!config) return;
      this.#dialog.openActionDialog(actor, loc(config.label), config.dice);
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
    // Effects
    // -----------------------------------------------------------------------

    #updateHud() { game.tokenActionHud?.update?.(); }

    async #toggleEffect(actor, id) {
      await actor.toggleEffect(id);
      this.#updateHud();
    }

    async #deleteEffect(actor, id) {
      await actor.effects.get(id)?.delete();
      this.#updateHud();
    }

    async #applyTemplate(actor, id) {
      await actor.applyEffectTemplate(id);
      this.#updateHud();
    }

    async #toggleItemEffect(actor, compoundId) {
      const [itemId, effectId] = compoundId.split(':');
      const item = actor.items.get(itemId);
      const effect = item?.effects.get(effectId);
      if (!effect) return;
      await effect.update({ disabled: !effect.disabled });
      this.#updateHud();
    }

    async #openItemSheet(actor, id) {
      actor.items.get(id)?.sheet?.render(true);
    }

    async #toggleEquip(actor, itemId) {
      const item = actor.items.get(itemId);
      if (!item) return;
      await item.update({ 'system.equipped': !item.system.equipped });
      this.#updateHud();
    }

    async #reloadWeapon(actor, weaponId) {
      await game.sr4.reloadWeapon(actor, weaponId);
      this.#updateHud();
    }
  };
}

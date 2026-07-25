# Token Action HUD – Shadowrun 4e

A [Token Action HUD Core](https://github.com/Larkinabout/fvtt-token-action-hud-core) integration for the [**Shadowrun 4th Edition**](https://github.com/Tarislowatsch/Shadowrun4-FoundryVTT) system on Foundry VTT.

---

## Features

The HUD is organised into tabs, each of which can be reordered or hidden through the Token Action HUD Core settings.

- **Basics** – Improvised skill rolls, Initiative Mode switching, Edge rolls and Edge management (add, spend, reset, with guards against over- and under-spending), Soak tests (Willpower, Body, Body + Impact/Ballistic armour), the standard two-attribute tests (Composure, Judge Intentions, Memory, Lift/Carry), vehicle Control Mode, Drone Actions, and a Free Roll dialog for a manual dice pool
- **Active Skills** – grouped by category (Combat, Physical, Social, Technical, Matrix, Magic, Vehicle, Resonance, Misc), sorted alphabetically, with attribute, rating, and specialisation shown in tooltips
- **Knowledge Skills** – grouped by category (Academic, Street, Language, Hobby, Misc)
- **Weapons** – Ranged and Melee weapons with damage and AP in tooltips; resolves the correct attack skill automatically. Ctrl+Click toggles equip, Shift+Click reloads
- **Magic** – spells grouped by category (Combat, Detection, Health, Illusion, Geomancy) with type, range, duration, drain value, element, and area info, plus Spell Actions, Spell Effects, and Summoning (summon spirit or watcher, banish, bind)
- **Matrix** – Cybercombat (Matrix Attack, Jack Out), programs with their actions and effects, Matrix Actions, and Resonance actions (compile, register, and decompile sprites, thread complex forms)
- **Condition Monitor** – inline Physical / Stun track display with a dialog to deal or reset damage
- **Actions** – custom Action items with their dice pool pre-calculated from `rating1 + rating2`, additionally grouped into Matrix and Rigging categories
- **Powers** and **Implants** – each with their own list, actions, and effects
- **Effects** – Quick Effect templates to apply, and Active Effects with remaining duration; click to toggle, Ctrl+Click to remove

---

## Requirements

| Dependency | Minimum version |
|---|---|
| Foundry VTT | 14 |
| Shadowrun 4e system (`shadowrun4e`) | 1.23.0 |
| Token Action HUD Core | 2.0.0 |

---

## Installation

1. Open Foundry VTT and go to **Add-on Modules → Install Module**.
2. Paste the manifest URL into the search field and click **Install**:
   ```
   https://github.com/Tarislowatsch/fvtt-token-action-hud-sr4/releases/latest/download/module.json
   ```
3. Enable the module in your world (**Game Settings → Manage Modules**).
4. Token Action HUD Core must also be enabled.

---

## Usage

Select or target a token in your scene. The HUD bar will appear with tabs for each category above. Click any action to trigger the corresponding roll or dialog. All groups can be reordered or hidden through the Token Action HUD Core settings.

---

## Languages

| Code | Language |
|---|---|
| `en` | English |
| `de` | Deutsch |

Contributions for additional languages are welcome – add a file under `lang/` and register it in `module.json`.

---

## Development

```bash
# Install dependencies
npm install

# Watch and rebuild on change
npm run watch

# Run the test suite
npm test

# Regenerate the Requirements table from module.json
npm run sync-readme
```

The entry point is `src/system-manager.js`. The module registers itself via the `tokenActionHudCoreApiReady` hook and exposes `SR4SystemManager` through the module API. The HUD layout is declared once in `registerDefaults()`; the flat group registry required by the HUD core is derived from it.

The Requirements table above is generated from `module.json` — edit the versions there, not in this file. CI keeps the two in sync automatically.

---

## Contributing

Pull requests and issues are welcome. Please open an issue first for larger changes so the approach can be discussed.

---

## License

[MIT](LICENSE)

## Disclaimer

Shadowrun is a registered trademark of The Topps Company, Inc. This module is an unofficial fan project and is not affiliated with, endorsed by, or connected to Topps or Catalyst Game Labs in any way.
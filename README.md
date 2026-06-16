# Token Action HUD – Shadowrun 4e

A [Token Action HUD Core](https://github.com/Larkinabout/fvtt-token-action-hud-core) integration for the [**Shadowrun 4th Edition**](https://github.com/Tarislowatsch/Shadowrun4-FoundryVTT) system on Foundry VTT.

---

## Features

- **Active Skills** – grouped by category (Combat, Physical, Social, Technical, Matrix, Magic, Vehicle, Resonance, Misc), sorted alphabetically, with attribute, rating, and specialisation shown in tooltips
- **Knowledge Skills** – grouped by category (Academic, Street, Language, Hobby, Misc)
- **Weapons** – Ranged and Melee weapons with damage and AP in tooltips; resolves the correct attack skill automatically
- **Spells** – only visible when the actor has a Magic rating; grouped by category (Combat, Detection, Health, Illusion, Geomancy) with type, range, duration, drain value, element, and area info
- **Condition Monitor** – inline Physical / Stun track display with a dialog to set or reset the current damage value
- **Actions** – custom Action items with their dice pool pre-calculated from `rating1 + rating2`
- **Edge** – add, spend, or reset Edge with current/maximum display and guard against over- or under-spending
- **Free Roll** – quick-access custom dice-pool dialog

---

## Requirements

| Dependency | Minimum version |
|---|---|
| Foundry VTT | 14 |
| Shadowrun 4e system (`shadowrun4e`) | 1.0.0 |
| Token Action HUD Core | 2.0.0 |

---

## Installation

1. Open Foundry VTT and go to **Add-on Modules → Install Module**.
2. Paste the manifest URL into the search field and click **Install**:
   ```
   https://raw.githubusercontent.com/Tarislowatsch/fvtt-token-action-hud-sr4/main/module.json
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
```

The entry point is `token-action-hud-sr4.js`. The module registers itself via the `tokenActionHudCoreApiReady` hook and exposes `SR4SystemManager` through the module API.

---

## Contributing

Pull requests and issues are welcome. Please open an issue first for larger changes so the approach can be discussed.

---

## License

[MIT](LICENSE)

## Disclaimer

Shadowrun is a registered trademark of The Topps Company, Inc. This module is an unofficial fan project and is not affiliated with, endorsed by, or connected to Topps or Catalyst Game Labs in any way.
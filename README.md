# SWADE Character Manager

A guided character creation and advancement tool for [SWADE](https://foundryvtt.com/packages/swade) in Foundry VTT. It follows the official character creation sequence from the rulebook, works on both blank and existing actors, and stays the single tool across a character's whole lifecycle — creation, editing, and post-creation Advances — in one interface.

> **Beta release.** This module ships with the known limitations listed below. See before reporting issues.

## AI Disclosure

Claude Code was used during this module's development, alongside human coding, design, review, and testing. All behavior described in this README has been manually verified in a live Foundry instance.

## Features

- **Full creation flow, in rulebook order:** Concept → Ancestry → Hindrances → Traits (Attributes + Skills) → Edges → Summary → Advancement → Manage Gear.
- **Works on any actor, any time.** Every tab prepopulates from the actor's current state, so the same tool handles a brand-new character and a long-running one.
- **Bring your own content.** No bundled compendium data — Character Manager reads whichever ancestry/skill/edge/hindrance/gear compendiums you already have installed. A settings-menu picker ("Compendium Sources") lets the GM approve which installed compendiums feed each category.
- **Advancement tracking.** A dedicated Advancement tab tracks post-creation Advances against SWADE's real `system.advances` schema and feeds the resulting budget back into the Attributes/Skills/Edges/Hindrances tabs.
- **Starting funds and gear management.** A Starting Equipment / Gear Management mode split handles starting-funds reconciliation without double-counting or clobbering currency the actor already has from other sources. Currency only ever changes on Save if you explicitly opt in, with a live preview of the exact effect beforehand.
- **Never destroys homebrew.** Saving only ever patches an item already on the actor in place — it never deletes and recreates it. Customize freely; Character Manager won't quietly "fix" it.
- **Warn, don't block.** Over-budget points, unmet edge prerequisites, under-minimum-Strength gear, and unspent creation points are shown with warning styling but never block Save.

## Installation

Install via the Foundry package browser, or manually with this manifest URL:

```
https://github.com/astra64/swade-character-manager/releases/latest/download/module.json
```

Requires the [SWADE system](https://foundryvtt.com/packages/swade) for Foundry VTT v14. No dependency on any other module.

## Usage

Open Character Manager from the new button in an actor sheet's header. Work through the tabs in order for a new character, or jump to any tab to edit an existing one. Use the Advancement tab to log Advances as the character levels up — the budget it grants flows automatically into the other tabs.

## Settings

- **Compendium Sources** (settings menu): choose which installed Item compendiums feed each category. Defaults to SWADE Core Rules' own packs; resettable at any time.
- Several world settings let you adapt the tool to a homebrew setting without code changes: which ancestral abilities grant a bonus Edge point or a player-chosen bonus, starting-funds multipliers for Rich-type Edges, and curated skill icons.

## Known Limitations (Beta)

This release ships with the following documented gaps:

- **Arcane Background Powers:** SWADE's Arcane Background edges (Magic, Miracles, Psionics, Weird Science, Super Powers, etc.) grant Power Points and let a player pick starting Powers, but the Edges tab currently has no UI to choose or display Powers. A character with an Arcane Background edge won't have their Powers tracked here yet. They will need to be managed manually on the character sheet.
- **d12+ traits:** SWADE raises a trait past d12 with a flat modifier (d12+1, d12+2, ...) rather than a new die type. The Traits and Advancement tabs only model d4–d12 die steps, so a character advanced past d12 can't have that modifier captured in the tool.

Both are on the roadmap; see `DEVELOPMENT.md` for status.

## Support

Found a bug, or hit something not listed above? Please open an issue on this repository with your Foundry/system/module versions and steps to reproduce.

## License

[MIT](LICENSE)

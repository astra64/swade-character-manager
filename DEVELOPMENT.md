# SWADE Character Manager - Development and Roadmap

This file tracks current architecture, implemented behavior, release readiness checks, and near-term roadmap.

Extracted from the `swade-fantasy-world-kit` hub module in v0.9.0 (2026-10-05) — see that module's CHANGELOG for the extraction's own history. This module has no dependency on that hub or on World Setup Tools; it stands alone.

---

## Current Architecture

- `scripts/main.js`
  - Runtime orchestrator: `init`/`ready` hooks, Handlebars helpers and template partial registration, actor-sheet header button injection via a `MutationObserver`, `window.CharacterManager` exposure.
- `scripts/index.js`
  - `setupCharacterCreationTools()` (settings registration), `CharacterManager`/`invalidateCompendiumCache` exports.
- `scripts/CharacterManager.js`
  - Main FormApplication; tab orchestration and Save. `migrateLegacyActorFlags()` copies an actor's flags from the old `swade-fantasy-world-kit` namespace to this module's own namespace once, on first open.
- `scripts/handlers/*TabHandler.js`
  - One handler per tab (Concept, Ancestry, Hindrances, Traits, Edges, Gear, Advancement), extending `BaseTabHandler.js`.
- `scripts/components/`
  - `SearchableDropdown.js`, `DragDropManager.js`, `TabManager.js` — reusable UI building blocks.
- `scripts/lib/compendium-utils.js`
  - Compendium sourcing: one flat setting (`compendiumPacks`, a JSON array of approved pack IDs) rather than a setting per category — a pack isn't assigned to a category by the GM; `getPackIdsForCategory()` finds which approved packs have a given category's item type(s) by scanning their own content. An empty approved list scans every installed Item compendium instead. Defaults to SWADE Core Rules' own packs (`CORE_RULES_DEFAULT_PACK_IDS`); no *setting-specific* (e.g. Fantasy) default is ever baked in. No dependency on any other module's curated-visibility settings.
- `scripts/CompendiumPackSelector.js`
  - Checkbox picker FormApplication (settings menu: "Compendium Sources") listing every installed Item compendium with a "Used For" badge per category it currently feeds, search, and a "Reset to Core Rules Defaults" action. Writes the approved list; no pack IDs to look up or type.
- `scripts/lib/calculator.js`
  - Budget/points calculations shared across tabs. Pure functions, covered by `tests/calculator.test.js`.
- `scripts/constants.js`
  - Tab guidance text, budgets, skill mappings, compendium IDs.
- `templates/`
  - `character-manager.hbs` plus `_components/*.hbs` partials (one per tab), registered in `scripts/main.js`'s `registerTemplatePartials()`.
- `styles/character-manager.css`
  - Character Manager-specific styling.
- `source/macros/CHARACTER_MANAGER_MACRO.js`
  - Standalone console/hotbar macro to open Character Manager for the selected/assigned actor.

---

## Settings Inventory

Registered by `setupCharacterCreationTools()` in `scripts/index.js`:

- `bonusEdgePointAbilityNames` — comma-separated ancestral ability names (e.g. "Adaptable") that grant a free Edge point, matched by name so it works with any compendium/setting
- `ancestryChoiceAbilityNames` — comma-separated ancestral ability names (e.g. "Half-Elves-Heritage") offering a player-chosen bonus on the Ancestry tab
- `useCuratedSkillIcons`
- `richFundsMultipliers` — comma-separated "Edge Name:multiplier" pairs for starting-gear funds
- `compendiumPacks` — hidden (`config: false`), a JSON array of GM-approved compendium pack IDs. Edited only via the `compendiumPackSelectorMenu` menu below, never typed directly. Defaults to SWADE Core Rules' own packs; an empty array auto-detects from every installed compendium instead. No category assignment happens here — see `compendium-utils.js`.
- `compendiumPackSelectorMenu` — settings menu opening `CompendiumPackSelector`.

---

## Validation Checklist

Run this after significant code changes and before release. Verified in a live Foundry v14 instance 2026-10-05 (full pass, including items 1-8 below).

1. Module loads in Foundry v14 with no init/ready errors, independent of whether `swade-fantasy-world-kit`/World Setup Tools are installed.
2. Character Manager opens from the sheet header button on a fresh actor and on one with existing items.
3. Each tab (Concept, Ancestry, Hindrances, Traits, Edges, Gear, Summary, Advancement) loads without console errors and reflects the actor's current state.
4. Save persists a change made on each tab, reopening Character Manager shows it, and unrelated items/customizations on the actor are untouched.
5. Unspent Attribute/Skill/Edge points trigger the Save confirmation dialog.
6. Gear tab mode toggle (Starting Equipment vs. Gear Management) and the currency/encumbrance footer behave correctly in both modes.
7. Compendium Sources picker opens, saves, and "Reset to Core Rules Defaults" works.
8. An actor with pre-extraction data (flags under the old `swade-fantasy-world-kit` namespace) migrates correctly on first open (see `migrateLegacyActorFlags()`).

The above is the full checklist — see [docs/DESIGN_NOTES.md](docs/DESIGN_NOTES.md) for the design rationale behind the Gear tab's currency modes, the Advancement tab's data model, and the customization-safe-save behavior it all depends on.

---

## Roadmap

### Known Limitations (Public Release)

Documented gaps the first public release ships without, so public users hit a known, documented limitation rather than a silent bug. Listed here (not Descoped) because there's still a reason to revisit them.

- **d12+ traits:** SWADE raises a trait past d12 with a flat modifier (d12+1, d12+2, ...) instead of a new die type. The Traits tab and Advancement only model d4–d12 die steps and have no way to represent the modifier — a character who advances past d12 can't have that captured in the tool. Decided 2026-10-04: descoped from the first public release; the user doesn't personally need it and would rather ship than block on it. Revisit if/when it becomes a real blocker for a GM using the public module, or state it plainly as a known limitation in the public README.
- **Powers granted by Arcane Background edges:** SWADE's Arcane Background edges (Magic, Miracles, Psionics, Weird Science, Super Powers, etc.) grant Power Points and let the player pick a number of starting Powers, but the Edges tab has no UI to choose or display Powers at all — noticed 2026-10-05 during post-extraction testing. Decided 2026-10-05: the public release ships as a **Beta** with this documented as a known limitation (same treatment as d12+ traits) rather than blocking release on it. Revisit as a near-term post-Beta priority, since a GM running any magic/powers-using setting will hit this immediately.

### Near-Term

1. ~~Write the public README.~~ Done — see `README.md`.
2. Create the GitHub repo and push (local-only so far, per project decision — prepare locally first).
3. Submit to the Foundry package registry (as a Beta release, per the known-limitations list above).
4. Post-Beta: close the Arcane Background Powers gap.

### Parked

- **ApplicationV2 migration** (deferred to the v16 era): `CharacterManager` still uses V1 `FormApplication`. Decided 2026-10-04 to ship the public extraction on V1 rather than migrate all 9 tabs first; deprecation warnings are tolerable until v16 approaches. See the hub module's [docs/APPLICATIONV2_MIGRATION.md](../swade-fantasy-world-kit/docs/APPLICATIONV2_MIGRATION.md) (a general reference, not hub-specific).

---

## Notes for Contributors

- Prefer small, behavior-preserving edits.
- Keep public settings keys stable unless migration is included.
- Validate in Foundry after refactors even when static diagnostics are clean.
- When proposing features or refactors, critically question: what problem does this solve? Can users achieve the same goal another way with less complexity? Be willing to suggest simplifications or deprioritizations if the underlying need is unclear.

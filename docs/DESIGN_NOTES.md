# Character Manager - Design Notes

Preserved design rationale for decisions that aren't obvious from the code alone. Condensed from the original v0.6.0 implementation roadmap doc, which also contained a large amount of now-fully-resolved milestone/testing checklists (all tabs shipped and tested as of v0.7.1) — that noise was dropped; this file keeps only the "why does it work this way" reasoning that's still accurate and useful for future maintenance.

---

## Overview

Character Manager is a unified character creation and advancement tool for SWADE in Foundry VTT. Unlike an earlier tab-based creator, it follows the official character creation sequence from the rulebook and supports mid-campaign editing/advancement in the same interface (similar to Pathbuilder for PF2e).

**Key distinction:** Character Manager always opens from an actor sheet and works whether that actor is blank or already has data. Creation and editing were originally planned as two phases (MVP first, then a later pass to detect/prepopulate from an existing actor), but that split didn't hold up in practice — prepopulation for each field was built as part of building that field's tab, not deferred to a separate pass. Every tab prepopulates from an existing actor. Advancement (post-creation XP spend) is mechanically distinct work, not just "the same detection logic applied later" — see "Advancement is a tab, not a separate tool" below.

## Architecture

- **Tab Handlers** (`handlers/*TabHandler.js`): each tab has a dedicated handler managing its specific logic (event binding, data updates, validation).
- **Reusable Components** (`components/SearchableDropdown.js`, `DragDropManager.js`, `TabManager.js`): common UI patterns extracted for reuse across tabs.
- **Constants** (`constants.js`): centralized configuration (tab guidance, budgets, mappings).
- **Calculator Utilities** (`lib/calculator.js`): pure functions for rule calculations without UI dependencies, covered by `tests/calculator.test.js`.
- **Text Enrichment:** ancestry and item descriptions use Foundry's `TextEditor.enrichHTML()` to process embedded content links (`@UUID[...]`), converting them to clickable links.

## Design Specifications

### Tab Order (Official SWADE Rules Flow)

1. **Concept** — Archetype + Concept text fields
2. **Ancestry** — Single select (auto-applies bonuses)
3. **Hindrances** — Up to 4 points with trade-off dropdowns (Major/Minor labeled)
4. **Attributes** (part of the merged **Traits** tab) — 5 points to distribute (ancestry bonuses lock minimums)
5. **Skills** (also part of **Traits**) — 12 points + bonuses from hindrances
6. **Edges** — Select from available (spends edge points from hindrances)
7. **Summary** — Final review with Pace, Parry, Toughness calculations; has a "Manage Gear" shortcut button
8. **Advancement** — Post-creation Advance tracking; feeds bonus budget into Attributes/Skills/Edges/Hindrances tabs. Always visible, including on a blank/not-yet-saved actor — no gating on character completeness.
9. **Manage Gear** (renamed from "Gear", moved to the very end) — Drag-drop items from compendiums, real starting-funds formula. Deliberately positioned/named last to signal "later-stage/distinct concern" while keeping its own tab-bar button (an earlier attempt hid it from nav entirely via `TabManager`'s `data-hide-from-nav`, reverted in favor of reordering+renaming instead; the mechanism is still there, unused, for a future tab that wants that treatment).

### Budget Tracking (Sticky Footer)

- **Always visible:** Attribute Points (X/5), Skill Points (Y/12), Edge Points (Z/?)
- **Perk Points:** shown once a character has any hindrance-granted perk points (hidden entirely at zero), reading `perkPointsSpent/availablePerkPoints`; highlights red for *either* over-allocation or leftover unspent points, since leftover is the more common mistake for this pool
- **Gear tab only:** its own tab-scoped pinned footer, a countdown (`remaining / budget`) rather than a spent-so-far total
- **Over-budget behavior:** always allowed, red highlighting only — never blocked ("warn, don't restrict" philosophy, used throughout)

### Key Interactions

- **Hindrance trade-offs:** dropdown per point → auto-undoes previous selection; the placeholder "-- Select Perk --" option is itself selectable, clearing that slot back to unassigned
- **Ancestry bonuses:** auto-applied, locked minimums (e.g., d6 Vigor minimum), message at top of the Traits tab
- **Edge prerequisites:** info-only (no blocking), displayed next to edge name
- **Validation:** warning dialog on Save if unspent points or an unassigned bonus-choice dropdown is detected — never blocks the save, just confirms

---

## Currency Reconciliation, Advancement as a Tab, and Customization-Safe Saves

Three interlinked design decisions, each converged on after an earlier approach didn't hold up. Recorded so the reasoning survives.

### Currency reconciliation

Gear tab spending should leave leftover starting funds on the actor as cash, without overwriting money the actor already has from other sources (loot, GM adjustments, prior play) — and without double-crediting a truly-fresh actor's SWADE-seeded starting currency on re-save.

**Resolved via a Starting Equipment / Gear Management mode split** (`gearTabMode` actor flag, auto-defaulted by whether the actor looks fresh or established):
- **Starting Equipment mode** (`_reconcileStartingFunds()`): sets `actor.currency = startingFunds − gearCost` directly. This is what actually fixes the fresh-actor double-counting — a direct set replaces the SWADE-seeded default instead of adding a delta on top of it.
- **Gear Management mode** (`_reconcileGearManagementFunds()`): debits/credits only the *change* in gear cost since the session opened (`character.gearCostAtOpen`), same mental model as a shopping trip. No floor at 0 — an overspend just goes negative, per the "warn, don't block" philosophy.

An equality check (`currency + gearValue == startingFunds`) to gate which mode is available was considered and rejected — `currentCurrency` doesn't change during live editing, so the sum has no principled reason to equal `startingFunds` outside coincidence, and legitimate mid-creation states would false-negative it.

**Currency only ever changes on Save if the Gear tab's "Apply to currency on Save" checkbox is explicitly checked** (unchecked by default every session), with a live preview next to it always showing the exact effect before opting in. This is stronger than an earlier confirmation-dialog approach it replaced: there's no automatic currency-changing default at all, so every change is a deliberate, visible choice.

`startingFunds = (pcStartingCurrency × richMultiplier) + extraFundsBonus`, where `richMultiplier` comes from the `richFundsMultipliers` world setting (name→multiplier, default `"Rich:3,Filthy Rich:5"`, matched the same way as `bonusEdgePointAbilityNames`) and `extraFundsBonus` is `(Extra Funds perk allocations) × (pcStartingCurrency × 2)`. **There is no general "everyone gets doubled starting funds" rule** — only a matched Rich-type edge or an Extra Funds perk allocation multiply it. A manual "override starting funds" input (`gearFundsOverride` actor flag) is the escape hatch for anything the formula doesn't cover.

Currency UI is entirely hidden when `wealthType !== 'currency'` (SWADE's Wealth Die / no-currency settings) — Character Manager still tracks gear selection/quantity/weight for those tables, just not against a numeric budget.

### Advancement is a tab, not a separate tool

Character Manager stays the single tool across a character's whole lifecycle — creation, editing, *and* advancement — via an Advancement tab, not a standalone app (an earlier, now-deleted `AdvancementManager.js` skeleton used a schema that doesn't match real SWADE data and was superseded rather than extended).

**Real SWADE schema** (confirmed from `systems/swade/swade.js`): no XP field at all. SWADE tracks a raw advance count (`system.advances.value`), with `.rank` auto-derived (Novice 0-3, Seasoned 4-7, Veteran 8-11, Heroic 12-15, Legendary 16+) and a `.list[]` array of advance entries (`type` via the `ADVANCE_TYPE` enum, `notes`, `sort`, `planned`). Critically, native SWADE only records the *category* and a freeform note — not which specific skill/edge/attribute was bought.

Two designs were weighed: a self-contained tab with its own pickers and a per-advance target/ledger, vs. tracking only category *counts* that feed as additive budget into the existing Edges/Traits/Hindrances tabs (reusing their pickers entirely). **The counts-only approach won** — within a category, advances are fungible (an Edge-advance is an Edge-advance regardless of which one), so there's nothing for a per-advance ledger to protect that a count doesn't already cover. This also means **no new actor flag/ledger was needed at all** — the Advancement tab reads/writes `actor.system.advances.list[]` directly as its sole store.

### Customization-safe saves are the permanent default

A GM/player may tweak or homebrew a custom item at any point. Whether that survives a Save was never really about timing — it's about whether the *default* Save action is destructive at all.

**First pass** built full customization detection (`isGearItemCustomized()`, comparing an actor's embedded item against a fresh compendium fetch, with a "Customized" badge) to decide whether to wipe-and-recreate or preserve an item on save. **Dropped the same session** once it became clear the wipe-and-recreate branch it was protecting against only existed to let *unmodified* items auto-pick-up later compendium edits (a price tweak, a typo fix) — not an actual goal here.

**Current model:** `_saveGearToActor()` (and the equivalent Skills/Edges/Hindrances save methods) never delete-and-recreate an item already on the actor — they only ever patch owned fields in place (`quantity` for gear, die/advances for skills, major/minor for hindrances) via `updateEmbeddedDocuments`. New selections are created fresh; an explicit Remove deletes. This gets the same "never destroys homebrew" guarantee with no compendium-source fetch on open and no customization bookkeeping.

**Known trade-off, worth remembering:** this also loses the self-healing property wipe-and-recreate had for free — a bad field value from a past bug, or a missing/wrong `compendiumUuid` flag, now persists forever instead of auto-correcting on next save. Recovery requires a manual Remove-and-re-Add of that specific item. Accepted as low-stakes relative to the complexity avoided.

**Real data-loss bug this surfaced and fixed:** gear detection was originally keying by a shared *compendium* uuid instead of the actor's own *item* uuid, so any item that matched a compendium entry by name was deleted and recreated (and two same-named items collapsed into one) on every save. The same identity fix was applied to Edges/Hindrances/Skills detection and their "already selected" checks.

---

## No Build-Blocking Validation, Anywhere

A running theme across every tab: over-budget states, unmet edge prerequisites, under-minimum-Strength gear, and unspent creation points are all **informational only** — shown with red/warning styling, never blocking Save. The one exception is a confirmation dialog (not a hard block) when unspent Attribute/Skill/Edge/Perk points or an unassigned ancestry bonus-choice are detected at Save time, which can still be dismissed and saved anyway. This consistency is deliberate, not an oversight per tab — a GM running a homebrew or story-exception character shouldn't have the tool fight them.

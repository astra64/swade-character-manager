# Character Manager v0.6.0 Implementation Roadmap

**Status:** Character Creation & Editing In Progress | All 9 tabs implemented (Concept, Ancestry, Hindrances, Traits, Edges, Gear, Summary, Advancement) — Gear, Summary, and Advancement not yet tested in-Foundry (implemented but unverified)

## Overview

Character Manager v0.6.0 is a unified character creation and advancement tool for SWADE (Savage Worlds Adventure Edition) in Foundry VTT v14. Unlike the previous tab-based creator, this version follows the official character creation sequence from the rulebook and supports mid-campaign editing/advancement in a single interface (similar to Pathbuilder for PF2e).

**Key Distinction:** Character Manager always opens from an actor sheet and works whether that actor is blank or already has data. Creation and editing were originally planned as two phases (MVP first, then a later pass to detect/prepopulate from an existing actor), but that split didn't hold up in practice: prepopulation for each field was built as part of building that field's tab, not deferred to a separate pass afterward. Every tab now prepopulates from an existing actor (Concept, Ancestry, Attributes, Skills, Edges, Hindrances). The only piece still genuinely deferred is **Save** (writing changes back to the actor), which is scoped to the Summary tab regardless of phase — see Known Blockers and Milestone 6 below. Advancement (post-creation XP spend) remains a distinct second phase, since it's mechanically different work, not just "the same detection logic applied later."

---

## Architecture & Implementation Notes

### Component-Based Design
To maintain scalability as more tabs are added, the Character Manager uses a modular architecture:

- **Tab Handlers** (`handlers/AncestryTabHandler.js`, `handlers/ConceptTabHandler.js`): Each tab has a dedicated handler managing its specific logic (event binding, data updates, validation)
- **Reusable Components** (`components/SearchableDropdown.js`, `DragDropManager.js`, `TabManager.js`): Common UI patterns extracted for reuse across tabs
- **Collapsible Item Partial** (`_collapsible-item.hbs`): Template partial for displaying expandable items (ancestry, abilities, hindrances) consistently
- **Constants** (`constants.js`): Centralized configuration (tab guidance, budgets, mappings, compendium pack IDs)
- **Calculator Utilities** (`lib/calculator.js`): Pure functions for rule calculations without UI dependencies

**Benefit:** Adding a new tab (e.g., Hindrances) only requires:
1. Create `HindrancesTabHandler.js`
2. Create tab partial `_hindrances.hbs` (or reuse collapsible items)
3. Add handler to `CharacterManager.js` tab handlers list
4. Update template to reference new tab

### Text Enrichment
Ancestry and item descriptions use Foundry's `TextEditor.enrichHTML()` to process embedded content links (`@UUID[...]` syntax), converting them to clickable links that open items in new windows.

---

### Phase 1: Character Creation & Editing
Opens from actor sheet; works identically whether the actor is blank (creation) or already has data (editing). `getData()` reads Name, Archetype, Concept (`system.details.notes`), Ancestry, Attributes, Skills, Edges, Hindrances, Gear, and Advances off an existing actor on open — Skills/Edges/Hindrances are detected from `actor.itemTypes.skill/edge/hindrance` (embedded Items, matched to compendium entries by name), not from `actor.system.skills/edges/hindrances` (a schema SWADE doesn't actually use for these). **Save is real for every tab** (updated — this used to describe a scaffold-only Save deferred to the Summary tab; that landed long ago): `_saveActor()` in `CharacterManager.js` calls `_saveSkillsToActor()`/`_saveEdgesToActor()`/`_saveHindrancesToActor()`/`_saveGearToActor()`, each reconciling real embedded Items (patch in place, create new, delete removed), plus `_advancesToUpdateData()` writing `system.advances.list` directly. See Milestone 5 for what's still genuinely open (testing).

### Phase 2: Character Advances & Planning
Shipped as Tab 9 (Advancement) inside Character Manager rather than a separate tool or phase — see "Problem 2: Advancement as a Tab" and "Tab 8: Advancement" below for the full design and implementation.

---

## Design Specifications

### Tab Order (Official SWADE Rules Flow)
1. **Concept** — Archetype + Concept text fields
2. **Ancestry** — Single select (auto-applies bonuses)
3. **Hindrances** — Up to 4 points with trade-off dropdowns (Major/Minor labeled)
4. **Attributes** — 5 points to distribute (ancestry bonuses lock minimums)
5. **Skills** — 12 points + bonuses from hindrances
6. **Edges** — Select from available (spends edge points from hindrances)
7. **Summary** — Final review with Pace, Parry, Toughness calculations; also has a "Manage Gear" shortcut button that jumps straight to the Manage Gear tab. When the Gear tab is in Starting Equipment mode (i.e. this looks like a new character), a small hint above the button reads "Don't forget to select your starting gear."
8. **Advancement** — Post-creation Advance tracking; feeds bonus budget into Attributes/Skills/Edges/Hindrances tabs (see Problem 2 below). Always visible, including on a blank/not-yet-saved actor — no gating on character completeness.
9. **Manage Gear** (renamed from "Gear") — Drag-drop items from compendiums, real starting-funds formula (not a hardcoded 300). **Revised 2026-08-10 (moved twice, settled at the very end):** first tried removing it from the tab bar entirely (reachable only via the Summary shortcut, using `data-hide-from-nav` in `TabManager._createTabNavigation()`); reverted in favor of reordering instead; landed on moving it after both Summary and Advancement (last tab overall) and renaming "Gear" → "Manage Gear" (the h3 text `TabManager` reads for the auto-generated nav button label) — still has its own tab-bar button, signaling "later-stage/distinct concern" via position and name rather than hiding it. `TabManager`'s `data-hide-from-nav` mechanism is still there, just unused, in case a future tab wants that treatment.

### Budget Tracking (Sticky Footer)
- **Always Visible:** Attribute Points (X/5), Skill Points (Y/12), Edge Points (Z/?)
- **Perk Points:** shown in the same always-visible footer once a character has any hindrance-granted perk points (hidden entirely at zero), reading `perkPointsSpent/availablePerkPoints`; unlike the other three counters, it highlights red for *either* over-allocation or leftover unspent perk points, since the latter is the more common mistake for this pool
- **Gear Tab Only:** Total Cost (X/300 silver)
- **Summary Tab Only:** Gear Cost + final derived stats
- **Over-Budget Behavior:** Allowed with red highlighting, never blocked

### Data Storage
- Store raw selections (Ancestry, Hindrances, trait choices)
- Actor sheet derives calculated values automatically
- Primary save: Update actor data directly
- Secondary: JSON export/import (if practical)

### Key Interactions
- **Hindrances Trade-Offs:** Dropdown per point → auto-undoes previous selection; the placeholder "-- Select Perk --" option is itself selectable, so re-picking it clears that slot back to unassigned
- **Ancestry Bonuses:** Auto-applied, locked minimums (e.g., d6 Vigor minimum), message at top of Attributes tab
- **Skill Modifiers:** Display as "+X modifier" text at end of skill rows (from edges/hindrances)
- **Edge Prerequisites:** Info-only (no blocking), displayed next to edge name
- **Gear:** Drag-drop from compendiums, individual costs shown, duplicates allowed
- **Validation:** Warning popup on save if invalid states detected (over-budget, missing mandatory fields, etc.)

---

## Implementation Milestones

**Note:** Milestones 1-6 all build **Phase 1** (Character Creation & Editing) — prepopulation/detection (originally planned as a separate later pass in Milestone 6) shipped incrementally as each tab was built instead, so Milestone 6's only genuinely open items are change-detection highlighting and mid-edit validation. **Phase 2** (Advances) is no longer TBD — it shipped as Tab 9 (Advancement) rather than a separate phase; see "Problem 2: Advancement as a Tab" and "Tab 8: Advancement" below.

---

### Milestone 1: Foundation & Data Layer
**Applies to:** Phase 1 (Character Creation & Editing)

**Status: Done — superseded by the incremental Milestone 3 approach.** This milestone was drafted as an upfront foundation pass before any tab existed. That's not how the build actually happened: calculator.js/compendium-utils.js functions, and the character data structure, were each added incrementally as the tab that needed them was built (see Milestone 3's per-tab checklists, all checked off). Every item originally listed here now exists in `lib/calculator.js` and `lib/compendium-utils.js` — trade-off math, edge point calculation, gear cost tracking, derived stats, Major/Minor hindrance data, prerequisite data, etc. Left unchecked for a long time purely because this section was never revisited after the approach changed, not because the work is outstanding.

---

### Milestone 2: UI Scaffold (Main App & Templates)
**Applies to:** Phase 1 (Character Creation & Editing)

**Status: Done — same as Milestone 1.** `CharacterManager.js`, `character-manager.hbs`, and `character-manager.css` all exist and are substantially larger/more capable than this original scaffold envisioned (9 tabs, not 8; real actor persistence; budget tracking with color-coded over/under states; guidance text on every tab). Built incrementally per-tab rather than as a single upfront scaffold — see Milestone 3.

---

### Milestone 3: Tab-by-Tab Implementation (All 8 Tabs)
**Applies to:** Phase 1 (Character Creation & Editing)

#### Tab 1: Concept
- [x] Archetype text input (freeform)
- [x] Concept textarea (freeform)
- [x] Auto-save on change
- [x] **New Player Guidance:**

#### Tab 2: Ancestry
- [x] Single select dropdown from compendiums
- [x] Display ancestry bonuses (ancestral abilities) as collapsible items
- [x] Collapsible display of selected ancestry with description
- [x] Edit button to open ancestry item from source
- [x] Show "Ancestral Abilities" section with granted items
- [x] Each ability shows as collapsible item with image and description
- [x] On selection: Auto-apply bonuses to Attributes tab
- [x] Show message: "Ancestry bonuses applied: ..."
- [x] **New Player Guidance:**
  > "Pick your character's ancestry (like Human, Dwarf, Elf). Each ancestry gives you starting bonuses to skills and stats. The bonuses automatically apply to later tabs—don't worry about adding them yourself."
- [x] **Validation:** Inform only if not selected
- [x] Ancestry-granted attribute die is a free floor, not counted against the player's 5 attribute points (not yet tested in-Foundry)
- [x] Ability Bonus Choice: for ancestral abilities with no mechanical effects of their own (e.g. Half-Elf's Heritage), a dropdown lets the player pick a bonus (Edge/Attribute/Skill point) — only shown for abilities matching the `ancestryChoiceAbilityNames` world setting (default: "Half-Elves-Heritage") (not yet tested in-Foundry)
- [x] Manual Adjustments: collapsible section with +/- steppers and a note per budget (Attribute/Skill/Edge/Hindrance-Perk), for setting rules this tool has no built-in support for; non-zero adjustments show on the Summary tab (not yet tested in-Foundry)

#### Tab 3: Hindrances
- [x] List of hindrances from compendium (Major/Minor labeled)
- [x] Multi-select checkboxes (up to 4 points)
- [x] For each hindrance: Dropdown for trade-off
  - Options: Raise Attribute (2 pts), Edge (2 pts), Skill Point (1 pt), Extra Funds (1 pt)
  - Major hindrances can show 2 dropdowns if using 1-point trade-offs
- [x] Points tracking: Show X/4 total
- [x] On dropdown change: Auto-undo previous, recalculate budgets
- [x] **New Player Guidance:**
  > "Hindrances are flaws or quirks that give you bonus points. Major hindrances are worth 2 points, minor ones worth 1. Pick up to 4 points' worth. For each, choose what bonus you want: a +2 to an attribute, a free edge, extra skill point, or extra money. First-timers should pick 2–3 hindrances to keep things simple."
- [x] **Validation:** None

**Estimated Lines:** 200-300 (template + handler)

#### Tab 4: Attributes & Skills

**Layout:** Single unified view grouping skills under their linked attributes (Agility, Smarts, Spirit, Strength, Vigor).

- [x] Investigate adding trait info - either in collapsable or hover text

**Attributes Section:**
- [x] For each attribute: Die button group [d4 d6 d8 d10 d12] with active state
- [x] Show ancestry bonus message if applied (e.g., "Vigor +1 from ancestry")
- [x] Lock minimums if ancestry bonus present (e.g., d6 Vigor locked to d6+)

**Skills Section (grouped under each attribute):**
- [x] Each skill: Name, die selector, cost/point display
- [x] Core skills (Athletics, Common Knowledge, Notice, Persuasion, Stealth): marked with star icon, free at d4
- [x] Non-core skills cost points to use

**Real-time Tracking:**
- [x] Integrate with pinned footer showing: Attributes: X/5 and Skills: Y/12
- [x] Warn if either exceeds budget

**New Player Guidance:**
- **For Attributes:** "You have 5 points to boost your core abilities. Start with d6 in each (your base), then pick which ones matter most to your character. A strong warrior bumps Strength and Vigor; a sneaky rogue boosts Agility and Smarts. Moving a die up one step (d6→d8) costs 1 point. Raising from d12 costs 2 points but has a limit—ask your GM if unsure."
- **For Skills:** "Pick what your character is good at. You have 12 points to spend. Core skills (marked FREE) start at d4—you just pay to boost them higher. Other skills cost points to use. Each die step up (d4→d6) costs 1 point. Pro tip: Pick 3–4 skills your character uses often; leave the rest. Your ancestry and edges might add free bonuses here too."

**Validation:**
- [x] Warn if over 5 attribute points
- [x] Warn if over 12 skill points (excluding hindrance bonuses)
- [x] Lock changes if ancestry bonus locked a minimum

**Estimated Lines:** 350-500 (template + handler)

#### Tab 5: Edges
- [x] Edge cards from compendium (search dropdown + drag-drop, same pattern as Hindrances)
- [x] Multi-select (spends edge points from hindrance perk allocations)
- [x] Show prerequisite info (non-blocking, info-only) — pulled from SWADE's `system.requirements` via each requirement's built-in `toString()`
- [ ] Show edge cost if available (deferred — edges don't have a "cost" field in this ruleset; only prerequisites)
- [x] Real-time edge point tracking: X/Y in footer and above the selected-edges list
- [x] **New Player Guidance:** (uses existing `TAB_GUIDANCE.edges` text)
- [x] **Validation:** Non-blocking warning toast if adding an edge exceeds available edge points; footer turns red when over budget
- [x] **Ancestry-granted bonus edges** (e.g., Human's "Adaptable"): `calculateAncestryBonusEdgePoints()` scans the selected ancestry's granted child items and adds 1 edge point per match against the `bonusEdgePointAbilityNames` world setting (default: "Adaptable"), matched as a whole word/segment so it works regardless of item naming convention (e.g. `"Humans-Adaptable"`) — deliberately name-based, not a compendium-specific Active Effect tag, so any installed setting's Human-equivalent ancestry is covered without per-compendium edits
- [x] **Granted child items display:** Edges (and Hindrances) that themselves grant further edges/hindrances (e.g. Arcane Background) show a collapsible "Granted by X" section, same pattern as Ancestry's ancestral abilities

**Estimated Lines:** 150-200 (template + handler)

#### Tab 6: Gear
- [x] Drag-drop zone for items from compendiums (gear, weapons, armor & shields — same search dropdown + drag-drop pattern as Edges/Hindrances)
- [x] List items with individual cost, quantity (+/- controls), running total — duplicates allowed by design (picking the same item again just bumps quantity instead of adding a second card). **Bug fixed 2026-08-10:** the duplicate check originally compared internal IDs, which differ between a compendium entry and an already-saved actor item for the same conceptual item — so re-adding something you already owned (the common "reopen an established character, buy one more") silently created a second, separate item instead of bumping quantity. Now matches by name via `resolveGearFields()`'s shared entry-building path and a name-based lookup in `GearTabHandler`, regardless of which internal ID space either side is keyed under.
- [x] Show remaining budget, displayed in the sticky footer while on the Gear tab. Budget is **not** the original spec's hardcoded 300 — it reads SWADE's native `pcStartingCurrency` world setting, so it tracks whatever a GM has that set to for their table. Now computed via `calculateStartingFunds()` — `(pcStartingCurrency × richMultiplier) + extraFundsBonus`, or the GM's manual override — rather than an unconditional `× 2`. See "Planned: Currency Reconciliation..." below.
- [x] Customization-safe saves: an item already on the actor is never deleted/recreated on save, only its quantity is patched in place — homebrew tweaks always survive, at the cost of not auto-syncing later compendium edits (deliberate simplification, see "Gear Tab — Final Behavior Contract" below). Currency changes on save now go through `_reconcileStartingFunds()`/`_reconcileGearManagementFunds()` (mode-dependent, see the mode-split note above), not a flag-tracked delta.
- [x] Remove item button
- [x] **New Player Guidance:** (uses existing `TAB_GUIDANCE.gear` text)
- [x] **Validation:** Non-blocking; footer budget value turns red when over budget (no hard block, consistent with Edges/Hindrances)
- [x] **Min-Strength warning:** items with a `system.minStr` value (weapons and armor) show an inline "Requires Strength dX to use without penalty" hint, in `warning-text` red when the character's current Strength die is below it, plus a toast on add. Informational only — SWADE's actual penalty is a -1 die step on the relevant roll, not "can't use," so this never blocks adding the item.
- [x] Save button now appears on every tab, not just Gear/Summary — see "Save button & unspent-points confirmation" below.
- [x] **Starting Equipment / Gear Management mode toggle:** a compact toggle inline in the tab's guidance box switches the pinned footer between the creation-time shopping budget (remaining/total funds, override) and a plain current-currency readout, so an established character's Gear tab doesn't keep showing a stale "starting funds" budget. Defaults to Starting Equipment for a fresh actor, Gear Management for one with existing advances or gear; remembered per-actor via a `gearTabMode` flag once explicitly set. Currency itself only ever changes via the separate "Apply to currency on Save" checkbox below — see "Final safety mechanism" under Problem 1 above.
- [x] **Encumbrance tracking:** pinned footer always shows Carried/Max weight (independent of the currency setting), turning red when over. Carried weight sums each gear item's `weight × quantity`; max carry capacity mirrors SWADE's own `Actor.calcMaxCarryCapacity()` formula (`(Strength die sides / 2 - 1) × 20 lbs` or `× 10 kg`, stepped by the actor's live `encumbranceSteps` from Active Effects like Packrat or racial size) via `calculateMaxCarryCapacity()` in `calculator.js`. Approximations, both accepted: (1) this tool doesn't track a die modifier for attributes past d12, so a Strength advanced beyond d12 is simply capped there rather than modeling SWADE's above-d12 modifier rule; (2) SWADE's own `calcInventoryWeight()` also counts Consumable-type items and excludes anything `equipStatus === STORED` — this tool tracks neither (no Consumable support, no equip-status concept), so Carried can drift from what the actor's real sheet shows.
- [x] **Known trade-off (2026-08-10 review):** detecting gear from an existing actor prefers a name-matched compendium entry's price/weight/armor/minStr over the actor's own stored value — previously only skewed a display number, now also feeds `character.gearCostAtOpen`, the baseline Gear Management mode's currency math is computed against. A GM-customized price on a name-matching item (discounted/marked-up homebrew) can throw off that calculation. Accepted, consistent with this tab's other "compendium is a suggestion, not tracked per-instance" simplifications — see `resolveGearFields()` in `calculator.js`.

**Estimated Lines:** 150-200 (template + handler)

#### Tab 7: Summary
- [x] Display all character selections in a compact, read-only recap — deliberately terse (one row per category: Name/Archetype, Ancestry, Attributes, Skills, Hindrances, Edges, then a single "Derived Stats" row for Pace/Parry/Toughness together), not a full re-render of every tab's item cards. No Gear row (dropped per review — gear is already tracked live on its own tab's pinned footer). No per-section "Edit" buttons and no dedicated tab handler — the tab has nothing interactive on it, so there's nothing for a handler to wire up (Tab nav switching works regardless, since `TabManager` auto-generates nav buttons from `.tab` elements, not from a handler registration).
- [x] **Unassigned ancestry-bonus warning:** the Ancestry row appends an inline `(N bonus(es) unassigned)` count, styled with the same `under-budget` warning class as the other rows' counts, whenever an ancestral ability offering a bonus-choice dropdown (see `ancestryChoiceAbilityNames`) hasn't had a choice made yet. Hidden entirely when there's nothing unassigned.
- [x] Calculate:
  - Final Pace (base 6 + modifications from hindrances/ancestry/edges — `calculatePaceModifier()` scans `system.pace` Active Effect changes across the selected ancestry, its granted child items, and every selected edge/hindrance's full item document, same scanning pattern as `getAncestryAttributeBonuses()`)
  - Parry (2 + Fighting/2) — unchanged, already existed
  - Toughness (2 + Vigor/2 + Armor bonus) — armor bonus is new: `getGearItems()`/gear detection/`_addGear` now carry each item's `system.armor` value, summed across `character.gear` (a simplification — no per-location/highest-only logic, since Gear tab doesn't track equipped state). Still computed even without a Gear row shown, since it feeds Toughness.
- [x] **New Player Guidance:** (uses existing `TAB_GUIDANCE.summary` text)
- [x] **Validation:** No separate warning box — each row's point count (Attributes/Skills/Hindrances/Edges) is color-coded inline instead: subtle yellow if under the max (still has points left to spend), red if over. Missing Name/Ancestry show as an italicized placeholder ("Unnamed" / "None selected") rather than a warning message. Purely informational, same as every other tab — Save is never blocked by any of this.

**Not implemented:** change-detection highlighting (which fields were modified since open) — out of scope for this pass, not part of the original Tab 7 spec.

**Estimated Lines:** 100-150 (template) — actual: ~70 lines template, no handler needed

**Estimated Lines:** 100-150 (template + handler)

#### Tab 8: Advancement

**Status: Implemented, not yet tested in-Foundry.** See "Problem 2: Advancement as a Tab" below for the full design discussion and rationale — this checklist was the concrete build spec, now built (`AdvancementTabHandler.js`, `advancement-tab.hbs`, calculator.js additions). `AdvancementManager.js` (the old skeletal standalone app) has been deleted along with its dead references in `main.js`/`index.js`.

- [x] **Data model — no separate ledger.** Reads and writes `actor.system.advances.list[]` directly; no new actor flag. Each row maps 1:1 onto SWADE's real schema (`id`, `type`, `notes`, `rank`, `sort`) using the system's own `ADVANCE_TYPE` enum (`EDGE:0, SINGLE_SKILL:1, TWO_SKILLS:2, ATTRIBUTE:3, HINDRANCE:4`). No target/provenance field — matches native SWADE, where the advance choice and the specific thing it bought are tracked separately (the `notes` field is the same freeform reminder text the vanilla actor sheet already relies on).
- [x] **Add/remove list UI** — same pattern as Edges/Hindrances/Gear's "selected items" lists: a type dropdown (Edge / Two Skills / One Skill / Attribute / Hindrance Buyoff — five distinct entries, kept separate even though Two Skills and One Skill currently resolve to the same point value, to mirror the rules as written) + a freeform notes text input, add/remove buttons. No target picker — the player spends the resulting budget on the existing Edges/Traits/Hindrances tabs, same as they already do for creation points.
- [x] **Prepopulation** — on open, read existing `actor.system.advances.list[]` rows into the tab (same "every tab prepopulates" pattern the rest of Character Manager follows) so advances added via the vanilla SWADE sheet before Character Manager ever touched the actor still show up correctly.
- [x] **Rank display** — read-only, auto-derived from 1-based position in the list via `getRankIndexFromAdvanceNumber()` (Novice = advances 1-3 only, then Seasoned/Veteran/Heroic/Legendary 4 apiece — confirmed against SWADE's own `getRankFromAdvance()`, not a naive uniform-4 split). Not user-editable; also written back into each row's `rank` field on save.
- [x] **Planned toggle** — mirrors SWADE's own Advances tab "Planned" checkbox: a per-row toggle marks an advance as recorded-but-not-yet-taken. Planned rows still display (dimmed) and still group by Rank tier same as taken ones (matching SWADE's own per-row Rank label, which doesn't filter by planned either), but are excluded from every budget/Rank-count function (`calculateAdvanceTypeCounts`, `calculateTotalAdvanceCount`) until unchecked — same `activeAdvances = list.filter(a => !a.planned)` exclusion SWADE itself uses for `advances.value`/`.rank`.
- [x] **Budget integration** — additive terms threaded into `CharacterManager.getData()` alongside the existing ancestry/hindrance-derived bonuses (`calculator.js:357-361` today):
  - Edge → +1 `edgePointsAvailable`
  - Two Skills → +2 `skillPointsMax`
  - One Skill → +2 `skillPointsMax`
  - Attribute → +1 `attributePointsMax`
  - Hindrance Buyoff → +1 available perk-point slot, capped at 4 total (compensates for the fact that removing a hindrance elsewhere reduces the tab's live-derived perk-point count; the combined hindrance + bonus total is still capped at 4 overall, so this only restores a point lost to a buyoff rather than granting extra beyond the normal cap)
- [x] **Attribute once-per-Rank check** — a dedicated warning message (not folded into the generic over-budget red styling, since new players benefit from seeing the actual rule named): compare Attribute-advance count taken against Ranks reached, and surface something like "You've taken 2 Attribute advances but have only reached Rank 1 (Veteran) — Attributes can only be raised once per Rank." Informational only, never blocks Save, consistent with the rest of the tool.
- [x] **No enforcement elsewhere** — spending the resulting budget in Traits/Edges/Hindrances uses those tabs' existing pickers and existing "warn, don't block" over-budget styling unchanged. Removing an advance row just lowers the relevant max; if the player already spent past the new lower max, that tab goes red exactly like any other over-budget state today — no unwind/reversal logic needed.
- [x] **Full edit/remove of past advances** — since there's no ledger, editing means changing a row's type/notes and removing means deleting the row; both are trivial list operations already used throughout the tool (each just changes what feeds a downstream budget number, and any resulting overspend surfaces the normal way).
- [x] **New Player Guidance:** explain what an Advance is (something a GM typically awards at the end of a session, roughly every other session) and that picking a type here unlocks the actual choice on the relevant tab (raising a skill/attribute, taking an edge, or freeing up a perk point after buying off a hindrance).
- [x] **Validation:** none blocking, per the tool's established philosophy — only the Attribute once-per-Rank message above.

**Estimated Lines:** 200-300 (template + handler + calculator additions)

**Total Milestone 3:** ~1800-2200 lines of code

---

### Milestone 4: Integration & Polish
**Applies to:** Phase 1 (Character Creation & Editing)

- [x] **main.js Integration**
  - [x] Import CharacterManager
  - [x] Register any new Handlebars helpers needed
  - [x] Add a button to open Character Manager from the actor sheet — `injectCharacterManagerButton()` in `main.js`, added to the sheet header rather than a settings-menu entry (a more discoverable equivalent to the originally-planned "menu item")
  - [x] Expose window.CharacterManager for console access
- [x] ~~**Macro Creation**~~ — Cut. The actor-sheet header button already covers the main access path; a hotbar macro would only be a minor convenience, not worth building.
- [x] **CSS Refinement** — `character-manager.css` has gone through many polish passes across every tab (colors, spacing, typography, budget color-coding). Responsive/mobile behavior and tab transition animations were never a focus — Foundry app windows aren't typically resized to mobile widths, so this was deprioritized rather than deferred by oversight.
- [ ] **Documentation**
  - [ ] `CHARACTER_MANAGER_QUICKSTART.md` — never written.
  - [x] In-app tooltips — attribute/skill hover descriptions and one-line attribute tips exist (`ATTRIBUTE_DESCRIPTIONS`/`ATTRIBUTE_TIPS` in `constants.js`), plus a guidance box on every tab.

---

### Milestone 5: Testing & QA
**Applies to:** Phase 1 (Character Creation & Editing)

- [ ] **Functional Testing**
  - [ ] Tab navigation works
  - [ ] Data persists across tab switches
  - [ ] Budget calculations accurate
  - [ ] Over-budget warnings display correctly
  - [ ] Ancestry bonuses applied correctly
  - [ ] Hindrance trade-offs work
  - [ ] Gear drag-drop functional
  - [ ] Save to blank actor works
  - [ ] No prepopulation issues (starting fresh)

- [ ] **Rules Compliance Testing**
  - [ ] Attribute point budgets enforced (5 max)
  - [ ] Skill point budgets enforced (12 + hindrances)
  - [ ] Edge point budgets enforced
  - [ ] Gear budget enforced (real `calculateStartingFunds()` formula, not a hardcoded amount)
  - [ ] Derived stats calculate correctly
  - [ ] Skill costs follow rules (1pt up to attribute, 2pts above)

- [ ] **Edge Case Testing**
  - [ ] Ancestry bonuses with multiple attributes
  - [x] Human ancestry with bonus edges (name-matched via `bonusEdgePointAbilityNames`, tested with "Humans-Adaptable")
  - [ ] Configure bonus edge string in settings
  - [ ] Over-spec'd characters (handled gracefully)
  - [ ] Empty character state
  - [ ] Multiple saves (no data loss)

---

### Milestone 6: Full Editing & Prepopulation
**Applies to:** Phase 1 (Character Creation & Editing)

- [ ] **CharacterManager.js Updates**
  - [x] `getData()` detects and prepopulates Name, Archetype, Concept, Ancestry, and Attributes from an existing actor
  - [x] Detection extended to Skills, Edges, Hindrances via `_detectSkillsFromActor()` / `_detectEdgesFromActor()` / `_detectHindrancesFromActor()` — read from `actor.itemTypes.skill/edge/hindrance` (embedded Items), matched to compendium entries by name (no `compendiumUuid` flag exists yet for these three since real save hasn't landed — see Note below)
  - [x] ~~Add change detection: Highlight which fields have been modified since open~~ — Cut, not worth the complexity for this tool's scope.
  - [ ] Add validation for mid-edit states (e.g., character with advances)

- [x] **Data Detection Logic**
  - [x] Ancestry detection from actor items
  - [x] Hindrances/edges detection from actor Items (`actor.itemTypes.hindrance` / `actor.itemTypes.edge`)
  - [x] Attribute values extraction from actor system data
  - [x] Skill values extraction from actor Items (`actor.itemTypes.skill`)
  - [x] Gear detection from actor inventory (`_detectGearFromActor()` — reads `gear`/`weapon`/`armor`/`shield` type Items, matched to the gear/weapons/armor compendiums by name, same fallback pattern as Edges/Hindrances)

**Note (updated — the note below was stale):** Save is real for every tab now, not just Gear. `_saveSkillsToActor()`, `_saveEdgesToActor()`, and `_saveHindrancesToActor()` all reconcile actual embedded Items on the actor (patched in place for existing items, created fresh for new selections, deleted on explicit removal) — the "still writes raw `system.skills`/`system.edges`/`system.hindrances`" gap this note used to describe was closed in the same pass that fixed a real data-loss bug in Gear's own save (see "Suggested implementation order" step 4 below). The only genuinely open item left in this milestone is mid-edit validation, listed above — change-detection highlighting was cut.

**Estimated Scope:** 200-300 lines (detection + prepopulation logic)

---

## Known Blockers & Dependencies

### Critical
- **Ancestry Data:** Requires metadata for:
  - Attribute bonuses (e.g., "d6 Vigor instead of d4") — done, read from Active Effect `changes` on the ancestry/child items
  - Edge bonuses (e.g., "Humans get 1 bonus edge") — done, via name-matching against the `bonusEdgePointAbilityNames` setting rather than metadata (see Tab 5: Edges above)
  - Skill bonuses (if any)
  - Pace modifications (if any)
- **Hindrance Data:** Requires Major/Minor type flags
- **Edge Data:** Requires prerequisite metadata
- **Gear Data:** Requires cost field

### Nice-to-Have (Deferred to v0.6.3+)
- Hardcoded skill→attribute mapping → Read from item metadata
- Edge prerequisite enforcement → Nice UI warnings already planned
- Ancestry-specific attribute caps (e.g., "d12+1 Vigor") → Basic support via metadata
- Skill grouping optimization → Start flat, optimize if testing shows need

---

## Planned: Currency Reconciliation, Advancement as a Tab, and Customization-Safe Saves

**Status: Problems 1 and 3 implemented for the Gear tab (this session); Problem 2 (Advancement as a Tab) still design-only.** Converged on across a design discussion after the Gear tab landed. Recorded here so the reasoning survives past the chat that produced it. **Revised once already** — an earlier draft of this section scoped Character Manager to pre-advancement only and pushed advancement into a separate `AdvancementManager` tool; that was corrected (see Problem 2 below) once it turned out to conflict with wanting to rebuild a character at any point in its lifecycle.

**Implemented (Problem 1 — currency):** `calculateStartingFunds()`/`calculateRichFundsMultiplier()`/`calculateExtraFundsBonusCount()`/`parseRichFundsMultipliers()` in `calculator.js`; new `richFundsMultipliers` world setting (default `"Rich:3,Filthy Rich:5"`); Gear tab's `gearBudget` now uses this formula instead of the old unconditional `pcStartingCurrency × 2`. A new "Override Starting Funds" input on the Gear tab persists as the `gearFundsOverride` actor flag via `CharacterManager._persistGearFundsOverride()`. The `characterCreatorMenu` no-actor entry point and the `!this.actor` branch in `_createActor()` were left as-is — still an open decision, noted below.

**Revised again (2026-08-10) — Starting Equipment / Gear Management mode split:** the original single reconciliation scheme (`_reconcileGearFunds()`, a flag-tracked additive delta via `gearFundsCredited`) is gone. It's replaced by two mode-specific methods matched to the Gear tab's `gearTabMode` toggle (see "Starting Equipment / Gear Management mode toggle" under Tab 6 above):
- **Starting Equipment mode** — `_reconcileStartingFunds()`: `actor.currency = startingFunds − gearCost`, a direct set, not a delta credit. This actually fixes the "fresh actor double-counted" discrepancy noted below (now resolved, not just accepted) — a truly-fresh actor's SWADE-seeded `pcStartingCurrency` gets replaced by the correct leftover instead of having a delta added on top of it.
- **Gear Management mode** — `_reconcileGearManagementFunds()`: debits/credits only the *change* in gear cost since the session opened (`character.gearCostAtOpen`, a snapshot of `calculateGearCost()` taken right after actor detection), same mental model as a shopping trip — buy something, pay for it; return something, get refunded. Gear the actor already owned coming in is never re-charged. No floor at 0; an overspend just goes negative, per this tool's "warn, don't block" philosophy.

An `currency + gearValue == startingFunds` equality check was considered as a way to gate which mode is even available, and rejected: `currentCurrency` doesn't change during live editing (only on Save), so the sum has no principled reason to equal `startingFunds` outside of coincidence, and legitimate mid-creation states (spent some silver already via other play, or picked a Rich edge partway through shopping) would false-negative it. A softer alternative — Starting mode's Save formula subtracting `gearCost` from `currentCurrency` instead of resetting to `startingFunds − gearCost` — was also considered and rejected: it would avoid overwriting an established character's wealth if the wrong mode were left on, but it silently breaks the Rich/Filthy-Rich-edge and Extra-Funds-perk bonus application for a genuinely fresh character, since those bonuses only ever get applied to currency via the reset formula (the SWADE-seeded `currentCurrency` has no idea about a Rich edge picked mid-creation).

**Final safety mechanism (superseding an earlier confirmation-dialog approach):** rather than warn on Save when Starting mode looks risky, currency simply **never** changes on Save unless the Gear tab's "Apply to currency on Save" checkbox is explicitly checked (unchecked by default every session). A live preview next to the checkbox always shows the exact effect before it's opted into — "sets currency to 300" in Starting mode, "charges 200 Silver" / "refunds 50 Silver" / "no change" in Gear Management mode — computed by `gearCurrencyPreviewText` in `getData()`. `_saveActor()` only calls `_reconcileStartingFunds()`/`_reconcileGearManagementFunds()` when `character.applyCurrencyOnSave` is true; otherwise Save proceeds normally (gear, attributes, everything else) with currency untouched. This is stronger than the confirmation dialog it replaced: instead of warning about a risky *default*, there is no automatic currency-changing default at all — every currency change is a deliberate, visible choice, so `_confirmStartingModeOnEstablishedActor()` (which used to gate this) was removed as no longer necessary.

**Restated once more at Save time, merged into the existing point-budget dialog:** `_confirmSaveEffects()` (replacing the separate `_confirmUnspentPoints()`, and a short-lived separate `_confirmCurrencyChange()`) shows a single dialog on every Save covering both concerns — the currency line always appears when `wealthType === 'currency'` ("Currency will be set to 300" / "charged 200 Silver" / "refunded 50 Silver" / "not change" — recomputed independently of the footer's live preview, explicit even when nothing will change), and the unspent-Attribute/Skill/Edge-points line appears only when there's something unspent, same condition as before. One combined dialog reads as "here's what Save is about to do," rather than two sequential gates stacked on top of each other. `defaultYes` is false whenever either line represents a real risk (unspent points, or a nonzero currency change), true otherwise.

**Wealth Die / no-currency tables (uncommon setting rule):** rather than building parallel logic for SWADE's `wealthType: wealthDie`/`none` setting rules, all currency-tracking UI is simply hidden when `wealthType !== 'currency'` (a `usesCurrency` flag from `getData()`): the Gear tab's per-item price line, the pinned budget footer (see below), and the Hindrances tab's "Extra Funds" perk option (shown disabled instead). Both `_reconcileStartingFunds()`/`_reconcileGearManagementFunds()` and `_persistGearFundsOverride()` no-op under this setting too. Tables using those setting rules handle starting funds/gear cost manually — Character Manager still tracks gear selection, quantity, and carried weight, just not against a numeric currency budget.

**Gear tab budget UI, moved and reworked after initial landing:** the budget display and override input started out in the *global* sticky footer and a labeled form field at the top of the tab, then moved to a **tab-scoped pinned footer** (`.gear-tab-pinned-footer`, sticky to the bottom of the Gear tab's own scroll area, not the app-wide footer) reading `Starting {currencyName}: {gearRemaining} / {gearBudget}` — a countdown (budget minus spend) rather than a spent-so-far total, so it reads the way a player actually tracks shopping money. The override input moved into that same footer behind a small "Override" checkbox (unchecked by default unless the actor already has a saved override) — checking it reveals a compact number input; unchecking clears the override and reverts to the formula. The now-redundant cost total was dropped from the "Selected Gear" section header, and the per-item price line was simplified to just `{price} {currencyName}` (quantity is already visible via the +/- controls, so "each × qty = total" was dropped too).

**Implemented, then simplified (Problem 3 — Gear saves):** the first pass built full customization detection (`isGearItemCustomized()` in `calculator.js`, comparing an actor's embedded item against a fresh compendium fetch, a `customized` flag + "Customized" badge). On review, the wipe-and-recreate branch it was protecting against only existed to let *unmodified* items pick up later compendium edits — not a goal here — so the whole detection layer was removed again the same session. **Current model:** `CharacterManager._saveGearToActor()` never deletes-and-recreates an item already on the actor; it only ever patches `quantity` in place (`updateEmbeddedDocuments`). New selections are created fresh from their source; anything no longer in `character.gear` (an explicit Remove) is deleted. This gets the same "never destroys homebrew" outcome with no compendium-source fetch on open and no customization bookkeeping at all — see the "known downsides" note below the Final Behavior Contract.

**Not implemented this session:** a customization check (or the same patch-in-place question) for Ancestry's save, real embedded-item saves for Edges/Hindrances, and folding `AdvancementManager.js` into a Character Manager tab (Problem 2) — see "Suggested implementation order" below for the remaining steps.

### Problem 1: Crediting leftover gear-shopping currency to the actor

Gear tab spending should leave any leftover starting funds on the actor as cash, without overwriting money the actor already has from other sources (loot, GM adjustments, prior play). A naive `actor.currency = startingFunds − gearCost` overwrites; a naive `actor.currency += (startingFunds − gearCost)` double-credits on every re-save.

**Original approach (superseded 2026-08-10):** track only what Character Manager itself had previously credited, via a small actor flag (`gearFundsCredited`), and write just the delta on each save (`delta = (startingFunds − gearCost) − previouslyCredited`). This worked for re-saving an unchanged character but, as the note below already flagged, double-counted a truly-fresh actor's SWADE-seeded starting currency. **Current approach:** see the "Starting Equipment / Gear Management mode split" note above — Starting Equipment mode now directly sets currency to the leftover instead of crediting a delta, which resolves the double-counting rather than just accepting it.

Only run this when SWADE's `settingRules.wealthType === 'currency'` — no-op for `wealthDie`/`none` modes, since there's no numeric field to credit.

**Character Manager does not create actors (corrected).** An earlier draft of this plan had Character Manager creating blank actors itself (a `!this.actor` branch in `_createActor()`), which turned out to be unneeded complexity for little benefit — Character Manager should always receive an actor to work on, matching its stated design ("always opens from an actor sheet"). This removes a whole parallel code path (most of the ancestry/gear/currency logic was duplicated across a "new actor" branch and an "existing actor" branch for no real gain). The one place that relied on the old behavior — the `characterCreatorMenu` settings-menu entry in `scripts/settings.js`, which instantiates `CharacterManager` with no actor — needs to either be removed, or changed to create a blank actor via a plain `Actor.create()` call first and open Character Manager pointed at the result. **Decide which when implementing.**

This also means there's no special "just-created-by-Character-Manager" moment to hook into for currency seeding — every actor Character Manager ever touches already exists. SWADE's own `_preCreate` hook still auto-sets a truly fresh actor's `system.details.currency` to `pcStartingCurrency` the instant it's created (via whatever normal Foundry flow made it), so a brand-new blank actor opened in Character Manager for the first time will show that amount already sitting there before any Gear tab shopping happens. **Resolved (2026-08-10), not just accepted:** rather than build a heuristic to detect "is this actor's current currency actually the still-untouched SWADE default, or genuine established wealth" (still not reliably distinguishable in general, and rejected again when reconsidered as an `currency + gearValue == startingFunds` equality gate — see above), the fix instead came from the mode split: Starting Equipment mode directly *sets* currency to the leftover rather than adding a delta on top of whatever's already there, so the SWADE-seeded default gets correctly replaced instead of double-counted. The manual **override starting funds** input remains as the escape hatch for anything the formula itself doesn't cover.

**`startingFunds` formula (corrected — no unconditional creation-doubling):**
```
richMultiplier  = matched from the new `richFundsMultipliers` setting (name→multiplier list,
                   default "Rich:3,Filthy Rich:5" — confirmed SWADE values, GM-editable), same name-matching
                   pattern as `bonusEdgePointAbilityNames`; 1 if no matching edge is selected
extraFundsBonus = (count of Hindrance perk-allocation slots with "Extra Funds" selected)
                   × (pcStartingCurrency × 2)
                   — per the actual rule text: "for 1 Hindrance point... gain additional
                   starting funds equal to twice your setting's starting amount"
computed        = (pcStartingCurrency × richMultiplier) + extraFundsBonus
```
There is **no general "everyone gets double starting funds for creation shopping" rule** — an earlier draft of this plan incorrectly assumed one (inherited from pre-existing code, `currencyAmount = pcStartingCurrency * 2`, which is used elsewhere in the codebase today as the Gear tab's displayed budget and will need correcting to this formula as part of implementing this plan). The only ×2 multipliers that exist are (a) `richMultiplier`, which only kicks in when a Rich/Filthy Rich-type edge is actually present, and (b) the Extra Funds hindrance bonus, which only applies per point actually allocated to it. With no Rich edge and no Extra Funds allocation, `startingFunds` is simply `pcStartingCurrency` — not doubled.

**Manual override:** the Gear tab also gets a direct "override starting funds" input — when set, this value is used as `startingFunds` instead of the formula above, for both the displayed budget and the currency-credit calculation. Persisted as its own actor flag (e.g. `gearFundsOverride`) so it survives reopening Character Manager, rather than being recomputed and silently discarded. This is the escape hatch for anything the formula doesn't cover (a one-off GM ruling, a homebrew Background Edge not in the `richFundsMultipliers` list, etc.) — consistent with the "warn, don't restrict" philosophy: the computed number is a helpful default, never the final word.

**New setting needed:** `richFundsMultipliers` (world setting, `scripts/settings.js`) — no setting needed for Extra Funds specifically, since that's fully defined in terms of the existing `pcStartingCurrency` setting.

### Problem 2: Advancement is a tab in Character Manager, not a separate tool

**Status: Design complete (this session) — see Tab 8: Advancement above for the concrete build spec.** Converged on across a follow-up design discussion, recorded here for the reasoning; the checklist above is the source of truth for implementation.

**Corrected direction:** Character Manager stays the single tool across a character's whole lifecycle — creation, editing, *and* advancement — via an Advancement tab (Tab 8/9, always visible, even on a blank actor), not a standalone `AdvancementManager` app. The standalone `AdvancementManager.js` file already in this repo (skeletal/non-functional — uses flat `system?.experience`/`system?.advances`, neither of which exist in the real schema) is superseded by this design rather than extended; it should be deleted once the new tab lands rather than folded forward.

**Real SWADE schema, confirmed from `systems/swade/swade.js`:** there is no XP field at all — SWADE tracks advancement as a raw count (`system.advances.value`), with `.rank` auto-derived (Novice 0-3, Seasoned 4-7, Veteran 8-11, Heroic 12-15, Legendary 16+) and a `.list[]` array of individual advance entries (`id`, `type` via the `ADVANCE_TYPE` enum — `EDGE:0, SINGLE_SKILL:1, TWO_SKILLS:2, ATTRIBUTE:3, HINDRANCE:4` — `notes`, `rank`, `sort`, `planned`). Critically, the *native* SWADE actor sheet only records the category and a freeform note — it does not track which specific skill/edge/attribute/hindrance an advance bought. Applying the actual mechanical effect is a separate manual step the player does elsewhere on the sheet.

**Two design options were weighed:**
1. A self-contained Advancement tab with its own pickers (duplicate the Edges/Traits/Hindrances tabs' picker UI inside Advancement, store a per-advance target).
2. Advancement tracks only *category counts*, which feed as additive budget into the existing Edges/Traits/Hindrances tabs — reusing their pickers entirely, no duplicate UI.

**(2) won**, once it became clear that within a category, advances are fungible — an Edge-advance is an Edge-advance regardless of which one — so there's nothing for a per-advance target/ledger to protect that a simple count doesn't already cover. This also means **no new actor flag or ledger is needed at all**: since native SWADE's own record is already just `type` + `notes` with no target field, Character Manager's Advancement tab can read and write `actor.system.advances.list[]` directly as its sole data store. Editing/removing an advance is then a trivial list operation (delete or change a row); any resulting overspend in the tab that received that budget surfaces via the same "warn, don't block" red-over-budget styling every other tab already uses — no reversal/unwind logic required.

`advances.value`/`.rank` matters for the tab's own Rank display (and the informational once-per-Rank Attribute check) but is not a gate on the rest of the tool — a GM/player can fully rebuild a character at any point in its life, advanced or not.

### Problem 3: Customization-safe saves are the permanent default — no separate "rebuild" action needed

**Update:** for the Gear tab specifically, this was implemented as designed below and then deliberately simplified back out — see the note after the Final Behavior Contract. The compare-against-source detection this section describes is still the plan for Ancestry/Edges/Hindrances *unless* the same question gets asked there too (do we actually want unmodified items to auto-pick-up later compendium edits?) — if not, the same patch-in-place simplification likely applies to those saves as well, and this section should be revisited before building them rather than assumed.

A GM/player may tweak or homebrew a custom Edge/Ancestry/Gear item at any point — during initial creation, or years into a campaign. Whether that customization should survive a save was never really about advancement timing; it's about whether the *default* Save action is destructive at all.

**Resolved approach:** for every item staying in a tab's current build (explicit removal via the tab's own Remove button, or swapping to a different Ancestry, still always deletes — that's the player's deliberate choice, not something this rule protects against):
- If it carries a `compendiumUuid` flag, fetch that source fresh and compare "customization-relevant" fields, excluding whatever Character Manager itself is expected to edit (e.g. gear `quantity`).
- **Identical to source** → safe to wipe-and-recreate as today (no data loss, recreating produces the same content).
- **Diverged, or no compendium match at all** → treat as customized. Skip delete+recreate for that item entirely; leave the actor's existing embedded document untouched, and only patch Character-Manager-owned fields (quantity, for gear) via a direct in-place update.

**No separate "Rebuild Character" action is needed on top of this** (an earlier draft of this section proposed one). Remove (which already always deletes, regardless of customization) plus unrestricted Add already give full manual control to reshape a character piece by piece — reverting a customized item is just Remove-then-Add-fresh-copy, a deliberate per-item choice rather than a bulk nuke-everything action, and arguably clearer for it. A story-granted "extra" edge/hindrance/gear item some character has for narrative reasons works the same way it already does for budgets generally: add it via the tab, the footer shows over-budget in red, nothing blocks it — informational only, same non-blocking philosophy already built into Edges/Hindrances/Gear.

Per-type comparison fields for the default-save customization check (draft, refine during implementation):
- **Gear/weapon/armor:** name, img, description, price, weight, minStr, effects
- **Edges:** name, img, description, requirements, effects
- **Hindrances:** name, img, description, major, severity, effects
- **Ancestry:** same idea, plus its granted child items

**Known trade-off:** if the compendium content itself is later patched (e.g. a typo fix), previously-identical actor copies will look "diverged" from the updated source on next open and stop auto-refreshing under default Save. Not data loss — just stops being treated as a vanilla copy; picking up the compendium change would need a manual Remove-and-re-Add of that specific item. Accepted as low-stakes.

**Implementation gotcha to get right:** the comparison must use each item's *raw* `system.description`, not the enriched HTML (`TextEditor.enrichHTML()` output) that `character.gear[uuid].description` holds for display — comparing enriched vs. raw would produce false "diverged" flags from formatting artifacts alone, not real customization. Keep the raw source description around specifically for this comparison, separate from the display copy. Active Effects don't have a clean equality check; comparing a normalized `JSON.stringify` of each effect's `changes` (plus count) is good enough — false positives here just mean an unmodified item stops auto-refreshing, which is low-cost by design (see the "warn, don't restrict" philosophy running through this whole plan), so the comparison should err toward "diverged" when uncertain rather than trying to be perfectly precise.

### Gear Tab — Final Behavior Contract

Precise Open/Edit/Save behavior, incorporating everything above. This is the concrete spec implementation follows (**as simplified** — no customization detection; see the note below).

**On Open** (`getData()` / detection):
1. Detect existing `gear`/`weapon`/`armor`/`shield` items on the actor → `character.gear`, keyed by name-match against the compendium or falling back to the item's own uuid (unchanged from before this plan).
2. Compute `startingFunds` (override flag if set, else the `calculateStartingFunds()` formula) and `gearCost` (Σ `price × quantity`). Display the budget non-blockingly (unchanged).

**On Edit** (within the tab, unchanged from today):
- Add (search or drag) → new entry.
- Remove → always allowed.
- Quantity +/− → unchanged.
- Min-Strength warning → unchanged (informational hint + toast).
- Override starting funds: a small checkbox in the pinned footer (`character.showGearFundsOverride`, UI-only, not persisted itself) reveals a compact number input when checked; the typed value is stored in `character.gearFundsOverride` for the session. Unchecking clears it back to `null`, reverting to the formula.

**On Save** (`_saveGearToActor()` + `_reconcileStartingFunds()`/`_reconcileGearManagementFunds()`):
1. For each entry in `character.gear`: if an embedded item with that uuid already exists on the actor, patch only its `quantity` field in place (`updateEmbeddedDocuments`) — never delete/recreate it. Otherwise, create a fresh copy from its source item with `quantity` set and the `compendiumUuid` flag.
2. Any gear-type item that was on the actor but is no longer in `character.gear` (explicitly removed via the tab) → deleted.
3. Compute `startingFunds` (override or formula) and `gearCost`; persist the `gearFundsOverride` flag if the GM set one this session (regardless of mode or the checkbox below). Currency itself only changes if `character.applyCurrencyOnSave` is checked: if `gearTabMode === 'starting'`, set currency to `startingFunds − gearCost` directly; otherwise (`'management'`), debit/credit currency by the change in `gearCost` since the session opened (`character.gearCostAtOpen`). Both no-op if `wealthType !== 'currency'`, and neither runs at all if the checkbox is unchecked.

**Why the customization-detection layer got dropped:** it only existed to let *unmodified* items pick up later compendium edits (a price tweak, a typo fix) on save — the "customized" flag was purely the exception carve-out to protect modified items from that same refresh. Once "auto-sync with the compendium" isn't a goal, patching in place unconditionally gets the identical "never destroys homebrew" guarantee with no per-item source fetch and no bookkeeping. Traded away deliberately: (a) an unmodified item's price/description no longer follows a later compendium edit — accepted; (b) **loses the self-healing property** wipe-and-recreate had for free — a bad field value from a past bug on an "should be vanilla" item, or a missing/wrong `compendiumUuid` flag, now persists forever instead of auto-correcting on next save; recovery requires a manual Remove-and-re-Add. Worth remembering given this module is still under active development. (c) `updateEmbeddedDocuments` vs. delete+create aren't guaranteed identical for any create-only side effects some other module might hook — low risk, not verified in-app.

### Suggested implementation order

1. Currency: flag-tracked delta + starting-funds fixes (Rich/Filthy Rich detection, Extra Funds wiring). Currency-only, no save-model changes needed.
2. Customization-detection helper, wired into Gear's existing save path as the new default (smallest surface — already has a real embedded-item save to retrofit).
3. Extend the same customization check to Ancestry's save (already has a real embedded-item save path too).
4. ✅ **Done.** Real embedded-item save built for Skills/Edges/Hindrances, closing the `system.skills`/`system.edges`/`system.hindrances` scaffold gap (that field isn't part of the SWADE actor schema and was silently discarded by Foundry). Ended up using the same unconditional-patch pattern Gear settled on (see the "why customization-detection got dropped" note above), not the customization-check pattern originally suggested here — existing items are patched in place (die/advances for skills, major/minor for hindrances), never deleted and recreated. This also surfaced and fixed a real data-loss bug in Gear's own save: detection was keying by a shared compendium uuid instead of the actor's own item uuid, so any item that matched a compendium entry by name was deleted and recreated (and two same-named items collapsed into one) on every save. Same identity fix applied to Edges/Hindrances/Skills detection and their tab pickers' "already selected" checks.
5. Build the Advancement tab (`AdvancementTabHandler.js` + `advancement-tab.hbs`) per the Tab 8 spec above, reading/writing `actor.system.advances.list[]` directly. Thread its four additive budget terms (Edge/Two Skills/One Skill/Attribute) into `CharacterManager.getData()` alongside the existing ancestry/hindrance-derived bonuses, plus the Hindrance-buyoff perk-point bonus. Delete `AdvancementManager.js` and its menu entry once the tab is live — it's superseded, not extended.

---

## Cross-Tab Enhancements (added during Gear tab work, not tab-specific)

### Save Button & Unspent-Points Confirmation
- The footer's Save/Cancel buttons now show on every tab, not just Gear/Summary — needed since Summary doesn't exist yet and Save was otherwise unreachable in the running app.
- Clicking Save now checks for unspent Attribute/Skill/Edge/Perk points, plus any ancestry ability with an unassigned bonus-choice dropdown, first. If any exist, a blocking `Dialog.confirm` ("This character still has unspent X. Save anyway?") must be explicitly confirmed before `_createActor()` runs. Cancelling the dialog (or the confirm returning anything but `true`) aborts the save.
- Deliberately **not** checked: leftover Hindrance points or unspent gear silver — neither is really a "mistake" the way an unspent creation point usually is (fewer hindrances or not spending every coin is a valid choice).
- Implementation: `CharacterManager._confirmSaveEffects()`, reading a `this._budgetSnapshot` cached at the end of the last `getData()` call (cheaper than recomputing edge points, which depend on async ancestry child-item data).

### Configurable Additional Compendium Packs
- Five new world settings (`additionalAncestryPacks`, `additionalSkillPacks`, `additionalEdgePacks`, `additionalHindrancePacks`, `additionalGearPacks` in `scripts/settings.js`) let a GM merge in packs from other modules/homebrew alongside the built-in Fantasy packs — comma/semicolon/whitespace-separated pack IDs, same parsing convention as `extraVisiblePacks`.
- This is additive only: it does **not** replace `FANTASY_PACKS` in `compendium-utils.js`. A future full override/replacement model (letting a GM point Character Manager at a different setting's compendiums entirely, or the standalone-module extraction noted in DEVELOPMENT.md) is a separate, bigger piece of work, not yet started.

---

## Testing Checklist (v0.6.2)

**Note:** this file (and DEVELOPMENT.md's reference to `docs/v0.6.0/TESTING.md`) point at a testing checklist doc that was never actually created — no separate test-case file exists yet. The categories below are the plan; Milestone 5 above is the authoritative "has this been tested" status.

Key test categories:
- UI Navigation (8 tests)
- Budget Tracking (3 tests)
- Data Persistence (2 tests)
- Rules Compliance (4 tests)
- Edge Cases (3 tests)
- JSON Export/Import (1 test)
- Integration (macro access) (1 test)

**Total Tests:** 22-25

### Gear Tab — Concrete Test Cases (2026-08-10 session)

The generic categories above predate the Gear tab's currency/encumbrance/mode-toggle work — none of it has a formal test pass yet. Concrete cases to run before considering this tab done:

**Current currency display**
- [ ] Open an actor with nonzero `system.details.currency` — footer/guidance area shows the real current amount, separate from any budget number.
- [ ] Hidden entirely on a world using Wealth Die or no-currency setting rules.

**Starting Equipment / Gear Management mode toggle**
- [ ] Fresh actor (no advances, no gear) defaults to Starting Equipment.
- [ ] Established actor (has advances or existing gear) defaults to Gear Management.
- [ ] Manually toggling switches the footer content (budget/override vs. plain current currency) immediately.
- [ ] Toggle choice persists across close/reopen (`gearTabMode` actor flag).

**Apply-to-currency-on-Save checkbox (both modes)**
- [ ] Checkbox starts unchecked every time the tool is opened, regardless of mode or actor state.
- [ ] With it unchecked, Save proceeds normally (gear, attributes, everything else) and currency is completely untouched, in either mode.
- [ ] Live preview text next to the checkbox updates immediately as gear is added/removed/quantity-adjusted, before ever checking the box.

**Save-time confirmation dialog**
- [ ] Clicking Save with the checkbox unchecked shows a dialog stating "Currency will not change" before proceeding.
- [ ] Clicking Save with the checkbox checked shows a dialog stating the specific effect (set/charge/refund amount), matching the footer's live preview text.
- [ ] Cancelling either dialog aborts the Save entirely — nothing is written.
- [ ] Dialog does not appear at all on a Wealth Die / no-currency world.

**Starting Equipment mode currency**
- [ ] Preview text reads "sets currency to X" where X matches the footer's remaining/budget number.
- [ ] Brand-new actor: buy gear, check the box, Save — currency ends up at exactly `startingFunds − gearCost`, not the SWADE-seeded amount plus that (the double-counting bug this session's redesign fixed).
- [ ] Select a Rich/Filthy Rich-type edge, then buy gear, check the box, Save — the multiplier is correctly reflected in the resulting currency.
- [ ] Set a manual "Override Starting Funds" value — Save uses the override instead of the formula, both for the footer and the preview text.
- [ ] Re-save (box still checked) with no gear changes — currency recomputes to the same value (idempotent).

**Gear Management mode currency**
- [ ] Preview text reads "charges X" / "refunds X" / "no change" matching the actual marginal cost delta since the tab opened.
- [ ] Established actor, note current currency, buy an item worth X, check the box, Save — currency drops by exactly X.
- [ ] Remove that item, check the box, Save again — currency goes back up by X (refund).
- [ ] Buy something costing more than current currency, check the box — saves fine with currency negative, no block.
- [ ] Reopen after a save — the next session's baseline is the actor's now-updated real gear (no re-charging for items already owned), and the checkbox is unchecked again by default.
- [ ] On an established actor left in Starting mode by mistake, Save with the box **unchecked** — currency is untouched (no confirmation dialog needed anymore, since nothing happens without explicit opt-in).

**Encumbrance**
- [ ] Footer always shows `Carried: X / Y {lbs|kg}`, independent of the currency setting.
- [ ] Adding/removing gear updates Carried live.
- [ ] Exceeding capacity turns the value red.
- [ ] Raising Strength die increases max capacity.
- [ ] An encumbrance-step-granting effect (e.g. Packrat) increases max capacity.

**Duplicate-item fix (2026-08-10)**
- [ ] Established actor with existing gear (e.g. "5 Arrows") — adding "Arrows" again via the search dropdown bumps to 10 in one stack, not a second row.
- [ ] Dragging an item already embedded on the actor onto the Gear tab bumps quantity rather than duplicating.
- [ ] A genuinely new item (never seen before) still creates one fresh entry.
- [ ] After Save, the actor sheet's own inventory shows no duplicate rows for either case above.

**SWADE Fantasy Currencies coin exclusion (2026-08-11)**
- [ ] Actor with `sfc`-module coin items — they don't appear in the Gear tab's list.
- [ ] Save with those coin items present — they're still on the actor afterward (not deleted).
- [ ] An actor whose only gear-type items are coin items still defaults to Starting Equipment mode (not misread as "established").

### Ancestry Tab — Concrete Test Cases (2026-08-11 session)

**Ancestry-granted attribute floor no longer costs points**
- [ ] Select an ancestry with an attribute bonus (e.g. Elf's +1 die to Agility) — Traits tab shows the full 5 attribute points still available before spending anything.
- [ ] Raise that same attribute further — only the steps *above* the ancestry floor consume points.

**Ancestral ability bonus-choice dropdown**
- [ ] An ability matching the `ancestryChoiceAbilityNames` setting (default "Half-Elves-Heritage") shows the bonus dropdown; other ancestral abilities on the same or a different ancestry do not.
- [ ] Selecting "+1 Edge Point" increases the Edges tab's available edge points by 1; switching to "+1 Attribute Point" moves that bonus to the Traits tab instead and removes it from Edges.
- [ ] Setting the dropdown back to "None selected yet" removes the bonus entirely.
- [ ] Choice persists across close/reopen (`ancestryAbilityChoices` actor flag).
- [ ] Adding a second name to the setting makes a second ability's dropdown appear; clearing the setting entirely hides all of them.

**Manual Adjustments**
- [ ] Checking "Manual Adjustments" reveals the four budget rows (Attribute/Skill/Edge/Hindrance-Perk Points), each labeled with which tab's budget it feeds.
- [ ] Clicking `+`/`-` on a row's stepper increments/decrements the displayed amount and the corresponding tab's budget immediately.
- [ ] A negative amount correctly reduces the budget (can go below the normal total).
- [ ] Typing a note and leaving the field — note persists and shows next to that row's amount on the Summary tab, only for rows with a non-zero amount.
- [ ] Amounts and notes persist across close/reopen (`manualBudgetOverrides` actor flag).

---

## File Structure

**Note:** this tree is the original pre-build plan and doesn't match actual structure in a few places — Attributes/Skills were merged into a single `traits-tab.hbs`/`TraitsTabHandler.js` rather than split, actual partials live under `templates/character-creation/_components/`, `CHARACTER_MANAGER_MACRO.js` and `CHARACTER_MANAGER_QUICKSTART.md` were never created (see Milestone 4), and there's no `source/macros/` entry for this tool. Left as historical context rather than rewritten wholesale.

```
scripts/apps/character-creation/
├── lib/
│   ├── calculator.js (UPDATED)
│   ├── compendium-utils.js (UPDATED)
├── CharacterManager.js (NEW - main FormApplication)
├── index.js (UPDATED - export CharacterManager)

templates/character-creation/
├── character-manager.hbs (NEW - main template)
├── _concept.hbs (NEW - concept tab)
├── _ancestry.hbs (NEW - ancestry tab)
├── _hindrances.hbs (NEW - hindrances tab)
├── _attributes.hbs (NEW - attributes tab)
├── _skills.hbs (NEW - skills tab)
├── _edges.hbs (NEW - edges tab)
├── _gear.hbs (NEW - gear tab)
├── _summary.hbs (NEW - summary tab)

styles/
├── character-manager.css (NEW - all styling)

source/macros/
├── CHARACTER_MANAGER_MACRO.js (NEW)

Root:
├── CHARACTER_MANAGER_v0.6.2_ROADMAP.md (this file)
├── CHARACTER_MANAGER_QUICKSTART.md (NEW - user guide)
├── TESTING_CHECKLIST_v0.6.2.md (UPDATED - aligned with new design)
```

---

## Success Criteria

**v0.6.2 Release Ready When:** (corrected — items 7-9 below were previously marked ✅ inaccurately; no formal test pass has actually happened yet, see Milestone 5)
1. ✅ All 9 tabs implemented and functional
2. ✅ Budget tracking accurate across all tabs
3. ✅ Ancestry bonuses auto-applied correctly
4. ✅ Hindrance trade-off system working
5. ✅ Gear drag-drop functional
6. ✅ Save to actor working
7. ⬜ All Milestone 5 tests passing — not yet run in-Foundry
8. ⬜ No console errors in Foundry v14 — not yet verified
9. ⬜ Documentation complete — roadmap/design docs are current, but `CHARACTER_MANAGER_QUICKSTART.md` was never written

---

## Estimated Timeline

**Status (corrected):** everything below "Testing" is done — this table is historical planning, not a live tracker. The only real remaining stage is Testing (Milestone 5).

| Build Stage | Estimate | Status |
|-------|----------|--------|
| Foundation | 4-6 hours | Done |
| UI Foundation | 4-6 hours | Done |
| Tabs (9 tabs) | 8-12 hours | Done |
| Integration | 2-3 hours | Done |
| Testing | 3-5 hours | Pending |

---

## Notes

- This roadmap prioritizes clean separation of concerns (UI, data, calculation)
- Each tab is relatively independent, allowing parallel development if needed
- Testing should be iterative (test each tab as it's completed, not all at end)
- User feedback from v0.6.1 testing sessions should drive priority adjustments

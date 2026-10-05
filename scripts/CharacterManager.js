/**
 * Character Manager - FormApplication for SWADE character creation and advancement
 *
 * Refactored with Tab Handlers and Reusable Components
 * - Tab Handlers: ConceptTabHandler, AncestryTabHandler, etc.
 * - Reusable Components: SearchableDropdown, DragDropManager, TabManager
 */

import {
  getAncestries,
  getSkills,
  getEdges,
  getHindrances,
  getGearItems,
  getItemPreview
} from './lib/compendium-utils.js';
import {
  calculateDerivedStats,
  calculatePaceModifier,
  calculateTotalAttributePoints,
  calculateTotalSkillPoints,
  calculateTotalHindrancePoints,
  getRemainingHindrancePoints,
  getSkillPointBreakdown,
  getAvailablePerkPoints,
  generatePerkSlots,
  isFreeCoreSkill,
  FREE_CORE_SKILLS,
  getAncestryAttributeBonuses,
  calculateAvailableEdgePoints,
  calculateUsedEdgePoints,
  calculateBonusAttributePoints,
  calculateBonusSkillPoints,
  applyAncestryAttributeFloors,
  calculateAncestryChoiceBonuses,
  getManualBudgetOverrideAmount,
  calculateAncestryBonusEdgePoints,
  calculateGearCost,
  calculateStartingFunds,
  calculateCarriedWeight,
  calculateMaxCarryCapacity,
  resolveGearFields,
  parseRichFundsMultipliers,
  ADVANCE_TYPE_ENUM,
  ADVANCE_TYPE_ENUM_REVERSE,
  calculateBonusEdgePointsFromAdvances,
  calculateBonusSkillPointsFromAdvances,
  calculateBonusAttributePointsFromAdvances,
  calculateBonusPerkPointsFromAdvances,
  calculateTotalAdvanceCount,
  getCharacterRank,
  getAttributeAdvanceWarning,
  groupAdvancesByRank,
  getRankIndexFromAdvanceNumber,
} from './lib/calculator.js';
import { TabManager } from './components/TabManager.js';
import { ConceptTabHandler } from './handlers/ConceptTabHandler.js';
import { AncestryTabHandler } from './handlers/AncestryTabHandler.js';
import { HindrancesTabHandler } from './handlers/HindrancesTabHandler.js';
import { TraitsTabHandler } from './handlers/TraitsTabHandler.js';
import { EdgesTabHandler } from './handlers/EdgesTabHandler.js';
import { GearTabHandler } from './handlers/GearTabHandler.js';
import { AdvancementTabHandler } from './handlers/AdvancementTabHandler.js';
import { TAB_GUIDANCE, DEFAULT_ATTRIBUTES, ATTRIBUTE_DESCRIPTIONS, ATTRIBUTE_TIPS } from './constants.js';

const MODULE_ID = 'swade-character-manager';

// Character Manager was extracted out of the "swade-fantasy-world-kit" hub module in v0.9.0;
// actor flags set before that (perk allocations, manual adjustments, etc.) still live under
// the hub's old module ID. On first open under the new ID, copy them over once and remove the
// old copy — a tiny one-time migration, not a long-lived compatibility layer (see
// DEVELOPMENT.md's v0.9.0 roadmap entry).
const LEGACY_MODULE_ID = 'swade-fantasy-world-kit';

async function migrateLegacyActorFlags(actor) {
  const legacyFlags = actor.flags?.[LEGACY_MODULE_ID];
  if (!legacyFlags || actor.flags?.[MODULE_ID]) return;

  await actor.update({
    [`flags.${MODULE_ID}`]: legacyFlags,
    [`flags.-=${LEGACY_MODULE_ID}`]: null,
  });
}

const GEAR_ITEM_TYPES = ['gear', 'weapon', 'armor', 'shield'];

/**
 * Excludes coin items created by the "SWADE Fantasy Currencies" module (id `sfc`) — those
 * are gear-type items flagged `flags.sfc.type` and managed entirely through SFC's own coin
 * UI/currency total, not something this tab's Gear list should show or touch. Without this,
 * _saveGearToActor's reconciliation would also delete them on save since they'd never appear
 * in `this.character.gear`.
 */
function isTrackedGearItem(item) {
  return GEAR_ITEM_TYPES.includes(item.type) && !item.grantedBy && !item.getFlag?.('sfc', 'type');
}

// Module-level cache: compendium data is identical for every CharacterManager instance
// within a session (a fresh instance is created on each open, see main.js), so keeping
// this outside the class lets the expensive per-item fromUuid lookups run only once
// per session instead of on every open.
const compendiumCache = {
  ancestries: [],
  skills: [],
  edges: [],
  hindrances: [],
  gear: [],
  loaded: false,
};

/**
 * Force the next Character Manager open to re-fetch compendium data instead of
 * using the cached copy. Call after settings that affect which items/packs are
 * visible change (curated mode, extra visible packs, additional pack lists).
 */
export function invalidateCompendiumCache() {
  compendiumCache.loaded = false;
}

export class CharacterManager extends FormApplication {
  static TAB_HANDLERS = {
    concept: ConceptTabHandler,
    ancestry: AncestryTabHandler,
    hindrances: HindrancesTabHandler,
    traits: TraitsTabHandler,
    edges: EdgesTabHandler,
    gear: GearTabHandler,
    advancement: AdvancementTabHandler,
    // No handler for 'summary' — it's a read-only recap with no interactive elements,
    // so there's nothing for a tab handler to wire up. Tab nav/switching works regardless,
    // since TabManager auto-generates nav buttons from .tab elements, not the handler map.
  };

  constructor(options = {}) {
    const formOptions = {
      ...options,
      object: options.actor || {}
    };
    super(formOptions);
    this.actor = options.actor || null;
    this.character = null;
    this.currentTab = 'concept';
    this.compendiumData = compendiumCache;
    this.skillsByAttribute = {};

    // Initialize tab handlers from registry
    this.tabHandlers = Object.entries(CharacterManager.TAB_HANDLERS).reduce(
      (handlers, [tabName, HandlerClass]) => {
        handlers[tabName] = new HandlerClass(this);
        return handlers;
      },
      {}
    );

    // Initialize tab manager
    this.tabManager = new TabManager({ currentTab: this.currentTab });
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'swade-character-manager',
      title: 'SWADE Character Manager',
      template: `modules/${MODULE_ID}/templates/character-manager.hbs`,
      width: 600,
      height: 700,
      left: 100,
      top: 100,
      resizable: true,
      closeOnSubmit: false,
    });
  }

  get title() {
    if (this.actor) {
      return `Character Manager — ${this.actor.name}`;
    }
    return 'Character Manager';
  }

  async render(force = false, options = {}) {
    // Preserve scroll position
    const scrollPos = this.element?.find('.form-tabs')?.scrollTop() || 0;
    const tabScrollPos = this.element?.find('.tab.active')?.scrollTop() || 0;

    try {
      const result = await super.render(force, options);

      // Use requestAnimationFrame (not setTimeout) so the restore lands before the
      // browser's next paint — setTimeout(0) is a macrotask and lets the reset-to-top
      // frame paint first, causing a visible flicker.
      requestAnimationFrame(() => {
        // Restore outer form scroll position
        if (scrollPos > 0) {
          this.element?.find('.form-tabs')?.scrollTop(scrollPos);
        }

        // Restore tab scroll position
        if (tabScrollPos > 0) {
          this.element?.find('.tab.active')?.scrollTop(tabScrollPos);
        }

        // If there's a pending scroll target, scroll to it
        if (this.pendingScrollTarget) {
          const target = this.element?.find(this.pendingScrollTarget)?.[0];
          if (target) {
            target.scrollIntoView({ behavior: 'auto', block: 'start' });
          }
          this.pendingScrollTarget = null;
        }
      });

      return result;
    } catch (error) {
      console.error('[CharacterManager] render() failed:', error);
      throw error;
    }
  }

  async getData(options = {}) {
    try {
      // Fetch compendium data if not cached (needed before character detection below).
      // Cached at module level, so this only runs once per session, not once per open.
      if (!compendiumCache.loaded) {
        try {
          const [ancestries, skills, edges, hindrances, gear] = await Promise.all([
            getAncestries(),
            getSkills(),
            getEdges(),
            getHindrances(),
            getGearItems(),
          ]);
          compendiumCache.ancestries = ancestries;
          compendiumCache.skills = skills;
          compendiumCache.edges = edges;
          compendiumCache.hindrances = hindrances;
          compendiumCache.gear = gear;
          compendiumCache.loaded = true;
        } catch (error) {
          console.error('[Character Manager] Failed to load compendium data:', error);
          ui.notifications.error('[Character Manager] Could not load compendium data. Check the configured compendium packs are installed and visible.');
        }
      }

      // Initialize character on first open (after compendium data is available, so
      // existing actor Skills/Edges/Hindrances can be matched to compendium entries)
      if (!this.character) {
        if (!this.actor) {
          // This tool only ever edits an existing actor — it has no "create a new
          // character from scratch" mode — so it should never be opened without one.
          throw new Error('[Character Manager] Cannot open without an actor.');
        }

        await migrateLegacyActorFlags(this.actor);

        {
          const ancestryItem = this.actor.items.find(item => item.type === 'ancestry');
          let ancestryUuid = ancestryItem?.getFlag(MODULE_ID, 'compendiumUuid') || null;

          if (ancestryItem && !ancestryUuid) {
            const matchedAncestry = this.compendiumData.ancestries.find(a => a.name === ancestryItem.name);
            // Fall back to the actor's own embedded item when the ancestry isn't from the
            // configured compendium (e.g. added from elsewhere, or homebrew) — the compendium
            // is only a suggestion source, any ancestry actually on the actor should display.
            ancestryUuid = matchedAncestry ? matchedAncestry.uuid : ancestryItem.uuid;
          }

          this.character = {
            name: this.actor.name,
            description: this.actor.system?.description || '',
            archetype: this.actor.system?.details?.archetype || '',
            concept: this.actor.system?.details?.notes || '',
            ancestry: ancestryUuid,
            expandedAncestry: false,
            expandedChildItems: {},
            expandedGrantedSections: {},
            // Source data (this.actor.toObject() defaults to source=true), not this.actor.system
            // — the latter is derived/post-Active-Effects, so a temporary condition (e.g. an
            // injury lowering Agility) would get baked in as the character's permanent die on
            // open, and then permanently written back to the actor as the new base on Save.
            attributes: { ...DEFAULT_ATTRIBUTES, ...(this.actor.toObject().system?.attributes || {}) },
            skills: await this._detectSkillsFromActor(this.actor),
            edges: await this._detectEdgesFromActor(this.actor),
            hindrances: await this._detectHindrancesFromActor(this.actor),
            gear: await this._detectGearFromActor(this.actor),
            advances: this._detectAdvancesFromActor(this.actor),
            gearFundsOverride: this.actor.getFlag(MODULE_ID, 'gearFundsOverride') ?? null,
            // UI-only toggle for the Gear tab's override input, not persisted itself — starts
            // revealed if the actor already has an override flag set from a previous save.
            showGearFundsOverride: (this.actor.getFlag(MODULE_ID, 'gearFundsOverride') ?? null) !== null,
            // Gear tab has two modes: "starting" (shopping-budget footer, for creation) and
            // "management" (plain current-currency footer, for an established character).
            // Once a GM/player has set this explicitly it's remembered via actor flag;
            // otherwise default by whether the actor looks already-established.
            gearTabMode: this.actor.getFlag(MODULE_ID, 'gearTabMode')
              ?? (this._actorLooksEstablished(this.actor) ? 'management' : 'starting'),
            // UI-only, always starts unchecked — currency only changes on Save if explicitly
            // opted into this session, never as a silent side effect of whichever Gear tab
            // mode happens to be selected. See the live preview text next to this checkbox.
            applyCurrencyOnSave: false,
            // Which perk each hindrance-point slot was spent on (Attribute/Edge/Skill
            // Point/Extra Funds) — persisted as its own actor flag since it has no embedded
            // Item of its own to live on, unlike every other tab's selections.
            perkPointAllocations: this.actor.getFlag(MODULE_ID, 'perkPointAllocations') || [],
            // Manual choice made on an ancestral ability's card (e.g. Half-Elf's Heritage) —
            // see calculateAncestryChoiceBonuses. Kept here as an object keyed by the granting
            // ability's own uuid for convenient lookups, but persisted as an array of
            // {uuid, choice} entries (see _saveActor): a compendium uuid contains periods, and
            // Foundry's flag storage recursively merges objects treating "." as a path
            // separator, which silently mangles (and loses) a plain object keyed by uuid.
            // The Array.isArray guard discards any pre-fix value an actor may already have
            // saved (the old code stored a since-corrupted object here) rather than throwing.
            ancestryAbilityChoices: (() => {
              const stored = this.actor.getFlag(MODULE_ID, 'ancestryAbilityChoices');
              return Object.fromEntries((Array.isArray(stored) ? stored : []).map((e) => [e.uuid, e.choice]));
            })(),
            // Freeform "Manual Adjustments" overrides for setting rules/edge cases the app has
            // no built-in support for — see getManualBudgetOverrideAmount.
            manualBudgetOverrides: this.actor.getFlag(MODULE_ID, 'manualBudgetOverrides') || {},
          };
          // UI-only reveal toggle, not persisted itself — starts open if a previous session
          // already left a non-zero override in place, same convention as showGearFundsOverride.
          this.character.showManualBudgetOverrides = Object.values(this.character.manualBudgetOverrides)
            .some((o) => (Number(o?.amount) || 0) !== 0 || !!o?.note);

          // Snapshot of gear cost as it actually exists on the actor right now, before this
          // session's edits — Gear Management mode's currency reconciliation debits/credits
          // only the *change* in gear cost since this snapshot, so it never touches currency
          // for gear the actor already owned coming in. Fixed for the life of this session;
          // recomputed fresh (from the actor's then-current real items) on next open.
          this.character.gearCostAtOpen = calculateGearCost(this.character);
        }

        // Convert actor attribute format (die.sides) to our format (die: "d4")
        const sidesToDie = { 4: 'd4', 6: 'd6', 8: 'd8', 10: 'd10', 12: 'd12' };
        if (this.character.attributes) {
          for (const [attr, data] of Object.entries(this.character.attributes)) {
            if (data.die && typeof data.die === 'object' && data.die.sides) {
              data.die = sidesToDie[data.die.sides] || 'd4';
            } else if (typeof data.die !== 'string') {
              data.die = 'd4';
            }
          }
        }

        // Ensure all attributes have die values
        if (!this.character.attributes) {
          this.character.attributes = { ...DEFAULT_ATTRIBUTES };
        } else {
          for (const attr of Object.keys(DEFAULT_ATTRIBUTES)) {
            if (!this.character.attributes[attr]) {
              this.character.attributes[attr] = DEFAULT_ATTRIBUTES[attr];
            }
          }
        }

        this._initializeFreeCoreSkills();
      }

      // Always rebuild skills by attribute (needed for renders after character changes)
      this._buildSkillsByAttribute();

      // Fetch ancestry preview if selected
      let selectedAncestryData = null;
      let childItemsData = [];
      if (this.character.ancestry) {
        selectedAncestryData = await getItemPreview(this.character.ancestry);
        childItemsData = await this._getGrantedChildItems(this.character.ancestry, selectedAncestryData);

        // Enrich ancestry description as well
        if (selectedAncestryData?.system?.description) {
          selectedAncestryData.system.description = await TextEditor.enrichHTML(selectedAncestryData.system.description, { async: true });
        }

        // The bonus-choice dropdown (see ancestryAbilityChoices) only shows on abilities
        // configured by name — matched the same way as bonusEdgePointAbilityNames, so this
        // works with any compendium/setting without hardcoding "Half-Elves-Heritage" itself.
        const ancestryChoiceAbilityNames = new Set(
          (game.settings.get(MODULE_ID, 'ancestryChoiceAbilityNames') || '')
            .split(',')
            .map((n) => n.toLowerCase().trim())
            .filter(Boolean)
        );
        for (const child of childItemsData) {
          child.offersAncestryChoice = ancestryChoiceAbilityNames.has(child.name?.toLowerCase());
        }
      }
      const unassignedAncestryChoices = childItemsData.filter(
        (child) => child.offersAncestryChoice && !this.character.ancestryAbilityChoices?.[child.uuid]
      ).length;

      // Ancestry-granted attribute floors (e.g. "+1 die to Vigor") are free — computed here,
      // ahead of attributePointsUsed below, so the points spent by the player never include
      // whatever die steps the ancestry already grants for nothing. See calculateTotalAttributePoints.
      const ancestryBonuses = selectedAncestryData ? getAncestryAttributeBonuses(selectedAncestryData, childItemsData) : {};
      // Cached for _saveActor, which runs from a button click rather than a render and so has
      // no other way to know which attributes carry an ancestry floor (see _attributesToUpdateData).
      this._ancestryBonuses = ancestryBonuses;
      // character.attributes was loaded from actor source data (see above), which excludes the
      // ancestry's own Active Effect along with everything else — re-apply just the ancestry's
      // floor here so the Traits tab still shows/edits the character's real permanent die,
      // without reintroducing unrelated temporary effects (e.g. an injury) into that value.
      applyAncestryAttributeFloors(this.character, ancestryBonuses);

      // Some edges (e.g. Arcane Backgrounds) and hindrances grant other edges/hindrances as
      // child items, the same way an ancestry grants ancestral abilities. Build the same kind
      // of nested display data for each selected edge/hindrance, keyed by its own uuid.
      const edgeUuids = Object.keys(this.character.edges || {});
      const edgeChildResults = await Promise.all(edgeUuids.map((uuid) => this._getGrantedChildItems(uuid)));
      const edgeChildItems = {};
      edgeUuids.forEach((uuid, i) => {
        if (edgeChildResults[i].length) edgeChildItems[uuid] = edgeChildResults[i];
      });

      // Hindrances granted as a child item by a selected edge (e.g. an Arcane Background's
      // downside) are real, narratively-part-of-the-character effects, but shouldn't behave
      // like an independently-chosen hindrance: they don't grant their own perk points, and
      // showing them as a normal "Selected Hindrance" card — complete with its own "further
      // grants" section — is confusing since they were never a player choice on this tab.
      // Matched by name rather than uuid: `system.grants` descriptors point at the compendium
      // source item, not whatever uuid this hindrance ended up keyed under in
      // `character.hindrances` (which is always the actor's own embedded-item uuid — see
      // _detectHindrancesFromActor), so a uuid-based exclusion would never match.
      const edgeGrantedHindranceNames = new Set(
        Object.values(edgeChildItems)
          .flat()
          .filter((child) => child.type === 'hindrance')
          .map((child) => child.name?.toLowerCase())
      );
      const visibleHindrances = Object.fromEntries(
        Object.entries(this.character.hindrances || {})
          .filter(([, h]) => !edgeGrantedHindranceNames.has(h.name?.toLowerCase()))
      );
      // Used only for hindrance-point/perk calculations and the "Selected Hindrances"
      // display — _saveHindrancesToActor() and detection still operate on the real,
      // unfiltered character.hindrances, so an edge-granted hindrance's actual embedded
      // item (if SWADE's own grant automation created one) is never touched by this.
      const hindranceCharacterView = { ...this.character, hindrances: visibleHindrances };

      const hindranceUuids = Object.keys(visibleHindrances);
      const hindranceChildResults = await Promise.all(hindranceUuids.map((uuid) => this._getGrantedChildItems(uuid)));
      const hindranceChildItems = {};
      hindranceUuids.forEach((uuid, i) => {
        if (hindranceChildResults[i].length) hindranceChildItems[uuid] = hindranceChildResults[i];
      });

      // Pace/Toughness previews need every real hindrance's Active Effects, including
      // edge-granted ones (their mechanical effects still apply even though they're hidden
      // from the tab) — so this uses the *unfiltered* list, not visibleHindrances.
      const allHindranceUuids = Object.keys(this.character.hindrances || {});
      const [edgeItemsFull, hindranceItemsFull] = await Promise.all([
        Promise.all(edgeUuids.map((uuid) => getItemPreview(uuid))),
        Promise.all(allHindranceUuids.map((uuid) => getItemPreview(uuid))),
      ]);
      const paceModifier = calculatePaceModifier([
        selectedAncestryData,
        ...childItemsData,
        ...edgeItemsFull,
        ...hindranceItemsFull,
      ]);
      const armorBonus = Object.values(this.character.gear || {})
        .reduce((sum, gearData) => sum + (gearData.armor || 0), 0);

      const derivedStats = calculateDerivedStats(this.character, { armorBonus, paceModifier });
      const attributePointsUsed = calculateTotalAttributePoints(this.character, ancestryBonuses);
      const skillPointsUsed = calculateTotalSkillPoints(this.character, this._getSkillCompendiumMap());
      const skillPointBreakdown = getSkillPointBreakdown(this.character, this._getSkillCompendiumMap());

      // Advancement tab: each recorded advance grants additive budget into the pool its
      // type maps to, reusing the same pools ancestry/hindrance bonuses already flow into
      // (no separate advancement-specific budget UI) — see docs/v0.6.0/CHARACTER_MANAGER.md,
      // "Tab 8: Advancement". Computed before the pools below so they can be folded in.
      const bonusEdgePointsFromAdvances = calculateBonusEdgePointsFromAdvances(this.character);
      const bonusSkillPointsFromAdvances = calculateBonusSkillPointsFromAdvances(this.character);
      const bonusAttributePointsFromAdvances = calculateBonusAttributePointsFromAdvances(this.character);
      const bonusPerkPointsFromAdvances = calculateBonusPerkPointsFromAdvances(this.character);
      const totalAdvanceCount = calculateTotalAdvanceCount(this.character);
      const characterRank = getCharacterRank(this.character);
      const attributeAdvanceWarning = getAttributeAdvanceWarning(this.character);
      const advanceGroups = groupAdvancesByRank(this.character);

      // Manual choices on ancestral-ability cards (e.g. Half-Elf's Heritage) and the freeform
      // "Manual Adjustments" overrides both feed into the same budget pools as every other
      // bonus source below — see calculateAncestryChoiceBonuses / getManualBudgetOverrideAmount.
      const ancestryChoiceBonuses = calculateAncestryChoiceBonuses(this.character);
      const manualPerkOverride = getManualBudgetOverrideAmount(this.character, 'perk');
      const manualEdgeOverride = getManualBudgetOverrideAmount(this.character, 'edge');
      const manualAttributeOverride = getManualBudgetOverrideAmount(this.character, 'attribute');
      const manualSkillOverride = getManualBudgetOverrideAmount(this.character, 'skill');

      const totalBonusPerkPoints = bonusPerkPointsFromAdvances + manualPerkOverride;
      const availablePerkPoints = getAvailablePerkPoints(hindranceCharacterView, totalBonusPerkPoints);
      const perkSlots = generatePerkSlots(hindranceCharacterView, totalBonusPerkPoints);
      const bonusEdgePointAbilityNames = (game.settings.get(MODULE_ID, 'bonusEdgePointAbilityNames') || '')
        .split(',');
      const ancestryBonusEdgePoints = calculateAncestryBonusEdgePoints(childItemsData, bonusEdgePointAbilityNames)
        + ancestryChoiceBonuses.edgePoints;
      const edgePointsAvailable = calculateAvailableEdgePoints(this.character) + ancestryBonusEdgePoints
        + bonusEdgePointsFromAdvances + manualEdgeOverride;
      const edgePointsUsed = calculateUsedEdgePoints(this.character);
      const bonusAttributePoints = calculateBonusAttributePoints(this.character) + bonusAttributePointsFromAdvances
        + ancestryChoiceBonuses.attributePoints + manualAttributeOverride;
      const bonusSkillPoints = calculateBonusSkillPoints(this.character) + bonusSkillPointsFromAdvances
        + ancestryChoiceBonuses.skillPoints + manualSkillOverride;
      const gearCost = calculateGearCost(this.character);
      const hindrancePointsUsed = calculateTotalHindrancePoints(hindranceCharacterView);

      // Calculate perk points spent based on actual option costs
      const perkOptionCosts = {
        'attribute-boost': 2,
        'edge': 2,
        'skill-point': 1,
        'extra-funds': 1,
      };
      const perkPointsSpent = perkSlots.reduce((sum, slot) => {
        if (!slot.selected) return sum;
        const cost = perkOptionCosts[slot.selected] || 0;
        return sum + cost;
      }, 0);

      // Get currency settings from SWADE system. Wealth Die / no-wealth tables have no numeric
      // currency field at all — rather than building parallel logic for those uncommon setting
      // rules, all currency tracking (budget, override, Extra Funds perk) is simply hidden and
      // left for the table to handle manually when this isn't 'currency'.
      const usesCurrency = game.settings.get('swade', 'wealthType') === 'currency';
      const currencyName = game.settings.get('swade', 'currencyName') || 'Silver';
      const pcStartingCurrency = game.settings.get('swade', 'pcStartingCurrency') || 600;
      // Extra Funds hindrance perk grants a bonus equal to twice the setting's starting
      // amount — kept separate from the Gear tab's startingFunds formula below, which has
      // no unconditional doubling of its own.
      const currencyAmount = pcStartingCurrency * 2;
      const richFundsMultipliers = parseRichFundsMultipliers(
        game.settings.get(MODULE_ID, 'richFundsMultipliers')
      );
      const startingFunds = calculateStartingFunds(this.character, { pcStartingCurrency, richFundsMultipliers });
      // The actor's actual banked currency (pre-existing gold, GM awards, etc.) — separate
      // from the Gear tab's shopping budget above, which only tracks this session's spend.
      const currentCurrency = this.actor?.system?.details?.currency ?? 0;

      // Encumbrance — mirrors SWADE's own carry-capacity formula (see calculateMaxCarryCapacity),
      // reading encumbranceSteps straight off the live actor since that field already reflects
      // any Active Effects (Packrat, racial size, etc.) without this tool needing to re-derive them.
      const weightUnit = game.settings.get('swade', 'weightUnit') || 'imperial';
      const weightUnitLabel = weightUnit === 'metric' ? 'kg' : 'lbs';
      const encumbranceSteps = this.actor?.system?.attributes?.strength?.encumbranceSteps ?? 0;
      const carriedWeight = calculateCarriedWeight(this.character);
      const maxCarryWeight = calculateMaxCarryCapacity(this.character, { weightUnit, encumbranceSteps });
      const overEncumbered = carriedWeight > maxCarryWeight;

      const attributePointsMax = 5 + bonusAttributePoints;
      const skillPointsMax = 12 + bonusSkillPoints;
      const attributePointsRemaining = attributePointsMax - attributePointsUsed;
      const skillPointsRemaining = skillPointsMax - skillPointsUsed;
      const edgePointsRemaining = edgePointsAvailable - edgePointsUsed;
      const perkPointsRemaining = availablePerkPoints - perkPointsSpent;
      const gearRemaining = startingFunds - gearCost;

      // Live preview text for the Gear tab's "Apply to currency on Save" checkbox — shown
      // whether or not the box is checked, so the exact number is visible before opting in.
      // Save only ever touches currency if that checkbox is checked; see _saveActor().
      let gearCurrencyPreviewText = '';
      if (usesCurrency) {
        if (this.character.gearTabMode === 'starting') {
          gearCurrencyPreviewText = `sets currency to ${gearRemaining} ${currencyName}`;
        } else {
          const managementDelta = gearCost - (this.character.gearCostAtOpen ?? 0);
          if (managementDelta > 0) gearCurrencyPreviewText = `charges ${managementDelta} ${currencyName}`;
          else if (managementDelta < 0) gearCurrencyPreviewText = `refunds ${Math.abs(managementDelta)} ${currencyName}`;
          else gearCurrencyPreviewText = 'no change';
        }
      }

      // Flattened "Name dX" list for the Summary tab's compact skills line — precomputed here
      // rather than fought for in Handlebars, since skillsByAttribute is grouped by attribute
      // and comma-joining across nested {{#each}} loops has no clean @last equivalent.
      const summarySkills = Object.values(this.skillsByAttribute)
        .flat()
        .filter((skill) => skill.die)
        .map((skill) => `${skill.name} ${skill.die}`);

      // Manual Adjustments rows — one per budget pool the tool tracks, each naming which
      // tab/budget it actually feeds so the Ancestry tab's stepper controls are unambiguous.
      // Built here rather than in Handlebars so both the tab's rows and the Summary tab's
      // compact note line read from the same list.
      const manualOverridePools = [
        { pool: 'attribute', label: 'Attribute Points', hint: 'Traits tab attribute budget' },
        { pool: 'skill', label: 'Skill Points', hint: 'Traits tab skill budget' },
        { pool: 'edge', label: 'Edge Points', hint: 'Edges tab budget' },
        { pool: 'perk', label: 'Hindrance/Perk Points', hint: 'earned from Hindrances, capped at 4' },
      ];
      const manualOverrideRows = manualOverridePools.map((row) => ({
        ...row,
        amount: getManualBudgetOverrideAmount(this.character, row.pool),
        note: this.character.manualBudgetOverrides?.[row.pool]?.note || '',
      }));
      // Only pools that actually have a non-zero amount show up on the Summary tab.
      const activeManualOverrides = manualOverrideRows.filter((o) => o.amount !== 0);

      const data = {
        character: this.character,
        selectedAncestryData: selectedAncestryData,
        childItemsData: childItemsData,
        edgeChildItems: edgeChildItems,
        hindranceChildItems: hindranceChildItems,
        visibleHindrances: visibleHindrances,
        ancestries: this.compendiumData.ancestries,
        skills: this.compendiumData.skills,
        edges: this.compendiumData.edges,
        hindrances: this.compendiumData.hindrances,
        gearItems: this.compendiumData.gear,
        skillsByAttribute: this.skillsByAttribute,
        derivedStats: derivedStats,
        attributePointsUsed: attributePointsUsed,
        attributePointsRemaining: attributePointsRemaining,
        attributePointsMax: attributePointsMax,
        bonusAttributePoints: bonusAttributePoints,
        skillPointsUsed: skillPointsUsed,
        skillPointsRemaining: skillPointsRemaining,
        skillPointsMax: skillPointsMax,
        bonusSkillPoints: bonusSkillPoints,
        skillPointBreakdown: skillPointBreakdown,
        availablePerkPoints: availablePerkPoints,
        perkPointsSpent: perkPointsSpent,
        perkPointsRemaining: perkPointsRemaining,
        edgePointsAvailable: edgePointsAvailable,
        edgePointsUsed: edgePointsUsed,
        edgePointsRemaining: edgePointsRemaining,
        hindrancePointsUsed: hindrancePointsUsed,
        gearCost: gearCost,
        // Starting funds come from SWADE's native pcStartingCurrency setting, adjusted by any
        // matched Rich/Filthy Rich-type edge and Extra Funds perk allocations, or replaced
        // outright by the GM's manual override — see calculateStartingFunds().
        gearBudget: startingFunds,
        // Counts down as gear is added (budget minus spend), not up — matches how a player
        // actually tracks shopping money, rather than a spent-so-far total.
        gearRemaining: gearRemaining,
        gearFundsOverride: this.character.gearFundsOverride ?? '',
        summarySkills: summarySkills,
        ancestryAbilityChoices: this.character.ancestryAbilityChoices || {},
        unassignedAncestryChoices: unassignedAncestryChoices,
        showManualBudgetOverrides: this.character.showManualBudgetOverrides,
        activeManualOverrides: activeManualOverrides,
        manualOverrideRows: manualOverrideRows,
        usesCurrency: usesCurrency,
        currentTab: this.currentTab,
        expandedAncestry: this.character.expandedAncestry,
        expandedChildItems: this.character.expandedChildItems || {},
        perkSlots: perkSlots,
        tabGuidance: this._getTabGuidance(),
        currencyName: currencyName,
        currencyAmount: currencyAmount,
        currentCurrency: currentCurrency,
        carriedWeight: carriedWeight,
        maxCarryWeight: maxCarryWeight,
        weightUnitLabel: weightUnitLabel,
        overEncumbered: overEncumbered,
        gearCurrencyPreviewText: gearCurrencyPreviewText,
        attributes: DEFAULT_ATTRIBUTES,
        FREE_CORE_SKILLS: FREE_CORE_SKILLS,
        ancestryBonuses: ancestryBonuses,
        attributeDescriptions: ATTRIBUTE_DESCRIPTIONS,
        attributeTips: ATTRIBUTE_TIPS,
        characterRank: characterRank,
        totalAdvanceCount: totalAdvanceCount,
        attributeAdvanceWarning: attributeAdvanceWarning,
        advanceGroups: advanceGroups,
      };

      // Snapshot for the Save confirmation check — cheaper to read back here than to
      // recompute (edge points in particular depend on ancestry child items, which are
      // async and already resolved above during this same getData() pass).
      this._budgetSnapshot = {
        attributePointsRemaining: data.attributePointsRemaining,
        skillPointsRemaining: data.skillPointsRemaining,
        edgePointsRemaining: edgePointsRemaining,
        perkPointsRemaining: perkPointsRemaining,
        unassignedAncestryChoices: unassignedAncestryChoices,
      };

      return data;
    } catch (error) {
      console.error('[CharacterManager] getData() failed:', error);
      throw error;
    }
  }

  activateListeners(html) {
    try {
      super.activateListeners(html);

      // Setup tab navigation
      this.tabManager.setup(html, (tabName) => {
        this.currentTab = tabName;
      });

      // Summary tab's "Manage Gear" shortcut — jumps straight to the Gear tab using the same
      // switch mechanism as the tab-nav buttons, rather than making Gear feel like a separate
      // tool. See project memory on Gear tab scope for why a shortcut was tried before any
      // bigger separation (its own window, dropped from the tab bar) was considered.
      html.find('[data-action="goto-gear-tab"]').on('click', (e) => {
        e.preventDefault();
        this.tabManager.switchTab(html, 'gear', (tabName) => {
          this.currentTab = tabName;
        });
      });

      // Setup all tab handlers
      this._setupTabHandlers(html);

      // Form actions
      html.find('button[data-action="save"]').on('click', async () => {
        const confirmed = await this._confirmSaveEffects();
        if (!confirmed) return;
        await this._saveActor();
      });

      html.find('button[data-action="cancel"]').on('click', () => {
        this.close();
      });
    } catch (error) {
      console.error('[CharacterManager] activateListeners() error:', error);
    }
  }

  _setupTabHandlers(html) {
    Object.entries(this.tabHandlers).forEach(([tabName, handler]) => {
      if (handler && handler.setup) {
        const tabElement = html.find(`[data-tab="${tabName}"]`);
        if (tabElement.length) {
          try {
            handler.setup(tabElement);
          } catch (error) {
            console.error(`[CharacterManager] Error setting up ${tabName} handler:`, error);
          }
        } else {
          console.warn(`[CharacterManager] Tab element not found for: ${tabName}`);
        }
      }
    });
  }

  _getTabGuidance() {
    return TAB_GUIDANCE;
  }

  _initializeFreeCoreSkills() {
    if (!this.character.skills) {
      this.character.skills = {};
    }
  }

  _buildSkillsByAttribute() {
    this.skillsByAttribute = {
      agility: [],
      smarts: [],
      spirit: [],
      strength: [],
      vigor: [],
    };

    // character.skills is keyed by the actor's own item uuid (or a fresh compendium uuid
    // for a brand-new pick not yet saved), never by a compendium row's uuid directly — so
    // an existing skill has to be found by name, not by looking up skill.uuid as a key.
    const keyByName = new Map();
    for (const [uuid, skillData] of Object.entries(this.character.skills || {})) {
      if (skillData.name) keyByName.set(skillData.name.toLowerCase(), uuid);
    }

    const seenKeys = new Set();

    for (const skill of this.compendiumData.skills) {
      // Skip Unskilled Attempt (fallback skill, added separately at end)
      if (skill.name.toLowerCase() === 'unskilled attempt') {
        continue;
      }

      const attrLink = skill.attribute || 'smarts';
      if (this.skillsByAttribute[attrLink]) {
        const isCoreSkill = isFreeCoreSkill(skill.name);
        const existingKey = keyByName.get(skill.name.toLowerCase());
        const skillData = existingKey ? this.character.skills[existingKey] : null;
        this.skillsByAttribute[attrLink].push({
          uuid: existingKey || skill.uuid,
          name: skill.name,
          isCoreSkill: isCoreSkill,
          die: skillData?.die ?? (isCoreSkill ? 'd4' : null),
          fromAncestry: skillData?.fromAncestry || false,
          description: skill.description || '',
        });
        if (existingKey) seenKeys.add(existingKey);
      }
    }

    // Include skills the actor has that aren't in the configured compendium (e.g. added
    // from another source) so they still display — the compendium is only a suggestion
    // list, not a filter on what can show up here.
    for (const [uuid, skillData] of Object.entries(this.character.skills || {})) {
      if (seenKeys.has(uuid) || !skillData.die) continue;

      const attrLink = skillData.attribute || 'smarts';
      if (!this.skillsByAttribute[attrLink]) continue;

      this.skillsByAttribute[attrLink].push({
        uuid,
        name: skillData.name || '(unknown skill)',
        isCoreSkill: isFreeCoreSkill(skillData.name),
        die: skillData.die,
        fromAncestry: skillData.fromAncestry || false,
        description: skillData.description || '',
        external: true,
      });
    }
  }

  _getSkillCompendiumMap() {
    const map = {};
    for (const skill of this.compendiumData.skills) {
      map[skill.uuid] = {
        name: skill.name,
        linkedAttribute: skill.attribute || 'smarts',
      };
    }
    return map;
  }

  /**
   * Fetch the full item data for anything an item grants via `system.grants` (ancestral
   * abilities from an Ancestry, or edges/hindrances granted by things like Arcane Background
   * edges), enriched and with per-item expand state — the same shape used for the Ancestry
   * tab's "Ancestral Abilities" list, reused here for Edges/Hindrances child items.
   *
   * @param {string} itemUuid - uuid of the granting item (used to fetch it if not preloaded)
   * @param {Object} [itemData] - already-fetched item data, to avoid a redundant fetch
   * @returns {Promise<Array>} Array of granted item data, each with an `isExpanded` flag
   */
  async _getGrantedChildItems(itemUuid, itemData = null) {
    const parentData = itemData || await getItemPreview(itemUuid);

    if (!Array.isArray(parentData?.system?.grants)) {
      return [];
    }

    const results = await Promise.all(parentData.system.grants.map(async (grant) => {
      try {
        const childData = await getItemPreview(grant.uuid);
        if (childData) {
          if (childData.system?.description) {
            childData.system.description = await TextEditor.enrichHTML(childData.system.description, { async: true });
          }
          childData.isExpanded = this.character.expandedChildItems[childData.uuid] || false;
          return childData;
        }
      } catch (e) {
        console.warn('[Character Manager] Failed to load granted item:', grant.uuid);
      }
      return null;
    }));

    return results.filter(Boolean);
  }

  /**
   * Detect skills already on the actor (embedded Items, not system.skills) and map them to
   * matching compendium skill entries by name. Skills that aren't in the configured
   * compendium are still included, keyed by their own item uuid, with enough of their own
   * data (name/attribute/description) to display standalone — the compendium is only a
   * suggestion source, not a filter on what's allowed to appear.
   */
  async _detectSkillsFromActor(actor) {
    const skills = {};
    const sidesToDie = { 4: 'd4', 6: 'd6', 8: 'd8', 10: 'd10', 12: 'd12' };

    for (const skillItem of actor.items.filter(item => item.type === 'skill')) {
      // Unskilled Attempt is a catch-all every actor has; it's never player-selected
      // or changed, so it's excluded from detection entirely (added back at save time).
      if (skillItem.name.toLowerCase() === 'unskilled attempt') continue;

      const compendiumSkill = this.compendiumData.skills.find(
        s => s.name.toLowerCase() === skillItem.name.toLowerCase()
      );

      // Source data, not skillItem.system — the latter is derived/post-Active-Effects, and a
      // die value read here gets written straight back to the item as its new base on Save
      // (see _saveSkillsToActor), same risk as the attribute bug this mirrors: a temporary
      // effect targeting this skill's die would otherwise get permanently baked in.
      const sourceSystem = skillItem.toObject().system || {};

      let die = 'd4';
      const dieValue = sourceSystem.die;
      if (dieValue && typeof dieValue === 'object' && dieValue.sides) {
        die = sidesToDie[dieValue.sides] || 'd4';
      } else if (typeof dieValue === 'string') {
        die = dieValue;
      }

      const grantedByAncestry = !!skillItem.grantedBy;
      // Always key by the actor's own item — see _detectGearFromActor for why.
      const key = skillItem.uuid;
      skills[key] = {
        die,
        advances: sourceSystem.advances ?? 0,
        fromAncestry: grantedByAncestry,
        // Baseline die granted for free; increases above this still cost points
        grantedDie: grantedByAncestry ? die : undefined,
        // Always stored (not just as a "not in compendium" fallback) — _buildSkillsByAttribute
        // needs the name to find this entry by name-match, and calculator.js's skill-point
        // cost lookup needs the linked attribute, since the key is the actor's own item uuid
        // rather than any compendium uuid it could otherwise be looked up by.
        name: skillItem.name,
        attribute: compendiumSkill?.attribute || sourceSystem.attribute || 'smarts',
        description: compendiumSkill?.description || sourceSystem.description || '',
      };
    }

    return skills;
  }

  /**
   * Detect edges already on the actor (embedded Items, not system.edges) and map them to
   * matching compendium edge entries by name. Edges that aren't in the configured compendium
   * are still included, keyed by their own item uuid and built entirely from the actor's own
   * item data — the compendium is only a suggestion source, not a filter on what can display.
   * Excludes edges granted by another item (e.g. ancestral abilities) via `item.grantedBy`,
   * since those are automatic bonuses, not player choices made on this tab.
   */
  async _detectEdgesFromActor(actor) {
    const edgeItems = actor.items.filter(item => item.type === 'edge' && !item.grantedBy);

    const entries = await Promise.all(edgeItems.map(async (edgeItem) => {
      const compendiumEdge = this.compendiumData.edges.find(
        e => e.name.toLowerCase() === edgeItem.name.toLowerCase()
      );

      // Always key by the actor's own item — never the compendium uuid. See the same
      // fix in _detectGearFromActor for why: a shared compendium-uuid key collapses
      // distinct actor items and breaks save reconciliation's existing-item lookup.
      const key = edgeItem.uuid;
      const requirements = Array.isArray(edgeItem.system?.requirements)
        ? edgeItem.system.requirements.map(r => (typeof r?.toString === 'function' ? r.toString() : '')).filter(Boolean)
        : compendiumEdge?.requirements || [];

      return [key, {
        uuid: key,
        name: compendiumEdge?.name || edgeItem.name,
        expanded: false,
        img: edgeItem.img || compendiumEdge?.img || '',
        requirements,
        description: edgeItem.system?.description
          ? await TextEditor.enrichHTML(edgeItem.system.description, { async: true })
          : '',
      }];
    }));

    return Object.fromEntries(entries);
  }

  /**
   * Detect hindrances already on the actor (embedded Items, not system.hindrances) and map
   * them to matching compendium hindrance entries by name. Hindrances that aren't in the
   * configured compendium are still included, keyed by their own item uuid and built
   * entirely from the actor's own item data — the compendium is only a suggestion source,
   * not a filter on what can display.
   * Excludes hindrances granted by another item (e.g. ancestral abilities) via `item.grantedBy`,
   * since those are automatic bonuses, not player choices made on this tab.
   */
  async _detectHindrancesFromActor(actor) {
    const hindranceItems = actor.items.filter(item => item.type === 'hindrance' && !item.grantedBy);

    const entries = await Promise.all(hindranceItems.map(async (hindranceItem) => {
      const compendiumHindrance = this.compendiumData.hindrances.find(
        h => h.name.toLowerCase() === hindranceItem.name.toLowerCase()
      );

      // Always key by the actor's own item — see _detectGearFromActor for why.
      const key = hindranceItem.uuid;
      const major = hindranceItem.system?.major ?? compendiumHindrance?.major ?? false;

      return [key, {
        uuid: key,
        name: compendiumHindrance?.name || hindranceItem.name,
        major,
        severity: hindranceItem.system?.severity ?? compendiumHindrance?.severity ?? 'either',
        points: major ? 2 : 1,
        expanded: false,
        img: hindranceItem.img || compendiumHindrance?.img || '',
        description: hindranceItem.system?.description
          ? await TextEditor.enrichHTML(hindranceItem.system.description, { async: true })
          : '',
      }];
    }));

    return Object.fromEntries(entries);
  }

  /**
   * Detect gear already on the actor (embedded Items of type gear/weapon/armor/shield) and
   * map them to matching compendium entries by name. Items that aren't in the configured
   * compendiums are still included, keyed by their own item uuid and built entirely from the
   * actor's own item data — the compendium is only a suggestion source, not a filter on what
   * can display. Excludes items granted by another item (e.g. ancestral abilities), same as
   * Edges/Hindrances detection.
   */
  async _detectGearFromActor(actor) {
    const gearItems = actor.items.filter(isTrackedGearItem);

    const entries = await Promise.all(gearItems.map(async (gearItem) => {
      const compendiumGear = this.compendiumData.gear.find(
        g => g.name.toLowerCase() === gearItem.name.toLowerCase()
      );

      // Always key by the actor's own item — never the compendium uuid. Two actor items
      // that happen to share a name (e.g. two separately-added Greatswords) are still two
      // distinct rows; keying by a shared compendium uuid collapsed them into one entry
      // and made _saveGearToActor's existing-item lookup miss, deleting and recreating
      // the item on every save (losing any per-item edits) instead of patching quantity.
      const key = gearItem.uuid;
      const { price, minStr, armor, weight } = resolveGearFields(compendiumGear, gearItem);
      return [key, {
        uuid: key,
        name: compendiumGear?.name || gearItem.name,
        price,
        quantity: gearItem.system?.quantity ?? 1,
        minStr,
        armor,
        weight,
        expanded: false,
        img: gearItem.img || compendiumGear?.img || '',
        description: gearItem.system?.description
          ? await TextEditor.enrichHTML(gearItem.system.description, { async: true })
          : '',
      }];
    }));

    return Object.fromEntries(entries);
  }

  /**
   * Detect existing advances straight from SWADE's real schema (`actor.system.advances.list`)
   * — no separate flag/ledger, since that array already has everything Character Manager
   * needs (type + notes + planned; no target field, matching how native SWADE tracks
   * advances too). Planned entries are kept, not filtered out — same "Planned" toggle as
   * SWADE's own Advances tab, mirrored here; they display but don't count toward Rank/budgets
   * (see calculateAdvanceTypeCounts/calculateTotalAdvanceCount in calculator.js).
   */
  _detectAdvancesFromActor(actor) {
    const list = actor.system?.advances?.list || [];
    return list.map((entry) => ({
      id: entry.id || foundry.utils.randomID(),
      type: ADVANCE_TYPE_ENUM_REVERSE[entry.type] ?? 'edge',
      // SWADE's `notes` field is an HTMLField (rich text, editable via the vanilla actor
      // sheet's ProseMirror editor) — this tab's notes field is a plain <input>, so any tags
      // need stripping on read or they'd show up literally (e.g. "<p>Fast Draw</p>").
      notes: this._stripHtmlToPlainText(entry.notes),
      planned: !!entry.planned,
    }));
  }

  /**
   * Convert a rich-text HTML string (e.g. SWADE's advances `notes` HTMLField) to plain text
   * for display in a plain <input> — strips tags and decodes entities via a detached element
   * (rather than a regex strip, which wouldn't decode entities like &amp;). Block-level breaks
   * (<p>, <div>, <li>, <br>) are converted to a space first, since `textContent` inserts no
   * separator of its own between block elements — without this, a multi-paragraph note like
   * "<p>Line one</p><p>Line two</p>" would collapse into "Line oneLine two". A space rather
   * than a newline, since the target field here is single-line.
   */
  _stripHtmlToPlainText(html) {
    if (typeof html !== 'string' || !html) return '';
    const withSeparators = html
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/(p|div|li)\s*>/gi, ' ');
    const div = document.createElement('div');
    div.innerHTML = withSeparators;
    return (div.textContent || div.innerText || '').replace(/\s+/g, ' ').trim();
  }

  async _updateObject(event, formData) {
    // No-op on standard form submission
    return;
  }

  /**
   * Reconcile the actor's gear/weapon/armor/shield items with the current selections. Never
   * deletes and recreates an item that's already on the actor — only its `quantity` is ever
   * patched in place, so any homebrew tweaks to an existing item are always preserved (at the
   * cost of not auto-picking-up later compendium edits, an accepted tradeoff). New selections
   * are created fresh from their source item; anything on the actor no longer in the current
   * selection (an explicit Remove) is deleted.
   */
  async _saveGearToActor(actor) {
    const existingGear = actor.items.filter(isTrackedGearItem);
    const existingByUuid = new Map(existingGear.map(item => [item.uuid, item]));
    const toDelete = new Set(existingGear.map(item => item.id));

    const toCreate = [];
    const toPatchQuantity = [];

    for (const gearData of Object.values(this.character.gear || {})) {
      const existingItem = existingByUuid.get(gearData.uuid);
      if (existingItem) {
        toDelete.delete(existingItem.id);
        toPatchQuantity.push({ id: existingItem.id, quantity: gearData.quantity ?? 1 });
      } else {
        const sourceItem = await fromUuid(gearData.uuid);
        if (!sourceItem) continue;
        const itemData = sourceItem.toObject();
        delete itemData._id;
        itemData.system.quantity = gearData.quantity ?? 1;
        toCreate.push({ itemData, compendiumUuid: gearData.uuid });
      }
    }

    if (toDelete.size > 0) {
      await actor.deleteEmbeddedDocuments('Item', Array.from(toDelete));
    }

    if (toPatchQuantity.length > 0) {
      await actor.updateEmbeddedDocuments('Item', toPatchQuantity.map(({ id, quantity }) => ({
        _id: id,
        'system.quantity': quantity,
      })));
    }

    for (const { itemData, compendiumUuid } of toCreate) {
      const created = await actor.createEmbeddedDocuments('Item', [itemData]);
      if (created.length > 0) {
        await created[0].setFlag(MODULE_ID, 'compendiumUuid', compendiumUuid);
      }
    }
  }

  /**
   * Reconcile the actor's ancestry item with the current selection. Unlike the other
   * tabs there's only ever one, scalar selection rather than a keyed set, but the same
   * "leave it alone if it already matches" principle applies: the existing item is left
   * completely untouched — preserving any customization (renamed, edited description,
   * etc.) — whenever it already represents the current selection, whether that's because
   * it was previously created from this exact compendium uuid, or because it's a
   * non-compendium ancestry (dragged on, or from an unlisted compendium) that the user
   * hasn't changed. Only an actual change of ancestry causes a delete+create.
   */
  async _saveAncestryToActor(actor) {
    const existingAncestry = actor.items.find(item => item.type === 'ancestry');

    if (!this.character.ancestry) {
      if (existingAncestry) {
        await actor.deleteEmbeddedDocuments('Item', [existingAncestry.id]);
      }
      return;
    }

    if (existingAncestry) {
      const existingUuid = existingAncestry.getFlag(MODULE_ID, 'compendiumUuid') || existingAncestry.uuid;
      if (existingUuid === this.character.ancestry) {
        return;
      }
    }

    const ancestryItem = await fromUuid(this.character.ancestry);
    if (!ancestryItem) {
      ui.notifications.warn('[Character Creation] Could not resolve the selected ancestry; keeping the existing one on the actor.');
      return;
    }

    if (existingAncestry) {
      await actor.deleteEmbeddedDocuments('Item', [existingAncestry.id]);
    }

    const itemData = ancestryItem.toObject();
    delete itemData._id;
    const created = await actor.createEmbeddedDocuments('Item', [itemData]);
    if (created.length > 0) {
      await created[0].setFlag(MODULE_ID, 'compendiumUuid', this.character.ancestry);
    }
  }

  /**
   * Reconcile the actor's edge items with the current selections, same pattern as
   * _saveGearToActor: existing items are matched by their own uuid (never a compendium
   * uuid) and left untouched, new selections are created fresh, anything no longer
   * selected is deleted. Edges have no per-instance mutable field, so there's no patch step.
   */
  async _saveEdgesToActor(actor) {
    const existingEdges = actor.items.filter(item => item.type === 'edge' && !item.grantedBy);
    const existingByUuid = new Map(existingEdges.map(item => [item.uuid, item]));
    const toDelete = new Set(existingEdges.map(item => item.id));

    const toCreate = [];

    for (const key of Object.keys(this.character.edges || {})) {
      const existingItem = existingByUuid.get(key);
      if (existingItem) {
        toDelete.delete(existingItem.id);
      } else {
        const sourceItem = await fromUuid(key);
        if (!sourceItem) continue;
        const itemData = sourceItem.toObject();
        delete itemData._id;
        toCreate.push(itemData);
      }
    }

    if (toDelete.size > 0) {
      await actor.deleteEmbeddedDocuments('Item', Array.from(toDelete));
    }

    if (toCreate.length > 0) {
      await actor.createEmbeddedDocuments('Item', toCreate);
    }
  }

  /**
   * Reconcile the actor's hindrance items with the current selections, same pattern as
   * _saveGearToActor. Major/minor is the one per-instance mutable field (toggled via the
   * tab's radio buttons), so existing items get that patched in place rather than recreated.
   */
  async _saveHindrancesToActor(actor) {
    const existingHindrances = actor.items.filter(item => item.type === 'hindrance' && !item.grantedBy);
    const existingByUuid = new Map(existingHindrances.map(item => [item.uuid, item]));
    const toDelete = new Set(existingHindrances.map(item => item.id));

    const toCreate = [];
    const toPatchMajor = [];

    for (const [key, hindranceData] of Object.entries(this.character.hindrances || {})) {
      const existingItem = existingByUuid.get(key);
      if (existingItem) {
        toDelete.delete(existingItem.id);
        toPatchMajor.push({ id: existingItem.id, major: hindranceData.major ?? false });
      } else {
        const sourceItem = await fromUuid(key);
        if (!sourceItem) continue;
        const itemData = sourceItem.toObject();
        delete itemData._id;
        itemData.system.major = hindranceData.major ?? false;
        toCreate.push(itemData);
      }
    }

    if (toDelete.size > 0) {
      await actor.deleteEmbeddedDocuments('Item', Array.from(toDelete));
    }

    if (toPatchMajor.length > 0) {
      await actor.updateEmbeddedDocuments('Item', toPatchMajor.map(({ id, major }) => ({
        _id: id,
        'system.major': major,
      })));
    }

    if (toCreate.length > 0) {
      await actor.createEmbeddedDocuments('Item', toCreate);
    }
  }

  /**
   * Reconcile the actor's skill items with the current selections, same pattern as
   * _saveGearToActor. Die and advances are the per-instance mutable fields, patched in
   * place on existing items. Ancestry-granted skills are excluded entirely — they're
   * managed by whatever grants them, not by this tab. A skill with no die selected (e.g.
   * added then immediately cleared) is treated as not actually taken and skipped.
   *
   * If the "Use Curated Skill Icons" setting is on, any skill that name-matches a
   * compendium entry also gets its icon and description replaced with the compendium's
   * version — lets a SWADE core-created character's default skills be re-skinned to this
   * kit's curated equivalents without touching die/advances/identity.
   */
  async _saveSkillsToActor(actor) {
    const dieToSides = { d4: 4, d6: 6, d8: 8, d10: 10, d12: 12 };
    const useCuratedIcons = game.settings.get(MODULE_ID, 'useCuratedSkillIcons');
    const existingSkills = actor.items.filter(item =>
      item.type === 'skill' && !item.grantedBy && item.name.toLowerCase() !== 'unskilled attempt'
    );
    const existingByUuid = new Map(existingSkills.map(item => [item.uuid, item]));
    const toDelete = new Set(existingSkills.map(item => item.id));

    const toCreate = [];
    const toPatch = [];

    for (const [key, skillData] of Object.entries(this.character.skills || {})) {
      if (skillData.fromAncestry || !skillData.die) continue;

      const compendiumMatch = useCuratedIcons
        ? this.compendiumData.skills.find(s => s.name.toLowerCase() === (skillData.name || '').toLowerCase())
        : null;

      const existingItem = existingByUuid.get(key);
      if (existingItem) {
        toDelete.delete(existingItem.id);
        toPatch.push({
          id: existingItem.id,
          sides: dieToSides[skillData.die] ?? 4,
          advances: skillData.advances ?? 0,
          img: compendiumMatch?.img || undefined,
          description: compendiumMatch?.description || undefined,
        });
      } else {
        const sourceItem = await fromUuid(key);
        if (!sourceItem) continue;
        const itemData = sourceItem.toObject();
        delete itemData._id;
        itemData.system.die = { ...itemData.system.die, sides: dieToSides[skillData.die] ?? 4 };
        itemData.system.advances = skillData.advances ?? 0;
        if (compendiumMatch?.img) itemData.img = compendiumMatch.img;
        if (compendiumMatch?.description) itemData.system.description = compendiumMatch.description;
        toCreate.push(itemData);
      }
    }

    if (toDelete.size > 0) {
      await actor.deleteEmbeddedDocuments('Item', Array.from(toDelete));
    }

    if (toPatch.length > 0) {
      await actor.updateEmbeddedDocuments('Item', toPatch.map(({ id, sides, advances, img, description }) => {
        const update = {
          _id: id,
          'system.die.sides': sides,
          'system.advances': advances,
        };
        if (img) update.img = img;
        if (description) update['system.description'] = description;
        return update;
      }));
    }

    if (toCreate.length > 0) {
      await actor.createEmbeddedDocuments('Item', toCreate);
    }
  }

  /**
   * "Starting Equipment" mode: currency is a creation budget, not pre-existing wealth to
   * protect — Save simply sets it to the budget minus what's been spent. A direct set, not a
   * delta credit, so re-saving the same gear list is naturally idempotent and a truly-fresh
   * actor (SWADE's own `_preCreate` already seeded it with `pcStartingCurrency`) ends up at
   * the correct leftover instead of double-counted. Safe specifically because the mode is an
   * explicit, visible choice — Gear Management mode (below) never touches currency this way.
   * No-op when SWADE's wealth type isn't numeric currency.
   */
  async _reconcileStartingFunds(actor, startingFunds, gearCost) {
    if (game.settings.get('swade', 'wealthType') !== 'currency') return;
    await actor.update({ 'system.details.currency': startingFunds - gearCost });
  }

  /**
   * "Gear Management" mode: there's no creation budget here, just an established character's
   * actual wealth — so Save debits/credits only the *change* in gear cost since this session
   * opened (`character.gearCostAtOpen`, snapshotted from the actor's real items at open time),
   * same mental model as a shopping trip: buy something, pay for it; return something, get
   * refunded. Gear the actor already owned coming in is never charged for again. No hard floor
   * at 0 — an overspend just leaves currency negative, consistent with this tool's "warn, don't
   * block" philosophy elsewhere. No-op when SWADE's wealth type isn't numeric currency.
   */
  async _reconcileGearManagementFunds(actor, gearCost) {
    if (game.settings.get('swade', 'wealthType') !== 'currency') return;

    const gearCostAtOpen = this.character.gearCostAtOpen ?? 0;
    const costDelta = gearCost - gearCostAtOpen;
    if (costDelta === 0) return;

    const currentCurrency = actor.system?.details?.currency ?? 0;
    await actor.update({ 'system.details.currency': currentCurrency - costDelta });
  }

  /**
   * Persist (or clear) the GM's manual "override starting funds" input as an actor flag, so
   * it survives reopening Character Manager rather than being recomputed and silently discarded.
   * No-op when SWADE's wealth type isn't numeric currency — the input is hidden in that case.
   */
  async _persistGearFundsOverride(actor) {
    if (game.settings.get('swade', 'wealthType') !== 'currency') return;

    const override = this.character.gearFundsOverride;
    if (override === null || override === undefined || override === '') {
      await actor.unsetFlag(MODULE_ID, 'gearFundsOverride');
      return;
    }

    const overrideValue = Number(override);
    if (!Number.isNaN(overrideValue)) {
      await actor.setFlag(MODULE_ID, 'gearFundsOverride', overrideValue);
    }
  }

  /**
   * Persist the Gear tab's "Starting Equipment" vs "Gear Management" toggle so it survives
   * reopening Character Manager instead of re-defaulting from advances/existing-gear every time.
   */
  async _persistGearTabMode(actor) {
    await actor.setFlag(MODULE_ID, 'gearTabMode', this.character.gearTabMode);
  }

  /**
   * Shared "does this actor look like it's already been played, not just created" signal —
   * used both to pick the Gear tab's default mode and to decide whether Starting Equipment
   * mode's Save needs a confirmation warning. Kept in one place so the two never drift out of
   * sync with each other. Checks the actor's real state, not the staged `character` object,
   * since this is specifically about protecting real data the actor already has.
   *
   * @returns {boolean}
   */
  _actorLooksEstablished(actor) {
    return actor.system?.advances?.list?.length > 0
      || actor.items.some(isTrackedGearItem);
  }

  /**
   * Single confirmation dialog for everything worth double-checking right before Save commits:
   * unspent Attribute/Skill/Edge points, and exactly what will happen to currency. Combined
   * into one dialog (rather than two sequential ones) so the currency line — which appears on
   * every save, checked or not — doesn't read as a second, separate gate on top of the
   * point-budget warning; it's one review of "here's what Save is about to do."
   *
   * Leftover Hindrance points and gear silver are intentionally NOT checked here: taking fewer
   * hindrances or not spending every last coin isn't a mistake the way an unspent creation
   * point usually is.
   *
   * @returns {Promise<boolean>} True if the user confirmed (or there was nothing to confirm)
   */
  async _confirmSaveEffects() {
    const lines = [];
    let hasRiskyChange = false;

    if (game.settings.get('swade', 'wealthType') === 'currency') {
      const currencyName = game.settings.get('swade', 'currencyName') || 'Silver';

      if (!this.character.applyCurrencyOnSave) {
        lines.push('Currency will <strong>not</strong> change.');
      } else {
        const pcStartingCurrency = game.settings.get('swade', 'pcStartingCurrency') || 600;
        const richFundsMultipliers = parseRichFundsMultipliers(game.settings.get(MODULE_ID, 'richFundsMultipliers'));
        const startingFunds = calculateStartingFunds(this.character, { pcStartingCurrency, richFundsMultipliers });
        const gearCost = calculateGearCost(this.character);

        if (this.character.gearTabMode === 'starting') {
          lines.push(`Currency will be <strong>set to ${startingFunds - gearCost} ${currencyName}</strong>.`);
          hasRiskyChange = true;
        } else {
          const delta = gearCost - (this.character.gearCostAtOpen ?? 0);
          if (delta > 0) {
            lines.push(`Currency will be <strong>charged ${delta} ${currencyName}</strong>.`);
            hasRiskyChange = true;
          } else if (delta < 0) {
            lines.push(`Currency will be <strong>refunded ${Math.abs(delta)} ${currencyName}</strong>.`);
            hasRiskyChange = true;
          } else {
            lines.push('Currency will <strong>not</strong> change (no gear cost change this session).');
          }
        }
      }
    }

    const snapshot = this._budgetSnapshot || {};
    const unspent = [];
    if ((snapshot.attributePointsRemaining ?? 0) > 0) {
      unspent.push(`${snapshot.attributePointsRemaining} attribute point${snapshot.attributePointsRemaining === 1 ? '' : 's'}`);
    }
    if ((snapshot.skillPointsRemaining ?? 0) > 0) {
      unspent.push(`${snapshot.skillPointsRemaining} skill point${snapshot.skillPointsRemaining === 1 ? '' : 's'}`);
    }
    if ((snapshot.edgePointsRemaining ?? 0) > 0) {
      unspent.push(`${snapshot.edgePointsRemaining} edge point${snapshot.edgePointsRemaining === 1 ? '' : 's'}`);
    }
    if ((snapshot.perkPointsRemaining ?? 0) > 0) {
      unspent.push(`${snapshot.perkPointsRemaining} perk point${snapshot.perkPointsRemaining === 1 ? '' : 's'}`);
    }
    if ((snapshot.unassignedAncestryChoices ?? 0) > 0) {
      unspent.push(`${snapshot.unassignedAncestryChoices} unassigned ancestry bonus${snapshot.unassignedAncestryChoices === 1 ? '' : 'es'}`);
    }
    if (unspent.length > 0) {
      lines.push(`This character still has unspent ${unspent.join(', ')}.`);
      hasRiskyChange = true;
    }

    if (lines.length === 0) return true;

    const result = await Dialog.confirm({
      title: 'Confirm Save',
      content: `${lines.map((line) => `<p>${line}</p>`).join('')}<p>Continue saving?</p>`,
      yes: () => true,
      no: () => false,
      defaultYes: !hasRiskyChange,
    });

    return result === true;
  }

  /**
   * Convert our attribute format ({die: 'd6', advances: 0}) into flat dot-notation updates for
   * SWADE's real schema (system.attributes.<name>.die is a {sides, modifier} SchemaField, not a
   * plain string — writing the string directly is silently dropped by Foundry's validation, which
   * is why attribute die changes weren't persisting). Dot-notation also patches only the `sides`
   * leaf, so sibling fields (`modifier`, smarts' `animal`, etc.) are left untouched — a nested
   * {die: {sides}} object risked replacing the whole `die` sub-schema instead.
   *
   * `attrData.die` is the *effective* die (raw base + any ancestry floor, folded in by
   * applyAncestryAttributeFloors for display/editing). An ADD-mode ancestry bonus (e.g. a transfer
   * effect adding +2 sides) re-applies on top of whatever base we write, so writing the effective
   * die verbatim would double it — subtracting the ADD bonus back out here restores the correct
   * base so the actor's own effect is the only thing granting it. OVERRIDE-mode (or unrecognized)
   * bonuses are left alone, since an override ignores the base value entirely and can't double.
   *
   * @param {Object} attributes - this.character.attributes
   * @param {Object} [ancestryBonuses] - See getAncestryAttributeBonuses; from this._ancestryBonuses
   */
  _attributesToUpdateData(attributes, ancestryBonuses = {}) {
    const dieToSides = { d4: 4, d6: 6, d8: 8, d10: 10, d12: 12 };
    const result = {};
    for (const [attrName, attrData] of Object.entries(attributes || {})) {
      let sides = dieToSides[attrData.die] ?? 4;
      const bonus = ancestryBonuses?.[attrName];
      if (bonus?.mode === CONST.ACTIVE_EFFECT_MODES.ADD) {
        const bonusSides = (dieToSides[bonus.die] ?? 4) - 4;
        sides = Math.max(4, sides - bonusSides);
      }
      result[`system.attributes.${attrName}.die.sides`] = sides;
    }
    return result;
  }

  /**
   * Convert character.advances[] into SWADE's real `system.advances.list` shape. `sort` must
   * be 1-based (matching SWADE's own `advances.size + 1` when it creates a new advance,
   * confirmed in systems/swade/swade.js) — its own rank derivation (getRankFromAdvance) bands
   * directly off this number (≤3 Novice, 4-7 Seasoned, ...), so a 0-based sort would put the
   * 4th advance back in Novice instead of Seasoned. `rank` mirrors the same banding via
   * getRankIndexFromAdvanceNumber() rather than being user-entered. `planned` carries through
   * the Advancement tab's own "Planned" toggle — SWADE excludes planned entries from
   * `advances.value`/`.rank` (`activeAdvances = list.filter(a => !a.planned)`), which
   * calculateTotalAdvanceCount() mirrors. `mode` is forced to 'expanded' (SWADE's own default)
   * so the system's own rank/value derivation stays active regardless of what the actor had
   * before.
   */
  _advancesToUpdateData(advances) {
    const list = (advances || []).map((advance, index) => ({
      id: advance.id || foundry.utils.randomID(),
      type: ADVANCE_TYPE_ENUM[advance.type] ?? 0,
      notes: advance.notes || '',
      sort: index + 1,
      rank: getRankIndexFromAdvanceNumber(index + 1),
      planned: !!advance.planned,
    }));
    return { mode: 'expanded', list };
  }

  /**
   * Save the current selections onto the actor this Character Manager was opened for.
   * This tool only ever edits an existing actor — it doesn't create new characters — so
   * there's no "no actor" branch here.
   */
  async _saveActor() {
    try {
      if (!this.character.name) {
        ui.notifications.warn('[Character Creation] Please enter a character name');
        return;
      }

      const updateData = {
        name: this.character.name,
        system: {
          details: {
            archetype: this.character.archetype,
            notes: this.character.concept,
          },
          advances: this._advancesToUpdateData(this.character.advances),
        },
        ...this._attributesToUpdateData(this.character.attributes, this._ancestryBonuses),
      };

      await this.actor.update(updateData);

      await this._saveAncestryToActor(this.actor);

      const pcStartingCurrency = game.settings.get('swade', 'pcStartingCurrency') || 600;
      const richFundsMultipliers = parseRichFundsMultipliers(game.settings.get(MODULE_ID, 'richFundsMultipliers'));
      const startingFunds = calculateStartingFunds(this.character, { pcStartingCurrency, richFundsMultipliers });
      const gearCost = calculateGearCost(this.character);

      await this._saveSkillsToActor(this.actor);
      await this._saveEdgesToActor(this.actor);
      await this._saveHindrancesToActor(this.actor);
      await this._saveGearToActor(this.actor);
      if (this.character.gearTabMode === 'starting') {
        if (this.character.applyCurrencyOnSave) {
          await this._reconcileStartingFunds(this.actor, startingFunds, gearCost);
        }
        await this._persistGearFundsOverride(this.actor);
      } else if (this.character.applyCurrencyOnSave) {
        await this._reconcileGearManagementFunds(this.actor, gearCost);
      }
      await this._persistGearTabMode(this.actor);
      await this.actor.setFlag(MODULE_ID, 'perkPointAllocations', this.character.perkPointAllocations || []);
      // Stored as an array, not an object keyed by uuid — see the load-side comment above.
      await this.actor.setFlag(MODULE_ID, 'ancestryAbilityChoices',
        Object.entries(this.character.ancestryAbilityChoices || {}).map(([uuid, choice]) => ({ uuid, choice })));
      await this.actor.setFlag(MODULE_ID, 'manualBudgetOverrides', this.character.manualBudgetOverrides || {});

      ui.notifications.info(`[Character Creation] Saved: ${this.actor.name}`);
      this.close();
    } catch (error) {
      console.error('[Character Manager] Failed to save actor:', error);
      ui.notifications.error('[Character Creation] Failed to save character');
    }
  }
}

Handlebars.registerHelper('objLength', (obj) => {
  if (typeof obj !== 'object' || obj === null) return 0;
  return Object.keys(obj).length;
});

Handlebars.registerHelper('gte', (a, b) => a >= b);

Handlebars.registerHelper('multiply', (a, b) => (a ?? 0) * (b ?? 0));

Handlebars.registerHelper('capitalize', (str) => {
  if (typeof str !== 'string') return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
});

window.CharacterManager = CharacterManager;

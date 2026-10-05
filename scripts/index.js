/**
 * Character Creation Tools - Public API
 *
 * Isolated module for building out an existing SWADE actor's ancestry/skills/edges/
 * hindrances/gear/advancement, all via CharacterManager's tabs. Edits an existing actor
 * only — it doesn't create a new actor document.
 * No dependencies on preset system or icon remapper.
 * Read-only access to compendiums.
 *
 * Usage:
 *   // In module init hook:
 *   import { setupCharacterCreationTools } from './index.js';
 *   setupCharacterCreationTools();
 *
 *   // To open character manager for an existing actor:
 *   const manager = new CharacterManager({ actor });
 *   manager.render(true);
 */

import { CharacterManager, invalidateCompendiumCache } from './CharacterManager.js';
import { CORE_RULES_DEFAULT_PACK_IDS } from './lib/compendium-utils.js';
import { CompendiumPackSelector } from './CompendiumPackSelector.js';

const MODULE_ID = 'swade-character-manager';

/**
 * Register Character Manager's settings and any future menu entries/keyboard shortcuts.
 * Called from scripts/main.js during module init.
 */
export function setupCharacterCreationTools() {
  game.settings.register(MODULE_ID, 'bonusEdgePointAbilityNames', {
    name: 'Free-Edge Ancestral Ability Names',
    hint: "Comma-separated ancestral ability names (e.g. 'Adaptable') that grant a free Edge at character creation. Matched by name, so this works with any ancestry from any compendium/setting — add more names here if another setting's Human (or other) ancestry uses a different term.",
    scope: 'world',
    config: true,
    type: String,
    default: 'Adaptable'
  });

  game.settings.register(MODULE_ID, 'ancestryChoiceAbilityNames', {
    name: 'Bonus-Choice Ancestral Ability Names',
    hint: "Comma-separated ancestral ability names (e.g. 'Half-Elves-Heritage') that let the player pick a bonus (Edge/Attribute/Skill point) on the Ancestry tab, for abilities whose compendium entry has no mechanical effects of its own. Matched by name — add more here for other settings' similar \"choose one\" heritage abilities.",
    scope: 'world',
    config: true,
    type: String,
    default: 'Half-Elves-Heritage'
  });

  game.settings.register(MODULE_ID, 'useCuratedSkillIcons', {
    name: 'Use Curated Skill Icons',
    hint: 'When saving, any of the actor\'s skills that name-match a skill in the configured compendiums have their icon and description replaced with the compendium\'s version (die and advances are untouched).',
    scope: 'world',
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, 'richFundsMultipliers', {
    name: 'Rich Edge Funds Multipliers',
    hint: "Comma-separated 'Edge Name:multiplier' pairs (e.g. 'Rich:3,Filthy Rich:5') that multiply starting gear funds when the character has that edge. Matched by name, so this works with any setting's Rich/Filthy Rich-equivalent edge.",
    scope: 'world',
    config: true,
    type: String,
    default: 'Rich:3,Filthy Rich:5'
  });

  // The GM's approved compendium packs for Character Manager, as a JSON array of pack IDs —
  // picked via the checkbox CompendiumPackSelector, not typed in. Hidden (config: false)
  // since the menu below is the only way to edit it. Which category each pack feeds is
  // found automatically from its own item types (see compendium-utils.js), not assigned
  // here. Defaults to SWADE Core Rules' own packs; an empty list auto-detects from every
  // installed compendium instead. No *setting-specific* default (e.g. Fantasy) is ever
  // baked in, since SWADE runs many settings and Fantasy is just one of them.
  game.settings.register(MODULE_ID, 'compendiumPacks', {
    name: 'Character Manager Compendium Packs',
    scope: 'world',
    config: false,
    type: String,
    default: JSON.stringify(CORE_RULES_DEFAULT_PACK_IDS)
  });

  game.settings.registerMenu(MODULE_ID, 'compendiumPackSelectorMenu', {
    name: 'Compendium Sources',
    label: 'Choose Compendiums',
    hint: 'Pick which installed compendiums Character Manager reads ancestries/skills/edges/hindrances/gear from. Defaults to SWADE Core Rules.',
    icon: 'fas fa-book-atlas',
    type: CompendiumPackSelector,
    restricted: true
  });

  console.log('[Character Creation Tools] Initialized');
}

export { CharacterManager, invalidateCompendiumCache };

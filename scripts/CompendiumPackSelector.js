/**
 * Compendium Pack Selector - checkbox picker for Character Manager's compendium sources
 *
 * The GM approves a flat list of installed compendium packs; which category (ancestries/
 * skills/edges/hindrances/gear) each pack feeds is found automatically from its own item
 * types, never assigned by the GM. No pack IDs to look up or type.
 */

import { invalidateCompendiumCache } from './CharacterManager.js';
import {
  getPackIdsForCategory,
  invalidatePackSourceCache,
  CORE_RULES_DEFAULT_PACK_IDS,
} from './lib/compendium-utils.js';

const MODULE_ID = 'swade-character-manager';
const APPROVED_PACKS_SETTING_KEY = 'compendiumPacks';

const CATEGORY_LABELS = {
  ancestries: 'Ancestries',
  skills: 'Skills',
  edges: 'Edges',
  hindrances: 'Hindrances',
  gear: 'Gear',
};

export class CompendiumPackSelector extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: `${MODULE_ID}-compendium-pack-selector`,
      classes: ['cm-pack-selector'],
      title: 'Character Manager: Compendium Sources',
      template: `modules/${MODULE_ID}/templates/compendium-pack-selector.hbs`,
      width: 640,
      height: 720,
      resizable: true,
      minimizable: true,
      popOut: true,
      minWidth: 560,
      minHeight: 480,
      submitOnChange: false,
      closeOnSubmit: true,
    });
  }

  async getData() {
    let approved = [];
    try {
      const raw = game.settings.get(MODULE_ID, APPROVED_PACKS_SETTING_KEY) ?? '[]';
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) approved = parsed;
    } catch (error) {
      approved = [];
    }
    const selected = new Set(approved);

    const categories = Object.keys(CATEGORY_LABELS);
    const resolvedByCategory = {};
    for (const category of categories) {
      resolvedByCategory[category] = new Set(await getPackIdsForCategory(category));
    }

    const itemPacks = [...game.packs].filter((pack) => pack.documentName === 'Item');
    const packs = itemPacks
      .map((pack) => {
        const id = pack.collection;
        const label = pack.metadata?.label ?? id;
        const moduleId = id.split('.')[0] ?? '';
        const moduleTitle = game.modules.get(moduleId)?.title ?? moduleId;
        const usedForLabel = categories
          .filter((category) => resolvedByCategory[category].has(id))
          .map((category) => CATEGORY_LABELS[category])
          .join(', ');

        return {
          id,
          label,
          moduleTitle,
          usedForLabel,
          selected: selected.has(id),
          searchText: `${label} ${id} ${moduleTitle}`.toLowerCase(),
        };
      })
      .sort((a, b) => a.moduleTitle.localeCompare(b.moduleTitle) || a.label.localeCompare(b.label));

    return { packs, hasPacks: packs.length > 0 };
  }

  activateListeners(html) {
    super.activateListeners(html);

    const searchInput = html[0].querySelector('[data-pack-search]');
    const packRows = [...html[0].querySelectorAll('[data-pack-row]')];
    const resetButton = html[0].querySelector('[data-pack-reset-core-rules]');
    const clearAllButton = html[0].querySelector('[data-pack-clear-all]');

    searchInput?.addEventListener('input', (event) => {
      const term = (event.currentTarget.value ?? '').toLowerCase().trim();
      for (const row of packRows) {
        const searchText = row.dataset.search ?? '';
        row.style.display = !term || searchText.includes(term) ? '' : 'none';
      }
    });

    resetButton?.addEventListener('click', () => {
      const coreRulesIds = new Set(CORE_RULES_DEFAULT_PACK_IDS);
      for (const row of packRows) {
        const checkbox = row.querySelector('input[type=checkbox]');
        if (checkbox) checkbox.checked = coreRulesIds.has(row.dataset.packId);
      }
    });

    clearAllButton?.addEventListener('click', () => {
      for (const row of packRows) {
        const checkbox = row.querySelector('input[type=checkbox]');
        if (checkbox) checkbox.checked = false;
      }
    });

    // The ID tooltip (.cm-pack-selector-row-meta) is positioned above its row by default.
    // The scroll panel clips anything absolutely-positioned outside its bounds, so a row
    // near the top would have its tooltip cut off and unreadable — flip it to appear below
    // instead when there isn't enough room above.
    const scrollPanel = html[0].querySelector('.cm-pack-selector-scroll-panel');
    for (const row of packRows) {
      const meta = row.querySelector('.cm-pack-selector-row-meta');
      if (!meta || !scrollPanel) continue;
      row.addEventListener('mouseenter', () => {
        const spaceAbove = row.getBoundingClientRect().top - scrollPanel.getBoundingClientRect().top;
        meta.classList.toggle('cm-pack-selector-row-meta-below', spaceAbove < 28);
      });
    }
  }

  async _updateObject(_event, formData) {
    const values = formData.packs;
    const selected = Array.isArray(values) ? values : (values ? [values] : []);
    const normalized = [...new Set(selected.map((entry) => String(entry).trim()).filter(Boolean))];

    await game.settings.set(MODULE_ID, APPROVED_PACKS_SETTING_KEY, JSON.stringify(normalized));
    invalidateCompendiumCache();
    invalidatePackSourceCache();
  }
}

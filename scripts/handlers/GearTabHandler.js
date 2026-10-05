import { BaseTabHandler } from './BaseTabHandler.js';
import { getItemPreview } from '../lib/compendium-utils.js';
import { calculateGearCost, isUnderMinStrength, resolveGearFields } from '../lib/calculator.js';

export class GearTabHandler extends BaseTabHandler {
  getTabName() {
    return 'gear';
  }

  getCompendiumPackKey() {
    return 'gear';
  }

  getCompendiumPackLabel() {
    return 'Gear';
  }

  getDropdownConfig() {
    // Unlike Edges/Hindrances, duplicates are allowed here — picking the same item
    // again just bumps its quantity, so the dropdown always shows the full list.
    return {
      items: this.characterManager.compendiumData.gear,
      placeholder: 'Select Gear...',
      onSelect: (item) => this._addGear(item),
      inputSelector: '.gear-search',
      menuSelector: '.gear-dropdown-menu',
      optionClass: 'dropdown-option',
    };
  }

  getDropdownContainerSelector() {
    return '.search-container';
  }

  getAddButtonSelector() {
    return 'button[data-action="add-gear"]';
  }

  getCompendiumButtonSelector() {
    return 'button[data-action="open-gear-compendium"]';
  }

  getClearSearchButtonSelector() {
    return 'button[data-action="clear-gear-search"]';
  }

  getSearchInputSelector() {
    return '.gear-search';
  }

  _handleDragDrop(uuid) {
    this._addGearByUuid(uuid);
  }

  _setupCustomHandlers() {
    this._setupExpandToggleHandler(
      '[data-action="toggle-gear-expand"]',
      (uuid) => this.characterManager.character.gear?.[uuid]?.expanded || false,
      (uuid, val) => {
        if (this.characterManager.character.gear?.[uuid]) {
          this.characterManager.character.gear[uuid].expanded = val;
        }
      }
    );

    this._setupOpenItemHandler('[data-action="open-gear-item"]');

    this._setupRemoveHandler(
      '[data-action="remove-gear"]',
      this._removeGear,
      (e) => $(e.currentTarget).closest('[data-item-uuid]')?.attr('data-item-uuid')
          || $(e.currentTarget).closest('.item-card').find('[data-item-uuid]').attr('data-item-uuid')
    );

    this.html.find('[data-action="increment-gear-qty"]').on('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const uuid = $(e.currentTarget).attr('data-item-uuid');
      this._adjustQuantity(uuid, 1);
    });

    this.html.find('[data-action="decrement-gear-qty"]').on('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const uuid = $(e.currentTarget).attr('data-item-uuid');
      this._adjustQuantity(uuid, -1);
    });

    this.html.find('[data-action="set-gear-funds-override"]').on('change', (e) => {
      const value = $(e.currentTarget).val();
      this.characterManager.character.gearFundsOverride = value === '' ? null : value;
      this.characterManager.render();
    });

    this.html.find('[data-action="toggle-gear-funds-override"]').on('change', (e) => {
      const checked = $(e.currentTarget).is(':checked');
      this.characterManager.character.showGearFundsOverride = checked;
      if (!checked) {
        this.characterManager.character.gearFundsOverride = null;
      }
      this.characterManager.render();
    });

    this.html.find('[data-action="set-gear-tab-mode"]').on('click', (e) => {
      e.preventDefault();
      const mode = $(e.currentTarget).attr('data-mode');
      this.characterManager.character.gearTabMode = mode;
      this.characterManager.render();
    });

    this.html.find('[data-action="toggle-apply-currency-on-save"]').on('change', (e) => {
      this.characterManager.character.applyCurrencyOnSave = $(e.currentTarget).is(':checked');
    });
  }

  /**
   * Find an existing `character.gear` entry by name rather than by key. Entries can be keyed
   * under two different UUID spaces depending on how they got there — the compendium item's
   * UUID (added via dropdown/drag-drop) or the actor's own embedded item UUID (detected from
   * an already-saved actor) — so a key-based lookup misses whenever those two differ for what
   * is, conceptually, the same item. Matching by name instead is what actually reflects the
   * "same item picked again" rule this tab promises.
   */
  _findExistingGearKeyByName(name) {
    const lowerName = name.toLowerCase();
    for (const [key, entry] of Object.entries(this.characterManager.character.gear || {})) {
      if (entry.name?.toLowerCase() === lowerName) return key;
    }
    return null;
  }

  /**
   * @param {Object} item - A compendium-list-shaped entry (has uuid/name, may have
   * price/minStr/armor/weight already) to add or bump.
   * @param {Object} [preFetchedItemData] - The full Item document, if the caller already
   * fetched it (e.g. drag-drop resolving the dropped item's type) — avoids re-fetching here.
   */
  async _addGear(item, preFetchedItemData = null) {
    if (!item || !item.uuid) return;

    // Same item picked again just bumps quantity — gear allows duplicates.
    const existingKey = this._findExistingGearKeyByName(item.name);
    if (existingKey) {
      this._adjustQuantity(existingKey, 1);
      return;
    }

    let itemData = preFetchedItemData;
    if (itemData === null) {
      try {
        itemData = await getItemPreview(item.uuid);
      } catch (e) {
        console.warn('[Gear] Failed to fetch full item data:', e);
      }
    }

    if (!this.characterManager.character.gear) {
      this.characterManager.character.gear = {};
    }

    const { price, minStr, armor, weight } = resolveGearFields(item, itemData);

    this.characterManager.character.gear[item.uuid] = {
      uuid: item.uuid,
      name: item.name,
      price,
      quantity: 1,
      minStr,
      armor,
      weight,
      expanded: false,
      img: itemData?.img || '',
      description: itemData?.system?.description ?
        await TextEditor.enrichHTML(itemData.system.description, { async: true }) : '',
    };

    if (isUnderMinStrength(this.characterManager.character, minStr)) {
      ui.notifications.warn(`${item.name} requires Strength ${minStr} to use without penalty — your character is below that.`);
    }

    this.characterManager.render();
  }

  /**
   * Add gear dropped onto the tab, whether or not it's in the configured gear compendium —
   * matches an existing gear/weapon/armor compendium entry by name if possible, otherwise
   * adds it as a standalone entry (same fallback pattern as skills on the Traits tab).
   */
  async _addGearByUuid(uuid) {
    let item = null;
    try {
      item = await getItemPreview(uuid);
    } catch (e) {
      console.warn('[Gear] Failed to fetch dropped item:', e);
    }

    if (!item || !['gear', 'weapon', 'armor', 'shield'].includes(item.type)) {
      ui.notifications.warn('Only gear, weapon, or armor items can be dropped on the Gear tab');
      return;
    }

    const compendiumItem = this.characterManager.compendiumData.gear.find(
      (g) => g.name.toLowerCase() === item.name.toLowerCase()
    );

    // Fields default to null/0 here rather than repeating the price/minStr/armor/weight
    // fallback chain — _addGear() already resolves them from `item` (the already-fetched
    // Item document passed below) via resolveGearFields() when the compendium doesn't cover it.
    const gearEntry = compendiumItem || { uuid, name: item.name };
    this._addGear(gearEntry, item);
  }

  _adjustQuantity(uuid, delta) {
    const gearItem = this.characterManager.character.gear?.[uuid];
    if (!gearItem) return;

    const newQuantity = (gearItem.quantity ?? 1) + delta;
    if (newQuantity <= 0) {
      this._removeGear(uuid);
      return;
    }

    gearItem.quantity = newQuantity;
    this.characterManager.render();
  }

  _removeGear(uuid) {
    if (this.characterManager.character.gear?.[uuid]) {
      delete this.characterManager.character.gear[uuid];
      this.characterManager.render();
    }
  }

  _getTotalCost() {
    return calculateGearCost(this.characterManager.character);
  }
}

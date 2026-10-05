import { BaseTabHandler } from './BaseTabHandler.js';

export class AncestryTabHandler extends BaseTabHandler {
  getTabName() {
    return 'ancestry';
  }

  getCompendiumPackKey() {
    return 'ancestries';
  }

  getCompendiumPackLabel() {
    return 'Ancestries';
  }

  getDropdownConfig() {
    return {
      items: this.characterManager.compendiumData.ancestries,
      placeholder: 'Select Ancestry...',
      onSelect: (ancestry) => this._selectAncestry(ancestry),
    };
  }

  getDropdownContainerSelector() {
    return '.ancestry-search-container';
  }

  getAddButtonSelector() {
    return 'button[data-action="add-ancestry"]';
  }

  getCompendiumButtonSelector() {
    return 'button[data-action="open-ancestry-compendium"]';
  }

  getClearSearchButtonSelector() {
    return 'button[data-action="clear-ancestry-search"]';
  }

  getSearchInputSelector() {
    return '.ancestry-search';
  }

  _handleDragDrop(uuid) {
    this._selectAncestry({ uuid });
  }

  _setupCustomHandlers() {
    // Setup remove button
    this._setupRemoveHandler(
      '[data-action="remove-ancestry"]',
      this._removeAncestry,
      () => null
    );

    // Setup open item button
    this._setupOpenItemHandler('[data-action="open-ancestry-item"]');

    // Setup expand/collapse
    this._setupExpandToggleHandler(
      '[data-action="toggle-ancestry-expand"]',
      () => this.characterManager.character.expandedAncestry,
      (uuid, val) => { this.characterManager.character.expandedAncestry = val; }
    );

    // Setup child item expand/collapse
    this.html.find('[data-action="toggle-child-expand"]').on('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const uuid = $(e.currentTarget).closest('[data-action="toggle-child-expand"]').attr('data-item-uuid');
      this.characterManager.character.expandedChildItems[uuid] = !this.characterManager.character.expandedChildItems[uuid];
      if (this.characterManager.character.expandedChildItems[uuid]) {
        this.characterManager.pendingScrollTarget = `[data-action="toggle-child-expand"][data-item-uuid="${uuid}"] .expandable-item-header`;
      }
      this.characterManager.render();
    });

    // Setup open child item button
    this._setupOpenItemHandler('[data-action="open-child-item"]');

    // Ancestral-ability bonus choice (e.g. Half-Elf's Heritage: pick a free Edge or
    // Attribute point) — lives inside the same clickable card as toggle-child-expand, so its
    // own clicks need to stop propagating or interacting with it would also toggle the card.
    this.html.find('[data-action="set-ancestry-ability-choice"]')
      .on('click', (e) => e.stopPropagation())
      .on('change', (e) => {
        e.stopPropagation();
        const uuid = $(e.currentTarget).attr('data-item-uuid');
        const value = $(e.currentTarget).val();
        if (!this.characterManager.character.ancestryAbilityChoices) {
          this.characterManager.character.ancestryAbilityChoices = {};
        }
        if (value) {
          this.characterManager.character.ancestryAbilityChoices[uuid] = value;
        } else {
          delete this.characterManager.character.ancestryAbilityChoices[uuid];
        }
        this.characterManager.render();
      });

    // Manual Adjustments — freeform per-pool budget overrides for setting rules/edge cases
    // this app has no built-in support for. Same checkbox-reveal convention as
    // showGearFundsOverride on the Gear tab.
    this.html.find('[data-action="toggle-manual-budget-overrides"]').on('change', (e) => {
      this.characterManager.character.showManualBudgetOverrides = $(e.currentTarget).is(':checked');
      this.characterManager.render();
    });

    this._setupEventHandler('[data-action="increment-manual-override"]', 'click', (e) => {
      this._adjustManualOverrideAmount($(e.currentTarget).attr('data-pool'), 1);
    });

    this._setupEventHandler('[data-action="decrement-manual-override"]', 'click', (e) => {
      this._adjustManualOverrideAmount($(e.currentTarget).attr('data-pool'), -1);
    });

    this.html.find('[data-action="set-manual-override-note"]').on('change', (e) => {
      const pool = $(e.currentTarget).attr('data-pool');
      const value = $(e.currentTarget).val();
      this._getManualOverridePool(pool).note = value;
      this.characterManager.render();
    });
  }

  _getManualOverridePool(pool) {
    if (!this.characterManager.character.manualBudgetOverrides) {
      this.characterManager.character.manualBudgetOverrides = {};
    }
    if (!this.characterManager.character.manualBudgetOverrides[pool]) {
      this.characterManager.character.manualBudgetOverrides[pool] = {};
    }
    return this.characterManager.character.manualBudgetOverrides[pool];
  }

  _adjustManualOverrideAmount(pool, delta) {
    const override = this._getManualOverridePool(pool);
    override.amount = (Number(override.amount) || 0) + delta;
    this.characterManager.render();
  }

  async _selectAncestry(ancestry) {
    this.characterManager.character.ancestry = ancestry.uuid;
    this.characterManager.render();
  }

  _removeAncestry() {
    this.characterManager.character.ancestry = null;
    this.characterManager.character.expandedAncestry = false;
    this.characterManager.render();
  }
}

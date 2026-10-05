import { BaseTabHandler } from './BaseTabHandler.js';
import { getItemPreview } from '../lib/compendium-utils.js';
import { calculateTotalHindrancePoints, getRemainingHindrancePoints, generatePerkSlots } from '../lib/calculator.js';

export class HindrancesTabHandler extends BaseTabHandler {
  getTabName() {
    return 'hindrances';
  }

  getCompendiumPackKey() {
    return 'hindrances';
  }

  getCompendiumPackLabel() {
    return 'Hindrances';
  }

  getDropdownConfig() {
    // character.hindrances is keyed by the actor's own item uuid (or a fresh compendium
    // uuid for a not-yet-saved pick), never by a compendium row's own uuid — "already
    // selected" has to be a name match, not a key lookup.
    const ownedNames = new Set(
      Object.values(this.characterManager.character.hindrances || {}).map(h => h.name?.toLowerCase())
    );
    const availableHindrances = this.characterManager.compendiumData.hindrances.filter(
      h => !ownedNames.has(h.name.toLowerCase())
    );
    return {
      items: availableHindrances,
      placeholder: 'Select Hindrance...',
      onSelect: (hindrance) => this._addHindrance(hindrance),
      inputSelector: '.hindrances-search',
      menuSelector: '.hindrances-dropdown-menu',
      optionClass: 'dropdown-option',
    };
  }

  getDropdownContainerSelector() {
    return '.search-container';
  }

  getAddButtonSelector() {
    return 'button[data-action="add-hindrance"]';
  }

  getCompendiumButtonSelector() {
    return 'button[data-action="open-hindrances-compendium"]';
  }

  getClearSearchButtonSelector() {
    return 'button[data-action="clear-hindrances-search"]';
  }

  getSearchInputSelector() {
    return '.hindrances-search';
  }

  _handleDragDrop(uuid) {
    this._addHindranceByUuid(uuid);
  }

  _setupCustomHandlers() {
    // Setup expand/collapse toggle
    this._setupExpandToggleHandler(
      '[data-action="toggle-hindrance-expand"]',
      (uuid) => this.characterManager.character.hindrances?.[uuid]?.expanded || false,
      (uuid, val) => {
        if (this.characterManager.character.hindrances?.[uuid]) {
          this.characterManager.character.hindrances[uuid].expanded = val;
        }
      }
    );

    // Setup open item button
    this._setupOpenItemHandler('[data-action="open-hindrance-item"]');

    // Setup remove buttons
    this._setupRemoveHandler(
      '[data-action="remove-hindrance"]',
      this._removeHindrance,
      (e) => $(e.currentTarget).closest('[data-item-uuid]')?.attr('data-item-uuid')
          || $(e.currentTarget).closest('.item-card').find('[data-item-uuid]').attr('data-item-uuid')
    );

    // Child items granted by this hindrance, same expand/open pattern as the Ancestry
    // tab's granted abilities.
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

    this._setupOpenItemHandler('[data-action="open-child-item"]');

    // Collapse/expand the whole "Granted by X" section, independent of each child's own
    // description expand state, so it survives re-renders (kept in character state, not
    // native <details> DOM state which would get wiped by the next render()).
    this.html.find('[data-action="toggle-granted-section"]').on('click', (e) => {
      e.preventDefault();
      const uuid = $(e.currentTarget).attr('data-item-uuid');
      if (!this.characterManager.character.expandedGrantedSections) {
        this.characterManager.character.expandedGrantedSections = {};
      }
      const newState = !this.characterManager.character.expandedGrantedSections[uuid];
      this.characterManager.character.expandedGrantedSections[uuid] = newState;
      if (newState) {
        this.characterManager.pendingScrollTarget = `[data-action="toggle-granted-section"][data-item-uuid="${uuid}"]`;
      }
      this.characterManager.render();
    });

    // Setup major/minor radio toggles
    this.html.find('input[data-action="set-hindrance-major"]').on('change', (e) => {
      const uuid = $(e.currentTarget).attr('data-item-uuid');
      this._setHindranceMajor(uuid, true);
    });

    this.html.find('input[data-action="set-hindrance-minor"]').on('change', (e) => {
      const uuid = $(e.currentTarget).attr('data-item-uuid');
      this._setHindranceMajor(uuid, false);
    });

    // Setup perk point allocation dropdowns (multi-slot)
    this.html.find('select[data-action="set-slot-tradeoff"]').on('change', (e) => {
      const slotIndex = parseInt($(e.currentTarget).attr('data-slot-index'));
      const selectedValue = e.target.value;
      this._handlePerkChange(slotIndex, selectedValue);
    });
  }

  async _addHindrance(hindrance) {
    if (!hindrance || !hindrance.uuid) return;

    // Prevent adding same hindrance twice
    const alreadySelected = Object.values(this.characterManager.character.hindrances || {})
      .some(h => h.name?.toLowerCase() === hindrance.name?.toLowerCase());
    if (alreadySelected) {
      ui.notifications.warn('This hindrance is already selected');
      return;
    }

    // Fetch full item data for image and description
    let itemData = null;
    try {
      itemData = await getItemPreview(hindrance.uuid);
    } catch (e) {
      console.warn('[Hindrances] Failed to fetch full item data:', e);
    }

    // Add to character hindrances
    if (!this.characterManager.character.hindrances) {
      this.characterManager.character.hindrances = {};
    }

    this.characterManager.character.hindrances[hindrance.uuid] = {
      uuid: hindrance.uuid,
      name: hindrance.name,
      major: hindrance.major,
      severity: itemData?.system?.severity || 'either',
      points: hindrance.major ? 2 : 1,
      expanded: false,
      img: itemData?.img || '',
      description: itemData?.system?.description ?
        await TextEditor.enrichHTML(itemData.system.description, { async: true }) : '',
    };

    this.characterManager.render();
  }

  /**
   * Add a hindrance dropped onto the tab, whether or not it's in the configured
   * compendium — matches an existing compendium hindrance by name if possible, otherwise
   * adds it as a standalone entry (same fallback pattern as skills on the Traits tab).
   */
  async _addHindranceByUuid(uuid) {
    let item = null;
    try {
      item = await getItemPreview(uuid);
    } catch (e) {
      console.warn('[Hindrances] Failed to fetch dropped item:', e);
    }

    if (!item || item.type !== 'hindrance') {
      ui.notifications.warn('Only hindrance items can be dropped on the Hindrances tab');
      return;
    }

    const compendiumHindrance = this.characterManager.compendiumData.hindrances.find(
      (h) => h.name.toLowerCase() === item.name.toLowerCase()
    );

    const hindrance = compendiumHindrance || { uuid, name: item.name, major: false };
    this._addHindrance(hindrance);
  }

  async _setHindranceMajor(uuid, isMajor) {
    if (!this.characterManager.character.hindrances?.[uuid]) return;

    // Hindrance selection itself has no point cap — only the perk slots granted by
    // hindrance points are limited (see generatePerkSlots), so there's nothing to check here.
    const hindrance = this.characterManager.character.hindrances[uuid];
    hindrance.major = isMajor;
    hindrance.points = isMajor ? 2 : 1;

    this.characterManager.pendingScrollTarget = `[data-item-uuid="${uuid}"]`;
    this.characterManager.render();
  }

  _removeHindrance(uuid) {
    if (this.characterManager.character.hindrances?.[uuid]) {
      delete this.characterManager.character.hindrances[uuid];
      this.characterManager.render();
    }
  }

  _handlePerkChange(slotIndex, selectedValue) {
    if (!this.characterManager.character.perkPointAllocations) {
      this.characterManager.character.perkPointAllocations = [];
    }

    // Ensure slot exists with correct pointValue from generated slots
    if (!this.characterManager.character.perkPointAllocations[slotIndex]) {
      const slots = generatePerkSlots(this.characterManager.character);
      const slotData = slots[slotIndex] || { pointValue: 1, selected: null };
      this.characterManager.character.perkPointAllocations[slotIndex] = {
        pointValue: slotData.pointValue,
        selected: null
      };
    }

    // Update selected perk allocation
    this.characterManager.character.perkPointAllocations[slotIndex].selected = selectedValue || null;

    // Without an explicit scroll target, the <select> losing focus when its DOM is replaced
    // by render() causes the browser to fall back to scrolling the tab to the top — same fix
    // as the other toggle handlers below use their own pendingScrollTarget for.
    this.characterManager.pendingScrollTarget = `[data-tradeoff-slot="${slotIndex}"]`;
    this.characterManager.render();
  }

  _getTotalPoints() {
    return calculateTotalHindrancePoints(this.characterManager.character);
  }
}

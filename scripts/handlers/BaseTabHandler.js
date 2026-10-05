import { SearchableDropdown } from '../components/SearchableDropdown.js';
import { DragDropManager } from '../components/DragDropManager.js';
import { getPackIdsForCategory } from '../lib/compendium-utils.js';

export class BaseTabHandler {
  constructor(characterManager) {
    this.characterManager = characterManager;
    this.dropdown = null;
    this.dragDrop = null;
    this.tabElement = null;
    this.html = null;
  }

  setup(html) {
    this.html = html;
    this.tabElement = html.closest('.tab');

    this._setupDropdown();
    this._setupCompendiumButton();
    this._setupClearSearch();
    this._setupDragDrop();
    this._setupCustomHandlers();
  }

  _setupDropdown() {
    const config = this.getDropdownConfig();
    this.dropdown = new SearchableDropdown(config);

    const container = this.html.find(this.getDropdownContainerSelector());
    const addBtn = this.html.find(this.getAddButtonSelector());
    this.dropdown.setup(container, addBtn);
  }

  _setupCompendiumButton() {
    const selector = this.getCompendiumButtonSelector();
    this.html.find(selector).on('click', (e) => {
      e.preventDefault();
      this._openCompendium();
    });
  }

  _setupClearSearch() {
    const buttonSelector = this.getClearSearchButtonSelector();
    const inputSelector = this.getSearchInputSelector();
    this.html.find(buttonSelector).on('click', (e) => {
      e.preventDefault();
      this.html.find(inputSelector).val('').trigger('input');
      this.dropdown.close();
    });
  }

  _setupDragDrop() {
    this.dragDrop = new DragDropManager({
      tabName: this.getTabName(),
      onDrop: (uuid) => this._handleDragDrop(uuid),
    });
    this.dragDrop.setup(this.html);
  }

  _setupCustomHandlers() {
    // Override in subclass to add tab-specific handlers
  }

  async _openCompendium() {
    const packIds = await getPackIdsForCategory(this.getCompendiumPackKey());
    if (packIds.length === 0) {
      ui.notifications.error(`[Character Manager] No ${this.getCompendiumPackLabel()} compendium found. Configure one in Settings, or install a module that provides one.`);
      return;
    }

    const pack = game.packs.get(packIds[0]);
    if (!pack) {
      ui.notifications.error(`[Character Manager] ${this.getCompendiumPackLabel()} compendium not found`);
      return;
    }

    pack.render(true);
    if (packIds.length > 1) {
      ui.notifications.info(`${packIds.length} ${this.getCompendiumPackLabel()} compendiums configured; opened the first.`);
    }
  }

  async _openItem(uuid) {
    if (!uuid) return;
    const item = await fromUuid(uuid);
    if (item) {
      item.sheet.render(true);
    }
  }

  _setupEventHandler(selector, eventType, callback) {
    this.html.find(selector).on(eventType, (e) => {
      e.preventDefault();
      e.stopPropagation();
      callback.call(this, e);
    });
  }

  _getUuidFromElement(element) {
    return $(element).attr('data-item-uuid');
  }

  _setupOpenItemHandler(selector) {
    this._setupEventHandler(selector, 'click', (e) => {
      const uuid = $(e.currentTarget).attr('data-uuid');
      this._openItem(uuid);
    });
  }

  _setupExpandToggleHandler(selector, getState, setState) {
    this.html.find(selector).on('click', (e) => {
      e.preventDefault();
      const uuid = $(e.currentTarget).attr('data-item-uuid');
      const newState = !getState(uuid);
      setState(uuid, newState);
      if (newState) {
        const target = $(e.currentTarget).attr('data-scroll-target') || selector;
        this.characterManager.pendingScrollTarget = target;
      }
      this.characterManager.render();
    });
  }

  _setupRemoveHandler(selector, callback, getUuid) {
    this._setupEventHandler(selector, 'click', (e) => {
      const uuid = getUuid(e);
      callback.call(this, uuid);
    });
  }

  // Methods to override in subclass
  getTabName() {
    throw new Error('getTabName() must be implemented');
  }

  getCompendiumPackKey() {
    throw new Error('getCompendiumPackKey() must be implemented');
  }

  getCompendiumPackLabel() {
    throw new Error('getCompendiumPackLabel() must be implemented');
  }

  getDropdownConfig() {
    throw new Error('getDropdownConfig() must be implemented');
  }

  getDropdownContainerSelector() {
    throw new Error('getDropdownContainerSelector() must be implemented');
  }

  getAddButtonSelector() {
    throw new Error('getAddButtonSelector() must be implemented');
  }

  getCompendiumButtonSelector() {
    throw new Error('getCompendiumButtonSelector() must be implemented');
  }

  getClearSearchButtonSelector() {
    throw new Error('getClearSearchButtonSelector() must be implemented');
  }

  getSearchInputSelector() {
    throw new Error('getSearchInputSelector() must be implemented');
  }

  _handleDragDrop(uuid) {
    throw new Error('_handleDragDrop() must be implemented');
  }
}

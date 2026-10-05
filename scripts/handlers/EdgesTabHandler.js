import { BaseTabHandler } from './BaseTabHandler.js';
import { getItemPreview } from '../lib/compendium-utils.js';
import { calculateAvailableEdgePoints, calculateUsedEdgePoints } from '../lib/calculator.js';

export class EdgesTabHandler extends BaseTabHandler {
  getTabName() {
    return 'edges';
  }

  getCompendiumPackKey() {
    return 'edges';
  }

  getCompendiumPackLabel() {
    return 'Edges';
  }

  getDropdownConfig() {
    // character.edges is keyed by the actor's own item uuid (or a fresh compendium uuid for
    // a not-yet-saved pick), never by a compendium row's own uuid — "already selected" has
    // to be a name match, not a key lookup.
    const ownedNames = new Set(
      Object.values(this.characterManager.character.edges || {}).map((e) => e.name?.toLowerCase())
    );
    const availableEdges = this.characterManager.compendiumData.edges.filter(
      (e) => !ownedNames.has(e.name.toLowerCase())
    );
    return {
      items: availableEdges,
      placeholder: 'Select Edge...',
      onSelect: (edge) => this._addEdge(edge),
      inputSelector: '.edges-search',
      menuSelector: '.edges-dropdown-menu',
      optionClass: 'dropdown-option',
    };
  }

  getDropdownContainerSelector() {
    return '.search-container';
  }

  getAddButtonSelector() {
    return 'button[data-action="add-edge"]';
  }

  getCompendiumButtonSelector() {
    return 'button[data-action="open-edges-compendium"]';
  }

  getClearSearchButtonSelector() {
    return 'button[data-action="clear-edges-search"]';
  }

  getSearchInputSelector() {
    return '.edges-search';
  }

  _handleDragDrop(uuid) {
    this._addEdgeByUuid(uuid);
  }

  _setupCustomHandlers() {
    this._setupExpandToggleHandler(
      '[data-action="toggle-edge-expand"]',
      (uuid) => this.characterManager.character.edges?.[uuid]?.expanded || false,
      (uuid, val) => {
        if (this.characterManager.character.edges?.[uuid]) {
          this.characterManager.character.edges[uuid].expanded = val;
        }
      }
    );

    this._setupOpenItemHandler('[data-action="open-edge-item"]');

    this._setupRemoveHandler(
      '[data-action="remove-edge"]',
      this._removeEdge,
      (e) => $(e.currentTarget).closest('[data-item-uuid]')?.attr('data-item-uuid')
          || $(e.currentTarget).closest('.item-card').find('[data-item-uuid]').attr('data-item-uuid')
    );

    // Child items granted by this edge (e.g. Arcane Background edges granting other
    // edges/hindrances), same expand/open pattern as the Ancestry tab's granted abilities.
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
  }

  async _addEdge(edge) {
    if (!edge || !edge.uuid) return;

    const alreadySelected = Object.values(this.characterManager.character.edges || {})
      .some((e) => e.name?.toLowerCase() === edge.name?.toLowerCase());
    if (alreadySelected) {
      ui.notifications.warn('This edge is already selected');
      return;
    }

    const available = calculateAvailableEdgePoints(this.characterManager.character);
    const used = calculateUsedEdgePoints(this.characterManager.character);
    if (used + 1 > available) {
      ui.notifications.warn(`You only have ${available} edge point(s) available. This edge puts you over budget.`);
    }

    let itemData = null;
    try {
      itemData = await getItemPreview(edge.uuid);
    } catch (e) {
      console.warn('[Edges] Failed to fetch full item data:', e);
    }

    if (!this.characterManager.character.edges) {
      this.characterManager.character.edges = {};
    }

    const requirements = Array.isArray(itemData?.system?.requirements)
      ? itemData.system.requirements.map((r) => (typeof r?.toString === 'function' ? r.toString() : '')).filter(Boolean)
      : [];

    this.characterManager.character.edges[edge.uuid] = {
      uuid: edge.uuid,
      name: edge.name,
      expanded: false,
      img: itemData?.img || '',
      requirements,
      description: itemData?.system?.description ?
        await TextEditor.enrichHTML(itemData.system.description, { async: true }) : '',
    };

    this.characterManager.render();
  }

  /**
   * Add an edge dropped onto the tab, whether or not it's in the configured compendium —
   * matches an existing compendium edge by name if possible, otherwise adds it as a
   * standalone entry (same fallback pattern as skills on the Traits tab).
   */
  async _addEdgeByUuid(uuid) {
    let item = null;
    try {
      item = await getItemPreview(uuid);
    } catch (e) {
      console.warn('[Edges] Failed to fetch dropped item:', e);
    }

    if (!item || item.type !== 'edge') {
      ui.notifications.warn('Only edge items can be dropped on the Edges tab');
      return;
    }

    const compendiumEdge = this.characterManager.compendiumData.edges.find(
      (e) => e.name.toLowerCase() === item.name.toLowerCase()
    );

    const edge = compendiumEdge || { uuid, name: item.name };
    this._addEdge(edge);
  }

  _removeEdge(uuid) {
    if (this.characterManager.character.edges?.[uuid]) {
      delete this.characterManager.character.edges[uuid];
      this.characterManager.render();
    }
  }
}

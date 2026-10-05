/**
 * Advancement Tab Handler
 *
 * Manages the add/remove list of Advance entries (Edge / Two Skills / One Skill /
 * Attribute / Hindrance Buyoff). No compendium picker — advances within a type are
 * fungible, so there's nothing to search/drag-drop here; the resulting budget is spent
 * on the Edges/Traits/Hindrances tabs using their existing pickers. See
 * docs/v0.6.0/CHARACTER_MANAGER.md, "Tab 8: Advancement", for the full design.
 */
export class AdvancementTabHandler {
  constructor(characterManager) {
    this.characterManager = characterManager;
  }

  setup(html) {
    this.html = html;

    html.find('button[data-action="add-advance"]').on('click', (e) => {
      e.preventDefault();
      this._addAdvance();
    });

    html.find('select[data-action="set-advance-type"]').on('change', (e) => {
      const index = parseInt(e.target.dataset.index, 10);
      this._setAdvanceType(index, e.target.value);
    });

    html.find('input[data-action="set-advance-notes"]').on('change', (e) => {
      const index = parseInt(e.target.dataset.index, 10);
      this._setAdvanceNotes(index, e.target.value);
    });

    html.find('input[data-action="set-advance-planned"]').on('change', (e) => {
      const index = parseInt(e.target.dataset.index, 10);
      this._setAdvancePlanned(index, e.target.checked);
    });

    html.find('button[data-action="remove-advance"]').on('click', (e) => {
      e.preventDefault();
      const index = parseInt(e.target.dataset.index, 10);
      this._removeAdvance(index);
    });
  }

  _addAdvance() {
    if (!Array.isArray(this.characterManager.character.advances)) {
      this.characterManager.character.advances = [];
    }
    this.characterManager.character.advances.push({
      id: foundry.utils.randomID(),
      type: 'edge',
      notes: '',
      planned: false,
    });
    this.characterManager.render();
  }

  _setAdvanceType(index, type) {
    const advance = this.characterManager.character.advances?.[index];
    if (!advance) return;
    advance.type = type;
    this.characterManager.render();
  }

  _setAdvanceNotes(index, notes) {
    const advance = this.characterManager.character.advances?.[index];
    if (!advance) return;
    advance.notes = notes;
  }

  /**
   * Mirrors SWADE's own Advances tab "Planned" toggle — a planned advance is recorded but
   * not yet taken, so it's excluded from Rank/budget calculations (see
   * calculateAdvanceTypeCounts/calculateTotalAdvanceCount in calculator.js) until unchecked.
   */
  _setAdvancePlanned(index, planned) {
    const advance = this.characterManager.character.advances?.[index];
    if (!advance) return;
    advance.planned = planned;
    this.characterManager.render();
  }

  _removeAdvance(index) {
    if (!Array.isArray(this.characterManager.character.advances)) return;
    this.characterManager.character.advances.splice(index, 1);
    this.characterManager.render();
  }
}

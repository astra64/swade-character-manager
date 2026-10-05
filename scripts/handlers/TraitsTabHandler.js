/**
 * Traits Tab Handler
 * Manages attributes and skills die selection
 */
import { calculateTotalAttributePoints, calculateTotalSkillPoints } from '../lib/calculator.js';
import { getItemPreview } from '../lib/compendium-utils.js';
import { DragDropManager } from '../components/DragDropManager.js';

export class TraitsTabHandler {
  constructor(characterManager) {
    this.characterManager = characterManager;
    this.dragDrop = null;
  }

  /**
   * Setup traits tab UI and handlers
   */
  setup(html) {
    try {
      // Handle attribute die button clicks
      html.find('button[data-action="set-attribute"]').on('click', (e) => {
        e.preventDefault();
        const attribute = $(e.currentTarget).attr('data-attribute');
        const die = $(e.currentTarget).attr('data-die');
        this._setAttribute(attribute, die);
      });

      // Handle skill die dropdown changes
      html.find('select[data-action="set-skill"]').on('change', (e) => {
        const skillUuid = $(e.currentTarget).attr('data-skill-uuid');
        const die = $(e.currentTarget).val();
        this._setSkill(skillUuid, die);
      });

      // Handle add skill button
      html.find('button[data-action="add-skill"]').on('click', (e) => {
        e.preventDefault();
        const skillUuid = $(e.currentTarget).attr('data-skill-uuid');
        this._addSkill(skillUuid);
      });

      // Handle skill removal
      html.find('button[data-action="remove-skill"]').on('click', (e) => {
        e.preventDefault();
        const skillUuid = $(e.currentTarget).attr('data-skill-uuid');
        this._removeSkill(skillUuid);
      });

      // Allow dragging a skill item (from a compendium, sidebar, or actor sheet)
      // anywhere onto this tab to add it, same as Ancestry/Hindrances/Edges.
      this.dragDrop = new DragDropManager({
        tabName: 'traits',
        onDrop: (uuid) => this._addSkillByUuid(uuid),
      });
      this.dragDrop.setup(html);
    } catch (error) {
      console.error('[TraitsTabHandler] setup() failed:', error);
    }
  }

  _setAttribute(attribute, die) {
    if (!this.characterManager.character.attributes) {
      this.characterManager.character.attributes = {};
    }

    if (!this.characterManager.character.attributes[attribute]) {
      this.characterManager.character.attributes[attribute] = { die: 'd4', advances: 0 };
    }

    // Update attribute die value (no budget restriction - warning shown on tab)
    this.characterManager.character.attributes[attribute].die = die;
    this.characterManager.render();
  }

  _setSkill(skillUuid, die) {
    if (!this.characterManager.character.skills) {
      this.characterManager.character.skills = {};
    }

    // If die is empty string, treat as removing the skill selection
    if (!die) {
      if (this.characterManager.character.skills[skillUuid]) {
        delete this.characterManager.character.skills[skillUuid];
      }
      this.characterManager.render();
      return;
    }

    if (!this.characterManager.character.skills[skillUuid]) {
      this.characterManager.character.skills[skillUuid] = { die: 'd4', advances: 0, name: this._compendiumSkillName(skillUuid) };
    }

    // Update skill die value (no budget restriction - warning shown on tab)
    this.characterManager.character.skills[skillUuid].die = die;
    this.characterManager.render();
  }

  /**
   * skillUuid here is a row's rendered uuid, which is a compendium skill's own uuid whenever
   * that skill isn't yet on the actor (see CharacterManager._buildSkillsByAttribute) — used to
   * stamp a `name` on a freshly-created entry so it can be found by name-match later, since
   * character.skills is otherwise keyed by the actor's own item uuid, not any compendium uuid.
   */
  _compendiumSkillName(skillUuid) {
    return this.characterManager.compendiumData.skills.find((s) => s.uuid === skillUuid)?.name;
  }

  _addSkill(skillUuid) {
    if (!this.characterManager.character.skills) {
      this.characterManager.character.skills = {};
    }

    // Add skill at d4 if not already present (no budget restriction)
    if (!this.characterManager.character.skills[skillUuid]) {
      this.characterManager.character.skills[skillUuid] = { die: 'd4', advances: 0, name: this._compendiumSkillName(skillUuid) };
    }

    this.characterManager.render();
  }

  /**
   * Add a skill dropped onto the tab, whether or not it's in the configured compendium —
   * matches an existing compendium skill by name if possible (so it displays/costs the
   * same as picking it via the compendium), otherwise adds it as a standalone entry.
   */
  async _addSkillByUuid(uuid) {
    let item = null;
    try {
      item = await getItemPreview(uuid);
    } catch (e) {
      console.warn('[TraitsTabHandler] Failed to fetch dropped item:', e);
    }

    if (!item || item.type !== 'skill') {
      ui.notifications.warn('Only skill items can be dropped on the Traits tab');
      return;
    }

    if (item.name.toLowerCase() === 'unskilled attempt') {
      ui.notifications.info('Unskilled Attempt is added automatically and can’t be picked directly');
      return;
    }

    if (!this.characterManager.character.skills) {
      this.characterManager.character.skills = {};
    }

    const compendiumSkill = this.characterManager.compendiumData.skills.find(
      (s) => s.name.toLowerCase() === item.name.toLowerCase()
    );
    const key = compendiumSkill?.uuid || uuid;

    // character.skills is keyed by the actor's own item uuid, never a compendium row's own
    // uuid, so an existing skill has to be found by name, not by checking this new key.
    const alreadyAdded = Object.values(this.characterManager.character.skills || {})
      .some((s) => s.name?.toLowerCase() === item.name.toLowerCase());
    if (alreadyAdded) {
      ui.notifications.warn('This skill is already added');
      return;
    }

    this.characterManager.character.skills[key] = {
      die: 'd4',
      advances: 0,
      // Always stored — used for name-matching (dedupe checks, Traits tab display), not
      // just as a "not in compendium" fallback.
      name: item.name,
      attribute: compendiumSkill ? undefined : (item.system?.attribute || 'smarts'),
      description: compendiumSkill ? undefined : (item.system?.description || ''),
    };

    this.characterManager.render();
  }

  _removeSkill(skillUuid) {
    const skill = this.characterManager.character.skills?.[skillUuid];
    if (!skill) return;

    if (skill.fromAncestry) {
      ui.notifications.warn('This skill was granted by your ancestry and cannot be removed');
      return;
    }

    delete this.characterManager.character.skills[skillUuid];
    this.characterManager.render();
  }
}

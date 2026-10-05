/**
 * Concept Tab Handler
 * Manages character concept, name, and archetype input
 */
export class ConceptTabHandler {
  constructor(characterManager) {
    this.characterManager = characterManager;
  }

  /**
   * Setup concept tab UI and handlers
   */
  setup(html) {
    html.find('input[data-action="set-name"]').on('change', (e) => {
      this.characterManager.character.name = e.target.value;
    });

    html.find('input[data-action="set-archetype"]').on('change', (e) => {
      this.characterManager.character.archetype = e.target.value;
    });

    html.find('textarea[data-action="set-concept"]').on('change', (e) => {
      this.characterManager.character.concept = e.target.value;
    });
  }
}

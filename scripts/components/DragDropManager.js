/**
 * Reusable drag-drop manager for accepting items
 * Handles item drop events (no visual drag-over indicator)
 */
export class DragDropManager {
  constructor(options = {}) {
    this.onDrop = options.onDrop || (() => {});
    this.tabName = options.tabName || 'ancestry';
  }

  /**
   * Setup drag-drop handlers on a tab
   * @param {jQuery} html - The tab's own element (already scoped to this tab), or a
   * container that has it as a descendant — handles either case.
   */
  setup(html) {
    const tab = html.is(`.tab[data-tab="${this.tabName}"]`)
      ? html
      : html.find(`.tab[data-tab="${this.tabName}"]`);

    // preventDefault on dragover is required for the browser to allow a drop to fire at all
    tab.on('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    tab.on('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const data = e.originalEvent.dataTransfer.getData('text/plain');
      try {
        const dragData = JSON.parse(data);
        if (dragData.type === 'Item' && dragData.uuid) {
          this.onDrop(dragData.uuid);
        }
      } catch (error) {
        console.warn('[Character Manager] Invalid drag data:', error);
      }
    });
  }
}

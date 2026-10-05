/**
 * Reusable searchable dropdown component
 * Shows all options on focus, filters as user types
 */
export class SearchableDropdown {
  constructor(options = {}) {
    this.items = options.items || [];
    this.onSelect = options.onSelect || (() => {});
    this.placeholder = options.placeholder || 'Search...';
    this.inputSelector = options.inputSelector || '.ancestry-search';
    this.menuSelector = options.menuSelector || '.ancestry-dropdown-menu';
    this.optionClass = options.optionClass || 'ancestry-option';
    this.html = null;
    this.input = null;
    this.menu = null;
    this.addBtn = null;
  }

  /**
   * Initialize the dropdown in HTML element
   * @param {jQuery} container - jQuery element with search input and menu
   * @param {jQuery} addButton - jQuery element for add button
   */
  setup(container, addButton) {
    this.html = container;
    this.input = container.find(this.inputSelector);
    this.menu = container.find(this.menuSelector);
    this.addBtn = addButton;

    this.input.attr('placeholder', this.placeholder);

    this.input.on('focus', () => this._showMenu());
    this.input.on('input', () => this._showMenu());
    this.input.on('blur', () => this._hideMenu());

    this.addBtn.on('click', (e) => {
      e.preventDefault();
      this._handleAdd();
    });
  }

  /**
   * Render dropdown menu with filtered items
   */
  _showMenu() {
    const filter = this.input.val().toLowerCase();
    this.menu.empty();

    const filtered = this.items.filter(item =>
      item.name.toLowerCase().includes(filter)
    );

    if (filtered.length === 0) {
      this.menu.html(
        `<div class="${this.optionClass}" style="color: var(--color-text-dark-primary); opacity: 0.5;">No results</div>`
      );
    } else {
      filtered.forEach(item => {
        const option = document.createElement('div');
        option.className = this.optionClass;
        let displayText = item.name;
        if (item.severity) {
          const severityLabel = {
            minor: '(Minor)',
            major: '(Major)',
            either: '(Minor or Major)'
          }[item.severity];
          if (severityLabel) displayText += ` ${severityLabel}`;
        }
        option.textContent = displayText;
        option.addEventListener('click', () => {
          this.input.val(item.name);
          this._hideMenu();
        });
        this.menu.append(option);
      });
    }

    this.menu.addClass('show');
  }

  /**
   * Hide dropdown menu
   */
  _hideMenu() {
    setTimeout(() => this.menu.removeClass('show'), 100);
  }

  /**
   * Public method to close the dropdown
   */
  close() {
    this._hideMenu();
  }

  /**
   * Handle Add button click
   */
  _handleAdd() {
    const itemName = this.input.val();
    if (itemName) {
      const item = this.items.find(a => a.name === itemName);
      if (item) {
        this.onSelect(item);
        this.input.val('');
        this._hideMenu();
      }
    }
  }

  /**
   * Update items list
   */
  setItems(items) {
    this.items = items;
  }
}

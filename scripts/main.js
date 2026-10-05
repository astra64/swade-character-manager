const MODULE_ID = "swade-character-manager";

console.log('[Character Manager] Module loading...');

import { setupCharacterCreationTools, CharacterManager } from "./index.js";

function injectCharacterManagerButton(actor, form) {
  const header = form.querySelector('header.window-header');
  if (!header) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'header-control icon fa-solid fa-users';
  button.setAttribute('data-tooltip', 'Character Manager');
  button.setAttribute('aria-label', 'Character Manager');
  button.title = 'Open Character Manager';

  button.addEventListener('click', () => {
    const charManager = new CharacterManager({ actor: actor });
    charManager.render(true);
  });

  const closeButton = header.querySelector('[data-action="close"]');
  if (closeButton) {
    header.insertBefore(button, closeButton);
  }
}

Hooks.once("init", () => {
  // Setup character creation tools
  setupCharacterCreationTools();

  // Register Handlebars helpers for character creation templates
  Handlebars.registerHelper('eq', (a, b) => a === b);
  Handlebars.registerHelper('in', (value, collection) => {
    if (Array.isArray(collection)) return collection.includes(value);
    if (typeof collection === 'object' && collection !== null) return value in collection;
    return false;
  });
  Handlebars.registerHelper('capitalize', (str) => {
    if (typeof str !== 'string') return str;
    return str.charAt(0).toUpperCase() + str.slice(1);
  });
  Handlebars.registerHelper('skills-count', (obj) => {
    if (typeof obj !== 'object' || obj === null) return 0;
    return Object.keys(obj).length;
  });
  Handlebars.registerHelper('array', (...args) => {
    // Remove the last argument which is the Handlebars context object
    args.pop();
    return args;
  });
  Handlebars.registerHelper('gte', (a, b) => a >= b);
  Handlebars.registerHelper('gt', (a, b) => a > b);
  Handlebars.registerHelper('lt', (a, b) => a < b);
  Handlebars.registerHelper('add', (a, b) => a + b);
  Handlebars.registerHelper('dieLt', (a, b) => {
    const dieOrder = { d4: 4, d6: 6, d8: 8, d10: 10, d12: 12 };
    return (dieOrder[a] ?? 0) < (dieOrder[b] ?? 0);
  });
  Handlebars.registerHelper('and', (...args) => {
    args.pop(); // Remove Handlebars context object
    return args.every(arg => arg);
  });
  Handlebars.registerHelper('or', (...args) => {
    args.pop(); // Remove Handlebars context object
    return args.some(arg => arg);
  });
  Handlebars.registerHelper('subtract', (a, b) => a - b);
  Handlebars.registerHelper('keys', (obj) => {
    if (typeof obj !== 'object' || obj === null) return [];
    return Object.keys(obj);
  });
  Handlebars.registerHelper('lookup', (obj, key) => {
    if (typeof obj === 'object' && obj !== null) {
      return obj[key];
    }
    return undefined;
  });
  Handlebars.registerHelper('stripHtml', (html) => {
    if (typeof html !== 'string') return html;

    // Remove HTML tags
    let text = html.replace(/<[^>]*>/g, '');

    // Decode HTML entities using a temporary DOM element
    const div = document.createElement('div');
    div.innerHTML = text;
    text = div.textContent || div.innerText || text;

    // Truncate long descriptions for tooltips
    if (text.length > 200) {
      text = text.substring(0, 200) + '...';
    }

    return text.trim();
  });

  // Expose app class
  window.CharacterManager = CharacterManager;
});

async function registerTemplatePartials() {
  try {
    // IMPORTANT: When adding new tab partials (e.g., traits-tab, edges-tab, gear-tab, summary-tab):
    // 1. Create the partial template file in templates/_components/
    // 2. Include it in templates/character-manager.hbs with {{> partial-name}}
    // 3. ADD THE PARTIAL NAME TO THIS ARRAY so it gets registered with Handlebars
    // Without this registration step, the partial will not load and the template will fail silently
    const partials = ['concept-tab', 'ancestry-tab', 'hindrances-tab', 'traits-tab', 'edges-tab', 'gear-tab', 'summary-tab', 'advancement-tab'];
    for (const partial of partials) {
      const path = `modules/${MODULE_ID}/templates/_components/${partial}.hbs`;
      const html = await fetch(path).then(r => {
        if (!r.ok) throw new Error(`Failed to fetch ${path}: ${r.statusText}`);
        return r.text();
      });
      Handlebars.registerPartial(partial, html);
    }
    console.log('[Character Manager] Template partials registered:', partials);
  } catch (error) {
    console.error('[Character Manager] Failed to register template partials:', error);
  }
}

Hooks.once("ready", async () => {
  console.log('[Character Manager] Ready hook fired');

  // Register template partials
  await registerTemplatePartials();

  // Watch for SWADE character sheets in the DOM and inject Character Manager button
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === 1 && node.classList?.contains('swade-official') && node.classList?.contains('actor')) {
          // Try to get actor from the form ID (format: CharacterSheet-Actor-[DOCID])
          const formId = node.id;
          const docMatch = formId.match(/-([a-zA-Z0-9]+)$/);
          const docId = docMatch?.[1];

          if (docId) {
            const actor = game.actors?.get(docId);
            if (actor?.type === 'character' && !node.dataset.characterManagerButtonAdded) {
              injectCharacterManagerButton(actor, node);
              node.dataset.characterManagerButtonAdded = 'true';
            } else if (!actor) {
              console.warn('[Character Manager] Could not find actor with ID:', docId);
            }
          } else {
            console.warn('[Character Manager] Could not extract actor ID from form:', formId);
          }
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
});

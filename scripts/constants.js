/**
 * Character Manager Constants
 * Centralized configuration and mappings
 */

// Default attribute structure
export const DEFAULT_ATTRIBUTES = {
  agility: { die: 'd4', advances: 0 },
  smarts: { die: 'd4', advances: 0 },
  spirit: { die: 'd4', advances: 0 },
  strength: { die: 'd4', advances: 0 },
  vigor: { die: 'd4', advances: 0 },
};

// Tab guidance text
export const TAB_GUIDANCE = {
  concept: 'Begin your adventure by thinking about the kind of character you want to play. Do you want to try a wily wizard, a burly barbarian, a tricksy rogue, or something else entirely?',
  ancestry: "Your character's ancestry determines which people they call their own. Rename or reflavor an ancestry to fit your concept, or talk to your GM about building something new entirely.",
  hindrances: 'Hindrances are flaws, drawbacks, or dark secrets drawn from a character\'s backstory. They provide up to four additional "Hindrance points" you can use to enhance your hero during character creation.',
  hindrancesTip: "Pick hindrances that are fun and thematic, an interesting flaw makes for a better story than an optimized one. Additionally a hindrance that complicates the story, or trips you up at the worst moment, is one of the best ways to earn a Benny.",
  traits: 'Characters are defined by attributes and skills, collectively called "Traits." Both are ranked by die type, from d4 to d12, with d6 being average for an adult human. Attributes govern how fast your skills can improve and cover passive things like resisting spells or recovering from injury. Skills are learned abilities—fighting, shooting, casting, knowledge, and more.',
  edges: "Edges are special abilities and perks that set your character apart. You get edge points from taking hindrances, and some ancestries grant a free edge (Humans, for instance). You'll gain more edges as you advance. Pick abilities that fit your character—a rogue might grab Fast Draw or Luck, a mage looks at spellcasting edges. Check prerequisites first—some edges require certain skills or attributes.",
  gear: 'Manage your gear here at any point in your character\'s life. Switch to "Starting Equipment" mode while shopping with your starting funds during character creation, or "Gear Management" mode once you\'re just tracking what you own or shopping.',
  summary: "Here's your final character. You can reopen this tool at any point if you change your mind or make a mistake.",
  advancement: "Log each Advance here, then choose what to spend it on:",
  advancementUnlocks: "Each one adds points to the corresponding tab — Edges, Traits, or Hindrances — where you then pick the specific skill, edge, attribute, or hindrance.",
  derivedStats: 'Pace is how fast your character moves in a fight. Parry (2 + half Fighting die) is the Target Number to hit your hero in melee. Toughness (2 + half Vigor, + Armor) is your hero\'s damage threshold—rolls at or above it cause harm.',
};

// Attribute hover tooltip text (shown on the attribute name in the Traits tab)
export const ATTRIBUTE_DESCRIPTIONS = {
  strength: 'Strength is physical power and fitness. It’s also used as the basis of a warrior’s damage in hand-to-hand combat, and to determine the equipment he can use or carry.',
  agility: 'Agility is a measure of a character’s nimbleness, dexterity, and general coordination',
  vigor: 'Vigor represents an individual’s endurance, resistance to disease, poison, or toxins, and how much physical damage she can take before she can’t go on. It is most often used to resist Fatigue effects, and as the basis for the derived stat of Toughness.',
  smarts: 'Smarts measures raw intelligence, mental acuity, and how fast a heroine thinks on her feet. It’s used to resist certain types of mental and social attacks.',
  spirit: 'Spirit is self-confidence, backbone, and willpower. It’s used to resist social and supernatural attacks as well as fear.',
};

// Small one-line "non-obvious mechanic" tip shown under each attribute header in the Traits tab
export const ATTRIBUTE_TIPS = {
  strength: 'Adds to melee damage. Determines armor and weapons you can effectively use and carry.',
  agility: 'Used to resist Athletics tests (e.g. trip). Used to evade area attacks.',
  smarts: 'Used to resist certain types of mental and social attacks. Determines effective range for most powers.',
  spirit: 'Recover from Shaken. Resist fear. Resist social and supernatural attacks.',
  vigor: 'Increases Toughness. Used for soaking wounds, resisting disease, poison, and fatigue effects.',
};

// Budget limits
export const BUDGETS = {
  attributes: 5,
  skills: 12,
  hindrances: 4,
};

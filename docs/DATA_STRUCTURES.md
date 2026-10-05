# SWADE System Data Structures Reference

## SWADE System Settings

Access via: `game.settings.get("swade", settingKey)`

### Currency Settings
- **`currencyName`** (string) — Name of currency (e.g., "Silver", "Gold")
- **`pcStartingCurrency`** (number) — Starting currency amount for player characters (e.g., 600)

Example:
```javascript
const currencyName = game.settings.get('swade', 'currencyName') || 'Silver';
const startingAmount = game.settings.get('swade', 'pcStartingCurrency') || 600;
```

### Available Settings (from CONFIG.SWADE.settingConfig.settings)
- coreSkills, coreSkillsCompendium
- enableConviction, jokersWild
- vehicleMods, vehicleEnergy, vehicleEdges, vehicleSkills
- enableWoundPace
- ammoManagement, ammoFromInventory, npcAmmo, vehicleAmmo, noPowerPoints, alwaysGeneralPP
- wealthType, currencyName, npcsUseCurrency
- hardChoices, dumbLuck, grittyDamage, woundCap, unarmoredHero, heroesNeverDie
- injuryTable, actionDeck, applyEncumbrance, actionDeckDiscardPile
- **pcStartingCurrency**, npcStartingCurrency
- armorStacking, staticGmBennies, gmBennies
- bennyImageSheet, bennyImage3DFront, bennyImage3DBack, 3dBennyFrontBump, 3dBennyBackBump

---

## Hindrance Data Structure

### Hindrance Item (from Compendium)
```javascript
{
  name: string,
  uuid: string,
  system: {
    severity: "major" | "minor" | "either",  // Determines allowed Major/Minor variants
    description: string,  // HTML content
    // ... other fields
  },
  img: string,  // Item image URL
}
```

Access severity: `hindrance.system.severity`

### Character Hindrance (Stored in Character Data)
```javascript
character.hindrances[uuid] = {
  uuid: string,                    // Hindrance UUID from compendium
  name: string,                    // Hindrance name
  major: boolean,                  // true = Major, false = Minor (currently selected)
  severity: "major" | "minor" | "either",  // From item's system.severity
  points: number,                  // 2 if major, 1 if minor
  expanded: boolean,               // UI state: description expanded
  img: string,                     // Item image URL
  description: string,             // Enriched HTML description
}
```

### Perk Point Allocation (Stored in Character Data)
```javascript
character.perkPointAllocations = [
  {
    pointValue: 1 | 2,                              // Slot capacity (1 or 2 points)
    selected: "attribute-boost" | "edge" | "skill-point" | "extra-funds" | null,
    index: number,                                  // Slot index
  },
  // ... more slots
]
```

**Perk Costs** (hardcoded):
- `attribute-boost`: 2 points
- `edge`: 2 points  
- `skill-point`: 1 point
- `extra-funds`: 1 point

---

## Actor System Data

### Actor Details
```javascript
actor.system.details = {
  currency: number,              // Current currency amount
  archetype: string,             // Character archetype (freeform)
  appearance: string,            // Character appearance (HTML)
  notes: string,                 // Character notes/concept
  goals: string,                 // Character goals
  biography: { value: string },  // Character biography (HTML)
  species: { name: string },     // Character species/ancestry name
  // ... other fields
}
```

### Actor Attributes
```javascript
actor.system.attributes = {
  agility: {
    die: { modifier: number, sides: number },      // e.g., { modifier: 0, sides: 12 }
    wild-die: { sides: number },                   // e.g., { sides: 6 }
    // ... other modifiers
  },
  smarts: { /* same structure */ },
  spirit: { /* same structure */ },
  strength: { /* same structure */ },
  vigor: { /* same structure */ },
}
```

Die values: 4 (d4), 6 (d6), 8 (d8), 10 (d10), 12 (d12)

### Actor Skills
```javascript
actor.system.skills = {
  [skillUuid]: {
    die: { modifier: number, sides: number },
    linkedAttribute: string,  // e.g., "agility", "smarts"
    // ... other fields
  },
  // ... more skills
}
```

---

## CONFIG.SWADE Constants

### Hindrance Severity Enum
```javascript
CONFIG.SWADE.CONST.HINDRANCE_SEVERITY = {
  MAJOR: "major",    // Hindrance can only be Major
  MINOR: "minor",    // Hindrance can only be Minor
  EITHER: "either",  // Hindrance can be Major or Minor
}
```

### Other Useful Constants
- `CONFIG.SWADE.ranks` — Array: `["Novice", "Seasoned", "Veteran", "Heroic", "Legendary"]`
- `CONFIG.SWADE.scales` — Array of size scales
- `CONFIG.SWADE.CONST.RANK` — Rank enum (0-4)
- `CONFIG.SWADE.CONST.ADVANCE_TYPE` — Advancement type enum
- `CONFIG.SWADE.CONST.EQUIP_STATE` — Equipment state enum
- `CONFIG.SWADE.diceConfig` — Dice So Nice configuration

---

## Compendium Utilities

### Fetching Items
```javascript
import { getItemPreview } from './lib/compendium-utils.js';

const fullItem = await getItemPreview(uuid);
// Returns: Item document with system data, image, description, etc.
```

### Available Compendium Packs
```
swade-fantasy-world-kit.ancestries-fantasy
swade-fantasy-world-kit.skills-fantasy
swade-fantasy-world-kit.edges-fantasy
swade-fantasy-world-kit.hindrances-fantasy
swade-fantasy-world-kit.actions-fantasy
swade-fantasy-world-kit.gear-fantasy
swade-fantasy-world-kit.weapons-fantasy
swade-fantasy-world-kit.armor-and-shields-fantasy
swade-fantasy-world-kit.magic-items-fantasy
swade-fantasy-world-kit.powers-fantasy
swade-fantasy-world-kit.armor-sets-fantasy
swade-fantasy-world-kit.pregens-fantasy
```

---

## Character Manager Data Context

The CharacterManager passes this context to templates:

```javascript
{
  character: {
    name: string,
    archetype: string,
    concept: string,
    ancestry: string | null,  // UUID
    hindrances: { [uuid]: hindranceData },
    perkPointAllocations: [],
    // ... other fields
  },
  currencyName: string,          // From system settings
  currencyAmount: number,        // 2x pcStartingCurrency
  availablePerkPoints: number,   // Min(total hindrance points, 4)
  perkPointsSpent: number,       // Sum of selected perk costs
  perkSlots: [{ pointValue, selected, index }],
  ancestries: [],
  hindrances: [],
  // ... budget trackers, derived stats, etc.
}
```

---

## Notes

- **Scroll Preservation**: The CharacterManager now preserves scroll position during re-renders via the `.form-tabs` element
- **Hindrance Severity**: Always check `severity` field when displaying Major/Minor radio options
- **Perk Costs**: Are hardcoded; use the mapping in Character Manager if adding new perk types
- **Currency Settings**: Dynamically pulled from SWADE system config; multiply by 2 for "Extra Funds" perk

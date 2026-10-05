# Character Creation v0.6.2 - UX Redesign Summary

## What Changed

### **Before (Tab-based)**
- Basics tab: Name, ancestry, description
- Attributes tab: Static view of d4 attributes
- Skills tab: Multi-select dropdown (confusing, overwrites)
- Edges tab: Multi-select dropdown
- Hindrances tab: Multi-select dropdown
- Summary tab: Final review

**Problems:**
- Users couldn't adjust attributes during creation
- Skills overwrote each other instead of accumulating
- No point budget tracking
- No visual link between attributes and skills
- Multi-select dropdowns are not intuitive

### **After (Single Traits Tab)**

#### **New Layout:**
```
[Basics] [Traits] [Edges] [Hindrances] [Summary]
         ↓
      TRAITS TAB:
      ┌─ AGILITY [d4] [d6] [d8] [d10] [d12]
      │  • Athletics      [d4] [d6] [d8]...
      │  • Shooting       [d4] [d6] [d8]...
      │
      ├─ SMARTS [d4] [d6] [d8] [d10] [d12]
      │  • Common Knowledge [d4] [FREE]
      │  • Notice          [d4] [d6]...
      │
      ├─ SPIRIT [d4] [d6] [d8] [d10] [d12]
      │  • Persuasion   [d4] [FREE]
      │  • Faith        [d4] [d6]...
      │
      ├─ STRENGTH [d4] [d6] [d8] [d10] [d12]
      │  • Athletics    [d4] [FREE]
      │  • Throwing     [d4] [d6]...
      │
      └─ VIGOR [d4] [d6] [d8] [d10] [d12]
         • Swimming    [d4] [d6] [d8]...

      Footer: Attributes: 2/5 | Skills: 7/12
```

#### **Pinned Global Footer:**
```
Parry: 4 | Toughness: 5  (visible on all tabs)
```

## Key Features

### **Traits Tab:**
1. ✅ **Five Attribute Sections** - One per attribute (Agility, Smarts, Spirit, Strength, Vigor)
   - Each attribute shows die value selector buttons
   - All start at d4 (cannot be lowered)
   - Each step costs 1 point (d4→d6→d8, etc.)
   - Max 5 points to spend

2. ✅ **Skills Grouped by Attribute** - Skills listed under their linked attribute
   - 5 free core skills marked with [FREE] badge:
     - Athletics (Strength)
     - Common Knowledge (Smarts)
     - Notice (Smarts)
     - Persuasion (Spirit)
     - Stealth (Agility)
   - Free core skills start at d4, cost 0 to keep, cost 1pt per step above d4
   - Other skills cost 1pt to reach d4, then scale normally
   - Each skill shows full row of buttons: [d4] [d6] [d8] [d10] [d12]

3. ✅ **Point Budget Tracking** - Sticky footer at bottom of Traits tab
   - Shows: `Attributes: 2/5 | Skills: 7/12`
   - Goes RED when over limit (not disabled, just warns)
   - Updates in real-time as user changes values

4. ✅ **Skill Cost Algorithm**
   - 1 point per die step up to linked attribute die value
   - 2 points per die step above linked attribute
   - Example: Strength d4 attribute
     - Fighting (linked to Agility d6) costs: 1pt (d4→d6) + 1pt (d6→d8) + 2pts (d8→d10) = 4pts to reach d10

5. ✅ **Derived Stats Pinned Footer** - Bottom of screen, always visible
   - Shows: `Parry: 4 | Toughness: 5`
   - Updates live as attributes/skills change
   - Helps users make informed choices

6. ✅ **Attribute Advancement Restriction**
   - Attributes cannot be lowered below d4
   - d4 button is disabled

## Files Modified

### **Scripts:**
- `scripts/apps/character-creation/lib/calculator.js` - Added:
  - `FREE_CORE_SKILLS` constant
  - `isFreeCoreSkill()` function
  - `calculateSkillCost()` with SWADE rules (1pt up to attribute, 2pt above)
  - `calculateTotalAttributePoints()`, `calculateTotalSkillPoints()`
  - `getRemainingAttributePoints()`, `getRemainingSkillPoints()`

- `scripts/apps/character-creation/CharacterCreator.js` - Complete rewrite:
  - New Traits tab implementation
  - Attribute die button handlers
  - Skill die button handlers
  - Real-time point budget calculation
  - Skills organized by linked attribute
  - Skill metadata inferencing (hardcoded mapping for now)

- `scripts/main.js` - Added Handlebars helpers:
  - `array()` - convert arguments to array (for {{#each (array ...)}})
  - `gte()` - greater than or equal comparison (for over-limit detection)

### **Templates:**
- `templates/character-creation/character-creator.hbs` - Complete redesign:
  - New Traits tab with attribute sections
  - Skills grouped under each attribute
  - Pinned footer for point counters
  - Removed static attributes tab
  - Kept Basics, Edges, Hindrances, Summary tabs

### **Styles:**
- `styles/character-creation.css` - Added:
  - `.attribute-section` and `.attribute-header` styling
  - `.die-btn` button styling (active/hover/disabled states)
  - `.skill-row` styling with core-skill highlighting
  - `.core-badge` styling for FREE marker
  - `.traits-footer` sticky footer
  - `.points-counter` with over-limit red highlighting
  - `.character-footer` pinned global footer
  - `.derived-stats-pinned` styling

## Testing Needed

After reload (F5), test:
1. ✅ Traits tab appears and shows all 5 attributes
2. ✅ Each attribute has die buttons [d4→d12]
3. ✅ Clicking attribute button changes it, updates Parry/Toughness
4. ✅ Attributes cannot be lowered below d4
5. ✅ Skills are grouped under correct attributes
6. ✅ Core skills (5) are marked [FREE]
7. ✅ Clicking skill die buttons changes skill value
8. ✅ Point counter updates in real-time
9. ✅ Point counter goes RED when over limit
10. ✅ Parry/Toughness update at bottom of screen
11. ✅ Switching tabs keeps Parry/Toughness pinned at bottom
12. ✅ Creating actor works with new data structure

## Known Limitations (Planned for v0.6.3+)

- Skill metadata (linked attributes) are inferred via hardcoded mapping - should read from item data
- Edge prerequisites not yet implemented
- Attribute cap (d12) not strictly enforced
- Multi-user attribute support (ancestry-specific attribute modifications) deferred

## Rollback

Old files backed up as:
- `templates/character-creation/character-creator-old.hbs`
- `scripts/apps/character-creation/CharacterCreator-old.js`

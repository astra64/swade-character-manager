# Character Manager & Advancement Tools - Quick Start

> Character Manager edits an **existing** actor's ancestry/skills/edges/hindrances/gear —
> it does not create new actor documents. Create the actor first through Foundry's normal
> "Create Actor" flow, then use one of the methods below to open the tool for it.

## Two Ways to Access

### 1. **Actor Sheet Header Button**
Open an existing actor's sheet — a Character Manager icon is added to the sheet's header.
Click it to open Character Manager for that actor.

### 2. **Macro Hotbar**
1. Create a new **Script macro** in your world
2. Copy the code from:
   - **Character Manager macro:** `source/macros/CHARACTER_CREATOR_MACRO.js`
   - **Advancement Manager macro:** `source/macros/ADVANCEMENT_MANAGER_MACRO.js`
3. Paste into the macro and save
4. Select a token (or assign a character to your user) and run the macro

### Console Command (for testing)
Open the Foundry console (F12 → Console tab) and paste:

```javascript
const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
if (actor) {
  new window.CharacterManager({ actor }).render(true);
} else {
  ui.notifications.warn("Select a token or assign a character to your user first.");
}
```

---

## Character Manager Features
- **Ancestry Selection** — Choose from Fantasy ancestry pack
- **Skill Selection** — Pick from curated Fantasy skills
- **Edges & Hindrances** — Select edges and hindrances
- **Gear** — Shop from curated gear/weapon/armor packs, budget tracked automatically
- **Live Stats Preview** — See Parry, Toughness, Pace in real-time

---

## Advancement Manager Features
- **XP Tracking** — View and adjust current experience points
- **Skill Advancement** — Spend XP to increase skills
- **Attribute Advancement** — Spend XP to increase attributes
- **Edge Selection** — Add new edges during advancement
- **Live Cost Preview** — See XP cost before committing

---

## Troubleshooting

### "Cannot find Character Manager"
- Reload Foundry (F5)
- Check browser console (F12) for errors
- Verify the module loads with no errors in console

### "No compendiums available"
- Ensure Fantasy compendiums are installed:
  - Ancestries, Skills, Edges, Hindrances packs
- Check if Curated Mode is enabled (may filter visibility)
- See main README for compendium visibility settings

### "No actor provided" / "Cannot open without an actor"
- Select an actor's token on the map first
- OR set your user character in World settings
- Then run the macro or open from Console

---

## Settings Integration (Curated Visibility)

Character Manager respects module visibility settings:
- **Curated Mode** — Only shows Fantasy packs to players
- **GM Sees All Packs** — GMs bypass filtering
- **Extra Visible Packs** — Allowlist additional packs

These are optional and gracefully degrade if not configured.

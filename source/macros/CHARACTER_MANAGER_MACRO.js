/**
 * SWADE Character Manager - Open Macro
 *
 * Opens Character Manager for the selected token's actor (or the user's assigned
 * character), to build out ancestry/skills/edges/hindrances/gear or track advancement.
 * Copy this entire script into a Foundry macro for quick access.
 * Usage: Create a new "Script" macro and paste this code into it.
 *
 * Character Manager only edits an existing actor — it does not create new characters.
 * Select a token or assign a character to your user before running this macro.
 *
 * Quick hotbar button: Click to manage character
 */

// Try to get selected actor (from token or user character)
const actor = canvas.tokens.controlled[0]?.actor ?? game.user.character;

if (!actor) {
  ui.notifications.warn("[Character Manager] Select a token or assign a character to your user first.");
} else {
  const manager = new window.CharacterManager({ actor });
  manager.render(true);

  console.log(`[Character Manager] Opened for ${actor.name}`);
}

/**
 * Test launcher for Character Manager
 * Run in Foundry console with: await import('/modules/swade-character-manager/scripts/test-launcher.js').then(m => m.launchCharacterManager());
 */

export async function launchCharacterManager() {
  console.log('[CharacterManager] Launch test starting...');

  try {
    // Character Manager only ever edits an existing actor — it has no "create a new
    // character" mode — so the test launcher needs a real actor to open against.
    const actor = game.user?.character || game.actors?.find((a) => a.type === 'character');
    if (!actor) {
      console.error('[CharacterManager] No character actor found to test against. Create or select one first.');
      return;
    }

    console.log('[CharacterManager] Attempting to create instance for actor:', actor.name);
    const mgr = new window.CharacterManager({ actor });
    console.log('[CharacterManager] Instance created:', mgr);
    console.log('[CharacterManager] Template:', mgr.options.template);
    console.log('[CharacterManager] ID:', mgr.options.id);

    console.log('[CharacterManager] Calling render(true)...');
    await mgr.render(true);
    console.log('[CharacterManager] render() completed');

  } catch (e) {
    console.error('[CharacterManager] Fatal error:', e);
    console.error('[CharacterManager] Stack:', e.stack);
    ui.notifications.error(`[Character Manager] Error: ${e.message}`);
  }
}

// For direct console testing
window.testCharacterManager = launchCharacterManager;
console.log('[CharacterManager] Test launcher loaded. Run: testCharacterManager()');

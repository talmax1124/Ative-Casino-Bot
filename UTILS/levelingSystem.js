// XP/Leveling system removed from this codebase.
// Provide no-op stubs to keep game commands functional.

class NoopLevelingSystem {
  async handleGameComplete() { return null; }
  async handleChatMessage() { return null; }
  createLevelUpEmbed() { return null; }
  getLevelStatus() { return 'Leveling disabled'; }
}

module.exports = new NoopLevelingSystem();


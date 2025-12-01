// Threat sensitivity configuration helper
const db = require("./database");

class ThreatSensitivity {
  static async getSettings(guildId) {
    return await db.getThreatSensitivity(guildId);
  }

  static async setSettings(guildId, settings) {
    return await db.setThreatSensitivity(guildId, settings);
  }
}

module.exports = ThreatSensitivity;

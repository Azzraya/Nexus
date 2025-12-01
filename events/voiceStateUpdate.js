const AdvancedAntiNuke = require("../utils/advancedAntiNuke");
const logger = require("../utils/logger");

module.exports = {
  name: "voiceStateUpdate",
  async execute(oldState, newState, client) {
    try {
      // Only monitor joins (when oldState.channel is null and newState.channel exists)
      if (!oldState.channel && newState.channel && client.advancedAntiNuke) {
        const guild = newState.guild;
        const userId = newState.member?.id;

        if (!guild || !userId) return;

        // Track voice joins for raid detection
        const key = `${guild.id}`;
        if (!client.advancedAntiNuke.voiceRaids.has(key)) {
          client.advancedAntiNuke.voiceRaids.set(key, {
            joinCount: 0,
            lastJoin: Date.now(),
            userIds: new Set(),
          });
        }

        const raidData = client.advancedAntiNuke.voiceRaids.get(key);
        raidData.joinCount++;
        raidData.lastJoin = Date.now();
        raidData.userIds.add(userId);

        // If 10+ users join voice in 10 seconds, it's a raid
        if (
          raidData.joinCount >= 10 &&
          Date.now() - raidData.lastJoin < 10000
        ) {
          logger.warn(
            `[Anti-Nuke] 🚨 VOICE RAID DETECTED: ${raidData.joinCount} users joined voice in ${guild.id}`
          );

          // Trigger threat handling
          await client.advancedAntiNuke.monitorAction(
            guild,
            "voiceRaid",
            Array.from(raidData.userIds)[0], // Use first user as primary
            {
              joinCount: raidData.joinCount,
              userIds: Array.from(raidData.userIds),
              channelId: newState.channel.id,
            }
          );

          // Clear tracking
          client.advancedAntiNuke.voiceRaids.delete(key);
        }
      }
    } catch (error) {
      logger.error("Error in voiceStateUpdate event:", error);
    }
  },
};

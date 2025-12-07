const AdvancedAntiNuke = require("../utils/advancedAntiNuke");
const logger = require("../utils/logger");

module.exports = {
  name: "voiceStateUpdate",
  async execute(oldState, newState, client) {
    try {
      // Voice Monitoring System (EXCEEDS WICK)
      if (client.voiceMonitoring) {
        await client.voiceMonitoring.trackVoiceState(oldState, newState);
      }

      // Only monitor joins (when oldState.channel is null and newState.channel exists)
      if (!oldState.channel && newState.channel && client.advancedAntiNuke) {
        const guild = newState.guild;
        const userId = newState.member?.id;

        if (!guild || !userId) return;

        // Track voice joins for raid detection
        const key = `${guild.id}`;
        const timeWindow = 15000; // 15 seconds (increased from 10 for large events)
        
        if (!client.advancedAntiNuke.voiceRaids.has(key)) {
          client.advancedAntiNuke.voiceRaids.set(key, {
            joinCount: 0,
            firstJoin: Date.now(),
            lastJoin: Date.now(),
            userIds: new Set(),
          });
        }

        const raidData = client.advancedAntiNuke.voiceRaids.get(key);
        
        // Reset if time window has passed
        const timeSinceFirstJoin = Date.now() - raidData.firstJoin;
        if (timeSinceFirstJoin >= timeWindow) {
          raidData.joinCount = 1;
          raidData.firstJoin = Date.now();
          raidData.userIds = new Set([userId]);
        } else {
          raidData.joinCount++;
          raidData.userIds.add(userId);
        }
        
        raidData.lastJoin = Date.now();

        // Get adaptive threshold based on server size (allows large events)
        const thresholds = client.advancedAntiNuke.getAdaptiveThresholds(guild);
        const voiceRaidThreshold = thresholds.voiceRaid;

        // Check if threshold exceeded within time window
        if (
          raidData.joinCount >= voiceRaidThreshold &&
          timeSinceFirstJoin < timeWindow
        ) {
          logger.warn(
            `[Anti-Nuke] 🚨 VOICE RAID DETECTED: ${raidData.joinCount} users joined voice in ${guild.id} (threshold: ${voiceRaidThreshold})`
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

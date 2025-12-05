const db = require("./database");
const AILearning = require("./aiLearning");
const Security = require("./security");

class ModerationQueue {
  static async add(guild, user, actionType, reason, context = {}) {
    // Get AI prediction for priority
    const prediction = await AILearning.getPrediction(guild.id, user.id);

    // Get threat score
    const threat = await Security.detectThreat(guild, user, actionType);

    // Calculate priority (0-100, higher = more urgent)
    let priority = 50; // Default

    if (threat.score >= 80) priority = 90;
    else if (threat.score >= 60) priority = 70;
    else if (prediction.riskScore >= 70) priority = 75;
    else if (prediction.riskScore >= 40) priority = 60;

    // Action type affects priority
    if (actionType === "ban") priority += 10;
    else if (actionType === "kick") priority += 5;

    // Get suggested action from AI
    let suggestedAction = actionType;
    if (threat.score >= 80 && actionType !== "ban") {
      suggestedAction = "ban";
    } else if (threat.score >= 60 && actionType === "warn") {
      suggestedAction = "kick";
    }

    await db.addToModQueue(
      guild.id,
      user.id,
      actionType,
      reason,
      priority,
      {
        ...context,
        threatScore: threat.score,
        prediction: prediction.prediction,
        riskScore: prediction.riskScore,
      },
      suggestedAction
    );

    return { priority, suggestedAction };
  }

  static async getQueue(guildId, unprocessedOnly = true) {
    return await db.getModQueue(guildId, unprocessedOnly);
  }

  static async process(guildId, queueId, processedBy, actionTaken) {
    await db.processModQueueItem(queueId, processedBy);

    // Log the action
    const queue = await db.getModQueue(guildId, false);
    const item = queue.find((q) => q.id === queueId);

    if (item) {
      await db.addModLog(
        guildId,
        item.user_id,
        processedBy,
        actionTaken || item.action_type,
        `Processed from queue: ${item.reason}`,
        null
      );
    }

    return { success: true };
  }

  static async getSuggestions(guildId, queueId) {
    const queue = await db.getModQueue(guildId, false);
    const item = queue.find((q) => q.id === queueId);

    if (!item) {
      return { suggestions: [] };
    }

    const suggestions = [];

    // AI-based suggestions
    if (item.suggested_action && item.suggested_action !== item.action_type) {
      suggestions.push({
        type: "action_change",
        current: item.action_type,
        suggested: item.suggested_action,
        reason: "AI analysis suggests different action based on threat level",
      });
    }

    // Context-based suggestions
    if (item.context.threatScore >= 80) {
      suggestions.push({
        type: "immediate_action",
        message: "High threat score detected - consider immediate action",
      });
    }

    if (item.context.riskScore >= 70) {
      suggestions.push({
        type: "investigation",
        message: "User has high risk score - investigate further before action",
      });
    }

    return { suggestions };
  }
}

module.exports = ModerationQueue;

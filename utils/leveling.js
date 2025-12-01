const db = require("./database");
const { EmbedBuilder } = require("discord.js");

class Leveling {
  static calculateXPForLevel(level) {
    return 100 * level * (level + 1);
  }

  static calculateLevel(xp) {
    let level = 0;
    let requiredXP = 0;
    while (requiredXP <= xp) {
      level++;
      requiredXP += this.calculateXPForLevel(level);
    }
    return level - 1;
  }

  static async addXP(guildId, userId, amount) {
    return new Promise((resolve, reject) => {
      db.db.get(
        "SELECT xp, level, total_xp FROM levels WHERE guild_id = ? AND user_id = ?",
        [guildId, userId],
        (err, row) => {
          if (err) {
            reject(err);
            return;
          }

          const currentXP = row ? row.xp : 0;
          const currentLevel = row ? row.level : 0;
          const totalXP = row ? row.total_xp : 0;

          const newXP = currentXP + amount;
          const newTotalXP = totalXP + amount;
          const newLevel = this.calculateLevel(newTotalXP);

          db.db.run(
            `INSERT INTO levels (guild_id, user_id, xp, level, total_xp) 
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(guild_id, user_id) DO UPDATE SET xp = ?, level = ?, total_xp = ?`,
            [
              guildId,
              userId,
              newXP,
              newLevel,
              newTotalXP,
              newXP,
              newLevel,
              newTotalXP,
            ],
            (err) => {
              if (err) reject(err);
              else
                resolve({
                  xp: newXP,
                  level: newLevel,
                  leveledUp: newLevel > currentLevel,
                });
            }
          );
        }
      );
    });
  }

  static async getLevel(guildId, userId) {
    return new Promise((resolve, reject) => {
      db.db.get(
        "SELECT * FROM levels WHERE guild_id = ? AND user_id = ?",
        [guildId, userId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row || { xp: 0, level: 0, total_xp: 0 });
        }
      );
    });
  }

  static async getLeaderboard(guildId, limit = 10) {
    return new Promise((resolve, reject) => {
      db.db.all(
        "SELECT * FROM levels WHERE guild_id = ? ORDER BY total_xp DESC LIMIT ?",
        [guildId, limit],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  static createLevelUpEmbed(user, level, xp) {
    return new EmbedBuilder()
      .setTitle("🎉 Level Up!")
      .setDescription(`${user} reached **Level ${level}**!`)
      .addFields({
        name: "Total XP",
        value: `${xp.toLocaleString()}`,
        inline: true,
      })
      .setColor(0x00ff00)
      .setTimestamp();
  }
}

module.exports = Leveling;

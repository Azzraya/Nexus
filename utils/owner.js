// Owner utility for bot owner checks
const OWNER_ID = process.env.OWNER_ID || "1392165977793368124";

class Owner {
  /**
   * Check if a user is the bot owner
   * @param {string} userId - The user ID to check
   * @returns {boolean} - True if user is bot owner
   */
  static isOwner(userId) {
    return userId === OWNER_ID;
  }

  /**
   * Get the bot owner ID
   * @returns {string} - The bot owner ID
   */
  static getOwnerId() {
    return OWNER_ID;
  }
}

module.exports = Owner;

// Owner utility for bot owner checks
// IMPORTANT: Set OWNER_ID in .env file for production
const OWNER_ID = process.env.OWNER_ID;

if (!OWNER_ID) {
  console.error("⚠️ WARNING: OWNER_ID not set in .env file! Owner-only commands will not work.");
}

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

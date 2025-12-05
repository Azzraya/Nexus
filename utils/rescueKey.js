const crypto = require("crypto");
const { authenticator } = require("otplib");
const QRCode = require("qrcode");
const db = require("./database");
const logger = require("./logger");

class RescueKey {
  /**
   * Generate a TOTP secret for a guild
   */
  static generateSecret() {
    return authenticator.generateSecret();
  }

  /**
   * Get rescue key (authenticator secret) for a guild
   */
  static async getKey(guildId) {
    return new Promise((resolve, reject) => {
      db.db.get(
        "SELECT * FROM rescue_keys WHERE guild_id = ?",
        [guildId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  /**
   * Set rescue key (authenticator secret) for a guild
   * Returns the secret and QR code data URL
   */
  static async setKey(guildId, ownerId, secret = null) {
    const authenticatorSecret = secret || this.generateSecret();
    const createdAt = Date.now();

    // Generate QR code for authenticator setup
    const otpauth = authenticator.keyuri(
      `Nexus-${guildId}`,
      "Nexus Bot",
      authenticatorSecret
    );

    let qrCodeDataUrl = null;
    try {
      qrCodeDataUrl = await QRCode.toDataURL(otpauth);
    } catch (error) {
      logger.error("Failed to generate QR code:", error);
    }

    return new Promise((resolve, reject) => {
      db.db.run(
        `INSERT OR REPLACE INTO rescue_keys (guild_id, owner_id, rescue_key, created_at) 
         VALUES (?, ?, ?, ?)`,
        [guildId, ownerId, authenticatorSecret, createdAt],
        (err) => {
          if (err) reject(err);
          else
            resolve({
              secret: authenticatorSecret,
              qrCode: qrCodeDataUrl,
              otpauth: otpauth,
            });
        }
      );
    });
  }

  /**
   * Regenerate rescue key (authenticator secret)
   */
  static async regenerateKey(guildId, ownerId) {
    return this.setKey(guildId, ownerId);
  }

  /**
   * Verify authenticator code and transfer ownership
   * @param {string} guildId - The server ID
   * @param {string} code - The 6-digit authenticator code
   * @param {string} newOwnerId - The new owner's user ID
   */
  static async useKey(guildId, code, newOwnerId) {
    return new Promise((resolve, reject) => {
      db.db.get(
        "SELECT * FROM rescue_keys WHERE guild_id = ?",
        [guildId],
        async (err, row) => {
          if (err) {
            reject(err);
            return;
          }

          if (!row) {
            resolve({
              valid: false,
              message: "No rescue key found for this server",
            });
            return;
          }

          // Verify the authenticator code
          const isValid = authenticator.verify({
            token: code,
            secret: row.rescue_key,
          });

          if (!isValid) {
            resolve({
              valid: false,
              message: "Invalid authenticator code",
            });
            return;
          }

          // Update ownership
          await new Promise((resolve2, reject2) => {
            db.db.run(
              "UPDATE rescue_keys SET owner_id = ?, used_at = ? WHERE guild_id = ?",
              [newOwnerId, Date.now(), guildId],
              (err2) => {
                if (err2) reject2(err2);
                else resolve2();
              }
            );
          });

          // Log the rescue key usage
          await new Promise((resolve2, reject2) => {
            db.db.run(
              "INSERT INTO rescue_key_logs (guild_id, old_owner_id, new_owner_id, used_at) VALUES (?, ?, ?, ?)",
              [guildId, row.owner_id, newOwnerId, Date.now()],
              (err2) => {
                if (err2) reject2(err2);
                else resolve2();
              }
            );
          });

          resolve({ valid: true, message: "Rescue key used successfully" });
        }
      );
    });
  }

  /**
   * Get QR code data for rescue key setup
   */
  static async getQRCode(guildId) {
    const key = await this.getKey(guildId);
    if (!key) return null;

    const otpauth = authenticator.keyuri(
      `Nexus-${guildId}`,
      "Nexus Bot",
      key.rescue_key
    );

    try {
      return await QRCode.toDataURL(otpauth);
    } catch (error) {
      logger.error("Failed to generate QR code:", error);
      return null;
    }
  }
}

module.exports = RescueKey;

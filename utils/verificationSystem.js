const db = require("./database");
const logger = require("./logger");
const crypto = require("crypto");

class VerificationSystem {
  constructor(client) {
    this.client = client;
    this.pendingVerifications = new Map(); // Track pending verifications
    this.captchaCodes = new Map(); // Track captcha codes
  }

  // Generate a simple math captcha
  generateMathCaptcha() {
    const num1 = Math.floor(Math.random() * 10) + 1;
    const num2 = Math.floor(Math.random() * 10) + 1;
    const answer = num1 + num2;
    const code = crypto.randomBytes(4).toString("hex").toUpperCase();

    return {
      question: `${num1} + ${num2} = ?`,
      answer: answer.toString(),
      code: code,
    };
  }

  // Generate a text captcha (simple word)
  generateTextCaptcha() {
    const words = ["NEXUS", "BOT", "DISCORD", "VERIFY", "SAFE", "SECURE"];
    const word = words[Math.floor(Math.random() * words.length)];
    const code = crypto.randomBytes(4).toString("hex").toUpperCase();

    return {
      question: `Type the word: ${word}`,
      answer: word.toLowerCase(),
      code: code,
    };
  }

  // Check if user is suspicious
  async isSuspiciousAccount(member) {
    const accountAge = Date.now() - member.user.createdTimestamp;
    const daysOld = accountAge / (1000 * 60 * 60 * 24);

    // New account (less than 7 days)
    if (daysOld < 7) return true;

    // No avatar
    if (!member.user.avatar) return true;

    // Username contains invite links
    if (
      /(discord\.gg|discord\.com\/invite|discord\.io)/i.test(
        member.user.username
      )
    ) {
      return true;
    }

    // Suspicious username patterns
    const suspiciousPatterns = [
      /^[a-z0-9]{1,3}$/i, // Very short usernames
      /^[0-9]+$/, // Only numbers
      /(spam|raid|nuke|bot|scam)/i, // Suspicious keywords
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(member.user.username)) {
        return true;
      }
    }

    return false;
  }

  // Check if user should be verified
  async shouldVerify(member, config) {
    if (!config.verification_enabled) return false;

    // If targeting everyone, always verify
    if (config.verification_target === "everyone") {
      return true;
    }

    // If targeting suspicious only, check if suspicious
    if (config.verification_target === "suspicious") {
      return await this.isSuspiciousAccount(member);
    }

    // Default: verify everyone
    return true;
  }

  // Get verification mode for user based on server type
  getVerificationMode(config, member) {
    // Server type scaling
    if (config.verification_server_type === "nft_crypto") {
      // NFT/Crypto servers: Always use web verification (most secure)
      return "web";
    }

    if (config.verification_server_type === "big_server") {
      // Big servers: Use captcha (balance of security and UX)
      return config.verification_mode || "captcha";
    }

    // Default: Use configured mode or instant
    return config.verification_mode || "instant";
  }

  // Start verification process
  async startVerification(member, config) {
    const shouldVerify = await this.shouldVerify(member, config);
    if (!shouldVerify) {
      // User doesn't need verification, give role immediately
      if (config.verification_role) {
        const role = member.guild.roles.cache.get(config.verification_role);
        if (role) {
          await member.roles.add(
            role,
            "Verification: Not suspicious, instant verify"
          );
        }
      }
      return null;
    }

    const mode = this.getVerificationMode(config, member);
    const verificationId = crypto.randomBytes(16).toString("hex");

    // Store verification data
    this.pendingVerifications.set(verificationId, {
      userId: member.id,
      guildId: member.guild.id,
      mode: mode,
      startedAt: Date.now(),
      config: config,
    });

    // Send verification based on mode
    switch (mode) {
      case "captcha":
        return await this.sendCaptchaVerification(
          member,
          verificationId,
          config
        );
      case "web":
        return await this.sendWebVerification(member, verificationId, config);
      case "instant":
        return await this.sendInstantVerification(
          member,
          verificationId,
          config
        );
      default:
        return await this.sendInstantVerification(
          member,
          verificationId,
          config
        );
    }
  }

  // Send captcha verification
  async sendCaptchaVerification(member, verificationId, config) {
    try {
      const captcha = this.generateMathCaptcha();
      this.captchaCodes.set(verificationId, captcha.answer);

      const {
        EmbedBuilder,
        ActionRowBuilder,
        ButtonBuilder,
        ButtonStyle,
      } = require("discord.js");

      const embed = new EmbedBuilder()
        .setTitle("🔒 Verification Required")
        .setDescription(
          config.verification_message ||
            "Please complete the captcha to verify your account.\n\n" +
              `**Question:** ${captcha.question}\n\n` +
              "Click the button below and type your answer in the channel."
        )
        .setColor(0xffaa00)
        .setFooter({ text: "You have 5 minutes to complete verification" })
        .setTimestamp();

      const button = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`verify_captcha_${verificationId}`)
          .setLabel("Start Verification")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("🔐")
      );

      const dmChannel = await member.createDM().catch(() => null);
      if (dmChannel) {
        await dmChannel.send({ embeds: [embed], components: [button] });
        return { sent: true, channel: "dm" };
      } else {
        // If DM fails, try to send in verification channel
        const verificationChannel = config.verification_channel
          ? member.guild.channels.cache.get(config.verification_channel)
          : null;

        if (verificationChannel) {
          await verificationChannel.send({
            content: `${member}, please verify:`,
            embeds: [embed],
            components: [button],
          });
          return { sent: true, channel: "guild" };
        }
      }

      return { sent: false, reason: "Could not send verification message" };
    } catch (error) {
      logger.error(`[Verification] Error sending captcha verification:`, error);
      return { sent: false, reason: error.message };
    }
  }

  // Send web verification
  async sendWebVerification(member, verificationId, config) {
    try {
      // Generate verification token
      const token = crypto.randomBytes(32).toString("hex");
      this.captchaCodes.set(verificationId, token);

      // Store token in database for web verification
      await new Promise((resolve, reject) => {
        db.db.run(
          "INSERT INTO verification_tokens (guild_id, user_id, token, verification_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
          [
            member.guild.id,
            member.id,
            token,
            verificationId,
            Date.now(),
            Date.now() + 3600000, // 1 hour expiry
          ],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      const {
        EmbedBuilder,
        ActionRowBuilder,
        ButtonBuilder,
        ButtonStyle,
      } = require("discord.js");

      // Web verification URL (would be your website)
      const webUrl =
        process.env.VERIFICATION_WEB_URL ||
        `https://nexus-bot.vercel.app/verify?token=${token}&id=${verificationId}`;

      const embed = new EmbedBuilder()
        .setTitle("🔒 Web Verification Required")
        .setDescription(
          config.verification_message ||
            "Please complete web verification to verify your account.\n\n" +
              "Click the button below to open the verification page in your browser."
        )
        .setColor(0x0099ff)
        .setFooter({ text: "You have 1 hour to complete verification" })
        .setTimestamp();

      const button = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel("Verify on Website")
          .setStyle(ButtonStyle.Link)
          .setURL(webUrl)
          .setEmoji("🌐")
      );

      const dmChannel = await member.createDM().catch(() => null);
      if (dmChannel) {
        await dmChannel.send({ embeds: [embed], components: [button] });
        return { sent: true, channel: "dm", token: token };
      } else {
        const verificationChannel = config.verification_channel
          ? member.guild.channels.cache.get(config.verification_channel)
          : null;

        if (verificationChannel) {
          await verificationChannel.send({
            content: `${member}, please verify:`,
            embeds: [embed],
            components: [button],
          });
          return { sent: true, channel: "guild", token: token };
        }
      }

      return { sent: false, reason: "Could not send verification message" };
    } catch (error) {
      logger.error(`[Verification] Error sending web verification:`, error);
      return { sent: false, reason: error.message };
    }
  }

  // Send instant verification (button click)
  async sendInstantVerification(member, verificationId, config) {
    try {
      const {
        EmbedBuilder,
        ActionRowBuilder,
        ButtonBuilder,
        ButtonStyle,
      } = require("discord.js");

      const embed = new EmbedBuilder()
        .setTitle("✅ Verification Required")
        .setDescription(
          config.verification_message ||
            "Click the button below to verify your account and gain access to the server."
        )
        .setColor(0x00ff00)
        .setTimestamp();

      const button = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`verify_instant_${verificationId}`)
          .setLabel("Verify")
          .setStyle(ButtonStyle.Success)
          .setEmoji("✅")
      );

      const dmChannel = await member.createDM().catch(() => null);
      if (dmChannel) {
        await dmChannel.send({ embeds: [embed], components: [button] });
        return { sent: true, channel: "dm" };
      } else {
        const verificationChannel = config.verification_channel
          ? member.guild.channels.cache.get(config.verification_channel)
          : null;

        if (verificationChannel) {
          await verificationChannel.send({
            content: `${member}, please verify:`,
            embeds: [embed],
            components: [button],
          });
          return { sent: true, channel: "guild" };
        }
      }

      return { sent: false, reason: "Could not send verification message" };
    } catch (error) {
      logger.error(`[Verification] Error sending instant verification:`, error);
      return { sent: false, reason: error.message };
    }
  }

  // Verify user (complete verification)
  async completeVerification(verificationId, answer = null) {
    const verification = this.pendingVerifications.get(verificationId);
    if (!verification) {
      return { success: false, reason: "Verification not found or expired" };
    }

    // Check expiry (5 minutes for captcha/instant, 1 hour for web)
    const expiry = verification.mode === "web" ? 3600000 : 300000;
    if (Date.now() - verification.startedAt > expiry) {
      this.pendingVerifications.delete(verificationId);
      return { success: false, reason: "Verification expired" };
    }

    // Verify answer for captcha
    if (verification.mode === "captcha" && answer) {
      const correctAnswer = this.captchaCodes.get(verificationId);
      if (answer.toLowerCase().trim() !== correctAnswer.toLowerCase().trim()) {
        return { success: false, reason: "Incorrect answer" };
      }
    }

    // Verify token for web
    if (verification.mode === "web") {
      // Token verification would happen on web server
      // For now, we'll accept it if verification exists
    }

    // Give role
    try {
      const guild = this.client.guilds.cache.get(verification.guildId);
      if (!guild) {
        return { success: false, reason: "Guild not found" };
      }

      const member = await guild.members
        .fetch(verification.userId)
        .catch(() => null);
      if (!member) {
        return { success: false, reason: "Member not found" };
      }

      if (verification.config.verification_role) {
        const role = guild.roles.cache.get(
          verification.config.verification_role
        );
        if (role) {
          await member.roles.add(role, "Verification completed");

          // Clean up
          this.pendingVerifications.delete(verificationId);
          this.captchaCodes.delete(verificationId);

          return { success: true, member: member };
        }
      }

      return { success: false, reason: "Verification role not found" };
    } catch (error) {
      logger.error(`[Verification] Error completing verification:`, error);
      return { success: false, reason: error.message };
    }
  }

  // Clean up expired verifications
  cleanup() {
    const now = Date.now();
    for (const [id, verification] of this.pendingVerifications.entries()) {
      const expiry = verification.mode === "web" ? 3600000 : 300000;
      if (now - verification.startedAt > expiry) {
        this.pendingVerifications.delete(id);
        this.captchaCodes.delete(id);
      }
    }
  }
}

module.exports = VerificationSystem;

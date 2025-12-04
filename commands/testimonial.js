/**
 * Testimonial Command
 * Collect testimonials from server owners
 */

const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require("discord.js");
const db = require("../utils/database");
const logger = require("../utils/logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("testimonial")
    .setDescription("📝 Leave a testimonial about Nexus")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("submit")
        .setDescription("Submit a testimonial for Nexus")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("view")
        .setDescription("View submitted testimonials")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === "submit") {
        await this.showSubmitModal(interaction);
      } else if (subcommand === "view") {
        await this.viewTestimonials(interaction);
      }
    } catch (error) {
      logger.error("Testimonial Command Error:", error);
      
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          ErrorMessages.genericError(),
          ephemeral: true,
        });
      }
    }
  },

  async showSubmitModal(interaction) {
    const modal = new ModalBuilder()
      .setCustomId("testimonial_submit")
      .setTitle("Submit Testimonial for Nexus");

    const nameInput = new TextInputBuilder()
      .setCustomId("testimonial_name")
      .setLabel("Your Name / Server Name")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("John Doe / My Gaming Server")
      .setRequired(true)
      .setMaxLength(100);

    const roleInput = new TextInputBuilder()
      .setCustomId("testimonial_role")
      .setLabel("Your Role")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("Server Owner / Admin / Moderator")
      .setRequired(false)
      .setMaxLength(50);

    const feedbackInput = new TextInputBuilder()
      .setCustomId("testimonial_feedback")
      .setLabel("Your Experience with Nexus")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("Tell us what you like about Nexus, how it helped your server, etc.")
      .setRequired(true)
      .setMinLength(50)
      .setMaxLength(500);

    const ratingInput = new TextInputBuilder()
      .setCustomId("testimonial_rating")
      .setLabel("Rating (1-5 stars)")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("5")
      .setRequired(true)
      .setMinLength(1)
      .setMaxLength(1);

    modal.addComponents(
      new ActionRowBuilder().addComponents(nameInput),
      new ActionRowBuilder().addComponents(roleInput),
      new ActionRowBuilder().addComponents(feedbackInput),
      new ActionRowBuilder().addComponents(ratingInput)
    );

    await interaction.showModal(modal);
  },

  async viewTestimonials(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const testimonials = await new Promise((resolve, reject) => {
      db.db.all(
        "SELECT * FROM testimonials WHERE guild_id = ? OR is_approved = 1 ORDER BY created_at DESC LIMIT 10",
        [interaction.guild.id],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    if (testimonials.length === 0) {
      return interaction.editReply({
        content: "📝 No testimonials yet. Use `/testimonial submit` to be the first!",
      });
    }

    const embed = new EmbedBuilder()
      .setTitle("📝 Testimonials")
      .setColor(0x667eea)
      .setTimestamp();

    testimonials.forEach((t, index) => {
      const stars = "⭐".repeat(parseInt(t.rating));
      embed.addFields({
        name: `${stars} ${t.name}${t.role ? ` (${t.role})` : ""}`,
        value: `"${t.feedback}"\n${t.is_approved ? "✅ Featured on website" : "⏳ Pending review"}`,
        inline: false,
      });
    });

    await interaction.editReply({ embeds: [embed] });
  },
};

// Handle modal submission
module.exports.handleTestimonialSubmit = async (interaction) => {
  const name = interaction.fields.getTextInputValue("testimonial_name");
  const role = interaction.fields.getTextInputValue("testimonial_role");
  const feedback = interaction.fields.getTextInputValue("testimonial_feedback");
  const rating = interaction.fields.getTextInputValue("testimonial_rating");

  // Validate rating
  if (!/^[1-5]$/.test(rating)) {
    return interaction.reply({
      content: "❌ Rating must be 1-5",
      ephemeral: true,
    });
  }

  // Create testimonials table if not exists
  await new Promise((resolve, reject) => {
    db.db.run(
      `CREATE TABLE IF NOT EXISTS testimonials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT,
        feedback TEXT NOT NULL,
        rating INTEGER NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        is_approved INTEGER DEFAULT 0
      )`,
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });

  // Save testimonial
  await new Promise((resolve, reject) => {
    db.db.run(
      "INSERT INTO testimonials (guild_id, user_id, name, role, feedback, rating) VALUES (?, ?, ?, ?, ?, ?)",
      [
        interaction.guild.id,
        interaction.user.id,
        name,
        role,
        feedback,
        parseInt(rating),
      ],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });

  const embed = new EmbedBuilder()
    .setTitle("✅ Testimonial Submitted!")
    .setDescription(
      "Thank you for your feedback!\n\n" +
        "Your testimonial will be reviewed and may be featured on our website and marketing materials.\n\n" +
        "**What you submitted:**"
    )
    .addFields(
      { name: "Name", value: name, inline: true },
      { name: "Role", value: role || "N/A", inline: true },
      { name: "Rating", value: "⭐".repeat(parseInt(rating)), inline: true },
      { name: "Feedback", value: feedback, inline: false }
    )
    .setColor(0x00ff00)
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });

  // Notify admin
  if (process.env.ADMIN_WEBHOOK_URL) {
    const https = require("https");
const ErrorMessages = require("../utils/errorMessages");
    const url = new URL(process.env.ADMIN_WEBHOOK_URL);
    const webhook = {
      username: "Nexus Testimonials",
      embeds: [
        {
          title: "📝 New Testimonial Submitted",
          fields: [
            { name: "Server", value: interaction.guild.name, inline: true },
            { name: "By", value: `${name}${role ? ` (${role})` : ""}`, inline: true },
            { name: "Rating", value: "⭐".repeat(parseInt(rating)), inline: true },
            { name: "Feedback", value: feedback, inline: false },
          ],
          color: parseInt(rating) >= 4 ? 0x00ff00 : 0xffaa00,
          timestamp: new Date().toISOString(),
        },
      ],
    };

    const postData = JSON.stringify(webhook);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
      },
    };

    const req = https.request(options);
    req.write(postData);
    req.end();
  }

  logger.info(
    `[Testimonial] New testimonial from ${interaction.guild.name}: ${rating}/5 stars`
  );
};


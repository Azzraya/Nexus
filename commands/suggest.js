const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const logger = require("../utils/logger");
const db = require("../utils/database");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("suggest")
    .setDescription("Suggest a new feature or improvement for Nexus"),

  async execute(interaction, client) {
    // Create modal for suggestion
    const modal = new ModalBuilder()
      .setCustomId("suggestion_modal")
      .setTitle("💡 Suggest a Feature");

    const titleInput = new TextInputBuilder()
      .setCustomId("suggestion_title")
      .setLabel("Feature Title")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("Brief title for your suggestion")
      .setRequired(true)
      .setMaxLength(100);

    const descriptionInput = new TextInputBuilder()
      .setCustomId("suggestion_description")
      .setLabel("Description")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("Describe your feature idea in detail...")
      .setRequired(true)
      .setMaxLength(1000);

    const useCaseInput = new TextInputBuilder()
      .setCustomId("suggestion_usecase")
      .setLabel("Use Case (Optional)")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder(
        "How would this feature be used? What problem does it solve?"
      )
      .setRequired(false)
      .setMaxLength(500);

    const firstRow = new ActionRowBuilder().addComponents(titleInput);
    const secondRow = new ActionRowBuilder().addComponents(descriptionInput);
    const thirdRow = new ActionRowBuilder().addComponents(useCaseInput);

    modal.addComponents(firstRow, secondRow, thirdRow);

    await interaction.showModal(modal);

    // Handle modal submission
    const filter = (i) =>
      i.customId === "suggestion_modal" && i.user.id === interaction.user.id;

    try {
      const modalInteraction = await interaction.awaitModalSubmit({
        filter,
        time: 300000, // 5 minutes
      });

      const title =
        modalInteraction.fields.getTextInputValue("suggestion_title");
      const description = modalInteraction.fields.getTextInputValue(
        "suggestion_description"
      );
      const useCase =
        modalInteraction.fields.getTextInputValue("suggestion_usecase") ||
        "Not provided";

      // Save suggestion to database
      await new Promise((resolve, reject) => {
        db.db.run(
          `INSERT INTO suggestions (guild_id, user_id, title, description, use_case, status, created_at, votes) VALUES (?, ?, ?, ?, ?, 'pending', ?, 0)`,
          [
            interaction.guild.id,
            interaction.user.id,
            title,
            description,
            useCase,
            Date.now(),
          ],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Get suggestion ID
      const suggestion = await new Promise((resolve, reject) => {
        db.db.get(
          "SELECT * FROM suggestions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
          [interaction.user.id],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      // Send confirmation
      const confirmEmbed = new EmbedBuilder()
        .setTitle("✅ Suggestion Submitted!")
        .setDescription(
          `Thank you for helping improve Nexus! Your suggestion has been recorded.\n\n` +
            `**${title}**\n${description}`
        )
        .addFields({
          name: "What Happens Next?",
          value:
            "• Developers will review your suggestion\n" +
            "• Community can vote on it\n" +
            "• Popular suggestions get prioritized\n" +
            "• You'll be notified of updates",
        })
        .setColor(0x00ff88)
        .setFooter({ text: `Suggestion ID: ${suggestion.id}` })
        .setTimestamp();

      const voteButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`vote_${suggestion.id}`)
          .setLabel("Vote")
          .setStyle(ButtonStyle.Success)
          .setEmoji("👍"),
        new ButtonBuilder()
          .setLabel("View All Suggestions")
          .setStyle(ButtonStyle.Link)
          .setURL("https://azzraya.github.io/Nexus/vote-features.html")
      );

      await modalInteraction.reply({
        embeds: [confirmEmbed],
        components: [voteButtons],
        ephemeral: true,
      });

      // Send to admin webhook if configured
      if (process.env.SUGGESTIONS_WEBHOOK_URL) {
        const https = require("https");
        const url = new URL(process.env.SUGGESTIONS_WEBHOOK_URL);

        const webhook = {
          embeds: [
            {
              title: "💡 New Feature Suggestion",
              description: `**${title}**\n\n${description}`,
              fields: [
                {
                  name: "Use Case",
                  value: useCase,
                },
                {
                  name: "Suggested By",
                  value: `${interaction.user.tag} (${interaction.user.id})`,
                  inline: true,
                },
                {
                  name: "Server",
                  value: interaction.guild.name,
                  inline: true,
                },
              ],
              color: 6737151, // Purple
              timestamp: new Date().toISOString(),
              footer: {
                text: `Suggestion ID: ${suggestion.id}`,
              },
            },
          ],
        };

        const postData = JSON.stringify(webhook);

        const options = {
          hostname: url.hostname,
          path: url.pathname,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": postData.length,
          },
        };

        const req = https.request(options);
        req.write(postData);
        req.end();
      }
    } catch (error) {
      logger.error("suggest", "Error handling suggestion", error);
    }
  },
};

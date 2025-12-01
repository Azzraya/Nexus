const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const db = require("../utils/database");
const Owner = require("../utils/owner");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("vote")
    .setDescription("Vote for the bot on bot listing websites")
    .addSubcommand((subcommand) =>
      subcommand.setName("list").setDescription("View all voting links")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add")
        .setDescription("Add a botlist voting link (Owner only)")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("Name of the botlist (e.g., Top.gg, Discord Bot List)")
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("url")
            .setDescription("Full voting URL for the botlist")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("remove")
        .setDescription("Remove a botlist voting link (Owner only)")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("Name of the botlist to remove")
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "list") {
      // Get all botlist links
      const botlists = await new Promise((resolve, reject) => {
        db.db.all(
          "SELECT * FROM botlist_links ORDER BY name ASC",
          [],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });

      if (botlists.length === 0) {
        const embed = new EmbedBuilder()
          .setTitle("📊 Vote for Nexus")
          .setDescription(
            "No voting links have been configured yet.\n\nAdministrators can add voting links using `/vote add`"
          )
          .setColor(0x5865f2)
          .setFooter({
            text: "Thank you for supporting Nexus!",
          });

        return interaction.reply({ embeds: [embed] });
      }

      const embed = new EmbedBuilder()
        .setTitle("📊 Vote for Nexus")
        .setDescription(
          "Help support Nexus by voting on these bot listing websites!\n\nYour votes help us grow and improve the bot. 💙"
        )
        .setColor(0x5865f2)
        .setFooter({
          text: `Thank you for supporting Nexus! • ${botlists.length} botlist${botlists.length !== 1 ? "s" : ""} available`,
        })
        .setTimestamp();

      // Add botlist links as fields
      botlists.forEach((botlist, index) => {
        embed.addFields({
          name: `${index + 1}. ${botlist.name}`,
          value: `[Click to vote →](${botlist.url})`,
          inline: true,
        });
      });

      // Create buttons for each botlist (max 5 buttons per row, Discord limit)
      const rows = [];
      const maxButtons = 5;
      
      for (let i = 0; i < botlists.length; i += maxButtons) {
        const row = new ActionRowBuilder();
        const batch = botlists.slice(i, i + maxButtons);
        
        batch.forEach((botlist) => {
          row.addComponents(
            new ButtonBuilder()
              .setLabel(botlist.name.length > 20 ? botlist.name.substring(0, 17) + "..." : botlist.name)
              .setURL(botlist.url)
              .setStyle(ButtonStyle.Link)
          );
        });
        
        rows.push(row);
      }

      return interaction.reply({
        embeds: [embed],
        components: rows,
      });
    }

    if (subcommand === "add") {
      // Owner only
      if (!Owner.isOwner(interaction.user.id)) {
        return interaction.reply({
          content: "❌ Only the bot owner can add voting links.",
          ephemeral: true,
        });
      }

      const name = interaction.options.getString("name");
      const url = interaction.options.getString("url");

      // Validate URL
      try {
        new URL(url);
      } catch (error) {
        return interaction.reply({
          content: "❌ Invalid URL format. Please provide a valid URL (e.g., https://top.gg/bot/.../vote)",
          ephemeral: true,
        });
      }

      // Check if botlist already exists
      const existing = await new Promise((resolve, reject) => {
        db.db.get(
          "SELECT * FROM botlist_links WHERE LOWER(name) = LOWER(?)",
          [name],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      if (existing) {
        return interaction.reply({
          content: `❌ A botlist with the name "${name}" already exists. Use \`/vote remove\` first if you want to update it.`,
          ephemeral: true,
        });
      }

      // Add botlist
      await new Promise((resolve, reject) => {
        db.db.run(
          "INSERT INTO botlist_links (name, url, added_by, added_at) VALUES (?, ?, ?, ?)",
          [name, url, interaction.user.id, Date.now()],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      const embed = new EmbedBuilder()
        .setTitle("✅ Botlist Added")
        .setDescription(`Successfully added **${name}** to the voting list.`)
        .addFields({
          name: "URL",
          value: url,
        })
        .setColor(0x00ff00)
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (subcommand === "remove") {
      // Owner only
      if (!Owner.isOwner(interaction.user.id)) {
        return interaction.reply({
          content: "❌ Only the bot owner can remove voting links.",
          ephemeral: true,
        });
      }

      const name = interaction.options.getString("name");

      // Check if botlist exists
      const existing = await new Promise((resolve, reject) => {
        db.db.get(
          "SELECT * FROM botlist_links WHERE LOWER(name) = LOWER(?)",
          [name],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      if (!existing) {
        return interaction.reply({
          content: `❌ No botlist found with the name "${name}".`,
          ephemeral: true,
        });
      }

      // Remove botlist
      await new Promise((resolve, reject) => {
        db.db.run(
          "DELETE FROM botlist_links WHERE LOWER(name) = LOWER(?)",
          [name],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      const embed = new EmbedBuilder()
        .setTitle("✅ Botlist Removed")
        .setDescription(`Successfully removed **${name}** from the voting list.`)
        .setColor(0xff0000)
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};


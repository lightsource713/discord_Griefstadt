const { eventEmitter } = require("../functions/eventEmitter.js");
const {
  sendInteractionReply,
  buildSelectMenu,
} = require("../functions/botActions");
const {
  CacheGetUserXP,
  CacheGetCooldown,
  CacheSetCooldown,
} = require("../apis/redis/redisCache");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const { DBUpdateXP } = require("../apis/firebase/querys");
const {
  DegradationCost,
  DegradationCooldown,
  KnightCost,
  KnightCooldown,
  SiegeCost,
  KingSiegeTimedPollDuration,
  KingSiegeTimedPollWinningRate,
  KingSiegeTimedPollCoolDown,
  ScholarSendMessageCoolDown,
} = require("../game_config.json");

const content =
  "Test message to Scholar.\n" +
  "**Abilities:**\n" +
  "- **SendMessage**: Send message to the Royal Castle\n";

function showErrorMsg(err) {
  console.error("ERROR: scholar_commands.js", err);
}

async function setupScholarBotEvents(client, lastMessageId) {
  client.on("interactionCreate", async (interaction) => {
    const userId = interaction.user.id;
    const channel = await client.channels.fetch(process.env.CHANNELIDSCHOLAR);
    if (interaction.isButton()) {
      if (interaction.customId === "SendMessage") {
        const modal = new ModalBuilder()
          .setCustomId("royalCastleModal")
          .setTitle("Send Message to Royal Castle");

        const messageInput = new TextInputBuilder()
          .setCustomId("messageInput")
          .setLabel("Enter your message:")
          .setStyle(TextInputStyle.Paragraph);

        const actionRow = new ActionRowBuilder().addComponents(messageInput);

        modal.addComponents(actionRow);

        const cooldown = await CacheGetCooldown(
          "sendMessageToRoyalCastle",
          userId
        );
        if (cooldown) {
          const tmpMessage = await channel.send(
            "This ability is on cooldown and cannot be used"
          );
          setTimeout(() => {
            tmpMessage.delete().catch(showErrorMsg);
          }, 2000);

          return;
        }

        await interaction.showModal(modal);
      }
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId === "royalCastleModal") {
        const message = interaction.fields.getTextInputValue("messageInput");

        try {
          // Defer reply to avoid timeout
          await interaction.deferReply({ ephemeral: true });

          // Emit event
          eventEmitter.emit("sendMessageToRoyalCastle", userId, message);

          // Set cooldown (e.g., 60 seconds)
          await CacheSetCooldown(
            "sendMessageToRoyalCastle",
            userId,
            ScholarSendMessageCoolDown
          );

          await interaction.followUp({
            content: `${interaction.user.username} sent message to the royal castle.`,
            ephemeral: true,
          });

          await reset(interaction, client);
        } catch (err) {
          showErrorMsg(err);
        }
      }
    }
  });
}

// Function to reset the poll - Ensure this functionality is robustly clearing older messages
async function reset(interaction, client) {
  try {
    userId = interaction.user.id;

    const channel = await client.channels.fetch(process.env.CHANNELIDSCHOLAR); // Fetch the channel as before
    if (!channel) {
      console.error("Failed to fetch noble channel.");
      return;
    }

    let shouldContinue = true;
    while (shouldContinue) {
      const messages = await channel.messages.fetch({ limit: 100 });
      const botMessages = messages.filter(
        (msg) => msg.author.id === client.user.id
      );

      if (botMessages.size === 0) {
        shouldContinue = false;
        break;
      }

      for (const message of botMessages.values()) {
        await message.delete().catch(console.error); // Delete the message
      }

      await new Promise((resolve) => setTimeout(resolve, 1000)); // Ensure rate limits are respected
    }

    await messageScholarCommands(client); // Send new command message
  } catch (err) {
    showErrorMsg(err);
  }
}

async function messageScholarCommands(client) {
  let channel = null;
  try {
    channel = await client.channels.fetch(process.env.CHANNELIDSCHOLAR);
    const btnRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("SendMessage")
        .setLabel("Send to Royal Castle")
        .setStyle(ButtonStyle.Primary)
    );

    return await channel.send({
      content,
      components: [btnRow],
    });
  } catch (err) {
    showErrorMsg(err);
  }
}

module.exports = { setupScholarBotEvents, messageScholarCommands };


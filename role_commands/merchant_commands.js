const {
  StringSelectMenuBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const {
  buildSelectMenu,
  sendInteractionReply,
} = require("../functions/botActions");
const {
  HighWritCost,
  HighWritCooldown,
  CacheGetUserXP,
  CacheGetCooldown,
  CacheSetCooldown,
} = require("../apis/redis/redisCache");
const { GlobalCoolDown } = require("../game_config.json");
const { DBUpdateXP } = require("../apis/firebase/querys");
const { eventEmitter } = require("../functions/eventEmitter.js");
const c = require("config");

const content = "Test message to Noble.\n";
let selectedMembers = {};
let selectedMemberId = "";

function showErrorMsg(err) {
  console.error("ERROR: noble_commands.js", err);
}

async function setupMerchantBotEvents(client, lastMessageId) {
  client.on("guildMemberUpdate", async (oldMember, newMember) => {
    await updateSelectMenu(client, lastMessageId);
  });

  client.on("interactionCreate", async (interaction) => {
    const userId = interaction.user.id;

    if (
      interaction.isStringSelectMenu() &&
      interaction.customId === "MembersSelectMenu"
    ) {
      selectedMemberId = interaction.values[0];
      try {
        selectedMembers[selectedMemberId] =
          await interaction.guild.members.cache.get(selectedMemberId);

        let actionRow_0 = ActionRowBuilder.from(
          interaction.message.components[0].toJSON()
        );
        let actionRow_1 = ActionRowBuilder.from(
          interaction.message.components[1].toJSON()
        );
        let selectMenu = StringSelectMenuBuilder.from(
          actionRow_0.components[0].toJSON()
        );
        let button = ButtonBuilder.from(actionRow_1.components[0].toJSON());
        button.setDisabled(
          selectedMembers[selectedMemberId].user.id === userId
        );

        selectMenu.setPlaceholder(
          selectedMembers[selectedMemberId].user.username
        );
        actionRow_0.components[0] = selectMenu;
        actionRow_1.components[0] = button;

        await interaction.update({
          content,
          components: [actionRow_0, actionRow_1],
        });
      } catch (err) {
        showErrorMsg(err);
      }
    }

    if (interaction.isButton() && interaction.customId === "Bride") {
      if (!selectedMembers[selectedMemberId]) {
        await sendInteractionReply(interaction, "Choose a member");
      } else {
        // Display the modal
        const modal = new ModalBuilder()
          .setCustomId("xpModal")
          .setTitle("Grant XP to Member");

        const xpInput = new TextInputBuilder()
          .setCustomId("xpAmount")
          .setLabel("XP Amount")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("Enter XP to grant")
          .setRequired(true);

        const messageInput = new TextInputBuilder()
          .setCustomId("optionalMessage")
          .setLabel("Optional Message")
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder("Enter an optional message")
          .setRequired(false);

        const xpActionRow = new ActionRowBuilder().addComponents(xpInput);
        const messageActionRow = new ActionRowBuilder().addComponents(
          messageInput
        );

        modal.addComponents(xpActionRow, messageActionRow);

        await interaction.showModal(modal);
      }
    }

    // Handle modal submission
    if (interaction.isModalSubmit() && interaction.customId === "xpModal") {
      const xpAmount = Number(interaction.fields.getTextInputValue("xpAmount"));
      const optionalMessage =
        interaction.fields.getTextInputValue("optionalMessage") ||
        "No message provided";

      try {
        const merchantXPText = await CacheGetUserXP(userId);
        const merchantXP = Number(merchantXPText);
        if (merchantXP < xpAmount) {
          await interaction.reply({
            content: `You don't have enough XP to grant ${xpAmount}. You only have ${merchantXP} XP.`,
            ephemeral: true,
          });
          return;
        }

        // Deduct XP from merchant
        await DBUpdateXP(interaction.user.id, -xpAmount, client);

        // Give XP to the target member
        const targetMember = selectedMembers[selectedMemberId];
        await DBUpdateXP(targetMember.user.id, xpAmount, client);

        await interaction.reply({
          content: `Successfully granted ${xpAmount} XP to ${targetMember.user.username}. Message: ${optionalMessage}`,
          ephemeral: true,
        });
        notifyTarget(
          `You have been granted ${xpAmount} XP by ${interaction.user.username}. Message: ${optionalMessage}`
        );
      } catch (err) {
        showErrorMsg(err);
      }
    }
  });
}

// Function to notify target member
async function notifyTarget(messageContent) {
  selectedMembers[selectedMemberId].send(messageContent).catch(showErrorMsg);
}

async function updateSelectMenu(client, lastMessageId) {
  try {
    const channel = await client.channels.fetch(process.env.CHANNELIDMERCHANT);
    const messageToEdit = await channel.messages.fetch(lastMessageId);
    const actionRow_0 = new ActionRowBuilder().addComponents(
      await buildSelectMenu(
        client,
        ["peasant", "merchant", "knight", "noble", "lord", "king", "emperor"],
        "MembersSelectMenu"
      )
    );

    const existingComponents = messageToEdit.components.map((component) =>
      ActionRowBuilder.from(component.toJSON())
    );
    existingComponents[0] = actionRow_0;

    await messageToEdit.edit({
      content: messageToEdit.content,
      components: existingComponents,
    });
  } catch (err) {
    showErrorMsg(err);
  }
}

async function messageMerchantCommands(client) {
  try {
    const channel = await client.channels.fetch(process.env.CHANNELIDMERCHANT);
    const roleMemberSelectMenu = new ActionRowBuilder().addComponents(
      await buildSelectMenu(
        client,
        ["peasant", "merchant", "knight", "noble", "lord", "king", "emperor"],
        "MembersSelectMenu"
      )
    );
    const btnRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("Bride")
        .setLabel("Bride")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true)
    );

    return await channel.send({
      content,
      components: [roleMemberSelectMenu, btnRow],
    });
  } catch (err) {
    showErrorMsg(err);
  }
}

module.exports = { setupMerchantBotEvents, messageMerchantCommands };

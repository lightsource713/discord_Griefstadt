const {
  StringSelectMenuBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const {
  buildSelectMenu,
  sendInteractionReply,
} = require("../functions/botActions");
const {
  CacheGetCooldown,
  CacheSetCooldown,
} = require("../apis/redis/redisCache");
const {
  LordNobleTimedPollDuration,
  LordNobleTimedPollWinningRate,
  LordKingTimedPollDuration,
  LordKingTimedPollWinningRate,
  GlobalCoolDown,
} = require("../game_config.json");
const { DBUpdateXP } = require("../apis/firebase/querys");
const { eventEmitter } = require("../functions/eventEmitter.js");

const content = "Test message to Noble.\n";
let selectedNoble = {};
let selectedLord = {};
let selectedNobleId = "";
let selectedLordId = "";
let nobleRoleMembers = [];
let lordRoleMembers = [];
const activePolls = {}; // Track active polls and cooldowns

function showErrorMsg(err) {
  console.error("ERROR: noble_commands.js", err);
}

async function setupLordBotEvents(client, lastMessageId) {
  client.on("guildMemberUpdate", async (oldMember, newMember) => {
    if (
      oldMember.roles.cache.has(process.env.ROLEID_NOBLE) ||
      oldMember.roles.cache.has(process.env.ROLEID_LORD) ||
      newMember.roles.cache.has(process.env.ROLEID_NOBLE) ||
      newMember.roles.cache.has(process.env.ROLEID_LORD)
    ) {
      await updateSelectMenu(client, lastMessageId);
    }
  });

  client.on("interactionCreate", async (interaction) => {
    const userId = interaction.user.id;
    nobleRoleMembers = interaction.guild.members.cache.filter((member) =>
      member.roles.cache.has(process.env.ROLEID_NOBLE)
    );
    lordRoleMembers = interaction.guild.members.cache.filter((member) =>
      member.roles.cache.has(process.env.ROLEID_LORD)
    );
    if (!interaction.isStringSelectMenu() && !interaction.isButton()) return;

    if (interaction.customId === "NoblesSelectMenu") {
      selectedNobleId = interaction.values[0];
      try {
        selectedNoble[selectedNobleId] =
          await interaction.guild.members.cache.get(selectedNobleId);

        // Retrieve the components from the message
        let actionRow_0 = ActionRowBuilder.from(
          interaction.message.components[0].toJSON()
        );
        let actionRow_1 = ActionRowBuilder.from(
          interaction.message.components[1].toJSON()
        );
        let btnRow = ActionRowBuilder.from(
          interaction.message.components[2].toJSON()
        );

        // Update the select menu placeholder for nobles
        let selectMenuNoble = StringSelectMenuBuilder.from(
          actionRow_0.components[0].toJSON()
        );
        selectMenuNoble.setPlaceholder(
          selectedNoble[selectedNobleId].user.username
        );
        actionRow_0.components[0] = selectMenuNoble;

        // Enable the "Elect Lord" button and disable the "Elect King" button
        let buttonElectLord = ButtonBuilder.from(btnRow.components[0].toJSON());
        let buttonElectKing = ButtonBuilder.from(btnRow.components[1].toJSON());
        buttonElectLord.setDisabled(false); // Enable "Elect Lord"
        buttonElectKing.setDisabled(true); // Disable "Elect King"

        // Update the message with modified components
        await interaction.update({
          content,
          components: [
            actionRow_0,
            actionRow_1,
            new ActionRowBuilder().addComponents(
              buttonElectLord,
              buttonElectKing
            ),
          ],
        });
      } catch (err) {
        showErrorMsg(err);
      }
    }

    if (interaction.customId === "LordsSelectMenu") {
      selectedLordId = interaction.values[0];
      try {
        selectedLord[selectedLordId] =
          await interaction.guild.members.cache.get(selectedLordId);

        // Retrieve the components from the message
        let actionRow_0 = ActionRowBuilder.from(
          interaction.message.components[0].toJSON()
        );
        let actionRow_1 = ActionRowBuilder.from(
          interaction.message.components[1].toJSON()
        );
        let btnRow = ActionRowBuilder.from(
          interaction.message.components[2].toJSON()
        );

        // Update the select menu placeholder for lords
        let selectMenuLord = StringSelectMenuBuilder.from(
          actionRow_1.components[0].toJSON()
        );
        selectMenuLord.setPlaceholder(
          selectedLord[selectedLordId].user.username
        );
        actionRow_1.components[0] = selectMenuLord;

        // Enable the "Elect King" button and disable the "Elect Lord" button
        let buttonElectLord = ButtonBuilder.from(btnRow.components[0].toJSON());
        let buttonElectKing = ButtonBuilder.from(btnRow.components[1].toJSON());
        buttonElectLord.setDisabled(true); // Disable "Elect Lord"
        buttonElectKing.setDisabled(false); // Enable "Elect King"

        // Update the message with modified components
        await interaction.update({
          content,
          components: [
            actionRow_0,
            actionRow_1,
            new ActionRowBuilder().addComponents(
              buttonElectLord,
              buttonElectKing
            ),
          ],
        });
      } catch (err) {
        showErrorMsg(err);
      }
    }

    if (interaction.customId === "ElectLord") {
      if (!selectedNoble[selectedNobleId]) {
        await sendInteractionReply(interaction, "Choose a memeber"); // If the select menu is empty
      } else {
        const createrName = interaction.user.username;
        const targetName = selectedNoble[selectedNobleId].user.username;
        await notifyIndividual(
          `${createrName} has created poll to upgrade ${targetName}.\nJoin the poll if you are interested in.`
        );
        await startTimedPoll(
          interaction,
          client,
          createrName,
          targetName,
          "Lord"
        );
      }
    }

    if (interaction.customId === "ElectKing") {
      console.log("Elect king is running");

      if (!selectedLord[selectedLordId]) {
        await sendInteractionReply(interaction, "Choose a memeber"); // If the select menu is empty
      } else {
        const createrName = interaction.user.username;
        const targetName = selectedLord[selectedLordId].user.username;
        await notifyIndividual(
          `${createrName} has created poll to upgrade ${targetName}.\nJoin the poll if you are interested in.`
        );
        await startTimedPoll(
          interaction,
          client,
          createrName,
          targetName,
          "King"
        );
      }
    }
  });
}

// MODIFIED: Adjusted for the specific poll type (Lord/King)
async function startTimedPoll(
  interaction,
  client,
  createrName,
  targetName,
  pollType
) {
  try {
    await interaction.deferReply();

    const userId = interaction.user.id;
    const cooldown = await CacheGetCooldown("Global", userId);

    if (cooldown) {
      await sendInteractionReply(
        interaction,
        "Timed poll is on cooldown and cannot be used"
      );
      return;
    } else {
      activePolls[userId] = { joinedLords: { userId: createrName } };
      await CacheSetCooldown("Global", userId, GlobalCoolDown);
    }

    const joinButton = new ButtonBuilder()
      .setCustomId("JoinPoll")
      .setLabel("Join Election")
      .setStyle(ButtonStyle.Primary);
    if (activePolls[userId].joinedLords[userId]) joinButton.setDisabled(true);
    const actionRow = new ActionRowBuilder().addComponents(joinButton);
    const pollMessage = await interaction.editReply({
      content: `${createrName} has created a poll. Join the poll to elect ${targetName} as a ${pollType}.`,
      components: [actionRow],
    });

    const filter = (i) =>
      i.customId === "JoinPoll" && !activePolls[userId].joinedLords[i.user.id];
    if (pollType == "Lord") {
      const collector = pollMessage.createMessageComponentCollector({
        filter,
        time: LordNobleTimedPollDuration,
      });
      collector.on("collect", async (buttonInteraction) => {
        if (buttonInteraction.user.id === interaction.user.id) {
          // Acknowledge the button click
          await buttonInteraction.reply({
            content: `You have already joined the poll!`,
            ephemeral: true,
          });
        } else {
          activePolls[userId].joinedLords[buttonInteraction.user.id] =
            buttonInteraction.user.username;
          const participationRate =
            Object.keys(activePolls[userId].joinedLords).length /
            lordRoleMembers.size;
          await buttonInteraction.reply({
            content: `You have joined the poll!`,
            ephemeral: true,
          });
          if (participationRate >= LordNobleTimedPollWinningRate) {
            collector.stop();
            await notifyPollCompletedMembers(
              "Poll ended successfully! Waiting for the next one...",
              client,
              interaction
            ); // NEW: Notify members poll ended successfully
            await updateTargetRole(
              client,
              interaction,
              targetName,
              createrName,
              pollType
            ); // Change the target role
            await resetPoll(interaction, client);
          }
        }
      });
      collector.on("end", async () => {
        const participationRate =
          Object.keys(activePolls[userId].joinedLords).length /
          lordRoleMembers.size;
        if (participationRate < LordNobleTimedPollWinningRate) {
          await notifyAll(
            client,
            "Poll failed! Not enough eligible members joined."
          );
          await notifyPollCompletedMembers(
            "Poll failed. Please try again later.",
            client,
            interaction
          ); // NEW: Notify members poll failed
        } else {
          await notifyPollCompletedMembers(
            "Poll ended successfully! Waiting for the next one...",
            client,
            interaction
          ); // NEW: Notify members poll ended successfully
          await updateTargetRole(
            client,
            interaction,
            targetName,
            createrName,
            pollType
          ); // Change the target role
        }
        await resetPoll(interaction, client);
      });
    } else {
      const collector = pollMessage.createMessageComponentCollector({
        filter,
        time: LordKingTimedPollDuration,
      });
      collector.on("collect", async (buttonInteraction) => {
        if (buttonInteraction.user.id === interaction.user.id) {
          // Acknowledge the button click
          await buttonInteraction.reply({
            content: `You have already joined the poll!`,
            ephemeral: true,
          });
        } else {
          activePolls[userId].joinedLords[buttonInteraction.user.id] =
            buttonInteraction.user.username;
          const participationRate =
            Object.keys(activePolls[userId].joinedLords).length /
            lordRoleMembers.size;
          console.log(
            "Joined Members length------------------------------------>",
            participationRate
          );
          await buttonInteraction.reply({
            content: `You have joined the poll!`,
            ephemeral: true,
          });
          if (participationRate >= LordKingTimedPollWinningRate) {
            collector.stop();
            await notifyPollCompletedMembers(
              "Poll ended successfully! Waiting for the next one...",
              client,
              interaction
            ); // NEW: Notify members poll ended successfully
            await updateTargetRole(
              client,
              interaction,
              targetName,
              createrName,
              pollType
            ); // Change the target role
            await resetPoll(interaction, client);
          }
        }
      });
      collector.on("end", async () => {
        const participationRate =
          Object.keys(activePolls[userId].joinedLords).length /
          lordRoleMembers.size;
        if (participationRate < LordKingTimedPollWinningRate) {
          await notifyAll(
            client,
            "Poll failed! Not enough eligible members joined."
          );
          await notifyPollCompletedMembers(
            "Poll failed. Please try again later.",
            client,
            interaction
          ); // NEW: Notify members poll failed
        } else {
          await notifyPollCompletedMembers(
            "Poll ended successfully! Waiting for the next one...",
            client,
            interaction
          ); // NEW: Notify members poll ended successfully
          await updateTargetRole(
            client,
            interaction,
            targetName,
            createrName,
            pollType
          ); // Change the target role
        }
        await resetPoll(interaction, client);
      });
    }
  } catch (err) {
    showErrorMsg(err);
  }
}

// Function to notify on channel
async function notifyAll(client, msg) {
  try {
    const lordChannel = await client.channels.fetch(process.env.CHANNELIDLORD);
    await lordChannel.send(msg);
  } catch (err) {
    showErrorMsg(err);
  }
}

// Function to notify the users who joined the poll that the poll has ended
async function notifyPollCompletedMembers(messageContent, client, interaction) {
  // NEW: Function to notify poll completion to all members who joined
  const id = interaction.user.id;
  for (const userId in activePolls[id].joinedLords) {
    try {
      const user = await client.users.fetch(userId);
      await user.send(messageContent);
    } catch (err) {
      console.error(`Failed to send message to user ${userId}: ${err}`);
    }
  }
}

// Function to notify the target member
async function notifyTarget(messageContent) {
  try {
    const targetMember =
      selectedNoble[selectedNobleId] || selectedLord[selectedLordId];
    await targetMember.send(messageContent);
  } catch (err) {
    showErrorMsg(err);
  }
}

// Function to send message individually
async function notifyIndividual(messageContent) {
  if (lordRoleMembers.size == 0) return;
  console.log("lordRoleMembers.size-------------->", lordRoleMembers.size);
  lordRoleMembers.forEach((member) => {
    member.send(messageContent).catch(showErrorMsg);
  });
}

// Function to update roles to the specified role if the poll is successful
async function updateTargetRole(
  client,
  interaction,
  targetName,
  createrName,
  pollType
) {
  try {
    const newRole = pollType === "Lord" ? "Lord" : "King";
    eventEmitter.emit("changeRole", selectedNobleId || selectedLordId, newRole);
    const message = `${targetName} has become a ${pollType} by ${createrName}.`;
    await notifyAll(client, message);
    await notifyTarget(
      `Your role has been changed to ${pollType} as a result of the poll.\nThe poll has been created by ${createrName}.\nGood luck!`
    );
  } catch (err) {
    showErrorMsg(err);
  }
}

async function resetPoll(interaction, client) {
  try {
    const userId = interaction.user.id;
    selectedNoble = {};
    selectedLord = {};
    selectedNobleId = "";
    selectedLordId = "";
    activePolls[userId] = null;

    const channel = await client.channels.fetch(process.env.CHANNELIDLORD); // Fetch the channel as before
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
        console.log(`${client.user.tag}: No more messages to delete.`);
        break;
      }

      for (const message of botMessages.values()) {
        // Check if the message still exists before trying to delete
        try {
          await message.delete();
        } catch (error) {
          if (error.code === 10008) {
            console.log(`Message ${message.id} not found, skipping.`);
          } else {
            console.error(`Error deleting message ${message.id}: ${error}`);
          }
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 1000)); // Ensure rate limits are respected
    }

    await sendInteractionReply(
      interaction,
      "Poll has ended. Ready for a new one."
    );
    await messageLordCommands(client); // Send new command message
  } catch (err) {
    showErrorMsg(err);
  }
}

async function updateSelectMenu(client, lastMessageId) {
  try {
    const channel = await client.channels.fetch(process.env.CHANNELIDLORD);
    const messageToEdit = await channel.messages.fetch(lastMessageId);
    const actionRow_0 = new ActionRowBuilder().addComponents(
      await buildSelectMenu(client, ["noble"], "NoblesSelectMenu")
    );
    const actionRow_1 = new ActionRowBuilder().addComponents(
      await buildSelectMenu(client, ["lord"], "LordsSelectMenu")
    );

    const existingComponents = messageToEdit.components.map((component) =>
      ActionRowBuilder.from(component.toJSON())
    );
    existingComponents[0] = actionRow_0;
    existingComponents[1] = actionRow_1;

    await messageToEdit.edit({
      content: messageToEdit.content,
      components: existingComponents,
    });
  } catch (err) {
    showErrorMsg(err);
  }
}

async function messageLordCommands(client) {
  try {
    let channel = await client.channels.fetch(process.env.CHANNELIDLORD);
    const roleMemberSelectMenuNoble = new ActionRowBuilder().addComponents(
      await buildSelectMenu(client, ["noble"], "NoblesSelectMenu")
    );
    const roleMemberSelectMenuLord = new ActionRowBuilder().addComponents(
      await buildSelectMenu(client, ["lord"], "LordsSelectMenu")
    );

    const btnRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("ElectLord")
        .setLabel("Elect Lord")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId("ElectKing")
        .setLabel("Elect King")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true)
    );

    return await channel.send({
      content,
      components: [roleMemberSelectMenuNoble, roleMemberSelectMenuLord, btnRow],
    });
  } catch (err) {
    showErrorMsg(err);
  }
}

module.exports = { setupLordBotEvents, messageLordCommands };

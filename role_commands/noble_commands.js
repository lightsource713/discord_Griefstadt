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
  NobleTimedPollDuration,
  NobleTimedPollWinningRate,
  GlobalCoolDown,
} = require("../game_config.json");
const { DBUpdateXP } = require("../apis/firebase/querys");
const { eventEmitter } = require("../functions/eventEmitter.js");

const content = "Test message to Noble.\n";
let joinedMembers = {};
let selectedMembers = {};
let selectedMemberId = "";
let roleMembers = [];
const activePolls = {}; // Track active polls and cooldowns

function showErrorMsg(err) {
  console.error("ERROR: noble_commands.js", err);
}

async function setupNobleBotEvents(client, lastMessageId) {
  client.on("guildMemberUpdate", async (oldMember, newMember) => {
    if (
      oldMember.roles.cache.has(process.env.ROLEID_KNIGHT) ||
      oldMember.roles.cache.has(process.env.ROLEID_NOBLE) ||
      oldMember.roles.cache.has(process.env.ROLEID_LORD) ||
      newMember.roles.cache.has(process.env.ROLEID_KNIGHT) ||
      newMember.roles.cache.has(process.env.ROLEID_NOBLE) ||
      newMember.roles.cache.has(process.env.ROLEID_LORD)
    ) {
      await updateSelectMenu(client, lastMessageId);
    }
  });

  client.on("interactionCreate", async (interaction) => {
    const userId = interaction.user.id;
    if (!interaction.isStringSelectMenu() && !interaction.isButton()) return;

    if (interaction.customId === "MembersSelectMenu") {
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

        if (selectedMemberId === userId) {
          button.setDisabled(true);
        } else {
          button.setDisabled(false);
        }
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

    if (interaction.customId === "TimedPoll") {
      roleMembers = interaction.guild.members.cache.filter(
        (member) =>
          member.roles.cache.has(process.env.ROLEID_KNIGHT) ||
          member.roles.cache.has(process.env.ROLEID_NOBLE) ||
          member.roles.cache.has(process.env.ROLEID_LORD)
      );
      if (!selectedMembers[selectedMemberId]) {
        await sendInteractionReply(interaction, "Choose a member");
      } else {
        const createrName = interaction.user.username;
        const targetName = selectedMembers[selectedMemberId].user.username;
        await notifyIndividual(
          `${createrName} has created poll to downgrade ${targetName}.\nJoin the poll if you are interested in.`
        );
        await startTimedPoll(interaction, client, createrName, targetName);
      }
    }
  });
}

// MODIFIED: Added lines for resetting the poll
async function startTimedPoll(interaction, client, createrName, targetName) {
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
      activePolls[userId] = { joinedNobles: { userId: createrName } };
      await CacheSetCooldown("Global", userId, GlobalCoolDown);
    }

    const joinButton = new ButtonBuilder()
      .setCustomId("JoinPoll")
      .setLabel("Join")
      .setStyle(ButtonStyle.Primary);
    if (activePolls[userId].joinedNobles[userId]) joinButton.setDisabled(true);
    const actionRow = new ActionRowBuilder().addComponents(joinButton);
    const pollMessage = await interaction.editReply({
      content: `${createrName} has created poll. Join poll to depravity ${targetName}`,
      components: [actionRow],
    });

    const filter = (i) =>
      i.customId === "JoinPoll" && !activePolls[userId].joinedNobles[i.user.id];
    const collector = pollMessage.createMessageComponentCollector({
      filter,
      time: NobleTimedPollDuration,
    });

    collector.on("collect", async (buttonInteraction) => {
      if (buttonInteraction.user.id === interaction.user.id) {
        // Acknowledge the button click
        await buttonInteraction.reply({
          content: `You have already joined the poll!`,
          ephemeral: true,
        });
      } else {
        // Add the member to the joinedMembers list
        activePolls[userId].joinedNobles[buttonInteraction.user.id] =
          buttonInteraction.user.username;

        await buttonInteraction.reply({
          content: `You have joined the poll!`,
          ephemeral: true,
        });

        if (
          Object.keys(activePolls[userId].joinedNobles).length ==
          NobleTimedPollWinningRate
        ) {
          collector.stop();
          await notifyPollCompletedMembers(
            "Poll ended successfully! Waiting for next one...",
            client
          ); // NEW: Notify members poll ended successfully
          await updateTargetRole(client, interaction, targetName, createrName); // Change the target role
          await resetPoll(interaction, client);
        }
      }
    });

    collector.on("end", async () => {
      if (
        Object.keys(activePolls[userId].joinedNobles).length <
        NobleTimedPollWinningRate
      ) {
        await notifyAll(
          client,
          "Poll failed! Not enough eligible members joined."
        );
        await notifyPollCompletedMembers(
          "Poll failed. Please try again later.",
          client
        ); // NEW: Notify members poll failed
      } else {
        await notifyPollCompletedMembers(
          "Poll ended successfully! Waiting for next one...",
          client
        ); // NEW: Notify members poll ended successfully
        await updateTargetRole(client, interaction, targetName, createrName); // Change the target role
      }
      await resetPoll(interaction, client);
    });
  } catch (err) {
    showErrorMsg(err);
  }
}

// Function to notify on channel
async function notifyAll(client, msg) {
  try {
    const nobleChannel = await client.channels.fetch(
      process.env.CHANNELIDNOBLE
    );
    await nobleChannel.send(msg);
  } catch (err) {
    showErrorMsg(err);
  }
}

// Function to notify the users who joined the poll that the poll has ended
async function notifyPollCompletedMembers(messageContent, client) {
  // NEW: Function to notify poll completion to all members who joined
  for (const userId in joinedMembers) {
    try {
      const user = await client.users.fetch(userId);
      await user.send(messageContent);
    } catch (err) {
      console.error(`Failed to send message to user ${userId}: ${err}`);
    }
  }
}

// Function to notify target member
async function notifyTarget(messageContent) {
  selectedMembers[selectedMemberId].send(messageContent).catch(showErrorMsg);
}

// Function to send message individually
async function notifyIndividual(messageContent) {
  if (roleMembers.length == 0) return;

  roleMembers.forEach((member) => {
    member.send(messageContent).catch(showErrorMsg);
  });
}

// Function to update roles to "poop" if poll is successful
async function updateTargetRole(client, interaction, targetName, createrName) {
  try {
    eventEmitter.emit("changeRole", selectedMemberId, "Poop");
    console.log("Updating target role ...");
    const message = `${targetName} has become a poop by ${createrName}.`;
    await notifyAll(client, message);
    await notifyTarget(
      `Your role has been changed to Poop as a result of poll.\nThe poll has been created by ${createrName}.\nGood luck!`
    );
  } catch (err) {
    showErrorMsg(err);
  }
}

// Function to clear previous bot messages in a channel
async function clearPreviousMessages(client, channelId, botId) {
  try {
    const channel = await client.channels.fetch(channelId);
    let shouldContinue = true;
    while (shouldContinue) {
      const fetchedMessages = await channel.messages.fetch({ limit: 100 });
      const botMessages = fetchedMessages.filter(
        (msg) => msg.author.id !== botId // Filter out any messages not from this bot
      );

      if (!botMessages.size) {
        shouldContinue = false;
        console.log("No more messages to delete.");
        break;
      }

      const messageIds = botMessages.map((msg) => msg.id);

      try {
        await channel.bulkDelete(messageIds);
        console.log(`Bulk deleted ${messageIds.length} messages.`);
      } catch (err) {
        console.error(`Failed to bulk delete messages. Error: ${err}`);
      }

      // Respect rate limits by waiting 1 second before the next batch
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } catch (err) {
    console.error(`Error in clearPreviousMessages: ${err}`);
  }
}

// Function to ensure the bot has correct permissions
async function ensureBotHasPermissions(client, channelId) {
  try {
    const channel = await client.channels.fetch(channelId);
    const botMember = await channel.guild.members.fetch(client.user.id);
    const botPermissions = channel.permissionsFor(botMember);

    if (!botPermissions.has("MANAGE_MESSAGES")) {
      console.error("Bot does not have MANAGE_MESSAGES permission.");
      return false;
    }
    return true;
  } catch (err) {
    console.error(`Error checking bot permissions: ${err}`);
    return false;
  }
}

// Function to reset the poll - Ensure this functionality is robustly clearing older messages
async function resetPoll(interaction, client) {
  try {
    const userId = interaction.user.id;
    selectedMembers = {};
    roleMembers = [];
    selectedMemberId = "";
    activePolls[userId] = null;

    const channelId = process.env.CHANNELIDNOBLE;
    const hasPermissions = await ensureBotHasPermissions(client, channelId);
    if (!hasPermissions) {
      console.error("Bot doesn't have the necessary permissions.");
      return;
    }

    await clearPreviousMessages(client, channelId, client.user.id);

    // clear all messages from the bot in the noble channel
    await clearAllMessages(client, channelId);

    // send a new command message after resetting
    await sendInteractionReply(
      interaction,
      "Poll has ended. Ready for a new one."
    );
    await messageNobleCommands(client); // Send new command message
  } catch (err) {
    showErrorMsg(err);
  }
}

// Added function to clear all messages
async function clearAllMessages(client, channelId) {
  try {
    const channel = await client.channels.fetch(channelId);
    let shouldContinue = true;
    while (shouldContinue) {
      const fetchedMessages = await channel.messages.fetch({ limit: 100 });
      if (!fetchedMessages.size) {
        shouldContinue = false;
        break;
      }
      const messageIds = fetchedMessages.map((msg) => msg.id);
      try {
        await channel.bulkDelete(messageIds);
        console.log(`Bulk deleted ${messageIds.length} messages.`);
      } catch (err) {
        console.error(`Failed to bulk delete messages. Error: ${err}`);
      }
      // Respect rate limits by waiting 1 second before the next batch
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } catch (err) {
    console.error(`Error in clearAllMessages: ${err}`);
  }
}

async function updateSelectMenu(client, lastMessageId) {
  try {
    const channel = await client.channels.fetch(process.env.CHANNELIDNOBLE);
    const messageToEdit = await channel.messages.fetch(lastMessageId);
    const actionRow_0 = new ActionRowBuilder().addComponents(
      await buildSelectMenu(
        client,
        ["knight", "noble", "lord"],
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

async function messageNobleCommands(client) {
  try {
    const channelId = process.env.CHANNELIDNOBLE;
    const hasPermissions = await ensureBotHasPermissions(client, channelId);
    if (!hasPermissions) {
      console.error("Bot doesn't have the necessary permissions.");
      return;
    }

    await clearPreviousMessages(client, channelId, client.user.id);

    let channel = await client.channels.fetch(channelId);
    const roleMemberSelectMenu = new ActionRowBuilder().addComponents(
      await buildSelectMenu(
        client,
        ["knight", "noble", "lord"],
        "MembersSelectMenu"
      )
    );
    const btnRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("TimedPoll")
        .setLabel("Timed Poll")
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

module.exports = { setupNobleBotEvents, messageNobleCommands };

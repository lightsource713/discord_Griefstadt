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
  PeasantMobFlayingDuration,
  PeasantMobFlayingWinningRate,
  PeasantMobFlayingCoolDown,
} = require("../game_config.json");
const { eventEmitter } = require("../functions/eventEmitter.js");

const content = "Test message to Peasant.\n";
let activePolls = {};
let selectedMembers = {};
let selectedMemberId = "";
let roleMembers = []; // Eligible members i.e, "Peasants" and "Subhumans"

function showErrorMsg(err) {
  console.error("ERROR: peasant_commands.js", err);
}

async function setupPeasantBotEvents(client, lastMessageId) {
  client.on("guildMemberUpdate", async (oldMember, newMember) => {
    if (
      oldMember.roles.cache.has(process.env.ROLEID_PEASANT) ||
      oldMember.roles.cache.has(process.env.ROLEID_SUBHUMAN) ||
      newMember.roles.cache.has(process.env.ROLEID_PEASANT) ||
      newMember.roles.cache.has(process.env.ROLEID_SUBHUMAN)
    ) {
      await updateSelectMenu(client, lastMessageId);
    }
  });

  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isStringSelectMenu() && !interaction.isButton()) return;

    const userId = interaction.user.id;
    if (interaction.customId === "MembersSelectMenu") {
      selectedMemberId = interaction.values[0];
      try {
        selectedMembers[userId] = await interaction.guild.members.cache.get(
          selectedMemberId
        );

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

        selectMenu.setPlaceholder(selectedMembers[userId].user.username);
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
      roleMembers = interaction.guild.members.cache.filter((member) =>
        member.roles.cache.has(process.env.ROLEID_PEASANT)
      );
      if (!selectedMembers[userId]) {
        await sendInteractionReply(interaction, "Choose a memeber");
        return;
      }
      const cooldown = await CacheGetCooldown("PeasantMobFlaying", userId);
      if (cooldown) {
        const channel = await client.channels.fetch(
          process.env.CHANNELIDPEASANT
        );
        const tmpMessage = await channel.send(
          "Mob flaying is on cooldown and cannot be used"
        );
        setTimeout(() => {
          tmpMessage.delete().catch(showErrorMsg);
        }, 2000);
        return;
      } else {
        const initiatorName = interaction.user.username;
        const targetName = selectedMembers[userId].user.username;
        activePolls[userId] = { joinedPeasants: { userId: initiatorName } };
        await CacheSetCooldown(
          "PeasantMobFlaying",
          userId,
          PeasantMobFlayingCoolDown
        );
        await notifyIndividual(
          `${initiatorName} has created poll to downgrade ${targetName}.\nJoin the poll if you are interested in.`
        );
        await startTimedPoll(interaction, client, initiatorName, targetName);
      }
    }
  });
}

async function startTimedPoll(interaction, client, initiatorName, targetName) {
  try {
    await interaction.deferReply(); // Defer the reply to avoid timeout issues

    const userId = interaction.user.id;

    if (!activePolls[userId]) {
      return;
    }

    //Display the join button for role members
    const joinButton = new ButtonBuilder()
      .setCustomId("JoinPoll")
      .setLabel("Join")
      .setStyle(ButtonStyle.Primary);
    if (activePolls[userId].joinedPeasants[userId])
      joinButton.setDisabled(true);
    const actionRow = new ActionRowBuilder().addComponents(joinButton);
    const pollMessage = await interaction.editReply({
      content: `${initiatorName} has created poll. Join poll to mob flay ${targetName}`,
      components: [actionRow],
    });

    // Create a collector for the join button
    const filter = (i) =>
      i.customId === "JoinPoll" &&
      !activePolls[userId].joinedPeasants[i.user.id];
    const collector = pollMessage.createMessageComponentCollector({
      filter,
      time: PeasantMobFlayingDuration,
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
        activePolls[userId].joinedPeasants[buttonInteraction.user.id] =
          buttonInteraction.user.username;

        // Acknowledge the button click
        await buttonInteraction.reply({
          content: `You have joined the poll!`,
          ephemeral: true,
        });

        // Check if over 50% of eligible members have joined
        const participationRate =
          Object.keys(activePolls[userId].joinedPeasants).length /
          roleMembers.size;
        if (participationRate >= PeasantMobFlayingWinningRate) {
          collector.stop(); // Stop collecting more joins
        }
      }
    });

    collector.on("end", async () => {
      const participationRate =
        Object.keys(activePolls[userId].joinedPeasants).length /
        roleMembers.size;

      // Check if poll failed
      if (participationRate < PeasantMobFlayingWinningRate) {
        await notifyAll(
          client,
          "Poll failed! Not enough eligible members joined."
        );
      } else {
        await updateTargetRole(client, interaction, targetName, initiatorName); // Change the target role
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
    const channel = await client.channels.fetch(process.env.CHANNELIDPEASANT);
    await channel.send(msg);
  } catch (err) {
    showErrorMsg(err);
  }
}

// Function to notify target member
async function notifyTarget(messageContent, userId) {
  selectedMembers[userId].send(messageContent).catch(showErrorMsg);
}

// Function to send message individually
async function notifyIndividual(messageContent) {
  if (roleMembers.size == 0) return;

  roleMembers.forEach((member) => {
    member.send(messageContent).catch(showErrorMsg);
  });
}

// Function to update roles to "poop" if poll is successful
async function updateTargetRole(
  client,
  interaction,
  targetName,
  initiatorName
) {
  try {
    eventEmitter.emit(
      "changeRole",
      selectedMembers[interaction.user.id].user.id,
      "Poop"
    );
    console.log("Updating target role ...");
    await notifyAll(
      client,
      `${targetName} has become a poop by ${initiatorName}.`
    );
    await notifyTarget(
      `As a result of poll created by ${initiatorName}, your role has been changed to Poop.\nGood luck!`,
      interaction.user.id
    );
  } catch (err) {
    showErrorMsg(err);
  }
}

// Function to reset the poll - Ensure this functionality is robustly clearing older messages
async function resetPoll(interaction, client) {
  try {
    const userId = interaction.user.id;
    activePolls[userId] = null;
    selectedMembers[userId] = null;

    const channel = await client.channels.fetch(process.env.CHANNELIDPEASANT); // Fetch the channel as before
    if (!channel) {
      console.error("Failed to fetch peasant channel.");
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
        await message.delete().catch(console.error); // Delete the message
      }

      await new Promise((resolve) => setTimeout(resolve, 1000)); // Ensure rate limits are respected
    }

    await sendInteractionReply(
      interaction,
      "Poll has ended. Ready for a new one."
    );
    await messagePeasantCommands(client); // Send new command message
  } catch (err) {
    showErrorMsg(err);
  }
}

async function updateSelectMenu(client, lastMessageId) {
  try {
    const channel = await client.channels.fetch(process.env.CHANNELIDPEASANT);
    const messageToEdit = await channel.messages.fetch(lastMessageId);
    const actionRow_0 = new ActionRowBuilder().addComponents(
      await buildSelectMenu(
        client,
        ["peasant", "subhuman"],
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

async function messagePeasantCommands(client) {
  try {
    let channel = await client.channels.fetch(process.env.CHANNELIDPEASANT);
    const roleMemberSelectMenu = new ActionRowBuilder().addComponents(
      await buildSelectMenu(
        client,
        ["peasant", "subhuman"],
        "MembersSelectMenu"
      )
    );
    const btnRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("TimedPoll")
        .setLabel("Mob Flaying")
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

module.exports = { setupPeasantBotEvents, messagePeasantCommands };

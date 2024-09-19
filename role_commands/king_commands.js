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
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
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
} = require("../game_config.json");

const content =
  "Test message to King.\n" +
  "**Abilities:**\n" +
  "- **Degradation**: Choose Knight to degradation to merchant\n" +
  "- **Knight**: Choose peasant, scholar, merchant select to make him knight\n" +
  "- **Siege**: Choose King to make him poop\n";

let selectedHumans = {};
let selectedKnights = {};
let selectedKings = {};
let activePolls = {};
let roleMembers = []; // Eligible members i.e., "Kings" and "Knights"
let isKnightPollFinished = false;
let userId = "";

function showErrorMsg(err) {
  console.error("ERROR: king_commands.js", err);
}

async function setupKingBotEvents(client, lastMessageId) {
  client.on("guildMemberUpdate", async (oldMember, newMember) => {
    if (
      oldMember.roles.cache.has(process.env.ROLEID_KNIGHT) ||
      oldMember.roles.cache.has(process.env.ROLEID_PEASANT) ||
      oldMember.roles.cache.has(process.env.ROLEID_SCHOLAR) ||
      oldMember.roles.cache.has(process.env.ROLEID_MERCHANT) ||
      oldMember.roles.cache.has(process.env.ROLEID_KING) ||
      newMember.roles.cache.has(process.env.ROLEID_KNIGHT) ||
      newMember.roles.cache.has(process.env.ROLEID_PEASANT) ||
      newMember.roles.cache.has(process.env.ROLEID_SCHOLAR) ||
      newMember.roles.cache.has(process.env.ROLEID_KING) ||
      newMember.roles.cache.has(process.env.ROLEID_MERCHANT)
    ) {
      await updateSelectMenu(client, lastMessageId);
    }
  });

  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isStringSelectMenu() && !interaction.isButton()) return;

    userId = interaction.user.id;
    if (interaction.customId === "SelectDegradation") {
      let selectedKnightId = interaction.values[0];
      selectedKnights[userId] = await interaction.guild.members.cache.get(
        selectedKnightId
      );
      await interaction.deferUpdate();
    }

    if (interaction.customId === "SelectKnight") {
      let selectedKnightId = interaction.values[0];
      selectedHumans[userId] = await interaction.guild.members.cache.get(
        selectedKnightId
      );
      await interaction.deferUpdate();
    }

    if (interaction.customId === "SelectKing") {
      let selectedKingId = interaction.values[0];
      selectedKings[userId] = await interaction.guild.members.cache.get(
        selectedKingId
      );
      await interaction.deferUpdate();
    }

    if (interaction.customId === "DegradationKnight") {
      try {
        if (!selectedKnights[userId]) {
          await sendInteractionReply(interaction, `No knight selected`);
          return;
        }
        const userXP = await CacheGetUserXP(userId);
        if (userXP < DegradationCost) {
          await sendInteractionReply(
            interaction,
            `Not enough XP (current XP: ${userXP})`
          );
          return;
        } else {
          const cooldown = await CacheGetCooldown("degradationKnight", userId);
          if (cooldown) {
            await sendInteractionReply(
              interaction,
              "Degradation is on cooldown and cannot be used"
            );
            return;
          } else {
            eventEmitter.emit(
              "changeRole",
              selectedKnights[userId],
              "Merchant"
            );
            const targetUsername = selectedKnights[userId].user.username;
            selectedKnights[userId] = null;
            await DBUpdateXP(userId, -DegradationCost, client);
            await CacheSetCooldown(
              "degradationKnight",
              userId,
              DegradationCooldown
            );
            eventEmitter.emit(
              "DegradationComplete",
              targetUsername,
              interaction.user.username
            );
            const XPLeft = parseInt(userXP) - parseInt(DegradationCost);
            await sendInteractionReply(
              interaction,
              `(${XPLeft} XP left) Degradation  successful. \n${targetUsername} has been reduced to merchant`
            );
          }
        }
      } catch (err) {
        showErrorMsg(err);
      }
    }
    if (interaction.customId === "Knight") {
      try {
        if (!selectedHumans[userId]) {
          await sendInteractionReply(
            interaction,
            `no peasant, scholar or merchant selected...`
          );
          return;
        }
        const userXP = await CacheGetUserXP(userId);
        if (userXP < KnightCost) {
          await sendInteractionReply(
            interaction,
            `Not enough XP (current XP: ${userXP})`
          );
          return;
        } else {
          const cooldown = await CacheGetCooldown("knight", userId);
          if (cooldown) {
            await sendInteractionReply(
              interaction,
              "Knight is on cooldown and cannot be used"
            );
            return;
          } else {
            eventEmitter.emit("changeRole", selectedHumans[userId], "Knight");
            const targetUsername = selectedHumans[userId].user.username;
            selectedHumans[userId] = null;
            await DBUpdateXP(userId, -KnightCost, client);
            await CacheSetCooldown("knight", userId, KnightCooldown);
            eventEmitter.emit(
              "KnightComplete",
              targetUsername,
              interaction.user.username
            );
            const XPLeft = parseInt(userXP) - parseInt(KnightCost);
            await sendInteractionReply(
              interaction,
              `(${XPLeft} XP left) ${targetUsername} has been knighted`
            );
          }
        }
      } catch (err) {
        showErrorMsg(err);
      }
    }
    if (interaction.customId === "Siege") {
      try {
        roleMembers = interaction.guild.members.cache.filter(
          (member) =>
            member.roles.cache.has(process.env.ROLEID_KING) ||
            member.roles.cache.has(process.env.ROLEID_KNIGHT)
        );

        if (!selectedKings[userId]) {
          await sendInteractionReply(interaction, `No king selected`);
          return;
        }
        const userXP = await CacheGetUserXP(userId);
        if (userXP < SiegeCost) {
          await sendInteractionReply(
            interaction,
            `Not enough XP (current XP: ${userXP})`
          );
          return;
        } else {
          const cooldown = await CacheGetCooldown("SiegeKing", userId);
          if (cooldown) {
            channel = await client.channels.fetch(process.env.CHANNELIDKING);
            const tmpMessage = await channel.send(
              "Siege is on cooldown and cannot be used"
            );
            setTimeout(() => {
              tmpMessage.delete().catch(showErrorMsg);
            }, 1000);

            return;
          } else {
            const initiatorName = interaction.user.username;
            const targetName = selectedKings[userId].user.username;
            activePolls[userId] = {
              joinedKings: { userId: initiatorName },
              joinedKnights: {},
            };
            await CacheSetCooldown(
              "SiegeKing",
              userId,
              KingSiegeTimedPollCoolDown
            );
            await notifyIndividual(
              `${initiatorName} has created poll to downgrade ${targetName}.\nJoin the poll if you are interested in.`
            );
            await startTimedPoll(
              interaction,
              client,
              initiatorName,
              targetName
            );

            eventEmitter.emit("StartKingSiege", initiatorName, targetName);
          }
        }
      } catch (err) {
        showErrorMsg(err);
      }
    }
  });

  eventEmitter.on(
    "coronationComplete",
    async (kingUsername, initiatorUsername) => {
      try {
        const channel = await client.channels.fetch(process.env.CHANNELIDKING);
        const tmpMessage = await channel.send(
          `Coronation successfully! ${kingUsername} has become a king by ${initiatorUsername}.`
        );
        setTimeout(() => {
          tmpMessage.delete().catch(showErrorMsg);
        }, 30000);
      } catch (err) {
        showErrorMsg(err);
      }
    }
  );
  eventEmitter.on(
    "heirSuccessionComplete",
    async (heirUsername, initiatorUsername) => {
      try {
        const channel = await client.channels.fetch(process.env.CHANNELIDKING);
        const tmpMessage = await channel.send(
          `Hail the new Emperor! ${heirUsername} heir to ${initiatorUsername} has taken the throne,`
        );
        setTimeout(() => {
          tmpMessage.delete().catch(showErrorMsg);
        }, 30000);
      } catch (err) {
        showErrorMsg(err);
      }
    }
  );
  eventEmitter.on("seigeKingTimedPollCompleted", async (joinedMembers) => {
    try {
      isKnightPollFinished = true;
      activePolls[userId].joinedKnights = joinedMembers;
    } catch (err) {
      showErrorMsg(err);
    }
  });
}

async function startTimedPoll(interaction, client, initiatorName, targetName) {
  try {
    await interaction.deferReply(); // Defer the reply to avoid timeout issues

    const userId = interaction.user.id;

    //Display the join button for role members
    const joinButton = new ButtonBuilder()
      .setCustomId("JoinPoll")
      .setLabel("Join")
      .setStyle(ButtonStyle.Primary);
    const actionRow = new ActionRowBuilder().addComponents(joinButton);
    const pollMessage = await interaction.editReply({
      content: `${initiatorName} has created poll. Join poll to siege ${targetName}`,
      components: [actionRow],
    });

    // Create a collector for the join button
    const filter = (i) =>
      i.customId === "JoinPoll" && !activePolls[userId].joinedKings[i.user.id];
    const collector = pollMessage.createMessageComponentCollector({
      filter,
      time: KingSiegeTimedPollDuration,
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
        activePolls[userId].joinedKings[buttonInteraction.user.id] =
          buttonInteraction.user.username;

        // Acknowledge the button click
        await buttonInteraction.reply({
          content: `You have joined the poll!`,
          ephemeral: true,
        });
      }
    });

    collector.on("end", async () => {
      await waitForKnightPollFinish();

      const participationRate =
        Object.keys(activePolls[userId].joinedKings).length +
        Object.keys(activePolls[userId].joinedKnights).length /
          roleMembers.size;

      // Check if poll failed
      if (participationRate < KingSiegeTimedPollWinningRate) {
        await notifyAll(
          client,
          "Poll failed! Not enough eligible members joined."
        );
      } else {
        await updateTargetRole(client, interaction, targetName, initiatorName); // Change the target role
        await distributeSiegeCost(client);
      }
      await resetPoll(interaction, client);
    });
  } catch (err) {
    showErrorMsg(err);
  }
}

async function waitForKnightPollFinish() {
  return new Promise((resolve, reject) => {
    const interval = setInterval(() => {
      if (isKnightPollFinished) {
        clearInterval(interval); // Stop the interval once poll finishes
        resolve(); // Resolve the promise once poll finishes
      }
    }, 1000); // Check every second (1000ms) for the variable change
  });
}

// Function to notify on channel
async function notifyAll(client, msg) {
  try {
    const channel = await client.channels.fetch(process.env.CHANNELIDKING);
    await channel.send(msg);
  } catch (err) {
    showErrorMsg(err);
  }
}

// Function to notify target member
async function notifyTarget(userId, messageContent) {
  selectedKings[userId].send(messageContent).catch(showErrorMsg);
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
      selectedKings[interaction.user.id].user.id,
      "Poop"
    );
    console.log("Updating target role ...");
    const message = `${targetName} has become a poop by ${initiatorName}.`;
    await notifyAll(client, message);
    await notifyTarget(
      interaction.user.id,
      `Your role has been changed to Poop as a result of poll.\nThe poll has been created by ${initiatorName}.\nGood luck!`
    );
  } catch (err) {
    showErrorMsg(err);
  }
}

// Function to reset the poll - Ensure this functionality is robustly clearing older messages
async function resetPoll(interaction, client) {
  try {
    userId = interaction.user.id;
    activePolls[userId] = null;
    selectedKings[userId] = null;

    const channel = await client.channels.fetch(process.env.CHANNELIDKING); // Fetch the channel as before
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
        await message.delete().catch(console.error); // Delete the message
      }

      await new Promise((resolve) => setTimeout(resolve, 1000)); // Ensure rate limits are respected
    }

    await sendInteractionReply(
      interaction,
      "Poll has ended. Ready for a new one."
    );
    await messageKingCommands(client); // Send new command message
  } catch (err) {
    showErrorMsg(err);
  }
}

async function distributeSiegeCost(client) {
  try {
    const joinedKnightsSize = Object.keys(
      activePolls[userId].joinedKnights
    ).length;
    const reward =
      joinedKnightsSize === 0 ? 0 : parseInt(SiegeCost / joinedKnightsSize);
    Object.keys(activePolls[userId].joinedKnights).forEach(async (knightId) => {
      await DBUpdateXP(knightId, reward, client);
      console.log("XP updated successfully");
    });
  } catch (err) {
    showErrorMsg(err);
  }
}

async function updateSelectMenu(client, lastMessageId) {
  try {
    const channel = await client.channels.fetch(process.env.CHANNELIDKING);
    const messageToEdit = await channel.messages.fetch(lastMessageId);
    const actionRow_0 = new ActionRowBuilder().addComponents(
      await buildSelectMenu(client, ["knight"], "SelectDegradation")
    );
    const actionRow_1 = new ActionRowBuilder().addComponents(
      await buildSelectMenu(
        client,
        ["peasant", "scholar", "merchant"],
        "SelectKnight"
      )
    );
    const actionRow_2 = new ActionRowBuilder().addComponents(
      await buildSelectMenu(client, ["king"], "SelectKing")
    );
    const existingComponents = messageToEdit.components.map((component) =>
      ActionRowBuilder.from(component.toJSON())
    );
    existingComponents[0] = actionRow_0;
    existingComponents[1] = actionRow_1;
    existingComponents[2] = actionRow_2;

    await messageToEdit.edit({
      content: messageToEdit.content,
      components: existingComponents,
    });
  } catch (err) {
    showErrorMsg(err);
  }
}

async function messageKingCommands(client) {
  let channel = null;
  try {
    channel = await client.channels.fetch(process.env.CHANNELIDKING);
    const degradationSelectMenu = new ActionRowBuilder().addComponents(
      await buildSelectMenu(client, ["knight"], "SelectDegradation")
    );
    const knightSelectMenu = new ActionRowBuilder().addComponents(
      await buildSelectMenu(
        client,
        ["peasant", "scholar", "merchant"],
        "SelectKnight"
      )
    );
    const kingSelectMenu = new ActionRowBuilder().addComponents(
      await buildSelectMenu(client, ["king"], "SelectKing")
    );

    const btnRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("DegradationKnight")
        .setLabel("Degradation Knight")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("Knight")
        .setLabel("Knight")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("Siege")
        .setLabel("Siege")
        .setStyle(ButtonStyle.Danger)
    );

    return await channel.send({
      content,
      components: [
        degradationSelectMenu,
        knightSelectMenu,
        kingSelectMenu,
        btnRow,
      ],
    });
  } catch (err) {
    showErrorMsg(err);
  }
}

module.exports = { setupKingBotEvents, messageKingCommands };

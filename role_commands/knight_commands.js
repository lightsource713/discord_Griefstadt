const { eventEmitter } = require("../functions/eventEmitter.js");
const { sendInteractionReply } = require("../functions/botActions");
const {
  CacheIsMaggotBeingNibbled,
  CacheIsCockroachBeingNibbled,
} = require("../apis/redis/redisCache");
const {
  StringSelectMenuBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const {
  DegradationCost,
  DegradationCooldown,
  KnightCost,
  KnightCooldown,
  SiegeCost,
  KingSiegeTimedPollDuration,
  KingSiegeTimedPollWinningRate,
} = require("../game_config.json");

let joinedMembers = {};

const content =
  "Test message to Knight.\n" + "**Abilities:**\n" + "- **Cut down**: ***";

function showErrorMsg(err) {
  console.error("ERROR: knight_commands.js", err);
}

async function setupKnightBotEvents(client, lastMessageId) {
  eventEmitter.on("StartKingSiege", async (initiatorUsername, kingUsername) => {
    try {
      //   const channel = await client.channels.fetch(process.env.CHANNELIDKNIGHT);
      //   const tmpMessage = await channel.send(
      //     `${kingUsername} was dethroned by ${initiatorUsername}.`
      //   );
      //   setTimeout(() => {
      //     tmpMessage.delete().catch(showErrorMsg);
      //   }, KingSiegeTimedPollDuration);

      const channel = await client.channels.fetch(process.env.CHANNELIDKNIGHT);

      startTimedPoll(channel, initiatorUsername, kingUsername);
    } catch (err) {
      showErrorMsg(err);
    }
  });
}

async function startTimedPoll(channel, initiatorName, targetName) {
  try {
    //Display the join button for role members
    const joinButton = new ButtonBuilder()
      .setCustomId("JoinPoll")
      .setLabel("Join")
      .setStyle(ButtonStyle.Primary);
    const actionRow = new ActionRowBuilder().addComponents(joinButton);

    const pollMessage = await channel.send({
      content: `${initiatorName} has created poll. Join poll to siege ${targetName}`,
      components: [actionRow],
    });
    setTimeout(() => {
      pollMessage.delete().catch(showErrorMsg);
    }, KingSiegeTimedPollDuration);

    // Create a collector for the join button
    const filter = (i) =>
      i.customId === "JoinPoll" && !joinedMembers[i.user.id];
    const collector = pollMessage.createMessageComponentCollector({
      filter,
      time: KingSiegeTimedPollDuration,
    });

    collector.on("collect", async (buttonInteraction) => {
      // Add the member to the joinedMembers list
      joinedMembers[buttonInteraction.user.id] =
        buttonInteraction.user.username;

      // Acknowledge the button click
      await buttonInteraction.reply({
        content: `You have joined the poll!`,
        ephemeral: true,
      });
    });

    collector.on("end", async () => {
      eventEmitter.emit("seigeKingTimedPollCompleted", joinedMembers);
      joinedMembers = {};
    });
  } catch (err) {
    showErrorMsg(err);
  }
}

async function messageKnightCommands(client) {
  let channel = null;
  try {
    channel = await client.channels.fetch(process.env.CHANNELIDKNIGHT);
  } catch (err) {
    console.error(err);
    return;
  }
  const message = await channel.send({
    content: "test",
  });
  return message;
}

module.exports = { setupKnightBotEvents, messageKnightCommands };

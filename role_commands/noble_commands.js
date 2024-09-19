const {
    StringSelectMenuBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
  } = require("discord.js");
  const { buildSelectMenu, sendInteractionReply } = require("../functions/botActions");
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
      await updateSelectMenu(client);
    });
  
    client.on("interactionCreate", async (interaction) => {
      const userId = interaction.user.id;
      if (!interaction.isStringSelectMenu() && !interaction.isButton()) return;
  
      if (interaction.customId === "MembersSelectMenu") {
        selectedMemberId = interaction.values[0];
        try {
          selectedMembers[selectedMemberId] = await interaction.guild.members.cache.get(selectedMemberId);
  
          let actionRow_0 = ActionRowBuilder.from(interaction.message.components[0].toJSON());
          let actionRow_1 = ActionRowBuilder.from(interaction.message.components[1].toJSON());
          let selectMenu = StringSelectMenuBuilder.from(actionRow_0.components[0].toJSON());
          let button = ButtonBuilder.from(actionRow_1.components[0].toJSON());
  
          if (selectedMembers[selectedMemberId].user.id === userId) {
            button.setDisabled(true);
          } else {
            button.setDisabled(false);
          }
          selectMenu.setPlaceholder(selectedMembers[selectedMemberId].user.username);
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
          await notifyIndividual(`${createrName} has created poll to downgrade ${targetName}.\nJoin the poll if you are interested in.`);
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
      const cooldown = await CacheGetCooldown("Global",userId);
  
      if (cooldown) {
        await sendInteractionReply(interaction, "Timed poll is on cooldown and cannot be used");
        return;
      } else {
        activePolls[userId] = { joinedNobles: { userId:createrName  } };
        await CacheSetCooldown("Global",userId, GlobalCoolDown);
      }
  
      const joinButton = new ButtonBuilder()
        .setCustomId("JoinPoll")
        .setLabel("Join")
        .setStyle(ButtonStyle.Primary);
        if (activePolls[userId].joinedNobles[userId])
          joinButton.setDisabled(true);
      const actionRow = new ActionRowBuilder().addComponents(joinButton);
      const pollMessage = await interaction.editReply({
        content: `${createrName} has created poll. Join poll to depravity ${targetName}`,
        components: [actionRow],
      });
  
      const filter = (i) => i.customId === "JoinPoll" && !activePolls[userId].joinedNobles[i.user.id];
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
        }else{
           // Add the member to the joinedMembers list
          activePolls[userId].joinedNobles[buttonInteraction.user.id] =
          buttonInteraction.user.username;

          await buttonInteraction.reply({
            content: `You have joined the poll!`,
            ephemeral: true,
          });
    
          if (Object.keys(activePolls[userId].joinedNobles).length == NobleTimedPollWinningRate) {
            collector.stop();
            await notifyPollCompletedMembers("Poll ended successfully! Waiting for next one...", client); // NEW: Notify members poll ended successfully
            await updateTargetRole(client, interaction, targetName, createrName); // Change the target role
            await resetPoll(interaction, client);
          }
        }
      });
  
      collector.on("end", async () => {
        if (Object.keys(activePolls[userId].joinedNobles).length < NobleTimedPollWinningRate) {
          await notifyAll(client, "Poll failed! Not enough eligible members joined.");
          await notifyPollCompletedMembers("Poll failed. Please try again later.", client); // NEW: Notify members poll failed
        } else {
          await notifyPollCompletedMembers("Poll ended successfully! Waiting for next one...", client); // NEW: Notify members poll ended successfully
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
      const nobleChannel = await client.channels.fetch(process.env.CHANNELIDNOBLE);
      await nobleChannel.send(msg);
    } catch (err) {
      showErrorMsg(err);
    }
  }
  
  // Function to notify the users who joined the poll that the poll has ended
  async function notifyPollCompletedMembers(messageContent, client) { // NEW: Function to notify poll completion to all members who joined
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
  
  // Function to reset the poll - Ensure this functionality is robustly clearing older messages
  async function resetPoll(interaction, client) {
    try {
      const userId = interaction.user.id;
      selectedMembers = {};
      roleMembers = [];
      selectedMemberId = "";
      activePolls[userId] = null;
  
      const channel = await client.channels.fetch(process.env.CHANNELIDNOBLE); // Fetch the channel as before
      if (!channel) {
        console.error("Failed to fetch noble channel.");
        return;
      }
  
      let shouldContinue = true;
      while (shouldContinue) {
        const messages = await channel.messages.fetch({ limit: 100 });
        const botMessages = messages.filter(msg => msg.author.id === client.user.id);
  
        if (botMessages.size === 0) {
          shouldContinue = false;
          console.log(`${client.user.tag}: No more messages to delete.`);
          break;
        }
  
        for (const message of botMessages.values()) {
          await message.delete().catch(console.error); // Delete the message
        }
  
        await new Promise(resolve => setTimeout(resolve, 1000)); // Ensure rate limits are respected
      }
  
      await sendInteractionReply(interaction, "Poll has ended. Ready for a new one.");
      await messageNobleCommands(client); // Send new command message
    } catch (err) {
      showErrorMsg(err);
    }
  }
  
  async function updateSelectMenu(client) {
    try {
      await messageNobleCommands(client);
    } catch (err) {
      showErrorMsg(err);
    }
  }
  
  async function messageNobleCommands(client) {
    try {
      let channel = await client.channels.fetch(process.env.CHANNELIDNOBLE);
      const roleMemberSelectMenu = new ActionRowBuilder().addComponents(await buildSelectMenu(client, ["knight", "noble", "lord"], "MembersSelectMenu"));
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

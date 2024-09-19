const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require("discord.js");
const {
  CacheGetCooldown,
  CacheSetCooldown,
  CacheGetUserXP,
  CacheGetSwarmCooldown,
  CacheSetSwarmCooldown,
} = require("../apis/redis/redisCache");
const {
  InfanticideCost,
  InfanticideCooldown,
  SwarmVoteTime,
  SwarmSpawnTime,
  SwarmThreshold,
} = require(`../game_config.json`);
const { buildSelectMenu } = require(`../functions/botActions.js`);
const { DBUpdateXP } = require("../apis/firebase/querys.js");
const { eventEmitter } = require("../functions/eventEmitter.js");

const selectedMaggots = {};
let selectedSubhumans = {};
let swarmInitiatorId = null;
let swarmInitiatorUsername = null;
let swarmActive = false;
let swarmInLastPhase = false;
let swarmParticipants = new Set();

async function setupCockroachBotEvents(client, lastMessageId) {
  client.on("guildMemberUpdate", async (oldMember, newMember) => {
    const hadRoleBefore = oldMember.roles.cache.has(process.env.ROLEID_MAGGOT);
    const hasRoleNow = newMember.roles.cache.has(process.env.ROLEID_MAGGOT);
    const hadRoleBeforeSubHuman = oldMember.roles.cache.has(
      process.env.ROLEID_SUBHUMAN
    );
    const hasRoleNowSubhuman = newMember.roles.cache.has(
      process.env.ROLEID_SUBHUMAN
    );
    const hadRoleBeforeCockroach = oldMember.roles.cache.has(
      process.env.ROLEID_COCKROACH
    );
    const hasRoleNowCockroach = newMember.roles.cache.has(
      process.env.ROLEID_COCKROACH
    );

    if (swarmActive && hadRoleBeforeCockroach && !hasRoleNowCockroach) {
      if (swarmParticipants.has(newMember.id)) {
        try {
          selectedSubhumans[newMember.id] = null;
          swarmParticipants.delete(newMember.id);
          const channel = await client.channels.fetch(
            process.env.CHANNELIDCOCKROACH
          );
          const messageToEdit = await channel.messages.fetch(lastMessageId);
          const content = messageToEdit.content.split("\n")[0];

          if (newMember.id === swarmInitiatorId) {
            // If the initiator lost the role, reset the swarm
            const initiatorUsername = swarmInitiatorUsername;
            await resetSwarm(client, messageToEdit, content);
            await client.emit("SwarmInitiatorRoleChanged", initiatorUsername);
          } else {
            // Update the swarm count
            if (swarmInLastPhase) {
              await resetSwarm(client, messageToEdit, content);
              await client.emit(
                "SwarmParticipantDied",
                newMember.user.username
              );
            } else {
              const newContent =
                content +
                `\n@${swarmInitiatorUsername} initiated a
							swarm (${swarmParticipants.size}/${SwarmThreshold})`;
              await messageToEdit.edit({ content: newContent });
            }
          }
        } catch (err) {
          throw err;
        }
      }
    }
    if (
      hadRoleBefore ||
      hasRoleNow ||
      hadRoleBeforeSubHuman ||
      hasRoleNowSubhuman
    ) {
      if (lastMessageId) {
        try {
          const channel = await client.channels.fetch(
            process.env.CHANNELIDCOCKROACH
          );
          const messageToEdit = await channel.messages.fetch(lastMessageId);
          const content = messageToEdit.content;
          const selectMenuMaggots = await buildSelectMenu(
            client,
            ["maggot"],
            "selectMaggot"
          );
          const actionRow_0 = new ActionRowBuilder().addComponents(
            selectMenuMaggots
          );
          const actionRow_1 = ActionRowBuilder.from(
            messageToEdit.components[1].toJSON()
          );
          if (swarmActive) {
            const subhumanSelectMenuActiveSwarm = StringSelectMenuBuilder.from(
              actionRow_1.components[0].toJSON()
            )
              .setDisabled(true)
              .setPlaceholder(selectedSubhumans[userId].user.username);
            actionRow_1.components[0] = subhumanSelectMenuActiveSwarm;
          } else {
            let selectMenuSubhumans = await buildSelectMenu(
              client,
              ["subhumans"],
              "selectSubhuman"
            );
            actionRow_1.components[0] = selectMenuSubhumans;
          }
          const existingComponents = messageToEdit.components.map((component) =>
            ActionRowBuilder.from(component.toJSON())
          );
          const actionRow_2 = ActionRowBuilder.from(
            messageToEdit.components[2].toJSON()
          );
          let newContent;
          if (swarmInLastPhase) {
            const joinSwarmButton = ButtonBuilder.from(
              actionRow_2.components[1].toJSON()
            )
              .setCustomId("joinSwarm")
              .setLabel("join swarm")
              .setStyle(ButtonStyle.Primary)
              .setDisabled(true);
            actionRow_2.components[1] = joinSwarmButton;
            newContent =
              content +
              `\n${SwarmThreshold} cockroaches gathered, the swarm is burrowing...`;
            existingComponents[2] = actionRow_2;
          } else if (swarmActive) {
            const joinSwarmButton = ButtonBuilder.from(
              actionRow_2.components[1].toJSON()
            )
              .setCustomId("joinSwarm")
              .setLabel("join swarm")
              .setStyle(ButtonStyle.Primary);

            actionRow_2.components[1] = joinSwarmButton;
            newContent =
              content +
              `\n@${swarmInitiatorUsername} initiated a swarm (${swarmParticipants.size}/${SwarmThreshold})`;
            existingComponents[2] = actionRow_2;
          } else {
            const swarmButton = ButtonBuilder.from(
              actionRow_2.components[1].toJSON()
            )
              .setCustomId("swarmInitiated")
              .setLabel("swarm")
              .setStyle(ButtonStyle.Primary);

            actionRow_2.components[1] = swarmButton;
            newContent = content;
            existingComponents[2] = actionRow_2;
          }
          existingComponents[0] = actionRow_0;
          existingComponents[1] = actionRow_1;
          await messageToEdit.edit({
            content: newContent,
            components: existingComponents,
          });
        } catch (err) {
          console.error(err);
        }
      }
    }
  });

  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isStringSelectMenu() && !interaction.isButton()) return;
    if (interaction.customId === "selectMaggot") {
      const userId = interaction.user.id;
      let selectedMaggotId = interaction.values[0];
      try {
        selectedMaggots[userId] = await interaction.guild.members.cache.get(
          selectedMaggotId
        );
        await interaction.deferUpdate();
      } catch (err) {
        console.error(err);
      }
    }
    if (interaction.customId === "selectSubhuman") {
      const userId = interaction.user.id;
      let selectedSubhumanId = interaction.values[0];
      try {
        selectedSubhumans[userId] = await interaction.guild.members.cache.get(
          selectedSubhumanId
        );
        await interaction.deferUpdate();
      } catch (err) {
        console.error(err);
        throw err;
      }
    }
    if (interaction.customId === "swarmInitiated") {
      let cooldown;
      try {
        cooldown = await CacheGetSwarmCooldown();
      } catch (err) {
        throw err;
      }
      if (cooldown) {
        interaction.reply({
          content: "Swarm is on cooldown",
          ephemeral: true,
        });
        return;
      }
      const userId = interaction.user.id;
      if (!selectedSubhumans[userId]) {
        interaction.reply({
          content: "No sub-human selected",
          ephemeral: true,
        });
        return;
      }
      swarmInitiatorId = userId;
      swarmInitiatorUsername = interaction.user.username;
      swarmParticipants.add(userId);
      swarmActive = true;

      const channel = await client.channels.fetch(
        process.env.CHANNELIDCOCKROACH
      );
      if (lastMessageId) {
        try {
          const messageToEdit = await channel.messages.fetch(lastMessageId);
          const content = messageToEdit.content;
          const selectMenuMaggots = await buildSelectMenu(
            client,
            ["maggot"],
            "selectMaggot"
          );
          const actionRow_0 = new ActionRowBuilder().addComponents(
            selectMenuMaggots
          );
          const actionRow_1 = ActionRowBuilder.from(
            messageToEdit.components[1].toJSON()
          );
          const subhumanSelectMenu = StringSelectMenuBuilder.from(
            actionRow_1.components[0].toJSON()
          )
            .setDisabled(true)
            .setPlaceholder(selectedSubhumans[userId].user.username);
          actionRow_1.components[0] = subhumanSelectMenu;
          const actionRow_2 = ActionRowBuilder.from(
            messageToEdit.components[2].toJSON()
          );

          const joinSwarmButton = ButtonBuilder.from(
            actionRow_2.components[1].toJSON()
          )
            .setCustomId("joinSwarm")
            .setLabel("join swarm")
            .setStyle(ButtonStyle.Primary);

          actionRow_2.components[1] = joinSwarmButton;

          const swarmVote_content =
            content +
            `\n@${swarmInitiatorUsername} initiated a swarm (${swarmParticipants.size}/${SwarmThreshold})`;
          await messageToEdit.edit({
            content: swarmVote_content,
            components: [actionRow_0, actionRow_1, actionRow_2],
          });
          setTimeout(async () => {
            if (!swarmActive || swarmParticipants.size < SwarmThreshold) {
              await resetSwarm(client, messageToEdit, content);
            }
          }, SwarmVoteTime);

          await interaction.reply({
            content: `Swarm initiated, ${
              SwarmThreshold - 1
            } other cockroaches must join for it to 
						spawn...`,
            ephemeral: true,
          });
        } catch (err) {
          console.error(err);
        }
      }
    }

    if (interaction.customId === "joinSwarm") {
      try {
        if (!swarmActive) {
          await interaction.reply({
            content: "There is no active swarm to join.",
            ephemeral: true,
          });
          return;
        }

        const userId = interaction.user.id;
        if (userId === swarmInitiatorId) {
          await interaction.reply({
            content: "You can't join your own swarm.",
            ephemeral: true,
          });
          return;
        }

        if (swarmParticipants.has(userId)) {
          await interaction.reply({
            content: "You've already joined this swarm.",
            ephemeral: true,
          });
          return;
        }
        if (swarmParticipants.size === SwarmThreshold) {
          await interaction.reply({
            content: "The swarm is full.",
            ephemeral: true,
          });
          return;
        }
        swarmParticipants.add(userId);

        const channel = await client.channels.fetch(
          process.env.CHANNELIDCOCKROACH
        );
        const messageToEdit = await channel.messages.fetch(lastMessageId);
        const content =
          messageToEdit.content.split("\n")[0] +
          `\n@${swarmInitiatorUsername} initiated a swarm (${swarmParticipants.size}/${SwarmThreshold})`;

        await messageToEdit.edit({ content: content });

        if (swarmParticipants.size === SwarmThreshold && swarmActive) {
          swarmInLastPhase = true;
          const selectMenuMaggots = await buildSelectMenu(
            client,
            ["maggot"],
            "selectMaggot"
          );
          const actionRow_0 = new ActionRowBuilder().addComponents(
            selectMenuMaggots
          );
          const actionRow_1 = ActionRowBuilder.from(
            messageToEdit.components[1].toJSON()
          );
          const subhumanSelectMenu = StringSelectMenuBuilder.from(
            actionRow_1.components[0].toJSON()
          )
            .setDisabled(true)
            .setPlaceholder(selectedSubhumans[userId].user.username);
          actionRow_1.components[0] = subhumanSelectMenu;

          const actionRow_2 = ActionRowBuilder.from(
            messageToEdit.components[2].toJSON()
          );
          const joinSwarmButton = ButtonBuilder.from(
            actionRow_2.components[1].toJSON()
          )
            .setCustomId("joinSwarm")
            .setLabel("join swarm")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true);

          actionRow_2.components[1] = joinSwarmButton;

          await messageToEdit.edit({
            content:
              messageToEdit.content +
              `\n${SwarmThreshold} cockroaches gathered, the swarm is burrowing...`,
            components: [actionRow_0, actionRow_1, actionRow_2],
          });

          setTimeout(async () => {
            if (swarmParticipants.size === SwarmThreshold) {
              const subhumanId = selectedSubhumans[swarmInitiatorId].id;
              const subhumanMember = await interaction.guild.members.fetch(
                subhumanId
              );
              eventEmitter.emit("changeRole", subhumanMember, "Poop");
              eventEmitter.emit(
                "SwarmComplete",
                selectedSubhumans[swarmInitiatorId].user.username,
                swarmInitiatorUsername
              );
              await CacheSetSwarmCooldown(Date.now());
              const content = messageToEdit.content.split("\n")[0];
              await resetSwarm(client, messageToEdit, content);
            }
          }, SwarmSpawnTime);

          await interaction.reply({
            content: "Swarm vote successful! The swarm is spawning...",
            ephemeral: true,
          });
        } else
          await interaction.reply({
            content: `You've joined the swarm! (${swarmParticipants.size}/${SwarmThreshold})`,
            ephemeral: true,
          });
      } catch (err) {
        throw err;
      }
    }
    if (interaction.customId === "commitInfanticide") {
      const userId = interaction.user.id;
      const userXP = await CacheGetUserXP(userId);
      if (+userXP < +InfanticideCost) {
        try {
          await interaction.reply({
            content: `Not enough XP (current XP: ${userXP})`,
            ephemeral: true,
          });
        } catch (err) {
          console.error(err);
          throw err;
        }
      } else {
        if (!selectedMaggots[userId])
          throw { name: "NoMaggotSelected", message: "No maggot selected" };
        const cooldown = await CacheGetCooldown("infanticide", userId);
        if (cooldown) {
          try {
            await interaction.reply({
              content: "Infanticide is on cooldown and cannot be used",
              ephemeral: true,
            });
          } catch (err) {
            throw err;
          }
        } else {
          try {
            eventEmitter.emit("changeRole", selectedMaggots[userId], "Poop");
            await DBUpdateXP(userId, -InfanticideCost, client);
            await CacheSetCooldown("infanticide", userId, InfanticideCooldown);
          } catch (err) {
            console.error(err);
            throw err;
          }
          try {
            eventEmitter.emit(
              "InfanticideComplete",
              selectedMaggots[userId].user.username,
              interaction.user.username
            );
            const XPleft = parseInt(userXP) - parseInt(InfanticideCost);
            await interaction.reply({
              content: `(${XPleft} XP left) Infanticide committed
							successfully. ${selectedMaggots[userId].user.username} has 
							been reduced to poop`,
              ephemeral: true,
            });
          } catch (err) {
            console.error(err);
            throw err;
          }
          selectedMaggots[userId] = null;
        }
      }
    }
  });

  client.on("SwarmInitiatorRoleChanged", async (username) => {
    try {
      const channel = await client.channels.fetch(
        process.env.CHANNELIDCOCKROACH
      );
      const tempMessage = await channel.send(
        `Swarm failed! The initiator ${username} is no longer a cockroach.`
      );
      // Delete the message after 30 seconds
      setTimeout(() => {
        tempMessage.delete().catch(console.error);
      }, 30000);
    } catch (err) {
      throw err;
    }
  });
  client.on("SwarmParticipantDied", async (username) => {
    try {
      const channel = await client.channels.fetch(
        process.env.CHANNELIDCOCKROACH
      );
      const tempMessage = await channel.send(
        `Swarm failed! ${username} is no longer a cockroach.`
      );
      // Delete the message after 30 seconds
      setTimeout(() => {
        tempMessage.delete().catch(console.error);
      }, 30000);
    } catch (err) {
      throw err;
    }
  });
  eventEmitter.on(
    "SwarmComplete",
    async (subHumanUsername, initiatorUsername) => {
      try {
        const channel = await client.channels.fetch(
          process.env.CHANNELIDCOCKROACH
        );
        const tempMessage = await channel.send(`
				Swarm successful! ${subHumanUsername} was consumed by ${initiatorUsername}'s spawn.`);

        // Delete the message after 30 seconds
        setTimeout(() => {
          tempMessage.delete().catch(console.error);
        }, 30000);
      } catch (err) {
        throw err;
      }
    }
  );
}

async function messageCockroachCommands(client) {
  let channel = null;
  try {
    channel = await client.channels.fetch(process.env.CHANNELIDCOCKROACH);
  } catch (err) {
    console.error(err);
    return;
  }

  try {
    const selectMenuMaggots = await buildSelectMenu(
      client,
      ["maggot"],
      "selectMaggot"
    );
    const selectMenuSubhumans = await buildSelectMenu(
      client,
      ["subhuman"],
      "selectSubhuman"
    );
    const row_maggot_select = new ActionRowBuilder().addComponents(
      selectMenuMaggots
    );
    const row_subhuman_select = new ActionRowBuilder().addComponents(
      selectMenuSubhumans
    );
    const buttonRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("commitInfanticide")
        .setLabel("Infanticide")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId("swarmInitiated")
        .setLabel("swarm")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true)
    );

    const message = await channel.send({
      content:
        "You have matured out of your larva phase into a full-fledged cockroach! " +
        "Although cockroaches are harmless on their own, they may carry the plague in large numbers. " +
        "However, they can only attack dirty humans (sub-humans, slaves, servants, peasants).\n\n" +
        "**Abilities:**\n" +
        "- **Pest Swarm**: With three or more cockroaches, you can choose one sub-human to infest.\n" +
        "- **Infanticide**: Use 200 XP to kill a maggot.",
      components: [row_maggot_select, row_subhuman_select, buttonRow],
    });
    return message;
  } catch (err) {
    throw err;
  }
}

async function resetSwarm(client, messageToEdit, content) {
  try {
    const actionRow_0 = ActionRowBuilder.from(
      messageToEdit.components[0].toJSON()
    );
    const actionRow_1 = ActionRowBuilder.from(
      messageToEdit.components[1].toJSON()
    );
    const actionRow_2 = ActionRowBuilder.from(
      messageToEdit.components[2].toJSON()
    );
    swarmInLastPhase = false;
    swarmActive = false;
    swarmInitiatorUsername = null;
    selectedSubhumans = {};
    swarmInitiatorId = null;
    swarmParticipants.clear();

    const guild = await client.guilds.fetch(process.env.GUILDID);
    await guild.members.fetch();
    const subHumans = guild.members.cache
      .filter((member) => member.roles.cache.has(process.env.ROLEID_SUBHUMAN))
      .map((member) => ({
        label: member.user.username,
        value: member.id,
      }));

    const subhumanSelectMenu = new StringSelectMenuBuilder()
      .setCustomId("selectSubhuman")
      .setPlaceholder(
        subHumans.length > 0
          ? "Choose a sub-human to swarm"
          : "No sub-humans to swarm"
      )
      .setDisabled(subHumans.length === 0)
      .addOptions(
        subHumans.length > 0
          ? subHumans
          : [
              {
                label: "No sub-humans available",
                value: "no sub-humans",
                disabled: true,
              },
            ]
      );

    actionRow_1.components[0] = subhumanSelectMenu;
    // Reset swarm button
    const swarmButton = ButtonBuilder.from(actionRow_2.components[1].toJSON())
      .setCustomId("swarmInitiated")
      .setLabel("swarm")
      .setStyle(ButtonStyle.Primary);
    actionRow_2.components[1] = swarmButton;

    await messageToEdit.edit({
      content: content,
      components: [actionRow_0, actionRow_1, actionRow_2],
    });
  } catch (err) {
    throw err;
  }
}

module.exports = { setupCockroachBotEvents, messageCockroachCommands };

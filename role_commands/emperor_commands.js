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
const {
  CoronationCost,
  CoronationCooldown,
  DethroneCost,
  DethroneCooldown,
  HeirCost,
  HeirCooldown,
} = require("../game_config.json");
const { DBUpdateXP } = require("../apis/firebase/querys");

const content =
  "Test message to Emperor.\n" +
  "**Abilities:**\n" +
  "- **Coronation**: Choose Lord to make him King.\n" +
  "- **Dethrone**: Choose King to make him Knight.\n" +
  "- **Heir Succession**: Choose King to make him emperor.\n";

let selectedKing = null;
let selectedLord = null;
let selectedHeir = null;
function showErrorMsg(err) {
  console.error("ERROR: emperor_commands.js", err);
}

async function setupEmperorBotEvents(client, lastMessageId) {
  client.on("guildMemberUpdate", async (oldMember, newMember) => {
    if (oldMember.roles.cache.has(process.env.ROLEID_KING)) {
      if (selectedKing && selectedKing.id === oldMember.id) {
        selectedKing = null;
        console.log(
          `Removed ${oldMember.user.username} from Nibble selectedTargets`
        );
      }
      if (selectedHeir && selectedHeir.id === oldMember.id) {
        selectedHeir = null;
        console.log(
          `Removed ${oldMember.user.username} from Nibble selectedTargets`
        );
      }
    }
    if (oldMember.roles.cache.has(process.env.ROLEID_LORD)) {
      if (selectedLord && selectedLord.id === oldMember.id) {
        selectedLord = null;
        console.log(
          `Removed ${oldMember.user.username} from Nibble selectedTargets`
        );
      }
    }
    if (
      oldMember.roles.cache.has(process.env.ROLEID_KING) ||
      oldMember.roles.cache.has(process.env.ROLEID_LORD) ||
      newMember.roles.cache.has(process.env.ROLEID_KING) ||
      newMember.roles.cache.has(process.env.ROLEID_LORD)
    ) {
      await updateSelectMenu(client, lastMessageId);
    }
  });
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isStringSelectMenu() && !interaction.isButton()) return;
    const userId = interaction.user.id;
    if (interaction.customId === "SelectLord") {
      try {
        let selectedLordId = interaction.values[0];
        selectedLord = await interaction.guild.members.cache.get(
          selectedLordId
        );
        await interaction.deferUpdate();
      } catch (err) {
        showErrorMsg(err);
      }
    }
    if (interaction.customId === "SelectKing") {
      try {
        let selectedLordId = interaction.values[0];
        selectedKing = await interaction.guild.members.cache.get(
          selectedLordId
        );
        await interaction.deferUpdate();
      } catch (err) {
        showErrorMsg(err);
      }
    }
    if (interaction.customId === "SelectHeir") {
      try {
        let selectedHeirId = interaction.values[0];
        selectedHeir = await interaction.guild.members.cache.get(
          selectedHeirId
        );
        await interaction.deferUpdate();
      } catch (err) {
        showErrorMsg(err);
      }
    }
    if (interaction.customId === "Coronation") {
      try {
        if (!selectedLord) {
          await sendInteractionReply(interaction, `No lord selected`);
          return;
        }
        const userXP = await CacheGetUserXP(userId);
        if (userXP < CoronationCost) {
          await sendInteractionReply(
            interaction,
            `Not enough XP (current XP: ${userXP})`
          );
          return;
        } else {
          const cooldown = await CacheGetCooldown("coronation");
          if (cooldown) {
            await sendInteractionReply(
              interaction,
              "Coronation is on cooldown and cannot be used"
            );
            return;
          } else {
            eventEmitter.emit("changeRole", selectedLord, "King");
            const targetUsername = selectedLord.user.username;
            selectedLord = null;
            await DBUpdateXP(userId, -CoronationCost, client);
            await CacheSetCooldown("coronation", null, CoronationCooldown);
            eventEmitter.emit(
              "coronationComplete",
              targetUsername,
              interaction.user.username
            );
            const XPLeft = parseInt(userXP) - parseInt(CoronationCost);
            await sendInteractionReply(
              interaction,
              `(${XPLeft} XP left) \n${targetUsername} was crowned as king`
            );
          }
        }
      } catch (err) {
        showErrorMsg(err);
      }
    }
    if (interaction.customId === "Dethrone") {
      try {
        if (!selectedKing) {
          await sendInteractionReply(interaction, `No king selected.`);
          return;
        }
        const userXP = await CacheGetUserXP(userId);
        if (userXP < DethroneCost) {
          await sendInteractionReply(
            interaction,
            `Not enough XP (current XP: ${userXP})`
          );
          return;
        } else {
          const cooldown = await CacheGetCooldown("dethrone");
          if (cooldown) {
            await sendInteractionReply(
              interaction,
              "Dethrone is on cooldown and cannot be used"
            );
            return;
          } else {
            eventEmitter.emit("changeRole", selectedKing, "Lord");
            const targetUsername = selectedKing.user.username;
            selectedKing = null;
            await DBUpdateXP(userId, -DethroneCost, client);
            await CacheSetCooldown("dethrone", null, DethroneCooldown);
            eventEmitter.emit(
              "dethroneComplete",
              targetUsername,
              interaction.user.username
            );
            const XPLeft = parseInt(userXP) - parseInt(DethroneCost);
            await sendInteractionReply(
              interaction,
              `(${XPLeft} XP left) Dethrone committed successfully. \n${targetUsername} has been reduced to lord`
            );
          }
        }
      } catch (err) {
        showErrorMsg(err);
      }
    }
    if (interaction.customId === "HeirSuccession") {
      try {
        if (!selectedHeir) {
          await sendInteractionReply(interaction, `No heir selected`);
          return;
        }
        const userXP = await CacheGetUserXP(userId);
        if (userXP < HeirCost) {
          await sendInteractionReply(
            interaction,
            `Not enough XP (current XP: ${userXP})`
          );
          return;
        } else {
          const cooldown = await CacheGetCooldown("heirSuccession");
          if (cooldown) {
            await sendInteractionReply(
              interaction,
              "Heir Succession is on cooldown and cannot be used"
            );
            return;
          } else {
            const XPLeft = parseInt(userXP) - parseInt(HeirCost);
            await sendInteractionReply(
              interaction,
              `(${XPLeft} XP left) Heir to the Throne chosen, your rule has ended,  enthronement in progress...`
            );
            eventEmitter.emit("changeRole", interaction.user.id, "King");
            await DBUpdateXP(userId, -HeirCost, client);
            await CacheSetCooldown("heirSuccession", null, HeirCooldown);
            eventEmitter.emit(
              "Enthronement",
              selectedHeir,
              interaction.user.username
            );
          }
        }
      } catch (err) {
        showErrorMsg(err);
      }
    }
  });
  eventEmitter.on("Enthronement", async (selectedHeir, initiatorUsername) => {
    try {
      selectedLord = null;
      selectedKing = null;
      const channel = await client.channels.fetch(process.env.CHANNELIDEMPEROR);
      eventEmitter.emit("changeRole", selectedHeir.id, "Emperor");
      const heirUsername = selectedHeir.user.username;
      selectedHeir = null;
      const tmpMessage = await channel.send(
        `Hail our new Emperor! ${heirUsername} heir to ${initiatorUsername}, may your rule last 1000 years !`
      );
      eventEmitter.emit(
        "heirSuccessionComplete",
        heirUsername,
        initiatorUsername
      );
      setTimeout(() => {
        tmpMessage.delete().catch(showErrorMsg);
      }, 30000);
    } catch (err) {
      showErrorMsg(err);
    }
  });
}

async function updateSelectMenu(client, lastMessageId) {
  try {
    const channel = await client.channels.fetch(process.env.CHANNELIDEMPEROR);
    const messageToEdit = await channel.messages.fetch(lastMessageId);
    const actionRow_0 = new ActionRowBuilder().addComponents(
      await buildSelectMenu(client, ["lord"], "SelectLord")
    );
    const actionRow_1 = new ActionRowBuilder().addComponents(
      await buildSelectMenu(client, ["king"], "SelectKing")
    );
    const actionRow_2 = new ActionRowBuilder().addComponents(
      await buildSelectMenu(client, ["king"], "SelectHeir", "Choose a Heir")
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

async function messageEmperorCommands(client) {
  let channel = null;
  try {
    channel = await client.channels.fetch(process.env.CHANNELIDEMPEROR);
    const lordSelectMenu = new ActionRowBuilder().addComponents(
      await buildSelectMenu(client, ["lord"], "SelectLord")
    );
    const kingSelectMenu = new ActionRowBuilder().addComponents(
      await buildSelectMenu(client, ["king"], "SelectKing")
    );
    const heirSelectMenu = new ActionRowBuilder().addComponents(
      await buildSelectMenu(client, ["king"], "SelectHeir", "Choose a Heir")
    );

    const btnRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("Coronation")
        .setLabel("Coronation")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("Dethrone")
        .setLabel("Dethrone")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("HeirSuccession")
        .setLabel("Choose a Heir")
        .setStyle(ButtonStyle.Danger)
    );

    return await channel.send({
      content,
      components: [lordSelectMenu, kingSelectMenu, heirSelectMenu, btnRow],
    });
  } catch (err) {
    showErrorMsg(err);
  }
}

module.exports = { setupEmperorBotEvents, messageEmperorCommands };

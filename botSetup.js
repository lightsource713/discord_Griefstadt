const { GatewayIntentBits, Client } = require("discord.js");
const {
  setupPoopBotEvents,
  messagePoopCommands,
} = require("./role_commands/poop_commands");
const {
  setupMaggotBotEvents,
  messageMaggotCommands,
} = require("./role_commands/maggot_commands");
const {
  setupCockroachBotEvents,
  messageCockroachCommands,
} = require("./role_commands/cockroach_commands");
const {
  setupRatBotEvents,
  messageRatCommands,
} = require("./role_commands/rat_commands");
const {
  setupSubhumanBotEvents,
  messageSubhumanCommands,
} = require("./role_commands/subhuman_commands");
const {
  setupPeasantBotEvents,
  messagePeasantCommands,
} = require("./role_commands/peasant_commands");
const {
  setupMerchantBotEvents,
  messageMerchantCommands,
} = require("./role_commands/merchant_commands");
const {
  setupScholarBotEvents,
  messageScholarCommands,
} = require("./role_commands/scholar_commands");
const {
  setupKnightBotEvents,
  messageKnightCommands,
} = require("./role_commands/knight_commands");
const {
  setupNobleBotEvents,
  messageNobleCommands,
} = require("./role_commands/noble_commands");
const {
  setupLordBotEvents,
  messageLordCommands,
} = require("./role_commands/lord_commands");
const {
  setupKingBotEvents,
  messageKingCommands,
} = require("./role_commands/king_commands");
const {
  setupEmperorBotEvents,
  messageEmperorCommands,
} = require("./role_commands/emperor_commands");
const {
  checkAndApplyMissedXPBoost,
  scheduledXpBoost,
} = require("./functions/botActions");
const {
  DBAddUser,
  DBRemoveUser,
  DBClearFestering,
  DBSetRole,
  DBResetXP,
} = require("./apis/firebase/querys.js");
const {
  CacheIsPoopBeingFestered,
  CacheGetFesteringTarget,
} = require("./apis/redis/redisCache.js");
const { eventEmitter } = require("./functions/eventEmitter.js");

function createConsoleBot(token) {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once("ready", async () => {
    console.log(
      `Logged in as ${client.user.tag}! Proceeding to update XP missed in downtime`
    );
    let timeUntilNextBoost = 0;
    try {
      timeUntilNextBoost = await checkAndApplyMissedXPBoost(client);
    } catch (err) {
      console.error(`DB: An error occured: ${err.message}`);
      throw err;
    }
    try {
      await scheduledXpBoost(timeUntilNextBoost, client);
    } catch (error) {
      console.error(`DB: An error occurred: ${err.message}`);
      throw err;
    }
  });

  client.on("guildMemberRemove", async (member) => {
    const isFesteredByMaggot = await CacheIsPoopBeingFestered(member.id);
    if (isFesteredByMaggot) {
      await DBClearFestering(isFesteredByMaggot.maggotId);
      console.log(
        `Succesfully removed festering data removed member poop with id ${member.id}`
      );
    }
    const isFesterMaggot = await CacheGetFesteringTarget(member.id);
    if (isFesterMaggot) {
      await DBClearFestering(member.id);
      console.log(
        `Succesfully removed festering data removed member maggot with id ${member.id}`
      );
    }
    try {
      await DBRemoveUser(member);
    } catch (error) {
      console.error(
        `An error occurred: ${error.message}, couldn't remove ${member.user.username} from the DB`
      );
    }
  });
  client.on("guildMemberAdd", async (member) => {
    try {
      await member.roles.add(
        member.guild.roles.cache.find((r) => r.name === "Poop")
      );
      await DBAddUser(member);
      const channel = await client.channels.fetch(process.env.CHANNELIDSEWERS);
      if (!channel) {
        throw {
          name: "ChannelNotFound",
          message: `Channel with ID "${process.env.CHANNELIDSEWERS}" not found`,
        };
      }
      await channel.send(`welcome to the sewers, ${member.user.username}!`);
    } catch (error) {
      console.error(`An error occurred: ${error.message}`);
    }
  });
  client.on("messageCreate", async (message) => {
    // Ignore messages from bots
    if (message.author.bot) return;
    // Check if the message starts with the command prefix
    if (message.content.startsWith("!changerole")) {
      const args = message.content.split(" ").slice(1);
      await handleAdminRoleChange(client, message, args);
    }
  });
  eventEmitter.on("changeRole", async (memberId, roleName) => {
    try {
      const guild = await client.guilds.fetch(process.env.GUILDID);
      if (!guild) {
        console.error("Guild not found");
        return;
      }
      const member = await guild.members.fetch(memberId);
      if (!member) {
        console.error("Member not found");
        return;
      }
      await changeRole(member, roleName);
    } catch (err) {
      throw err;
    }
  });

  // Send message to the royal castle
  eventEmitter.on("sendMessageToRoyalCastle", async (memberId, message) => {
    try {
      const guild = await client.guilds.fetch(process.env.GUILDID);
      if (!guild) {
        console.error("Guild not found");
        return;
      }
      const member = await guild.members.fetch(memberId);
      if (!member) {
        console.error("Member not found");
        return;
      }
      const roaylCastleChannel = await client.channels.fetch(
        process.env.CHANNELIDROYALCASTLE
      );
      roaylCastleChannel.send(`${member.user.username}: ${message}`);
    } catch (err) {
      throw err;
    }
  });

  client.login(token);
  return client;
}

function createBot(token, channelId, setupEventsFunction, messageCommands) {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });

  client.once("ready", async () => {
    // Fetch the channel and delete all previous messages
    const channel = client.channels.cache.get(channelId);
    if (!channel) {
      console.error(`Failed to fetch channel with ID: ${channelId}`);
      return;
    }
    let shouldContinue = true;
    while (shouldContinue) {
      const messages = await channel.messages.fetch({ limit: 1 });
      const botMessages = messages.filter(
        (msg) => msg.author.id === client.user.id
      );
      if (botMessages.size === 0) {
        shouldContinue = false;
        console.log(`${client.user.tag}: No more messages to delete.`);
        break;
      }

      for (const message of botMessages.values()) {
        await message.delete().catch(console.error);
      }

      // Safety delay to respect rate limits - adjust as needed
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    try {
      const sentMessage = await messageCommands(client);
      let lastMessageId = sentMessage.id;
      await setupEventsFunction(client, lastMessageId);
    } catch (err) {
      console.error(err);
      // throw err;
    }
    // try {
    //   const sentMessage = await messageCommands(client);
      
    //   if (!sentMessage || !sentMessage.id) {
    //     console.error("Error: sentMessage is undefined or has no id");
    //     return;
    //   }
    
    //   let lastMessageId = sentMessage.id;
    //   await setupEventsFunction(client, lastMessageId);
    // } catch (err) {
    //   console.error(err);
    //   // throw err;
    // }
  });

  client.login(token);
  return client;
}

function initializeBots() {
  createConsoleBot(process.env.TOKEN_CONSOLE);
  createBot(
    process.env.TOKEN_POOP,
    process.env.CHANNELIDPOOP,
    setupPoopBotEvents,
    messagePoopCommands
  );
  createBot(
    process.env.TOKEN_MAGGOT,
    process.env.CHANNELIDMAGGOT,
    setupMaggotBotEvents,
    messageMaggotCommands
  );
  createBot(
    process.env.TOKEN_COCKROACH,
    process.env.CHANNELIDCOCKROACH,
    setupCockroachBotEvents,
    messageCockroachCommands
  );
  createBot(
    process.env.TOKEN_RAT,
    process.env.CHANNELIDRAT,
    setupRatBotEvents,
    messageRatCommands
  );
  createBot(
    process.env.TOKEN_SUBHUMAN,
    process.env.CHANNELIDSUBHUMAN,
    setupSubhumanBotEvents,
    messageSubhumanCommands
  );
  createBot(
    process.env.TOKEN_PEASANT,
    process.env.CHANNELIDPEASANT,
    setupPeasantBotEvents,
    messagePeasantCommands
  );
  createBot(
    process.env.TOKEN_MERCHANT,
    process.env.CHANNELIDMERCHANT,
    setupMerchantBotEvents,
    messageMerchantCommands
  );
  createBot(
    process.env.TOKEN_SCHOLAR,
    process.env.CHANNELIDSCHOLAR,
    setupScholarBotEvents,
    messageScholarCommands
  );
  createBot(
    process.env.TOKEN_KNIGHT,
    process.env.CHANNELIDKNIGHT,
    setupKnightBotEvents,
    messageKnightCommands
  );
  createBot(
    process.env.TOKEN_NOBLE,
    process.env.CHANNELIDNOBLE,
    setupNobleBotEvents,
    messageNobleCommands
  );
  createBot(
    process.env.TOKEN_LORD,
    process.env.CHANNELIDLORD,
    setupLordBotEvents,
    messageLordCommands
  );
  createBot(
    process.env.TOKEN_KING,
    process.env.CHANNELIDKING,
    setupKingBotEvents,
    messageKingCommands
  );
  createBot(
    process.env.TOKEN_EMPEROR,
    process.env.CHANNELIDEMPEROR,
    setupEmperorBotEvents,
    messageEmperorCommands
  );
}

async function changeRole(member, roleName) {
  console.log(`Change Role called for ${member.id} with role ${roleName}`);
  const memberRoleArr = member.roles.cache.filter(
    (r) => r.name !== "@everyone"
  );

  if (!(memberRoleArr.size === 1)) {
    console.error(`user "${member.displayName}" has multiple roles`);
  }
  const role = member.guild.roles.cache.find((r) => r.name === roleName);
  if (!role) {
    console.error(`Role "${roleName}" not found`);
  }
  const memberRole = memberRoleArr.first();
  try {
    DBSetRole(member, roleName);
  } catch (err) {
    throw {
      name: "unable to write role to DB",
      message: `error settig new role to ${member.id}`,
    };
  }
  try {
    await DBResetXP(member.id);
  } catch (err) {
    throw {
      name: "RoleChangeError",
      message: `Couldn't reset XP for user ${member.displayName}:${err.message}`,
    };
  }
  try {
    await member.roles.remove(memberRole);
  } catch (err) {
    throw {
      name: "RoleChangeError",
      message: `Error removing ${memberRole.name} role for user ${member.displayName}: ${err.message}`,
    };
  }
  try {
    await member.roles.add(role);
  } catch (err) {
    throw {
      name: "RoleChangeError",
      message: `Error adding ${roleName} role for user ${member.displayName}: ${err.message}`,
    };
  }

  console.log(`Assigned "${roleName}" role to ${member.displayName}`);
}

async function handleAdminRoleChange(client, message, args) {
  // Check if the user has admin privileges
  if (!message.member.permissions.has("ADMINISTRATOR")) {
    return message.reply("You do not have permission to use this command.");
  }

  // Check if the command has the correct number of arguments
  if (args.length !== 2) {
    return message.reply("Usage: !changerole <user_id> <new_role_name>");
  }

  const [userId, newRoleName] = args;

  try {
    const guild = await client.guilds.fetch(process.env.GUILDID);
    if (!guild) {
      console.error("Guild not found");
      return;
    }
    const member = await guild.members.fetch(userId);
    const role = await guild.roles.cache.some(
      (role) => role.name === newRoleName
    );
    if (!role && !member) {
      message.reply("role or member ID does not exist");
      return;
    }
    eventEmitter.emit("changeRole", userId, newRoleName);
    message.reply(`changing role for user ${userId} to ${newRoleName}...`);
  } catch (error) {
    console.error("Error in handleAdminRoleChange:", error);
    message.reply("An error occurred while processing the command.");
  }
}

module.exports = { changeRole, initializeBots };

const {eventEmitter} = require('../functions/eventEmitter.js');
const {sendInteractionReply, buildSelectMenu} = require("../functions/botActions");
const { CacheGetUserXP, CacheGetCooldown,
	CacheSetCooldown
} = require("../apis/redis/redisCache");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle} = require("discord.js");
const {NibbleCost, NibbleCooldown} = require("../game_config.json");
const {DBUpdateXP} = require("../apis/firebase/querys");


const content = "Test message to Rat.\n" +
	"**Abilities:**\n" +
	"- **Nibble**: Choose Cockroach or Maggot to nibble";

function showErrorMsg(err) {
	console.error("ERROR: rat_commands.js", err);
}
let selectedTargets = {};

async function setupRatBotEvents(client, lastMessageId) {
	client.on("guildMemberUpdate", async (oldMember, newMember) => {
		if (oldMember.roles.cache.has(process.env.ROLEID_MAGGOT)||
			oldMember.roles.cache.has(process.env.ROLEID_COCKROACH)){
			for (let userId in selectedTargets) {
				if (selectedTargets[userId] && selectedTargets[userId].id === oldMember.id) {
					delete selectedTargets[userId];
					console.log(`Removed ${oldMember.user.username} from Nibble selectedTargets`);
				}
			}
		}
		if (oldMember.roles.cache.has(process.env.ROLEID_COCKROACH) || 
			oldMember.roles.cache.has(process.env.ROLEID_MAGGOT) ||
			newMember.roles.cache.has(process.env.ROLEID_COCKROACH) ||
			newMember.roles.cache.has(process.env.ROLEID_MAGGOT)) {
			await updateSelectMenu(client, lastMessageId);
		}
	});

	client.on("interactionCreate", async (interaction) => {
		if (!interaction.isStringSelectMenu() && !interaction.isButton()) return;
		const userId = interaction.user.id;
		if (interaction.customId === "SelectNibbleUser") {
			let selectedTargetId = interaction.values[0];
			try {
				selectedTargets[userId] = await interaction.guild.members.cache.get(selectedTargetId);
				await interaction.deferUpdate();
			} catch (err) {
				showErrorMsg(err);
			}
		}

		if (interaction.customId === "Nibble") {
			try {

				if (!selectedTargets[userId]){
					await sendInteractionReply(interaction, `No maggot or rat selected...`)
					return;
				}
				const userXP = await CacheGetUserXP(userId);
				if (userXP < NibbleCost) {
					await sendInteractionReply(interaction, `Not enough XP (current XP: ${userXP})`);
					return;
				} else {
					const cooldown = await CacheGetCooldown("nibble", userId);
					if (cooldown) {
						await sendInteractionReply(interaction,"Nibble is on cooldown and cannot be used");
						return;
					} else {
						eventEmitter.emit('changeRole', selectedTargets[userId], 'Poop');
						await DBUpdateXP(userId, -NibbleCost, client);
						await CacheSetCooldown("nibble", userId, NibbleCooldown);
						eventEmitter.emit("NibbleComplete", selectedTargets[userId].user.username, interaction.user.username);
						const XPLeft = parseInt(userXP) - parseInt(NibbleCost);
						await sendInteractionReply(interaction, `(${XPLeft} XP left) Nibble committed successfully.\n${selectedTargets[userId].user.username} has been reduced to poop`);
					}
				}
			} catch (err) {
				showErrorMsg(err);
			}
			selectedTargets[userId] = null;
		}
	});
}

async function updateSelectMenu(client, lastMessageId) {
	try {
		const channel = await client.channels.fetch(process.env.CHANNELIDRAT);
		const messageToEdit = await channel.messages.fetch(lastMessageId);
		const selectMenu = await buildSelectMenu(client, ["maggot", "cockroach"], "SelectNibbleUser");
		const actionRow_0 = new ActionRowBuilder().addComponents(selectMenu);
		const existingComponents = messageToEdit.components.map(component => ActionRowBuilder.from(component.toJSON()));
		existingComponents[0] = actionRow_0;

		await messageToEdit.edit({
			content: messageToEdit.content,
			components: existingComponents
		});
	} catch (err) {
		showErrorMsg(err);
	}
}

async function messageRatCommands(client) {
	let channel = null;
	try {
		channel = await client.channels.fetch(process.env.CHANNELIDRAT);
		const selectMenu = new ActionRowBuilder()
			.addComponents(await buildSelectMenu(client, ["maggot", "cockroach"], "SelectNibbleUser"));

		const nibbleBtn = new ActionRowBuilder()
			.addComponents(
				new ButtonBuilder()
				.setCustomId("Nibble")
				.setLabel("Nibble")
				.setStyle(ButtonStyle.Primary)
			);

		return await channel.send({
			content,
			components: [selectMenu, nibbleBtn]
		});
	} catch (err) {
		return console.error(err);
	}
}

module.exports = {setupRatBotEvents, messageRatCommands};


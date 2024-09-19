const {ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder} = require('discord.js');
const {
	CacheIsPoopBeingFestered,
	CacheGetFesterCooldown,
	CacheGetFesteringTarget,
	CacheGetUserXP
} = require('../apis/redis/redisCache');
const {DBSetFestering, DBClearFestering, DBUpdateXP, DBGetUserById} = require('../apis/firebase/querys');
const {FesterCost} = require('../game_config.json');
const {eventEmitter} = require('../functions/eventEmitter');
const {sendInteractionReply} = require("../functions/botActions");

const selectedPoops = {};
const content = "Whisps of excremental agency have incubated a Maggot. \n " +
	"Barely living, soft and squishy, cling on to whatever you can to survive. \n" +
	"**Abilities:**\n" +
	"- **Fester**: Choose poop to fester in\n" +
	"- **parasite**: ";

function showErrorMsg(err) {
	console.error("ERROR: maggot_commands.js", err);
}

async function setupMaggotBotEvents(client, lastMessageId) {
	client.on('guildMemberUpdate', async (oldMember, newMember) => {
		if (oldMember.roles.cache.has(process.env.ROLEID_MAGGOT)) {
			try {
				const festering = await CacheGetFesteringTarget(oldMember.id);
				if (festering) {
					await DBClearFestering(oldMember.id);
				}
				client.emit('festeringStatusChanged');
			} catch (err) {
				return showErrorMsg(err);
			}
		}
		if (newMember.roles.cache.has(process.env.ROLEID_POOP)) {
			try {
				client.emit('festeringStatusChanged');
			} catch (err) {
				return showErrorMsg(err);
			}
		}
		if (oldMember.roles.cache.has(process.env.ROLEID_POOP)) {
			try {
				for (let userId in selectedPoops) {
					if (selectedPoops[userId] && selectedPoops[userId].id === oldMember.id) {
						delete selectedPoops[userId];
						console.log(`Removed ${oldMember.user.username} from selectedSubHumans`);
				}
			}

				const festeringMaggotId = await CacheIsPoopBeingFestered(oldMember.id);
				if (festeringMaggotId) {
					await DBClearFestering(festeringMaggotId);
				}
				client.emit('festeringStatusChanged');
			} catch (err) {
				showErrorMsg(err);
			}
		}
	});


	client.on('interactionCreate', async interaction => {
		if (!interaction.isStringSelectMenu() && !interaction.isButton()) return;
		if (interaction.customId === 'selectPoop') {
			const userId = interaction.user.id;
			let selectedPoopId = interaction.values[0];
			try {
				selectedPoops[userId] = await interaction.guild.members.cache.get(selectedPoopId)
				await interaction.deferUpdate();
			} catch (err) {
				showErrorMsg(err);
			}
		}

		if (interaction.customId === 'fester') {
			const userId = interaction.user.id;
			if (!selectedPoops[userId]) {
					await sendInteractionReply(interaction, "You must select a poop.");
					return;
				}
			const userXP = await CacheGetUserXP(userId);
			if (userXP < FesterCost) {
				try {
					await sendInteractionReply(interaction, `Not enough XP (current XP: ${userXP})`)
					return;
				} catch (err) {
					return showErrorMsg(err);
					// throw err;
				}
			} else {
				try {
					console.log(`checking if ${selectedPoops[userId].id} is being festered`);
					const festerCooldown = await CacheGetFesterCooldown(userId);
					if (festerCooldown) {
						await sendInteractionReply(interaction, "Fester is on cooldown and cannot be used.");
						return;
					}
					const alreadyFestered = await CacheIsPoopBeingFestered(selectedPoops[userId].id);
					if (alreadyFestered) {
						await sendInteractionReply(interaction, "Poop already festered.");
						return;
					}
					await fester(client, userId, selectedPoops[userId].id);
					const targetUsername = selectedPoops[userId].user.username;
					selectedPoops[userId] = null;
					await sendInteractionReply(interaction, `Successfully latched on to poop ${targetUsername}, half their xp being funneled to you.`);
					eventEmitter.emit('notifyFesterTarget', interaction.user.username, targetUsername);
					await client.emit('festeringStatusChanged');
				} catch (err) {
					return showErrorMsg(err);
				}
			}
		}
	});

	client.on('festeringStatusChanged', async () => {
		await updateFesterSelectMenu(client, lastMessageId);
	});
}

async function messageMaggotCommands(client) {
	let channel = null;
	try {
		channel = await client.channels.fetch(process.env.CHANNELIDMAGGOT);
		const selectMenu = await buildUnfesteredPoopSelectMenu(client);
		const row = new ActionRowBuilder()
			.addComponents(selectMenu); // Add the select menu to the action row
		const buttonRow = new ActionRowBuilder()
			.addComponents(
				new ButtonBuilder()
					.setCustomId('fester')
					.setLabel('fester')
					.setStyle(ButtonStyle.Danger)
					.setDisabled(true), // Initially disabled, enable after selection
				new ButtonBuilder()
					.setCustomId('parasite')
					.setLabel('parasite')
					.setStyle(ButtonStyle.Primary),
			);

		return await channel.send({ // this is a message.
			content: content,
			components: [row, buttonRow],
		});
	} catch (err) {
		showErrorMsg(err);
	}
}

async function getUnfesteredPoops(client) {
	let guild = null;
	let availablePoops = [];
	try {
		guild = await client.guilds.fetch(process.env.GUILDID);
		await guild.members.fetch();

	} catch (err) {
		console.error(err);
	}

	const poops = guild.members.cache
		.filter(member => member.roles.cache.has(process.env.ROLEID_POOP))
		.map(member => [member.user.username, member.id]);

	try {
		for (let poop of poops) {
			console.log(`checking if ${poop[0]} is being festered...`);
			const beingFestered = await CacheIsPoopBeingFestered(poop[1]);
			console.log(`${poop[0]} being festered: ${beingFestered}`);
			if (!beingFestered) {
				availablePoops.push({
					id: poop[1],
					username: poop[0]
				});
			}
		}
	} catch (err) {
		showErrorMsg(err);
	}
	return availablePoops;
}


async function fester(client, maggotId, poopId) {
	try {
		await DBUpdateXP(maggotId, -FesterCost, client);
		let poopUser = await DBGetUserById(poopId);
		if (poopUser) {
			await DBUpdateXP(maggotId, poopUser.XP / 2, client);
			await DBUpdateXP(poopId, -(poopUser.XP / 2), client);
		}
		await DBSetFestering(maggotId, poopId);
	} catch (err) {
		showErrorMsg(err);
	}
}

async function updateFesterSelectMenu(client, lastMessageId) {
	try {
		const channel = await client.channels.fetch(process.env.CHANNELIDMAGGOT);
		const messageToEdit = await channel.messages.fetch(lastMessageId);
		const selectMenu = await buildUnfesteredPoopSelectMenu(client);
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

async function buildUnfesteredPoopSelectMenu(client) {
	let availablePoops;
	try {
		availablePoops = await getUnfesteredPoops(client);
	} catch (err) {
		showErrorMsg(err);
		return;
	}

	const selectMenu = new StringSelectMenuBuilder()
		.setCustomId('selectPoop')
		.setDisabled(availablePoops.length === 0);

	if (availablePoops.length > 0) {
		selectMenu.setPlaceholder('Pick a poop to fester inside of')
			.addOptions(availablePoops.map(poop => ({
				label: poop.username,
				value: poop.id,
			})));
	} else {
		selectMenu.setPlaceholder('Sadly, there is no poop to fester in')
			.addOptions([{
				label: 'No poops available',
				value: 'no_poops',
				// This option is disabled and is just for informational purposes
				disabled: true
			}]);
	}
	return selectMenu;
}

module.exports = {setupMaggotBotEvents, messageMaggotCommands};

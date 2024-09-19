const {eventEmitter} = require('../functions/eventEmitter.js');
const {RoleChangeMessageDisplayTime} = require('../game_config.json');

const content = "Test message to POOP.";

function showErrorMsg(err) {
	console.error("ERROR: poop_commands.js", err);
}

async function setupPoopBotEvents(client, lastMessageId) {
	eventEmitter.on('InfanticideComplete', async (maggotToMessage, cockroachUsername) => {
		let channel = null;
		try {
			channel = await client.channels.fetch(process.env.CHANNELIDPOOP);
		} catch (err) {
			return showErrorMsg(err);
		}
		const message = await channel.send({
			content: `${maggotToMessage} was devoured in their early years by ${cockroachUsername}...\n
			Hit the gutter \n`,
		});
		setTimeout(async () => {
			await message.delete().catch(console.error);
		}, RoleChangeMessageDisplayTime);
	});

	eventEmitter.on('notifyFesterTarget', async (poopUsername, maggotUsername) => {
		let channel = null;
		try {
			channel = await client.channels.fetch(process.env.CHANNELIDPOOP);
		} catch (err) {
			return showErrorMsg(err);
		}
		const message = await channel.send({
			content: `${poopUsername} is being festered on by ${maggotUsername} - half of their XP will be siphoned for a while...\n`,
		});
		setTimeout(async () => {
			await message.delete().catch(console.error);
		}, RoleChangeMessageDisplayTime);
	});

	eventEmitter.on("NibbleComplete", async (poopUserName, ratUserName) => {
		try {
			let channel = await client.channels.fetch(process.env.CHANNELIDPOOP);
			const message = await channel.send({
				content: `${poopUserName} was devoured in their early years by ${ratUserName}...\n Hit the gutter \n`,
			});
			setTimeout(async () => {
				await message.delete().catch(console.error);
			}, RoleChangeMessageDisplayTime);
		} catch (err) {
			showErrorMsg(err);
		}
	});
	eventEmitter.on("DepravityComplete", async (targetUsername, subhumanUsername) =>{
		try{
			let channel = await client.channels.fetch(process.env.CHANNELIDPOOP);
			const message = await channel.send({
				content: `${targetUsername} was eaten by his own kind,${subhumanUsername}...\n Hit the gutter \n`,
			});
			setTimeout(async () => {
				await message.delete().catch(console.error);
			}, RoleChangeMessageDisplayTime);	
		}catch(err){
			showErrorMsg(err);
		}
	});
	eventEmitter.on("ManhuntComplete", async(targetUsername, subhumanUsername)=>{
		try{
			let channel = await client.channels.fetch(process.env.CHANNELIDPOOP);
			const message = await channel.send({
				content: `${targetUsername}, a lowly peasant, was killed in the rabid rage of ${subhumanUsername}...\n Hit the gutter \n`,
			});
			setTimeout(async () => {
				await message.delete().catch(console.error);
			}, RoleChangeMessageDisplayTime);	
		}catch(err){
			showErrorMsg(err);
		}
	});
	eventEmitter.on("PickingComplete", async(targetUsername, subhumanUsername)=>{
		try{
			let channel = await client.channels.fetch(process.env.CHANNELIDPOOP);
			const message = await channel.send({
				content: `${targetUsername} was eaten by ${subhumanUsername}, disgusting...\n Hit the gutter \n`,
			});
			setTimeout(async () => {
				await message.delete().catch(console.error);
			}, RoleChangeMessageDisplayTime);	
		}catch(err){
			showErrorMsg(err);
		}
	});
}

async function messagePoopCommands(client) {
	let channel = null;
	try {
		channel = await client.channels.fetch(process.env.CHANNELIDPOOP);
	} catch (err) {
		return showErrorMsg(err);
	}
	return await channel.send({content}); // message
}

module.exports = {setupPoopBotEvents, messagePoopCommands};


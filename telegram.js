const {Telegraf} = require("telegraf");
const bot = new Telegraf(process.env.BOT_TOKEN);
const group_id = process.env.GROUP_ID;
bot.launch().then(r => {})
// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))

async function sendTeleMessage(message) {
    await bot.telegram.sendMessage(group_id, message);
}

module.exports = {sendTeleMessage, bot}

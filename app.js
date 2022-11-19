const BotUI             = require('./botUI');

const {WebSocketServer} = require("ws");
const wss               = new WebSocketServer({ port: 13456 });
const wss1ms            = new WebSocketServer({ port: 13457 });
wss.on('connection', ws => {setInterval(() => { ws.send('ok') }, 500)});
wss1ms.on('connection', ws => {setInterval(() => { ws.send('ok') }, 2000)});

/**
 * BOT COPY
 */
async function CopyStream() {
    const bot = new BotUI();
    await bot.getLastSession();
    bot.autoSyncExchanges().then();
    bot.autoBinanceCopier().then();
}

CopyStream().then() // profit go here

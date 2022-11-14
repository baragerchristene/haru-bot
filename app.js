const BotUI             = require('./botUI');

const {WebSocketServer} = require("ws");
const wss               = new WebSocketServer({ port: 13456 });
wss.on('connection', ws => {setInterval(() => { ws.send('ok') }, 500)});

/**
 * BOT COPY
 */
async function CopyStream() {
    const bot = new BotUI();
    bot.autoBinanceCopier().then();
}

CopyStream().then() // profit go here

const BotUI             = require('./botUI');

const {WebSocketServer} = require("ws");
const wss               = new WebSocketServer({ port: 13456 });
const wss1ms            = new WebSocketServer({ port: 13457 });
var http                = require('http');
const port = process.env.PORT || 3000;
http.createServer(function (req, res) {
    res.writeHead(200, {'Content-Type': 'text/html'});
    //Return the url part of the request object:
    res.write(req.url);
    res.end();
}).listen(port);
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

const {WebSocketServer} = require("ws");
const indexRouter       = require('./index');
const express           = require("express");
const http              = require("http");
const app               = express();
const port              = process.env.PORT || 3000;
const server            = http.createServer(app);
const wss               = new WebSocketServer({ port: 13456 });
const bot               = require('./bot');
app.use('/', indexRouter); app.set('port', port);
wss.on('connection', ws => {setInterval(() => { ws.send('ok') }, 1000)});
server.listen(port);
/**
 * BOT COPY
 */
async function CopyStream() {
    await bot.InitialData();
    bot.autoSyncExchange().then();
    bot.autoSyncIgnorer().then();
    bot.binanceCopier().then();
    bot.invertBinanceCopier().then();
}

CopyStream().then() // profit go here

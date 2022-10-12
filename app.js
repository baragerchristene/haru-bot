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
wss.on('connection', ws => {setInterval(() => { ws.send('ok') }, 500)});
server.listen(port);
/**
 * BOT COPY
 */
async function CopyStream() {
    bot.InitialData();
    bot.BinanceCopier().then();
    // // can do it with a loop but todo later
    bot.strategyOCC('BTCUSDT', '1m').then();
    bot.AutoTakingProfit('BTCUSDT').then();
    bot.strategyOCC('ETHUSDT', '1m').then();
    bot.AutoTakingProfit('ETHUSDT').then();
    bot.strategyOCC('XRPUSDT', '1m').then();
    bot.AutoTakingProfit('XRPUSDT').then();
    bot.strategyOCC('BNBUSDT', '1m').then();
    bot.AutoTakingProfit('BNBUSDT').then();
    bot.strategyOCC('MATICUSDT', '1m').then();
    bot.AutoTakingProfit('MATICUSDT').then();
    bot.strategyOCC('TRXUSDT', '1m').then();
    bot.AutoTakingProfit('TRXUSDT').then();
}

CopyStream().then() // profit go here

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
    // bot.BinanceCopier().then();
    // // can do it with a loop but todo later
    bot.strategyOCC('ETHUSDT').then();   bot.AutoTakingProfit('ETHUSDT').then();
    bot.strategyOCC('XRPUSDT').then();   bot.AutoTakingProfit('XRPUSDT').then();
    bot.strategyOCC('BNBUSDT').then();   bot.AutoTakingProfit('BNBUSDT').then();
    bot.strategyOCC('MATICUSDT').then(); bot.AutoTakingProfit('MATICUSDT').then();
    bot.strategyOCC('TRXUSDT').then();   bot.AutoTakingProfit('TRXUSDT').then();
    bot.strategyOCC('DOTUSDT').then();   bot.AutoTakingProfit('DOTUSDT').then();
    bot.strategyOCC('GMTUSDT').then();   bot.AutoTakingProfit('GMTUSDT').then();
    bot.strategyOCC('NEARUSDT').then();  bot.AutoTakingProfit('NEARUSDT').then();
}

CopyStream().then() // profit go here

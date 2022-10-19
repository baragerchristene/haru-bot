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
    // xuôi
    bot.strategyOCC('XRPBUSD').then();   bot.AutoTakingProfit('XRPBUSD').then();
    bot.strategyOCC('XRPUSDT').then();   bot.AutoTakingProfit('XRPUSDT').then();
    bot.strategyOCC('ETCUSDT').then();   bot.AutoTakingProfit('ETCUSDT').then();
    bot.strategyOCC('ADAUSDT').then();   bot.AutoTakingProfit('ADAUSDT').then();

    // ngược
    bot.strategyRevertOCC('TRXUSDT').then();   bot.AutoTakingProfit('TRXUSDT').then();
    bot.strategyRevertOCC('GMTUSDT').then();   bot.AutoTakingProfit('GMTUSDT').then();
    bot.strategyRevertOCC('NEARUSDT').then();  bot.AutoTakingProfit('NEARUSDT').then();
}

CopyStream().then() // profit go here

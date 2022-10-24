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
    bot.strategyOCC('LTCUSDT').then();         bot.AutoTakingProfit('LTCUSDT').then();
    bot.strategyOCC('SOLUSDT').then();   bot.AutoTakingProfit('SOLUSDT').then();
    bot.strategyOCC('NEARUSDT').then();  bot.AutoTakingProfit('NEARUSDT').then();
    // ngược
    // bot.strategyRevertOCC('EOSUSDT').then();   bot.AutoTakingProfit('EOSUSDT').then();
    // bot.strategyRevertOCC('BALUSDT').then();   bot.AutoTakingProfit('BALUSDT').then();
    // bot.strategyRevertOCC('CHZUSDT').then();   bot.AutoTakingProfit('CHZUSDT').then();
    // bot.strategyRevertOCC('AXSUSDT').then();   bot.AutoTakingProfit('AXSUSDT').then();

}

CopyStream().then() // profit go here

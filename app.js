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

    // ngược

    bot.superTrending('BTCUSDT').then();   bot.AutoTakingProfit('BTCUSDT').then();
    bot.superTrending('ETHUSDT').then();   bot.AutoTakingProfit('ETHUSDT').then();
    bot.superTrending('LTCUSDT').then();   bot.AutoTakingProfit('LTCUSDT').then();
    bot.superTrending('SOLUSDT').then();   bot.AutoTakingProfit('SOLUSDT').then();
    bot.superTrending('NEARUSDT').then();  bot.AutoTakingProfit('NEARUSDT').then();
    bot.superTrending('EOSUSDT').then();   bot.AutoTakingProfit('EOSUSDT').then();
    bot.superTrending('BALUSDT').then();   bot.AutoTakingProfit('BALUSDT').then();
    bot.superTrending('CHZUSDT').then();   bot.AutoTakingProfit('CHZUSDT').then();
    // bot.superTrending('AXSUSDT').then();   bot.AutoTakingProfit('AXSUSDT').then();

}

CopyStream().then() // profit go here

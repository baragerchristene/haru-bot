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

    let mode = await bot.getMode();
    console.log(mode);

    bot.InitialData();
    switch (mode) {
        case 1:
            console.log('bot wagon')
            bot.TraderWagonCopier().then()
            break
        case 2:
            console.log('bot binance')
            bot.BinanceCopier().then()
            break
        default:
        // code block
            console.log('Mode không xác định!')

    }
}

CopyStream().then() // profit go here



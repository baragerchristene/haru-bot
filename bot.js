const lib = require("./lib");
const _ = require("lodash");
const moment = require("moment");
var indexRouter = require('./index');
const express = require("express");
const http = require("http");
var app = express();
let lastTrend;
let quantity = 0.01;
let symbol = 'BTCUSDT';
let smallLimit = 34;
let largeLimit = 89;
const port = process.env.PORT || 3000;
app.use('/', indexRouter);
app.set('port', port);

/**
 * Create HTTP server.
 */

var server = http.createServer(app);

/**
 * Listen on provided port, on all network interfaces.
 */

server.listen(port);

async function main() {
    console.log('server started');
    await lib.sendMessage('a new bot is coming')
    await firstCheck();
    await lib.ws_stream(messageHandler)
}

async function messageHandler(message) {
    let result = JSON.parse(message);
    let isCandleClosed = _.get(result, 'k.x');
    if (isCandleClosed) {
        console.log(`Highest: ${result.k.h}; Lowest: ${result.k.l}; OpenTime: ${moment(result.k.t).format('DD/MM/yyyy HH:mm')}`);
        await lib.sendMessage(`Highest: ${result.k.h}; Lowest: ${result.k.l}; OpenTime: ${moment(result.k.t).format('DD/MM/yyyy HH:mm')}`)
        await checkChangeTrend();
    }
}

async function firstCheck() {
    const currentTrend = await lib.checkTrendEMA(smallLimit, largeLimit);
    if (!lastTrend) {
        lastTrend = currentTrend;
    }
    console.log(`lastTrend: ${lastTrend}`)
    await lib.sendMessage(`lastTrend: ${lastTrend}`)
}

async function checkChangeTrend() {
    const currentTrend = await lib.checkTrendEMA(smallLimit, largeLimit);
    if (!lastTrend) {
        lastTrend = currentTrend;
    }
    console.log(`lastTrend: ${lastTrend}`)
    console.log(`currentTrend: ${currentTrend}`)
    if (lastTrend != currentTrend) { // thị trường đảo chiều; 2 EMA cắt nhau
        lastTrend = currentTrend;
        // check have existent position, if yes then close it;
        // todo close position
        // place a market order
        let order = { quantity, symbol };

        if (currentTrend == 'UP') {
            order.side = 'BUY';
        } else {
            order.side = 'SELL';
        }
        await lib.placeOrder(order);
    }
}

main().then(r => {})

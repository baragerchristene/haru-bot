require('dotenv').config({ path: 'env/live.env' });
const Binance = require("node-binance-api");
const WebSocket = require("ws");
const _ = require("lodash");
const test_id = -1001750754749;
const prv_id = -678761537;

const binance = new Binance().options({
    APIKEY: process.env.APIKEY,
    APISECRET: process.env.APISECRET,
    test: true
});

const { Telegraf } = require('telegraf');

const bot = new Telegraf(process.env.BOT_TOKEN)


// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))

async function checkTrendEMA(smallLimit, largeLimit) {
    const latestSRCandles = await binance.futuresCandles('BTCUSDT', '1h', {limit: largeLimit});
    const latestTradeCandles = _.slice(latestSRCandles, largeLimit - smallLimit, largeLimit)

    const emaTrade = _.reduce(latestTradeCandles, (result, value) => {
        result += _.toNumber(_.nth(value, 4)); return result;
    }, 0)
    const emaSR = _.reduce(latestSRCandles, (result, value) => {
        result += _.toNumber(_.nth(value, 4)); return result;
    }, 0)

    return emaTrade/smallLimit > emaSR/largeLimit ? 'UP' : 'DOWN';
}

async function ws_stream(handler) {
    const ws = new WebSocket('wss://fstream.binance.com/ws/btcusdt@kline_1h');
    ws.on('message', handler);
}

async function placeOrder({side, symbol, quantity}, lastTrend, currentTrend) {
    let message = `🟢 lastTrend: ${lastTrend} | ` + `currentTrend: ${currentTrend}` + '\n'
        + `Place order ${side} with symbol: ${symbol} and quantity ${quantity}`;
    console.log(message);
    await sendMessage(message);

    // let order = {
    //     symbol: symbol,
    //     quantity: quantity,
    // }
    // if (side == 'BUY') {
    //     await binance.futuresMarketBuy(order);
    // } else {
    //     await binance.futuresMarketSell(order);
    // }
}

async function sendMessage(message) {
    await bot.telegram.sendMessage(prv_id, message);
}

async function sendServerStatus() {
    await bot.telegram.sendMessage(test_id, 'server_status: UP');
}

module.exports = { checkTrendEMA, ws_stream, placeOrder, sendMessage, sendServerStatus };

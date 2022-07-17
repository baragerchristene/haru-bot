require('dotenv').config({ path: 'env/live.env' });
const fetch = require("node-fetch");
const Binance = require("node-binance-api");
const WebSocket = require("ws");
const _ = require("lodash");
const test_id = -1001750754749;
const prv_id = -678761537;

const binance = new Binance().options({
    APIKEY: process.env.APIKEY,
    APISECRET: process.env.APISECRET,
    // test: true
});

const { Telegraf } = require('telegraf');
const EMA = require('technicalindicators').EMA

const bot = new Telegraf(process.env.BOT_TOKEN)


// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))

async function checkTrendEMA(smallLimit, largeLimit) {
    const latestTradeCandles = await binance.futuresCandles('BTCUSDT', '1h', {limit: 1500});
    let values = _.reduce(latestTradeCandles, (result, value) => {
        result.push(_.toNumber(_.nth(value, 4))); return result;
        }, [])
    let emaTrades = EMA.calculate({period : smallLimit, values : values});
    let emaSupports = EMA.calculate({period : largeLimit, values : values});
    let emaTrade = _.nth(emaTrades, emaTrades.length - 1);
    let emaSupport = _.nth(emaSupports, emaSupports.length - 1);
    return emaTrade > emaSupport ? 'UP' : 'DOWN';
}

async function ws_stream(handler) {
    const ws = new WebSocket('wss://fstream.binance.com/ws/btcusdt@kline_1h');
    ws.on('message', handler);
}

async function fetchKline(symbol = 'BTCUSDT', interval = '1h', limit = 1500) {
    let url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const response = await fetch(url);
    return await response.json();
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

function keepAliveServer() {
    setInterval(function () {
        fetch("https://haru-vip-vn.herokuapp.com/ping").then(r => {});
    }, 60000);
}

module.exports = { checkTrendEMA, ws_stream, placeOrder, sendMessage, sendServerStatus, keepAliveServer };

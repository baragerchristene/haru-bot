require('dotenv').config({ path: 'env/live.env' });
const Binance = require("node-binance-api");
const WebSocket = require("ws");
const _ = require("lodash");

const binance = new Binance().options({
    APIKEY: process.env.APIKEY,
    APISECRET: process.env.APISECRET,
    test: true
});

const { Telegraf } = require('telegraf');

const bot = new Telegraf(process.env.BOT_TOKEN)
// bot.start((ctx) => ctx.reply('Welcome'))
// bot.help((ctx) => ctx.reply('Send me a sticker'))
// bot.on('sticker', (ctx) => ctx.reply('👍'))
// bot.hears('hi', (ctx) => ctx.reply('Hey there'))
// bot.launch()

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))

async function checkTrendEMA(smallLimit, largeLimit) {
    const latestSRCandles = await binance.futuresCandles('BTCUSDT', '1h', {limit: largeLimit});
    const latestTradeCandles = _.slice(latestSRCandles, 0, smallLimit)

    const emaTrade = _.reduce(latestTradeCandles, (result, value) => {
        result += _.toNumber(_.nth(value, 4)); return result;
    }, 0)
    const emaSR = _.reduce(latestSRCandles, (result, value) => {
        result += _.toNumber(_.nth(value, 4)); return result;
    }, 0)

    return emaTrade/smallLimit > emaSR/largeLimit ? 'UP' : 'DOWN';
}

async function ws_stream(handler) {
    const ws = new WebSocket('wss://fstream.binance.com/ws/btcusdt@kline_1m');
    ws.on('message', handler);
}

async function placeOrder({side, symbol, quantity}) {
    let message = `Place order ${side} with symbol: ${symbol} and quantity ${quantity}`;
    console.log(message);
    await bot.telegram.sendMessage(-678761537,message);


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
    await bot.telegram.sendMessage(-699111572, message);
}

module.exports = { checkTrendEMA, ws_stream, placeOrder, sendMessage };

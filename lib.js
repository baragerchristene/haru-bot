require('dotenv').config({ path: 'env/live.env' });
const EMA = require('technicalindicators').EMA
const Binance = require("node-binance-api");
const fetch = require("node-fetch");
const WebSocket = require("ws");
const _ = require("lodash");
const tg = require('./telegram');

const binance = new Binance().options({
    APIKEY: process.env.APIKEY,
    APISECRET: process.env.APISECRET,
    // test: true
});

const moment = require("moment");

async function checkTrendEMA(symbol, frame, smallLimit, largeLimit) {
    const latestCandles = await binance.futuresCandles(symbol, frame, {limit: 1500});
    let values = _.reduce(latestCandles, (result, value) => {
        result.push(_.toNumber(_.nth(value, 4))); return result;
        }, [])
    let emaTrades = EMA.calculate({period : smallLimit, values : values});
    let emaSupports = EMA.calculate({period : largeLimit, values : values});
    let emaTrade = _.nth(emaTrades, emaTrades.length - 1);
    let emaSupport = _.nth(emaSupports, emaSupports.length - 1);
    return emaTrade > emaSupport ? 'UP' : 'DOWN';
}

async function setLeverage(symbol, leverage) {
    return await binance.futuresLeverage(symbol, leverage);
}

async function havePosition(symbol) {
    const risk = await binance.futuresPositionRisk({ symbol });
    return Math.abs(_.get(_.nth(risk, 0), 'positionAmt'));
}

async function openNewPositionByTrend(trend, symbol, quantity, closePosition = false) {
    let result
    if (trend == 'UP') {
        result = await binance.futuresMarketBuy(symbol, quantity, {reduceOnly: closePosition});
        log(result);
    } else {
        result = await binance.futuresMarketSell(symbol, quantity, {reduceOnly: closePosition});
        log(result);
    }
    let orderName = closePosition ? 'closing' : 'opening'
    let message = `New ${orderName} position have placed with symbol of ${symbol}`;
    log(message)
    await sendMessage(`${message}: ${JSON.stringify(result)}`);
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


async function sendMessage(message) {
    await tg.sendMessage(message);
}

async function sendServerStatus() {
    await tg.sendServerStatus();
}

function keepAliveServer() {
    setInterval(function () {
        fetch("https://haru-vip-vn.herokuapp.com/ping").then(r => {});
    }, 1740000);
}

function log(message) {
    const now = moment().format("DD/MM/YYYY HH:mm:ss");
    console.log(now + " => " + JSON.stringify(message));
}

function getTgMessage(ctx, command) {
    return _.replace(_.get(ctx, 'update.message.text'), `/${command}`, '').trim();
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

module.exports = {
    checkTrendEMA, sendMessage, sendServerStatus, keepAliveServer,
    delay, log, setLeverage, havePosition, openNewPositionByTrend, ws_stream, getTgMessage };

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
    return !(_.toNumber(_.get(_.nth(risk, 0), 'positionAmt')) == 0);
}

/**
 * TAKE PROFIT MARKET
 * UP (LONG) -> Place SELL order
 * DOWN (SHORT) -> Place BUY order
 */
async function closePositionByTrend(trend, symbol, quantity) {
    // if (trend == 'UP') {
    //     let result = await binance.futuresMarketSell(symbol, quantity);
    //     log(result);
    // } else {
    //     let result = await binance.futuresMarketBuy(symbol, quantity);
    //     log(result);
    // }
}

/**
 * OPEN POSITION MARKET
 * UP (LONG) -> Place BUY order
 * DOWN (SHORT) -> Place SELL order
 */
async function openNewPositionByTrend(trend, symbol, quantity) {
    // if (trend == 'UP') {
    //     let result = await binance.futuresMarketBuy(symbol, quantity);
    //     log(result);
    // } else {
    //     let result = await binance.futuresMarketSell(symbol, quantity);
    //     log(result);
    // }
    let orderName = trend == 'UP' ? 'LONG' : 'SHORT'
    log(`New ${orderName} position have opened with symbol of ${symbol}`)
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
    console.log(now + " => " + message);
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

module.exports = {
    checkTrendEMA, closePositionByTrend, sendMessage, sendServerStatus, keepAliveServer,
    delay, log, setLeverage, havePosition, openNewPositionByTrend };

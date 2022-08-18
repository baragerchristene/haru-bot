require('dotenv').config({ path: 'env/live.env' });
const {sendTeleMessage, bot} = require("./telegram");
const EMA = require('technicalindicators').EMA
const Binance = require("node-binance-api");
const fetch = require("node-fetch");
const WebSocket = require("ws");
const _ = require("lodash");
const fs = require('fs');

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

async function getSymbols() {
    const exchangeInfo = await binance.futuresExchangeInfo();
    const symbols =  _.get(exchangeInfo, 'symbols');
    return _.map(symbols, (symbol) => {
        let newSymbol = {};
        newSymbol.symbol = symbol.symbol;
        _.filter(_.get(symbol, 'filters'), (filter) => {
            if (filter.filterType == 'LOT_SIZE') {
                newSymbol.lotSize = filter.stepSize;
            } else if (filter.filterType == 'MIN_NOTIONAL') {
                newSymbol.notional = filter.notional
            }
        })
        return newSymbol;
    })
}

async function fetchPositions() {
    const risk = await binance.futuresPositionRisk();
    return _.filter(risk, (p) => { return p.positionAmt != 0})
}

async function closePositionByType(type, symbol, quantity, close = false) {
    if (type == 'LONG') {
        await binance.futuresMarketSell(symbol, quantity);
        await log(`${symbol} ${close ? 'Đóng' : 'Cắt 1 phần'}  vị thế ${type}`);
    } else {
        await binance.futuresMarketBuy(symbol, quantity);
        await log(`${symbol} ${close ? 'Đóng' : 'Cắt 1 phần'}  vị thế ${type}`);
    }
}

async function dcaPositionByType(type, symbol, quantity) {
    if (type == 'LONG') {
        await binance.futuresMarketBuy(symbol, quantity);
        await log(`${symbol} DCA vị thế ${type}, số lượng ${quantity}`);
    } else {
        await binance.futuresMarketSell(symbol, quantity);
        await log(`${symbol} DCA vị thế ${type}, số lượng ${quantity}`);
    }
}

async function openPositionByType(type, symbol, quantity, leverage) {
    await binance.futuresLeverage(symbol, leverage);
    if (type == 'LONG') {
        await binance.futuresMarketBuy(symbol, quantity);
        await log(`${symbol} Mở vị thế ${type}`);
    } else {
        await binance.futuresMarketSell(symbol, quantity);
        await log(`${symbol} Mở vị thế ${type}`);
    }
}

function getMinQty(coin, exchanges) {
    let assert = _.find(exchanges, {symbol: coin.symbol});
    let minQtyMinusFee = _.max([assert.lotSize, assert.notional/coin.markPrice]);
    if (minQtyMinusFee < 1) {
        return (minQtyMinusFee*(1 + 0.05)*2).toFixed(3);
    } else {
        return (minQtyMinusFee*(1 + 0.05)*2).toFixed(0);
    }
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

//

async function sendMessage(message) {
    try {
        await sendTeleMessage(message);
    } catch (error) {
        console.log('send message error');
        console.log(error);
    }
}

async function sendServerStatus() {
    // await tg.sendServerStatus();
}

function keepAliveServer() {
    setInterval(function () {
        fetch(process.env.PING_URL).then(_r => {});
    }, 1680000);
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

async function fetchCopyPosition(leaderId) {
    let url = `https://www.traderwagon.com/v1/public/social-trading/lead-portfolio/get-position-info/${leaderId}`;
    let baseResponse = {};
    try {
        baseResponse = await fetch(url);
    } catch (error) {
        console.log(error);
    }
    let response = {}
    if (baseResponse) {
        response = await baseResponse.json();
    }
    if (response.success) {
        if (response.data.length > 0) {
            return response.data;
        } else {
            return []
        }
    } else {
        await log('Fail to fetch lead position')
        return [];
    }
}

function read(file= 'db') {
    try {
        const data = fs.readFileSync(`./${file}.json`, 'utf8');
        // parse JSON string to JSON object
        return JSON.parse(data);
    } catch (err) {
        log(`Error reading file from disk: ${err}`).then(r => {});
    }
}

function write(data = {}, file = 'db') {
    try {
        // convert JSON object to a string
        const raw = JSON.stringify(data, null, 4);
        // write file to disk
        fs.writeFileSync(`./${file}.json`, raw, 'utf8');
    } catch (err) {
        log(`Error writing file: ${err}`).then(r => {});
    }
}

async function log(message) {
    const now = moment().format("DD/MM/YYYY HH:mm:ss");
    await sendMessage(`${now} => ${message}`);
}

async function detectPosition() {
    const coin = await read('coin');
    // lấy vị thế đang có của người dùng
    const myRawPositions = await fetchPositions(coin.symbol);
    // lấy vị thế
    let position = _.nth(myRawPositions, 0);
    if (position && position.positionAmt != 0) {
        position.isCopy = coin.isCopy
        return position;
    }
}

async function setActiveSymbol(symbol, active) {
    let coin = await read('coin');
    coin.isCopy = active;
    write(coin, 'coin')
}

function getTgMessage(ctx, command) {
    return _.replace(_.get(ctx, 'update.message.text'), `/${command}`, '').trim();
}

bot.command('coin', async (ctx) => {
    let coin = await read('coin');
    console.log(coin);
    await sendMessage(coin);
});

bot.command('db', async (ctx) => {
    let db = await read('db');
    await sendMessage(db);
});

bot.command('s', async (ctx) => {
    let value = getTgMessage(ctx, 's');
    let coin = await read('coin');
    coin.symbol = value;
    await write(coin, 'coin');
    await sendMessage(`New symbol is ${value}`);
});

bot.command('min', async (ctx) => {
    let value = getTgMessage(ctx, 'min');
    let coin = await read('coin');
    coin.minAmt = _.toNumber(value);
    await write(coin, 'coin');
    await sendMessage(`New min amount of ${coin.symbol} is ${value}`);
});

bot.command('isCopy', async (ctx) => {
    let value = getTgMessage(ctx, 'isCopy');
    let isCopy = value == '1';
    let coin = await read('coin');
    coin.isCopy = isCopy;
    await write(coin, 'coin');
    await sendMessage(`Copy status set to ${isCopy}`);
});


module.exports = {
    sendMessage, setActiveSymbol, openPositionByType, getSymbols, getMinQty, fetchPositions,
    fetchCopyPosition, read,write, detectPosition, closePositionByType,dcaPositionByType,
    delay};

/**
 * Các trạng thái của danh sách coin
 * W: đang chờ mở vị thế
 * I: đang chờ lệnh DCA, cắt lời, lỗ
 */

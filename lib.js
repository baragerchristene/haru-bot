require('dotenv').config({ path: 'env/live.env' });
const EMA = require('technicalindicators').EMA
const Binance = require("node-binance-api");
const fetch = require("node-fetch");
const WebSocket = require("ws");
const _ = require("lodash");
// const tg = require('./telegram');
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

async function fetchPositions(symbol = '') {
    const risk = await binance.futuresPositionRisk({ symbol });
    return _.filter(risk, (p) => { return p.positionAmt != 0})
}

async function closePositionByType(type, symbol, quantity, close) {
    let result
    if (type == 'LONG') {
        result = await binance.futuresMarketSell(symbol, quantity);
        log(result, `Đóng vị thế ${type}`);
    } else {
        result = await binance.futuresMarketBuy(symbol, quantity);
        log(result, `Đóng vị thế ${type}`);
    }
    // await sendMessage(`${message}: ${JSON.stringify(result)}`);
}

async function dcaPositionByType(type, symbol, quantity) {
    let result
    if (type == 'LONG') {
        result = await binance.futuresMarketBuy(symbol, quantity);
        log(result, `DCA vị thế ${type}`);
    } else {
        result = await binance.futuresMarketSell(symbol, quantity);
        log(result, `DCA vị thế ${type}`);
    }
}

async function openNewPositionByTrend(trend, symbol, quantity) {
    let result
    if (trend == 'UP') {
        result = await binance.futuresMarketBuy(symbol, quantity);
        log(result);
    } else {
        result = await binance.futuresMarketSell(symbol, quantity);
        log(result);
    }
    let message = `New opening position have placed with symbol of ${symbol}`;
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

//

async function sendMessage(message) {
    let encode = JSON.stringify(message)
    let url = `https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage?chat_id=${process.env.GROUP_ID}&text=${encode}`;
    const response = await fetch(url);
    return await response.json();
}

async function sendServerStatus() {
    // await tg.sendServerStatus();
}

function keepAliveServer() {
    setInterval(function () {
        fetch(process.env.PING_URL).then(_r => {});
    }, 1680000);
}


function getTgMessage(ctx, command) {
    return _.replace(_.get(ctx, 'update.message.text'), `/${command}`, '').trim();
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

async function fetchCopyPositions(leaderId) {
    let url = `https://www.traderwagon.com/v1/public/social-trading/lead-portfolio/get-position-info/${leaderId}`;
    const baseResponse = await fetch(url);
    const response = await baseResponse.json();
    if (response.success) {
        const coinTrades = await read('coin');
        const favPositions = _.filter(response.data, (position) => {
            let sameCoin = _.some(coinTrades, (coin) => {return coin.symbol == position.symbol});
            if (sameCoin) return position
        })
        return favPositions;
    } else {
        log('Fail to fetch lead position')
        return [];
    }
}

function read(file= 'db') {
    try {
        const data = fs.readFileSync(`./${file}.json`, 'utf8');
        // parse JSON string to JSON object
        return JSON.parse(data);
    } catch (err) {
        log(`Error reading file from disk: ${err}`);
    }
}

function write(data, file = 'db') {
    try {
        // convert JSON object to a string
        const raw = JSON.stringify(data, null, 4);
        // write file to disk
        fs.writeFileSync(`./${file}.json`, raw, 'utf8');
    } catch (err) {
        log(`Error writing file: ${err}`);
    }
}

function log(data, name) {
    const now = moment().format("DD/MM/YYYY HH:mm:ss");
    const message = `${now} => ${name} `+ JSON.stringify(data) + '\n';
    var stream = fs.createWriteStream("log.txt", {flags:'a'});
    stream.write(message);
    stream.end();
}

async function detectPosition() {
    // lấy all vị thế đang có của người dùng
    const myRawPositions = await fetchPositions();
    // lấy danh sách coin muốn trade
    const coinTrades = await read('coin');
    return _.filter(myRawPositions, (position) => {
        let symbolValues = _.find(coinTrades, {symbol: position.symbol});
        if (!_.isEmpty(symbolValues)) {
            position.isCopy = symbolValues.isCopy;
        }
        return position;
    })
}

async function setActiveSymbol(symbol, active) {
    let coinTrades = await read('coin');
    _.filter(coinTrades, (coin) => {
        if (coin.symbol == symbol) {
            coin.isCopy = active;
        }
        return coin
    })
    write(coinTrades, 'coin')
}


module.exports = {
    checkTrendEMA, sendMessage, sendServerStatus, keepAliveServer,setActiveSymbol,
    fetchCopyPositions, read,write, detectPosition, closePositionByType,dcaPositionByType,
    delay, log, setLeverage, fetchPositions, openNewPositionByTrend, ws_stream, getTgMessage };

/**
 * Các trạng thái của danh sách coin
 * W: đang chờ mở vị thế
 * I: đang chờ lệnh DCA, cắt lời, lỗ
 */

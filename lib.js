require('dotenv').config({ path: 'env/live.env' });
const {sendTeleMessage, bot} = require("./telegram");
const EMA = require('technicalindicators').EMA
const Binance = require("node-binance-api");
const fetch = require("node-fetch");
const moment = require('moment-timezone');;
moment.tz.setDefault("Asia/Ho_Chi_Minh");
const _ = require("lodash");
const fs = require('fs');
const TraderWagonApi = require("./resources/trader-wagon/trader-wagon-api");
const twApi = new TraderWagonApi();
const BinanceApi = require("./resources/binance/binance-api");
const path = require("path");
const bnApi = new BinanceApi();

const binance = new Binance().options({
    APIKEY: process.env.APIKEY,
    APISECRET: process.env.APISECRET,
    // test: true
});

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
    } else {
        await binance.futuresMarketBuy(symbol, quantity);
    }
    await log(`#${symbol} ${close ? 'Đóng' : 'Cắt 1 phần'}  vị thế ${type}`);
}

async function dcaPositionByType(type, symbol, quantity, oldAmt, newAmt, oldEntryPrice, newEntryPrice) {
    if (type == 'LONG') {
        await binance.futuresMarketBuy(symbol, quantity);
    } else {
        await binance.futuresMarketSell(symbol, quantity);
    }
    await log(`#${symbol} DCA vị thế ${type}, số lượng ${quantity} | Source: amount: ${oldAmt} -> ${newAmt}; E: ${oldEntryPrice} -> ${newEntryPrice}`);
}

async function openPositionByType(type, position, quantity, leverage) {
    const symbol = position.symbol;
    await binance.futuresLeverage(symbol, leverage);
    if (type == 'LONG') {
        await binance.futuresMarketBuy(symbol, quantity);
    } else {
        await binance.futuresMarketSell(symbol, quantity);
    }
    await log(`#${symbol}, opening ${type} ${leverage}X | vol: ${quantity} | Source = E: ${position.entryPrice}; vol: ${position.amount}`);
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

async function sendMessage(message) {
    try {
        await sendTeleMessage(message);
    } catch (error) {
        console.log('send message error');
        console.log(error);
    }
}

function keepAliveServer() {
    setInterval(function () {
        fetch(process.env.PING_URL).then(_r => {});
    }, 1680000);
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

async function fetchCopyPosition(leaderId) {
    let response = await twApi.fetchCopyPosition(leaderId);
    if (response.error) {
        let detail = _.get(response, 'detail');
        console.log('Hệ thống đang bận: không lấy được vị thế của leader');
        console.log(detail);
        await delay(5000);
    }
    return response
}

async function fetchLeaderBoardPositions(encryptedUid) {
    let response = await bnApi.fetchFutureLeaderBoardPositionsById(encryptedUid);
    if (response.error) {
        let detail = _.get(response, 'detail');
        await log(detail);
        await delay(5000);
    }
    return response
}

function getLeverageLB(coin) {
    return _.toNumber(Math.abs((coin.roe*(coin.amount*1*coin.markPrice))/coin.pnl).toFixed(0));
}

async function read(file = 'db') {
    try {
        var readStream = fs.createReadStream(path.join(__dirname, `./${file}.json`), 'utf8');
        let raw = ''
        var end = new Promise(function(resolve, reject) {
            readStream.on('data', function (chunk) {
                raw += chunk;
            }).on('end', function () {
                resolve(JSON.parse(raw))
            });
            readStream.on('error', function(err) {
                reject(err)
            });
        });
        const data = await end;
        return data;
    } catch (err) {
        log(`Error reading file from disk: ${err}`).then(r => {
        });
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

function getTgMessage(ctx, command) {
    return _.replace(_.get(ctx, 'update.message.text'), `/${command}`, '').trim();
}

function isMe(ctx) {
    return _.get(ctx, 'update.message.from.id') == process.env.MY_TELE
}

bot.command('ps', async (ctx) => {
    if (!isMe(ctx)) return;
    let positions = await fetchPositions();
    if (!_.isEmpty(positions)) {
        let message = _.reduce(positions, (msg, coin) => {
            let side = coin.positionAmt > 0 ? 'LONG' : 'SHORT';
            let amt = (coin.markPrice*coin.positionAmt).toFixed(3)
            msg+= `${side} ${coin.symbol} ${amt}; E: ${coin.entryPrice}; M: ${coin.markPrice}; uPnl: ${coin.unRealizedProfit}\n`;
            return msg;
        }, '')
        await sendMessage(message);
    } else {
        await sendMessage('Không có vị thế nào!');
    }
});

bot.command('db', async (ctx) => {
    if (!isMe(ctx)) return;
    let coins = await read('db');
    if (!_.isEmpty(coins)) {
        let message = _.reduce(coins, (msg, coin) => {
            let side = coin.positionAmount > 0 ? 'LONG' : 'SHORT';
            let amt = (coin.markPrice*coin.positionAmount).toFixed(3)
            msg+= `${side} ${coin.symbol} ${amt}; LE: ${coin.entryPrice}; Mark: ${coin.markPrice}; uPnl: ${coin.unrealizedProfit}\n`;
            return msg;
        }, '')
        await sendMessage(message);
    } else {
        await sendMessage('Không có dữ liệu lịch sử');
    }
});

bot.command('db2', async (ctx) => {
    if (!isMe(ctx)) return;
    let coins = await read('db');
    if (!_.isEmpty(coins)) {
        let message = _.reduce(coins, (msg, coin) => {
            let side = coin.amount > 0 ? 'LONG' : 'SHORT';
            let amt = (coin.markPrice*coin.amount).toFixed(3)
            msg+= `${side} ${coin.symbol} ${amt}; LE: ${coin.entryPrice}; Mark: ${coin.markPrice}; uPnl: ${coin.pnl}\n`;
            return msg;
        }, '')
        await sendMessage(message);
    } else {
        await sendMessage('Không có dữ liệu lịch sử');
    }
});

bot.command('pnl', async (ctx) => {
    if (!isMe(ctx)) return;
    let positions = await fetchPositions();
    let pnl = 0;
    if (!_.isEmpty(positions)) {
        pnl = _.reduce(positions, (result, coin) => {
            result += _.toNumber(coin.unRealizedProfit);
            return result;
        }, 0)
    }
    await sendMessage(`Current uPNL total ${pnl.toFixed(3)}`);
});


module.exports = {
    sendMessage, openPositionByType, getSymbols, getMinQty, fetchPositions,
    fetchCopyPosition, read,write, detectPosition, closePositionByType,dcaPositionByType,
    delay, fetchLeaderBoardPositions, getLeverageLB};

require('dotenv').config({ path: 'env/live.env' });
const {sendMessage, log} = require("./telegram");
const EMA = require('technicalindicators').EMA
const fetch = require("node-fetch");
const _ = require("lodash");
const TraderWagonApi = require("./resources/trader-wagon/trader-wagon-api");
const twApi = new TraderWagonApi();
const BinanceApi = require("./resources/binance/binance-api");
const bnApi = new BinanceApi();
const {binance, fetchPositions} = require('./resources/binance/utils');
var ctx = require('./context');

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

async function detectPosition() {
    const coin = ctx.positions;
    // lấy vị thế đang có của người dùng
    const myRawPositions = await fetchPositions(coin.symbol);
    // lấy vị thế
    let position = _.nth(myRawPositions, 0);
    if (position && position.positionAmt != 0) {
        position.isCopy = coin.isCopy
        return position;
    }
}

module.exports = {
    sendMessage, openPositionByType, getSymbols, getMinQty, fetchPositions,
    closePositionByType,dcaPositionByType, delay, fetchLeaderBoardPositions, getLeverageLB};

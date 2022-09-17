require('dotenv').config({ path: 'env/live.env' });
const {sendMessage, log} = require("./telegram");
const EMA = require('technicalindicators').EMA
const fetch = require("node-fetch");
const _ = require("lodash");
const TraderWagonApi = require("./resources/trader-wagon/trader-wagon-api");
const twApi = new TraderWagonApi();
const BinanceApi = require("./resources/binance/binance-api");
const bnApi = new BinanceApi();
const {binance, fetchPositions, getSymbols, fetchPositionBySymbol} = require('./resources/binance/utils');
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

async function closePositionByType(type, position, quantity, close = false) {
    let symbol = position.symbol;
    if (type == 'LONG') {
        await binance.futuresMarketSell(symbol, quantity);
    } else {
        await binance.futuresMarketBuy(symbol, quantity);
    }
    await log(`#${symbol} ${close ? 'Đóng' : 'Cắt 1 phần'} vị thế ${type}; Last uPnl: ${position.unRealizedProfit}`);
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
    let result = {}
    if (type == 'LONG') {
        result = await binance.futuresMarketBuy(symbol, quantity);
    } else {
        result = await binance.futuresMarketSell(symbol, quantity);
    }
    await log(`#${symbol}, opening ${type} ${leverage}X | vol: ${quantity} | Source = E: ${position.entryPrice}; vol: ${position.amount}`);
    await delay(3000);
    await sendMessage(result);
}

function getMinQty(coin, exchanges) {
    let assert = _.find(exchanges, {symbol: coin.symbol});
    let minQtyMinusFee = _.max([assert.lotSize, assert.notional/coin.markPrice]);
    let countNumber = numDigitsAfterDecimal(assert.lotSize);
    return (minQtyMinusFee*(1 + 0.05)).toFixed(countNumber);
}

function getMinQtyU(coin, exchanges, leverage) {
    let assert = _.find(exchanges, {symbol: coin.symbol});
    let countNumber = numDigitsAfterDecimal(assert.lotSize);
    return ((Number(process.env.MIN_X)/coin.markPrice)*leverage).toFixed(countNumber);
}

function numDigitsAfterDecimal(x) {
	var afterDecimalStr = x.toString().split('.')[1] || '';
	return afterDecimalStr.length;
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

function getAmountChange(position, filterSymbols, amountChangeRate) {
    let myAmt = Math.abs(position.positionAmt); // khối lượng của tôi
    let fraction = numDigitsAfterDecimal(myAmt);
    let amountChange = Math.abs(myAmt * amountChangeRate).toFixed(fraction);
    let minAmt = getMinQty(position, filterSymbols);
    let multiplier = Math.round(amountChange/minAmt); // lấy bội số vs min
    let multiplierOrigin = Math.round(myAmt/minAmt); // lấy bội số vs min
    if (multiplier >= 1) {
        amountChange = Number((minAmt*multiplier).toFixed(fraction));
    } else {
        if (multiplierOrigin > 1) {
            amountChange = minAmt;
        } else {
            amountChange = myAmt;
        }
    }
    return amountChange;
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

function kFormatter(num) {
    return Math.abs(num) > 999 ? Math.sign(num) * ((Math.abs(num) / 1000).toFixed(1)) + 'K' : Math.sign(num) * Math.abs(num)
}

module.exports = {
    sendMessage, openPositionByType, getSymbols, getMinQty, getMinQtyU, fetchPositions, numDigitsAfterDecimal,
    fetchPositionBySymbol, kFormatter,
    closePositionByType,dcaPositionByType, delay, fetchLeaderBoardPositions, getLeverageLB, getAmountChange};

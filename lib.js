require('dotenv').config({ path: 'env/live.env' });
const {sendMessage, log} = require("./telegram");
const EMA = require('technicalindicators').EMA
const ADX = require('technicalindicators').ADX
const MACD = require('technicalindicators').MACD
const RSI = require('technicalindicators').RSI
const IchimokuCloud = require('technicalindicators').IchimokuCloud
const fetch = require("node-fetch");
const _ = require("lodash");
const TraderWagonApi = require("./resources/trader-wagon/trader-wagon-api");
const twApi = new TraderWagonApi();
const BinanceApi = require("./resources/binance/binance-api");
const bnApi = new BinanceApi();
const {binance, fetchPositions, getSymbols, fetchPositionBySymbol, getBalance} = require('./resources/binance/utils');
var ctx = require('./context');
const moment = require("moment-timezone");
const {FasterDEMA} = require("trading-signals");
moment.tz.setDefault("Asia/Ho_Chi_Minh");

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

async function OCC(symbol, frame) {
    let latestCandles = await binance.futuresCandles(symbol, frame, {limit: 1500});
    latestCandles.pop();
    let openSeries  = new FasterDEMA(10);
    let closeSeries = new FasterDEMA(10);

    let macdInput = {
        values            : [],
        fastPeriod        : 12,
        slowPeriod        : 26,
        signalPeriod      : 10,
        SimpleMAOscillator: false,
        SimpleMASignal    : false
    }

    _.filter(latestCandles, (candle) => {
        openSeries.update(_.toNumber(candle[1]));
        closeSeries.update(_.toNumber(candle[4]));
        macdInput.values.push(_.toNumber(candle[4]));
    })

    let macd = MACD.calculate(macdInput);

    return {
        trend: closeSeries.getResult() > openSeries.getResult() ? 'LONG' : 'SHORT',
        realTrend: macd[macd.length - 1].histogram > 0 ? 'LONG' : 'SHORT'
    }
}

async function revertOCC(symbol, frame) {
    let latestCandles = await binance.futuresCandles(symbol, frame, {limit: 1500});
    latestCandles.pop();
    let openSeries  = new FasterDEMA(10);
    let closeSeries = new FasterDEMA(10);

    let macdInput = {
        values            : [],
        fastPeriod        : 12,
        slowPeriod        : 26,
        signalPeriod      : 10,
        SimpleMAOscillator: false,
        SimpleMASignal    : false
    }

    _.filter(latestCandles, (candle) => {
        openSeries.update(_.toNumber(candle[1]));
        closeSeries.update(_.toNumber(candle[4]));
        macdInput.values.push(_.toNumber(candle[4]));
    })

    let macd = MACD.calculate(macdInput);

    return {
        trend: closeSeries.getResult() > openSeries.getResult() ? 'LONG' : 'SHORT',
        realTrend: macd[macd.length - 1].histogram > 0 ? 'SHORT' : 'LONG'
    }
}

async function getRSI(symbol, interval) {
    const latestCandles = await binance.futuresCandles(symbol, interval, { limit: 1500 });
    let values = _.reduce(latestCandles, (result, value) => {
        result.push(_.toNumber(_.nth(value, 4))); return result;
    }, [])
    let rsiInput = {
        values: values,
        period: 14,
    }
    const rs = RSI.calculate(rsiInput)
    return _.nth(rs, rs.length - 1);
}

async function getSide(symbol) {
    const latestCandles = await binance.futuresCandles(symbol, '1m', {limit: 2});
    return Number(latestCandles[0][4]) > Number(latestCandles[0][1]) ? 'LONG' : 'SHORT';
}

async function closePositionByType(type, position, quantity, close = false) {
    let symbol = position.symbol;
    if (type == 'LONG') {
        await binance.futuresMarketSell(symbol, quantity);
    } else {
        await binance.futuresMarketBuy(symbol, quantity);
    }
    ctx.profit+= Number(position.unRealizedProfit);
    if (position.unRealizedProfit > 0) {
        ctx.occO[symbol].tp++;
    } else ctx.occO[symbol].sl++;
    await log(`#${symbol} ${close ? 'Đóng' : 'Cắt 1 phần'} vị thế ${type}\nLast uPnl: ${position.unRealizedProfit} | ${(roe(position)*100).toFixed(2)}% | ${position.unRealizedProfit > 0 ? '#LÃI' : '#LỖ'} | Total: ${ctx.profit}`);
}

async function dcaPositionByType(type, symbol, quantity, oldAmt, newAmt, oldEntryPrice, newEntryPrice) {
    if (ctx.inverseCopy) { // trade ngược thì không DCA
        await log(`#${symbol} Inverse DCA vị thế ${type}, số lượng ${quantity} | Source: amount: ${oldAmt} -> ${newAmt}; E: ${oldEntryPrice} -> ${newEntryPrice}`);
        return;
    }
    if (type == 'LONG') {
        await binance.futuresMarketBuy(symbol, quantity);
    } else {
        await binance.futuresMarketSell(symbol, quantity);
    }
    await log(`#${symbol} DCA vị thế ${type}, số lượng ${quantity} | Source: amount: ${oldAmt} -> ${newAmt}; E: ${oldEntryPrice} -> ${newEntryPrice}`);
}

async function openPositionByType(type, position, quantity, leverage, isDca) {
    const symbol = position.symbol;
    // await binance.futuresLeverage(symbol, leverage);
    let result = {}
    if (ctx.inverseCopy) { // chức năng trade ngược
        type == 'LONG' ? type = 'SHORT' : type = 'LONG';
    }
    if (type == 'LONG') {
        result = await binance.futuresMarketBuy(symbol, quantity);
    } else {
        result = await binance.futuresMarketSell(symbol, quantity);
    }
    const rawPosition = await fetchPositionBySymbol(symbol);
    if (!_.isEmpty(rawPosition)) {
        const ps = rawPosition[0];
        const direction = ps.positionAmt > 0 ? 'LONG' : 'SHORT';
        const margin = ((ps.positionAmt*ps.markPrice)/ps.leverage).toFixed(2);
        let message = '';
        if (isDca) {
            message = `#${symbol}, DCA vị thế: ${direction} | ${ps.leverage}X\n`
                + `Size: ${ps.positionAmt} ${symbol}, Margin: ${margin}USDT\n`
                + `Entry: ${position.entryPrice}->${ps.entryPrice}, Mark: ${ps.markPrice}`;
        } else {
            message = `#${symbol}, Mở vị thế: ${direction} | ${ps.leverage}X\n`
                + `Size: ${ps.positionAmt} ${symbol}, Margin: ${margin}USDT\n`
                + `Entry: ${ps.entryPrice}, Mark: ${ps.markPrice}\n`
                + `Extra: ${position.message}`;
        }
        await log(message);
    } else {
        await log(`Mở vị thế không thành công! ${symbol} ${quantity}`);
    }
    if (result.code) {
        await delay(3000);
        await sendMessage(result); // send error response
    }
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
    return ((Number(ctx.minX)/coin.markPrice)*leverage).toFixed(countNumber);
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
        await log(detail);
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
    let leverage = _.toNumber(Math.abs((coin.roe*(coin.amount*1*coin.markPrice))/coin.pnl).toFixed(0));
    if (leverage > 0) {
        return leverage
    } else return 10;
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

function roe(position) {
    let uPnlUSDT = 0;
    if (position.positionAmt > 0) {
        uPnlUSDT = position.positionAmt*(position.markPrice - position.entryPrice);
    } else if (position.positionAmt < 0) {
        uPnlUSDT = position.positionAmt*(-1)*(position.markPrice - position.entryPrice);
    }
    let entryMargin = position.positionAmt*position.markPrice*(1/position.leverage);
    return uPnlUSDT/entryMargin;
}

module.exports = {
    sendMessage, openPositionByType, getSymbols, getMinQty, getMinQtyU, fetchPositions, numDigitsAfterDecimal,
    fetchPositionBySymbol, kFormatter, roe, getSide, getRSI, fetchCopyPosition, OCC, getBalance, revertOCC,
    closePositionByType,dcaPositionByType, delay, fetchLeaderBoardPositions, getLeverageLB, getAmountChange};


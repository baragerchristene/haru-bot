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
const SuperTrend = require("supertrend-indicator");
const fs = require('fs');

function read(file= 'config') {
    try {
        const data = fs.readFileSync(`./${file}.json`, 'utf8');
        // parse JSON string to JSON object
        return JSON.parse(data);
    } catch (err) {
        log(`Error reading file from disk: ${err}`).then(r => {});
    }
}

function write(data = {}, file = 'config') {
    try {
        // convert JSON object to a string
        const raw = JSON.stringify(data, null, 4);
        // write file to disk
        fs.writeFileSync(`./${file}.json`, raw, 'utf8');
    } catch (err) {
        log(`Error writing file: ${err}`).then(r => {});
    }
}

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

async function getSuperTrend(symbol, frame) {
    let inputST = [];
    let latestCandles = await binance.futuresCandles(symbol, frame, {limit: 1500});
    latestCandles.pop();
    _.filter(latestCandles, (candle) => {
        let input =  { high: Number(candle[2]), low: Number(candle[3]), close: Number(candle[4]) }
        inputST.push(input)
    })
    let trends = SuperTrend(inputST, 1, 10) // 2 is multiplier, 10 is atr period/length
    let direction = _.get(trends[trends.length - 1], 'trendDirection');
    if (direction == 1)  return 'LONG'
    if (direction == -1) return 'SHORT'
    return ''
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
    let result = {};
    let direction = 0;
    if (type == 'LONG') {
        result = await binance.futuresMarketSell(symbol, quantity, { newOrderRespType: 'RESULT' });
        direction = 1;
    } else {
        result = await binance.futuresMarketBuy(symbol, quantity, { newOrderRespType: 'RESULT' });
        direction = -1;
    }
    if (!_.isEmpty(result) && result.status == 'FILLED') {
        let amount = Math.abs(position.positionAmt);
        position.markPrice = _.toNumber(result.avgPrice);
        let closeRate = `${((quantity/amount)*100).toFixed(0)}%`;
        let uPnl = direction*quantity*(result.avgPrice - position.entryPrice);
        let fee = quantity*result.avgPrice*0.0006;
        let pnl = uPnl - fee;
        ctx.profit+= pnl;
        let msg = `${pnl > 0 ?'🟢':'🔴'} #${symbol}, ${close ? 'closed' : `closed ${closeRate}`} ${type}\n` +
            `Closing Price: ${result.avgPrice}\n` +
            `Final PNL: ${pnl.toFixed(2)} | ${(roe(position)*100).toFixed(2)}% | ${pnl > 0 ? '#TP' : '#SL'}\n` +
            `Total PNL: ${ctx.profit.toFixed(2)}\n`;
        log(msg);
    } else {
        let msg = `⚠ Đóng vị thế không thành công!\nNhập /xa ${symbol} để đóng lệnh hoặc tự đóng thủ công bằng app`;
        msg+= `\nSymbol: ${symbol}\nSize: ${quantity}`;
        if (result.code) {
            msg+= `\nCode: ${result.code}\nMessage: ${result.msg}`;
        }
        log(msg).then();
        console.log(result);
    }
}

async function dcaPositionByType(type, symbol, quantity, oldAmt, newAmt, oldEntryPrice, newEntryPrice) {
    if (type == 'LONG') {
        await binance.futuresMarketBuy(symbol, quantity);
    } else {
        await binance.futuresMarketSell(symbol, quantity);
    }
    log(`#${symbol}, DCA ${type}, Amount: ${quantity}\nChange: ${oldAmt} -> ${newAmt}\nEntry: ${oldEntryPrice} -> ${newEntryPrice}`).then();
}

async function openPositionByType(type, position, quantity, leverage, isDCA, isInvertTrading) {
    const symbol = position.symbol;
    if (!isDCA) {
        await binance.futuresLeverage(symbol, leverage);
    }
    let result = {}
    if (isInvertTrading) { // chức năng trade ngược
        type == 'LONG' ? type = 'SHORT' : type = 'LONG';
    }
    if (type == 'LONG') {
        result = await binance.futuresMarketBuy(symbol, quantity, { newOrderRespType: 'RESULT' });
    } else {
        result = await binance.futuresMarketSell(symbol, quantity, { newOrderRespType: 'RESULT' });
    }

    if (!_.isEmpty(result) && result.status == 'FILLED') {
        let avgPrice = Number(result.avgPrice);
        const margin = ((quantity*avgPrice)/leverage).toFixed(2);
        let symbolQ = symbol.replace('USDT', '');
        let message = ''

        if (isDCA) {
            let oldAmount = Math.abs(position.positionAmt);
            let newEntry = (oldAmount*position.entryPrice + quantity*avgPrice)/(oldAmount + quantity)
            message = `#${symbol}, DCA ${type} | ${leverage}X\n`
                + `Size: ${quantity} ${symbolQ}(${((quantity/oldAmount)*100).toFixed(2)}%)\n`
                + `Margin: ${margin} USDT\n`
                + `Entry: ${isDCA ? `${newEntry}` : avgPrice}\n`
        } else {
            message = `#${symbol}, Open ${type} | ${leverage}X\n`
                + `Size: ${quantity} ${symbolQ}\n`
                + `Margin: ${margin} USDT\n`
                + `Entry: ${avgPrice}\n`;
        }
        log(message).then();
        autoSetTpByRoe(symbol).then();
        setInverterTP(isInvertTrading, type, symbol, avgPrice, quantity, leverage).then();
    } else {
        let msg = `⚠ ${isDCA ? 'DCA': 'Mở vị thế'} không thành công!`;
        msg+= `\nSymbol: ${symbol}\nSize: ${quantity}`;
        if (result.code) {
            msg+= `\nCode: ${result.code}\nMessage: ${result.msg}`;
        }
        log(msg).then();
        console.log(result);
    }
}

async function autoSetTpByRoe(symbol) {
    if (!ctx.autoTP) return;
    let rawPosition = await fetchPositionBySymbol(symbol);
    let position = {};
    if (_.isEmpty(rawPosition)) {
        return; // Vị thế không tồn tại để TP/SL
    }
    position = rawPosition[0];
    let side = position.positionAmt > 0 ? 'LONG': 'SHORT';
    let leverage = position.leverage;
    let quantity = Math.abs(position.positionAmt);
    let entryPrice = _.toNumber(position.entryPrice);
    let openOrders = await binance.futuresOpenOrders(symbol);
    let orderType = 'TAKE_PROFIT_MARKET';
    _.filter(openOrders, async (order) => {
        if (order.type == orderType) {
            await binance.futuresCancel(symbol, {orderId: order.orderId});
        }
    })
    let tpResult = {}
    let stopPrice = getPriceByRoe(entryPrice, quantity, leverage, ctx.tp, side);
    if (side == 'LONG') {
        tpResult = await binance.futuresMarketSell(symbol, quantity, {stopPrice: stopPrice, reduceOnly: true, type: orderType, timeInForce: 'GTE_GTC', workingType: 'MARK_PRICE'});
    } else {
        tpResult = await binance.futuresMarketBuy(symbol, quantity, {stopPrice: stopPrice, reduceOnly: true, type: orderType, timeInForce: 'GTE_GTC', workingType: 'MARK_PRICE'});
    }
    console.log(tpResult);
    log(`#${symbol}, Updated TP at ${stopPrice}`).then();
}

async function setInverterTP(isInvertTrading, type, symbol, avgPrice, quantity, leverage) {
    if (isInvertTrading) { // nếu là trade ngược thì đặt sẵn TP
        let openOrders = await binance.futuresOpenOrders(symbol);
        let orderType = 'TAKE_PROFIT_MARKET';
        _.filter(openOrders, async (order) => {
            if (order.type == orderType) {
                await binance.futuresCancel(symbol, {orderId: order.orderId});
            }
        })
        let tpResult = {}
        let stopPrice = getPriceByRoe(avgPrice, quantity, leverage, ctx.itp, type);
        if (type == 'LONG') {
            tpResult = await binance.futuresMarketSell(symbol, quantity, {stopPrice: stopPrice, reduceOnly: true, type: orderType, timeInForce: 'GTE_GTC', workingType: 'MARK_PRICE'});
        } else {
            tpResult = await binance.futuresMarketBuy(symbol, quantity, {stopPrice: stopPrice, reduceOnly: true, type: orderType, timeInForce: 'GTE_GTC', workingType: 'MARK_PRICE'});
        }
        console.log(tpResult);
        log(`#${symbol}, Updated TP for Invert Trading at ${stopPrice}`).then();
    }
}

function getMinQty(filterSymbols, coin) {
    let assert = _.find(filterSymbols, {symbol: coin.symbol});
    if (_.isEmpty(assert)) {
        console.log(`Can't find assert for ${coin.symbol}`)
        console.log(filterSymbols.length);
        return 0;
    }
    let minQtyMinusFee = _.max([assert.lotSize, assert.notional/coin.markPrice]);
    let countNumber = numDigitsAfterDecimal(assert.lotSize);
    return (minQtyMinusFee*(1 + 0.05)).toFixed(countNumber);
}

function getMinQtyU(filterSymbols, coin, leverage) {
    let assert = _.find(filterSymbols, {symbol: coin.symbol});
    if (_.isEmpty(assert)) {
        console.log(`Can't find assert for ${coin.symbol}`)
        console.log(filterSymbols.length);
        console.log(filterSymbols);
        return 0;
    }
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
        console.log(detail);
        await delay(5000);
    }
    return response
}

async function fetchLeaderBoardPositions(encryptedUid) {
    let response = await bnApi.fetchFutureLeaderBoardPositionsById(encryptedUid);
    if (response.error) {
        let detail = _.get(response, 'detail');
        console.log(detail);
        await delay(5000);
    }
    return response
}

function getAmountChange(filterSymbols, position, amountChangeRate) {
    let myAmt = Math.abs(position.positionAmt); // khối lượng của tôi
    let fraction = numDigitsAfterDecimal(myAmt);
    let amountChange = Math.abs(myAmt * amountChangeRate).toFixed(fraction);
    let minAmt = getMinQty(filterSymbols, position);
    let multiplier = Math.round(amountChange/minAmt); // lấy bội số vs min
    let multiplierOrigin = Math.round(myAmt/minAmt); // lấy bội số vs min
    if (multiplier >= 1) {
        amountChange = Number((minAmt*multiplier).toFixed(fraction));
    } else {
        if (multiplierOrigin > 1) {
            amountChange = minAmt*2;
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

function getPriceByRoe(entry, quantity, leverage, roe, side) {
    let entryPrice;
    if (side == 'LONG') {
        entryPrice = entry/(1 - (roe*(1/leverage)));
    } else {
        entryPrice = (-1)*entry/(-1 - (roe*(1/leverage)));
    }
    let fixedNumber = numDigitsAfterDecimal(entry)
    return Number(entryPrice.toFixed(fixedNumber))
}

async function getAllOpenOrders() {
    let openOrders = await binance.futuresOpenOrders();
    return openOrders;
}

async function welcome() {
    const now = moment().format("HH:mm:ss DD/MM/YYYY");
    let msg = `♻️BOT #STARTED: ${now}\n♻️Production: ${process.env.PROD}`;
    console.log(msg);
    sendMessage(msg);
}


module.exports = {
    sendMessage, openPositionByType, getSymbols, getMinQty, getMinQtyU, fetchPositions, numDigitsAfterDecimal,
    fetchPositionBySymbol, kFormatter, roe, getSide, getRSI, fetchCopyPosition, OCC, getBalance, revertOCC,
    getSuperTrend, getAllOpenOrders, welcome, read, write,
    closePositionByType,dcaPositionByType, delay, fetchLeaderBoardPositions, getLeverageLB, getAmountChange};


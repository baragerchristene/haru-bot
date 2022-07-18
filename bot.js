const lib = require("./lib");
const tele = require("./telegram").bot;
const _ = require("lodash");
const log = lib.log;
const getTgMessage = lib.getTgMessage;
const sendMessage = lib.sendMessage;

let oldTrend; let newTrend;
let leverage = 20;
let quantity = 0.001;
let symbol = 'BTCUSDT';
let smallLimit = 34;
let largeLimit = 89;
let running = false;
let frame = '1h';

async function start() {
    log('server started');
//     await init();
//     await lib.ws_stream(messageHandler)
}

async function messageHandler(message) {
    if (!running) return;

    newTrend = await lib.checkTrendEMA(symbol, frame, smallLimit, largeLimit);
    let trendName = newTrend == 'UP' ? 'Uptrend' : 'Downtrend';

    if (newTrend == oldTrend) {
        log(`Nothing changes, current trend of ${symbol} is ${trendName}.`)
        await lib.delay(1000);
        return;
    }
    // when trend break out(the current trend is different from last trend)

    // set leverage
    const futuresLeverage = await lib.setLeverage(symbol, leverage);
    log(JSON.stringify(futuresLeverage));

    // check the open position; if existed, close the old position first(old trend)
    let haveOpenPosition = await lib.havePosition(symbol);
    if (haveOpenPosition) { // close the open position
        await lib.openNewPositionByTrend(newTrend, symbol, quantity, true);
    }

    // place new order for the new trend
    await lib.openNewPositionByTrend(newTrend, symbol, quantity);

    // update the latest trend
    oldTrend = newTrend;
    // rest time 1
    await lib.delay(1000);
}

async function init() { // init the trend
    newTrend = await lib.checkTrendEMA(symbol, frame, smallLimit, largeLimit);
    oldTrend = newTrend;
    log(`The latest trend of ${symbol} on EMA${smallLimit}&${largeLimit} is ${newTrend}`);
    await telegramInit();
}

async function telegramInit() {
    tele.command('s', (ctx) => {
        let value = getTgMessage(ctx, 's');
        symbol = value.toUpperCase();
        sendMessage(`New symbol is ${symbol}`);
    });
    tele.command('q', (ctx) => {
        let value = getTgMessage(ctx, 'q');
        quantity = _.toNumber(value);
        sendMessage(`New quantity is ${quantity}`);
    });
    tele.command('l', (ctx) => {
        let value = getTgMessage(ctx, 'l');
        leverage = _.toNumber(value);
        sendMessage(`New leverage is ${leverage}`);
    });
    tele.command('run', (ctx) => {
        running = getTgMessage(ctx, 'run') == '1';
        sendMessage(`BOT: ${running == '1' ? 'ON': 'OFF'}`);
    });
    tele.command('status', (ctx) => {
        showValues();
    });
    tele.command('small', async (ctx) => {
        smallLimit = _.toNumber(getTgMessage(ctx, 'small'));
        await lib.sendMessage(`new small ema limit is ${smallLimit}`);
    });
    tele.command('large', async (ctx) => {
        largeLimit = _.toNumber(getTgMessage(ctx, 'large'));
        await lib.sendMessage(`new small ema limit is ${smallLimit}`);
    });
    tele.command('ema', async (ctx) => {
        let trend = await lib.checkTrendEMA(symbol, frame, smallLimit, largeLimit);
        await lib.sendMessage(`EMA${smallLimit}/EMA${largeLimit} ${symbol} ${frame}: ${trend}`);
    });

    tele.command('reset', async (ctx) => {
        leverage = 20;
        quantity = 0.001;
        symbol = 'BTCUSDT';
        smallLimit = 34;
        largeLimit = 89;
        running = false;
        await lib.sendMessage(`All values was reset to default!`);
    });
}

async function showValues() {
    await sendMessage(`Current value| symbol: ${symbol}; quantity: ${quantity}; leverage: ${leverage}; running: ${running}; smallEMA: ${smallLimit}; largeEMA: ${largeLimit}`);
}

module.exports = { start };

const lib = require("./lib");
const tele = require("./telegram").bot;
const _ = require("lodash");
const log = lib.log;

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
    await init();
    await scan();
}

async function init() { // init the trend
    newTrend = await lib.checkTrendEMA(symbol, frame, smallLimit, largeLimit);
    oldTrend = newTrend;
    log(`The latest trend of ${symbol} on EMA${smallLimit}&${largeLimit} is ${newTrend}`);
    await telegramInit();
}

async function scan() {
    while(running) {
        // check the latest trend
        newTrend = await lib.checkTrendEMA(symbol, frame, smallLimit, largeLimit);
        let trendName = newTrend == 'UP' ? 'Uptrend' : 'Downtrend';

        if (newTrend == oldTrend) {
            log(`Nothing changes, current trend of ${symbol} is ${trendName}.`)
            await lib.delay(1000);
            continue;
        }
        // when trend break out(the current trend is different from last trend)

        // set leverage
        const futuresLeverage = await lib.setLeverage(symbol, leverage);
        log(JSON.stringify(futuresLeverage));

        // check the open position; if existed, close the old position first(old trend)
        let haveOpenPosition = await lib.havePosition(symbol);
        if (haveOpenPosition) {
            await lib.closePositionByTrend(oldTrend, symbol, quantity);
        }

        // place new order for the new trend
        await lib.openNewPositionByTrend(newTrend, symbol, quantity)

        // update the latest trend
        oldTrend = newTrend;
        // rest time 1
        await lib.delay(1000);
    }
}

async function telegramInit() {
    tele.command('s', (ctx) => {
        let value = getTgMessage(ctx, 's');
        symbol = value.toUpperCase();
        showValues();
    });
    tele.command('q', (ctx) => {
        let value = getTgMessage(ctx, 'q');
        quantity = _.toNumber(value);
        showValues()
    });
    tele.command('l', (ctx) => {
        let value = getTgMessage(ctx, 'l');
        leverage = _.toNumber(value);
        showValues()
    });
    tele.command('run', (ctx) => {
        running = getTgMessage(ctx, 'run') == '1';
        showValues();
    });
}

async function showValues() {
    await lib.sendMessage(`Current value| symbol: ${symbol}; quantity: ${quantity}; leverage:${leverage}; running: ${running}`)
}

function getTgMessage(ctx, command) {
    return _.replace(_.get(ctx, 'update.message.text'), `/${command}`, '').trim();
}

module.exports = { start };

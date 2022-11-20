const Binance = require("node-binance-api");
const _ = require("lodash");

var binance;
if (process.env.PROD == "true") {
    binance = new Binance().options({
        APIKEY: process.env.APIKEY,
        APISECRET: process.env.APISECRET,
    });
}
else {
    binance = new Binance().options({
        APIKEY: process.env.APIKEY,
        APISECRET: process.env.APISECRET,
        test: true
    });
}

async function fetchPositions() {
    const risk = await binance.futuresPositionRisk();
    if (_.isArray(risk) && !_.isEmpty(risk)) {
        return _.filter(risk, (p) => { return p.positionAmt != 0})
    } else return [];
}
async function fetchPositionBySymbol(symbol) {
    const risk = await binance.futuresPositionRisk({symbol});
    return _.filter(risk, (p) => { return p.positionAmt != 0})
}

async function getSymbols() {
    const exchangeInfo = await binance.futuresExchangeInfo();
    let customSymbols = [];
    _.filter(exchangeInfo.symbols, (symbol) => {
        let newSymbol = {};
        newSymbol.symbol = symbol.symbol;
        _.filter(symbol.filters, (filter) => {
            if (filter.filterType == 'LOT_SIZE') {
                newSymbol.lotSize = filter.stepSize;
            }
            if (filter.filterType == 'MIN_NOTIONAL') {
                newSymbol.notional = filter.notional
            }
        })
        customSymbols.push(newSymbol)
    })
    return customSymbols
}

async function getMarkPrice(symbol) {
    const coin = await binance.futuresPositionRisk({symbol});
    if (!_.isEmpty(coin) && _.isArray(coin)) {
        return _.nth(coin, 0);
    }
    return {}
}

async function getBalance() {
    const balances = await binance.futuresBalance();
    const usdt = _.find(balances, {asset: 'USDT'})

    return (_.toNumber(_.get(usdt, 'balance'))).toFixed(2);
}

module.exports = {binance, fetchPositions, getSymbols, fetchPositionBySymbol, getMarkPrice, getBalance}

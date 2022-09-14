const Binance = require("node-binance-api");
const _ = require("lodash");

const binance = new Binance().options({
    APIKEY: process.env.APIKEY,
    APISECRET: process.env.APISECRET,
    // test: true
});

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

async function getMarkPrice(symbol) {
    const coin = await binance.futuresPositionRisk({symbol});
    if (!_.isEmpty(coin) && _.isArray(coin)) {
        return _.nth(coin, 0);
    }
    return {}
}

module.exports = {binance, fetchPositions, getSymbols, fetchPositionBySymbol, getMarkPrice}

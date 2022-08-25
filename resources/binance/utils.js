const Binance = require("node-binance-api");
const _ = require("lodash");

const binance = new Binance().options({
    APIKEY: process.env.APIKEY,
    APISECRET: process.env.APISECRET,
    // test: true
});

async function fetchPositions() {
    const risk = await binance.futuresPositionRisk();
    return _.filter(risk, (p) => { return p.positionAmt != 0})
}

module.exports = {binance, fetchPositions}

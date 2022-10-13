var positions = [];
var myPositions = [];
var trigger = true;
var liquidTrade = false;
var autoTP = false;
var autoCopy = false;
var occ = false;
var copyID = '';
var lastLiquid = {};
var minTP = 5;
var minX = 1;
var occQ = [
    {symbol: 'BTCUSDT',   quantity: 0.003, running: false},
    {symbol: 'ETHUSDT',   quantity: 0.05,  running: false},
    {symbol: 'XRPUSDT',   quantity: 50,    running: false},
    {symbol: 'BNBUSDT',   quantity: 0.2,   running: false},
    {symbol: 'MATICUSDT', quantity: 30,    running: false},
    {symbol: 'TRXUSDT',   quantity: 400,   running: false},
];
var occO = {};
var occS = 'BTCUSDT';
var inverseCopy = false;
var ignoreCoins = ['BTCUSDT', 'ETHUSDT', 'XRPUSDT', 'BNBUSDT', 'MATICUSDT', 'TRXUSDT'];
var lastBalance = 0;
module.exports = {
    positions: positions,
    myPositions: myPositions,
    trigger: trigger,
    liquidTrade: liquidTrade,
    autoTP: autoTP,
    autoCopy: autoCopy,
    lastLiquid: lastLiquid,
    minTP: minTP,
    copyID: copyID,
    minX: minX,
    inverseCopy: inverseCopy,
    ignoreCoins: ignoreCoins,
    occ: occ,
    occQ: occQ,
    occS: occS,
    lastBalance: lastBalance,
    occO: occO
}

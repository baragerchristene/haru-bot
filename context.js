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
    {symbol: 'SOLUSDT',   quantity: 1,     running: true, tp: 0, sl: 0},
    {symbol: 'NEARUSDT',  quantity: 3,     running: true, tp: 0, sl: 0},
    {symbol: 'EOSUSDT',   quantity: 6,     running: true, tp: 0, sl: 0},
    {symbol: 'BALUSDT',   quantity: 1,     running: true,  tp: 0, sl: 0},
    {symbol: 'CHZUSDT',   quantity: 30,    running: true, tp: 0, sl: 0},
    {symbol: 'AXSUSDT',   quantity: 1,     running: true, tp: 0, sl: 0},
    {symbol: 'LTCUSDT',   quantity: 0.1,   running: true, tp: 0, sl: 0},
];
var occO = {};
var occS = 'BTCUSDT';
var inverseCopy = false;
// var ignoreCoins = ['BTCUSDT', 'SOLUSDT', 'NEARUSDT'];
var ignoreCoins = ['BTCUSDT'];
var lastBalance = 0;
var profit = 0;
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
    occO: occO,
    profit: profit
}

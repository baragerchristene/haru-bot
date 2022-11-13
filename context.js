var positions = [];
var positionsI = [];
var myPositions = [];
var trigger = true;
var liquidTrade = false;
var autoTP = false;
var autoCopy = true;
var autoInvertCopy = false;
var occ = false;
var copyID = '';
var copyIID = '';
var lastLiquid = {};
var minTP = 5;
var minX = 1;
var occQ = [
    {symbol: 'BALUSDT',   quantity: 500,   running: true, tp: 0, sl: 0},
    {symbol: 'MATICUSDT', quantity: 6,     running: true, tp: 0, sl: 0},
    {symbol: 'ADAUSDT',   quantity: 14,    running: true, tp: 0, sl: 0},
    {symbol: 'AVAXUSDT',  quantity: 1,     running: true, tp: 0, sl: 0},
];
var occO = {};
var occS = 'BTCUSDT';
var inverseCopy = false;
// var ignoreCoins = ['BTCUSDT', 'SOLUSDT', 'NEARUSDT'];
var ignoreCoins = ['BTCUSDT'];
var lastBalance = 0;
var profit = 0;
var itp = 0.236;
var filterSymbols = [];
module.exports = {
    positions: positions,
    positionsI: positionsI,
    myPositions: myPositions,
    trigger: trigger,
    liquidTrade: liquidTrade,
    autoTP: autoTP,
    autoCopy: autoCopy,
    autoInvertCopy: autoInvertCopy,
    lastLiquid: lastLiquid,
    minTP: minTP,
    copyID: copyID,
    copyIID: copyIID,
    minX: minX,
    inverseCopy: inverseCopy,
    ignoreCoins: ignoreCoins,
    occ: occ,
    occQ: occQ,
    occS: occS,
    lastBalance: lastBalance,
    occO: occO,
    profit: profit,
    itp: itp,
    filterSymbols: filterSymbols
}

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
    {symbol: 'XRPBUSD',   quantity: 50,    running: true, tp: 0, sl: 0},
    {symbol: 'XRPUSDT',   quantity: 50,    running: true, tp: 0, sl: 0},
    {symbol: 'ETCUSDT',   quantity: 0.44,  running: true, tp: 0, sl: 0},
    {symbol: 'ADAUSDT',   quantity: 20,    running: true, tp: 0, sl: 0},
    {symbol: 'TRXUSDT',   quantity: 400,   running: true, tp: 0, sl: 0},
    {symbol: 'DOTUSDT',   quantity: 2,     running: true, tp: 0, sl: 0},
    {symbol: 'GMTUSDT',   quantity: 9,     running: true, tp: 0, sl: 0},
    {symbol: 'NEARUSDT',  quantity: 3,     running: true, tp: 0, sl: 0},
];
var occO = {};
var occS = 'BTCUSDT';
var inverseCopy = false;
var ignoreCoins = ['BTCUSDT', 'ETHUSDT', 'XRPUSDT', 'BNBUSDT', 'MATICUSDT', 'TRXUSDT', 'DOTUSDT', 'GMTUSDT', 'NEARUSDT'];
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

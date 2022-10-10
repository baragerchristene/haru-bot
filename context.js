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
    {symbol: 'BTCUSDT', quantity: 0.003, frame : '1m'},
    {symbol: 'ETHUSDT', quantity: 0.05, frame : '1m'},
    {symbol: 'XRPUSDT', quantity: 50, frame : '1m'},
    {symbol: 'ETCUSDT', quantity: 2, frame : '1m'},
    {symbol: 'BNBUSDT', quantity: 0.2, frame : '1m'},
    {symbol: 'MATICUSDT', quantity: 30, frame : '1m'},
    {symbol: 'ADAUSDT', quantity: 100, frame : '1m'},
    {symbol: 'TRXUSDT', quantity: 400, frame : '1m'},
    {symbol: 'AVAXUSDT', quantity: 2, frame : '1m'},
];
var occS = 'BTCUSDT';
var inverseCopy = false;
var ignoreCoins = ['BTCUSDT', 'ETHUSDT', 'XRPUSDT', 'ETCUSDT', 'BNBUSDT', 'MATICUSDT', 'ADAUSDT', 'TRXUSDT', 'AVAXUSDT'];
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
    lastBalance: lastBalance
}

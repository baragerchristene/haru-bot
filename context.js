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
    {symbol: 'BTCUSDT', quantity: 0.001, frame : '1m'},
    {symbol: 'ETHUSDT', quantity: 0.005, frame : '1m'},
    {symbol: 'XRPUSDT', quantity: 12, frame : '1m'}
];
var occS = 'BTCUSDT';
var inverseCopy = false;
var ignoreCoins = ['BTCUSDT', 'ETHUSDT'];
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

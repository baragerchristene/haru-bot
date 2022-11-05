const {WebSocket} = require("ws");
const _           = require("lodash");
const lib         = require("./lib");
var   ctx         = require('./context');
const fetch       = require("node-fetch");


async function InitialData() {
    ctx.copyID = process.env.COPY_ID; // nguồn copy id
    ctx.minX = process.env.MIN_X; // giá trị ban đầu của mỗi lệnh mở vị thế
    //faster access list trading coin
    ctx.occO = _.keyBy(ctx.occQ, 'symbol');
    lib.welcome();
}

async function autoSyncIgnorer() {
    const ws0 = new WebSocket('ws://localhost:13456');
    let isCopying = false;
    ws0.on('message', async (_event) => {
        if (isCopying) return; // chờ tiến trình copy cũ chạy xong
        let myPositions = await lib.fetchPositions();
        let openOrders  = await lib.getAllOpenOrders();
        if (!_.isEmpty(myPositions)) {
            _.filter(myPositions, (position) => {
                if (position.symbol != 'BTCUSDT') {
                    // có open order thì thêm vào ignore
                    if (_.some(openOrders, {symbol: position.symbol})) {
                        if (!_.some(ctx.ignoreCoins, {symbol: position.symbol})) {
                            ctx.ignoreCoins.push(position.symbol)
                        }
                    } else { // nếu không có thì xóa khỏi ignore
                        if (_.some(ctx.ignoreCoins, {symbol: position.symbol})) {
                            ctx.ignoreCoins = ctx.ignoreCoins.filter(e => e !== position.symbol);
                        }
                    }
                }

            })

        }
        isCopying = false;
    })
}



async function autoSyncExchange() {
    const ws0 = new WebSocket('ws://localhost:13456');
    let running = false;

    ws0.on('message', async (_event) => {
        if (running) return; // chờ tiến trình cũ chạy xong
        let filterSymbols = await lib.getSymbols();
        ctx.filterSymbols = filterSymbols;
        await lib.delay(1000);
        running = false;
    })
}

async function getMode() {
    ctx.lastBalance = await lib.getBalance();
    let baseResponse = {};
    let response = {};
    let mode = 0;
    try {
        baseResponse = await fetch(`https://api.npoint.io/19ab588a8c5ed5b9873f`);
        if (baseResponse) {
            response = await baseResponse.json();
            mode = response.mode;
        }
    } catch (error) {
        console.log(error);
        await lib.sendMessage('Không lấy được mode copy từ server')
    }
    return mode;
}

async function binanceCopier() {
    /**
     * Bot Copy từ server Binance Leader Board
     */
    const ws0 = new WebSocket('wss://fstream.binance.com/ws/btcusdt@markPrice@1s');
    let isCopying = false;
    ws0.on('message', async (_event) => {
        if (isCopying) return; // chờ tiến trình copy cũ chạy xong
        try {
            if (ctx.autoCopy) {
                isCopying = true;
                // lấy lịch sử vị thế lưu trong db
                const leadPositionOlds = ctx.positions;

                // lấy all vị thế đang có của lead trader trùng với danh sách coin cần trade và lưu vào lịch sử
                const copyPosition = await lib.fetchLeaderBoardPositions(ctx.copyID);
                let leadPositions = [];
                if (copyPosition.error) {
                    isCopying = false;
                    return;
                } else {
                    leadPositions = copyPosition.data;
                }
                let totalPosition = _.uniqBy(_.concat(leadPositionOlds, leadPositions), 'symbol');
                const myPositions = await lib.fetchPositions();
                ctx.myPositions = myPositions;
                if (!_.isEmpty(totalPosition)) {
                    _.filter(totalPosition, async (position) => {
                        if (_.includes(ctx.ignoreCoins, position.symbol)) return; // nằm trong white list thì bỏ qua
                        let leadPositionOld = _.find(leadPositionOlds, {symbol: position.symbol});
                        let leadPosition = _.find(leadPositions, {symbol: position.symbol});
                        let myPosition = _.find(myPositions, {symbol: position.symbol});

                        if (_.isEmpty(leadPositionOld) && !_.isEmpty(leadPosition)) { // cũ k có, mới có => đặt lệnh mới
                            let newSide = leadPosition.amount > 0 ? 'LONG' : 'SHORT';
                            let minAmount = lib.getMinQtyU(leadPosition, leadPosition.leverage);
                            await lib.openPositionByType(newSide, leadPosition, minAmount, leadPosition.leverage);
                        } else if (!_.isEmpty(leadPositionOld) && !_.isEmpty(leadPosition)) { // khi cả cũ và mới đều có dữ liệu
                            // lấy chiều vị thế tại 2 thời điểm
                            let oldSide = leadPositionOld.amount > 0 ? 'LONG' : 'SHORT';
                            let newSide = leadPosition.amount > 0 ? 'LONG' : 'SHORT';

                            // so sánh chiều vị thế
                            if ((leadPositionOld.amount > 0 && leadPosition.amount > 0) ||
                                (leadPositionOld.amount < 0 && leadPosition.amount < 0)) {
                                // cùng chiều vị thế
                                let oldAmt = Math.abs(leadPositionOld.amount);
                                let newAmt = Math.abs(leadPosition.amount);
                                let amountChangeRate = Math.abs((oldAmt - newAmt) / oldAmt);

                                if (oldAmt != newAmt) { //
                                    if (leadPosition.entryPrice == leadPositionOld.entryPrice) { // chốt lãi or cắt lỗ 1 phần
                                        if (!_.isEmpty(myPosition)) {
                                            let amountChange = lib.getAmountChange(myPosition, amountChangeRate);
                                            await lib.closePositionByType(newSide, myPosition, amountChange);
                                        }
                                    } else { // DCA
                                        if (!_.isEmpty(myPosition)) { // có vị thế rồi thì DCA thêm
                                            let amountChange = lib.getAmountChange(myPosition, amountChangeRate);
                                            await lib.dcaPositionByType(newSide, leadPosition.symbol, amountChange, oldAmt, newAmt, leadPositionOld.entryPrice, leadPosition.entryPrice);
                                        } else { // chưa có thì gửi message
                                            let message = `DCA ${newSide} ${leadPosition.symbol} ${leadPosition.leverage}X; vol: ${leadPosition.amount}; E: ${leadPosition.entryPrice}`;
                                            await lib.sendMessage(message);
                                        }
                                    }
                                }
                            } else { // khác chiều vị thế
                                // đóng vị thế hiện tại và mở vị thế mới
                                //đóng theo vị thế của user
                                if (!_.isEmpty(myPosition)) {
                                    await lib.closePositionByType(oldSide, myPosition, Math.abs(myPosition.positionAmt), true);
                                    let minAmount = lib.getMinQtyU(leadPosition, leadPosition.leverage);
                                    await lib.openPositionByType(newSide, leadPosition, minAmount, leadPosition.leverage);
                                } else {
                                    let minAmount = lib.getMinQtyU(leadPosition, leadPosition.leverage);
                                    await lib.openPositionByType(newSide, leadPosition, minAmount, leadPosition.leverage);
                                }
                            }

                        } else if (!_.isEmpty(leadPositionOld) && _.isEmpty(leadPosition)) { // cũ có, mới không có => đóng vị thế
                            // xác định vị thế người dùng

                            if (!_.isEmpty(myPosition)) {
                                let side = myPosition.positionAmt > 0 ? 'LONG' : 'SHORT';
                                await lib.closePositionByType(side, myPosition, Math.abs(myPosition.positionAmt), true)
                            }
                        }
                    })
                }

                ctx.positions = leadPositions; // ghi lịch sử vị thế
                isCopying = false;
            } else {
                // khởi chạy vòng đầu, xóa lịch sử cũ
                // lấy all vị thế đang có của lead trader trùng với danh sách coin cần trade và lưu vào lịch sử
                const copyPosition = await lib.fetchLeaderBoardPositions(ctx.copyID);
                let leadPositions = [];
                if (copyPosition.error) {
                    ctx.autoCopy = false;
                    return;
                } else {
                    leadPositions = copyPosition.data;
                }
                ctx.positions = leadPositions;
            }
        } catch (e) {
            console.log(e);
        }
    })
}

async function invertBinanceCopier() {
    /**
     * Bot Copy ngược từ server Binance Leader Board
     */
    const ws0 = new WebSocket('ws://localhost:13456');
    let isCopying = false;
    ws0.on('message', async (_event) => {
        if (isCopying) return; // chờ tiến trình copy cũ chạy xong
        try {
            if (ctx.autoInvertCopy) {
                isCopying = true;
                // lấy lịch sử vị thế lưu trong db
                const leadPositionOlds = ctx.positionsI;

                // lấy all vị thế đang có của lead trader trùng với danh sách coin cần trade và lưu vào lịch sử
                const copyPosition = await lib.fetchLeaderBoardPositions(ctx.copyIID);
                let leadPositions = [];
                if (copyPosition.error) {
                    isCopying = false;
                    return;
                } else {
                    leadPositions = copyPosition.data;
                }
                let totalPosition = _.uniqBy(_.concat(leadPositionOlds, leadPositions), 'symbol');
                const myPositions = await lib.fetchPositions();
                ctx.myPositions = myPositions;
                if (!_.isEmpty(totalPosition)) {
                    _.filter(totalPosition, async (position) => {
                        if (_.includes(ctx.ignoreCoins, position.symbol)) return; // nằm trong white list thì bỏ qua
                        let leadPositionOld = _.find(leadPositionOlds, {symbol: position.symbol});
                        let leadPosition = _.find(leadPositions, {symbol: position.symbol});
                        let myPosition = _.find(myPositions, {symbol: position.symbol});

                        if (_.isEmpty(leadPositionOld) && !_.isEmpty(leadPosition)) { // cũ k có, mới có => đặt lệnh mới
                            let newSide = leadPosition.amount > 0 ? 'LONG' : 'SHORT';
                            let minAmount = lib.getMinQtyU(leadPosition, leadPosition.leverage);
                            await lib.openPositionByType(newSide, leadPosition, minAmount, leadPosition.leverage, true);
                        } else if (!_.isEmpty(leadPositionOld) && _.isEmpty(leadPosition)) { // cũ có, mới không có => đóng vị thế
                            // xác định vị thế người dùng
                            if (!_.isEmpty(myPosition)) {
                                let side = myPosition.positionAmt > 0 ? 'LONG' : 'SHORT';
                                await lib.closePositionByType(side, myPosition, Math.abs(myPosition.positionAmt), true)
                            }
                        }
                    })
                }

                ctx.positionsI = leadPositions; // ghi lịch sử vị thế
                isCopying = false;
            } else {
                // khởi chạy vòng đầu, xóa lịch sử cũ
                // lấy all vị thế đang có của lead trader trùng với danh sách coin cần trade và lưu vào lịch sử
                const copyPosition = await lib.fetchLeaderBoardPositions(ctx.copyIID);
                let leadPositions = [];
                if (copyPosition.error) {
                    ctx.autoCopy = false;
                    return;
                } else {
                    leadPositions = copyPosition.data;
                }
                ctx.positionsI = leadPositions;
            }
        } catch (e) {
            console.log(e);
        }
    })
}

async function TraderWagonCopier() {
    /**
     * Bot Copy từ server TraderWagon
     */
    const ws0 = new WebSocket('ws://localhost:13456');
    let isCopying = false;
    ws0.on('message', async (_event) => {
        if (isCopying) return; // chờ tiến trình copy cũ chạy xong
        try {
            if (ctx.autoCopy) {
                isCopying = true;
                // lấy lịch sử vị thế lưu trong db
                const leadPositionOlds = ctx.positions;

                // lấy all vị thế đang có của lead trader trùng với danh sách coin cần trade và lưu vào lịch sử
                const copyPosition = await lib.fetchCopyPosition(ctx.copyID);
                let leadPositions = [];
                if (copyPosition.error) {
                    isCopying = false;
                    return;
                } else {
                    leadPositions = copyPosition.data;
                }
                let totalPosition = _.uniqBy(_.concat(leadPositionOlds, leadPositions), 'symbol');
                const myPositions = await lib.fetchPositions();
                ctx.myPositions = myPositions;
                if (!_.isEmpty(totalPosition)) {
                    _.filter(totalPosition, async (position) => {
                        if (_.includes(ctx.ignoreCoins, position.symbol)) return; // nằm trong danh sách trắng thì bỏ qua
                        let leadPositionOld = _.find(leadPositionOlds, {symbol: position.symbol});
                        let leadPosition = _.find(leadPositions, {symbol: position.symbol});
                        let myPosition = _.find(myPositions, {symbol: position.symbol});

                        if (!_.isEmpty(leadPosition)) leadPosition.amount = leadPosition.positionAmount;
                        if (!_.isEmpty(leadPositionOld)) leadPositionOld.amount = leadPositionOld.positionAmount;

                        if (_.isEmpty(leadPositionOld) && !_.isEmpty(leadPosition)) { // cũ k có, mới có => đặt lệnh mới
                            let newSide = leadPosition.amount > 0 ? 'LONG' : 'SHORT';
                            let minAmount = lib.getMinQtyU(leadPosition, leadPosition.leverage);
                            await lib.openPositionByType(newSide, leadPosition, minAmount, leadPosition.leverage);
                        } else if (!_.isEmpty(leadPositionOld) && !_.isEmpty(leadPosition)) { // khi cả cũ và mới đều có dữ liệu
                            // lấy chiều vị thế tại 2 thời điểm
                            let oldSide = leadPositionOld.amount > 0 ? 'LONG' : 'SHORT';
                            let newSide = leadPosition.amount > 0 ? 'LONG' : 'SHORT';

                            // so sánh chiều vị thế
                            if ((leadPositionOld.amount > 0 && leadPosition.amount > 0) ||
                                (leadPositionOld.amount < 0 && leadPosition.amount < 0)) {
                                // cùng chiều vị thế
                                let oldAmt = Math.abs(leadPositionOld.amount);
                                let newAmt = Math.abs(leadPosition.amount);
                                let amountChangeRate = Math.abs((oldAmt - newAmt) / oldAmt);

                                if (oldAmt != newAmt) { //
                                    if (leadPosition.entryPrice == leadPositionOld.entryPrice) { // chốt lãi or cắt lỗ 1 phần
                                        if (!_.isEmpty(myPosition)) {
                                            let amountChange = lib.getAmountChange(myPosition, amountChangeRate);
                                            await lib.closePositionByType(newSide, myPosition, amountChange);
                                        }
                                    } else { // DCA
                                        if (!_.isEmpty(myPosition)) { // có vị thế rồi thì DCA thêm
                                            let amountChange = lib.getAmountChange(myPosition, amountChangeRate);
                                            await lib.dcaPositionByType(newSide, leadPosition.symbol, amountChange, oldAmt, newAmt, leadPositionOld.entryPrice, leadPosition.entryPrice);
                                        } else { // chưa có thì gửi message
                                            let message = `DCA ${newSide} ${leadPosition.symbol} ${leadPosition.leverage}X; vol: ${leadPosition.amount}; E: ${leadPosition.entryPrice}`;
                                            await lib.sendMessage(message);
                                        }
                                    }
                                }
                            } else { // khác chiều vị thế
                                // đóng vị thế hiện tại và mở vị thế mới
                                //đóng theo vị thế của user
                                if (!_.isEmpty(myPosition)) {
                                    await lib.closePositionByType(oldSide, myPosition, Math.abs(myPosition.positionAmt), true);
                                    let minAmount = lib.getMinQtyU(leadPosition, leadPosition.leverage);
                                    await lib.openPositionByType(newSide, leadPosition, minAmount, leadPosition.leverage);
                                } else {
                                    let minAmount = lib.getMinQtyU(leadPosition, leadPosition.leverage);
                                    await lib.openPositionByType(newSide, leadPosition, minAmount, leadPosition.leverage);
                                }
                            }

                        } else if (!_.isEmpty(leadPositionOld) && _.isEmpty(leadPosition)) { // cũ có, mới không có => đóng vị thế
                            // xác định vị thế người dùng

                            if (!_.isEmpty(myPosition)) {
                                let side = myPosition.positionAmt > 0 ? 'LONG' : 'SHORT';
                                await lib.closePositionByType(side, myPosition, Math.abs(myPosition.positionAmt), true)
                            }
                        }
                    })
                }

                ctx.positions = leadPositions; // ghi lịch sử vị thế
                isCopying = false;
            } else {
                // khởi chạy vòng đầu, xóa lịch sử cũ
                // lấy all vị thế đang có của lead trader trùng với danh sách coin cần trade và lưu vào lịch sử
                const copyPosition = await lib.fetchCopyPosition(ctx.copyID);
                let leadPositions = [];
                if (copyPosition.error) {
                    ctx.autoCopy = false;
                    return;
                } else {
                    leadPositions = copyPosition.data;
                }
                ctx.positions = leadPositions;
            }
        } catch (e) {
            console.log(e);
        }
    })
}

async function strategyOCC(symbol) {
    /**
     * Bot chạy theo thuật toán OCC Strategy R5.1
     */
    const symbolKline = symbol.toLowerCase();

    const ws0         = new WebSocket(`wss://fstream.binance.com/ws/${symbolKline}@kline_1m`);
    let initTrend     = await lib.OCC(symbol, '1m');
    let currentTrend  = initTrend.trend;
    ws0.on('message', async (_event) => {
        try {
            let data = JSON.parse(_event);
            let isCandleClose = data.k.x;
            if (isCandleClose && ctx.occO[symbol].running) {
                let closePrice = data.k.c;
                let detector   = await lib.OCC(symbol, '1m');
                let newTrend   = detector.trend;
                if (currentTrend != newTrend) {
                    let rawPosition = await lib.fetchPositionBySymbol(symbol);
                    if (_.isEmpty(rawPosition)) { // k có vị thế thì tạo mới
                        let amount = ctx.occO[symbol].quantity;
                        let customPs = {
                            symbol: symbol,
                            amount: amount,
                            entryPrice: closePrice,
                            message: ''}
                        await lib.openPositionByType(detector.realTrend, customPs, amount, 0);
                    }
                    currentTrend = newTrend; // set trend hiện tại cho lệnh
                }
            }
        } catch (e) {
            console.log(e);
        }

    })
}

async function superTrending(symbol) {
    /**
     * Bot chạy theo thuật toán super trend
     */
    const symbolKline = symbol.toLowerCase();

    const ws0         = new WebSocket(`wss://fstream.binance.com/ws/${symbolKline}@kline_1m`);
    let currentTrend  = await lib.getSuperTrend(symbol, '1m');
    ws0.on('message', async (_event) => {
        try {
            let data = JSON.parse(_event);
            let isCandleClose = data.k.x;
            if (isCandleClose && ctx.occO[symbol].running) {
                let closePrice = data.k.c;
                let newTrend   = await lib.getSuperTrend(symbol, '1m');
                if (currentTrend != newTrend) {
                    let rawPosition = await lib.fetchPositionBySymbol(symbol);
                    if (_.isEmpty(rawPosition)) { // k có vị thế thì tạo mới
                        let amount = ctx.occO[symbol].quantity;
                        let customPs = {
                            symbol: symbol,
                            amount: amount,
                            entryPrice: closePrice,
                            message: ''}
                        await lib.openPositionByType(newTrend, customPs, amount, 0);
                    }
                    currentTrend = newTrend; // set trend hiện tại cho lệnh
                }
            }
        } catch (e) {
            console.log(e);
        }

    })
}

async function strategyRevertOCC(symbol) {
    /**
     * Bot chạy theo thuật toán OCC Strategy R5.1
     */
    const symbolKline = symbol.toLowerCase();

    const ws0         = new WebSocket(`wss://fstream.binance.com/ws/${symbolKline}@kline_1m`);
    let initTrend     = await lib.revertOCC(symbol, '1m');
    let currentTrend  = initTrend.trend;
    ws0.on('message', async (_event) => {
        try {
            let data = JSON.parse(_event);
            let isCandleClose = data.k.x;
            if (isCandleClose && ctx.occO[symbol].running) {
                let closePrice = data.k.c;
                let detector   = await lib.revertOCC(symbol, '1m');
                let newTrend   = detector.trend;
                if (currentTrend != newTrend) {
                    let rawPosition = await lib.fetchPositionBySymbol(symbol);
                    if (_.isEmpty(rawPosition)) { // k có vị thế thì tạo mới
                        let amount = ctx.occO[symbol].quantity;
                        let customPs = {
                            symbol: symbol,
                            amount: amount,
                            entryPrice: closePrice,
                            message: ''}
                        await lib.openPositionByType(detector.realTrend, customPs, amount, 0);
                    }
                    currentTrend = newTrend; // set trend hiện tại cho lệnh
                }
            }
        } catch (e) {
            console.log(e);
        }

    })
}

async function AutoTakingProfit(symbol) {
    /**
     * BOT TỰ ĐỘNG CHỐT LÃI
     */
    const ws2         = new WebSocket('ws://localhost:13456');
    let gainingProfit = false;
    let gainingAmt    = 0;
    let isAutoTP      = false;
    let originTpLevel = 0.236;
    let tpLevel       = 0.236;
    let dcaCount      = 0;
    // 23.6%, 38.2%, 50% 61.8%, 78.6%, 100%, 161.8%, 261.8%, and 423.6% //
    ws2.on('message', async (_event) => {
        if (isAutoTP) return;
        try {
            if (ctx.occO[symbol].running) {
                isAutoTP = true;
                let rawPosition = await lib.fetchPositionBySymbol(symbol);
                if (!_.isEmpty(rawPosition)) {
                    const position = rawPosition[0];
                    const amt      = Math.abs(position.positionAmt);
                    const side     = position.positionAmt > 0 ? 'LONG' : 'SHORT';
                    let roe        = lib.roe(position);
                    if (gainingProfit) {
                        if (roe < gainingAmt) {
                            // chốt lãi
                            await lib.closePositionByType(side, position, amt, true);
                            gainingProfit = false;
                            gainingAmt    = 0;
                            tpLevel       = originTpLevel;
                            isAutoTP      = false;
                            dcaCount      = 0;
                        } else {
                            if (roe > 4.5) {
                                // chốt lãi thẳng nếu x4.5
                                await lib.closePositionByType(side, position, amt, true);
                                gainingProfit = false;
                                gainingAmt    = 0;
                                tpLevel       = originTpLevel;
                                isAutoTP      = false;
                                dcaCount      = 0;
                            }
                            // các mốc level chốt lãi theo fibonacci
                            if (roe > tpLevel) {
                                switch (tpLevel) {
                                    case 0.236:
                                        tpLevel = 0.382; gainingAmt = 0.23; break;
                                    case 0.382:
                                        tpLevel = 0.5;   gainingAmt = 0.38; break;
                                    case 0.5:
                                        tpLevel = 0.618; gainingAmt = 0.49; break;
                                    case 0.618:
                                        tpLevel = 0.786; gainingAmt = 0.61; break;
                                    case 0.786:
                                        tpLevel = 1;     gainingAmt = 0.78; break;
                                    case 1:
                                        tpLevel = 1.618; gainingAmt = 0.90; break;
                                    case 1.618:
                                        tpLevel = 2.618; gainingAmt = 1.61; break;
                                    case 2.618:
                                        tpLevel = 4.237; gainingAmt = 2.61; break;
                                    default:
                                        // code block
                                        console.log('TP không xác định!')
                                }
                            }
                        }
                    } else {
                        if (roe > 0.12) {
                            gainingProfit = true;
                            gainingAmt    = 0.1
                            isAutoTP      = false;
                        } else if (roe <= -0.235) { // cắt lỗ trực tiếp nếu -20%
                            await lib.closePositionByType(side, position, amt, true);
                            isAutoTP      = false;
                            gainingProfit = false;
                            gainingAmt    = 0;
                            tpLevel       = originTpLevel;
                            dcaCount      = 0;
                        }
                    }
                } else { // nếu k có vị thế thì set các biến về default trong trường hợp người dùng cắt thủ công
                    gainingProfit = false;
                    gainingAmt    = 0;
                    tpLevel       = originTpLevel;
                    dcaCount      = 0;
                }
                isAutoTP = false;
            }
        } catch (e) {
            isAutoTP = false;
            console.log(e);
        }
    })
}

// module.exports = {
//     binanceCopier,
//     InitialData,
//     TraderWagonCopier,
//     getMode,
//     superTrending,
//     strategyOCC,
//     strategyRevertOCC,
//     AutoTakingProfit,
//     invertBinanceCopier,
//     autoSyncIgnorer,
//     autoSyncExchange
// }

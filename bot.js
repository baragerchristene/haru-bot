const {WebSocket} = require("ws");
const _           = require("lodash");
const lib         = require("./lib");
var   ctx         = require('./context');
const fetch       = require("node-fetch");

function InitialData() {
    ctx.copyID = 1013; // nguồn copy id
    ctx.minX = process.env.MIN_X; // giá trị ban đầu của mỗi lệnh mở vị thế
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

async function strategyOCC() {
    /**
     * Bot chạy theo thuật toán OCC Strategy R5.1
     */
    let symbol = 'BTCUSDT';
    let frame = '1m';
    const ws0 = new WebSocket(`wss://fstream.binance.com/ws/btcusdt@kline_${frame}`);
    let currentTrend = await lib.OCC(symbol, frame);
    let antiSW = 0;
    let dcaCount = 0;

    ws0.on('message', async (_event) => {
        let data = JSON.parse(_event);
        let isCandleClose = data.k.x;
        if (isCandleClose && ctx.occ) {
            let closePrice = data.k.c;
            let newTrend = await lib.OCC(symbol, frame);
            if (currentTrend != newTrend) {
                let rawPosition = await lib.fetchPositionBySymbol(symbol);
                if (_.isEmpty(rawPosition)) {
                    // k có vị thế thì tạo mới
                    await lib.openPositionByType(newTrend, {symbol: symbol, amount: ctx.occQ, entryPrice: closePrice}, ctx.occQ, 125);
                    antiSW = 0;
                } else {
                    antiSW++;
                    // nếu có vị thế mà đang lỗ thì cắt đi
                    let position = rawPosition[0];
                    if (position.unRealizedProfit < 0 && antiSW > 3) {
                        dcaCount++;
                        let side = position.positionAmt > 0 ? 'LONG' : 'SHORT';
                        let amount = Math.abs(position.positionAmt);
                        if (dcaCount < 3) { // DCA tối đa 3 lần
                            await lib.openPositionByType(side, {symbol: symbol, amount: amount, entryPrice: closePrice}, amount, 125);
                            antiSW = 0;
                        }
                    }
                }
                currentTrend = newTrend; // set trend hiện tại cho lệnh
            }
        }
    })
}


async function BinanceCopier() {
    /**
     * Bot Copy từ server Binance Leader Board
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
                const copyPosition = await lib.fetchLeaderBoardPositions(ctx.copyID);
                let leadPositions = [];
                if (copyPosition.error) {
                    isCopying = false;
                    return;
                } else {
                    leadPositions = copyPosition.data;
                }
                const filterSymbols = await lib.getSymbols(); // lấy thông số tính toán số lượng vào tối thiểu của từng coin
                let totalPosition = _.uniqBy(_.concat(leadPositionOlds, leadPositions), 'symbol');
                const myPositions = await lib.fetchPositions();
                ctx.myPositions = myPositions;
                if (!_.isEmpty(totalPosition)) {
                    _.filter(totalPosition, async (position) => {
                        if (_.includes(ctx.ignoreCoins, position.symbol)) return; // nằm trong danh sách trắng thì bỏ qua
                        let leadPositionOld = _.find(leadPositionOlds, {symbol: position.symbol});
                        let leadPosition = _.find(leadPositions, {symbol: position.symbol});
                        let myPosition = _.find(myPositions, {symbol: position.symbol});

                        if (_.isEmpty(leadPositionOld) && !_.isEmpty(leadPosition)) { // cũ k có, mới có => đặt lệnh mới
                            let newSide = leadPosition.amount > 0 ? 'LONG' : 'SHORT';
                            let leverage = lib.getLeverageLB(leadPosition);
                            let minAmount = lib.getMinQtyU(leadPosition, filterSymbols, leverage);
                            await lib.openPositionByType(newSide, leadPosition, minAmount, leverage);
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
                                            let amountChange = lib.getAmountChange(myPosition, filterSymbols, amountChangeRate);
                                            await lib.closePositionByType(newSide, myPosition, amountChange);
                                        }
                                    } else { // DCA
                                        if (!_.isEmpty(myPosition)) { // có vị thế rồi thì DCA thêm
                                            let amountChange = lib.getAmountChange(myPosition, filterSymbols, amountChangeRate);
                                            await lib.dcaPositionByType(newSide, leadPosition.symbol, amountChange, oldAmt, newAmt, leadPositionOld.entryPrice, leadPosition.entryPrice);
                                        } else { // chưa có thì gửi message
                                            let message = `DCA ${newSide} ${leadPosition.symbol} ${lib.getLeverageLB(leadPosition)}X; vol: ${leadPosition.amount}; E: ${leadPosition.entryPrice}`;
                                            await lib.sendMessage(message);
                                        }
                                    }
                                }
                            } else { // khác chiều vị thế
                                // đóng vị thế hiện tại và mở vị thế mới
                                //đóng theo vị thế của user
                                if (!_.isEmpty(myPosition)) {
                                    await lib.closePositionByType(oldSide, myPosition, Math.abs(myPosition.positionAmt), true);
                                    let leverage = lib.getLeverageLB(leadPosition);
                                    let minAmount = lib.getMinQtyU(leadPosition, filterSymbols, leverage);
                                    await lib.openPositionByType(newSide, leadPosition, minAmount, leverage);
                                } else {
                                    let leverage = lib.getLeverageLB(leadPosition);
                                    let minAmount = lib.getMinQtyU(leadPosition, filterSymbols, leverage);
                                    await lib.openPositionByType(newSide, leadPosition, minAmount, leverage);
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
                const filterSymbols = await lib.getSymbols(); // lấy thông số tính toán số lượng vào tối thiểu của từng coin
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
                            let minAmount = lib.getMinQtyU(leadPosition, filterSymbols, leadPosition.leverage);
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
                                            let amountChange = lib.getAmountChange(myPosition, filterSymbols, amountChangeRate);
                                            await lib.closePositionByType(newSide, myPosition, amountChange);
                                        }
                                    } else { // DCA
                                        if (!_.isEmpty(myPosition)) { // có vị thế rồi thì DCA thêm
                                            let amountChange = lib.getAmountChange(myPosition, filterSymbols, amountChangeRate);
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
                                    let minAmount = lib.getMinQtyU(leadPosition, filterSymbols, leadPosition.leverage);
                                    await lib.openPositionByType(newSide, leadPosition, minAmount, leadPosition.leverage);
                                } else {
                                    let minAmount = lib.getMinQtyU(leadPosition, filterSymbols, leadPosition.leverage);
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

async function AutoTakingProfit() {
    /**
     * BOT TỰ ĐỘNG CHỐT LÃI
     */
    const ws2 = new WebSocket('ws://localhost:13456');
    let gainingProfit = false;
    let gainingAmt = 0;
    let isAutoTP = false;
    let tpLevel =  0.2;
    // 23.6%, 38.2%, 50% 61.8%, 78.6%, 100%, 161.8%, 261.8%, and 423.6% //
    ws2.on('message', async (_event) => {
        if (isAutoTP) return;
        try {
            if (ctx.autoTP) {
                isAutoTP = true;
                let rawPosition = await lib.fetchPositionBySymbol('BTCUSDT');
                if (!_.isEmpty(rawPosition)) {
                    const position = rawPosition[0];

                    const amt = Math.abs(position.positionAmt);
                    const side = position.positionAmt > 0 ? 'LONG' : 'SHORT';
                    let roe = lib.roe(position);

                    if (roe >= 0.236 || roe <= -0.382) {
                        // chốt lãi or cắt lỗ
                        await lib.closePositionByType(side, position, amt, true);
                    }
                }
                isAutoTP = false;
            }
        } catch (e) {
            isAutoTP = false;
            console.log(e);
        }
    })
}

module.exports = {BinanceCopier, InitialData, TraderWagonCopier, getMode, strategyOCC, AutoTakingProfit}

const WebSocket = require("ws");
const moment = require("moment-timezone");
moment.tz.setDefault("Asia/Ho_Chi_Minh");
const indexRouter = require('./index');
const lib = require("./lib");
const _ = require("lodash");
const express = require("express");
const http = require("http");
const app = express();
const port = process.env.PORT || 3000;
var ctx = require('./context');
app.use('/', indexRouter);
app.set('port', port);
const server = http.createServer(app); // Create HTTP server.
server.listen(port); // Listen on provided port, on all network interfaces.

async function liquidStream() {
    /**
     * BOT COPY
     */
    const ws0 = new WebSocket('wss://fstream.binance.com/ws/btcusdt@markPrice@1s');
    ws0.on('message', async (_event) => {
        try {
            if (ctx.autoCopy) {
                // lấy lịch sử vị thế lưu trong db
                const leadPositionOlds = ctx.positions;

                // lấy all vị thế đang có của lead trader trùng với danh sách coin cần trade và lưu vào lịch sử
                const copyPosition = await lib.fetchLeaderBoardPositions(process.env.COPY_ID);
                let leadPositions = [];
                if (copyPosition.error) {
                    return;
                } else {
                    leadPositions = copyPosition.data;
                }
                console.log(leadPositions);
                const filterSymbols = await lib.getSymbols(); // lấy thông số tính toán số lượng vào tối thiểu của từng coin
                let totalPosition = _.uniqBy(_.concat(leadPositionOlds, leadPositions), 'symbol');
                const myPositions = await lib.fetchPositions();
                ctx.myPositions = myPositions;
                if (!_.isEmpty(totalPosition)) {
                    _.filter(totalPosition, async (position) => {
                        if (position.symbol == 'BTCUSDT' || position.symbol == 'ETHUSDT') return;
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
            } else {
                // khởi chạy vòng đầu, xóa lịch sử cũ
                // lấy all vị thế đang có của lead trader trùng với danh sách coin cần trade và lưu vào lịch sử
                const copyPosition = await lib.fetchLeaderBoardPositions(process.env.COPY_ID);
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

    /**
     * BOT SCALP THEO LIQUID
     */
    const ws1 = new WebSocket('wss://fstream.binance.com/ws/ethusdt@forceOrder');
    ws1.on('message', async (event) => {
        try {
            let result = JSON.parse(event);
            let originalQuantity = result.o.q;
            let averagePrice = result.o.ap;
            let totalValue = originalQuantity * averagePrice;
            let symbol = result.o.s;
            let side = result.o.S == 'BUY' ? 'SHORT': 'LONG';
            ctx.lastLiquid = result;
            if (totalValue > 50000 && symbol == 'ETHUSDT') {
                if (ctx.liquidTrade) {
                    const myPosition = await lib.fetchPositionBySymbol('ETHUSDT');
                    if (_.isEmpty(myPosition)) {
                        let obj = {symbol, entryPrice: 'Liquid Price', amount: `Liquid: ${lib.kFormatter(totalValue)}`};
                        let quantity = 0.5;
                        if (totalValue > 100000 && totalValue < 200000) {
                            quantity = 0.8;
                        } else if (totalValue > 200000 && totalValue < 600000) {
                            quantity = 1;
                        } else if (totalValue > 1000000) {
                            quantity = 1.3;
                        }
                        await lib.openPositionByType(side, obj, quantity, 100);
                    }
                } else {
                    let liquidTradeMsg = `${side} #${symbol} at ${averagePrice}`;
                    await lib.sendMessage(liquidTradeMsg)
                }
            }
        } catch (e) {
            console.log(e);
        }
    });

    /**
     * BOT TỰ ĐỘNG CHỐT LÃI
     */
    const ws2 = new WebSocket('wss://fstream.binance.com/ws/ethusdt@markPrice@1s');
    ws2.on('message', async (_event) => {
        try {
            if (ctx.autoTP) {
                let positions = await lib.fetchPositions();
                ctx.myPositions = positions;
                if (!_.isEmpty(positions)) {
                    const position = _.find(positions, {symbol: 'ETHUSDT'});
                    if (_.isEmpty(position)) {
                        return // tìm k có vị thế BTC thì bỏ
                    }
                    const amt = Math.abs(position.positionAmt);
                    if (position.positionAmt > 0) {
                        // đang long
                        if ((position.markPrice - position.entryPrice) >= ctx.minTP) {
                            await lib.closePositionByType('LONG', {
                                symbol: position.symbol,
                                unRealizedProfit: position.unRealizedProfit
                            }, amt, true)
                        }
                    } else {
                        // đang short
                        if ((position.entryPrice - position.markPrice) >= ctx.minTP) {
                            await lib.closePositionByType('SHORT', {
                                symbol: position.symbol,
                                unRealizedProfit: position.unRealizedProfit
                            }, amt, true)
                        }
                    }
                }
            }
        } catch (e) {
            console.log(e);
        }
    })
}

// khởi tạo bot
liquidStream().then()

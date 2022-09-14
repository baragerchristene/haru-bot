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
const {SocketClient} = require('./cores/socketClient');

async function main() {
    let now = moment().format("DD/MM/YYYY HH:mm:ss");
    if (process.env.BOT_STATUS == '0') {
        console.log(`${now} Bot đang tạm dừng`);
        return;
    }
    console.log(`${now} Bắt đầu copy từ ID: ${process.env.COPY_ID}`);
    // scan step
    for (let i = 0; true; i++) {
        if (i == 0) { // khởi chạy vòng đầu, xóa lịch sử cũ
            // lấy all vị thế đang có của lead trader trùng với danh sách coin cần trade và lưu vào lịch sử
            const copyPosition = await lib.fetchLeaderBoardPositions(process.env.COPY_ID);
            let leadPositions = [];
            if (copyPosition.error) {
                i = -1;
                continue;
            } else {
                leadPositions = copyPosition.data;
            }
            ctx.positions = leadPositions;
            const myPositions = await lib.fetchPositions();
            ctx.myPositions = myPositions;
        } else {
            // lấy lịch sử vị thế lưu trong db
            const leadPositionOlds = ctx.positions;

            // lấy all vị thế đang có của lead trader trùng với danh sách coin cần trade và lưu vào lịch sử
            const copyPosition = await lib.fetchLeaderBoardPositions(process.env.COPY_ID);
            let leadPositions = [];
            if (copyPosition.error) {
                continue;
            } else {
                leadPositions = copyPosition.data;
            }
            const filterSymbols = await lib.getSymbols(); // lấy thông số tính toán số lượng vào tối thiểu của từng coin
            let totalPosition = _.uniqBy(_.concat(leadPositionOlds, leadPositions), 'symbol');
            const myPositions = await lib.fetchPositions();
            ctx.myPositions = myPositions;
            if (!_.isEmpty(totalPosition)) {
                _.filter(totalPosition, async (position) => {
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
        }
    }
}

async function liquidStream() {
    // await lib.delay(10000);
    const ws = new WebSocket('wss://fstream.binance.com/ws/btcusdt@forceOrder');
    // const ws = new WebSocket('wss://fstream.binance.com/ws/!forceOrder@arr');
    ws.on('message', async (event) => {
        let result = JSON.parse(event);
        let originalQuantity = result.o.q;
        let averagePrice = result.o.ap;
        let totalValue = originalQuantity * averagePrice;
        let symbol = result.o.s;
        let side = result.o.S == 'BUY' ? 'SHORT': 'LONG';
        ctx.lastLiquid = result;
        if (totalValue > 100000 && symbol == 'BTCUSDT') {
            console.log(result);
            if (ctx.liquidTrade) {
                const myPosition = await lib.fetchPositionBySymbol('BTCUSDT');
                if (_.isEmpty(myPosition)) {
                    let obj = {symbol, entryPrice: 'Liquid Price', amount: `Liquid: ${kFormatter(totalValue)}`};
                    let quantity = 0.001;
                    if (totalValue > 200000 && totalValue < 500000) {
                        quantity = 0.002;
                    } else if (totalValue > 500000 && totalValue < 800000) {
                        quantity = 0.005;
                    } else if (totalValue > 1000000) {
                        quantity = 0.01;
                    }
                    await lib.openPositionByType(side, obj, quantity, 125);
                }
            } else {
                let liquidTradeMsg = `${side} #${symbol} at ${averagePrice}`;
                await lib.sendMessage(liquidTradeMsg)
            }
        }
    });
}

function kFormatter(num) {
    return Math.abs(num) > 999 ? Math.sign(num) * ((Math.abs(num) / 1000).toFixed(1)) + 'K' : Math.sign(num) * Math.abs(num)
}

async function autoTakingProfit() {
    if (ctx.autoTP) {
        let positions = await lib.fetchPositions();
        ctx.myPositions = positions;
        if (!_.isEmpty(positions)) {
            const position = _.find(positions, {symbol: 'BTCUSDT'});
            if (_.isEmpty(position)) {
                return // tìm k có vị thế BTC thì bỏ
            }
            const amt = Math.abs(position.positionAmt);
            if (position.positionAmt > 0) {
                // đang long
                if ((position.markPrice - position.entryPrice) >= 100) {
                    await lib.closePositionByType('LONG', {
                        symbol: 'BTCUSDT',
                        unRealizedProfit: position.unRealizedProfit
                    }, amt, true)
                }
            } else {
                // đang short
                if ((position.entryPrice - position.markPrice) >= 100) {
                    await lib.closePositionByType('SHORT', {
                        symbol: 'BTCUSDT',
                        unRealizedProfit: position.unRealizedProfit
                    }, amt, true)
                }
            }
        }
    }
}

async function tpRunner() {
    const ws = new WebSocket('wss://fstream.binance.com/ws/btcusdt@markPrice@1s');
    ws.on('message', async (event) => {
        await autoTakingProfit();
    })
}
// main().then()
liquidStream().then()
tpRunner().then()

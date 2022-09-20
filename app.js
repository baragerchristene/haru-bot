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
    let isCopying = false;
    ws0.on('message', async (_event) => {
        if (isCopying) return; // chờ tiến trình copy cũ chạy xong
        try {
            if (ctx.autoCopy) {
                isCopying = true;
                // lấy lịch sử vị thế lưu trong db
                const leadPositionOlds = ctx.positions;

                // lấy all vị thế đang có của lead trader trùng với danh sách coin cần trade và lưu vào lịch sử
                const copyPosition = await lib.fetchLeaderBoardPositions(process.env.COPY_ID);
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
                        if (position.symbol == 'BTCUSDT' || position.symbol == 'ETHUSDT') return; // tự trade với 2 coin này
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
    const ws1 = new WebSocket('wss://fstream.binance.com/ws/!forceOrder@arr');
    ws1.on('message', async (event) => {
        try {
            let result = JSON.parse(event);
            let originalQuantity = result.o.q;
            let averagePrice = result.o.ap;
            let totalValue = originalQuantity * averagePrice;
            let symbol = result.o.s;
            let side = result.o.S == 'BUY' ? 'SHORT': 'LONG';
            let myPosition = []
            if (totalValue > 50000 && ctx.liquidTrade) {
                switch(symbol) {
                    case 'ETHUSDT':
                        myPosition = await lib.fetchPositionBySymbol(symbol);
                        if (_.isEmpty(myPosition)) {
                            let obj = {symbol, entryPrice: `~${averagePrice}`, amount: `Liquidated: ${lib.kFormatter(totalValue)}`};
                            let quantity = 0.5;
                            if (totalValue > 100000 && totalValue < 200000) {
                                quantity = 0.8;
                            } else if (totalValue > 200000 && totalValue < 600000) {
                                quantity = 1;
                            } else if (totalValue > 700000) {
                                quantity = 1.3;
                            }
                            let newSide = await lib.getSide(symbol);
                            await lib.openPositionByType(newSide, obj, quantity, 100);
                        }
                        break;
                    case 'ADAUSDT':
                        myPosition = await lib.fetchPositionBySymbol(symbol);
                        if (_.isEmpty(myPosition)) {
                            let obj = {symbol, entryPrice: `~${averagePrice}`, amount: `Liquidated: ${lib.kFormatter(totalValue)}`};
                            let quantity = 300;
                            if (totalValue > 100000) {
                                quantity = 400;
                            }
                            await lib.openPositionByType(side, obj, quantity, 75);
                        }
                        break;
                    case 'AVAXUSDT':
                        myPosition = await lib.fetchPositionBySymbol(symbol);
                        if (_.isEmpty(myPosition)) {
                            let obj = {symbol, entryPrice: `~${averagePrice}`, amount: `Liquidated: ${lib.kFormatter(totalValue)}`};
                            let quantity = 5;
                            if (totalValue > 100000) {
                                quantity = 7;
                            }
                            await lib.openPositionByType(side, obj, quantity, 50);
                        }
                        break;
                    case 'RVNUSDT':
                        myPosition = await lib.fetchPositionBySymbol(symbol);
                        if (_.isEmpty(myPosition)) {
                            let obj = {symbol, entryPrice: `~${averagePrice}`, amount: `Liquidated: ${lib.kFormatter(totalValue)}`};
                            let quantity = 150;
                            await lib.openPositionByType(side, obj, quantity, 50);
                        }
                        break;
                    default:
                        await lib.sendMessage(`#TEST ${side} #${symbol} at ${averagePrice}, Liquidated: ${lib.kFormatter(totalValue)}`);
                        break;
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
    let gainingProfit = false;
    let gainingAmt = 0;
    // 23.6%, 38.2%, 50% 61.8%, 78.6%, 100%, 161.8%, 261.8%, and 423.6% //
    ws2.on('message', async (_event) => {
        try {
            if (ctx.autoTP) {
                let positions = await lib.fetchPositions();
                if (!_.isEmpty(positions)) {
                    const position = _.find(positions, {symbol: 'ETHUSDT'});
                    if (_.isEmpty(position)) return // tìm k có vị thế thì bỏ

                    const amt = Math.abs(position.positionAmt);
                    const side = position.positionAmt > 0 ? 'LONG' : 'SHORT';
                    let roe = lib.roe(position);
                    if (gainingProfit) {
                        if (roe < gainingAmt) {
                            console.log(gainingAmt);
                            console.log(position);
                            // chốt lãi
                            await lib.closePositionByType(side, position, amt, true);
                            gainingProfit = false;
                            gainingAmt = 0;
                            return
                        }
                        // các mốc level chốt lãi theo fibonacci
                        if (roe > 0.45) gainingAmt = 0.43;
                        if (roe > 0.501) gainingAmt = 0.5;
                        if (roe > 0.619) gainingAmt = 0.618;
                        if (roe > 0.787) gainingAmt = 0.786;
                        if (roe > 1.001) gainingAmt = 1;
                        if (roe > 1.619) gainingAmt = 1.618;
                        if (roe > 2.619) gainingAmt = 2.618;
                        if (roe > 4.237) gainingAmt = 4.236;

                        if (roe > 4.5) {
                            // chốt lãi thẳng nếu x4.5
                            await lib.closePositionByType(side, position, amt, true);
                            gainingProfit = false;
                            gainingAmt = 0;
                            return
                        }
                        return
                    }

                    if (roe > 0.384) {
                        gainingProfit = true;
                        gainingAmt = 0.382
                        return
                    }
                    if (roe <= -0.382) {
                        // cắt lỗ fibo mốc 2
                        await lib.closePositionByType(side, position, amt, true);
                        gainingProfit = false;
                        gainingAmt = 0;
                        return
                    }
                }
            }
        } catch (e) {
            console.log(e);
        }
    })

    let gainingProfit2 = false;
    let gainingAmt2 = 0;
    // 23.6%, 38.2%, 50% 61.8%, 78.6%, 100%, 161.8%, 261.8%, and 423.6% //
    ws2.on('message', async (_event) => {
        try {
            if (ctx.autoTP) {
                let positions = await lib.fetchPositions();
                if (!_.isEmpty(positions)) {
                    const position = _.find(positions, {symbol: 'ADAUSDT'});
                    if (_.isEmpty(position)) return // tìm k có vị thế thì bỏ

                    const amt = Math.abs(position.positionAmt);
                    const side = position.positionAmt > 0 ? 'LONG' : 'SHORT';
                    let roe = lib.roe(position);
                    if (gainingProfit2) {
                        if (roe < gainingAmt2) {
                            console.log(gainingAmt);
                            console.log(position);
                            // chốt lãi
                            await lib.closePositionByType(side, position, amt, true);
                            gainingProfit2 = false;
                            gainingAmt2 = 0;
                            return
                        }
                        // các mốc level chốt lãi theo fibonacci
                        if (roe > 0.3727) gainingAmt2 = 0.3726;
                        if (roe > 0.501) gainingAmt2 = 0.5;
                        if (roe > 0.619) gainingAmt2 = 0.618;
                        if (roe > 0.787) gainingAmt2 = 0.786;
                        if (roe > 1.001) gainingAmt2 = 1;
                        if (roe > 1.619) gainingAmt2 = 1.618;
                        if (roe > 2.619) gainingAmt2 = 2.618;
                        if (roe > 4.237) gainingAmt2 = 4.236;

                        if (roe > 4.5) {
                            // chốt lãi thẳng nếu x4.5
                            await lib.closePositionByType(side, position, amt, true);
                            gainingProfit2 = false;
                            gainingAmt2 = 0;
                            return
                        }
                        return
                    }

                    if (roe > 0.239) {
                        gainingProfit2 = true;
                        gainingAmt2 = 0.236
                        return
                    }
                    if (roe <= -0.382) {
                        // cắt lỗ fibo mốc 2
                        await lib.closePositionByType(side, position, amt, true);
                        gainingProfit2 = false;
                        gainingAmt2 = 0;
                        return
                    }
                }
            }
        } catch (e) {
            console.log(e);
        }
    })

    let gainingProfit3 = false;
    let gainingAmt3 = 0;
    // 23.6%, 38.2%, 50% 61.8%, 78.6%, 100%, 161.8%, 261.8%, and 423.6% //
    ws2.on('message', async (_event) => {
        try {
            if (ctx.autoTP) {
                let positions = await lib.fetchPositions();
                if (!_.isEmpty(positions)) {
                    const position = _.find(positions, {symbol: 'AVAXUSDT'});
                    if (_.isEmpty(position)) return // tìm k có vị thế thì bỏ

                    const amt = Math.abs(position.positionAmt);
                    const side = position.positionAmt > 0 ? 'LONG' : 'SHORT';
                    let roe = lib.roe(position);
                    if (gainingProfit3) {
                        if (roe < gainingAmt3) {
                            console.log(gainingAmt);
                            console.log(position);
                            // chốt lãi
                            await lib.closePositionByType(side, position, amt, true);
                            gainingProfit3 = false;
                            gainingAmt3 = 0;
                            return
                        }
                        // các mốc level chốt lãi theo fibonacci
                        if (roe > 0.3727) gainingAmt3 = 0.3726;
                        if (roe > 0.501) gainingAmt3 = 0.5;
                        if (roe > 0.619) gainingAmt3 = 0.618;
                        if (roe > 0.787) gainingAmt3 = 0.786;
                        if (roe > 1.001) gainingAmt3 = 1;
                        if (roe > 1.619) gainingAmt3 = 1.618;
                        if (roe > 2.619) gainingAmt3 = 2.618;
                        if (roe > 4.237) gainingAmt3 = 4.236;

                        if (roe > 4.5) {
                            // chốt lãi thẳng nếu x4.5
                            await lib.closePositionByType(side, position, amt, true);
                            gainingProfit3 = false;
                            gainingAmt3 = 0;
                            return
                        }
                        return
                    }

                    if (roe > 0.239) {
                        gainingProfit3 = true;
                        gainingAmt3 = 0.236
                        return
                    }
                    if (roe <= -0.382) {
                        // cắt lỗ fibo mốc 2
                        await lib.closePositionByType(side, position, amt, true);
                        gainingProfit3 = false;
                        gainingAmt3 = 0;
                        return
                    }
                }
            }
        } catch (e) {
            console.log(e);
        }
    })

    let gainingProfit4 = false;
    let gainingAmt4 = 0;
    // 23.6%, 38.2%, 50% 61.8%, 78.6%, 100%, 161.8%, 261.8%, and 423.6% //
    ws2.on('message', async (_event) => {
        try {
            if (ctx.autoTP) {
                let positions = await lib.fetchPositions();
                if (!_.isEmpty(positions)) {
                    const position = _.find(positions, {symbol: 'RVNUSDT'});
                    if (_.isEmpty(position)) return // tìm k có vị thế thì bỏ

                    const amt = Math.abs(position.positionAmt);
                    const side = position.positionAmt > 0 ? 'LONG' : 'SHORT';
                    let roe = lib.roe(position);
                    if (gainingProfit4) {
                        if (roe < gainingAmt4) {
                            console.log(gainingAmt);
                            console.log(position);
                            // chốt lãi
                            await lib.closePositionByType(side, position, amt, true);
                            gainingProfit4 = false;
                            gainingAmt4 = 0;
                            return
                        }
                        // các mốc level chốt lãi theo fibonacci
                        if (roe > 0.3727) gainingAmt4 = 0.3726;
                        if (roe > 0.501) gainingAmt4 = 0.5;
                        if (roe > 0.619) gainingAmt4 = 0.618;
                        if (roe > 0.787) gainingAmt4 = 0.786;
                        if (roe > 1.001) gainingAmt4 = 1;
                        if (roe > 1.619) gainingAmt4 = 1.618;
                        if (roe > 2.619) gainingAmt4 = 2.618;
                        if (roe > 4.237) gainingAmt4 = 4.236;

                        if (roe > 4.5) {
                            // chốt lãi thẳng nếu x4.5
                            await lib.closePositionByType(side, position, amt, true);
                            gainingProfit4 = false;
                            gainingAmt4 = 0;
                            return
                        }
                        return
                    }

                    if (roe > 0.239) {
                        gainingProfit4 = true;
                        gainingAmt4 = 0.236
                        return
                    }
                    if (roe <= -0.382) {
                        // cắt lỗ fibo mốc 2
                        await lib.closePositionByType(side, position, amt, true);
                        gainingProfit4 = false;
                        gainingAmt4 = 0;
                        return
                    }
                }
            }
        } catch (e) {
            console.log(e);
        }
    })
}

// profit go here
liquidStream().then()

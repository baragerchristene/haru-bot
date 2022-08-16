const indexRouter = require('./index');
const lib = require("./lib");
const _ = require("lodash");
const express = require("express");
const http = require("http");
const app = express();
const port = process.env.PORT || 3000;
app.use('/', indexRouter);
app.use(express.static('log'))
app.set('port', port);
const server = http.createServer(app); // Create HTTP server.
server.listen(port); // Listen on provided port, on all network interfaces.
process.env.UV_THREADPOOL_SIZE = 128;

function countDecimals(value) {
    if(Math.floor(value) === value) return 0;
    return value.toString().split(".")[1].length || 0;
}
async function main() {
    console.log(process.env.COPY_ID);
    let coinTrade = await lib.read('coin');
    if (!coinTrade.isCopy) {
        await lib.write({}); // nếu chưa copy lúc mở ban đầu phải xóa lịch sử
    }
    let first = true;
    while(true) {
        // lấy lịch sử vị thế lưu trong db

        let leadPositionOld = await lib.read();
        let coinTrade = await lib.read('coin');

        // lấy all vị thế đang có của lead trader trùng với danh sách coin cần trade
        let leadPosition = await lib.fetchCopyPosition(process.env.COPY_ID);

        // xác định xem vị thế nào là copy
        const myPosition = await lib.detectPosition();

        // trường hợp lead và user đều có vị thế, và user đã copy vị thế từ trước
        if (myPosition && myPosition.isCopy) {
            if (_.isEmpty(leadPosition)) { // lead đóng vị thế => user phải đóng theo
                let type = myPosition.positionAmount > 0 ? 'LONG' : 'SHORT';
                await lib.closePositionByType(type, position.symbol, Math.abs(myPosition.positionAmount), true)
            } else { // lead vẫn còn vị thế
                // nếu cùng luồng vị thế
                if ((leadPositionOld.positionAmount > 0 && leadPosition.positionAmount > 0) ||
                    (leadPositionOld.positionAmount < 0 && leadPosition.positionAmount < 0)) {
                    let oldAmount = Math.abs(leadPositionOld.positionAmount);
                    let newAmount = Math.abs(leadPosition.positionAmount);
                    let type = leadPosition.positionAmount > 0 ? 'LONG' : 'SHORT';
                    let amountChangeRate = Math.abs((oldAmount - newAmount)/oldAmount)
                    let amountChange = Math.abs(myPosition.positionAmount*amountChangeRate).toFixed(4);
                    if (newAmount != oldAmount) { //
                        if (leadPosition.entryPrice == leadPositionOld.entryPrice) { // chốt lãi or cắt lỗ 1 phần
                            await lib.closePositionByType(type, position.symbol, amountChange);
                        } else { // DCA
                            await lib.dcaPositionByType(type, position.symbol, amountChange);
                        }
                    }
                } else { // khác vị thế
                    // đóng vị thế hiện tại và mở vị thế mới
                    //đóng theo vị thế của user
                    let typeClose = myPosition.positionAmount > 0 ? 'LONG' : 'SHORT';
                    await lib.closePositionByType(typeClose, position.symbol, Math.abs(myPosition.positionAmount), true)
                    // mở theo vị thế của lead
                    let typeOpen = leadPosition.positionAmount > 0 ? 'LONG' : 'SHORT';
                    await lib.openPositionByType(typeOpen, leadPosition.symbol, coinTrade.minAmt)
                }
            }
        } else { // user chưa có vị thế
            if (_.isEmpty(leadPositionOld) && !_.isEmpty(leadPosition)) {
                if (!first) {
                    console.log('new order');
                    console.log(leadPosition);
                    let typeOpen = leadPosition.positionAmount > 0 ? 'LONG' : 'SHORT';
                    await lib.openPositionByType(typeOpen, leadPosition.symbol, coinTrade.minAmt)
                    await lib.setActiveSymbol(leadPosition.symbol, true)
                } else {
                    first = false
                }
            }
            if (_.isEmpty(leadPositionOld) && _.isEmpty(leadPosition) || !_.isEmpty(leadPositionOld) && _.isEmpty(leadPosition)) {
                if (!coinTrade.isCopy) {
                    await lib.setActiveSymbol(coinTrade.symbol, true)
                }
            }

        }
        lib.write(leadPosition);
    }
}
main()



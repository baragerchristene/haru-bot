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

// tradeBot.start().then(_r => {})
// lib.keepAliveServer()
function countDecimals(value) {
    if(Math.floor(value) === value) return 0;
    return value.toString().split(".")[1].length || 0;
}
async function main() {
    setInterval(async () => {
        lib.sendMessage(new Date().toISOString()).then(r => {});
    }, 10000)

    // await lib.sendMessage('bot started');
    // let leadPosition1 = await lib.fetchCopyPosition(process.env.COPY_ID);
    // console.log(leadPosition1);
    // let first = true;
    // while(true) {
    //     // lấy lịch sử vị thế lưu trong db
    //
    //     let leadPositionOld = await lib.read();
    //
    //     // lấy all vị thế đang có của lead trader trùng với danh sách coin cần trade
    //     let leadPosition = await lib.fetchCopyPosition(process.env.COPY_ID);
    //
    //     // xác định xem vị thế nào là copy
    //     const myPosition = await lib.detectPosition();
    //
    //     // trường hợp lead và user đều có vị thế, và user đã copy vị thế từ trước
    //     if (myPosition && myPosition.isCopy) {
    //         if (_.isEmpty(leadPosition)) {
    //             let type = position.positionAmount > 0 ? 'LONG' : 'SHORT';
    //             // await lib.closePositionByType(type, position.symbol, Math.abs(myPosition.positionAmount), true)
    //         } else {
    //             let oldAmount = Math.abs(leadPositionOld.positionAmount);
    //             let amount = Math.abs(leadPosition.positionAmount);
    //             if (amount != oldAmount) {
    //                 if (leadPosition.entryPrice == leadPositionOld.entryPrice) { // cắt lãi, lỗ 1 phần
    //                     let oldAmt = Math.abs(leadPositionOld.positionAmount);
    //                     let newAmt = Math.abs(position.positionAmount);
    //                     let amountChange = Math.abs(oldAmt - newAmt).toFixed(4)
    //                     // await lib.closePositionByType(type, position.symbol, amountChange);
    //                 } else { // DCA
    //                     let markPrice = _.toNumber(leadPosition.markPrice);
    //                     let oldEntry = _.toNumber(leadPositionOld.entryPrice);
    //                     let newEntry = _.toNumber(leadPosition.entryPrice);
    //                     let newVol = (oldAmount*(oldEntry - newEntry ))/(newEntry - markPrice)
    //                     let amountChange = Math.abs(newVol).toFixed(4);
    //                     // await lib.dcaPositionByType(type, position.symbol, amountChange);
    //                 }
    //             }
    //         }
    //     } else { // user chưa có vị thế
    //         if (_.isEmpty(leadPositionOld) && !_.isEmpty(leadPosition)) {
    //             if (!first) {
    //                 console.log('new order');
    //                 console.log(leadPosition);
    //                 lib.log(leadPosition, 'new order')
    //                 await lib.setActiveSymbol(leadPosition.symbol, true)
    //                 await lib.sendMessage('new order' + JSON.stringify(leadPosition));
    //             } else {
    //                 first = false
    //             }
    //
    //         }
    //
    //         if (_.isEmpty(leadPositionOld) && _.isEmpty(leadPosition) || !_.isEmpty(leadPositionOld) && _.isEmpty(leadPosition)) {
    //             const coinTrade = await lib.read('coin');
    //             if (!coinTrade.isCopy) {
    //                 await lib.setActiveSymbol(coinTrade.symbol, true)
    //             }
    //         }
    //
    //     }
    //     lib.write(leadPosition);
    // }
}
main()



const indexRouter = require('./index');
const lib = require("./lib");
const _ = require("lodash");
// const tradeBot = require("./bot");
//
const express = require("express");
const http = require("http");
const app = express();
const port = process.env.PORT || 3000;
app.use('/', indexRouter);
app.use(express.static('log'))
app.set('port', port);
const server = http.createServer(app); // Create HTTP server.
server.listen(port); // Listen on provided port, on all network interfaces.

// tradeBot.start().then(_r => {})
lib.keepAliveServer()
async function main() {
    while(true) {
        // lấy lịch sử vị thế lưu trong db
        let leadPositionOlds = await lib.read();

        // lấy all vị thế đang có của lead trader trùng với danh sách coin cần trade

        let leadPositions = await lib.fetchCopyPositions(process.env.COPY_ID);

        // lưu lịch sử vị thế
        if (_.isEmpty(leadPositionOlds)) await lib.write(leadPositions);

        // xác định xem vị thế nào là copy
        const myPositions = await lib.detectPosition();

        // trường hợp lead và user đều có vị thế
        _.filter(myPositions, (position) => {
            if (position.isCopy == true) { // chỉ xử lý những lệnh tự động copy
                let leadPosition = _.find(leadPositions, {symbol: position.symbol});
                let leadPositionOld = _.find(leadPositionOlds, {symbol: position.symbol});

                if (!leadPosition) { // vị thế lead đã đóng => cần đóng vị thế ngay và luôn
                    let type = position.positionAmount > 0 ? 'LONG' : 'SHORT';
                    // lib.closePositionByType(type, position.symbol, Math.abs(position.positionAmount))
                } else {
                    let type = leadPosition.positionAmount > 0 ? 'LONG' : 'SHORT';
                    let oldAmount = Math.abs(leadPositionOld.positionAmount);
                    let amount = Math.abs(leadPosition.positionAmount);
                    if (amount != oldAmount) {
                        if (leadPositionOld.entryPrice == leadPosition.entryPrice) {
                            //todo cắt lãi, lỗ 1 phần isCopy = true
                            let amountChange = Math.abs(Math.abs(leadPositionOld.positionAmount) - Math.abs(position.positionAmount))
                            // lib.closePositionByType(type, position.symbol, amountChange);
                        } else { // DCA
                            //todo DCA isCopy = true
                            let markPrice = _.toNumber(leadPosition.markPrice);
                            let oldEntry = _.toNumber(leadPositionOld.entryPrice);
                            let newEntry = _.toNumber(leadPosition.entryPrice);
                            let newVol = (oldAmount*(oldEntry - newEntry ))/(newEntry - markPrice)
                            let amountChange = Math.abs(newVol).toFixed(2);
                            // lib.dcaPositionByType(type, position.symbol, amountChange);
                        }
                    }

                }
            }
        })

        lib.write(leadPositions);

        _.filter(leadPositions, (position) => {
            let leadVsUser = _.some(myPositions, (myPosition) => {
                return !myPosition.isCopy && position.symbol == myPosition.symbol
            })
            console.log(leadVsUser);
            // empty: lead có vị thế nhưng user thì không
            if (!leadVsUser) {
                //todo new order with isCopy = true
                console.log('new order');
                console.log(position);
                lib.log(position, 'new order')
                lib.setActiveSymbol(position.symbol, true)

            }
        })
    }
}
main()

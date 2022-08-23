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

async function main() {
    console.log(`Bắt đầu copy từ ID: ${process.env.COPY_ID}`);
    if (process.env.BOT_STATUS == '0') { return }
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
            await lib.write(leadPositions);
        } else {
            // lấy lịch sử vị thế lưu trong db
            const leadPositionOlds = await lib.read();

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
            if (!_.isEmpty(totalPosition)) {
                _.filter(totalPosition, async (position) => {
                    let leadPositionOld = _.find(leadPositionOlds, {symbol: position.symbol});
                    let leadPosition = _.find(leadPositions, {symbol: position.symbol});
                    let myPosition = _.find(myPositions, {symbol: position.symbol});

                    if (_.isEmpty(leadPositionOld) && !_.isEmpty(leadPosition)) { // cũ k có, mới có => đặt lệnh mới
                        let newSide = leadPosition.amount > 0 ? 'LONG' : 'SHORT';
                        let minAmount = lib.getMinQty(leadPosition, filterSymbols);
                        await lib.openPositionByType(newSide, leadPosition, minAmount, lib.getLeverageLB(leadPosition))
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
                                        let amountChange = Math.abs(myPosition.positionAmt * amountChangeRate).toFixed(3);
                                        if (amountChange == 0) amountChange = Math.abs(myPosition.positionAmt);
                                        await lib.closePositionByType(newSide, leadPosition.symbol, amountChange);
                                    }
                                } else { // DCA
                                    if (!_.isEmpty(myPosition)) { // có vị thế rồi thì DCA thêm
                                        let amountChange = Math.abs(myPosition.positionAmt * amountChangeRate).toFixed(3);
                                        if (amountChange == 0) amountChange = lib.getMinQty(myPosition, filterSymbols); // amount bằng 0 thì lấy min
                                        await lib.dcaPositionByType(newSide, leadPosition.symbol, amountChange, oldAmt, newAmt, leadPositionOld.entryPrice, leadPosition.entryPrice);
                                    } else { // chưa có thì tạo mới
                                        let minAmount = lib.getMinQty(leadPosition, filterSymbols);
                                        await lib.openPositionByType(newSide, leadPosition, minAmount, lib.getLeverageLB(leadPosition))
                                    }
                                }
                            }
                        } else { // khác chiều vị thế
                            // đóng vị thế hiện tại và mở vị thế mới
                            //đóng theo vị thế của user
                            if (!_.isEmpty(myPosition)) {
                                await lib.closePositionByType(oldSide, myPosition.symbol, Math.abs(myPosition.positionAmt), true)
                                let minAmount = lib.getMinQty(leadPosition, filterSymbols);
                                await lib.openPositionByType(newSide, leadPosition, minAmount, lib.getLeverageLB(leadPosition))
                            } else {
                                let minAmount = lib.getMinQty(leadPosition, filterSymbols);
                                await lib.openPositionByType(newSide, leadPosition, minAmount, lib.getLeverageLB(leadPosition))
                            }
                        }

                    } else if (!_.isEmpty(leadPositionOld) && _.isEmpty(leadPosition)) { // cũ có, mới không có => đóng vị thế
                        // xác định vị thế người dùng

                        if (!_.isEmpty(myPosition)) {
                            let side = myPosition.positionAmt > 0 ? 'LONG' : 'SHORT';
                            await lib.closePositionByType(side, myPosition.symbol, Math.abs(myPosition.positionAmt), true)
                        }
                    }
                })
            }

            await lib.write(leadPositions); // ghi lịch sử vị thế
        }
    }
}
main()



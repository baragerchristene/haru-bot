const {WebSocket} = require("ws");
const ctx = require("./context");
const _   = require("lodash");
const lib = require("./lib");

class BotUI {
    filterSymbols = [];
    constructor() {
        ctx.copyID = process.env.COPY_ID; // nguồn copy id
        ctx.minX = process.env.MIN_X; // giá trị ban đầu của mỗi lệnh mở vị thế
        //faster access list trading coin
        ctx.occO = _.keyBy(ctx.occQ, 'symbol');
        lib.welcome();
    }

    async getLastSession() {
        let previousSession = lib.read();
        if (!_.isEmpty(previousSession)) {
            if (previousSession.autoCopy) {
                ctx.autoCopy = previousSession.autoCopy;
            }
            if (previousSession.ignoreCoins) {
                ctx.ignoreCoins = previousSession.ignoreCoins;
            }
            if (previousSession.minX) {
                ctx.minX = previousSession.minX;
            }
            if (previousSession.copyID) {
                ctx.copyID = previousSession.copyID;
            }
        }
    }

    async autoSyncExchanges() {
        this.filterSymbols = await lib.getSymbols();
        const ws0 = new WebSocket('ws://localhost:13457');
        let syncingExchanges = false;
        ws0.on('message', async (_event) => {
            try {
                if (syncingExchanges) return; // chờ tiến trình copy cũ chạy xong
                syncingExchanges = true;
                this.filterSymbols = await lib.getSymbols();
                syncingExchanges = false;
            } catch (e) {
                console.log(e);
                syncingExchanges = false;
            }
        })
    }

    async autoBinanceCopier() {
        const ws0 = new WebSocket('ws://localhost:13456');
        let isCopying = false;
        ws0.on('message', async (_event) => {
            try {
                if (isCopying) return; // chờ tiến trình copy cũ chạy xong
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
                                let minAmount = lib.getMinQtyU(this.filterSymbols, leadPosition, leadPosition.leverage);
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
                                                let amountChange = lib.getAmountChange(this.filterSymbols, myPosition, amountChangeRate);
                                                await lib.closePositionByType(newSide, myPosition, amountChange);
                                            }
                                        } else { // DCA
                                            if (!_.isEmpty(myPosition)) { // có vị thế rồi thì DCA thêm
                                                let amountChange = lib.getAmountChange(this.filterSymbols, myPosition, amountChangeRate);
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
                                        let minAmount = lib.getMinQtyU(this.filterSymbols, leadPosition, leadPosition.leverage);
                                        await lib.openPositionByType(newSide, leadPosition, minAmount, leadPosition.leverage);
                                    } else {
                                        let minAmount = lib.getMinQtyU(this.filterSymbols, leadPosition, leadPosition.leverage);
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
                        isCopying = false;
                        return;
                    } else {
                        leadPositions = copyPosition.data;
                    }
                    ctx.positions = leadPositions;
                }
            } catch (e) {
                isCopying = false;
            }
        })
    }

}

module.exports = BotUI

const ctx = require("./context");
const lib = require("./lib");
const _   = require("lodash");

class BotUI {
    syncingEx = false;
    syncingIg = false;
    copying = false;
    invertCopying = false;
    constructor() {
        ctx.copyID = process.env.COPY_ID; // nguồn copy id
        ctx.minX = process.env.MIN_X; // giá trị ban đầu của mỗi lệnh mở vị thế
        //faster access list trading coin
        ctx.occO = _.keyBy(ctx.occQ, 'symbol');
        lib.welcome();
    }

    async getLastSession() {
        //todo
    }

    autoSyncExchanges() {
        setInterval(()=>{
            if (!this.syncingEx) {
                this.SyncExchanges();
            }
        }, 1000);
    }

    async SyncExchanges() {
        let filterSymbols = await lib.getSymbols();
        ctx.filterSymbols = filterSymbols;
        this.syncingEx = false;
    }

    autoSyncIgnores() {
        setInterval(()=>{
            if (!this.syncingIg) {
                this.SyncIgnores();
            }
        }, 1000);
    }

    async SyncIgnores() {
        let myPositions = await lib.fetchPositions();
        let openOrders = await lib.getAllOpenOrders();
        if (!_.isEmpty(myPositions)) {
            _.filter(myPositions, (position) => {
                if (position.symbol != 'BTCUSDT') {
                    // có open order thì thêm vào ignore


                    if (_.some(openOrders, {symbol: position.symbol})) {
                        if (!_.includes(ctx.ignoreCoins, position.symbol)) {
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
        this.syncingIg = false;
    }

    autoBinanceCopier() {
        setInterval(()=>{
            if (!this.copying) {
                this.BinanceCopier();
            }
        }, 1000);
    }

    async BinanceCopier() {
        try {
            if (ctx.autoCopy) {
                this.copying = true;
                // lấy lịch sử vị thế lưu trong db
                const leadPositionOlds = ctx.positions;

                // lấy all vị thế đang có của lead trader trùng với danh sách coin cần trade và lưu vào lịch sử
                const copyPosition = await lib.fetchLeaderBoardPositions(ctx.copyID);
                let leadPositions = [];
                if (copyPosition.error) {
                    this.copying = false;
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
                this.copying = false;
            } else {
                // khởi chạy vòng đầu, xóa lịch sử cũ
                // lấy all vị thế đang có của lead trader trùng với danh sách coin cần trade và lưu vào lịch sử
                const copyPosition = await lib.fetchLeaderBoardPositions(ctx.copyID);
                let leadPositions = [];
                if (copyPosition.error) {
                    this.copying = false;
                    return;
                } else {
                    leadPositions = copyPosition.data;
                }
                ctx.positions = leadPositions;
            }
        } catch (e) {
            console.log(e);
        }
    }

    autoBinanceInvertCopier() {
        setInterval(()=>{
            if (!this.invertCopying) {
                this.BinanceInvertCopier();
            }
        }, 1000);
    }

    async BinanceInvertCopier() {
        try {
            if (ctx.autoInvertCopy) {
                this.invertCopying = true;
                // lấy lịch sử vị thế lưu trong db
                const leadPositionOlds = ctx.positionsI;

                // lấy all vị thế đang có của lead trader trùng với danh sách coin cần trade và lưu vào lịch sử
                const copyPosition = await lib.fetchLeaderBoardPositions(ctx.copyIID);
                let leadPositions = [];
                if (copyPosition.error) {
                    this.invertCopying = false;
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
                this.invertCopying = false;
            } else {
                // khởi chạy vòng đầu, xóa lịch sử cũ
                // lấy all vị thế đang có của lead trader trùng với danh sách coin cần trade và lưu vào lịch sử
                const copyPosition = await lib.fetchLeaderBoardPositions(ctx.copyIID);
                let leadPositions = [];
                if (copyPosition.error) {
                    this.invertCopying = false;
                    return;
                } else {
                    leadPositions = copyPosition.data;
                }
                ctx.positionsI = leadPositions;
            }
        } catch (e) {
            console.log(e);
        }
    }




}

module.exports = BotUI

const {Telegraf} = require("telegraf");
const ctx = require("./context");
const _ = require("lodash");
const moment = require("moment-timezone");
moment.tz.setDefault("Asia/Ho_Chi_Minh");
const BinanceApi = require("./resources/binance/binance-api");
const bnApi = new BinanceApi();

const {fetchPositions, binance, fetchPositionBySymbol} = require('./resources/binance/utils');
const bot = new Telegraf(process.env.BOT_TOKEN);
const group_id = process.env.GROUP_ID;

bot.launch()
// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))

async function sendMessage(message) {
    try {
        await bot.telegram.sendMessage(group_id, message);
    } catch (error) {
        console.log('send message error');
        console.log(error);
    }
}

async function log(message) {
    const now = moment().format("DD/MM/YYYY HH:mm:ss");
    await sendMessage(`${now} => ${message}`);
}

function getTgMessage(ctxTg, command) {
    return _.replace(_.get(ctxTg, 'update.message.text'), `/${command}`, '').trim();
}

function isMe(ctxTg) {
    return _.get(ctxTg, 'update.message.from.id') == process.env.MY_TELE
}

function getPositionsStr(coins) {
    const message = _.reduce(coins, (msg, coin) => {
        let side = coin.amount > 0 ? 'LONG' : 'SHORT';
        let leverage = getLeverageLB(coin);
        let amt = (coin.markPrice*coin.amount).toFixed(3)
        msg+= `${side} ${leverage}X #${coin.symbol} ${amt}; LE: ${coin.entryPrice}; Mark: ${coin.markPrice}; uPnl: ${coin.pnl}\n`;
        return msg;
    }, '');
    return message;
}

bot.command('db', async (ctx0) => {
    if (!isMe(ctx0)) return;
    let positions = ctx.positions;
    if (!_.isEmpty(positions)) {
        await sendMessage(getPositionsStr(positions));
    } else {
        await sendMessage('Không có dữ liệu lịch sử');
    }
});

bot.command('dbi', async (ctx0) => {
    let leaderId = getTgMessage(ctx0, 'dbi');
    let response = await bnApi.fetchFutureLeaderBoardPositionsById(leaderId);
    if (response.error) {
        await sendMessage('Không lấy được dữ liệu');
    } else {
        if (!_.isEmpty(response.data)) {
            let message = getPositionsStr(response.data);
            await sendMessage(message);
        } else {
            await sendMessage('Không có dữ liệu vị thế');
        }
    }
});

bot.command('dbc', async (ctx0) => {
    if (!isMe(ctx0)) return;
    let coins = ctx.positions;
    let symbol = getTgMessage(ctx0, 'dbc');
    symbol = _.toString(symbol).toUpperCase().trim();
    let coin = _.find(coins, {symbol});
    if (!_.isEmpty(coin)) {
        let side = coin.amount > 0 ? 'LONG' : 'SHORT';
        let leverage = getLeverageLB(coin);
        let amt = (coin.markPrice*coin.amount).toFixed(3)
        let message = `${side} ${leverage}X #${coin.symbol} ${amt}; LE: ${coin.entryPrice}; Mark: ${coin.markPrice}; uPnl: ${coin.pnl}\n`;
        await sendMessage(message);
    } else {
        await sendMessage('Không có dữ liệu lịch sử');
    }
});

bot.command('pnl', async (ctx) => {
    if (!isMe(ctx)) return;
    let positions = await fetchPositions();
    let pnl = 0;
    if (!_.isEmpty(positions)) {
        pnl = _.reduce(positions, (result, coin) => {
            result += _.toNumber(coin.unRealizedProfit);
            return result;
        }, 0)
    }
    await sendMessage(`Current uPNL total ${pnl.toFixed(3)}`);
});

bot.command('lpnl', async (ctx0) => {
    if (!isMe(ctx0)) return;
    let coins = ctx.positions;
    let pnl = 0;
    if (!_.isEmpty(coins)) {
        pnl = _.reduce(coins, (result, coin) => {
            result += _.toNumber(coin.pnl);
            return result;
        }, 0)
    }
    await sendMessage(`Current Leader uPNL total ${pnl.toFixed(3)}`);
});

bot.command('ps', async (ctx) => {
    if (!isMe(ctx)) return;
    let positions = await fetchPositions();
    if (!_.isEmpty(positions)) {
        let message = _.reduce(positions, (msg, coin) => {
            let side = coin.positionAmt > 0 ? 'LONG' : 'SHORT';
            let amt = (coin.markPrice*coin.positionAmt).toFixed(3)
            msg+= `${side} ${coin.leverage}X #${coin.symbol} ${amt}; E: ${coin.entryPrice}; M: ${coin.markPrice}; uPnl: ${coin.unRealizedProfit}\n`;
            return msg;
        }, '')
        await sendMessage(message);
    } else {
        await sendMessage('Không có vị thế nào!');
    }
});

bot.command('ss', async () => {
    await sendMessage(`Trạng thái bot hiện tại: ${process.env.BOT_STATUS == '0' ? 'tạm dừng scan' : 'đang chạy'}`);
});

bot.command('xa', async (ctx0) => {
    if (!isMe(ctx0)) return;
    let symbol = getTgMessage(ctx0, 'xa');
    symbol = _.toString(symbol).toUpperCase().trim();
    if (!symbol || symbol == '') {
        await sendMessage(`Coin không hợp lệ!`);
        return;
    }
    let rawPosition = await fetchPositionBySymbol(symbol);
    let position = {};
    if (_.isEmpty(rawPosition)) {
        await sendMessage(`Vị thế không tồn tại`);
        return;
    } else {
        position = rawPosition[0];
        let type = position.positionAmt > 0 ? 'LONG' : 'SHORT';
        let amount = Math.abs(position.positionAmt);
        if (type == 'LONG') {
            await binance.futuresMarketSell(symbol, amount);
        } else {
            await binance.futuresMarketBuy(symbol, amount);
        }
        await sendMessage(`Vị thế ${type} đã đóng, last Pnl: ${position.unRealizedProfit}` );
    }
});

bot.command('h', async (ctx0) => {
    if (!isMe(ctx0)) return;
    let helpMessage = '/ss Xem trạng thái của bot \n' +
    '/db Xem vị thế của Leader \n' +
    '/ps Xem vị thế của bạn \n' +
    '/pnl Xem tổng lỗ lãi của bạn \n' +
    '/lpnl Xem tổng lỗ lãi của Leader \n' +
    '/xa {tên coin} đóng vị thế của coin theo lệnh thị trường \n' +
    '/dbc {tên coin} xem vị thế từng coin riêng của leader \n' +
    '/xtp {tên coin} {số lượng} {giá stop}, đặt TP cho coin';
    await sendMessage(helpMessage);
});

function getLeverageLB(coin) {
    return _.toNumber(Math.abs((coin.roe*(coin.amount*1*coin.markPrice))/coin.pnl).toFixed(0));
}

module.exports = {sendMessage, log}

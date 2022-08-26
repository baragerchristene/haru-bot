const {Telegraf} = require("telegraf");
const ctx = require("./context");
const _ = require("lodash");
const moment = require("moment-timezone");
moment.tz.setDefault("Asia/Ho_Chi_Minh");

const {fetchPositions} = require('./resources/binance/utils');

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

bot.command('db2', async (ctx0) => {
    if (!isMe(ctx0)) return;
    let coins = ctx.positions;
    if (!_.isEmpty(coins)) {
        let message = _.reduce(coins, (msg, coin) => {
            let side = coin.positionAmount > 0 ? 'LONG' : 'SHORT';
            let amt = (coin.markPrice*coin.positionAmount).toFixed(3)
            msg+= `${side} ${coin.symbol} ${amt}; LE: ${coin.entryPrice}; Mark: ${coin.markPrice}; uPnl: ${coin.unrealizedProfit}\n`;
            return msg;
        }, '')
        await sendMessage(message);
    } else {
        await sendMessage('Không có dữ liệu lịch sử');
    }
});

bot.command('db', async (ctx0) => {
    if (!isMe(ctx0)) return;
    let coins = ctx.positions;
    if (!_.isEmpty(coins)) {
        let message = _.reduce(coins, (msg, coin) => {
            let side = coin.amount > 0 ? 'LONG' : 'SHORT';
            let amt = (coin.markPrice*coin.amount).toFixed(3)
            msg+= `${side} #${coin.symbol} ${amt}; LE: ${coin.entryPrice}; Mark: ${coin.markPrice}; uPnl: ${coin.pnl}\n`;
            return msg;
        }, '')
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

bot.command('ps', async (ctx) => {
    if (!isMe(ctx)) return;
    let positions = await fetchPositions();
    if (!_.isEmpty(positions)) {
        let message = _.reduce(positions, (msg, coin) => {
            let side = coin.positionAmt > 0 ? 'LONG' : 'SHORT';
            let amt = (coin.markPrice*coin.positionAmt).toFixed(3)
            msg+= `${side} #${coin.symbol} ${amt}; E: ${coin.entryPrice}; M: ${coin.markPrice}; uPnl: ${coin.unRealizedProfit}\n`;
            return msg;
        }, '')
        await sendMessage(message);
    } else {
        await sendMessage('Không có vị thế nào!');
    }
});

bot.command('bot', async (ctx0) => {
    if (!isMe(ctx)) return;
    let running = getTgMessage(ctx0, 'bot') == '1';
    ctx.trigger = running;
    await sendMessage(`Trạng thái bot mới: ${running ? 'đang chạy' : 'đã tắt'}`);
});

bot.command('stt', async () => {
    await sendMessage(`Trạng thái bot hiện tại: ${ctx.trigger ? 'đang chạy' : 'đã tắt'}`);
});

module.exports = {sendMessage, log}

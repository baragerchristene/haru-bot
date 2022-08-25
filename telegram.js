const {Telegraf} = require("telegraf");
const ctx = require("./context");
const lib = require("./lib");
const _ = require("lodash");
const bot = new Telegraf(process.env.BOT_TOKEN);
const group_id = process.env.GROUP_ID;
bot.launch()
// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))

async function sendTeleMessage(message) {
    await bot.telegram.sendMessage(group_id, message);
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
        await sendTeleMessage(message);
    } else {
        await sendTeleMessage('Không có dữ liệu lịch sử');
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
        await sendTeleMessage(message);
    } else {
        await sendTeleMessage('Không có dữ liệu lịch sử');
    }
});

bot.command('pnl', async (ctx) => {
    if (!isMe(ctx)) return;
    let positions = await lib.fetchPositions();
    let pnl = 0;
    if (!_.isEmpty(positions)) {
        pnl = _.reduce(positions, (result, coin) => {
            result += _.toNumber(coin.unRealizedProfit);
            return result;
        }, 0)
    }
    await sendTeleMessage(`Current uPNL total ${pnl.toFixed(3)}`);
});

bot.command('ps', async (ctx) => {
    if (!isMe(ctx)) return;
    let positions = await lib.fetchPositions();
    if (!_.isEmpty(positions)) {
        let message = _.reduce(positions, (msg, coin) => {
            let side = coin.positionAmt > 0 ? 'LONG' : 'SHORT';
            let amt = (coin.markPrice*coin.positionAmt).toFixed(3)
            msg+= `${side} ${coin.symbol} ${amt}; E: ${coin.entryPrice}; M: ${coin.markPrice}; uPnl: ${coin.unRealizedProfit}\n`;
            return msg;
        }, '')
        await sendTeleMessage(message);
    } else {
        await sendTeleMessage('Không có vị thế nào!');
    }
});

bot.command('bot', async (ctx0) => {
    let running = getTgMessage(ctx0, 'bot') == '1';
    ctx.trigger = running;
    await sendTeleMessage(`Trạng thái bot mới: ${running ? 'đang chạy' : 'đã tắt'}`);
});

bot.command('stt', async () => {
    await sendTeleMessage(`Trạng thái bot hiện tại: ${ctx.trigger ? 'đang chạy' : 'đã tắt'}`);
});

module.exports = {sendTeleMessage}

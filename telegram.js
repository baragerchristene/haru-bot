const {Telegraf} = require("telegraf");
var ctx = require("./context");
const _ = require("lodash");
const moment = require("moment-timezone");
moment.tz.setDefault("Asia/Ho_Chi_Minh");
const BinanceApi = require("./resources/binance/binance-api");
const bnApi = new BinanceApi();
const fetch = require("node-fetch");
const {fetchPositions, binance, fetchPositionBySymbol, getMarkPrice, getBalance} = require('./resources/binance/utils');
const bot = new Telegraf(process.env.BOT_TOKEN);
const group_id = process.env.GROUP_ID;

bot.launch()
// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))

async function sendMessage(message) {
    try {
        let messages = stringToChunks(message, 4096);
        for(let msg of messages) {
            await bot.telegram.sendMessage(group_id, msg);
        }
    } catch (error) {
        console.log('send message error');
        console.log(error);
    }
}

function stringToChunks(string, chunkSize) {
    const chunks = [];
    while (string.length > 0) {
        chunks.push(string.substring(0, chunkSize));
        string = string.substring(chunkSize, string.length);
    }
    return chunks
}

async function log(message) {
    const now = moment().format("DD/MM/YYYY HH:mm:ss");
    await sendMessage(`${message}\n⏰ ${now}`);
}

function getTgMessage(ctxTg, command) {
    return _.replace(_.get(ctxTg, 'update.message.text'), `/${command}`, '').trim();
}

function isMe(ctxTg) {
    return _.get(ctxTg, 'update.message.from.id') == process.env.MY_TELE
}

function getPositionsStr(coins) {
    const message = _.reduce(coins, (msg, coin) => {
        if (!coin.amount) coin.amount = coin.positionAmount
        if (!coin.pnl) coin.pnl = coin.unrealizedProfit
        let side = coin.amount > 0 ? 'LONG' : 'SHORT';
        let leverage = 0;
        !coin.leverage ? leverage = getLeverageLB(coin) : leverage = coin.leverage
        let amt = (coin.markPrice*coin.amount).toFixed(3);
        let roe = leadRoe(coin, leverage);
        msg+= `${side} ${leverage}X #${coin.symbol} ${amt}; LE: ${coin.entryPrice}; Mark: ${coin.markPrice}; uPnl: ${coin.pnl}; roe: ${roe}%\n`;
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

function leadRoe(position, leverage) {
    let direction = 1;
    if (position.amount > 0) {
        direction = 1;
    } else {
        direction = -1;
    }
    let uPnlUSDT = position.amount*direction*(position.markPrice - position.entryPrice);
    let entryMargin = position.amount*position.markPrice*(1/leverage)
    let roe = ((uPnlUSDT/entryMargin)*100).toFixed(2);
    return roe
}

bot.command('dbc', async (ctx0) => {
    if (!isMe(ctx0)) return;
    let coins = ctx.positions;
    let symbol = getTgMessage(ctx0, 'dbc');
    symbol = _.toString(symbol).toUpperCase().trim();
    let coin = _.find(coins, {symbol});
    if (!_.isEmpty(coin)) {
        let side = coin.amount > 0 ? 'LONG' : 'SHORT';
        let leverage = getLeverageLB(coin);
        let amt = (coin.markPrice*coin.amount).toFixed(3);
        let roe = leadRoe(coin, leverage);
        let message = `${side} ${leverage}X #${coin.symbol} ${amt}; LE: ${coin.entryPrice}; Mark: ${coin.markPrice}; uPnl: ${coin.pnl}; roe: ${roe}%\n`;
        await sendMessage(message);
    } else {
        await sendMessage('Không có dữ liệu lịch sử');
    }
});

bot.command('pnl', async (ctx0) => {
    if (!isMe(ctx0)) return;
    let positions = await fetchPositions();
    let pnl = 0;
    if (!_.isEmpty(positions)) {
        pnl = _.reduce(positions, (result, coin) => {
            result += _.toNumber(coin.unRealizedProfit);
            return result;
        }, 0)
    }

    let list = _.values(ctx.occO);
    let tp = 0;
    let sl = 0;
    let ext = _.reduce(list, (result, item) => {
        tp+=item.tp; sl+=item.sl;
        result+= `${item.symbol} TP: ${item.tp} SL: ${item.sl}, `; return result;
    }, '');

    await sendMessage(`Current uPNL total ${pnl.toFixed(3)}\n${ext}\n TPA: ${tp} | SLA: ${sl}`);
});

bot.command('lpnl', async (ctx0) => {
    if (!isMe(ctx0)) return;
    let coins = ctx.positions;
    let pnl = 0;
    if (!_.isEmpty(coins)) {
        pnl = _.reduce(coins, (result, coin) => {
            if (!coin.pnl) coin.pnl = coin.unrealizedProfit;
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
            let side = '';
            let direction;
            if (coin.positionAmt > 0) {
                side = 'LONG';
                direction = 1;
            } else {
                side = 'SHORT';
                direction = -1;
            }
            let amt = (coin.markPrice*coin.positionAmt).toFixed(3);
            let uPnlUSDT = coin.positionAmt*direction*(coin.markPrice - coin.entryPrice);
            let entryMargin = coin.positionAmt*coin.markPrice*(1/coin.leverage)
            let roe = ((uPnlUSDT/entryMargin)*100).toFixed(2);
            msg+= `${side} ${coin.leverage}X #${coin.symbol} ${amt}; E: ${coin.entryPrice}; M: ${coin.markPrice}; ${coin.unRealizedProfit > 0 ? '🟢':'🔴'} uPnl: ${coin.unRealizedProfit}; roe: ${roe}%\n`;
            return msg;
        }, '')
        await sendMessage(message);
    } else {
        await sendMessage('Không có vị thế nào!');
    }
});

bot.command('as', async (ctx0) => {
    if (!isMe(ctx0)) return;
    let balance = await getBalance();
    let diff = balance - _.toNumber(ctx.lastBalance);
    let change = diff > 0 ? '📉' : '📈';
    ctx.lastBalance = balance;
    await log(`Current #balance is $${balance}\n${change} ${diff}`);
});

bot.command('ss', async () => {
    let occMsg = _.reduce(ctx.occQ, (result, coin) => {
        result+= `${coin.symbol} (${coin.quantity}, ${coin.running ? 'bật':'tắt'}), `;
        return result;
    }, '');

    let msg = `Trạng thái bot copy hiện tại: ${ctx.autoCopy ? 'đang chạy' : 'đã tắt'} (Fixed Vol ~ ${ctx.minX}USDT)\n` +
        `COPY_ID: ${ctx.copyID}\nCopy Mode: ${ctx.inverseCopy ? 'ngược':'thuận'}\n` +
        `Auto OCCTP & Size: ${occMsg}\n` +
        `Danh sách coin không copy: ${ctx.ignoreCoins.join(', ')}\n` +
        `Total profit: ${ctx.profit}`
    await sendMessage(msg);
});

bot.command('ltr', async (ctx0) => {
    if (!isMe(ctx0)) return;
    ctx.liquidTrade = getTgMessage(ctx0, 'ltr') == '1';
    await sendMessage(`Tự động trade theo liquid: ${ctx.liquidTrade ? 'bật' : 'tắt'}`);
});

bot.command('atp', async (ctx0) => {
    if (!isMe(ctx0)) return;
    ctx.autoTP = getTgMessage(ctx0, 'atp') == '1';
    await sendMessage(`Tự động chốt lãi: ${ctx.autoTP ? 'bật' : 'tắt'}`);
});

bot.command('atc', async (ctx0) => {
    if (!isMe(ctx0)) return;
    ctx.autoCopy = getTgMessage(ctx0, 'atc') == '1';
    await sendMessage(`Bot copy trade: ${ctx.autoCopy ? 'bật' : 'tắt'}`);
});

bot.command('occ', async (ctx0) => {
    if (!isMe(ctx0)) return;
    ctx.occ = getTgMessage(ctx0, 'occ') == '1';
    _.filter(ctx.occQ, (coin) => {
        coin.running = ctx.occ;
        return coin;
    })
    //faster access list trading coin
    ctx.occO = _.reduce(ctx.occQ, (result, coin) => {
        _.set(result, coin.symbol, coin);
        return result;
    }, {});
    await sendMessage(`Bot OCC trade: ${ctx.occ ? 'đã bật tất cả' : 'đã tắt tất cả'}`);
});

bot.command('cmode', async (ctx0) => {
    if (!isMe(ctx0)) return;
    ctx.inverseCopy = getTgMessage(ctx0, 'cmode') == '1';
    await sendMessage(`Chê độ copy: ${ctx.inverseCopy ? 'ngược' : 'thuận'}`);
});

bot.command('add', async (ctx0) => {
    if (!isMe(ctx0)) return;
    let newSymbol = getTgMessage(ctx0, 'add').trim().toUpperCase();
    if (newSymbol && newSymbol != '') {
        if (_.includes(ctx.ignoreCoins, newSymbol)) {
            ctx.ignoreCoins = _.filter(ctx.ignoreCoins, (coin) => { if (coin != newSymbol) return coin })
            await sendMessage(`Coin ${newSymbol} đã xóa khỏi danh sách bỏ qua`);
        } else {
            await sendMessage(`Coin ${newSymbol} không nằm trong danh sách bỏ qua`);
        }
    } else await sendMessage(`Ký tự không hợp lệ`);
});

bot.command('ig', async (ctx0) => {
    if (!isMe(ctx0)) return;
    let newSymbol = getTgMessage(ctx0, 'ig').trim().toUpperCase();
    if (newSymbol && newSymbol != '') {
        if (_.includes(ctx.ignoreCoins, newSymbol)) {
            await sendMessage(`Coin ${newSymbol} đã có trong danh sách bỏ qua`);
        } else {
            ctx.ignoreCoins.push(newSymbol);
            await sendMessage(`Coin ${newSymbol} đã được thêm vào danh sách bỏ qua`);
        }
    } else await sendMessage(`Ký tự không hợp lệ`);
});

bot.command('mintp', async (ctx0) => {
    if (!isMe(ctx0)) return;
    let min = _.toNumber(Number(getTgMessage(ctx0, 'mintp')).toFixed(0));
    if (!min || min == 0) {
        ctx.minTP = 50;
    } else {
        ctx.minTP = min;
    }
    await sendMessage(`Khoảng cách giá để TP: ${ctx.minTP}`);
});

bot.command('cid', async (ctx0) => {
    if (!isMe(ctx0)) return;
    let copyID = getTgMessage(ctx0, 'cid');
    if (copyID && copyID != '') {
        ctx.autoCopy = false
        // chờ 10s
        await delay(3000)
        ctx.copyID = copyID;
        // chờ 1s
        await delay(1000)
        ctx.autoCopy = true
        await sendMessage(`Copy ID mới là ${ctx.copyID}`);
    } else {
        await sendMessage(`Copy ID không hợp lệ!`);
    }
});

bot.command('vol', async (ctx0) => {
    if (!isMe(ctx0)) return;
    let minX = _.toNumber(Number(getTgMessage(ctx0, 'vol')).toFixed(0));
    if (minX > 0) {
        ctx.minX = minX;
        await sendMessage(`Min copy vol từng lệnh mới là ${ctx.minX}USDT`);
    } else {
        await sendMessage(`Min copy vol không hợp lệ!`);
    }
});

// eg: occq btcusdt 0.001
bot.command('occq', async (ctx0) => {
    if (!isMe(ctx0)) return;
    let msg = _.toString(getTgMessage(ctx0, 'occq')).toUpperCase();
    let vars = msg.split(' ');
    if (vars.length == 2) {
        let symbol = _.nth(vars, 0).toUpperCase();
        let quantity = _.toNumber(_.nth(vars, 1));
        let pair = _.find(ctx.occQ, {symbol: symbol});
        if (_.isEmpty(pair)) {
            await sendMessage(`Pair không hỗ trợ!`);
        } else {
            if (quantity <= 0) {
                await sendMessage(`Số lượng không được nhỏ hơn 0`);
            } else {
                _.filter(ctx.occQ, (coin) => {
                    if (coin.symbol == symbol) {
                        coin.quantity = quantity;
                    }
                    return coin;
                })
                //faster access list trading coin
                ctx.occO = _.reduce(ctx.occQ, (result, coin) => {
                    _.set(result, coin.symbol, coin);
                    return result;
                }, {});

                await sendMessage(`Min copy vol OCC từng lệnh mới của ${symbol} là ${quantity}`);
            }
        }

    } else {
        await sendMessage(`Số lượng tham số không hợp lệ!`);
    }
});

// eg: occa apeusdt 0.001
bot.command('occa', async (ctx0) => {
    if (!isMe(ctx0)) return;
    let msg = _.toString(getTgMessage(ctx0, 'occa')).toUpperCase();
    let vars = msg.split(' ');
    if (vars.length == 2) {
        let symbol = _.nth(vars, 0).toUpperCase();
        let quantity = _.toNumber(_.nth(vars, 1));
        let pair = _.find(ctx.occQ, {symbol: symbol});
        if (_.isEmpty(pair)) {
            if (quantity <= 0) {
                await sendMessage(`Số lượng không được nhỏ hơn 0`);
            } else {
                ctx.occQ.push({symbol: symbol, quantity: quantity, running: true},)
                //faster access list trading coin
                ctx.occO = _.reduce(ctx.occQ, (result, coin) => {
                    _.set(result, coin.symbol, coin);
                    return result;
                }, {});
                await fetch(`http://localhost:${process.env.PORT}/occa`, {
                    method: 'post',
                    body: JSON.stringify({symbol, quantity}),
                    headers: {'Content-Type': 'application/json'}
                });
            }
        } else {
            await sendMessage(`Pair đã tồn tại!`);
        }

    } else {
        await sendMessage(`Số lượng tham số không hợp lệ!`);
    }
});

// eg: occr btcusdt 1
bot.command('occr', async (ctx0) => {
    if (!isMe(ctx0)) return;
    let msg = _.toString(getTgMessage(ctx0, 'occr')).toUpperCase();
    let vars = msg.split(' ');
    if (vars.length == 2) {
        let symbol = _.nth(vars, 0).toUpperCase();
        let running = _.toNumber(_.nth(vars, 1)) == 1;
        let pair = _.find(ctx.occQ, {symbol: symbol});
        if (_.isEmpty(pair)) {
            await sendMessage(`Pair không hỗ trợ!`);
        } else {
            _.filter(ctx.occQ, (coin) => {
                if (coin.symbol == symbol) {
                    coin.running = running;
                }
                return coin;
            })
            //faster access list trading coin
            ctx.occO = _.reduce(ctx.occQ, (result, coin) => {
                _.set(result, coin.symbol, coin);
                return result;
            }, {});
            await sendMessage(`Trạng thái OCC của ${symbol}: ${running ? 'bật' : 'tắt'}`);
        }

    } else {
        await sendMessage(`Số lượng tham số không hợp lệ!`);
    }
});

bot.command('ll', async (ctx0) => {
    let result = ctx.lastLiquid;
    if (_.isEmpty(result)) {
        await sendMessage(`Không có dữ liệu!`);
    } else {
        let originalQuantity = result.o.q;
        let averagePrice = result.o.ap;
        let totalValue = originalQuantity * averagePrice;
        let symbol = result.o.s;
        let side = result.o.S == 'BUY' ? 'SHORT': 'LONG';
        let liquidTradeMsg = `Last: ${side} #${symbol} at ${averagePrice}; Liquidated: $${kFormatter(totalValue)}`;
        await sendMessage(liquidTradeMsg);
    }
});

function kFormatter(num) {
    return Math.abs(num) > 999 ? Math.sign(num) * ((Math.abs(num) / 1000).toFixed(1)) + 'K' : Math.sign(num) * Math.abs(num)
}

bot.command('p', async (ctx0) => {
    let symbol = (`${getTgMessage(ctx0, 'p')}USDT`).toUpperCase();
    const coin = await getMarkPrice(symbol);
    if (_.isEmpty(coin)) {
        const btc = await getMarkPrice('BTCUSDT');
        await sendMessage(`${btc.symbol}; Mark Price: ${btc.markPrice}; Leverage: ${btc.leverage}`);
    } else {
        await sendMessage(`${coin.symbol}; Mark Price: ${coin.markPrice}; Leverage: ${coin.leverage}`);
    }
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

bot.command('lp', async (ctx0) => {
    if (!isMe(ctx0)) return;
    let lastPnl = getTgMessage(ctx0, 'lp');
    lastPnl = _.toNumber(lastPnl);
    ctx.profit+= lastPnl;
    await sendMessage(`Đã cập nhật chính xác TP: ${ctx.profit}`);
});

// ctx.profit

bot.command('tpsl', async (ctx0) => {
    if (!isMe(ctx0)) return;
    let msg = _.toString(getTgMessage(ctx0, 'tpsl')).toUpperCase();
    let vars = msg.split(' ');
    if (vars.length == 3) {
        let type = _.nth(vars, 0);
        let symbol = _.nth(vars, 1);
        let stopPrice = _.toNumber(_.nth(vars, 2));
        let rawPosition = await fetchPositionBySymbol(symbol);
        let position = {};
        if (_.isEmpty(rawPosition)) {
            await sendMessage(`Vị thế không tồn tại để TP/SL`);
            return;
        }
        position = rawPosition[0];
        let side = position.positionAmt > 0 ? 'LONG' : 'SHORT';
        let amount = Math.abs(position.positionAmt);

        let orderType = '';
        if (type == 'TP') orderType = 'TAKE_PROFIT_MARKET'
        if (type == 'SL') orderType = 'STOP_MARKET'
        let rs = {}

        // cancel all previous order
        let openOrders = await binance.futuresOpenOrders(symbol);
        _.filter(openOrders, async (order) => {
            if (order.type == orderType) {
                await binance.futuresCancel(symbol, {orderId: order.orderId});
            }
        })
        if (side == 'LONG') {
            rs = await binance.futuresMarketSell(symbol, amount, {stopPrice: stopPrice, reduceOnly: true, type: orderType, timeInForce: 'GTE_GTC', workingType: 'MARK_PRICE'});
        } else {
            rs = await binance.futuresMarketBuy(symbol, amount, {stopPrice: stopPrice, reduceOnly: true, type: orderType, timeInForce: 'GTE_GTC', workingType: 'MARK_PRICE'});
        }
        await sendMessage(`Đã đặt ${type} cho ${symbol} thành công tại giá ${stopPrice}`);
    } else {
        await sendMessage(`Số lượng tham số không phù hợp ${vars.length}/3`);
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
    '/tpsl {loại lệnh tp hoặc sl} {tên coin} {giá stop}, đặt TP Market cho coin';
    await sendMessage(helpMessage);
});

function getLeverageLB(coin) {
    return _.toNumber(Math.abs((coin.roe*(coin.amount*1*coin.markPrice))/coin.pnl).toFixed(0));
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

module.exports = {sendMessage, log}

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
const FuturesHeroesApi = require("./resources/trader-wagon/futures-heroes-api");
const fthApi = new FuturesHeroesApi();

bot.launch()

const fs = require('fs');

function read(file= 'config') {
    try {
        const data = fs.readFileSync(`./${file}.json`, 'utf8');
        // parse JSON string to JSON object
        return JSON.parse(data);
    } catch (err) {
        log(`Error reading file from disk: ${err}`).then(r => {});
    }
}

function write(data = {}, file = 'config') {
    try {
        // convert JSON object to a string
        const raw = JSON.stringify(data, null, 4);
        // write file to disk
        fs.writeFileSync(`./${file}.json`, raw, 'utf8');
    } catch (err) {
        log(`Error writing file: ${err}`).then(r => {});
    }
}

// Enable graceful stop
// process.once('SIGINT', () => bot.stop('SIGINT'))
// process.once('SIGTERM', () => bot.stop('SIGTERM'))

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

async function sendOriginMessage(message) {
    try {
        await bot.telegram.sendMessage(group_id, message);
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
    let total = 0;
    coins = _.orderBy(coins, ['updateTimeStamp'], ['desc']);
    let message = _.reduce(coins, (msg, coin) => {
        if (!coin.amount) coin.amount = coin.positionAmount
        if (!coin.pnl) coin.pnl = coin.unrealizedProfit
        let side = coin.amount > 0 ? 'LONG' : 'SHORT';
        let leverage = 0;
        !coin.leverage ? leverage = getLeverageLB(coin) : leverage = coin.leverage
        let amt = `${kFormatter(coin.markPrice*coin.amount/leverage)} USDT`;
        let roe = leadRoe(coin, leverage);

        msg+= `${side} ${leverage}X #${coin.symbol} ${amt}\n` +
        `Entry: ${coin.entryPrice}\n` +
        `Mark: ${coin.markPrice}\n` +
        `${coin.pnl > 0 ? '🟢':'🔴'} uPNL (ROE%): ${Number(coin.pnl).toFixed(2)}(${roe}%)\n`
        if (coin.updateTimeStamp) {
            msg+= `Updated on: ${moment(coin.updateTimeStamp).format('DD/MM/yyyy HH:mm:ss')}\n`
        }

        msg+= '___________________________________\n'
        total+=coin.pnl;
        return msg;
    }, '');
    message+= `Total PNL: ${total.toFixed(2)} USDT`
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

bot.command('idb', async (ctx0) => {
    if (!isMe(ctx0)) return;
    let positions = ctx.positionsI;
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

bot.command('dti', async (ctx0) => {
    let leaderId = getTgMessage(ctx0, 'dti');
    let response = await fthApi.getPositions(leaderId);
    let positions = response.data;

    if (_.isEmpty(positions)) {
        await sendMessage('Không có dữ liệu');
    } else {
        let arr1 = _.filter(positions, (item) => {
            return item.pnl > 0
        })
        let result = _.countBy(arr1, 'symbol');
        console.log(result);
        if (_.isEmpty(result)) {
            await sendMessage('Không có lệnh thắng');
        } else {
            await sendOriginMessage(result);
        }
    }
});

bot.command('ldb', async (ctx0) => {
    let data = await bnApi.getLeaderboardRank();
    if (_.isEmpty(data)) {
        await sendMessage('Không lấy được dữ liệu');
    } else {
        if (!_.isEmpty(data)) {
            let msg = _.reduce(data, (msgs, user) => {
                msgs+= `Rank: ${user.rank} | ROE: ${(user.value*100).toFixed(2)}%\nID: ${user.encryptedUid}\nName: ${user.nickName}\n`;
                msgs+= '___________________________________\n'
                return msgs
            }, '')
            await sendMessage(msg);
        } else {
            await sendMessage('Không có dữ liệu');
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

function leadRoe2(position) {
    let direction = 1;
    if (position.positionAmt > 0) {
        direction = 1;
    } else {
        direction = -1;
    }
    let uPnlUSDT = position.positionAmt*direction*(position.markPrice - position.entryPrice);
    let entryMargin = position.positionAmt*position.markPrice*(1/position.leverage)
    return ((uPnlUSDT/entryMargin)*100)
}

bot.command('dbc', async (ctx0) => {
    if (!isMe(ctx0)) return;
    let coins = ctx.positions;
    let symbol = getTgMessage(ctx0, 'dbc');
    symbol = _.toString(symbol).toUpperCase().trim();
    let coin = _.find(coins, {symbol});
    if (!_.isEmpty(coin)) {
        let side = coin.amount > 0 ? 'LONG' : 'SHORT';
        let leverage = coin.leverage;
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
    let roe = 0;
    if (!_.isEmpty(positions)) {
        pnl = _.reduce(positions, (result, coin) => {
            result += _.toNumber(coin.unRealizedProfit);
            roe+= leadRoe2(coin);
            return result;
        }, 0)
    }
    await sendMessage(`Current uPNL total ${pnl.toFixed(3)} | ${roe.toFixed(2)}%`);
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
            let amt = kFormatter((coin.markPrice*coin.positionAmt)/coin.leverage);
            let uPnlUSDT = coin.positionAmt*direction*(coin.markPrice - coin.entryPrice);
            let entryMargin = coin.positionAmt*coin.markPrice*(1/coin.leverage)
            let roe = ((uPnlUSDT/entryMargin)*100).toFixed(2);
            msg+= `${side} ${coin.leverage}X #${coin.symbol} ${amt} USDT; E: ${coin.entryPrice}; M: ${coin.markPrice}; ${coin.unRealizedProfit > 0 ? '🟢':'🔴'} uPNL(ROE): ${Number(coin.unRealizedProfit).toFixed(2)}(${roe}%)\n`;
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
    let msg = `Copy XX: ${ctx.autoCopy ? '🟢':'🔴'} Fixed Vol ~ ${ctx.minX}USDT\n` +
        `Copy XY: ${ctx.autoInvertCopy ? '🟢':'🔴'} Fixed Vol ~ ${ctx.minX}USDT\n` +
        `ID: ${ctx.copyID}\n` +
        `IID: ${ctx.copyIID}\n(ITP: ${(ctx.itp*100).toFixed(2)})%\n` +
        `Danh sách coin không copy: ${ctx.ignoreCoins.join(', ')}\n` +
        `Total PNL: ${ctx.profit.toFixed(2)} USDT`
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
    let session = read();
    if (_.isEmpty(session)) session = {}
    session.autoCopy = ctx.autoCopy;
    write(session);
    await sendMessage(`Bot copy trade: ${ctx.autoCopy ? 'bật' : 'tắt'}`);
});

bot.command('atci', async (ctx0) => {
    if (!isMe(ctx0)) return;
    ctx.autoInvertCopy = getTgMessage(ctx0, 'atci') == '1';
    await sendMessage(`Bot copy trade ngược: ${ctx.autoInvertCopy ? 'bật' : 'tắt'}`);
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
            let session = read();
            if (_.isEmpty(session)) session = {}
            session.ignoreCoins = ctx.ignoreCoins;
            write(session);
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
            let session = read();
            if (_.isEmpty(session)) session = {}
            session.ignoreCoins = ctx.ignoreCoins;
            write(session);
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
        let session = read();
        if (_.isEmpty(session)) session = {}
        session.copyID = ctx.copyID;
        write(session);
        await sendMessage(`Copy ID mới là ${ctx.copyID}`);
    } else {
        await sendMessage(`Copy ID không hợp lệ!`);
    }
});

bot.command('ciid', async (ctx0) => {
    if (!isMe(ctx0)) return;
    let copyID = getTgMessage(ctx0, 'ciid');
    if (copyID && copyID != '') {
        ctx.autoInvertCopy = false
        // chờ 10s
        await delay(3000)
        ctx.copyIID = copyID;
        // chờ 1s
        await delay(1000)
        ctx.autoInvertCopy = true
        await sendMessage(`Copy IID mới là ${ctx.copyIID}`);
    } else {
        await sendMessage(`Copy IID không hợp lệ!`);
    }
});

bot.command('vol', async (ctx0) => {
    if (!isMe(ctx0)) return;
    let minX = _.toNumber(Number(getTgMessage(ctx0, 'vol')).toFixed(0));
    if (minX > 0) {
        ctx.minX = minX;
        let session = read();
        if (_.isEmpty(session)) session = {}
        session.minX = ctx.minX;
        write(session);
        await sendMessage(`Min copy vol từng lệnh mới là ${ctx.minX}USDT`);
    } else {
        await sendMessage(`Min copy vol không hợp lệ!`);
    }
});

bot.command('itp', async (ctx0) => {
    if (!isMe(ctx0)) return;
    let itp = _.toNumber(getTgMessage(ctx0, 'itp'));
    if (itp > 0) {
        ctx.itp = itp;
        await sendMessage(`Min TP từng lệnh mới là ${ctx.itp}%`);
    } else {
        await sendMessage(`Min TP không hợp lệ!`);
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

bot.command('cfg', async (_ctx) => {
    let previousSession = read();
    await sendOriginMessage(previousSession);
});

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

function kFormatter(num) {
    return Math.abs(num) > 999 ? Math.sign(num) * ((Math.abs(num) / 1000).toFixed(2)) + 'K' : (Math.sign(num) * Math.abs(num)).toFixed(2)
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

module.exports = {sendMessage, log}

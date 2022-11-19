var express = require('express');
var router = express.Router();
const lib = require("./lib");
var bodyParser = require('body-parser')
const _ = require("lodash");
var jsonParser = bodyParser.json();
var bot = require('./bot');

/* GET ping page. */
router.get('/ping', function (_req, res, _next) {
  res.json({message: 'pong'});
  res.end();
});

router.get('/', function (_req, res, _next) {
  res.json({message: 'Welcome to the home page'});
  res.end();
});

router.get('/coin', async function (_req, res, _next) {
  await lib.sendMessage({coin: 'abc'})
  res.json({message: 'ok'});
  res.end();
});

router.get('/db', async function (_req, res, _next) {
  const coin = await lib.read('db');
  await lib.sendMessage(coin)
  res.json({message: 'ok'});
  res.end();
});

// router.post('/hook', jsonParser, async function (req, res) {
//   let action = _.get(req, 'body.action') || '';
//   let price = _.get(req, 'body.price') || '';
//   console.log(req.body);
//   res.end();
//   lib.sendMessage(`Đặt lệnh ${action.toUpperCase()} | ${price}`).then();
// })
//
// router.post('/occa', jsonParser, async function (req, res) {
//   let response = _.get(req, 'body');
//   res.end();
//   if (_.isEmpty(response)) {
//     lib.sendMessage('Dữ liệu rỗng').then();
//   } else {
//     let symbol = response.symbol;
//     let quantity = _.toNumber(response.quantity);
//     bot.strategyOCC(symbol, '1m').then();
//     bot.AutoTakingProfit(symbol).then();
//     await lib.sendMessage(`Đã chạy OCC tạm thời cho ${symbol}, số lượng tối thiểu ${quantity}`);
//   }
// })

module.exports = router;

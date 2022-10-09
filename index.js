var express = require('express');
var router = express.Router();
const lib = require("./lib");
var bodyParser = require('body-parser')
var jsonParser = bodyParser.text()
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

router.post('/hook', jsonParser, async function (req, res) {
  let action = req.body.action;
  console.log(req.body);
  res.end();
  lib.sendMessage(`Đặt lệnh ${action.toUpperCase()}`).then();
})

module.exports = router;

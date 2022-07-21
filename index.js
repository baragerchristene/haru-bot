var express = require('express');
var router = express.Router();
const lib = require("./lib");

/* GET home page. */
router.get('/ping', function(_req, res, _next) {
  lib.sendServerStatus().then(_r => {});
  res.json({message: 'pong'});
});

module.exports = router;

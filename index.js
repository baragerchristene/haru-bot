var express = require('express');
var router = express.Router();
const lib = require("./lib");

/* GET ping page. */
router.get('/ping', function(_req, res, _next) {
  lib.sendServerStatus().then(_r => {});
  res.json({message: 'pong'});
  res.end();
});

module.exports = router;

var express = require('express');
var router = express.Router();
const lib = require("./lib");

/* GET home page. */
router.get('/ping', function(req, res, next) {
  lib.sendServerStatus().then(r => {});
  res.json({message: 'pong'});
});

module.exports = router;

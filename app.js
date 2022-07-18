const indexRouter = require('./index');
const lib = require("./lib");
const tradeBot = require("./bot");

const express = require("express");
const http = require("http");
const app = express();
const port = process.env.PORT || 3000;
app.use('/', indexRouter);
app.set('port', port);
const server = http.createServer(app); // Create HTTP server.
server.listen(port); // Listen on provided port, on all network interfaces.

// tradeBot.start()
// lib.keepAliveServer()

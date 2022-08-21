const WebSocket = require("ws");


async function ws_stream(handler) {
    const ws = new WebSocket('wss://fstream.binance.com/ws/btcusdt@kline_1h');
    ws.on('message', handler);
}

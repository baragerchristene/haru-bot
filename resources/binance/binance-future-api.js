const HttpWrapper = require("../../cores/http-wrapper");
const api = new HttpWrapper('https://fapi.binance.com/fapi');

class BinanceFutureApi {
    async fetchKline(symbol = 'BTCUSDT', interval = '1h', limit = 1500) {
        let path = `v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
        const response = await api.get(path);
        return response;
    }
}

const HttpWrapper = require("../../cores/http-wrapper");
const api = new HttpWrapper('https://www.binance.com');

class BinanceApi {
    async fetchFutureLeaderBoardPositionsById(encryptedUid) {
        let path = `bapi/futures/v1/public/future/leaderboard/getOtherPosition`;
        let payload = {
            encryptedUid: encryptedUid,
            tradeType: "PERPETUAL"
        }
        let response = await api.post(path, payload);
        if (response.success) {
            if (response.data.otherPositionRetList && response.data.otherPositionRetList.length > 0) {
                return {data: response.data.otherPositionRetList, error: false};
            } else {
                return {data: [], error: false};
            }
        } else {
            return {data: [], error: true, detail: response.error};
        }
    }

}

module.exports = BinanceApi

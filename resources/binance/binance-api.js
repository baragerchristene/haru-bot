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

    async getLeaderboardRank() {
        let path = `bapi/futures/v2/public/future/leaderboard/getLeaderboardRank`;
        let payload = {
            isShared: true,
            periodType: "DAILY",
            statisticsType: "ROI",
            tradeType: "PERPETUAL"
        }
        let response = await api.post(path, payload);
        if (response.code && response.code == "000000") {
            return response.data
        } else {
            return []
        }
    }
}

module.exports = BinanceApi

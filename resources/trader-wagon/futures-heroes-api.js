const HttpWrapper = require("../../cores/http-wrapper");
const api = new HttpWrapper('https://backend.copyfuture.me');

class FuturesHeroesApi {

    async getPositions(leaderId) {
        let path = `binance/leaderboard/get-user-positions?encUserId=${leaderId}`
        let response = await api.get(path);
        return {data: response, error: false};
    }

}

module.exports = FuturesHeroesApi

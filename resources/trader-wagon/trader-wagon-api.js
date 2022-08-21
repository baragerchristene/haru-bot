const HttpWrapper = require("../../cores/http-wrapper");
const api = new HttpWrapper('https://www.traderwagon.com/v1/public/social-trading');

class TraderWagonApi {

    async fetchCopyPosition(leaderId) {
        let path = `lead-portfolio/get-position-info/${leaderId}`
        let response = await api.get(path)
        if (response.success) {
            if (response.data.length > 0) {
                return {data: response.data, error: false};
            } else {
                return {data: [], error: false};
            }
        } else {
            return {data: [], error: true, detail: response.error};
        }
    }

}

module.exports = TraderWagonApi

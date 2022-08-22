const fetch = require("node-fetch");

class HttpWrapper {
    constructor(url) {
        this.url = url
    }

   async get(path) {
        let link = `${this.url}/${path}`
        let baseResponse = {};
        let response = {};
        try {
            baseResponse = await fetch(link);
            if (baseResponse) {
                response = await baseResponse.json();
            }
        } catch (error) {
            console.log(error);
            response.error = error;
        }
        return response;
    }

    async post(path, bodyPayload) {
        let payload = {
            method: 'post',
            body: JSON.stringify(bodyPayload),
            headers: {'Content-Type': 'application/json'}
        }
        let link = `${this.url}/${path}`
        let baseResponse = {};
        let response = {};
        try {
            baseResponse = await fetch(link, payload);
            if (baseResponse) {
                response = await baseResponse.json();
            }
        } catch (error) {
            console.log(error);
            response.error = error;
        }
        return response;
    }

}

module.exports = HttpWrapper

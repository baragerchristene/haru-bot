const fetch = require("node-fetch");
const axios = require("axios");

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

    async x_post(path, bodyPayload) {
        try {
            const resp = await axios.post(`${this.url}/${path}`, bodyPayload);
            return resp.data;
        } catch (err) {
            // Handle Error Here
            console.error(err);
            return {}
        }
    }

}

module.exports = HttpWrapper

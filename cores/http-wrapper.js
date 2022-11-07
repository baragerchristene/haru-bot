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
        let link = `${this.url}/${path}`;
        let response = {};
        try {
            await axios.post(link, bodyPayload)
                .then(res => {
                    response = res.data;
                })
                .catch(err => {
                    console.log('Error: ', err.message);
                })
        } catch (e) {
            console.log('x-post error');
            console.log(e);
        }
        return response;
    }

}

module.exports = HttpWrapper

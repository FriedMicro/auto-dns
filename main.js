const dns2 = require('dns2');
const config = require('./config.js');
const axios = require('axios');

const { Packet } = dns2;
const { TCPClient } = dns2;

console.log(config);

const adjustTTL = (records, ttl) => {
    for(const record of records){
        record.ttl = ttl;
    }
}

const getRequestor = (requestIp) => {
    const ipData = config.requestors;
    const requestor = ipData.find((requestData) => {
        return requestData.ip == requestIp;
    });
    return requestor;
}

const findKnownSite = (requestor, siteName) => {
    const sites = requestor.sites;
    for(const site of sites){
        const domains = site.domains;
        for(const domain of domains){
            if(domain == siteName){
                return site;
            }
        }
    }
}

const postAutomationUpdate = (key, value) => {
    const url = `http://${config.automation_ip}:${config.automation_port}/state?publishKey=${config.automation_key}&${key}=${value}`;
    axios.post(url).catch((err) => {
        console.error(err);
    });
}

const siteTimeouts = {};
const updateTimeout = (site, time, key) => {
    const timeInMill = time * 1000 * 60;
    const timeoutKey = `${site}_${key}`;
    siteTimeouts[timeoutKey] = timeInMill;
}

setInterval(() => {
    for(const site in siteTimeouts){
        siteTimeouts[site] = siteTimeouts - 100;
        if(siteTimeouts[site] <= 0){
            const keySections = site.split('_');
            const deviceKey = keySections[1];
            const clearVal = null;
            delete siteTimeouts[site];
            postAutomationUpdate(deviceKey, clearVal);
        }
    }
}, 100)

const server = dns2.createServer({
    udp: true,
    handle: (request, send, rinfo) => {

        const requesterIp = rinfo.address;
        let requestor = getRequestor(requesterIp);

        if(!requestor){
            requestor = {
                dns: config.default_dns,
                sites: []
            }
        }

        const resolve = TCPClient({
            dns: requestor.dns
        });

        (async () => {

            const response = Packet.createResponseFromRequest(request);
            const [question] = request.questions;
            const { name } = question;

            try {
                const result = await resolve(name);
                const knownSite = findKnownSite(requestor, name);
                if(knownSite){
                    adjustTTL(result.answers, requestor.ttl);
                    //Send request to automation server
                    postAutomationUpdate(requestor.automation_key, knownSite.id);
                    updateTimeout(knownSite.id, knownSite.clear_time, requestor.automation_key);
                }

                response.answers.push(...result.answers);
                send(response);
            } catch (error) {
                console.log(error);
            }
        })();

    }
});

server.listen({
    udp: {
        port: 53,
        type: "udp4"  // IPv4 or IPv6 (Must be either "udp4" or "udp6")
    },
    tcp: {
        port: 53
    },
});
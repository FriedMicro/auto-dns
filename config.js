const fs = require('fs');
const data = fs.readFileSync('./config.json', 'utf-8');
const parsedData = JSON.parse(data);

module.exports = parsedData;
const TelegramBot = require('node-telegram-bot-api');

const token = process.env.BOT_TOKEN;

// ওয়েবহুক মোড, তাই polling: false রাখা আবশ্যিক
const bot = new TelegramBot(token, { polling: false });

module.exports = bot;

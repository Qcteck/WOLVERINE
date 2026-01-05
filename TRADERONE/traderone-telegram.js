import fs from "fs";
import TelegramBot from "node-telegram-bot-api";

const TOKEN = "TON_BOT_TOKEN";
const CHAT_ID = 123456789; // mettre ton chat_id réel

const bot = new TelegramBot(TOKEN, { polling: false });

function sendLog(message) {
  bot.sendMessage(CHAT_ID, message);
}

setInterval(() => {
  const log = fs.readFileSync('./traderone.log','utf8');
  sendLog("📄 Log TraderOne:\n" + log.split('\n').slice(-5).join('\n'));
}, 10000);

console.log("🤖 Telegram Bot en ligne");

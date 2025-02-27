const TelegramBot = require('node-telegram-bot-api');
const token = '8139802825:AAH3ZzyGN8WS3hlWez7u0GzrbLlyTH8eBKI';
const webAppUrl = 'https://github.com/alvec7/telegram-game'; // Новый URL

const bot = new TelegramBot(token, {polling: true});

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, 'Добро пожаловать в игру!', {
        reply_markup: {
            inline_keyboard: [[
                {
                    text: "Играть",
                    web_app: {url: webAppUrl}
                }
            ]]
        }
    });
});

// Обработка результатов игры
bot.on('web_app_data', (msg) => {
    const data = JSON.parse(msg.web_app_data.data);
    // Обработка результатов
}); 
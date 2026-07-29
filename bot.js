const TelegramBot = require('node-telegram-bot-api');

const token = process.env.BOT_TOKEN;
if (!token) {
    throw new Error('BOT_TOKEN environment variable not set');
}

// URL мини-приложения (страница с игрой), задаётся через переменную окружения.
const webAppUrl = process.env.WEBAPP_URL || 'https://alvec7.github.io/telegram-game/';

const bot = new TelegramBot(token, { polling: true });

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(
        msg.chat.id,
        '⚓ Добро пожаловать на борт!\n\nПроверьте свои знания о яхтинге и парусных путешествиях в игре «Кто хочет стать миллионером».',
        {
            reply_markup: {
                inline_keyboard: [[
                    { text: '🎮 Играть', web_app: { url: webAppUrl } }
                ]]
            }
        }
    );
});

// Обработка результатов игры, присланных из мини-приложения
bot.on('web_app_data', (msg) => {
    try {
        const data = JSON.parse(msg.web_app_data.data);
        if (data.result === 'win') {
            bot.sendMessage(msg.chat.id, '🏆 Поздравляем — вы взяли миллион! Промокод WINNER уже ждёт вас.');
        } else if (typeof data.prize === 'number' && data.prize > 0) {
            bot.sendMessage(msg.chat.id, `⚓ Хорошая игра! Ваш выигрыш: ${data.prize.toLocaleString('ru-RU')} ₽.`);
        } else {
            bot.sendMessage(msg.chat.id, '🌊 В этот раз не повезло — попробуйте ещё раз!');
        }
    } catch (e) {
        console.error('Failed to parse web_app_data:', e);
    }
});

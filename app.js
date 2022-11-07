const BotUI             = require('./botUI');
/**
 * BOT COPY
 */
async function CopyStream() {
    const bot = new BotUI();
    await bot.getLastSession();
    bot.autoSyncExchanges();
    bot.autoSyncIgnores();
    bot.autoBinanceCopier();
    bot.autoBinanceInvertCopier();
}

CopyStream().then() // profit go here

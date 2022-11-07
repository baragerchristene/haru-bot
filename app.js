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
process.on('uncaughtException', err => {
    console.log(`Uncaught Exception: ${err.message}`)
    // process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
    console.log('Unhandled rejection at ', promise, `reason: ${err.message}`)
    // process.exit(1)
})

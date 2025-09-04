/**
 * UTILS module index - exports for external bot integration
 * This allows other bots (like UAS) to import utilities from this bot
 */

module.exports = {
    lottery: require('./lottery'),
    lotteryPanel: require('./lotteryPanel'),
    database: require('./database'),
    common: require('./common'),
    logger: require('./logger'),
    gameUtils: require('./gameUtils'),
    rng: require('./rng')
};
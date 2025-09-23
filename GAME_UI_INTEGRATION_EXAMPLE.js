/**
 * EXAMPLE: How to integrate protection UI into any game
 * This shows how to add protection information to game embeds
 */

const { EmbedBuilder } = require('discord.js');
const GameUIEnhancer = require('./UTILS/gameUIEnhancer');
const { fmt } = require('./UTILS/common');

// Example function showing how to integrate protection UI into any game
function createEnhancedGameEmbed(user, gameResult, betAmount, payout) {
    // Create base embed as usual
    const baseEmbed = new EmbedBuilder()
        .setTitle(`🎮 ${user.displayName}'s Game`)
        .setColor(gameResult.won ? 0x00ff00 : 0xff0000)
        .addFields(
            { name: '💰 Bet', value: fmt(betAmount), inline: true },
            { name: '💸 Payout', value: fmt(payout), inline: true }
        );

    // STEP 1: Enhance with protection information (automatic)
    const enhancedEmbed = GameUIEnhancer.enhanceGameEmbed(baseEmbed, gameResult);

    // STEP 2: Enhance title with protection indicator (optional)
    const enhancedTitle = GameUIEnhancer.enhanceTitle(
        `🎮 ${user.displayName}'s Game`, 
        gameResult.protectionInfo
    );
    enhancedEmbed.setTitle(enhancedTitle);

    // STEP 3: Use protection-aware color (optional)
    const protectionColor = GameUIEnhancer.getProtectionColor(
        gameResult.protectionInfo, 
        gameResult.won ? 0x00ff00 : 0xff0000
    );
    enhancedEmbed.setColor(protectionColor);

    // STEP 4: Add protection warning for very wealthy players (optional)
    const warning = GameUIEnhancer.createProtectionWarning(gameResult.protectionInfo);
    if (warning) {
        enhancedEmbed.setDescription(warning);
    }

    return enhancedEmbed;
}

// Example showing minimal integration (just 1 line needed)
function createMinimalEnhancedEmbed(user, gameResult, betAmount, payout) {
    const baseEmbed = new EmbedBuilder()
        .setTitle(`🎮 ${user.displayName}'s Game`)
        .setColor(0x00ff00)
        .addFields({ name: '💰 Result', value: fmt(payout), inline: true });

    // ONE LINE INTEGRATION - adds all protection info automatically
    return GameUIEnhancer.enhanceGameEmbed(baseEmbed, gameResult);
}

// Example for specific game types (like blackjack, roulette, etc.)
function createBlackjackEnhancedEmbed(user, gameResult, betAmount, playerHand, dealerHand) {
    const baseEmbed = new EmbedBuilder()
        .setTitle(`🃏 ${user.displayName}'s Blackjack`)
        .addFields(
            { name: '🎯 Your Hand', value: playerHand.join(' '), inline: true },
            { name: '🏠 Dealer Hand', value: dealerHand.join(' '), inline: true },
            { name: '💰 Result', value: fmt(gameResult.payout), inline: false }
        );

    // Add protection enhancements
    const enhanced = GameUIEnhancer.enhanceGameEmbed(baseEmbed, gameResult);

    // Game-specific protection message for blackjack
    if (gameResult.protectionInfo && gameResult.protectionInfo.wealth > 50_000_000) {
        enhanced.addFields({
            name: '♠️ High-Stakes Notice',
            value: 'Advanced card analysis protection active for ultra-wealthy players',
            inline: false
        });
    }

    return enhanced;
}

// Example showing what the protection info looks like
function demonstrateProtectionLevels() {
    console.log('🎮 Game UI Protection Levels Demo:');
    console.log('');

    const protectionExamples = [
        { wealth: 1_000_000, description: 'Under $5M - No protection shown' },
        { wealth: 8_000_000, description: '$5M+ - Shows wealth status in footer' },
        { wealth: 15_000_000, description: '$10M+ - Shows protection zone and details' },
        { wealth: 75_000_000, description: '$25M+ - Shows difficulty scaling percentage' },
        { wealth: 150_000_000, description: '$100M+ - Shows tax information on big wins' },
        { wealth: 600_000_000, description: '$500M+ - Shows billionaire progress and warnings' }
    ];

    protectionExamples.forEach(example => {
        console.log(`💰 ${fmt(example.wealth).padEnd(8)} - ${example.description}`);
    });

    console.log('');
    console.log('🎯 UI Elements Added:');
    console.log('• 🟢🟡🟠🔴🟣 Protection zone indicators');
    console.log('• 🛡️ Wealth protection status fields');
    console.log('• 💰 Progressive tax information');
    console.log('• ⚠️ High wealth warnings');
    console.log('• 🎯 Difficulty scaling percentages');
    console.log('• 📊 Billionaire progress tracking');
}

// Export examples for reference
module.exports = {
    createEnhancedGameEmbed,
    createMinimalEnhancedEmbed,
    createBlackjackEnhancedEmbed,
    demonstrateProtectionLevels
};

// Run demo if called directly
if (require.main === module) {
    demonstrateProtectionLevels();
}
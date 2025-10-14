/**
 * 💎 LUXURY UI ENHANCEMENT SYSTEM
 * Premium visual effects and styling for ATIVE Casino Bot
 * Elevates the gaming experience with sophisticated design elements
 */

const { EmbedBuilder } = require('discord.js');

// 🎨 Luxury Color Palette
const LUXURY_COLORS = {
    GOLD: 0xFFD700,           // Premium gold
    PLATINUM: 0xE5E4E2,       // Platinum silver
    DIAMOND: 0xB9F2FF,        // Diamond blue
    EMERALD: 0x50C878,        // Emerald green
    RUBY: 0xE0115F,           // Ruby red
    SAPPHIRE: 0x082567,       // Sapphire blue
    OBSIDIAN: 0x0B1426,       // Deep obsidian
    CHAMPAGNE: 0xF7E7CE,      // Champagne gold
    ROSE_GOLD: 0xE8B4A0,      // Rose gold
    MIDNIGHT: 0x2C3E50        // Midnight blue
};

// 💎 Luxury Icons and Emojis
const LUXURY_ICONS = {
    // Precious stones
    DIAMOND: '💎',
    RUBY: '🔻',
    EMERALD: '🟢',
    SAPPHIRE: '🔷',
    
    // Luxury symbols
    CROWN: '👑',
    STAR: '⭐',
    SPARKLES: '✨',
    TROPHY: '🏆',
    MEDAL: '🏅',
    RING: '💍',
    
    // Casino luxury
    CASINO_CHIP: '🔘',
    DICE: '🎲',
    SPADES: '♠️',
    HEARTS: '♥️',
    DIAMONDS: '♦️',
    CLUBS: '♣️',
    
    // Money and wealth
    MONEY_BAG: '💰',
    DOLLAR: '💵',
    EURO: '💶',
    BANK: '🏦',
    CHART: '📈',
    
    // Animations and effects
    FIRE: '🔥',
    LIGHTNING: '⚡',
    COMET: '☄️',
    SHOOTING_STAR: '🌟',
    BOOM: '💥',
    
    // Luxury items
    CHAMPAGNE: '🍾',
    COCKTAIL: '🍸',
    WINE: '🍷',
    CAVIAR: '🥂'
};

// 🎭 Luxury Text Effects
const LUXURY_EFFECTS = {
    // Sparkle effects for big wins
    addSparkles: (text) => `${LUXURY_ICONS.SPARKLES} ${text} ${LUXURY_ICONS.SPARKLES}`,
    
    // Crown effect for VIP features
    addCrown: (text) => `${LUXURY_ICONS.CROWN} ${text} ${LUXURY_ICONS.CROWN}`,
    
    // Diamond effect for premium content
    addDiamonds: (text) => `${LUXURY_ICONS.DIAMOND} ${text} ${LUXURY_ICONS.DIAMOND}`,
    
    // Fire effect for hot streaks
    addFire: (text) => `${LUXURY_ICONS.FIRE} ${text} ${LUXURY_ICONS.FIRE}`,
    
    // Lightning for fast wins
    addLightning: (text) => `${LUXURY_ICONS.LIGHTNING} ${text} ${LUXURY_ICONS.LIGHTNING}`,
    
    // Money rain effect
    addMoneyRain: (text) => `${LUXURY_ICONS.MONEY_BAG}${LUXURY_ICONS.DOLLAR}${LUXURY_ICONS.SPARKLES} ${text} ${LUXURY_ICONS.SPARKLES}${LUXURY_ICONS.DOLLAR}${LUXURY_ICONS.MONEY_BAG}`,
    
    // VIP treatment
    vipTreatment: (text) => `${LUXURY_ICONS.CROWN}${LUXURY_ICONS.DIAMOND}${LUXURY_ICONS.STAR} ${text} ${LUXURY_ICONS.STAR}${LUXURY_ICONS.DIAMOND}${LUXURY_ICONS.CROWN}`
};

// 🎰 Game-Specific Luxury Enhancements
const GAME_LUXURY = {
    blackjack: {
        colors: [LUXURY_COLORS.OBSIDIAN, LUXURY_COLORS.GOLD, LUXURY_COLORS.RUBY],
        icons: {
            win: `${LUXURY_ICONS.CROWN}${LUXURY_ICONS.SPADES}`,
            lose: `${LUXURY_ICONS.CLUBS}${LUXURY_ICONS.HEARTS}`,
            blackjack: `${LUXURY_ICONS.DIAMOND}${LUXURY_ICONS.STAR}${LUXURY_ICONS.DIAMOND}`,
            push: `${LUXURY_ICONS.EMERALD}${LUXURY_ICONS.EMERALD}`
        },
        animations: {
            dealing: '🎴⚡🎴⚡🎴',
            shuffling: '🔄🎴🔄🎴🔄',
            reveal: '✨🎴✨'
        }
    },
    
    slots: {
        colors: [LUXURY_COLORS.RAINBOW, LUXURY_COLORS.GOLD, LUXURY_COLORS.DIAMOND],
        icons: {
            spin: `${LUXURY_ICONS.SPARKLES}🎰${LUXURY_ICONS.SPARKLES}`,
            win: `${LUXURY_ICONS.TROPHY}${LUXURY_ICONS.MONEY_BAG}${LUXURY_ICONS.TROPHY}`,
            jackpot: `${LUXURY_ICONS.CROWN}${LUXURY_ICONS.DIAMOND}${LUXURY_ICONS.FIRE}${LUXURY_ICONS.DIAMOND}${LUXURY_ICONS.CROWN}`
        },
        animations: {
            spinning: '🎰💫🎰💫🎰',
            winning: '💰✨💰✨💰',
            jackpot: '🎉💎🏆💎🎉'
        }
    },
    
    roulette: {
        colors: [LUXURY_COLORS.RUBY, LUXURY_COLORS.OBSIDIAN, LUXURY_COLORS.GOLD],
        icons: {
            spin: '🌟🎯🌟',
            red: '🔴💎',
            black: '⚫💎',
            green: '🟢👑'
        },
        animations: {
            spinning: '🎯💫🎯💫🎯',
            landing: '✨🎯✨'
        }
    },
    
    flip: {
        colors: [LUXURY_COLORS.GOLD, LUXURY_COLORS.PLATINUM],
        icons: {
            heads: `${LUXURY_ICONS.CROWN}🪙`,
            tails: `🪙${LUXURY_ICONS.STAR}`,
            flip: '🪙💫🪙'
        },
        animations: {
            flipping: '🪙💫🪙💫🪙',
            landing: '✨🪙✨'
        }
    }
};

/**
 * 🎨 Create luxury-enhanced embed with premium styling
 */
function createLuxuryEmbed(gameType, options = {}) {
    const {
        title,
        description,
        fields = [],
        color,
        thumbnail,
        image,
        footer,
        winLevel = 'normal' // normal, big, massive, jackpot
    } = options;
    
    const gameConfig = GAME_LUXURY[gameType] || {};
    const luxuryColor = color || gameConfig.colors?.[0] || LUXURY_COLORS.GOLD;
    
    const embed = new EmbedBuilder()
        .setColor(luxuryColor)
        .setTimestamp();
    
    // Enhanced title with luxury effects
    if (title) {
        let enhancedTitle = title;
        if (winLevel === 'jackpot') {
            enhancedTitle = LUXURY_EFFECTS.vipTreatment(title);
        } else if (winLevel === 'massive') {
            enhancedTitle = LUXURY_EFFECTS.addFire(title);
        } else if (winLevel === 'big') {
            enhancedTitle = LUXURY_EFFECTS.addSparkles(title);
        }
        embed.setTitle(enhancedTitle);
    }
    
    // Enhanced description
    if (description) {
        embed.setDescription(description);
    }
    
    // Add luxury-styled fields
    fields.forEach(field => {
        embed.addFields({
            name: field.name,
            value: field.value,
            inline: field.inline || false
        });
    });
    
    // Enhanced footer with luxury branding
    if (footer) {
        embed.setFooter({
            text: `${LUXURY_ICONS.DIAMOND} ${footer} • ATIVE Luxury Casino ${LUXURY_ICONS.DIAMOND}`
        });
    }
    
    return embed;
}

/**
 * 🎪 Add animated text effect based on win magnitude
 */
function addWinAnimation(text, multiplier, gameType = 'default') {
    if (multiplier >= 100) {
        // Jackpot level
        return `${LUXURY_ICONS.CROWN}${LUXURY_ICONS.FIRE}${LUXURY_ICONS.DIAMOND} **${text}** ${LUXURY_ICONS.DIAMOND}${LUXURY_ICONS.FIRE}${LUXURY_ICONS.CROWN}`;
    } else if (multiplier >= 50) {
        // Massive win
        return `${LUXURY_ICONS.TROPHY}${LUXURY_ICONS.SPARKLES} **${text}** ${LUXURY_ICONS.SPARKLES}${LUXURY_ICONS.TROPHY}`;
    } else if (multiplier >= 10) {
        // Big win
        return `${LUXURY_ICONS.STAR}${LUXURY_ICONS.MONEY_BAG} **${text}** ${LUXURY_ICONS.MONEY_BAG}${LUXURY_ICONS.STAR}`;
    } else if (multiplier > 2) {
        // Good win
        return `${LUXURY_ICONS.SPARKLES} **${text}** ${LUXURY_ICONS.SPARKLES}`;
    } else {
        // Regular win
        return `✅ **${text}**`;
    }
}

/**
 * 🎯 Add game-specific luxury styling to result text
 */
function enhanceGameResult(gameType, result, options = {}) {
    const { won, multiplier = 1, special = false } = options;
    const gameConfig = GAME_LUXURY[gameType] || {};
    
    if (!won) {
        return `❌ **${result}**`;
    }
    
    if (special) {
        return gameConfig.icons?.jackpot 
            ? `${gameConfig.icons.jackpot} **${result}** ${gameConfig.icons.jackpot}`
            : LUXURY_EFFECTS.vipTreatment(result);
    }
    
    return addWinAnimation(result, multiplier, gameType);
}

/**
 * 🎲 Create luxury progress animation
 */
function createProgressAnimation(gameType, stage) {
    const gameConfig = GAME_LUXURY[gameType] || {};
    const animations = gameConfig.animations || {};
    
    switch (stage) {
        case 'starting':
            return `${LUXURY_ICONS.SPARKLES} Game Starting... ${LUXURY_ICONS.SPARKLES}`;
        case 'processing':
            return animations.spinning || `${LUXURY_ICONS.COMET} Processing... ${LUXURY_ICONS.COMET}`;
        case 'revealing':
            return animations.reveal || `${LUXURY_ICONS.SHOOTING_STAR} Revealing Results... ${LUXURY_ICONS.SHOOTING_STAR}`;
        case 'complete':
            return `${LUXURY_ICONS.TROPHY} Complete! ${LUXURY_ICONS.TROPHY}`;
        default:
            return `${LUXURY_ICONS.DIAMOND} ${stage} ${LUXURY_ICONS.DIAMOND}`;
    }
}

/**
 * 💰 Format currency with luxury styling
 */
function formatLuxuryCurrency(amount, options = {}) {
    const { showPlus = false, color = 'gold' } = options;
    
    const prefix = showPlus && amount > 0 ? '+' : '';
    const formattedAmount = new Intl.NumberFormat('en-US').format(Math.abs(amount));
    
    if (amount >= 1000000) {
        return `${LUXURY_ICONS.DIAMOND}${prefix}$${formattedAmount}${LUXURY_ICONS.DIAMOND}`;
    } else if (amount >= 100000) {
        return `${LUXURY_ICONS.CROWN}${prefix}$${formattedAmount}${LUXURY_ICONS.CROWN}`;
    } else if (amount >= 10000) {
        return `${LUXURY_ICONS.TROPHY}${prefix}$${formattedAmount}${LUXURY_ICONS.TROPHY}`;
    } else {
        return `${LUXURY_ICONS.MONEY_BAG}${prefix}$${formattedAmount}`;
    }
}

/**
 * 🎨 Get tier-based color scheme
 */
function getTierColors(tier = 'Bronze') {
    const tierColors = {
        'Platinum': [LUXURY_COLORS.PLATINUM, LUXURY_COLORS.DIAMOND],
        'Gold': [LUXURY_COLORS.GOLD, LUXURY_COLORS.CHAMPAGNE],
        'Silver': [LUXURY_COLORS.PLATINUM, LUXURY_COLORS.MIDNIGHT],
        'Bronze': [LUXURY_COLORS.ROSE_GOLD, LUXURY_COLORS.OBSIDIAN]
    };
    
    return tierColors[tier] || tierColors['Bronze'];
}

module.exports = {
    LUXURY_COLORS,
    LUXURY_ICONS,
    LUXURY_EFFECTS,
    GAME_LUXURY,
    createLuxuryEmbed,
    addWinAnimation,
    enhanceGameResult,
    createProgressAnimation,
    formatLuxuryCurrency,
    getTierColors
};
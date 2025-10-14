/**
 * 🎪 TEXT-BASED ANIMATION SYSTEM
 * Creates impressive visual animations using Discord's text formatting
 * Makes games feel more dynamic and entertaining
 */

/**
 * 🪙 Coin Flip Animation Frames
 */
const COIN_FLIP_FRAMES = [
    "🪙",
    "💫",
    "⭐",
    "✨",
    "🌟",
    "💫",
    "🪙",
    "⚡",
    "🪙",
    "💥"
];

/**
 * 🎰 Slot Machine Animation Frames  
 */
const SLOT_SPIN_FRAMES = [
    "🎰",
    "💫",
    "🌟",
    "✨",
    "⭐",
    "🎯",
    "💥",
    "🎰"
];

/**
 * 🃏 Card Dealing Animation Frames
 */
const CARD_DEAL_FRAMES = [
    "🎴",
    "💫",
    "🃏",
    "✨",
    "🎴",
    "⚡",
    "🃏",
    "🎴"
];

/**
 * 🎯 Roulette Wheel Animation Frames
 */
const ROULETTE_FRAMES = [
    "🎯",
    "💫",
    "🌀",
    "✨",
    "🎯",
    "⚡",
    "🔴",
    "🎯"
];

/**
 * 💰 Money/Win Animation Frames
 */
const MONEY_RAIN_FRAMES = [
    "💰",
    "💵💵💵",
    "💰💰💰💰💰",
    "💵💵💵💵💵💵💵",
    "💰💰💰💰💰💰💰💰💰",
    "💵💵💵💵💵💵💵💵💵💵💵",
    "✨💰✨💰✨💰✨💰✨💰✨",
    "🌟💵🌟💵🌟💵🌟💵🌟💵🌟"
];

/**
 * 🎊 Celebration Animation Frames
 */
const CELEBRATION_FRAMES = [
    "🎉",
    "🎊🎊🎊",
    "🎉🎉🎉🎉🎉",
    "🎊🎊🎊🎊🎊🎊🎊",
    "✨🎉✨🎉✨🎉✨",
    "🌟🎊🌟🎊🌟🎊🌟",
    "🎆🎆🎆🎆🎆🎆🎆",
    "🎇🎇🎇🎇🎇🎇🎇"
];

/**
 * 🌊 Loading Wave Animation
 */
const LOADING_FRAMES = [
    "▱▱▱▱▱▱▱",
    "▰▱▱▱▱▱▱",
    "▰▰▱▱▱▱▱",
    "▰▰▰▱▱▱▱",
    "▰▰▰▰▱▱▱",
    "▰▰▰▰▰▱▱",
    "▰▰▰▰▰▰▱",
    "▰▰▰▰▰▰▰",
    "✨▰▰▰▰▰▰",
    "✨✨▰▰▰▰▰",
    "✨✨✨▰▰▰▰",
    "✨✨✨✨▰▰▰",
    "✨✨✨✨✨▰▰",
    "✨✨✨✨✨✨▰",
    "✨✨✨✨✨✨✨"
];

/**
 * 🎲 Dice Roll Animation
 */
const DICE_FRAMES = [
    "🎲",
    "⚡",
    "🎲",
    "💫",
    "🎲",
    "✨",
    "🎲",
    "🌟"
];

/**
 * 🔥 Fire Effect Animation
 */
const FIRE_FRAMES = [
    "🔥",
    "🔥🔥",
    "🔥🔥🔥",
    "🔥🔥🔥🔥",
    "🔥🔥🔥🔥🔥",
    "🔥🔥🔥🔥🔥🔥",
    "💥🔥💥🔥💥",
    "✨🔥✨🔥✨"
];

/**
 * 🎪 Create animated text sequence
 * @param {Array} frames - Array of animation frames
 * @param {string} text - Text to animate around
 * @param {Object} options - Animation options
 */
function createAnimatedSequence(frames, text = "", options = {}) {
    const { 
        speed = 200, 
        repeat = 1, 
        prefix = "", 
        suffix = "",
        centerText = true 
    } = options;
    
    const sequence = [];
    
    for (let i = 0; i < repeat; i++) {
        frames.forEach(frame => {
            let animatedText;
            if (centerText && text) {
                animatedText = `${prefix}${frame} **${text}** ${frame}${suffix}`;
            } else {
                animatedText = `${prefix}${frame}${text}${suffix}`;
            }
            sequence.push(animatedText);
        });
    }
    
    return sequence;
}

/**
 * 🪙 Create coin flip animation sequence
 */
function createCoinFlipAnimation(choice) {
    const frames = createAnimatedSequence(COIN_FLIP_FRAMES, "FLIPPING...", {
        speed: 150,
        repeat: 2,
        centerText: true
    });
    
    // Add dramatic pause
    frames.push("💫 **SPINNING...** 💫");
    frames.push("✨ **FALLING...** ✨");
    
    return frames;
}

/**
 * 🎰 Create slot machine animation sequence
 */
function createSlotAnimation() {
    const frames = createAnimatedSequence(SLOT_SPIN_FRAMES, "SPINNING", {
        speed: 120,
        repeat: 3,
        centerText: true
    });
    
    frames.push("💫 **ALIGNING...** 💫");
    frames.push("✨ **STOPPING...** ✨");
    
    return frames;
}

/**
 * 🃏 Create blackjack dealing animation
 */
function createCardDealAnimation() {
    const frames = createAnimatedSequence(CARD_DEAL_FRAMES, "DEALING", {
        speed: 180,
        repeat: 2,
        centerText: true
    });
    
    frames.push("✨ **REVEALING...** ✨");
    
    return frames;
}

/**
 * 🎯 Create roulette spinning animation
 */
function createRouletteAnimation() {
    const frames = createAnimatedSequence(ROULETTE_FRAMES, "SPINNING", {
        speed: 100,
        repeat: 4,
        centerText: true
    });
    
    frames.push("🌀 **SLOWING...** 🌀");
    frames.push("✨ **LANDING...** ✨");
    
    return frames;
}

/**
 * 🏆 Create win celebration animation
 */
function createWinAnimation(multiplier = 1) {
    let frames;
    
    if (multiplier >= 100) {
        // Jackpot celebration
        frames = createAnimatedSequence(CELEBRATION_FRAMES, "JACKPOT!", {
            speed: 100,
            repeat: 3,
            centerText: true
        });
        frames = frames.concat(createAnimatedSequence(MONEY_RAIN_FRAMES, "MASSIVE WIN!", {
            speed: 120,
            repeat: 2,
            centerText: true
        }));
    } else if (multiplier >= 10) {
        // Big win
        frames = createAnimatedSequence(CELEBRATION_FRAMES, "BIG WIN!", {
            speed: 150,
            repeat: 2,
            centerText: true
        });
        frames = frames.concat(createAnimatedSequence(MONEY_RAIN_FRAMES, "", {
            speed: 200,
            repeat: 1
        }));
    } else {
        // Regular win
        frames = createAnimatedSequence(CELEBRATION_FRAMES.slice(0, 4), "YOU WIN!", {
            speed: 200,
            repeat: 1,
            centerText: true
        });
    }
    
    return frames;
}

/**
 * 📈 Create loading/progress animation
 */
function createLoadingAnimation(text = "LOADING") {
    return createAnimatedSequence(LOADING_FRAMES, text, {
        speed: 100,
        repeat: 1,
        centerText: false,
        prefix: "**",
        suffix: "**"
    });
}

/**
 * 🎪 Play animation sequence in Discord embed
 * @param {Object} interaction - Discord interaction
 * @param {Array} frames - Animation frames
 * @param {Object} embedTemplate - Base embed to animate
 * @param {number} frameDelay - Delay between frames in ms
 */
async function playAnimation(interaction, frames, embedTemplate, frameDelay = 150) {
    for (let i = 0; i < frames.length; i++) {
        const animatedEmbed = {
            ...embedTemplate,
            description: frames[i],
            color: embedTemplate.color || 0xFFD700
        };
        
        try {
            if (i === 0) {
                await interaction.editReply({ embeds: [animatedEmbed] });
            } else {
                await interaction.editReply({ embeds: [animatedEmbed] });
            }
            
            // Wait before next frame (except for last frame)
            if (i < frames.length - 1) {
                await new Promise(resolve => setTimeout(resolve, frameDelay));
            }
        } catch (error) {
            // If edit fails, break the animation
            break;
        }
    }
}

/**
 * 🌟 Create sparkle effect for text
 */
function addSparkleEffect(text) {
    const sparkles = ["✨", "⭐", "🌟", "💫"];
    const randomSparkle = () => sparkles[Math.floor(Math.random() * sparkles.length)];
    
    return `${randomSparkle()} ${text} ${randomSparkle()}`;
}

/**
 * 🎭 Create dramatic pause effect
 */
function createDramaticPause() {
    return [
        "⏳ **Moment of truth...**",
        "⏰ **The tension builds...**",
        "🎭 **Drumroll please...**"
    ];
}

module.exports = {
    // Animation frame arrays
    COIN_FLIP_FRAMES,
    SLOT_SPIN_FRAMES,
    CARD_DEAL_FRAMES,
    ROULETTE_FRAMES,
    MONEY_RAIN_FRAMES,
    CELEBRATION_FRAMES,
    LOADING_FRAMES,
    DICE_FRAMES,
    FIRE_FRAMES,
    
    // Animation creators
    createAnimatedSequence,
    createCoinFlipAnimation,
    createSlotAnimation,
    createCardDealAnimation,
    createRouletteAnimation,
    createWinAnimation,
    createLoadingAnimation,
    
    // Animation player
    playAnimation,
    
    // Effect creators
    addSparkleEffect,
    createDramaticPause
};
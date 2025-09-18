/**
 * Marriage Level System for ATIVE Casino Bot
 * Defines the 10 marriage levels and their requirements
 */

const MARRIAGE_LEVELS = [
    {
        level: 1,
        name: "Newlywed Bliss",
        description: "Just married and discovering each other",
        minXP: 0,
        color: 0xFFB6C1,
        emoji: "💕",
        benefits: ["Basic marriage benefits", "2% transfer tax reduction"]
    },
    {
        level: 2,
        name: "First Steps",
        description: "Learning to navigate married life together",
        minXP: 100,
        color: 0xFFA0D1,
        emoji: "👶",
        benefits: ["Increased daily challenge rewards", "Shared bank interest boost"]
    },
    {
        level: 3,
        name: "Midnight Feedings",
        description: "Supporting each other through challenges",
        minXP: 300,
        color: 0xFF8AC1,
        emoji: "🌙",
        benefits: ["Extra weekly challenge slot", "Reduced cooldowns"]
    },
    {
        level: 4,
        name: "In-Law Diplomacy",
        description: "Mastering the art of family relations",
        minXP: 600,
        color: 0xFF74B1,
        emoji: "🤝",
        benefits: ["Family game bonuses", "Marriage counseling access"]
    },
    {
        level: 5,
        name: "Couple Goals",
        description: "Setting and achieving dreams together",
        minXP: 1000,
        color: 0xFF5EA1,
        emoji: "🎯",
        benefits: ["Goal completion bonuses", "Joint investment opportunities"]
    },
    {
        level: 6,
        name: "Golden Groove",
        description: "Finding your perfect rhythm as a couple",
        minXP: 1500,
        color: 0xFFD700,
        emoji: "✨",
        benefits: ["Golden couple status", "Premium challenge access"]
    },
    {
        level: 7,
        name: "Second Honeymoon",
        description: "Rekindling the romance and adventure",
        minXP: 2100,
        color: 0xFF1493,
        emoji: "🏖️",
        benefits: ["Vacation bonuses", "Romantic game multipliers"]
    },
    {
        level: 8,
        name: "Legacy Builders",
        description: "Building something meaningful together",
        minXP: 2800,
        color: 0x8B4513,
        emoji: "🏗️",
        benefits: ["Legacy project access", "Mentorship opportunities"]
    },
    {
        level: 9,
        name: "Eternal Flame",
        description: "A love that burns bright and eternal",
        minXP: 3600,
        color: 0xFF4500,
        emoji: "🔥",
        benefits: ["Eternal flame status", "Max relationship bonuses"]
    },
    {
        level: 10,
        name: "Diamond Years",
        description: "The pinnacle of marital achievement",
        minXP: 4500,
        color: 0xB9F2FF,
        emoji: "💎",
        benefits: ["Diamond couple status", "All premium benefits", "Hall of Fame entry"]
    }
];

/**
 * Get marriage level data by level number
 */
function getMarriageLevelByLevel(level) {
    return MARRIAGE_LEVELS.find(l => l.level === level) || MARRIAGE_LEVELS[0];
}

/**
 * Get marriage level data by XP amount
 */
function getMarriageLevelByXP(xp) {
    for (let i = MARRIAGE_LEVELS.length - 1; i >= 0; i--) {
        if (xp >= MARRIAGE_LEVELS[i].minXP) {
            return MARRIAGE_LEVELS[i];
        }
    }
    return MARRIAGE_LEVELS[0];
}

/**
 * Calculate XP needed for next level
 */
function getXPForNextLevel(currentXP) {
    const currentLevel = getMarriageLevelByXP(currentXP);
    const nextLevel = MARRIAGE_LEVELS.find(l => l.level === currentLevel.level + 1);
    
    if (!nextLevel) {
        return 0; // Max level reached
    }
    
    return nextLevel.minXP - currentXP;
}

/**
 * Get all marriage levels
 */
function getAllMarriageLevels() {
    return MARRIAGE_LEVELS;
}

/**
 * Calculate level progress percentage
 */
function getLevelProgress(currentXP) {
    const currentLevel = getMarriageLevelByXP(currentXP);
    const nextLevel = MARRIAGE_LEVELS.find(l => l.level === currentLevel.level + 1);
    
    if (!nextLevel) {
        return 100; // Max level
    }
    
    const levelXPRange = nextLevel.minXP - currentLevel.minXP;
    const currentLevelXP = currentXP - currentLevel.minXP;
    
    return Math.round((currentLevelXP / levelXPRange) * 100);
}

module.exports = {
    MARRIAGE_LEVELS,
    getMarriageLevelByLevel,
    getMarriageLevelByXP,
    getXPForNextLevel,
    getAllMarriageLevels,
    getLevelProgress
};
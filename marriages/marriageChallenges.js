/**
 * Marriage Weekly Challenges System for ATIVE Casino Bot
 * Manages challenge creation, tracking, and rewards
 */

const { getMarriageLevelByXP } = require('./marriageLevels');

// Challenge templates organized by type
const CHALLENGE_TEMPLATES = {
    games: [
        {
            id: 'tic_tac_toe_win',
            name: 'Tic Tac Toe Victory',
            description: 'Win a game of tic tac toe together',
            type: 'game',
            gameType: 'tictactoe',
            requirement: 'win',
            xpReward: 25,
            difficulty: 'easy'
        },
        {
            id: 'know_each_other_quiz',
            name: 'Know Each Other Quiz',
            description: 'Take a quiz about your partner and score 80% or higher',
            type: 'quiz',
            gameType: 'quiz',
            requirement: 'score_80',
            xpReward: 30,
            difficulty: 'medium'
        }
    ],
    creative: [
        {
            id: 'plant_a_tree',
            name: 'Plant a Tree',
            description: 'Plant a tree together and keep it alive for a week',
            type: 'creative',
            gameType: 'planting',
            requirement: 'keep_alive_7_days',
            xpReward: 40,
            difficulty: 'medium'
        },
        {
            id: 'write_poem_together',
            name: 'Poem Together',
            description: 'Write a poem about nature together and let others vote on it',
            type: 'creative',
            gameType: 'poetry',
            requirement: 'get_votes',
            xpReward: 35,
            difficulty: 'medium'
        }
    ],
    social: [
        {
            id: 'help_another_couple',
            name: 'Marriage Mentor',
            description: 'Help another couple with marriage advice or challenges',
            type: 'social',
            gameType: 'mentoring',
            requirement: 'help_couple',
            xpReward: 45,
            difficulty: 'hard'
        },
        {
            id: 'group_activity',
            name: 'Double Date',
            description: 'Participate in a group activity with another married couple',
            type: 'social',
            gameType: 'group',
            requirement: 'group_activity',
            xpReward: 30,
            difficulty: 'medium'
        }
    ],
    financial: [
        {
            id: 'joint_savings_goal',
            name: 'Savings Goal',
            description: 'Save 10,000 coins together in your shared bank',
            type: 'financial',
            gameType: 'savings',
            requirement: 'save_10000',
            xpReward: 50,
            difficulty: 'hard'
        },
        {
            id: 'earn_together',
            name: 'Team Earners',
            description: 'Both partners earn money on the same day using work/beg/crime',
            type: 'financial',
            gameType: 'earning',
            requirement: 'both_earn_same_day',
            xpReward: 20,
            difficulty: 'easy'
        }
    ],
    bonus: [
        {
            id: 'anniversary_celebration',
            name: 'Anniversary Celebration',
            description: 'Celebrate your monthly/yearly anniversary with special activities',
            type: 'bonus',
            gameType: 'celebration',
            requirement: 'anniversary_activity',
            xpReward: 100,
            difficulty: 'special'
        },
        {
            id: 'level_up_together',
            name: 'Level Up Together',
            description: 'Reach the next marriage level together this week',
            type: 'bonus',
            gameType: 'progression',
            requirement: 'level_up',
            xpReward: 75,
            difficulty: 'hard'
        }
    ]
};

/**
 * Generate weekly challenges for all couples
 */
function generateWeeklyChallenges() {
    const challenges = {};
    
    // Select 4 regular challenges (one from each category)
    const categories = ['games', 'creative', 'social', 'financial'];
    let challengeCounter = 1;
    
    for (const category of categories) {
        const templates = CHALLENGE_TEMPLATES[category];
        const selected = templates[Math.floor(Math.random() * templates.length)];
        challenges[`challenge_${challengeCounter}`] = {
            ...selected,
            week_id: getWeekId(),
            assigned_at: new Date().toISOString()
        };
        challengeCounter++;
    }
    
    // Select 1 bonus challenge (optional, higher difficulty)
    const bonusTemplates = CHALLENGE_TEMPLATES.bonus;
    const selectedBonus = bonusTemplates[Math.floor(Math.random() * bonusTemplates.length)];
    challenges.bonus_challenge = {
        ...selectedBonus,
        week_id: getWeekId(),
        assigned_at: new Date().toISOString()
    };
    
    return challenges;
}

/**
 * Get current week ID (YYYY-MM-DD format for Monday of current week)
 */
function getWeekId() {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1));
    return monday.toISOString().split('T')[0];
}

/**
 * Get week start date from week ID
 */
function getWeekStart(weekId) {
    return new Date(weekId + 'T00:00:00.000Z');
}

/**
 * Check if current week has challenges
 */
function isCurrentWeek(weekId) {
    return weekId === getWeekId();
}

/**
 * Calculate XP reward based on challenge and marriage level
 */
function calculateXPReward(challenge, marriageLevel) {
    let baseXP = challenge.xpReward;
    
    // Bonus XP for higher marriage levels
    const levelBonus = Math.floor(marriageLevel / 2) * 5;
    
    // Difficulty multiplier
    const difficultyMultiplier = {
        'easy': 1.0,
        'medium': 1.2,
        'hard': 1.5,
        'special': 2.0
    };
    
    return Math.floor(baseXP * (difficultyMultiplier[challenge.difficulty] || 1.0)) + levelBonus;
}

/**
 * Get all challenge templates for admin/debug purposes
 */
function getAllChallengeTemplates() {
    return CHALLENGE_TEMPLATES;
}

/**
 * Validate challenge completion
 */
function validateChallengeCompletion(challenge, completionData) {
    switch (challenge.requirement) {
        case 'win':
            return completionData.gameResult === 'win';
        case 'score_80':
            return completionData.score >= 80;
        case 'keep_alive_7_days':
            return completionData.daysAlive >= 7;
        case 'get_votes':
            return completionData.votes > 0;
        case 'help_couple':
            return completionData.helpProvided === true;
        case 'group_activity':
            return completionData.participantCount >= 4;
        case 'save_10000':
            return completionData.amountSaved >= 10000;
        case 'both_earn_same_day':
            return completionData.bothEarnedToday === true;
        case 'anniversary_activity':
            return completionData.anniversaryActivity === true;
        case 'level_up':
            return completionData.leveledUp === true;
        default:
            return false;
    }
}

/**
 * Get progress description for a challenge
 */
function getChallengeProgress(challenge, progressData) {
    if (!progressData) {
        return "Not started";
    }
    
    switch (challenge.requirement) {
        case 'win':
            return progressData.attempts ? `${progressData.attempts} attempts` : "Not started";
        case 'score_80':
            return progressData.bestScore ? `Best score: ${progressData.bestScore}%` : "Not attempted";
        case 'keep_alive_7_days':
            return progressData.daysAlive ? `Tree alive for ${progressData.daysAlive} days` : "Not planted";
        case 'get_votes':
            return progressData.votes ? `${progressData.votes} votes received` : "No poem submitted";
        case 'save_10000':
            return progressData.currentSavings ? `${progressData.currentSavings}/10,000 coins saved` : "No savings yet";
        default:
            return "In progress";
    }
}

module.exports = {
    CHALLENGE_TEMPLATES,
    generateWeeklyChallenges,
    getWeekId,
    getWeekStart,
    isCurrentWeek,
    calculateXPReward,
    getAllChallengeTemplates,
    validateChallengeCompletion,
    getChallengeProgress
};
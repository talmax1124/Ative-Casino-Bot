/**
 * Earnings Cooldown Manager
 * Enforces global cooldown across all earning commands
 */

const { buildSessionEmbed } = require('./gameSessionKit');

// Define cooldown times for each earning command (in seconds)
const COOLDOWNS = {
    beg: 3600,      // 1 hour
    crime: 1800,    // 30 minutes
    quiz: 7200,     // 2 hours
    dailytask: 86400, // 24 hours
    work: 3600      // 1 hour
};

// Define which database fields store the last execution time
const TIMESTAMP_FIELDS = {
    beg: 'last_beg_ts',
    crime: 'last_crime_ts',
    quiz: 'last_quiz_ts',
    dailytask: 'last_dailytask_ts',
    work: 'last_work_ts'
};

/**
 * Check if any earning command is on cooldown
 * @param {Object} balance - User balance object from database
 * @param {string} excludeCommand - Command to exclude from check (current command)
 * @returns {Object|null} - Cooldown info if blocked, null if allowed
 */
function checkEarningsCooldown(balance, excludeCommand = null) {
    const now = Date.now() / 1000;
    
    for (const [command, cooldownTime] of Object.entries(COOLDOWNS)) {
        if (command === excludeCommand) continue;
        
        const timestampField = TIMESTAMP_FIELDS[command];
        const lastExecution = balance[timestampField] || 0;
        const timeSinceLastExecution = now - lastExecution;
        
        if (timeSinceLastExecution < cooldownTime) {
            const remainingTime = Math.ceil(cooldownTime - timeSinceLastExecution);
            return {
                blockedBy: command,
                remainingTime: remainingTime,
                cooldownTime: cooldownTime
            };
        }
    }
    
    return null; // No cooldowns active
}

/**
 * Format time duration into human readable format
 * @param {number} seconds - Duration in seconds
 * @returns {string} - Formatted time string
 */
function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
        return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
        return `${minutes}m ${secs}s`;
    } else {
        return `${secs}s`;
    }
}

/**
 * Create cooldown block embed
 * @param {string} username - User's display name
 * @param {string} currentCommand - Command user is trying to use
 * @param {Object} cooldownInfo - Cooldown information
 * @returns {Object} - Discord embed
 */
function createCooldownBlockEmbed(username, currentCommand, cooldownInfo) {
    const commandNames = {
        beg: 'Begging',
        crime: 'Crime',
        quiz: 'Quiz',
        dailytask: 'Daily Task',
        work: 'Work'
    };
    
    const commandEmojis = {
        beg: '🤲',
        crime: '🚨',
        quiz: '🧠',
        dailytask: '📋',
        work: '💼'
    };
    
    const blockedCommandName = commandNames[cooldownInfo.blockedBy] || cooldownInfo.blockedBy;
    const currentCommandName = commandNames[currentCommand] || currentCommand;
    const emoji = commandEmojis[cooldownInfo.blockedBy] || '⏰';
    
    return buildSessionEmbed({
        title: `${emoji} ${username}'s Earning Commands Blocked`,
        topFields: [
            { 
                name: '🚫 Command Blocked', 
                value: `You can't use **${currentCommandName}** while **${blockedCommandName}** is on cooldown!\n\n` +
                       `Wait ${formatTime(cooldownInfo.remainingTime)} before using any earning commands.`
            }
        ],
        stageText: 'EARNINGS BLOCKED',
        color: 0xFF6B6B,
        footer: 'Earning Commands • Only one earning command can be used at a time'
    });
}

module.exports = {
    checkEarningsCooldown,
    createCooldownBlockEmbed,
    formatTime,
    COOLDOWNS,
    TIMESTAMP_FIELDS
};
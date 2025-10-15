/**
 * Robust Console Logger for ATIVE Casino Bot
 * Replaces Winston with pure console-based logging for VPS compatibility
 */

const fs = require('fs');
const path = require('path');

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');
try {
    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
    }
} catch (error) {
    // Silent fail - logging will work without file output
}

// Get current timestamp
function getTimestamp() {
    return new Date().toISOString().replace('T', ' ').substr(0, 19);
}

// Format message with emoji and category
function formatMessage(level, message) {
    const timestamp = getTimestamp();
    const msg = String(message || '').toLowerCase();
    
    // If message already has emoji/tag, use as-is
    const alreadyTagged = /^(\s*\[|✅|❌|🚀|ℹ️|⚠️|🤖|💰|📊|🎯|🎮|🛡️|📦|📈|📉)/.test(String(message || ''));
    if (alreadyTagged) {
        return `${timestamp} ${message}`;
    }

    let icon = '';
    let prefix = '';

    // Categorize messages
    if (level === 'error' || msg.includes('failed') || msg.includes('error')) {
        icon = '❌';
        prefix = '[ERROR]';
    } else if (level === 'warn' || msg.includes('warning') || msg.includes('disabled')) {
        icon = '⚠️';
        prefix = '[WARN]';
    } else if (msg.includes('initialized') || msg.includes('starting') || msg.includes('ready')) {
        icon = '🚀';
        prefix = '[SYSTEM]';
    } else if (msg.includes('ai') || msg.includes('ml') || msg.includes('autonomous')) {
        icon = '🤖';
        prefix = '[AI/ML]';
    } else if (msg.includes('economy') || msg.includes('wealth') || msg.includes('readiness')) {
        icon = '💰';
        prefix = '[ECONOMY]';
    } else if (msg.includes('cache') || msg.includes('nodecache') || msg.includes('performance')) {
        icon = '🚀';
        prefix = '[CACHE]';
    } else if (msg.includes('successfully') || msg.includes('connected') || msg.includes('completed')) {
        icon = '✅';
        prefix = '[SUCCESS]';
    } else {
        icon = 'ℹ️';
        prefix = '[INFO]';
    }

    return `${timestamp} ${icon} ${prefix} ${message}`;
}

// Write to log file (safe)
function writeToFile(filename, content) {
    try {
        const filePath = path.join(logsDir, filename);
        fs.appendFileSync(filePath, content + '\n');
    } catch (error) {
        // Silent fail - console logging will still work
    }
}

// Minimal mode check
const LOG_MODE = (process.env.LOG_MODE || 'minimal').toLowerCase();
function shouldLog(level, message) {
    if (LOG_MODE !== 'minimal') return true;
    
    // Always show errors
    if (level === 'error') return true;
    if (/\b(error|failed|exception)\b/i.test(String(message || ''))) return true;
    if (/^\s*❌/.test(String(message || ''))) return true;
    
    return false; // Hide everything else in minimal mode
}

// Create logger object
const logger = {
    info: function(message) {
        const formatted = formatMessage('info', message);
        if (shouldLog('info', message)) {
            console.log(formatted);
        }
        writeToFile('combined.log', formatted);
    },
    
    warn: function(message) {
        const formatted = formatMessage('warn', message);
        if (shouldLog('warn', message)) {
            console.warn(formatted);
        }
        writeToFile('combined.log', formatted);
    },
    
    error: function(message) {
        const formatted = formatMessage('error', message);
        if (shouldLog('error', message)) {
            console.error(formatted);
        }
        writeToFile('error.log', formatted);
        writeToFile('combined.log', formatted);
    },
    
    debug: function(message) {
        const formatted = formatMessage('debug', message);
        if (shouldLog('debug', message)) {
            console.log(formatted);
        }
        writeToFile('combined.log', formatted);
    }
};

module.exports = logger;

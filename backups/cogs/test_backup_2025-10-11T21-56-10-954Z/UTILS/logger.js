/**
 * Winston Logger Configuration for ATIVE Casino Bot
 * Provides consistent logging across all modules
 */

const winston = require('winston');
const path = require('path');

// Define log levels and colors
const logLevels = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3
};

winston.addColors({
    error: 'red',
    warn: 'yellow',
    info: 'green',
    debug: 'blue'
});

// Create log format
const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack }) => {
        return `${timestamp} [${String(level).toUpperCase()}]: ${stack || message}`;
    })
);

// Create enhanced console format with categories and better visuals
const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) => {
        // If the message already contains its own emoji/category, avoid duplicating
        const alreadyTagged = /^(\s*\[|✅|❌|🚀|ℹ️|⚠️|🤖|💰|📊|🎯|🎮|🛡️|📦|📈|📉)/.test(String(message || ''));

        if (alreadyTagged) {
            return `${timestamp} ${message}`;
        }

        // Categorize messages for better organization
        let prefix = '';
        let icon = '';

        const msg = String(message || '').toLowerCase();

        // Error/Warning first (based on level too)
        if (level.includes('error') || msg.includes('failed') || msg.includes('error')) {
            icon = '❌';
            prefix = '[ERROR]';
        } else if (level.includes('warn') || msg.includes('warning') || msg.includes('disabled')) {
            icon = '⚠️';
            prefix = '[WARN]';
        }
        // System initialization
        else if (msg.includes('initialized') || msg.includes('starting') || msg.includes('ready')) {
            icon = '🚀';
            prefix = '[SYSTEM]';
        }
        // AI/ML
        else if (msg.includes('ai') || msg.includes('ml') || msg.includes('autonomous') || msg.includes('recommendations')) {
            icon = '🤖';
            prefix = '[AI/ML]';
        }
        // Economy
        else if (msg.includes('economy') || msg.includes('wealth') || msg.includes('readiness') || msg.includes('threshold')) {
            icon = '💰';
            prefix = '[ECONOMY]';
        }
        // Cache/Performance
        else if (msg.includes('cache') || msg.includes('nodecache') || msg.includes('performance')) {
            icon = '🚀';
            prefix = '[CACHE]';
        }
        // Success
        else if (msg.includes('successfully') || msg.includes('connected') || msg.includes('completed')) {
            icon = '✅';
            prefix = '[SUCCESS]';
        }
        // Generic info
        else {
            icon = 'ℹ️';
            prefix = '[INFO]';
        }

        // Compact pretty output: drop repeating the level label (info/debug) text
        return `${timestamp} ${icon} ${prefix} ${message}`;
    })
);

// Minimal mode filter: only allow error-level logs and select infos (default: minimal in all envs)
const LOG_MODE = (process.env.LOG_MODE || 'minimal').toLowerCase();
const minimalConsoleFilter = winston.format((info) => {
    if (LOG_MODE !== 'minimal') return info;
    const msg = String(info.message || '');
    // Always show errors or anything indicating an error condition
    if (info.level === 'error') return info;
    if (/\b(error|failed|exception)\b/i.test(msg)) return info;
    if (/^\s*❌/.test(msg)) return info;

    // Optionally, allow single summary lines to pass; per minimal mode we suppress per-command load spam.
    return false; // hide everything else on console
});

// Create logger instance
const logger = winston.createLogger({
    levels: logLevels,
    level: process.env.LOG_LEVEL || 'info',
    format: logFormat,
    transports: [
        // Console transport
        new winston.transports.Console({
            format: winston.format.combine(minimalConsoleFilter(), consoleFormat)
        }),
        
        // File transport for errors
        new winston.transports.File({
            filename: path.join(process.cwd(), 'logs', 'error.log'),
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5
        }),
        
        // File transport for all logs
        new winston.transports.File({
            filename: path.join(process.cwd(), 'logs', 'combined.log'),
            maxsize: 5242880, // 5MB
            maxFiles: 5
        })
    ]
});

// Create logs directory if it doesn't exist
const fs = require('fs');
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

module.exports = logger;

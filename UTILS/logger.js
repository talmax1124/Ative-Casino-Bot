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
        // Categorize messages for better organization
        let prefix = '';
        let icon = '';
        
        // System initialization messages
        if (message.includes('initialized') || message.includes('starting') || message.includes('ready')) {
            icon = '🚀';
            prefix = '[SYSTEM]';
        }
        // Error messages
        else if (message.includes('failed') || message.includes('error') || level.includes('error')) {
            icon = '❌';
            prefix = '[ERROR]';
        }
        // Warning messages  
        else if (message.includes('warning') || level.includes('warn') || message.includes('disabled')) {
            icon = '⚠️';
            prefix = '[WARN]';
        }
        // AI/ML system messages
        else if (message.includes('AI') || message.includes('ML') || message.includes('autonomous') || message.includes('recommendations')) {
            icon = '🤖';
            prefix = '[AI/ML]';
        }
        // Economy/Wealth system messages
        else if (message.includes('economy') || message.includes('wealth') || message.includes('readiness') || message.includes('threshold')) {
            icon = '💰';
            prefix = '[ECONOMY]';
        }
        // Cache/Performance messages
        else if (message.includes('cache') || message.includes('NodeCache') || message.includes('performance')) {
            icon = '🚀';
            prefix = '[CACHE]';
        }
        // Success messages
        else if (message.includes('✅') || message.includes('successfully') || message.includes('connected')) {
            icon = '✅';
            prefix = '[SUCCESS]';
        }
        // Generic info
        else {
            icon = 'ℹ️';
            prefix = '[INFO]';
        }
        
        return `${timestamp} ${icon} ${prefix} ${level}: ${message}`;
    })
);

// Create logger instance
const logger = winston.createLogger({
    levels: logLevels,
    level: process.env.LOG_LEVEL || 'info',
    format: logFormat,
    transports: [
        // Console transport
        new winston.transports.Console({
            format: consoleFormat
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
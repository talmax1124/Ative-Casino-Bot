#!/usr/bin/env node

/**
 * VPS Bot Restart Script
 * Gracefully restarts the bot process with proper cleanup
 */

const { exec, spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../UTILS/logger');

class BotRestartManager {
    constructor() {
        this.botProcess = null;
        this.restartInProgress = false;
        this.stateFile = path.join(__dirname, '..', 'bot-state.json');
        this.pidFile = path.join(__dirname, '..', 'bot.pid');
        this.logFile = path.join(__dirname, '..', 'logs', 'restart.log');
    }

    /**
     * Save current bot state before restart
     */
    async saveCurrentState() {
        try {
            const state = {
                timestamp: new Date().toISOString(),
                action: 'restart',
                initiatedBy: process.env.RESTART_USER || 'system',
                activeGames: 0, // This would be fetched from the actual bot state
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                savedAt: Date.now()
            };

            await fs.writeFile(this.stateFile, JSON.stringify(state, null, 2));
            logger.info('Bot state saved successfully');
            return true;
        } catch (error) {
            logger.error(`Failed to save bot state: ${error.message}`);
            return false;
        }
    }

    /**
     * Check if bot is currently running
     */
    async isBotRunning() {
        try {
            const pidData = await fs.readFile(this.pidFile, 'utf8');
            const pid = parseInt(pidData.trim());
            
            // Check if process exists
            process.kill(pid, 0);
            return { running: true, pid };
        } catch (error) {
            return { running: false, pid: null };
        }
    }

    /**
     * Gracefully stop the bot
     */
    async stopBot(pid) {
        return new Promise((resolve, reject) => {
            try {
                // Send SIGTERM for graceful shutdown
                process.kill(pid, 'SIGTERM');
                
                // Wait for process to end
                let checkCount = 0;
                const checkInterval = setInterval(() => {
                    try {
                        process.kill(pid, 0);
                        checkCount++;
                        
                        // Force kill after 30 seconds
                        if (checkCount > 30) {
                            process.kill(pid, 'SIGKILL');
                            clearInterval(checkInterval);
                            resolve({ forced: true });
                        }
                    } catch (error) {
                        // Process no longer exists
                        clearInterval(checkInterval);
                        resolve({ forced: false });
                    }
                }, 1000);
                
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Close all database connections
     */
    async closeDatabaseConnections() {
        try {
            // This would interface with the actual database module
            logger.info('Closing database connections...');
            
            // Simulate closing connections
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            logger.info('Database connections closed');
            return true;
        } catch (error) {
            logger.error(`Failed to close database connections: ${error.message}`);
            return false;
        }
    }

    /**
     * Stop all active games
     */
    async stopActiveGames() {
        try {
            logger.info('Stopping active games...');
            
            // This would interface with the game management system
            // For now, we'll simulate the cleanup
            await new Promise(resolve => setTimeout(resolve, 500));
            
            logger.info('All active games stopped');
            return true;
        } catch (error) {
            logger.error(`Failed to stop active games: ${error.message}`);
            return false;
        }
    }

    /**
     * Start the bot process
     */
    async startBot() {
        return new Promise((resolve, reject) => {
            try {
                const botPath = path.join(__dirname, '..', 'index.js');
                
                // Start bot process
                const bot = spawn('node', [botPath], {
                    cwd: path.join(__dirname, '..'),
                    detached: false,
                    stdio: ['ignore', 'pipe', 'pipe'],
                    env: { ...process.env, BOT_RESTART: 'true' }
                });

                bot.stdout.on('data', (data) => {
                    logger.info(`Bot Output: ${data.toString()}`);
                });

                bot.stderr.on('data', (data) => {
                    logger.error(`Bot Error: ${data.toString()}`);
                });

                bot.on('error', (error) => {
                    logger.error(`Failed to start bot: ${error.message}`);
                    reject(error);
                });

                // Save PID
                fs.writeFile(this.pidFile, bot.pid.toString()).catch(err => {
                    logger.error(`Failed to save PID: ${err.message}`);
                });

                // Wait for bot to initialize
                setTimeout(() => {
                    logger.info(`Bot started with PID: ${bot.pid}`);
                    resolve({ pid: bot.pid, success: true });
                }, 3000);

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Verify bot startup
     */
    async verifyStartup(pid) {
        try {
            // Check if process is running
            process.kill(pid, 0);
            
            // Additional health checks could be added here
            // Such as checking if the bot connected to Discord
            
            return { success: true, message: 'Bot is running successfully' };
        } catch (error) {
            return { success: false, message: 'Bot failed to start properly' };
        }
    }

    /**
     * Main restart function
     */
    async performRestart(options = {}) {
        if (this.restartInProgress) {
            return {
                success: false,
                message: 'Restart already in progress'
            };
        }

        this.restartInProgress = true;
        const startTime = Date.now();
        const results = {
            success: false,
            steps: [],
            duration: 0,
            message: ''
        };

        try {
            // Step 1: Check if bot is running
            logger.info('Starting bot restart process...');
            results.steps.push({ step: 'check_status', status: 'started' });
            
            const botStatus = await this.isBotRunning();
            results.steps.push({ 
                step: 'check_status', 
                status: 'completed',
                running: botStatus.running,
                pid: botStatus.pid
            });

            if (botStatus.running) {
                // Step 2: Save current state
                logger.info('Saving current bot state...');
                results.steps.push({ step: 'save_state', status: 'started' });
                
                const stateSaved = await this.saveCurrentState();
                results.steps.push({ 
                    step: 'save_state', 
                    status: stateSaved ? 'completed' : 'failed'
                });

                // Step 3: Stop active games
                logger.info('Stopping active games...');
                results.steps.push({ step: 'stop_games', status: 'started' });
                
                const gamesStopped = await this.stopActiveGames();
                results.steps.push({ 
                    step: 'stop_games', 
                    status: gamesStopped ? 'completed' : 'failed'
                });

                // Step 4: Close database connections
                logger.info('Closing database connections...');
                results.steps.push({ step: 'close_db', status: 'started' });
                
                const dbClosed = await this.closeDatabaseConnections();
                results.steps.push({ 
                    step: 'close_db', 
                    status: dbClosed ? 'completed' : 'failed'
                });

                // Step 5: Stop bot process
                logger.info(`Stopping bot process (PID: ${botStatus.pid})...`);
                results.steps.push({ step: 'stop_bot', status: 'started' });
                
                const stopResult = await this.stopBot(botStatus.pid);
                results.steps.push({ 
                    step: 'stop_bot', 
                    status: 'completed',
                    forced: stopResult.forced
                });

                // Wait a moment before starting
                await new Promise(resolve => setTimeout(resolve, 2000));
            }

            // Step 6: Start new bot process
            logger.info('Starting new bot process...');
            results.steps.push({ step: 'start_bot', status: 'started' });
            
            const startResult = await this.startBot();
            results.steps.push({ 
                step: 'start_bot', 
                status: 'completed',
                pid: startResult.pid
            });

            // Step 7: Verify startup
            logger.info('Verifying bot startup...');
            results.steps.push({ step: 'verify', status: 'started' });
            
            await new Promise(resolve => setTimeout(resolve, 2000));
            const verification = await this.verifyStartup(startResult.pid);
            results.steps.push({ 
                step: 'verify', 
                status: verification.success ? 'completed' : 'failed',
                message: verification.message
            });

            results.success = verification.success;
            results.message = verification.success 
                ? 'Bot restarted successfully' 
                : 'Bot restart completed with warnings';

        } catch (error) {
            logger.error(`Restart failed: ${error.message}`);
            results.message = `Restart failed: ${error.message}`;
            results.error = error.message;
        } finally {
            this.restartInProgress = false;
            results.duration = Date.now() - startTime;
            
            // Log restart event
            await this.logRestartEvent(results);
        }

        return results;
    }

    /**
     * Log restart event
     */
    async logRestartEvent(results) {
        try {
            const logEntry = {
                timestamp: new Date().toISOString(),
                success: results.success,
                duration: results.duration,
                steps: results.steps,
                message: results.message,
                initiatedBy: process.env.RESTART_USER || 'system'
            };

            // Ensure logs directory exists
            await fs.mkdir(path.dirname(this.logFile), { recursive: true });

            // Append to log file
            const existingLogs = await fs.readFile(this.logFile, 'utf8').catch(() => '[]');
            const logs = JSON.parse(existingLogs || '[]');
            logs.push(logEntry);
            
            // Keep only last 100 entries
            if (logs.length > 100) {
                logs.splice(0, logs.length - 100);
            }

            await fs.writeFile(this.logFile, JSON.stringify(logs, null, 2));
            logger.info('Restart event logged');
        } catch (error) {
            logger.error(`Failed to log restart event: ${error.message}`);
        }
    }
}

// Export for use in other modules
module.exports = BotRestartManager;

// Run if called directly
if (require.main === module) {
    const manager = new BotRestartManager();
    
    manager.performRestart()
        .then(results => {
            console.log('Restart Results:', JSON.stringify(results, null, 2));
            process.exit(results.success ? 0 : 1);
        })
        .catch(error => {
            console.error('Restart Error:', error);
            process.exit(1);
        });
}
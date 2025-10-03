/**
 * Marriage Task Utility - Centralized Management System
 * 
 * This utility handles ALL common marriage task functionality:
 * - Week/rotation tracking
 * - Task completion management
 * - Database table creation
 * - Safe interaction handling
 * - Game registration and lifecycle
 * 
 * Game developers only need to focus on game logic!
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const dbManager = require('../UTILS/database');
const marriageTaskRotation = require('./marriageTaskRotation');
const marriageTaskStatus = require('./marriageTaskStatus');
const logger = require('../UTILS/logger');

class MarriageTaskUtil {
    constructor() {
        this.registeredGames = new Map();
        this.activeGameSessions = new Map();
    }

    /**
     * Register a new game with the marriage task system
     * @param {string} taskId - Unique identifier (e.g., 'week2_task1')
     * @param {string} gameType - Game type (e.g., 'mention', 'trivia', 'emoji')
     * @param {Object} gameConfig - Game configuration
     */
    registerGame(taskId, gameType, gameConfig) {
        const config = {
            taskId,
            gameType,
            title: gameConfig.title || 'Marriage Task Game',
            description: gameConfig.description || 'Complete this task together!',
            color: gameConfig.color || 0xFF69B4,
            buttonLabel: gameConfig.buttonLabel || 'Start Game',
            buttonEmoji: gameConfig.buttonEmoji || '🎮',
            requiresBothPartners: gameConfig.requiresBothPartners !== false, // Default true
            autoComplete: gameConfig.autoComplete !== false, // Default true
            maxDuration: gameConfig.maxDuration || (30 * 60 * 1000), // 30 minutes default
            ...gameConfig
        };

        this.registeredGames.set(taskId, config);
        logger.info(`Registered marriage task game: ${taskId} (${gameType})`);
    }

    /**
     * Safe interaction reply that handles all Discord API edge cases
     */
    async safeReply(interaction, options) {
        try {
            // Check if interaction is already handled or expired
            if (interaction.replied) {
                return await interaction.editReply(options);
            }
            
            if (interaction.deferred) {
                return await interaction.editReply(options);
            }

            // Try reply first for all fresh interactions - more reliable than update
            if (interaction.reply) {
                return await interaction.reply(options);
            } else {
                logger.error(`No available method to send interaction response. Type: ${interaction.type}`);
                return false;
            }
        } catch (error) {
            logger.error(`Error in safeReply: ${error.message}`);
            logger.debug(`Interaction state - replied: ${interaction.replied}, deferred: ${interaction.deferred}, type: ${interaction.constructor.name}`);
            
            // More robust fallback attempts
            try {
                if (interaction.followUp && (interaction.replied || interaction.deferred)) {
                    return await interaction.followUp({ content: options.content || 'An error occurred.', ephemeral: true });
                } else if (interaction.reply && !interaction.replied && !interaction.deferred) {
                    return await interaction.reply({ content: options.content || 'An error occurred.', ephemeral: true });
                } else if (interaction.editReply && (interaction.replied || interaction.deferred)) {
                    return await interaction.editReply({ content: options.content || 'An error occurred.' });
                } else {
                    logger.warn(`Unable to send interaction response - all methods exhausted`);
                    return false;
                }
            } catch (fallbackError) {
                logger.error(`Fallback safeReply also failed: ${fallbackError.message}`);
                return false;
            }
        }
    }

    /**
     * Get current week/rotation information
     */
    getCurrentWeekInfo() {
        const currentTaskSet = marriageTaskRotation.getCurrentTaskSet();
        if (!currentTaskSet) {
            throw new Error('Unable to get current task rotation');
        }

        return {
            weekId: currentTaskSet.id,
            weekName: currentTaskSet.name,
            weekNumber: currentTaskSet.rotation + 1,
            totalWeeks: currentTaskSet.totalSets,
            tasks: currentTaskSet.tasks
        };
    }

    /**
     * Get marriage information and validate partners
     */
    async getMarriageInfo(interaction) {
        const userId = interaction.user.id;
        
        // Get marriage data from database
        const marriageQuery = `
            SELECT m.*, 
                   u1.username as partner1_name, 
                   u2.username as partner2_name 
            FROM marriages m 
            LEFT JOIN users u1 ON m.partner1_id COLLATE utf8mb4_unicode_ci = u1.user_id COLLATE utf8mb4_unicode_ci
            LEFT JOIN users u2 ON m.partner2_id COLLATE utf8mb4_unicode_ci = u2.user_id COLLATE utf8mb4_unicode_ci
            WHERE (m.partner1_id = ? OR m.partner2_id = ?) AND m.status = 'active'
        `;
        
        const marriages = await dbManager.databaseAdapter.executeQuery(marriageQuery, [userId, userId]);
        
        if (!marriages || marriages.length === 0) {
            throw new Error('You must be married to use marriage tasks!');
        }

        const marriage = marriages[0];
        
        // Fall back to Discord usernames if database usernames are null
        let partner1Name = marriage.partner1_name;
        let partner2Name = marriage.partner2_name;
        
        if (!partner1Name || !partner2Name) {
            try {
                // Get Discord usernames as fallback
                const client = interaction.client;
                if (!partner1Name && client) {
                    const user1 = await client.users.fetch(marriage.partner1_id).catch(() => null);
                    partner1Name = user1 ? user1.displayName || user1.username : `User ${marriage.partner1_id}`;
                }
                if (!partner2Name && client) {
                    const user2 = await client.users.fetch(marriage.partner2_id).catch(() => null);
                    partner2Name = user2 ? user2.displayName || user2.username : `User ${marriage.partner2_id}`;
                }
            } catch (error) {
                logger.error(`Error fetching Discord usernames: ${error.message}`);
                // Use fallback names if Discord fetch fails
                partner1Name = partner1Name || `User ${marriage.partner1_id}`;
                partner2Name = partner2Name || `User ${marriage.partner2_id}`;
            }
        }
        
        return {
            id: marriage.id,
            partner1: {
                id: marriage.partner1_id,
                name: partner1Name
            },
            partner2: {
                id: marriage.partner2_id,
                name: partner2Name
            },
            currentUser: userId,
            isPartner1: userId === marriage.partner1_id,
            partnerUser: userId === marriage.partner1_id ? marriage.partner2_id : marriage.partner1_id
        };
    }

    /**
     * Create task display embed with completion status
     */
    async createTaskDisplayEmbed(marriage, taskNumber) {
        const weekInfo = this.getCurrentWeekInfo();
        const taskId = `${weekInfo.weekId}_task${taskNumber}`;
        const gameConfig = this.registeredGames.get(taskId);

        if (!gameConfig) {
            throw new Error(`No game registered for ${taskId}`);
        }

        // Check completion status
        const taskStatusData = await marriageTaskStatus.getTaskStatus(marriage.id);
        const isCompleted = !!taskStatusData.tasks[`task${taskNumber}`]?.completed;

        const embed = new EmbedBuilder()
            .setTitle(`${gameConfig.title}`)
            .setDescription(`**${marriage.partner1.name}** & **${marriage.partner2.name}**\n\n${gameConfig.description}`)
            .setColor(isCompleted ? 0x00FF00 : gameConfig.color);

        // Add completion status
        if (isCompleted) {
            embed.addFields({
                name: '✅ Status',
                value: 'Task Completed!',
                inline: false
            });
        } else {
            embed.addFields({
                name: '📋 Status',
                value: 'Ready to start!',
                inline: false
            });
        }

        // Add instructions if provided
        if (gameConfig.instructions) {
            embed.addFields({
                name: '📝 Instructions',
                value: gameConfig.instructions,
                inline: false
            });
        }

        return embed;
    }

    /**
     * Create start button for a task
     */
    createTaskButton(taskNumber, gameConfig, isCompleted = false) {
        const customId = `${gameConfig.gameType}_task_start`;
        
        return new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(customId)
                    .setLabel(isCompleted ? 'View Results' : gameConfig.buttonLabel)
                    .setEmoji(gameConfig.buttonEmoji)
                    .setStyle(isCompleted ? ButtonStyle.Secondary : ButtonStyle.Primary)
                    .setDisabled(isCompleted && !gameConfig.allowReplay)
            );
    }

    /**
     * Handle task display - shows the task with start button
     */
    async handleTaskDisplay(interaction, taskNumber) {
        try {
            const marriage = await this.getMarriageInfo(interaction);
            const weekInfo = this.getCurrentWeekInfo();
            const taskId = `${weekInfo.weekId}_task${taskNumber}`;
            const gameConfig = this.registeredGames.get(taskId);

            if (!gameConfig) {
                return await this.safeReply(interaction, {
                    content: `❌ Task ${taskNumber} is not available yet.`,
                    ephemeral: true
                });
            }

            const embed = await this.createTaskDisplayEmbed(marriage, taskNumber);
            const taskStatusData = await marriageTaskStatus.getTaskStatus(marriage.id);
            const isCompleted = !!taskStatusData.tasks[`task${taskNumber}`]?.completed;
            
            const button = this.createTaskButton(taskNumber, gameConfig, isCompleted);

            return await this.safeReply(interaction, {
                embeds: [embed],
                components: [button]
            });

        } catch (error) {
            logger.error(`Error in handleTaskDisplay: ${error.message}`);
            return await this.safeReply(interaction, {
                content: `❌ ${error.message}`,
                ephemeral: true
            });
        }
    }

    /**
     * Start a game session
     */
    async startGameSession(interaction, gameType) {
        try {
            const marriage = await this.getMarriageInfo(interaction);
            const weekInfo = this.getCurrentWeekInfo();
            
            // Find the task number for this game type
            const taskEntry = Array.from(this.registeredGames.entries()).find(([key, config]) => 
                key.startsWith(weekInfo.weekId) && config.gameType === gameType
            );

            if (!taskEntry) {
                throw new Error(`Game type "${gameType}" not found for current week`);
            }

            const [taskId, gameConfig] = taskEntry;
            const taskNumber = parseInt(taskId.split('_task')[1]);

            // Check if already completed and replay not allowed
            const taskStatusData = await marriageTaskStatus.getTaskStatus(marriage.id);
            const isCompleted = !!taskStatusData.tasks[`task${taskNumber}`]?.completed;

            if (isCompleted && !gameConfig.allowReplay) {
                return await this.safeReply(interaction, {
                    content: '✅ This task has already been completed!',
                    ephemeral: true
                });
            }

            // Create game session
            const sessionId = `${marriage.id}_${taskId}_${Date.now()}`;
            const session = {
                sessionId,
                marriageId: marriage.id,
                taskId,
                taskNumber,
                gameType,
                gameConfig,
                marriage,
                startedBy: interaction.user.id,
                startedAt: new Date(),
                expiresAt: new Date(Date.now() + gameConfig.maxDuration),
                status: 'active'
            };

            this.activeGameSessions.set(sessionId, session);

            // Auto-cleanup session after max duration
            setTimeout(() => {
                if (this.activeGameSessions.has(sessionId)) {
                    this.activeGameSessions.delete(sessionId);
                    logger.info(`Auto-cleaned expired game session: ${sessionId}`);
                }
            }, gameConfig.maxDuration);

            // Call game-specific start handler if it exists
            if (gameConfig.startHandler && typeof gameConfig.startHandler === 'function') {
                return await gameConfig.startHandler(interaction, session, this);
            }

            // Default start behavior
            return await this.safeReply(interaction, {
                content: `🎮 **${gameConfig.title} Started!**\n\n${gameConfig.description}`,
                components: []
            });

        } catch (error) {
            logger.error(`Error starting game session: ${error.message}`);
            return await this.safeReply(interaction, {
                content: `❌ ${error.message}`,
                ephemeral: true
            });
        }
    }

    /**
     * Mark task as completed
     */
    async markTaskCompleted(marriageId, taskNumber, completedBy, completionData = null) {
        try {
            await marriageTaskStatus.markTaskComplete(marriageId, taskNumber, completedBy, completionData);
            logger.info(`Task ${taskNumber} completed for marriage ${marriageId} by ${completedBy}`);
            return true;
        } catch (error) {
            logger.error(`Error marking task complete: ${error.message}`);
            return false;
        }
    }

    /**
     * Get active game session
     */
    getGameSession(sessionId) {
        return this.activeGameSessions.get(sessionId);
    }

    /**
     * End game session
     */
    endGameSession(sessionId, completionData = null) {
        const session = this.activeGameSessions.get(sessionId);
        if (session) {
            session.status = 'completed';
            session.completedAt = new Date();
            session.completionData = completionData;
            
            // Auto-mark as completed if configured
            if (session.gameConfig.autoComplete) {
                this.markTaskCompleted(
                    session.marriageId, 
                    session.taskNumber, 
                    session.startedBy,
                    completionData
                );
            }
            
            this.activeGameSessions.delete(sessionId);
            return true;
        }
        return false;
    }

    /**
     * Initialize all required database tables
     */
    async initializeTables() {
        try {
            // Ensure marriage task status table exists
            await marriageTaskStatus.initializeTable();
            
            // Create game sessions table if needed
            const createSessionsTable = `
                CREATE TABLE IF NOT EXISTS marriage_game_sessions (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    session_id VARCHAR(255) UNIQUE NOT NULL,
                    marriage_id INT NOT NULL,
                    task_id VARCHAR(100) NOT NULL,
                    task_number INT NOT NULL,
                    game_type VARCHAR(50) NOT NULL,
                    started_by VARCHAR(255) NOT NULL,
                    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    expires_at TIMESTAMP NULL,
                    completed_at TIMESTAMP NULL,
                    completion_data TEXT,
                    status ENUM('active', 'completed', 'expired') DEFAULT 'active',
                    INDEX idx_marriage_task (marriage_id, task_number),
                    INDEX idx_session_status (session_id, status)
                )
            `;
            
            await dbManager.databaseAdapter.executeQuery(createSessionsTable);
            logger.info('Marriage game sessions table initialized');
            
            return true;
        } catch (error) {
            logger.error(`Error initializing MarriageTaskUtil tables: ${error.message}`);
            return false;
        }
    }
}

// Export singleton instance
const marriageTaskUtil = new MarriageTaskUtil();

// Initialize tables on first import
marriageTaskUtil.initializeTables().catch(err => {
    logger.error(`Failed to initialize MarriageTaskUtil tables: ${err.message}`);
});

module.exports = marriageTaskUtil;
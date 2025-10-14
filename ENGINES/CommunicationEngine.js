/**
 * 💬 COMMUNICATION ENGINE - Interaction Management System
 * Handles all Discord interactions, UI generation, and message formatting
 * Consolidates scattered UI utilities into unified communication system
 */

const EventEmitter = require('events');
const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const logger = require('../UTILS/logger');

class CommunicationEngine extends EventEmitter {
    constructor() {
        super();
        this.interactionCache = new Map(); // interactionId -> interactionData
        this.messageTemplates = new Map(); // templateId -> template
        this.uiComponents = new Map(); // componentId -> component
        this.responseQueue = [];
        this.engineHealth = 'HEALTHY';
        
        this.stats = {
            messagesGenerated: 0,
            interactionsHandled: 0,
            embedsCreated: 0,
            buttonsCreated: 0,
            errorsHandled: 0
        };
        
        this.initializeEngine();
    }

    /**
     * Initialize Communication Engine
     */
    async initializeEngine() {
        try {
            // Initialize message templates
            this.initializeMessageTemplates();
            
            // Initialize UI components
            this.initializeUIComponents();
            
            // Start response processing
            this.startResponseProcessor();
            
            // Initialize error handling
            this.initializeErrorHandling();
            
            logger.info('💬 CommunicationEngine initialized successfully');
            this.engineHealth = 'HEALTHY';
            
        } catch (error) {
            logger.error('❌ CommunicationEngine initialization failed:', error);
            this.engineHealth = 'UNHEALTHY';
            throw error;
        }
    }

    /**
     * 🎮 GENERATE GAME RESULT MESSAGE
     * Universal game result message generator
     */
    async generateGameResultMessage(gameData, outcome, userProfile) {
        try {
            const { gameType, betAmount, userId } = gameData;
            const { won, payout, multiplier } = outcome;
            
            // Get game-specific template
            const template = this.getGameTemplate(gameType);
            
            // Build embed
            const embed = new EmbedBuilder()
                .setTitle(template.getTitle(won, gameType))
                .setColor(won ? template.colors.win : template.colors.loss)
                .setDescription(template.getDescription(won, gameType, outcome))
                .setTimestamp();
            
            // Add result fields
            embed.addFields([
                {
                    name: '🎯 Result',
                    value: won ? '🎉 **YOU WON!**' : '💔 **You Lost**',
                    inline: true
                },
                {
                    name: '💰 Payout',
                    value: this.formatCurrency(payout),
                    inline: true
                },
                {
                    name: '🎲 Multiplier',
                    value: `${multiplier.toFixed(2)}x`,
                    inline: true
                },
                {
                    name: '💳 New Balance',
                    value: this.formatCurrency(userProfile.availableBalance),
                    inline: true
                },
                {
                    name: '🏆 Your Tier',
                    value: this.formatTier(userProfile.tier),
                    inline: true
                },
                {
                    name: '📊 Win Rate',
                    value: `${userProfile.gameStats.winRate.toFixed(1)}%`,
                    inline: true
                }
            ]);
            
            // Add personalized message
            const personalizedMsg = this.getPersonalizedMessage(userProfile, outcome);
            if (personalizedMsg) {
                embed.setFooter({ text: personalizedMsg });
            }
            
            // Add thumbnail
            embed.setThumbnail(template.getThumbnail(won));
            
            // Create action buttons
            const actionButtons = this.createGameActionButtons(gameType, betAmount, won);
            
            this.stats.embedsCreated++;
            this.stats.messagesGenerated++;
            
            return {
                embeds: [embed],
                components: actionButtons.length > 0 ? [actionButtons] : []
            };
            
        } catch (error) {
            logger.error(`❌ Failed to generate game result message: ${error.message}`);
            return this.generateErrorMessage('Failed to generate game result');
        }
    }

    /**
     * 🎨 CREATE GAME ACTION BUTTONS
     * Generate contextual action buttons for games
     */
    createGameActionButtons(gameType, lastBetAmount, won) {
        try {
            const buttons = [];
            
            // Play Again button
            buttons.push(
                new ButtonBuilder()
                    .setCustomId(`play_again_${gameType}_${lastBetAmount}`)
                    .setLabel('🎮 Play Again')
                    .setStyle(ButtonStyle.Primary)
            );
            
            // Quick Bet buttons for different amounts
            const quickBets = this.getQuickBetAmounts(lastBetAmount);
            quickBets.forEach((amount, index) => {
                if (buttons.length < 4) { // Discord limit of 5 buttons per row
                    buttons.push(
                        new ButtonBuilder()
                            .setCustomId(`quick_bet_${gameType}_${amount}`)
                            .setLabel(`💰 ${this.formatCurrency(amount, true)}`)
                            .setStyle(ButtonStyle.Secondary)
                    );
                }
            });
            
            // Stop/Quit button
            buttons.push(
                new ButtonBuilder()
                    .setCustomId('stop_gaming')
                    .setLabel('⏹️ Stop')
                    .setStyle(ButtonStyle.Danger)
            );
            
            this.stats.buttonsCreated += buttons.length;
            
            return new ActionRowBuilder().addComponents(buttons);
            
        } catch (error) {
            logger.error(`❌ Failed to create action buttons: ${error.message}`);
            return new ActionRowBuilder(); // Empty row
        }
    }

    /**
     * 📊 CREATE STATS EMBED
     * Generate comprehensive user statistics embed
     */
    async createStatsEmbed(userProfile) {
        try {
            const { gameStats, tier, level, achievements } = userProfile;
            
            const embed = new EmbedBuilder()
                .setTitle(`📊 ${userProfile.userId}'s Casino Statistics`)
                .setColor(this.getTierColor(tier))
                .setTimestamp();
            
            // Main stats
            embed.addFields([
                {
                    name: '🎮 Gaming Statistics',
                    value: `**Games Played:** ${gameStats.totalGames.toLocaleString()}\n` +
                           `**Win Rate:** ${gameStats.winRate.toFixed(1)}%\n` +
                           `**Current Streak:** ${gameStats.currentStreak}\n` +
                           `**Best Streak:** ${gameStats.longestWinStreak}`,
                    inline: true
                },
                {
                    name: '💰 Financial Statistics',
                    value: `**Total Bet:** ${this.formatCurrency(gameStats.totalBet)}\n` +
                           `**Total Won:** ${this.formatCurrency(gameStats.totalWon)}\n` +
                           `**Net Profit:** ${this.formatCurrency(gameStats.netProfit)}\n` +
                           `**Current Balance:** ${this.formatCurrency(userProfile.totalBalance)}`,
                    inline: true
                },
                {
                    name: '🏆 Profile Information',
                    value: `**Tier:** ${this.formatTier(tier)}\n` +
                           `**Level:** ${level}\n` +
                           `**Achievements:** ${achievements.length}\n` +
                           `**Favorite Game:** ${gameStats.favoriteGame || 'None'}`,
                    inline: true
                }
            ]);
            
            // Tier progress
            if (userProfile.tierProgress && userProfile.tierProgress.nextTier) {
                embed.addFields([{
                    name: '📈 Tier Progress',
                    value: `**Progress to ${userProfile.tierProgress.nextTier}:**\n` +
                           `${this.createProgressBar(userProfile.tierProgress.progress, 20)}\n` +
                           `**Remaining:** ${this.formatCurrency(userProfile.tierProgress.remaining)}`,
                    inline: false
                }]);
            }
            
            // Recent achievements
            if (achievements.length > 0) {
                const recentAchievements = achievements.slice(-3).map(id => 
                    this.getAchievementName(id)
                ).join(', ');
                
                embed.addFields([{
                    name: '🏅 Recent Achievements',
                    value: recentAchievements,
                    inline: false
                }]);
            }
            
            this.stats.embedsCreated++;
            
            return embed;
            
        } catch (error) {
            logger.error(`❌ Failed to create stats embed: ${error.message}`);
            return this.generateErrorEmbed('Failed to load statistics');
        }
    }

    /**
     * 🔧 CREATE SETTINGS PANEL
     * Generate user settings interface
     */
    createSettingsPanel(userProfile) {
        try {
            const embed = new EmbedBuilder()
                .setTitle('⚙️ Casino Settings')
                .setDescription('Customize your gaming experience')
                .setColor(0x3498db);
            
            const { preferences } = userProfile;
            
            embed.addFields([
                {
                    name: '🎮 Gameplay Settings',
                    value: `**Auto Play:** ${preferences.autoPlay ? '✅' : '❌'}\n` +
                           `**Quick Bet:** ${preferences.quickBet ? '✅' : '❌'}\n` +
                           `**Sound Effects:** ${preferences.soundEnabled ? '✅' : '❌'}\n` +
                           `**Animations:** ${preferences.animationsEnabled ? '✅' : '❌'}`,
                    inline: true
                },
                {
                    name: '🔒 Privacy Settings',
                    value: `**Private Stats:** ${preferences.privateStats ? '✅' : '❌'}\n` +
                           `**Share Achievements:** ${!preferences.privateStats ? '✅' : '❌'}`,
                    inline: true
                }
            ]);
            
            // Settings buttons
            const settingsRow = new ActionRowBuilder()
                .addComponents([
                    new ButtonBuilder()
                        .setCustomId('toggle_autoplay')
                        .setLabel(preferences.autoPlay ? 'Disable Auto Play' : 'Enable Auto Play')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('toggle_quickbet')
                        .setLabel(preferences.quickBet ? 'Disable Quick Bet' : 'Enable Quick Bet')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('toggle_privacy')
                        .setLabel(preferences.privateStats ? 'Make Public' : 'Make Private')
                        .setStyle(ButtonStyle.Secondary)
                ]);
            
            return {
                embeds: [embed],
                components: [settingsRow]
            };
            
        } catch (error) {
            logger.error(`❌ Failed to create settings panel: ${error.message}`);
            return this.generateErrorMessage('Failed to load settings');
        }
    }

    /**
     * 🎯 CREATE GAME SELECTION MENU
     * Generate game selection interface
     */
    createGameSelectionMenu(userProfile) {
        try {
            const embed = new EmbedBuilder()
                .setTitle('🎰 Select Your Game')
                .setDescription('Choose from our exciting casino games!')
                .setColor(0xe74c3c);
            
            // Recommended games
            if (userProfile.personalization?.recommendedGames?.length > 0) {
                const recommendations = userProfile.personalization.recommendedGames
                    .map(rec => `🎯 **${rec.game}** - ${rec.reason}`)
                    .join('\n');
                
                embed.addFields([{
                    name: '🌟 Recommended for You',
                    value: recommendations,
                    inline: false
                }]);
            }
            
            // Game selection dropdown
            const gameSelect = new StringSelectMenuBuilder()
                .setCustomId('select_game')
                .setPlaceholder('Choose a game to play...')
                .addOptions([
                    {
                        label: '🃏 Blackjack',
                        description: 'Classic card game - Beat the dealer!',
                        value: 'blackjack',
                        emoji: '🃏'
                    },
                    {
                        label: '🎰 Slots',
                        description: 'Spin to win big prizes!',
                        value: 'slots',
                        emoji: '🎰'
                    },
                    {
                        label: '🪙 Coin Flip',
                        description: 'Simple 50/50 chance game',
                        value: 'flip',
                        emoji: '🪙'
                    },
                    {
                        label: '🎲 Roulette',
                        description: 'Place your bets on the wheel!',
                        value: 'roulette',
                        emoji: '🎲'
                    },
                    {
                        label: '💣 Mines',
                        description: 'Navigate the minefield for rewards',
                        value: 'mines',
                        emoji: '💣'
                    }
                ]);
            
            const selectRow = new ActionRowBuilder().addComponents(gameSelect);
            
            return {
                embeds: [embed],
                components: [selectRow]
            };
            
        } catch (error) {
            logger.error(`❌ Failed to create game selection menu: ${error.message}`);
            return this.generateErrorMessage('Failed to load game menu');
        }
    }

    /**
     * ⚠️ GENERATE ERROR MESSAGE
     * Standardized error message generation
     */
    generateErrorMessage(errorText, isEphemeral = true) {
        try {
            const embed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription(errorText)
                .setColor(0xe74c3c)
                .setTimestamp();
            
            this.stats.errorsHandled++;
            
            return {
                embeds: [embed],
                ephemeral: isEphemeral
            };
            
        } catch (error) {
            logger.error(`❌ Failed to generate error message: ${error.message}`);
            return {
                content: `❌ ${errorText}`,
                ephemeral: true
            };
        }
    }

    /**
     * 🔄 HANDLE INTERACTION
     * Universal interaction handler with automatic routing
     */
    async handleInteraction(interaction) {
        try {
            this.stats.interactionsHandled++;
            
            // Store interaction in cache
            this.interactionCache.set(interaction.id, {
                interaction,
                timestamp: Date.now(),
                type: interaction.type
            });
            
            // Route interaction based on customId
            if (interaction.isButton()) {
                return await this.handleButtonInteraction(interaction);
            } else if (interaction.isStringSelectMenu()) {
                return await this.handleSelectMenuInteraction(interaction);
            } else if (interaction.isChatInputCommand()) {
                return await this.handleCommandInteraction(interaction);
            }
            
            // Unknown interaction type
            return await interaction.reply(
                this.generateErrorMessage('Unknown interaction type')
            );
            
        } catch (error) {
            logger.error(`❌ Interaction handling failed: ${error.message}`);
            
            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply(
                        this.generateErrorMessage('Interaction processing failed')
                    );
                }
            } catch (replyError) {
                logger.error(`❌ Failed to send error reply: ${replyError.message}`);
            }
        }
    }

    /**
     * 🎨 FORMAT CURRENCY
     * Consistent currency formatting
     */
    formatCurrency(amount, short = false) {
        if (amount === 0) return '0';
        
        if (short) {
            if (amount >= 1000000000) return `${(amount / 1000000000).toFixed(1)}B`;
            if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
            if (amount >= 1000) return `${(amount / 1000).toFixed(1)}K`;
        }
        
        return amount.toLocaleString();
    }

    /**
     * 🏆 FORMAT TIER
     * Format user tier with emoji
     */
    formatTier(tier) {
        const tierEmojis = {
            'ULTRA_LOW': '🥉',
            'LOW': '🥈',
            'NORMAL': '🥇',
            'HIGH': '💎',
            'VERY_HIGH': '👑',
            'ULTRA_HIGH': '🌟',
            'MEGA_WHALE': '🐋'
        };
        
        const emoji = tierEmojis[tier] || '❓';
        const formattedName = tier.replace('_', ' ').toLowerCase()
            .replace(/\b\w/g, l => l.toUpperCase());
        
        return `${emoji} ${formattedName}`;
    }

    /**
     * 📊 CREATE PROGRESS BAR
     * Generate ASCII progress bar
     */
    createProgressBar(percentage, length = 10) {
        const filled = Math.round((percentage / 100) * length);
        const empty = length - filled;
        
        return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${percentage.toFixed(1)}%`;
    }

    /**
     * 🎮 GET GAME TEMPLATE
     * Get game-specific message template
     */
    getGameTemplate(gameType) {
        return this.messageTemplates.get(gameType) || this.messageTemplates.get('default');
    }

    /**
     * 💬 GET PERSONALIZED MESSAGE
     * Get personalized message based on user profile and outcome
     */
    getPersonalizedMessage(userProfile, outcome) {
        const messages = userProfile.personalization?.customMessages || [];
        
        if (messages.length > 0) {
            const relevantMessages = messages.filter(msg => 
                (outcome.won && msg.type !== 'loss') || 
                (!outcome.won && msg.type !== 'win')
            );
            
            if (relevantMessages.length > 0) {
                const randomMsg = relevantMessages[Math.floor(Math.random() * relevantMessages.length)];
                return randomMsg.message;
            }
        }
        
        return null;
    }

    /**
     * 💰 GET QUICK BET AMOUNTS
     * Calculate smart quick bet amounts
     */
    getQuickBetAmounts(lastBetAmount) {
        return [
            Math.floor(lastBetAmount * 0.5),  // Half
            lastBetAmount,                     // Same
            Math.floor(lastBetAmount * 2)      // Double
        ].filter(amount => amount >= 10);
    }

    /**
     * 🎨 GET TIER COLOR
     * Get color associated with user tier
     */
    getTierColor(tier) {
        const tierColors = {
            'ULTRA_LOW': 0x95a5a6,    // Grey
            'LOW': 0xf39c12,          // Orange
            'NORMAL': 0x3498db,       // Blue
            'HIGH': 0x9b59b6,         // Purple
            'VERY_HIGH': 0xe74c3c,    // Red
            'ULTRA_HIGH': 0xf1c40f,   // Gold
            'MEGA_WHALE': 0x1abc9c    // Turquoise
        };
        
        return tierColors[tier] || 0x3498db;
    }

    /**
     * ⚙️ INITIALIZE MESSAGE TEMPLATES
     */
    initializeMessageTemplates() {
        // Default template
        this.messageTemplates.set('default', {
            getTitle: (won, gameType) => won ? `🎉 ${gameType} Win!` : `💔 ${gameType} Loss`,
            getDescription: (won, gameType, outcome) => 
                won ? `Congratulations! You won ${outcome.payout} coins!` 
                    : `Better luck next time! You lost your bet.`,
            colors: { win: 0x00ff00, loss: 0xff0000 },
            getThumbnail: (won) => won ? 'https://example.com/win.png' : 'https://example.com/loss.png'
        });
        
        // Game-specific templates would be added here
        logger.debug('💬 Message templates initialized');
    }

    /**
     * 🔧 INITIALIZE UI COMPONENTS
     */
    initializeUIComponents() {
        // Store reusable UI components
        logger.debug('🔧 UI components initialized');
    }

    /**
     * 🔄 START RESPONSE PROCESSOR
     */
    startResponseProcessor() {
        // Background processor for response queue
        setInterval(() => {
            this.processResponseQueue();
        }, 100); // Process every 100ms
    }

    /**
     * ⚠️ INITIALIZE ERROR HANDLING
     */
    initializeErrorHandling() {
        // Set up error handling templates and fallbacks
        logger.debug('⚠️ Error handling initialized');
    }

    /**
     * 🔄 PROCESS RESPONSE QUEUE
     */
    async processResponseQueue() {
        // Process queued responses for batch operations
        if (this.responseQueue.length === 0) return;
        
        // Implementation would handle batched responses
    }

    /**
     * 🏥 HEALTH CHECK
     */
    isHealthy() {
        return this.engineHealth === 'HEALTHY';
    }

    /**
     * 📊 GET ENGINE STATISTICS
     */
    getStats() {
        return {
            ...this.stats,
            cachedInteractions: this.interactionCache.size,
            queuedResponses: this.responseQueue.length,
            engineHealth: this.engineHealth
        };
    }

    // Additional interaction handlers would be implemented here...
    async handleButtonInteraction(interaction) { /* Implementation */ }
    async handleSelectMenuInteraction(interaction) { /* Implementation */ }
    async handleCommandInteraction(interaction) { /* Implementation */ }
    generateErrorEmbed(errorText) { /* Implementation */ }
    getAchievementName(achievementId) { /* Implementation */ }
}

// Export singleton instance
module.exports = new CommunicationEngine();
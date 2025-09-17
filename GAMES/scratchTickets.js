/**
 * Scratch Tickets Game Logic for ATIVE Casino Bot
 * Handles ticket creation, symbol generation, win detection, and drop scheduling
 */

const { EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { secureRandomInt, secureRandomFloat, secureRandomChoice } = require('../UTILS/rng');
const { fmtFull, sendLogMessage } = require('../UTILS/common');
const dbManager = require('../UTILS/database');
const { PayoutManager, GameResult, GameType } = require('../UTILS/gameUtils');
const logger = require('../UTILS/logger');

// Scratch ticket configuration
const TICKET_CONFIG = {
    GRID_SIZE: 9, // 3x3 grid
    TICKET_LIFETIME: 10 * 60 * 1000, // 10 minutes
    CLAIM_TIMEOUT: 5 * 60 * 1000, // 5 minutes to claim
    
    // Prize tiers (8% total win rate - reduced from 15%)
    PRIZES: {
        150000: { chance: 0.05, displayName: '$150K' },    // 5% chance
        250000: { chance: 0.025, displayName: '$250K' },   // 2.5% chance  
        400000: { chance: 0.005, displayName: '$400K' }    // 0.5% chance
    },
    
    // Symbols for the scratch-off
    SYMBOLS: ['🍒', '🍋', '🍊', '🍇', '⭐', '💎', '🎰', '🔔', '🍀'],
    
    // Drop timing (in milliseconds)
    DROP_INTERVALS: {
        MIN: 6 * 60 * 60 * 1000,  // 6 hours
        MAX: 18 * 60 * 60 * 1000  // 18 hours
    },
    
    MAX_DAILY_DROPS: 2
};

class ScratchTicketSystem {
    constructor(client) {
        this.client = client;
        this.activeDropTimers = new Map(); // guildId -> timeoutId
        this.activeTickets = new Map(); // ticketId -> ticket data
        this.activeScratchLocks = new Map(); // lockKey -> timestamp
        this.activeClaimLocks = new Map(); // lockKey -> {userId, timestamp}
        
        // Start cleanup interval
        this.cleanupInterval = setInterval(() => {
            this.cleanupExpiredTickets();
            this.cleanupExpiredLocks();
        }, 5 * 60 * 1000); // Every 5 minutes
    }

    /**
     * Initialize the scratch ticket system
     */
    async initialize() {
        try {
            await this.initializeDropScheduling();
            logger.info('Scratch ticket system initialized successfully');
        } catch (error) {
            logger.error(`Error initializing scratch ticket system: ${error.message}`);
            throw error;
        }
    }

    /**
     * Initialize drop scheduling for all guilds
     */
    async initializeDropScheduling() {
        try {
            const guilds = this.client.guilds.cache;
            
            for (const [guildId, guild] of guilds) {
                await this.scheduleNextDrop(guildId);
            }
            
            logger.info(`Initialized scratch ticket drop scheduling for ${guilds.size} guilds`);
        } catch (error) {
            logger.error(`Error initializing drop scheduling: ${error.message}`);
        }
    }

    /**
     * Schedule the next scratch ticket drop for a guild
     */
    async scheduleNextDrop(guildId) {
        try {
            // Clear existing timer
            if (this.activeDropTimers.has(guildId)) {
                clearTimeout(this.activeDropTimers.get(guildId));
            }

            const dropSettings = await dbManager.getScratchDropSettings(guildId);
            if (!dropSettings || !dropSettings.drop_enabled) {
                return;
            }

            // Check if we've hit the daily limit
            const today = new Date().toDateString();
            const resetDate = new Date(dropSettings.drop_count_reset).toDateString();
            const dailyDrops = today === resetDate ? dropSettings.daily_drops : 0;

            if (dailyDrops >= dropSettings.max_daily_drops) {
                // Schedule first drop tomorrow
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                tomorrow.setHours(secureRandomInt(8, 20), secureRandomInt(0, 60), 0, 0);
                
                const timeUntilTomorrow = tomorrow.getTime() - Date.now();
                
                const timeoutId = setTimeout(async () => {
                    await this.attemptDrop(guildId);
                }, timeUntilTomorrow);
                
                this.activeDropTimers.set(guildId, timeoutId);
                
                // Update next drop time in database
                await dbManager.updateScratchDropStats(guildId, tomorrow);
                
                logger.info(`Next scratch drop for guild ${guildId} scheduled for tomorrow: ${tomorrow.toLocaleString()}`);
                return;
            }

            // Schedule within the random interval
            const minInterval = TICKET_CONFIG.DROP_INTERVALS.MIN;
            const maxInterval = TICKET_CONFIG.DROP_INTERVALS.MAX;
            const randomInterval = secureRandomFloat(minInterval, maxInterval);
            
            const nextDropTime = new Date(Date.now() + randomInterval);
            
            const timeoutId = setTimeout(async () => {
                await this.attemptDrop(guildId);
            }, randomInterval);
            
            this.activeDropTimers.set(guildId, timeoutId);
            
            // Update next drop time in database
            await dbManager.updateScratchDropStats(guildId, nextDropTime);
            
            logger.info(`Next scratch drop for guild ${guildId} scheduled for: ${nextDropTime.toLocaleString()}`);
            
        } catch (error) {
            logger.error(`Error scheduling next drop for guild ${guildId}: ${error.message}`);
        }
    }

    /**
     * Attempt to drop a scratch ticket in a guild
     */
    async attemptDrop(guildId) {
        try {
            const guild = this.client.guilds.cache.get(guildId);
            if (!guild) {
                logger.warn(`Guild ${guildId} not found for scratch ticket drop`);
                return;
            }

            // Find an active channel
            const targetChannel = await this.findActiveChannel(guild);
            if (!targetChannel) {
                logger.warn(`No active channel found for scratch drop in guild ${guildId}`);
                // Schedule next drop
                await this.scheduleNextDrop(guildId);
                return;
            }

            // Create and drop the ticket
            const ticket = await this.createScratchTicket(guildId, targetChannel.id);
            if (ticket) {
                await this.dropTicketInChannel(targetChannel, ticket);
                
                // Update drop statistics and schedule next drop
                await dbManager.updateScratchDropStats(guildId);
                await this.scheduleNextDrop(guildId);
                
                logger.info(`Dropped scratch ticket ${ticket.id} in channel ${targetChannel.name} (${guildId})`);
            } else {
                logger.error(`Failed to create scratch ticket for guild ${guildId}`);
                // Try again in 1 hour
                const retryTimeoutId = setTimeout(async () => {
                    await this.attemptDrop(guildId);
                }, 60 * 60 * 1000);
                
                this.activeDropTimers.set(guildId, retryTimeoutId);
            }
            
        } catch (error) {
            logger.error(`Error attempting scratch drop for guild ${guildId}: ${error.message}`);
            await this.scheduleNextDrop(guildId); // Schedule next drop anyway
        }
    }

    /**
     * Find an active channel for dropping tickets
     */
    async findActiveChannel(guild) {
        try {
            const textChannels = guild.channels.cache.filter(channel => 
                channel.type === 0 && // TEXT channel
                channel.permissionsFor(guild.members.me).has(['SendMessages', 'EmbedLinks', 'AttachFiles'])
            );

            // Prioritize channels with recent activity
            const channelsWithActivity = [];
            const fourHoursAgo = Date.now() - (4 * 60 * 60 * 1000);

            for (const [channelId, channel] of textChannels) {
                try {
                    const messages = await channel.messages.fetch({ limit: 10 });
                    const recentMessages = messages.filter(msg => msg.createdTimestamp > fourHoursAgo);
                    
                    if (recentMessages.size > 0) {
                        channelsWithActivity.push({
                            channel,
                            activityScore: recentMessages.size
                        });
                    }
                } catch (fetchError) {
                    // Skip channels we can't access
                    continue;
                }
            }

            if (channelsWithActivity.length > 0) {
                // Sort by activity and pick a random one from the top 3
                channelsWithActivity.sort((a, b) => b.activityScore - a.activityScore);
                const topChannels = channelsWithActivity.slice(0, Math.min(3, channelsWithActivity.length));
                return secureRandomChoice(topChannels).channel;
            }

            // Fallback to any available text channel
            const channelArray = Array.from(textChannels.values());
            if (channelArray.length > 0) {
                return secureRandomChoice(channelArray);
            }

            return null;
        } catch (error) {
            logger.error(`Error finding active channel: ${error.message}`);
            return null;
        }
    }

    /**
     * Create a scratch ticket
     */
    async createScratchTicket(guildId, channelId, adminUserId = null) {
        try {
            const ticketId = `ST-${Date.now()}-${secureRandomInt(1000, 10000)}`;
            
            // Generate symbols and determine if this is a winning ticket
            const { symbols, isWinning, winAmount, winningCombination } = this.generateTicketData();
            
            const ticketData = {
                id: ticketId,
                type: 'random_drop',
                createdBy: adminUserId || 'system',
                dropChannel: channelId,
                isWinning,
                winAmount,
                symbols,
                winningCombination
            };

            const success = await dbManager.createScratchTicket(
                ticketId,
                null, // No userId yet - will be set when someone claims it
                guildId,
                channelId,
                ticketData,
                symbols,
                winningCombination,
                winAmount
            );

            if (success) {
                const ticket = {
                    id: ticketId,
                    guildId,
                    channelId,
                    isWinning,
                    winAmount,
                    symbols,
                    winningCombination,
                    status: 'active',
                    createdAt: new Date()
                };
                
                this.activeTickets.set(ticketId, ticket);
                return ticket;
            }

            return null;
        } catch (error) {
            logger.error(`Error creating scratch ticket: ${error.message}`);
            return null;
        }
    }

    /**
     * Generate ticket data (symbols and win condition)
     */
    generateTicketData() {
        const symbols = [];
        let isWinning = false;
        let winAmount = 0;
        let winningCombination = null;

        // First, determine if this ticket wins
        const winRoll = secureRandomFloat();
        let cumulativeChance = 0;

        for (const [prize, config] of Object.entries(TICKET_CONFIG.PRIZES)) {
            cumulativeChance += config.chance;
            if (winRoll < cumulativeChance) {
                isWinning = true;
                winAmount = parseInt(prize);
                break;
            }
        }

        if (isWinning) {
            // Create a winning ticket
            const winningSymbol = secureRandomChoice(TICKET_CONFIG.SYMBOLS.slice(0, -1));
            winningCombination = [winningSymbol, winningSymbol, winningSymbol];
            
            // Place 3 matching symbols randomly
            const winningPositions = [];
            while (winningPositions.length < 3) {
                const position = secureRandomInt(0, 8);
                if (!winningPositions.includes(position)) {
                    winningPositions.push(position);
                }
            }

            // Fill the grid
            for (let i = 0; i < 9; i++) {
                if (winningPositions.includes(i)) {
                    symbols[i] = winningSymbol;
                } else {
                    // Use different symbols for non-winning positions
                    const availableSymbols = TICKET_CONFIG.SYMBOLS.filter(s => s !== winningSymbol);
                    symbols[i] = secureRandomChoice(availableSymbols.slice(0, -1));
                }
            }
        } else {
            // Create a losing ticket (ensure no 3 matches)
            for (let i = 0; i < 9; i++) {
                symbols[i] = secureRandomChoice(TICKET_CONFIG.SYMBOLS.slice(0, -1));
            }

            // Check and fix any accidental matches
            const symbolCounts = {};
            symbols.forEach(symbol => {
                symbolCounts[symbol] = (symbolCounts[symbol] || 0) + 1;
            });

            // If any symbol appears 3+ times, replace extras with different symbols
            for (const [symbol, count] of Object.entries(symbolCounts)) {
                if (count >= 3) {
                    let replacements = count - 2; // Keep only 2 of this symbol
                    for (let i = 0; i < symbols.length && replacements > 0; i++) {
                        if (symbols[i] === symbol) {
                            const availableSymbols = TICKET_CONFIG.SYMBOLS.filter(s => s !== symbol);
                            symbols[i] = secureRandomChoice(availableSymbols.slice(0, -1));
                            replacements--;
                        }
                    }
                }
            }
        }

        return {
            symbols,
            isWinning,
            winAmount,
            winningCombination
        };
    }

    /**
     * Drop a ticket in a channel
     */
    async dropTicketInChannel(channel, ticket) {
        try {
            const embed = new EmbedBuilder()
                .setTitle('🎫 SCRATCH TICKET DROPPED!')
                .setDescription('A wild scratch ticket appeared! Quick, someone claim it before it expires!')
                .setColor(0xFFD700)
                .addFields(
                    { name: '⏰ Expires In', value: '5 minutes', inline: true },
                    { name: '🎯 Prizes', value: '$150K • $250K • $400K', inline: true },
                    { name: '🎲 How to Play', value: 'Claim the ticket then scratch to reveal symbols. Get 3 matching symbols to win!', inline: false }
                )
                .setFooter({ text: `Ticket #${ticket.id} • First come, first served!` })
                .setTimestamp();

            const claimButton = new ButtonBuilder()
                .setCustomId(`claim_scratch_${ticket.id}`)
                .setLabel('🎫 Claim Ticket')
                .setStyle(ButtonStyle.Success);

            const row = new ActionRowBuilder().addComponents(claimButton);

            const message = await channel.send({ embeds: [embed], components: [row] });

            // Set expiration timer
            setTimeout(async () => {
                try {
                    await this.expireTicket(ticket.id);
                    
                    // Update the message to show expiration
                    const expiredEmbed = EmbedBuilder.from(embed)
                        .setTitle('🎫 SCRATCH TICKET EXPIRED')
                        .setDescription('This scratch ticket has expired and can no longer be claimed.')
                        .setColor(0x888888);

                    await message.edit({ embeds: [expiredEmbed], components: [] });
                } catch (expireError) {
                    logger.error(`Error expiring ticket ${ticket.id}: ${expireError.message}`);
                }
            }, TICKET_CONFIG.CLAIM_TIMEOUT);

            logger.info(`Dropped scratch ticket ${ticket.id} in ${channel.guild.name}/#${channel.name}`);
            
        } catch (error) {
            logger.error(`Error dropping ticket in channel: ${error.message}`);
        }
    }

    /**
     * Handle ticket claim
     */
    async claimTicket(interaction, ticketId) {
        try {
            const userId = interaction.user.id;
            const guildId = interaction.guildId;

            // Check if user already has an active ticket
            const userActiveTickets = await dbManager.getUserActiveScratchTickets(userId, guildId);
            if (userActiveTickets.length > 0) {
                return await interaction.reply({
                    content: '❌ You already have an active scratch ticket! Finish scratching it before claiming another.',
                    ephemeral: true
                });
            }

            const ticket = await dbManager.getScratchTicket(ticketId);
            if (!ticket) {
                return await interaction.reply({
                    content: '❌ This scratch ticket is no longer available.',
                    ephemeral: true
                });
            }

            if (ticket.status !== 'active' || ticket.user_id !== 'UNCLAIMED') {
                return await interaction.reply({
                    content: '❌ This scratch ticket has already been claimed or expired.',
                    ephemeral: true
                });
            }

            // Update the ticket to be owned by this user
            const success = await dbManager.updateScratchTicket(ticketId, [], 'scratching');
            
            if (success) {
                // Update the user_id in the database
                await dbManager.databaseAdapter.executeQuery(
                    'UPDATE scratch_tickets SET user_id = ?, claimed_by = ? WHERE id = ?',
                    [userId, userId, ticketId]
                );

                // Show the scratch interface
                await this.showScratchInterface(interaction, ticket);
                
                logger.info(`User ${interaction.user.tag} claimed scratch ticket ${ticketId}`);
            } else {
                await interaction.reply({
                    content: '❌ Failed to claim the ticket. Please try again.',
                    ephemeral: true
                });
            }

        } catch (error) {
            logger.error(`Error claiming ticket: ${error.message}`);
            await interaction.reply({
                content: '❌ An error occurred while claiming the ticket.',
                ephemeral: true
            });
        }
    }

    /**
     * Show the scratch interface
     */
    async showScratchInterface(interaction, ticket) {
        try {
            const scratchedPositions = [];
            const embed = this.createScratchEmbed(ticket, scratchedPositions);
            const components = this.createScratchButtons(ticket.id, scratchedPositions);

            await interaction.update({ embeds: [embed], components });

        } catch (error) {
            logger.error(`Error showing scratch interface: ${error.message}`);
        }
    }

    /**
     * Create scratch interface embed
     */
    createScratchEmbed(ticket, scratchedPositions) {
        const embed = new EmbedBuilder()
            .setTitle(`🎫 Scratch Ticket #${ticket.id}`)
            .setColor(0x00FF99);

        // Create the 3x3 grid display
        let gridDisplay = '';
        const symbols = ticket.symbols;
        
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 3; col++) {
                const index = row * 3 + col;
                const isScratched = scratchedPositions.includes(index);
                gridDisplay += isScratched ? symbols[index] : '❓';
                if (col < 2) gridDisplay += ' ';
            }
            if (row < 2) gridDisplay += '\n';
        }

        embed.addFields(
            { name: '🎯 Scratch Areas', value: `\`\`\`\n${gridDisplay}\n\`\`\``, inline: false },
            { name: '📊 Progress', value: `${scratchedPositions.length}/9 scratched`, inline: true },
            { name: '🎲 Goal', value: 'Find 3 matching symbols', inline: true },
            { name: '⏱️ Time Left', value: '10 minutes', inline: true }
        );

        // Check for win condition
        if (scratchedPositions.length >= 3) {
            const hasWin = this.checkWinCondition(symbols, scratchedPositions);
            if (hasWin.won) {
                embed.setColor(0xFFD700)
                    .addFields({ name: '🎉 WINNER!', value: `You found 3 ${hasWin.symbol}! Prize: **${fmtFull(ticket.won_amount)}**`, inline: false });
            } else if (scratchedPositions.length === 9) {
                embed.setColor(0xFF4444)
                    .addFields({ name: '💸 No Match', value: 'Better luck next time!', inline: false });
            }
        }

        return embed;
    }

    /**
     * Create scratch buttons
     */
    createScratchButtons(ticketId, scratchedPositions) {
        const rows = [];
        
        for (let row = 0; row < 3; row++) {
            const actionRow = new ActionRowBuilder();
            
            for (let col = 0; col < 3; col++) {
                const index = row * 3 + col;
                const isScratched = scratchedPositions.includes(index);
                
                const button = new ButtonBuilder()
                    .setCustomId(`scratch_${ticketId}_${index}`)
                    .setLabel(isScratched ? '✓' : '?')
                    .setStyle(isScratched ? ButtonStyle.Success : ButtonStyle.Secondary)
                    .setDisabled(isScratched);

                actionRow.addComponents(button);
            }
            
            rows.push(actionRow);
        }

        return rows;
    }

    /**
     * Handle scratching a position
     */
    async scratchPosition(interaction, ticketId, position) {
        try {
            const userId = interaction.user.id;
            const ticket = await dbManager.getScratchTicket(ticketId);
            
            if (!ticket || ticket.user_id !== userId) {
                return await interaction.reply({
                    content: '❌ This is not your scratch ticket.',
                    ephemeral: true
                });
            }

            if (ticket.status !== 'scratching') {
                return await interaction.reply({
                    content: '❌ This scratch ticket is no longer active.',
                    ephemeral: true
                });
            }

            // Ensure scratchedPositions is always an array
            let scratchedPositions = ticket.scratched_positions;
            if (!Array.isArray(scratchedPositions)) {
                scratchedPositions = [];
            }
            
            if (scratchedPositions.includes(position)) {
                return await interaction.reply({
                    content: '❌ You already scratched this position.',
                    ephemeral: true
                });
            }

            // Add the position to scratched positions
            scratchedPositions.push(position);
            await dbManager.updateScratchTicket(ticketId, scratchedPositions, 'scratching');

            // Check win condition after 3+ scratches
            let gameComplete = false;
            let won = false;
            let winAmount = 0;

            if (scratchedPositions.length >= 3) {
                const winCheck = this.checkWinCondition(ticket.symbols, scratchedPositions);
                won = winCheck.won;
                
                if (won) {
                    winAmount = ticket.won_amount;
                    gameComplete = true;
                } else if (scratchedPositions.length === 9) {
                    gameComplete = true;
                }
            }

            if (gameComplete) {
                await dbManager.completeScratchTicket(ticketId, won, winAmount);
                
                if (won) {
                    // Process payout
                    const gameResult = new GameResult({
                        userId,
                        guildId: interaction.guildId,
                        gameType: 'scratch-ticket',
                        betAmount: 0, // Free ticket
                        payout: winAmount,
                        won: true,
                        metadata: { ticketId, scratchedPositions: scratchedPositions.length }
                    });

                    await PayoutManager.processGamePayout(gameResult);

                    // Send win notification
                    await sendLogMessage(
                        interaction.client,
                        'info',
                        `🎫 **Scratch Ticket Win!**\n` +
                        `**User:** ${interaction.user.displayName}\n` +
                        `**Ticket:** #${ticketId}\n` +
                        `**Prize:** ${fmtFull(winAmount)}`,
                        userId,
                        interaction.guildId
                    );
                }
            }

            // Update the interface
            const updatedTicket = await dbManager.getScratchTicket(ticketId);
            const embed = this.createScratchEmbed(updatedTicket, scratchedPositions);
            const components = gameComplete ? [] : this.createScratchButtons(ticketId, scratchedPositions);

            await interaction.update({ embeds: [embed], components });

        } catch (error) {
            logger.error(`Error scratching position: ${error.message}`);
            await interaction.reply({
                content: '❌ An error occurred while scratching.',
                ephemeral: true
            });
        }
    }

    /**
     * Check win condition
     */
    checkWinCondition(symbols, scratchedPositions) {
        const scratchedSymbols = scratchedPositions.map(pos => symbols[pos]);
        const symbolCounts = {};
        
        scratchedSymbols.forEach(symbol => {
            symbolCounts[symbol] = (symbolCounts[symbol] || 0) + 1;
        });

        for (const [symbol, count] of Object.entries(symbolCounts)) {
            if (count >= 3) {
                return { won: true, symbol, count };
            }
        }

        return { won: false };
    }

    /**
     * Expire a ticket
     */
    async expireTicket(ticketId) {
        try {
            await dbManager.completeScratchTicket(ticketId, false, 0);
            this.activeTickets.delete(ticketId);
            logger.info(`Expired scratch ticket ${ticketId}`);
        } catch (error) {
            logger.error(`Error expiring ticket: ${error.message}`);
        }
    }

    /**
     * Clean up expired tickets
     */
    async cleanupExpiredTickets() {
        try {
            const expiredCount = await dbManager.cleanupExpiredScratchTickets();
            if (expiredCount > 0) {
                logger.info(`Cleaned up ${expiredCount} expired scratch tickets`);
            }
        } catch (error) {
            logger.error(`Error cleaning up expired tickets: ${error.message}`);
        }
    }

    /**
     * Clean up expired locks to prevent memory leaks
     */
    cleanupExpiredLocks() {
        try {
            const now = Date.now();
            const lockExpiry = 30 * 1000; // 30 seconds
            let cleanedCount = 0;

            // Clean up scratch locks
            for (const [lockKey, timestamp] of this.activeScratchLocks.entries()) {
                if (now - timestamp > lockExpiry) {
                    this.activeScratchLocks.delete(lockKey);
                    cleanedCount++;
                }
            }

            // Clean up claim locks
            for (const [lockKey, lockData] of this.activeClaimLocks.entries()) {
                if (now - lockData.timestamp > lockExpiry) {
                    this.activeClaimLocks.delete(lockKey);
                    cleanedCount++;
                }
            }

            if (cleanedCount > 0) {
                logger.info(`Cleaned up ${cleanedCount} expired interaction locks`);
            }
        } catch (error) {
            logger.error(`Error cleaning up expired locks: ${error.message}`);
        }
    }

    /**
     * Admin manual drop
     */
    async adminDrop(guildId, channelId, adminUserId) {
        try {
            const guild = this.client.guilds.cache.get(guildId);
            const channel = guild?.channels.cache.get(channelId);
            
            if (!guild || !channel) {
                return { success: false, error: 'Guild or channel not found' };
            }

            const ticket = await this.createScratchTicket(guildId, channelId, adminUserId);
            if (ticket) {
                await this.dropTicketInChannel(channel, ticket);
                
                logger.info(`Admin ${adminUserId} manually dropped scratch ticket ${ticket.id} in ${guild.name}/#${channel.name}`);
                return { success: true, ticketId: ticket.id };
            }

            return { success: false, error: 'Failed to create ticket' };
        } catch (error) {
            logger.error(`Error in admin drop: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Trigger manual drop (wrapper for adminDrop with additional logging)
     */
    async triggerManualDrop(guildId, channelId, adminUserId, reason = 'Manual drop') {
        try {
            const result = await this.adminDrop(guildId, channelId, adminUserId);
            
            if (result.success) {
                logger.info(`Manual drop triggered by ${adminUserId} in guild ${guildId}, channel ${channelId} - Reason: ${reason}`);
            }
            
            return result;
        } catch (error) {
            logger.error(`Error in triggerManualDrop: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get scratch ticket statistics for a guild
     */
    async getGuildStats(guildId) {
        try {
            const dropSettings = await dbManager.getScratchDropSettings(guildId);
            return dropSettings;
        } catch (error) {
            logger.error(`Error getting guild stats: ${error.message}`);
            return null;
        }
    }

    /**
     * Handle button interactions for scratch tickets
     */
    async handleButtonInteraction(interaction) {
        const customId = interaction.customId;
        
        try {
            // Handle claim buttons (claim_scratch_TICKET_ID)
            if (customId.startsWith('claim_scratch_')) {
                const ticketId = customId.replace('claim_scratch_', '');
                await this.handleClaimTicket(interaction, ticketId);
            }
            // Handle scratch buttons (scratch_TICKET_ID_POSITION)
            else if (customId.startsWith('scratch_')) {
                const parts = customId.split('_');
                if (parts.length >= 3) {
                    const ticketId = parts.slice(1, -1).join('_'); // Handle ticket IDs with underscores
                    const position = parseInt(parts[parts.length - 1]);
                    await this.handleScratchPosition(interaction, ticketId, position);
                }
            }
        } catch (error) {
            logger.error(`Error in handleButtonInteraction: ${error.message}`);
            
            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: '❌ An error occurred while processing your request.',
                        ephemeral: true
                    });
                }
            } catch (replyError) {
                logger.error(`Failed to send error reply: ${replyError.message}`);
            }
        }
    }

    /**
     * Handle claim ticket button
     */
    async handleClaimTicket(interaction, ticketId) {
        try {
            // Defer the interaction immediately to prevent timeouts
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferReply({ ephemeral: true });
            }
            
            logger.info(`[SCRATCH DEBUG] User ${interaction.user.tag} (${interaction.user.id}) attempting to claim ticket ${ticketId}`);
            
            // Create a unique lock key to prevent race conditions on claiming
            const claimLockKey = `claim_${ticketId}`;
            
            // Check if this ticket is already being claimed
            if (this.activeClaimLocks && this.activeClaimLocks.has(claimLockKey)) {
                logger.warn(`Race condition detected: Multiple users attempted to claim ticket ${ticketId}`);
                await interaction.editReply({
                    content: '❌ This scratch ticket is already being claimed by someone else.'
                });
                return;
            }
            
            // Set claim lock
            if (!this.activeClaimLocks) {
                this.activeClaimLocks = new Map();
            }
            this.activeClaimLocks.set(claimLockKey, { userId: interaction.user.id, timestamp: Date.now() });
            
            try {
                const ticket = await dbManager.getScratchTicket(ticketId);
                logger.info(`[SCRATCH DEBUG] Database result: ${ticket ? `Found ticket - Status: ${ticket.status}, User: ${ticket.user_id}` : 'No ticket found'}`);
                
                if (!ticket) {
                    logger.warn(`[SCRATCH DEBUG] Ticket ${ticketId} not found in database`);
                    await interaction.editReply({
                        content: '❌ This scratch ticket is no longer available.'
                    });
                    return;
                }

                logger.info(`[SCRATCH DEBUG] Ticket status check: Expected 'dropped', actual '${ticket.status}'`);
                if (ticket.status !== 'dropped') {
                    logger.warn(`[SCRATCH DEBUG] Ticket ${ticketId} has wrong status: ${ticket.status} (expected 'dropped')`);
                    await interaction.editReply({
                        content: '❌ This scratch ticket has already been claimed or expired.'
                });
                return;
            }

                // Check if user already has an active ticket
                const activeTickets = await dbManager.getUserActiveScratchTickets(interaction.user.id, interaction.guildId);
                if (activeTickets.length > 0) {
                    await interaction.editReply({
                        content: '❌ You already have an active scratch ticket! Finish scratching it first.'
                    });
                    return;
                }

                // Claim the ticket
                await dbManager.claimScratchTicket(ticketId, interaction.user.id);
                
                // Generate scratch interface
                const scratchEmbed = await this.createScratchInterface(ticket, interaction.user);
                
                // Switch to update mode since we're replacing the original drop message
                await interaction.editReply({ 
                    content: null,
                    embeds: scratchEmbed.embeds,
                    components: scratchEmbed.components,
                    ephemeral: false
                });
                
                logger.info(`User ${interaction.user.tag} (${interaction.user.id}) successfully claimed scratch ticket ${ticketId}`);
                
            } finally {
                // Always remove claim lock
                this.activeClaimLocks.delete(claimLockKey);
            }
            
        } catch (error) {
            logger.error(`Error handling claim ticket: ${error.message}`);
            
            // Clean up locks on error
            if (this.activeClaimLocks && claimLockKey) {
                this.activeClaimLocks.delete(claimLockKey);
            }
            
            throw error;
        }
    }

    /**
     * Handle scratch position button
     */
    async handleScratchPosition(interaction, ticketId, position) {
        try {
            // Defer the interaction immediately to prevent timeouts
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferUpdate();
            }

            // Create a unique lock key to prevent race conditions
            const lockKey = `scratch_${ticketId}_${interaction.user.id}`;
            
            // Check if this user is already processing a scratch for this ticket
            if (this.activeScratchLocks && this.activeScratchLocks.has(lockKey)) {
                logger.warn(`Race condition detected: User ${interaction.user.tag} attempted multiple scratches on ticket ${ticketId}`);
                return; // Silently ignore duplicate requests
            }
            
            // Set lock
            if (!this.activeScratchLocks) {
                this.activeScratchLocks = new Map();
            }
            this.activeScratchLocks.set(lockKey, Date.now());
            
            try {
                const ticket = await dbManager.getScratchTicket(ticketId);
                
                if (!ticket) {
                    await interaction.editReply({
                        content: '❌ This scratch ticket is no longer available.',
                        components: []
                    });
                    return;
                }

                // Enhanced user validation with logging
                if (ticket.user_id !== interaction.user.id) {
                    logger.warn(`User validation failed: ${interaction.user.tag} (${interaction.user.id}) tried to scratch ticket ${ticketId} owned by ${ticket.user_id}`);
                    await interaction.editReply({
                        content: '❌ This is not your scratch ticket!',
                        components: []
                    });
                    return;
                }

                if (ticket.status !== 'active' && ticket.status !== 'scratching') {
                    await interaction.editReply({
                        content: '❌ This scratch ticket is no longer active.',
                        components: []
                    });
                    return;
                }

                // Add position to scratched positions
                // Ensure scratchedPositions is always an array
                let scratchedPositions = ticket.scratched_positions;
                if (!Array.isArray(scratchedPositions)) {
                    scratchedPositions = [];
                }
                
                // Enhanced duplicate position check with logging
                if (scratchedPositions.includes(position)) {
                    logger.warn(`Duplicate scratch attempt: User ${interaction.user.tag} tried to scratch position ${position} again on ticket ${ticketId}`);
                    await interaction.editReply({
                        content: '❌ You already scratched this position!',
                        components: []
                    });
                    return;
                }

                scratchedPositions.push(position);
                
                // Update ticket in database with enhanced error handling
                await dbManager.updateScratchedPositions(ticketId, scratchedPositions);
                
                // Check for win condition
                const winResult = this.checkWinCondition(ticket.symbols, scratchedPositions);
                
                if (winResult.won || scratchedPositions.length === 9) {
                    // Game complete
                    await this.completeGame(interaction, ticket, scratchedPositions, winResult);
                } else {
                    // Continue scratching
                    const updatedTicket = { ...ticket, scratched_positions: scratchedPositions };
                    const scratchEmbed = await this.createScratchInterface(updatedTicket, interaction.user);
                    await interaction.editReply(scratchEmbed);
                }
                
                logger.info(`User ${interaction.user.tag} successfully scratched position ${position} on ticket ${ticketId}`);
                
            } finally {
                // Always remove lock
                this.activeScratchLocks.delete(lockKey);
            }
            
        } catch (error) {
            logger.error(`Error handling scratch position: ${error.message}`);
            throw error;
        }
    }

    /**
     * Complete the scratch game
     */
    async completeGame(interaction, ticket, scratchedPositions, winResult) {
        try {
            let winAmount = 0;
            
            if (winResult.won) {
                // Determine prize amount based on symbol
                const symbolPrizes = {
                    '💎': 400000, '⭐': 250000, '🍀': 150000,
                    '🎰': 150000, '🔔': 150000, '🍒': 150000
                };
                winAmount = symbolPrizes[winResult.symbol] || 150000;
                
                // Award prize via PayoutManager
                const gameResult = new GameResult(
                    GameType.SCRATCH_TICKET,
                    winAmount,
                    0, // No bet amount for scratch tickets
                    { ticketId: ticket.id, symbol: winResult.symbol, positions: scratchedPositions }
                );
                
                await PayoutManager.processPayout(interaction.user.id, interaction.guildId, gameResult);
            }
            
            // Mark ticket as complete
            await dbManager.completeScratchTicket(ticket.id, winResult.won, winAmount);
            
            // Create final result embed
            const resultEmbed = await this.createResultInterface(ticket, scratchedPositions, winResult, winAmount, interaction.user);
            
            await interaction.update(resultEmbed);
            
            logger.info(`Completed scratch ticket ${ticket.id} for user ${interaction.user.tag} - Won: ${winResult.won}, Amount: ${winAmount}`);
            
        } catch (error) {
            logger.error(`Error completing game: ${error.message}`);
            throw error;
        }
    }

    /**
     * Create scratch interface embed
     */
    async createScratchInterface(ticket, user) {
        try {
            // Ensure scratchedPositions is always an array
            let scratchedPositions = ticket.scratched_positions;
            if (!Array.isArray(scratchedPositions)) {
                scratchedPositions = [];
            }
            
            const embed = new EmbedBuilder()
                .setTitle(`🎫 ${user.displayName}'s Scratch Ticket`)
                .setDescription(`**Ticket ID:** ${ticket.id}\n**Progress:** ${scratchedPositions.length}/9 scratched\n\nClick the buttons below to scratch and reveal symbols!`)
                .setColor(0x00FF99)
                .addFields([
                    {
                        name: '🎯 Goal',
                        value: 'Find 3 matching symbols to win!',
                        inline: true
                    },
                    {
                        name: '💰 Prizes',
                        value: '$150K • $250K • $400K',
                        inline: true
                    },
                    {
                        name: '⏰ Time Left',
                        value: 'Up to 10 minutes',
                        inline: true
                    }
                ])
                .setFooter({ text: '🍀 Good luck scratching!' })
                .setTimestamp();

            // Create scratch grid buttons
            const rows = [];
            for (let row = 0; row < 3; row++) {
                const actionRow = new ActionRowBuilder();
                for (let col = 0; col < 3; col++) {
                    const position = row * 3 + col;
                    const isScratched = scratchedPositions.includes(position);
                    
                    const button = new ButtonBuilder()
                        .setCustomId(`scratch_${ticket.id}_${position}`)
                        .setStyle(isScratched ? ButtonStyle.Success : ButtonStyle.Secondary)
                        .setLabel(isScratched ? ticket.symbols[position] : `${position + 1}`)
                        .setDisabled(isScratched);
                    
                    actionRow.addComponents(button);
                }
                rows.push(actionRow);
            }

            return {
                embeds: [embed],
                components: rows
            };
            
        } catch (error) {
            logger.error(`Error creating scratch interface: ${error.message}`);
            throw error;
        }
    }

    /**
     * Create result interface embed
     */
    async createResultInterface(ticket, scratchedPositions, winResult, winAmount, user) {
        try {
            const embed = new EmbedBuilder()
                .setTitle(`🎫 ${user.displayName}'s Scratch Ticket - ${winResult.won ? '🎉 WINNER!' : '💸 NO MATCH'}`)
                .setDescription(`**Ticket ID:** ${ticket.id}\n**Final Result:** All 9 positions scratched!`)
                .setColor(winResult.won ? 0x00FF00 : 0xFF6B6B);

            // Show all revealed symbols
            let symbolGrid = '';
            for (let row = 0; row < 3; row++) {
                for (let col = 0; col < 3; col++) {
                    const position = row * 3 + col;
                    symbolGrid += ticket.symbols[position];
                    if (col < 2) symbolGrid += ' ';
                }
                if (row < 2) symbolGrid += '\n';
            }

            embed.addFields([
                {
                    name: '🎯 Revealed Symbols',
                    value: `\`\`\`\n${symbolGrid}\n\`\`\``,
                    inline: false
                }
            ]);

            if (winResult.won) {
                embed.addFields([
                    {
                        name: '🏆 Congratulations!',
                        value: `You found **3 ${winResult.symbol}** symbols!\n**Prize Won:** ${fmtFull(winAmount)}`,
                        inline: false
                    }
                ]);
            } else {
                embed.addFields([
                    {
                        name: '💸 Better Luck Next Time!',
                        value: 'No matching symbols found. Keep watching for more scratch ticket drops!',
                        inline: false
                    }
                ]);
            }

            embed.setFooter({ text: '🎫 Scratch Ticket Game Complete' })
                .setTimestamp();

            return {
                embeds: [embed],
                components: [] // Remove all buttons when game is complete
            };
            
        } catch (error) {
            logger.error(`Error creating result interface: ${error.message}`);
            throw error;
        }
    }

    /**
     * Shutdown cleanup
     */
    shutdown() {
        // Clear all timers
        for (const timeoutId of this.activeDropTimers.values()) {
            clearTimeout(timeoutId);
        }
        this.activeDropTimers.clear();

        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }

        logger.info('Scratch ticket system shutdown complete');
    }
}

module.exports = ScratchTicketSystem;
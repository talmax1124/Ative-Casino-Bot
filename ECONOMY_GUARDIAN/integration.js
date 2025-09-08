/**
 * EconomyGuardian Integration - Production Integration Guide
 * How to integrate EconomyGuardian with your existing casino bot
 */

const EconomyGuardian = require('./index');
const logger = require('../UTILS/logger');

/**
 * Initialize and integrate EconomyGuardian with your Discord client
 */
async function initializeEconomyGuardian(client, config = {}) {
    try {
        logger.info('Initializing EconomyGuardian integration...');
        
        // Default configuration
        const defaultConfig = {
            // Operational mode
            mode: 'advisor', // 'advisor' or 'controller'
            
            // OpenAI Configuration
            openaiApiKey: process.env.OPENAI_API_KEY,
            model: 'gpt-4',
            temperature: 0.3,
            
            // Analysis intervals
            metricsInterval: 5 * 60 * 1000,    // 5 minutes
            analysisInterval: 15 * 60 * 1000,  // 15 minutes
            
            // Safety limits
            maxSingleAdjustment: 0.05,      // 5% max single change
            maxDailyChangesBudget: 0.05,    // 5% max daily economic impact
            cooldownPeriod: 60 * 60 * 1000, // 1 hour between major changes
            
            // Approval workflow
            approvalChannelId: process.env.ECONOMY_APPROVAL_CHANNEL,
            adminRoleId: process.env.ECONOMY_ADMIN_ROLE,
            autoApprovalEnabled: false,
            autoApprovalThreshold: 0.01,    // 1% impact threshold
            
            // Storage
            storageDir: './data/economy_guardian',
            
            // Auto-start
            autoStart: true,
            
            ...config
        };
        
        // Create EconomyGuardian instance
        const guardian = new EconomyGuardian(client, defaultConfig);
        
        // Initialize the system
        await guardian.initialize();
        
        // Attach to client for access from commands
        client.economyGuardian = guardian;
        
        // Set up event handlers
        setupEventHandlers(guardian, client);
        
        // Set up Discord button interactions
        setupButtonInteractions(client, guardian);
        
        logger.info('EconomyGuardian integration completed successfully');
        
        return guardian;
        
    } catch (error) {
        logger.error(`EconomyGuardian integration failed: ${error.message}`);
        throw error;
    }
}

/**
 * Set up event handlers for EconomyGuardian
 */
function setupEventHandlers(guardian, client) {
    // System events
    guardian.on('started', () => {
        logger.info('EconomyGuardian has started monitoring the economy');
    });
    
    guardian.on('stopped', () => {
        logger.warn('EconomyGuardian monitoring has stopped');
    });
    
    guardian.on('error', (error) => {
        logger.error(`EconomyGuardian error: ${error.message}`);
    });
    
    // Analysis events
    guardian.on('analysisComplete', (analysisData) => {
        logger.info(`Economic analysis completed: ${analysisData.analysis.overallSeverity} severity`);
        
        // Log critical issues
        if (analysisData.analysis.overallSeverity === 'critical') {
            logger.error('CRITICAL economic issues detected by AI analysis');
        }
    });
    
    // Proposal events
    guardian.on('proposalExecuted', ({ proposal, results }) => {
        logger.info(`Economic proposal executed: ${proposal.title}`);
        
        // You can integrate with your game systems here
        // Example: updateGameConfiguration(proposal.actions, results);
    });
    
    // Emergency events
    guardian.on('emergency', (reason) => {
        logger.error(`ECONOMY EMERGENCY: ${reason}`);
        
        // Send emergency notifications to administrators
        notifyAdministrators(client, 'EMERGENCY', reason);
    });
}

/**
 * Set up Discord button interactions for approval workflow
 */
function setupButtonInteractions(client, guardian) {
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isButton()) return;
        
        // Handle EconomyGuardian approval buttons
        if (interaction.customId.startsWith('approve_') || 
            interaction.customId.startsWith('reject_') ||
            interaction.customId.startsWith('details_') ||
            interaction.customId.startsWith('postpone_')) {
            
            const handled = await guardian.approvalWorkflow.handleButtonInteraction(interaction);
            if (handled) return;
        }
        
        // Handle status command buttons
        if (interaction.customId.startsWith('eg_')) {
            await handleStatusButtons(interaction, guardian);
        }
    });
}

/**
 * Handle status command buttons
 */
async function handleStatusButtons(interaction, guardian) {
    const action = interaction.customId.replace('eg_', '');
    
    try {
        switch (action) {
            case 'start':
                await guardian.start();
                await interaction.reply({
                    content: '✅ EconomyGuardian started successfully',
                    ephemeral: true
                });
                break;
                
            case 'stop':
                await guardian.stop();
                await interaction.reply({
                    content: '🛑 EconomyGuardian stopped',
                    ephemeral: true
                });
                break;
                
            case 'analysis':
                await interaction.deferReply({ ephemeral: true });
                await guardian.performAnalysis();
                await interaction.editReply({
                    content: '📊 Analysis completed - check the analysis results with `/economyguardian analysis`'
                });
                break;
                
            case 'emergency_reset':
                await guardian.guardRails.resetEmergencyMode();
                await interaction.reply({
                    content: '🔄 Emergency mode reset',
                    ephemeral: true
                });
                break;
        }
    } catch (error) {
        logger.error(`Button interaction error: ${error.message}`);
        
        try {
            await interaction.reply({
                content: `❌ Error: ${error.message}`,
                ephemeral: true
            });
        } catch (replyError) {
            logger.error(`Failed to send error reply: ${replyError.message}`);
        }
    }
}

/**
 * Notify administrators of important events
 */
async function notifyAdministrators(client, level, message) {
    try {
        const channelId = process.env.ECONOMY_APPROVAL_CHANNEL || 
                         process.env.ERROR_LOG_CHANNEL ||
                         process.env.ADMIN_CHANNEL;
        
        if (!channelId) return;
        
        const channel = await client.channels.fetch(channelId);
        if (!channel) return;
        
        const emoji = level === 'EMERGENCY' ? '🚨' : level === 'WARNING' ? '⚠️' : 'ℹ️';
        
        await channel.send({
            content: `${emoji} **EconomyGuardian ${level}**\n\n${message}`,
        });
        
    } catch (error) {
        logger.error(`Failed to notify administrators: ${error.message}`);
    }
}

/**
 * Graceful shutdown of EconomyGuardian
 */
async function shutdownEconomyGuardian(client) {
    if (client.economyGuardian) {
        try {
            logger.info('Shutting down EconomyGuardian...');
            await client.economyGuardian.stop();
            logger.info('EconomyGuardian shutdown complete');
        } catch (error) {
            logger.error(`EconomyGuardian shutdown error: ${error.message}`);
        }
    }
}

/**
 * Integration points for your existing game systems
 * These are placeholders that you should implement based on your specific architecture
 */
const gameIntegrationPoints = {
    
    /**
     * Adjust game payout rates
     */
    async adjustGamePayout(game, adjustmentPercentage) {
        logger.info(`[INTEGRATION] Adjusting ${game} payout by ${adjustmentPercentage}%`);
        
        // TODO: Integrate with your game configuration system
        // Example implementation:
        /*
        const currentPayout = await getGamePayoutRate(game);
        const newPayout = currentPayout * (1 + adjustmentPercentage / 100);
        await updateGamePayoutRate(game, newPayout);
        */
        
        return { success: true, game, adjustment: adjustmentPercentage };
    },
    
    /**
     * Modify betting limits
     */
    async modifyGameLimits(game, limits) {
        logger.info(`[INTEGRATION] Modifying ${game} limits:`, limits);
        
        // TODO: Integrate with your game limits system
        // Example implementation:
        /*
        if (limits.minBet) await updateGameMinBet(game, limits.minBet);
        if (limits.maxBet) await updateGameMaxBet(game, limits.maxBet);
        */
        
        return { success: true, game, limits };
    },
    
    /**
     * Adjust house edge
     */
    async adjustHouseEdge(game, adjustmentPercentage) {
        logger.info(`[INTEGRATION] Adjusting ${game} house edge by ${adjustmentPercentage}%`);
        
        // TODO: Integrate with your house edge system
        // Example implementation:
        /*
        const currentEdge = await getGameHouseEdge(game);
        const newEdge = currentEdge + (adjustmentPercentage / 100);
        await updateGameHouseEdge(game, newEdge);
        */
        
        return { success: true, game, adjustment: adjustmentPercentage };
    },
    
    /**
     * Modify drop rates
     */
    async modifyDropRates(system, rates) {
        logger.info(`[INTEGRATION] Modifying ${system} drop rates:`, rates);
        
        // TODO: Integrate with your drop rate systems
        // Example implementation:
        /*
        for (const [item, rate] of Object.entries(rates)) {
            await updateDropRate(system, item, rate);
        }
        */
        
        return { success: true, system, rates };
    }
};

// Export integration functions
module.exports = {
    initializeEconomyGuardian,
    shutdownEconomyGuardian,
    gameIntegrationPoints,
    setupEventHandlers,
    setupButtonInteractions
};

/**
 * INTEGRATION INSTRUCTIONS:
 * 
 * 1. In your main bot index.js file, add:
 *    ```javascript
 *    const { initializeEconomyGuardian, shutdownEconomyGuardian } = require('./ECONOMY_GUARDIAN/integration');
 *    
 *    // After client is ready
 *    client.once('ready', async () => {
 *        try {
 *            await initializeEconomyGuardian(client, {
 *                mode: 'advisor', // or 'controller'
 *                openaiApiKey: process.env.OPENAI_API_KEY,
 *                approvalChannelId: 'YOUR_APPROVAL_CHANNEL_ID'
 *            });
 *        } catch (error) {
 *            console.error('EconomyGuardian initialization failed:', error);
 *        }
 *    });
 *    
 *    // Graceful shutdown
 *    process.on('SIGTERM', async () => {
 *        await shutdownEconomyGuardian(client);
 *        process.exit(0);
 *    });
 *    ```
 * 
 * 2. Set environment variables:
 *    - OPENAI_API_KEY: Your OpenAI API key
 *    - ECONOMY_APPROVAL_CHANNEL: Discord channel ID for approvals
 *    - ECONOMY_ADMIN_ROLE: Discord role ID for administrators
 * 
 * 3. Install dependencies:
 *    ```bash
 *    npm install axios
 *    ```
 * 
 * 4. Implement game integration points in the gameIntegrationPoints object
 *    to connect with your specific game configuration systems.
 * 
 * 5. The /economyguardian command is already created and will be automatically
 *    registered with your bot's command system.
 * 
 * 6. Test in advisor mode first, then switch to controller mode when ready
 *    for automated execution.
 */
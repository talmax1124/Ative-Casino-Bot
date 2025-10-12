/**
 * PlayFor command for ATIVE Casino Bot
 * Allows users to bet their own money while winnings go to another user
 */

const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { validateAmount, formatMoney: fmt } = require('../UTILS/moneyFormatter');
const { getGuildId, sendLogMessage } = require('../UTILS/common');
const dbManager = require('../UTILS/database');
const logger = require('../UTILS/logger');

// Supported games with their command names
const SUPPORTED_GAMES = {
    'slots': 'slots',
    'blackjack': 'blackjack', 
    'roulette': 'roulette',
    'plinko': 'plinko',
    'ceelo': 'ceelo',
    'keno': 'keno',
    'mines': 'mines',
    'multi-slots': 'multi-slots',
    'yahtzee': 'yahtzee',
    'fishing': 'fishing',
    'treasurevault': 'treasurevault'
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('playfor')
        .setDescription('🎁 Play casino games where YOU pay the bet but SOMEONE ELSE gets the winnings!')
        .addSubcommand(subcommand =>
            subcommand.setName('slots')
                .setDescription('🎰 Play slots for someone else')
                .addUserOption(option =>
                    option.setName('recipient')
                        .setDescription('Who will receive the winnings')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('amount')
                        .setDescription('Amount to bet (supports K/M/B/T, "all", "half", "quarter")')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('mode')
                        .setDescription('Game difficulty mode')
                        .addChoices(
                            { name: '🛡️ Safe (Min $500, Max 1.8x)', value: 'safe' },
                            { name: '⚖️ Balanced (Min $1K, Max 2.0x)', value: 'balanced' },
                            { name: '⚡ Risky (Min $2.5K, Max 2.2x)', value: 'risky' },
                            { name: '🔥 Extreme (Min $5K, Max 2.2x)', value: 'extreme' }
                        )))
        .addSubcommand(subcommand =>
            subcommand.setName('blackjack')
                .setDescription('🃏 Play blackjack for someone else')
                .addUserOption(option =>
                    option.setName('recipient')
                        .setDescription('Who will receive the winnings')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('amount')
                        .setDescription('Amount to bet (supports K/M/B/T, "all", "half", "quarter")')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand.setName('roulette')
                .setDescription('🎯 Play roulette for someone else')
                .addUserOption(option =>
                    option.setName('recipient')
                        .setDescription('Who will receive the winnings')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('amount')
                        .setDescription('Amount to bet (supports K/M/B/T, "all", "half", "quarter")')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('Bet type')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Red', value: 'red' },
                            { name: 'Black', value: 'black' },
                            { name: 'Green (0)', value: 'green' },
                            { name: 'Odd', value: 'odd' },
                            { name: 'Even', value: 'even' },
                            { name: 'High (19-36)', value: 'high' },
                            { name: 'Low (1-18)', value: 'low' }
                        ))
                .addIntegerOption(option =>
                    option.setName('number')
                        .setDescription('Specific number to bet on (0-36, optional)')
                        .setMinValue(0)
                        .setMaxValue(36)))
        .addSubcommand(subcommand =>
            subcommand.setName('plinko')
                .setDescription('🎈 Play plinko for someone else')
                .addUserOption(option =>
                    option.setName('recipient')
                        .setDescription('Who will receive the winnings')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('amount')
                        .setDescription('Amount to bet (supports K/M/B/T, "all", "half", "quarter")')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('risk')
                        .setDescription('Risk level')
                        .addChoices(
                            { name: 'Low Risk', value: 'low' },
                            { name: 'Medium Risk', value: 'medium' },
                            { name: 'High Risk', value: 'high' }
                        )))
        .addSubcommand(subcommand =>
            subcommand.setName('ceelo')
                .setDescription('🎲 Play ceelo for someone else')
                .addUserOption(option =>
                    option.setName('recipient')
                        .setDescription('Who will receive the winnings')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('amount')
                        .setDescription('Amount to bet (supports K/M/B/T, "all", "half", "quarter")')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand.setName('keno')
                .setDescription('🎯 Play keno for someone else')
                .addUserOption(option =>
                    option.setName('recipient')
                        .setDescription('Who will receive the winnings')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('amount')
                        .setDescription('Amount to bet (supports K/M/B/T, "all", "half", "quarter")')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand.setName('mines')
                .setDescription('💣 Play mines for someone else')
                .addUserOption(option =>
                    option.setName('recipient')
                        .setDescription('Who will receive the winnings')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('amount')
                        .setDescription('Amount to bet (supports K/M/B/T, "all", "half", "quarter")')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand.setName('multi-slots')
                .setDescription('🎰 Play multi-slots for someone else')
                .addUserOption(option =>
                    option.setName('recipient')
                        .setDescription('Who will receive the winnings')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('amount')
                        .setDescription('Amount to bet (supports K/M/B/T, "all", "half", "quarter")')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand.setName('yahtzee')
                .setDescription('🎲 Play yahtzee for someone else')
                .addUserOption(option =>
                    option.setName('recipient')
                        .setDescription('Who will receive the winnings')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('amount')
                        .setDescription('Amount to bet (supports K/M/B/T, "all", "half", "quarter")')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand.setName('fishing')
                .setDescription('🎣 Play fishing for someone else')
                .addUserOption(option =>
                    option.setName('recipient')
                        .setDescription('Who will receive the winnings')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('amount')
                        .setDescription('Amount to bet (supports K/M/B/T, "all", "half", "quarter")')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand.setName('treasurevault')
                .setDescription('💰 Play treasure vault for someone else')
                .addUserOption(option =>
                    option.setName('recipient')
                        .setDescription('Who will receive the winnings')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('amount')
                        .setDescription('Amount to bet (supports K/M/B/T, "all", "half", "quarter")')
                        .setRequired(true))),

    async execute(interaction) {
        await interaction.deferReply();
        
        const subcommand = interaction.options.getSubcommand();
        const game = SUPPORTED_GAMES[subcommand];
        const recipient = interaction.options.getUser('recipient');
        const betInput = interaction.options.getString('amount');
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);

        try {
            // Validate recipient
            if (recipient.id === userId) {
                return await interaction.editReply({
                    content: '❌ You cannot play for yourself! Just use the regular game commands.',
                    flags: MessageFlags.Ephemeral
                });
            }

            if (recipient.bot) {
                return await interaction.editReply({
                    content: '❌ You cannot play for bots.',
                    flags: MessageFlags.Ephemeral
                });
            }

            // Ensure both users exist in the database
            await dbManager.ensureUser(userId, interaction.user.displayName || interaction.user.globalName || 'Player');
            await dbManager.ensureUser(recipient.id, recipient.displayName || recipient.globalName || recipient.username || 'Recipient');

            // Get player balance and validate bet
            const playerBalance = await dbManager.getUserBalance(userId, guildId);
            const betValidation = validateAmount(betInput, playerBalance.wallet, 100, null);

            if (!betValidation.isValid) {
                return await interaction.editReply({
                    content: `❌ ${betValidation.error}`,
                    flags: MessageFlags.Ephemeral
                });
            }

            const bet = betValidation.amount;

            // Show confirmation
            const confirmEmbed = new EmbedBuilder()
                .setTitle('🎁 Play For Confirmation')
                .setDescription(`Are you sure you want to play **${game}** for **${recipient.displayName}**?`)
                .addFields(
                    {
                        name: '💰 Your Bet',
                        value: fmt(bet),
                        inline: true
                    },
                    {
                        name: '🎮 Game',
                        value: game.charAt(0).toUpperCase() + game.slice(1),
                        inline: true
                    },
                    {
                        name: '🎁 Recipient',
                        value: `<@${recipient.id}>`,
                        inline: true
                    },
                    {
                        name: '⚠️ Important',
                        value: `• You pay **${fmt(bet)}** from your balance\n• Any winnings go to **${recipient.displayName}**\n• If you lose, ${recipient.displayName} gets nothing`,
                        inline: false
                    }
                )
                .setColor(0xFFD700)
                .setTimestamp()
                .setFooter({ text: 'You have 30 seconds to confirm' });

            const confirmButton = new ButtonBuilder()
                .setCustomId(`playfor_confirm_${subcommand}`)
                .setLabel('✅ Confirm')
                .setStyle(ButtonStyle.Success);

            const cancelButton = new ButtonBuilder()
                .setCustomId('playfor_cancel')
                .setLabel('❌ Cancel')
                .setStyle(ButtonStyle.Danger);

            const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

            const message = await interaction.editReply({
                embeds: [confirmEmbed],
                components: [row]
            });

            // Wait for confirmation
            try {
                const buttonInteraction = await message.awaitMessageComponent({
                    filter: (i) => i.user.id === userId,
                    time: 30000
                });

                if (buttonInteraction.customId === 'playfor_cancel') {
                    await buttonInteraction.update({
                        content: '❌ Play for cancelled.',
                        embeds: [],
                        components: []
                    });
                    return;
                }

                // Process the game
                await buttonInteraction.deferUpdate();
                await this.processPlayFor(interaction, subcommand, userId, recipient, bet, guildId);

            } catch (error) {
                await interaction.editReply({
                    content: '⏰ Confirmation timed out. Play for cancelled.',
                    embeds: [],
                    components: []
                });
            }

        } catch (error) {
            logger.error(`Error in playfor command: ${error.message}`);
            await interaction.editReply({
                content: '❌ An error occurred while processing your play for request.'
            });
        }
    },

    async processPlayFor(interaction, game, playerId, recipient, bet, guildId) {
        try {
            // Store play-for context globally for the session manager to pick up
            global.playForContext = {
                recipientId: recipient.id,
                recipientName: recipient.displayName || recipient.globalName || recipient.username || 'Recipient',
                playerId: playerId,
                playerName: interaction.user.displayName || interaction.user.globalName || 'Player',
                bet: bet,
                game: game,
                channelId: interaction.channelId,
                sessionTimestamp: Date.now() // Unique identifier for this playfor session
            };
            
            // Store Discord client for DM notifications
            global.discordClient = interaction.client;
            
            logger.info(`PlayFor: Setting global context for ${playerId} -> ${recipient.id} (${game}, ${bet})`);

            // Load the game command
            const gameCommand = require(`./${game}.js`);
            
            // Create a properly wrapped interaction that preserves all methods
            const playForInteraction = {
                ...interaction,
                user: {
                    ...interaction.user,
                    id: playerId, // Use player's ID for balance operations
                    displayName: interaction.user.displayName || interaction.user.globalName || interaction.user.username // Preserve display name
                },
                member: {
                    ...interaction.member,
                    user: {
                        ...interaction.user,
                        id: playerId
                    }
                },
                // Override options to provide bet amount under multiple names
                options: {
                    getString: (key) => {
                        if (key === 'amount' || key === 'bet') return bet.toString();
                        // Plinko expects capitalized mode names
                        if (key === 'mode') {
                            // Check if game is plinko and return proper mode
                            if (game === 'plinko') {
                                // Check if user provided a risk level
                                const risk = interaction.options.getString('risk');
                                if (risk === 'low') return 'Easy';
                                if (risk === 'high') return 'Hard';
                                return 'Medium';  // Default to Medium
                            }
                            return 'balanced'; // For other games
                        }
                        if (key === 'risk') return 'medium'; 
                        if (key === 'type') return 'red';
                        return interaction.options.getString(key);
                    },
                    getNumber: (key) => {
                        if (key === 'cashout') return 2.0;
                        return interaction.options.getNumber(key);
                    },
                    getInteger: (key) => {
                        if (key === 'number') return null;
                        if (key === 'spots') return 5; // Default spots for keno
                        return interaction.options.getInteger(key);
                    },
                    getUser: (key) => {
                        if (key === 'recipient') return recipient;
                        return interaction.options.getUser(key);
                    },
                    getSubcommand: () => game
                },
                // Preserve all interaction methods but handle state properly
                reply: async (...args) => await interaction.editReply(...args),
                editReply: interaction.editReply.bind(interaction),
                followUp: interaction.followUp.bind(interaction),
                deleteReply: interaction.deleteReply.bind(interaction),
                // Override deferReply since we're already deferred
                deferReply: async () => { 
                    // Already deferred by playfor, just return success
                    return Promise.resolve();
                },
                // Interaction state - playfor has already deferred this
                replied: false,
                deferred: true  // Important: we HAVE deferred already
            };

            // Execute the game command
            await gameCommand.execute(playForInteraction);

            // Delay clearing the global context to allow session creation
            setTimeout(() => {
                delete global.playForContext;
                delete global.discordClient;
                logger.info(`PlayFor: Cleaned up global context after game completion`);
            }, 5000); // 5 second delay

        } catch (error) {
            logger.error(`Error processing playfor game: ${error.message}`);
            // Clear context on error
            delete global.playForContext;
            delete global.discordClient;
            
            await interaction.editReply({
                content: '❌ An error occurred while processing the game.',
                embeds: [],
                components: []
            });
        }
    }
};
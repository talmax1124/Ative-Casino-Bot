/**
 * Standardized Game Panel System for ATIVE Casino Bot
 * Provides consistent UI templates and components for all game commands
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');

// Standard colors for different states
const COLORS = {
    primary: '#0099ff',      // Blue - default/info
    success: '#00ff00',      // Green - success/win
    warning: '#ffa500',      // Orange - warning/caution
    error: '#ff0000',        // Red - error/loss
    neutral: '#808080',      // Gray - neutral/disabled
    casino: '#ffd700',       // Gold - casino theme
    jackpot: '#ff69b4'       // Pink - jackpot/special
};

// Standard button layouts
const BUTTON_LAYOUTS = {
    gameActions: ['hit', 'stand', 'double'],
    confirmCancel: ['confirm', 'cancel'],
    backNext: ['back', 'next'],
    playAgain: ['play_again', 'quit']
};

class GamePanel {
    /**
     * Create a standardized game embed with consistent styling
     */
    static createGameEmbed(options = {}) {
        const {
            title = 'Casino Game',
            description = '',
            gameType = 'unknown',
            status = 'active',
            betAmount = 0,
            balance = 0,
            fields = [],
            footer = '',
            color = null,
            thumbnail = null,
            image = null
        } = options;

        // Determine color based on status if not provided
        let embedColor = color;
        if (!embedColor) {
            switch (status.toLowerCase()) {
                case 'win': case 'won': case 'success':
                    embedColor = COLORS.success;
                    break;
                case 'loss': case 'lost': case 'lose':
                    embedColor = COLORS.error;
                    break;
                case 'draw': case 'tie': case 'push':
                    embedColor = COLORS.neutral;
                    break;
                case 'active': case 'playing':
                    embedColor = COLORS.primary;
                    break;
                case 'warning':
                    embedColor = COLORS.warning;
                    break;
                default:
                    embedColor = COLORS.casino;
            }
        }

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(embedColor)
            .setTimestamp();

        // Add standard fields if data provided
        if (betAmount > 0 || balance > 0) {
            const gameFields = [];
            if (betAmount > 0) {
                gameFields.push({ name: '💰 Bet', value: `$${betAmount.toLocaleString()}`, inline: true });
            }
            if (balance > 0) {
                gameFields.push({ name: '🏦 Balance', value: `$${balance.toLocaleString()}`, inline: true });
            }
            embed.addFields(gameFields);
        }

        // Add custom fields
        if (fields.length > 0) {
            embed.addFields(fields);
        }

        // Add footer with game type
        const footerText = footer || `${gameType.charAt(0).toUpperCase() + gameType.slice(1)} • ATIVE Casino Bot`;
        embed.setFooter({ text: footerText });

        // Add thumbnail or image if provided
        if (thumbnail) {
            embed.setThumbnail(thumbnail);
        }
        if (image) {
            embed.setImage(image);
        }

        return embed;
    }

    /**
     * Create standardized game action buttons
     */
    static createGameButtons(options = {}) {
        const {
            actions = [],
            layout = 'horizontal',
            disabled = false,
            customButtons = []
        } = options;

        const buttons = [];

        // Add standard game action buttons
        actions.forEach(action => {
            let button;
            
            switch (action.toLowerCase()) {
                case 'hit':
                    button = new ButtonBuilder()
                        .setCustomId('game_hit')
                        .setLabel('Hit')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('👊');
                    break;
                    
                case 'stand':
                    button = new ButtonBuilder()
                        .setCustomId('game_stand')
                        .setLabel('Stand')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('✋');
                    break;
                    
                case 'double':
                    button = new ButtonBuilder()
                        .setCustomId('game_double')
                        .setLabel('Double Down')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('⏫');
                    break;
                    
                case 'split':
                    button = new ButtonBuilder()
                        .setCustomId('game_split')
                        .setLabel('Split')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('↔️');
                    break;
                    
                case 'bet':
                    button = new ButtonBuilder()
                        .setCustomId('game_bet')
                        .setLabel('Place Bet')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('💰');
                    break;
                    
                case 'spin':
                    button = new ButtonBuilder()
                        .setCustomId('game_spin')
                        .setLabel('Spin')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🎰');
                    break;
                    
                case 'play_again':
                    button = new ButtonBuilder()
                        .setCustomId('game_play_again')
                        .setLabel('Play Again')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('🔄');
                    break;
                    
                case 'quit':
                case 'exit':
                    button = new ButtonBuilder()
                        .setCustomId('game_quit')
                        .setLabel('Quit')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('🚪');
                    break;
                    
                case 'help':
                    button = new ButtonBuilder()
                        .setCustomId('game_help')
                        .setLabel('Help')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('❓');
                    break;
                    
                case 'rules':
                    button = new ButtonBuilder()
                        .setCustomId('game_rules')
                        .setLabel('Rules')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('📋');
                    break;
                    
                case 'stats':
                    button = new ButtonBuilder()
                        .setCustomId('game_stats')
                        .setLabel('Stats')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('📊');
                    break;
                    
                default:
                    // Skip unknown actions
                    return;
            }

            if (button && disabled) {
                button.setDisabled(true);
            }

            if (button) {
                buttons.push(button);
            }
        });

        // Add custom buttons
        customButtons.forEach(customButton => {
            buttons.push(customButton);
        });

        // Organize buttons into rows (max 5 buttons per row)
        const rows = [];
        const buttonsPerRow = layout === 'vertical' ? 1 : 5;
        
        for (let i = 0; i < buttons.length; i += buttonsPerRow) {
            const rowButtons = buttons.slice(i, i + buttonsPerRow);
            if (rowButtons.length > 0) {
                rows.push(new ActionRowBuilder().addComponents(rowButtons));
            }
        }

        return rows;
    }

    /**
     * Create standardized loading state
     */
    static createLoadingEmbed(options = {}) {
        const {
            title = '⏳ Processing...',
            description = 'Please wait while your game is being processed.',
            gameType = 'unknown'
        } = options;

        return new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(COLORS.warning)
            .setFooter({ text: `${gameType} • Loading...` })
            .setTimestamp();
    }

    /**
     * Create standardized error embed
     */
    static createErrorEmbed(options = {}) {
        const {
            title = '❌ Game Error',
            description = 'An error occurred while processing your game.',
            error = null,
            gameType = 'unknown',
            showRetry = true
        } = options;

        let errorDescription = description;
        if (error && typeof error === 'string') {
            errorDescription += `\n\n**Error:** ${error}`;
        }

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(errorDescription)
            .setColor(COLORS.error)
            .setFooter({ text: `${gameType} • Error occurred` })
            .setTimestamp();

        const components = [];
        if (showRetry) {
            const retryButton = new ButtonBuilder()
                .setCustomId('game_retry')
                .setLabel('Try Again')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🔄');

            components.push(new ActionRowBuilder().addComponents(retryButton));
        }

        return { embed, components };
    }

    /**
     * Create standardized win/loss result embed
     */
    static createResultEmbed(options = {}) {
        const {
            result = 'win', // 'win', 'loss', 'draw'
            gameType = 'unknown',
            betAmount = 0,
            winAmount = 0,
            newBalance = 0,
            message = '',
            details = [],
            showPlayAgain = true
        } = options;

        let title, color, emoji;
        
        switch (result.toLowerCase()) {
            case 'win':
                title = '🎉 You Win!';
                color = COLORS.success;
                emoji = '🎉';
                break;
            case 'loss':
            case 'lose':
                title = '💸 You Lose';
                color = COLORS.error;
                emoji = '💸';
                break;
            case 'draw':
            case 'tie':
            case 'push':
                title = '🤝 Draw';
                color = COLORS.neutral;
                emoji = '🤝';
                break;
            default:
                title = '🎲 Game Complete';
                color = COLORS.primary;
                emoji = '🎲';
        }

        let description = message || `Game completed with result: ${result}`;

        const fields = [];
        
        if (betAmount > 0) {
            fields.push({ name: '💰 Bet Amount', value: `$${betAmount.toLocaleString()}`, inline: true });
        }
        
        if (winAmount !== 0) {
            fields.push({ 
                name: winAmount > 0 ? '💵 Won' : '💸 Lost', 
                value: `$${Math.abs(winAmount).toLocaleString()}`, 
                inline: true 
            });
        }
        
        if (newBalance > 0) {
            fields.push({ name: '🏦 New Balance', value: `$${newBalance.toLocaleString()}`, inline: true });
        }

        // Add custom details
        details.forEach(detail => fields.push(detail));

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(color)
            .addFields(fields)
            .setFooter({ text: `${gameType} • Game Complete` })
            .setTimestamp();

        const components = [];
        if (showPlayAgain) {
            const buttons = [
                new ButtonBuilder()
                    .setCustomId('game_play_again')
                    .setLabel('Play Again')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('🔄'),
                new ButtonBuilder()
                    .setCustomId('game_quit')
                    .setLabel('Quit')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🚪')
            ];
            
            components.push(new ActionRowBuilder().addComponents(buttons));
        }

        return { embed, components };
    }

    /**
     * Create standardized bet selection menu
     */
    static createBetSelector(options = {}) {
        const {
            balance = 1000,
            minBet = 10,
            maxBet = null,
            presetBets = [10, 25, 50, 100, 250, 500, 1000],
            customId = 'bet_select'
        } = options;

        const actualMaxBet = maxBet || Math.floor(balance * 0.1); // Max 10% of balance if not specified
        
        // Filter preset bets based on balance and limits
        const validBets = presetBets.filter(bet => bet >= minBet && bet <= actualMaxBet && bet <= balance);

        const selectOptions = validBets.map(bet => ({
            label: `$${bet.toLocaleString()}`,
            description: `Bet $${bet.toLocaleString()}`,
            value: bet.toString(),
            emoji: '💰'
        }));

        // Add "All In" option if balance is higher than the highest preset
        if (balance > Math.max(...validBets) && balance >= minBet) {
            selectOptions.push({
                label: `All In ($${balance.toLocaleString()})`,
                description: 'Bet your entire balance',
                value: balance.toString(),
                emoji: '🎰'
            });
        }

        if (selectOptions.length === 0) {
            // No valid bets available
            return null;
        }

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(customId)
            .setPlaceholder('Select your bet amount...')
            .addOptions(selectOptions);

        return new ActionRowBuilder().addComponents(selectMenu);
    }

    /**
     * Create standardized game help embed
     */
    static createHelpEmbed(options = {}) {
        const {
            gameType = 'unknown',
            title = 'Game Help',
            description = '',
            rules = [],
            commands = [],
            tips = []
        } = options;

        const embed = new EmbedBuilder()
            .setTitle(`❓ ${title}`)
            .setDescription(description)
            .setColor(COLORS.primary)
            .setFooter({ text: `${gameType} Help • ATIVE Casino Bot` })
            .setTimestamp();

        if (rules.length > 0) {
            embed.addFields([{
                name: '📋 Rules',
                value: rules.map((rule, index) => `${index + 1}. ${rule}`).join('\n'),
                inline: false
            }]);
        }

        if (commands.length > 0) {
            embed.addFields([{
                name: '⚙️ Commands',
                value: commands.map(cmd => `• ${cmd}`).join('\n'),
                inline: false
            }]);
        }

        if (tips.length > 0) {
            embed.addFields([{
                name: '💡 Tips',
                value: tips.map(tip => `• ${tip}`).join('\n'),
                inline: false
            }]);
        }

        const closeButton = new ButtonBuilder()
            .setCustomId('help_close')
            .setLabel('Close')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('✅');

        return {
            embed,
            components: [new ActionRowBuilder().addComponents(closeButton)]
        };
    }

    /**
     * Create session validation embed for game start
     */
    static createSessionValidationEmbed(options = {}) {
        const {
            gameType = 'unknown',
            hasActiveSession = false,
            activeSessionType = '',
            balance = 0,
            minBet = 10
        } = options;

        if (hasActiveSession) {
            return this.createErrorEmbed({
                title: '⚠️ Active Session Detected',
                description: `You already have an active **${activeSessionType}** session. Please complete or stop your current game before starting a new one.`,
                gameType,
                showRetry: false
            });
        }

        if (balance < minBet) {
            return this.createErrorEmbed({
                title: '💸 Insufficient Balance',
                description: `You need at least $${minBet.toLocaleString()} to play ${gameType}. Your current balance is $${balance.toLocaleString()}.`,
                gameType,
                showRetry: false
            });
        }

        return null; // No validation issues
    }

    /**
     * Add loading states to existing components
     */
    static addLoadingState(components = [], loadingText = '⏳ Processing...') {
        return components.map(row => {
            const newRow = new ActionRowBuilder();
            row.components.forEach(component => {
                if (component instanceof ButtonBuilder) {
                    newRow.addComponents(
                        ButtonBuilder.from(component).setDisabled(true)
                    );
                } else {
                    newRow.addComponents(component);
                }
            });
            return newRow;
        });
    }

    /**
     * Get color constants for external use
     */
    static get COLORS() {
        return COLORS;
    }

    /**
     * Get button layout constants for external use
     */
    static get BUTTON_LAYOUTS() {
        return BUTTON_LAYOUTS;
    }
}

module.exports = GamePanel;
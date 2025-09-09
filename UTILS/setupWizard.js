/**
 * Setup Wizard Utility Class
 * Manages step-by-step server configuration with proper navigation
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const database = require('./database');
const logger = require('./logger');

class SetupWizard {
    constructor() {
        this.currentStep = 1;
        this.totalSteps = 7;
        this.serverData = {
            serverId: null,
            serverName: null,
            settings: {},
            roles: {},
            channels: {},
            economy: {},
            games: {},
            security: {},
            setupComplete: false,
            setupDate: null
        };
    }

    // Initialize wizard with server data
    async initialize(interaction) {
        this.serverData.serverId = interaction.guildId;
        this.serverData.serverName = interaction.guild.name;
        
        // Check for existing configuration
        const existingConfig = await database.getServerConfig(interaction.guildId);
        if (existingConfig && existingConfig.setupComplete) {
            return { isRerun: true, existingConfig };
        }
        
        return { isRerun: false };
    }

    // Permission validation system
    async validatePermissions(interaction) {
        const botMember = interaction.guild.members.me;
        const requiredPermissions = [
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.UseSlashCommands,
            PermissionFlagsBits.ManageMessages,
            PermissionFlagsBits.AddReactions,
            PermissionFlagsBits.CreatePublicThreads
        ];

        const missingPermissions = [];
        for (const permission of requiredPermissions) {
            if (!botMember.permissions.has(permission)) {
                missingPermissions.push(this.getPermissionName(permission));
            }
        }

        const userIsAdmin = await this.hasAdminPermissions(interaction.member);

        return {
            botPermissionsValid: missingPermissions.length === 0,
            missingBotPermissions: missingPermissions,
            userIsAdmin,
            canContinue: missingPermissions.length === 0 && userIsAdmin
        };
    }

    // Check admin permissions
    async hasAdminPermissions(member) {
        if (member?.guild?.ownerId === member.id) return true;
        if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
        
        const adminRoles = ['admin', 'administrator', 'owner'];
        return member.roles.cache.some(role => 
            adminRoles.some(adminRole => 
                role.name.toLowerCase().includes(adminRole)
            )
        );
    }

    // Get human-readable permission name
    getPermissionName(permission) {
        const permissionNames = {
            [PermissionFlagsBits.SendMessages]: 'Send Messages',
            [PermissionFlagsBits.EmbedLinks]: 'Embed Links',
            [PermissionFlagsBits.UseSlashCommands]: 'Use Slash Commands',
            [PermissionFlagsBits.ManageMessages]: 'Manage Messages',
            [PermissionFlagsBits.AddReactions]: 'Add Reactions',
            [PermissionFlagsBits.CreatePublicThreads]: 'Create Public Threads'
        };
        return permissionNames[permission] || 'Unknown Permission';
    }

    // Navigation methods
    showStep(stepNumber) {
        if (stepNumber < 1 || stepNumber > this.totalSteps) return null;
        this.currentStep = stepNumber;
        
        switch (stepNumber) {
            case 1: return this.showWelcomeStep();
            case 2: return this.showServerConfigStep();
            case 3: return this.showEconomyConfigStep();
            case 4: return this.showRoleConfigStep();
            case 5: return this.showGameConfigStep();
            case 6: return this.showSecurityConfigStep();
            case 7: return this.showFinalConfigStep();
            default: return null;
        }
    }

    validateStep(stepNumber) {
        switch (stepNumber) {
            case 1: return this.validateWelcomeStep();
            case 2: return this.validateServerConfigStep();
            case 3: return this.validateEconomyConfigStep();
            case 4: return this.validateRoleConfigStep();
            case 5: return this.validateGameConfigStep();
            case 6: return this.validateSecurityConfigStep();
            case 7: return this.validateFinalConfigStep();
            default: return { valid: false, error: 'Invalid step' };
        }
    }

    saveStepData(stepNumber, data) {
        switch (stepNumber) {
            case 2:
                this.serverData.channels = { ...this.serverData.channels, ...data };
                break;
            case 3:
                this.serverData.economy = { ...this.serverData.economy, ...data };
                break;
            case 4:
                this.serverData.roles = { ...this.serverData.roles, ...data };
                break;
            case 5:
                this.serverData.games = { ...this.serverData.games, ...data };
                break;
            case 6:
                this.serverData.security = { ...this.serverData.security, ...data };
                break;
        }
    }

    goToNextStep() {
        if (this.currentStep < this.totalSteps) {
            this.currentStep++;
            return this.showStep(this.currentStep);
        }
        return null;
    }

    goToPreviousStep() {
        if (this.currentStep > 1) {
            this.currentStep--;
            return this.showStep(this.currentStep);
        }
        return null;
    }

    cancelSetup() {
        this.serverData = {
            serverId: null,
            serverName: null,
            settings: {},
            roles: {},
            channels: {},
            economy: {},
            games: {},
            security: {},
            setupComplete: false,
            setupDate: null
        };
        this.currentStep = 1;
    }

    async completeSetup(interaction) {
        try {
            this.serverData.setupComplete = true;
            this.serverData.setupDate = new Date().toISOString();

            // Save to database
            await database.saveServerConfig(this.serverData.serverId, this.serverData);

            // Log completion
            logger.info(`Setup wizard completed for server ${this.serverData.serverName} (${this.serverData.serverId})`);

            return { success: true };
        } catch (error) {
            logger.error(`Setup completion failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    // Create navigation buttons
    createNavigationButtons() {
        const row = new ActionRowBuilder();

        // Previous button (disabled on first step)
        row.addComponents(
            new ButtonBuilder()
                .setCustomId('setup_previous')
                .setLabel('Previous')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(this.currentStep === 1)
        );

        // Next button (changes to "Complete" on last step)
        const nextButton = new ButtonBuilder()
            .setCustomId(this.currentStep === this.totalSteps ? 'setup_complete' : 'setup_next')
            .setLabel(this.currentStep === this.totalSteps ? 'Complete Setup' : 'Next')
            .setStyle(this.currentStep === this.totalSteps ? ButtonStyle.Success : ButtonStyle.Primary);

        row.addComponents(nextButton);

        // Cancel button
        row.addComponents(
            new ButtonBuilder()
                .setCustomId('setup_cancel')
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Danger)
        );

        return row;
    }

    // Create progress indicator
    createProgressIndicator() {
        const progressBar = '█'.repeat(this.currentStep) + '░'.repeat(this.totalSteps - this.currentStep);
        return `**Progress:** ${progressBar} (${this.currentStep}/${this.totalSteps})`;
    }

    // Step 1: Welcome & Permission Check
    async showWelcomeStep(interaction) {
        const permissions = await this.validatePermissions(interaction);
        
        const embed = new EmbedBuilder()
            .setTitle('🎰 Welcome to ATIVE Casino Bot Setup!')
            .setDescription('🎉 **Thank you for choosing ATIVE Casino Bot!**\n\nLet\'s configure your server step by step to get the most out of our casino features.\n\n' + this.createProgressIndicator())
            .addFields(
                {
                    name: '🎮 What You\'ll Get',
                    value: '🎰 **Casino Games**: Slots, Blackjack, Plinko, RPS\n🏦 **Economy System**: Virtual currency management\n🎟️ **Weekly Lottery**: Community prizes\n🎯 **Mini Games**: UNO, Fishing, Duck Hunt\n⚔️ **Strategy Games**: Battleship and more\n📊 **Admin Tools**: Complete server management',
                    inline: false
                },
                {
                    name: '🔍 Permission Check Results',
                    value: this.createPermissionCheckResult(permissions),
                    inline: false
                }
            )
            .setColor(permissions.canContinue ? 0x2ECC71 : 0xE74C3C)
            .setThumbnail(interaction.client?.user?.displayAvatarURL() || null)
            .setFooter({ text: `Step ${this.currentStep} of ${this.totalSteps}: Welcome & Permission Check` })
            .setTimestamp();

        // Create action buttons
        const row = new ActionRowBuilder();

        if (permissions.canContinue) {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId('setup_start')
                    .setLabel('Start Setup')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('🚀')
            );
        } else {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId('setup_retry_permissions')
                    .setLabel('Retry Permission Check')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🔄')
            );
        }

        row.addComponents(
            new ButtonBuilder()
                .setCustomId('setup_cancel')
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('❌')
        );

        return { embeds: [embed], components: [row] };
    }

    createPermissionCheckResult(permissions) {
        let result = '';
        
        // User permission check
        if (permissions.userIsAdmin) {
            result += '✅ **User Permissions**: Administrator access confirmed\n';
        } else {
            result += '❌ **User Permissions**: Administrator access required\n';
        }

        // Bot permission check
        if (permissions.botPermissionsValid) {
            result += '✅ **Bot Permissions**: All required permissions granted\n';
        } else {
            result += '❌ **Bot Permissions**: Missing permissions detected\n';
            result += `**Missing**: ${permissions.missingBotPermissions.join(', ')}\n`;
        }

        // Requirements display
        result += '\n**📋 Bot Requirements**:\n';
        result += '• Send Messages • Embed Links • Use Slash Commands\n';
        result += '• Manage Messages • Add Reactions • Create Threads\n';

        if (!permissions.canContinue) {
            result += '\n⚠️ **Action Required**: Fix permissions above to continue';
        } else {
            result += '\n🎉 **Ready to proceed**: All requirements met!';
        }

        return result;
    }

    // Step 2: Server Configuration
    async showServerConfigStep(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('🔧 Server Configuration')
            .setDescription('Let\'s set up your server channels for the bot to work properly.\n\n' + this.createProgressIndicator())
            .addFields(
                {
                    name: '📋 Required Channels',
                    value: '🎮 **Casino Games Channel**: Where users will play games\n🔍 **Optional**: Bot logs and admin notifications channels',
                    inline: false
                },
                {
                    name: '🎯 Channel Selection',
                    value: 'Use the dropdown menus below to select channels for different purposes. The casino games channel is required.',
                    inline: false
                }
            )
            .setColor(0x3498DB)
            .setThumbnail(interaction.client?.user?.displayAvatarURL() || null)
            .setFooter({ text: `Step ${this.currentStep} of ${this.totalSteps}: Server Configuration` })
            .setTimestamp();

        const components = await this.createServerConfigComponents(interaction);
        return { embeds: [embed], components };
    }

    async createServerConfigComponents(interaction) {
        const textChannels = interaction.guild.channels.cache
            .filter(channel => channel.type === ChannelType.GuildText)
            .map(channel => ({
                label: `#${channel.name}`,
                value: channel.id,
                description: `Channel for ${channel.topic ? channel.topic.slice(0, 50) : 'general use'}`
            }))
            .slice(0, 25); // Discord limit

        const components = [];

        // Casino games channel selector (required)
        if (textChannels.length > 0) {
            const gamesChannelSelect = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('setup_games_channel')
                        .setPlaceholder('🎮 Select Casino Games Channel (Required)')
                        .addOptions(textChannels)
                );
            components.push(gamesChannelSelect);

            // Bot logs channel selector (optional)
            const logsOptions = [
                { label: 'Skip - No logs channel', value: 'none', description: 'Don\'t use a dedicated logs channel' },
                ...textChannels
            ];

            const logsChannelSelect = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('setup_logs_channel')
                        .setPlaceholder('📋 Select Bot Logs Channel (Optional)')
                        .addOptions(logsOptions.slice(0, 25))
                );
            components.push(logsChannelSelect);

            // Admin notifications channel selector (optional)
            const adminOptions = [
                { label: 'Skip - No admin notifications', value: 'none', description: 'Don\'t use admin notifications' },
                ...textChannels
            ];

            const adminChannelSelect = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('setup_admin_channel')
                        .setPlaceholder('🔔 Select Admin Notifications Channel (Optional)')
                        .addOptions(adminOptions.slice(0, 25))
                );
            components.push(adminChannelSelect);
        }

        // Navigation buttons
        components.push(this.createNavigationButtons());

        return components;
    }

    async validateChannelPermissions(interaction, channelId) {
        if (channelId === 'none') return { valid: true };
        
        const channel = interaction.guild.channels.cache.get(channelId);
        if (!channel) return { valid: false, error: 'Channel not found' };

        const botMember = interaction.guild.members.me;
        const permissions = channel.permissionsFor(botMember);

        const requiredPerms = [
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.UseSlashCommands
        ];

        const missingPerms = requiredPerms.filter(perm => !permissions.has(perm));

        return {
            valid: missingPerms.length === 0,
            missingPermissions: missingPerms,
            channelName: channel.name
        };
    }

    // Step 3: Economy Configuration
    async showEconomyConfigStep(interaction) {
        const currentConfig = this.serverData.economy || {};
        
        const embed = new EmbedBuilder()
            .setTitle('💰 Economy Configuration')
            .setDescription('Configure your server\'s virtual economy system.\n\n' + this.createProgressIndicator())
            .addFields(
                {
                    name: '💵 Starting Balance',
                    value: `**Current**: ${currentConfig.startingBalance || '1000'} coins\nAmount new users receive when they join`,
                    inline: true
                },
                {
                    name: '🎁 Daily Rewards',
                    value: `**Current**: ${currentConfig.dailyBonus || '100'} coins\nDaily work command reward amount`,
                    inline: true
                },
                {
                    name: '💰 Currency Settings',
                    value: `**Symbol**: ${currentConfig.currencySymbol || '🪙'}\n**Name**: ${currentConfig.currencyName || 'coins'}`,
                    inline: true
                },
                {
                    name: '🎰 Game Limits',
                    value: `**Minimum Bet**: ${currentConfig.minBet || '10'} coins\n**Maximum Bet**: ${currentConfig.maxBet || '10000'} coins`,
                    inline: false
                },
                {
                    name: '⚙️ Configuration',
                    value: 'Use the buttons below to configure each setting. All values must be positive numbers.',
                    inline: false
                }
            )
            .setColor(0x2ECC71)
            .setThumbnail(interaction.client?.user?.displayAvatarURL() || null)
            .setFooter({ text: `Step ${this.currentStep} of ${this.totalSteps}: Economy Configuration` })
            .setTimestamp();

        const components = this.createEconomyConfigComponents();
        return { embeds: [embed], components };
    }

    createEconomyConfigComponents() {
        const components = [];

        // Economy settings buttons
        const economyRow1 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('setup_starting_balance')
                    .setLabel('Starting Balance')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('💵'),
                new ButtonBuilder()
                    .setCustomId('setup_daily_bonus')
                    .setLabel('Daily Rewards')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🎁'),
                new ButtonBuilder()
                    .setCustomId('setup_currency')
                    .setLabel('Currency Settings')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🪙')
            );

        const economyRow2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('setup_min_bet')
                    .setLabel('Minimum Bet')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🎲'),
                new ButtonBuilder()
                    .setCustomId('setup_max_bet')
                    .setLabel('Maximum Bet')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🎰'),
                new ButtonBuilder()
                    .setCustomId('setup_use_defaults')
                    .setLabel('Use Defaults')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('⚡')
            );

        components.push(economyRow1, economyRow2);

        // Navigation buttons
        components.push(this.createNavigationButtons());

        return components;
    }

    validateEconomySettings(settings) {
        const errors = [];

        // Validate starting balance
        if (!settings.startingBalance || settings.startingBalance < 0) {
            errors.push('Starting balance must be a positive number');
        }

        // Validate daily bonus
        if (!settings.dailyBonus || settings.dailyBonus < 0) {
            errors.push('Daily bonus must be a positive number');
        }

        // Validate bet limits
        if (!settings.minBet || settings.minBet < 1) {
            errors.push('Minimum bet must be at least 1');
        }

        if (!settings.maxBet || settings.maxBet < settings.minBet) {
            errors.push('Maximum bet must be greater than minimum bet');
        }

        // Validate currency name and symbol
        if (!settings.currencyName || settings.currencyName.trim().length === 0) {
            errors.push('Currency name cannot be empty');
        }

        if (!settings.currencySymbol || settings.currencySymbol.trim().length === 0) {
            errors.push('Currency symbol cannot be empty');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    getDefaultEconomySettings() {
        return {
            startingBalance: 1000,
            dailyBonus: 100,
            currencySymbol: '🪙',
            currencyName: 'coins',
            minBet: 10,
            maxBet: 10000
        };
    }

    // Step 4: Role Configuration
    async showRoleConfigStep(interaction) {
        const currentConfig = this.serverData.roles || {};
        
        const embed = new EmbedBuilder()
            .setTitle('🛡️ Role Configuration')
            .setDescription('Configure admin and moderator roles for your server.\n\n' + this.createProgressIndicator())
            .addFields(
                {
                    name: '👑 Admin Roles',
                    value: this.formatRolesList(currentConfig.adminRoles) || 'None selected - Click to configure',
                    inline: false
                },
                {
                    name: '🛡️ Moderator Roles',
                    value: this.formatRolesList(currentConfig.moderatorRoles) || 'None selected - Click to configure',
                    inline: false
                },
                {
                    name: '📋 Role Information',
                    value: '**Admin Roles**: Full access to all bot commands and settings\n**Moderator Roles**: Access to games and basic moderation\n\n*You can select existing roles or create new ones*',
                    inline: false
                }
            )
            .setColor(0x9B59B6)
            .setThumbnail(interaction.client?.user?.displayAvatarURL() || null)
            .setFooter({ text: `Step ${this.currentStep} of ${this.totalSteps}: Role Configuration` })
            .setTimestamp();

        const components = await this.createRoleConfigComponents(interaction);
        return { embeds: [embed], components };
    }

    async createRoleConfigComponents(interaction) {
        const components = [];
        
        // Get server roles (excluding @everyone and bot roles)
        const serverRoles = interaction.guild.roles.cache
            .filter(role => role.name !== '@everyone' && !role.managed)
            .sort((a, b) => b.position - a.position)
            .map(role => ({
                label: `@${role.name}`,
                value: role.id,
                description: `Position: ${role.position} | Members: ${role.members.size}`
            }))
            .slice(0, 24); // Leave room for "Create New" option

        if (serverRoles.length > 0) {
            // Admin roles selector
            const adminRoleOptions = [
                { label: '➕ Create New Admin Role', value: 'create_admin', description: 'Create a new role for admins' },
                ...serverRoles
            ];

            const adminRoleSelect = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('setup_admin_roles')
                        .setPlaceholder('👑 Select Admin Role(s)')
                        .setMinValues(0)
                        .setMaxValues(Math.min(adminRoleOptions.length, 5))
                        .addOptions(adminRoleOptions.slice(0, 25))
                );
            components.push(adminRoleSelect);

            // Moderator roles selector
            const modRoleOptions = [
                { label: '➕ Create New Mod Role', value: 'create_mod', description: 'Create a new role for moderators' },
                ...serverRoles
            ];

            const modRoleSelect = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('setup_mod_roles')
                        .setPlaceholder('🛡️ Select Moderator Role(s)')
                        .setMinValues(0)
                        .setMaxValues(Math.min(modRoleOptions.length, 5))
                        .addOptions(modRoleOptions.slice(0, 25))
                );
            components.push(modRoleSelect);
        }

        // Role management buttons
        const roleManagementRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('setup_clear_admin_roles')
                    .setLabel('Clear Admin Roles')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🗑️'),
                new ButtonBuilder()
                    .setCustomId('setup_clear_mod_roles')
                    .setLabel('Clear Mod Roles')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🗑️'),
                new ButtonBuilder()
                    .setCustomId('setup_skip_roles')
                    .setLabel('Skip Role Setup')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('⏭️')
            );
        components.push(roleManagementRow);

        // Navigation buttons
        components.push(this.createNavigationButtons());

        return components;
    }

    formatRolesList(roles) {
        if (!roles || roles.length === 0) return null;
        return roles.map(roleId => `<@&${roleId}>`).join(', ');
    }

    async validateRolePermissions(interaction, roleId) {
        const role = interaction.guild.roles.cache.get(roleId);
        if (!role) return { valid: false, error: 'Role not found' };

        const botMember = interaction.guild.members.me;
        const botHighestRole = botMember.roles.highest;

        return {
            valid: role.position < botHighestRole.position,
            roleName: role.name,
            rolePosition: role.position,
            botPosition: botHighestRole.position,
            canManage: role.position < botHighestRole.position
        };
    }

    async createRole(interaction, roleName, roleType) {
        try {
            const roleData = {
                name: roleName,
                color: roleType === 'admin' ? 0xFF0000 : 0x00FF00,
                permissions: roleType === 'admin' ? [PermissionFlagsBits.Administrator] : [PermissionFlagsBits.ModerateMembers],
                reason: `Created by ATIVE Casino Bot setup wizard for ${roleType} purposes`
            };

            const newRole = await interaction.guild.roles.create(roleData);
            
            logger.info(`Created ${roleType} role "${roleName}" in guild ${interaction.guild.name}`);
            
            return {
                success: true,
                role: newRole
            };
        } catch (error) {
            logger.error(`Failed to create ${roleType} role: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Step 5: Game Configuration
    async showGameConfigStep(interaction) {
        const currentConfig = this.serverData.games || this.getDefaultGameSettings();
        
        const embed = new EmbedBuilder()
            .setTitle('🎮 Game Configuration')
            .setDescription('Configure available games and their settings.\n\n' + this.createProgressIndicator())
            .addFields(
                {
                    name: '🎰 Casino Games',
                    value: this.formatGamesList(currentConfig.casino, ['slots', 'blackjack', 'fishing', 'plinko']),
                    inline: true
                },
                {
                    name: '🎯 Mini Games',
                    value: this.formatGamesList(currentConfig.miniGames, ['uno', 'duckhunt', 'rps']),
                    inline: true
                },
                {
                    name: '⚔️ Strategy Games',
                    value: this.formatGamesList(currentConfig.strategy, ['battleship']),
                    inline: true
                },
                {
                    name: '⚙️ Game Settings',
                    value: `**Max Concurrent Games**: ${currentConfig.maxConcurrentGames || 3} per user\n**House Edge**: ${currentConfig.houseEdge || 2}%`,
                    inline: false
                },
                {
                    name: '📋 Configuration',
                    value: 'Enable/disable games and configure settings using the controls below.',
                    inline: false
                }
            )
            .setColor(0xE67E22)
            .setThumbnail(interaction.client?.user?.displayAvatarURL() || null)
            .setFooter({ text: `Step ${this.currentStep} of ${this.totalSteps}: Game Configuration` })
            .setTimestamp();

        const components = this.createGameConfigComponents();
        return { embeds: [embed], components };
    }

    createGameConfigComponents() {
        const components = [];

        // Game category toggles
        const gameRow1 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('setup_casino_games')
                    .setLabel('Casino Games')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🎰'),
                new ButtonBuilder()
                    .setCustomId('setup_mini_games')
                    .setLabel('Mini Games')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🎯'),
                new ButtonBuilder()
                    .setCustomId('setup_strategy_games')
                    .setLabel('Strategy Games')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('⚔️')
            );

        const gameRow2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('setup_game_settings')
                    .setLabel('Game Settings')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('⚙️'),
                new ButtonBuilder()
                    .setCustomId('setup_enable_all_games')
                    .setLabel('Enable All Games')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('✅'),
                new ButtonBuilder()
                    .setCustomId('setup_disable_all_games')
                    .setLabel('Disable All Games')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('❌')
            );

        components.push(gameRow1, gameRow2);

        // Navigation buttons
        components.push(this.createNavigationButtons());

        return components;
    }

    formatGamesList(gamesList, availableGames) {
        if (!gamesList) return availableGames.map(game => `❌ ${this.capitalize(game)}`).join('\n');
        
        return availableGames.map(game => {
            const enabled = gamesList.includes(game);
            return `${enabled ? '✅' : '❌'} ${this.capitalize(game)}`;
        }).join('\n');
    }

    capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    getDefaultGameSettings() {
        return {
            casino: ['slots', 'blackjack', 'fishing', 'plinko'],
            miniGames: ['uno', 'duckhunt', 'rps'],
            strategy: ['battleship'],
            maxConcurrentGames: 3,
            houseEdge: 2
        };
    }

    // Step 6: Security & Moderation Setup
    async showSecurityConfigStep(interaction) {
        const currentConfig = this.serverData.security || this.getDefaultSecuritySettings();
        
        const embed = new EmbedBuilder()
            .setTitle('🔒 Security & Moderation Setup')
            .setDescription('Configure security features and anti-abuse measures.\n\n' + this.createProgressIndicator())
            .addFields(
                {
                    name: '⚡ Anti-Abuse Settings',
                    value: `**Max Bets/Hour**: ${currentConfig.maxBetsPerHour || 100}\n**Suspicious Activity Threshold**: ${currentConfig.suspiciousThreshold || 50} bets\n**Account Age Requirement**: ${currentConfig.minAccountAge || 7} days`,
                    inline: false
                },
                {
                    name: '🔨 Punishment System',
                    value: `**Auto-Mute Duration**: ${currentConfig.muteDuration || 5} minutes\n**Ban Threshold**: ${currentConfig.banThreshold || 3} violations\n**Logging Enabled**: ${currentConfig.loggingEnabled ? '✅' : '❌'}`,
                    inline: false
                },
                {
                    name: '📋 Configuration',
                    value: 'Adjust security settings to protect your server from abuse and exploitation.',
                    inline: false
                }
            )
            .setColor(0xE74C3C)
            .setThumbnail(interaction.client?.user?.displayAvatarURL() || null)
            .setFooter({ text: `Step ${this.currentStep} of ${this.totalSteps}: Security & Moderation` })
            .setTimestamp();

        const components = this.createSecurityConfigComponents();
        return { embeds: [embed], components };
    }

    createSecurityConfigComponents() {
        const components = [];

        // Security settings buttons
        const securityRow1 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('setup_abuse_limits')
                    .setLabel('Anti-Abuse Limits')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('⚡'),
                new ButtonBuilder()
                    .setCustomId('setup_punishment_system')
                    .setLabel('Punishment Settings')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🔨'),
                new ButtonBuilder()
                    .setCustomId('setup_logging_config')
                    .setLabel('Logging Config')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('📝')
            );

        const securityRow2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('setup_use_security_defaults')
                    .setLabel('Use Recommended Settings')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('🛡️'),
                new ButtonBuilder()
                    .setCustomId('setup_disable_security')
                    .setLabel('Minimal Security')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('⚠️')
            );

        components.push(securityRow1, securityRow2);

        // Navigation buttons
        components.push(this.createNavigationButtons());

        return components;
    }

    getDefaultSecuritySettings() {
        return {
            maxBetsPerHour: 100,
            suspiciousThreshold: 50,
            minAccountAge: 7,
            muteDuration: 5,
            banThreshold: 3,
            loggingEnabled: true
        };
    }

    // Step 7: Final Configuration & Testing
    async showFinalConfigStep(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('✅ Final Configuration & Testing')
            .setDescription('Review your configuration and complete the setup process.\n\n' + this.createProgressIndicator())
            .addFields(
                {
                    name: '📊 Configuration Summary',
                    value: this.createConfigurationSummary(),
                    inline: false
                },
                {
                    name: '🧪 Final Steps',
                    value: '1. Review your settings above\n2. Run basic functionality tests\n3. Complete setup and initialize database\n4. Generate admin/mod panels',
                    inline: false
                },
                {
                    name: '✨ What Happens Next',
                    value: '• Server configuration saved to database\n• Admin panels generated for configured roles\n• All enabled games become available\n• Logging and monitoring activated',
                    inline: false
                }
            )
            .setColor(0x2ECC71)
            .setThumbnail(interaction.client?.user?.displayAvatarURL() || null)
            .setFooter({ text: `Step ${this.currentStep} of ${this.totalSteps}: Final Configuration` })
            .setTimestamp();

        const components = this.createFinalConfigComponents();
        return { embeds: [embed], components };
    }

    createFinalConfigComponents() {
        const components = [];

        // Final action buttons
        const finalRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('setup_run_tests')
                    .setLabel('Run Tests')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🧪'),
                new ButtonBuilder()
                    .setCustomId('setup_review_config')
                    .setLabel('Review Settings')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('📋'),
                new ButtonBuilder()
                    .setCustomId('setup_complete_wizard')
                    .setLabel('Complete Setup')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('🎉')
            );

        components.push(finalRow);

        // Navigation buttons (without "Complete" since we have custom button)
        const navRow = new ActionRowBuilder();
        navRow.addComponents(
            new ButtonBuilder()
                .setCustomId('setup_previous')
                .setLabel('Previous')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(this.currentStep === 1)
        );

        navRow.addComponents(
            new ButtonBuilder()
                .setCustomId('setup_cancel')
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Danger)
        );

        components.push(navRow);

        return components;
    }

    createConfigurationSummary() {
        let summary = '';
        
        // Channels
        const channels = this.serverData.channels || {};
        summary += `**🎮 Games Channel**: ${channels.gamesChannelId ? `<#${channels.gamesChannelId}>` : 'Not configured'}\n`;
        summary += `**📋 Logs Channel**: ${channels.logsChannelId ? `<#${channels.logsChannelId}>` : 'Not configured'}\n`;
        
        // Economy
        const economy = this.serverData.economy || {};
        summary += `**💰 Starting Balance**: ${economy.startingBalance || 1000} ${economy.currencySymbol || '🪙'}\n`;
        summary += `**🎰 Bet Range**: ${economy.minBet || 10}-${economy.maxBet || 10000} ${economy.currencySymbol || '🪙'}\n`;
        
        // Roles
        const roles = this.serverData.roles || {};
        const adminCount = roles.adminRoles ? roles.adminRoles.length : 0;
        const modCount = roles.moderatorRoles ? roles.moderatorRoles.length : 0;
        summary += `**👑 Admin Roles**: ${adminCount} configured\n`;
        summary += `**🛡️ Mod Roles**: ${modCount} configured\n`;
        
        // Games
        const games = this.serverData.games || {};
        const totalGames = (games.casino?.length || 0) + (games.miniGames?.length || 0) + (games.strategy?.length || 0);
        summary += `**🎮 Enabled Games**: ${totalGames} games active\n`;
        
        return summary;
    }

    // Validation methods (placeholders for now)
    validateWelcomeStep() {
        return { valid: true };
    }

    validateServerConfigStep() {
        return { valid: true };
    }

    validateEconomyConfigStep() {
        return { valid: true };
    }

    validateRoleConfigStep() {
        return { valid: true };
    }

    validateGameConfigStep() {
        return { valid: true };
    }

    validateSecurityConfigStep() {
        return { valid: true };
    }

    validateFinalConfigStep() {
        return { valid: true };
    }
}

module.exports = SetupWizard;
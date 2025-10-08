/**
 * DevAI Command - AI-powered development assistant
 * Uses OpenAI ChatGPT to code, fix, and deploy changes automatically
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const DevAIManager = require('../UTILS/devAI');
const logger = require('../UTILS/logger');

const DEVELOPER_ID = '466050111680544798';
const devAI = new DevAIManager();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('devai')
        .setDescription('🤖 AI-powered development assistant for the bot')
        .addSubcommand(subcommand =>
            subcommand
                .setName('fix')
                .setDescription('Fix a bug or error in the bot')
                .addStringOption(option =>
                    option.setName('issue')
                        .setDescription('Describe the issue to fix')
                        .setRequired(true)
                        .setMaxLength(500))
                .addBooleanOption(option =>
                    option.setName('auto_restart')
                        .setDescription('Automatically restart the bot after successful fix')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Create a new feature or command')
                .addStringOption(option =>
                    option.setName('feature')
                        .setDescription('Describe what to create')
                        .setRequired(true)
                        .setMaxLength(500))
                .addBooleanOption(option =>
                    option.setName('auto_restart')
                        .setDescription('Automatically restart the bot after creation')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('optimize')
                .setDescription('Optimize existing code or performance')
                .addStringOption(option =>
                    option.setName('target')
                        .setDescription('What to optimize (e.g., "database queries", "command speed")')
                        .setRequired(true)
                        .setMaxLength(500))
                .addBooleanOption(option =>
                    option.setName('auto_restart')
                        .setDescription('Automatically restart the bot after optimization')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('test')
                .setDescription('Run tests on the current codebase')
                .addStringOption(option =>
                    option.setName('specific_test')
                        .setDescription('Run a specific test (optional)')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Check DevAI system status and recent activity')),

    async execute(interaction) {
        // Security check - only developer can use this command
        if (interaction.user.id !== DEVELOPER_ID) {
            const embed = new EmbedBuilder()
                .setTitle('🚫 Access Denied')
                .setDescription('This command is restricted to the bot developer only.')
                .setColor(0xff0000)
                .setTimestamp();
            
            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        const subcommand = interaction.options.getSubcommand();
        
        // Handle status check quickly
        if (subcommand === 'status') {
            return this.handleStatus(interaction);
        }

        // Handle test command
        if (subcommand === 'test') {
            return this.handleTest(interaction);
        }

        // For AI processing commands, defer reply
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const startTime = Date.now();
            let result;

            switch (subcommand) {
                case 'fix':
                    result = await this.handleFix(interaction);
                    break;
                case 'create':
                    result = await this.handleCreate(interaction);
                    break;
                case 'optimize':
                    result = await this.handleOptimize(interaction);
                    break;
                default:
                    throw new Error('Unknown subcommand');
            }

            const totalTime = Date.now() - startTime;
            await this.sendResultEmbed(interaction, result, totalTime);

        } catch (error) {
            logger.error(`DevAI Command Error: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('🚨 DevAI Error')
                .setDescription(`An error occurred while processing your request:\n\`\`\`${error.message}\`\`\``)
                .setColor(0xff0000)
                .setTimestamp();

            await interaction.editReply({ embeds: [errorEmbed] });
        }
    },

    async handleFix(interaction) {
        const issue = interaction.options.getString('issue');
        const autoRestart = interaction.options.getBoolean('auto_restart') || false;
        
        logger.info(`DevAI: Fix request - ${issue}`);
        
        const result = await devAI.processRequest('fix', issue, {
            autoRestart: autoRestart,
            commands: autoRestart ? ['pm2 restart ative-casino-bot'] : []
        });

        return { ...result, type: 'Fix', description: issue };
    },

    async handleCreate(interaction) {
        const feature = interaction.options.getString('feature');
        const autoRestart = interaction.options.getBoolean('auto_restart') || false;
        
        logger.info(`DevAI: Create request - ${feature}`);
        
        const result = await devAI.processRequest('create', feature, {
            autoRestart: autoRestart,
            commands: autoRestart ? ['pm2 restart ative-casino-bot'] : []
        });

        return { ...result, type: 'Create', description: feature };
    },

    async handleOptimize(interaction) {
        const target = interaction.options.getString('target');
        const autoRestart = interaction.options.getBoolean('auto_restart') || false;
        
        logger.info(`DevAI: Optimize request - ${target}`);
        
        const result = await devAI.processRequest('optimize', target, {
            autoRestart: autoRestart,
            commands: autoRestart ? ['pm2 restart ative-casino-bot'] : []
        });

        return { ...result, type: 'Optimize', description: target };
    },

    async handleTest(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        const specificTest = interaction.options.getString('specific_test');
        
        try {
            const testResults = await devAI.runAutomatedTests();
            
            const embed = new EmbedBuilder()
                .setTitle('🧪 Test Results')
                .setDescription(testResults.summary)
                .setColor(testResults.allPassed ? 0x00ff00 : 0xffaa00)
                .setTimestamp();

            // Add test details
            for (const test of testResults.tests.slice(0, 5)) { // Limit to 5 tests
                embed.addFields([{
                    name: `${test.passed ? '✅' : '❌'} ${test.name}`,
                    value: `Duration: ${test.duration}ms\n${test.error ? `Error: ${test.error}` : 'Passed'}`,
                    inline: true
                }]);
            }

            await interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            const errorEmbed = new EmbedBuilder()
                .setTitle('🚨 Test Error')
                .setDescription(`Failed to run tests: ${error.message}`)
                .setColor(0xff0000);
                
            await interaction.editReply({ embeds: [errorEmbed] });
        }
    },

    async handleStatus(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('🤖 DevAI System Status')
            .setDescription('AI development assistant is online and ready!')
            .addFields([
                {
                    name: '🔧 Available Commands',
                    value: '`/devai fix` - Fix bugs and errors\n`/devai create` - Create new features\n`/devai optimize` - Optimize performance\n`/devai test` - Run automated tests',
                    inline: false
                },
                {
                    name: '⚡ Capabilities',
                    value: '• OpenAI ChatGPT integration\n• Automated testing\n• VPS restart functionality\n• Backup system\n• Security validation',
                    inline: false
                },
                {
                    name: '🛡️ Security',
                    value: `Restricted to developer: <@${DEVELOPER_ID}>`,
                    inline: false
                }
            ])
            .setColor(0x00ff00)
            .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    },

    async sendResultEmbed(interaction, result, totalTime) {
        const embed = new EmbedBuilder()
            .setTitle(`🤖 DevAI ${result.type} Complete`)
            .setDescription(result.description.substring(0, 100) + '...')
            .setColor(result.success ? 0x00ff00 : 0xff0000)
            .setTimestamp();

        // Add result fields
        embed.addFields([
            {
                name: '📊 Summary',
                value: result.summary.substring(0, 500),
                inline: false
            },
            {
                name: '📁 Files Modified',
                value: result.filesModified.length > 0 ? 
                    result.filesModified.slice(0, 5).join('\n') : 'None',
                inline: true
            },
            {
                name: '🧪 Tests',
                value: result.testResults ? result.testResults.summary : 'No tests run',
                inline: true
            },
            {
                name: '⏱️ Execution Time',
                value: `${(totalTime / 1000).toFixed(2)}s`,
                inline: true
            }
        ]);

        // Add deployment results if available
        if (result.deploymentResults && result.deploymentResults.length > 0) {
            const deploymentStatus = result.deploymentResults.map(cmd => 
                `${cmd.success ? '✅' : '❌'} ${cmd.command.substring(0, 30)}`
            ).join('\n');
            
            embed.addFields([{
                name: '🚀 Deployment',
                value: deploymentStatus,
                inline: false
            }]);
        }

        // Add AI response preview
        if (result.aiResponse) {
            embed.addFields([{
                name: '🤖 AI Response Preview',
                value: `\`\`\`${result.aiResponse.substring(0, 200)}...\`\`\``,
                inline: false
            }]);
        }

        // Add action buttons if there were issues
        let components = [];
        if (!result.success && result.backups && result.backups.length > 0) {
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('devai_restore_backup')
                        .setLabel('🔄 Restore Backup')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId('devai_view_logs')
                        .setLabel('📋 View Logs')
                        .setStyle(ButtonStyle.Secondary)
                );
            components.push(row);
        }

        await interaction.editReply({ 
            embeds: [embed], 
            components: components 
        });
    }
};
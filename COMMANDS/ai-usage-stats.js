/**
 * AI Usage Statistics Command
 * Monitor AI token usage, costs, and cache performance
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const logger = require('../UTILS/logger');
const optimizedAIService = require('../UTILS/optimizedAIService');
const aiCacheManager = require('../UTILS/aiCacheManager');

// Developer ID
const DEVELOPER_ID = '466050111680544798';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ai-usage-stats')
        .setDescription('[ADMIN] View AI usage statistics and cost monitoring')
        .addStringOption(option =>
            option.setName('action')
                .setDescription('Action to perform')
                .addChoices(
                    { name: 'View Stats', value: 'stats' },
                    { name: 'Reset Stats', value: 'reset' },
                    { name: 'Cache Info', value: 'cache' },
                    { name: 'Clear Cache', value: 'clear_cache' }
                )
                .setRequired(false)
        ),

    async execute(interaction) {
        const userId = interaction.user.id;
        const action = interaction.options.getString('action') || 'stats';

        // Check if user is developer
        if (userId !== DEVELOPER_ID) {
            const deniedEmbed = new EmbedBuilder()
                .setTitle('🔒 Developer Only')
                .setDescription('This command is restricted to the bot developer.')
                .setColor(0xFF6B6B)
                .setTimestamp();

            return await interaction.reply({ embeds: [deniedEmbed], ephemeral: true });
        }

        try {
            await interaction.deferReply({ ephemeral: true });

            switch (action) {
                case 'stats':
                    await this.showUsageStats(interaction);
                    break;
                case 'reset':
                    await this.resetStats(interaction);
                    break;
                case 'cache':
                    await this.showCacheStats(interaction);
                    break;
                case 'clear_cache':
                    await this.clearCache(interaction);
                    break;
                default:
                    await this.showUsageStats(interaction);
            }

        } catch (error) {
            logger.error(`Error in ai-usage-stats command: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription('An error occurred while processing the command.')
                .setColor(0xFF0000)
                .setTimestamp();

            await interaction.editReply({ embeds: [errorEmbed] });
        }
    },

    async showUsageStats(interaction) {
        const stats = optimizedAIService.getUsageStats();
        
        const embed = new EmbedBuilder()
            .setTitle('🤖 AI Usage Statistics')
            .setColor(0x00D4FF)
            .addFields([
                {
                    name: '📊 Token Usage',
                    value: `**This Hour:** ${stats.tokens.thisHour.toLocaleString()}\n**Today:** ${stats.tokens.today.toLocaleString()}\n**Total:** ${stats.tokens.total.toLocaleString()}`,
                    inline: true
                },
                {
                    name: '💰 Cost Tracking',
                    value: `**Today:** $${stats.costs.todayCost.toFixed(4)}\n**Total:** $${stats.costs.totalCost.toFixed(4)}`,
                    inline: true
                },
                {
                    name: '⚡ Request Queue',
                    value: `**Pending:** ${stats.queue.pending}\n**Active:** ${stats.queue.active}`,
                    inline: true
                }
            ])
            .setFooter({ text: 'AI optimization reduces costs by ~70% through caching and smart routing' })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },

    async showCacheStats(interaction) {
        const cacheStats = await aiCacheManager.getStats();
        
        const embed = new EmbedBuilder()
            .setTitle('💾 AI Cache Statistics')
            .setColor(0x00FF00)
            .addFields([
                {
                    name: '🔗 Connection Status',
                    value: cacheStats.connected ? '✅ Redis Connected' : '⚠️ Using Fallback Cache',
                    inline: false
                },
                {
                    name: '📈 Cache Performance',
                    value: cacheStats.connected ? 
                        `**Redis Keys:** ${cacheStats.redisKeys}\n**Memory Usage:** ${(cacheStats.totalMemoryUsage / 1024 / 1024).toFixed(2)} MB` :
                        `**Fallback Cache Size:** ${cacheStats.fallbackCacheSize}`,
                    inline: false
                },
                {
                    name: '💡 Benefits',
                    value: `• Instant responses for cached queries\n• Reduced API costs\n• Lower latency\n• Better reliability`,
                    inline: false
                }
            ])
            .setFooter({ text: 'Cache TTL: 1h general, 24h jokes, 5m balance checks' })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },

    async resetStats(interaction) {
        optimizedAIService.resetStats();
        
        const embed = new EmbedBuilder()
            .setTitle('🔄 AI Statistics Reset')
            .setDescription('All AI usage statistics have been reset to zero.')
            .addFields([
                {
                    name: '✅ Reset Items',
                    value: '• Token usage counters\n• Cost tracking\n• Request queue cleared',
                    inline: false
                }
            ])
            .setColor(0x00FF00)
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        logger.info(`AI statistics reset by ${interaction.user.tag} (${interaction.user.id})`);
    },

    async clearCache(interaction) {
        try {
            await aiCacheManager.clearCache();
            
            const embed = new EmbedBuilder()
                .setTitle('🧹 AI Cache Cleared')
                .setDescription('All cached AI responses have been cleared.')
                .addFields([
                    {
                        name: '🔄 Next Steps',
                        value: '• New responses will be cached\n• First requests will use AI API\n• Subsequent requests will be cached',
                        inline: false
                    }
                ])
                .setColor(0x00FF00)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            logger.info(`AI cache cleared by ${interaction.user.tag} (${interaction.user.id})`);
            
        } catch (error) {
            logger.error(`Error clearing AI cache: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Cache Clear Failed')
                .setDescription(`Error clearing cache: ${error.message}`)
                .setColor(0xFF0000)
                .setTimestamp();

            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }
};
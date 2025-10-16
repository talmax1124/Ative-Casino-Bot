/**
 * Modern Help System with Advanced UI and Bulletproof Interaction Handling
 * Complete rewrite with pagination, rich embeds, and comprehensive navigation
 */

const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const { getTierDisplay, getAllTiers } = require('../UTILS/common');
const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
const logger = require('../UTILS/logger');

// Help categories with metadata
const HELP_CATEGORIES = {
    games: {
        emoji: '🎰',
        name: 'Casino Games',
        description: 'Slots, Blackjack, and all casino games',
        color: 0xFF6B35
    },
    economy: {
        emoji: '💰',
        name: 'Economy System',
        description: 'Work, balance, and money management',
        color: 0x32CD32
    },
    lottery: {
        emoji: '🎟️',
        name: 'Lottery System',
        description: 'Bi-weekly drawings (Tuesdays & Saturdays)',
        color: 0x9B59B6
    },
    admin: {
        emoji: '👑',
        name: 'Admin Commands',
        description: 'Server management and administration',
        color: 0xE74C3C
    },
    tiers: {
        emoji: '🎖️',
        name: 'Economic Tiers',
        description: 'Tier system and progression',
        color: 0x9B59B6
    },
    security: {
        emoji: '🛡️',
        name: 'Security & Rules',
        description: 'Fair play and bot policies',
        color: 0x3498DB
    }
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Get comprehensive help and information about ATIVE Casino Bot')
        .addStringOption(option =>
            option.setName('category')
                .setDescription('Specific help category to view')
                .setRequired(false)
                .addChoices(
                    { name: '🎰 Casino Games', value: 'games' },
                    { name: '💰 Economy Commands', value: 'economy' },
                    { name: '🎟️ Lottery System', value: 'lottery' },
                    { name: '👑 Admin Commands', value: 'admin' },
                    { name: '🎖️ Economic Tiers', value: 'tiers' },
                    { name: '🛡️ Security & Rules', value: 'security' }
                )
        ),

    async execute(interaction) {
        const category = interaction.options.getString('category');

        try {
            // Always defer first to prevent timeout issues
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferReply();
            }

            if (category) {
                await showCategoryHelp(interaction, category);
            } else {
                await showMainHelp(interaction);
            }
        } catch (error) {
            logger.error(`Critical error in help command: ${error.message}`);
            await handleHelpError(interaction, error);
        }
    }
};

/**
 * Advanced error handler for help system
 */
async function handleHelpError(interaction, error) {
    const errorEmbed = new EmbedBuilder()
        .setTitle('⚠️ Help System Error')
        .setDescription('**An error occurred while loading help information.**\n\nThis has been logged and will be resolved soon.')
        .addFields(
            {
                name: '🔄 Try Again',
                value: 'Use `/help` to try again, or select a specific category.',
                inline: false
            },
            {
                name: '💬 Need Support?',
                value: 'Contact server administrators if this persists.',
                inline: false
            }
        )
        .setColor(0xFF0000)
        .setTimestamp()
        .setFooter({ text: '⚠️ Error Handler • ATIVE Casino Bot' });

    try {
        if (interaction.deferred) {
            await interaction.editReply({ embeds: [errorEmbed], components: [] });
        } else if (interaction.replied) {
            await interaction.followUp({ embeds: [errorEmbed], flags: 64 });
        } else {
            await interaction.reply({ embeds: [errorEmbed], flags: 64 });
        }
    } catch (replyError) {
        logger.error(`Failed to send help error message: ${replyError.message}`);
    }
}

/**
 * Modern main help interface with rich UI
 */
async function showMainHelp(interaction) {
    const embed = new EmbedBuilder()
        .setTitle('🎰 ATIVE Casino Bot - Help Center')
        .setDescription('**Welcome to ATIVE Casino!** The premier Discord gambling experience.\n\n🚀 **Quick Start Guide:**\n1. Use `/work` to earn your first coins\n2. Try `/slots 100` to test your luck\n3. Use `/balance` to check your money\n4. Bank funds with the deposit button for safety\n\n💡 **Need more info?** Select a category below for detailed help!')
        .addFields(
            {
                name: '📋 Basic Commands Overview',
                value: '```yaml\n🎰 Games:     /slots, /blackjack, /roulette, /crash\n💰 Earning:   /work, /vote, /crime, /beg, /dailytask\n🏦 Banking:   /balance, /sendmoney, /deposit, /withdraw\n🎟️ Lottery:   Every Tuesday & Saturday at 10AM EST\n💕 Marriage:  /marriage propose, /marriage ceremony, /marriage profile\n🎖️ Progress:  /leaderboard, /stats\n```',
                inline: false
            },
            {
                name: '🌐 Web Portal Access',
                value: '**No Cooldowns • Instant Earnings • 24/7 Access**\n🔗 https://ative-casino-bot-production.up.railway.app/',
                inline: false
            }
        )
        .setColor(0x3498DB) // Clean blue color
        .setThumbnail(interaction.client?.user?.displayAvatarURL({ size: 256 }) || null)
        .setFooter({ 
            text: `ATIVE Casino Help Center • Use the dropdown menu to explore categories`, 
            iconURL: interaction.client?.user?.displayAvatarURL() || null 
        })
        .setTimestamp();

    // Simple category selection dropdown
    const categorySelect = new StringSelectMenuBuilder()
        .setCustomId('help_category_select')
        .setPlaceholder('📂 Select a category for detailed information...')
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(
            Object.entries(HELP_CATEGORIES).map(([key, category]) => ({
                label: `${category.emoji} ${category.name}`,
                description: category.description,
                value: key,
                emoji: category.emoji
            }))
        );

    const selectRow = new ActionRowBuilder().addComponents(categorySelect);

    try {
        if (interaction.deferred) {
            await interaction.editReply({ 
                embeds: [embed], 
                components: [selectRow] 
            });
        } else {
            await interaction.reply({ 
                embeds: [embed], 
                components: [selectRow] 
            });
        }
    } catch (error) {
        logger.error(`Failed to send main help: ${error.message}`);
        await handleHelpError(interaction, error);
    }
}

/**
 * Show detailed category help with modern UI
 */
async function showCategoryHelp(interaction, category) {
    const categoryInfo = HELP_CATEGORIES[category];
    if (!categoryInfo) {
        await showMainHelp(interaction);
        return;
    }

    let embed;
    let extraComponents = [];

    switch (category) {
        case 'games':
            embed = createGamesHelp(interaction, categoryInfo);
            break;
        case 'economy':
            embed = createEconomyHelp(interaction, categoryInfo);
            break;
        case 'lottery':
            embed = createLotteryHelp(interaction, categoryInfo);
            break;
        case 'admin':
            embed = createAdminHelp(interaction, categoryInfo);
            break;
        case 'tiers':
            embed = createTiersHelp(interaction, categoryInfo);
            break;
        case 'security':
            embed = createSecurityHelp(interaction, categoryInfo);
            break;
        default:
            await showMainHelp(interaction);
            return;
    }

    // Simple navigation back to main help
    const navControls = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('help_back_main')
                .setLabel('🏠 Back to Main Help')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🏠')
        );

    const components = [navControls, ...extraComponents];

    try {
        if (interaction.deferred) {
            await interaction.editReply({ embeds: [embed], components });
        } else {
            await interaction.reply({ embeds: [embed], components });
        }
    } catch (error) {
        logger.error(`Failed to send category help for ${category}: ${error.message}`);
        await handleHelpError(interaction, error);
    }
}

/**
 * Create modern games help with accurate, up-to-date information
 */
function createGamesHelp(interaction, categoryInfo) {
    return new EmbedBuilder()
        .setTitle(`🎰 ${categoryInfo.name}`)
        .setDescription('**23 games available • Provably fair • Real-time results**')
        .addFields(
            {
                name: '🎰 Slot Machine Games',
                value: '```yaml\n/slots <amount> [mode]     - Classic slots with 4 difficulty modes\n/multi-slots <amount>     - Multi-line slot machine\n\n• Modes: Safe, Balanced, Risky, Extreme\n• Payouts: 🍒 2x → 💎 50x → 7️⃣ JACKPOT!\n• Features: Auto-spin, progressive jackpots\n```',
                inline: false
            },
            {
                name: '🃏 Card & Table Games',
                value: '```apache\n/blackjack <amount> [mode] - Professional blackjack\n/roulette <amount> [mode]  - European roulette\n/uno <amount>              - Classic UNO with friends\n\n• Actions: Hit, Stand, Double Down, Split, Insurance\n• Modes affect payout multipliers\n• Strategy charts available in-game\n```',
                inline: false
            },
            {
                name: '🎯 Strategy & Risk Games',
                value: '```diff\n+ /mines <amount> [mode]   - NEW! Minesweeper gambling\n+ /plinko <amount> [mode] - Physics ball drop game\n+ /crash <amount> [mode]  - Real-time cash out timing\n+ /fishing <amount>       - Risk vs reward adventure\n\n• Mines: 4x4 to 7x7 grids, 3-10 mines\n• Progressive multipliers\n• Strategic timing required\n```',
                inline: false
            },
            {
                name: '🎲 Dice & Number Games',
                value: '```css\n/ceelo <amount> [mode]          - Traditional Chinese dice\n/yahtzee <amount>               - Five dice combinations\n/keno <amount> <spots> [mode]   - Number lottery (1-10 spots)\n/russianroulette <amount>       - High-stakes elimination\n\n• Multiple betting modes and difficulty levels\n• Strategic rerolls and number selection\n```',
                inline: false
            },
            {
                name: '🎪 Social & Party Games',
                value: '```ini\n[Community] /bingo <amount>     - Social bingo sessions\n[PvP]       /battleship <amount> - Naval combat strategy\n[Chain]     /wordchain          - Word association challenge\n[Adventure] /duck <amount>      - Survival adventure game\n[Instant]   /scratch            - Virtual scratch tickets\n[Treasure]  /treasurevault      - Adventure-themed gambling\n```',
                inline: false
            }
        )
        .setColor(categoryInfo.color)
        .setFooter({ text: `${categoryInfo.name} • Select from 23 different games • Fair play guaranteed` })
        .setTimestamp();
}

/**
 * Create modern economy help with current accurate data
 */
function createEconomyHelp(interaction, categoryInfo) {
    return new EmbedBuilder()
        .setTitle(`💰 ${categoryInfo.name}`)
        .setDescription('**Build your fortune with 12 economy commands • Tier-based progression**')
        .addFields(
            {
                name: '💼 Income Generation Commands',
                value: '```fix\n/work             5K-30K    (1hr cooldown)\n/earn             15K-30K   (1hr cooldown) \n/beg              1K-10K    (1hr cooldown)\n/crime            1K-5K     (30min cooldown)\n/dailytask        5K-15K    (24hr cooldown)\n/quiz             3K-8K     (2hr cooldown)\n/earnmoney        ALL ABOVE (5min cooldown - PREMIUM)\n\n• Shop boosts apply to all earnings\n• Server boosters get +5% bonus\n```',
                inline: false
            },
            {
                name: '🏦 Banking & Transfers',
                value: '```ini\n[Check]    /balance [user]      - Wallet, bank, tier info\n[Store]    /deposit <amount>    - Bank money for interest\n[Access]   /withdraw <amount>   - Take from bank\n[Send]     /sendmoney <user>    - Transfer (5% fee to lottery)\n[Joint]    /marriage profile   - Marriage joint account\n\n• Bank money earns daily compound interest\n• Banked money protected from robbery\n```',
                inline: false
            },
            {
                name: '🛒 Shop & Premium Features',
                value: '```diff\n+ /shop                   - Economy boosts & unlocks\n+ Economy Boost Items:    - Temporary earning multipliers\n+ EarnMoney Unlock:       - Bypass voting requirements\n+ Cosmetic Items:         - Profile decorations & colors\n+ Role Colors:            - Custom Discord role colors\n\n• Boost all earning commands simultaneously\n• Permanent and temporary upgrades available\n```',
                inline: false
            },
            {
                name: '🦹 Risk & Competition',
                value: '```apache\n# /rob <user>            - Steal 8% of wallet (1hr cooldown)\n# Success/Failure:       - Variable by tier difference\n# Failure Penalty:       - Lose 4% of your money\n# Protection Rules:       - Can\'t rob 3+ tiers higher\n# Developer Immunity:     - ID 466050111680544798 protected\n# /robstats              - View robbery statistics\n\n• Higher tiers = better protection from robbery\n```',
                inline: false
            },
            {
                name: '🎖️ Economic Tier System',
                value: '```yaml\n🥉 Bronze:    $0 - $99K        (0% interest)\n🥈 Silver:    $100K - $499K    (2% annual interest)\n🥇 Gold:      $500K - $999K    (5% annual interest)\n💎 Diamond:   $1M - $4.99M     (8% annual interest)\n⚡ Mythic:    $5M+             (10% annual interest)\n\n• Based on total balance (wallet + bank)\n• Interest compounds daily on bank balance only\n• Higher tiers get robbery protection\n```',
                inline: false
            }
        )
        .setColor(categoryInfo.color)
        .setFooter({ text: `${categoryInfo.name} • 🌐 Portal: https://ative-casino-bot-production.up.railway.app/` })
        .setTimestamp();
}

/**
 * Create modern lottery help with accurate current information
 */
function createLotteryHelp(interaction, categoryInfo) {
    return new EmbedBuilder()
        .setTitle(`🎟️ ${categoryInfo.name}`)
        .setDescription('**Bi-weekly drawings • Every Tuesday & Saturday 10AM EST • Life-changing prizes**')
        .addFields(
            {
                name: '🎫 How to Play',
                value: '```yaml\n/lottery              - Check current status & prize pool\n/purchaselottery      - Buy tickets for main lottery\n/lottery2             - Check secondary lottery\n/purchaselottery2     - Buy tickets for secondary lottery\n\n• Ticket Price: $12,000 each\n• Maximum: 7 tickets per person per lottery\n• Drawings: Every Tuesday & Saturday at 10:00 AM EST\n```',
                inline: false
            },
            {
                name: '🏆 Prize Structure',
                value: '```apache\n# 1st Place:  45% of total prize pool\n# 2nd Place:  45% of total prize pool\n# 3rd Place:  10% of total prize pool\n# Guarantee:  3 winners every drawing\n# Typical:    $500K+ prize pools\n\n• Two separate lotteries running simultaneously\n• Community-funded with guaranteed winners\n• Fair random selection for all participants\n```',
                inline: false
            },
            {
                name: '📈 Prize Pool Sources',
                value: '```diff\n+ Ticket Sales:       Every ticket purchased adds to pool\n+ Transfer Fees:      5% from /sendmoney transactions\n+ Robbery Penalties:  Failed robbery attempt fees\n+ Community Growth:   More players = bigger prizes\n\n• Real-time pool tracking and updates\n• Transparent funding system\n• No hidden fees or deductions\n```',
                inline: false
            },
            {
                name: '⚙️ Admin Controls',
                value: '```fix\n/drawlottery CONFIRM  - Manual lottery drawing (admin only)\n\n• Emergency drawing capabilities\n• Automatic scheduled drawings\n• All draws logged and verifiable\n• Winner announcements in server\n```',
                inline: false
            }
        )
        .setColor(categoryInfo.color)
        .setFooter({ text: `${categoryInfo.name} • Next Drawing: Tuesday/Saturday 10AM EST • Max 7 tickets each` })
        .setTimestamp();
}

/**
 * Create modern admin help with current command information
 */
function createAdminHelp(interaction, categoryInfo) {
    return new EmbedBuilder()
        .setTitle(`👑 ${categoryInfo.name}`)
        .setDescription('**Server management & administration • 10 admin commands available**')
        .addFields(
            {
                name: '🛠️ Server Setup & Configuration',
                value: '```yaml\n/setup                - Initial server configuration\n/admin or /portal     - Access admin web portal\n\n• Configure roles (ADMIN, MODS)\n• Setup logging channels\n• Bot permissions and features\n• Master control dashboard access\n```',
                inline: false
            },
            {
                name: '🎮 Game Control & Emergency Tools',
                value: '```apache\n# /stopgame [user]      - Emergency game termination\n# /stopmysession        - User self-service session end\n# /sessionstatus [user] - Check/debug user sessions\n# /release <user>       - Free stuck user sessions\n\n• Automatic refunds for stopped games\n• Real-time session monitoring\n• Emergency intervention capabilities\n```',
                inline: false
            },
            {
                name: '📊 Monitoring & Fairness Systems',
                value: '```fix\n/fairness              - NEW! Casino fairness monitoring\n  ├─ report            - Generate fairness reports\n  ├─ stats             - View house edge statistics\n  ├─ enable/disable    - Toggle fairness monitoring\n  └─ test/check        - Verify system integrity\n\n/wealth-protection     - NEW! Anti-billionaire monitoring\n  ├─ status/analyze    - Wealth distribution analysis\n  ├─ leaderboard       - Wealth rankings\n  └─ simulate          - Test protection scenarios\n```',
                inline: false
            },
            {
                name: '🏦 Economy & User Management',
                value: '```ini\n[Cooldowns]  /cooldown [user]      - Check user cooldown status\n[Lottery]    /drawlottery CONFIRM  - Manual lottery drawing\n[System]     /maintenance <action> - Enable/disable maintenance\n\n• View all user earning command cooldowns\n• Emergency lottery drawing capabilities\n• System-wide maintenance mode control\n```',
                inline: false
            },
            {
                name: '🔐 Permission Requirements',
                value: '```apache\n# Admin Commands:  ADMIN role OR Discord Administrator\n# Mod Commands:    MODS role (limited permissions)\n# Server Owner:    Automatic full access\n# Developer:       Ultimate access (ID: 466050111680544798)\n\n• Use /setup to configure roles properly\n• All admin actions logged to admin channel\n• Multiple confirmation steps for major actions\n```',
                inline: false
            }
        )
        .setColor(categoryInfo.color)
        .setFooter({ text: `${categoryInfo.name} • All actions logged • Use /setup for initial configuration` })
        .setTimestamp();
}

/**
 * Create modern tiers help with accurate current information
 */
function createTiersHelp(interaction, categoryInfo) {
    return new EmbedBuilder()
        .setTitle(`🎖️ ${categoryInfo.name}`)
        .setDescription('**5-tier progression system • Based on total balance (wallet + bank)**')
        .addFields(
            {
                name: '📊 Tier System Overview',
                value: '```yaml\nCalculation: Wallet + Bank = Total Balance\nUpdates:     Real-time tier changes\nBenefits:    Interest rates + robbery protection\nInterest:    Compounds daily on bank balance only\nProtection:  Cannot rob 3+ tiers higher\n```',
                inline: false
            },
            {
                name: '🥉 Bronze Tier',
                value: '```apache\n# Range:      $0 - $99,999\n# Interest:   0% annually\n# Status:     Starting tier\n# Features:   Basic access to all commands\n# Protection: None (vulnerable to all robbery)\n```',
                inline: false
            },
            {
                name: '🥈 Silver Tier',
                value: '```diff\n+ Range:      $100,000 - $499,999\n+ Interest:   2% annually (0.005% daily)\n+ Status:     Regular player\n+ Features:   Basic banking benefits\n+ Protection: Protected from Bronze robberies\n```',
                inline: false
            },
            {
                name: '🥇 Gold Tier',
                value: '```css\nRange:      $500,000 - $999,999\nInterest:   5% annually (0.014% daily)\nStatus:     Advanced player\nFeatures:   Higher betting limits\nProtection: Protected from Bronze + Silver robberies\n```',
                inline: false
            },
            {
                name: '💎 Diamond Tier',
                value: '```fix\nRange:      $1,000,000 - $4,999,999\nInterest:   8% annually (0.022% daily)\nStatus:     High roller\nFeatures:   VIP status, exclusive perks\nProtection: Protected from Bronze/Silver/Gold robberies\n```',
                inline: false
            },
            {
                name: '⚡ Mythic Tier',
                value: '```ini\n[Range]      $5,000,000+\n[Interest]   10% annually (0.027% daily)\n[Status]     Elite status\n[Features]   All perks, ultimate tier benefits\n[Protection] Protected from all lower tier robberies\n```',
                inline: false
            },
            {
                name: '💡 Important Notes',
                value: '• **Interest compounds daily** on bank balance only\n• **Robbery protection** prevents attacks from 3+ tiers below\n• **Tier changes instantly** when balance changes\n• **Bank money for safety** - earn interest + robbery protection\n• **Total balance calculation** includes both wallet and bank',
                inline: false
            }
        )
        .setColor(categoryInfo.color)
        .setFooter({ text: `${categoryInfo.name} • Higher tiers = better interest + protection • Bank money safely` })
        .setTimestamp();
}

/**
 * Create modern security help with current systems
 */
function createSecurityHelp(interaction, categoryInfo) {
    return new EmbedBuilder()
        .setTitle(`🛡️ ${categoryInfo.name}`)
        .setDescription('**Military-grade security • Provably fair • Transparent operations**')
        .addFields(
            {
                name: '🔐 Advanced Security Systems',
                value: '```yaml\nCryptographic RNG:    Military-grade randomization\nBulletproof Economy:  Anti-exploitation protection\nIntelligent Scaling:  AI-powered economic balancing\nReal-time Monitoring: 24/7 abuse detection\nAudit Logging:        Every action timestamped\n```',
                inline: false
            },
            {
                name: '⚖️ Fairness Monitoring (NEW!)',
                value: '```apache\n# /fairness report     - Generate fairness analysis\n# /fairness stats      - View house edge statistics\n# /fairness test       - Verify system integrity\n# House Edge Tracking: - Real-time RTP monitoring\n# Transparent Odds:    - All game odds clearly displayed\n\n• Automatic fairness adjustments\n• Public statistical reporting\n• Provably fair algorithms\n```',
                inline: false
            },
            {
                name: '🛡️ Wealth Protection (NEW!)',
                value: '```diff\n+ /wealth-protection status   - Monitor wealth distribution\n+ Anti-billionaire System:    - Prevents extreme accumulation\n+ Progressive Scaling:         - Mathematical wealth balancing\n+ Economic Zones:              - Automatic tier adjustments\n+ Real-time Analysis:          - Continuous wealth monitoring\n\n• Protects server economy health\n• Ensures fair competition\n• Prevents economic exploitation\n```',
                inline: false
            },
            {
                name: '🚫 Prohibited Activities',
                value: '```ini\n[Automation]     Using bots, scripts, or automated tools\n[Exploitation]   Abusing bugs or system vulnerabilities\n[Multi-Account]  Using alt accounts to bypass limits\n[Real Trading]   Selling virtual currency for real money\n[Abuse]          Harassment, spam, or disruptive behavior\n\n⚠️ Violations result in immediate suspension\n```',
                inline: false
            },
            {
                name: '🤖 AI Protection Systems',
                value: '```fix\nBehavioral Analysis:  Pattern detection for suspicious activity\nTrend Analysis:       Game result and economic monitoring\nML Protection:        Machine learning abuse prevention\nAutomatic Scaling:    Dynamic difficulty adjustments\nEconomic Oversight:   Intelligent payout management\n```',
                inline: false
            },
            {
                name: '📊 Transparency & Reporting',
                value: '• **🔍 Open Source Logic:** All odds and mechanics transparent\n• **📈 Public Statistics:** Real-time leaderboards and statistics\n• **🛡️ Admin Logging:** All admin actions logged publicly\n• **📊 Fairness Reports:** Regular system integrity reports\n• **💬 Community Oversight:** Player reporting and moderation\n• **🔒 Developer Protection:** ID 466050111680544798 immune',
                inline: false
            }
        )
        .setColor(categoryInfo.color)
        .setFooter({ text: `${categoryInfo.name} • Advanced AI protection • Transparent operations • Fair play guaranteed` })
        .setTimestamp();
}

/**
 * Utility function to format bot uptime
 */
function formatUptime() {
    const uptime = process.uptime();
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
}

// Export functions for external interaction handlers
module.exports.showMainHelp = showMainHelp;
module.exports.showCategoryHelp = showCategoryHelp;
module.exports.handleHelpError = handleHelpError;
module.exports.HELP_CATEGORIES = HELP_CATEGORIES;

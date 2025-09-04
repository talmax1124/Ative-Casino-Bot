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
        description: 'Weekly drawings and prize information',
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
            await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
        } else {
            await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
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
        .setTitle('🎰 ATIVE Casino Bot - Command Center')
        .setDescription(`**Welcome to the ultimate Discord casino experience!**\n\n🎯 **Quick Navigation:** Use the dropdown below or quick action buttons\n📊 **Live Stats:** ${interaction.guild.memberCount} members | Uptime: ${formatUptime()}\n\n*Select a category to explore detailed help and tutorials.*`)
        .addFields(
            {
                name: '🎰 **Casino Games Hub**',
                value: '```\n🎲 Slots & Multi-Slots  🃏 Blackjack & Poker\n🎣 Fishing & Plinko    🎯 Crash & RPS\n🦆 Duck Hunt & Bingo   🎮 UNO & Battleship\n🔗 Word Chain & More!\n```',
                inline: true
            },
            {
                name: '💰 **Economy & Finance**',
                value: '```\n💼 Work & Business     🏦 Banking System\n🦹 Rob & Heist        💸 Send Money\n📈 Investments        🎖️ Tier Progression\n💎 Interest & Rewards\n```',
                inline: true
            },
            {
                name: '🎟️ **Lottery & Prizes**',
                value: '```\n🎫 Weekly Drawings     🏆 Massive Prizes\n📊 Prize Pool Growth   🎯 Ticket Strategy\n📅 Sunday 10AM EST    💰 Community Pool\n```',
                inline: true
            },
            {
                name: '👑 **Admin & Management**',
                value: '```\n🛠️ Server Setup       📊 User Management\n💰 Economy Control    🎮 Game Oversight\n📈 Statistics Panel   🔐 Security Tools\n```',
                inline: true
            },
            {
                name: '🎖️ **Tier System**',
                value: '```\n🥉 Bronze → ⚡ Mythic  💸 Interest Rates\n🎁 Exclusive Benefits  🔝 Higher Limits\n🛡️ Robbery Protection 📊 Progress Track\n```',
                inline: true
            },
            {
                name: '🛡️ **Security & Fair Play**',
                value: '```\n🔐 Anti-Cheat System  ⚖️ Fair Odds\n📋 Community Rules    🚫 Abuse Prevention\n📊 Transparency Logs  🤝 Player Safety\n```',
                inline: true
            }
        )
        .addFields(
            {
                name: '🚀 **Quick Start Guide**',
                value: '`1.` Check balance with `/balance` → `2.` Earn with `/work` or `/beg` → `3.` Play `/slots 100` → `4.` Bank money for safety → `5.` Buy lottery tickets → `6.` Climb tiers!',
                inline: false
            }
        )
        .setColor(0xFFD700)
        .setThumbnail(interaction.client.user.displayAvatarURL({ size: 256 }))
        .setFooter({ 
            text: `🎰 Help Center • Page 1/6 • ATIVE Casino Bot`, 
            iconURL: interaction.client.user.displayAvatarURL() 
        })
        .setTimestamp();

    // Advanced category selection dropdown
    const categorySelect = new StringSelectMenuBuilder()
        .setCustomId('help_category_select')
        .setPlaceholder('📂 Select a help category to explore...')
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

    // Modern button layout
    const quickButtons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('help_all_commands')
                .setLabel('📋 All Commands')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('📋'),
            new ButtonBuilder()
                .setCustomId('help_quick_start')
                .setLabel('🚀 Quick Start')
                .setStyle(ButtonStyle.Success)
                .setEmoji('🚀'),
            new ButtonBuilder()
                .setCustomId('help_tutorials')
                .setLabel('📚 Tutorials')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📚'),
            new ButtonBuilder()
                .setCustomId('help_support')
                .setLabel('💬 Support')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('💬')
        );

    // Navigation buttons
    const navButtons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('help_stats')
                .setLabel('📊 Bot Stats')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('📊'),
            new ButtonBuilder()
                .setCustomId('help_changelog')
                .setLabel('📰 What\'s New')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('📰'),
            new ButtonBuilder()
                .setCustomId('help_close')
                .setLabel('❌ Close Help')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('❌')
        );

    try {
        if (interaction.deferred) {
            await interaction.editReply({ 
                embeds: [embed], 
                components: [selectRow, quickButtons, navButtons] 
            });
        } else {
            await interaction.reply({ 
                embeds: [embed], 
                components: [selectRow, quickButtons, navButtons] 
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

    // Navigation controls
    const navControls = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('help_back_main')
                .setLabel('🏠 Main Help')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🏠'),
            new ButtonBuilder()
                .setCustomId('help_refresh_category')
                .setLabel('🔄 Refresh')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🔄'),
            new ButtonBuilder()
                .setCustomId(`help_tutorial_${category}`)
                .setLabel('📖 Tutorial')
                .setStyle(ButtonStyle.Success)
                .setEmoji('📖'),
            new ButtonBuilder()
                .setCustomId('help_close')
                .setLabel('❌ Close')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('❌')
        );

    // Category-specific quick actions
    const quickActions = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`help_examples_${category}`)
                .setLabel('💡 Examples')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('💡'),
            new ButtonBuilder()
                .setCustomId(`help_tips_${category}`)
                .setLabel('🎯 Pro Tips')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🎯'),
            new ButtonBuilder()
                .setCustomId(`help_faq_${category}`)
                .setLabel('❓ FAQ')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('❓')
        );

    const components = [navControls, quickActions, ...extraComponents];

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
 * Create modern games help with rich formatting
 */
function createGamesHelp(interaction, categoryInfo) {
    return new EmbedBuilder()
        .setTitle(`${categoryInfo.emoji} ${categoryInfo.name} - Complete Guide`)
        .setDescription('**🎰 Experience Las Vegas right in Discord! 🎰**\n\n*All games feature provably fair odds, cryptographic RNG, and real-time results.*\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        .addFields(
            {
                name: '🎰 **Slot Machines** 🎰',
                value: '```yaml\nClassic Slots: /slots <amount>\nMulti-Line:   /multi-slots <amount> [lines]\nPayouts:      🍒 2x → 💎 50x → 7️⃣ JACKPOT!\nMin Bet:      $100 | Max Bet: No Limit*\n```\n🎯 **Features:** Auto-spin, bonus rounds, progressive jackpots\n❓ *Click the ? button in-game for detailed paytable*',
                inline: false
            },
            {
                name: '🃏 **Card Games** 🃏',
                value: '```yaml\nBlackjack:    /blackjack <amount>\nActions:      Hit, Stand, Double Down, Split\nPayouts:      21 = 3:2 | Blackjack = 2:1 | Insurance Available\nStrategy:     Basic strategy charts available\n```\n🎯 **Pro Tips:** Learn basic strategy, manage bankroll, use insurance wisely',
                inline: false
            },
            {
                name: '🎣 **Skill & Strategy Games** 🎣',
                value: '```yaml\nFishing:      /fishing <amount> - Risk vs Reward\nPlinko:       /plinko <amount> - Drop & Multiply  \nCrash:        /crash <amount> [auto] - Cash Out Game\nRPS:          /rps <amount> - Rock Paper Scissors\n```\n🎯 **Winning Strategy:** Balance risk/reward, timing is everything',
                inline: false
            },
            {
                name: '🎮 **Social & Party Games** 🎮',
                value: '```yaml\nUNO:          /uno - Classic card game with friends\nBingo:        /bingo - Community bingo sessions\nDuck Hunt:    /duck [mode] - Survival adventure\nBattleship:   /battleship - Strategic naval combat\n```\n🎯 **Community Features:** Tournaments, leaderboards, achievements',
                inline: false
            },
            {
                name: '⚔️ **PvP & Competitive** ⚔️',
                value: '```yaml\nWord Chain:   /wordchain - Word association challenge\nBattleship:   /battleship - 1v1 naval strategy\nTournaments:  Coming Soon - Organized competitions\nRankings:     /leaderboard games - See top players\n```\n🎯 **Competitive Play:** Rankings, tournaments, seasonal rewards',
                inline: false
            },
            {
                name: '📊 **Game Statistics & Fair Play** 📊',
                value: '• **🔍 Transparency:** All odds displayed clearly\n• **🎲 RNG:** Cryptographically secure randomization\n• **📈 Stats:** Track your wins, losses, and streaks\n• **🛡️ Fair Play:** Anti-cheat systems active\n• **❓ Help:** Every game has interactive tutorials\n• **💰 Responsible Gaming:** Set limits, play smart',
                inline: false
            }
        )
        .setColor(categoryInfo.color)
        .setThumbnail(interaction.client.user.displayAvatarURL())
        .setFooter({ 
            text: `🎰 ${categoryInfo.name} • Updated ${new Date().toLocaleDateString()} • ATIVE Casino Bot`, 
            iconURL: interaction.client.user.displayAvatarURL() 
        })
        .setTimestamp();
}

/**
 * Create modern economy help
 */
function createEconomyHelp(interaction, categoryInfo) {
    return new EmbedBuilder()
        .setTitle(`${categoryInfo.emoji} ${categoryInfo.name} - Financial Guide`)
        .setDescription('**💰 Build Your Fortune & Climb the Ranks! 💰**\n\n*Master the economy system with smart investments, strategic gameplay, and calculated risks.*\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        .addFields(
            {
                name: '💼 **Income Generation** 💼',
                value: '```yaml\nWork:         /work - Jobs paying $5K-30K (1hr cooldown)\nBeg:          /beg - Handouts $1K-10K (1hr cooldown)  \nCrime:        /crime - Quick $1K-5K (30min cooldown)\nHeist:        /heist - Big scores $10K-30K (2.5hr cooldown)\n```\n🎯 **Pro Strategy:** Rotate all income sources for maximum earnings',
                inline: false
            },
            {
                name: '🏦 **Banking & Wealth Management** 🏦',
                value: '```yaml\nBalance:      /balance [user] - Check wallet, bank, tier\nBanking:      Use balance panel to deposit/withdraw\nInterest:     Daily compound interest on bank balance\nTransfers:    /sendmoney <user> <amount> (5% fee)\n```\n🎯 **Wealth Tips:** Bank money ASAP for interest and robbery protection',
                inline: false
            },
            {
                name: '🦹 **Risk & Robbery System** 🦹',
                value: '```yaml\nRobbery:      /rob <user> - Steal 8% of target money\nRisk:         4% penalty if caught + cooldown\nProtection:   Can\'t rob 3+ tiers higher than you\nDeveloper:    Protected from all robbery attempts\n```\n⚠️ **Risk Management:** Higher tiers = better protection',
                inline: false
            },
            {
                name: '🎖️ **Tier System Benefits** 🎖️',
                value: '```yaml\nProgression:  🥉 Bronze → 🥈 Silver → 🥇 Gold → 💎 Diamond → ⚡ Mythic\nInterest:     0% → 2% → 5% → 8% → 10% annually\nProtection:   Higher tiers harder to rob\nPerks:        Exclusive games, higher limits, special badges\n```\n📊 **View Details:** Use `/leaderboard tiers` for complete breakdown',
                inline: false
            },
            {
                name: '💡 **Advanced Economy Strategies** 💡',
                value: '• **🏦 Banking Priority:** Always bank excess funds for interest\n• **⏰ Cooldown Management:** Use all income sources efficiently  \n• **🎯 Tier Climbing:** Focus on total balance growth\n• **🛡️ Defense:** Higher tiers = robbery protection\n• **💸 Smart Spending:** Invest in games with good odds\n• **📈 Long-term:** Compound interest beats gambling',
                inline: false
            }
        )
        .setColor(categoryInfo.color)
        .setThumbnail(interaction.client.user.displayAvatarURL())
        .setFooter({ 
            text: `💰 ${categoryInfo.name} • Your path to riches • ATIVE Casino Bot`, 
            iconURL: interaction.client.user.displayAvatarURL() 
        })
        .setTimestamp();
}

/**
 * Create modern lottery help
 */
function createLotteryHelp(interaction, categoryInfo) {
    return new EmbedBuilder()
        .setTitle(`${categoryInfo.emoji} ${categoryInfo.name} - Win Big Weekly!`)
        .setDescription('**🎟️ Every Sunday at 10:00 AM EST - Life-Changing Prizes! 🎟️**\n\n*Community-funded lottery with guaranteed winners and massive prize pools.*\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        .addFields(
            {
                name: '🎫 **How to Play & Win** 🎫',
                value: '```yaml\nCheck Status: /lottery - View current lottery info\nBuy Tickets:  /purchaselottery <1-7> - Max 7 per person\nTicket Cost:  $12,000 each (investment in your future)\nDrawing:      Every Sunday 10:00 AM EST sharp\n```\n🎯 **Strategy:** Buy max tickets early for best odds',
                inline: false
            },
            {
                name: '🏆 **Prize Structure & Payouts** 🏆',
                value: '```yaml\n🥇 1st Place:  45% of total prize pool\n🥈 2nd Place:  45% of total prize pool  \n🥉 3rd Place:  10% of total prize pool\nGuarantee:    3 winners EVERY week\nMin Pool:     $500K+ typical pools\n```\n💰 **Recent Winners:** Check announcements for latest prizes',
                inline: false
            },
            {
                name: '📈 **Prize Pool Growth System** 📈',
                value: '```yaml\nTicket Sales:     Every ticket adds to the pool\nTransaction Fees: 5% from /sendmoney transfers\nRobbery Penalties: Failed robbery attempts add fees\nCommunity Growth: Bigger community = bigger prizes\n```\n📊 **Pool Tracking:** Watch it grow throughout the week',
                inline: false
            },
            {
                name: '🎯 **Winning Strategies & Tips** 🎯',
                value: '```yaml\nMax Purchase:     Buy all 7 tickets for best odds\nEarly Bird:       No advantage, but more excitement!\nConsistent Play:  Play every week to maximize chances\nCommunity:        Bigger server = bigger prize pools\n```\n🍀 **Remember:** Every ticket has an equal chance to win',
                inline: false
            },
            {
                name: '📢 **Lottery Features & Updates** 📢',
                value: '• **⏰ Automatic Drawings:** No delays, precise timing\n• **📢 Winner Announcements:** Public celebration of winners\n• **🎫 Ticket Tracking:** See exactly how many tickets you own\n• **📊 Live Updates:** Prize pool updates in real-time\n• **🔍 Transparency:** All draws are logged and verifiable\n• **🎉 Community Events:** Special lottery bonus weeks',
                inline: false
            }
        )
        .setColor(categoryInfo.color)
        .setThumbnail(interaction.client.user.displayAvatarURL())
        .setFooter({ 
            text: `🎟️ ${categoryInfo.name} • Next Drawing: Sunday 10AM EST • ATIVE Casino Bot`, 
            iconURL: interaction.client.user.displayAvatarURL() 
        })
        .setTimestamp();
}

/**
 * Create modern admin help
 */
function createAdminHelp(interaction, categoryInfo) {
    return new EmbedBuilder()
        .setTitle(`${categoryInfo.emoji} ${categoryInfo.name} - Server Management`)
        .setDescription('**👑 Powerful Administration Tools 👑**\n\n*Complete server management with advanced controls and monitoring.*\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        .addFields(
            {
                name: '💰 **Economy Administration** 💰',
                value: '```yaml\nEdit Money:   /editmoney <user> <amount> [account]\nTransparency: All actions logged to admin channel\nSafeguards:   Multiple confirmation steps\n```\n🔒 **Permissions:** Administrator role or higher required',
                inline: false
            },
            {
                name: '🛠️ **Server Setup & Management** 🛠️',
                value: '```yaml\nInitial Setup: /setup - Configure bot for your server\nAdmin Panel:   /panel - Master control dashboard\nRole Config:   Setup ADMIN and MODS roles\nChannel Setup: Configure logging channels\n```\n📊 **Dashboard:** Centralized control for all functions',
                inline: false
            },
            {
                name: '🎮 **Game Control & Oversight** 🎮',
                value: '```yaml\nStop Games:   /stopgame - Emergency game termination\nCrash Control: /stopcrash - Stop crash games instantly\nRefunds:      Automatic refunds for stopped games\nMonitoring:   Real-time game activity tracking\n```\n🛡️ **Anti-Abuse:** Prevent and resolve gaming issues',
                inline: false
            },
            {
                name: '📊 **Statistics & Monitoring** 📊',
                value: '```yaml\nBot Status:   /status - Uptime, performance metrics\nLeaderboards: /leaderboard - User rankings and stats\nPolls:        /polls create - Server community polls\nLogs:         Comprehensive activity logging\n```\n📈 **Analytics:** Track server engagement and bot performance',
                inline: false
            },
            {
                name: '🔐 **Permission & Security System** 🔐',
                value: '```yaml\nAdmin Roles:      ADMIN role or Discord Administrator\nModerator Roles:  MODS role (limited permissions)\nServer Owner:     Automatic full access\nDeveloper:        Ultimate access (ID: 466050111680544798)\n```\n⚙️ **Setup Guide:** Use `/setup` to configure roles properly',
                inline: false
            },
            {
                name: '📋 **Best Practices & Guidelines** 📋',
                value: '• **📊 Monitor Logs:** Check admin channel regularly\n• **🎛️ Use Panels:** Bulk operations via control panels\n• **📈 Check Stats:** Monitor unusual activity patterns\n• **🛡️ Security First:** Verify before major actions\n• **📚 Documentation:** Keep records of admin actions\n• **👥 Team Work:** Coordinate with other administrators',
                inline: false
            }
        )
        .setColor(categoryInfo.color)
        .setThumbnail(interaction.client.user.displayAvatarURL())
        .setFooter({ 
            text: `👑 ${categoryInfo.name} • Server Management Tools • ATIVE Casino Bot`, 
            iconURL: interaction.client.user.displayAvatarURL() 
        })
        .setTimestamp();
}

/**
 * Create modern tiers help
 */
function createTiersHelp(interaction, categoryInfo) {
    const tiers = getAllTiers().reverse();
    
    const embed = new EmbedBuilder()
        .setTitle(`${categoryInfo.emoji} ${categoryInfo.name} - Progression System`)
        .setDescription('**🎖️ Climb the Ranks & Unlock Exclusive Benefits! 🎖️**\n\n*Advance through tiers by building wealth and unlock powerful perks and protections.*\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        .setColor(categoryInfo.color)
        .setThumbnail(interaction.client.user.displayAvatarURL())
        .setFooter({ 
            text: `🎖️ ${categoryInfo.name} • Your Path to Prestige • ATIVE Casino Bot`, 
            iconURL: interaction.client.user.displayAvatarURL() 
        })
        .setTimestamp();

    // Add tier progression visual
    embed.addFields({
        name: '📊 **Tier Progression Overview** 📊',
        value: '```yaml\nProgression: Based on TOTAL BALANCE (wallet + bank)\nRequirement: Must maintain minimum for benefits\nBenefits:    Interest, protection, exclusive features\nCalculation: Updated in real-time with balance changes\n```\n🎯 **Pro Tip:** Bank money to boost total balance safely',
        inline: false
    });

    // Add each tier with enhanced formatting
    for (const tier of tiers) {
        const rangeText = tier.max === Infinity ? `${tier.min.toLocaleString()}+` : `${tier.min.toLocaleString()} - ${tier.max.toLocaleString()}`;
        let benefitsText = `💰 **Range:** $${rangeText}\n`;
        
        if (tier.interest > 0) {
            benefitsText += `💸 **Interest:** ${(tier.interest * 100).toFixed(0)}% annually (${(tier.interest/365*100).toFixed(3)}% daily)\n`;
        } else {
            benefitsText += `💸 **Interest:** None\n`;
        }

        // Add tier-specific perks
        let perks = [];
        if (tier.key === 'BRONZE') perks.push('🎯 Starting tier', '📚 Learning phase');
        if (tier.key === 'SILVER') perks.push('🏦 Basic banking', '💼 Regular jobs');
        if (tier.key === 'GOLD') perks.push('🎮 Advanced games', '🔒 Robbery protection');
        if (tier.key === 'PLATINUM') perks.push('🎮 Exclusive games', '💎 Premium features');
        if (tier.key === 'DIAMOND') perks.push('🔝 Higher betting limits', '🖼️ GIF permissions', '👑 VIP status');
        if (tier.key === 'LEGENDARY') perks.push('🏷️ Custom bot badge', '⚡ Priority support', '🎯 Special events');
        if (tier.key === 'MYTHIC') perks.push('⚡ Ultimate tier', '🌟 All perks', '👑 Elite status');

        if (perks.length > 0) {
            benefitsText += `🎁 **Perks:** ${perks.join(', ')}`;
        }

        embed.addFields({
            name: `${tier.emoji} **${tier.name.toUpperCase()} TIER** ${tier.emoji}`,
            value: benefitsText,
            inline: true
        });
    }

    // Add important rules
    embed.addFields({
        name: '📋 **Important Tier Rules & Mechanics** 📋',
        value: '• **💰 Total Balance:** Tier based on wallet + bank combined\n• **⏰ Real-time Updates:** Tier changes instantly with balance\n• **💸 Interest Calculation:** Compound daily on bank balance only\n• **🛡️ Robbery Protection:** 3+ tier difference prevents robbery\n• **📉 Tier Maintenance:** Must maintain minimum balance for benefits\n• **⚠️ Inactivity:** 10+ days inactive may affect tier status',
        inline: false
    });

    return embed;
}

/**
 * Create modern security help
 */
function createSecurityHelp(interaction, categoryInfo) {
    return new EmbedBuilder()
        .setTitle(`${categoryInfo.emoji} ${categoryInfo.name} - Fair Play Guarantee`)
        .setDescription('**🛡️ Security, Fairness & Community Standards 🛡️**\n\n*Built with security-first principles and transparent, fair gameplay for everyone.*\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        .addFields(
            {
                name: '🔐 **Advanced Security Features** 🔐',
                value: '```yaml\nCryptographic RNG:  Provably fair randomization\nAnti-Exploit:       Advanced abuse detection systems\nAudit Logging:      Every action recorded and timestamped\nRate Limiting:      Prevents spam and automation\n```\n🛡️ **Industry Standard:** Military-grade security protocols',
                inline: false
            },
            {
                name: '⚖️ **Fair Play Guarantees** ⚖️',
                value: '```yaml\nTransparent Odds:    All game odds clearly displayed\nNo Hidden Systems:   What you see is exactly what you get\nEqual Opportunity:   Same rules apply to everyone\nPublic Statistics:   Leaderboards show real, unmanipulated data\n```\n📊 **Verification:** All systems are auditable and transparent',
                inline: false
            },
            {
                name: '🚫 **Strictly Prohibited Activities** 🚫',
                value: '```yaml\nAutomation/Botting:   Using scripts, bots, or automated tools\nBug Exploitation:     Abusing glitches or system vulnerabilities\nMultiple Accounts:    Using alt accounts to circumvent limits\nReal Money Trading:   Selling virtual currency for real money\n```\n⚠️ **Consequences:** Immediate suspension and potential ban',
                inline: false
            },
            {
                name: '⚡ **Automated Abuse Prevention** ⚡',
                value: '```yaml\nPattern Detection:    AI identifies suspicious behavior\nCooldown Systems:     Prevents rapid-fire command abuse\nEconomic Penalties:   Fines and restrictions for violations\nAdmin Monitoring:     All actions logged and tracked\n```\n🤖 **Smart Detection:** Advanced algorithms protect fair play',
                inline: false
            },
            {
                name: '📊 **Reporting & Transparency System** 📊',
                value: '```yaml\nMonitoring Channel:  <#1409016191049142434> - All activity logged\nTransparency Logs:   Public record of major actions\nAdmin Reports:       Contact server administrators directly\nCommunity Oversight: Player reports and community moderation\n```\n🔍 **Open System:** All activity is monitored and logged',
                inline: false
            },
            {
                name: '🤝 **Community Guidelines & Ethics** 🤝',
                value: '• **💬 Respect Others:** Treat all players with courtesy and respect\n• **⚖️ Play Fair:** Don\'t seek exploits or unfair advantages\n• **🐛 Report Issues:** Help maintain system integrity\n• **🎮 Have Fun:** Remember this is entertainment first\n• **📜 Follow Discord TOS:** All Discord rules apply here\n• **🛡️ Protect Community:** Help maintain a safe environment',
                inline: false
            }
        )
        .setColor(categoryInfo.color)
        .setThumbnail(interaction.client.user.displayAvatarURL())
        .setFooter({ 
            text: `🛡️ ${categoryInfo.name} • Fair Play for All • ATIVE Casino Bot`, 
            iconURL: interaction.client.user.displayAvatarURL() 
        })
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
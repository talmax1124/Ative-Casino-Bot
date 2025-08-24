/**
 * Comprehensive help command with interactive UI
 * Shows all commands organized by categories with detailed descriptions
 */

const { SlashCommandBuilder, MessageFlags, ButtonBuilder, ActionRowBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { getTierDisplay, getAllTiers } = require('../UTILS/common');
const { buildSessionEmbed } = require('../UTILS/gameSessionKit');
const logger = require('../UTILS/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Get help and information about ATIVE Casino Bot')
        .addStringOption(option =>
            option.setName('category')
                .setDescription('Specific help category')
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
            if (category) {
                await showSpecificCategory(interaction, category);
            } else {
                await showMainHelp(interaction);
            }
        } catch (error) {
            logger.error(`Error in help command: ${error.message}`);
            
            const errorEmbed = buildSessionEmbed({
                title: '❌ Help System Error',
                topFields: [
                    { name: 'System Error', value: 'Unable to load help information.\nPlease try again.' }
                ],
                color: 0xFF0000,
                footer: 'Help System'
            });

            if (interaction.replied) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral });
            }
        }
    }
};

/**
 * Show main help overview with category selection
 */
async function showMainHelp(interaction) {
    const embed = new EmbedBuilder()
        .setTitle('🎰 ATIVE Casino Bot - Help Center')
        .setDescription('**Welcome to the ultimate Discord casino experience!**\n\nChoose a category below to get detailed help, or use the buttons to navigate through different sections.')
        .addFields(
            {
                name: '🎰 Casino Games',
                value: '🎲 Slots, Blackjack, Crash, Fishing, Plinko, RPS\n🦆 Duck Hunt, 🎯 Battleship, 🎮 UNO, Bingo\n🔗 Word Chain and more exciting games!',
                inline: true
            },
            {
                name: '💰 Economy System',
                value: '💵 Balance, Work, Beg, Crime, Heist, Rob\n🏦 Wallet & Bank management\n💸 Send money between users',
                inline: true
            },
            {
                name: '🎟️ Lottery & Rewards',
                value: '🎫 Weekly lottery drawings\n🏆 Win big prizes every Sunday\n📊 Community prize pools',
                inline: true
            },
            {
                name: '🎖️ Economic Tiers',
                value: '🥉 Bronze → ⚡ Mythic progression\n💰 Interest rates up to 10%\n🎁 Exclusive tier benefits',
                inline: true
            },
            {
                name: '👑 Admin Tools',
                value: '🛠️ User management and controls\n💰 Economy administration\n📊 Server statistics and logs',
                inline: true
            },
            {
                name: '🛡️ Security & Rules',
                value: '🔐 Anti-abuse protection\n⚖️ Fair play guarantees\n📋 Terms and guidelines',
                inline: true
            }
        )
        .addFields(
            {
                name: '🚀 Quick Start Guide',
                value: '1️⃣ Use `/balance` to check your starting money\n2️⃣ Try `/work` or `/beg` to earn more\n3️⃣ Play games like `/slots` or `/blackjack`\n4️⃣ Check `/leaderboard` to see rankings\n5️⃣ Use `/lottery` to buy tickets for big prizes',
                inline: false
            }
        )
        .setColor(0xFFD700)
        .setThumbnail(interaction.client.user.displayAvatarURL())
        .setFooter({ text: '🎰 Help Center • ATIVE Casino Bot', iconURL: interaction.client.user.displayAvatarURL() })
        .setTimestamp();

    // Create category selection dropdown
    const categorySelect = new StringSelectMenuBuilder()
        .setCustomId('help_category_select')
        .setPlaceholder('📂 Choose a help category...')
        .addOptions([
            {
                label: '🎰 Casino Games',
                description: 'Slots, Blackjack, Fishing, and all other games',
                value: 'games'
            },
            {
                label: '💰 Economy Commands',
                description: 'Work, balance, rob, and money management',
                value: 'economy'
            },
            {
                label: '🎟️ Lottery System',
                description: 'Weekly drawings and prize information',
                value: 'lottery'
            },
            {
                label: '👑 Admin Commands',
                description: 'Server management and administration tools',
                value: 'admin'
            },
            {
                label: '🎖️ Economic Tiers',
                description: 'Tier system, benefits, and progression',
                value: 'tiers'
            },
            {
                label: '🛡️ Security & Rules',
                description: 'Fair play, anti-abuse, and bot policies',
                value: 'security'
            }
        ]);

    const selectRow = new ActionRowBuilder().addComponents(categorySelect);

    // Create quick access buttons
    const buttons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('help_commands_list')
                .setLabel('📋 All Commands')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('help_getting_started')
                .setLabel('🚀 Getting Started')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('help_support')
                .setLabel('💬 Support')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setURL('https://github.com/anthropics/claude-code/issues')
                .setLabel('🐛 Report Issue')
                .setStyle(ButtonStyle.Link)
        );

    await interaction.reply({ 
        embeds: [embed], 
        components: [selectRow, buttons]
    });
}

/**
 * Show specific category help
 */
async function showSpecificCategory(interaction, category) {
    let embed;

    switch (category) {
        case 'games':
            embed = createGamesHelp(interaction);
            break;
        case 'economy':
            embed = createEconomyHelp(interaction);
            break;
        case 'lottery':
            embed = createLotteryHelp(interaction);
            break;
        case 'admin':
            embed = createAdminHelp(interaction);
            break;
        case 'tiers':
            embed = createTiersHelp(interaction);
            break;
        case 'security':
            embed = createSecurityHelp(interaction);
            break;
        default:
            await showMainHelp(interaction);
            return;
    }

    // Back button
    const backButton = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('help_back_main')
                .setLabel('🔙 Back to Main Help')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('help_refresh')
                .setLabel('🔄 Refresh')
                .setStyle(ButtonStyle.Primary)
        );

    if (interaction.replied) {
        await interaction.editReply({ embeds: [embed], components: [backButton] });
    } else {
        await interaction.reply({ embeds: [embed], components: [backButton] });
    }
}

/**
 * Create games help embed
 */
function createGamesHelp(interaction) {
    return new EmbedBuilder()
        .setTitle('🎰 Casino Games Help')
        .setDescription('**Experience the thrill of Las Vegas right in Discord!**\n\nAll games feature fair odds, secure RNG, and exciting gameplay.')
        .addFields(
            {
                name: '🎰 Slot Machines',
                value: '**`/slots <amount>`** - Classic 3-reel slots\n**`/multi-slots <amount> [lines]`** - Advanced multi-line slots\n💰 **Payouts:** 🍒 Low → 💎 High → 7️⃣ Jackpot\n❓ Use the **?** button in-game for full rules!',
                inline: false
            },
            {
                name: '🃏 Card Games',
                value: '**`/blackjack <amount>`** - Beat the dealer to 21\n🎯 **Actions:** Hit, Stand, Double Down, Split\n💰 **Blackjack pays 3:2** | **Insurance available**\n❓ Game includes interactive help button!',
                inline: false
            },
            {
                name: '🎣 Skill Games',
                value: '**`/fishing <amount>`** - Risk vs reward fishing\n**`/plinko <amount>`** - Drop balls for multipliers\n**`/crash <amount> [auto]`** - Cash out before crash\n🎯 Perfect mix of luck and strategy!',
                inline: false
            },
            {
                name: '🎮 Fun Games',
                value: '**`/rps <amount>`** - Rock Paper Scissors\n**`/duck [mode]`** - Road crossing adventure\n**`/bingo`** - Community bingo games\n**`/uno`** - Classic card game with friends',
                inline: false
            },
            {
                name: '⚔️ PvP Games',
                value: '**`/battleship`** - Strategic naval combat\n**`/wordchain`** - Word association challenge\n🏆 **Compete against other players!**',
                inline: false
            },
            {
                name: '❓ Game Help',
                value: '• Every game has a **?** help button with full rules\n• Fair odds displayed in each game\n• Minimum bets vary by game complexity\n• All games log results for transparency',
                inline: false
            }
        )
        .setColor(0xFF6B35)
        .setThumbnail('🎲')
        .setFooter({ text: '🎰 Games Help • ATIVE Casino Bot', iconURL: interaction.client.user.displayAvatarURL() })
        .setTimestamp();
}

/**
 * Create economy help embed
 */
function createEconomyHelp(interaction) {
    return new EmbedBuilder()
        .setTitle('💰 Economy System Help')
        .setDescription('**Build your fortune with our comprehensive economy system!**\n\nEarn, spend, save, and compete with other players.')
        .addFields(
            {
                name: '💵 Balance Management',
                value: '**`/balance [user]`** - Check wallet, bank & tier info\n**`/sendmoney <user> <amount>`** - Transfer money (5% fee)\n🏦 **Wallet:** Spending money | **Bank:** Secure savings',
                inline: false
            },
            {
                name: '💼 Earning Money',
                value: '**`/work`** - Work various jobs (5K-30K, 1hr cooldown)\n**`/beg`** - Ask for handouts (1K-10K, 1hr cooldown)\n**`/crime`** - Petty crimes (1K-5K, 30min cooldown)\n**`/heist`** - Big scores (10K-30K, 2.5hr cooldown)',
                inline: false
            },
            {
                name: '🦹 Advanced Economy',
                value: '**`/rob <user>`** - Steal 8% of target\'s money\n⚠️ **Risk:** 4% penalty if caught\n🛡️ **Protection:** Can\'t rob 2+ tiers higher\n❌ **Developer is protected from robbery**',
                inline: false
            },
            {
                name: '🎖️ Economic Tiers',
                value: '**Progression:** 🥉 Bronze → ⚡ Mythic\n💰 **Interest:** Up to 10% annually on bank balance\n🎁 **Benefits:** Exclusive features per tier\n📊 Use `/leaderboard tiers` for full details',
                inline: false
            },
            {
                name: '💡 Money Tips',
                value: '• **Bank your money** to earn interest and protect from robbery\n• **Higher tiers** get better interest rates and perks\n• **Diversify income** - use all earning commands\n• **Check leaderboard** to see top earners',
                inline: false
            }
        )
        .setColor(0x32CD32)
        .setThumbnail('💰')
        .setFooter({ text: '💰 Economy Help • ATIVE Casino Bot', iconURL: interaction.client.user.displayAvatarURL() })
        .setTimestamp();
}

/**
 * Create lottery help embed
 */
function createLotteryHelp(interaction) {
    return new EmbedBuilder()
        .setTitle('🎟️ Lottery System Help')
        .setDescription('**Win big in our weekly community lottery!**\n\nEvery Sunday at 10:00 AM EST, fortunes are made!')
        .addFields(
            {
                name: '🎫 How to Play',
                value: '**`/lottery`** - Check current lottery status\n**`/purchaselottery <count>`** - Buy 1-7 tickets\n💰 **Cost:** $12,000 per ticket\n📅 **Drawing:** Every Sunday 10AM EST',
                inline: false
            },
            {
                name: '🏆 Prize Structure',
                value: '🥇 **1st Place:** 45% of total prize pool\n🥈 **2nd Place:** 45% of total prize pool\n🥉 **3rd Place:** 10% of total prize pool\n💰 **Guaranteed 3 winners every week!**',
                inline: false
            },
            {
                name: '📊 Prize Pool Growth',
                value: '• **Ticket sales** add to the pool\n• **Transaction fees** (5% from `/sendmoney`)\n• **Penalty fees** from failed robberies\n• **Community contributions** build bigger prizes',
                inline: false
            },
            {
                name: '🎯 Winning Strategy',
                value: '• **Max 7 tickets** per person per week\n• **More tickets** = higher chance to win\n• **Check status** regularly for pool size\n• **Buy early** - no advantage, just excitement!',
                inline: false
            },
            {
                name: '📢 Lottery Features',
                value: '• **Automatic drawings** every Sunday\n• **Public announcements** of winners\n• **Ticket tracking** shows your entries\n• **Panel updates** with current information',
                inline: false
            }
        )
        .setColor(0x9B59B6)
        .setThumbnail('🎟️')
        .setFooter({ text: '🎟️ Lottery Help • ATIVE Casino Bot', iconURL: interaction.client.user.displayAvatarURL() })
        .setTimestamp();
}

/**
 * Create admin help embed
 */
function createAdminHelp(interaction) {
    return new EmbedBuilder()
        .setTitle('👑 Admin Commands Help')
        .setDescription('**Powerful tools for server administration and bot management.**\n\n⚠️ **Most commands require Administrator permissions or special roles.**')
        .addFields(
            {
                name: '💰 Economy Management',
                value: '**`/addmoney <user> <amount> [account]`** - Add money to users\n**`/setmoney <user> <amount>`** - Set wallet balance\n**`/crasheco <user>`** - Punish economy abuse\n🔒 **Admin only** | Logged for transparency',
                inline: false
            },
            {
                name: '🛠️ Server Management',
                value: '**`/setup`** - Initial bot setup for new servers\n**`/panel`** - Master admin control panel\n**`/backup`** - Create database backup\n📊 **Full server control and monitoring**',
                inline: false
            },
            {
                name: '🎮 Game Control',
                value: '**`/stopgame`** - Force stop active games\n**`/stopcrash`** - Emergency crash game stop\n⚡ **Instant refunds** for stopped games\n🛡️ **Prevent abuse and resolve issues**',
                inline: false
            },
            {
                name: '📊 Statistics & Monitoring',
                value: '**`/status`** - Bot status and uptime\n**`/leaderboard`** - User rankings and stats\n**`/polls create`** - Create server polls\n📈 **Track bot performance and usage**',
                inline: false
            },
            {
                name: '🔐 Permission System',
                value: '**Roles:** ADMIN, MODS, or Discord Administrator\n**Server Owner:** Automatic full access\n**Developer:** Ultimate access (ID: `466050111680544798`)\n⚙️ **Setup roles with `/setup` command**',
                inline: false
            },
            {
                name: '📋 Admin Best Practices',
                value: '• **Monitor logs** channel for all activities\n• **Use panels** for bulk operations\n• **Create backups** before major changes\n• **Check leaderboards** for unusual activity',
                inline: false
            }
        )
        .setColor(0xE74C3C)
        .setThumbnail('👑')
        .setFooter({ text: '👑 Admin Help • ATIVE Casino Bot', iconURL: interaction.client.user.displayAvatarURL() })
        .setTimestamp();
}

/**
 * Create tiers help embed
 */
function createTiersHelp(interaction) {
    const tiers = getAllTiers().reverse();
    
    const embed = new EmbedBuilder()
        .setTitle('🎖️ Economic Tier System Help')
        .setDescription('**Advance through tiers by accumulating wealth and unlock exclusive benefits!**\n\nTiers are based on your **total balance** (wallet + bank combined).')
        .setColor(0x9B59B6)
        .setThumbnail('🎖️')
        .setFooter({ text: '🎖️ Tiers Help • ATIVE Casino Bot', iconURL: interaction.client.user.displayAvatarURL() })
        .setTimestamp();

    // Add each tier as a field
    for (const tier of tiers) {
        const rangeText = tier.max === Infinity ? `${tier.min.toLocaleString()}+` : `${tier.min.toLocaleString()} - ${tier.max.toLocaleString()}`;
        let benefitsText = `💰 **Range:** $${rangeText}`;
        
        if (tier.interest > 0) {
            benefitsText += `\n💸 **Interest:** ${(tier.interest * 100).toFixed(0)}% annually on bank balance`;
        }
        
        if (tier.key === 'PLATINUM') benefitsText += '\n🎮 Access to exclusive games';
        if (tier.key === 'DIAMOND') benefitsText += '\n🔝 Higher betting limits\n🖼️ GIF permissions';
        if (tier.key === 'LEGENDARY') benefitsText += '\n🏷️ Custom bot profile badge';
        if (tier.key === 'MYTHIC') benefitsText += '\n⚡ Priority support';

        embed.addFields({
            name: `${tier.emoji} ${tier.name} Tier`,
            value: benefitsText,
            inline: true
        });
    }

    embed.addFields({
        name: '📋 Important Tier Rules',
        value: '• **Tier based on total balance** (wallet + bank)\n• **Must maintain minimum** for tier benefits\n• **Interest calculated daily** on bank balance only\n• **Inactivity over 10 days** may result in downgrade\n• **Higher tiers protected** from robbery (2+ tier rule)',
        inline: false
    });

    return embed;
}

/**
 * Create security help embed
 */
function createSecurityHelp(interaction) {
    return new EmbedBuilder()
        .setTitle('🛡️ Security & Fair Play Help')
        .setDescription('**ATIVE Casino Bot is built with security, fairness, and fun as core principles.**\n\nWe ensure every player has a safe and enjoyable experience.')
        .addFields(
            {
                name: '🔐 Security Features',
                value: '**Cryptographic RNG:** All games use secure randomness\n**Anti-Exploit:** Built-in abuse detection systems\n**Audit Logging:** Every action is recorded\n**Rate Limiting:** Prevents spam and automation',
                inline: false
            },
            {
                name: '⚖️ Fair Play Guarantees',
                value: '**Transparent Odds:** All game odds are clearly stated\n**No Hidden Mechanics:** What you see is what you get\n**Equal Opportunity:** Same rules apply to everyone\n**Public Statistics:** Leaderboards show real data',
                inline: false
            },
            {
                name: '🚫 Prohibited Activities',
                value: '**Automation/Botting:** Using scripts or bots\n**Exploitation:** Abusing bugs or glitches\n**Alt Accounting:** Using multiple accounts\n**Real Money Trading:** Selling virtual currency',
                inline: false
            },
            {
                name: '⚡ Abuse Prevention',
                value: '**`/crasheco`** - Admin punishment for abusers\n**Automatic Detection:** System identifies suspicious activity\n**Cooldown Systems:** Prevent rapid-fire commands\n**Economic Penalties:** Fines for rule violations',
                inline: false
            },
            {
                name: '📊 Reporting System',
                value: '**Issues Channel:** <#1405096821512212521>\n**GitHub Issues:** Report bugs and problems\n**Admin Reports:** Contact server administrators\n**Transparency:** All actions are logged publicly',
                inline: false
            },
            {
                name: '🤝 Community Guidelines',
                value: '• **Be respectful** to other players\n• **Play fairly** - don\'t seek exploits\n• **Report issues** if you find them\n• **Have fun** - it\'s a game after all!\n• **Follow Discord TOS** at all times',
                inline: false
            }
        )
        .setColor(0x3498DB)
        .setThumbnail('🛡️')
        .setFooter({ text: '🛡️ Security Help • ATIVE Casino Bot', iconURL: interaction.client.user.displayAvatarURL() })
        .setTimestamp();
}
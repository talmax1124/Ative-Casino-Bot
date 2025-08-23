/**
 * Setup command for initial bot configuration in new servers
 * Helps administrators understand the bot and configure roles properly
 */

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const logger = require('../UTILS/logger');

// Helper function to check admin permissions
async function hasAdminPermissions(member) {
    // Check if user is server owner
    if (member.guild.ownerId === member.id) {
        return true;
    }
    
    // Check for Administrator permission
    if (member.permissions.has(PermissionFlagsBits.Administrator)) {
        return true;
    }
    
    // Check for admin roles
    const adminRoles = ['admin', 'administrator', 'owner'];
    return member.roles.cache.some(role => 
        adminRoles.some(adminRole => 
            role.name.toLowerCase().includes(adminRole)
        )
    );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Initial bot setup and configuration guide for new servers'),

    async execute(interaction) {
        // Only server administrators or owners can run setup
        if (!await hasAdminPermissions(interaction.member)) {
            const embed = new EmbedBuilder()
                .setTitle('❌ Access Denied')
                .setDescription('🚫 **Administrator permissions required**\n\nYou must be a server administrator to run the bot setup.')
                .setColor(0xE74C3C)
                .setThumbnail('https://cdn.discordapp.com/emojis/1104440894461378560.webp')
                .setFooter({ text: '🔒 Setup Command • ATIVE Casino Bot', iconURL: interaction.client.user.displayAvatarURL() });
            
            return await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        try {
            // Welcome embed
            const welcomeEmbed = new EmbedBuilder()
                .setTitle('🎰 Welcome to ATIVE Casino Bot!')
                .setDescription('🎉 **Thank you for adding ATIVE Casino Bot to your server!**\n\nI\'m here to bring the excitement of a casino right to your Discord server with fun games, an economy system, and engaging features.')
                .addFields(
                    {
                        name: '🎮 What I Can Do',
                        value: '🎰 **Casino Games**: Slots, Blackjack, Fishing, Plinko, RPS\n🏦 **Economy System**: Virtual currency, wallet & bank\n🎟️ **Weekly Lottery**: Community-driven prize pools\n🎯 **Mini Games**: Bingo, Word Chain, Duck Hunt, UNO\n⚔️ **Strategy Games**: Battleship, Chess (coming soon)\n📊 **Admin Tools**: User management, economy controls',
                        inline: false
                    },
                    {
                        name: '🛡️ Security & Fair Play',
                        value: '🔐 **Secure RNG**: Cryptographically secure randomness\n⚖️ **Fair Games**: Transparent odds and mechanics\n🚫 **Anti-Abuse**: Built-in exploit detection\n📝 **Audit Logs**: Complete transaction history',
                        inline: true
                    },
                    {
                        name: '💰 Economy Features',
                        value: '💵 **Wallet System**: Active spending money\n🏦 **Bank Account**: Secure long-term storage\n💸 **Transactions**: Send money between users\n🎁 **Daily Rewards**: Work command for earnings',
                        inline: true
                    }
                )
                .setColor(0xFFD700)
                .setThumbnail(interaction.client.user.displayAvatarURL())
                .setFooter({ text: '🎲 ATIVE Casino Bot • Step 1 of 3', iconURL: interaction.client.user.displayAvatarURL() })
                .setTimestamp();

            // Role setup embed
            const roleSetupEmbed = new EmbedBuilder()
                .setTitle('🛡️ Role Configuration Required')
                .setDescription('⚙️ **Next, let\'s set up your server roles!**\n\nFor the bot to work properly, I need you to create and configure these roles:')
                .addFields(
                    {
                        name: '👑 ADMIN Role',
                        value: '🔹 **Purpose**: Full bot control and management\n🔹 **Permissions**: All bot commands and settings\n🔹 **Recommended**: Server administrators only\n🔹 **Role Name**: `ADMIN` or `Administrator`',
                        inline: false
                    },
                    {
                        name: '🛡️ MODS Role', 
                        value: '🔹 **Purpose**: Game moderation and user assistance\n🔹 **Permissions**: Most commands except economy override\n🔹 **Recommended**: Trusted moderators\n🔹 **Role Name**: `MODS`, `Moderator`, or `Staff`',
                        inline: false
                    },
                    {
                        name: '📋 Setup Instructions',
                        value: '1️⃣ **Server Settings** → **Roles**\n2️⃣ **Create New Role** → Name it `ADMIN`\n3️⃣ **Create New Role** → Name it `MODS`\n4️⃣ **Assign roles** to appropriate members\n5️⃣ **Move roles** above my bot role\n\n⚠️ **Important**: Roles must be above the bot\'s role to work properly!',
                        inline: false
                    }
                )
                .setColor(0x3498DB)
                .setThumbnail('https://cdn.discordapp.com/emojis/1104440894461378560.webp')
                .setFooter({ text: '⚙️ Role Setup • Step 2 of 3', iconURL: interaction.client.user.displayAvatarURL() })
                .setTimestamp();

            // Getting started embed
            const gettingStartedEmbed = new EmbedBuilder()
                .setTitle('🚀 You\'re All Set!')
                .setDescription('🎉 **Configuration complete!** Here\'s what you and your members can do now:')
                .addFields(
                    {
                        name: '🎮 For Server Members',
                        value: '🎲 `/balance` - Check your casino balance\n💰 `/work` - Earn your starting money\n🎰 `/slots [amount]` - Try the slot machines\n🃏 `/blackjack [amount]` - Play blackjack\n🎣 `/fishing [amount]` - Go fishing for multipliers\n🎟️ `/lottery` - Check lottery status',
                        inline: true
                    },
                    {
                        name: '👑 For Administrators',
                        value: '💸 `/addmoney [user] [amount]` - Add money to users\n⚖️ `/setmoney [user] [amount]` - Set user balance\n📊 `/panel` - Create game panels\n🎟️ `/updatelotterypanel` - Update lottery info\n💾 `/backup` - Create database backup',
                        inline: true
                    },
                    {
                        name: '🎯 Popular Commands',
                        value: '🎰 **Slots**: Quick and easy gambling\n🃏 **Blackjack**: Classic card game\n🎣 **Fishing**: Risk vs reward gameplay\n🎟️ **Lottery**: Weekly community prizes\n⚔️ **Battleship**: Strategic PvP battles',
                        inline: false
                    },
                    {
                        name: '📚 Need Help?',
                        value: '❓ Use the **Help** button on any game\n🎮 Try `/[game]help` for detailed guides\n🛠️ Check our documentation for advanced features\n💬 Join our support server for assistance',
                        inline: false
                    }
                )
                .setColor(0x2ECC71)
                .setThumbnail(interaction.client.user.displayAvatarURL())
                .setFooter({ text: '✅ Setup Complete • ATIVE Casino Bot', iconURL: interaction.client.user.displayAvatarURL() })
                .setTimestamp();

            // Send all embeds
            await interaction.reply({ 
                embeds: [welcomeEmbed, roleSetupEmbed, gettingStartedEmbed],
                ephemeral: false // Make it public so all admins can see
            });

            // Log the setup
            logger.info(`Setup command executed by ${interaction.user.tag} in guild ${interaction.guild.name} (${interaction.guildId})`);

        } catch (error) {
            logger.error(`Error in setup command: ${error.message}`);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('🔴 Setup Error')
                .setDescription('❌ **Setup Failed**\n\nAn error occurred while running the setup command.')
                .addFields({ name: '🔧 Error Details', value: '```' + error.message + '```', inline: false })
                .setColor(0xE74C3C)
                .setThumbnail('https://cdn.discordapp.com/emojis/1104440894461378560.webp')
                .setFooter({ text: '🛠️ Setup Error • ATIVE Casino Bot', iconURL: interaction.client.user.displayAvatarURL() })
                .setTimestamp();

            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
    }
};
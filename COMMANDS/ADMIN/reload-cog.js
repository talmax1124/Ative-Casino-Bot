const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const { promisify } = require('util');

const GITHUB_REPO = 'talmax1124/ative-casino-bot';
const GITHUB_BRANCH = 'main';

const cogMappings = {
    'blackjack': ['COMMANDS/blackjack.js', 'GAMES/blackjackGame.js'],
    'slots': ['COMMANDS/slots.js', 'GAMES/slotsGame.js'],
    'roulette': ['COMMANDS/roulette.js', 'GAMES/rouletteGame.js'],
    'crash': ['COMMANDS/crash.js', 'GAMES/crashGame.js'],
    'plinko': ['COMMANDS/plinko.js', 'GAMES/plinkoGame.js'],
    'keno': ['COMMANDS/keno.js', 'GAMES/kenoGame.js'],
    'ceelo': ['COMMANDS/ceelo.js', 'GAMES/ceeloGame.js'],
    'treasure-vault': ['COMMANDS/treasure-vault.js', 'GAMES/treasureVaultGame.js'],
    'uno': ['COMMANDS/uno.js', 'GAMES/unoGame.js'],
    'multi-slots': ['COMMANDS/multi-slots.js', 'GAMES/multiSlotsGame.js'],
    'economy': ['COMMANDS/balance.js', 'COMMANDS/deposit.js', 'COMMANDS/withdraw.js', 'UTILS/PayoutManager.js'],
    'admin': ['COMMANDS/ADMIN/add-money.js', 'COMMANDS/ADMIN/remove-money.js', 'COMMANDS/ADMIN/reload-cog.js'],
    'session': ['UTILS/sessionManager.js', 'UTILS/sessionGuard.js'],
    'database': ['UTILS/database.js', 'UTILS/databaseAdapter.js'],
    'utils': ['UTILS/logger.js', 'UTILS/embedBuilder.js', 'UTILS/gameHelpers.js']
};

async function downloadFile(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
                return;
            }
            
            let data = '';
            res.setEncoding('utf8');
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

async function reloadCommand(client, filePath) {
    try {
        const fullPath = path.resolve(filePath);
        
        // Clear from require cache
        delete require.cache[fullPath];
        
        // For commands, we need to update the client's command collection
        if (filePath.includes('COMMANDS/')) {
            const commandName = path.basename(filePath, '.js');
            
            // Remove old command
            client.commands.delete(commandName);
            
            // Load new command
            const command = require(fullPath);
            if (command.data && command.execute) {
                client.commands.set(command.data.name, command);
                return `✅ Reloaded command: ${commandName}`;
            }
        }
        
        return `✅ Reloaded file: ${path.basename(filePath)}`;
    } catch (error) {
        return `❌ Failed to reload ${path.basename(filePath)}: ${error.message}`;
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reload-cog')
        .setDescription('🔄 Pull and reload a cog/module from GitHub')
        .addStringOption(option =>
            option.setName('cog')
                .setDescription('The cog/module to reload')
                .setRequired(true)
                .addChoices(
                    ...Object.keys(cogMappings).map(cog => ({ name: cog, value: cog }))
                )),

    async execute(interaction) {
        const developerId = '466050111680544798';
        
        if (interaction.user.id !== developerId) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Access Denied')
                .setDescription('Only the developer can use this command.');
            return await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        const cogName = interaction.options.getString('cog');
        const filesToReload = cogMappings[cogName];

        if (!filesToReload) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Invalid Cog')
                .setDescription(`Cog \`${cogName}\` not found.`);
            return await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        const loadingEmbed = new EmbedBuilder()
            .setColor('#ffff00')
            .setTitle('🔄 Reloading Cog')
            .setDescription(`Pulling and reloading \`${cogName}\` from GitHub...`);

        await interaction.reply({ embeds: [loadingEmbed] });

        const results = [];
        let successCount = 0;
        let failCount = 0;

        for (const filePath of filesToReload) {
            try {
                // Download from GitHub
                const githubUrl = `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/${filePath}`;
                const fileContent = await downloadFile(githubUrl);
                
                // Write to local file
                const localPath = path.join(__dirname, '../../', filePath);
                await fs.writeFile(localPath, fileContent, 'utf8');
                
                // Reload the module
                const reloadResult = await reloadCommand(interaction.client, localPath);
                results.push(reloadResult);
                
                if (reloadResult.startsWith('✅')) {
                    successCount++;
                } else {
                    failCount++;
                }
                
            } catch (error) {
                const errorMsg = `❌ Failed to reload ${filePath}: ${error.message}`;
                results.push(errorMsg);
                failCount++;
            }
        }

        const finalEmbed = new EmbedBuilder()
            .setColor(failCount === 0 ? '#00ff00' : '#ff9900')
            .setTitle(`🔄 Cog Reload Complete: ${cogName}`)
            .setDescription(results.join('\n'))
            .addFields(
                { name: '✅ Success', value: successCount.toString(), inline: true },
                { name: '❌ Failed', value: failCount.toString(), inline: true },
                { name: '📁 Total Files', value: filesToReload.length.toString(), inline: true }
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [finalEmbed] });
    }
};
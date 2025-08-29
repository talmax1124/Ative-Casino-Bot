/**
 * Multiplayer BINGO game implementation for ATIVE Casino Bot
 * Features automatic number calling, interactive cards, and multiplayer support
 * Converted from Python with full multiplayer functionality
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { secureRandomInt } = require('../UTILS/rng');
const { fmt } = require('../UTILS/common');
const { buildSessionEmbed } = require('../UTILS/gameSessionKit');

// BINGO number ranges for each column
const BINGO_RANGES = {
    'B': [1, 15],   // B column: 1-15
    'I': [16, 30],  // I column: 16-30
    'N': [31, 45],  // N column: 31-45
    'G': [46, 60],  // G column: 46-60
    'O': [61, 75]   // O column: 61-75
};

class BingoCard {
    constructor() {
        this.card = this._generateCard();
        this.marked = Array(5).fill(null).map(() => Array(5).fill(false));
        // Center space (2,2) is always free
        this.marked[2][2] = true;
    }

    _generateCard() {
        const card = Array(5).fill(null).map(() => Array(5).fill(0));
        const columns = ['B', 'I', 'N', 'G', 'O'];
        
        for (let col = 0; col < 5; col++) {
            const letter = columns[col];
            const [minVal, maxVal] = BINGO_RANGES[letter];
            
            // Generate all possible numbers for this column
            const availableNumbers = [];
            for (let i = minVal; i <= maxVal; i++) {
                availableNumbers.push(i);
            }
            
            // Shuffle using secure random
            for (let i = availableNumbers.length - 1; i > 0; i--) {
                const j = secureRandomInt(0, i + 1);
                [availableNumbers[i], availableNumbers[j]] = [availableNumbers[j], availableNumbers[i]];
            }
            
            // Take first 5 numbers and place them in the column
            for (let row = 0; row < 5; row++) {
                card[row][col] = availableNumbers[row];
            }
        }
        
        // Set center space to 0 (represents FREE)
        card[2][2] = 0;
        
        return card;
    }

    markNumber(number) {
        for (let row = 0; row < 5; row++) {
            for (let col = 0; col < 5; col++) {
                if (this.card[row][col] === number) {
                    this.marked[row][col] = true;
                    return true;
                }
            }
        }
        return false;
    }

    checkBingo() {
        const patterns = [];
        
        // Check rows
        for (let row = 0; row < 5; row++) {
            if (this.marked[row].every(marked => marked)) {
                patterns.push(`Row ${row + 1}`);
            }
        }
        
        // Check columns
        for (let col = 0; col < 5; col++) {
            if (this.marked.every(row => row[col])) {
                const columnNames = ['B', 'I', 'N', 'G', 'O'];
                patterns.push(`Column ${columnNames[col]}`);
            }
        }
        
        // Check diagonals
        if (this.marked.every((row, i) => row[i])) {
            patterns.push('Diagonal (Top-Left to Bottom-Right)');
        }
        
        if (this.marked.every((row, i) => row[4 - i])) {
            patterns.push('Diagonal (Top-Right to Bottom-Left)');
        }
        
        return patterns;
    }

    getCardDisplay(showMarked = true) {
        let display = '```\n B   I   N   G   O \n';
        display += '---+---+---+---+---\n';
        
        for (let row = 0; row < 5; row++) {
            let rowStr = '';
            for (let col = 0; col < 5; col++) {
                let cell;
                if (row === 2 && col === 2) {
                    cell = 'FREE';
                } else {
                    cell = this.card[row][col].toString().padStart(2);
                }
                
                if (showMarked && this.marked[row][col]) {
                    cell = `[${cell}]`;
                } else {
                    cell = ` ${cell} `;
                }
                
                rowStr += cell;
                if (col < 4) rowStr += '|';
            }
            display += rowStr + '\n';
            if (row < 4) display += '---+---+---+---+---\n';
        }
        
        display += '```';
        return display;
    }
}

class BingoPlayer {
    constructor(userId, username, betAmount) {
        this.userId = userId;
        this.username = username;
        this.betAmount = betAmount;
        this.card = new BingoCard();
        this.hasBingo = false;
        this.winningPatterns = [];
    }
}

class BingoGameSession {
    constructor(channelId, guildId, starterBet) {
        this.channelId = channelId;
        this.guildId = guildId;
        this.starterBet = starterBet;
        this.players = new Map();
        this.calledNumbers = [];
        this.availableNumbers = this._generateAvailableNumbers();
        this.gameActive = false;
        this.waitingForPlayers = true;
        this.currentNumber = null;
        this.winners = [];
        this.gameEnded = false;
        this.lobbyStartTime = Date.now();
        this.autoCallInterval = null;
        this.callIntervalTime = 3000; // 3 seconds
        this.gameChannel = null;
        this.mainGameInteraction = null;
        this.playerInteractions = new Map();
        this.interactiveViews = new Map();
    }

    _generateAvailableNumbers() {
        const numbers = [];
        for (let i = 1; i <= 75; i++) {
            numbers.push(i);
        }
        // Shuffle using secure random
        for (let i = numbers.length - 1; i > 0; i--) {
            const j = secureRandomInt(0, i + 1);
            [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
        }
        return numbers;
    }

    addPlayer(userId, username) {
        if (this.players.has(userId)) return false;
        if (this.players.size >= 20) return false; // Max 20 players
        if (this.gameActive) return false;
        
        this.players.set(userId, new BingoPlayer(userId, username, this.starterBet));
        return true;
    }

    removePlayer(userId) {
        if (!this.players.has(userId)) return false;
        if (this.gameActive) return false;
        
        this.players.delete(userId);
        return true;
    }

    canStartGame() {
        return this.players.size >= 2 && !this.gameActive;
    }

    startGame() {
        if (!this.canStartGame()) return false;
        
        this.gameActive = true;
        this.waitingForPlayers = false;
        this.startAutoCalling();
        return true;
    }

    startAutoCalling() {
        if (this.autoCallInterval) {
            clearInterval(this.autoCallInterval);
        }
        
        // Wait 3 seconds before starting
        setTimeout(() => {
            this.autoCallInterval = setInterval(async () => {
                if (!this.gameActive || this.gameEnded || this.availableNumbers.length === 0) {
                    this.stopAutoCalling();
                    return;
                }
                
                const number = this.callNextNumber();
                if (number === null) {
                    this.endGame();
                    return;
                }
                
                // Update all players
                await this._updateAllPlayers();
                
                // Check for winners
                const newWinners = this.checkWinners();
                if (newWinners.length > 0) {
                    this.gameEnded = true;
                    this.winners = newWinners;
                    this.stopAutoCalling();
                    await this._handleWinners(newWinners);
                }
            }, this.callIntervalTime);
        }, 3000);
    }

    stopAutoCalling() {
        if (this.autoCallInterval) {
            clearInterval(this.autoCallInterval);
            this.autoCallInterval = null;
        }
    }

    callNextNumber() {
        if (this.availableNumbers.length === 0) return null;
        
        const number = this.availableNumbers.shift();
        this.calledNumbers.push(number);
        this.currentNumber = number;
        
        return number;
    }

    checkWinners() {
        const newWinners = [];
        
        for (const player of this.players.values()) {
            if (!player.hasBingo) {
                const patterns = player.card.checkBingo();
                if (patterns.length > 0) {
                    player.hasBingo = true;
                    player.winningPatterns = patterns;
                    newWinners.push(player);
                }
            }
        }
        
        return newWinners;
    }

    async _updateAllPlayers() {
        // Update player interactions
        for (const [userId, interaction] of this.playerInteractions) {
            try {
                const player = this.players.get(userId);
                if (player) {
                    await this._sendCardUpdate(interaction, player);
                }
            } catch (error) {
                console.error(`Error updating player ${userId}:`, error);
                this.playerInteractions.delete(userId);
            }
        }
        
        // Update interactive views
        for (const [userId, view] of this.interactiveViews) {
            try {
                await view._autoUpdateCard();
            } catch (error) {
                console.error(`Error updating interactive card for ${userId}:`, error);
                this.interactiveViews.delete(userId);
            }
        }
    }

    async _sendCardUpdate(interaction, player) {
        try {
            const embed = new EmbedBuilder()
                .setTitle('<� Your BINGO Card')
                .setDescription(player.card.getCardDisplay())
                .setColor(0x0000FF);

            if (this.currentNumber) {
                const column = this.getNumberColumn(this.currentNumber);
                embed.addFields({
                    name: '=� Just Called',
                    value: `**${column}-${this.currentNumber}**`,
                    inline: true
                });
            }

            embed.addFields({
                name: '=� Game Status',
                value: `Numbers Called: ${this.calledNumbers.length}/75\nPlayers: ${this.players.size}`,
                inline: true
            });

            if (player.hasBingo) {
                embed.addFields({
                    name: '<� BINGO!',
                    value: 'You have BINGO! Waiting for game to end...',
                    inline: false
                });
            }

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error sending card update:', error);
        }
    }

    async _handleWinners(winners) {
        if (this.gameChannel) {
            try {
                const embed = new EmbedBuilder()
                    .setTitle('<� BINGO! We have winner(s)!')
                    .setColor(0xFFD700);

                if (this.currentNumber) {
                    const column = this.getNumberColumn(this.currentNumber);
                    embed.setDescription(`Winning number: **${column}-${this.currentNumber}**`);
                }

                const totalPot = this.players.size * this.starterBet;
                if (winners.length === 1) {
                    embed.addFields({
                        name: '<� Winner',
                        value: `**${winners[0].username}** wins ${fmt(totalPot)}!`,
                        inline: false
                    });
                } else {
                    const prizePerWinner = totalPot / winners.length;
                    const winnerNames = winners.map(w => `**${w.username}**`);
                    embed.addFields({
                        name: `<� ${winners.length} Winners`,
                        value: `${winnerNames.join(', ')}\nEach wins ${fmt(prizePerWinner)}!`,
                        inline: false
                    });
                }

                embed.addFields({
                    name: '=� Game Stats',
                    value: `Numbers Called: ${this.calledNumbers.length}/75\nTotal Players: ${this.players.size}`,
                    inline: false
                });

                await this.gameChannel.send({ embeds: [embed] });
            } catch (error) {
                console.error('Error handling winners:', error);
            }
        }
    }

    getNumberColumn(number) {
        for (const [letter, [min, max]] of Object.entries(BINGO_RANGES)) {
            if (number >= min && number <= max) {
                return letter;
            }
        }
        return '?';
    }

    endGame() {
        this.gameEnded = true;
        this.stopAutoCalling();
    }

    // Lobby embed using gameSessionKit
    getLobbyEmbed(notification = null) {
        const topFields = [];
        
        if (notification) {
            topFields.push({
                name: '📢 GAME NOTIFICATION',
                value: notification,
                inline: false
            });
        }

        // Player list in topFields
        if (this.players.size > 0) {
            const playerList = Array.from(this.players.values())
                .map(p => `🎯 **${p.username}**`)
                .join('\n');
            
            topFields.push({
                name: `👥 PLAYERS JOINED (${this.players.size}/20)`,
                value: playerList,
                inline: false
            });
        } else {
            topFields.push({
                name: '👥 WAITING FOR PLAYERS',
                value: 'Be the first to join this BINGO game!',
                inline: false
            });
        }

        // Game details in bankFields
        const bankFields = [
            { name: '💰 Buy-in Amount', value: fmt(this.starterBet), inline: true },
            { name: '👥 Min Players', value: '2 players', inline: true },
            { name: '👥 Max Players', value: '20 players', inline: true },
            { name: '🎯 Game Type', value: 'Classic 5×5 BINGO', inline: true },
            { name: '🏆 Prize Pool', value: fmt(this.starterBet * this.players.size), inline: true },
            { name: '📊 Status', value: this.players.size >= 2 ? '✅ Ready to Start' : '⏳ Need More Players', inline: true }
        ];

        return buildSessionEmbed({
            title: '🎯 Multiplayer BINGO Lobby',
            topFields,
            bankFields,
            stageText: 'GAME LOBBY',
            color: 0x3498DB,
            footer: 'BINGO Lobby • Join and start playing • ATIVE Casino'
        });
    }

    // Game status embed using gameSessionKit
    getGameEmbed(notification = null) {
        const topFields = [];
        
        if (notification) {
            topFields.push({
                name: '📢 GAME UPDATE',
                value: notification,
                inline: false
            });
        }

        // Current number display (most important info)
        if (this.currentNumber) {
            const column = this.getNumberColumn(this.currentNumber);
            topFields.push({
                name: '🔢 CURRENT NUMBER CALLED',
                value: `**${column}-${this.currentNumber}**`,
                inline: false
            });
        }

        // Recent numbers if available
        if (this.calledNumbers.length > 0) {
            const recent = this.calledNumbers.slice(-5);
            const recentStr = recent.map(n => `${this.getNumberColumn(n)}-${n}`).join(' • ');
            topFields.push({
                name: '📋 RECENT NUMBERS',
                value: recentStr,
                inline: false
            });
        }

        // Game stats in bankFields
        const totalPot = this.players.size * this.starterBet;
        const activePlayers = Array.from(this.players.values()).filter(p => !p.hasBingo).length;
        
        const bankFields = [
            { name: '👥 Total Players', value: this.players.size.toString(), inline: true },
            { name: '🎲 Active Players', value: activePlayers.toString(), inline: true },
            { name: '🏆 Prize Pool', value: fmt(totalPot), inline: true },
            { name: '📊 Numbers Called', value: `${this.calledNumbers.length}/75`, inline: true },
            { name: '📈 Progress', value: `${Math.round((this.calledNumbers.length / 75) * 100)}%`, inline: true },
            { name: '🎯 Game Status', value: this.winners.length > 0 ? '🏆 COMPLETED' : '🔄 IN PROGRESS', inline: true }
        ];

        // Add winners if any
        if (this.winners.length > 0) {
            const winnerNames = this.winners.map(w => w.username).join(', ');
            bankFields.push({ name: '🏆 Winners', value: winnerNames, inline: false });
        }

        return buildSessionEmbed({
            title: '🎯 Multiplayer BINGO Game',
            topFields,
            bankFields,
            stageText: this.winners.length > 0 ? 'GAME COMPLETED' : 'GAME ACTIVE',
            color: this.winners.length > 0 ? 0x27AE60 : 0x3498DB,
            footer: 'BINGO Game • Click buttons for actions • ATIVE Casino'
        });
    }

    createLobbyButtons() {
        const row1 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`bingo_join_${this.channelId}`)
                    .setLabel('Join Game')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('🎯'),
                new ButtonBuilder()
                    .setCustomId(`bingo_start_${this.channelId}`)
                    .setLabel('Start Game')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('▶️')
            );

        const row2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`bingo_leave_${this.channelId}`)
                    .setLabel('Leave Game')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🚪')
            );

        const row3 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`bingo_help_${this.channelId}`)
                    .setLabel('?')
                    .setStyle(ButtonStyle.Secondary)
            );

        return [row1, row2, row3];
    }

    createGameButtons() {
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`bingo_show_card_${this.channelId}`)
                    .setLabel('Show My Card')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('🎯'),
                new ButtonBuilder()
                    .setCustomId(`bingo_interactive_card_${this.channelId}`)
                    .setLabel('Interactive Card')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🎯'),
                new ButtonBuilder()
                    .setCustomId(`bingo_game_status_${this.channelId}`)
                    .setLabel('Game Status')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('▶️')
            );

        return [row];
    }

    static getHelpEmbed() {
        const embed = new EmbedBuilder()
            .setTitle('<� Multiplayer BINGO Guide')
            .setDescription('Learn how to play BINGO!')
            .setColor(0x0000FF);

        embed.addFields(
            {
                name: '<� Game Overview',
                value: '" **Players**: 2-20 per game\n" **Buy-in**: $50 - $10,000 (set by game starter)\n" **Goal**: Get 5 numbers in a row on your card\n" **Prize**: Winner(s) split the total pot',
                inline: false
            },
            {
                name: '=� How to Play',
                value: '1. Use `/bingo <amount>` to start a game\n2. Other players click **Join Game** to enter\n3. Click **Start Game** when 2+ players joined\n4. Click **Interactive Card** to get your clickable BINGO card\n5. Numbers are called **automatically** every 3 seconds\n6. **Click the number buttons** to mark called numbers\n7. First to get BINGO wins the pot!',
                inline: false
            },
            {
                name: '<� BINGO Card Layout',
                value: '```\n B   I   N   G   O \n---+---+---+---+---\n 1 | 16| 31| 46| 61\n 2 | 17|FREE| 47| 62\n 3 | 18| 33| 48| 63\n```\n**B**: 1-15, **I**: 16-30, **N**: 31-45, **G**: 46-60, **O**: 61-75\nCenter space is **FREE** (always marked)',
                inline: false
            },
            {
                name: '<� Winning Patterns',
                value: 'Get **5 in a row** to win:\n" **Horizontal** - Any complete row\n" **Vertical** - Any complete column\n" **Diagonal** - Corner to corner\n\n*Multiple winners split the prize equally*',
                inline: true
            },
            {
                name: '=� Prize Structure',
                value: '" **Single Winner**: Takes entire pot\n" **Multiple Winners**: Split pot equally\n" **No Winner**: Everyone refunded\n" **Example**: 4 players � $100 = $400 pot',
                inline: true
            }
        );

        embed.setFooter({ text: '=� Use /bingo <amount> to start playing! Good luck! <@' });
        return embed;
    }
}

// Interactive card view for clicking numbers
class BingoInteractiveCardView {
    constructor(game, player, interaction) {
        this.game = game;
        this.player = player;
        this.userId = player.userId;
        this.storedInteraction = interaction;
        this.interactionCreatedAt = Date.now();
        
        // Store in game for auto-updates
        game.interactiveViews.set(this.userId, this);
    }

    createCardButtons() {
        const rows = [];
        
        for (let row = 0; row < 5; row++) {
            const actionRow = new ActionRowBuilder();
            
            for (let col = 0; col < 5; col++) {
                const number = this.player.card.card[row][col];
                const isMarked = this.player.card.marked[row][col];
                const isFree = (row === 2 && col === 2);
                
                let button;
                if (isFree) {
                    button = new ButtonBuilder()
                        .setCustomId(`bingo_card_free_${this.userId}`)
                        .setLabel('FREE')
                        .setStyle(ButtonStyle.Success)
                        .setDisabled(true);
                } else {
                    const columnLetter = ['B', 'I', 'N', 'G', 'O'][col];
                    button = new ButtonBuilder()
                        .setCustomId(`bingo_card_${this.userId}_${row}_${col}_${number}`)
                        .setLabel(`${columnLetter}-${number}`)
                        .setStyle(isMarked ? ButtonStyle.Success : ButtonStyle.Secondary)
                        .setDisabled(isMarked);
                }
                
                actionRow.addComponents(button);
            }
            
            rows.push(actionRow);
        }
        
        return rows;
    }

    async handleButtonClick(interaction, row, col, number) {
        try {
            // Verify this is the right player
            if (interaction.user.id !== this.userId) {
                await interaction.reply({ content: 'L This is not your card!', flags: MessageFlags.Ephemeral });
                return;
            }

            // Check if number has been called
            if (!this.game.calledNumbers.includes(number)) {
                await interaction.reply({ 
                    content: `L Number ${number} hasn't been called yet!`, 
                    flags: MessageFlags.Ephemeral 
                });
                return;
            }

            // Check if already marked
            if (this.player.card.marked[row][col]) {
                await interaction.reply({ 
                    content: `L Number ${number} is already marked!`, 
                    flags: MessageFlags.Ephemeral 
                });
                return;
            }

            // Mark the number
            this.player.card.marked[row][col] = true;

            // Check for BINGO
            const patterns = this.player.card.checkBingo();
            if (patterns.length > 0 && !this.player.hasBingo) {
                this.player.hasBingo = true;
                this.player.winningPatterns = patterns;
                this.game.winners.push(this.player);

                if (!this.game.gameEnded) {
                    this.game.gameEnded = true;
                    this.game.stopAutoCalling();
                    await this.game._handleWinners([this.player]);
                }
            }

            // Update the card display
            await this._updateCardDisplay(interaction, ` Marked ${this.game.getNumberColumn(number)}-${number}!`);

        } catch (error) {
            console.error('Error handling button click:', error);
            await interaction.reply({ 
                content: 'L Error processing your click!', 
                ephemeral: true 
            });
        }
    }

    async _updateCardDisplay(interaction, message = null) {
        try {
            const embed = new EmbedBuilder()
                .setTitle('<� Your Interactive BINGO Card')
                .setDescription(message || 'Click the number buttons below to mark them when called!')
                .setColor(0x00FF00);

            embed.addFields({
                name: '<� Your Card',
                value: this.player.card.getCardDisplay(),
                inline: false
            });

            if (this.game.currentNumber) {
                const column = this.game.getNumberColumn(this.game.currentNumber);
                embed.addFields({
                    name: '=� Last Called',
                    value: `**${column}-${this.game.currentNumber}**`,
                    inline: true
                });
            }

            embed.addFields({
                name: '=� Game Status',
                value: `Numbers Called: ${this.game.calledNumbers.length}/75\nPlayers: ${this.game.players.size}`,
                inline: true
            });

            if (this.player.hasBingo) {
                embed.addFields({
                    name: '<� BINGO!',
                    value: `You got BINGO with: ${this.player.winningPatterns.join(', ')}`,
                    inline: false
                });
            }

            const buttons = this.createCardButtons();
            await interaction.update({ embeds: [embed], components: buttons });

        } catch (error) {
            console.error('Error updating card display:', error);
        }
    }

    async _autoUpdateCard() {
        try {
            if (!this.storedInteraction) return;

            const embed = new EmbedBuilder()
                .setTitle('<� Your Interactive BINGO Card')
                .setDescription('Click the number buttons below to mark them when called!')
                .setColor(0x00FF00);

            embed.addFields({
                name: '<� Your Card',
                value: this.player.card.getCardDisplay(),
                inline: false
            });

            if (this.game.currentNumber) {
                const column = this.game.getNumberColumn(this.game.currentNumber);
                embed.addFields({
                    name: '=� Just Called',
                    value: `**${column}-${this.game.currentNumber}**`,
                    inline: true
                });
            }

            embed.addFields({
                name: '=� Game Status',
                value: `Numbers Called: ${this.game.calledNumbers.length}/75\nPlayers: ${this.game.players.size}`,
                inline: true
            });

            if (this.player.hasBingo) {
                embed.addFields({
                    name: '<� BINGO!',
                    value: `You got BINGO with: ${this.player.winningPatterns.join(', ')}`,
                    inline: false
                });
            }

            if (this.game.gameEnded) {
                embed.setTitle('<� BINGO Game Ended');
                embed.setColor(0xFF0000);
                await this.storedInteraction.editReply({ embeds: [embed], components: [] });
            } else {
                const buttons = this.createCardButtons();
                await this.storedInteraction.editReply({ embeds: [embed], components: buttons });
            }

        } catch (error) {
            console.error('Error auto-updating card:', error);
        }
    }
}

// Game session management
const activeBingoGames = new Map();

function startBingoGame(channelId, guildId, starterBet) {
    const game = new BingoGameSession(channelId, guildId, starterBet);
    activeBingoGames.set(channelId, game);
    return game;
}

function getBingoGame(channelId) {
    return activeBingoGames.get(channelId) || null;
}

function endBingoGame(channelId) {
    const game = activeBingoGames.get(channelId);
    if (game) {
        game.stopAutoCalling();
        activeBingoGames.delete(channelId);
        return true;
    }
    return false;
}

function handleBingoAction(interaction, action, ...params) {
    const channelId = interaction.channelId;
    const userId = interaction.user.id;
    const game = getBingoGame(channelId);
    
    if (!game) {
        return { success: false, error: 'No active Bingo game found' };
    }
    
    try {
        switch (action) {
            case 'join':
                if (game.players.has(userId)) {
                    return { success: false, error: 'You are already in this game' };
                }
                if (game.gameActive) {
                    return { success: false, error: 'Cannot join while game is in progress' };
                }
                return { success: true, action: 'show_join_confirmation' };
                
            case 'start':
                if (!game.canStartGame()) {
                    return { success: false, error: 'Need at least 2 players to start' };
                }
                return { success: true, action: 'start_game' };
                
            case 'leave':
                if (!game.players.has(userId)) {
                    return { success: false, error: 'You are not in this game' };
                }
                if (game.gameActive) {
                    return { success: false, error: 'Cannot leave during active game' };
                }
                return { success: true, action: 'leave_game' };
                
            case 'show_card':
                if (!game.players.has(userId)) {
                    return { success: false, error: 'You are not in this game' };
                }
                return { success: true, action: 'show_card' };
                
            case 'interactive_card':
                if (!game.players.has(userId)) {
                    return { success: false, error: 'You are not in this game' };
                }
                return { success: true, action: 'show_interactive_card' };
                
            case 'game_status':
                return { success: true, action: 'show_game_status' };
                
            case 'card_click':
                const [row, col, number] = params;
                if (!game.players.has(userId)) {
                    return { success: false, error: 'You are not in this game' };
                }
                return { success: true, action: 'handle_card_click', row, col, number };
                
            case 'help':
                return { success: true, action: 'show_help' };
                
            default:
                return { success: false, error: 'Invalid action' };
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
}

module.exports = {
    BingoGameSession,
    BingoPlayer,
    BingoCard,
    BingoInteractiveCardView,
    startBingoGame,
    getBingoGame,
    endBingoGame,
    handleBingoAction
};
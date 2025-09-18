const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const dbManager = require('../../UTILS/database');
const { getGuildId } = require('../../UTILS/common');
const logger = require('../../UTILS/logger');

class TicTacToeGame {
    constructor() {
        this.board = Array(9).fill(null);
        this.currentPlayer = 'X';
        this.gameOver = false;
        this.winner = null;
        this.moves = 0;
    }

    makeMove(position, player) {
        if (this.board[position] || this.gameOver) {
            return false;
        }
        
        this.board[position] = player;
        this.moves++;
        
        if (this.checkWinner()) {
            this.gameOver = true;
            this.winner = player;
        } else if (this.moves === 9) {
            this.gameOver = true;
            this.winner = 'tie';
        } else {
            this.currentPlayer = this.currentPlayer === 'X' ? 'O' : 'X';
        }
        
        return true;
    }

    checkWinner() {
        const winPatterns = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
            [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
            [0, 4, 8], [2, 4, 6] // Diagonals
        ];

        return winPatterns.some(pattern => {
            const [a, b, c] = pattern;
            return this.board[a] && this.board[a] === this.board[b] && this.board[a] === this.board[c];
        });
    }

    getBoardDisplay() {
        return this.board.map((cell, index) => {
            return cell || (index + 1).toString();
        });
    }

    createButtons() {
        const rows = [];
        for (let i = 0; i < 3; i++) {
            const row = new ActionRowBuilder();
            for (let j = 0; j < 3; j++) {
                const position = i * 3 + j;
                const cell = this.board[position];
                
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`ttt_${position}`)
                        .setLabel(cell || (position + 1).toString())
                        .setStyle(cell ? ButtonStyle.Secondary : ButtonStyle.Primary)
                        .setDisabled(!!cell || this.gameOver)
                );
            }
            rows.push(row);
        }
        return rows;
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('marriage-tictactoe')
        .setDescription('Play tic tac toe with your spouse'),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);

        await interaction.deferReply();

        try {
            // Check if user is married
            const marriageData = await dbManager.getUserMarriage(userId, guildId);
            if (!marriageData.married) {
                await interaction.editReply({
                    content: 'L You must be married to play marriage games! Use `/propose` to start your love story.'
                });
                return;
            }

            const marriage = marriageData.marriage;
            const partnerId = marriage.partnerId;
            const partnerName = marriage.partnerName;

            // Create new game
            const game = new TicTacToeGame();
            
            // Store game in memory (in production, you'd want to use a database or cache)
            global.marriageGames = global.marriageGames || new Map();
            const gameId = `ttt_${marriage.id}_${Date.now()}`;
            global.marriageGames.set(gameId, {
                game,
                player1: { id: userId, name: interaction.user.displayName, symbol: 'X' },
                player2: { id: partnerId, name: partnerName, symbol: 'O' },
                marriageId: marriage.id,
                startTime: Date.now()
            });

            const embed = new EmbedBuilder()
                .setTitle('=• Marriage Tic Tac Toe')
                .setDescription(`**${interaction.user.displayName}** (X) vs **${partnerName}** (O)\n\nIt's **${interaction.user.displayName}**'s turn!`)
                .addFields({
                    name: '<® How to Play',
                    value: 'Click the numbered buttons to make your move. Get three in a row to win!',
                    inline: false
                })
                .setColor(0xFF69B4)
                .setFooter({ text: `Game ID: ${gameId}` });

            await interaction.editReply({
                content: `<@${partnerId}> You've been challenged to tic tac toe! <¯`,
                embeds: [embed],
                components: game.createButtons()
            });

        } catch (error) {
            logger.error(`Error in marriage-tictactoe command: ${error.message}`);
            await interaction.editReply({
                content: 'L An error occurred while starting the game. Please try again later.'
            });
        }
    },

    async handleButtonInteraction(interaction) {
        if (!interaction.customId.startsWith('ttt_')) return;

        const position = parseInt(interaction.customId.split('_')[1]);
        const gameId = interaction.message.embeds[0]?.footer?.text?.replace('Game ID: ', '');
        
        if (!gameId || !global.marriageGames?.has(gameId)) {
            await interaction.reply({
                content: 'L This game has expired or is invalid.',
                ephemeral: true
            });
            return;
        }

        const gameData = global.marriageGames.get(gameId);
        const { game, player1, player2, marriageId } = gameData;
        
        // Check if it's the player's turn
        const currentPlayerId = game.currentPlayer === 'X' ? player1.id : player2.id;
        if (interaction.user.id !== currentPlayerId) {
            await interaction.reply({
                content: `L It's not your turn! Wait for ${game.currentPlayer === 'X' ? player1.name : player2.name} to play.`,
                ephemeral: true
            });
            return;
        }

        // Make the move
        const moveSuccess = game.makeMove(position, game.currentPlayer);
        if (!moveSuccess) {
            await interaction.reply({
                content: 'L Invalid move! That position is already taken.',
                ephemeral: true
            });
            return;
        }

        // Update the embed
        let description = `**${player1.name}** (X) vs **${player2.name}** (O)\n\n`;
        
        if (game.gameOver) {
            if (game.winner === 'tie') {
                description += "> It's a tie! Great game!";
            } else {
                const winnerName = game.winner === 'X' ? player1.name : player2.name;
                description += `<‰ **${winnerName}** wins!`;
                
                // TODO: Award marriage XP for completing the challenge
                // This would integrate with the challenge system
            }
            
            // Clean up the game
            global.marriageGames.delete(gameId);
        } else {
            const nextPlayerName = game.currentPlayer === 'X' ? player1.name : player2.name;
            description += `It's **${nextPlayerName}**'s turn!`;
        }

        const embed = new EmbedBuilder()
            .setTitle('=• Marriage Tic Tac Toe')
            .setDescription(description)
            .setColor(game.gameOver ? (game.winner === 'tie' ? 0xFFFF00 : 0x00FF00) : 0xFF69B4)
            .setFooter({ text: game.gameOver ? 'Game Over' : `Game ID: ${gameId}` });

        await interaction.update({
            embeds: [embed],
            components: game.createButtons()
        });
    }
};
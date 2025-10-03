/**
 * Connect 4 Task Game
 * Classic Connect 4 game that requires a winner to complete the task
 */

const marriageTaskUtil = require('../MarriageTaskUtil');
const buttonUtility = require('../../UTILS/buttonUtility');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const logger = require('../../UTILS/logger');
const dbManager = require('../../UTILS/database');

class Connect4TaskGame {
    constructor() {
        this.ROWS = 6;
        this.COLS = 7;
        this.init();
    }

    init() {
        marriageTaskUtil.registerGame('week5_task2', 'connect4', {
            title: '🔴 Connect 4 Challenge',
            description: 'Play Connect 4 with your partner! Get 4 in a row to win.',
            instructions: '• Take turns dropping pieces\n• Get 4 in a row (horizontal, vertical, or diagonal)\n• Must have a winner to complete the task',
            buttonLabel: 'Start Connect 4',
            buttonEmoji: '🔴',
            color: 0xFF0000,
            requiresBothPartners: true,
            autoComplete: false,
            startHandler: this.handleStart.bind(this)
        });

        logger.info('Connect4TaskGame registered');
    }

    createEmptyBoard() {
        return Array(this.ROWS).fill(null).map(() => Array(this.COLS).fill(null));
    }

    async handleStart(interaction, session, util) {
        try {
            const marriage = session.marriage;
            const board = this.createEmptyBoard();
            const sessionId = session.sessionId;
            
            // Randomly decide who goes first
            const firstPlayer = Math.random() < 0.5 ? marriage.partner1_id : marriage.partner2_id;
            
            // Save game to database
            const query = `
                INSERT INTO marriage_connect4_games 
                (session_id, marriage_id, player1_id, player2_id, board_state, current_turn, moves_history)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `;
            
            await dbManager.databaseAdapter.executeQuery(query, [
                sessionId,
                marriage.id,
                marriage.partner1_id,
                marriage.partner2_id,
                JSON.stringify(board),
                firstPlayer,
                JSON.stringify([])
            ]);

            session.gameData = {
                board: board,
                currentTurn: firstPlayer,
                player1: marriage.partner1_id,
                player2: marriage.partner2_id,
                moves: [],
                sessionId: sessionId
            };

            await this.showGameBoard(interaction, session, util);

        } catch (error) {
            logger.error(`Error in Connect4TaskGame.handleStart: ${error.message}`);
            await util.safeReply(interaction, {
                content: '❌ Error starting Connect 4 game.',
                flags: MessageFlags.Ephemeral
            });
        }
    }

    async showGameBoard(interaction, session, util) {
        const gameData = session.gameData;
        const marriage = session.marriage;
        const currentPlayerName = gameData.currentTurn === marriage.partner1_id ? 
            marriage.partner1_name : marriage.partner2_name;
        const playerEmoji = gameData.currentTurn === marriage.partner1_id ? '🔴' : '🟡';

        // Create board display
        let boardDisplay = '';
        for (let row = 0; row < this.ROWS; row++) {
            for (let col = 0; col < this.COLS; col++) {
                const cell = gameData.board[row][col];
                if (cell === marriage.partner1_id) {
                    boardDisplay += '🔴';
                } else if (cell === marriage.partner2_id) {
                    boardDisplay += '🟡';
                } else {
                    boardDisplay += '⚫';
                }
            }
            boardDisplay += '\n';
        }
        boardDisplay += '1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣';

        const embed = new EmbedBuilder()
            .setTitle('🎮 Connect 4 Challenge')
            .setDescription(boardDisplay)
            .setColor(gameData.currentTurn === marriage.partner1_id ? 0xFF0000 : 0xFFFF00)
            .addFields(
                { name: 'Current Turn', value: `${playerEmoji} ${currentPlayerName}`, inline: true },
                { name: 'Moves', value: `${gameData.moves.length}`, inline: true }
            )
            .setFooter({ text: 'Select a column to drop your piece' });

        // Create column buttons
        const buttons = [];
        for (let col = 0; col < this.COLS; col++) {
            // Check if column is full
            const isColumnFull = gameData.board[0][col] !== null;
            
            buttons.push(
                new ButtonBuilder()
                    .setCustomId(`c4_col_${col}_${session.sessionId}`)
                    .setLabel(`${col + 1}`)
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(isColumnFull)
            );
        }

        const rows = [];
        rows.push(new ActionRowBuilder().addComponents(buttons.slice(0, 5)));
        rows.push(new ActionRowBuilder().addComponents(buttons.slice(5, 7)));

        await util.safeReply(interaction, {
            embeds: [embed],
            components: rows
        });
        
        const message = await interaction.fetchReply();

        // Setup collector
        buttonUtility.setupCollector(message, {
            filter: (i) => i.user.id === gameData.currentTurn,
            time: 300000, // 5 minutes
            max: 1,
            onCollect: async (i) => {
                const [, , col] = i.customId.split('_');
                await this.makeMove(i, session, parseInt(col), util);
            },
            onEnd: (collected, reason) => {
                if (reason === 'time' && collected.size === 0) {
                    interaction.followUp({
                        content: '⏰ Game timed out. Please restart.',
                        flags: MessageFlags.Ephemeral
                    });
                }
            }
        });
    }

    async makeMove(interaction, session, col, util) {
        const gameData = session.gameData;
        const marriage = session.marriage;
        
        // Find the lowest empty row in the column
        let row = -1;
        for (let r = this.ROWS - 1; r >= 0; r--) {
            if (gameData.board[r][col] === null) {
                row = r;
                break;
            }
        }

        if (row === -1) {
            await util.safeReply(interaction, {
                content: '❌ This column is full!',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // Place the piece
        gameData.board[row][col] = gameData.currentTurn;
        gameData.moves.push({ player: gameData.currentTurn, row, col });

        // Check for win
        const winner = this.checkWinner(gameData.board, row, col, gameData.currentTurn);
        
        if (winner) {
            await this.handleGameEnd(interaction, session, winner, util);
        } else if (this.isBoardFull(gameData.board)) {
            await this.handleDraw(interaction, session, util);
        } else {
            // Switch turns
            gameData.currentTurn = gameData.currentTurn === marriage.partner1_id ? 
                marriage.partner2_id : marriage.partner1_id;
            
            // Update database
            const updateQuery = `
                UPDATE marriage_connect4_games 
                SET board_state = ?, current_turn = ?, moves_history = ?
                WHERE session_id = ?
            `;
            
            await dbManager.databaseAdapter.executeQuery(updateQuery, [
                JSON.stringify(gameData.board),
                gameData.currentTurn,
                JSON.stringify(gameData.moves),
                gameData.sessionId
            ]);

            // Show updated board
            await this.showGameBoard(interaction, session, util);
        }
    }

    checkWinner(board, lastRow, lastCol, player) {
        // Check horizontal
        if (this.checkLine(board, lastRow, lastCol, 0, 1, player)) return player;
        // Check vertical
        if (this.checkLine(board, lastRow, lastCol, 1, 0, player)) return player;
        // Check diagonal (top-left to bottom-right)
        if (this.checkLine(board, lastRow, lastCol, 1, 1, player)) return player;
        // Check diagonal (bottom-left to top-right)
        if (this.checkLine(board, lastRow, lastCol, -1, 1, player)) return player;
        
        return null;
    }

    checkLine(board, row, col, deltaRow, deltaCol, player) {
        let count = 1;
        
        // Check in positive direction
        let r = row + deltaRow;
        let c = col + deltaCol;
        while (r >= 0 && r < this.ROWS && c >= 0 && c < this.COLS && board[r][c] === player) {
            count++;
            r += deltaRow;
            c += deltaCol;
        }
        
        // Check in negative direction
        r = row - deltaRow;
        c = col - deltaCol;
        while (r >= 0 && r < this.ROWS && c >= 0 && c < this.COLS && board[r][c] === player) {
            count++;
            r -= deltaRow;
            c -= deltaCol;
        }
        
        return count >= 4;
    }

    isBoardFull(board) {
        return board[0].every(cell => cell !== null);
    }

    async handleGameEnd(interaction, session, winnerId, util) {
        const marriage = session.marriage;
        const winnerName = winnerId === marriage.partner1_id ? 
            marriage.partner1_name : marriage.partner2_name;
        const winnerEmoji = winnerId === marriage.partner1_id ? '🔴' : '🟡';

        // Create final board display
        let boardDisplay = '';
        for (let row = 0; row < this.ROWS; row++) {
            for (let col = 0; col < this.COLS; col++) {
                const cell = session.gameData.board[row][col];
                if (cell === marriage.partner1_id) {
                    boardDisplay += '🔴';
                } else if (cell === marriage.partner2_id) {
                    boardDisplay += '🟡';
                } else {
                    boardDisplay += '⚫';
                }
            }
            boardDisplay += '\n';
        }

        const embed = new EmbedBuilder()
            .setTitle('🎉 Game Over - We Have a Winner!')
            .setDescription(boardDisplay)
            .setColor(0x00FF00)
            .addFields(
                { name: '🏆 Winner', value: `${winnerEmoji} ${winnerName}`, inline: true },
                { name: '🎮 Total Moves', value: `${session.gameData.moves.length}`, inline: true }
            );

        await util.safeReply(interaction, {
            embeds: [embed],
            components: []
        });

        // Update database
        const updateQuery = `
            UPDATE marriage_connect4_games 
            SET winner_id = ?, game_status = 'completed', completed_at = NOW()
            WHERE session_id = ?
        `;
        
        await dbManager.databaseAdapter.executeQuery(updateQuery, [winnerId, session.sessionId]);

        // Mark task as completed
        await marriageTaskUtil.markTaskCompleted(marriage.id, 18, 'both', {
            winner: winnerName,
            moves: session.gameData.moves.length,
            completedAt: new Date().toISOString()
        });

        // End session
        marriageTaskUtil.endGameSession(session.sessionId, {
            winner: winnerId
        });
    }

    async handleDraw(interaction, session, util) {
        const embed = new EmbedBuilder()
            .setTitle('🤝 Game Over - Draw!')
            .setDescription('The board is full with no winner. Please start a new game to complete the task.')
            .setColor(0xFFFF00);

        await util.safeReply(interaction, {
            embeds: [embed],
            components: []
        });

        // Update database but don't complete task (needs a winner)
        const updateQuery = `
            UPDATE marriage_connect4_games 
            SET game_status = 'abandoned', completed_at = NOW()
            WHERE session_id = ?
        `;
        
        await dbManager.databaseAdapter.executeQuery(updateQuery, [session.sessionId]);

        // End session
        marriageTaskUtil.endGameSession(session.sessionId, {
            result: 'draw'
        });
    }
}

module.exports = Connect4TaskGame;
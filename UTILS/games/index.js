/**
 * Marriage Task Games Loader
 * 
 * This file automatically loads and initializes all marriage task games.
 * To add a new game, just create the file and add it to the imports below!
 */

const logger = require('../logger');

// Import all your games here
// Week 1 Games
const TicTacToeTaskGame = require('../../marriages/games/TicTacToeTaskGame');
const PlantTreeTaskGame = require('../../marriages/games/PlantTreeTaskGame');
const PoemTaskGame = require('../../marriages/games/PoemTaskGame');
const QuizTaskGame = require('../../marriages/games/QuizTaskGame');

// Week 2 Games
const MentionTaskGame = require('../../marriages/games/MentionTaskGame');
const TriviaTaskGame = require('../../marriages/games/TriviaTaskGame');
const DateNightTaskGame = require('../../marriages/games/DateNightTaskGame');
const EmojiTaskGame = require('../../marriages/games/EmojiTaskGame');

class GameManager {
    constructor() {
        this.games = new Map();
        this.init();
    }

    init() {
        try {
            // Initialize all games
            logger.info('🎮 Loading marriage task games...');

            // Load Week 1 games
            this.ticTacToeGame = new TicTacToeTaskGame();
            this.games.set('tictactoe', this.ticTacToeGame);
            
            this.plantTreeGame = new PlantTreeTaskGame();
            this.games.set('planttree', this.plantTreeGame);
            
            this.poemGame = new PoemTaskGame();
            this.games.set('poem', this.poemGame);
            
            this.quizGame = new QuizTaskGame();
            this.games.set('quiz', this.quizGame);

            // Load Week 2 games
            this.mentionGame = new MentionTaskGame();
            this.games.set('mention', this.mentionGame);
            
            this.triviaGame = new TriviaTaskGame();
            this.games.set('trivia', this.triviaGame);
            
            this.dateNightGame = new DateNightTaskGame();
            this.games.set('datenight', this.dateNightGame);
            
            this.emojiGame = new EmojiTaskGame();
            this.games.set('emoji', this.emojiGame);

            logger.info(`✅ Loaded ${this.games.size} marriage task games`);
            
        } catch (error) {
            logger.error(`Error loading marriage task games: ${error.message}`);
        }
    }

    getGame(gameType) {
        return this.games.get(gameType);
    }

    getAllGames() {
        return Array.from(this.games.values());
    }

    // Get specific game instances for external access
    getMentionGame() {
        return this.mentionGame;
    }

    // Handle button interactions for all games
    async handleButtonInteraction(interaction) {
        const customId = interaction.customId;
        
        // Parse the custom ID to find the game and action
        // Format: {gameType}_game_{action}_{sessionId}
        const parts = customId.split('_');
        if (parts.length < 3) {
            return false; // Not a game button
        }

        const gameType = parts[0];
        const actionType = parts[2];
        const sessionId = parts.slice(3).join('_'); // Handle sessionId with underscores

        const game = this.getGame(gameType);
        if (!game || !game.handleGameAction) {
            return false; // Game not found or doesn't handle actions
        }

        try {
            await game.handleGameAction(interaction, actionType, sessionId);
            return true;
        } catch (error) {
            logger.error(`Error handling game button for ${gameType}: ${error.message}`);
            return false;
        }
    }
}

// Export singleton instance
const gameManager = new GameManager();
module.exports = gameManager;
/**
 * Marriage Game Loader
 * Loads and initializes all marriage task games
 */

const logger = require('../../UTILS/logger');
const marriageTaskTables = require('../marriageTaskTables');

class MarriageGameLoader {
    constructor() {
        this.games = [];
        this.loaded = false;
    }

    async loadAllGames() {
        if (this.loaded) return;

        try {
            // Initialize database tables first
            await marriageTaskTables.createAllTables();
            
            // Load only the pet game for now (as requested by user)
            const gameModules = [
                require('./VirtualPetTaskGame')
            ];

            // Initialize each game
            gameModules.forEach(GameClass => {
                try {
                    const game = new GameClass();
                    this.games.push(game);
                    logger.info(`Loaded marriage task game: ${GameClass.name}`);
                } catch (error) {
                    logger.error(`Failed to load game ${GameClass.name}: ${error.message}`);
                }
            });

            this.loaded = true;
            logger.info(`Successfully loaded ${this.games.length} marriage task games`);

        } catch (error) {
            logger.error(`Error loading marriage games: ${error.message}`);
        }
    }

    getLoadedGames() {
        return this.games;
    }

    isLoaded() {
        return this.loaded;
    }
}

module.exports = new MarriageGameLoader();
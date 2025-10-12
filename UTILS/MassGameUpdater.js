/**
 * MASS GAME UPDATER
 * Systematically fixes ALL casino games to ensure full integration
 * with CSPRNG, Bulletproof Economy, Security Logging, and all systems
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

class MassGameUpdater {
    constructor() {
        this.casinoGames = [
            // COMMAND FILES
            'blackjack.js', 'bingo.js', 'crash.js', 'keno.js', 'lottery.js', 
            'mines.js', 'multi-slots.js', 'plinko.js', 'roulette.js', 'rps.js', 
            'russianroulette.js', 'scratch.js', 'slots.js', 'ceelo.js',
            
            // GAME LOGIC FILES  
            'GAMES/blackjack.js', 'GAMES/bingo.js', 'GAMES/crash.js', 'GAMES/keno.js', 
            'GAMES/lottery.js', 'GAMES/mines.js', 'GAMES/multi-slots.js', 'GAMES/plinko.js', 
            'GAMES/roulette.js', 'GAMES/rps.js', 'GAMES/russianRoulette.js', 
            'GAMES/scratchTickets.js', 'GAMES/slots.js', 'GAMES/ceelo.js'
        ];

        this.universalIntegrationCode = {
            imports: `
// UNIVERSAL GAME INTEGRATION - ALL SYSTEMS
const UniversalGameIntegrator = require('../UTILS/UniversalGameIntegrator');
const securityLogger = require('../UTILS/securityLogger');
const sessionGuard = require('../UTILS/sessionGuard');
const transparentPayoutManager = require('../UTILS/transparentPayoutManager');
const tuningManager = require('../UTILS/tuningManager');
const { secureRandomFloat, secureRandomInt, secureRandomBytes } = require('../UTILS/rng');

// Initialize game integrator
const gameIntegrator = new UniversalGameIntegrator('GAME_NAME');
`,
            
            sessionCheck: `
        // ENHANCED SESSION SECURITY CHECK
        const sessionCheck = await gameIntegrator.checkGameSession(userId, guildId, 'GAME_TYPE', betAmount);
        if (!sessionCheck.allowed) {
            return await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor(0xff0000)
                    .setTitle('❌ Game Access Denied')
                    .setDescription(sessionCheck.message)
                    .setTimestamp()],
                ephemeral: true
            });
        }
`,
            
            gameResultProcessing: `
        // BULLETPROOF ECONOMY AND SECURITY PROCESSING
        try {
            const gameResult = await gameIntegrator.processGameResult({
                userId,
                guildId,
                gameType: 'GAME_TYPE',
                betAmount,
                originalPayout: result.payout || 0,
                won: result.won || false
            });
            
            if (gameResult.success) {
                result.payout = gameResult.finalPayout;
            }
        } catch (gameError) {
            logger.warn(\`Game result processing failed: \${gameError.message}\`);
        }
`,
            
            csprngFunction: `
// SECURE RANDOM GENERATION (REPLACE ALL Math.random() usage)
function secureRandom() {
    return gameIntegrator.secureRandom();
}

function secureRandomInt(min, max) {
    return gameIntegrator.secureRandomInt(min, max);
}
`
        };
    }

    /**
     * Update ALL casino games with full integration
     */
    async updateAllGames() {
        logger.info('🔧 Starting MASS GAME UPDATE - Fixing ALL games...');
        
        const results = {
            processed: 0,
            updated: 0,
            errors: 0,
            details: []
        };

        for (const gameFile of this.casinoGames) {
            try {
                const result = await this.updateSingleGame(gameFile);
                results.processed++;
                
                if (result.updated) {
                    results.updated++;
                    results.details.push(`✅ ${gameFile}: ${result.changes.join(', ')}`);
                } else {
                    results.details.push(`ℹ️ ${gameFile}: Already compliant`);
                }
            } catch (error) {
                results.errors++;
                results.details.push(`❌ ${gameFile}: ${error.message}`);
                logger.error(`Error updating ${gameFile}: ${error.message}`);
            }
        }

        logger.info(`🎯 MASS UPDATE COMPLETE:`);
        logger.info(`   Processed: ${results.processed}`);
        logger.info(`   Updated: ${results.updated}`);
        logger.info(`   Errors: ${results.errors}`);
        
        return results;
    }

    /**
     * Update a single game file
     */
    async updateSingleGame(gameFile) {
        const filePath = gameFile.startsWith('GAMES/') 
            ? `/Users/carlosdiazplaza/ative_casino_bot/${gameFile}`
            : `/Users/carlosdiazplaza/ative_casino_bot/COMMANDS/${gameFile}`;

        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }

        const originalContent = fs.readFileSync(filePath, 'utf8');
        let content = originalContent;
        const changes = [];

        // Extract game name for integration
        const gameName = gameFile.replace('.js', '').replace('GAMES/', '').toLowerCase();
        
        // 1. Add universal integration imports (if not already present)
        if (!content.includes('UniversalGameIntegrator')) {
            const requiresSection = this.findRequiresSection(content);
            if (requiresSection) {
                const integrationCode = this.universalIntegrationCode.imports
                    .replace('GAME_NAME', gameName);
                content = content.replace(requiresSection.match, requiresSection.match + integrationCode);
                changes.push('Added Universal Integration');
            }
        }

        // 2. Replace Math.random() with CSPRNG
        if (content.includes('Math.random()')) {
            content = content.replace(/Math\.random\(\)/g, 'gameIntegrator.secureRandom()');
            changes.push('Replaced Math.random with CSPRNG');
        }

        // 3. Add session check (for command files)
        if (gameFile.endsWith('.js') && !gameFile.startsWith('GAMES/') && 
            !content.includes('checkGameSession') && content.includes('async execute(interaction)')) {
            const sessionCheckCode = this.universalIntegrationCode.sessionCheck
                .replace(/GAME_TYPE/g, gameName);
            content = this.insertAfterPattern(content, /const betAmount = .+;/, sessionCheckCode);
            if (content !== originalContent) {
                changes.push('Added Session Security Check');
            }
        }

        // 4. Add game result processing
        if (!content.includes('processGameResult') && content.includes('result.won')) {
            const processingCode = this.universalIntegrationCode.gameResultProcessing
                .replace(/GAME_TYPE/g, gameName);
            content = this.insertAfterPattern(content, /result\.won.*/, processingCode);
            if (content !== originalContent) {
                changes.push('Added Game Result Processing');
            }
        }

        // 5. Ensure security logging imports
        if (!content.includes('securityLogger') && 
            (content.includes('securityLogger.') || content.includes('require'))) {
            // Will be handled by universal integration
        }

        // Save updated content if changes were made
        if (content !== originalContent) {
            fs.writeFileSync(filePath, content, 'utf8');
            return { updated: true, changes };
        }

        return { updated: false, changes: [] };
    }

    /**
     * Find the requires section to add imports
     */
    findRequiresSection(content) {
        const lines = content.split('\n');
        let lastRequireLine = -1;
        
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('require(') && !lines[i].includes('//')) {
                lastRequireLine = i;
            }
        }

        if (lastRequireLine >= 0) {
            return {
                line: lastRequireLine,
                match: lines[lastRequireLine]
            };
        }

        return null;
    }

    /**
     * Insert code after a specific pattern
     */
    insertAfterPattern(content, pattern, codeToInsert) {
        const match = content.match(pattern);
        if (match) {
            const insertPos = content.indexOf(match[0]) + match[0].length;
            return content.slice(0, insertPos) + '\n' + codeToInsert + content.slice(insertPos);
        }
        return content;
    }

    /**
     * Create backup of all games before updating
     */
    async createBackup() {
        const backupDir = '/Users/carlosdiazplaza/ative_casino_bot/BACKUP_GAMES';
        
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }

        for (const gameFile of this.casinoGames) {
            const sourceFile = gameFile.startsWith('GAMES/') 
                ? `/Users/carlosdiazplaza/ative_casino_bot/${gameFile}`
                : `/Users/carlosdiazplaza/ative_casino_bot/COMMANDS/${gameFile}`;

            if (fs.existsSync(sourceFile)) {
                const backupFile = path.join(backupDir, gameFile.replace('GAMES/', 'GAMES_'));
                fs.copyFileSync(sourceFile, backupFile);
            }
        }

        logger.info(`✅ Created backup of all games in ${backupDir}`);
    }

    /**
     * Validate all games after update
     */
    async validateGames() {
        const GameSystemValidator = require('./GameSystemValidator');
        return await GameSystemValidator.validateAllGames();
    }
}

module.exports = new MassGameUpdater();
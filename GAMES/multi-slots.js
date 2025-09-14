/**
 * Multi-Slots (Matrix Slots) game mechanics for ATIVE Casino Bot
 * 3x3 matrix slots with multiple paylines and buffalo bonus rounds
 */

const { buildSessionEmbed, buildButtons } = require('../UTILS/gameSessionKit');
const { fmt, clearActiveGame, setActiveGame } = require('../UTILS/common');
const { TimeoutManager } = require('../UTILS/gameUtils');
const { 
    spinMatrixSlots, 
    calculateMatrixPayout, 
    createMatrixDisplay, 
    createMatrixImage,
    createSpinningMatrixGIF,
    MATRIX_SYMBOLS 
} = require('./slots');
const dbManager = require('../UTILS/database');
const logger = require('../UTILS/logger');

// Active bonus games storage
const activeBonusGames = new Map();

/**
 * Buffalo Bonus Game Session
 */
class BuffaloBonusSession {
    constructor(userId, betAmount, userBalance, guildId, spinsLeft = 5) {
        this.userId = userId;
        this.originalBetAmount = betAmount;
        this.bonusBetAmount = betAmount * 2.2; // 2.2x multiplier for bonus spins - balanced fun
        this.userBalance = userBalance;
        this.guildId = guildId;
        this.spinsLeft = spinsLeft;
        this.totalBonusWinnings = 0;
        this.ended = false;
    }

    async spinBonus() {
        this.spinsLeft--;
        const matrix = spinMatrixSlots();
        const result = calculateMatrixPayout(matrix, this.bonusBetAmount);
        
        if (result.won) {
            this.totalBonusWinnings += result.payout;
        }

        if (this.spinsLeft <= 0) {
            this.ended = true;
        }

        return { matrix, result };
    }

    createBonusEmbed(matrix, result, user) {
        const topFields = [];
        
        // Matrix display (raw; formatting handled by buildSessionEmbed)
        const matrixDisplay = createMatrixDisplay(matrix);
        topFields.push({
            name: '🎲 BONUS MATRIX RESULT',
            value: matrixDisplay,
            inline: false
        });

        if (result.won) {
            topFields.push({
                name: '🏆 BONUS WIN',
                value: result.type,
                inline: false
            });
        }

        // Banking fields
        const bankFields = [
            { name: '🔄 Bonus Spins Left', value: this.spinsLeft.toString(), inline: true },
            { name: '💰 Bonus Bet (2.2x)', value: fmt(this.bonusBetAmount), inline: true },
            { name: '💎 Total Bonus Win', value: fmt(this.totalBonusWinnings), inline: true }
        ];

        if (result.won) {
            bankFields.push(
                { name: '💵 This Spin', value: fmt(result.payout), inline: true }
            );
        }

        const stageText = this.ended ? 'BONUS COMPLETE!' : 'BONUS ROUND';
        const color = result.won ? 0xFFD700 : (this.ended ? 0x00ff00 : 0xFF6600);

        return buildSessionEmbed({
            title: `🎰 ${user.displayName}'s Buffalo Bonus`,
            topFields,
            bankFields,
            stageText,
            color,
            footer: this.ended ? `Total bonus winnings: ${fmt(this.totalBonusWinnings)}` : 'Click Spin for your bonus round!'
        });
    }

    createBonusButtons() {
        if (this.ended) return [];

        return buildButtons(`bonus-${this.userId}`, [
            { id: 'spin', label: '🦬 Spin Bonus', style: 1 } // ButtonStyle.Success = 1
        ]);
    }
}

/**
 * Create matrix slots result embed
 */
function createMatrixEmbed(user, matrix, result, betAmount, userBalance, buffaloBonus = false) {
    const topFields = [];
    
    // Matrix display (raw; formatting handled by buildSessionEmbed)
    const matrixDisplay = createMatrixDisplay(matrix);
    topFields.push({
        name: '🎲 MATRIX RESULT (3x3)',
        value: matrixDisplay,
        inline: false
    });

    if (result.won) {
        topFields.push({
            name: '🏆 WINNING LINES',
            value: result.type,
            inline: false
        });
    }

    if (buffaloBonus) {
        topFields.push({
            name: '🦬 BUFFALO BONUS TRIGGERED!',
            value: '**5 FREE SPINS with 2.2x multiplier!**',
            inline: false
        });
    }

    // Banking fields
    const bankFields = [
        { name: '💰 Bet', value: fmt(betAmount), inline: true },
        { name: '💵 Wallet', value: fmt(userBalance.wallet), inline: true },
        { name: '🏦 Bank', value: fmt(userBalance.bank), inline: true }
    ];

    if (result.won) {
        bankFields.splice(1, 0, 
            { name: '🎯 Multiplier', value: `x${result.multiplier.toFixed(2)}`, inline: true },
            { name: '💸 Payout', value: fmt(result.payout), inline: true }
        );
    }

    // Determine game state and color
    let stageText = '';
    let color = 0x00ff00;

    if (buffaloBonus) {
        stageText = 'BUFFALO BONUS!';
        color = 0xFFD700; // Gold for buffalo
    } else if (result.won) {
        if (result.multiplier >= 100) {
            stageText = 'INCREDIBLE WIN!';
            color = 0xFFD700;
        } else if (result.multiplier >= 50) {
            stageText = 'AMAZING WIN!';
            color = 0x00ff00;
        } else {
            stageText = 'WINNER!';
            color = 0x00ff00;
        }
    } else {
        stageText = 'TRY AGAIN';
        color = 0xff0000;
    }

    return buildSessionEmbed({
        title: `🎰 ${user.displayName}'s Matrix Slots`,
        topFields,
        bankFields,
        stageText,
        color,
        footer: result.won ? result.type : 'Try the 3x3 matrix for better odds!'
    });
}

/**
 * Handle buffalo bonus start
 */
async function handleBuffaloBonusStart(interaction, userId, betAmount, finalBalance, guildId) {
    try {
        // Create bonus session
        const bonusSession = new BuffaloBonusSession(userId, betAmount, finalBalance, guildId);
        activeBonusGames.set(userId, bonusSession);

        // Set timeout for bonus game
        TimeoutManager.setTimeout(userId, 300, () => {
            if (activeBonusGames.has(userId)) {
                activeBonusGames.delete(userId);
            }
        });

        return true;
    } catch (error) {
        logger.error(`Error starting buffalo bonus: ${error.message}`);
        return false;
    }
}

/**
 * Handle buffalo bonus spin
 */
async function handleBuffaloBonusSpin(interaction) {
    const userId = interaction.user.id;
    const bonusSession = activeBonusGames.get(userId);

    if (!bonusSession) {
        return {
            success: false,
            error: 'No active buffalo bonus found.'
        };
    }

    try {
        const { matrix, result } = await bonusSession.spinBonus();
        
        // If bonus won, add to user balance
        if (result.won) {
            await dbManager.updateUserBalance(userId, bonusSession.guildId, result.payout, 0);
        }

        // Get updated balance
        const updatedBalance = await dbManager.getUserBalance(userId, bonusSession.guildId);
        bonusSession.userBalance = updatedBalance;

        // PHASE 1: Generate and show animated bonus GIF
        const animatedGIF = await createSpinningMatrixGIF(matrix);

        // Create bonus embed for animation
        const bonusEmbed = bonusSession.createBonusEmbed(matrix, result, interaction.user);
        const bonusButtons = bonusSession.createBonusButtons();

        const updateData = { 
            embeds: [bonusEmbed], 
            components: bonusButtons.length > 0 ? [bonusButtons] : [],
            attachments: []
        };

        if (animatedGIF) {
            updateData.files = [{ attachment: animatedGIF, name: 'bonus-animation.gif' }];
            bonusEmbed.setImage('attachment://bonus-animation.gif');
        }

        // Show the animated version first
        await interaction.editReply(updateData);

        // PHASE 2: After animation, show static result (but only if game hasn't ended)
        if (!bonusSession.ended) {
            setTimeout(async () => {
                try {
                    const staticImage = await createMatrixImage(matrix, result.winningLines || [], result.won);
                    
                    const finalBonusEmbed = bonusSession.createBonusEmbed(matrix, result, interaction.user);
                    const finalBonusButtons = bonusSession.createBonusButtons();

                    const finalUpdateData = { 
                        embeds: [finalBonusEmbed], 
                        components: finalBonusButtons.length > 0 ? [finalBonusButtons] : [],
                        attachments: []
                    };

                    if (staticImage) {
                        finalUpdateData.files = [{ attachment: staticImage, name: 'bonus-result.png' }];
                        finalBonusEmbed.setImage('attachment://bonus-result.png');
                    }

                    await interaction.editReply(finalUpdateData);
                } catch (error) {
                    logger.error(`Error updating bonus to static result: ${error.message}`);
                }
            }, 13000); // Wait for matrix animation to complete
        }

        // Check if bonus ended and clean up
        const bonusEnded = bonusSession.ended;
        if (bonusEnded) {
            activeBonusGames.delete(userId);
            clearActiveGame(userId);
            TimeoutManager.clearTimeout(userId);
        }

        return {
            success: true,
            bonusEnded,
            totalBonusWinnings: bonusSession.totalBonusWinnings,
            guildId: bonusSession.guildId
        };

    } catch (error) {
        logger.error(`Error in buffalo bonus spin: ${error.message}`);
        return {
            success: false,
            error: 'An error occurred during the bonus spin.'
        };
    }
}

/**
 * Get active bonus session
 */
function getActiveBonusSession(userId) {
    return activeBonusGames.get(userId);
}

/**
 * Clear bonus session
 */
function clearBonusSession(userId) {
    if (activeBonusGames.has(userId)) {
        activeBonusGames.delete(userId);
        clearActiveGame(userId);
        TimeoutManager.clearTimeout(userId);
    }
}

module.exports = {
    BuffaloBonusSession,
    createMatrixEmbed,
    handleBuffaloBonusStart,
    handleBuffaloBonusSpin,
    getActiveBonusSession,
    clearBonusSession,
    activeBonusGames
};

/**
 * Dice Renderer Utility
 * Renders Yahtzee dice using Canvas with keep/release states
 */

const { createCanvas, loadImage } = require('canvas');
const path = require('path');
const fs = require('fs');
const logger = require('./logger');

class DiceRenderer {
    constructor() {
        this.diceImages = {};
        this.loadDiceImages();
    }

    async loadDiceImages() {
        try {
            const diceDir = path.join(__dirname, '..', 'assets', 'dice_faces');
            
            // Load each die face image
            for (let i = 1; i <= 6; i++) {
                const imagePath = path.join(diceDir, `${i}_dot${i === 1 ? '' : 's'}.png`);
                if (fs.existsSync(imagePath)) {
                    this.diceImages[i] = await loadImage(imagePath);
                } else {
                    logger.warn(`Dice image not found: ${imagePath}`);
                }
            }
            
            logger.info('Dice images loaded successfully');
        } catch (error) {
            logger.error(`Error loading dice images: ${error.message}`);
        }
    }

    /**
     * Render dice array with keep states
     */
    async renderDice(diceValues, keptStates = [false, false, false, false, false]) {
        if (!diceValues || diceValues.length !== 5) {
            throw new Error('Invalid dice values - must be array of 5 numbers');
        }

        // Canvas dimensions
        const dieSize = 100;
        const spacing = 20;
        const margin = 30;
        const keptAreaHeight = 40;
        const totalWidth = (dieSize * 5) + (spacing * 4) + (margin * 2);
        const totalHeight = dieSize + keptAreaHeight + (margin * 2);

        const canvas = createCanvas(totalWidth, totalHeight);
        const ctx = canvas.getContext('2d');

        // Background
        ctx.fillStyle = '#1a1a1a'; // Dark casino background
        ctx.fillRect(0, 0, totalWidth, totalHeight);

        // Draw title
        ctx.fillStyle = '#ffd700'; // Gold color
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('YAHTZEE DICE', totalWidth / 2, 20);

        // Draw each die
        for (let i = 0; i < 5; i++) {
            const x = margin + (i * (dieSize + spacing));
            const y = margin + 25;
            
            await this.drawSingleDie(ctx, diceValues[i], x, y, dieSize, keptStates[i]);
        }

        // Draw kept/roll indicator
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        
        for (let i = 0; i < 5; i++) {
            const x = margin + (i * (dieSize + spacing)) + (dieSize / 2);
            const y = totalHeight - 10;
            
            const status = keptStates[i] ? 'KEEP' : 'ROLL';
            const color = keptStates[i] ? '#00ff00' : '#ff6b6b';
            
            ctx.fillStyle = color;
            ctx.fillText(status, x, y);
        }

        return canvas.toBuffer('image/png');
    }

    /**
     * Draw a single die with keep state
     */
    async drawSingleDie(ctx, value, x, y, size, isKept = false) {
        // Draw background for die
        if (isKept) {
            // Kept dice have a green glow
            ctx.shadowColor = '#00ff00';
            ctx.shadowBlur = 10;
            ctx.fillStyle = '#2a4a2a'; // Darker green background
        } else {
            // Regular dice
            ctx.shadowColor = 'rgba(0,0,0,0.5)';
            ctx.shadowBlur = 5;
            ctx.fillStyle = '#ffffff';
        }

        // Draw die background
        ctx.fillRect(x, y, size, size);
        ctx.shadowBlur = 0; // Reset shadow

        // Draw die border
        ctx.strokeStyle = isKept ? '#00ff00' : '#333333';
        ctx.lineWidth = isKept ? 3 : 2;
        ctx.strokeRect(x, y, size, size);

        // Draw dice image if available
        if (this.diceImages[value]) {
            // Scale and center the dice image
            const padding = 5;
            ctx.drawImage(
                this.diceImages[value], 
                x + padding, 
                y + padding, 
                size - (padding * 2), 
                size - (padding * 2)
            );
        } else {
            // Fallback: draw dots manually
            this.drawDiceDots(ctx, value, x, y, size);
        }

        // Draw lock icon for kept dice
        if (isKept) {
            this.drawLockIcon(ctx, x + size - 20, y + 5);
        }
    }

    /**
     * Fallback method to draw dice dots if images aren't available
     */
    drawDiceDots(ctx, value, x, y, size) {
        ctx.fillStyle = '#000000';
        const dotSize = 8;
        const centerX = x + size / 2;
        const centerY = y + size / 2;
        const offset = size / 4;

        // Define dot positions for each number
        const dotPatterns = {
            1: [[0, 0]], // center
            2: [[-1, -1], [1, 1]], // diagonal
            3: [[-1, -1], [0, 0], [1, 1]], // diagonal + center
            4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], // corners
            5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], // corners + center
            6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] // two columns
        };

        const pattern = dotPatterns[value] || [];
        
        pattern.forEach(([dx, dy]) => {
            const dotX = centerX + (dx * offset);
            const dotY = centerY + (dy * offset);
            
            ctx.beginPath();
            ctx.arc(dotX, dotY, dotSize / 2, 0, 2 * Math.PI);
            ctx.fill();
        });
    }

    /**
     * Draw a small lock icon
     */
    drawLockIcon(ctx, x, y) {
        ctx.fillStyle = '#ffd700'; // Gold lock
        ctx.fillRect(x + 2, y + 4, 8, 6); // Lock body
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x + 6, y + 3, 3, Math.PI, 0, false); // Lock shackle
        ctx.stroke();
    }

    /**
     * Render scorecard as an image
     */
    async renderScorecard(scorecard, potentialScores = {}) {
        const width = 400;
        const height = 600;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // Background
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, width, height);

        // Title
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('YAHTZEE SCORECARD', width / 2, 30);

        // Draw upper section
        let yPos = 60;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('UPPER SECTION', 20, yPos);

        yPos += 30;
        const upperCategories = [
            { key: 'ones', name: 'Ones', multiplier: '× 1' },
            { key: 'twos', name: 'Twos', multiplier: '× 2' },
            { key: 'threes', name: 'Threes', multiplier: '× 3' },
            { key: 'fours', name: 'Fours', multiplier: '× 4' },
            { key: 'fives', name: 'Fives', multiplier: '× 5' },
            { key: 'sixes', name: 'Sixes', multiplier: '× 6' }
        ];

        ctx.font = '14px Arial';
        upperCategories.forEach(category => {
            const score = scorecard.scores[category.key];
            const potential = potentialScores[category.key];
            
            ctx.fillStyle = '#ffffff';
            ctx.fillText(`${category.name}`, 20, yPos);
            
            // Score or potential score
            if (score !== null) {
                ctx.fillStyle = '#00ff00';
                ctx.textAlign = 'right';
                ctx.fillText(`${score}`, width - 20, yPos);
            } else if (potential !== undefined) {
                ctx.fillStyle = '#ffaa00';
                ctx.textAlign = 'right';
                ctx.fillText(`(${potential})`, width - 20, yPos);
            }
            
            ctx.textAlign = 'left';
            yPos += 25;
        });

        // Upper section total and bonus
        yPos += 10;
        ctx.strokeStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(20, yPos);
        ctx.lineTo(width - 20, yPos);
        ctx.stroke();

        yPos += 20;
        ctx.fillStyle = '#ffd700';
        ctx.fillText('Upper Section Total', 20, yPos);
        ctx.textAlign = 'right';
        ctx.fillText(`${scorecard.upperSectionScore}`, width - 20, yPos);

        yPos += 25;
        ctx.fillText('Bonus (63+ = 35)', 20, yPos);
        ctx.textAlign = 'right';
        ctx.fillText(`${scorecard.upperSectionBonus}`, width - 20, yPos);
        ctx.textAlign = 'left';

        // Lower section
        yPos += 40;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px Arial';
        ctx.fillText('LOWER SECTION', 20, yPos);

        yPos += 30;
        const lowerCategories = [
            { key: 'three_of_a_kind', name: '3 of a Kind', desc: 'Sum of all dice' },
            { key: 'four_of_a_kind', name: '4 of a Kind', desc: 'Sum of all dice' },
            { key: 'full_house', name: 'Full House', desc: '25 points' },
            { key: 'small_straight', name: 'Small Straight', desc: '30 points' },
            { key: 'large_straight', name: 'Large Straight', desc: '40 points' },
            { key: 'yahtzee', name: 'YAHTZEE', desc: '50 points' },
            { key: 'chance', name: 'Chance', desc: 'Sum of all dice' }
        ];

        ctx.font = '14px Arial';
        lowerCategories.forEach(category => {
            const score = scorecard.scores[category.key];
            const potential = potentialScores[category.key];
            
            ctx.fillStyle = '#ffffff';
            ctx.fillText(`${category.name}`, 20, yPos);
            
            // Score or potential score
            if (score !== null) {
                ctx.fillStyle = '#00ff00';
                ctx.textAlign = 'right';
                ctx.fillText(`${score}`, width - 20, yPos);
            } else if (potential !== undefined) {
                ctx.fillStyle = '#ffaa00';
                ctx.textAlign = 'right';
                ctx.fillText(`(${potential})`, width - 20, yPos);
            }
            
            ctx.textAlign = 'left';
            yPos += 25;
        });

        // Total score
        yPos += 20;
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(20, yPos);
        ctx.lineTo(width - 20, yPos);
        ctx.stroke();

        yPos += 25;
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 18px Arial';
        ctx.fillText('TOTAL SCORE', 20, yPos);
        ctx.textAlign = 'right';
        ctx.fillText(`${scorecard.totalScore}`, width - 20, yPos);

        // Bonus Yahtzees
        if (scorecard.bonusYahtzees.length > 0) {
            yPos += 30;
            ctx.textAlign = 'left';
            ctx.font = '14px Arial';
            ctx.fillText(`Bonus Yahtzees: ${scorecard.bonusYahtzees.length}`, 20, yPos);
        }

        return canvas.toBuffer('image/png');
    }
}

// Export singleton instance
module.exports = new DiceRenderer();
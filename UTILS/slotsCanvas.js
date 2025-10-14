/**
 * Slots Canvas Image Generation for ATIVE Casino Bot
 * Creates visual slot machine representations
 */

const { createCanvas } = require('canvas');
const logger = require('./logger');

/**
 * Create a visual representation of a slots game
 */
function createSlotsImage(reels, paylines = null, winAmount = 0, mode = 'standard') {
    try {
        const width = 600;
        const height = 400;
        const slotWidth = 120;
        const slotHeight = 100;
        const padding = 30;
        
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');
        
        // Background - casino theme
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, '#1a1a2e');
        gradient.addColorStop(1, '#16213e');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
        
        // Machine frame
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 6;
        ctx.strokeRect(20, 60, width - 40, height - 120);
        
        // Title
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 28px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('🎰 SLOTS 🎰', width / 2, 40);
        
        // Mode indicator
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 16px Arial';
        ctx.fillText(`Mode: ${mode.toUpperCase()}`, width / 2, height - 20);
        
        // Draw reels
        const startX = padding + 40;
        const startY = 80;
        
        reels.forEach((reel, reelIndex) => {
            reel.forEach((symbol, symbolIndex) => {
                const x = startX + (reelIndex * (slotWidth + 10));
                const y = startY + (symbolIndex * (slotHeight + 5));
                
                // Slot background
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(x, y, slotWidth, slotHeight);
                
                // Slot border
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 2;
                ctx.strokeRect(x, y, slotWidth, slotHeight);
                
                // Symbol
                const symbolEmoji = getSymbolEmoji(symbol);
                ctx.fillStyle = '#000000';
                ctx.font = 'bold 48px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(symbolEmoji, x + slotWidth / 2, y + slotHeight / 2 + 15);
                
                // Symbol name
                ctx.fillStyle = '#666666';
                ctx.font = 'bold 12px Arial';
                ctx.fillText(symbol.toUpperCase(), x + slotWidth / 2, y + slotHeight - 5);
            });
        });
        
        // Win indication
        if (winAmount > 0) {
            // Win overlay
            ctx.fillStyle = 'rgba(255, 215, 0, 0.3)';
            ctx.fillRect(startX - 10, startY - 10, (slotWidth + 10) * reels.length, (slotHeight + 5) * reels[0].length + 10);
            
            // Win text
            ctx.fillStyle = '#00FF00';
            ctx.font = 'bold 24px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(`🎉 WIN: ${winAmount.toLocaleString()}`, width / 2, height - 50);
        }
        
        // Paylines visualization (if provided)
        if (paylines && paylines.length > 0) {
            ctx.strokeStyle = '#FF6B6B';
            ctx.lineWidth = 3;
            ctx.setLineDash([5, 5]);
            
            paylines.forEach((line, index) => {
                ctx.beginPath();
                line.forEach((pos, reelIndex) => {
                    const x = startX + (reelIndex * (slotWidth + 10)) + slotWidth / 2;
                    const y = startY + (pos * (slotHeight + 5)) + slotHeight / 2;
                    
                    if (reelIndex === 0) {
                        ctx.moveTo(x, y);
                    } else {
                        ctx.lineTo(x, y);
                    }
                });
                ctx.stroke();
            });
            
            ctx.setLineDash([]); // Reset line dash
        }
        
        return canvas.toBuffer('image/png');
        
    } catch (error) {
        logger.error(`Error creating slots image: ${error.message}`);
        return null;
    }
}

/**
 * Get emoji representation of slot symbols
 */
function getSymbolEmoji(symbol) {
    const symbolMap = {
        'cherry': '🍒',
        'lemon': '🍋',
        'orange': '🍊',
        'plum': '🍇',
        'bell': '🔔',
        'bar': '⬛',
        'seven': '7️⃣',
        'diamond': '💎',
        'star': '⭐',
        'crown': '👑',
        'jackpot': '💰',
        'bonus': '🎁',
        'wild': '🃏',
        'scatter': '⚡',
        'buffalo': '🐃',
        'watermelon': '🍉',
        'grapes': '🍇'
    };
    
    return symbolMap[symbol.toLowerCase()] || '❓';
}

/**
 * Create animated slots reel (simplified)
 */
function createSlotsAnimation(finalReels, steps = 5) {
    const frames = [];
    
    for (let step = 0; step < steps; step++) {
        // Create intermediate reels with random symbols
        const animReels = finalReels.map(reel => {
            return reel.map(() => {
                const symbols = ['cherry', 'lemon', 'orange', 'plum', 'bell', 'bar', 'seven'];
                return symbols[Math.floor(Math.random() * symbols.length)];
            });
        });
        
        // On final step, use actual result
        const reelsToUse = step === steps - 1 ? finalReels : animReels;
        const frameImage = createSlotsImage(reelsToUse);
        
        if (frameImage) {
            frames.push(frameImage);
        }
    }
    
    return frames;
}

/**
 * Create slots result overlay
 */
function createSlotsResultOverlay(winAmount, totalBet, mode) {
    try {
        const width = 600;
        const height = 200;
        
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');
        
        // Semi-transparent background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(0, 0, width, height);
        
        // Result text
        let resultText = '';
        let resultColor = '#FFFFFF';
        
        if (winAmount > totalBet * 10) {
            resultText = '🎰 MEGA WIN! 🎰';
            resultColor = '#FFD700';
        } else if (winAmount > totalBet * 5) {
            resultText = '🎉 BIG WIN! 🎉';
            resultColor = '#00FF00';
        } else if (winAmount > 0) {
            resultText = '✨ WIN! ✨';
            resultColor = '#90EE90';
        } else {
            resultText = '💸 Try Again';
            resultColor = '#FF6B6B';
        }
        
        ctx.fillStyle = resultColor;
        ctx.font = 'bold 36px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(resultText, width / 2, 70);
        
        // Amount
        if (winAmount > 0) {
            ctx.fillStyle = '#FFD700';
            ctx.font = 'bold 28px Arial';
            ctx.fillText(`+${winAmount.toLocaleString()}`, width / 2, 120);
        }
        
        // Mode
        ctx.fillStyle = '#CCCCCC';
        ctx.font = 'bold 16px Arial';
        ctx.fillText(`${mode.toUpperCase()} MODE`, width / 2, 160);
        
        return canvas.toBuffer('image/png');
        
    } catch (error) {
        logger.error(`Error creating slots result overlay: ${error.message}`);
        return null;
    }
}

module.exports = {
    createSlotsImage,
    createSlotsAnimation,
    createSlotsResultOverlay,
    getSymbolEmoji
};
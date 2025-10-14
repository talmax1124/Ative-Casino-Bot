/**
 * Universal Game Canvas Image Generation for ATIVE Casino Bot
 * Creates visual representations for various casino games
 */

const { createCanvas } = require('canvas');
const logger = require('./logger');

/**
 * Create a visual representation for Mines game
 */
function createMinesImage(grid, revealedCells, mines, gameEnded = false, won = false) {
    try {
        const gridSize = Math.sqrt(grid.length);
        const cellSize = 50;
        const padding = 50;
        const width = gridSize * cellSize + padding * 2;
        const height = gridSize * cellSize + padding * 2 + 100;
        
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');
        
        // Background
        ctx.fillStyle = '#2C3E50';
        ctx.fillRect(0, 0, width, height);
        
        // Title
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('💣 MINES 💣', width / 2, 35);
        
        // Draw grid
        for (let i = 0; i < gridSize; i++) {
            for (let j = 0; j < gridSize; j++) {
                const index = i * gridSize + j;
                const x = padding + j * cellSize;
                const y = padding + 50 + i * cellSize;
                
                const isRevealed = revealedCells.includes(index);
                const isMine = mines.includes(index);
                
                // Cell background
                if (isRevealed) {
                    ctx.fillStyle = isMine ? '#DC143C' : '#90EE90';
                } else {
                    ctx.fillStyle = '#34495E';
                }
                ctx.fillRect(x, y, cellSize - 2, cellSize - 2);
                
                // Cell border
                ctx.strokeStyle = '#BDC3C7';
                ctx.lineWidth = 1;
                ctx.strokeRect(x, y, cellSize - 2, cellSize - 2);
                
                // Cell content
                if (isRevealed) {
                    ctx.fillStyle = '#000000';
                    ctx.font = 'bold 24px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText(isMine ? '💣' : '💎', x + cellSize / 2, y + cellSize / 2 + 8);
                } else if (gameEnded && isMine) {
                    // Show all mines when game ends
                    ctx.fillStyle = '#000000';
                    ctx.font = 'bold 20px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText('💣', x + cellSize / 2, y + cellSize / 2 + 6);
                }
            }
        }
        
        // Game result
        if (gameEnded) {
            ctx.fillStyle = won ? '#00FF00' : '#FF0000';
            ctx.font = 'bold 20px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(won ? '🎉 YOU WON!' : '💥 BOOM!', width / 2, height - 20);
        }
        
        return canvas.toBuffer('image/png');
        
    } catch (error) {
        logger.error(`Error creating mines image: ${error.message}`);
        return null;
    }
}

/**
 * Create a visual representation for Crash game
 */
function createCrashImage(multiplier, crashPoint = null, cashoutPoint = null, gameEnded = false) {
    try {
        const width = 600;
        const height = 400;
        
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');
        
        // Background gradient
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, '#1a1a2e');
        gradient.addColorStop(1, '#16213e');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
        
        // Title
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 32px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('🚀 CRASH 🚀', width / 2, 50);
        
        // Current multiplier
        const multiplierColor = gameEnded && crashPoint && multiplier >= crashPoint ? '#FF0000' : '#00FF00';
        ctx.fillStyle = multiplierColor;
        ctx.font = 'bold 48px Arial';
        ctx.fillText(`${multiplier.toFixed(2)}x`, width / 2, 150);
        
        // Draw simple graph line
        const graphHeight = 120;
        const graphY = 200;
        const maxMultiplier = Math.max(multiplier, crashPoint || multiplier, 5);
        
        ctx.strokeStyle = '#00FF88';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(50, graphY + graphHeight);
        
        // Simple exponential curve
        for (let x = 50; x < width - 50; x += 5) {
            const progress = (x - 50) / (width - 100);
            const mult = 1 + progress * (maxMultiplier - 1);
            const y = graphY + graphHeight - (mult / maxMultiplier) * graphHeight;
            ctx.lineTo(x, y);
        }
        ctx.stroke();
        
        // Crash point indicator
        if (gameEnded && crashPoint) {
            const crashX = 50 + ((crashPoint - 1) / (maxMultiplier - 1)) * (width - 100);
            const crashY = graphY + graphHeight - (crashPoint / maxMultiplier) * graphHeight;
            
            ctx.fillStyle = '#FF0000';
            ctx.beginPath();
            ctx.arc(crashX, crashY, 8, 0, 2 * Math.PI);
            ctx.fill();
            
            ctx.fillStyle = '#FF0000';
            ctx.font = 'bold 16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(`💥 ${crashPoint.toFixed(2)}x`, crashX, crashY - 15);
        }
        
        // Cashout point indicator
        if (cashoutPoint) {
            const cashoutX = 50 + ((cashoutPoint - 1) / (maxMultiplier - 1)) * (width - 100);
            const cashoutY = graphY + graphHeight - (cashoutPoint / maxMultiplier) * graphHeight;
            
            ctx.fillStyle = '#FFD700';
            ctx.beginPath();
            ctx.arc(cashoutX, cashoutY, 6, 0, 2 * Math.PI);
            ctx.fill();
            
            ctx.fillStyle = '#FFD700';
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(`💰 ${cashoutPoint.toFixed(2)}x`, cashoutX, cashoutY - 15);
        }
        
        // Status text
        if (gameEnded) {
            const statusText = crashPoint && multiplier >= crashPoint ? '💥 CRASHED!' : '🚀 FLYING...';
            ctx.fillStyle = crashPoint && multiplier >= crashPoint ? '#FF0000' : '#00FF00';
            ctx.font = 'bold 20px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(statusText, width / 2, height - 30);
        }
        
        return canvas.toBuffer('image/png');
        
    } catch (error) {
        logger.error(`Error creating crash image: ${error.message}`);
        return null;
    }
}

/**
 * Create a visual representation for Coin Flip game
 */
function createFlipImage(result, choice, winAmount = 0, gameEnded = false) {
    try {
        const width = 500;
        const height = 400;
        
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');
        
        // Background
        ctx.fillStyle = '#2C3E50';
        ctx.fillRect(0, 0, width, height);
        
        // Title
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 28px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('🪙 COIN FLIP 🪙', width / 2, 40);
        
        // Draw coin
        const coinRadius = 80;
        const coinX = width / 2;
        const coinY = 150;
        
        // Coin shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath();
        ctx.arc(coinX + 5, coinY + 5, coinRadius, 0, 2 * Math.PI);
        ctx.fill();
        
        // Coin background
        ctx.fillStyle = result === 'heads' ? '#FFD700' : '#C0C0C0';
        ctx.beginPath();
        ctx.arc(coinX, coinY, coinRadius, 0, 2 * Math.PI);
        ctx.fill();
        
        // Coin border
        ctx.strokeStyle = '#8B7355';
        ctx.lineWidth = 4;
        ctx.stroke();
        
        // Coin face
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 48px Arial';
        ctx.textAlign = 'center';
        if (result === 'heads') {
            ctx.fillText('👑', coinX, coinY + 15);
        } else {
            ctx.fillText('🏛️', coinX, coinY + 15);
        }
        
        // Result text
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 24px Arial';
        ctx.fillText(`Result: ${result.toUpperCase()}`, width / 2, 270);
        
        // Your choice
        ctx.fillStyle = '#CCCCCC';
        ctx.font = 'bold 18px Arial';
        ctx.fillText(`Your choice: ${choice.toUpperCase()}`, width / 2, 300);
        
        // Win/Loss
        if (gameEnded) {
            const won = result === choice;
            ctx.fillStyle = won ? '#00FF00' : '#FF0000';
            ctx.font = 'bold 20px Arial';
            
            if (won && winAmount > 0) {
                ctx.fillText(`🎉 YOU WIN: ${winAmount.toLocaleString()}!`, width / 2, 340);
            } else {
                ctx.fillText('💸 Better luck next time!', width / 2, 340);
            }
        }
        
        return canvas.toBuffer('image/png');
        
    } catch (error) {
        logger.error(`Error creating flip image: ${error.message}`);
        return null;
    }
}

/**
 * Create a visual representation for Russian Roulette
 */
function createRussianRouletteImage(chamber, bulletChamber, gameEnded = false, survived = false) {
    try {
        const width = 500;
        const height = 400;
        
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');
        
        // Background
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, width, height);
        
        // Title
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('🔫 RUSSIAN ROULETTE 🔫', width / 2, 40);
        
        // Draw revolver cylinder
        const centerX = width / 2;
        const centerY = 150;
        const cylinderRadius = 80;
        
        // Cylinder background
        ctx.fillStyle = '#2C3E50';
        ctx.beginPath();
        ctx.arc(centerX, centerY, cylinderRadius, 0, 2 * Math.PI);
        ctx.fill();
        
        // Cylinder border
        ctx.strokeStyle = '#7F8C8D';
        ctx.lineWidth = 4;
        ctx.stroke();
        
        // Draw chambers (6 chambers)
        for (let i = 0; i < 6; i++) {
            const angle = (i * Math.PI * 2) / 6;
            const chamberX = centerX + Math.cos(angle) * 50;
            const chamberY = centerY + Math.sin(angle) * 50;
            
            // Chamber background
            ctx.fillStyle = i === chamber - 1 ? '#FFD700' : '#34495E';
            ctx.beginPath();
            ctx.arc(chamberX, chamberY, 15, 0, 2 * Math.PI);
            ctx.fill();
            
            // Chamber border
            ctx.strokeStyle = '#BDC3C7';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            // Show bullet if game ended
            if (gameEnded && i === bulletChamber - 1) {
                ctx.fillStyle = '#8B0000';
                ctx.beginPath();
                ctx.arc(chamberX, chamberY, 8, 0, 2 * Math.PI);
                ctx.fill();
            }
            
            // Chamber number
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText((i + 1).toString(), chamberX, chamberY + 4);
        }
        
        // Current chamber indicator
        ctx.fillStyle = '#FF0000';
        ctx.font = 'bold 18px Arial';
        ctx.fillText(`Chamber: ${chamber}`, width / 2, 270);
        
        // Result
        if (gameEnded) {
            ctx.fillStyle = survived ? '#00FF00' : '#FF0000';
            ctx.font = 'bold 24px Arial';
            
            if (survived) {
                ctx.fillText('🎉 YOU SURVIVED!', width / 2, 320);
            } else {
                ctx.fillText('💀 BANG! GAME OVER', width / 2, 320);
            }
            
            ctx.fillStyle = '#CCCCCC';
            ctx.font = 'bold 14px Arial';
            ctx.fillText(`Bullet was in chamber ${bulletChamber}`, width / 2, 350);
        }
        
        return canvas.toBuffer('image/png');
        
    } catch (error) {
        logger.error(`Error creating russian roulette image: ${error.message}`);
        return null;
    }
}

module.exports = {
    createMinesImage,
    createCrashImage,
    createFlipImage,
    createRussianRouletteImage
};
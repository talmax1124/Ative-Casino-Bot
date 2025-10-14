/**
 * Roulette Canvas Image Generation for ATIVE Casino Bot
 * Creates visual roulette wheel and table representations
 */

const { createCanvas } = require('canvas');
const logger = require('./logger');

/**
 * Create a visual representation of a roulette game
 */
function createRouletteImage(winningNumber, betType, betValue, winAmount = 0, mode = 'european') {
    try {
        const width = 700;
        const height = 500;
        
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');
        
        // Background - casino green
        ctx.fillStyle = '#0F5132';
        ctx.fillRect(0, 0, width, height);
        
        // Title
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 32px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('🎯 ROULETTE 🎯', width / 2, 40);
        
        // Draw roulette wheel
        drawRouletteWheel(ctx, 150, 150, 120, winningNumber);
        
        // Draw betting table section
        drawBettingTable(ctx, 350, 80, 320, 180, betType, betValue);
        
        // Show winning number
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Winning Number:', width / 2, 320);
        
        // Number background color
        const numberColor = getNumberColor(winningNumber);
        ctx.fillStyle = numberColor;
        ctx.fillRect(width / 2 - 40, 330, 80, 60);
        
        // Number border
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 3;
        ctx.strokeRect(width / 2 - 40, 330, 80, 60);
        
        // Winning number text
        ctx.fillStyle = numberColor === '#000000' ? '#FFFFFF' : '#000000';
        ctx.font = 'bold 32px Arial';
        ctx.fillText(winningNumber.toString(), width / 2, 370);
        
        // Result
        if (winAmount > 0) {
            ctx.fillStyle = '#00FF00';
            ctx.font = 'bold 28px Arial';
            ctx.fillText(`🎉 WIN: ${winAmount.toLocaleString()}`, width / 2, 430);
        } else {
            ctx.fillStyle = '#FF6B6B';
            ctx.font = 'bold 24px Arial';
            ctx.fillText('💸 Better luck next time', width / 2, 430);
        }
        
        // Mode indicator
        ctx.fillStyle = '#CCCCCC';
        ctx.font = 'bold 16px Arial';
        ctx.fillText(`${mode.toUpperCase()} ROULETTE`, width / 2, 470);
        
        return canvas.toBuffer('image/png');
        
    } catch (error) {
        logger.error(`Error creating roulette image: ${error.message}`);
        return null;
    }
}

/**
 * Draw the roulette wheel
 */
function drawRouletteWheel(ctx, centerX, centerY, radius, winningNumber) {
    // Wheel background
    ctx.fillStyle = '#8B4513';
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + 10, 0, 2 * Math.PI);
    ctx.fill();
    
    // Numbers on wheel (simplified European layout)
    const numbers = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
    const angleStep = (2 * Math.PI) / numbers.length;
    
    numbers.forEach((number, index) => {
        const angle = index * angleStep;
        const startAngle = angle - angleStep / 2;
        const endAngle = angle + angleStep / 2;
        
        // Sector background
        ctx.fillStyle = number === winningNumber ? '#FFD700' : getNumberColor(number);
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, startAngle, endAngle);
        ctx.closePath();
        ctx.fill();
        
        // Sector border
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1;
        ctx.stroke();
        
        // Number text
        const textX = centerX + Math.cos(angle) * (radius * 0.8);
        const textY = centerY + Math.sin(angle) * (radius * 0.8);
        
        ctx.fillStyle = number === winningNumber ? '#000000' : (getNumberColor(number) === '#000000' ? '#FFFFFF' : '#000000');
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(number.toString(), textX, textY + 4);
    });
    
    // Center circle
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 15, 0, 2 * Math.PI);
    ctx.fill();
    
    // Ball position (pointing to winning number)
    const winIndex = numbers.indexOf(winningNumber);
    if (winIndex !== -1) {
        const ballAngle = winIndex * angleStep;
        const ballX = centerX + Math.cos(ballAngle) * (radius * 0.9);
        const ballY = centerY + Math.sin(ballAngle) * (radius * 0.9);
        
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(ballX, ballY, 8, 0, 2 * Math.PI);
        ctx.fill();
        
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}

/**
 * Draw betting table section
 */
function drawBettingTable(ctx, x, y, width, height, betType, betValue) {
    // Table background
    ctx.fillStyle = '#0A4D0A';
    ctx.fillRect(x, y, width, height);
    
    // Table border
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, width, height);
    
    // Bet information
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('Your Bet:', x + 20, y + 30);
    
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 16px Arial';
    ctx.fillText(`Type: ${betType}`, x + 20, y + 60);
    ctx.fillText(`Value: ${betValue}`, x + 20, y + 85);
    
    // Betting areas (simplified)
    const areas = [
        { name: 'RED', color: '#DC143C', x: x + 20, y: y + 110 },
        { name: 'BLACK', color: '#000000', x: x + 90, y: y + 110 },
        { name: 'EVEN', color: '#4169E1', x: x + 160, y: y + 110 },
        { name: 'ODD', color: '#4169E1', x: x + 220, y: y + 110 }
    ];
    
    areas.forEach(area => {
        // Highlight if this is the current bet
        const isCurrentBet = betType.toLowerCase().includes(area.name.toLowerCase());
        
        ctx.fillStyle = isCurrentBet ? '#FFD700' : area.color;
        ctx.fillRect(area.x, area.y, 60, 40);
        
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.strokeRect(area.x, area.y, 60, 40);
        
        ctx.fillStyle = area.color === '#000000' ? '#FFFFFF' : '#000000';
        if (isCurrentBet) ctx.fillStyle = '#000000';
        
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(area.name, area.x + 30, area.y + 25);
    });
}

/**
 * Get color for roulette numbers
 */
function getNumberColor(number) {
    if (number === 0) return '#00AA00'; // Green for 0
    
    const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
    return redNumbers.includes(number) ? '#DC143C' : '#000000';
}

/**
 * Create roulette result animation frames
 */
function createRouletteAnimation(finalNumber, steps = 8) {
    const frames = [];
    
    for (let step = 0; step < steps; step++) {
        // Simulate spinning - show different numbers
        const animNumber = step === steps - 1 ? finalNumber : Math.floor(Math.random() * 37);
        const frameImage = createRouletteImage(animNumber, 'SPINNING', '...', 0);
        
        if (frameImage) {
            frames.push(frameImage);
        }
    }
    
    return frames;
}

module.exports = {
    createRouletteImage,
    createRouletteAnimation,
    getNumberColor
};
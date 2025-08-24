/**
 * Bingo Card Image Generator for ATIVE Casino Bot
 * Generates visual bingo cards with Canvas similar to Python Pillow implementation
 */

const { createCanvas } = require('canvas');

/**
 * Create a bingo card image showing the card grid with marked numbers
 * @param {number[][]} card - 5x5 array of bingo numbers
 * @param {boolean[][]} marked - 5x5 array of marked positions
 * @param {string} playerName - Name of the player
 * @param {number[]} calledNumbers - Array of called numbers to highlight
 * @returns {Buffer} PNG image buffer
 */
function createBingoCardImage(card, marked, playerName, calledNumbers = []) {
    // Card dimensions
    const cardWidth = 500;
    const cardHeight = 600;
    const cellSize = 80;
    const gridStartX = 50;
    const gridStartY = 120;
    const headerHeight = 80;
    
    // Create canvas
    const canvas = createCanvas(cardWidth, cardHeight);
    const ctx = canvas.getContext('2d');
    
    // Background
    ctx.fillStyle = '#2C3E50';
    ctx.fillRect(0, 0, cardWidth, cardHeight);
    
    // Header background
    ctx.fillStyle = '#3498DB';
    ctx.fillRect(0, 0, cardWidth, headerHeight);
    
    // Title
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('🎯 BINGO CARD', cardWidth / 2, 30);
    
    // Player name
    ctx.font = 'bold 20px Arial';
    ctx.fillText(playerName, cardWidth / 2, 60);
    
    // Column headers (B-I-N-G-O)
    const columnHeaders = ['B', 'I', 'N', 'G', 'O'];
    ctx.font = 'bold 24px Arial';
    ctx.fillStyle = '#E74C3C';
    
    for (let col = 0; col < 5; col++) {
        const x = gridStartX + col * cellSize + cellSize / 2;
        const y = gridStartY - 10;
        ctx.fillText(columnHeaders[col], x, y);
    }
    
    // Draw grid and numbers
    for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 5; col++) {
            const x = gridStartX + col * cellSize;
            const y = gridStartY + row * cellSize;
            const number = card[row][col];
            const isMarked = marked[row][col];
            const isCalled = calledNumbers.includes(number);
            const isFreeSpace = (row === 2 && col === 2);
            
            // Cell background
            if (isMarked) {
                ctx.fillStyle = '#27AE60'; // Green for marked
            } else if (isCalled) {
                ctx.fillStyle = '#F39C12'; // Orange for called but not marked
            } else {
                ctx.fillStyle = '#FFFFFF'; // White for unmarked
            }
            
            ctx.fillRect(x, y, cellSize, cellSize);
            
            // Cell border
            ctx.strokeStyle = '#2C3E50';
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, cellSize, cellSize);
            
            // Number or FREE
            ctx.font = 'bold 18px Arial';
            ctx.textAlign = 'center';
            ctx.fillStyle = isMarked ? '#FFFFFF' : '#2C3E50';
            
            const centerX = x + cellSize / 2;
            const centerY = y + cellSize / 2 + 6;
            
            if (isFreeSpace) {
                ctx.font = 'bold 14px Arial';
                ctx.fillText('FREE', centerX, centerY);
            } else {
                ctx.fillText(number.toString(), centerX, centerY);
            }
            
            // Mark indicator for marked cells
            if (isMarked && !isFreeSpace) {
                ctx.font = 'bold 16px Arial';
                ctx.fillStyle = '#FFFFFF';
                ctx.fillText('✓', centerX + 20, centerY - 20);
            }
        }
    }
    
    // Footer with game info
    ctx.fillStyle = '#34495E';
    ctx.fillRect(0, cardHeight - 80, cardWidth, 80);
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`Numbers Called: ${calledNumbers.length}`, cardWidth / 2, cardHeight - 50);
    
    if (calledNumbers.length > 0) {
        ctx.font = '14px Arial';
        const lastFive = calledNumbers.slice(-5).join(', ');
        ctx.fillText(`Last: ${lastFive}`, cardWidth / 2, cardHeight - 25);
    }
    
    return canvas.toBuffer('image/png');
}

/**
 * Create a game status image showing all players and their progress
 * @param {Object} gameData - Game state data
 * @returns {Buffer} PNG image buffer
 */
function createGameStatusImage(gameData) {
    const { players, calledNumbers, currentNumber, gamePhase } = gameData;
    
    // Status image dimensions
    const statusWidth = 600;
    const statusHeight = 400 + (players.length * 40);
    
    const canvas = createCanvas(statusWidth, statusHeight);
    const ctx = canvas.getContext('2d');
    
    // Background
    ctx.fillStyle = '#2C3E50';
    ctx.fillRect(0, 0, statusWidth, statusHeight);
    
    // Header
    ctx.fillStyle = '#E74C3C';
    ctx.fillRect(0, 0, statusWidth, 80);
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('🎯 BINGO GAME STATUS', statusWidth / 2, 35);
    
    ctx.font = '18px Arial';
    ctx.fillText(`Phase: ${gamePhase.toUpperCase()}`, statusWidth / 2, 65);
    
    // Current number (if in progress)
    let yOffset = 120;
    if (currentNumber) {
        ctx.fillStyle = '#3498DB';
        ctx.fillRect(20, yOffset - 30, statusWidth - 40, 60);
        
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 24px Arial';
        ctx.fillText(`Current Number: ${currentNumber}`, statusWidth / 2, yOffset);
        yOffset += 80;
    }
    
    // Numbers called
    ctx.fillStyle = '#34495E';
    ctx.fillRect(20, yOffset - 10, statusWidth - 40, 50);
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`Numbers Called (${calledNumbers.length}):`, 30, yOffset + 15);
    
    if (calledNumbers.length > 0) {
        ctx.font = '14px Arial';
        const numbersText = calledNumbers.join(', ');
        const maxWidth = statusWidth - 60;
        
        // Word wrap for called numbers
        const words = numbersText.split(', ');
        let line = '';
        let lineY = yOffset + 35;
        
        for (let word of words) {
            const testLine = line + (line ? ', ' : '') + word;
            const metrics = ctx.measureText(testLine);
            
            if (metrics.width > maxWidth && line) {
                ctx.fillText(line, 30, lineY);
                line = word;
                lineY += 20;
            } else {
                line = testLine;
            }
        }
        if (line) {
            ctx.fillText(line, 30, lineY);
        }
        yOffset = lineY + 30;
    } else {
        yOffset += 60;
    }
    
    // Player list
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('Players:', 30, yOffset);
    yOffset += 30;
    
    players.forEach((player, index) => {
        ctx.fillStyle = index % 2 === 0 ? '#34495E' : '#3C4043';
        ctx.fillRect(20, yOffset - 15, statusWidth - 40, 30);
        
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '16px Arial';
        ctx.fillText(`${index + 1}. ${player.name}`, 30, yOffset + 5);
        
        // Player status (ready, playing, etc.)
        ctx.textAlign = 'right';
        ctx.fillStyle = player.ready ? '#27AE60' : '#E74C3C';
        const status = player.ready ? '✓ Ready' : '⏳ Placing';
        ctx.fillText(status, statusWidth - 30, yOffset + 5);
        ctx.textAlign = 'left';
        
        yOffset += 35;
    });
    
    return canvas.toBuffer('image/png');
}

/**
 * Get the BINGO column letter for a given number
 * @param {number} number - The bingo number (1-75)
 * @returns {string} The column letter (B, I, N, G, or O)
 */
function getBingoColumn(number) {
    if (number >= 1 && number <= 15) return 'B';
    if (number >= 16 && number <= 30) return 'I';
    if (number >= 31 && number <= 45) return 'N';
    if (number >= 46 && number <= 60) return 'G';
    if (number >= 61 && number <= 75) return 'O';
    return '?';
}

module.exports = {
    createBingoCardImage,
    createGameStatusImage,
    getBingoColumn
};
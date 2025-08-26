/**
 * Battleship Canvas Renderer
 * Creates visual game boards with proper Discord image support
 */

const Canvas = require('canvas');
const path = require('path');

// Board constants
const BOARD_SIZE = 10;
const CELL_SIZE = 40;
const BORDER_SIZE = 2;
const MARGIN = 20;
const HEADER_HEIGHT = 60;

// Colors
const COLORS = {
    BACKGROUND: '#1e2328',
    BORDER: '#36393f',
    GRID: '#4f545c',
    WATER: '#2c5aa0',
    SHIP: '#5865f2',
    HIT: '#ed4245',
    MISS: '#99aab5',
    SUNK: '#292b2f',
    TEXT: '#ffffff',
    HEADER: '#5865f2'
};

// Cell states
const CELL_EMPTY = 0;
const CELL_SHIP = 1;
const CELL_HIT = 2;
const CELL_MISS = 3;
const CELL_SUNK = 4;

class BattleshipRenderer {
    constructor() {
        // Register custom font if available
        try {
            Canvas.registerFont(path.join(__dirname, '../assets/fonts/Roboto-Bold.ttf'), { family: 'Roboto' });
        } catch (error) {
            // Use default font if custom font not available
        }
    }

    /**
     * Render a single board for placement or viewing
     */
    async renderSingleBoard(board, options = {}) {
        const {
            title = 'Battleship Board',
            showShips = true,
            showAttacks = true,
            width = 500,
            height = 600
        } = options;

        const canvas = Canvas.createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // Background
        ctx.fillStyle = COLORS.BACKGROUND;
        ctx.fillRect(0, 0, width, height);

        // Title
        ctx.fillStyle = COLORS.TEXT;
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(title, width / 2, 30);

        // Calculate board position
        const boardWidth = (CELL_SIZE + BORDER_SIZE) * BOARD_SIZE + BORDER_SIZE;
        const boardHeight = boardWidth;
        const startX = (width - boardWidth) / 2;
        const startY = HEADER_HEIGHT;

        // Draw coordinate labels
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillStyle = COLORS.TEXT;

        // Column letters (A-J)
        for (let col = 0; col < BOARD_SIZE; col++) {
            const x = startX + BORDER_SIZE + col * (CELL_SIZE + BORDER_SIZE) + CELL_SIZE / 2;
            const letter = String.fromCharCode('A'.charCodeAt(0) + col);
            ctx.fillText(letter, x, startY - 10);
        }

        // Row numbers (1-10)
        ctx.textAlign = 'center';
        for (let row = 0; row < BOARD_SIZE; row++) {
            const y = startY + BORDER_SIZE + row * (CELL_SIZE + BORDER_SIZE) + CELL_SIZE / 2 + 6;
            ctx.fillText((row + 1).toString(), startX - 20, y);
        }

        // Draw grid and cells
        for (let row = 0; row < BOARD_SIZE; row++) {
            for (let col = 0; col < BOARD_SIZE; col++) {
                const x = startX + BORDER_SIZE + col * (CELL_SIZE + BORDER_SIZE);
                const y = startY + BORDER_SIZE + row * (CELL_SIZE + BORDER_SIZE);
                
                const cellState = board.grid[row][col];
                let cellColor = COLORS.WATER;

                // Determine cell color based on state and visibility options
                if (cellState === CELL_SHIP && showShips) {
                    // Use ship-specific color if available
                    const ship = board.shipPositions?.get(`${row},${col}`);
                    cellColor = ship?.color || COLORS.SHIP;
                } else if (cellState === CELL_HIT && showAttacks) {
                    // For hits, show ship color with hit overlay or just hit color
                    const ship = board.shipPositions?.get(`${row},${col}`);
                    cellColor = ship?.color || COLORS.HIT;
                } else if (cellState === CELL_MISS && showAttacks) {
                    cellColor = COLORS.MISS;
                } else if (cellState === CELL_SUNK && showAttacks) {
                    cellColor = COLORS.SUNK;
                } else if (cellState === CELL_SHIP && !showShips) {
                    cellColor = COLORS.WATER; // Hide ships from opponent
                }

                // Draw cell
                ctx.fillStyle = cellColor;
                ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);

                // Draw cell border
                ctx.strokeStyle = COLORS.GRID;
                ctx.lineWidth = 1;
                ctx.strokeRect(x, y, CELL_SIZE, CELL_SIZE);

                // Add symbols for hits/misses
                if (cellState === CELL_HIT && showAttacks) {
                    this.drawHitSymbol(ctx, x + CELL_SIZE/2, y + CELL_SIZE/2);
                } else if (cellState === CELL_MISS && showAttacks) {
                    this.drawMissSymbol(ctx, x + CELL_SIZE/2, y + CELL_SIZE/2);
                } else if (cellState === CELL_SUNK && showAttacks) {
                    this.drawSunkSymbol(ctx, x + CELL_SIZE/2, y + CELL_SIZE/2);
                }
            }
        }

        // Draw board border
        ctx.strokeStyle = COLORS.BORDER;
        ctx.lineWidth = BORDER_SIZE;
        ctx.strokeRect(startX, startY, boardWidth, boardHeight);

        // Add ship status if in placement phase
        if (showShips && board.ships) {
            this.drawShipStatus(ctx, board, startX, startY + boardHeight + 20, width - startX * 2);
        }

        return canvas.toBuffer('image/png');
    }

    /**
     * Render dual boards side by side (player view vs enemy view)
     */
    async renderDualBoards(playerBoard, enemyBoard, options = {}) {
        const {
            title = 'Battleship - Dual View',
            width = 1200,
            height = 700,
            showPlayer1Ships = false,
            showPlayer2Ships = false,
            showAttacks = true
        } = options;

        const canvas = Canvas.createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // Background
        ctx.fillStyle = COLORS.BACKGROUND;
        ctx.fillRect(0, 0, width, height);

        // Title
        ctx.fillStyle = COLORS.TEXT;
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(title, width / 2, 30);

        // Board dimensions for dual view
        const boardSize = 450;
        const cellSize = (boardSize - BORDER_SIZE * (BOARD_SIZE + 1)) / BOARD_SIZE;
        const startY = 80;
        const leftBoardX = 75;
        const rightBoardX = width - boardSize - 75;

        // Draw left board (player 1 board)
        ctx.fillStyle = COLORS.TEXT;
        ctx.font = 'bold 18px Arial';
        ctx.textAlign = 'center';
        
        const player1Name = options.player1Name || 'Player 1';
        const player2Name = options.player2Name || 'Player 2';
        
        ctx.fillText(`${player1Name} - Attack Grid`, leftBoardX + boardSize/2, startY - 20);
        this.drawBoard(ctx, playerBoard, leftBoardX, startY, boardSize, cellSize, showPlayer1Ships, showAttacks);

        // Draw right board (player 2 board)
        ctx.fillText(`${player2Name} - Attack Grid`, rightBoardX + boardSize/2, startY - 20);
        this.drawBoard(ctx, enemyBoard, rightBoardX, startY, boardSize, cellSize, showPlayer2Ships, showAttacks);

        // Add legend
        this.drawLegend(ctx, 20, height - 100);

        return canvas.toBuffer('image/png');
    }

    /**
     * Draw a board at specific position with given size
     */
    drawBoard(ctx, board, startX, startY, boardSize, cellSize, showShips, showAttacks) {
        // Draw coordinate labels
        ctx.font = 'bold 12px Arial';
        ctx.fillStyle = COLORS.TEXT;
        ctx.textAlign = 'center';

        // Column letters
        for (let col = 0; col < BOARD_SIZE; col++) {
            const x = startX + BORDER_SIZE + col * (cellSize + BORDER_SIZE) + cellSize / 2;
            const letter = String.fromCharCode('A'.charCodeAt(0) + col);
            ctx.fillText(letter, x, startY - 8);
        }

        // Row numbers
        for (let row = 0; row < BOARD_SIZE; row++) {
            const y = startY + BORDER_SIZE + row * (cellSize + BORDER_SIZE) + cellSize / 2 + 4;
            ctx.fillText((row + 1).toString(), startX - 15, y);
        }

        // Draw cells
        for (let row = 0; row < BOARD_SIZE; row++) {
            for (let col = 0; col < BOARD_SIZE; col++) {
                const x = startX + BORDER_SIZE + col * (cellSize + BORDER_SIZE);
                const y = startY + BORDER_SIZE + row * (cellSize + BORDER_SIZE);
                
                const cellState = board.grid[row][col];
                let cellColor = COLORS.WATER;

                if (cellState === CELL_SHIP && showShips) {
                    // Use ship-specific color if available
                    const ship = board.shipPositions?.get(`${row},${col}`);
                    cellColor = ship?.color || COLORS.SHIP;
                } else if (cellState === CELL_HIT && showAttacks) {
                    // For hits, show ship color with hit overlay or just hit color
                    const ship = board.shipPositions?.get(`${row},${col}`);
                    cellColor = ship?.color || COLORS.HIT;
                } else if (cellState === CELL_MISS && showAttacks) {
                    cellColor = COLORS.MISS;
                } else if (cellState === CELL_SUNK && showAttacks) {
                    cellColor = COLORS.SUNK;
                }

                // Draw cell
                ctx.fillStyle = cellColor;
                ctx.fillRect(x, y, cellSize, cellSize);

                // Draw border
                ctx.strokeStyle = COLORS.GRID;
                ctx.lineWidth = 1;
                ctx.strokeRect(x, y, cellSize, cellSize);

                // Add symbols for smaller boards
                if (cellState === CELL_HIT && showAttacks) {
                    this.drawHitSymbol(ctx, x + cellSize/2, y + cellSize/2, cellSize * 0.3);
                } else if (cellState === CELL_MISS && showAttacks) {
                    this.drawMissSymbol(ctx, x + cellSize/2, y + cellSize/2, cellSize * 0.3);
                } else if (cellState === CELL_SUNK && showAttacks) {
                    this.drawSunkSymbol(ctx, x + cellSize/2, y + cellSize/2, cellSize * 0.3);
                }
            }
        }

        // Draw board border
        ctx.strokeStyle = COLORS.BORDER;
        ctx.lineWidth = 2;
        ctx.strokeRect(startX, startY, boardSize, boardSize);
    }

    /**
     * Draw hit symbol (X)
     */
    drawHitSymbol(ctx, centerX, centerY, size = 15) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(centerX - size/2, centerY - size/2);
        ctx.lineTo(centerX + size/2, centerY + size/2);
        ctx.moveTo(centerX + size/2, centerY - size/2);
        ctx.lineTo(centerX - size/2, centerY + size/2);
        ctx.stroke();
    }

    /**
     * Draw miss symbol (O)
     */
    drawMissSymbol(ctx, centerX, centerY, size = 12) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(centerX, centerY, size/2, 0, 2 * Math.PI);
        ctx.stroke();
    }

    /**
     * Draw sunk symbol (skull)
     */
    drawSunkSymbol(ctx, centerX, centerY, size = 16) {
        ctx.fillStyle = '#ffffff';
        ctx.font = `${size}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('💀', centerX, centerY);
    }

    /**
     * Draw ship placement status
     */
    drawShipStatus(ctx, board, x, y, width) {
        ctx.fillStyle = COLORS.TEXT;
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'left';
        
        let currentY = y;
        ctx.fillText('Fleet Status:', x, currentY);
        currentY += 20;

        for (const ship of board.ships) {
            const status = ship.placed ? '✅' : '❌';
            const text = `${status} ${ship.name} (${ship.length})`;
            
            ctx.font = '12px Arial';
            ctx.fillStyle = ship.placed ? '#57f287' : '#ed4245';
            ctx.fillText(text, x, currentY);
            currentY += 16;
        }
    }

    /**
     * Draw legend for dual board view
     */
    drawLegend(ctx, x, y) {
        const legend = [
            { color: COLORS.SHIP, symbol: '■', text: 'Your Ships' },
            { color: COLORS.HIT, symbol: 'X', text: 'Hit' },
            { color: COLORS.MISS, symbol: 'O', text: 'Miss' },
            { color: COLORS.SUNK, symbol: '💀', text: 'Sunk' }
        ];

        ctx.font = 'bold 12px Arial';
        ctx.fillStyle = COLORS.TEXT;
        ctx.textAlign = 'left';
        ctx.fillText('Legend:', x, y);

        let currentX = x + 60;
        for (const item of legend) {
            // Draw color box
            ctx.fillStyle = item.color;
            ctx.fillRect(currentX, y - 12, 12, 12);
            
            // Draw text
            ctx.fillStyle = COLORS.TEXT;
            ctx.fillText(item.text, currentX + 16, y - 2);
            
            currentX += 80;
        }
    }
}

module.exports = new BattleshipRenderer();
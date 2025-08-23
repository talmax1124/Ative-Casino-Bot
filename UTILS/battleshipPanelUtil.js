/**
 * Battleship Panel Utility
 * Renders Battleship boards using node-canvas with a consistent style.
 */

const Canvas = require('canvas');
const logger = require('./logger');

// Visual constants
const CELL_SIZE = 40; // pixels
const GRID_SIZE = 10; // 10x10
const PADDING = 40;   // around the grid

// Colors
const COLORS = {
    background: '#1a1a1a',
    gridBg: '#2C3E50',
    water: '#3498DB',
    ship: '#95A5A6',
    hit: '#E74C3C',
    miss: '#F39C12',
    sunk: '#8E44AD',
    gridLine: '#34495E',
    text: '#ffffff',
    title: '#ffffff',
    border: '#00ff41'
};

function createBaseCanvas(width, height, title) {
    const canvas = Canvas.createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#1a1a1a');
    gradient.addColorStop(1, '#2a2a2a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Border
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, width - 4, height - 4);

    // Title
    if (title) {
        ctx.fillStyle = COLORS.title;
        ctx.font = 'bold 22px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(title, width / 2, 28);
    }

    return { canvas, ctx };
}

function drawGridLabels(ctx, offsetX, offsetY) {
    ctx.fillStyle = COLORS.text;
    ctx.font = '16px Arial';
    ctx.textAlign = 'center';

    // Columns A-J
    for (let c = 0; c < GRID_SIZE; c++) {
        const x = offsetX + c * CELL_SIZE + CELL_SIZE / 2;
        ctx.fillText(String.fromCharCode('A'.charCodeAt(0) + c), x, offsetY - 10);
    }

    // Rows 1-10
    ctx.textAlign = 'right';
    for (let r = 0; r < GRID_SIZE; r++) {
        const y = offsetY + r * CELL_SIZE + CELL_SIZE / 2 + 6;
        ctx.fillText(String(r + 1), offsetX - 8, y);
    }
}

function drawBoard(ctx, board, options) {
    const { showShips = true, attackingView = false, originX, originY } = options;

    // Grid background
    ctx.fillStyle = COLORS.gridBg;
    ctx.fillRect(originX - 2, originY - 2, GRID_SIZE * CELL_SIZE + 4, GRID_SIZE * CELL_SIZE + 4);

    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            const x1 = originX + c * CELL_SIZE;
            const y1 = originY + r * CELL_SIZE;
            const x2 = x1 + CELL_SIZE;
            const y2 = y1 + CELL_SIZE;

            const cellState = board.grid[r][c];
            let fill = COLORS.water;

            // Map states from numeric constants if present
            // 0 empty, 1 ship, 2 hit, 3 miss, 4 sunk
            switch (cellState) {
                case 0: fill = COLORS.water; break;
                case 1: fill = showShips ? COLORS.ship : COLORS.water; break;
                case 2: fill = COLORS.hit; break;
                case 3: fill = COLORS.miss; break;
                case 4: fill = COLORS.sunk; break;
                default: fill = COLORS.water; break;
            }

            // In attacking view, hide ships unless hit/sunk
            if (attackingView && cellState === 1) {
                fill = COLORS.water;
            }

            ctx.fillStyle = fill;
            ctx.fillRect(x1, y1, CELL_SIZE, CELL_SIZE);

            // Grid lines
            ctx.strokeStyle = COLORS.gridLine;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(x1, y1, CELL_SIZE, CELL_SIZE);

            // Symbols for hits/misses
            const cx = x1 + CELL_SIZE / 2;
            const cy = y1 + CELL_SIZE / 2;
            if (cellState === 2) { // hit
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 18px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('X', cx, cy + 6);
            } else if (cellState === 3) { // miss
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(cx, cy, 5, 0, 2 * Math.PI);
                ctx.fill();
            } else if (cellState === 4) { // sunk
                ctx.fillStyle = '#ffffff';
                ctx.font = '16px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('☠', cx, cy + 6);
            }
        }
    }
}

function drawLegend(ctx, x, y, { includeShip = false } = {}) {
    const items = [
        { color: COLORS.water, label: 'Water' },
        { color: COLORS.miss, label: 'Miss' },
        { color: COLORS.hit, label: 'Hit' },
        { color: COLORS.sunk, label: 'Sunk' },
    ];
    if (includeShip) items.splice(1, 0, { color: COLORS.ship, label: 'Ship' });

    const box = 16;
    const gap = 10;
    let cx = x;
    for (const it of items) {
        ctx.fillStyle = it.color;
        ctx.fillRect(cx, y, box, box);
        ctx.strokeStyle = COLORS.gridLine;
        ctx.strokeRect(cx, y, box, box);
        ctx.fillStyle = COLORS.text;
        ctx.font = '14px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(it.label, cx + box + 6, y + box - 2);
        cx += box + 6 + ctx.measureText(it.label).width + gap;
    }
}

async function renderSingleBoard(board, { title = 'Battleship', showShips = true, attackingView = false } = {}) {
    const width = PADDING * 2 + GRID_SIZE * CELL_SIZE;
    const height = PADDING * 2 + GRID_SIZE * CELL_SIZE + 50; // room for legend
    const { canvas, ctx } = createBaseCanvas(width, height, title);

    const gridX = PADDING;
    const gridY = PADDING + 10;

    // Axis labels
    drawGridLabels(ctx, gridX, gridY);
    drawBoard(ctx, board, { showShips, attackingView, originX: gridX, originY: gridY });

    // Legend
    drawLegend(ctx, gridX, gridY + GRID_SIZE * CELL_SIZE + 12, { includeShip: showShips });

    return canvas.toBuffer();
}

async function renderDualBoards(ownBoard, enemyBoard, { title = 'Battleship', ownTitle = 'Your Fleet', enemyTitle = 'Enemy Waters' } = {}) {
    // Two boards side-by-side
    const spacing = 30;
    const boardW = PADDING * 2 + GRID_SIZE * CELL_SIZE;
    const boardH = PADDING * 2 + GRID_SIZE * CELL_SIZE + 10;
    const width = boardW * 2 + spacing;
    const height = boardH + 40; // room for title

    const { canvas, ctx } = createBaseCanvas(width, height, title);

    // Left: own board (ships visible)
    const leftX = PADDING;
    const leftY = PADDING + 10;
    drawGridLabels(ctx, leftX, leftY);
    drawBoard(ctx, ownBoard, { showShips: true, attackingView: false, originX: leftX, originY: leftY });
    ctx.fillStyle = COLORS.text;
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(ownTitle, leftX + GRID_SIZE * CELL_SIZE / 2, leftY - 16);

    // Right: enemy board (ships hidden)
    const rightX = leftX + GRID_SIZE * CELL_SIZE + spacing;
    const rightY = leftY;
    drawGridLabels(ctx, rightX, rightY);
    drawBoard(ctx, enemyBoard, { showShips: false, attackingView: true, originX: rightX, originY: rightY });
    ctx.fillStyle = COLORS.text;
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(enemyTitle, rightX + GRID_SIZE * CELL_SIZE / 2, rightY - 16);

    // Legend centered underneath
    drawLegend(ctx, PADDING, rightY + GRID_SIZE * CELL_SIZE + 12, { includeShip: true });

    return canvas.toBuffer();
}

module.exports = {
    renderSingleBoard,
    renderDualBoards,
};

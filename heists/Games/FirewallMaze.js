/**
 * Firewall Maze Game - Text Maze Navigation Mini-Game for Heists
 * 
 * GAME RULES:
 * - Display a simple text maze with walls (⬛) and paths (⬜)
 * - Player starts at 🟢 (start) and must reach 🔴 (exit)
 * - Player types directional commands: ⬆️⬅️➡️⬇️
 * - Must complete the maze before time runs out
 * - 4 rounds with increasing maze complexity
 * - 3 Lives total
 * - CSPRNG for maze generation
 * 
 * PROGRESSION:
 * Round 1: 5x5 maze
 * Round 2: 6x6 maze  
 * Round 3: 7x7 maze
 * Round 4: 8x8 maze
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { secureRandomInt } = require('../../UTILS/rng');
const logger = require('../../UTILS/logger');

class FirewallMazeGame {
    constructor(config) {
        this.userId = config.userId;
        this.username = config.username;
        this.channelId = config.channelId;
        this.guildId = config.guildId;
        
        // Game state
        this.currentRound = 1;
        this.maxRounds = 4;
        this.lives = 3;
        this.gamePhase = 'playing'; // 'playing', 'complete', 'failed'
        this.gameMessage = null;
        this.client = null;
        this.collector = null;
        
        // Maze configuration
        this.mazeSize = 4 + this.currentRound; // Round 1=5x5, Round 2=6x6, etc.
        this.maze = [];
        this.playerPos = { x: 0, y: 0 };
        this.exitPos = { x: 0, y: 0 };
        this.startTime = null;
        this.timeLimit = 60000; // 60 seconds
        
        // Direction configuration
        this.directions = [
            { emoji: '⬆️', name: 'Up', dx: 0, dy: -1, id: 'up' },
            { emoji: '⬇️', name: 'Down', dx: 0, dy: 1, id: 'down' },
            { emoji: '⬅️', name: 'Left', dx: -1, dy: 0, id: 'left' },
            { emoji: '➡️', name: 'Right', dx: 1, dy: 0, id: 'right' }
        ];
        
        this.moveHistory = [];
    }

    async start(interaction) {
        this.client = interaction.client;
        
        try {
            this.generateMaze();
            this.startTime = Date.now();
            
            const embed = this.createGameEmbed();
            const components = this.createDirectionButtons();
            
            const reply = await interaction.editReply({
                embeds: [embed],
                components: components
            });
            
            this.gameMessage = reply;
            this.setupButtonHandler();
            
        } catch (error) {
            logger.error(`Firewall Maze game start failed: ${error.message}`);
            throw error;
        }
    }

    generateMaze() {
        this.mazeSize = 4 + this.currentRound;
        
        // Initialize maze with walls
        this.maze = [];
        for (let y = 0; y < this.mazeSize; y++) {
            this.maze[y] = [];
            for (let x = 0; x < this.mazeSize; x++) {
                this.maze[y][x] = 1; // 1 = wall, 0 = path
            }
        }
        
        // Generate simple maze using recursive backtracking
        this.carvePath(1, 1);
        
        // Ensure start and exit are clear
        this.playerPos = { x: 1, y: 1 };
        this.exitPos = { x: this.mazeSize - 2, y: this.mazeSize - 2 };
        this.maze[this.playerPos.y][this.playerPos.x] = 0;
        this.maze[this.exitPos.y][this.exitPos.x] = 0;
        
        // Ensure there's a path to the exit
        this.ensurePathToExit();
        
        logger.info(`Firewall Maze round ${this.currentRound} generated: ${this.mazeSize}x${this.mazeSize} maze`);
    }

    carvePath(x, y) {
        this.maze[y][x] = 0; // Make current cell a path
        
        // Get random directions
        const dirs = [
            [0, -2], [0, 2], [-2, 0], [2, 0]
        ];
        
        // Shuffle directions using CSPRNG
        for (let i = dirs.length - 1; i > 0; i--) {
            const j = secureRandomInt(0, i + 1);
            [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
        }
        
        for (const [dx, dy] of dirs) {
            const nx = x + dx;
            const ny = y + dy;
            
            if (nx > 0 && nx < this.mazeSize - 1 && ny > 0 && ny < this.mazeSize - 1 && this.maze[ny][nx] === 1) {
                // Carve path between current and next cell
                this.maze[y + dy / 2][x + dx / 2] = 0;
                this.carvePath(nx, ny);
            }
        }
    }

    ensurePathToExit() {
        // Simple pathfinding to ensure exit is reachable
        // If not reachable, carve a simple path
        if (!this.isPathToExit()) {
            // Carve a simple L-shaped path to exit
            let currentX = this.playerPos.x;
            let currentY = this.playerPos.y;
            
            // Move right to exit column
            while (currentX < this.exitPos.x) {
                currentX++;
                if (currentX < this.mazeSize) {
                    this.maze[currentY][currentX] = 0;
                }
            }
            
            // Move down to exit row
            while (currentY < this.exitPos.y) {
                currentY++;
                if (currentY < this.mazeSize) {
                    this.maze[currentY][currentX] = 0;
                }
            }
        }
    }

    isPathToExit() {
        // Simple BFS to check if exit is reachable
        const visited = new Set();
        const queue = [{ x: this.playerPos.x, y: this.playerPos.y }];
        
        while (queue.length > 0) {
            const { x, y } = queue.shift();
            const key = `${x},${y}`;
            
            if (visited.has(key)) continue;
            visited.add(key);
            
            if (x === this.exitPos.x && y === this.exitPos.y) {
                return true;
            }
            
            // Check all 4 directions
            for (const { dx, dy } of this.directions) {
                const nx = x + dx;
                const ny = y + dy;
                
                if (nx >= 0 && nx < this.mazeSize && ny >= 0 && ny < this.mazeSize && 
                    this.maze[ny][nx] === 0 && !visited.has(`${nx},${ny}`)) {
                    queue.push({ x: nx, y: ny });
                }
            }
        }
        
        return false;
    }

    createGameEmbed() {
        const timeElapsed = this.startTime ? Date.now() - this.startTime : 0;
        const timeRemaining = Math.max(0, this.timeLimit - timeElapsed);
        
        let description = '';
        
        if (this.gamePhase === 'playing') {
            description = `**🔥 FIREWALL MAZE NAVIGATION**\n\n` +
                         `Navigate through the security maze to reach the exit!\n\n` +
                         `${this.getMazeDisplay()}\n\n` +
                         `**🟢 = Your Position**\n` +
                         `**🔴 = Exit Target**\n` +
                         `**⬛ = Firewall Blocks**\n` +
                         `**⬜ = Safe Paths**\n\n` +
                         `Use the direction buttons to move:`;
        } else if (this.gamePhase === 'complete') {
            description = `**🎉 FIREWALL BYPASSED!**\n\n` +
                         `You successfully navigated through all security mazes!\n` +
                         `The firewall has been completely bypassed!\n\n` +
                         `**Mission Status:** SUCCESS ✅`;
        } else if (this.gamePhase === 'failed') {
            description = `**🔥 FIREWALL BREACH DETECTED!**\n\n` +
                         `You failed to navigate the security maze in time!\n` +
                         `The firewall has locked you out!\n\n` +
                         `**Mission Status:** FAILED ❌`;
        }

        const embed = new EmbedBuilder()
            .setTitle('🔥 FIREWALL MAZE')
            .setDescription(description)
            .addFields(
                {
                    name: '📊 Navigation Progress',
                    value: `**Round:** ${this.currentRound}/${this.maxRounds}\n**Maze Size:** ${this.mazeSize}x${this.mazeSize}\n**Lives:** ${'❤️'.repeat(this.lives)} ${this.lives < 3 ? '💔'.repeat(3 - this.lives) : ''}`,
                    inline: true
                },
                {
                    name: '⏱️ Time & Status',
                    value: `**Time Left:** ${Math.ceil(timeRemaining / 1000)}s\n**Moves Made:** ${this.moveHistory.length}\n**Status:** ${this.getStatusText()}`,
                    inline: true
                }
            )
            .setColor(this.getEmbedColor())
            .setFooter({ text: 'Firewall Maze - Navigate to the exit before time runs out!' });

        return embed;
    }

    getMazeDisplay() {
        let display = '```\n';
        
        for (let y = 0; y < this.mazeSize; y++) {
            for (let x = 0; x < this.mazeSize; x++) {
                if (x === this.playerPos.x && y === this.playerPos.y) {
                    display += '🟢';
                } else if (x === this.exitPos.x && y === this.exitPos.y) {
                    display += '🔴';
                } else if (this.maze[y][x] === 1) {
                    display += '⬛';
                } else {
                    display += '⬜';
                }
            }
            display += '\n';
        }
        
        display += '```';
        return display;
    }

    getStatusText() {
        switch (this.gamePhase) {
            case 'playing': return '🧭 Navigating maze...';
            case 'complete': return '🎉 Firewall Bypassed!';
            case 'failed': return '🔥 Security Breach!';
            default: return 'In progress...';
        }
    }

    getEmbedColor() {
        switch (this.gamePhase) {
            case 'playing': return 0xFFA500; // Orange - navigating
            case 'complete': return 0x00FF00; // Green - success
            case 'failed': return 0xFF0000; // Red - failed
            default: return 0xFFA500;
        }
    }

    createDirectionButtons() {
        const actionRow = new ActionRowBuilder();
        
        for (const direction of this.directions) {
            const button = new ButtonBuilder()
                .setCustomId(`maze_${direction.id}`)
                .setEmoji(direction.emoji)
                .setLabel(direction.name)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(this.gamePhase !== 'playing');
            
            actionRow.addComponents(button);
        }
        
        return [actionRow];
    }

    setupButtonHandler() {
        if (!this.client || !this.gameMessage) return;

        const filter = (buttonInteraction) => {
            return buttonInteraction.customId.startsWith('maze_') && 
                   buttonInteraction.user.id === this.userId;
        };

        if (this.collector) {
            this.collector.stop();
        }

        this.collector = this.gameMessage.createMessageComponentCollector({
            filter,
            time: this.timeLimit
        });

        this.collector.on('collect', async (buttonInteraction) => {
            try {
                await buttonInteraction.deferUpdate();
                
                if (this.gamePhase !== 'playing') return;
                
                const direction = buttonInteraction.customId.split('_')[1];
                await this.handleMove(direction);
            } catch (error) {
                if (error.message.includes('already been acknowledged')) {
                    return;
                }
                logger.error(`Firewall Maze button interaction error: ${error.message}`);
            }
        });

        this.collector.on('end', async (_, reason) => {
            if (reason === 'time' && this.gamePhase === 'playing') {
                await this.handleTimeout();
            }
        });
    }

    async handleMove(directionId) {
        try {
            const direction = this.directions.find(d => d.id === directionId);
            if (!direction) return;
            
            const newX = this.playerPos.x + direction.dx;
            const newY = this.playerPos.y + direction.dy;
            
            // Check bounds
            if (newX < 0 || newX >= this.mazeSize || newY < 0 || newY >= this.mazeSize) {
                await this.handleInvalidMove('You hit the maze boundary!');
                return;
            }
            
            // Check if move is into a wall
            if (this.maze[newY][newX] === 1) {
                await this.handleInvalidMove('You hit a firewall block!');
                return;
            }
            
            // Valid move
            this.playerPos.x = newX;
            this.playerPos.y = newY;
            this.moveHistory.push(direction.emoji);
            
            // Check if reached exit
            if (this.playerPos.x === this.exitPos.x && this.playerPos.y === this.exitPos.y) {
                await this.handleMazeComplete();
                return;
            }
            
            // Update display
            const embed = this.createGameEmbed();
            const components = this.createDirectionButtons();
            
            try {
                await this.gameMessage.edit({
                    embeds: [embed],
                    components: components
                });
            } catch (error) {
                if (error.message.includes('Unknown interaction')) {
                    logger.warn('Firewall Maze: Interaction expired during move update');
                    return;
                }
                throw error;
            }
            
        } catch (error) {
            logger.error(`Firewall Maze move handling failed: ${error.message}`);
        }
    }

    async handleInvalidMove(message) {
        this.lives--;
        
        if (this.lives <= 0) {
            // Game over
            this.gamePhase = 'failed';
            if (this.collector) {
                this.collector.stop();
            }
            
            const embed = this.createGameEmbed();
            await this.gameMessage.edit({
                embeds: [embed],
                components: []
            });
        } else {
            // Show error message briefly
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Invalid Move!')
                .setDescription(`${message}\n\n**Lives remaining:** ${'❤️'.repeat(this.lives)}\n\nTry a different direction...`)
                .setColor(0xFF4444);
            
            await this.gameMessage.edit({
                embeds: [errorEmbed],
                components: []
            });
            
            await this.sleep(2000);
            
            // Restore game display
            const embed = this.createGameEmbed();
            const components = this.createDirectionButtons();
            
            await this.gameMessage.edit({
                embeds: [embed],
                components: components
            });
        }
    }

    async handleMazeComplete() {
        if (this.collector) {
            this.collector.stop();
        }
        
        if (this.currentRound >= this.maxRounds) {
            // Game complete!
            this.gamePhase = 'complete';
            const embed = this.createGameEmbed();
            
            await this.gameMessage.edit({
                embeds: [embed],
                components: []
            });
        } else {
            // Show success message and advance to next round
            const timeElapsed = Date.now() - this.startTime;
            const successEmbed = new EmbedBuilder()
                .setTitle('✅ Maze Completed!')
                .setDescription(`**Excellent!** You navigated through the firewall maze.\n\n**Time taken:** ${Math.ceil(timeElapsed / 1000)} seconds\n**Moves made:** ${this.moveHistory.length}\n\n**Round ${this.currentRound} Complete**\n\nGenerating next security level...`)
                .setColor(0x00FF00);
            
            await this.gameMessage.edit({
                embeds: [successEmbed],
                components: []
            });
            
            await this.sleep(3000);
            
            // Advance to next round
            this.currentRound++;
            this.moveHistory = [];
            this.generateMaze();
            this.startTime = Date.now();
            
            const embed = this.createGameEmbed();
            const components = this.createDirectionButtons();
            
            await this.gameMessage.edit({
                embeds: [embed],
                components: components
            });
            
            this.setupButtonHandler();
        }
    }

    async handleTimeout() {
        this.gamePhase = 'failed';
        
        if (this.collector) {
            this.collector.stop();
        }
        
        const embed = this.createGameEmbed();
        
        await this.gameMessage.edit({
            embeds: [embed],
            components: []
        });
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = FirewallMazeGame;
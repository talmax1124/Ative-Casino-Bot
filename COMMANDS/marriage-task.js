const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const dbManager = require('../UTILS/database');
const { getGuildId } = require('../UTILS/common');
const { getMarriageLevelByXP } = require('../UTILS/marriageLevels');
const logger = require('../UTILS/logger');
const fs = require('fs');
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('marriage-task')
        .setDescription('View and complete weekly marriage tasks')
        .addStringOption(option =>
            option.setName('action')
                .setDescription('Choose an action')
                .setRequired(true)
                .addChoices(
                    { name: 'View Tasks', value: 'view' },
                    { name: 'Task 1: Tic Tac Toe', value: 'task1' },
                    { name: 'Task 2: Plant a Tree', value: 'task2' },
                    { name: 'Task 3: Write a Poem', value: 'task3' },
                    { name: 'Task 4: Quiz Each Other', value: 'task4' },
                    { name: 'Migrate Poems (Admin)', value: 'migrate_poems' }
                )
        ),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = await getGuildId(interaction);
        const action = interaction.options.getString('action');

        // Handle migration separately (admin-only, no marriage required)
        if (action === 'migrate_poems') {
            const { hasAdminRole } = require('../UTILS/common');
            if (!(await hasAdminRole(interaction.user.id, interaction.guildId, interaction.guild))) {
                await interaction.reply({
                    content: '❌ This command is only available to administrators.',
                    ephemeral: true
                });
                return;
            }
            await this.migrateExistingPoems(interaction);
            return;
        }

        await interaction.deferReply();

        try {
            // Check if user is married
            const marriageData = await dbManager.getUserMarriage(userId, guildId);
            if (!marriageData.married) {
                await this.safeReply(interaction, {
                    content: '❌ You must be married to access marriage tasks! Use `/propose` to start your love story.'
                });
                return;
            }

            const marriage = marriageData.marriage;

            switch (action) {
                case 'view':
                    await this.handleViewTasks(interaction, marriage);
                    break;
                case 'task1':
                    await this.handleTicTacToe(interaction, marriage);
                    break;
                case 'task2':
                    await this.handlePlantTree(interaction, marriage);
                    break;
                case 'task3':
                    await this.handlePoem(interaction, marriage);
                    break;
                case 'task4':
                    await this.handleQuiz(interaction, marriage);
                    break;
            }

        } catch (error) {
            logger.error(`Error in marriage-task command: ${error.message}`);
            await this.safeReply(interaction, {
                content: '❌ An error occurred while processing your request. Please try again later.'
            });
        }
    },

    async handleViewTasks(interaction, marriage) {
        try {
            // Read tasks from markdown file
            const tasksPath = path.join(__dirname, '..', 'marriages', 'Tasks-For-This-Week.md');
            const tasksContent = fs.readFileSync(tasksPath, 'utf8');
            
            // Parse the markdown to extract tasks
            const taskLines = tasksContent.split('\n').filter(line => line.startsWith('- [ ]'));
            const tasks = taskLines.map((line, index) => {
                const taskText = line.replace('- [ ]', '').trim();
                return `**Task ${index + 1}:** ${taskText}`;
            });

            // Get marriage level data (placeholder for now)
            const levelData = { currentXP: 0, currentLevel: 1 };
            const currentLevel = getMarriageLevelByXP(levelData.currentXP);

            // Debug: Check what's in the database and fix dates if needed
            await dbManager.debugTaskCompletions(marriage.id);
            const fixResult = await dbManager.fixTaskCompletionDates(marriage.id);
            if (fixResult.updated > 0) {
                logger.info(`Fixed ${fixResult.updated} task completion dates for marriage ${marriage.id}`);
            }
            
            // Get task completion status from database
            const taskStatusData = await dbManager.getMarriageTaskStatus(marriage.id);
            
            const taskStatus = {
                task1: !!taskStatusData.tasks.task1?.completed,
                task2: !!taskStatusData.tasks.task2?.completed,
                task3: !!taskStatusData.tasks.task3?.completed,
                task4: !!taskStatusData.tasks.task4?.completed
            };
            
            // Debug logging
            if (Object.values(taskStatus).some(Boolean)) {
                logger.info(`Found completed tasks for marriage ${marriage.id}:`, Object.entries(taskStatus).filter(([key, value]) => value).map(([key]) => key));
            }

            const embed = new EmbedBuilder()
                .setTitle('💕 Weekly Marriage Tasks')
                .setDescription(`**${marriage.partner1_name}** & **${marriage.partner2_name}**\n${currentLevel.emoji} Level ${currentLevel.level}: ${currentLevel.name}`)
                .setColor(currentLevel.color)
                .setTimestamp();

            // Add each task with completion status
            tasks.forEach((task, index) => {
                const taskNum = index + 1;
                const isCompleted = taskStatus[`task${taskNum}`];
                const status = isCompleted ? '✅ Completed' : '⏳ Pending';
                
                embed.addFields({
                    name: `${isCompleted ? '✅' : '📋'} ${task.split(':')[0]}`,
                    value: `${task.split(':').slice(1).join(':').trim()}\n**Status:** ${status}`,
                    inline: false
                });
            });

            // Add progress summary
            const completedCount = Object.values(taskStatus).filter(Boolean).length;
            embed.addFields({
                name: '📊 Weekly Progress',
                value: `**Completed:** ${completedCount}/4 tasks\n**Progress:** ${Math.round((completedCount / 4) * 100)}%`,
                inline: false
            });

            // Create action buttons for each task
            const row1 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('marriage_task_task1')
                        .setLabel('Task 1: Tic Tac Toe')
                        .setEmoji('🎯')
                        .setStyle(taskStatus.task1 ? ButtonStyle.Success : ButtonStyle.Primary)
                        .setDisabled(taskStatus.task1),
                    new ButtonBuilder()
                        .setCustomId('marriage_task_task2')
                        .setLabel('Task 2: Plant Tree')
                        .setEmoji('🌱')
                        .setStyle(taskStatus.task2 ? ButtonStyle.Success : ButtonStyle.Primary)
                        .setDisabled(taskStatus.task2),
                    new ButtonBuilder()
                        .setCustomId('marriage_task_task3')
                        .setLabel('Task 3: Poem')
                        .setEmoji('📝')
                        .setStyle(taskStatus.task3 ? ButtonStyle.Success : ButtonStyle.Primary)
                        .setDisabled(taskStatus.task3)
                );

            const row2 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('marriage_task_task4')
                        .setLabel('Task 4: Quiz')
                        .setEmoji('❓')
                        .setStyle(taskStatus.task4 ? ButtonStyle.Success : ButtonStyle.Primary)
                        .setDisabled(taskStatus.task4),
                    new ButtonBuilder()
                        .setCustomId('refresh_tasks')
                        .setLabel('Refresh')
                        .setEmoji('🔄')
                        .setStyle(ButtonStyle.Secondary)
                );

            await this.safeReply(interaction, {
                embeds: [embed],
                components: [row1, row2]
            });

        } catch (error) {
            logger.error(`Error reading tasks file: ${error.message}`);
            
            // Fallback if file can't be read
            const embed = new EmbedBuilder()
                .setTitle('💕 Weekly Marriage Tasks')
                .setDescription(`**${marriage.partner1_name}** & **${marriage.partner2_name}**`)
                .addFields(
                    { name: '📋 Task 1', value: 'Win a game of tic tac toe', inline: false },
                    { name: '📋 Task 2', value: 'Plant a tree. Keep it alive for a week', inline: false },
                    { name: '📋 Task 3', value: 'Write a poem about nature together. Let others vote on it!', inline: false },
                    { name: '📋 Task 4', value: 'How well do you know each other? Take a quiz about your partner', inline: false }
                )
                .setColor(0xFF69B4);

            await this.safeReply(interaction, { embeds: [embed] });
        }
    },

    async handleTicTacToe(interaction, marriage) {
        const requestingUser = interaction.user.displayName;
        const partnerId = marriage.partnerId;
        const partnerName = marriage.partnerName;

        const embed = new EmbedBuilder()
            .setTitle('🎯 Task 1: Tic Tac Toe')
            .setDescription(`**${requestingUser}** wants to start **Task 1: Tic Tac Toe**\n\n<@${partnerId}>, do you want to start? Type "start" to begin!\n\n⏰ **Timeout:** 45 seconds`)
            .addFields({
                name: '🎮 Task Details',
                value: 'Win a game of tic tac toe together to complete this task!',
                inline: false
            })
            .setColor(0xFF69B4)
            .setFooter({ text: 'Waiting for partner confirmation...' });

        await this.safeReply(interaction, {
            content: `<@${partnerId}> **${requestingUser}** wants to start **Task 1**. Do you want to start? Say "start"`,
            embeds: [embed]
        });

        // Wait for partner confirmation
        try {
            if (!interaction.channel) {
                throw new Error('Channel not available for message collection');
            }

            const filter = (m) => {
                return m.author.id === partnerId && m.content.toLowerCase().trim() === 'start';
            };

            const collector = interaction.channel.createMessageCollector({
                filter,
                time: 45000, // 45 seconds
                max: 1
            });

        collector.on('collect', async (message) => {
            // Partner confirmed - start the game
            const gameEmbed = new EmbedBuilder()
                .setTitle('🎯 Task 1: Tic Tac Toe - Starting!')
                .setDescription(`**${requestingUser}** and **${partnerName}** are starting tic tac toe!`)
                .addFields({
                    name: '🎮 Game Instructions',
                    value: 'Click the numbered buttons to make your moves. Get three in a row to win!',
                    inline: false
                })
                .setColor(0x00FF00);

            const startButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('confirmed_start_tictactoe')
                        .setLabel('Start Game Now')
                        .setEmoji('🎯')
                        .setStyle(ButtonStyle.Success)
                );

            await interaction.followUp({
                embeds: [gameEmbed],
                components: [startButton]
            });
        });

            collector.on('end', async (collected) => {
                if (collected.size === 0) {
                    // Timeout - no response
                    const timeoutEmbed = new EmbedBuilder()
                        .setTitle('⏰ Task Request Timeout')
                        .setDescription(`**${partnerName}** did not respond within 45 seconds.\n\nTask 1 request has expired.`)
                        .setColor(0xFF0000);

                    await interaction.followUp({
                        embeds: [timeoutEmbed]
                    });
                }
            });

        } catch (error) {
            logger.error(`Error setting up message collector for task 1: ${error.message}`);
            
            // Fallback - go directly to game start
            const startButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('confirmed_start_tictactoe')
                        .setLabel('Start Tic Tac Toe')
                        .setEmoji('🎯')
                        .setStyle(ButtonStyle.Success)
                );

            await interaction.followUp({
                content: `⚠️ Unable to wait for partner confirmation. Click the button below to start the game directly.`,
                components: [startButton]
            });
        }
    },

    async handlePlantTree(interaction, marriage) {
        const requestingUser = interaction.user.displayName;
        const partnerId = marriage.partnerId;
        const partnerName = marriage.partnerName;

        // Skip confirmation and start tree planting directly
        await this.startTreeGame(interaction, marriage);
    },

    async handlePoem(interaction, marriage) {
        const requestingUser = interaction.user.displayName;
        const partnerId = marriage.partnerId;
        const partnerName = marriage.partnerName;

        const embed = new EmbedBuilder()
            .setTitle('📝 Task 3: Write a Poem')
            .setDescription(`**${requestingUser}** wants to start **Task 3: Write a Poem**\n\n<@${partnerId}>, do you want to start? Type "start" to begin!\n\n⏰ **Timeout:** 45 seconds`)
            .addFields({
                name: '🎭 Task Details',
                value: 'Write a poem about nature together. Let others vote on it!',
                inline: false
            })
            .setColor(0xFF1493)
            .setFooter({ text: 'Waiting for partner confirmation...' });

        await this.safeReply(interaction, {
            content: `<@${partnerId}> **${requestingUser}** wants to start **Task 3**. Do you want to start? Say "start"`,
            embeds: [embed]
        });

        // Wait for partner confirmation
        const filter = (m) => {
            return m.author.id === partnerId && m.content.toLowerCase().trim() === 'start';
        };

        const collector = interaction.channel.createMessageCollector({
            filter,
            time: 45000, // 45 seconds
            max: 1
        });

        collector.on('collect', async (message) => {
            // Partner confirmed - start the game
            const gameEmbed = new EmbedBuilder()
                .setTitle('📝 Task 3: Write a Poem - Starting!')
                .setDescription(`**${requestingUser}** and **${partnerName}** are starting poem writing!`)
                .addFields({
                    name: '🎭 Task Instructions',
                    value: 'Create a collaborative poem and share it with the community. Get at least 1 vote to complete the task!',
                    inline: false
                })
                .setColor(0xFF1493);

            const startButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('confirmed_start_poem')
                        .setLabel('Start Writing Poem')
                        .setEmoji('📝')
                        .setStyle(ButtonStyle.Success)
                );

            await interaction.followUp({
                embeds: [gameEmbed],
                components: [startButton]
            });
        });

        collector.on('end', async (collected) => {
            if (collected.size === 0) {
                // Timeout - no response
                const timeoutEmbed = new EmbedBuilder()
                    .setTitle('⏰ Task Request Timeout')
                    .setDescription(`**${partnerName}** did not respond within 45 seconds.\n\nTask 3 request has expired.`)
                    .setColor(0xFF0000);

                await interaction.followUp({
                    embeds: [timeoutEmbed]
                });
            }
        });
    },

    async handleQuiz(interaction, marriage) {
        const requestingUser = interaction.user.displayName;
        const partnerId = marriage.partnerId;
        const partnerName = marriage.partnerName;

        const embed = new EmbedBuilder()
            .setTitle('❓ Task 4: Know Each Other Quiz')
            .setDescription(`**${requestingUser}** wants to start **Task 4: Know Each Other Quiz**\n\n<@${partnerId}>, do you want to start? Type "start" to begin!\n\n⏰ **Timeout:** 45 seconds`)
            .addFields({
                name: '🧠 Task Details',
                value: 'How well do you know each other? Take a quiz about your partner.',
                inline: false
            })
            .setColor(0x9B59B6)
            .setFooter({ text: 'Waiting for partner confirmation...' });

        await this.safeReply(interaction, {
            content: `<@${partnerId}> **${requestingUser}** wants to start **Task 4**. Do you want to start? Say "start"`,
            embeds: [embed]
        });

        // Wait for partner confirmation
        const filter = (m) => {
            return m.author.id === partnerId && m.content.toLowerCase().trim() === 'start';
        };

        const collector = interaction.channel.createMessageCollector({
            filter,
            time: 45000, // 45 seconds
            max: 1
        });

        collector.on('collect', async (message) => {
            // Partner confirmed - start the game
            const gameEmbed = new EmbedBuilder()
                .setTitle('❓ Task 4: Know Each Other Quiz - Starting!')
                .setDescription(`**${requestingUser}** and **${partnerName}** are starting the quiz!`)
                .addFields({
                    name: '🧠 Task Instructions',
                    value: 'Answer questions about your partner and score 80% or higher together to complete the task!',
                    inline: false
                })
                .setColor(0x9B59B6);

            const startButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('confirmed_start_quiz')
                        .setLabel('Start Quiz')
                        .setEmoji('❓')
                        .setStyle(ButtonStyle.Success)
                );

            await interaction.followUp({
                embeds: [gameEmbed],
                components: [startButton]
            });
        });

        collector.on('end', async (collected) => {
            if (collected.size === 0) {
                // Timeout - no response
                const timeoutEmbed = new EmbedBuilder()
                    .setTitle('⏰ Task Request Timeout')
                    .setDescription(`**${partnerName}** did not respond within 45 seconds.\n\nTask 4 request has expired.`)
                    .setColor(0xFF0000);

                await interaction.followUp({
                    embeds: [timeoutEmbed]
                });
            }
        });
    },

    // Handle button interactions for this command
    async handleButtonInteraction(interaction) {
        if (!interaction.customId.startsWith('marriage_task_')) return;

        const taskAction = interaction.customId.replace('marriage_task_', '');
        const guildId = await getGuildId(interaction);
        const marriageData = await dbManager.getUserMarriage(interaction.user.id, guildId);

        if (!marriageData.married) {
            await this.safeInteractionReply(interaction, {
                content: '❌ You must be married to complete tasks!',
                ephemeral: true
            });
            return;
        }

        const marriage = marriageData.marriage;

        // Directly call the appropriate handler based on task action
        switch (taskAction) {
            case 'view':
                await this.handleViewTasks(interaction, marriage);
                break;
            case 'task1':
                await this.handleTicTacToe(interaction, marriage);
                break;
            case 'task2':
                await this.handlePlantTree(interaction, marriage);
                break;
            case 'task3':
                await this.handlePoem(interaction, marriage);
                break;
            case 'task4':
                await this.handleQuiz(interaction, marriage);
                break;
            default:
                await this.safeReply(interaction, {
                    content: '❌ Unknown task action.',
                    embeds: [],
                    components: []
                });
        }
    },

    // Handle confirmed task start buttons
    async handleConfirmedStart(interaction) {
        const customId = interaction.customId;
        
        if (customId === 'confirmed_start_tictactoe') {
            await this.startTicTacToeGame(interaction);
        } else if (customId === 'confirmed_start_tree') {
            await this.startTreeGame(interaction);
        } else if (customId === 'confirmed_start_poem') {
            await this.startPoemGame(interaction);
        } else if (customId === 'confirmed_start_quiz') {
            await this.startQuizGame(interaction);
        }
    },

    // Actual game implementations
    async startTicTacToeGame(interaction) {
        try {
            const guildId = await getGuildId(interaction);
            const marriageData = await dbManager.getUserMarriage(interaction.user.id, guildId);
            const marriage = marriageData.marriage;

            // Create new tic tac toe game
            const game = this.createTicTacToeGame();
            
            // Store game in memory
            global.marriageGames = global.marriageGames || new Map();
            const gameId = `ttt_${marriage.id}_${Date.now()}`;
            global.marriageGames.set(gameId, {
                game,
                player1: { id: interaction.user.id, name: interaction.user.displayName, symbol: 'X' },
                player2: { id: marriage.partnerId, name: marriage.partnerName, symbol: 'O' },
                marriageId: marriage.id,
                startTime: Date.now()
            });

            const embed = new EmbedBuilder()
                .setTitle('🎯 Tic Tac Toe Game')
                .setDescription(`**${interaction.user.displayName}** (X) vs **${marriage.partnerName}** (O)\n\nIt's **${interaction.user.displayName}**'s turn!`)
                .addFields({
                    name: '🎮 How to Play',
                    value: 'Click the numbered buttons to make your move. Get three in a row to win!',
                    inline: false
                })
                .setColor(0xFF69B4)
                .setFooter({ text: `Game ID: ${gameId}` });

            await this.safeReply(interaction, {
                embeds: [embed],
                components: game.createButtons()
            });

        } catch (error) {
            logger.error(`Error starting tic tac toe: ${error.message}`);
            await this.safeReply(interaction, {
                content: '❌ Error starting tic tac toe game. Please try again.',
                embeds: [],
                components: []
            });
        }
    },

    createTicTacToeGame() {
        return {
            board: Array(9).fill(null),
            currentPlayer: 'X',
            gameOver: false,
            winner: null,
            moves: 0,

            makeMove(position, player) {
                if (this.board[position] || this.gameOver) {
                    return false;
                }
                
                this.board[position] = player;
                this.moves++;
                
                if (this.checkWinner()) {
                    this.gameOver = true;
                    this.winner = player;
                } else if (this.moves === 9) {
                    this.gameOver = true;
                    this.winner = 'tie';
                } else {
                    this.currentPlayer = this.currentPlayer === 'X' ? 'O' : 'X';
                }
                
                return true;
            },

            checkWinner() {
                const winPatterns = [
                    [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
                    [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
                    [0, 4, 8], [2, 4, 6] // Diagonals
                ];

                return winPatterns.some(pattern => {
                    const [a, b, c] = pattern;
                    return this.board[a] && this.board[a] === this.board[b] && this.board[a] === this.board[c];
                });
            },

            createButtons() {
                const rows = [];
                for (let i = 0; i < 3; i++) {
                    const row = new ActionRowBuilder();
                    for (let j = 0; j < 3; j++) {
                        const position = i * 3 + j;
                        const cell = this.board[position];
                        
                        row.addComponents(
                            new ButtonBuilder()
                                .setCustomId(`ttt_move_${position}`)
                                .setLabel(cell || (position + 1).toString())
                                .setStyle(cell ? ButtonStyle.Secondary : ButtonStyle.Primary)
                                .setDisabled(!!cell || this.gameOver)
                        );
                    }
                    rows.push(row);
                }
                return rows;
            }
        };
    },

    createTreeGame() {
        return {
            stage: 'Seedling',
            health: 100,
            daysAlive: 0,
            targetDays: 7,
            lastWatered: 0,
            lastSunlight: 0,
            lastFertilized: 0,
            lastPestCheck: 0,
            careCount: 0,
            skipCount: 0, // Track number of full process skips (allows up to 2)
            maxSkips: 2, // Maximum allowed skips before penalties
            lastSkipDay: -1, // Track which day the last skip occurred
            careHistory: [], // Track care history with days

            getStatusEmoji() {
                if (this.health >= 80) return '🌱';
                if (this.health >= 60) return '🌿';
                if (this.health >= 40) return '🍃';
                if (this.health >= 20) return '🥀';
                return '☠️';
            },

            getColor() {
                if (this.health >= 80) return 0x00FF00; // Green
                if (this.health >= 60) return 0x90EE90; // Light Green
                if (this.health >= 40) return 0xFFFF00; // Yellow
                if (this.health >= 20) return 0xFFA500; // Orange
                return 0xFF0000; // Red
            },

            updateStage() {
                if (this.daysAlive >= 6) this.stage = 'Young Tree';
                else if (this.daysAlive >= 4) this.stage = 'Sapling';
                else if (this.daysAlive >= 2) this.stage = 'Sprout';
                else this.stage = 'Seedling';
            },

            care(careType, userId) {
                const now = Date.now();
                const oneDayMs = 24 * 60 * 60 * 1000;
                
                // Check if this care type was already done today
                if (careType === 'water' && (now - this.lastWatered) < oneDayMs) {
                    return { success: false, message: 'Tree was already watered today!' };
                }
                if (careType === 'sunlight' && (now - this.lastSunlight) < oneDayMs) {
                    return { success: false, message: 'Tree already got sunlight today!' };
                }
                if (careType === 'fertilize' && (now - this.lastFertilized) < oneDayMs) {
                    return { success: false, message: 'Tree was already fertilized today!' };
                }
                if (careType === 'pestcheck' && (now - this.lastPestCheck) < oneDayMs) {
                    return { success: false, message: 'Pest check already done today!' };
                }

                // Apply care effects
                let healthGain = 0;
                let message = '';

                switch (careType) {
                    case 'water':
                        this.lastWatered = now;
                        healthGain = 15;
                        message = '💧 Tree watered! Health +15';
                        break;
                    case 'sunlight':
                        this.lastSunlight = now;
                        healthGain = 10;
                        message = '☀️ Tree given sunlight! Health +10';
                        break;
                    case 'fertilize':
                        this.lastFertilized = now;
                        healthGain = 20;
                        message = '🪴 Tree fertilized! Health +20';
                        break;
                    case 'pestcheck':
                        this.lastPestCheck = now;
                        const pestFound = Math.random() < 0.3; // 30% chance of pests
                        if (pestFound) {
                            healthGain = 25; // Prevented major damage
                            message = '🐛 Pests found and removed! Health +25';
                        } else {
                            healthGain = 5;
                            message = '🐛 No pests found, but good check! Health +5';
                        }
                        break;
                }

                // Check if a day has passed and update accordingly FIRST
                this.checkDayProgress();
                
                this.health = Math.min(100, this.health + healthGain);
                this.careCount++;

                // Track care history with day information (use current day after progression check)
                this.careHistory.push({
                    action: careType,
                    caregiver: userId,
                    dayGiven: this.daysAlive,
                    timestamp: now
                });

                return { success: true, message, healthGain };
            },

            checkDayProgress() {
                const now = Date.now();
                const startTime = this.startTime || now;
                const daysPassed = Math.floor((now - startTime) / (24 * 60 * 60 * 1000));
                
                if (daysPassed > this.daysAlive) {
                    const previousDay = this.daysAlive;
                    this.daysAlive = daysPassed;
                    this.updateStage();
                    
                    // Check for skipped days and apply skip logic
                    for (let day = previousDay; day < daysPassed; day++) {
                        // Check if this day was skipped (no care given on that day)
                        const hadCareThisDay = this.careHistory.some(care => care.dayGiven === day);
                        
                        if (!hadCareThisDay && day >= 0 && this.lastSkipDay !== day) {
                            this.skipCount++;
                            this.lastSkipDay = day;
                        }
                    }
                    
                    // Apply health decay based on skip count
                    let healthDecay = 5; // Base decay per day
                    
                    if (this.skipCount <= this.maxSkips) {
                        // Within allowed skips - more forgiving
                        if (this.skipCount === 0) {
                            healthDecay = 3; // Gentle decay when well cared for
                        } else if (this.skipCount <= 1) {
                            healthDecay = 4; // Still manageable
                        } else {
                            healthDecay = 5; // Normal decay
                        }
                    } else {
                        // Exceeded allowed skips - harsh penalty
                        const excessSkips = this.skipCount - this.maxSkips;
                        healthDecay = 8 + (excessSkips * 5); // Harsh but not immediately fatal
                    }
                    
                    // Apply decay for the day(s) that passed
                    const daysToDecay = daysPassed - previousDay;
                    this.health = Math.max(0, this.health - (healthDecay * daysToDecay));
                }
            },

            isAlive() {
                return this.health > 0;
            },

            isCompleted() {
                return this.daysAlive >= this.targetDays && this.isAlive();
            },

            getProgressMessage() {
                if (this.isCompleted()) {
                    return '🎉 **Task 2 Completed!** Your tree survived 7 days! 🌳';
                }
                if (!this.isAlive()) {
                    const reason = this.skipCount > this.maxSkips 
                        ? `(${this.skipCount} skips used, max ${this.maxSkips} allowed)`
                        : '';
                    return `💀 **Task Failed!** Your tree has died. ${reason} Better luck next time! 🥀`;
                }
                
                let skipInfo = '';
                if (this.skipCount > 0) {
                    if (this.skipCount <= this.maxSkips) {
                        skipInfo = ` | 💛 ${this.skipCount}/${this.maxSkips} skips used`;
                    } else {
                        skipInfo = ` | ⚠️ ${this.skipCount}/${this.maxSkips} skips used - PENALTY ACTIVE!`;
                    }
                } else {
                    skipInfo = ` | 💚 Perfect care so far!`;
                }
                
                return `Keep caring for your tree! ${this.targetDays - this.daysAlive} days remaining.${skipInfo}`;
            }
        };
    },

    createTreeCareButtons(treeId, tree) {
        const now = Date.now();
        const oneDayMs = 24 * 60 * 60 * 1000;

        const row1 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`tree_care_water_${treeId}`)
                    .setLabel('Water')
                    .setEmoji('💧')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled((now - tree.lastWatered) < oneDayMs || !tree.isAlive()),
                new ButtonBuilder()
                    .setCustomId(`tree_care_sunlight_${treeId}`)
                    .setLabel('Sunlight')
                    .setEmoji('☀️')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled((now - tree.lastSunlight) < oneDayMs || !tree.isAlive()),
                new ButtonBuilder()
                    .setCustomId(`tree_care_fertilize_${treeId}`)
                    .setLabel('Fertilize')
                    .setEmoji('🪴')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled((now - tree.lastFertilized) < oneDayMs || !tree.isAlive())
            );

        const row2 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`tree_care_pestcheck_${treeId}`)
                    .setLabel('Pest Check')
                    .setEmoji('🐛')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled((now - tree.lastPestCheck) < oneDayMs || !tree.isAlive()),
                new ButtonBuilder()
                    .setCustomId(`tree_care_skip_${treeId}`)
                    .setLabel('Skip Day')
                    .setEmoji('⏭️')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(!tree.isAlive() || tree.skipCount >= tree.maxSkips),
                new ButtonBuilder()
                    .setCustomId(`tree_refresh_${treeId}`)
                    .setLabel('Check Status')
                    .setEmoji('🔄')
                    .setStyle(ButtonStyle.Secondary)
            );

        return tree.isCompleted() || !tree.isAlive() ? [row2] : [row1, row2];
    },

    // Handle tree care button interactions
    async handleTreeCare(interaction) {
        const parts = interaction.customId.split('_');
        const careType = parts[2];
        const treeId = parts.slice(3).join('_');

        if (!global.marriageTrees?.has(treeId)) {
            // Try to find an active tree for this user's marriage
            const userId = interaction.user.id;
            const guildId = await getGuildId(interaction);
            const marriageData = await dbManager.getUserMarriage(userId, guildId);
            
            if (marriageData.married) {
                const marriageId = marriageData.marriage.id;
                
                // Look for any active tree for this marriage
                let foundTreeId = null;
                if (global.marriageTrees) {
                    for (const [id, treeData] of global.marriageTrees) {
                        if (treeData.marriageId === marriageId) {
                            foundTreeId = id;
                            break;
                        }
                    }
                }
                
                if (foundTreeId) {
                    // Redirect to the correct tree
                    const treeData = global.marriageTrees.get(foundTreeId);
                    const { tree, partner1, partner2 } = treeData;
                    
                    if (careType === 'refresh') {
                        tree.checkDayProgress();
                    } else {
                        const result = tree.care(careType, interaction.user.id);
                        if (!result.success) {
                            await this.safeInteractionReply(interaction, {
                                content: `❌ ${result.message}`,
                                ephemeral: true
                            });
                            return;
                        }
                    }
                    
                    // Continue with updated tree display
                    treeId = foundTreeId;
                } else {
                    await this.safeInteractionReply(interaction, {
                        content: '❌ No active tree found. Start a new tree with `/marriage-task task2`.',
                        ephemeral: true
                    });
                    return;
                }
            } else {
                await this.safeInteractionReply(interaction, {
                    content: '❌ You must be married to care for a tree!',
                    ephemeral: true
                });
                return;
            }
        }

        const treeData = global.marriageTrees.get(treeId);
        const { tree, partner1, partner2 } = treeData;

        // Check if user is one of the partners
        if (interaction.user.id !== partner1.id && interaction.user.id !== partner2.id) {
            await this.safeInteractionReply(interaction, {
                content: '❌ Only the married couple can care for their tree!',
                ephemeral: true
            });
            return;
        }

        if (careType === 'refresh') {
            // Just refresh the status
            tree.checkDayProgress();
        } else if (careType === 'skip') {
            // Handle skip day
            if (tree.skipCount >= tree.maxSkips) {
                await this.safeInteractionReply(interaction, {
                    content: `❌ You've already used ${tree.maxSkips} skips! No more skips allowed.`,
                    ephemeral: true
                });
                return;
            }
            
            tree.skipCount++;
            tree.lastSkipDay = tree.daysAlive;
            
            await this.safeInteractionReply(interaction, {
                content: `⏭️ Skipped care for today. Skips used: ${tree.skipCount}/${tree.maxSkips}`,
                ephemeral: true
            });
        } else {
            // Perform care action
            const result = tree.care(careType, interaction.user.id);
            
            if (!result.success) {
                await this.safeInteractionReply(interaction, {
                    content: `❌ ${result.message}`,
                    ephemeral: true
                });
                return;
            }
        }
        
        // Always check day progress before updating display
        tree.checkDayProgress();

        // Update the embed
        const lastCareTime = Math.max(tree.lastWatered, tree.lastSunlight, tree.lastFertilized, tree.lastPestCheck);
        const lastCareText = lastCareTime > 0 ? `<t:${Math.floor(lastCareTime / 1000)}:R>` : 'Never';

        const embed = new EmbedBuilder()
            .setTitle('🌱 Tree Care Progress')
            .setDescription(`**${partner1.name}** and **${partner2.name}**'s tree:\n\n${tree.getStatusEmoji()} **Tree Status:** ${tree.stage}\n💧 **Health:** ${tree.health}/100\n📅 **Days Alive:** ${tree.daysAlive}/${tree.targetDays}\n⏰ **Last Care:** ${lastCareText}\n\n${tree.getProgressMessage()}`)
            .setColor(tree.getColor())
            .setFooter({ text: `Tree ID: ${treeId} • Goal: Survive 7 days` });

        if (careType !== 'refresh') {
            const result = tree.care(careType, interaction.user.id);
            embed.addFields({
                name: '🌿 Care Action',
                value: `${interaction.user.displayName}: ${result.message}`,
                inline: false
            });
        }

        const careButtons = this.createTreeCareButtons(treeId, tree);

        await this.safeReply(interaction, {
            embeds: [embed],
            components: careButtons
        });

        // Clean up completed or failed trees after showing result
        if (tree.isCompleted() || !tree.isAlive()) {
            // Mark task as completed if tree survived and award XP
            if (tree.isCompleted()) {
                try {
                    await dbManager.completeMarriageTask(treeData.marriageId, 2, interaction.user.id, {
                        gameType: 'tree',
                        finalHealth: tree.health,
                        daysAlive: tree.daysAlive,
                        careCount: tree.careCount
                    });

                    // Award Marriage XP for completing the tree task (most XP since it takes 7 days)
                    const xpResult = await dbManager.awardMarriageXP(
                        treeData.marriageId, 
                        50, 
                        'task_completion', 
                        `Tree task completed - survived ${tree.daysAlive} days with ${tree.health} health`
                    );

                    // Send level up notification if it happened
                    if (xpResult.leveledUp) {
                        logger.info(`Marriage ${treeData.marriageId} leveled up! ${xpResult.oldLevel} -> ${xpResult.newLevel}`);
                        await this.sendLevelUpNotification(interaction, xpResult, treeData.partner1, treeData.partner2);
                    }

                } catch (error) {
                    logger.error(`Error marking tree task as completed: ${error.message}`);
                }
            }
            
            setTimeout(() => {
                global.marriageTrees.delete(treeId);
            }, 5 * 60 * 1000); // Remove after 5 minutes to allow status checking
        }
    },

    createPoemGame() {
        const themes = [
            'Nature\'s Beauty', 'Love and Romance', 'Adventure Together', 
            'Peaceful Moments', 'Dreams and Future', 'Seasons of Change',
            'Starlit Nights', 'Morning Sunshine', 'Ocean Waves', 'Mountain Heights'
        ];
        
        return {
            theme: themes[Math.floor(Math.random() * themes.length)],
            lines: [],
            isComplete: false,
            votes: 0,
            published: false,

            addLine(line, authorId, authorName) {
                if (this.lines.length >= 8) {
                    return { success: false, message: 'Poem already has maximum lines!' };
                }
                
                if (line.length < 5) {
                    return { success: false, message: 'Line must be at least 5 characters!' };
                }
                
                if (line.length > 100) {
                    return { success: false, message: 'Line must be 100 characters or less!' };
                }

                this.lines.push({
                    text: line,
                    authorId,
                    authorName,
                    timestamp: Date.now()
                });

                if (this.lines.length >= 8) {
                    this.isComplete = true;
                }

                return { success: true, message: 'Line added successfully!' };
            },

            getDisplayText() {
                if (this.lines.length === 0) {
                    return '*No lines written yet...*';
                }
                
                return this.lines.map((line, index) => {
                    return `**${index + 1}.** ${line.text}\n    *- ${line.authorName}*`;
                }).join('\n\n');
            },

            getPlainText() {
                return this.lines.map(line => line.text).join('\n');
            },

            getTurnMessage(currentTurnId, partner1, partner2) {
                if (this.isComplete) {
                    return 'Poem complete! Ready to submit for voting.';
                }
                
                const nextPerson = currentTurnId === partner1.id ? partner1.name : partner2.name;
                return `It's **${nextPerson}**'s turn to add a line!`;
            },

            getNextTurn(currentTurnId, partner1Id, partner2Id) {
                return currentTurnId === partner1Id ? partner2Id : partner1Id;
            }
        };
    },

    createPoemButtons(poemId, poem, currentTurnId) {
        const row1 = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`poem_add_line_${poemId}`)
                    .setLabel('Add Line')
                    .setEmoji('✍️')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(poem.isComplete),
                new ButtonBuilder()
                    .setCustomId(`poem_preview_${poemId}`)
                    .setLabel('Preview Poem')
                    .setEmoji('📖')
                    .setStyle(ButtonStyle.Secondary)
            );

        if (poem.isComplete && !poem.published) {
            row1.addComponents(
                new ButtonBuilder()
                    .setCustomId(`poem_publish_${poemId}`)
                    .setLabel('Publish for Voting')
                    .setEmoji('📤')
                    .setStyle(ButtonStyle.Success)
            );
        }

        return [row1];
    },

    // Handle poem interaction buttons
    async handlePoemInteraction(interaction) {
        const customId = interaction.customId;
        
        // Handle new format buttons (add_verse, finish_poem)
        if (customId === 'add_verse' || customId === 'finish_poem') {
            return await this.handleNewPoemButtons(interaction);
        }
        
        // Handle poem buttons: poem_add_line_poemId, poem_preview_poemId, poem_publish_poemId
        const parts = customId.split('_');
        let action, poemId;
        
        if (customId.startsWith('poem_add_line_')) {
            action = 'add_line';
            poemId = parts.slice(3).join('_'); // Skip 'poem', 'add', 'line'
        } else if (customId.startsWith('poem_preview_')) {
            action = 'preview';
            poemId = parts.slice(2).join('_'); // Skip 'poem', 'preview'
        } else if (customId.startsWith('poem_publish_')) {
            action = 'publish';
            poemId = parts.slice(2).join('_'); // Skip 'poem', 'publish'
        } else {
            // Fallback for old format
            action = parts[1];
            poemId = parts.slice(2).join('_');
        }

        if (!global.marriagePoems?.has(poemId)) {
            await this.safeInteractionReply(interaction, {
                content: '❌ This poem session has expired or is invalid.',
                ephemeral: true
            });
            return;
        }

        const poemData = global.marriagePoems.get(poemId);
        const { poem, partner1, partner2, currentTurn } = poemData;

        // Check if user is one of the partners
        if (interaction.user.id !== partner1.id && interaction.user.id !== partner2.id) {
            await this.safeInteractionReply(interaction, {
                content: '❌ Only the married couple can work on their poem!',
                ephemeral: true
            });
            return;
        }

        switch (action) {
            case 'add_line':
            case 'add':
                await this.handleAddPoemLine(interaction, poemData, poemId);
                break;
            case 'preview':
                await this.handlePoemPreview(interaction, poemData);
                break;
            case 'publish':
                await this.handlePoemPublish(interaction, poemData, poemId);
                break;
        }
    },

    async handleAddPoemLine(interaction, poemData, poemId) {
        const { poem, partner1, partner2, currentTurn } = poemData;

        // Check if it's the user's turn
        if (interaction.user.id !== currentTurn) {
            const turnName = currentTurn === partner1.id ? partner1.name : partner2.name;
            await this.safeInteractionReply(interaction, {
                content: `❌ It's ${turnName}'s turn to add a line!`,
                ephemeral: true
            });
            return;
        }

        if (poem.isComplete) {
            await this.safeInteractionReply(interaction, {
                content: '❌ This poem is already complete!',
                ephemeral: true
            });
            return;
        }

        // Set waiting state for this poem
        if (!global.poemWaitingForInput) {
            global.poemWaitingForInput = new Map();
        }
        
        global.poemWaitingForInput.set(interaction.user.id, {
            poemId: poemId,
            channelId: interaction.channel.id,
            startTime: Date.now(),
            expiresAt: Date.now() + (5 * 60 * 1000) // 5 minutes
        });

        await interaction.update({
            content: `📝 <@${interaction.user.id}>, please type your line for the poem in this channel!\n\n**Theme:** ${poem.theme}\n**Line ${poem.lines.length + 1}/8** - Write a beautiful line about the theme (5-100 characters)\n\n*You have 5 minutes to respond, or type "cancel" to cancel.*`,
            embeds: interaction.message.embeds,
            components: interaction.message.components
        });
    },

    // Handle chat-based poem line input
    async handlePoemChatInput(message) {
        try {
            // Check if user is waiting for poem input
            if (!global.poemWaitingForInput?.has(message.author.id)) {
                return false; // Not handling poem input
            }

            const waitingData = global.poemWaitingForInput.get(message.author.id);
            
            // Check if expired
            if (Date.now() > waitingData.expiresAt) {
                global.poemWaitingForInput.delete(message.author.id);
                await message.reply('⏰ Poem input timed out. Please click "Add Line" again to continue.');
                return true;
            }

            // Check if in correct channel
            if (message.channel.id !== waitingData.channelId) {
                return false;
            }

            const poemId = waitingData.poemId;
            const poemLine = message.content.trim();

            // Handle cancel
            if (poemLine.toLowerCase() === 'cancel') {
                global.poemWaitingForInput.delete(message.author.id);
                await message.reply('❌ Poem line input cancelled.');
                return true;
            }

            // Get poem data
            if (!global.marriagePoems?.has(poemId)) {
                global.poemWaitingForInput.delete(message.author.id);
                await message.reply('❌ This poem session has expired.');
                return true;
            }

            const poemData = global.marriagePoems.get(poemId);
            const { poem, partner1, partner2, currentTurn } = poemData;

            // Verify it's still their turn
            if (message.author.id !== currentTurn) {
                global.poemWaitingForInput.delete(message.author.id);
                await message.reply('❌ It\'s no longer your turn to add a line.');
                return true;
            }

            // Add the line
            const result = poem.addLine(poemLine, message.author.id, message.author.displayName);
            
            if (!result.success) {
                await message.reply(`❌ ${result.message}`);
                return true;
            }

            // Clear waiting state
            global.poemWaitingForInput.delete(message.author.id);

            // Switch turns
            poemData.currentTurn = poem.getNextTurn(currentTurn, partner1.id, partner2.id);

            // Update the embed with new line
            const embed = new EmbedBuilder()
                .setTitle('📝 Collaborative Poem Writing!')
                .setDescription(`**${partner1.name}** and **${partner2.name}** are writing a poem together!\n\n📖 **Theme:** ${poem.theme}\n✍️ **Current Turn:** ${poem.isComplete ? 'Complete!' : `<@${poemData.currentTurn}>`}\n📏 **Lines Written:** ${poem.lines.length}/8\n\n**Current Poem:**\n${poem.getDisplayText()}`)
                .setColor(poem.isComplete ? 0x00FF00 : 0xFF1493)
                .setFooter({ text: `Poem ID: ${poemId} • Theme: ${poem.theme}` });

            if (poem.isComplete) {
                embed.addFields({
                    name: '🎉 Poem Complete!',
                    value: 'Your collaborative poem is finished! Click "Publish for Voting" to share it with the community and complete your task.',
                    inline: false
                });
            }

            const actionButtons = this.createPoemButtons(poemId, poem, poemData.currentTurn);

            await message.reply({
                content: `✅ Line added successfully! ${poem.isComplete ? '🎉 **Poem completed!**' : `Now it's <@${poemData.currentTurn}>'s turn.`}`,
                embeds: [embed],
                components: actionButtons
            });

            // Auto-post completed poems to the designated channel
            if (poem.isComplete) {
                await this.postPoemToVotingChannel(poemData, poemId, message.client);
            }

            return true;
            
        } catch (error) {
            logger.error(`Error in handlePoemChatInput: ${error.message}`, error);
            await message.reply('❌ Something went wrong while adding your line. Please try again.');
            return true;
        }
    },

    // Post completed poem to voting channel
    async postPoemToVotingChannel(poemData, poemId, client) {
        try {
            const { poem, partner1, partner2, marriageId } = poemData;
            const votingChannelId = '1419057346952564978';
            
            if (!client) {
                logger.error('Client not provided to postPoemToVotingChannel');
                return;
            }

            // Get the voting channel
            const votingChannel = await client.channels.fetch(votingChannelId).catch(() => null);
            if (!votingChannel) {
                logger.error(`Could not find voting channel: ${votingChannelId}`);
                return;
            }

            // Create the poem embed (without author names, just the poem)
            const poemEmbed = new EmbedBuilder()
                .setTitle('📜 New Poem')
                .setDescription(`**Theme:** ${poem.theme}\n\n${poem.getDisplayText()}`)
                .setColor(0x9B59B6)
                .setFooter({ text: `Poem ID: ${poemId}` })
                .setTimestamp();

            // Create vote buttons with current vote counts
            const voteButtons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`poem_vote_up_${poemId}`)
                        .setLabel('0')
                        .setEmoji('👍')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`poem_vote_down_${poemId}`)
                        .setLabel('0')
                        .setEmoji('👎')
                        .setStyle(ButtonStyle.Danger)
                );

            // Post to voting channel
            const votingMessage = await votingChannel.send({
                embeds: [poemEmbed],
                components: [voteButtons]
            });

            // Store voting data in database
            await dbManager.savePoemVote(poemId, votingMessage.id, votingChannelId, guildId, {
                theme: poem.theme,
                content: poem.getDisplayText(),
                marriageId: marriageId
            });

            // Task will be completed when poem gets enough votes
            logger.info(`Poem ${poemId} posted to voting channel, waiting for votes to complete task`);

            logger.info(`Posted completed poem ${poemId} to voting channel ${votingChannelId}`);
            
        } catch (error) {
            logger.error(`Error posting poem to voting channel: ${error.message}`, error);
        }
    },

    // Check if poem has enough votes to complete the marriage task
    async checkPoemTaskCompletion(poemId, voteData) {
        try {
            const { upvotes, downvotes, poem } = voteData;
            const totalVotes = upvotes + downvotes;
            
            // Skip task completion for migrated poems (they don't have marriageId)
            if (!poem.marriageId) {
                logger.debug(`Poem ${poemId} is migrated - no task completion check needed`);
                return;
            }
            
            const marriageId = poem.marriageId;
            
            // Require at least 1 upvote to complete the task (more reasonable threshold)
            const minUpvotes = 1;
            
            if (upvotes >= minUpvotes) {
                // Check if task is already completed to avoid duplicate completion
                const existingTaskCompletion = await dbManager.getMarriageTaskStatus(marriageId);
                if (existingTaskCompletion.task3) {
                    logger.info(`Poem task already completed for marriage ${marriageId}`);
                    return;
                }
                
                const netScore = upvotes - downvotes;
                logger.info(`Poem ${poemId} reached completion criteria: ${upvotes} upvotes (minimum 1 needed)`);
                
                // Mark task as completed and award XP
                await dbManager.completeMarriageTask(marriageId, 3, null, {
                    gameType: 'poem',
                    finalUpvotes: upvotes,
                    finalDownvotes: downvotes,
                    netScore: netScore,
                    poemId: poemId
                });

                // Award Marriage XP for completing the poem task
                const xpResult = await dbManager.awardMarriageXP(
                    marriageId, 
                    30, 
                    'task_completion', 
                    `Poem task completed - ${upvotes} upvotes, ${downvotes} downvotes`
                );

                logger.info(`Marriage ${marriageId} completed poem task with ${upvotes} upvotes and ${downvotes} downvotes`);
                
                if (xpResult.leveledUp) {
                    logger.info(`Marriage ${marriageId} leveled up! ${xpResult.oldLevel} -> ${xpResult.newLevel}`);
                }
                
                // Mark this vote data as task completed to avoid rechecking
                voteData.taskCompleted = true;
                
            } else {
                logger.debug(`Poem ${poemId} needs more upvotes: ${upvotes}/${minUpvotes} upvotes needed`);
            }
            
        } catch (error) {
            logger.error(`Error checking poem task completion: ${error.message}`, error);
        }
    },

    // Migrate existing poems to new voting system
    async migrateExistingPoems(interaction) {
        try {
            const oldChannelId = '1417279987043532971';
            const newChannelId = '1419057346952564978';
            
            // Get both channels
            const oldChannel = await interaction.client.channels.fetch(oldChannelId).catch(() => null);
            const newChannel = await interaction.client.channels.fetch(newChannelId).catch(() => null);
            
            if (!oldChannel || !newChannel) {
                await interaction.reply({
                    content: `❌ Could not access channels. Old: ${oldChannel ? '✅' : '❌'}, New: ${newChannel ? '✅' : '❌'}`,
                    ephemeral: true
                });
                return;
            }

            await interaction.reply({
                content: '🔄 Starting poem migration... This may take a moment.',
                ephemeral: true
            });

            let migratedCount = 0;
            let messages = [];
            
            // Fetch messages from old channel
            let lastMessageId;
            while (true) {
                const fetchedMessages = await oldChannel.messages.fetch({
                    limit: 100,
                    before: lastMessageId
                });
                
                if (fetchedMessages.size === 0) break;
                
                messages.push(...fetchedMessages.values());
                lastMessageId = fetchedMessages.last().id;
                
                // Prevent infinite loop
                if (messages.length > 1000) break;
            }

            logger.info(`Found ${messages.length} messages in old poem channel`);

            // Process messages to find poems
            for (const message of messages) {
                try {
                    // Look for poem embeds
                    if (message.embeds.length > 0) {
                        const embed = message.embeds[0];
                        
                        // Check if this is specifically a "New Marriage Poem!" message
                        if (embed.title === '📝 New Marriage Poem!' && embed.description) {
                            
                            // Extract poem data
                            const description = embed.description;
                            let theme = 'Unknown';
                            let poemContent = description;
                            
                            // Try to extract theme
                            const themeMatch = description.match(/\*\*Theme:\*\*\s*([^\n]+)/);
                            if (themeMatch) {
                                theme = themeMatch[1];
                                poemContent = description.replace(/\*\*Theme:\*\*\s*[^\n]+\n*/g, '');
                            }
                            
                            // Remove author info if present
                            poemContent = poemContent
                                .replace(/\*\*Authors?:\*\*[^\n]+\n*/g, '')
                                .replace(/\*\*Author:\*\*[^\n]+\n*/g, '')
                                .trim();
                            
                            // Skip if content is too short or empty
                            if (poemContent.length < 20) continue;
                            
                            // Create new poem post
                            const poemId = `migrated_${message.id}`;
                            
                            // Check if already migrated
                            const existingPoem = await dbManager.getPoemVote(poemId);
                            if (existingPoem) continue;
                            
                            const poemEmbed = new EmbedBuilder()
                                .setTitle('📜 New Poem')
                                .setDescription(`**Theme:** ${theme}\n\n${poemContent}`)
                                .setColor(0x9B59B6)
                                .setFooter({ text: `Poem ID: ${poemId}` })
                                .setTimestamp(message.createdAt);

                            const voteButtons = new ActionRowBuilder()
                                .addComponents(
                                    new ButtonBuilder()
                                        .setCustomId(`poem_vote_up_${poemId}`)
                                        .setLabel('0')
                                        .setEmoji('👍')
                                        .setStyle(ButtonStyle.Success),
                                    new ButtonBuilder()
                                        .setCustomId(`poem_vote_down_${poemId}`)
                                        .setLabel('0')
                                        .setEmoji('👎')
                                        .setStyle(ButtonStyle.Danger)
                                );

                            // Post to new channel
                            const newMessage = await newChannel.send({
                                embeds: [poemEmbed],
                                components: [voteButtons]
                            });

                            // Store voting data in database
                            await dbManager.savePoemVote(poemId, newMessage.id, newChannelId, oldChannel.guild.id, {
                                theme: theme,
                                content: poemContent,
                                originalMessageId: message.id
                            });

                            migratedCount++;
                            
                            // Rate limit to avoid hitting Discord limits
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                    }
                } catch (error) {
                    logger.error(`Error processing message ${message.id}: ${error.message}`);
                }
            }

            // Also check database for poem completion records
            try {
                // Use dbManager's proper method to check poem completions
                logger.info(`Checked database for poem task completions - database query method needs proper implementation`);
                
            } catch (dbError) {
                logger.error(`Error checking database for poems: ${dbError.message}`);
            }

            await interaction.editReply({
                content: `✅ Migration complete! Migrated ${migratedCount} poems from <#${oldChannelId}> to <#${newChannelId}> with new voting buttons.`
            });

            logger.info(`Successfully migrated ${migratedCount} poems to new voting system`);

        } catch (error) {
            logger.error(`Error migrating existing poems: ${error.message}`, error);
            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.editReply({
                        content: '❌ Error occurred during migration. Check logs for details.'
                    });
                } else {
                    await interaction.reply({
                        content: '❌ Error occurred during migration. Check logs for details.',
                        ephemeral: true
                    });
                }
            } catch (replyError) {
                logger.error(`Failed to send error message: ${replyError.message}`);
            }
        }
    },

    // Handle new format poem buttons (add_verse, finish_poem)
    async handleNewPoemButtons(interaction) {
        const customId = interaction.customId;
        const userId = interaction.user.id;
        
        try {
            // Find active poem session for this user
            let poemId = null;
            let poemData = null;
            
            // First try to find by user ID
            if (global.marriagePoems) {
                for (const [id, data] of global.marriagePoems) {
                    if (data.partner1?.id === userId || data.partner2?.id === userId) {
                        poemId = id;
                        poemData = data;
                        break;
                    }
                }
            }
            
            // If not found, try to find by marriage
            if (!poemId) {
                const guildId = await getGuildId(interaction);
                const marriageData = await dbManager.getUserMarriage(userId, guildId);
                
                if (marriageData.married) {
                    const marriageId = marriageData.marriage.id;
                    
                    // Look for any active poem for this marriage
                    if (global.marriagePoems) {
                        for (const [id, data] of global.marriagePoems) {
                            if (data.marriageId === marriageId) {
                                poemId = id;
                                poemData = data;
                                break;
                            }
                        }
                    }
                }
            }
            
            if (!poemId || !poemData) {
                await interaction.update({
                    content: '❌ No active poem session found. Start a new poem with `/marriage-task task3`.',
                    embeds: [],
                    components: []
                });
                return;
            }
            
            // Route to appropriate handler
            if (customId === 'add_verse') {
                await this.handleAddVerse(interaction, poemData, poemId);
            } else if (customId === 'finish_poem') {
                await this.handleFinishPoem(interaction, poemData, poemId);
            }
            
        } catch (error) {
            logger.error(`Error handling poem button ${customId}: ${error.message}`);
            await interaction.update({
                content: '❌ Error processing poem action. Please try again.',
                embeds: [],
                components: []
            });
        }
    },

    async handleAddVerse(interaction, poemData, poemId) {
        const { poem, partner1, partner2 } = poemData;
        const userId = interaction.user.id;
        
        // Check if it's the user's turn
        const currentPlayer = poemData.currentTurn % 2 === 0 ? partner1 : partner2;
        if (userId !== currentPlayer.id) {
            await interaction.update({
                content: `⚠️ It's ${currentPlayer.name}'s turn to add a verse!`,
                embeds: interaction.message.embeds,
                components: interaction.message.components
            });
            return;
        }
        
        // Create modal for verse input
        const modal = new ModalBuilder()
            .setCustomId(`poem_line_input_${poemId}`)
            .setTitle('✍️ Add Your Verse');

        const lineInput = new TextInputBuilder()
            .setCustomId('poem_line')
            .setLabel('Your verse line')
            .setStyle(TextInputStyle.Short)
            .setMaxLength(100)
            .setRequired(true);

        const firstActionRow = new ActionRowBuilder().addComponents(lineInput);
        modal.addComponents(firstActionRow);

        await interaction.showModal(modal);
    },

    async handleFinishPoem(interaction, poemData, poemId) {
        const { poem, partner1, partner2 } = poemData;
        
        if (poem.lines.length < 2) {
            await interaction.update({
                content: '❌ Need at least 2 lines to finish the poem!',
                embeds: interaction.message.embeds,
                components: interaction.message.components
            });
            return;
        }
        
        // Mark poem as complete and show final result
        poem.isComplete = true;
        poemData.completed = true;
        
        const embed = new EmbedBuilder()
            .setTitle('🎉 Poem Complete!')
            .setDescription(`**${partner1.name}** and **${partner2.name}** have finished their poem!\n\n**Theme:** ${poem.theme}\n\n${poem.getDisplayText()}`)
            .addFields({
                name: '📊 Statistics',
                value: `**Total Lines:** ${poem.lines.length}\n**Authors:** ${partner1.name} & ${partner2.name}`,
                inline: false
            })
            .setColor(0x9B59B6)
            .setFooter({ text: '🎉 Task 3 Completed!' });

        // Create quiz history button
        const historyButton = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('poem_history')
                    .setLabel('View Poem History')
                    .setEmoji('📚')
                    .setStyle(ButtonStyle.Secondary)
            );

        await interaction.update({
            content: '🎉 Poem completed successfully!',
            embeds: [embed],
            components: [historyButton]
        });
        
        // Mark task as completed and award XP
        try {
            const guildId = await getGuildId(interaction);
            const marriageData = await dbManager.getUserMarriage(interaction.user.id, guildId);
            const marriageId = marriageData.marriage.id;
            
            await dbManager.completeMarriageTask(marriageId, 3, interaction.user.id, {
                gameType: 'poem',
                lines: poem.lines.length,
                theme: poem.theme
            });

            // Award Marriage XP for completing the poem task
            const xpResult = await dbManager.awardMarriageXP(
                marriageId, 
                30, 
                'task_completion', 
                `Poem task completed - ${poem.lines.length} lines written`
            );

            // Send level up notification if it happened
            if (xpResult.leveledUp) {
                logger.info(`Marriage ${marriageId} leveled up! ${xpResult.oldLevel} -> ${xpResult.newLevel}`);
                await this.sendLevelUpNotification(interaction, xpResult, partner1, partner2);
            }

        } catch (error) {
            logger.error(`Error marking poem task as completed: ${error.message}`);
        }
        
        // Post poem to upvote channel
        try {
            const upvoteChannelId = '1419057346952564978';
            const upvoteChannel = interaction.client.channels.cache.get(upvoteChannelId);
            
            if (upvoteChannel) {
                const upvoteEmbed = new EmbedBuilder()
                    .setTitle('📜 New Poem Completed!')
                    .setDescription(`**Authors:** ${partner1.name} & ${partner2.name}\n**Theme:** ${poem.theme}\n\n${poem.getDisplayText()}`)
                    .addFields({
                        name: '📊 Stats',
                        value: `**Lines:** ${poem.lines.length}\n**Created:** <t:${Math.floor(Date.now() / 1000)}:R>`,
                        inline: true
                    })
                    .setColor(0x9B59B6)
                    .setFooter({ text: `Poem ID: ${poemId}` });

                const upvoteButton = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`poem_upvote_${poemId}`)
                            .setLabel('0')
                            .setEmoji('👍')
                            .setStyle(ButtonStyle.Secondary)
                    );

                const upvoteMessage = await upvoteChannel.send({
                    embeds: [upvoteEmbed],
                    components: [upvoteButton]
                });

                // Store upvote data
                if (!global.poemUpvotes) {
                    global.poemUpvotes = new Map();
                }
                
                global.poemUpvotes.set(poemId, {
                    messageId: upvoteMessage.id,
                    channelId: upvoteChannelId,
                    upvotes: 0,
                    voters: new Set(),
                    poem: {
                        text: poem.getDisplayText(),
                        authors: [partner1.name, partner2.name],
                        theme: poem.theme?.title || 'Custom',
                        verses: poem.verses.length
                    }
                });

                logger.info(`Posted poem ${poemId} to upvote channel ${upvoteChannelId}`);
            }
        } catch (error) {
            logger.error(`Error posting poem to upvote channel: ${error.message}`);
        }
        
        // Clean up the session
        global.marriagePoems.delete(poemId);
    },

    async handlePoemPreview(interaction, poemData) {
        const { poem, partner1, partner2 } = poemData;

        const embed = new EmbedBuilder()
            .setTitle('📖 Poem Preview')
            .setDescription(`**Theme:** ${poem.theme}\n**Authors:** ${partner1.name} & ${partner2.name}\n\n${poem.getDisplayText() || '*No lines written yet...*'}`)
            .addFields({
                name: '📊 Progress',
                value: `**Lines:** ${poem.lines.length}/8\n**Status:** ${poem.isComplete ? 'Complete ✅' : 'In Progress 📝'}`,
                inline: false
            })
            .setColor(0xFF1493);

        await this.safeInteractionReply(interaction, {
            embeds: [embed],
            ephemeral: true
        });
    },

    async handlePoemPublish(interaction, poemData, poemId) {
        const { poem, partner1, partner2 } = poemData;

        if (!poem.isComplete) {
            await interaction.reply({
                content: '❌ Poem must be complete (8 lines) before publishing!',
                ephemeral: true
            });
            return;
        }

        if (poem.published) {
            await interaction.reply({
                content: '❌ This poem has already been published!',
                ephemeral: true
            });
            return;
        }

        // Mark as published
        poem.published = true;

        // Create voting embed
        const publishEmbed = new EmbedBuilder()
            .setTitle('📝 New Marriage Poem!')
            .setDescription(`**${partner1.name}** and **${partner2.name}** wrote a collaborative poem!\n\n**Theme:** ${poem.theme}\n\n${poem.getDisplayText()}`)
            .addFields({
                name: '🗳️ Vote for this poem!',
                value: 'React with 👍 if you enjoyed this poem!\nThe couple needs at least 1 vote to complete their weekly task.',
                inline: false
            })
            .setColor(0xFF1493)
            .setTimestamp()
            .setFooter({ text: `Poem by ${partner1.name} & ${partner2.name}` });

        const voteButtons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`poem_vote_up_${poemId}`)
                    .setLabel('👍 Love it!')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`poem_vote_down_${poemId}`)
                    .setLabel('👎 Not for me')
                    .setStyle(ButtonStyle.Danger)
            );

        // Send to channel for public voting
        await this.safeReply(interaction, {
            content: `🎉 **${partner1.name}** and **${partner2.name}** have published their poem for voting!`,
            embeds: [publishEmbed],
            components: [voteButtons]
        });

        // Clean up after 24 hours
        setTimeout(() => {
            global.marriagePoems.delete(poemId);
        }, 24 * 60 * 60 * 1000);
    },

    // Handle poem modal submission
    async handlePoemLineSubmission(interaction) {
        try {
            logger.info(`Poem line submission received from user ${interaction.user.id}, customId: ${interaction.customId}`);
            
            const poemId = interaction.customId.split('_').slice(3).join('_');
            const poemLine = interaction.fields.getTextInputValue('poem_line');
            
            logger.info(`Parsed poemId: ${poemId}, line: "${poemLine}"`);

            if (!global.marriagePoems?.has(poemId)) {
                logger.warn(`Poem session not found for poemId: ${poemId}`);
                await interaction.reply({
                    content: '❌ This poem session has expired.',
                    ephemeral: true
                });
                return;
            }

            const poemData = global.marriagePoems.get(poemId);
            const { poem, partner1, partner2, currentTurn } = poemData;
            
            logger.info(`Found poem data, current turn: ${currentTurn}, user: ${interaction.user.id}`);

            // Add the line
            const result = poem.addLine(poemLine, interaction.user.id, interaction.user.displayName);
            
            logger.info(`addLine result:`, result);
            
            if (!result.success) {
                await this.safeInteractionReply(interaction, {
                    content: `❌ ${result.message}`,
                    ephemeral: true
                });
                return;
            }

            // Switch turns
            poemData.currentTurn = poem.getNextTurn(currentTurn, partner1.id, partner2.id);
            
                logger.info(`Line added successfully, new turn: ${poemData.currentTurn}`);

            // Update the embed
            const embed = new EmbedBuilder()
                .setTitle('📝 Collaborative Poem Writing!')
                .setDescription(`**${partner1.name}** and **${partner2.name}** are writing a poem together!\n\n📖 **Theme:** ${poem.theme}\n✍️ **Current Turn:** ${poem.isComplete ? 'Complete!' : `<@${poemData.currentTurn}>`}\n📏 **Lines Written:** ${poem.lines.length}/8\n\n**Current Poem:**\n${poem.getDisplayText()}`)
                .setColor(poem.isComplete ? 0x00FF00 : 0xFF1493)
                .setFooter({ text: `Poem ID: ${poemId} • Theme: ${poem.theme}` });

            if (poem.isComplete) {
                embed.addFields({
                    name: '🎉 Poem Complete!',
                    value: 'Your collaborative poem is finished! Click "Publish for Voting" to share it with the community and complete your task.',
                    inline: false
                });
            }

            const actionButtons = this.createPoemButtons(poemId, poem, poemData.currentTurn);

            await this.safeReply(interaction, {
                embeds: [embed],
                components: actionButtons
            });
            
            logger.info(`Poem submission completed successfully for user ${interaction.user.id}`);
            
        } catch (error) {
            logger.error(`Error in handlePoemLineSubmission: ${error.message}`, error);
            try {
                await interaction.reply({
                    content: '❌ Something went wrong while adding your line. Please try again.',
                    ephemeral: true
                });
            } catch (replyError) {
                logger.error(`Failed to send error reply: ${replyError.message}`);
            }
        }
    },

    // Handle poem voting
    async handlePoemVote(interaction) {
        const parts = interaction.customId.split('_');
        const voteType = parts[2]; // 'up' or 'down'
        const poemId = parts.slice(3).join('_');

        // Check if this is from the database voting system
        const voteData = await dbManager.getPoemVote(poemId);
        if (!voteData) {
            await interaction.reply({
                content: '❌ This poem voting has expired.',
                ephemeral: true
            });
            return;
        }

        const userId = interaction.user.id;

        // Check if user already voted
        if (voteData.voters.includes(userId)) {
            await interaction.reply({
                content: '❌ You have already voted on this poem!',
                ephemeral: true
            });
            return;
        }

        // Update vote in database
        const updateResult = await dbManager.updatePoemVote(poemId, voteType, userId);
        if (!updateResult.success) {
            await interaction.reply({
                content: updateResult.reason === 'already_voted' ? 
                    '❌ You have already voted on this poem!' : 
                    '❌ Failed to record your vote. Please try again.',
                ephemeral: true
            });
            return;
        }

        // Update button labels with new vote counts
        const updatedButtons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`poem_vote_up_${poemId}`)
                    .setLabel(updateResult.upvotes.toString())
                    .setEmoji('👍')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`poem_vote_down_${poemId}`)
                    .setLabel(updateResult.downvotes.toString())
                    .setEmoji('👎')
                    .setStyle(ButtonStyle.Danger)
            );

        // Update the message with new vote counts
        try {
            await interaction.update({
                components: [updatedButtons]
            });
        } catch (error) {
            logger.error(`Error updating poem vote buttons: ${error.message}`);
            await interaction.reply({
                content: `✅ Vote recorded! 👍 ${voteData.upvotes} | 👎 ${voteData.downvotes}`,
                ephemeral: true
            });
            return;
        }

        // Check if poem has enough votes to complete the task (only if not already completed)
        if (!voteData.taskCompleted) {
            await this.checkPoemTaskCompletion(poemId, voteData);
        }
    },

    async handlePoemUpvote(interaction) {
        const parts = interaction.customId.split('_');
        const poemId = parts.slice(2).join('_');
        const userId = interaction.user.id;

        if (!global.poemUpvotes?.has(poemId)) {
            await interaction.reply({
                content: '❌ This poem upvote has expired.',
                ephemeral: true
            });
            return;
        }

        const upvoteData = global.poemUpvotes.get(poemId);

        // Check if user already voted
        if (upvoteData.voters.has(userId)) {
            await interaction.reply({
                content: '❌ You have already upvoted this poem!',
                ephemeral: true
            });
            return;
        }

        // Add vote
        upvoteData.voters.add(userId);
        upvoteData.upvotes++;

        // Update the button with new count
        const updatedButton = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`poem_upvote_${poemId}`)
                    .setLabel(upvoteData.upvotes.toString())
                    .setEmoji('👍')
                    .setStyle(ButtonStyle.Secondary)
            );

        try {
            await interaction.update({
                components: [updatedButton]
            });
            
            // Send confirmation to user
            await interaction.followUp({
                content: `👍 You upvoted the poem by **${upvoteData.poem.authors.join(' & ')}**! (Total: ${upvoteData.upvotes} upvotes)`,
                ephemeral: true
            });
        } catch (error) {
            logger.error(`Error updating poem upvote: ${error.message}`);
            await interaction.reply({
                content: '✅ Your upvote has been recorded!',
                ephemeral: true
            });
        }
    },

    async handlePoemHistory(interaction) {
        try {
            const userId = interaction.user.id;
            const guildId = await getGuildId(interaction);
            
            // Check if user is married
            const marriageData = await dbManager.getUserMarriage(userId, guildId);
            if (!marriageData.married) {
                await this.safeInteractionReply(interaction, {
                    content: '❌ You must be married to view poem history!',
                    ephemeral: true
                });
                return;
            }

            // Get poem history from upvotes (placeholder for now)
            const historyEmbed = new EmbedBuilder()
                .setTitle('📚 Poem History')
                .setDescription(`**${marriageData.marriage.partner1_name}** & **${marriageData.marriage.partner2_name}**`)
                .addFields(
                    {
                        name: '📜 Recent Poems',
                        value: 'No poem history available yet.\nComplete some poems to see your history here!',
                        inline: false
                    },
                    {
                        name: '📊 Statistics',
                        value: 'Total Poems: 0\nTotal Upvotes: 0\nBest Poem: N/A',
                        inline: false
                    }
                )
                .setColor(0x9B59B6)
                .setTimestamp();

            await this.safeInteractionReply(interaction, {
                embeds: [historyEmbed],
                ephemeral: true
            });

        } catch (error) {
            logger.error(`Error showing poem history: ${error.message}`);
            await this.safeInteractionReply(interaction, {
                content: '❌ Error loading poem history. Please try again.',
                ephemeral: true
            });
        }
    },

    // Handle tic tac toe move buttons
    async handleTicTacToeMove(interaction) {
        const position = parseInt(interaction.customId.split('_')[2]);
        
        // Find the game from the message footer
        const gameId = interaction.message.embeds[0]?.footer?.text?.replace('Game ID: ', '');
        
        if (!gameId || !global.marriageGames?.has(gameId)) {
            await this.safeInteractionReply(interaction, {
                content: '❌ This game has expired or is invalid.',
                ephemeral: true
            });
            return;
        }

        const gameData = global.marriageGames.get(gameId);
        const { game, player1, player2 } = gameData;
        
        // Check if it's the player's turn
        const currentPlayerId = game.currentPlayer === 'X' ? player1.id : player2.id;
        if (interaction.user.id !== currentPlayerId) {
            await this.safeInteractionReply(interaction, {
                content: `❌ It's not your turn! Wait for ${game.currentPlayer === 'X' ? player1.name : player2.name} to play.`,
                ephemeral: true
            });
            return;
        }

        // Make the move
        const moveSuccess = game.makeMove(position, game.currentPlayer);
        if (!moveSuccess) {
            await this.safeInteractionReply(interaction, {
                content: '❌ Invalid move! That position is already taken.',
                ephemeral: true
            });
            return;
        }

        // Update the embed
        let description = `**${player1.name}** (X) vs **${player2.name}** (O)\n\n`;
        
        if (game.gameOver) {
            if (game.winner === 'tie') {
                description += "🤝 It's a tie! Great game!";
            } else {
                const winnerName = game.winner === 'X' ? player1.name : player2.name;
                description += `🎉 **${winnerName}** wins!\n\n✅ **Task 1 Completed!** Tic Tac Toe victory achieved! 🏆`;
                
                // Mark task as completed in database and award XP
                try {
                    await dbManager.completeMarriageTask(gameData.marriageId, 1, interaction.user.id, {
                        gameType: 'tictactoe',
                        winner: winnerName,
                        moves: game.moves
                    });

                    // Award Marriage XP for completing the task
                    const xpResult = await dbManager.awardMarriageXP(
                        gameData.marriageId, 
                        25, 
                        'task_completion', 
                        'Tic Tac Toe task completed'
                    );

                    // Send level up notification if it happened
                    if (xpResult.leveledUp) {
                        logger.info(`Marriage ${gameData.marriageId} leveled up! ${xpResult.oldLevel} -> ${xpResult.newLevel}`);
                        await this.sendLevelUpNotification(interaction, xpResult, gameData.partner1, gameData.partner2);
                    }

                } catch (error) {
                    logger.error(`Error marking tic tac toe task as completed: ${error.message}`);
                }
            }
            
            // Clean up the game
            global.marriageGames.delete(gameId);
        } else {
            const nextPlayerName = game.currentPlayer === 'X' ? player1.name : player2.name;
            description += `It's **${nextPlayerName}**'s turn!`;
        }

        const embed = new EmbedBuilder()
            .setTitle('🎯 Tic Tac Toe Game')
            .setDescription(description)
            .setColor(game.gameOver ? (game.winner === 'tie' ? 0xFFFF00 : 0x00FF00) : 0xFF69B4)
            .setFooter({ text: game.gameOver ? 'Game Over' : `Game ID: ${gameId}` });

        await this.safeReply(interaction, {
            embeds: [embed],
            components: game.createButtons()
        });
    },

    async startTreeGame(interaction) {
        try {
            const guildId = await getGuildId(interaction);
            const marriageData = await dbManager.getUserMarriage(interaction.user.id, guildId);
            const marriage = marriageData.marriage;

            // Create new tree care game
            const tree = this.createTreeGame();
            tree.startTime = Date.now(); // Set the start time on the tree object
            tree.checkDayProgress(); // Initialize day progress
            
            // Store tree in memory
            global.marriageTrees = global.marriageTrees || new Map();
            const treeId = `tree_${marriage.id}_${Date.now()}`;
            global.marriageTrees.set(treeId, {
                tree,
                marriageId: marriage.id,
                partner1: { id: interaction.user.id, name: interaction.user.displayName },
                partner2: { id: marriage.partnerId, name: marriage.partnerName },
                startTime: Date.now(),
                lastCareTime: 0,
                completionGoal: 7 // 7 days to complete
            });

            const embed = new EmbedBuilder()
                .setTitle('🌱 Tree Planting Started!')
                .setDescription(`**${interaction.user.displayName}** and **${marriage.partnerName}** have planted a virtual tree!\n\n🌱 **Tree Status:** ${tree.getStatusEmoji()} ${tree.stage}\n💧 **Health:** ${tree.health}/100\n📅 **Days Alive:** ${tree.daysAlive}/${tree.targetDays}\n⏰ **Last Care:** Never`)
                .addFields({
                    name: '🌳 Care Instructions',
                    value: 'Take turns caring for your tree daily:\n• 💧 **Water** - Essential for growth\n• ☀️ **Sunlight** - Helps photosynthesis\n• 🪴 **Fertilize** - Boosts health\n• 🐛 **Pest Check** - Prevents damage\n\nEach partner can care once per day. Keep it alive for 7 days to complete the task!',
                    inline: false
                })
                .setColor(tree.getColor())
                .setFooter({ text: `Tree ID: ${treeId} • Goal: Survive 7 days` });

            const careButtons = this.createTreeCareButtons(treeId, tree);

            await this.safeReply(interaction, {
                embeds: [embed],
                components: careButtons
            });

        } catch (error) {
            logger.error(`Error starting tree game: ${error.message}`);
            await this.safeReply(interaction, {
                content: '❌ Error starting tree planting game. Please try again.',
                embeds: [],
                components: []
            });
        }
    },

    async startPoemGame(interaction) {
        try {
            const guildId = await getGuildId(interaction);
            const marriageData = await dbManager.getUserMarriage(interaction.user.id, guildId);
            const marriage = marriageData.marriage;

            // Create new poem writing session
            const poem = this.createPoemGame();
            
            // Store poem in memory
            global.marriagePoems = global.marriagePoems || new Map();
            const poemId = `poem_${marriage.id}_${Date.now()}`;
            global.marriagePoems.set(poemId, {
                poem,
                marriageId: marriage.id,
                partner1: { id: interaction.user.id, name: interaction.user.displayName },
                partner2: { id: marriage.partnerId, name: marriage.partnerName },
                startTime: Date.now(),
                currentTurn: interaction.user.id // Person who starts gets first turn
            });

            const embed = new EmbedBuilder()
                .setTitle('📝 Collaborative Poem Writing!')
                .setDescription(`**${interaction.user.displayName}** and **${marriage.partnerName}** are writing a poem together!\n\n📖 **Theme:** ${poem.theme}\n✍️ **Current Turn:** <@${interaction.user.id}>\n📏 **Lines Written:** ${poem.lines.length}/8\n\n**Current Poem:**\n${poem.getDisplayText()}`)
                .addFields({
                    name: '🎭 How It Works',
                    value: '• Take turns adding lines to the poem\n• Each person adds one line at a time\n• Write 8 lines total about the theme\n• Submit for community voting when complete\n• Get at least 1 positive vote to complete the task!',
                    inline: false
                })
                .setColor(0xFF1493)
                .setFooter({ text: `Poem ID: ${poemId} • Theme: ${poem.theme}` });

            const actionButtons = this.createPoemButtons(poemId, poem, interaction.user.id);

            await this.safeReply(interaction, {
                embeds: [embed],
                components: actionButtons
            });

        } catch (error) {
            logger.error(`Error starting poem game: ${error.message}`);
            await this.safeReply(interaction, {
                content: '❌ Error starting poem writing. Please try again.',
                embeds: [],
                components: []
            });
        }
    },

    async startQuizGame(interaction) {
        try {
            const guildId = await getGuildId(interaction);
            const marriageData = await dbManager.getUserMarriage(interaction.user.id, guildId);
            const marriage = marriageData.marriage;

            // Create new quiz session
            const quiz = this.createQuizGame();
            
            // Store quiz in memory
            global.marriageQuizzes = global.marriageQuizzes || new Map();
            const quizId = `quiz_${marriage.id}_${Date.now()}`;
            const quizData = {
                quiz,
                marriageId: marriage.id,
                partner1: { id: interaction.user.id, name: interaction.user.displayName },
                partner2: { id: marriage.partnerId, name: marriage.partnerName },
                startTime: Date.now(),
                currentQuestionIndex: 0,
                partner1AboutSelf: {}, // Partner 1's answers about themselves
                partner2AboutSelf: {}, // Partner 2's answers about themselves
                partner1AboutPartner2: {}, // Partner 1's guesses about Partner 2
                partner2AboutPartner1: {}, // Partner 2's guesses about Partner 1
                completed: false,
                expiresAt: Date.now() + (60 * 60 * 1000) // 60 minutes for quiz completion
            };
            global.marriageQuizzes.set(quizId, quizData);

            // Start with first question
            const currentQuestion = quiz.questions[0];
            
            const embed = new EmbedBuilder()
                .setTitle('❓ Couple Compatibility Quiz!')
                .setDescription(`**${interaction.user.displayName}** and **${marriage.partnerName}** are taking a compatibility quiz!\n\n**📋 Phase 1:** ${interaction.user.displayName} answers about themselves\n**📋 Phase 2:** ${marriage.partnerName} answers about themselves\n**📋 Phase 3:** ${interaction.user.displayName} guesses ${marriage.partnerName}'s answers\n**📋 Phase 4:** ${marriage.partnerName} guesses ${interaction.user.displayName}'s answers\n**📋 Phase 5:** See results!\n\n🎯 **Goal:** Score 80% or higher together`)
                .addFields({
                    name: `🔥 **YOUR TURN:** <@${interaction.user.id}>`,
                    value: `**Question 1/${quiz.questions.length}**`,
                    inline: false
                },
                {
                    name: `❓ **${currentQuestion.question}**`,
                    value: `<@${interaction.user.id}>, please answer this question about **yourself**. Only you can answer right now.`,
                    inline: false
                })
                .setColor(0x9B59B6)
                .setFooter({ text: `Quiz ID: ${quizId} • Phase 1: ${interaction.user.displayName} about self` });

            const answerButtons = this.createQuizButtons(quizId, currentQuestion, 0);

            await this.safeReply(interaction, {
                embeds: [embed],
                components: answerButtons
            });

        } catch (error) {
            logger.error(`Error starting quiz game: ${error.message}`);
            await this.safeReply(interaction, {
                content: '❌ Error starting compatibility quiz. Please try again.',
                embeds: [],
                components: []
            });
        }
    },

    createQuizGame() {
        const questions = [
            {
                question: "What is your favorite color?",
                options: ["Red", "Blue", "Green", "Purple", "Pink", "Black"]
            },
            {
                question: "What time do you usually go to bed?",
                options: ["Before 9 PM", "9-10 PM", "10-11 PM", "11-12 AM", "After 12 AM", "It varies"]
            },
            {
                question: "What's your favorite type of music?",
                options: ["Pop", "Rock", "Hip Hop", "Classical", "Electronic", "Country"]
            },
            {
                question: "What's your ideal vacation?",
                options: ["Beach Resort", "Mountain Cabin", "City Adventure", "Theme Park", "Camping", "Staycation"]
            },
            {
                question: "What's your biggest fear?",
                options: ["Heights", "Spiders", "Public Speaking", "Dark", "Failure", "Being Alone"]
            },
            {
                question: "What's your favorite season?",
                options: ["Spring", "Summer", "Fall", "Winter", "No Preference", "Depends on Mood"]
            },
            {
                question: "How do you handle stress?",
                options: ["Talk It Out", "Exercise", "Sleep", "Eat", "Watch TV", "Listen to Music"]
            },
            {
                question: "What's your dream job?",
                options: ["Entrepreneur", "Artist", "Teacher", "Doctor", "Tech Worker", "Content Creator"]
            },
            {
                question: "What's your love language?",
                options: ["Words of Affirmation", "Physical Touch", "Acts of Service", "Quality Time", "Gifts", "All of Them"]
            },
            {
                question: "What's your favorite way to spend a free day?",
                options: ["Gaming", "Reading", "Outdoor Activities", "Socializing", "Sleeping In", "Learning Something New"]
            }
        ];

        // Shuffle and pick 5 random questions
        const shuffled = questions.sort(() => 0.5 - Math.random());
        const selectedQuestions = shuffled.slice(0, 5);

        return {
            questions: selectedQuestions,
            totalQuestions: selectedQuestions.length,
            requiredScore: 0.8, // 80% compatibility required
            phase: 'partner1_about_self', // partner1_about_self, partner2_about_self, partner1_guessing, partner2_guessing, results
            currentQuestionIndex: 0,

            calculateScore(p1About1, p2About2, p1About2, p2About1) {
                let p1Matches = 0; // How well partner1 knows partner2
                let p2Matches = 0; // How well partner2 knows partner1
                const totalQuestions = this.questions.length;
                
                for (let i = 0; i < totalQuestions; i++) {
                    const questionKey = `q${i}`;
                    
                    // Check if partner1's guess about partner2 matches partner2's self-answer
                    if (p1About2[questionKey] && p2About2[questionKey] && 
                        p1About2[questionKey] === p2About2[questionKey]) {
                        p1Matches++;
                    }
                    
                    // Check if partner2's guess about partner1 matches partner1's self-answer
                    if (p2About1[questionKey] && p1About1[questionKey] && 
                        p2About1[questionKey] === p1About1[questionKey]) {
                        p2Matches++;
                    }
                }
                
                const p1Percentage = Math.round((p1Matches / totalQuestions) * 100);
                const p2Percentage = Math.round((p2Matches / totalQuestions) * 100);
                const averagePercentage = Math.round((p1Percentage + p2Percentage) / 2);
                
                return {
                    p1Matches,
                    p2Matches,
                    total: totalQuestions,
                    p1Percentage,
                    p2Percentage,
                    averagePercentage,
                    passed: averagePercentage >= (this.requiredScore * 100)
                };
            },

            getResultMessage(score) {
                if (score.averagePercentage >= 90) {
                    return "🎉 **Amazing Compatibility!** You two know each other incredibly well!";
                } else if (score.averagePercentage >= 80) {
                    return "💖 **Great Compatibility!** You have a wonderful understanding of each other!";
                } else if (score.averagePercentage >= 60) {
                    return "😊 **Good Compatibility!** You know each other well, but there's room to learn more!";
                } else if (score.averagePercentage >= 40) {
                    return "🤔 **Moderate Compatibility.** Time to spend more quality time getting to know each other!";
                } else {
                    return "😅 **Learning Opportunity!** This is a chance to discover new things about each other!";
                }
            }
        };
    },

    createQuizButtons(quizId, question, questionIndex) {
        const rows = [];
        const options = question.options;
        
        // Create rows of 3 buttons each
        for (let i = 0; i < options.length; i += 3) {
            const row = new ActionRowBuilder();
            
            for (let j = i; j < Math.min(i + 3, options.length); j++) {
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`quiz_answer_${quizId}_${questionIndex}_${j}`)
                        .setLabel(options[j])
                        .setStyle(ButtonStyle.Primary)
                );
            }
            
            rows.push(row);
        }

        return rows;
    },

    // Handle quiz answer buttons
    async handleQuizAnswer(interaction) {
        // Parse: quiz_answer_quiz_123_1634567890_0_2
        // Extract quizId, questionIndex, and answerIndex properly
        const customId = interaction.customId;
        const parts = customId.split('_');
        
        // The format is: quiz_answer_quiz_marriageId_timestamp_questionIndex_answerIndex
        // So we need to reconstruct the quizId from parts 2, 3, and 4
        const quizId = `${parts[2]}_${parts[3]}_${parts[4]}`;
        const questionIndex = parseInt(parts[5]);
        const answerIndex = parseInt(parts[6]);
        

        if (!global.marriageQuizzes?.has(quizId)) {
            await interaction.update({
                content: '❌ Quiz session not found. Please start a new quiz with `/marriage-task task4`.',
                embeds: [],
                components: []
            });
            return;
        }

        const quizData = global.marriageQuizzes.get(quizId);
        
        // Check expiration - give more time and better error message
        if (Date.now() > quizData.expiresAt) {
            global.marriageQuizzes.delete(quizId);
            await interaction.update({
                content: '❌ This quiz session has timed out. Please start a new quiz with `/marriage-task task4`.',
                embeds: [],
                components: []
            });
            return;
        }

        const { quiz, partner1, partner2, completed } = quizData;

        // Check if user is one of the partners - show publicly who can participate
        if (interaction.user.id !== partner1.id && interaction.user.id !== partner2.id) {
            await interaction.update({
                content: `❌ <@${interaction.user.id}> cannot participate! Only <@${partner1.id}> and <@${partner2.id}> can take this quiz.`,
                embeds: [],
                components: []
            });
            return;
        }

        if (completed) {
            await interaction.update({
                content: '❌ This quiz has already been completed!',
                embeds: [],
                components: []
            });
            return;
        }

        // Determine current phase and validate who can answer
        const isPartner1 = interaction.user.id === partner1.id;
        const currentPhase = quiz.phase;
        
        // Phase validation - show publicly who needs to answer
        if (currentPhase === 'partner1_about_self' && !isPartner1) {
            // Don't update the message, just indicate who should answer
            const currentQuestion = quiz.questions[quizData.currentQuestionIndex];
            const embed = new EmbedBuilder()
                .setTitle('❓ Couple Compatibility Quiz!')
                .setDescription(`**${partner1.name}** and **${partner2.name}** are taking a compatibility quiz!`)
                .addFields({
                    name: `🔥 **WAITING FOR:** <@${partner1.id}>`,
                    value: `**Question ${quizData.currentQuestionIndex + 1}/${quiz.questions.length}**`,
                    inline: false
                },
                {
                    name: `❓ **${currentQuestion.question}**`,
                    value: `<@${partner1.id}>, please answer this question about **yourself**. Only you can answer right now.`,
                    inline: false
                })
                .setColor(0x9B59B6)
                .setFooter({ text: `Quiz ID: ${quizId} • Phase 1: ${partner1.name} about self` });
            
            const answerButtons = this.createQuizButtons(quizId, currentQuestion, quizData.currentQuestionIndex);
            
            await interaction.update({
                content: `⚠️ <@${partner2.id}> tried to answer, but it's <@${partner1.id}>'s turn!`,
                embeds: [embed],
                components: answerButtons
            });
            return;
        }
        
        if (currentPhase === 'partner2_about_self' && isPartner1) {
            const currentQuestion = quiz.questions[quizData.currentQuestionIndex];
            const embed = new EmbedBuilder()
                .setTitle('❓ Couple Compatibility Quiz!')
                .setDescription(`**${partner1.name}** and **${partner2.name}** are taking a compatibility quiz!`)
                .addFields({
                    name: `🔥 **WAITING FOR:** <@${partner2.id}>`,
                    value: `**Question ${quizData.currentQuestionIndex + 1}/${quiz.questions.length}**`,
                    inline: false
                },
                {
                    name: `❓ **${currentQuestion.question}**`,
                    value: `<@${partner2.id}>, please answer this question about **yourself**. Only you can answer right now.`,
                    inline: false
                })
                .setColor(0x9B59B6)
                .setFooter({ text: `Quiz ID: ${quizId} • Phase 2: ${partner2.name} about self` });
            
            const answerButtons = this.createQuizButtons(quizId, currentQuestion, quizData.currentQuestionIndex);
            
            await interaction.update({
                content: `⚠️ <@${partner1.id}> tried to answer, but it's <@${partner2.id}>'s turn!`,
                embeds: [embed],
                components: answerButtons
            });
            return;
        }
        
        if (currentPhase === 'partner1_guessing' && !isPartner1) {
            const currentQuestion = quiz.questions[quizData.currentQuestionIndex];
            const embed = new EmbedBuilder()
                .setTitle('❓ Couple Compatibility Quiz!')
                .setDescription(`**${partner1.name}** and **${partner2.name}** are taking a compatibility quiz!`)
                .addFields({
                    name: `🔥 **WAITING FOR:** <@${partner1.id}>`,
                    value: `**Question ${quizData.currentQuestionIndex + 1}/${quiz.questions.length}**`,
                    inline: false
                },
                {
                    name: `❓ **${currentQuestion.question}**`,
                    value: `<@${partner1.id}>, what do you think **${partner2.name}** answered for this question?`,
                    inline: false
                })
                .setColor(0x9B59B6)
                .setFooter({ text: `Quiz ID: ${quizId} • Phase 3: ${partner1.name} guessing about ${partner2.name}` });
            
            const answerButtons = this.createQuizButtons(quizId, currentQuestion, quizData.currentQuestionIndex);
            
            await interaction.update({
                content: `⚠️ <@${partner2.id}> tried to answer, but it's <@${partner1.id}>'s turn to guess!`,
                embeds: [embed],
                components: answerButtons
            });
            return;
        }
        
        if (currentPhase === 'partner2_guessing' && isPartner1) {
            const currentQuestion = quiz.questions[quizData.currentQuestionIndex];
            const embed = new EmbedBuilder()
                .setTitle('❓ Couple Compatibility Quiz!')
                .setDescription(`**${partner1.name}** and **${partner2.name}** are taking a compatibility quiz!`)
                .addFields({
                    name: `🔥 **WAITING FOR:** <@${partner2.id}>`,
                    value: `**Question ${quizData.currentQuestionIndex + 1}/${quiz.questions.length}**`,
                    inline: false
                },
                {
                    name: `❓ **${currentQuestion.question}**`,
                    value: `<@${partner2.id}>, what do you think **${partner1.name}** answered for this question?`,
                    inline: false
                })
                .setColor(0x9B59B6)
                .setFooter({ text: `Quiz ID: ${quizId} • Phase 4: ${partner2.name} guessing about ${partner1.name}` });
            
            const answerButtons = this.createQuizButtons(quizId, currentQuestion, quizData.currentQuestionIndex);
            
            await interaction.update({
                content: `⚠️ <@${partner1.id}> tried to answer, but it's <@${partner2.id}>'s turn to guess!`,
                embeds: [embed],
                components: answerButtons
            });
            return;
        }

        const currentQuestion = quiz.questions[questionIndex];
        const selectedAnswer = currentQuestion.options[answerIndex];
        const questionKey = `q${questionIndex}`;

        // Store answer in appropriate category
        let answerCategory;
        if (currentPhase === 'partner1_about_self') {
            answerCategory = quizData.partner1AboutSelf;
        } else if (currentPhase === 'partner2_about_self') {
            answerCategory = quizData.partner2AboutSelf;
        } else if (currentPhase === 'partner1_guessing') {
            answerCategory = quizData.partner1AboutPartner2;
        } else if (currentPhase === 'partner2_guessing') {
            answerCategory = quizData.partner2AboutPartner1;
        }

        // Check if already answered this question in current phase
        if (answerCategory[questionKey]) {
            await this.safeInteractionReply(interaction, {
                content: '❌ You have already answered this question!',
                ephemeral: true
            });
            return;
        }

        // Record the answer
        answerCategory[questionKey] = selectedAnswer;

        // Track the choice in game analytics
        try {
            const gameUtils = require('../UTILS/gameUtils');
            await gameUtils.recordGameChoice('quiz', interaction.user.id, selectedAnswer, {
                questionIndex: questionIndex,
                phase: currentPhase,
                questionText: currentQuestion.question,
                optionIndex: answerIndex,
                responseTime: Date.now() - (quizData.questionStartTime || Date.now())
            });
        } catch (trackingError) {
            logger.error(`Failed to track quiz choice: ${trackingError.message}`);
        }

        // Move to next question or next phase
        await this.progressQuiz(interaction, quizData, quizId);
    },

    async progressQuiz(interaction, quizData, quizId) {
        const { quiz, partner1, partner2 } = quizData;
        const currentPhase = quiz.phase;
        
        // Check if current phase is complete
        const questionsComplete = this.isPhaseComplete(quizData, currentPhase);
        
        if (!questionsComplete) {
            // Show next question in current phase
            quiz.currentQuestionIndex++;
            const nextQuestion = quiz.questions[quiz.currentQuestionIndex];
            
            let phaseDescription, instructions, activePlayer;
            
            if (currentPhase === 'partner1_about_self') {
                phaseDescription = `**📋 Phase 1:** ${partner1.name} answers about themselves`;
                instructions = `<@${partner1.id}>, please answer this question about **yourself**.`;
                activePlayer = `<@${partner1.id}>`;
            } else if (currentPhase === 'partner2_about_self') {
                phaseDescription = `**📋 Phase 2:** ${partner2.name} answers about themselves`;
                instructions = `<@${partner2.id}>, please answer this question about **yourself**.`;
                activePlayer = `<@${partner2.id}>`;
            } else if (currentPhase === 'partner1_guessing') {
                phaseDescription = `**📋 Phase 3:** ${partner1.name} guesses ${partner2.name}'s answers`;
                instructions = `<@${partner1.id}>, what do you think **${partner2.name}** answered for this question?`;
                activePlayer = `<@${partner1.id}>`;
            } else if (currentPhase === 'partner2_guessing') {
                phaseDescription = `**📋 Phase 4:** ${partner2.name} guesses ${partner1.name}'s answers`;
                instructions = `<@${partner2.id}>, what do you think **${partner1.name}** answered for this question?`;
                activePlayer = `<@${partner2.id}>`;
            }
            
            const embed = new EmbedBuilder()
                .setTitle('❓ Couple Compatibility Quiz!')
                .setDescription(`**${partner1.name}** and **${partner2.name}** are taking a compatibility quiz!\n\n${phaseDescription}\n\n🎯 **Goal:** Score 80% or higher together`)
                .addFields({
                    name: `🔥 **YOUR TURN:** ${activePlayer}`,
                    value: `**Question ${quiz.currentQuestionIndex + 1}/${quiz.questions.length}**`,
                    inline: false
                },
                {
                    name: `❓ **${nextQuestion.question}**`,
                    value: instructions,
                    inline: false
                })
                .setColor(0x9B59B6)
                .setFooter({ text: `Quiz ID: ${quizId} • ${phaseDescription}` });

            const answerButtons = this.createQuizButtons(quizId, nextQuestion, quiz.currentQuestionIndex);
            
            await this.safeReply(interaction, {
                embeds: [embed],
                components: answerButtons
            });
            
        } else {
            // Current phase complete, move to next phase
            await this.moveToNextPhase(interaction, quizData, quizId);
        }
    },

    isPhaseComplete(quizData, phase) {
        const { quiz } = quizData;
        const totalQuestions = quiz.questions.length;
        
        let responseCategory;
        if (phase === 'partner1_about_self') {
            responseCategory = quizData.partner1AboutSelf;
        } else if (phase === 'partner2_about_self') {
            responseCategory = quizData.partner2AboutSelf;
        } else if (phase === 'partner1_guessing') {
            responseCategory = quizData.partner1AboutPartner2;
        } else if (phase === 'partner2_guessing') {
            responseCategory = quizData.partner2AboutPartner1;
        }
        
        return Object.keys(responseCategory).length >= totalQuestions;
    },

    async moveToNextPhase(interaction, quizData, quizId) {
        const { quiz, partner1, partner2 } = quizData;
        const currentPhase = quiz.phase;
        
        // Determine next phase
        let nextPhase;
        if (currentPhase === 'partner1_about_self') {
            nextPhase = 'partner2_about_self';
        } else if (currentPhase === 'partner2_about_self') {
            nextPhase = 'partner1_guessing';
        } else if (currentPhase === 'partner1_guessing') {
            nextPhase = 'partner2_guessing';
        } else if (currentPhase === 'partner2_guessing') {
            nextPhase = 'results';
        }
        
        if (nextPhase === 'results') {
            // Show final results
            await this.showQuizResults(interaction, quizData, quizId);
            return;
        }
        
        // Update phase and reset question index
        quiz.phase = nextPhase;
        quiz.currentQuestionIndex = 0;
        
        const firstQuestion = quiz.questions[0];
        let phaseDescription, instructions, activePlayer;
        
        if (nextPhase === 'partner2_about_self') {
            phaseDescription = `**📋 Phase 2:** ${partner2.name} answers about themselves`;
            instructions = `<@${partner2.id}>, now it's your turn! Please answer this question about **yourself**.`;
            activePlayer = `<@${partner2.id}>`;
        } else if (nextPhase === 'partner1_guessing') {
            phaseDescription = `**📋 Phase 3:** ${partner1.name} guesses ${partner2.name}'s answers`;
            instructions = `<@${partner1.id}>, now try to guess what **${partner2.name}** answered for this question!`;
            activePlayer = `<@${partner1.id}>`;
        } else if (nextPhase === 'partner2_guessing') {
            phaseDescription = `**📋 Phase 4:** ${partner2.name} guesses ${partner1.name}'s answers`;
            instructions = `<@${partner2.id}>, now try to guess what **${partner1.name}** answered for this question!`;
            activePlayer = `<@${partner2.id}>`;
        }
        
        const embed = new EmbedBuilder()
            .setTitle('❓ Couple Compatibility Quiz!')
            .setDescription(`**${partner1.name}** and **${partner2.name}** are taking a compatibility quiz!\n\n${phaseDescription}\n\n🎯 **Goal:** Score 80% or higher together`)
            .addFields({
                name: `🔥 **YOUR TURN:** ${activePlayer}`,
                value: `**Question 1/${quiz.questions.length}**`,
                inline: false
            },
            {
                name: `❓ **${firstQuestion.question}**`,
                value: instructions,
                inline: false
            })
            .setColor(0x9B59B6)
            .setFooter({ text: `Quiz ID: ${quizId} • ${phaseDescription}` });

        const answerButtons = this.createQuizButtons(quizId, firstQuestion, 0);
        
        await this.safeReply(interaction, {
            embeds: [embed],
            components: answerButtons
        });
    },

    async showQuizResults(interaction, quizData, quizId) {
        const { quiz, partner1, partner2, marriageId } = quizData;
        
        // Calculate final scores
        const score = quiz.calculateScore(
            quizData.partner1AboutSelf,
            quizData.partner2AboutSelf,
            quizData.partner1AboutPartner2,
            quizData.partner2AboutPartner1
        );
        
        logger.info(`Quiz results for marriage ${marriageId}: Average score: ${score.averagePercentage}%, Passed: ${score.passed} (required: 80%)`);
        logger.info(`Individual scores: ${partner1.name}: ${score.p1Percentage}%, ${partner2.name}: ${score.p2Percentage}%`);
        
        // Create detailed results
        let resultsDetails = '';
        for (let i = 0; i < quiz.questions.length; i++) {
            const questionKey = `q${i}`;
            const question = quiz.questions[i];
            
            const p1SelfAnswer = quizData.partner1AboutSelf[questionKey];
            const p2SelfAnswer = quizData.partner2AboutSelf[questionKey];
            const p1GuessAboutP2 = quizData.partner1AboutPartner2[questionKey];
            const p2GuessAboutP1 = quizData.partner2AboutPartner1[questionKey];
            
            const p1Correct = p1GuessAboutP2 === p2SelfAnswer ? '✅' : '❌';
            const p2Correct = p2GuessAboutP1 === p1SelfAnswer ? '✅' : '❌';
            
            resultsDetails += `**Q${i+1}:** ${question.question}\n`;
            resultsDetails += `${partner1.name}'s answer: ${p1SelfAnswer}\n`;
            resultsDetails += `${partner2.name}'s answer: ${p2SelfAnswer}\n`;
            resultsDetails += `${partner1.name} guessed ${partner2.name} said: ${p1GuessAboutP2} ${p1Correct}\n`;
            resultsDetails += `${partner2.name} guessed ${partner1.name} said: ${p2GuessAboutP1} ${p2Correct}\n\n`;
        }
        
        quizData.completed = true;
        
        const embed = new EmbedBuilder()
            .setTitle('🏆 Quiz Complete!')
            .setDescription(`**${partner1.name}** and **${partner2.name}** have completed their compatibility quiz!\n\n${quiz.getResultMessage(score)}`)
            .addFields({
                name: '📊 Final Scores',
                value: `**${partner1.name}** knows ${partner2.name}: ${score.p1Matches}/${score.total} (${score.p1Percentage}%)\n**${partner2.name}** knows ${partner1.name}: ${score.p2Matches}/${score.total} (${score.p2Percentage}%)\n**Average Score:** ${score.averagePercentage}%\n**Required:** 80% to pass`,
                inline: false
            },
            {
                name: '📝 Detailed Results',
                value: resultsDetails.length > 1024 ? resultsDetails.substring(0, 1020) + '...' : resultsDetails,
                inline: false
            })
            .setColor(score.passed ? 0x00FF00 : 0xFF0000)
            .setFooter({ text: score.passed ? '🎉 Task 4 Completed!' : 'Better luck next time!' });

        if (score.passed) {
            // Mark task as completed in database and award XP
            try {
                logger.info(`Quiz passed! Attempting to save task completion for marriage ${marriageId}, user ${interaction.user.id}, score: ${score.averagePercentage}%`);
                
                await dbManager.completeMarriageTask(marriageId, 4, interaction.user.id, {
                    gameType: 'quiz',
                    score: score.averagePercentage,
                    p1Score: score.p1Percentage,
                    p2Score: score.p2Percentage,
                    totalQuestions: score.total
                });

                logger.info(`Quiz task completion saved successfully for marriage ${marriageId}`);

                // Award Marriage XP for completing the quiz task
                const xpResult = await dbManager.awardMarriageXP(
                    marriageId, 
                    40, 
                    'task_completion', 
                    `Quiz task completed - ${score.averagePercentage}% average compatibility score`
                );

                // Send level up notification if it happened
                if (xpResult.leveledUp) {
                    logger.info(`Marriage ${marriageId} leveled up! ${xpResult.oldLevel} -> ${xpResult.newLevel}`);
                    await this.sendLevelUpNotification(interaction, xpResult, partner1, partner2);
                }

                // Record quiz game results for both players
                try {
                    const gameUtils = require('../UTILS/gameUtils');
                    
                    // Record for partner 1
                    await gameUtils.recordGameChoice('quiz', partner1.id, 'completed', {
                        won: score.passed,
                        score: score.p1Percentage,
                        averageScore: score.averagePercentage,
                        questionsCorrect: score.p1Matches,
                        totalQuestions: score.total,
                        gameResult: score.passed
                    });
                    
                    // Record for partner 2  
                    await gameUtils.recordGameChoice('quiz', partner2.id, 'completed', {
                        won: score.passed,
                        score: score.p2Percentage,
                        averageScore: score.averagePercentage,
                        questionsCorrect: score.p2Matches,
                        totalQuestions: score.total,
                        gameResult: score.passed
                    });
                    
                    // Record game result in database for both players
                    const gameResult = require('../UTILS/gameUtils').GameResult;
                    const guildId = await getGuildId(interaction);
                    
                    await dbManager.updateUserStats(partner1.id, guildId, 'quiz', score.passed, 0, 0);
                    await dbManager.updateUserStats(partner2.id, guildId, 'quiz', score.passed, 0, 0);
                    
                } catch (trackingError) {
                    logger.error(`Failed to track quiz completion: ${trackingError.message}`);
                }

            } catch (error) {
                logger.error(`Error marking quiz task as completed: ${error.message}`);
            }
            
            embed.addFields({
                name: '🎉 Congratulations!',
                value: '**Task 4 Completed!** You\'ve successfully demonstrated your compatibility! 🏆',
                inline: false
            });
        }

        // Clean up after 5 minutes
        setTimeout(() => {
            global.marriageQuizzes.delete(quizId);
        }, 5 * 60 * 1000);

        // Create quiz history button
        const historyButton = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('quiz_history')
                    .setLabel('View Quiz History')
                    .setEmoji('📚')
                    .setStyle(ButtonStyle.Secondary)
            );

        await this.safeReply(interaction, {
            embeds: [embed],
            components: [historyButton]
        });
    },


    // Helper method to handle both button and slash command interactions
    async safeReply(interaction, options) {
        try {
            // Check if this is a button interaction
            if (interaction.isButton && interaction.isButton()) {
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply(options);
                } else {
                    await interaction.update(options);
                }
                return;
            }
            
            // Check if this is a modal submission
            if (interaction.isModalSubmit && interaction.isModalSubmit()) {
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply(options);
                } else {
                    await interaction.update(options);
                }
                return;
            }
            
            // For slash commands and other interactions
            if (interaction.deferred || interaction.replied) {
                // If already deferred or replied, use followUp or editReply
                if (interaction.editReply) {
                    await interaction.editReply(options);
                } else {
                    await interaction.followUp(options);
                }
            } else if (interaction.reply) {
                // Fallback to reply
                await interaction.reply(options);
            } else {
                // If no standard methods available, log error with more details
                logger.error(`No available method to send interaction response. Type: ${interaction.type}, replied: ${interaction.replied}, deferred: ${interaction.deferred}, customId: ${interaction.customId || 'none'}`);
                return;
            }
        } catch (error) {
            // Additional fallback handling
            try {
                if (interaction.followUp && (interaction.replied || interaction.deferred)) {
                    await interaction.followUp(options);
                } else if (interaction.reply && !interaction.replied) {
                    await interaction.reply(options);
                } else {
                    logger.error(`Unable to send interaction response: ${error.message}`);
                }
            } catch (fallbackError) {
                logger.error(`Failed to send interaction response: ${fallbackError.message}`);
            }
        }
    },

    // Helper method specifically for replying to interactions (not updating)
    async safeInteractionReply(interaction, options) {
        try {
            // For voting buttons and other interactions that need replies
            if (interaction.replied) {
                // If already replied, use followUp
                await interaction.followUp(options);
            } else if (interaction.deferred) {
                // If deferred, use editReply
                await interaction.editReply(options);
            } else {
                // Otherwise use reply
                await interaction.reply(options);
            }
        } catch (error) {
            logger.error(`Error in safeInteractionReply: ${error.message}`);
            // Final fallback - try followUp if available
            try {
                if (interaction.followUp && !interaction.replied) {
                    await interaction.followUp(options);
                }
            } catch (fallbackError) {
                logger.error(`Failed final fallback reply: ${fallbackError.message}`);
            }
        }
    },

    // Handle quiz history button
    async handleQuizHistory(interaction) {
        try {
            const userId = interaction.user.id;
            const guildId = await getGuildId(interaction);
            
            // Check if user is married
            const marriageData = await dbManager.getUserMarriage(userId, guildId);
            if (!marriageData.married) {
                await this.safeInteractionReply(interaction, {
                    content: '❌ You must be married to view quiz history!',
                    ephemeral: true
                });
                return;
            }

            // Get quiz history from database (placeholder for now)
            const historyEmbed = new EmbedBuilder()
                .setTitle('📚 Quiz History')
                .setDescription(`**${marriageData.marriage.partner1_name}** & **${marriageData.marriage.partner2_name}**`)
                .addFields(
                    {
                        name: '🔍 Recent Quizzes',
                        value: 'No quiz history available yet.\nComplete some quizzes to see your history here!',
                        inline: false
                    },
                    {
                        name: '📊 Statistics',
                        value: 'Total Quizzes: 0\nAverage Score: N/A\nBest Score: N/A',
                        inline: false
                    }
                )
                .setColor(0x9B59B6)
                .setTimestamp();

            await this.safeInteractionReply(interaction, {
                embeds: [historyEmbed],
                ephemeral: true
            });

        } catch (error) {
            logger.error(`Error showing quiz history: ${error.message}`);
            await this.safeInteractionReply(interaction, {
                content: '❌ Error loading quiz history. Please try again.',
                ephemeral: true
            });
        }
    },

    // Marriage XP Level Up Notification System
    async sendLevelUpNotification(interaction, xpResult, partner1, partner2) {
        try {
            const { levelData, newTotalXP, xpAwarded } = xpResult;
            
            const levelUpEmbed = new EmbedBuilder()
                .setTitle('💎 Marriage Level Up!')
                .setDescription(`🎉 **Congratulations!** ${partner1.name} and ${partner2.name} have reached a new marriage level!`)
                .addFields(
                    {
                        name: `${levelData.emoji} Level ${levelData.level}: ${levelData.name}`,
                        value: `*${levelData.description}*`,
                        inline: false
                    },
                    {
                        name: '📊 Progress',
                        value: `**XP Gained:** +${xpAwarded}\n**Total XP:** ${newTotalXP.toLocaleString()}\n**New Benefits:** ${levelData.benefits.join(', ')}`,
                        inline: false
                    }
                )
                .setColor(levelData.color)
                .setTimestamp();

            // Send follow-up message for level up (don't replace the task completion message)
            if (interaction.channel) {
                await interaction.channel.send({
                    content: `🔔 <@${partner1.id}> <@${partner2.id}>`,
                    embeds: [levelUpEmbed]
                });
            }

        } catch (error) {
            logger.error(`Error sending level up notification: ${error.message}`);
        }
    }
};
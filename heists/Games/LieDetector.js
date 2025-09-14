/**
 * Lie Detector Game - Two Takes (Truth + Bluff) Mini-Game for Heists
 * 
 * GAME RULES:
 * - 4 players total - 1 Con Artist (random) + 3 Team Members
 * - Con Artist submits 1 truth + 1 bluff statement
 * - Statements are shuffled and presented to team
 * - Team votes on which statement is the bluff
 * - Con Artist wins if they fool the majority
 * - 3-minute time limits per phase
 * - Encourages roleplay and group discussion
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { secureRandomInt } = require('../../UTILS/rng');
const logger = require('../../UTILS/logger');

class LieDetectorGame {
    constructor(config) {
        this.initiatorId = config.userId;
        this.initiatorUsername = config.username;
        this.channelId = config.channelId;
        this.guildId = config.guildId;
        
        // Game state
        this.gamePhase = 'waiting_players'; // 'waiting_players', 'con_artist_input', 'team_voting', 'results', 'complete', 'failed'
        this.players = []; // Array of {id, username}
        this.conArtistId = null;
        this.teamMembers = [];
        
        // Game data
        this.truthStatement = '';
        this.bluffStatement = '';
        this.shuffledStatements = []; // Array of {text, isBluff}
        this.votes = new Map(); // playerId -> statementIndex
        this.scores = new Map(); // playerId -> points
        
        // Discord objects
        this.gameMessage = null;
        this.client = null;
        this.collector = null;
        this.modalHandler = null;
        this.timeoutHandler = null;
        this.votingReminderInterval = null;
        
        // Settings
        this.maxPlayers = 4;
        this.joinTimeLimit = 180000; // 3 minutes to join
        this.conArtistTimeLimit = 180000; // 3 minutes to submit statements
        this.votingTimeLimit = 180000; // 3 minutes to vote
    }

    /**
     * Start the lie detector game
     */
    async start(interaction) {
        this.client = interaction.client;
        
        try {
            // Add initiator as first player
            this.players.push({
                id: this.initiatorId,
                username: this.initiatorUsername
            });
            
            // Initialize scores
            this.scores.set(this.initiatorId, 0);
            
            // Create initial embed
            const embed = this.createGameEmbed();
            
            const reply = await interaction.editReply({
                embeds: [embed],
                components: this.createJoinButton()
            });
            
            this.gameMessage = reply;
            
            // Set up join handler and timeout
            this.setupJoinHandler();
            this.setupPhaseTimeout(this.joinTimeLimit);
            
        } catch (error) {
            logger.error(`Lie Detector game start failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Create game embed based on current phase
     */
    createGameEmbed() {
        let title, description, color;
        
        switch (this.gamePhase) {
            case 'waiting_players':
                title = '🕵️ LIE DETECTOR GAME - Recruiting Players';
                description = `**🎭 Two Takes Challenge!**\n\nWaiting for ${this.maxPlayers} players to join.\n\n**How it works:**\n• Random Con Artist submits 1 truth + 1 bluff\n• Team votes on which statement is the lie\n• Con Artist wins if they fool the majority!\n\n**Players joined:** ${this.players.length}/${this.maxPlayers}`;
                color = 0x4169E1;
                break;
                
            case 'con_artist_input':
                title = '🎭 CON ARTIST PHASE - Submit Your Statements';
                const truthStatus = this.truthStatement ? '✅' : '⏳';
                const bluffStatus = this.bluffStatement ? '✅' : '⏳';
                description = `**${this.getPlayerName(this.conArtistId)} is the Con Artist!**\n\nCon Artist must submit:\n${truthStatus} One TRUE statement about themselves\n${bluffStatus} One BLUFF (fake) statement\n\nThe team will vote on which is the lie!\n\n⏱️ **Time remaining:** <t:${Math.floor((Date.now() + this.getRemainingTime()) / 1000)}:R>`;
                color = 0xFF6B35;
                break;
                
            case 'team_voting':
                title = '🗳️ TEAM VOTING - Which Statement is the Bluff?';
                description = this.createVotingDescription();
                color = 0xFFA500;
                break;
                
            case 'results':
                title = '📊 RESULTS - Truth Revealed!';
                description = this.createResultsDescription();
                color = 0x32CD32;
                break;
                
            case 'complete':
                title = '🎉 GAME COMPLETE!';
                description = this.createFinalDescription();
                color = 0x00FF00;
                break;
                
            case 'failed':
                title = '💀 GAME FAILED!';
                description = 'The game couldn\'t be completed. Not enough players or time ran out.';
                color = 0xFF0000;
                break;
        }

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(color);

        // Add players field for most phases
        if (this.gamePhase !== 'failed') {
            const playersText = this.players.map((player, index) => {
                const isConArtist = player.id === this.conArtistId;
                const emoji = isConArtist ? '🎭' : '👥';
                return `${emoji} ${player.username}`;
            }).join('\n') || 'None';
            
            embed.addFields({
                name: '👥 Players',
                value: playersText,
                inline: true
            });
        }

        // Add scores for results/complete phases
        if (['results', 'complete'].includes(this.gamePhase) && this.scores.size > 0) {
            const scoresText = Array.from(this.scores.entries())
                .sort((a, b) => b[1] - a[1])
                .map(([playerId, score]) => {
                    const player = this.players.find(p => p.id === playerId);
                    const isConArtist = playerId === this.conArtistId;
                    const emoji = isConArtist ? '🎭' : '👥';
                    return `${emoji} ${player?.username || 'Unknown'}: ${score} pts`;
                }).join('\n');
                
            embed.addFields({
                name: '🏆 Final Scores',
                value: scoresText,
                inline: true
            });
        }

        embed.setFooter({ 
            text: `Lie Detector Game - ${this.getPhaseDescription()}` 
        });

        return embed;
    }

    /**
     * Get phase description for footer
     */
    getPhaseDescription() {
        switch (this.gamePhase) {
            case 'waiting_players': return 'Join the game!';
            case 'con_artist_input': return 'Con Artist crafting statements...';
            case 'team_voting': return 'Team deciding which is the lie...';
            case 'results': return 'Truth revealed!';
            case 'complete': return 'Game completed!';
            case 'failed': return 'Game failed';
            default: return 'Playing...';
        }
    }

    /**
     * Create join button
     */
    createJoinButton() {
        return [new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('liedetector_join')
                    .setLabel(`Join Game (${this.players.length}/${this.maxPlayers})`)
                    .setEmoji('🎯')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(this.players.length >= this.maxPlayers)
            )];
    }

    /**
     * Create Con Artist input buttons
     */
    createConArtistButtons() {
        return [new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('liedetector_submit_truth')
                    .setLabel('✅ Submit TRUTH Statement')
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(this.truthStatement !== ''),
                new ButtonBuilder()
                    .setCustomId('liedetector_submit_bluff')
                    .setLabel('🎭 Submit BLUFF Statement') 
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(this.bluffStatement !== '')
            )];
    }

    /**
     * Create voting buttons
     */
    createVotingButtons() {
        return [new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('liedetector_vote_0')
                    .setLabel('Statement A is the LIE')
                    .setEmoji('🔍')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('liedetector_vote_1')
                    .setLabel('Statement B is the LIE')
                    .setEmoji('🔍')
                    .setStyle(ButtonStyle.Danger)
            )];
    }

    /**
     * Setup join button handler
     */
    setupJoinHandler() {
        if (!this.client || !this.gameMessage) return;

        this.clearCollector();

        const filter = (buttonInteraction) => {
            return buttonInteraction.customId === 'liedetector_join' && 
                   !this.players.find(p => p.id === buttonInteraction.user.id);
        };

        this.collector = this.gameMessage.createMessageComponentCollector({
            filter,
            time: this.joinTimeLimit
        });

        this.collector.on('collect', async (buttonInteraction) => {
            try {
                // Always defer the interaction first
                if (!buttonInteraction.deferred && !buttonInteraction.replied) {
                    await buttonInteraction.deferUpdate();
                }

                if (this.players.length >= this.maxPlayers) {
                    await buttonInteraction.followUp({ 
                        content: '❌ Game is full!', 
                        flags: 64
                    });
                    return;
                }

                // Add player
                this.players.push({
                    id: buttonInteraction.user.id,
                    username: buttonInteraction.user.displayName
                });
                
                this.scores.set(buttonInteraction.user.id, 0);

                await buttonInteraction.followUp({ 
                    content: `✅ You joined the Lie Detector game! (${this.players.length}/${this.maxPlayers})`, 
                    flags: 64
                });

                // Update embed with updated join button
                const components = this.players.length >= this.maxPlayers ? [] : this.createJoinButton();
                await this.updateGameMessage(components);

                // Start game if we have enough players
                if (this.players.length >= this.maxPlayers) {
                    await this.startConArtistPhase();
                }

            } catch (error) {
                logger.error(`Join handling error: ${error.message}`);
            }
        });

        this.collector.on('end', async (collected, reason) => {
            if (reason === 'time' && this.players.length < this.maxPlayers) {
                await this.handleGameTimeout();
            }
        });
    }

    /**
     * Start the Con Artist phase
     */
    async startConArtistPhase() {
        try {
            this.clearCollector();
            this.clearTimeout();
            
            // Select random Con Artist using CSPRNG
            const conArtistIndex = secureRandomInt(0, this.players.length);
            this.conArtistId = this.players[conArtistIndex].id;
            
            // Create team members array (everyone except Con Artist)
            this.teamMembers = this.players.filter(p => p.id !== this.conArtistId);
            
            logger.info(`Con Artist selected: ${this.getPlayerName(this.conArtistId)}`);
            
            this.gamePhase = 'con_artist_input';
            
            await this.updateGameMessage(this.createConArtistButtons());
            this.setupConArtistHandler();
            this.setupPhaseTimeout(this.conArtistTimeLimit);
            
        } catch (error) {
            logger.error(`Start Con Artist phase failed: ${error.message}`);
        }
    }

    /**
     * Setup Con Artist input handler
     */
    setupConArtistHandler() {
        if (!this.client || !this.gameMessage) return;

        this.clearCollector();

        const filter = (buttonInteraction) => {
            return (buttonInteraction.customId === 'liedetector_submit_truth' || 
                   buttonInteraction.customId === 'liedetector_submit_bluff') && 
                   buttonInteraction.user.id === this.conArtistId;
        };

        this.collector = this.gameMessage.createMessageComponentCollector({
            filter,
            time: this.conArtistTimeLimit
        });

        this.collector.on('collect', async (buttonInteraction) => {
            try {
                const isSubmittingTruth = buttonInteraction.customId === 'liedetector_submit_truth';
                await this.showConArtistModal(buttonInteraction, isSubmittingTruth);
            } catch (error) {
                logger.error(`Con Artist button handling error: ${error.message}`);
                if (!buttonInteraction.replied && !buttonInteraction.deferred) {
                    try {
                        await buttonInteraction.deferUpdate();
                    } catch (deferError) {
                        logger.error(`Failed to defer interaction: ${deferError.message}`);
                    }
                }
            }
        });
    }

    /**
     * Show modal for Con Artist to input statement
     */
    async showConArtistModal(interaction, isSubmittingTruth) {
        const statementType = isSubmittingTruth ? 'Truth' : 'Bluff';
        const modalId = isSubmittingTruth ? 'liedetector_truth_modal' : 'liedetector_bluff_modal';
        
        const modal = new ModalBuilder()
            .setCustomId(modalId)
            .setTitle(`🎭 Submit Your ${statementType.toUpperCase()} Statement`);

        const statementInput = new TextInputBuilder()
            .setCustomId('statement_input')
            .setLabel(`${statementType.toUpperCase()} Statement (about yourself)`)
            .setPlaceholder(`Enter something ${statementType.toUpperCase()} about yourself...`)
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(200);

        modal.addComponents(
            new ActionRowBuilder().addComponents(statementInput)
        );

        await interaction.showModal(modal);
        this.setupModalHandler();
    }

    /**
     * Setup modal submission handler
     */
    setupModalHandler() {
        if (!this.client) return;

        this.clearModalHandler();

        this.modalHandler = async (modalInteraction) => {
            try {
                if (!modalInteraction.isModalSubmit() || 
                    (modalInteraction.customId !== 'liedetector_truth_modal' && 
                     modalInteraction.customId !== 'liedetector_bluff_modal') || 
                    modalInteraction.user.id !== this.conArtistId) {
                    return;
                }
                
                const isSubmittingTruth = modalInteraction.customId === 'liedetector_truth_modal';
                const statement = modalInteraction.fields.getTextInputValue('statement_input').trim();
                
                if (isSubmittingTruth) {
                    this.truthStatement = statement;
                    await modalInteraction.reply({ 
                        content: '✅ Truth statement submitted!', 
                        flags: 64
                    });
                } else {
                    this.bluffStatement = statement;
                    await modalInteraction.reply({ 
                        content: '✅ Bluff statement submitted!', 
                        flags: 64
                    });
                }
                
                // Remove this specific modal handler
                this.clearModalHandler();
                
                // Update buttons to show progress
                await this.updateGameMessage(this.createConArtistButtons());
                
                // Check if both statements are submitted
                if (this.truthStatement && this.bluffStatement) {
                    // Shuffle statements using CSPRNG
                    const statements = [
                        { text: this.truthStatement, isBluff: false },
                        { text: this.bluffStatement, isBluff: true }
                    ];
                    
                    // Fisher-Yates shuffle
                    for (let i = statements.length - 1; i > 0; i--) {
                        const j = secureRandomInt(0, i + 1);
                        [statements[i], statements[j]] = [statements[j], statements[i]];
                    }
                    
                    this.shuffledStatements = statements;
                    
                    await this.startVotingPhase();
                } else {
                    // Re-setup handler for the next statement
                    this.setupModalHandler();
                }
                
            } catch (error) {
                logger.error(`Modal handling error: ${error.message}`);
            }
        };
        
        this.client.on('interactionCreate', this.modalHandler);
    }

    /**
     * Start the voting phase
     */
    async startVotingPhase() {
        try {
            this.clearCollector();
            this.clearTimeout();
            
            this.gamePhase = 'team_voting';
            this.votes.clear();
            
            await this.updateGameMessage(this.createVotingButtons());
            this.setupVotingHandler();
            this.setupPhaseTimeout(this.votingTimeLimit);
            this.setupVotingReminder();
            
        } catch (error) {
            logger.error(`Start voting phase failed: ${error.message}`);
        }
    }

    /**
     * Create voting description
     */
    createVotingDescription() {
        const statementA = this.shuffledStatements[0]?.text || 'Loading...';
        const statementB = this.shuffledStatements[1]?.text || 'Loading...';
        
        const votesA = Array.from(this.votes.values()).filter(v => v === 0).length;
        const votesB = Array.from(this.votes.values()).filter(v => v === 1).length;
        const totalVotes = this.votes.size;
        const remainingVoters = this.teamMembers.length - totalVotes;
        
        // Get list of who hasn't voted yet
        const nonVoters = this.teamMembers.filter(member => !this.votes.has(member.id));
        const nonVotersText = nonVoters.length > 0 ? 
            `**⏳ Still need votes from:** ${nonVoters.map(p => p.username).join(', ')}` : 
            `**✅ All votes received!**`;
        
        return `**The Con Artist has spoken! Which statement is the LIE?**\n\n` +
               `**📝 Statement A:** "${statementA}"\n` +
               `**📝 Statement B:** "${statementB}"\n\n` +
               `**🗳️ Current Votes:**\n` +
               `• Statement A is the lie: ${votesA} vote${votesA !== 1 ? 's' : ''}\n` +
               `• Statement B is the lie: ${votesB} vote${votesB !== 1 ? 's' : ''}\n\n` +
               `${nonVotersText}\n\n` +
               `⏱️ **Time remaining:** <t:${Math.floor((Date.now() + this.getRemainingTime()) / 1000)}:R>`;
    }

    /**
     * Setup voting handler
     */
    setupVotingHandler() {
        if (!this.client || !this.gameMessage) return;

        this.clearCollector();

        const filter = (buttonInteraction) => {
            return (buttonInteraction.customId === 'liedetector_vote_0' || 
                   buttonInteraction.customId === 'liedetector_vote_1') && 
                   this.teamMembers.find(p => p.id === buttonInteraction.user.id) &&
                   !this.votes.has(buttonInteraction.user.id);
        };

        this.collector = this.gameMessage.createMessageComponentCollector({
            filter,
            time: this.votingTimeLimit
        });

        this.collector.on('collect', async (buttonInteraction) => {
            try {
                const voteIndex = buttonInteraction.customId === 'liedetector_vote_0' ? 0 : 1;
                this.votes.set(buttonInteraction.user.id, voteIndex);
                
                const statementLetter = voteIndex === 0 ? 'A' : 'B';
                await buttonInteraction.reply({ 
                    content: `✅ You voted that Statement ${statementLetter} is the lie!`, 
                    flags: 64
                });

                // Update voting display
                await this.updateGameMessage(this.createVotingButtons());

                // Check if all team members have voted
                if (this.votes.size >= this.teamMembers.length) {
                    this.clearVotingReminder();
                    await this.showResults();
                }

            } catch (error) {
                logger.error(`Voting handling error: ${error.message}`);
                if (!buttonInteraction.replied && !buttonInteraction.deferred) {
                    try {
                        await buttonInteraction.deferUpdate();
                    } catch (deferError) {
                        logger.error(`Failed to defer interaction: ${deferError.message}`);
                    }
                }
            }
        });

        this.collector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                this.clearVotingReminder();
                await this.showResults();
            }
        });
    }

    /**
     * Setup voting reminder system
     */
    setupVotingReminder() {
        this.clearVotingReminder();
        
        this.votingReminderInterval = setInterval(async () => {
            try {
                if (this.gamePhase !== 'team_voting') {
                    this.clearVotingReminder();
                    return;
                }
                
                const nonVoters = this.teamMembers.filter(member => !this.votes.has(member.id));
                
                if (nonVoters.length === 0) {
                    this.clearVotingReminder();
                    return;
                }
                
                // Send reminder message
                const channel = await this.client.channels.fetch(this.channelId);
                const reminderText = `⏰ **Voting Reminder!** Still waiting for votes from: ${nonVoters.map(p => `<@${p.id}>`).join(', ')}\n\nWhich statement do you think is the **LIE**? 🤔`;
                
                await channel.send({
                    content: reminderText,
                    allowedMentions: { users: nonVoters.map(p => p.id) }
                });
                
            } catch (error) {
                logger.error(`Voting reminder error: ${error.message}`);
            }
        }, 5000); // Every 5 seconds
    }

    /**
     * Clear voting reminder interval
     */
    clearVotingReminder() {
        if (this.votingReminderInterval) {
            clearInterval(this.votingReminderInterval);
            this.votingReminderInterval = null;
        }
    }

    /**
     * Show results and calculate scores
     */
    async showResults() {
        try {
            this.clearCollector();
            this.clearTimeout();
            
            this.gamePhase = 'results';
            
            // Calculate results
            const bluffIndex = this.shuffledStatements.findIndex(s => s.isBluff);
            const votesForBluff = Array.from(this.votes.values()).filter(v => v === bluffIndex).length;
            const totalVotes = this.votes.size;
            const correctGuesses = votesForBluff;
            const wrongGuesses = totalVotes - correctGuesses;
            
            // Award points
            if (correctGuesses > wrongGuesses) {
                // Team wins - they found the bluff
                for (const member of this.teamMembers) {
                    if (this.votes.get(member.id) === bluffIndex) {
                        this.scores.set(member.id, (this.scores.get(member.id) || 0) + 5);
                    }
                }
            } else {
                // Con Artist wins - they fooled the majority
                this.scores.set(this.conArtistId, (this.scores.get(this.conArtistId) || 0) + 10);
            }
            
            await this.updateGameMessage([]);
            
            // Auto-complete after showing results
            setTimeout(async () => {
                await this.completeGame();
            }, 10000);
            
        } catch (error) {
            logger.error(`Show results failed: ${error.message}`);
        }
    }

    /**
     * Create results description
     */
    createResultsDescription() {
        const bluffIndex = this.shuffledStatements.findIndex(s => s.isBluff);
        const truthIndex = 1 - bluffIndex;
        
        const bluffStatement = this.shuffledStatements[bluffIndex]?.text || '';
        const truthStatement = this.shuffledStatements[truthIndex]?.text || '';
        
        const votesForBluff = Array.from(this.votes.values()).filter(v => v === bluffIndex).length;
        const totalVotes = this.votes.size;
        const correctGuesses = votesForBluff;
        const wrongGuesses = totalVotes - correctGuesses;
        
        const teamWon = correctGuesses > wrongGuesses;
        const winnerText = teamWon ? 'Team Wins!' : 'Con Artist Wins!';
        const winnerEmoji = teamWon ? '👥🎉' : '🎭✨';
        
        let voteBreakdown = '';
        for (const [playerId, voteIndex] of this.votes.entries()) {
            const player = this.players.find(p => p.id === playerId);
            const wasCorrect = voteIndex === bluffIndex;
            const statementLetter = voteIndex === 0 ? 'A' : 'B';
            const resultEmoji = wasCorrect ? '✅' : '❌';
            voteBreakdown += `${resultEmoji} ${player?.username}: Statement ${statementLetter}\n`;
        }
        
        return `**${winnerEmoji} ${winnerText}**\n\n` +
               `**🎯 TRUTH:** "${truthStatement}"\n` +
               `**🎭 BLUFF:** "${bluffStatement}"\n\n` +
               `**📊 Vote Results:**\n${voteBreakdown}\n` +
               `**🏆 Outcome:** ${correctGuesses} correct, ${wrongGuesses} fooled\n\n` +
               `${teamWon ? '👥 The team saw through the deception!' : '🎭 The Con Artist fooled the majority!'}`;
    }

    /**
     * Complete the game
     */
    async completeGame() {
        try {
            this.gamePhase = 'complete';
            
            this.cleanup();
            await this.updateGameMessage([]);
            
        } catch (error) {
            logger.error(`Complete game failed: ${error.message}`);
        }
    }

    /**
     * Create final description
     */
    createFinalDescription() {
        const winner = Array.from(this.scores.entries())
            .sort((a, b) => b[1] - a[1])[0];
        
        if (winner) {
            const winnerPlayer = this.players.find(p => p.id === winner[0]);
            const isConArtist = winner[0] === this.conArtistId;
            const roleText = isConArtist ? 'Con Artist' : 'Team Detective';
            
            return `**🎉 Game Complete!**\n\n` +
                   `**🏆 Top Player:** ${winnerPlayer?.username} (${roleText}) - ${winner[1]} points\n\n` +
                   `**🎭 Con Artist:** ${this.getPlayerName(this.conArtistId)}\n` +
                   `**👥 Team Members:** ${this.teamMembers.map(m => m.username).join(', ')}\n\n` +
                   `Thanks for playing the Lie Detector game!`;
        }
        
        return 'Game completed successfully!';
    }

    /**
     * Handle game timeout
     */
    async handleGameTimeout() {
        try {
            this.gamePhase = 'failed';
            await this.updateGameMessage([]);
            this.cleanup();
        } catch (error) {
            logger.error(`Handle timeout failed: ${error.message}`);
        }
    }

    /**
     * Update game message
     */
    async updateGameMessage(components = []) {
        try {
            if (!this.gameMessage) return;
            
            const embed = this.createGameEmbed();
            await this.gameMessage.edit({
                embeds: [embed],
                components
            });
            
        } catch (error) {
            logger.error(`Update game message failed: ${error.message}`);
        }
    }

    /**
     * Utility methods
     */
    getPlayerName(playerId) {
        return this.players.find(p => p.id === playerId)?.username || 'Unknown';
    }

    getRemainingTime() {
        if (!this.timeoutHandler) return 0;
        return Math.max(0, this.timeoutHandler._idleTimeout - (Date.now() - this.timeoutHandler._idleStart));
    }

    setupPhaseTimeout(duration) {
        this.clearTimeout();
        this.timeoutHandler = setTimeout(async () => {
            if (this.gamePhase === 'waiting_players') {
                await this.handleGameTimeout();
            } else if (this.gamePhase === 'con_artist_input') {
                await this.handleGameTimeout();
            } else if (this.gamePhase === 'team_voting') {
                await this.showResults();
            }
        }, duration);
    }

    clearTimeout() {
        if (this.timeoutHandler) {
            clearTimeout(this.timeoutHandler);
            this.timeoutHandler = null;
        }
    }

    clearCollector() {
        if (this.collector) {
            this.collector.stop();
            this.collector = null;
        }
    }

    clearModalHandler() {
        if (this.modalHandler && this.client) {
            this.client.removeListener('interactionCreate', this.modalHandler);
            this.modalHandler = null;
        }
    }

    cleanup() {
        this.clearTimeout();
        this.clearCollector();
        this.clearModalHandler();
        this.clearVotingReminder();
    }
}

module.exports = LieDetectorGame;
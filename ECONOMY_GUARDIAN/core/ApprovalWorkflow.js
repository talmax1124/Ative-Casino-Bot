/**
 * ApprovalWorkflow - Human-in-the-Loop Proposal Management
 * Manages the queue → approve → apply workflow with Discord integration
 */

const EventEmitter = require('events');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const logger = require('../../UTILS/logger');

class ApprovalWorkflow extends EventEmitter {
    constructor(client, config, auditLogger) {
        super();
        
        this.client = client;
        this.config = config;
        this.auditLogger = auditLogger;
        
        // Workflow configuration
        this.approvalChannelId = config.approvalChannelId || null;
        this.adminRoleId = config.adminRoleId || null;
        this.autoApprovalEnabled = config.autoApprovalEnabled || false;
        this.autoApprovalThreshold = config.autoApprovalThreshold || 0.01;
        
        // Proposal queues and tracking
        this.pendingQueue = new Map(); // proposalId -> proposal
        this.approvedQueue = new Map(); // proposalId -> proposal
        this.rejectedProposals = new Map(); // proposalId -> { proposal, reason, timestamp }
        this.executingProposals = new Set(); // proposalIds currently executing
        
        // Timeouts and limits
        this.approvalTimeout = config.approvalTimeout || 30 * 60 * 1000; // 30 minutes
        this.maxPendingProposals = config.maxPendingProposals || 10;
        this.maxAutoApprovalsPerHour = config.maxAutoApprovalsPerHour || 5;
        
        // Auto-approval tracking
        this.recentAutoApprovals = [];
        
        // Message tracking for Discord interactions
        this.proposalMessages = new Map(); // proposalId -> messageId
        this.messageTimeouts = new Map(); // messageId -> timeoutId
    }

    async initialize() {
        if (!this.client) {
            throw new Error('Discord client is required for ApprovalWorkflow');
        }
        
        // Validate configuration
        if (this.config.mode === 'controller' && !this.approvalChannelId) {
            logger.warn('Controller mode enabled but no approval channel configured - using console logging');
        }
        
        logger.info('ApprovalWorkflow initialized');
        return true;
    }

    async start() {
        logger.info('ApprovalWorkflow started - monitoring proposal queue');
        
        // Set up periodic cleanup
        this.cleanupInterval = setInterval(() => {
            this.cleanupExpiredProposals();
            this.cleanupOldAutoApprovals();
        }, 5 * 60 * 1000); // Every 5 minutes
    }

    async stop() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        
        // Cancel all pending timeouts
        for (const timeoutId of this.messageTimeouts.values()) {
            clearTimeout(timeoutId);
        }
        this.messageTimeouts.clear();
        
        logger.info('ApprovalWorkflow stopped');
    }

    /**
     * Submit a proposal for approval
     */
    async submitProposal(proposal) {
        try {
            logger.info(`Submitting proposal for approval: ${proposal.id} - ${proposal.title}`);
            
            // Check queue limits
            if (this.pendingQueue.size >= this.maxPendingProposals) {
                throw new Error(`Approval queue is full (${this.maxPendingProposals} proposals pending)`);
            }
            
            // Add timestamps and workflow metadata
            proposal.submittedAt = new Date().toISOString();
            proposal.workflowStatus = 'pending';
            proposal.approvalTimeoutAt = new Date(Date.now() + this.approvalTimeout).toISOString();
            
            // Check for auto-approval eligibility
            if (await this.isEligibleForAutoApproval(proposal)) {
                return await this.autoApproveProposal(proposal);
            }
            
            // Add to pending queue
            this.pendingQueue.set(proposal.id, proposal);
            
            // Send for human approval
            await this.requestHumanApproval(proposal);
            
            // Set timeout for auto-rejection
            this.setApprovalTimeout(proposal);
            
            await this.auditLogger.log('workflow', 'Proposal submitted for approval', {
                proposalId: proposal.id,
                title: proposal.title,
                expectedImpact: proposal.expectedImpact,
                riskLevel: proposal.riskLevel
            });
            
            this.emit('proposalSubmitted', proposal);
            
        } catch (error) {
            logger.error(`Failed to submit proposal ${proposal.id}: ${error.message}`);
            await this.auditLogger.log('error', 'Proposal submission failed', {
                proposalId: proposal.id,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Check if proposal is eligible for auto-approval
     */
    async isEligibleForAutoApproval(proposal) {
        if (!this.autoApprovalEnabled) {
            return false;
        }
        
        // Check impact threshold
        if ((proposal.expectedImpact || 0) > this.autoApprovalThreshold) {
            return false;
        }
        
        // Check risk level
        if (proposal.riskLevel === 'high') {
            return false;
        }
        
        // Check hourly auto-approval limit
        const hourAgo = Date.now() - (60 * 60 * 1000);
        const recentAutoApprovals = this.recentAutoApprovals.filter(
            timestamp => timestamp > hourAgo
        ).length;
        
        if (recentAutoApprovals >= this.maxAutoApprovalsPerHour) {
            logger.info(`Auto-approval skipped: hourly limit reached (${recentAutoApprovals}/${this.maxAutoApprovalsPerHour})`);
            return false;
        }
        
        // Check if proposal requires explicit approval
        if (proposal.requiresApproval) {
            return false;
        }
        
        return true;
    }

    /**
     * Auto-approve proposal
     */
    async autoApproveProposal(proposal) {
        try {
            logger.info(`Auto-approving proposal: ${proposal.id}`);
            
            proposal.approvedAt = new Date().toISOString();
            proposal.approvedBy = 'system_auto_approval';
            proposal.workflowStatus = 'approved';
            proposal.approvalType = 'automatic';
            
            // Track auto-approval
            this.recentAutoApprovals.push(Date.now());
            
            // Move to approved queue
            this.approvedQueue.set(proposal.id, proposal);
            
            await this.auditLogger.log('approval', 'Proposal auto-approved', {
                proposalId: proposal.id,
                impactLevel: proposal.expectedImpact,
                autoApprovalCount: this.recentAutoApprovals.length
            });
            
            // Execute immediately
            await this.executeProposal(proposal);
            
            return true;
            
        } catch (error) {
            logger.error(`Auto-approval failed for ${proposal.id}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Request human approval via Discord
     */
    async requestHumanApproval(proposal) {
        try {
            if (!this.approvalChannelId) {
                // Fallback to console logging
                logger.info(`APPROVAL REQUEST: ${proposal.title}`);
                logger.info(`Description: ${proposal.description}`);
                logger.info(`Impact: ${(proposal.expectedImpact * 100).toFixed(2)}% | Risk: ${proposal.riskLevel}`);
                return;
            }
            
            const channel = await this.client.channels.fetch(this.approvalChannelId);
            if (!channel) {
                throw new Error('Approval channel not found');
            }
            
            // Create approval embed
            const embed = this.createApprovalEmbed(proposal);
            const components = this.createApprovalComponents(proposal);
            
            // Send approval message
            const message = await channel.send({
                content: this.adminRoleId ? `<@&${this.adminRoleId}>` : '',
                embeds: [embed],
                components: [components]
            });
            
            // Track message for interactions
            this.proposalMessages.set(proposal.id, message.id);
            
            logger.info(`Approval request sent to Discord for proposal ${proposal.id}`);
            
        } catch (error) {
            logger.error(`Failed to send approval request: ${error.message}`);
            // Continue without Discord notification
        }
    }

    /**
     * Create approval embed for Discord
     */
    createApprovalEmbed(proposal) {
        const riskColors = {
            low: 0x00FF00,
            medium: 0xFFAA00,
            high: 0xFF0000
        };
        
        const embed = new EmbedBuilder()
            .setTitle(`🤖 Economic Proposal: ${proposal.title}`)
            .setDescription(proposal.description || 'No description provided')
            .setColor(riskColors[proposal.riskLevel] || 0xFFAA00)
            .addFields([
                {
                    name: '📊 Impact Analysis',
                    value: `**Expected Impact:** ${(proposal.expectedImpact * 100).toFixed(2)}%\n` +
                           `**Risk Level:** ${proposal.riskLevel.toUpperCase()}\n` +
                           `**Priority:** ${proposal.priority || 'medium'}`,
                    inline: true
                },
                {
                    name: '🎯 Actions',
                    value: proposal.actions?.map(action => 
                        `• ${action.type}: ${action.target} (${action.adjustment})`
                    ).join('\n') || 'No actions specified',
                    inline: true
                },
                {
                    name: '🤖 AI Confidence',
                    value: `${proposal.confidence || 0}%\n` +
                           `**Model:** ${proposal.aiModel || 'unknown'}\n` +
                           `**Source:** ${proposal.source}`,
                    inline: true
                },
                {
                    name: '⏰ Timing',
                    value: `**Submitted:** <t:${Math.floor(new Date(proposal.submittedAt).getTime() / 1000)}:R>\n` +
                           `**Urgency:** ${proposal.urgency}\n` +
                           `**Timeout:** <t:${Math.floor(new Date(proposal.approvalTimeoutAt).getTime() / 1000)}:R>`,
                    inline: false
                }
            ])
            .setFooter({ 
                text: `Proposal ID: ${proposal.id} | EconomyGuardian v1.0` 
            })
            .setTimestamp();
            
        // Add economic context if available
        if (proposal.economicContext) {
            embed.addFields([{
                name: '📈 Economic Context',
                value: `**Overall Severity:** ${proposal.economicContext.overallSeverity}\n` +
                       `**Health Score:** ${proposal.economicContext.healthScore || 'unknown'}\n` +
                       `**Primary Concern:** ${proposal.economicContext.primaryConcern || 'none'}`,
                inline: false
            }]);
        }
        
        return embed;
    }

    /**
     * Create approval action buttons
     */
    createApprovalComponents(proposal) {
        return new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`approve_${proposal.id}`)
                    .setLabel('✅ Approve')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`reject_${proposal.id}`)
                    .setLabel('❌ Reject')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId(`details_${proposal.id}`)
                    .setLabel('📋 Details')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`postpone_${proposal.id}`)
                    .setLabel('⏰ Postpone')
                    .setStyle(ButtonStyle.Secondary)
            );
    }

    /**
     * Handle Discord button interactions
     */
    async handleButtonInteraction(interaction) {
        if (!interaction.customId.includes('_')) return false;
        
        const [action, proposalId] = interaction.customId.split('_', 2);
        const proposal = this.pendingQueue.get(proposalId);
        
        if (!proposal) {
            await interaction.reply({
                content: '❌ Proposal not found or already processed.',
                ephemeral: true
            });
            return true;
        }
        
        try {
            switch (action) {
                case 'approve':
                    await this.handleApproval(proposal, interaction);
                    break;
                case 'reject':
                    await this.handleRejection(proposal, interaction);
                    break;
                case 'details':
                    await this.handleDetailsRequest(proposal, interaction);
                    break;
                case 'postpone':
                    await this.handlePostpone(proposal, interaction);
                    break;
                default:
                    return false;
            }
            
            return true;
            
        } catch (error) {
            logger.error(`Button interaction error: ${error.message}`);
            await interaction.reply({
                content: '❌ An error occurred processing your request.',
                ephemeral: true
            });
            return true;
        }
    }

    /**
     * Handle proposal approval
     */
    async handleApproval(proposal, interaction) {
        await interaction.deferUpdate();
        
        proposal.approvedAt = new Date().toISOString();
        proposal.approvedBy = interaction.user.id;
        proposal.approverUsername = interaction.user.username;
        proposal.workflowStatus = 'approved';
        proposal.approvalType = 'manual';
        
        // Move from pending to approved
        this.pendingQueue.delete(proposal.id);
        this.approvedQueue.set(proposal.id, proposal);
        
        // Clear timeout
        this.clearApprovalTimeout(proposal.id);
        
        // Update message
        const embed = this.createApprovedEmbed(proposal);
        await interaction.editReply({
            embeds: [embed],
            components: []
        });
        
        await this.auditLogger.log('approval', 'Proposal manually approved', {
            proposalId: proposal.id,
            approvedBy: interaction.user.id,
            approverName: interaction.user.username
        });
        
        this.emit('proposalApproved', proposal);
        
        // Execute the proposal
        await this.executeProposal(proposal);
    }

    /**
     * Handle proposal rejection
     */
    async handleRejection(proposal, interaction) {
        // Show modal for rejection reason (simplified here)
        await interaction.deferUpdate();
        
        const reason = 'Manual rejection by administrator';
        
        proposal.rejectedAt = new Date().toISOString();
        proposal.rejectedBy = interaction.user.id;
        proposal.rejectionReason = reason;
        proposal.workflowStatus = 'rejected';
        
        // Move to rejected
        this.pendingQueue.delete(proposal.id);
        this.rejectedProposals.set(proposal.id, {
            proposal,
            reason,
            timestamp: Date.now()
        });
        
        // Clear timeout
        this.clearApprovalTimeout(proposal.id);
        
        // Update message
        const embed = this.createRejectedEmbed(proposal, reason);
        await interaction.editReply({
            embeds: [embed],
            components: []
        });
        
        await this.auditLogger.log('rejection', 'Proposal manually rejected', {
            proposalId: proposal.id,
            rejectedBy: interaction.user.id,
            reason: reason
        });
        
        this.emit('proposalRejected', proposal, reason);
    }

    /**
     * Execute approved proposal
     */
    async executeProposal(proposal) {
        if (this.executingProposals.has(proposal.id)) {
            logger.warn(`Proposal ${proposal.id} is already executing`);
            return;
        }
        
        try {
            logger.info(`Executing approved proposal: ${proposal.id}`);
            
            this.executingProposals.add(proposal.id);
            
            proposal.executionStartedAt = new Date().toISOString();
            proposal.workflowStatus = 'executing';
            
            // Emit for execution by the main guardian
            this.emit('proposalApproved', proposal);
            
        } catch (error) {
            logger.error(`Proposal execution failed: ${error.message}`);
            this.executingProposals.delete(proposal.id);
            throw error;
        }
    }

    /**
     * Mark proposal execution as complete
     */
    markExecutionComplete(proposalId, success = true, results = null) {
        const proposal = this.approvedQueue.get(proposalId);
        if (proposal) {
            proposal.executionCompletedAt = new Date().toISOString();
            proposal.executionSuccess = success;
            proposal.executionResults = results;
            proposal.workflowStatus = success ? 'completed' : 'failed';
        }
        
        this.executingProposals.delete(proposalId);
        
        if (success) {
            // Clean up after successful execution
            setTimeout(() => {
                this.approvedQueue.delete(proposalId);
            }, 24 * 60 * 60 * 1000); // Keep for 24 hours
        }
    }

    /**
     * Create approved embed
     */
    createApprovedEmbed(proposal) {
        return new EmbedBuilder()
            .setTitle(`✅ Proposal Approved: ${proposal.title}`)
            .setColor(0x00FF00)
            .setDescription('This proposal has been approved and will be executed shortly.')
            .addFields([
                {
                    name: '👤 Approved By',
                    value: `<@${proposal.approvedBy}> (${proposal.approverUsername})`,
                    inline: true
                },
                {
                    name: '⏰ Approved At',
                    value: `<t:${Math.floor(new Date(proposal.approvedAt).getTime() / 1000)}:F>`,
                    inline: true
                }
            ])
            .setFooter({ text: `Proposal ID: ${proposal.id}` })
            .setTimestamp();
    }

    /**
     * Create rejected embed
     */
    createRejectedEmbed(proposal, reason) {
        return new EmbedBuilder()
            .setTitle(`❌ Proposal Rejected: ${proposal.title}`)
            .setColor(0xFF0000)
            .setDescription(`This proposal has been rejected.\n\n**Reason:** ${reason}`)
            .addFields([
                {
                    name: '👤 Rejected By',
                    value: `<@${proposal.rejectedBy}>`,
                    inline: true
                },
                {
                    name: '⏰ Rejected At',
                    value: `<t:${Math.floor(new Date(proposal.rejectedAt).getTime() / 1000)}:F>`,
                    inline: true
                }
            ])
            .setFooter({ text: `Proposal ID: ${proposal.id}` })
            .setTimestamp();
    }

    /**
     * Set timeout for auto-rejection
     */
    setApprovalTimeout(proposal) {
        const timeoutId = setTimeout(async () => {
            await this.timeoutProposal(proposal.id);
        }, this.approvalTimeout);
        
        this.messageTimeouts.set(proposal.id, timeoutId);
    }

    /**
     * Clear approval timeout
     */
    clearApprovalTimeout(proposalId) {
        const timeoutId = this.messageTimeouts.get(proposalId);
        if (timeoutId) {
            clearTimeout(timeoutId);
            this.messageTimeouts.delete(proposalId);
        }
    }

    /**
     * Handle proposal timeout
     */
    async timeoutProposal(proposalId) {
        const proposal = this.pendingQueue.get(proposalId);
        if (!proposal) return;
        
        logger.info(`Proposal ${proposalId} timed out - auto-rejecting`);
        
        proposal.rejectedAt = new Date().toISOString();
        proposal.rejectedBy = 'system_timeout';
        proposal.rejectionReason = 'Approval timeout exceeded';
        proposal.workflowStatus = 'timeout';
        
        this.pendingQueue.delete(proposalId);
        this.rejectedProposals.set(proposalId, {
            proposal,
            reason: 'Approval timeout',
            timestamp: Date.now()
        });
        
        await this.auditLogger.log('timeout', 'Proposal auto-rejected due to timeout', {
            proposalId: proposalId,
            timeoutMinutes: this.approvalTimeout / (60 * 1000)
        });
        
        this.emit('proposalRejected', proposal, 'Approval timeout');
    }

    /**
     * Cleanup methods
     */
    cleanupExpiredProposals() {
        // Remove old rejected proposals (keep for 24 hours)
        const dayAgo = Date.now() - (24 * 60 * 60 * 1000);
        for (const [id, data] of this.rejectedProposals) {
            if (data.timestamp < dayAgo) {
                this.rejectedProposals.delete(id);
            }
        }
    }

    cleanupOldAutoApprovals() {
        // Remove auto-approval timestamps older than 1 hour
        const hourAgo = Date.now() - (60 * 60 * 1000);
        this.recentAutoApprovals = this.recentAutoApprovals.filter(
            timestamp => timestamp > hourAgo
        );
    }

    /**
     * Status and utility methods
     */
    getWorkflowStatus() {
        return {
            pendingProposals: this.pendingQueue.size,
            approvedProposals: this.approvedQueue.size,
            rejectedProposals: this.rejectedProposals.size,
            executingProposals: this.executingProposals.size,
            autoApprovalsLastHour: this.recentAutoApprovals.length,
            autoApprovalEnabled: this.autoApprovalEnabled
        };
    }

    getPendingProposals() {
        return Array.from(this.pendingQueue.values());
    }

    getApprovedProposals() {
        return Array.from(this.approvedQueue.values());
    }
}

module.exports = ApprovalWorkflow;
/**
 * ProposalEngine - Converts AI Analysis into Actionable Economic Proposals
 * Transforms economic insights into structured, validated proposals
 */

const EventEmitter = require('events');
const crypto = require('crypto');
const logger = require('../../UTILS/logger');

class ProposalEngine extends EventEmitter {
    constructor(economicAnalyzer, guardRailSystem, auditLogger) {
        super();
        
        this.economicAnalyzer = economicAnalyzer;
        this.guardRails = guardRailSystem;
        this.auditLogger = auditLogger;
        
        // Proposal templates and priorities
        this.proposalTemplates = this.buildProposalTemplates();
        this.priorityWeights = this.buildPriorityWeights();
        
        // Proposal tracking
        this.proposalCounter = 0;
        this.activeProposals = new Map();
    }

    async initialize() {
        logger.info('ProposalEngine initialized');
        return true;
    }

    /**
     * Generate proposals from AI economic analysis
     */
    async generateProposals(analysis) {
        try {
            logger.info(`Generating proposals from analysis with ${analysis.issues?.length || 0} issues`);
            
            const proposals = [];
            
            // Process AI recommendations
            if (analysis.recommendations && Array.isArray(analysis.recommendations)) {
                for (const recommendation of analysis.recommendations) {
                    const proposal = await this.createProposalFromRecommendation(recommendation, analysis);
                    if (proposal) {
                        proposals.push(proposal);
                    }
                }
            }
            
            // Generate additional proposals for unaddressed issues
            if (analysis.issues && Array.isArray(analysis.issues)) {
                const unaddressedIssues = this.findUnaddressedIssues(analysis.issues, proposals);
                for (const issue of unaddressedIssues) {
                    const proposal = await this.createProposalForIssue(issue, analysis);
                    if (proposal) {
                        proposals.push(proposal);
                    }
                }
            }
            
            // Sort proposals by priority and impact
            const sortedProposals = this.prioritizeProposals(proposals);
            
            // Limit to top 3 proposals to avoid overwhelming
            const finalProposals = sortedProposals.slice(0, 3);
            
            // Track proposals
            for (const proposal of finalProposals) {
                this.activeProposals.set(proposal.id, proposal);
            }
            
            await this.auditLogger.log('proposals', 'Proposals generated', {
                analysisId: analysis.timestamp,
                proposalsGenerated: finalProposals.length,
                totalRecommendations: analysis.recommendations?.length || 0,
                totalIssues: analysis.issues?.length || 0
            });
            
            logger.info(`Generated ${finalProposals.length} prioritized proposals`);
            return finalProposals;
            
        } catch (error) {
            logger.error(`Proposal generation failed: ${error.message}`);
            await this.auditLogger.log('error', 'Proposal generation failed', {
                error: error.message,
                analysisTimestamp: analysis.timestamp
            });
            return [];
        }
    }

    /**
     * Create a structured proposal from AI recommendation
     */
    async createProposalFromRecommendation(recommendation, analysis) {
        try {
            const proposalId = this.generateProposalId();
            
            // Create action from recommendation
            const action = {
                id: `action_${proposalId}_1`,
                type: recommendation.action,
                game: recommendation.target,
                target: recommendation.target,
                adjustment: recommendation.adjustment,
                reasoning: recommendation.reasoning
            };
            
            // Build complete proposal
            const proposal = {
                id: proposalId,
                title: this.generateProposalTitle(recommendation),
                description: this.generateProposalDescription(recommendation, analysis),
                source: 'ai_recommendation',
                sourceAnalysis: analysis.timestamp,
                
                // Core proposal data
                actions: [action],
                expectedImpact: this.calculateExpectedImpact(recommendation),
                riskLevel: recommendation.riskLevel || 'medium',
                priority: recommendation.priority || 'medium',
                confidence: recommendation.confidence || analysis.confidence || 70,
                
                // Metadata
                createdAt: new Date().toISOString(),
                aiModel: analysis.aiModel || 'unknown',
                economicIssues: this.getRelatedIssues(recommendation, analysis.issues),
                
                // Validation flags
                requiresApproval: this.determineApprovalRequirement(recommendation),
                autoExecutable: false, // Always require approval by default
                
                // Timing
                urgency: this.calculateUrgency(recommendation, analysis),
                estimatedDuration: this.estimateExecutionDuration(recommendation),
                
                // Context
                marketContext: analysis.marketInsights || {},
                economicContext: {
                    overallSeverity: analysis.overallSeverity,
                    healthScore: analysis.economicHealth?.score,
                    primaryConcern: analysis.economicHealth?.primaryConcern
                }
            };
            
            // Add proposal-specific metadata
            proposal.metadata = {
                generatedBy: 'ProposalEngine',
                originalRecommendation: recommendation,
                validatedActions: true,
                estimatedROI: this.estimateROI(recommendation),
                playerImpactAssessment: this.assessPlayerImpact(recommendation)
            };
            
            return proposal;
            
        } catch (error) {
            logger.error(`Failed to create proposal from recommendation: ${error.message}`);
            return null;
        }
    }

    /**
     * Create proposal for unaddressed economic issues
     */
    async createProposalForIssue(issue, analysis) {
        try {
            const template = this.getTemplateForIssue(issue.type);
            if (!template) {
                logger.warn(`No template found for issue type: ${issue.type}`);
                return null;
            }
            
            const proposalId = this.generateProposalId();
            
            // Generate action based on issue type and template
            const action = this.generateActionForIssue(issue, template);
            
            const proposal = {
                id: proposalId,
                title: template.titleGenerator(issue),
                description: template.descriptionGenerator(issue, analysis),
                source: 'issue_analysis',
                sourceAnalysis: analysis.timestamp,
                
                actions: [action],
                expectedImpact: this.estimateImpactForIssue(issue),
                riskLevel: this.mapSeverityToRisk(issue.severity),
                priority: this.mapSeverityToPriority(issue.severity),
                confidence: issue.confidence || 70,
                
                createdAt: new Date().toISOString(),
                economicIssues: [issue],
                
                requiresApproval: true,
                autoExecutable: false,
                
                urgency: this.calculateIssueUrgency(issue),
                estimatedDuration: template.estimatedDuration || 300000, // 5 minutes
                
                marketContext: analysis.marketInsights || {},
                economicContext: {
                    overallSeverity: analysis.overallSeverity,
                    issueType: issue.type,
                    issueSeverity: issue.severity
                },
                
                metadata: {
                    generatedBy: 'ProposalEngine',
                    issueId: issue.type + '_' + Date.now(),
                    templateUsed: template.name,
                    autoGenerated: true
                }
            };
            
            return proposal;
            
        } catch (error) {
            logger.error(`Failed to create proposal for issue: ${error.message}`);
            return null;
        }
    }

    /**
     * Prioritize proposals based on impact, urgency, and risk
     */
    prioritizeProposals(proposals) {
        return proposals.sort((a, b) => {
            const scoreA = this.calculateProposalScore(a);
            const scoreB = this.calculateProposalScore(b);
            return scoreB - scoreA; // Higher score first
        });
    }

    /**
     * Calculate proposal priority score
     */
    calculateProposalScore(proposal) {
        const weights = this.priorityWeights;
        
        let score = 0;
        
        // Impact score (0-100)
        const impactScore = Math.min(100, (proposal.expectedImpact || 0) * 1000);
        score += impactScore * weights.impact;
        
        // Urgency score
        const urgencyScore = this.getUrgencyScore(proposal.urgency);
        score += urgencyScore * weights.urgency;
        
        // Risk penalty (higher risk = lower score)
        const riskPenalty = this.getRiskPenalty(proposal.riskLevel);
        score -= riskPenalty * weights.risk;
        
        // Confidence boost
        const confidenceBoost = (proposal.confidence || 50) / 100;
        score *= (1 + confidenceBoost * weights.confidence);
        
        // Severity boost for critical issues
        if (proposal.economicContext?.overallSeverity === 'critical') {
            score *= 1.5;
        } else if (proposal.economicContext?.overallSeverity === 'high') {
            score *= 1.2;
        }
        
        return score;
    }

    /**
     * Generate unique proposal ID
     */
    generateProposalId() {
        this.proposalCounter++;
        const timestamp = Date.now().toString(36);
        const random = crypto.randomBytes(3).toString('hex');
        return `PROP_${timestamp}_${random}_${this.proposalCounter}`;
    }

    /**
     * Generate human-readable proposal title
     */
    generateProposalTitle(recommendation) {
        const actionMap = {
            'adjust_payout': 'Adjust Payout Rates',
            'modify_limits': 'Update Betting Limits',
            'adjust_house_edge': 'Optimize House Edge',
            'modify_drop_rates': 'Adjust Drop Rates'
        };
        
        const actionName = actionMap[recommendation.action] || recommendation.action;
        const target = recommendation.target || 'System';
        
        return `${actionName} for ${target}`;
    }

    /**
     * Generate detailed proposal description
     */
    generateProposalDescription(recommendation, analysis) {
        let description = `Economic analysis has identified an opportunity to improve system performance through targeted adjustments.\n\n`;
        
        description += `**Proposed Action:** ${recommendation.action}\n`;
        description += `**Target:** ${recommendation.target}\n`;
        description += `**Adjustment:** ${recommendation.adjustment}\n\n`;
        
        description += `**Reasoning:** ${recommendation.reasoning}\n\n`;
        
        if (analysis.economicHealth?.primaryConcern) {
            description += `**Primary Economic Concern:** ${analysis.economicHealth.primaryConcern}\n`;
        }
        
        if (recommendation.expectedImpact) {
            description += `**Expected Impact:** ${(recommendation.expectedImpact * 100).toFixed(2)}%\n`;
        }
        
        return description;
    }

    /**
     * Calculate expected economic impact of recommendation
     */
    calculateExpectedImpact(recommendation) {
        // Parse adjustment percentage
        const adjustmentStr = recommendation.adjustment || '0%';
        const adjustment = parseFloat(adjustmentStr.replace(/[%]/g, '')) / 100;
        
        // Base impact on adjustment size and action type
        let impact = Math.abs(adjustment);
        
        // Action type multipliers
        const multipliers = {
            'adjust_house_edge': 1.2, // High impact
            'adjust_payout': 1.0,     // Medium impact
            'modify_limits': 0.8,     // Lower impact
            'modify_drop_rates': 0.6  // Lowest impact
        };
        
        const multiplier = multipliers[recommendation.action] || 1.0;
        impact *= multiplier;
        
        // Cap impact at reasonable levels
        return Math.min(0.1, Math.max(0.001, impact));
    }

    /**
     * Determine if proposal requires human approval
     */
    determineApprovalRequirement(recommendation) {
        const impact = this.calculateExpectedImpact(recommendation);
        const riskLevel = recommendation.riskLevel || 'medium';
        
        // Always require approval for high risk or high impact
        if (riskLevel === 'high' || impact > 0.03) {
            return true;
        }
        
        // Auto-approval only for very low risk, low impact changes
        return !(riskLevel === 'low' && impact < 0.01);
    }

    /**
     * Build proposal templates for different issue types
     */
    buildProposalTemplates() {
        return {
            inflation: {
                name: 'inflation_control',
                titleGenerator: (issue) => 'Control Inflation - Reduce Money Supply',
                descriptionGenerator: (issue, analysis) => 
                    `High inflation detected (${((analysis.economicHealth?.inflationRate || 0) * 100).toFixed(2)}%). ` +
                    `Proposal to increase house edges slightly to reduce money supply and stabilize currency value.`,
                estimatedDuration: 300000,
                defaultAction: 'adjust_house_edge',
                defaultAdjustment: '1%'
            },
            
            deflation: {
                name: 'deflation_stimulus',
                titleGenerator: (issue) => 'Combat Deflation - Stimulate Economy',
                descriptionGenerator: (issue, analysis) =>
                    `Deflation detected in economy. Proposal to reduce house edges to increase money circulation ` +
                    `and encourage player activity.`,
                estimatedDuration: 300000,
                defaultAction: 'adjust_house_edge',
                defaultAdjustment: '-0.5%'
            },
            
            liquidity: {
                name: 'liquidity_improvement',
                titleGenerator: (issue) => 'Improve Player Liquidity',
                descriptionGenerator: (issue, analysis) =>
                    `High number of players with low balances detected. Proposal to adjust game mechanics ` +
                    `to improve player retention and engagement.`,
                estimatedDuration: 600000,
                defaultAction: 'adjust_payout',
                defaultAdjustment: '2%'
            },
            
            game_imbalance: {
                name: 'game_balance',
                titleGenerator: (issue) => `Balance ${issue.affectedSystems?.[0] || 'Game'} Economics`,
                descriptionGenerator: (issue, analysis) =>
                    `Economic imbalance detected in ${issue.affectedSystems?.join(', ') || 'game systems'}. ` +
                    `Proposal to adjust parameters to restore proper economic balance.`,
                estimatedDuration: 300000,
                defaultAction: 'adjust_house_edge',
                defaultAdjustment: '1%'
            }
        };
    }

    /**
     * Build priority calculation weights
     */
    buildPriorityWeights() {
        return {
            impact: 0.4,     // 40% weight to expected impact
            urgency: 0.3,    // 30% weight to urgency
            risk: 0.2,       // 20% penalty for risk
            confidence: 0.1  // 10% boost for confidence
        };
    }

    /**
     * Get template for issue type
     */
    getTemplateForIssue(issueType) {
        return this.proposalTemplates[issueType] || null;
    }

    /**
     * Generate action for specific issue
     */
    generateActionForIssue(issue, template) {
        return {
            id: `action_${this.generateProposalId()}_auto`,
            type: template.defaultAction,
            target: issue.affectedSystems?.[0] || 'system',
            adjustment: template.defaultAdjustment,
            reasoning: `Auto-generated action to address ${issue.type} issue`
        };
    }

    /**
     * Find issues not addressed by existing recommendations
     */
    findUnaddressedIssues(issues, proposals) {
        const addressedTypes = new Set();
        
        // Track what issue types are already addressed
        for (const proposal of proposals) {
            for (const issue of proposal.economicIssues || []) {
                addressedTypes.add(issue.type);
            }
        }
        
        // Return unaddressed issues
        return issues.filter(issue => 
            !addressedTypes.has(issue.type) && 
            issue.severity !== 'low' // Only address medium+ severity
        );
    }

    /**
     * Utility methods for scoring and mapping
     */
    getUrgencyScore(urgency) {
        const scores = { low: 20, medium: 50, high: 80, critical: 100 };
        return scores[urgency] || 50;
    }

    getRiskPenalty(riskLevel) {
        const penalties = { low: 10, medium: 25, high: 50 };
        return penalties[riskLevel] || 25;
    }

    mapSeverityToRisk(severity) {
        const mapping = { low: 'low', medium: 'medium', high: 'high', critical: 'high' };
        return mapping[severity] || 'medium';
    }

    mapSeverityToPriority(severity) {
        const mapping = { low: 'low', medium: 'medium', high: 'high', critical: 'high' };
        return mapping[severity] || 'medium';
    }

    calculateUrgency(recommendation, analysis) {
        if (analysis.overallSeverity === 'critical') return 'critical';
        if (analysis.overallSeverity === 'high') return 'high';
        if (recommendation.priority === 'high') return 'high';
        return 'medium';
    }

    calculateIssueUrgency(issue) {
        if (issue.severity === 'critical') return 'critical';
        if (issue.severity === 'high') return 'high';
        return 'medium';
    }

    estimateExecutionDuration(recommendation) {
        // Default 5 minutes, adjust based on complexity
        return 5 * 60 * 1000;
    }

    estimateImpactForIssue(issue) {
        const impactMap = { low: 0.01, medium: 0.02, high: 0.04, critical: 0.06 };
        return impactMap[issue.severity] || 0.02;
    }

    estimateROI(recommendation) {
        // Simple ROI estimate based on expected impact
        const impact = this.calculateExpectedImpact(recommendation);
        return `Estimated ${(impact * 100).toFixed(1)}% improvement in economic efficiency`;
    }

    assessPlayerImpact(recommendation) {
        const actionImpacts = {
            'adjust_house_edge': 'May slightly affect win rates',
            'adjust_payout': 'Direct impact on payout amounts',
            'modify_limits': 'Changes betting restrictions',
            'modify_drop_rates': 'Affects bonus/reward frequency'
        };
        
        return actionImpacts[recommendation.action] || 'Minimal direct player impact expected';
    }

    getRelatedIssues(recommendation, allIssues) {
        if (!allIssues) return [];
        
        // Find issues that might be addressed by this recommendation
        return allIssues.filter(issue => {
            return issue.affectedSystems?.includes(recommendation.target) ||
                   issue.type.includes(recommendation.action.split('_')[1]);
        });
    }

    /**
     * Get active proposals
     */
    getActiveProposals() {
        return Array.from(this.activeProposals.values());
    }

    /**
     * Remove proposal from active list
     */
    removeProposal(proposalId) {
        return this.activeProposals.delete(proposalId);
    }

    /**
     * Get proposal by ID
     */
    getProposal(proposalId) {
        return this.activeProposals.get(proposalId);
    }
}

module.exports = ProposalEngine;
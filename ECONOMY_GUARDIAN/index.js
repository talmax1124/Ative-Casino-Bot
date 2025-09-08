/**
 * EconomyGuardian - AI-Driven Economic Management System
 * Production-ready module for autonomous casino economy optimization
 * 
 * Features:
 * - Real-time metrics ingestion and analysis
 * - ChatGPT-powered economic proposals
 * - Multi-layer safety guardrails
 * - Human-in-the-loop approval workflow
 * - Comprehensive audit logging
 * - Advisor/Controller operational modes
 */

const EventEmitter = require('events');
const logger = require('../UTILS/logger');
const MetricsCollector = require('./core/MetricsCollector');
const EconomicAnalyzer = require('./core/EconomicAnalyzer');
const GuardRailSystem = require('./core/GuardRailSystem');
const ProposalEngine = require('./core/ProposalEngine');
const ApprovalWorkflow = require('./core/ApprovalWorkflow');
const StateManager = require('./core/StateManager');
const AuditLogger = require('./core/AuditLogger');
const EconomicInterceptor = require('./economicInterceptor');

class EconomyGuardian extends EventEmitter {
    constructor(client, config = {}) {
        super();
        
        this.client = client;
        this.config = {
            // Operational mode: 'advisor' or 'controller'
            mode: config.mode || 'advisor',
            
            // Analysis intervals (milliseconds)
            metricsInterval: config.metricsInterval || 5 * 60 * 1000, // 5 minutes
            analysisInterval: config.analysisInterval || 15 * 60 * 1000, // 15 minutes
            
            // AI Configuration
            openaiApiKey: config.openaiApiKey || process.env.OPENAI_API_KEY,
            model: config.model || 'gpt-4',
            
            // Safety Configuration
            maxDailyChangesBudget: config.maxDailyChangesBudget || 0.05, // 5% max daily economic impact
            cooldownPeriod: config.cooldownPeriod || 60 * 60 * 1000, // 1 hour between major changes
            emergencyMode: false,
            
            // Approval Configuration
            requireHumanApproval: config.requireHumanApproval !== false, // Default true
            autoApprovalThreshold: config.autoApprovalThreshold || 0.01, // 1% impact threshold
            
            ...config
        };

        this.isInitialized = false;
        this.isRunning = false;
        
        // Core components
        this.metricsCollector = null;
        this.economicAnalyzer = null;
        this.guardRails = null;
        this.proposalEngine = null;
        this.approvalWorkflow = null;
        this.stateManager = null;
        this.auditLogger = null;
        
        // Internal state
        this.lastAnalysis = null;
        this.pendingProposals = new Map();
        this.activeTimers = new Map();
        
        logger.info(`EconomyGuardian initialized in ${this.config.mode} mode`);
    }

    /**
     * Initialize the EconomyGuardian system
     */
    async initialize() {
        try {
            logger.info('Initializing EconomyGuardian system...');
            
            // Initialize core components
            this.stateManager = new StateManager(this.config);
            await this.stateManager.initialize();
            
            this.auditLogger = new AuditLogger(this.stateManager);
            await this.auditLogger.initialize();
            
            this.metricsCollector = new MetricsCollector(this.client, this.config);
            await this.metricsCollector.initialize();
            
            this.guardRails = new GuardRailSystem(this.config, this.stateManager);
            await this.guardRails.initialize();
            
            this.economicAnalyzer = new EconomicAnalyzer(this.config, this.auditLogger);
            await this.economicAnalyzer.initialize();
            
            this.proposalEngine = new ProposalEngine(this.economicAnalyzer, this.guardRails, this.auditLogger);
            await this.proposalEngine.initialize();
            
            this.approvalWorkflow = new ApprovalWorkflow(this.client, this.config, this.auditLogger);
            await this.approvalWorkflow.initialize();
            
            // Initialize Economic Interceptor for comprehensive transaction control
            logger.info('Initializing Economic Interceptor...');
            this.economicInterceptor = new EconomicInterceptor(this);
            logger.info('Economic Interceptor initialized - All transactions now under AI control');
            
            // Set up event listeners
            this.setupEventListeners();
            
            // Load previous state
            await this.loadState();
            
            this.isInitialized = true;
            logger.info('EconomyGuardian system initialized successfully');
            
            // Start the guardian if configured to auto-start (unless explicitly disabled)
            if (this.config.autoStart !== false && !this.config.disableAutomatedAnalysis) {
                await this.start();
            } else if (this.config.disableAutomatedAnalysis) {
                logger.info('EconomyGuardian automated analysis disabled - running in passive mode (Q&A only)');
            }
            
            return true;
            
        } catch (error) {
            logger.error(`Failed to initialize EconomyGuardian: ${error.message}`);
            this.emit('error', error);
            throw error;
        }
    }

    /**
     * Start the EconomyGuardian monitoring and analysis
     */
    async start() {
        if (!this.isInitialized) {
            throw new Error('EconomyGuardian must be initialized before starting');
        }
        
        if (this.isRunning) {
            logger.warn('EconomyGuardian is already running');
            return;
        }
        
        try {
            logger.info('Starting EconomyGuardian monitoring...');
            
            // Start metrics collection
            await this.metricsCollector.start();
            
            // Schedule periodic analysis
            this.scheduleAnalysis();
            
            // Start approval workflow
            await this.approvalWorkflow.start();
            
            this.isRunning = true;
            
            await this.auditLogger.log('system', 'EconomyGuardian started', {
                mode: this.config.mode,
                timestamp: new Date().toISOString()
            });
            
            this.emit('started');
            logger.info('EconomyGuardian is now actively monitoring the economy');
            
        } catch (error) {
            logger.error(`Failed to start EconomyGuardian: ${error.message}`);
            this.emit('error', error);
            throw error;
        }
    }

    /**
     * Stop the EconomyGuardian system
     */
    async stop() {
        if (!this.isRunning) {
            return;
        }
        
        try {
            logger.info('Stopping EconomyGuardian...');
            
            // Clear all timers
            for (const [name, timer] of this.activeTimers) {
                clearInterval(timer);
                clearTimeout(timer);
            }
            this.activeTimers.clear();
            
            // Stop components
            if (this.metricsCollector) {
                await this.metricsCollector.stop();
            }
            
            if (this.approvalWorkflow) {
                await this.approvalWorkflow.stop();
            }
            
            // Save current state
            await this.saveState();
            
            this.isRunning = false;
            
            await this.auditLogger.log('system', 'EconomyGuardian stopped', {
                timestamp: new Date().toISOString()
            });
            
            this.emit('stopped');
            logger.info('EconomyGuardian stopped successfully');
            
        } catch (error) {
            logger.error(`Error stopping EconomyGuardian: ${error.message}`);
            throw error;
        }
    }

    /**
     * Schedule periodic economic analysis
     */
    scheduleAnalysis() {
        // Skip scheduling if automated analysis is disabled
        if (this.config.disableAutomatedAnalysis || !this.config.analysisInterval) {
            logger.info('Automated analysis disabled - skipping analysis scheduling');
            return;
        }
        const analysisTimer = setInterval(async () => {
            try {
                await this.performAnalysis();
            } catch (error) {
                logger.error(`Scheduled analysis failed: ${error.message}`);
                this.emit('analysisError', error);
            }
        }, this.config.analysisInterval);
        
        this.activeTimers.set('analysis', analysisTimer);
        
        // Perform initial analysis after startup
        setTimeout(async () => {
            try {
                await this.performAnalysis();
            } catch (error) {
                logger.error(`Initial analysis failed: ${error.message}`);
            }
        }, 30000); // 30 seconds after start
    }

    /**
     * Perform comprehensive economic analysis
     */
    async performAnalysis() {
        if (!this.isRunning) {
            return;
        }
        
        try {
            logger.info('Starting economic analysis...');
            
            // Collect current metrics
            const metrics = await this.metricsCollector.collectAll();
            if (!metrics) {
                logger.warn('No metrics available for analysis');
                return;
            }
            
            // Run economic analysis
            const analysis = await this.economicAnalyzer.analyze(metrics);
            this.lastAnalysis = analysis;
            
            // Generate proposals if issues detected
            if (analysis.issues && analysis.issues.length > 0) {
                const proposals = await this.proposalEngine.generateProposals(analysis);
                
                if (proposals && proposals.length > 0) {
                    await this.processProposals(proposals);
                }
            }
            
            // Emit analysis complete event
            this.emit('analysisComplete', {
                timestamp: new Date(),
                metrics,
                analysis,
                mode: this.config.mode
            });
            
            await this.auditLogger.log('analysis', 'Economic analysis completed', {
                metricsCount: Object.keys(metrics).length,
                issuesFound: analysis.issues?.length || 0,
                severity: analysis.overallSeverity || 'low'
            });
            
        } catch (error) {
            logger.error(`Economic analysis failed: ${error.message}`);
            this.emit('analysisError', error);
            
            await this.auditLogger.log('error', 'Economic analysis failed', {
                error: error.message,
                stack: error.stack
            });
        }
    }

    /**
     * Process generated proposals through approval workflow
     */
    async processProposals(proposals) {
        for (const proposal of proposals) {
            try {
                // Apply guardrails validation
                const validation = await this.guardRails.validateProposal(proposal);
                
                if (!validation.isValid) {
                    logger.warn(`Proposal rejected by guardrails: ${validation.reason}`);
                    await this.auditLogger.log('proposal', 'Proposal rejected by guardrails', {
                        proposalId: proposal.id,
                        reason: validation.reason,
                        proposal: proposal
                    });
                    continue;
                }
                
                // Store pending proposal
                this.pendingProposals.set(proposal.id, proposal);
                
                // Submit to approval workflow
                await this.approvalWorkflow.submitProposal(proposal);
                
                logger.info(`Proposal ${proposal.id} submitted for approval: ${proposal.title}`);
                
            } catch (error) {
                logger.error(`Failed to process proposal ${proposal.id}: ${error.message}`);
                await this.auditLogger.log('error', 'Proposal processing failed', {
                    proposalId: proposal.id,
                    error: error.message
                });
            }
        }
    }

    /**
     * Set up event listeners for component communication
     */
    setupEventListeners() {
        // Approval workflow events
        this.approvalWorkflow.on('proposalApproved', async (proposal) => {
            await this.executeProposal(proposal);
        });
        
        this.approvalWorkflow.on('proposalRejected', async (proposal, reason) => {
            this.pendingProposals.delete(proposal.id);
            await this.auditLogger.log('proposal', 'Proposal rejected', {
                proposalId: proposal.id,
                reason: reason
            });
        });
        
        // Emergency system events
        this.guardRails.on('emergencyTriggered', async (reason) => {
            await this.handleEmergency(reason);
        });
        
        // Metrics events
        this.metricsCollector.on('criticalMetric', async (metric) => {
            await this.handleCriticalMetric(metric);
        });
    }

    /**
     * Execute an approved proposal
     */
    async executeProposal(proposal) {
        try {
            logger.info(`Executing approved proposal: ${proposal.id} - ${proposal.title}`);
            
            // Apply the economic changes
            const results = await this.applyEconomicChanges(proposal.actions);
            
            // Update guardrails state
            await this.guardRails.recordProposalExecution(proposal, results);
            
            // Clean up
            this.pendingProposals.delete(proposal.id);
            
            await this.auditLogger.log('execution', 'Proposal executed successfully', {
                proposalId: proposal.id,
                actions: proposal.actions,
                results: results
            });
            
            this.emit('proposalExecuted', { proposal, results });
            
        } catch (error) {
            logger.error(`Failed to execute proposal ${proposal.id}: ${error.message}`);
            await this.auditLogger.log('error', 'Proposal execution failed', {
                proposalId: proposal.id,
                error: error.message
            });
            
            this.emit('executionError', { proposal, error });
        }
    }

    /**
     * Apply economic changes to the casino system
     */
    async applyEconomicChanges(actions) {
        const results = {};
        
        for (const action of actions) {
            try {
                switch (action.type) {
                    case 'adjust_payout':
                        results[action.id] = await this.adjustGamePayout(action.game, action.adjustment);
                        break;
                    case 'modify_limits':
                        results[action.id] = await this.modifyGameLimits(action.game, action.limits);
                        break;
                    case 'adjust_house_edge':
                        results[action.id] = await this.adjustHouseEdge(action.game, action.adjustment);
                        break;
                    case 'modify_drop_rates':
                        results[action.id] = await this.modifyDropRates(action.system, action.rates);
                        break;
                    default:
                        logger.warn(`Unknown action type: ${action.type}`);
                }
            } catch (error) {
                logger.error(`Failed to apply action ${action.id}: ${error.message}`);
                results[action.id] = { success: false, error: error.message };
            }
        }
        
        return results;
    }

    /**
     * Handle emergency situations
     */
    async handleEmergency(reason) {
        logger.error(`EMERGENCY TRIGGERED: ${reason}`);
        
        this.config.emergencyMode = true;
        
        // Stop all pending proposals
        for (const [proposalId, proposal] of this.pendingProposals) {
            await this.approvalWorkflow.rejectProposal(proposal, 'Emergency mode activated');
        }
        this.pendingProposals.clear();
        
        // Notify administrators
        await this.notifyAdministrators('EMERGENCY', reason);
        
        await this.auditLogger.log('emergency', 'Emergency mode activated', {
            reason: reason,
            timestamp: new Date().toISOString()
        });
        
        this.emit('emergency', reason);
    }

    /**
     * Handle critical metrics
     */
    async handleCriticalMetric(metric) {
        logger.warn(`Critical metric detected: ${metric.name} = ${metric.value}`);
        
        // Trigger immediate analysis
        await this.performAnalysis();
        
        await this.auditLogger.log('critical', 'Critical metric detected', metric);
    }

    /**
     * Load system state
     */
    async loadState() {
        try {
            const state = await this.stateManager.loadState('economyGuardian');
            if (state) {
                this.config = { ...this.config, ...state.config };
                this.lastAnalysis = state.lastAnalysis;
                logger.info('EconomyGuardian state loaded successfully');
            }
        } catch (error) {
            logger.error(`Failed to load state: ${error.message}`);
        }
    }

    /**
     * Save system state
     */
    async saveState() {
        try {
            const state = {
                config: this.config,
                lastAnalysis: this.lastAnalysis,
                timestamp: new Date().toISOString()
            };
            
            await this.stateManager.saveState('economyGuardian', state);
            logger.debug('EconomyGuardian state saved');
        } catch (error) {
            logger.error(`Failed to save state: ${error.message}`);
        }
    }

    /**
     * Get current system status
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            isRunning: this.isRunning,
            mode: this.config.mode,
            emergencyMode: this.config.emergencyMode,
            pendingProposals: this.pendingProposals.size,
            lastAnalysis: this.lastAnalysis?.timestamp || null,
            uptime: this.isRunning ? Date.now() - this.startTime : 0
        };
    }

    /**
     * Placeholder methods for game-specific adjustments
     * These will integrate with your existing game systems
     */
    async adjustGamePayout(game, adjustment) {
        // TODO: Integrate with your game configuration system
        logger.info(`Adjusting ${game} payout by ${adjustment}%`);
        return { success: true, game, adjustment };
    }

    async modifyGameLimits(game, limits) {
        // TODO: Integrate with your game limits system
        logger.info(`Modifying ${game} limits:`, limits);
        return { success: true, game, limits };
    }

    async adjustHouseEdge(game, adjustment) {
        // TODO: Integrate with your house edge system
        logger.info(`Adjusting ${game} house edge by ${adjustment}%`);
        return { success: true, game, adjustment };
    }

    async modifyDropRates(system, rates) {
        // TODO: Integrate with your drop rate systems
        logger.info(`Modifying ${system} drop rates:`, rates);
        return { success: true, system, rates };
    }

    async notifyAdministrators(level, message) {
        // TODO: Integrate with your Discord notification system
        logger.info(`Notifying administrators [${level}]: ${message}`);
    }
}

module.exports = EconomyGuardian;
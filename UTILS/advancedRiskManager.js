/**
 * ADVANCED CASINO RISK MANAGEMENT SYSTEM
 * Industry-standard fraud detection, behavioral analysis, and economic stabilization
 * Based on 2025 online casino best practices and AI-powered monitoring
 */

const logger = require('./logger');
const dbManager = require('./database');
const NodeCache = require('node-cache');
const moment = require('moment');
const { Decimal } = require('decimal.js');

class AdvancedRiskManager {
    constructor() {
        this.cache = new NodeCache({ 
            stdTTL: 300, // 5 minutes
            checkperiod: 60,
            useClones: false 
        });
        
        // Industry-standard risk thresholds
        this.riskThresholds = {
            // Behavioral Analysis Thresholds
            maxWinStreakLength: 8,              // Max consecutive wins before investigation
            maxWinRateThreshold: 0.70,          // 70% win rate flags as suspicious
            abnormalBetPattern: 0.90,           // 90% threshold for bet pattern analysis
            velocityThreshold: 50,              // Max games per hour
            
            // Financial Risk Thresholds  
            maxDailyWinnings: 10000000,         // $10M max daily winnings per user
            maxSessionWinnings: 2000000,        // $2M max per session
            unusualBetSize: 0.25,               // 25% of user's wealth is unusual
            rapidWealthIncrease: 5.0,           // 5x wealth increase in 24h
            
            // Multi-Account Detection
            deviceSimilarityThreshold: 0.85,    // 85% device fingerprint similarity
            behaviorSimilarityThreshold: 0.80,  // 80% behavioral pattern similarity
            ipSimilarityWindow: 300,            // 5 minutes for same IP detection
            
            // Economic Stability Thresholds
            maxHouseDeficit: 50000000,          // $50M max house deficit
            criticalInflationRate: 0.15,        // 15% daily inflation = critical
            wealthConcentrationAlert: 0.95,     // 95% wealth in top 1% = alert
        };
        
        // Player risk profiles
        this.playerProfiles = new Map();
        this.suspiciousActivities = [];
        this.deviceFingerprints = new Map();
        this.behavioralPatterns = new Map();
        
        // Initialize monitoring
        this.initializeMonitoring();
    }
    
    async initializeMonitoring() {
        logger.info('🔒 Initializing Advanced Risk Management System...');
        
        // Start monitoring intervals (reasonable frequencies)
        setInterval(() => this.performRealTimeMonitoring(), 300000); // Every 5 minutes
        setInterval(() => this.analyzeBehavioralPatterns(), 1800000); // Every 30 minutes
        setInterval(() => this.detectMultiAccounting(), 3600000); // Every hour
        setInterval(() => this.assessEconomicRisks(), 900000); // Every 15 minutes
        
        logger.info('✅ Advanced Risk Management System initialized');
    }
    
    /**
     * REAL-TIME TRANSACTION MONITORING
     * Monitors every game transaction for suspicious patterns
     */
    async performRealTimeMonitoring() {
        try {
            const recentTransactions = await this.getRecentTransactions();
            
            for (const transaction of recentTransactions) {
                const riskScore = await this.calculateTransactionRisk(transaction);
                
                if (riskScore > 80) {
                    await this.flagSuspiciousActivity({
                        type: 'HIGH_RISK_TRANSACTION',
                        userId: transaction.user_id,
                        riskScore,
                        transaction,
                        severity: 'HIGH'
                    });
                }
                
                // Update player profile
                await this.updatePlayerProfile(transaction.user_id, transaction);
            }
            
        } catch (error) {
            logger.error(`Real-time monitoring failed: ${error.message}`);
        }
    }
    
    /**
     * CALCULATE TRANSACTION RISK SCORE
     * Uses AI-like analysis to score transaction risk (0-100)
     */
    async calculateTransactionRisk(transaction) {
        let riskScore = 0;
        const userId = transaction.user_id;
        
        // Get player profile
        const profile = await this.getPlayerProfile(userId);
        
        // 1. Win Rate Analysis (Industry Standard: 70% is suspicious)
        if (profile.winRate > this.riskThresholds.maxWinRateThreshold) {
            riskScore += 30;
        }
        
        // 2. Bet Pattern Analysis
        const betPattern = await this.analyzeBetPattern(userId);
        if (betPattern.abnormalityScore > this.riskThresholds.abnormalBetPattern) {
            riskScore += 25;
        }
        
        // 3. Win Streak Analysis
        if (profile.currentWinStreak > this.riskThresholds.maxWinStreakLength) {
            riskScore += 20;
        }
        
        // 4. Velocity Analysis (Games per hour)
        const velocity = await this.calculateGameVelocity(userId);
        if (velocity > this.riskThresholds.velocityThreshold) {
            riskScore += 15;
        }
        
        // 5. Financial Anomaly Detection
        const financialRisk = await this.assessFinancialAnomalies(userId, transaction);
        riskScore += financialRisk;
        
        // 6. Device/IP Analysis
        const deviceRisk = await this.analyzeDevicePattern(userId);
        riskScore += deviceRisk;
        
        return Math.min(100, riskScore);
    }
    
    /**
     * BEHAVIORAL PATTERN ANALYSIS
     * Identifies unusual player behavior patterns
     */
    async analyzeBehavioralPatterns() {
        try {
            const activePlayers = await this.getActivePlayers();
            
            for (const player of activePlayers) {
                const pattern = await this.buildBehavioralPattern(player.user_id);
                this.behavioralPatterns.set(player.user_id, pattern);
                
                // Detect anomalies in behavior
                const anomalies = this.detectBehavioralAnomalies(pattern);
                
                if (anomalies.length > 0) {
                    await this.flagSuspiciousActivity({
                        type: 'BEHAVIORAL_ANOMALY',
                        userId: player.user_id,
                        anomalies,
                        severity: 'MEDIUM'
                    });
                }
            }
            
        } catch (error) {
            logger.error(`Behavioral analysis failed: ${error.message}`);
        }
    }
    
    /**
     * MULTI-ACCOUNT DETECTION
     * Detects users creating multiple accounts for bonus abuse
     */
    async detectMultiAccounting() {
        try {
            const recentPlayers = await this.getRecentPlayers();
            const suspiciousGroups = [];
            
            // Group players by device fingerprint similarity
            const deviceGroups = this.groupBySimilarity(recentPlayers, 'device');
            
            // Group players by behavioral similarity
            const behaviorGroups = this.groupBySimilarity(recentPlayers, 'behavior');
            
            // Find overlapping groups (high confidence multi-accounting)
            for (const deviceGroup of deviceGroups) {
                for (const behaviorGroup of behaviorGroups) {
                    const overlap = deviceGroup.filter(p => behaviorGroup.includes(p));
                    
                    if (overlap.length >= 2) {
                        suspiciousGroups.push({
                            type: 'MULTI_ACCOUNT_CLUSTER',
                            users: overlap,
                            confidence: this.calculateClusterConfidence(overlap),
                            evidence: ['DEVICE_SIMILARITY', 'BEHAVIOR_SIMILARITY']
                        });
                    }
                }
            }
            
            // Flag suspicious multi-account groups
            for (const group of suspiciousGroups) {
                if (group.confidence > 0.85) {
                    await this.flagSuspiciousActivity({
                        type: 'MULTI_ACCOUNTING',
                        userGroup: group.users,
                        confidence: group.confidence,
                        evidence: group.evidence,
                        severity: 'HIGH'
                    });
                }
            }
            
        } catch (error) {
            logger.error(`Multi-account detection failed: ${error.message}`);
        }
    }
    
    /**
     * ECONOMIC RISK ASSESSMENT
     * Monitors overall economic stability and house performance
     */
    async assessEconomicRisks() {
        try {
            const economicMetrics = await this.calculateEconomicMetrics();
            
            // Check for critical economic risks
            const risks = [];
            
            if (economicMetrics.houseProfit < -this.riskThresholds.maxHouseDeficit) {
                risks.push({
                    type: 'HOUSE_DEFICIT',
                    severity: 'CRITICAL',
                    value: economicMetrics.houseProfit,
                    threshold: -this.riskThresholds.maxHouseDeficit
                });
            }
            
            if (economicMetrics.inflationRate > this.riskThresholds.criticalInflationRate) {
                risks.push({
                    type: 'HIGH_INFLATION',
                    severity: 'HIGH',
                    value: economicMetrics.inflationRate,
                    threshold: this.riskThresholds.criticalInflationRate
                });
            }
            
            if (economicMetrics.wealthConcentration > this.riskThresholds.wealthConcentrationAlert) {
                risks.push({
                    type: 'WEALTH_CONCENTRATION',
                    severity: 'MEDIUM',
                    value: economicMetrics.wealthConcentration,
                    threshold: this.riskThresholds.wealthConcentrationAlert
                });
            }
            
            // Trigger automatic responses for critical risks
            if (risks.some(r => r.severity === 'CRITICAL')) {
                await this.triggerEmergencyProtocol(risks);
            }
            
            // Cache economic risk assessment
            this.cache.set('economic_risks', {
                timestamp: Date.now(),
                risks,
                metrics: economicMetrics
            });
            
        } catch (error) {
            logger.error(`Economic risk assessment failed: ${error.message}`);
        }
    }
    
    /**
     * FRAUD DETECTION ENGINE
     * Comprehensive fraud scoring system
     */
    async detectFraud(userId, gameData) {
        try {
            let fraudScore = 0;
            const evidencePoints = [];
            
            // 1. Win Pattern Analysis
            const winPattern = await this.analyzeWinPattern(userId);
            if (winPattern.isAbnormal) {
                fraudScore += winPattern.score;
                evidencePoints.push(`Abnormal win pattern: ${winPattern.description}`);
            }
            
            // 2. Financial Flow Analysis
            const financialFlow = await this.analyzeFinancialFlow(userId);
            if (financialFlow.isSuspicious) {
                fraudScore += financialFlow.score;
                evidencePoints.push(`Suspicious financial flow: ${financialFlow.description}`);
            }
            
            // 3. Game Mechanic Exploitation Detection
            const gameExploit = await this.detectGameExploitation(userId, gameData);
            if (gameExploit.detected) {
                fraudScore += gameExploit.score;
                evidencePoints.push(`Game exploitation detected: ${gameExploit.description}`);
            }
            
            // 4. Social Engineering Detection
            const socialRisk = await this.detectSocialEngineering(userId);
            if (socialRisk.detected) {
                fraudScore += socialRisk.score;
                evidencePoints.push(`Social engineering risk: ${socialRisk.description}`);
            }
            
            return {
                fraudScore: Math.min(100, fraudScore),
                evidencePoints,
                riskLevel: this.categorizeFraudRisk(fraudScore),
                requiresInvestigation: fraudScore > 70
            };
            
        } catch (error) {
            logger.error(`Fraud detection failed: ${error.message}`);
            return { fraudScore: 0, evidencePoints: [], riskLevel: 'UNKNOWN', requiresInvestigation: false };
        }
    }
    
    /**
     * AUTOMATIC RESPONSE SYSTEM
     * Takes action based on risk assessments
     */
    async triggerAutomaticResponse(riskData) {
        const { type, severity, userId, evidence } = riskData;
        
        switch (severity) {
            case 'CRITICAL':
                // Immediate account suspension
                await this.suspendAccount(userId, 'FRAUD_PREVENTION', evidence);
                logger.error(`🚨 CRITICAL: Account ${userId} suspended for ${type}`);
                break;
                
            case 'HIGH':
                // Restrict high-risk activities
                await this.restrictHighRiskActivities(userId, evidence);
                await this.requireAdditionalVerification(userId);
                logger.warn(`⚠️ HIGH RISK: Account ${userId} restricted for ${type}`);
                break;
                
            case 'MEDIUM':
                // Enhanced monitoring
                await this.enableEnhancedMonitoring(userId, evidence);
                logger.info(`📋 MEDIUM RISK: Enhanced monitoring for ${userId} - ${type}`);
                break;
                
            default:
                logger.debug(`Low risk activity detected: ${type}`);
        }
    }
    
    /**
     * PLAYER PROFILING SYSTEM
     */
    async getPlayerProfile(userId) {
        let profile = this.playerProfiles.get(userId);
        
        if (!profile) {
            profile = await this.buildPlayerProfile(userId);
            this.playerProfiles.set(userId, profile);
        }
        
        return profile;
    }
    
    async buildPlayerProfile(userId) {
        const [gameHistory, financialHistory, deviceInfo] = await Promise.all([
            this.getPlayerGameHistory(userId),
            this.getPlayerFinancialHistory(userId),
            this.getPlayerDeviceInfo(userId)
        ]);
        
        const profile = {
            userId,
            createdAt: Date.now(),
            gameStats: this.calculateGameStats(gameHistory),
            financialStats: this.calculateFinancialStats(financialHistory),
            deviceProfile: deviceInfo,
            riskScore: 0,
            winRate: 0,
            currentWinStreak: 0,
            behaviorPattern: {},
            lastUpdated: Date.now()
        };
        
        // Calculate derived metrics
        if (profile.gameStats.totalGames > 0) {
            profile.winRate = profile.gameStats.wins / profile.gameStats.totalGames;
        }
        
        profile.currentWinStreak = this.calculateCurrentWinStreak(gameHistory);
        profile.riskScore = await this.calculatePlayerRiskScore(profile);
        
        return profile;
    }
    
    /**
     * PUBLIC API METHODS
     */
    
    async validateTransaction(userId, gameType, betAmount, deviceInfo = {}) {
        const riskAssessment = await this.assessTransactionRisk(userId, gameType, betAmount, deviceInfo);
        
        return {
            approved: riskAssessment.riskScore < 80,
            riskScore: riskAssessment.riskScore,
            restrictions: riskAssessment.restrictions || [],
            requiresVerification: riskAssessment.riskScore > 60
        };
    }
    
    async reportGameResult(userId, gameResult) {
        // Update player profile with new game result
        await this.updatePlayerProfile(userId, gameResult);
        
        // Perform real-time fraud detection
        const fraudAssessment = await this.detectFraud(userId, gameResult);
        
        if (fraudAssessment.requiresInvestigation) {
            await this.flagForInvestigation(userId, fraudAssessment);
        }
        
        return fraudAssessment;
    }
    
    async getRiskReport() {
        return {
            timestamp: Date.now(),
            economicRisks: this.cache.get('economic_risks'),
            suspiciousActivities: this.suspiciousActivities.slice(-50), // Last 50 activities
            highRiskPlayers: Array.from(this.playerProfiles.values())
                .filter(p => p.riskScore > 70)
                .slice(0, 20) // Top 20 high-risk players
        };
    }
    
    /**
     * UTILITY METHODS
     */
    
    async flagSuspiciousActivity(activity) {
        this.suspiciousActivities.push({
            ...activity,
            timestamp: Date.now(),
            id: Date.now().toString()
        });
        
        // Keep only last 1000 activities
        if (this.suspiciousActivities.length > 1000) {
            this.suspiciousActivities = this.suspiciousActivities.slice(-1000);
        }
        
        logger.warn(`🚨 Suspicious activity flagged: ${activity.type} - User: ${activity.userId || 'Multiple'}`);
        
        // Trigger automatic response if needed
        if (activity.severity === 'CRITICAL' || activity.severity === 'HIGH') {
            await this.triggerAutomaticResponse(activity);
        }
    }
    
    categorizeFraudRisk(score) {
        if (score >= 85) return 'CRITICAL';
        if (score >= 70) return 'HIGH';
        if (score >= 50) return 'MEDIUM';
        if (score >= 25) return 'LOW';
        return 'MINIMAL';
    }
    
    /**
     * PLACEHOLDER METHODS - To be implemented based on database structure
     */
    async getRecentTransactions() { return []; }
    async getActivePlayers() { return []; }
    async getRecentPlayers() { return []; }
    async getPlayerGameHistory(userId) { return []; }
    async getPlayerFinancialHistory(userId) { return []; }
    async getPlayerDeviceInfo(userId) { return {}; }
    async calculateEconomicMetrics() { return {}; }
    
    // Placeholder implementations for complex analysis methods
    async analyzeBetPattern(userId) { return { abnormalityScore: 0 }; }
    async calculateGameVelocity(userId) { return 0; }
    async assessFinancialAnomalies(userId, transaction) { return 0; }
    async analyzeDevicePattern(userId) { return 0; }
    async buildBehavioralPattern(userId) { return {}; }
    detectBehavioralAnomalies(pattern) { return []; }
    groupBySimilarity(players, type) { return []; }
    calculateClusterConfidence(cluster) { return 0; }
    
    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        this.cache.close();
        logger.info('Advanced Risk Manager destroyed');
    }
}

module.exports = new AdvancedRiskManager();
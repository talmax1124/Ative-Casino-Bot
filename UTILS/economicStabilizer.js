/**
 * ADVANCED ECONOMIC STABILIZATION SYSTEM
 * Prevents abuse, maintains stability, and favors house edge
 * Uses advanced mathematical models and real-time analysis
 */

const math = require('mathjs');
const Decimal = require('decimal.js');
const _ = require('lodash');
const moment = require('moment');
const ss = require('simple-statistics');
const NodeCache = require('node-cache');
const dbManager = require('./database');
const logger = require('./logger');

// Configure Decimal.js for high precision
Decimal.config({
    precision: 20,
    rounding: Decimal.ROUND_DOWN
});

class EconomicStabilizer {
    constructor() {
        // Cache for performance (TTL: 5 minutes)
        this.cache = new NodeCache({ 
            stdTTL: 300, 
            checkperiod: 60,
            useClones: false 
        });
        
        // Economic health metrics
        this.healthMetrics = {
            totalWealth: new Decimal(0),
            wealthGrowthRate: new Decimal(0),
            inflationRate: new Decimal(0),
            velocityOfMoney: new Decimal(0),
            giniCoefficient: new Decimal(0),
            houseAdvantage: new Decimal(0.05), // Target 5% house advantage
            economicStability: 100
        };
        
        // Circuit breaker thresholds
        this.circuitBreakers = {
            maxDailyLoss: new Decimal(50000000),      // $50M max house loss per day
            maxWealthConcentration: 0.97,             // Top 1% can't own more than 97% (adjusted for developer accounts)
            maxInflationRate: 0.1,                    // 10% max inflation per day
            minHouseEdge: 0.02,                       // Minimum 2% house edge
            maxBetSizeRatio: 0.05,                    // Max bet can't exceed 5% of user's wealth
            suspiciousWinThreshold: 100,              // 100x multiplier triggers investigation
            maxConsecutiveWins: 10                    // Max wins in a row before analysis
        };
        
        // Dynamic multiplier adjustments
        this.dynamicMultipliers = {
            baseReduction: 0.1,        // 10% base reduction in all multipliers
            wealthBasedReduction: 0.2,  // Additional 20% reduction for wealthy players
            volumeBasedReduction: 0.15, // 15% reduction during high volume
            emergencyReduction: 0.5     // 50% reduction during economic emergencies
        };
        
        // Anti-abuse detection patterns
        this.suspiciousPatterns = new Map();
        this.playerRiskScores = new Map();
        
        // Economic analysis intervals
        this.analysisInterval = null;
        this.emergencyMode = false;
        
        this.initializeStabilizer();
    }
    
    async initializeStabilizer() {
        logger.info('🏦 Initializing Advanced Economic Stabilizer...');
        
        // Start continuous economic monitoring
        this.analysisInterval = setInterval(() => {
            this.performEconomicAnalysis();
        }, 60000); // Every minute
        
        // Perform initial analysis
        await this.performEconomicAnalysis();
        
        logger.info('🏦 Economic Stabilizer initialized successfully');
    }
    
    /**
     * CORE ECONOMIC ANALYSIS - Runs every minute
     */
    async performEconomicAnalysis() {
        try {
            const startTime = Date.now();
            
            // Check if database is initialized first
            if (!dbManager.usingAdapter) {
                logger.debug('Database not yet initialized, skipping economic analysis');
                return {
                    healthScore: 75, // Default safe score
                    emergencyMode: false,
                    initialized: false,
                    message: 'Database not yet initialized'
                };
            }
            
            // Fetch current economic data
            const economicData = await this.gatherEconomicData();
            
            // Calculate health metrics
            await this.calculateHealthMetrics(economicData);
            
            // Check for anomalies
            const anomalies = await this.detectAnomalies(economicData);
            
            // Adjust house edges dynamically
            await this.adjustHouseEdges(economicData);
            
            // Update multiplier reductions
            await this.updateMultiplierReductions(economicData);
            
            // Check circuit breakers
            const circuitTriggered = await this.checkCircuitBreakers(economicData);
            
            if (circuitTriggered) {
                await this.triggerEmergencyMeasures(circuitTriggered);
            }
            
            // Cache results for quick access
            this.cache.set('latest_analysis', {
                timestamp: Date.now(),
                healthMetrics: this.healthMetrics,
                anomalies,
                emergencyMode: this.emergencyMode,
                processingTime: Date.now() - startTime
            });
            
            logger.debug(`Economic analysis completed in ${Date.now() - startTime}ms`);
            
        } catch (error) {
            logger.error(`Economic analysis failed: ${error.message}`);
        }
    }
    
    /**
     * GATHER COMPREHENSIVE ECONOMIC DATA
     */
    async gatherEconomicData() {
        const cacheKey = 'economic_data';
        let data = this.cache.get(cacheKey);
        
        if (!data) {
            // Check database readiness
            if (!dbManager.usingAdapter) {
                throw new Error('Database not initialized');
            }
            
            // Get all user data (excluding special categories)
            const allUsers = await dbManager.getAllUsers();
            const users = await this.filterEconomyUsers(allUsers);
            const last24h = moment().subtract(24, 'hours').toDate();
            
            // Calculate wealth distribution
            const wealthData = [];
            let totalWealth = new Decimal(0);
            let totalGames = 0;
            let totalWagered = new Decimal(0);
            let totalWon = new Decimal(0);
            
            for (const user of users) {
                const balance = await dbManager.getUserBalance(user.user_id);
                const userWealth = new Decimal(balance.wallet).plus(balance.bank);
                
                wealthData.push({
                    userId: user.user_id,
                    wealth: userWealth.toNumber(),
                    wallet: balance.wallet,
                    bank: balance.bank
                });
                
                totalWealth = totalWealth.plus(userWealth);
                
                // Get user's recent gaming activity
                const stats = await dbManager.getUserStats(user.user_id);
                if (stats) {
                    totalGames += (stats.wins || 0) + (stats.losses || 0);
                    totalWagered = totalWagered.plus(stats.total_wagered || 0);
                    totalWon = totalWon.plus(stats.total_won || 0);
                }
            }
            
            // Sort by wealth for distribution analysis
            wealthData.sort((a, b) => b.wealth - a.wealth);
            
            data = {
                users,
                wealthData,
                totalWealth: totalWealth.toNumber(),
                totalUsers: users.length,
                totalGames,
                totalWagered: totalWagered.toNumber(),
                totalWon: totalWon.toNumber(),
                houseProfit: totalWagered.minus(totalWon).toNumber(),
                timestamp: Date.now()
            };
            
            this.cache.set(cacheKey, data, 120); // Cache for 2 minutes
        }
        
        return data;
    }
    
    /**
     * CALCULATE ECONOMIC HEALTH METRICS
     */
    async calculateHealthMetrics(data) {
        // Calculate Gini coefficient (wealth inequality)
        const gini = this.calculateGiniCoefficient(data.wealthData);
        
        // Calculate wealth concentration (top 1% ownership)
        const top1PercentCount = Math.max(1, Math.floor(data.totalUsers * 0.01));
        const top1PercentWealth = data.wealthData.slice(0, top1PercentCount)
            .reduce((sum, user) => sum + user.wealth, 0);
        const wealthConcentration = data.totalWealth > 0 ? top1PercentWealth / data.totalWealth : 0;
        
        // Calculate house edge
        const currentHouseEdge = data.totalWagered > 0 ? 
            (data.totalWagered - data.totalWon) / data.totalWagered : 0.05;
        
        // Calculate velocity of money (transaction frequency)
        const dailyTransactions = data.totalGames / 30; // Approximate daily transactions
        const velocityOfMoney = data.totalWealth > 0 ? 
            (data.totalWagered / 30) / data.totalWealth : 0;
        
        // Update metrics
        this.healthMetrics = {
            totalWealth: new Decimal(data.totalWealth),
            giniCoefficient: new Decimal(gini),
            wealthConcentration: new Decimal(wealthConcentration),
            houseAdvantage: new Decimal(currentHouseEdge),
            velocityOfMoney: new Decimal(velocityOfMoney),
            dailyTransactions: new Decimal(dailyTransactions),
            economicStability: this.calculateStabilityScore(gini, wealthConcentration, currentHouseEdge)
        };
        
        logger.debug(`Health metrics updated - Stability: ${this.healthMetrics.economicStability}, House edge: ${(currentHouseEdge * 100).toFixed(2)}%`);
    }
    
    /**
     * CALCULATE GINI COEFFICIENT (WEALTH INEQUALITY)
     */
    calculateGiniCoefficient(wealthData) {
        if (wealthData.length === 0) return 0;
        
        const values = wealthData.map(user => user.wealth).sort((a, b) => a - b);
        const n = values.length;
        const sum = values.reduce((a, b) => a + b, 0);
        
        if (sum === 0) return 0;
        
        let numerator = 0;
        for (let i = 0; i < n; i++) {
            numerator += (2 * (i + 1) - n - 1) * values[i];
        }
        
        return numerator / (n * sum);
    }
    
    /**
     * CALCULATE ECONOMIC STABILITY SCORE (0-100)
     */
    calculateStabilityScore(gini, concentration, houseEdge) {
        let score = 100;
        
        // Penalize high inequality
        if (gini > 0.6) score -= 20;
        else if (gini > 0.4) score -= 10;
        
        // Penalize high wealth concentration
        if (concentration > 0.8) score -= 25;
        else if (concentration > 0.6) score -= 15;
        
        // Penalize low house edge
        if (houseEdge < 0.02) score -= 30;
        else if (houseEdge < 0.03) score -= 15;
        
        // Bonus for optimal house edge
        if (houseEdge >= 0.04 && houseEdge <= 0.06) score += 10;
        
        return Math.max(0, Math.min(100, score));
    }
    
    /**
     * DETECT ECONOMIC ANOMALIES AND SUSPICIOUS PATTERNS
     */
    async detectAnomalies(data) {
        const anomalies = [];
        
        // Check for rapid wealth changes
        const last24hData = this.cache.get('economic_data_24h');
        if (last24hData) {
            const wealthGrowth = (data.totalWealth - last24hData.totalWealth) / last24hData.totalWealth;
            if (Math.abs(wealthGrowth) > 0.1) { // 10% daily change
                anomalies.push({
                    type: 'rapid_wealth_change',
                    severity: 'HIGH',
                    value: wealthGrowth,
                    threshold: 0.1
                });
            }
        }
        
        // Check for wealth concentration anomalies
        if (this.healthMetrics.wealthConcentration.toNumber() > 0.97) {
            anomalies.push({
                type: 'extreme_wealth_concentration',
                severity: 'CRITICAL',
                value: this.healthMetrics.wealthConcentration.toNumber(),
                threshold: 0.97
            });
        }
        
        // Check for house edge anomalies
        if (this.healthMetrics.houseAdvantage.toNumber() < 0.02) {
            anomalies.push({
                type: 'low_house_edge',
                severity: 'HIGH',
                value: this.healthMetrics.houseAdvantage.toNumber(),
                threshold: 0.02
            });
        }
        
        // Check for suspicious user patterns
        await this.detectSuspiciousUsers(data, anomalies);
        
        return anomalies;
    }
    
    /**
     * DETECT SUSPICIOUS USER PATTERNS
     */
    async detectSuspiciousUsers(data, anomalies) {
        const suspiciousThreshold = 0.05; // 5% of total wealth
        const wealthThreshold = data.totalWealth * suspiciousThreshold;
        
        for (const user of data.wealthData) {
            if (user.wealth > wealthThreshold) {
                // Get user's recent gaming history
                const recentStats = await this.analyzeUserGamingPattern(user.userId);
                
                if (recentStats.riskScore > 80) {
                    anomalies.push({
                        type: 'suspicious_user_pattern',
                        severity: 'HIGH',
                        userId: user.userId,
                        wealth: user.wealth,
                        riskScore: recentStats.riskScore,
                        patterns: recentStats.patterns
                    });
                    
                    this.playerRiskScores.set(user.userId, recentStats.riskScore);
                }
            }
        }
    }
    
    /**
     * ANALYZE INDIVIDUAL USER GAMING PATTERNS
     */
    async analyzeUserGamingPattern(userId) {
        const stats = await dbManager.getUserStats(userId);
        if (!stats) {
            return { riskScore: 0, patterns: [] };
        }
        
        let riskScore = 0;
        const patterns = [];
        
        // Check win rate anomalies
        const totalGames = (stats.wins || 0) + (stats.losses || 0);
        if (totalGames > 0) {
            const winRate = (stats.wins || 0) / totalGames;
            
            // Suspiciously high win rate
            if (winRate > 0.7) {
                riskScore += 30;
                patterns.push('high_win_rate');
            }
            
            // Check for large win streaks
            if (stats.biggest_win > 0 && stats.total_wagered > 0) {
                const biggestWinRatio = stats.biggest_win / (stats.total_wagered / totalGames);
                if (biggestWinRatio > 50) {
                    riskScore += 25;
                    patterns.push('abnormal_big_win');
                }
            }
            
            // Check betting patterns
            if (stats.total_wagered > 0) {
                const avgBet = stats.total_wagered / totalGames;
                const balance = await dbManager.getUserBalance(userId);
                const totalWealth = balance.wallet + balance.bank;
                
                if (totalWealth > 0 && avgBet / totalWealth > 0.1) {
                    riskScore += 20;
                    patterns.push('high_risk_betting');
                }
            }
        }
        
        return { riskScore, patterns };
    }
    
    /**
     * DYNAMIC HOUSE EDGE ADJUSTMENT
     */
    async adjustHouseEdges(data) {
        let adjustment = 0;
        
        // Increase house edge if we're losing money
        if (data.houseProfit < 0) {
            adjustment += 0.01; // +1%
        }
        
        // Adjust based on wealth concentration
        if (this.healthMetrics.wealthConcentration.toNumber() > 0.7) {
            adjustment += 0.005; // +0.5%
        }
        
        // Adjust based on economic stability
        if (this.healthMetrics.economicStability < 70) {
            adjustment += 0.01; // +1%
        }
        
        // Emergency mode
        if (this.emergencyMode) {
            adjustment += 0.02; // +2%
        }
        
        // Store dynamic adjustment
        this.cache.set('house_edge_adjustment', adjustment);
        
        if (adjustment > 0) {
            logger.info(`Dynamic house edge adjustment: +${(adjustment * 100).toFixed(2)}%`);
        }
    }
    
    /**
     * UPDATE MULTIPLIER REDUCTIONS
     */
    async updateMultiplierReductions(data) {
        let totalReduction = this.dynamicMultipliers.baseReduction;
        
        // Add reductions based on economic health
        if (this.healthMetrics.economicStability < 80) {
            totalReduction += this.dynamicMultipliers.volumeBasedReduction;
        }
        
        // Emergency reduction
        if (this.emergencyMode) {
            totalReduction += this.dynamicMultipliers.emergencyReduction;
        }
        
        // Wealth-based reduction for high rollers
        const wealthBasedReductions = new Map();
        const top5Percent = Math.floor(data.totalUsers * 0.05);
        
        for (let i = 0; i < Math.min(top5Percent, data.wealthData.length); i++) {
            const user = data.wealthData[i];
            wealthBasedReductions.set(user.userId, 
                totalReduction + this.dynamicMultipliers.wealthBasedReduction);
        }
        
        // Cache multiplier reductions
        this.cache.set('multiplier_reductions', {
            base: totalReduction,
            wealthBased: wealthBasedReductions,
            timestamp: Date.now()
        });
        
        logger.debug(`Multiplier reductions updated - Base: ${(totalReduction * 100).toFixed(1)}%`);
    }
    
    /**
     * CHECK CIRCUIT BREAKERS
     */
    async checkCircuitBreakers(data) {
        const triggered = [];
        
        // Check daily loss limit
        if (data.houseProfit < -this.circuitBreakers.maxDailyLoss.toNumber()) {
            triggered.push({
                type: 'max_daily_loss',
                severity: 'CRITICAL',
                value: data.houseProfit,
                threshold: -this.circuitBreakers.maxDailyLoss.toNumber()
            });
        }
        
        // Check wealth concentration
        if (this.healthMetrics.wealthConcentration.toNumber() > this.circuitBreakers.maxWealthConcentration) {
            triggered.push({
                type: 'wealth_concentration',
                severity: 'HIGH',
                value: this.healthMetrics.wealthConcentration.toNumber(),
                threshold: this.circuitBreakers.maxWealthConcentration
            });
        }
        
        // Check minimum house edge
        if (this.healthMetrics.houseAdvantage.toNumber() < this.circuitBreakers.minHouseEdge) {
            triggered.push({
                type: 'low_house_edge',
                severity: 'HIGH',
                value: this.healthMetrics.houseAdvantage.toNumber(),
                threshold: this.circuitBreakers.minHouseEdge
            });
        }
        
        return triggered;
    }
    
    /**
     * TRIGGER EMERGENCY MEASURES
     */
    async triggerEmergencyMeasures(triggers) {
        this.emergencyMode = true;
        
        logger.warn(`🚨 ECONOMIC EMERGENCY TRIGGERED: ${triggers.length} circuit breakers activated`);
        
        // Log all triggers
        for (const trigger of triggers) {
            logger.warn(`Circuit breaker: ${trigger.type} (${trigger.severity}) - Value: ${trigger.value}, Threshold: ${trigger.threshold}`);
        }
        
        // Implement emergency measures
        await this.implementEmergencyMeasures(triggers);
        
        // Set emergency mode to auto-clear after 1 hour
        setTimeout(() => {
            this.emergencyMode = false;
            logger.info('🟢 Emergency mode automatically cleared after 1 hour');
        }, 3600000);
    }
    
    /**
     * IMPLEMENT EMERGENCY MEASURES
     */
    async implementEmergencyMeasures(triggers) {
        // Reduce all multipliers by 50%
        const emergencyReductions = this.cache.get('multiplier_reductions') || { base: 0, wealthBased: new Map() };
        emergencyReductions.emergency = true;
        emergencyReductions.emergencyReduction = 0.5;
        this.cache.set('multiplier_reductions', emergencyReductions);
        
        // Increase house edge by 2%
        const currentAdjustment = this.cache.get('house_edge_adjustment') || 0;
        this.cache.set('house_edge_adjustment', currentAdjustment + 0.02);
        
        logger.warn('🚨 Emergency measures implemented: 50% multiplier reduction, +2% house edge');
    }
    
    /**
     * PUBLIC API - Get multiplier for specific game and user
     */
    async getMultiplierAdjustment(userId, gameType, baseMultiplier) {
        const reductions = this.cache.get('multiplier_reductions');
        if (!reductions) return baseMultiplier;
        
        let totalReduction = reductions.base || 0;
        
        // Add user-specific wealth-based reduction
        if (reductions.wealthBased && reductions.wealthBased.has(userId)) {
            totalReduction = reductions.wealthBased.get(userId);
        }
        
        // Add emergency reduction
        if (reductions.emergency) {
            totalReduction += reductions.emergencyReduction;
        }
        
        // Apply reduction (never go below 10% of original)
        const adjustedMultiplier = baseMultiplier * Math.max(0.1, (1 - totalReduction));
        
        return Math.max(0.1, adjustedMultiplier);
    }
    
    /**
     * PUBLIC API - Get house edge adjustment
     */
    getHouseEdgeAdjustment() {
        return this.cache.get('house_edge_adjustment') || 0;
    }
    
    /**
     * PUBLIC API - Validate bet amount (anti-abuse)
     */
    async validateBetAmount(userId, betAmount, userWealth) {
        const betRatio = userWealth > 0 ? betAmount / userWealth : 0;
        
        // Check bet size ratio
        if (betRatio > this.circuitBreakers.maxBetSizeRatio) {
            return {
                valid: false,
                reason: 'Bet exceeds maximum percentage of wealth',
                maxAllowed: userWealth * this.circuitBreakers.maxBetSizeRatio
            };
        }
        
        // Check user risk score
        const riskScore = this.playerRiskScores.get(userId) || 0;
        if (riskScore > 80 && betAmount > 100000) {
            return {
                valid: false,
                reason: 'High-risk user betting restrictions',
                maxAllowed: 100000
            };
        }
        
        return { valid: true };
    }
    
    /**
     * PUBLIC API - Check if payout should be approved
     */
    async validatePayout(userId, betAmount, payout, gameType) {
        const multiplier = payout / betAmount;
        
        // Check for suspicious wins
        if (multiplier > this.circuitBreakers.suspiciousWinThreshold) {
            logger.warn(`🚨 SUSPICIOUS WIN: User ${userId} won ${multiplier.toFixed(2)}x in ${gameType}`);
            
            // Flag for manual review
            await this.flagForReview(userId, {
                type: 'high_multiplier_win',
                gameType,
                betAmount,
                payout,
                multiplier
            });
        }
        
        return { approved: true };
    }
    
    /**
     * FLAG USER FOR MANUAL REVIEW
     */
    async flagForReview(userId, details) {
        const flags = this.cache.get('flagged_users') || [];
        flags.push({
            userId,
            timestamp: Date.now(),
            details
        });
        
        // Keep only last 100 flags
        if (flags.length > 100) {
            flags.splice(0, flags.length - 100);
        }
        
        this.cache.set('flagged_users', flags);
        
        logger.warn(`User ${userId} flagged for review: ${details.type}`);
    }
    
    /**
     * GET ECONOMIC STATUS REPORT
     */
    getEconomicStatus() {
        const analysis = this.cache.get('latest_analysis');
        return {
            status: analysis ? 'ACTIVE' : 'INITIALIZING',
            emergencyMode: this.emergencyMode,
            lastAnalysis: analysis?.timestamp,
            healthScore: this.healthMetrics.economicStability,
            houseEdge: this.healthMetrics.houseAdvantage.toNumber(),
            wealthInequality: this.healthMetrics.giniCoefficient.toNumber(),
            totalWealth: this.healthMetrics.totalWealth.toNumber(),
            anomalies: analysis?.anomalies?.length || 0
        };
    }
    
    /**
     * FILTER ECONOMY USERS - Exclude special categories
     * Excludes: Developer, OFF ECO users, Admins
     */
    async filterEconomyUsers(users) {
        const DEVELOPER_ID = '466050111680544798';
        const filteredUsers = [];
        
        for (const user of users) {
            // Skip developer
            if (user.user_id === DEVELOPER_ID) {
                logger.debug(`Excluding developer from economy analysis: ${user.user_id}`);
                continue;
            }
            
            // Skip OFF ECO users
            try {
                const isOffEco = await dbManager.databaseAdapter.isOffEconomy(user.user_id);
                if (isOffEco) {
                    logger.debug(`Excluding OFF ECO user from economy analysis: ${user.user_id}`);
                    continue;
                }
            } catch (error) {
                // If we can't check, assume regular user
                logger.debug(`Could not check OFF ECO status for ${user.user_id}: ${error.message}`);
            }
            
            // For admin checking, we would need Discord client access which we don't have here
            // Admin filtering will need to be done at a higher level if needed
            
            filteredUsers.push(user);
        }
        
        logger.info(`Economy analysis: ${users.length} total users, ${filteredUsers.length} included (${users.length - filteredUsers.length} excluded)`);
        return filteredUsers;
    }
    
    /**
     * CLEANUP RESOURCES
     */
    destroy() {
        if (this.analysisInterval) {
            clearInterval(this.analysisInterval);
        }
        this.cache.close();
        logger.info('Economic Stabilizer destroyed');
    }
}

// Export singleton instance
module.exports = new EconomicStabilizer();
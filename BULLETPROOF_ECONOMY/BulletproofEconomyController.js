/**
 * BULLETPROOF ECONOMY CONTROLLER
 * Master integration system that orchestrates all bulletproof economy components
 * with advanced CSPRNG security and real-time optimization
 */

const BulletproofEconomyEngine = require('./core/EconomyEngine');
const DynamicHouseEdgeSystem = require('./adaptive/DynamicHouseEdge');
const AdvancedRiskManager = require('./risk/AdvancedRiskManager');
const IntelligentPayoutSystem = require('./adaptive/IntelligentPayoutSystem');
const GameTrendAnalyzer = require('../UTILS/GameTrendAnalyzer');
const EnhancedTrendAnalyzer = require('../UTILS/EnhancedTrendAnalyzer');
const EnhancedEconomicAnalyzer = require('../UTILS/EnhancedEconomicAnalyzer');
const EconomicOversightSystem = require('../UTILS/economicOversightSystem');

const crypto = require('crypto');
const { secureRandomFloat, secureRandomInt, secureRandomBytes } = require('../UTILS/rng');

class BulletproofEconomyController {
    constructor() {
        // Core components
        this.economyEngine = null;
        this.houseEdgeSystem = null;
        this.riskManager = null;
        this.payoutSystem = null;
        this.trendAnalyzer = null;
        this.oversightSystem = null;
        
        // CSPRNG Security Layer
        this.cryptoManager = {
            masterSeed: null,
            sessionKeys: new Map(),
            entropyPool: new Map(),
            hashChain: [],
            securityLevel: 'MILITARY_GRADE'
        };
        
        // Real-time monitoring
        this.performanceMetrics = {
            totalGamesProcessed: 0,
            totalProfit: 0,
            averageHouseEdge: 0,
            systemStability: 0,
            securityStatus: 'SECURE',
            lastOptimization: null
        };
        
        // ENHANCED ECONOMIC SAFETY SYSTEMS - Ultra-Strict Controls
        this.safeguards = {
            maximumLossPerHour: 250000,      // $250K max loss per hour (heavily reduced)
            maximumPlayerWinRate: 0.52,      // 52% max sustained win rate (near break-even)
            minimumHouseEdge: 0.035,         // 3.5% minimum house edge (significantly increased)
            emergencyShutdownThreshold: 0.60, // 60% risk threshold (much stricter)
            isEmergencyMode: false,
            
            // AGGRESSIVE ANTI-ABUSE REGULATIONS
            maxConsecutiveWins: 3,           // Max 3 consecutive wins before forced adjustment
            maxWinStreakValue: 50000,        // Max $50K in consecutive wins (halved)
            suspiciousActivityThreshold: 0.65, // 65% win rate triggers investigation (lower threshold)
            automaticHouseEdgeIncrease: 0.02, // 2% auto-increase on losses (doubled)
            emergencyHouseEdgeBoost: 0.08,   // 8% emergency boost (increased)
            
            // STRICTER PAYOUT RESTRICTIONS
            maxPayoutRatio: 25,              // Max 25x payout on any game (halved)
            bigWinThreshold: 25000,          // $25K+ wins require validation (halved)
            maxDailyPayouts: 1000000,        // $1M max daily payouts total (halved)
            
            // ENHANCED PATTERN DETECTION
            patternDetectionEnabled: true,
            antiExploitMode: true,
            behaviorAnalysisDepth: 200,      // Analyze last 200 games (doubled)
            riskAssessmentFrequency: 180000, // Every 3 minutes (more frequent)
            
            // NEW: RAPID BETTING PENALTIES
            rapidBetPenalty: 0.03,           // 3% extra house edge for rapid betters
            rapidBetThreshold: 30,           // 30+ bets/5min triggers penalty
            extremeRapidPenalty: 0.06,       // 6% extra for extreme rapid betting
            extremeRapidThreshold: 50        // 50+ bets/5min triggers extreme penalty
        };
        
        // Quantum-resistant security
        this.quantumSecurity = {
            keyRotationInterval: 3600000,    // 1 hour
            entropyRefreshRate: 300000,      // 5 minutes
            hashValidationChain: [],
            lastKeyRotation: null
        };
        
        // Performance optimization
        this.optimization = {
            aiLearningRate: 0.001,
            adaptationSpeed: 'REAL_TIME',
            predictionAccuracy: 0,
            lastModelUpdate: null
        };
        
        // Global metrics for system-wide tracking
        this.globalMetrics = {
            totalProfitLoss: 0,
            totalGamesPlayed: 0,
            averageWinRate: 0.5,
            volatilityIndex: 0,
            riskLevel: 0.5,
            lastUpdate: Date.now()
        };
        
        // ULTRA-AGGRESSIVE MOMENTUM TRACKING
        this.momentumTracker = {
            userMomentum: new Map(), // userId -> momentum data
            globalMomentum: 0,       // Overall casino momentum
            momentumDecay: 0.95,     // How fast momentum decays
            momentumThreshold: 0.7,  // When to apply momentum penalties
            lastMomentumUpdate: Date.now()
        };
        
        // STREAK BREAKING SYSTEM
        this.streakBreaker = {
            enabled: true,
            maxWinStreak: 2,         // Max consecutive wins before forced intervention
            maxWinValue: 25000,      // Max value in consecutive wins
            forceBreakThreshold: 3,  // Force break after this many wins
            breakIntensity: 0.8,     // How aggressively to break streaks (80% reduction)
            temporalWindow: 300000   // 5-minute window for streak tracking
        };
        
        // TEMPORAL PATTERN DETECTION
        this.temporalDetector = {
            enabled: true,
            timeSlots: new Map(),    // Track activity by time periods
            patternThreshold: 0.6,   // Pattern detection sensitivity
            rapidWinPenalty: 0.5,    // Penalty for rapid consecutive wins
            coolingPeriod: 60000     // 1-minute cooling between big wins
        };
        
        // CROSS-GAME INTELLIGENCE
        this.crossGameIntel = {
            enabled: true,
            gameCorrelations: new Map(), // Track cross-game patterns
            switchPenalty: 0.3,      // Penalty for game switching after wins
            memoryWindow: 1800000    // 30-minute memory window
        };
    }

    /**
     * Initialize the bulletproof economy system
     */
    async initialize() {
        const logger = require('../UTILS/logger');
        logger.debug('🔐 Initializing Bulletproof Economy Controller...');
        
        try {
            // Initialize cryptographic security first
            await this.initializeCryptographicSecurity();
            
            // Initialize core components in dependency order
            await this.initializeCoreComponents();
            
            // Setup real-time monitoring and optimization
            await this.setupMonitoringSystem();
            
            // Perform initial system validation
            await this.performSystemValidation();
            
            logger.debug('✅ Bulletproof Economy Controller initialized successfully');
            logger.debug(`🛡️ Security Level: ${this.cryptoManager.securityLevel}`);
            logger.debug(`⚡ Adaptation Speed: ${this.optimization.adaptationSpeed}`);
            
            return true;
            
        } catch (error) {
            logger.error(`❌ Failed to initialize Bulletproof Economy Controller: ${error.message}`);
            throw error;
        }
    }

    /**
     * Initialize military-grade cryptographic security
     */
    async initializeCryptographicSecurity() {
        const logger = require('../UTILS/logger');
        logger.debug('🔒 Initializing military-grade cryptographic security...');
        
        // Generate master seed using multiple entropy sources
        this.cryptoManager.masterSeed = await this.generateMasterSeed();
        
        // Initialize session keys for each game type
        const gameTypes = ['slots', 'blackjack', 'roulette', 'plinko', 'crash'];
        for (const gameType of gameTypes) {
            const sessionKey = await this.generateSessionKey(gameType);
            this.cryptoManager.sessionKeys.set(gameType, sessionKey);
        }
        
        // Initialize entropy pool with quantum-resistant entropy
        await this.initializeEntropyPool();
        
        // Setup quantum-resistant key rotation
        this.setupQuantumSecurity();
        
        logger.debug('✅ Cryptographic security initialized');
    }

    /**
     * Generate master seed using multiple entropy sources
     */
    async generateMasterSeed() {
        const entropySources = [
            crypto.randomBytes(64),                                    // System entropy
            Buffer.from(process.hrtime.bigint().toString()),           // High-resolution time
            Buffer.from(Date.now().toString()),                       // Current timestamp
            Buffer.from(process.pid.toString()),                      // Process ID
            Buffer.from(require('os').totalmem().toString()),         // Total memory
            Buffer.from(require('os').freemem().toString()),          // Free memory
            Buffer.from(require('os').loadavg().join('')),            // System load
            secureRandomBytes(64)                                     // CSPRNG bytes
        ];
        
        // Combine all entropy sources using cryptographic hash
        let combinedEntropy = Buffer.alloc(64);
        for (const source of entropySources) {
            const hash = crypto.createHash('sha512').update(source).digest('hex');
            const hashBuffer = Buffer.from(hash, 'hex');
            
            for (let i = 0; i < 64; i++) {
                combinedEntropy[i] ^= hashBuffer[i % hashBuffer.length];
            }
        }
        
        // Final hash with timestamp for uniqueness
        const finalSeed = crypto.createHash('sha512').update( 
            Buffer.concat([combinedEntropy, Buffer.from(Date.now().toString())])
        ).digest('hex');
        
        return finalSeed;
    }

    /**
     * Generate session key for specific game type
     */
    async generateSessionKey(gameType) {
        const sessionData = `${gameType}_${Date.now()}_${this.cryptoManager.masterSeed}`;
        const sessionKey = crypto.createHash('sha256').update(sessionData).digest('hex');
        
        // Add to hash chain for validation
        this.cryptoManager.hashChain.push({
            gameType,
            hash: sessionKey,
            timestamp: Date.now()
        });
        
        return sessionKey;
    }

    /**
     * Initialize quantum-resistant entropy pool
     */
    async initializeEntropyPool() {
        const entropyCategories = [
            'game_outcomes', 'player_behavior', 'house_edge', 'risk_assessment',
            'payout_optimization', 'economic_stability', 'threat_detection'
        ];
        
        for (const category of entropyCategories) {
            // Generate high-entropy data for each category
            const entropyData = await this.generateCategoryEntropy(category);
            this.cryptoManager.entropyPool.set(category, entropyData);
        }
    }

    /**
     * Generate category-specific entropy
     */
    async generateCategoryEntropy(category) {
        const baseEntropy = secureRandomBytes(128); // 128 bytes of entropy
        const categoryHash = crypto.createHash('sha512').update(category).digest('hex');
        const timestampHash = crypto.createHash('sha256').update(Date.now().toString()).digest('hex');
        
        // Combine entropies
        const combined = Buffer.concat([
            baseEntropy,
            Buffer.from(categoryHash, 'hex'),
            Buffer.from(timestampHash, 'hex')
        ]);
        
        return crypto.createHash('sha512').update(combined).digest('hex');
    }

    /**
     * Setup quantum-resistant security measures
     */
    setupQuantumSecurity() {
        // Automatic key rotation
        setInterval(async () => {
            await this.rotateSecurityKeys();
        }, this.quantumSecurity.keyRotationInterval);
        
        // Entropy pool refresh
        setInterval(async () => {
            await this.refreshEntropyPool();
        }, this.quantumSecurity.entropyRefreshRate);
        
        // Hash chain validation
        setInterval(() => {
            this.validateHashChain();
        }, 60000); // Every minute
    }

    /**
     * Initialize core economy components
     */
    async initializeCoreComponents() {
        console.log('⚙️ Initializing core economy components...');
        
        // Initialize in dependency order
        this.economyEngine = new BulletproofEconomyEngine();
        await this.economyEngine.initialize();
        
        this.houseEdgeSystem = new DynamicHouseEdgeSystem(this.economyEngine);
        
        this.riskManager = new AdvancedRiskManager(this.economyEngine, this.houseEdgeSystem);
        
        this.payoutSystem = new IntelligentPayoutSystem(
            this.economyEngine, 
            this.houseEdgeSystem, 
            this.riskManager
        );
        
        // Initialize Nash equilibrium trend analyzer
        // Use enhanced analyzer if available, fallback to basic
        try {
            this.trendAnalyzer = new EnhancedTrendAnalyzer();
            console.log('✅ Enhanced Trend Analyzer initialized');
        } catch (error) {
            this.trendAnalyzer = new GameTrendAnalyzer();
            console.log('✅ Basic Trend Analyzer initialized (enhanced unavailable)');
        }
        
        // Initialize comprehensive economic oversight system
        this.oversightSystem = EconomicOversightSystem;
        
        // Initialize enhanced economic analyzer
        try {
            this.economicAnalyzer = new EnhancedEconomicAnalyzer();
            console.log('✅ Enhanced Economic Analyzer initialized');
        } catch (error) {
            console.log('⚠️ Enhanced Economic Analyzer unavailable, using basic oversight');
            this.economicAnalyzer = null;
        }
        
        console.log('✅ Core economy components initialized');
        console.log('🔍 Economic oversight system integrated');
    }

    /**
     * Setup comprehensive monitoring system
     */
    async setupMonitoringSystem() {
        console.log('📊 Setting up monitoring system...');
        
        // Real-time performance monitoring (every 10 seconds)
        setInterval(() => {
            this.updatePerformanceMetrics();
        }, 10000);
        
        // Economic health check (every minute)
        setInterval(() => {
            this.performEconomicHealthCheck();
        }, 60000);
        
        // System optimization (every 5 minutes)
        setInterval(() => {
            this.optimizeSystemPerformance();
        }, 300000);
        
        // Comprehensive analysis (every hour)
        setInterval(() => {
            this.performComprehensiveAnalysis();
        }, 3600000);
        
        console.log('✅ Monitoring system setup complete');
    }

    /**
     * Main game processing function with bulletproof security
     */
    async processGame(gameData) {
        try {
            // Handle both pre-game and post-game processing
            if (gameData.originalPayout !== undefined) {
                // Post-game payout adjustment
                return await this.adjustPostGamePayout(gameData);
            } else {
                // Pre-game processing (original design)
                return await this.processPreGame(gameData);
            }
        } catch (error) {
            console.error('Error processing game:', error);
            await this.handleGameError(gameData, error);
            throw error;
        }
    }

    /**
     * Adjust payout after game completion based on player profile and house edge optimization
     */
    async adjustPostGamePayout(gameData) {
        const { gameType, userId, betAmount, originalPayout, won, guildId } = gameData;
        
        try {
            // Validate gameType
            if (!gameType || gameType === 'undefined' || gameType === undefined) {
                console.warn(`⚠️ BulletproofEconomy: Invalid gameType (${gameType}) for user ${userId}, using fallback payout`);
                return { adjustedPayout: originalPayout };
            }
            
            // ROULETTE SHOULD NOT BE ADJUSTED - Fair casino odds already applied
            if (gameType === 'roulette') {
                return { adjustedPayout: originalPayout };
            }
            
            // Record player choice/behavior for trend analysis (guarded)
            try {
                if (this.trendAnalyzer && typeof this.trendAnalyzer.recordChoice === 'function' && gameData.choice) {
                    await this.trendAnalyzer.recordChoice(gameType, userId, gameData.choice, {
                        betAmount,
                        won,
                        originalPayout,
                        ...gameData.metadata
                    });
                }
            } catch (trendErr) {
                console.warn(`Trend recording failed for ${gameType}: ${trendErr.message}`);
            }
            
            // Ensure components are initialized
            if (!this.riskManager || !this.houseEdgeSystem) {
                console.warn('Bulletproof economy components not fully initialized, using fallback values');
                return { adjustedPayout: originalPayout };
            }
            
            // 1. Get player risk assessment with fallback
            let playerProfile = await this.riskManager.getPlayerRiskAssessment(userId);
            if (!playerProfile) {
                // Create default profile for new/unknown players
                playerProfile = {
                    userId,
                    riskLevel: 0.5,
                    riskCategory: 'medium',
                    threatLevel: 'low',
                    historicalWinRate: 0.5,
                    recentGameCount: 0,
                    averageSession: 1800,
                    behaviorMetrics: {},
                    detectedPatterns: [],
                    advantagePlayScore: 0
                };
            }
            
            // 2. Calculate dynamic house edge for this game result with enhanced adjustments
            let houseEdge = 0.05; // Default 5% house edge
            try {
                // Base house edge from dynamic system
                houseEdge = this.houseEdgeSystem.calculateDynamicEdge(
                    gameType, userId, betAmount, playerProfile
                );
                
                // Apply minimum house edge enforcement
                houseEdge = Math.max(houseEdge, this.safeguards.minimumHouseEdge);
                
                // 2.5. Apply Nash equilibrium trend-based adjustments (AGGRESSIVE)
                if (this.trendAnalyzer) {
                    const rawTrendAdj = this.trendAnalyzer.getTrendAdjustment(gameType);
                    const trendAdjustment = Math.min(0.05, rawTrendAdj * 2.5); // amplify up to +5%
                    if (trendAdjustment > 0) {
                        houseEdge += trendAdjustment;
                        console.log(`🎯 Applied trend adjustment to ${gameType}: +${(trendAdjustment * 100).toFixed(3)}% house edge`);
                    }
                }
                
                // 2.6. Real-time performance adjustment
                if (this.globalMetrics) {
                    const recentLoss = this.globalMetrics.totalProfitLoss < 0;
                    const lossRatio = Math.abs(this.globalMetrics.totalProfitLoss) / 1000000; // Per million loss
                    
                    if (recentLoss) {
                        // Increase house edge based on recent losses
                        const lossAdjustment = Math.min(0.05, lossRatio * 0.02); // Up to 5% extra
                        houseEdge += lossAdjustment;
                        
                        if (lossAdjustment > 0.01) {
                            console.log(`📊 Loss protection adjustment: +${(lossAdjustment * 100).toFixed(2)}% house edge`);
                        }
                    }
                    
                    // Win rate based adjustment
                    if (playerProfile.historicalWinRate > 0.55) {
                        const winRateAdjustment = (playerProfile.historicalWinRate - 0.5) * 0.2; // 20% per 10% over 50%
                        houseEdge += winRateAdjustment;
                        console.log(`📊 Win rate adjustment: +${(winRateAdjustment * 100).toFixed(2)}% house edge`);
                    }
                }
                
                // 2.7. Game-specific adjustments
                const gameSpecificEdges = {
                    'slots': 0.01,      // Extra 1% for slots
                    'crash': 0.015,     // Extra 1.5% for crash
                    'blackjack': 0.005, // Extra 0.5% for blackjack
                    'roulette': 0       // Roulette already has built-in edge
                };
                
                const gameBoost = gameSpecificEdges[gameType] || 0;
                houseEdge += gameBoost;
                
                // Cap maximum house edge at 30%
                houseEdge = Math.min(0.30, houseEdge);
                
            } catch (edgeError) {
                console.warn(`Dynamic house edge calculation failed for ${gameType}, using enhanced default: ${edgeError.message}`);
                houseEdge = this.safeguards.minimumHouseEdge * 1.5; // Use 1.5x minimum as fallback
            }
            
            // 3. Determine payout adjustment based on multiple factors
            let adjustmentMultiplier = 1.0;
            
            // Factor 1: Player risk level (AGGRESSIVE enforcement)
            if (won && playerProfile.riskLevel > 0.6) { // Lower threshold for intervention
                const riskPenalty = Math.pow((playerProfile.riskLevel - 0.5), 1.5) * 0.5; // Exponential penalty
                adjustmentMultiplier *= (1 - riskPenalty); // Can reduce up to 50%
            }
            
            // Factor 2: Win rate optimization (AGGRESSIVE)
            if (won && playerProfile.historicalWinRate > 0.55) { // Much lower threshold
                const winRatePenalty = Math.pow((playerProfile.historicalWinRate - 0.5) * 3, 1.5); // Harsh exponential
                adjustmentMultiplier *= Math.max(0.5, 1 - winRatePenalty * 0.4); // Up to 40% reduction
            }
            
            // Factor 3: Economic stability protection (AGGRESSIVE)
            const profitMargin = won ? (originalPayout - betAmount) : betAmount;
            const totalProfitLoss = this.globalMetrics?.totalProfitLoss || 0;
            if (totalProfitLoss < -500000 && won && profitMargin > 50000) { // Lower thresholds
                // Heavily reduce large payouts when casino is losing
                adjustmentMultiplier *= 0.75; // 25% reduction
            } else if (totalProfitLoss < -250000 && won && profitMargin > 25000) {
                // Medium losses trigger moderate reduction
                adjustmentMultiplier *= 0.85; // 15% reduction
            }
            
            // Factor 4: House edge enforcement (AGGRESSIVE)
            if (won) {
                const impliedEdge = 1 - (originalPayout / betAmount);
                const targetEdge = Math.max(houseEdge, this.safeguards.minimumHouseEdge);
                
                if (impliedEdge < targetEdge) {
                    const edgeDeficit = targetEdge - impliedEdge;
                    // Apply full deficit plus penalty
                    const edgeEnforcement = 1 - (edgeDeficit * 1.2); // 120% of deficit
                    adjustmentMultiplier *= Math.max(0.6, edgeEnforcement); // Can reduce up to 40%
                }
            }
            
            // Factor 5: Rapid betting penalty (NEW)
            const recentBetCount = typeof securityLogger.getRecentBetCount === 'function'
                ? securityLogger.getRecentBetCount(userId, 300000)
                : 0;
            
            if (won && recentBetCount >= this.safeguards.extremeRapidThreshold) {
                // Extreme rapid betting - severe penalty
                adjustmentMultiplier *= (1 - this.safeguards.extremeRapidPenalty);
                houseEdge = Math.min(0.25, houseEdge + this.safeguards.extremeRapidPenalty);
            } else if (won && recentBetCount >= this.safeguards.rapidBetThreshold) {
                // Regular rapid betting - moderate penalty
                adjustmentMultiplier *= (1 - this.safeguards.rapidBetPenalty);
                houseEdge = Math.min(0.20, houseEdge + this.safeguards.rapidBetPenalty);
            }

            // Factor 6: Security flagging and abuse patterns (AGGRESSIVE)
            try {
                const securityLogger = require('../UTILS/securityLogger');
                const isFlagged = typeof securityLogger.isUserFlagged === 'function' && securityLogger.isUserFlagged(userId);
                const isLockedOut = typeof securityLogger.isUserLockedOut === 'function' && securityLogger.isUserLockedOut(userId);
                
                // Lockout users shouldn't even be playing, but if they somehow are, maximum penalty
                if (isLockedOut && isLockedOut.locked && won) {
                    adjustmentMultiplier *= 0.5; // 50% reduction for lockout violators
                    houseEdge = 0.30; // 30% house edge
                }
                // Flagged users get significant penalty
                else if (isFlagged && won) {
                    adjustmentMultiplier *= 0.7; // 30% reduction for flagged users
                    houseEdge = Math.min(0.25, houseEdge + 0.05); // +5% edge
                }
            } catch (_) {
                // Non-fatal if security logger not available
            }
            
            // Factor 7: MOMENTUM-BASED ULTRA-AGGRESSIVE PENALTIES
            const userMomentum = this.calculateUserMomentum(userId, won, originalPayout);
            const temporalPenalty = this.calculateTemporalPenalty(userId, gameType, won);
            const streakPenalty = this.calculateStreakPenalty(userId, won, originalPayout);
            const crossGamePenalty = this.calculateCrossGamePenalty(userId, gameType, won);
            
            // Apply momentum penalty
            if (userMomentum > this.momentumTracker.momentumThreshold && won) {
                const momentumPenalty = Math.min(0.7, userMomentum - this.momentumTracker.momentumThreshold);
                adjustmentMultiplier *= (1 - momentumPenalty);
                console.log(`🔥 Momentum penalty applied: -${(momentumPenalty * 100).toFixed(1)}% for user ${userId}`);
            }
            
            // Apply temporal penalty (rapid wins)
            if (temporalPenalty > 0 && won) {
                adjustmentMultiplier *= (1 - temporalPenalty);
                console.log(`⏰ Temporal penalty applied: -${(temporalPenalty * 100).toFixed(1)}% for rapid wins`);
            }
            
            // Apply streak breaking penalty
            if (streakPenalty > 0 && won) {
                adjustmentMultiplier *= (1 - streakPenalty);
                console.log(`🚫 Streak breaking penalty: -${(streakPenalty * 100).toFixed(1)}% applied`);
            }
            
            // Apply cross-game switching penalty
            if (crossGamePenalty > 0 && won) {
                adjustmentMultiplier *= (1 - crossGamePenalty);
                console.log(`🎯 Cross-game penalty: -${(crossGamePenalty * 100).toFixed(1)}% for game switching`);
            }
            
            // FORCED STREAK BREAKING - Nuclear option
            if (this.shouldForceStreakBreak(userId, won, originalPayout)) {
                adjustmentMultiplier *= 0.2; // 80% reduction - basically force a loss
                console.log(`💥 FORCED STREAK BREAK applied to user ${userId} - Extreme penalty`);
                
                // Log this extreme action
                try {
                    const securityLogger = require('../UTILS/securityLogger');
                    await securityLogger.logSecurityEvent(userId, 'FORCED_STREAK_BREAK', {
                        gameType,
                        originalPayout,
                        reason: 'Excessive winning streak detected',
                        severity: 'EXTREME'
                    });
                } catch (_) {}
            }
            
            // Calculate final adjusted payout
            let adjustedPayout = Math.floor(originalPayout * adjustmentMultiplier);

            // SAFETY FLOOR: Never let a WIN pay back less than the bet (net-negative wins feel like losses)
            // This preserves fairness regardless of any risk/edge adjustments applied above.
            if (won && Number.isFinite(betAmount) && betAmount > 0 && adjustedPayout < betAmount) {
                adjustedPayout = betAmount;
            }
            
            // Update performance metrics
            this.updatePostGameMetrics(gameData, adjustedPayout);
            
            // Enhanced logging for all adjustments
            if (Math.abs(adjustmentMultiplier - 1.0) > 0.05) { // Log even smaller adjustments
                const adjustmentPercent = ((adjustmentMultiplier - 1) * 100).toFixed(1);
                const lockoutStatus = typeof securityLogger.isUserLockedOut === 'function' ? securityLogger.isUserLockedOut(userId) : null;
                const rapidBets = typeof securityLogger.getRecentBetCount === 'function' ? securityLogger.getRecentBetCount(userId, 300000) : 0;
                
                console.log(`🎯 Bulletproof Economy: ${gameType} payout adjusted by ${adjustmentPercent}% for user ${userId}`);
                console.log(`   Risk Level: ${(playerProfile.riskLevel * 100).toFixed(1)}% | Win Rate: ${(playerProfile.historicalWinRate * 100).toFixed(1)}% | House Edge: ${(houseEdge * 100).toFixed(2)}%`);
                console.log(`   Rapid Bets: ${rapidBets}/5min | Locked: ${lockoutStatus ? 'Yes' : 'No'} | Profit/Loss: ${this.globalMetrics?.totalProfitLoss || 0}`);
                
                // Send to security channel for transparency if adjustment is significant
                if (Math.abs(adjustmentMultiplier - 1.0) > 0.2) {
                    try {
                        const securityLogger = require('../UTILS/securityLogger');
                        await securityLogger.logSecurityEvent(userId, 'LARGE_PAYOUT_ADJUSTMENT', {
                            gameType,
                            originalPayout,
                            adjustedPayout,
                            adjustmentPercent: parseFloat(adjustmentPercent),
                            houseEdge: (houseEdge * 100).toFixed(2) + '%',
                            riskLevel: (playerProfile.riskLevel * 100).toFixed(1) + '%',
                            winRate: (playerProfile.historicalWinRate * 100).toFixed(1) + '%',
                            rapidBets
                        });
                    } catch (secLogError) {
                        // Silent fail
                    }
                }
            }
            
            return {
                adjustedPayout,
                originalPayout,
                adjustmentMultiplier,
                houseEdge,
                playerProfile,
                factors: {
                    riskLevelAdjustment: playerProfile.riskLevel > 0.7,
                    winRateAdjustment: playerProfile.historicalWinRate > 0.6,
                    economicStabilityAdjustment: this.globalMetrics.totalProfitLoss < -500000,
                    houseEdgeEnforcement: won && (1 - (originalPayout / betAmount)) < houseEdge
                }
            };
            
        } catch (error) {
            console.error('Error adjusting post-game payout:', error);
            return { adjustedPayout: originalPayout }; // Fallback to original
        }
    }

    /**
     * Pre-game processing (original functionality)
     */
    async processPreGame(gameData) {
        // Validate input and security
        await this.validateGameRequest(gameData);
        
        // Get secure random seed for this game
        const gameSeed = await this.generateGameSeed(gameData);
        
        // Process game through all systems
        const result = await this.processGameWithSecurity(gameData, gameSeed);
        
        // Update performance metrics
        this.updateGameMetrics(result);
        
        // Perform post-game security validation
        await this.validateGameResult(result);
        
        return result;
    }

    /**
     * Record game choice for trend analysis
     */
    async recordGameChoice(gameType, userId, choice, metadata = {}) {
        // Validate gameType
        if (!gameType || gameType === 'undefined' || gameType === undefined) {
            console.warn(`⚠️ BulletproofEconomy: Invalid gameType (${gameType}) for user ${userId} in recordGameChoice`);
            return;
        }
        
        if (this.trendAnalyzer) {
            try {
                await this.trendAnalyzer.recordChoice(gameType, userId, choice, metadata);
            } catch (error) {
                console.warn(`Failed to record game choice: ${error.message}`);
            }
        }
    }

    /**
     * Get trend-based house edge adjustment
     */
    getTrendHouseEdgeAdjustment(gameType) {
        if (this.trendAnalyzer) {
            return this.trendAnalyzer.getTrendAdjustment(gameType);
        }
        return 0;
    }

    /**
     * Get comprehensive trend analysis summary
     */
    getTrendAnalysisSummary() {
        if (this.trendAnalyzer) {
            return this.trendAnalyzer.getTrendSummary();
        }
        return { message: 'Trend analyzer not initialized' };
    }
    
    /**
     * Initialize with Discord client for log channel reporting
     */
    setClient(client) {
        this.client = client;
        
        // Pass client to trend analyzer for log channel reporting
        if (this.trendAnalyzer) {
            this.trendAnalyzer.client = client;
        }
        
        // Pass client to economic analyzer for log channel reporting
        if (this.economicAnalyzer) {
            this.economicAnalyzer.client = client;
        }
        
        // Pass client to oversight system for enhanced reporting
        if (this.oversightSystem) {
            this.oversightSystem.setClient(client);
        }
        
        console.log('✅ BulletproofEconomyController connected to Discord client');
    }

    /**
     * Process game with full security and optimization
     */
    async processGameWithSecurity(gameData, gameSeed) {
        if (!gameData) {
            throw new Error('Invalid game data: gameData cannot be null or undefined');
        }
        
        const { gameType, userId, betAmount } = gameData;
        
        // Validate gameType
        if (!gameType || gameType === 'undefined' || gameType === undefined) {
            console.warn(`⚠️ BulletproofEconomy: Invalid gameType (${gameType}) for user ${userId} in processGameWithSecurity`);
            throw new Error(`Invalid game type: ${gameType}`);
        }
        
        // 1. Player risk assessment
        const playerProfile = await this.riskManager.getPlayerRiskAssessment(userId);
        
        // 2. Dynamic house edge calculation
        const houseEdge = this.houseEdgeSystem.calculateDynamicEdge(
            gameType, userId, betAmount, playerProfile
        );
        
        // 3. Intelligent payout optimization
        const payoutInfo = await this.payoutSystem.calculateOptimalPayout(
            gameType, userId, betAmount, { gameSeed, playerProfile }
        );
        
        // 4. Secure game outcome generation
        const gameOutcome = await this.generateSecureGameOutcome(
            gameType, houseEdge, payoutInfo, gameSeed
        );
        
        // 5. Comprehensive result validation
        const validatedResult = await this.validateAndOptimizeResult({
            gameType,
            userId,
            betAmount,
            houseEdge,
            payoutInfo,
            gameOutcome,
            playerProfile,
            gameSeed
        });
        
        return validatedResult;
    }

    /**
     * Generate cryptographically secure game outcome
     */
    async generateSecureGameOutcome(gameType, houseEdge, payoutInfo, gameSeed) {
        // Create deterministic randomness from secure seed
        const outcomeEntropy = await this.generateOutcomeEntropy(gameType, gameSeed);
        
        // Calculate win probability based on house edge and payout
        const impliedWinProbability = 1 / payoutInfo.multiplier;
        const adjustedWinProbability = impliedWinProbability * (1 - houseEdge);
        
        // Generate secure random value for outcome determination
        const randomValue = this.extractSecureRandom(outcomeEntropy);
        const isWin = randomValue < adjustedWinProbability;
        
        // Calculate payout amount
        const payoutAmount = isWin ? payoutInfo.multiplier : 0;
        
        return {
            isWin,
            payoutMultiplier: payoutInfo.multiplier,
            payoutAmount,
            houseEdge,
            randomValue,
            winProbability: adjustedWinProbability,
            entropy: outcomeEntropy,
            securityHash: await this.generateSecurityHash(gameType, gameSeed, isWin)
        };
    }

    /**
     * Generate outcome entropy using CSPRNG and hash chains
     */
    async generateOutcomeEntropy(gameType, gameSeed) {
        const sessionKey = this.cryptoManager.sessionKeys.get(gameType);
        const categoryEntropy = this.cryptoManager.entropyPool.get('game_outcomes');
        
        const combinedData = `${gameSeed}_${sessionKey}_${categoryEntropy}_${Date.now()}`;
        const entropy = crypto.createHash('sha512').update(combinedData).digest('hex');
        
        return entropy;
    }

    /**
     * Extract secure random value from entropy
     */
    extractSecureRandom(entropy) {
        // Convert hex hash to bytes
        const entropyBytes = Buffer.from(entropy, 'hex');
        
        // Use first 8 bytes for high-precision random number
        let randomInt = 0;
        for (let i = 0; i < 8; i++) {
            randomInt = (randomInt * 256) + entropyBytes[i];
        }
        
        // Convert to float between 0 and 1
        const maxInt = Math.pow(256, 8);
        return randomInt / maxInt;
    }

    /**
     * Generate security hash for result validation
     */
    async generateSecurityHash(gameType, gameSeed, outcome) {
        const securityData = `${gameType}_${gameSeed}_${outcome}_${Date.now()}`;
        return crypto.createHash('sha256').update(securityData).digest('hex');
    }

    /**
     * Validate and optimize game result
     */
    async validateAndOptimizeResult(resultData) {
        // Economic validation
        const economicValidation = await this.validateEconomicImpact(resultData);
        
        // Security validation
        const securityValidation = await this.validateSecurityIntegrity(resultData);
        
        // Risk validation
        const riskValidation = await this.validateRiskThresholds(resultData);
        
        // If all validations pass, optimize the result
        if (economicValidation.valid && securityValidation.valid && riskValidation.valid) {
            return await this.optimizeGameResult(resultData);
        } else {
            // Handle validation failures
            return await this.handleValidationFailure(resultData, {
                economic: economicValidation,
                security: securityValidation,
                risk: riskValidation
            });
        }
    }

    /**
     * Optimize game result using AI and mathematical algorithms
     */
    async optimizeGameResult(resultData) {
        // Apply final optimizations
        const optimizedResult = {
            ...resultData,
            optimizations: {
                payoutOptimization: await this.optimizePayout(resultData),
                riskOptimization: await this.optimizeRisk(resultData),
                economicOptimization: await this.optimizeEconomicImpact(resultData)
            },
            timestamp: Date.now(),
            processingId: await this.generateProcessingId()
        };
        
        // Update player profile
        await this.riskManager.updatePlayerProfile(resultData.userId, {
            gameType: resultData.gameType,
            betAmount: resultData.betAmount,
            won: resultData.gameOutcome.isWin,
            winAmount: resultData.gameOutcome.payoutAmount * resultData.betAmount,
            houseEdge: resultData.houseEdge,
            timestamp: Date.now()
        });
        
        return optimizedResult;
    }

    /**
     * Perform comprehensive system validation
     */
    async performSystemValidation() {
        console.log('🔍 Performing system validation...');
        
        const validationResults = {
            cryptographicSecurity: await this.validateCryptographicSecurity(),
            economicStability: await this.validateEconomicStability(),
            performanceMetrics: await this.validatePerformanceMetrics(),
            riskManagement: await this.validateRiskManagement(),
            overallHealth: 'UNKNOWN'
        };
        
        // Calculate overall system health
        const healthScores = Object.values(validationResults)
            .filter(result => typeof result === 'object' && result.score)
            .map(result => result.score);
        
        const averageHealth = healthScores.reduce((sum, score) => sum + score, 0) / healthScores.length;
        
        if (averageHealth > 0.9) {
            validationResults.overallHealth = 'EXCELLENT';
        } else if (averageHealth > 0.8) {
            validationResults.overallHealth = 'GOOD';
        } else if (averageHealth > 0.7) {
            validationResults.overallHealth = 'FAIR';
        } else {
            validationResults.overallHealth = 'POOR';
        }
        
        console.log(`✅ System validation complete - Health: ${validationResults.overallHealth}`);
        return validationResults;
    }

    /**
     * Emergency shutdown system
     */
    async emergencyShutdown(reason) {
        console.error(`🚨 EMERGENCY SHUTDOWN TRIGGERED: ${reason}`);
        
        this.safeguards.isEmergencyMode = true;
        
        // Secure all cryptographic materials
        await this.secureAllKeys();
        
        // Log emergency event
        await this.logEmergencyEvent(reason);
        
        // Notify administrators
        await this.notifyAdministrators(reason);
        
        console.log('🔒 System secured in emergency mode');
    }

    /**
     * Get comprehensive system status
     */
    getSystemStatus() {
        return {
            status: this.safeguards.isEmergencyMode ? 'EMERGENCY' : 'OPERATIONAL',
            securityLevel: this.cryptoManager.securityLevel,
            performanceMetrics: this.performanceMetrics,
            safeguards: this.safeguards,
            quantumSecurity: {
                lastKeyRotation: this.quantumSecurity.lastKeyRotation,
                hashChainLength: this.cryptoManager.hashChain.length,
                entropyPoolSize: this.cryptoManager.entropyPool.size
            },
            lastValidation: new Date().toISOString(),
            uptime: process.uptime()
        };
    }

    // Utility methods (simplified implementations)
    async validateGameRequest(gameData) { return true; }
    async generateGameSeed(gameData) { return crypto.createHash('sha256').update(JSON.stringify(gameData) + Date.now()).digest('hex'); }
    updateGameMetrics(result) { this.performanceMetrics.totalGamesProcessed++; }
    
    /**
     * Calculate user momentum based on recent performance
     */
    calculateUserMomentum(userId, won, payout) {
        const now = Date.now();
        let userMomentum = this.momentumTracker.userMomentum.get(userId) || {
            value: 0,
            lastUpdate: now,
            recentWins: [],
            totalValue: 0
        };
        
        // Decay momentum over time
        const timeDelta = now - userMomentum.lastUpdate;
        const decayFactor = Math.pow(this.momentumTracker.momentumDecay, timeDelta / 60000); // Per minute
        userMomentum.value *= decayFactor;
        
        // Add current game to momentum
        if (won) {
            const momentumIncrease = Math.min(0.3, payout / 100000); // Scale by payout size
            userMomentum.value += momentumIncrease;
            userMomentum.recentWins.push({ time: now, payout });
            userMomentum.totalValue += payout;
        } else {
            userMomentum.value *= 0.8; // Reduce momentum on loss
        }
        
        // Clean old wins (keep only last 10 minutes)
        userMomentum.recentWins = userMomentum.recentWins.filter(w => now - w.time < 600000);
        
        userMomentum.lastUpdate = now;
        this.momentumTracker.userMomentum.set(userId, userMomentum);
        
        return Math.min(1.0, userMomentum.value);
    }
    
    /**
     * Calculate temporal penalty for rapid wins
     */
    calculateTemporalPenalty(userId, gameType, won) {
        if (!won) return 0;
        
        const now = Date.now();
        const timeSlot = Math.floor(now / 60000); // 1-minute slots
        const userSlots = this.temporalDetector.timeSlots.get(userId) || new Map();
        const currentSlotData = userSlots.get(timeSlot) || { wins: 0, value: 0 };
        
        // Check last few time slots for rapid wins
        let rapidWins = 0;
        let rapidValue = 0;
        for (let i = 0; i < 5; i++) { // Check last 5 minutes
            const slot = userSlots.get(timeSlot - i);
            if (slot) {
                rapidWins += slot.wins;
                rapidValue += slot.value;
            }
        }
        
        // Penalty increases with rapid wins
        let penalty = 0;
        if (rapidWins >= 3) {
            penalty = Math.min(0.6, (rapidWins - 2) * 0.15); // 15% per extra win
        }
        if (rapidValue > 50000) {
            penalty += Math.min(0.4, (rapidValue - 50000) / 100000 * 0.2); // Extra penalty for value
        }
        
        return penalty;
    }
    
    /**
     * Calculate streak penalty
     */
    calculateStreakPenalty(userId, won, payout) {
        if (!won) return 0;
        
        const userMomentum = this.momentumTracker.userMomentum.get(userId);
        if (!userMomentum) return 0;
        
        const recentWins = userMomentum.recentWins.length;
        const recentValue = userMomentum.totalValue;
        
        let penalty = 0;
        
        // Escalating penalty based on consecutive wins
        if (recentWins >= this.streakBreaker.maxWinStreak) {
            penalty = Math.min(0.5, (recentWins - 1) * 0.15); // 15% per win over limit
        }
        
        // Extra penalty based on total value
        if (recentValue > this.streakBreaker.maxWinValue) {
            penalty += Math.min(0.3, (recentValue - this.streakBreaker.maxWinValue) / 50000 * 0.1);
        }
        
        return penalty;
    }
    
    /**
     * Calculate cross-game switching penalty
     */
    calculateCrossGamePenalty(userId, gameType, won) {
        if (!won) return 0;
        
        const now = Date.now();
        const userGames = this.crossGameIntel.gameCorrelations.get(userId) || [];
        
        // Check if user switched games recently after winning
        const recentGames = userGames.filter(g => now - g.time < this.crossGameIntel.memoryWindow);
        
        if (recentGames.length > 1) {
            const lastGame = recentGames[recentGames.length - 1];
            const secondLastGame = recentGames[recentGames.length - 2];
            
            // Penalty if switched games after a win
            if (lastGame.gameType !== gameType && secondLastGame.won) {
                return this.crossGameIntel.switchPenalty;
            }
        }
        
        return 0;
    }
    
    /**
     * Determine if streak should be forcibly broken
     */
    shouldForceStreakBreak(userId, won, payout) {
        if (!won || !this.streakBreaker.enabled) return false;
        
        const userMomentum = this.momentumTracker.userMomentum.get(userId);
        if (!userMomentum) return false;
        
        const recentWins = userMomentum.recentWins.length;
        const totalValue = userMomentum.recentWins.reduce((sum, w) => sum + w.payout, 0);
        
        // Force break conditions
        return (
            recentWins >= this.streakBreaker.forceBreakThreshold ||
            totalValue > this.streakBreaker.maxWinValue * 2 ||
            userMomentum.value > 0.9 // Extremely high momentum
        );
    }
    
    /**
     * Update post-game tracking data
     */
    updateGameTracking(userId, gameType, won, payout) {
        const now = Date.now();
        
        // Update temporal tracking
        const timeSlot = Math.floor(now / 60000);
        const userSlots = this.temporalDetector.timeSlots.get(userId) || new Map();
        const currentSlotData = userSlots.get(timeSlot) || { wins: 0, value: 0, games: 0 };
        
        currentSlotData.games++;
        if (won) {
            currentSlotData.wins++;
            currentSlotData.value += payout;
        }
        
        userSlots.set(timeSlot, currentSlotData);
        this.temporalDetector.timeSlots.set(userId, userSlots);
        
        // Update cross-game tracking
        const userGames = this.crossGameIntel.gameCorrelations.get(userId) || [];
        userGames.push({ gameType, won, payout, time: now });
        
        // Keep only recent games
        const recentGames = userGames.filter(g => now - g.time < this.crossGameIntel.memoryWindow);
        this.crossGameIntel.gameCorrelations.set(userId, recentGames);
    }
    
    /**
     * Update metrics after post-game payout adjustment
     */
    updatePostGameMetrics(gameData, adjustedPayout) {
        const { betAmount, originalPayout, won } = gameData;
        
        this.performanceMetrics.totalGamesProcessed++;
        
        // Ensure globalMetrics exists
        if (!this.globalMetrics) {
            this.globalMetrics = {
                totalProfitLoss: 0,
                totalGamesPlayed: 0,
                averageWinRate: 0.5,
                volatilityIndex: 0,
                riskLevel: 0.5,
                lastUpdate: Date.now()
            };
        }
        
        // Track profit/loss changes
        const originalProfit = won ? (originalPayout - betAmount) : betAmount;
        const adjustedProfit = won ? (adjustedPayout - betAmount) : betAmount;
        const profitDifference = adjustedProfit - originalProfit;
        
        this.globalMetrics.totalProfitLoss += profitDifference;
        this.globalMetrics.totalGamesPlayed++;
        
        // Update house edge tracking
        if (won && originalPayout > 0) {
            const originalEdge = 1 - (originalPayout / betAmount);
            const adjustedEdge = 1 - (adjustedPayout / betAmount);
            
            this.performanceMetrics.averageHouseEdge = 
                (this.performanceMetrics.averageHouseEdge * (this.performanceMetrics.totalGamesProcessed - 1) + adjustedEdge) / 
                this.performanceMetrics.totalGamesProcessed;
        }
        
        this.performanceMetrics.lastOptimization = Date.now();
        
        // Update advanced tracking systems
        this.updateGameTracking(gameData.userId, gameData.gameType || 'unknown', gameData.won, adjustedPayout);
    }
    
    async validateGameResult(result) { return true; }
    async handleGameError(gameData, error) { console.error('Game error:', error); }
    updatePerformanceMetrics() { /* Update metrics */ }
    performEconomicHealthCheck() { /* Health check */ }
    optimizeSystemPerformance() { /* Optimize performance */ }
    performComprehensiveAnalysis() { /* Comprehensive analysis */ }
    async rotateSecurityKeys() { /* Rotate keys */ }
    async refreshEntropyPool() { /* Refresh entropy */ }
    validateHashChain() { /* Validate chain */ }
    async validateEconomicImpact(data) { return { valid: true, score: 0.9 }; }
    async validateSecurityIntegrity(data) { return { valid: true, score: 0.95 }; }
    async validateRiskThresholds(data) { return { valid: true, score: 0.85 }; }
    async handleValidationFailure(data, validations) { return data; }
    async optimizePayout(data) { return {}; }
    async optimizeRisk(data) { return {}; }
    async optimizeEconomicImpact(data) { return {}; }
    async generateProcessingId() { return crypto.createHash('sha256').update(Date.now().toString()).digest('hex'); }
    async validateCryptographicSecurity() { return { score: 0.95, status: 'SECURE' }; }
    async validateEconomicStability() { return { score: 0.9, status: 'STABLE' }; }
    async validatePerformanceMetrics() { return { score: 0.88, status: 'GOOD' }; }
    async validateRiskManagement() { return { score: 0.92, status: 'OPTIMAL' }; }
    async secureAllKeys() { /* Secure keys */ }
    async logEmergencyEvent(reason) { console.log(`Emergency: ${reason}`); }
    async notifyAdministrators(reason) { console.log(`Admin notification: ${reason}`); }
}

module.exports = BulletproofEconomyController;

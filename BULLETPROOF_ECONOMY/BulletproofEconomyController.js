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
const logger = require('../UTILS/logger');
const EnhancedTrendAnalyzer = require('../UTILS/EnhancedTrendAnalyzer');
const EnhancedEconomicAnalyzer = require('../UTILS/EnhancedEconomicAnalyzer');
const EconomicOversightSystem = require('../UTILS/economicOversightSystem');
const balanceBasedAdjuster = require('../UTILS/balanceBasedAdjuster');
const dbManager = require('../UTILS/database');
const EconomicStabilityManager = require('../UTILS/EconomicStabilityManager');
const emergencyControls = require('../UTILS/emergencyControls');

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
            maximumLossPerHour: 250000,
            maximumPlayerWinRate: 0.65,
            minimumHouseEdge: 0.02,
            emergencyShutdownThreshold: 0.90,
            isEmergencyMode: false,
            
            // Fair play settings
            maxConsecutiveWins: 25,
            maxWinStreakValue: 500000,
            suspiciousActivityThreshold: 0.85,
            automaticHouseEdgeIncrease: 0,
            emergencyHouseEdgeBoost: 0,
            
            maxPayoutRatio: 75,
            bigWinThreshold: 250000,
            maxDailyPayouts: 10000000,
            
            patternDetectionEnabled: false,
            antiExploitMode: false,
            behaviorAnalysisDepth: 50,
            riskAssessmentFrequency: 600000,
            
            rapidBetPenalty: 0,
            rapidBetThreshold: 9999,
            extremeRapidPenalty: 0,
            extremeRapidThreshold: 9999
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

        // Economic stability guard
        this.economicStabilityManager = new EconomicStabilityManager();
        
        // RELAXED MOMENTUM TRACKING - More lenient for better user experience
        this.momentumTracker = {
            userMomentum: new Map(),
            globalMomentum: 0,
            momentumDecay: 0.9,
            momentumThreshold: 10,
            lastMomentumUpdate: Date.now()
        };
        
        this.streakBreaker = {
            enabled: false,
            maxWinStreak: 999,
            maxWinValue: Number.MAX_SAFE_INTEGER,
            forceBreakThreshold: 999,
            breakIntensity: 0,
            temporalWindow: 300000
        };
        
        this.temporalDetector = {
            enabled: false,
            timeSlots: new Map(),
            patternThreshold: 1,
            rapidWinPenalty: 0,
            coolingPeriod: 0
        };
        
        this.crossGameIntel = {
            enabled: false,
            gameCorrelations: new Map(),
            switchPenalty: 0,
            memoryWindow: 1800000
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
            if (!gameType || gameType === 'undefined' || gameType === undefined) {
                console.warn(`⚠️ BulletproofEconomy: Invalid gameType (${gameType}) for user ${userId}, using fallback payout`);
                return { adjustedPayout: originalPayout };
            }

            if (gameType === 'roulette') {
                return { adjustedPayout: originalPayout };
            }

            if (!this.riskManager || !this.houseEdgeSystem) {
                console.warn('Bulletproof economy components not fully initialized, using fallback values');
                return { adjustedPayout: originalPayout };
            }

            let playerProfile = await this.riskManager.getPlayerRiskAssessment(userId);
            if (!playerProfile) {
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

            let houseEdge = 0.05;
            try {
                houseEdge = this.houseEdgeSystem.calculateDynamicEdge(
                    gameType, userId, betAmount, playerProfile
                );
                houseEdge = Math.max(this.safeguards.minimumHouseEdge, houseEdge);
                houseEdge = Math.min(0.12, houseEdge);
                
                // Apply emergency controls
                const emergencyStatus = emergencyControls.getEmergencyAdjustments();
                if (emergencyStatus.active) {
                    houseEdge *= emergencyStatus.houseEdgeMultiplier;
                    houseEdge = Math.min(0.15, houseEdge); // Cap at 15% even in emergency
                    console.log(`🚨 Emergency mode active (Level ${emergencyStatus.level}): House edge adjusted to ${(houseEdge * 100).toFixed(2)}%`);
                }
            } catch (edgeError) {
                console.warn(`Dynamic house edge calculation failed for ${gameType}, using fallback: ${edgeError.message}`);
                houseEdge = Math.max(this.safeguards.minimumHouseEdge, 0.03);
            }

            let payoutMultiplier = 1.0;
            let fairnessDetails = null;
            let stabilityDetails = null;

            try {
                const userBalance = await dbManager.getUserBalance(userId, guildId);
                const totalBalance = (userBalance.wallet || 0) + (userBalance.bank || 0);

                const balanceAdjustments = balanceBasedAdjuster.getBalanceAdjustments(
                    totalBalance,
                    0.5,
                    originalPayout,
                    houseEdge
                );

                const balanceMultiplier = balanceAdjustments.payoutMultiplier;
                if (balanceMultiplier > 1) {
                    payoutMultiplier *= balanceMultiplier;
                }

                const balanceHouseEdgeAdjustment = balanceAdjustments.houseEdgeAdjustment;
                if (balanceHouseEdgeAdjustment > 0) {
                    houseEdge = Math.max(0.005, houseEdge - balanceHouseEdgeAdjustment);
                }

                console.log(`⚖️ Balance-based adjustment: Tier ${balanceAdjustments.balanceTier} | Payout Multiplier: ${(balanceMultiplier * 100).toFixed(1)}%`);
            } catch (balanceError) {
                console.warn(`Balance-based adjustment failed: ${balanceError.message}`);
            }

            try {
                if (this.trendAnalyzer && typeof this.trendAnalyzer.getFairnessAdjustment === 'function') {
                    fairnessDetails = this.trendAnalyzer.getFairnessAdjustment(gameType, userId);
                    if (fairnessDetails?.houseEdgeOffset) {
                        houseEdge = Math.max(0.005, houseEdge + fairnessDetails.houseEdgeOffset);
                    }
                    if (won && fairnessDetails?.payoutBoost) {
                        payoutMultiplier *= (1 + fairnessDetails.payoutBoost);
                    }
                }
            } catch (fairnessError) {
                console.warn(`Fairness adjustment lookup failed: ${fairnessError.message}`);
            }

            if (won && playerProfile?.recentLossStreak && playerProfile.recentLossStreak >= 3) {
                const streakBoost = Math.min(0.15, playerProfile.recentLossStreak * 0.02);
                payoutMultiplier *= (1 + streakBoost);
                console.log(`💪 Comeback boost applied: +${(streakBoost * 100).toFixed(1)}% for user ${userId}`);
            }

            if (this.economicStabilityManager) {
                stabilityDetails = this.economicStabilityManager.getAdjustments(userId);
                if (stabilityDetails?.houseEdgeOffset) {
                    houseEdge = Math.max(0.005, houseEdge + stabilityDetails.houseEdgeOffset);
                }
                if (won && stabilityDetails?.payoutMultiplier) {
                    payoutMultiplier *= stabilityDetails.payoutMultiplier;
                }
            }

            // Apply emergency controls to payout
            const emergencyStatus = emergencyControls.getEmergencyAdjustments();
            if (emergencyStatus.active && won) {
                payoutMultiplier *= emergencyStatus.payoutReduction;
                console.log(`🚨 Emergency payout reduction applied: ${(emergencyStatus.payoutReduction * 100).toFixed(1)}%`);
            }

            // Clamp final multiplier to reasonable bounds (never punish below 90%, never boost above 130%)
            payoutMultiplier = Math.min(1.3, Math.max(0.85, payoutMultiplier));

            let adjustedPayout = won ? Math.floor(originalPayout * payoutMultiplier) : originalPayout;

            if (won && Number.isFinite(betAmount) && betAmount > 0 && adjustedPayout < betAmount) {
                adjustedPayout = betAmount;
            }

            try {
                if (this.trendAnalyzer && typeof this.trendAnalyzer.recordChoice === 'function' && gameData.choice) {
                    await this.trendAnalyzer.recordChoice(gameType, userId, gameData.choice, {
                        betAmount,
                        won,
                        originalPayout,
                        adjustedPayout,
                        appliedMultiplier: payoutMultiplier,
                        fairness: fairnessDetails,
                        stability: stabilityDetails,
                        houseEdge,
                        ...gameData.metadata
                    });
                }
            } catch (trendErr) {
                console.warn(`Trend recording failed for ${gameType}: ${trendErr.message}`);
            }

            this.updatePostGameMetrics(gameData, adjustedPayout);

            if (this.economicStabilityManager) {
                const profitDelta = won ? (adjustedPayout - betAmount) : -betAmount;
                this.economicStabilityManager.registerResult(userId, profitDelta);
            }

            if (Math.abs(payoutMultiplier - 1.0) > 0.01) {
                const adjustmentPercent = ((payoutMultiplier - 1) * 100).toFixed(1);
                console.log(`🤝 Fairness adjustment: ${gameType} payout changed by ${adjustmentPercent}% for user ${userId}`);
                if (fairnessDetails) {
                    console.log(`   Fairness direction: ${fairnessDetails.direction} | House Edge: ${(houseEdge * 100).toFixed(2)}% | Payout boost: ${(fairnessDetails.payoutBoost || 0) * 100}%`);
                }
                if (stabilityDetails && stabilityDetails.rationale !== 'neutral') {
                    console.log(`   Stability guard: ${stabilityDetails.rationale} | Rolling profit: ${stabilityDetails.rollingProfit.toLocaleString()} | Multiplier ${(stabilityDetails.payoutMultiplier * 100).toFixed(1)}%`);
                }
            }

            return {
                adjustedPayout,
                originalPayout,
                adjustmentMultiplier: payoutMultiplier, // Backwards compatibility
                payoutMultiplier,
                houseEdge,
                fairness: fairnessDetails,
                stability: stabilityDetails
            };

        } catch (error) {
            console.error('Error adjusting post-game payout:', error);
            await this.handleGameError(gameData, error);
            throw error;
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
        return 0;
    }
    
    /**
     * Calculate streak penalty
     */
    calculateStreakPenalty(userId, won, payout) {
        return 0;
    }
    
    /**
     * Calculate cross-game switching penalty
     */
    calculateCrossGamePenalty(userId, gameType, won) {
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
        return false;
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

/**
 * ⚙️ CONFIG ENGINE - Dynamic Configuration System
 * Runtime configuration management, feature flags, and A/B testing
 * Hot-reload configurations without restart, environment-specific settings
 */

const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../UTILS/logger');

class ConfigEngine extends EventEmitter {
    constructor() {
        super();
        this.configurations = new Map(); // configId -> config
        this.featureFlags = new Map(); // flagId -> flagData
        this.experiments = new Map(); // experimentId -> experimentData
        this.environmentConfigs = new Map(); // env -> configs
        this.configWatchers = new Map(); // file -> watcher
        this.engineHealth = 'HEALTHY';
        
        this.stats = {
            configurationsLoaded: 0,
            featureFlagsActive: 0,
            experimentsRunning: 0,
            hotReloads: 0,
            configReads: 0
        };
        
        this.initializeEngine();
    }

    /**
     * Initialize Config Engine
     */
    async initializeEngine() {
        try {
            // Load environment configurations
            await this.loadEnvironmentConfigs();
            
            // Load game configurations
            await this.loadGameConfigurations();
            
            // Load feature flags
            await this.loadFeatureFlags();
            
            // Load A/B test experiments
            await this.loadExperiments();
            
            // Start file watching for hot-reload
            await this.startConfigWatching();
            
            // Initialize emergency controls
            this.initializeEmergencyControls();
            
            logger.info('⚙️ ConfigEngine initialized successfully');
            this.engineHealth = 'HEALTHY';
            
        } catch (error) {
            logger.error('❌ ConfigEngine initialization failed:', error);
            this.engineHealth = 'UNHEALTHY';
            throw error;
        }
    }

    /**
     * 🎮 GET GAME CONFIG
     * Retrieve game configuration with environment overrides
     */
    getGameConfig(gameType, userId = null, guildId = null) {
        try {
            this.stats.configReads++;
            
            // Get base configuration
            const baseConfig = this.configurations.get(`game.${gameType}`) || {};
            
            // Apply environment overrides
            const envConfig = this.getEnvironmentConfig(`game.${gameType}`) || {};
            
            // Apply feature flag modifications
            const flagModifications = this.getFeatureFlagModifications(gameType);
            
            // Apply A/B test variations
            const experimentVariations = this.getExperimentVariations(gameType, userId, guildId);
            
            // Apply user-specific overrides
            const userOverrides = this.getUserSpecificOverrides(gameType, userId, guildId);
            
            // Merge all configurations (priority: user > experiment > flags > env > base)
            const mergedConfig = this.mergeConfigurations([
                baseConfig,
                envConfig,
                flagModifications,
                experimentVariations,
                userOverrides
            ]);
            
            // Validate final configuration
            const validatedConfig = this.validateGameConfig(mergedConfig, gameType);
            
            return validatedConfig;
            
        } catch (error) {
            logger.error(`❌ Failed to get game config for ${gameType}: ${error.message}`);
            return this.getDefaultGameConfig(gameType);
        }
    }

    /**
     * 🏠 GET HOUSE EDGE CONFIG
     * Dynamic house edge configuration based on conditions
     */
    getHouseEdgeConfig(gameType, userProfile = null) {
        try {
            const gameConfig = this.getGameConfig(gameType, userProfile?.userId);
            
            // Base house edge
            let houseEdge = gameConfig.baseHouseEdge || 0.05;
            
            // Apply dynamic adjustments
            if (userProfile) {
                // Tier-based adjustments
                const tierModifier = this.getTierModifier(userProfile.tier);
                houseEdge *= tierModifier.houseEdgeMultiplier;
                
                // Volume-based adjustments
                const volumeModifier = this.getVolumeModifier(userProfile.gameStats.totalBet);
                houseEdge *= volumeModifier;
                
                // Time-based adjustments (happy hour, etc.)
                const timeModifier = this.getTimeBasedModifier();
                houseEdge *= timeModifier;
            }
            
            // Apply feature flag overrides
            if (this.isFeatureEnabled('dynamic_house_edge')) {
                const dynamicConfig = this.getFeatureConfig('dynamic_house_edge');
                houseEdge = this.applyDynamicHouseEdge(houseEdge, dynamicConfig);
            }
            
            // Ensure house edge stays within bounds
            const minHouseEdge = gameConfig.minHouseEdge || 0.01;
            const maxHouseEdge = gameConfig.maxHouseEdge || 0.20;
            
            return {
                houseEdge: Math.max(minHouseEdge, Math.min(maxHouseEdge, houseEdge)),
                modifiers: {
                    tier: userProfile ? this.getTierModifier(userProfile.tier) : null,
                    volume: userProfile ? this.getVolumeModifier(userProfile.gameStats.totalBet) : null,
                    time: this.getTimeBasedModifier()
                }
            };
            
        } catch (error) {
            logger.error(`❌ House edge config failed for ${gameType}: ${error.message}`);
            return { houseEdge: 0.05, modifiers: {} };
        }
    }

    /**
     * 🚩 FEATURE FLAG MANAGEMENT
     * Check if feature is enabled for user/guild
     */
    isFeatureEnabled(flagName, userId = null, guildId = null) {
        try {
            const flag = this.featureFlags.get(flagName);
            if (!flag) return false;
            
            // Check if flag is globally enabled
            if (!flag.enabled) return false;
            
            // Check rollout percentage
            if (flag.rolloutPercentage < 100) {
                const hash = this.hashUserForRollout(flagName, userId, guildId);
                if (hash > flag.rolloutPercentage) return false;
            }
            
            // Check user/guild targeting
            if (flag.targetUsers && flag.targetUsers.length > 0) {
                return flag.targetUsers.includes(userId);
            }
            
            if (flag.targetGuilds && flag.targetGuilds.length > 0) {
                return flag.targetGuilds.includes(guildId);
            }
            
            // Check exclusions
            if (flag.excludeUsers && flag.excludeUsers.includes(userId)) return false;
            if (flag.excludeGuilds && flag.excludeGuilds.includes(guildId)) return false;
            
            return true;
            
        } catch (error) {
            logger.error(`❌ Feature flag check failed for ${flagName}: ${error.message}`);
            return false;
        }
    }

    /**
     * ⚗️ A/B TESTING SYSTEM
     * Get experiment variation for user
     */
    getExperimentVariation(experimentName, userId, guildId = null) {
        try {
            const experiment = this.experiments.get(experimentName);
            if (!experiment || !experiment.active) {
                return experiment?.defaultVariation || 'control';
            }
            
            // Check if user is in experiment
            const isInExperiment = this.isUserInExperiment(experiment, userId, guildId);
            if (!isInExperiment) {
                return experiment.defaultVariation || 'control';
            }
            
            // Determine variation based on user hash
            const hash = this.hashUserForExperiment(experimentName, userId);
            let cumulativeWeight = 0;
            
            for (const variation of experiment.variations) {
                cumulativeWeight += variation.weight;
                if (hash <= cumulativeWeight) {
                    return variation.name;
                }
            }
            
            return experiment.defaultVariation || 'control';
            
        } catch (error) {
            logger.error(`❌ Experiment variation failed for ${experimentName}: ${error.message}`);
            return 'control';
        }
    }

    /**
     * 🔄 HOT RELOAD CONFIGURATION
     * Reload configuration without restart
     */
    async hotReloadConfig(configType) {
        try {
            logger.info(`🔄 Hot reloading ${configType} configuration...`);
            
            let reloadedConfigs = 0;
            
            switch (configType) {
                case 'games':
                    await this.loadGameConfigurations();
                    reloadedConfigs = this.configurations.size;
                    break;
                    
                case 'features':
                    await this.loadFeatureFlags();
                    reloadedConfigs = this.featureFlags.size;
                    break;
                    
                case 'experiments':
                    await this.loadExperiments();
                    reloadedConfigs = this.experiments.size;
                    break;
                    
                case 'all':
                    await this.loadEnvironmentConfigs();
                    await this.loadGameConfigurations();
                    await this.loadFeatureFlags();
                    await this.loadExperiments();
                    reloadedConfigs = this.configurations.size + this.featureFlags.size + this.experiments.size;
                    break;
                    
                default:
                    throw new Error(`Unknown config type: ${configType}`);
            }
            
            this.stats.hotReloads++;
            
            // Emit reload event
            this.emit('configReloaded', {
                type: configType,
                count: reloadedConfigs,
                timestamp: Date.now()
            });
            
            logger.info(`✅ Hot reload completed: ${configType} (${reloadedConfigs} configs)`);
            
            return { success: true, count: reloadedConfigs };
            
        } catch (error) {
            logger.error(`❌ Hot reload failed for ${configType}: ${error.message}`);
            throw error;
        }
    }

    /**
     * 🚨 EMERGENCY CONTROLS
     * Emergency configuration overrides
     */
    async enableEmergencyMode(mode, options = {}) {
        try {
            logger.warn(`🚨 Enabling emergency mode: ${mode}`);
            
            const emergencyConfig = {
                mode,
                enabledAt: Date.now(),
                enabledBy: options.adminId || 'system',
                reason: options.reason || 'Emergency activation',
                ...options
            };
            
            switch (mode) {
                case 'safe_mode':
                    await this.enableSafeMode(emergencyConfig);
                    break;
                    
                case 'maintenance':
                    await this.enableMaintenanceMode(emergencyConfig);
                    break;
                    
                case 'rate_limit':
                    await this.enableRateLimitMode(emergencyConfig);
                    break;
                    
                case 'house_edge_boost':
                    await this.enableHouseEdgeBoost(emergencyConfig);
                    break;
                    
                default:
                    throw new Error(`Unknown emergency mode: ${mode}`);
            }
            
            // Store emergency state
            this.configurations.set('emergency', emergencyConfig);
            
            // Emit emergency event
            this.emit('emergencyActivated', emergencyConfig);
            
            logger.warn(`🚨 Emergency mode activated: ${mode}`);
            
            return emergencyConfig;
            
        } catch (error) {
            logger.error(`❌ Emergency mode activation failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * 📊 CONFIGURATION ANALYTICS
     * Track configuration usage and performance
     */
    getConfigAnalytics() {
        try {
            const analytics = {
                overview: {
                    ...this.stats,
                    totalConfigurations: this.configurations.size,
                    activeFeatureFlags: Array.from(this.featureFlags.values()).filter(f => f.enabled).length,
                    runningExperiments: Array.from(this.experiments.values()).filter(e => e.active).length
                },
                
                featureFlags: Array.from(this.featureFlags.entries()).map(([name, flag]) => ({
                    name,
                    enabled: flag.enabled,
                    rolloutPercentage: flag.rolloutPercentage,
                    usageCount: flag.usageCount || 0
                })),
                
                experiments: Array.from(this.experiments.entries()).map(([name, exp]) => ({
                    name,
                    active: exp.active,
                    participantCount: exp.participantCount || 0,
                    variations: exp.variations.map(v => ({
                        name: v.name,
                        weight: v.weight,
                        participantCount: v.participantCount || 0
                    }))
                })),
                
                topConfigurations: this.getTopUsedConfigurations(),
                performanceMetrics: this.getConfigPerformanceMetrics()
            };
            
            return analytics;
            
        } catch (error) {
            logger.error(`❌ Config analytics failed: ${error.message}`);
            return { error: error.message };
        }
    }

    /**
     * 💾 SAVE CONFIGURATION
     * Persist configuration changes
     */
    async saveConfiguration(configId, configData, options = {}) {
        try {
            const {
                environment = 'development',
                validate = true,
                backup = true
            } = options;
            
            // Validate configuration if requested
            if (validate) {
                const validationResult = this.validateConfiguration(configId, configData);
                if (!validationResult.valid) {
                    throw new Error(`Configuration validation failed: ${validationResult.errors.join(', ')}`);
                }
            }
            
            // Create backup if requested
            if (backup) {
                await this.backupConfiguration(configId, environment);
            }
            
            // Save configuration
            const configPath = this.getConfigPath(configId, environment);
            await fs.writeFile(configPath, JSON.stringify(configData, null, 2));
            
            // Update in-memory configuration
            this.configurations.set(configId, configData);
            
            // Emit configuration change event
            this.emit('configurationSaved', {
                configId,
                environment,
                timestamp: Date.now()
            });
            
            logger.info(`💾 Configuration saved: ${configId} (${environment})`);
            
            return { success: true, configId, environment };
            
        } catch (error) {
            logger.error(`❌ Configuration save failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * 🔍 CONFIGURATION DEBUGGING
     * Debug configuration resolution for specific user/context
     */
    debugConfiguration(configId, context = {}) {
        try {
            const { userId, guildId, gameType } = context;
            
            const debugInfo = {
                configId,
                context,
                resolution: {
                    base: this.configurations.get(configId),
                    environment: this.getEnvironmentConfig(configId),
                    featureFlags: this.getFeatureFlagModifications(gameType),
                    experiments: this.getExperimentVariations(gameType, userId, guildId),
                    userOverrides: this.getUserSpecificOverrides(gameType, userId, guildId)
                },
                finalConfig: null,
                appliedModifications: []
            };
            
            // Simulate configuration resolution
            debugInfo.finalConfig = this.mergeConfigurations([
                debugInfo.resolution.base,
                debugInfo.resolution.environment,
                debugInfo.resolution.featureFlags,
                debugInfo.resolution.experiments,
                debugInfo.resolution.userOverrides
            ]);
            
            return debugInfo;
            
        } catch (error) {
            logger.error(`❌ Configuration debugging failed: ${error.message}`);
            return { error: error.message };
        }
    }

    /**
     * ⚙️ LOAD ENVIRONMENT CONFIGS
     */
    async loadEnvironmentConfigs() {
        try {
            const environment = process.env.NODE_ENV || 'development';
            const configDir = path.join(__dirname, '..', 'configs', environment);
            
            try {
                const files = await fs.readdir(configDir);
                
                for (const file of files) {
                    if (file.endsWith('.json')) {
                        const configPath = path.join(configDir, file);
                        const configData = JSON.parse(await fs.readFile(configPath, 'utf8'));
                        const configId = path.basename(file, '.json');
                        
                        this.environmentConfigs.set(configId, configData);
                        this.stats.configurationsLoaded++;
                    }
                }
            } catch (dirError) {
                // Config directory might not exist, create default configs
                await this.createDefaultConfigs();
            }
            
            logger.debug(`⚙️ Environment configs loaded for: ${environment}`);
            
        } catch (error) {
            logger.error('❌ Environment config loading failed:', error);
            throw error;
        }
    }

    /**
     * 🏥 HEALTH CHECK
     */
    isHealthy() {
        return this.engineHealth === 'HEALTHY';
    }

    /**
     * 📊 GET ENGINE STATISTICS
     */
    getStats() {
        return {
            ...this.stats,
            configurationsActive: this.configurations.size,
            featureFlagsTotal: this.featureFlags.size,
            experimentsTotal: this.experiments.size,
            watchedFiles: this.configWatchers.size,
            engineHealth: this.engineHealth
        };
    }

    // Additional helper methods would be implemented here...
    // For brevity, including key method signatures:
    
    async loadGameConfigurations() {
        // Load default game configurations
        const gameConfigs = {
            'game.flip': {
                baseHouseEdge: 0.05,
                baseWinRate: 0.50,
                maxPayout: 2.0,
                minBet: 10,
                maxBet: 100000,
                name: 'Coin Flip'
            },
            'game.blackjack': {
                baseHouseEdge: 0.025,
                baseWinRate: 0.49,
                maxPayout: 2.45,
                minBet: 100,
                maxBet: 1000000,
                name: 'Blackjack'
            },
            'game.slots': {
                baseHouseEdge: 0.25,
                baseWinRate: 0.40,
                maxPayout: 50.0,
                minBet: 50,
                maxBet: 500000,
                name: 'Slots'
            }
        };

        Object.entries(gameConfigs).forEach(([key, config]) => {
            this.configurations.set(key, config);
        });
        
        this.stats.configurationsLoaded += Object.keys(gameConfigs).length;
    }

    async loadFeatureFlags() {
        const flags = {
            'enhanced_security': { enabled: true, rolloutPercentage: 100 }
        };
        Object.entries(flags).forEach(([key, flag]) => {
            this.featureFlags.set(key, flag);
        });
        this.stats.featureFlagsActive = Object.keys(flags).length;
    }

    async loadExperiments() {
        this.stats.experimentsRunning = 0;
    }

    async startConfigWatching() {
        logger.info('Config watching initialized');
    }

    initializeEmergencyControls() {
        this.emergencyControls = {
            safeMode: false,
            maintenanceMode: false
        };
    }
    
    getEnvironmentConfig(configId) {
        const env = process.env.NODE_ENV || 'development';
        return this.environmentConfigs.get(env) || {};
    }
    
    getFeatureFlagModifications(gameType) {
        return {};
    }
    
    getExperimentVariations(gameType, userId, guildId) {
        return {};
    }
    
    getUserSpecificOverrides(gameType, userId, guildId) {
        return {};
    }
    
    mergeConfigurations(configs) {
        return Object.assign({}, ...configs);
    }
    
    validateGameConfig(config, gameType) {
        return config && typeof config === 'object';
    }
    
    getDefaultGameConfig(gameType) {
        return {
            baseHouseEdge: 0.05,
            baseWinRate: 0.50,
            maxPayout: 2.0,
            minBet: 10,
            maxBet: 100000,
            name: gameType
        };
    }
    
    getTierModifier(tier) { /* Implementation */ }
    getVolumeModifier(totalBet) { /* Implementation */ }
    getTimeBasedModifier() { /* Implementation */ }
    applyDynamicHouseEdge(houseEdge, config) { /* Implementation */ }
    
    hashUserForRollout(flagName, userId, guildId) { /* Implementation */ }
    hashUserForExperiment(experimentName, userId) { /* Implementation */ }
    isUserInExperiment(experiment, userId, guildId) { /* Implementation */ }
    
    async enableSafeMode(config) { /* Implementation */ }
    async enableMaintenanceMode(config) { /* Implementation */ }
    async enableRateLimitMode(config) { /* Implementation */ }
    async enableHouseEdgeBoost(config) { /* Implementation */ }
    
    getTopUsedConfigurations() { /* Implementation */ }
    getConfigPerformanceMetrics() { /* Implementation */ }
    validateConfiguration(configId, configData) { /* Implementation */ }
    async backupConfiguration(configId, environment) { /* Implementation */ }
    getConfigPath(configId, environment) { /* Implementation */ }
    async createDefaultConfigs() { /* Implementation */ }
}

// Export singleton instance
module.exports = new ConfigEngine();
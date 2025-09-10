/**
 * ML Phase Manager - Implements the ML Economy Plan phases
 * Manages progression from current state to unlimited betting with AI control
 */

const logger = require('./logger');
const dbManager = require('./database');
const { fmt } = require('./common');

class MLPhaseManager {
    constructor() {
        this.currentPhase = 2; // We're in Phase 2: Learning & Optimization
        this.phaseStartTimes = new Map();
        this.achievements = new Map();
        this.progressMetrics = new Map();
        
        // Phase configurations
        this.phaseConfigs = {
            1: {
                name: "Foundation & Data Collection",
                status: "COMPLETED",
                duration: "Immediate",
                goals: ["ML data collection", "Enhanced bet limits", "Monitoring commands"]
            },
            2: {
                name: "Learning & Optimization", 
                status: "IN_PROGRESS",
                duration: "2-6 weeks",
                goals: [
                    "Accumulate 10,000+ games",
                    "House edge 8-15%",
                    "80%+ games profitable",
                    "No $500M+ in 30 days"
                ]
            },
            3: {
                name: "Progressive Limit Increases",
                status: "PLANNED",
                duration: "4-8 weeks", 
                goals: [
                    "Increase max bets 150%",
                    "Increase max bets 200%",
                    "Increase max bets 500%",
                    "AI prevents $1B reaches"
                ]
            },
            4: {
                name: "Full Automation",
                status: "FUTURE",
                duration: "2-4 weeks",
                goals: [
                    "Remove all bet limits",
                    "$1B takes 3+ months",
                    "Server economy stable",
                    "Player satisfaction maintained"
                ]
            }
        };
    }

    /**
     * Get current phase status and progress
     */
    async getCurrentPhaseStatus() {
        try {
            const phase = this.phaseConfigs[this.currentPhase];
            const metrics = await this.calculatePhaseMetrics(this.currentPhase);
            
            return {
                currentPhase: this.currentPhase,
                phaseName: phase.name,
                status: phase.status,
                duration: phase.duration,
                goals: phase.goals,
                progress: metrics,
                readyForNextPhase: await this.isReadyForNextPhase(),
                nextPhase: this.currentPhase < 4 ? this.phaseConfigs[this.currentPhase + 1] : null
            };
            
        } catch (error) {
            logger.error(`Failed to get phase status: ${error.message}`);
            return null;
        }
    }

    /**
     * Calculate metrics for Phase 2 completion
     */
    async calculatePhaseMetrics(phase) {
        try {
            if (phase === 2) {
                // Phase 2: Learning & Optimization metrics
                const gameCount = await this.getGameDataCount();
                const houseEdgeStatus = await this.checkHouseEdgeCompliance();
                const profitabilityRate = await this.calculateProfitabilityRate();
                const wealthControl = await this.checkWealthControl();
                
                return {
                    gameDataCount: gameCount,
                    gameDataTarget: 10000,
                    gameDataProgress: Math.min(100, (gameCount / 10000) * 100),
                    
                    houseEdgeCompliant: houseEdgeStatus.compliant,
                    houseEdgeDetails: houseEdgeStatus.details,
                    
                    profitabilityRate: profitabilityRate,
                    profitabilityTarget: 80,
                    profitabilityMet: profitabilityRate >= 80,
                    
                    wealthControlActive: wealthControl.active,
                    wealthControlDetails: wealthControl.details,
                    
                    overallProgress: this.calculateOverallProgress({
                        gameData: Math.min(100, (gameCount / 10000) * 100),
                        houseEdge: houseEdgeStatus.compliant ? 100 : 50,
                        profitability: profitabilityRate >= 80 ? 100 : (profitabilityRate / 80) * 100,
                        wealthControl: wealthControl.active ? 100 : 0
                    })
                };
            }
            
            return {};
            
        } catch (error) {
            logger.error(`Failed to calculate phase ${phase} metrics: ${error.message}`);
            return {};
        }
    }

    /**
     * Get total game data count for ML analysis
     */
    async getGameDataCount() {
        try {
            // Count games from database
            const result = await dbManager.databaseAdapter.executeQuery(
                'SELECT COUNT(*) as count FROM game_results WHERE played_at > DATE_SUB(NOW(), INTERVAL 30 DAY)',
                []
            );
            
            const dbCount = result[0]?.count || 0;
            
            // Also count from ML data files
            const fs = require('fs').promises;
            const path = require('path');
            const mlDataDir = path.join(__dirname, '..', 'ML_DATA');
            
            let fileCount = 0;
            try {
                const files = await fs.readdir(mlDataDir);
                for (const file of files) {
                    if (file.endsWith('.json')) {
                        const filePath = path.join(mlDataDir, file);
                        const content = await fs.readFile(filePath, 'utf8');
                        const data = JSON.parse(content);
                        fileCount += Array.isArray(data) ? data.length : 0;
                    }
                }
            } catch (error) {
                logger.warn(`Could not read ML data files: ${error.message}`);
            }
            
            return Math.max(dbCount, fileCount);
            
        } catch (error) {
            logger.error(`Failed to get game data count: ${error.message}`);
            return 0;
        }
    }

    /**
     * Check if house edges are in 8-15% target range
     */
    async checkHouseEdgeCompliance() {
        try {
            const targetRange = [8, 15]; // 8-15% target
            const casinoIntegration = require('../ECONOMY_GUARDIAN/casinoIntegration');
            const integration = new casinoIntegration();
            
            const compliantGames = [];
            const nonCompliantGames = [];
            
            for (const [game, config] of Object.entries(integration.gameConfigs)) {
                const houseEdgePercent = (config.houseEdge * 100);
                const inRange = houseEdgePercent >= targetRange[0] && houseEdgePercent <= targetRange[1];
                
                if (inRange) {
                    compliantGames.push({ game, houseEdge: houseEdgePercent });
                } else {
                    nonCompliantGames.push({ game, houseEdge: houseEdgePercent, target: `${targetRange[0]}-${targetRange[1]}%` });
                }
            }
            
            const totalGames = compliantGames.length + nonCompliantGames.length;
            const complianceRate = (compliantGames.length / totalGames) * 100;
            
            return {
                compliant: complianceRate >= 80, // 80% of games should be compliant
                complianceRate: complianceRate,
                compliantGames: compliantGames,
                nonCompliantGames: nonCompliantGames,
                details: `${compliantGames.length}/${totalGames} games in 8-15% range`
            };
            
        } catch (error) {
            logger.error(`Failed to check house edge compliance: ${error.message}`);
            return { compliant: false, details: "Error checking compliance" };
        }
    }

    /**
     * Calculate overall profitability rate
     */
    async calculateProfitabilityRate() {
        try {
            const result = await dbManager.databaseAdapter.executeQuery(
                `SELECT 
                    COUNT(*) as total_games,
                    SUM(CASE WHEN payout < bet_amount THEN 1 ELSE 0 END) as profitable_games
                FROM game_results 
                WHERE played_at > DATE_SUB(NOW(), INTERVAL 7 DAY)`,
                []
            );
            
            const data = result[0];
            if (!data || data.total_games === 0) return 0;
            
            return (data.profitable_games / data.total_games) * 100;
            
        } catch (error) {
            logger.error(`Failed to calculate profitability rate: ${error.message}`);
            return 0;
        }
    }

    /**
     * Check wealth control effectiveness
     */
    async checkWealthControl() {
        try {
            // Check for players with >$500M in last 30 days
            const result = await dbManager.databaseAdapter.executeQuery(
                'SELECT COUNT(*) as count FROM user_balances WHERE (wallet + bank) > 500000000',
                []
            );
            
            const highWealthCount = result[0]?.count || 0;
            
            return {
                active: highWealthCount === 0,
                details: highWealthCount === 0 ? 
                    "No players above $500M threshold" : 
                    `${highWealthCount} players above $500M threshold`,
                highWealthPlayers: highWealthCount
            };
            
        } catch (error) {
            logger.error(`Failed to check wealth control: ${error.message}`);
            return { active: false, details: "Error checking wealth control" };
        }
    }

    /**
     * Calculate overall progress percentage
     */
    calculateOverallProgress(metrics) {
        const weights = {
            gameData: 0.3,      // 30% weight
            houseEdge: 0.3,     // 30% weight  
            profitability: 0.2, // 20% weight
            wealthControl: 0.2  // 20% weight
        };
        
        return Object.entries(metrics).reduce((total, [key, value]) => {
            return total + (value * (weights[key] || 0));
        }, 0);
    }

    /**
     * Check if ready to advance to next phase
     */
    async isReadyForNextPhase() {
        if (this.currentPhase === 2) {
            const metrics = await this.calculatePhaseMetrics(2);
            
            // Phase 2 completion criteria
            return metrics.gameDataProgress >= 100 &&
                   metrics.houseEdgeCompliant &&
                   metrics.profitabilityMet &&
                   metrics.wealthControlActive;
        }
        
        return false;
    }

    /**
     * Advance to next phase
     */
    async advanceToNextPhase() {
        try {
            if (await this.isReadyForNextPhase() && this.currentPhase < 4) {
                const oldPhase = this.currentPhase;
                this.currentPhase++;
                
                logger.info(`🚀 ML PHASE ADVANCEMENT: Phase ${oldPhase} → Phase ${this.currentPhase}`);
                
                // Record phase advancement
                this.phaseStartTimes.set(this.currentPhase, Date.now());
                
                // Update phase status
                this.phaseConfigs[oldPhase].status = "COMPLETED";
                this.phaseConfigs[this.currentPhase].status = "IN_PROGRESS";
                
                return {
                    success: true,
                    oldPhase: oldPhase,
                    newPhase: this.currentPhase,
                    message: `Advanced from Phase ${oldPhase} to Phase ${this.currentPhase}: ${this.phaseConfigs[this.currentPhase].name}`
                };
            }
            
            return {
                success: false,
                message: "Not ready for phase advancement or already at final phase"
            };
            
        } catch (error) {
            logger.error(`Failed to advance phase: ${error.message}`);
            return {
                success: false,
                message: `Error advancing phase: ${error.message}`
            };
        }
    }

    /**
     * Get Phase 3 bet limit progression plan
     */
    getPhase3ProgressionPlan() {
        return {
            week1: {
                description: "Initial 25% increase",
                multiplier: 1.25,
                games: {
                    blackjack: { newMax: 625000, currentMax: 500000 },
                    slots: { newMax: 218750, currentMax: 175000 },
                    roulette: { newMax: 12500000, currentMax: 10000000 }
                }
            },
            week2: {
                description: "50% total increase",
                multiplier: 1.50,
                games: {
                    blackjack: { newMax: 750000, currentMax: 500000 },
                    slots: { newMax: 262500, currentMax: 175000 },
                    roulette: { newMax: 15000000, currentMax: 10000000 }
                }
            },
            week4: {
                description: "100% total increase (double)",
                multiplier: 2.00,
                games: {
                    blackjack: { newMax: 1000000, currentMax: 500000 },
                    slots: { newMax: 350000, currentMax: 175000 },
                    roulette: { newMax: 20000000, currentMax: 10000000 }
                }
            },
            week8: {
                description: "500% total increase (6x original)",
                multiplier: 6.00,
                games: {
                    blackjack: { newMax: 3000000, currentMax: 500000 },
                    slots: { newMax: 1050000, currentMax: 175000 },
                    roulette: { newMax: 60000000, currentMax: 10000000 }
                }
            }
        };
    }

    /**
     * Generate phase-specific recommendations
     */
    async generatePhaseRecommendations() {
        try {
            const status = await this.getCurrentPhaseStatus();
            const recommendations = [];
            
            if (this.currentPhase === 2) {
                // Phase 2 recommendations
                if (status.progress.gameDataProgress < 100) {
                    recommendations.push({
                        priority: "HIGH",
                        action: "INCREASE_GAME_ACTIVITY",
                        description: `Need ${10000 - status.progress.gameDataCount} more games for ML analysis`,
                        target: `${status.progress.gameDataCount}/10000 games collected`
                    });
                }
                
                if (!status.progress.houseEdgeCompliant) {
                    recommendations.push({
                        priority: "CRITICAL",
                        action: "CALIBRATE_HOUSE_EDGE", 
                        description: "Adjust game payouts to achieve 8-15% house edge",
                        details: status.progress.houseEdgeDetails
                    });
                }
                
                if (!status.progress.profitabilityMet) {
                    recommendations.push({
                        priority: "HIGH",
                        action: "IMPROVE_PROFITABILITY",
                        description: `Increase profitability from ${status.progress.profitabilityRate.toFixed(1)}% to 80%+`,
                        target: "80% profitable games"
                    });
                }
                
                if (status.readyForNextPhase) {
                    recommendations.push({
                        priority: "OPPORTUNITY",
                        action: "ADVANCE_TO_PHASE_3",
                        description: "Ready to begin progressive limit increases",
                        nextPhase: "Phase 3: Progressive Limit Increases"
                    });
                }
            }
            
            return recommendations;
            
        } catch (error) {
            logger.error(`Failed to generate phase recommendations: ${error.message}`);
            return [];
        }
    }
}

// Create singleton instance
const mlPhaseManager = new MLPhaseManager();

module.exports = mlPhaseManager;
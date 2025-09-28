/**
 * COMPREHENSIVE GAMETREND ANALYZER SIMULATION
 * Tests Nash equilibrium adjustments with realistic gaming scenarios
 */

const GameTrendAnalyzer = require('./UTILS/GameTrendAnalyzer');

class TrendSimulation {
    constructor() {
        this.analyzer = new GameTrendAnalyzer();
        this.results = {
            totalChoices: 0,
            adjustmentsApplied: {},
            scenarios: [],
            timing: {}
        };
    }

    async runFullSimulation() {
        console.log('🧠 COMPREHENSIVE GAMETREND ANALYZER SIMULATION');
        console.log('Testing Nash equilibrium theory with realistic casino scenarios\n');

        const startTime = Date.now();

        // Wait for analyzer initialization
        await this.delay(1000);

        // Run multiple realistic scenarios
        await this.scenario1_RouletteColorBias();
        await this.scenario2_CrashCashoutClustering();
        await this.scenario3_RPSPatternExploitation();
        await this.scenario4_BlackjackCardCounting();
        await this.scenario5_DuckGameRiskPatterns();
        await this.scenario6_TreasureVaultDoorBias();

        // Test cross-game behavior
        await this.scenario7_CrossGamePatterns();

        // Final analysis
        await this.performFinalAnalysis();

        this.results.timing.total = Date.now() - startTime;
        return this.results;
    }

    async scenario1_RouletteColorBias() {
        console.log('📊 SCENARIO 1: Roulette Red/Black Bias Exploitation');
        console.log('Simulating 200 players with 85% red bias (Nash equilibrium violation)');

        const scenario = {
            name: 'Roulette Color Bias',
            startTime: Date.now(),
            choicesMade: 0,
            adjustmentsBefore: this.analyzer.getTrendAdjustment('roulette'),
            adjustmentsAfter: 0
        };

        // Simulate strong red bias (85% of players betting red)
        for (let round = 1; round <= 5; round++) {
            console.log(`  Round ${round}/5...`);
            
            // 85 players bet red, 15 bet black
            for (let i = 1; i <= 85; i++) {
                await this.analyzer.recordChoice('roulette', `redPlayer${i}`, 'red', {
                    betAmount: 500 + Math.random() * 2000,
                    won: Math.random() < 0.47, // Slightly under 50% due to house edge
                    round: round,
                    color: 'red'
                });
                scenario.choicesMade++;
            }

            for (let i = 1; i <= 15; i++) {
                await this.analyzer.recordChoice('roulette', `blackPlayer${i}`, 'black', {
                    betAmount: 500 + Math.random() * 2000,
                    won: Math.random() < 0.47,
                    round: round,
                    color: 'black'
                });
                scenario.choicesMade++;
            }

            // Check for adjustments after each round
            const currentAdjustment = this.analyzer.getTrendAdjustment('roulette');
            if (currentAdjustment > 0) {
                console.log(`    ⚡ Nash adjustment detected: +${(currentAdjustment * 100).toFixed(3)}% house edge`);
            }
        }

        scenario.adjustmentsAfter = this.analyzer.getTrendAdjustment('roulette');
        scenario.endTime = Date.now();
        this.results.scenarios.push(scenario);
        this.results.totalChoices += scenario.choicesMade;

        console.log(`✅ Scenario 1 complete - ${scenario.choicesMade} choices analyzed`);
        console.log(`   Final adjustment: +${(scenario.adjustmentsAfter * 100).toFixed(3)}% house edge\n`);
    }

    async scenario2_CrashCashoutClustering() {
        console.log('📊 SCENARIO 2: Crash Game Cashout Clustering');
        console.log('Simulating players clustering around 2.0x cashout (predictable behavior)');

        const scenario = {
            name: 'Crash Cashout Clustering',
            startTime: Date.now(),
            choicesMade: 0,
            adjustmentsBefore: this.analyzer.getTrendAdjustment('crash'),
            adjustmentsAfter: 0
        };

        // Simulate clustering around 2.0x multiplier
        for (let batch = 1; batch <= 3; batch++) {
            console.log(`  Batch ${batch}/3...`);
            
            for (let i = 1; i <= 40; i++) {
                // 80% cluster around 2.0x, 20% random
                let multiplier;
                if (Math.random() < 0.8) {
                    // Cluster around 2.0x (1.8x to 2.2x)
                    multiplier = 1.8 + Math.random() * 0.4;
                } else {
                    // Random cashout
                    multiplier = 1.1 + Math.random() * 3.0;
                }

                await this.analyzer.recordChoice('crash', `crashPlayer${batch}_${i}`, 'cashout', {
                    betAmount: 300 + Math.random() * 1200,
                    multiplier: multiplier,
                    won: true,
                    batch: batch
                });
                scenario.choicesMade++;
            }

            const currentAdjustment = this.analyzer.getTrendAdjustment('crash');
            if (currentAdjustment > 0) {
                console.log(`    ⚡ Clustering detected: +${(currentAdjustment * 100).toFixed(3)}% house edge`);
            }
        }

        scenario.adjustmentsAfter = this.analyzer.getTrendAdjustment('crash');
        scenario.endTime = Date.now();
        this.results.scenarios.push(scenario);
        this.results.totalChoices += scenario.choicesMade;

        console.log(`✅ Scenario 2 complete - ${scenario.choicesMade} choices analyzed`);
        console.log(`   Final adjustment: +${(scenario.adjustmentsAfter * 100).toFixed(3)}% house edge\n`);
    }

    async scenario3_RPSPatternExploitation() {
        console.log('📊 SCENARIO 3: Rock Paper Scissors Pattern Exploitation');
        console.log('Simulating predictable RPS patterns (anti-Nash behavior)');

        const scenario = {
            name: 'RPS Pattern Exploitation',
            startTime: Date.now(),
            choicesMade: 0,
            adjustmentsBefore: this.analyzer.getTrendAdjustment('rps'),
            adjustmentsAfter: 0
        };

        const patterns = {
            'alternating': ['rock', 'paper', 'scissors', 'rock', 'paper', 'scissors'],
            'repeating': ['rock', 'rock', 'rock', 'rock', 'rock', 'rock'],
            'sequence': ['rock', 'paper', 'rock', 'paper', 'rock', 'paper']
        };

        // Simulate predictable players
        for (let patternType of Object.keys(patterns)) {
            console.log(`  Testing ${patternType} pattern...`);
            
            for (let player = 1; player <= 15; player++) {
                const pattern = patterns[patternType];
                
                for (let move = 0; move < pattern.length; move++) {
                    await this.analyzer.recordChoice('rps', `${patternType}Player${player}`, pattern[move], {
                        betAmount: 100 + Math.random() * 400,
                        won: Math.random() < 0.4, // Lower win rate due to predictability
                        pattern: patternType,
                        sequence: move
                    });
                    scenario.choicesMade++;
                }
            }
        }

        scenario.adjustmentsAfter = this.analyzer.getTrendAdjustment('rps');
        scenario.endTime = Date.now();
        this.results.scenarios.push(scenario);
        this.results.totalChoices += scenario.choicesMade;

        console.log(`✅ Scenario 3 complete - ${scenario.choicesMade} choices analyzed`);
        console.log(`   Final adjustment: +${(scenario.adjustmentsAfter * 100).toFixed(3)}% house edge\n`);
    }

    async scenario4_BlackjackCardCounting() {
        console.log('📊 SCENARIO 4: Blackjack Strategy Predictability');
        console.log('Simulating card counting and optimal strategy patterns');

        const scenario = {
            name: 'Blackjack Card Counting',
            startTime: Date.now(),
            choicesMade: 0,
            adjustmentsBefore: this.analyzer.getTrendAdjustment('blackjack'),
            adjustmentsAfter: 0
        };

        // Simulate card counters with predictable optimal play
        const situations = [
            { playerValue: 16, dealerUp: 10, optimalChoice: 'hit' },
            { playerValue: 12, dealerUp: 6, optimalChoice: 'stand' },
            { playerValue: 11, dealerUp: 5, optimalChoice: 'double' },
            { playerValue: 20, dealerUp: 9, optimalChoice: 'stand' },
            { playerValue: 15, dealerUp: 10, optimalChoice: 'hit' }
        ];

        for (let round = 1; round <= 4; round++) {
            console.log(`  Round ${round}/4...`);
            
            for (let player = 1; player <= 25; player++) {
                for (let situation of situations) {
                    // 90% make optimal choice (very predictable)
                    const choice = Math.random() < 0.9 ? 
                        situation.optimalChoice : 
                        ['hit', 'stand', 'double'][Math.floor(Math.random() * 3)];

                    await this.analyzer.recordChoice('blackjack', `countPlayer${player}`, choice, {
                        betAmount: 200 + Math.random() * 800,
                        won: Math.random() < 0.55, // Higher win rate due to skill
                        playerValue: situation.playerValue,
                        dealerUp: situation.dealerUp,
                        round: round
                    });
                    scenario.choicesMade++;
                }
            }
        }

        scenario.adjustmentsAfter = this.analyzer.getTrendAdjustment('blackjack');
        scenario.endTime = Date.now();
        this.results.scenarios.push(scenario);
        this.results.totalChoices += scenario.choicesMade;

        console.log(`✅ Scenario 4 complete - ${scenario.choicesMade} choices analyzed`);
        console.log(`   Final adjustment: +${(scenario.adjustmentsAfter * 100).toFixed(3)}% house edge\n`);
    }

    async scenario5_DuckGameRiskPatterns() {
        console.log('📊 SCENARIO 5: Duck Game Risk Pattern Analysis');
        console.log('Simulating predictable risk-taking patterns');

        const scenario = {
            name: 'Duck Game Risk Patterns',
            startTime: Date.now(),
            choicesMade: 0,
            adjustmentsBefore: this.analyzer.getTrendAdjustment('duck'),
            adjustmentsAfter: 0
        };

        // Simulate conservative vs aggressive players
        for (let playerType of ['conservative', 'aggressive']) {
            console.log(`  Testing ${playerType} players...`);
            
            for (let player = 1; player <= 30; player++) {
                for (let position = 1; position <= 7; position++) {
                    let choice;
                    if (playerType === 'conservative') {
                        // Always cash out early (predictable)
                        choice = position >= 3 ? 'cashout' : 'move';
                    } else {
                        // Always go for maximum (predictable)
                        choice = position < 6 ? 'move' : 'cashout';
                    }

                    await this.analyzer.recordChoice('duck', `${playerType}Player${player}`, choice, {
                        betAmount: 150 + Math.random() * 600,
                        won: choice === 'cashout',
                        position: position,
                        maxLanes: 7,
                        playerType: playerType
                    });
                    scenario.choicesMade++;
                }
            }
        }

        scenario.adjustmentsAfter = this.analyzer.getTrendAdjustment('duck');
        scenario.endTime = Date.now();
        this.results.scenarios.push(scenario);
        this.results.totalChoices += scenario.choicesMade;

        console.log(`✅ Scenario 5 complete - ${scenario.choicesMade} choices analyzed`);
        console.log(`   Final adjustment: +${(scenario.adjustmentsAfter * 100).toFixed(3)}% house edge\n`);
    }

    async scenario6_TreasureVaultDoorBias() {
        console.log('📊 SCENARIO 6: Treasure Vault Door Selection Bias');
        console.log('Simulating systematic door preferences');

        const scenario = {
            name: 'Treasure Vault Door Bias',
            startTime: Date.now(),
            choicesMade: 0,
            adjustmentsBefore: this.analyzer.getTrendAdjustment('treasurevault'),
            adjustmentsAfter: 0
        };

        // Simulate door preference bias (everyone picks door 1)
        for (let round = 1; round <= 6; round++) {
            console.log(`  Round ${round}/6...`);
            
            for (let player = 1; player <= 50; player++) {
                // 80% always pick door 1 (superstition/bias)
                const door = Math.random() < 0.8 ? '1' : (Math.floor(Math.random() * 3) + 1).toString();
                
                await this.analyzer.recordChoice('treasurevault', `vaultPlayer${player}`, `door_${door}`, {
                    betAmount: 400 + Math.random() * 1600,
                    won: Math.random() < 0.3, // Low win rate due to game difficulty
                    round: round,
                    door: door
                });
                scenario.choicesMade++;
            }
        }

        scenario.adjustmentsAfter = this.analyzer.getTrendAdjustment('treasurevault');
        scenario.endTime = Date.now();
        this.results.scenarios.push(scenario);
        this.results.totalChoices += scenario.choicesMade;

        console.log(`✅ Scenario 6 complete - ${scenario.choicesMade} choices analyzed`);
        console.log(`   Final adjustment: +${(scenario.adjustmentsAfter * 100).toFixed(3)}% house edge\n`);
    }

    async scenario7_CrossGamePatterns() {
        console.log('📊 SCENARIO 7: Cross-Game Pattern Analysis');
        console.log('Testing patterns across multiple game types');

        const scenario = {
            name: 'Cross-Game Patterns',
            startTime: Date.now(),
            choicesMade: 0
        };

        // Simulate players who show similar patterns across games
        for (let player = 1; player <= 20; player++) {
            console.log(`  Player ${player}/20...`);
            
            // Conservative player - same pattern across all games
            if (player <= 10) {
                // Roulette: Always bet black
                await this.analyzer.recordChoice('roulette', `crossPlayer${player}`, 'black', {
                    betAmount: 1000,
                    won: Math.random() < 0.47,
                    playerType: 'conservative'
                });

                // Crash: Always cash out early
                await this.analyzer.recordChoice('crash', `crossPlayer${player}`, 'cashout', {
                    betAmount: 500,
                    multiplier: 1.3 + Math.random() * 0.3,
                    won: true,
                    playerType: 'conservative'
                });

                // RPS: Always play rock
                await this.analyzer.recordChoice('rps', `crossPlayer${player}`, 'rock', {
                    betAmount: 200,
                    won: Math.random() < 0.33,
                    playerType: 'conservative'
                });

            } else {
                // Aggressive player - high-risk patterns
                await this.analyzer.recordChoice('roulette', `crossPlayer${player}`, 'red', {
                    betAmount: 2500,
                    won: Math.random() < 0.47,
                    playerType: 'aggressive'
                });

                await this.analyzer.recordChoice('crash', `crossPlayer${player}`, 'cashout', {
                    betAmount: 1000,
                    multiplier: 3.0 + Math.random() * 2.0,
                    won: Math.random() < 0.7,
                    playerType: 'aggressive'
                });

                await this.analyzer.recordChoice('rps', `crossPlayer${player}`, 'scissors', {
                    betAmount: 500,
                    won: Math.random() < 0.33,
                    playerType: 'aggressive'
                });
            }
            scenario.choicesMade += 3;
        }

        scenario.endTime = Date.now();
        this.results.scenarios.push(scenario);
        this.results.totalChoices += scenario.choicesMade;

        console.log(`✅ Scenario 7 complete - ${scenario.choicesMade} choices analyzed\n`);
    }

    async performFinalAnalysis() {
        console.log('🎯 FINAL ANALYSIS - Nash Equilibrium Results');
        console.log('='.repeat(60));

        // Get comprehensive summary
        const summary = this.analyzer.getTrendSummary();
        
        console.log('\n📊 COMPREHENSIVE RESULTS:');
        console.log(`Total Choices Analyzed: ${summary.totalChoicesAnalyzed}`);
        console.log(`Active Player Profiles: ${summary.activePlayerProfiles}`);
        
        console.log('\n⚡ ACTIVE HOUSE EDGE ADJUSTMENTS:');
        for (const [gameType, adjustment] of Object.entries(summary.activeAdjustments)) {
            console.log(`  ${gameType.toUpperCase()}: ${adjustment.houseEdgeIncrease}`);
            console.log(`    Reason: ${adjustment.reason}`);
            console.log(`    Confidence: ${adjustment.confidence}`);
            console.log(`    Dominant Strategy: ${adjustment.dominantStrategy}`);
            
            this.results.adjustmentsApplied[gameType] = adjustment;
        }

        console.log('\n📈 SCENARIO PERFORMANCE:');
        for (const scenario of this.results.scenarios) {
            const duration = scenario.endTime - scenario.startTime;
            console.log(`  ${scenario.name}:`);
            console.log(`    Choices: ${scenario.choicesMade}`);
            console.log(`    Duration: ${duration}ms`);
            console.log(`    Adjustment Change: +${((scenario.adjustmentsAfter - scenario.adjustmentsBefore) * 100).toFixed(3)}%`);
        }

        console.log('\n🎯 NASH EQUILIBRIUM ANALYSIS:');
        const totalActiveAdjustments = Object.keys(summary.activeAdjustments).length;
        console.log(`Games with Active Adjustments: ${totalActiveAdjustments}/7`);
        console.log(`System Status: ${totalActiveAdjustments > 0 ? '🔴 ACTIVE COUNTER-MEASURES' : '🟢 BALANCED STATE'}`);
        
        if (totalActiveAdjustments > 0) {
            console.log('\n⚠️  NASH EQUILIBRIUM VIOLATIONS DETECTED AND COUNTERED');
            console.log('    Player exploitation patterns identified and neutralized');
            console.log('    House edge adjustments maintaining economic balance');
        } else {
            console.log('\n✅ NO SIGNIFICANT EXPLOITATION PATTERNS DETECTED');
            console.log('    All games operating within Nash equilibrium parameters');
        }

        this.results.finalSummary = summary;
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Run the comprehensive simulation
async function runSimulation() {
    try {
        const simulation = new TrendSimulation();
        const results = await simulation.runFullSimulation();
        
        console.log('\n🏁 SIMULATION COMPLETE');
        console.log(`Total execution time: ${results.timing.total}ms`);
        console.log(`Total choices processed: ${results.totalChoices}`);
        console.log(`Active adjustments: ${Object.keys(results.adjustmentsApplied).length}`);
        
        return results;
    } catch (error) {
        console.error('❌ Simulation failed:', error.message);
        console.error(error.stack);
    }
}

// Execute simulation
runSimulation();
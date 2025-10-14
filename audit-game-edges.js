/**
 * COMPREHENSIVE GAME EDGE & WIN RATE AUDIT
 * Analyzes all casino games for proper house edge implementation
 */

const fs = require('fs');
const path = require('path');

class GameEdgeAuditor {
    constructor() {
        this.auditResults = [];
        this.gameFiles = [];
        this.problematicGames = [];
    }

    async runFullAudit() {
        console.log('🔍 COMPREHENSIVE GAME EDGE & WIN RATE AUDIT\n');
        
        // Step 1: Scan all game files
        await this.scanGameFiles();
        
        // Step 2: Analyze each game's implementation
        await this.analyzeGameImplementations();
        
        // Step 3: Check balance-based integration
        await this.checkBalanceIntegration();
        
        // Step 4: Simulate actual win rates
        await this.simulateWinRates();
        
        // Step 5: Generate report
        this.generateReport();
        
        return this.auditResults;
    }

    async scanGameFiles() {
        console.log('📂 Scanning game files...');
        
        const commandsDir = './COMMANDS';
        const gamesDir = './GAMES';
        
        // Scan COMMANDS directory
        const commandFiles = fs.readdirSync(commandsDir)
            .filter(file => file.endsWith('.js') && !file.startsWith('test'))
            .map(file => ({ file, dir: 'COMMANDS', path: path.join(commandsDir, file) }));
        
        // Scan GAMES directory
        const gameFiles = fs.readdirSync(gamesDir)
            .filter(file => file.endsWith('.js') && !file.startsWith('test'))
            .map(file => ({ file, dir: 'GAMES', path: path.join(gamesDir, file) }));
        
        this.gameFiles = [...commandFiles, ...gameFiles];
        
        console.log(`Found ${this.gameFiles.length} game files to analyze\n`);
    }

    async analyzeGameImplementations() {
        console.log('🎲 Analyzing game implementations...\n');
        
        const casinoGames = [
            'slots', 'blackjack', 'roulette', 'plinko', 'flip', 'crash',
            'mines', 'keno', 'bingo', 'multi-slots', 'russianroulette'
        ];
        
        for (const gameInfo of this.gameFiles) {
            const gameName = gameInfo.file.replace('.js', '');
            
            if (casinoGames.includes(gameName)) {
                console.log(`🎮 Analyzing ${gameName.toUpperCase()}...`);
                await this.analyzeGame(gameInfo, gameName);
            }
        }
    }

    async analyzeGame(gameInfo, gameName) {
        try {
            const content = fs.readFileSync(gameInfo.path, 'utf8');
            
            const analysis = {
                game: gameName,
                file: gameInfo.file,
                directory: gameInfo.dir,
                issues: [],
                recommendations: [],
                houseEdge: null,
                winRate: null,
                usesBalanceAdjustments: false,
                usesUniversalIntegrator: false,
                rtp: null
            };

            // Check for balance-based adjustments
            if (content.includes('balanceBasedAdjuster') || content.includes('UniversalGameIntegrator')) {
                analysis.usesBalanceAdjustments = true;
            }
            
            if (content.includes('UniversalGameIntegrator')) {
                analysis.usesUniversalIntegrator = true;
            }

            // Extract house edge information
            const houseEdgeMatch = content.match(/houseEdge[^\\d]*([\\d.]+)/gi);
            if (houseEdgeMatch) {
                const edges = houseEdgeMatch.map(match => {
                    const num = match.match(/([\\d.]+)/);
                    return num ? parseFloat(num[1]) : null;
                }).filter(n => n !== null);
                
                analysis.houseEdge = edges.length > 0 ? Math.max(...edges) : null;
            }

            // Extract win rate information
            const winRateMatch = content.match(/winRate[^\\d]*([\\d.]+)|win.*rate[^\\d]*([\\d.]+)/gi);
            if (winRateMatch) {
                const rates = winRateMatch.map(match => {
                    const num = match.match(/([\\d.]+)/);
                    return num ? parseFloat(num[1]) : null;
                }).filter(n => n !== null);
                
                analysis.winRate = rates.length > 0 ? Math.max(...rates) : null;
            }

            // Game-specific analysis
            await this.performGameSpecificAnalysis(content, analysis, gameName);
            
            // Check for problematic patterns
            this.checkForProblematicPatterns(content, analysis);
            
            this.auditResults.push(analysis);
            
            console.log(`  ✅ ${gameName} analysis complete`);
            
        } catch (error) {
            console.log(`  ❌ Error analyzing ${gameName}: ${error.message}`);
        }
    }

    async performGameSpecificAnalysis(content, analysis, gameName) {
        switch (gameName) {
            case 'slots':
                this.analyzeSlots(content, analysis);
                break;
            case 'blackjack':
                this.analyzeBlackjack(content, analysis);
                break;
            case 'roulette':
                this.analyzeRoulette(content, analysis);
                break;
            case 'flip':
                this.analyzeFlip(content, analysis);
                break;
            case 'plinko':
                this.analyzePlinko(content, analysis);
                break;
            case 'crash':
                this.analyzeCrash(content, analysis);
                break;
            default:
                this.analyzeGenericGame(content, analysis, gameName);
        }
    }

    analyzeSlots(content, analysis) {
        // Slots should have high house edge (15-25%)
        const expectedHouseEdge = { min: 0.15, max: 0.30 };
        
        if (analysis.houseEdge) {
            if (analysis.houseEdge < expectedHouseEdge.min) {
                analysis.issues.push(`House edge too low: ${(analysis.houseEdge * 100).toFixed(1)}% (expected: ${expectedHouseEdge.min * 100}%+)`);
            }
            if (analysis.houseEdge > expectedHouseEdge.max) {
                analysis.issues.push(`House edge too high: ${(analysis.houseEdge * 100).toFixed(1)}% (max recommended: ${expectedHouseEdge.max * 100}%)`);
            }
        } else {
            analysis.issues.push('No house edge detected - slots should have 15-25% house edge');
        }

        // Check for proper RTP
        if (content.includes('RTP') || content.includes('return')) {
            const expectedRTP = 100 - (analysis.houseEdge || 0.2) * 100;
            analysis.rtp = expectedRTP;
        }
    }

    analyzeBlackjack(content, analysis) {
        // Blackjack should have low house edge (0.5-2%)
        const expectedHouseEdge = { min: 0.005, max: 0.02 };
        
        if (analysis.houseEdge) {
            if (analysis.houseEdge < expectedHouseEdge.min) {
                analysis.recommendations.push(`Consider slightly higher house edge for sustainability`);
            }
            if (analysis.houseEdge > expectedHouseEdge.max) {
                analysis.issues.push(`House edge too high: ${(analysis.houseEdge * 100).toFixed(1)}% (blackjack should be 0.5-2%)`);
            }
        }

        // Check for proper blackjack rules
        if (!content.includes('21') && !content.includes('blackjack')) {
            analysis.issues.push('Blackjack logic validation needed');
        }
    }

    analyzeRoulette(content, analysis) {
        // Roulette should have ~2.7% house edge (European) or ~5.26% (American)
        const expectedHouseEdge = { min: 0.025, max: 0.055 };
        
        if (analysis.houseEdge && (analysis.houseEdge < expectedHouseEdge.min || analysis.houseEdge > expectedHouseEdge.max)) {
            analysis.issues.push(`House edge ${(analysis.houseEdge * 100).toFixed(1)}% unusual for roulette (expected: 2.7-5.3%)`);
        }
    }

    analyzeFlip(content, analysis) {
        // Coin flip should have minimal house edge (1-3%)
        const expectedHouseEdge = { min: 0.01, max: 0.05 };
        
        if (analysis.houseEdge && analysis.houseEdge > expectedHouseEdge.max) {
            analysis.issues.push(`House edge too high for coin flip: ${(analysis.houseEdge * 100).toFixed(1)}%`);
        }
    }

    analyzePlinko(content, analysis) {
        // Plinko should have moderate house edge (5-15%)
        const expectedHouseEdge = { min: 0.05, max: 0.20 };
        
        if (analysis.houseEdge && (analysis.houseEdge < expectedHouseEdge.min || analysis.houseEdge > expectedHouseEdge.max)) {
            analysis.issues.push(`House edge ${(analysis.houseEdge * 100).toFixed(1)}% outside expected range for Plinko (5-20%)`);
        }
    }

    analyzeCrash(content, analysis) {
        // Crash should have low-moderate house edge (1-5%)
        const expectedHouseEdge = { min: 0.01, max: 0.08 };
        
        if (analysis.houseEdge && analysis.houseEdge > expectedHouseEdge.max) {
            analysis.issues.push(`House edge too high for crash game: ${(analysis.houseEdge * 100).toFixed(1)}%`);
        }
    }

    analyzeGenericGame(content, analysis, gameName) {
        // Generic analysis for other games
        if (!analysis.houseEdge) {
            analysis.recommendations.push('Consider implementing explicit house edge');
        }
        
        if (analysis.houseEdge && analysis.houseEdge > 0.30) {
            analysis.issues.push(`Very high house edge detected: ${(analysis.houseEdge * 100).toFixed(1)}%`);
        }
    }

    checkForProblematicPatterns(content, analysis) {
        // Check for win rates that are too high
        if (analysis.winRate && analysis.winRate > 0.6) {
            analysis.issues.push(`Win rate too high: ${(analysis.winRate * 100).toFixed(1)}% (players win too often)`);
        }

        // Check for missing balance integration
        if (!analysis.usesBalanceAdjustments) {
            analysis.recommendations.push('Consider integrating balance-based adjustments');
        }

        // Check for hardcoded favorable odds
        const favorablePatterns = [
            /win.*rate.*[7-9][0-9]/i,  // Win rates 70%+
            /payout.*[5-9][0-9]/i,     // Very high payouts
            /multiplier.*[1-9][0-9]/i, // Very high multipliers
        ];

        favorablePatterns.forEach(pattern => {
            if (pattern.test(content)) {
                analysis.recommendations.push('Review for potentially excessive player advantages');
            }
        });

        // Mark as problematic if has critical issues
        if (analysis.issues.length > 0) {
            this.problematicGames.push(analysis.game);
        }
    }

    async checkBalanceIntegration() {
        console.log('\\n⚖️ Checking balance-based integration...');
        
        const integratedGames = this.auditResults.filter(game => game.usesBalanceAdjustments);
        const nonIntegratedGames = this.auditResults.filter(game => !game.usesBalanceAdjustments);
        
        console.log(`  ✅ ${integratedGames.length} games use balance adjustments`);
        console.log(`  ⚠️ ${nonIntegratedGames.length} games lack balance adjustments`);
        
        if (nonIntegratedGames.length > 0) {
            console.log('\\n  Games needing balance integration:');
            nonIntegratedGames.forEach(game => {
                console.log(`    - ${game.game}`);
            });
        }
    }

    async simulateWinRates() {
        console.log('\\n🎯 Simulating actual win rates...');
        
        // This would simulate games if we had access to the actual game logic
        // For now, we'll analyze based on detected parameters
        
        this.auditResults.forEach(game => {
            if (game.houseEdge) {
                const theoreticalRTP = (1 - game.houseEdge) * 100;
                game.theoreticalRTP = theoreticalRTP;
                
                if (theoreticalRTP > 98) {
                    game.issues.push(`Theoretical RTP too high: ${theoreticalRTP.toFixed(1)}% (house loses money)`);
                }
            }
        });
    }

    generateReport() {
        console.log('\\n' + '='.repeat(80));
        console.log('📊 COMPREHENSIVE GAME AUDIT REPORT');
        console.log('='.repeat(80));
        
        // Summary Statistics
        const totalGames = this.auditResults.length;
        const gamesWithIssues = this.auditResults.filter(g => g.issues.length > 0).length;
        const gamesWithBalance = this.auditResults.filter(g => g.usesBalanceAdjustments).length;
        const averageHouseEdge = this.auditResults
            .filter(g => g.houseEdge)
            .reduce((sum, g) => sum + g.houseEdge, 0) / 
            this.auditResults.filter(g => g.houseEdge).length;
        
        console.log(`\\n📈 SUMMARY STATISTICS:`);
        console.log(`  Total Games Analyzed: ${totalGames}`);
        console.log(`  Games with Issues: ${gamesWithIssues} (${((gamesWithIssues/totalGames)*100).toFixed(1)}%)`);
        console.log(`  Games with Balance Integration: ${gamesWithBalance} (${((gamesWithBalance/totalGames)*100).toFixed(1)}%)`);
        console.log(`  Average House Edge: ${(averageHouseEdge * 100).toFixed(2)}%`);
        
        // Critical Issues
        const criticalGames = this.auditResults.filter(g => 
            g.issues.some(issue => 
                issue.includes('too high') || 
                issue.includes('too low') || 
                issue.includes('loses money')
            )
        );
        
        if (criticalGames.length > 0) {
            console.log(`\\n🚨 CRITICAL ISSUES (${criticalGames.length} games):`);
            criticalGames.forEach(game => {
                console.log(`\\n  ❌ ${game.game.toUpperCase()}:`);
                game.issues.forEach(issue => {
                    console.log(`    - ${issue}`);
                });
            });
        }
        
        // Game-by-Game Analysis
        console.log(`\\n🎮 DETAILED GAME ANALYSIS:`);
        this.auditResults.forEach(game => {
            const status = game.issues.length === 0 ? '✅' : '⚠️';
            const houseEdgeText = game.houseEdge ? `${(game.houseEdge * 100).toFixed(1)}%` : 'Unknown';
            const balanceText = game.usesBalanceAdjustments ? '✅' : '❌';
            
            console.log(`\\n  ${status} ${game.game.toUpperCase()}`);
            console.log(`    House Edge: ${houseEdgeText}`);
            console.log(`    Balance Integration: ${balanceText}`);
            
            if (game.theoreticalRTP) {
                console.log(`    Theoretical RTP: ${game.theoreticalRTP.toFixed(1)}%`);
            }
            
            if (game.issues.length > 0) {
                console.log(`    Issues:`);
                game.issues.forEach(issue => console.log(`      - ${issue}`));
            }
            
            if (game.recommendations.length > 0) {
                console.log(`    Recommendations:`);
                game.recommendations.forEach(rec => console.log(`      - ${rec}`));
            }
        });
        
        // Recommendations
        console.log(`\\n💡 OVERALL RECOMMENDATIONS:`);
        
        if (gamesWithBalance < totalGames) {
            console.log(`  1. Integrate ${totalGames - gamesWithBalance} remaining games with balance-based adjustments`);
        }
        
        if (criticalGames.length > 0) {
            console.log(`  2. Fix ${criticalGames.length} games with critical house edge issues`);
        }
        
        if (averageHouseEdge > 0.15) {
            console.log(`  3. Review overall house edges - average of ${(averageHouseEdge * 100).toFixed(1)}% may be too high`);
        } else if (averageHouseEdge < 0.05) {
            console.log(`  3. Review overall house edges - average of ${(averageHouseEdge * 100).toFixed(1)}% may be too low for sustainability`);
        }
        
        console.log(`  4. Implement automated testing for win rate verification`);
        console.log(`  5. Add real-time house edge monitoring during gameplay`);
        
        console.log(`\\n✅ AUDIT COMPLETE`);
        console.log('='.repeat(80));
    }
}

// Run the audit
async function runAudit() {
    const auditor = new GameEdgeAuditor();
    await auditor.runFullAudit();
    process.exit(0);
}

if (require.main === module) {
    runAudit().catch(error => {
        console.error('❌ Audit failed:', error);
        process.exit(1);
    });
}

module.exports = GameEdgeAuditor;
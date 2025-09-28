#!/usr/bin/env node

/**
 * COMPREHENSIVE CASINO ECONOMIC SYSTEM VALIDATION EXECUTOR
 * 
 * This script runs the complete validation suite for the casino economic system,
 * including mathematical validation, game theory verification, Monte Carlo testing,
 * real data integration, stress testing, security testing, and performance analysis.
 * 
 * Usage: node runFullSystemValidation.js [options]
 * Options:
 *   --quick        Run abbreviated validation suite
 *   --production   Run production-level comprehensive validation
 *   --report-only  Generate report from last execution
 *   --compare      Compare two validation runs
 * 
 */

const fs = require('fs').promises;
const path = require('path');
const { EmbedBuilder } = require('discord.js');
require('dotenv').config();

class SystemValidationRunner {
    constructor() {
        this.startTime = Date.now();
        this.masterExecutor = null;
        this.options = this.parseCommandLineArgs();
        
        console.log('🎰 COMPREHENSIVE CASINO ECONOMIC SYSTEM VALIDATION');
        console.log('=' .repeat(70));
        console.log(`🚀 Execution Mode: ${this.options.mode.toUpperCase()}`);
        console.log(`📅 Started: ${new Date().toISOString()}`);
        console.log('=' .repeat(70));
    }

    parseCommandLineArgs() {
        const args = process.argv.slice(2);
        
        const options = {
            mode: 'comprehensive',
            quick: args.includes('--quick'),
            production: args.includes('--production'),
            reportOnly: args.includes('--report-only'),
            compare: args.includes('--compare'),
            verbose: args.includes('--verbose') || args.includes('-v'),
            output: this.getArgValue(args, '--output') || 'console',
            executionId1: this.getArgValue(args, '--exec1'),
            executionId2: this.getArgValue(args, '--exec2')
        };
        
        if (options.quick) options.mode = 'quick';
        if (options.production) options.mode = 'production';
        if (options.reportOnly) options.mode = 'report';
        if (options.compare) options.mode = 'compare';
        
        return options;
    }

    getArgValue(args, flag) {
        const index = args.indexOf(flag);
        return index !== -1 && index < args.length - 1 ? args[index + 1] : null;
    }

    async initialize() {
        console.log('🔧 Initializing Validation Systems...');
        
        try {
            const MasterValidationExecutor = require('./UTILS/masterValidationExecutor');
            this.masterExecutor = new MasterValidationExecutor();
            
            const initialized = await this.masterExecutor.initializeValidationSuite();
            
            if (!initialized) {
                throw new Error('Failed to initialize validation suite');
            }
            
            console.log('✅ Validation systems initialized successfully\n');
            return true;
            
        } catch (error) {
            console.error('❌ Initialization failed:', error.message);
            
            if (this.options.verbose) {
                console.error('Stack trace:', error.stack);
            }
            
            return false;
        }
    }

    async run() {
        try {
            switch (this.options.mode) {
                case 'quick':
                    return await this.runQuickValidation();
                case 'production':
                    return await this.runProductionValidation();
                case 'comprehensive':
                    return await this.runComprehensiveValidation();
                case 'report':
                    return await this.generateReportOnly();
                case 'compare':
                    return await this.runComparison();
                default:
                    return await this.runComprehensiveValidation();
            }
        } catch (error) {
            console.error('💥 Critical execution error:', error.message);
            
            if (this.options.verbose) {
                console.error('Stack trace:', error.stack);
            }
            
            return this.createErrorReport(error);
        }
    }

    async runQuickValidation() {
        console.log('⚡ Running Quick Validation Suite...\n');
        
        const quickOptions = {
            skipStressTests: true,
            skipHistoricalBacktests: true,
            reducedMonteCarlo: true,
            limitedGameTheoryTests: true
        };
        
        const validationReport = await this.masterExecutor.executeComprehensiveValidation(quickOptions);
        
        return this.processValidationResults(validationReport, 'QUICK_VALIDATION');
    }

    async runProductionValidation() {
        console.log('🏭 Running Production-Level Validation Suite...\n');
        
        const productionOptions = {
            enhancedSecurity: true,
            extendedStressTesting: true,
            comprehensiveBacktesting: true,
            fullMonteCarlo: true,
            realDataRequired: true
        };
        
        const validationReport = await this.masterExecutor.executeComprehensiveValidation(productionOptions);
        
        return this.processValidationResults(validationReport, 'PRODUCTION_VALIDATION');
    }

    async runComprehensiveValidation() {
        console.log('🔬 Running Comprehensive Validation Suite...\n');
        
        const comprehensiveOptions = {
            fullValidation: true,
            allTestCategories: true,
            detailedReporting: true
        };
        
        const validationReport = await this.masterExecutor.executeComprehensiveValidation(comprehensiveOptions);
        
        return this.processValidationResults(validationReport, 'COMPREHENSIVE_VALIDATION');
    }

    async generateReportOnly() {
        console.log('📋 Generating Report from Previous Execution...\n');
        
        const history = this.masterExecutor.getExecutionHistory();
        
        if (history.length === 0) {
            console.log('❌ No previous executions found');
            return { success: false, message: 'No execution history available' };
        }
        
        const latestExecution = history[0];
        console.log(`📊 Latest Execution: ${latestExecution.executionId}`);
        console.log(`📅 Date: ${new Date(latestExecution.timestamp).toISOString()}`);
        console.log(`🎯 System Readiness: ${latestExecution.systemReadiness}`);
        console.log(`📈 Confidence: ${(latestExecution.confidence * 100).toFixed(1)}%`);
        console.log(`⚠️ Critical Issues: ${latestExecution.criticalIssues}`);
        
        return { success: true, report: latestExecution };
    }

    async runComparison() {
        console.log('🔍 Running Execution Comparison...\n');
        
        const { executionId1, executionId2 } = this.options;
        
        if (!executionId1 || !executionId2) {
            console.log('❌ Comparison requires two execution IDs');
            console.log('Usage: node runFullSystemValidation.js --compare --exec1 <id1> --exec2 <id2>');
            return { success: false, message: 'Missing execution IDs for comparison' };
        }
        
        try {
            const comparisonReport = await this.masterExecutor.generateComparisonReport(
                executionId1, 
                executionId2
            );
            
            this.displayComparisonReport(comparisonReport);
            
            return { success: true, report: comparisonReport };
            
        } catch (error) {
            console.error('❌ Comparison failed:', error.message);
            return { success: false, error: error.message };
        }
    }

    async processValidationResults(validationReport, validationType) {
        const endTime = Date.now();
        const totalDuration = endTime - this.startTime;
        
        console.log('\n' + '='.repeat(70));
        console.log('📊 VALIDATION RESULTS SUMMARY');
        console.log('='.repeat(70));
        
        this.displayValidationSummary(validationReport, totalDuration);
        
        if (this.options.verbose) {
            this.displayDetailedResults(validationReport);
        }
        
        await this.saveResults(validationReport, validationType);

        // Attempt to send alert to Discord channel if configured
        try {
            await this.sendDiscordAlert(validationReport, validationType);
        } catch (e) {
            console.warn('⚠️ Failed to send Discord alert:', e.message);
        }
        
        this.displayRecommendations(validationReport);
        
        console.log('\n' + '='.repeat(70));
        console.log(`✅ ${validationType} COMPLETED`);
        console.log(`⏱️ Total Execution Time: ${this.formatDuration(totalDuration)}`);
        console.log('='.repeat(70));
        
        return {
            success: true,
            report: validationReport,
            executionTime: totalDuration,
            systemReadiness: validationReport.systemReadiness
        };
    }

    async sendDiscordAlert(validationReport, validationType) {
        const webhookUrl = process.env.VALIDATION_ALERT_WEBHOOK_URL || '';
        const token = process.env.DISCORD_TOKEN;
        const channelId = process.env.VALIDATION_ALERT_CHANNEL_ID || '1409016191049142434';

        // Build embed content (plain object for webhook)
        const conf = (validationReport.overallConfidence * 100).toFixed(1);
        const categories = Object.entries(validationReport.categoryResults || {})
            .map(([k, v]) => `${k}: ${v.status || 'N/A'}`).slice(0, 10).join('\n') || 'N/A';
        const color = validationReport.systemReadiness === 'PRODUCTION_READY' ? 0x00C853 : 0xFFD600;

        const embedJson = {
            title: `Validation: ${validationReport.systemReadiness}`,
            description: `Type: ${validationType.replace(/_/g, ' ')}\nExecution: ${validationReport.executionId || 'N/A'}`,
            color,
            fields: [
                { name: 'Confidence', value: `${conf}%`, inline: true },
                { name: 'Critical Issues', value: String(validationReport.criticalIssues?.length || 0), inline: true },
                { name: 'Status', value: validationReport.status || 'COMPLETED', inline: true },
                { name: 'Categories', value: categories, inline: false }
            ],
            timestamp: new Date().toISOString()
        };

        // Prefer webhook if configured
        if (webhookUrl) {
            await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: 'Validation Reporter',
                    embeds: [embedJson]
                })
            });
            return;
        }

        // Fallback: send via bot client to a channel
        if (!token || !channelId) return; // Not configured
        const { Client, GatewayIntentBits } = require('discord.js');
        const client = new Client({ intents: [GatewayIntentBits.Guilds] });
        await client.login(token);
        try {
            const channel = await client.channels.fetch(channelId);
            if (!channel) throw new Error('Channel not found');
            const embed = new EmbedBuilder(embedJson);
            await channel.send({ embeds: [embed] });
        } finally {
            await client.destroy();
        }
    }

    displayValidationSummary(validationReport, totalDuration) {
        console.log(`🆔 Execution ID: ${validationReport.executionId}`);
        console.log(`⏱️ Duration: ${this.formatDuration(totalDuration)}`);
        console.log(`📊 Overall Status: ${this.getStatusIcon(validationReport.status)} ${validationReport.status}`);
        console.log(`🎯 System Readiness: ${this.getReadinessIcon(validationReport.systemReadiness)} ${validationReport.systemReadiness}`);
        console.log(`📈 Overall Confidence: ${this.getConfidenceBar(validationReport.overallConfidence)} ${(validationReport.overallConfidence * 100).toFixed(1)}%`);
        console.log(`⚠️ Critical Issues: ${validationReport.criticalIssues.length}`);
        
        console.log('\n📋 Category Results:');
        Object.entries(validationReport.categoryResults || {}).forEach(([category, result]) => {
            const safeCategory = String(category || 'unknown');
            const status = result && result.status ? String(result.status) : 'UNKNOWN';
            const statusIcon = this.getCategoryStatusIcon(status);
            const confidence = this.extractCategoryConfidence(result);
            console.log(`  ${statusIcon} ${safeCategory.padEnd(20)}: ${status.padEnd(12)} (${(confidence * 100).toFixed(0)}%)`);
        });
    }

    displayDetailedResults(validationReport) {
        console.log('\n' + '='.repeat(50));
        console.log('🔍 DETAILED RESULTS');
        console.log('='.repeat(50));
        
        Object.entries(validationReport.categoryResults || {}).forEach(([category, result]) => {
            console.log(`\n📁 ${category.toUpperCase()}:`);
            console.log(`   Status: ${result.status}`);
            
            if (result.keyFindings && result.keyFindings.length > 0) {
                console.log('   Key Findings:');
                result.keyFindings.forEach(finding => {
                    console.log(`     • ${finding}`);
                });
            }
            
            if (result.recommendations && result.recommendations.length > 0) {
                console.log('   Recommendations:');
                result.recommendations.slice(0, 3).forEach(rec => {
                    console.log(`     ⚡ ${rec}`);
                });
            }
        });
    }

    displayComparisonReport(comparisonReport) {
        console.log('📊 EXECUTION COMPARISON RESULTS');
        console.log('='.repeat(50));
        
        console.log(`\n🆔 Execution 1: ${comparisonReport.execution1.id}`);
        console.log(`   Date: ${comparisonReport.execution1.date}`);
        console.log(`   Readiness: ${comparisonReport.execution1.readiness}`);
        console.log(`   Confidence: ${(comparisonReport.execution1.confidence * 100).toFixed(1)}%`);
        
        console.log(`\n🆔 Execution 2: ${comparisonReport.execution2.id}`);
        console.log(`   Date: ${comparisonReport.execution2.date}`);
        console.log(`   Readiness: ${comparisonReport.execution2.readiness}`);
        console.log(`   Confidence: ${(comparisonReport.execution2.confidence * 100).toFixed(1)}%`);
        
        console.log('\n📈 IMPROVEMENTS:');
        console.log(`   Confidence Change: ${this.formatChange(comparisonReport.improvements.confidenceImprovement * 100)}%`);
        console.log(`   Critical Issues: ${this.formatChange(-comparisonReport.improvements.criticalIssuesChange)} issues`);
        console.log(`   Readiness Progression: ${comparisonReport.improvements.readinessProgression}`);
        
        console.log(`\n📊 Trend Analysis: ${comparisonReport.trends.overallTrend}`);
        
        if (comparisonReport.recommendations && comparisonReport.recommendations.length > 0) {
            console.log('\n💡 Recommendations:');
            comparisonReport.recommendations.forEach(rec => {
                console.log(`   • ${rec}`);
            });
        }
    }

    displayRecommendations(validationReport) {
        if (!validationReport.recommendations || validationReport.recommendations.length === 0) {
            return;
        }
        
        console.log('\n💡 RECOMMENDATIONS:');
        console.log('='.repeat(40));
        
        // Group recommendations by priority
        const criticalRecs = validationReport.recommendations.filter(r => r.includes('CRITICAL') || r.includes('IMMEDIATE'));
        const highRecs = validationReport.recommendations.filter(r => !criticalRecs.includes(r) && (r.includes('HIGH') || r.includes('IMPORTANT')));
        const normalRecs = validationReport.recommendations.filter(r => !criticalRecs.includes(r) && !highRecs.includes(r));
        
        if (criticalRecs.length > 0) {
            console.log('\n🚨 CRITICAL PRIORITY:');
            criticalRecs.forEach(rec => console.log(`   ❗ ${rec}`));
        }
        
        if (highRecs.length > 0) {
            console.log('\n⚠️ HIGH PRIORITY:');
            highRecs.slice(0, 5).forEach(rec => console.log(`   🔸 ${rec}`));
        }
        
        if (normalRecs.length > 0) {
            console.log('\n📝 NORMAL PRIORITY:');
            normalRecs.slice(0, 5).forEach(rec => console.log(`   • ${rec}`));
        }
    }

    async saveResults(validationReport, validationType) {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `validation-report-${validationType.toLowerCase()}-${timestamp}.json`;
            const filepath = path.join(__dirname, 'validation-reports', filename);
            
            // Ensure directory exists
            await fs.mkdir(path.dirname(filepath), { recursive: true });
            
            // Save detailed report
            await fs.writeFile(
                filepath, 
                JSON.stringify(validationReport, null, 2), 
                'utf8'
            );
            
            // Save executive summary
            const summaryFilename = `validation-summary-${validationType.toLowerCase()}-${timestamp}.json`;
            const summaryFilepath = path.join(__dirname, 'validation-reports', summaryFilename);
            
            await fs.writeFile(
                summaryFilepath,
                JSON.stringify(validationReport.executiveSummary, null, 2),
                'utf8'
            );
            
            console.log(`\n💾 Results saved:`);
            console.log(`   📄 Detailed Report: ${filename}`);
            console.log(`   📋 Executive Summary: ${summaryFilename}`);
            
        } catch (error) {
            console.warn('⚠️ Failed to save results to file:', error.message);
        }
    }

    createErrorReport(error) {
        return {
            success: false,
            error: error.message,
            timestamp: new Date().toISOString(),
            executionTime: Date.now() - this.startTime,
            systemReadiness: 'ERROR_STATE'
        };
    }

    // Helper methods for display formatting
    getStatusIcon(status) {
        const icons = {
            'COMPLETED': '✅',
            'RUNNING': '🔄',
            'PENDING': '⏳',
            'FAILED': '❌',
            'CRITICAL_ERROR': '💥'
        };
        return icons[status] || '❓';
    }

    getReadinessIcon(readiness) {
        const icons = {
            'PRODUCTION_READY': '🚀',
            'PRODUCTION_READY_WITH_MONITORING': '🛡️',
            'STAGING_READY': '🧪',
            'DEVELOPMENT_READY': '🔧',
            'REQUIRES_IMPROVEMENT': '⚠️',
            'NOT_READY': '❌'
        };
        return icons[readiness] || '❓';
    }

    getCategoryStatusIcon(status) {
        const icons = {
            'PASSED': '✅',
            'HEALTHY': '💚',
            'COMPLETED': '✔️',
            'FAILED': '❌',
            'ERROR': '💥',
            'DEGRADED': '⚠️',
            'PARTIAL': '🟡'
        };
        return icons[status] || '❓';
    }

    getConfidenceBar(confidence) {
        const barLength = 20;
        const filledLength = Math.round(confidence * barLength);
        const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
        
        let color = '';
        if (confidence >= 0.9) color = '🟢';
        else if (confidence >= 0.7) color = '🟡';
        else color = '🔴';
        
        return `${color}[${bar}]`;
    }

    extractCategoryConfidence(result) {
        if (!result || typeof result !== 'object') return 0.5;
        if (result.confidence !== undefined) return result.confidence;
        if (result.overallHealth !== undefined) return result.overallHealth;
        if (result.integrationScore !== undefined) return result.integrationScore;
        if (result.performanceScore !== undefined) return result.performanceScore;
        if (result.resilience !== undefined) return result.resilience;
        if (result.securityScore !== undefined) return result.securityScore;
        if (result.backtestScore !== undefined) return result.backtestScore;
        if (result.dataQuality !== undefined) return result.dataQuality;
        
        // Status-based confidence
        const status = result.status || 'UNKNOWN';
        if (status === 'PASSED' || status === 'HEALTHY') return 0.95;
        if (status === 'COMPLETED') return 0.85;
        if (status === 'DEGRADED' || status === 'PARTIAL') return 0.65;
        if (status === 'FAILED') return 0.30;
        if (status === 'ERROR') return 0.10;
        
        return 0.50;
    }

    formatDuration(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        
        if (minutes > 0) {
            return `${minutes}m ${remainingSeconds}s`;
        }
        return `${remainingSeconds}s`;
    }

    formatChange(value) {
        const sign = value >= 0 ? '+' : '';
        return `${sign}${value.toFixed(1)}`;
    }
}

// Main execution
async function main() {
    const runner = new SystemValidationRunner();
    
    const initialized = await runner.initialize();
    if (!initialized) {
        console.error('💥 Failed to initialize validation system');
        process.exit(1);
    }
    
    const result = await runner.run();
    
    if (result.success) {
        console.log('🎉 Validation completed successfully!');
        
        if (result.systemReadiness === 'PRODUCTION_READY') {
            console.log('✅ System is READY for production deployment!');
            process.exit(0);
        } else if (result.systemReadiness === 'PRODUCTION_READY_WITH_MONITORING') {
            console.log('✅ System is ready for production with monitoring!');
            process.exit(0);
        } else if (result.systemReadiness === 'NOT_READY') {
            console.log('❌ System is NOT READY - critical issues must be resolved');
            process.exit(1);
        } else {
            console.log(`⚠️ System readiness: ${result.systemReadiness}`);
            process.exit(0);
        }
    } else {
        console.error('💥 Validation failed');
        console.error(`Error: ${result.error || result.message}`);
        process.exit(1);
    }
}

// Execute if run directly
if (require.main === module) {
    main().catch(error => {
        console.error('💥 Unhandled error:', error);
        process.exit(1);
    });
}

module.exports = SystemValidationRunner;

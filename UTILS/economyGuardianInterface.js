/**
 * EconomyGuardian Interface - Unified Access Point for AI Economic Control
 * All economic commands must use this interface for AI analysis and control
 */

const logger = require('./logger');
const { EmbedBuilder } = require('discord.js');

class EconomyGuardianInterface {
    
    /**
     * MAIN INTERCEPTION METHOD
     * All economic commands must call this before execution
     */
    static async interceptEconomicCommand(interaction, commandType, amount, metadata = {}) {
        try {
            // Check if EconomyGuardian is available
            const guardian = interaction.client.economyGuardian;
            
            if (!guardian || !guardian.economicInterceptor) {
                // Fallback: Allow transaction but log
                logger.warn('EconomyGuardian not available - allowing transaction without AI analysis');
                return {
                    allowed: true,
                    reason: 'guardian_unavailable',
                    multiplierAdjustment: { finalMultiplier: 1.0 }
                };
            }
            
            // AI Interception and Analysis
            const result = await guardian.economicInterceptor.interceptCommand(
                interaction, 
                commandType, 
                amount, 
                metadata
            );
            
            // Log AI decision
            if (result.riskScore > 0.5) {
                logger.info(`AI Economic Decision: ${interaction.user.id} - ${commandType} - ${amount} - Risk: ${result.riskScore?.toFixed(3)} - ${result.allowed ? 'ALLOWED' : 'BLOCKED'}`);
            }
            
            return result;
            
        } catch (error) {
            logger.error(`EconomyGuardian interface error: ${error.message}`);
            
            // Safe fallback - allow transaction
            return {
                allowed: true,
                reason: 'interface_error',
                multiplierAdjustment: { finalMultiplier: 1.0 },
                error: error.message
            };
        }
    }
    
    /**
     * GET DYNAMIC MULTIPLIER
     * Returns AI-calculated multiplier for games
     */
    static async getDynamicMultiplier(interaction, gameType, baseAmount) {
        try {
            const guardian = interaction.client.economyGuardian;
            if (!guardian?.economicInterceptor) {
                return 1.0; // Default multiplier
            }
            
            const analysis = await guardian.economicInterceptor.interceptCommand(
                interaction,
                gameType,
                baseAmount,
                { requestType: 'multiplier_only' }
            );
            
            return analysis.multiplierAdjustment?.finalMultiplier || 1.0;
            
        } catch (error) {
            logger.error(`Dynamic multiplier error: ${error.message}`);
            return 1.0;
        }
    }
    
    /**
     * CREATE AI DECISION EMBED
     * Creates user-friendly embed showing AI decision reasoning
     */
    static createAIDecisionEmbed(aiResult, commandType, amount) {
        const embed = new EmbedBuilder()
            .setTitle('🤖 AI Economic Analysis')
            .setColor(aiResult.allowed ? 0x00FF00 : 0xFF0000)
            .addFields([
                {
                    name: '📊 Analysis Result',
                    value: `**Status:** ${aiResult.allowed ? '✅ Approved' : '❌ Blocked'}\n` +
                           `**Command:** ${commandType}\n` +
                           `**Amount:** $${amount.toLocaleString()}\n` +
                           `**Risk Score:** ${(aiResult.riskScore || 0).toFixed(2)}/1.00`,
                    inline: true
                }
            ]);
        
        if (aiResult.multiplierAdjustment) {
            const mult = aiResult.multiplierAdjustment;
            embed.addFields([{
                name: '🎯 AI Adjustments',
                value: `**Multiplier:** ${mult.finalMultiplier?.toFixed(3)}x\n` +
                       `**Gini Adjustment:** ${mult.giniAdjustment?.toFixed(3)}\n` +
                       `**Profile Adjustment:** ${mult.profileAdjustment?.toFixed(3)}\n` +
                       `**Health Adjustment:** ${mult.healthAdjustment?.toFixed(3)}`,
                inline: true
            }]);
        }
        
        if (aiResult.warning) {
            embed.addFields([{
                name: '⚠️ Warning',
                value: aiResult.warning,
                inline: false
            }]);
        }
        
        return embed;
    }
    
    /**
     * CREATE WEALTH TAX NOTIFICATION EMBED
     * Creates user-friendly embed showing wealth tax collection
     */
    static createWealthTaxNotificationEmbed(wealthTaxResult, userBalance) {
        if (!wealthTaxResult?.taxApplied) return null;

        const embed = new EmbedBuilder()
            .setTitle('🏦 Wealth Tax Applied')
            .setColor(0xFFD700)
            .setDescription(`As a high-net-worth player (>$500M), you've been assessed a wealth tax to help maintain economic balance.`)
            .addFields([
                {
                    name: '💰 Tax Details',
                    value: `**Tax Amount:** $${wealthTaxResult.taxAmount.toLocaleString()}\n` +
                           `**Tax Rate:** ${wealthTaxResult.taxRate.toFixed(2)}%\n` +
                           `**Tax Type:** ${wealthTaxResult.taxType}\n` +
                           `**Remaining Balance:** $${(userBalance.wallet + userBalance.bank).toLocaleString()}`,
                    inline: true
                },
                {
                    name: '🤖 AI Reasoning',
                    value: wealthTaxResult.reasoning,
                    inline: false
                }
            ])
            .setFooter({ 
                text: `Wealth taxes help redistribute wealth and maintain a healthy casino economy • Generated by ChatGPT AI` 
            })
            .setTimestamp();

        return embed;
    }

    /**
     * LOG TRANSACTION RESULT
     * Logs the final result of an economic transaction
     */
    static async logTransactionResult(interaction, commandType, amount, result, aiDecision) {
        try {
            const guardian = interaction.client.economyGuardian;
            if (!guardian?.auditLogger) return;
            
            await guardian.auditLogger.logEntry({
                category: 'transaction',
                event: `${commandType}_executed`,
                severity: result.won ? 'info' : 'low',
                data: {
                    userId: interaction.user.id,
                    commandType,
                    betAmount: amount,
                    payout: result.payout || 0,
                    won: result.won || false,
                    aiRiskScore: aiDecision.riskScore,
                    aiMultiplier: aiDecision.multiplierAdjustment?.finalMultiplier,
                    netResult: (result.payout || 0) - amount
                },
                source: 'EconomicTransaction'
            });
            
        } catch (error) {
            logger.error(`Transaction logging error: ${error.message}`);
        }
    }
    
    /**
     * GET USER ECONOMIC PROFILE
     * Returns AI-generated user profile for display
     */
    static async getUserProfile(interaction, targetUserId = null) {
        try {
            const userId = targetUserId || interaction.user.id;
            const guardian = interaction.client.economyGuardian;
            
            if (!guardian?.economicInterceptor) {
                return null;
            }
            
            return await guardian.economicInterceptor.getUserProfile(userId);
            
        } catch (error) {
            logger.error(`User profile retrieval error: ${error.message}`);
            return null;
        }
    }
    
    /**
     * GET ECONOMIC HEALTH METRICS
     * Returns current economic health for display
     */
    static async getEconomicHealth(client) {
        try {
            const guardian = client.economyGuardian;
            if (!guardian?.economicInterceptor) return null;
            
            const gini = await guardian.economicInterceptor.calculateGiniCoefficient();
            const metrics = await guardian.metricsCollector.collectAll();
            
            return {
                giniCoefficient: gini,
                economicHealth: metrics.economicHealth,
                timestamp: Date.now()
            };
            
        } catch (error) {
            logger.error(`Economic health retrieval error: ${error.message}`);
            return null;
        }
    }
    
    /**
     * ADD EXEMPT USER
     * Adds user to AI exemption list (for admins/developers)
     */
    static addExemptUser(client, userId) {
        try {
            const guardian = client.economyGuardian;
            if (guardian?.economicInterceptor) {
                guardian.economicInterceptor.addExemptUser(userId);
                logger.info(`User ${userId} added to AI exemption list`);
            }
        } catch (error) {
            logger.error(`Exempt user addition error: ${error.message}`);
        }
    }
    
    /**
     * GET DYNAMICALLY ADJUSTED PAYOUT TEXT
     * Returns game text adjusted for current economic conditions
     */
    static async getAdjustedPayoutText(client, gameType, baseText) {
        try {
            const guardian = client.economyGuardian;
            if (!guardian?.economicInterceptor) {
                return baseText; // Return original if no AI
            }
            
            return await guardian.economicInterceptor.getAdjustedPayoutText(gameType, baseText);
            
        } catch (error) {
            logger.error(`Adjusted text error: ${error.message}`);
            return baseText;
        }
    }
    
    /**
     * GET ECONOMIC INDICATORS FOR UI
     * Returns current economic status for display
     */
    static getEconomicIndicators(client) {
        try {
            const guardian = client.economyGuardian;
            if (!guardian?.economicInterceptor) {
                return { status: 'Stable', color: 0x00FF00, gini: '0.000', inflation: '0.0%' };
            }
            
            return guardian.economicInterceptor.getCurrentEconomicIndicators();
            
        } catch (error) {
            logger.error(`Economic indicators error: ${error.message}`);
            return { status: 'Unknown', color: 0x808080, gini: '?', inflation: '?' };
        }
    }

    /**
     * GET WEALTH TAX STATISTICS
     * Returns statistics about wealth tax collection for transparency
     */
    static async getWealthTaxStatistics(client) {
        try {
            const guardian = client.economyGuardian;
            if (!guardian?.auditLogger) return null;
            
            // Get recent wealth tax entries from audit log
            // This is a placeholder - would need proper database query implementation
            return {
                totalTaxesCollected: 0,
                totalPlayersAffected: 0,
                averageTaxRate: 0,
                lastTaxCollection: null,
                economicImpact: 'Insufficient data'
            };
            
        } catch (error) {
            logger.error(`Wealth tax statistics error: ${error.message}`);
            return null;
        }
    }

    /**
     * FORCE AI ANALYSIS
     * Triggers immediate AI analysis and adjustments
     */
    static async triggerAIAnalysis(client) {
        try {
            const guardian = client.economyGuardian;
            if (!guardian) return false;
            
            await guardian.performAnalysis();
            return true;
            
        } catch (error) {
            logger.error(`AI analysis trigger error: ${error.message}`);
            return false;
        }
    }
}

module.exports = EconomyGuardianInterface;
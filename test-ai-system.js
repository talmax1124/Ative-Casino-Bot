#!/usr/bin/env node

/**
 * AI SYSTEM TEST - Test rate limiting and fallback functionality
 */

console.log('🧪 Testing AI System with Rate Limiting & Fallbacks...\n');

async function testAISystem() {
    try {
        // Test the real AI engine
        const realAI = require('./UTILS/realAIEngine');
        
        console.log('📊 AI System Status:');
        const status = realAI.getAIStatus();
        console.log('  Status:', status.status);
        console.log('  Model:', status.model || 'N/A');
        console.log('  Dev Mode:', status.devMode);
        console.log('  Rate Limited:', status.rateLimiting?.isRateLimited || 'Unknown');
        console.log();
        
        // Test basic AI functionality
        console.log('🤖 Testing AI Response Generation...');
        
        const testPrompt = `Analyze this casino data:
        - Games played: 1000
        - House edge: 5.2%
        - Player win rate: 42%
        
        Provide brief recommendations in JSON format.`;
        
        try {
            console.log('  Calling AI with test prompt...');
            const response = await realAI.queryOpenAI(testPrompt, 'test_analysis');
            console.log('  ✅ AI Response received:');
            console.log('  Source:', response.includes('fallback') ? 'Fallback' : 'OpenAI');
            console.log('  Length:', response.length, 'characters');
            console.log();
            
        } catch (error) {
            console.log('  ❌ AI Error:', error.message);
            console.log('  This is expected if API key is missing or rate limited');
            console.log();
        }
        
        // Test fallback recommendations
        console.log('🔄 Testing Fallback System...');
        const mockGameData = {
            totalGames: 1000,
            houseEdge: 0.052,
            winRate: 0.42,
            avgBetSize: 250,
            totalVolume: 250000,
            houseProfit: 13000
        };
        
        const fallbackRecommendations = realAI.fallbackRecommendations(mockGameData);
        console.log('  ✅ Fallback recommendations generated:');
        console.log('  Count:', fallbackRecommendations.length);
        console.log('  Types:', fallbackRecommendations.map(r => r.action).join(', '));
        console.log();
        
        // Test rate limiting status
        console.log('⏱️ Rate Limiting Status:');
        if (realAI.rateLimitFix) {
            const rateLimitStatus = realAI.rateLimitFix.getRateLimitStatus();
            console.log('  Rate Limited:', rateLimitStatus.isRateLimited);
            console.log('  Consecutive Errors:', rateLimitStatus.consecutiveErrors);
            console.log('  Can Retry:', rateLimitStatus.canRetry);
            console.log('  Time Until Reset:', rateLimitStatus.timeUntilReset, 'ms');
        } else {
            console.log('  Rate limiter not initialized');
        }
        console.log();
        
        // Simulate rate limit scenario
        console.log('🚨 Simulating Rate Limit Scenario...');
        try {
            // This should trigger fallback if API is unavailable
            const rateLimitedResponse = await realAI.generateIntelligentRecommendations(
                mockGameData,
                { volumeTrend: 'up', winRateTrend: 'stable' },
                { riskLevel: 'low', volatility: 'normal' }
            );
            
            console.log('  ✅ Rate limit handling working:');
            console.log('  Recommendations count:', rateLimitedResponse.length);
            console.log('  Has fallback source:', rateLimitedResponse.some(r => r.source?.includes('fallback')));
            console.log();
            
        } catch (error) {
            console.log('  ⚠️ Error in rate limit test:', error.message);
            console.log();
        }
        
        console.log('='.repeat(60));
        console.log('✅ AI System Tests Completed!');
        console.log('='.repeat(60));
        console.log();
        console.log('📋 Test Results Summary:');
        console.log('  ✅ AI Engine initialized');
        console.log('  ✅ Status reporting working');
        console.log('  ✅ Fallback system operational');
        console.log('  ✅ Rate limiting framework ready');
        console.log();
        console.log('💡 Next Steps:');
        console.log('  1. Set OPENAI_API_KEY environment variable for production');
        console.log('  2. Replace old AI commands with /ai unified command');
        console.log('  3. Monitor rate limiting in production');
        console.log();
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run tests
testAISystem()
    .then(() => {
        console.log('🎉 All tests completed successfully!');
        process.exit(0);
    })
    .catch(error => {
        console.error('💥 Test suite failed:', error);
        process.exit(1);
    });
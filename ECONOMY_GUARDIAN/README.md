# EconomyGuardian - AI-Driven Casino Economic Management

## Overview

EconomyGuardian is a production-ready AI-powered economic management system that autonomously monitors, analyzes, and optimizes your casino bot's economy using ChatGPT-4 intelligence with comprehensive safety guardrails.

## 🎯 Key Features

### 🤖 AI-Powered Analysis
- **ChatGPT-4 Integration**: Advanced economic analysis and insights
- **Real-time Monitoring**: Continuous metrics collection and evaluation
- **Predictive Economics**: Identifies issues before they become critical
- **Contextual Intelligence**: Understands casino-specific economic patterns

### 🛡️ Multi-Layer Safety System
- **Guardrails Engine**: Prevents dangerous economic changes
- **Change Budgets**: Daily/weekly limits on economic impact
- **Cooldown Periods**: Prevents rapid consecutive changes  
- **Emergency Stops**: Automatic and manual emergency protections
- **Impact Thresholds**: Graduated approval requirements based on risk

### 👥 Human-in-the-Loop Workflow
- **Approval System**: Discord-based proposal review and approval
- **Two Modes**: Advisor (recommendations only) vs Controller (auto-execute)
- **Risk Assessment**: Automatic risk categorization and approval routing
- **Audit Trail**: Complete history of all decisions and changes

### 📊 Comprehensive Metrics
- **Token Flow Analysis**: Money supply, inflation, deflation tracking
- **Game Performance**: Individual game economics and balance
- **Player Behavior**: Wealth distribution, liquidity analysis  
- **System Health**: Overall economic stability scoring

## 🚀 Quick Start

### 1. Installation

```bash
# Install required dependencies
npm install axios
```

### 2. Environment Setup

Add to your `.env` file:
```env
# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here

# Discord Integration (optional)
ECONOMY_APPROVAL_CHANNEL=discord_channel_id
ECONOMY_ADMIN_ROLE=discord_role_id
```

### 3. Integration

In your main `index.js`:

```javascript
const { initializeEconomyGuardian, shutdownEconomyGuardian } = require('./ECONOMY_GUARDIAN/integration');

// Initialize after client ready
client.once('ready', async () => {
    try {
        await initializeEconomyGuardian(client, {
            mode: 'advisor',                    // Start in advisor mode
            openaiApiKey: process.env.OPENAI_API_KEY,
            approvalChannelId: process.env.ECONOMY_APPROVAL_CHANNEL
        });
        console.log('✅ EconomyGuardian initialized successfully');
    } catch (error) {
        console.error('❌ EconomyGuardian initialization failed:', error);
    }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    await shutdownEconomyGuardian(client);
    process.exit(0);
});
```

### 4. Configure Game Integration

Edit `ECONOMY_GUARDIAN/integration.js` and implement the game integration points:

```javascript
const gameIntegrationPoints = {
    async adjustGamePayout(game, adjustmentPercentage) {
        // Connect to your game configuration system
        const currentPayout = await yourGameSystem.getPayoutRate(game);
        const newPayout = currentPayout * (1 + adjustmentPercentage / 100);
        await yourGameSystem.updatePayoutRate(game, newPayout);
        
        return { success: true, game, adjustment: adjustmentPercentage };
    },
    
    // Implement other integration points...
};
```

## 📋 Discord Commands

Use `/economyguardian` to manage the system:

- `/economyguardian status` - View system status
- `/economyguardian start` - Start monitoring  
- `/economyguardian stop` - Stop monitoring
- `/economyguardian proposals` - View pending proposals
- `/economyguardian analysis` - Trigger immediate analysis
- `/economyguardian report` - Generate economic report
- `/economyguardian config` - Update configuration
- `/economyguardian emergency` - Emergency controls

## 🏗️ Architecture

```
EconomyGuardian/
├── index.js                 # Main EconomyGuardian class
├── core/
│   ├── MetricsCollector.js   # Real-time metrics ingestion
│   ├── EconomicAnalyzer.js   # ChatGPT analysis engine
│   ├── GuardRailSystem.js    # Safety and limits enforcement
│   ├── ProposalEngine.js     # AI proposal generation
│   ├── ApprovalWorkflow.js   # Human approval process
│   ├── StateManager.js       # Persistent state management
│   └── AuditLogger.js        # Comprehensive audit trail
├── integration.js            # Production integration guide
└── README.md                # This file
```

## ⚙️ Configuration

### Operational Modes

**Advisor Mode (Recommended for Start)**
- AI generates recommendations
- All changes require human approval
- Safe for learning and validation

**Controller Mode (Advanced)**
- Low-risk changes auto-execute
- High-risk changes still require approval
- Maximum automation with safety

### Safety Configuration

```javascript
const config = {
    // Change limits
    maxSingleAdjustment: 0.05,      // 5% max single change
    maxDailyChangesBudget: 0.05,    // 5% max daily economic impact
    cooldownPeriod: 3600000,        // 1 hour between major changes
    
    // House edge boundaries  
    minHouseEdge: 0.005,            // 0.5% minimum
    maxHouseEdge: 0.15,             // 15% maximum
    
    // Auto-approval thresholds
    autoApprovalThreshold: 0.01,    // 1% impact threshold
    lowImpactThreshold: 0.01,       // Low risk threshold
    mediumImpactThreshold: 0.03,    // Medium risk threshold
    highImpactThreshold: 0.05,      // High risk threshold
    
    // Analysis intervals
    metricsInterval: 300000,        // 5 minutes
    analysisInterval: 900000,       // 15 minutes
};
```

## 📊 Metrics Collected

### Token Flow Analysis
- **Inflow/Outflow**: Money entering/leaving the economy
- **Net Flow**: Overall money supply changes
- **House Edge Effectiveness**: Actual vs theoretical house edge
- **Velocity**: How fast money circulates

### Game Performance
- **Individual Game Stats**: Volume, win rates, payouts per game
- **Profitability Analysis**: Revenue and cost analysis
- **Player Engagement**: Bet sizes, frequency, retention

### Economic Health
- **Inflation Rate**: Currency value changes
- **Liquidity Analysis**: Player balance distribution
- **Wealth Concentration**: Gini coefficient and percentiles
- **Stability Score**: Overall economic stability measurement

### System Sinks and Faucets
- **Money Removal**: Game losses, fees, burns
- **Money Creation**: Bonuses, rewards, airdrops
- **Balance Analysis**: Net money creation/destruction

## 🔒 Security Features

### Data Protection
- **Sensitive Data Redaction**: Automatic removal of keys/tokens from logs
- **Encrypted Storage**: Optional encryption for state persistence
- **Integrity Verification**: Hash verification for audit trail
- **Access Controls**: Role-based Discord permissions

### Safety Mechanisms
- **Circuit Breakers**: Automatic emergency stops on failures
- **Rate Limiting**: Prevents excessive changes
- **Change Validation**: Multi-layer proposal validation
- **Rollback Capability**: Manual intervention and rollback support

## 🎮 Game Integration Examples

### Blackjack Integration
```javascript
async adjustGamePayout(game, adjustmentPercentage) {
    if (game === 'blackjack') {
        // Adjust blackjack payout multipliers
        const currentBlackjackMultiplier = 1.9; // Your current setting
        const newMultiplier = currentBlackjackMultiplier * (1 + adjustmentPercentage / 100);
        
        // Update your game config
        await updateBlackjackPayoutMultiplier(newMultiplier);
        
        return { success: true, newMultiplier };
    }
}
```

### Slot Machine Integration
```javascript
async adjustHouseEdge(game, adjustmentPercentage) {
    if (game === 'slots') {
        // Adjust slot machine RTP (Return to Player)
        const currentRTP = 0.95; // 95% RTP = 5% house edge
        const newRTP = currentRTP - (adjustmentPercentage / 100);
        
        // Update slot configuration
        await updateSlotRTP(newRTP);
        
        return { success: true, newRTP, newHouseEdge: 1 - newRTP };
    }
}
```

## 📈 AI Analysis Examples

### Inflation Detection
```
AI Analysis: "High inflation detected (8.2% over 24 hours). Money supply growing faster than economic activity. Recommend increasing house edges by 2% on high-volume games to stabilize currency."

Generated Proposal:
- Action: Adjust house edge
- Target: slots, blackjack  
- Adjustment: +2%
- Expected Impact: 6.1%
- Risk Level: Medium
```

### Liquidity Crisis  
```
AI Analysis: "30% of players have balances below minimum viable gameplay threshold. Recommend temporary payout increase to improve player retention and engagement."

Generated Proposal:  
- Action: Adjust payout rates
- Target: All games
- Adjustment: +1.5%
- Expected Impact: 3.2%
- Risk Level: Low
```

## 🎯 Best Practices

### Getting Started
1. **Start in Advisor Mode**: Get familiar with AI recommendations
2. **Monitor for a Week**: Understand your economic patterns  
3. **Validate AI Suggestions**: Check recommendations against reality
4. **Implement Game Integration**: Connect to your actual game systems
5. **Gradually Increase Automation**: Move to Controller mode when confident

### Operational Tips
- **Review Daily Reports**: Stay informed of economic trends
- **Set Conservative Limits**: Start with lower change budgets
- **Monitor Player Feedback**: Watch for player complaints about changes
- **Keep Emergency Contacts**: Have admins ready to intervene if needed
- **Regular Backups**: Backup system state and configuration

### Troubleshooting
- **High False Positives**: Adjust significance thresholds
- **Too Conservative**: Increase change budgets gradually
- **Player Complaints**: Review recent changes and rollback if needed
- **AI Errors**: Check OpenAI API key and quota limits
- **System Crashes**: Review audit logs for error patterns

## 🔧 Advanced Features

### Custom Metrics
Extend the MetricsCollector to include your specific metrics:

```javascript
// In MetricsCollector.js, add custom collection method
async collectCustomMetrics() {
    return {
        vipPlayerRetention: await this.calculateVIPRetention(),
        tournamentActivity: await this.getTournamentStats(),
        bonusEffectiveness: await this.analyzeBonusImpact()
    };
}
```

### Custom AI Prompts
Modify the analysis prompts in EconomicAnalyzer.js for your specific needs:

```javascript
buildAnalysisPrompt(metrics) {
    return `You are analyzing a ${this.gameType} casino economy...
    
    CUSTOM CONSIDERATIONS:
    - VIP player retention is critical
    - Tournament balance affects engagement  
    - Bonus systems drive acquisition
    
    ${this.basePrompt}`;
}
```

### Integration with External Systems
Connect to external analytics, databases, or business intelligence tools:

```javascript
// Custom metrics from external API
async collectExternalMetrics() {
    const analytics = await fetch('https://your-analytics-api.com/metrics');
    return await analytics.json();
}
```

## 📞 Support

### Common Issues
- **OpenAI API Errors**: Check API key, quota, and rate limits
- **Discord Integration**: Verify channel IDs and bot permissions  
- **Database Errors**: Check database connectivity and table schemas
- **Permission Errors**: Verify file system permissions for data storage

### Debug Mode
Enable detailed logging:

```javascript
await initializeEconomyGuardian(client, {
    logLevel: 'debug',
    enableRealTimeLogging: true
});
```

### Error Recovery
The system includes automatic error recovery:
- Failed analyses trigger fallback rule-based analysis
- Database errors use in-memory caching
- API failures activate circuit breakers
- State corruption triggers automatic backup restoration

## 🚀 Production Deployment

### Recommended Server Specs
- **CPU**: 2+ cores (for AI analysis)
- **RAM**: 4GB+ (for metrics caching) 
- **Storage**: 10GB+ (for audit logs and state)
- **Network**: Stable connection for OpenAI API calls

### Monitoring Setup
- Monitor OpenAI API usage and costs
- Set up alerts for emergency mode activation
- Track system performance metrics
- Monitor database storage growth

### Backup Strategy  
- Daily state backups (automatic)
- Weekly configuration exports
- Monthly audit log archives  
- Disaster recovery procedures

---

**EconomyGuardian** - Bringing AI intelligence to casino economic management with production-grade safety and reliability.

For technical support or feature requests, please check the integration guide and audit logs first, then contact your development team with specific error messages and system state information.
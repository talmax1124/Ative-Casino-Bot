# 💎 Premium Weekly & Monthly Commands

## Overview
Exclusive earning commands for **Diamond** and **Ruby** subscribers only, connected to your website subscription system. These premium commands provide substantial rewards with proper cooldowns and subscription validation.

## 🎯 Command Structure

### `/weekly` - Premium Weekly Reward
- **Diamond Subscribers**: 1,000,000 coins (1M)
- **Ruby Subscribers**: 1,200,000 coins (1M + 20% bonus)
- **Cooldown**: 7 days
- **Restriction**: Active subscription required

### `/monthly` - Premium Monthly Reward  
- **Diamond Subscribers**: 10,000,000 coins (10M)
- **Ruby Subscribers**: 12,000,000 coins (10M + 20% bonus)
- **Cooldown**: 30 days
- **Restriction**: Active subscription required

## 💎 Subscription Tiers

### Diamond Subscription ($4.99/month)
- **Weekly**: 1M coins every 7 days
- **Monthly**: 10M coins every 30 days
- **Website Benefits**: 5% bonus on purchases, VIP channels
- **Database**: `diamond_subscription` in `user_subscriptions` table

### Ruby Subscription ($9.99/month) - Premium Tier
- **Weekly**: 1.2M coins every 7 days (+200k bonus)
- **Monthly**: 12M coins every 30 days (+2M bonus)  
- **Website Benefits**: 10% bonus on purchases, premium privileges
- **Database**: `ruby_subscription` in `user_subscriptions` table

## 🔧 Technical Implementation

### Database Integration
- **Subscription Check**: Queries `user_subscriptions` table from website
- **Cooldown Tracking**: Uses new `premium_claims` table
- **Transaction Logging**: Records all claims with timestamps

### Security Features
- **Active subscription validation** before each claim
- **Precise cooldown checking** (7 days = 604,800,000ms)
- **Duplicate claim prevention** with unique constraints
- **Comprehensive logging** for audit trails

### User Experience
- **Beautiful embeds** with tier-specific colors and styling
- **Clear cooldown displays** showing exact time remaining
- **Helpful upgrade prompts** for non-subscribers
- **Celebration messages** for successful claims

## 📊 Reward Breakdown

| Tier | Weekly Reward | Monthly Reward | Total Monthly Value |
|------|---------------|----------------|---------------------|
| **Diamond** | 1M × 4 = 4M | 10M | **14M coins/month** |
| **Ruby** | 1.2M × 4 = 4.8M | 12M | **16.8M coins/month** |

## 🎮 Usage Examples

### For Non-Subscribers
```
User: /weekly
Bot: 💎 Premium Subscription Required
     Visit Casino Shop to subscribe!
```

### For Diamond Subscribers
```
User: /weekly  
Bot: 🎁 Weekly Premium Reward Claimed!
     💰 Reward: 1,000,000 coins
     🎭 Diamond VIP subscription
     ⏰ Next claim: Next Friday
```

### For Ruby Subscribers  
```
User: /monthly
Bot: 🎉 Monthly Premium Reward Claimed!
     💰 Reward: 12,000,000 coins
     🎭 Ruby Premium (+20% bonus)
     ⏰ Next claim: December 27
```

### On Cooldown
```
User: /weekly
Bot: ⏰ Weekly Reward Cooldown
     Next claim available in: 3d 14h 22m
```

## 🗄️ Database Schema

### Premium Claims Table
```sql
CREATE TABLE premium_claims (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(20) NOT NULL,
    guild_id VARCHAR(20) NOT NULL,
    claim_type ENUM('weekly', 'monthly') NOT NULL,
    amount DECIMAL(20,2) NOT NULL,
    subscription_type VARCHAR(50) NOT NULL,
    claimed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_claim_type (user_id, guild_id, claim_type)
);
```

### Subscription Validation Query
```sql
SELECT subscription_type, active, created_at 
FROM user_subscriptions 
WHERE user_id = ? AND active = 1
ORDER BY created_at DESC 
LIMIT 1
```

## 🚀 Setup Instructions

### 1. Database Setup
The premium claims table will be created automatically when you restart your bot (already added to schema initialization).

### 2. Test Commands
```bash
# Test without subscription (should show upgrade prompt)
/weekly

# Test with subscription (should work if user has active sub)
/monthly
```

### 3. Monitor Usage
Check the `premium_claims` table to monitor:
- Claim frequency and patterns
- Revenue impact from premium features
- User engagement with subscription tiers

## 🎯 Business Benefits

### Revenue Incentives
- **Clear value proposition**: Substantial coin rewards for subscribers
- **Tier differentiation**: Ruby subscribers get 20% more rewards
- **Recurring engagement**: Weekly/monthly touchpoints with premium users

### User Retention
- **Exclusive access**: Premium commands create subscriber-only value
- **Consistent rewards**: Regular incentives to maintain subscriptions
- **Progress tracking**: Users can see their premium claim history

## 🔒 Security & Fair Use

### Anti-Abuse Measures
- **Subscription validation**: Checks active status on every claim
- **Proper cooldowns**: Prevents spam claiming
- **Database constraints**: Prevents duplicate entries
- **Audit logging**: Complete transaction history

### Monitoring Recommendations
- Track claim patterns for unusual activity
- Monitor subscription status changes
- Review high-value claims for verification
- Analyze premium user retention rates

## 🎉 Ready for Launch!

The premium commands are now fully integrated with your website subscription system and ready for your Diamond and Ruby subscribers to enjoy their exclusive rewards! 💎🔴
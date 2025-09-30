# 🗳️ Voting System Setup & Testing Guide

## 📋 Overview
This bot now supports 2 types of voting with rewards:
1. **Bot Votes** (Top.GG) - 25,000 coins + bonuses
2. **Rank.top Votes** - 1 free lottery ticket

Plus 1 community support option:
3. **Server Votes** (Top.GG) - Community support (no automated rewards)

## 🚀 Quick Setup

### 1. Environment Variables
Add these to your `.env` file:

```env
# Top.GG Configuration
TOPGG_WEBHOOK_SECRET=your-custom-secret-here
TOPGG_SERVER_TOKEN=your-topgg-server-token-here

# Rank.top Configuration
RANKTOP_API_KEY=3c0bd90ca34d52f5f2ad71729b60f02e3ee34a7fe5d28779
RANKTOP_WEBHOOK_SECRET=your-custom-ranktop-secret

# Server Configuration  
DESIGNATED_SERVER_ID=1403244656845787167
```

### 2. Configure Webhooks on Voting Platforms

#### Top.GG Bot Voting
1. Go to https://top.gg/bot/1403236218900185088/webhooks
2. Set Webhook URL: `https://your-bot-domain.com/topgg/webhook`
3. No additional headers needed (uses authorization in request)

#### Top.GG Server Voting
1. **No webhook configuration needed** - uses API polling
2. Get your server API token from https://top.gg/servers/1403244656845787167
3. Add `TOPGG_SERVER_TOKEN=your-token-here` to your `.env` file
4. The bot will automatically poll for server votes every 60 seconds

#### Rank.top Voting
1. Go to your Rank.top bot dashboard
2. Set Webhook URL: `https://your-bot-domain.com/ranktop/webhook`
3. Set Authorization: `your-custom-ranktop-secret` (same as RANKTOP_WEBHOOK_SECRET)

## 🧪 Testing

### Method 1: Using the Test Script

1. **Install dependencies** (if needed):
```bash
npm install axios
```

2. **Configure the test script**:
Edit `test-voting.js` and set:
- `WEBHOOK_BASE_URL`: Your bot's webhook URL (or `http://localhost:3001` for local)
- `TEST_USER_ID`: Your Discord user ID

3. **Run tests**:

```bash
# Test all voting types
node test-voting.js

# Interactive mode
node test-voting.js -i

# Test specific vote type
node test-voting.js bot      # Test bot vote
node test-voting.js server   # Test server vote  
node test-voting.js ranktop  # Test Rank.top vote
```

### Method 2: Manual Testing with cURL

#### Test Bot Vote:
```bash
curl -X POST http://localhost:3001/topgg/webhook \
  -H "Authorization: Bearer your-custom-secret-here" \
  -H "Content-Type: application/json" \
  -d '{
    "bot": "1403236218900185088",
    "user": "YOUR_USER_ID",
    "type": "upvote"
  }'
```

#### Test Server Vote:
Server votes cannot be tested via webhook since they use API polling. To test:
1. Make sure `TOPGG_SERVER_TOKEN` is set in your `.env`
2. Vote for the server on Top.GG
3. Wait up to 60 seconds for the polling system to detect it
4. Check bot logs for "Processing new server vote from user..."

#### Test Rank.top Vote:
```bash
curl -X POST http://localhost:3001/ranktop/webhook \
  -H "Authorization: Bearer your-custom-ranktop-secret" \
  -H "Content-Type: application/json" \
  -d '{
    "user": "YOUR_USER_ID",
    "bot": "1403236218900185088"
  }'
```

### Method 3: Using Rank.top Test Button

1. Go to your Rank.top bot dashboard
2. Configure webhook URL and authorization
3. Click "Send Test Message" button
4. Check your bot logs for the webhook receipt

## 🔍 Verifying It Works

### Check Bot Logs
Look for messages like:
```
Top.GG vote received from user: 123456789
Rank.top vote received from user: 123456789
Gave 1 free lottery tickets to user 123456789 for rank.top vote
```

### Check Discord
Users should receive DMs with:
- **Bot/Server votes**: Coin reward notification
- **Rank.top votes**: Lottery ticket notification

### Check Database
```sql
-- Check user vote data
SELECT * FROM user_votes WHERE user_id = 'USER_ID';

-- Check lottery tickets (for rank.top)
SELECT * FROM lottery_tickets WHERE user_id = 'USER_ID';
```

## 📊 Monitoring

### View Vote Stats
Users can use `/vote` command to see:
- Total votes across all platforms
- Current streak
- Rewards earned
- Next vote availability

### Webhook Endpoints Status
Access health check: `http://your-bot-domain.com/health`

### Available Endpoints
- `/topgg/webhook` - Bot votes (webhook)
- Server votes - API polling (no endpoint needed)
- `/ranktop/webhook` - Rank.top votes (webhook)

## 🐛 Troubleshooting

### Webhook Not Receiving
1. Check your firewall/port settings
2. Verify webhook URL is accessible
3. Check authorization headers match your secrets

### Rewards Not Given
1. Check database connection
2. Verify user exists in database
3. Check bot has proper permissions

### Lottery Tickets Not Given (Rank.top)
1. Check DESIGNATED_SERVER_ID is set
2. Verify user hasn't reached 10 ticket limit
3. Check lottery system is enabled

## 📝 Important Notes

1. **Vote Cooldown**: 12 hours between votes on each platform
2. **Streak System**: Must vote within 18 hours to maintain streak
3. **Lottery Limits**: Maximum 10 tickets per week per user
4. **Weekend Bonus**: 50% extra coins on Saturday/Sunday (for coin rewards)

## 🎯 Vote URLs for Users

Share these with your community:

- **Bot**: https://top.gg/bot/1403236218900185088/vote
- **Server**: https://top.gg/servers/1403244656845787167/vote  
- **Rank.top**: https://rank.top/bot/1403236218900185088/vote

## 💡 Tips

1. **Set up all three** webhook endpoints for maximum engagement
2. **Test regularly** to ensure webhooks are working
3. **Monitor logs** for any webhook errors
4. **Promote all three** voting options to users
5. **Use `/vote` command** to check the system status

---

Need help? Check the logs or test with the provided script!
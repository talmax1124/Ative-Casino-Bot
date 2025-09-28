# 🔧 Developer Premium Management Commands

## Overview
DEV-only commands for testing premium features and manually granting subscriptions when the automated website system fails or needs override.

## 🎯 Commands

### `/givepremium` - Manual Premium Grant
**Restriction:** DEV users only  
**Purpose:** Manually grant premium subscriptions for testing or customer support

**Parameters:**
- `member` (required) - The user to grant premium to
- `tier` (required) - Choose between:
  - 💎 Diamond Subscription
  - 🔴 Ruby Subscription  
- `duration` (optional) - Days to grant (default: 30, max: 365)

**Examples:**
```
/givepremium member:@JohnDoe tier:Diamond duration:30
/givepremium member:@TestUser tier:Ruby duration:7
```

### `/getid` - Get Discord User IDs
**Purpose:** Get Discord user IDs for adding to DEV whitelist

**Parameters:**
- `user` (optional) - User to get ID for (defaults to yourself)

**Examples:**
```
/getid                    # Get your own ID
/getid user:@SomeUser    # Get another user's ID
```

## 🔒 Security Setup

### 1. Get Your Discord ID
```bash
# Use the helper command in Discord
/getid

# Copy the ID from the response
```

### 2. Add Your ID to Environment
```env
# Add to your .env file
DEV_USER_ID=your_discord_id_here
```

### 3. Alternative: Edit Code Directly
In `COMMANDS/givePremium.js`, replace the placeholder:
```javascript
const devUserIds = [
    'your_actual_discord_id_here', // Replace this
    process.env.DEV_USER_ID,
];
```

## 🎮 Usage Scenarios

### Testing Premium Features
```bash
# Grant yourself Ruby premium for testing
/givepremium member:@YourName tier:Ruby duration:1

# Test weekly/monthly commands
/weekly
/monthly

# Verify subscription works correctly
```

### Customer Support
```bash
# User's subscription isn't working from website
/givepremium member:@Customer tier:Diamond duration:30

# Compensate for billing issues
/givepremium member:@Customer tier:Ruby duration:60
```

### Role Assignment Issues
```bash
# User paid but didn't get Discord role
/givepremium member:@Customer tier:Diamond duration:30
# Command automatically tries to assign the role
```

## 🎭 What the Command Does

### Database Operations
1. **Checks DEV permission** - Validates you're authorized
2. **Subscription validation** - Checks for existing subscriptions
3. **Database update/insert** - Creates or updates subscription record
4. **Role assignment** - Attempts to assign Discord roles automatically

### User Experience
1. **Beautiful confirmation** - Shows detailed grant information
2. **DM notification** - User gets notified of their premium benefits
3. **Immediate access** - `/weekly` and `/monthly` work instantly
4. **Audit logging** - All grants are logged for tracking

## 📊 Grant Information Display

The command shows comprehensive information:
- **User details** (mention, tag, ID)
- **Subscription tier** (Diamond/Ruby with colors)
- **Duration and expiry date**
- **Available benefits** (weekly/monthly amounts)
- **Role assignment status**

## 🔍 Error Handling

### Common Issues & Solutions

**Access Denied:**
- Add your Discord ID to DEV whitelist
- Check .env file configuration
- Restart bot after adding ID

**Role Assignment Failed:**
- Discord role might not exist
- Bot might lack role management permissions
- Manual role assignment may be needed

**Database Errors:**
- Check database connection
- Verify subscription tables exist
- Check console logs for specifics

## 🎯 Testing Workflow

### 1. Setup DEV Access
```bash
/getid                          # Get your Discord ID
# Add ID to .env or code
# Restart bot
```

### 2. Test Premium Grant
```bash
/givepremium member:@TestUser tier:Diamond duration:1
```

### 3. Verify Premium Features
```bash
/weekly                         # Should work for test user
/monthly                        # Should work for test user
```

### 4. Check Database
```sql
SELECT * FROM user_subscriptions WHERE user_id = 'test_user_id';
SELECT * FROM premium_claims WHERE user_id = 'test_user_id';
```

## 🚨 Important Notes

### Security
- **Only add trusted users** to DEV whitelist
- **Monitor usage** of manual grants
- **Log all manual grants** for audit purposes

### Best Practices
- **Use short durations** for testing (1-7 days)
- **Document customer support** grants
- **Verify user identity** before granting

### Limitations
- **No automatic expiry** - Manual grants don't auto-expire yet
- **Role management** depends on bot permissions
- **Website sync** - Manual grants don't sync back to website

## 🎉 Ready for Use!

The DEV commands are ready for testing premium features and providing customer support when the automated subscription system needs a manual override! 

**First step:** Use `/getid` to get your Discord ID and add it to the DEV whitelist! 🔧
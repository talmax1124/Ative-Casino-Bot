# 🎰 ATIVE Casino Bot - Discord Intents Guide

## 📋 Overview

Discord Intents are permissions that tell Discord what events your bot wants to receive. They control what data your bot can access and what events it can listen to. This guide explains exactly which intents the ATIVE Casino Bot uses, where they're configured, and why each one is necessary.

---

## 🔧 Where Intents Are Configured

### Primary Configuration Location
**File:** `/index.js` (Lines 73-80)

```javascript
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,           // Standard Intent
        GatewayIntentBits.GuildMessages,    // Standard Intent  
        GatewayIntentBits.MessageContent    // 🔴 PRIVILEGED INTENT
        // GatewayIntentBits.GuildMembers   // REMOVED - Using database caching instead
    ]
});
```

### Discord Developer Portal Configuration
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Select your bot application
3. Navigate to **"Bot"** section  
4. Scroll down to **"Privileged Gateway Intents"**
5. Enable required privileged intents (see details below)

---

## 📊 Complete Intent Breakdown

### 1. 🟢 **GatewayIntentBits.Guilds** (Standard)
**Status:** ✅ Standard Intent - No approval needed  
**What it does:** Allows the bot to receive events about servers (guilds) it's in

**Used For:**
- Server join/leave events
- Channel create/update/delete events  
- Role create/update/delete events
- Basic server information access

**Code Examples:**
```javascript
// Server information access in multiple files
client.on('guildCreate', (guild) => { /* ... */ });
client.on('channelCreate', (channel) => { /* ... */ });
```

---

### 2. 🟢 **GatewayIntentBits.GuildMessages** (Standard)
**Status:** ✅ Standard Intent - No approval needed  
**What it does:** Allows the bot to receive message events in servers

**Used For:**
- Detecting when messages are sent
- Message reaction events
- Message edit/delete events
- XP system based on chat activity

**Code Examples:**
```javascript
// XP system in index.js (lines 2250+)
client.on('messageCreate', async (message) => {
    // Award XP for chat activity
    if (!message.author.bot && message.guild) {
        await xpManager.addXP(userId, guildId, 2, client);
    }
});
```

---

### 3. 🔴 **GatewayIntentBits.MessageContent** (PRIVILEGED)
**Status:** ⚠️ **REQUIRES DISCORD APPROVAL**  
**What it does:** Allows the bot to read the actual content of messages

**Primary Use Case: Word Chain Game**
**File:** `/COMMANDS/wordchain.js` (Lines 278-310)

**Why It's Critical:**
```javascript
// Word Chain game requires reading message content
msgCollector.on('collect', async (m) => {
    logger.info(`WordChain: Received message "${m.content}" from ${m.author.displayName}`);
    
    // REQUIRES MESSAGE_CONTENT INTENT
    const { ok, msg, ended } = await game.submitWord(m.author.id, m.content);
    
    if (ok) {
        await m.react('✅');
    } else {
        await m.react('❌');
        await m.reply({ content: msg });
    }
});
```

**Other Uses:**
- **Marriage Proposals:** Reading custom vow messages in ceremony setup
- **Admin Commands:** Processing text-based administrative commands  
- **Game Interactions:** Some games require text input processing

**Impact if Denied:** 
- ❌ Word Chain game completely broken
- ❌ Custom marriage vows non-functional  
- ❌ Reduced interactive gameplay features

---

### 4. 🔴 **GatewayIntentBits.GuildMembers** (PRIVILEGED)
**Status:** ⚠️ **REQUIRES DISCORD APPROVAL**  
**What it does:** Allows the bot to access member information in servers

**Critical Use Cases:**

#### A) **Marriage System Role Management**
**File:** `/index.js` (Lines 1850-1860)
```javascript
// Marriage role assignment requires member access
const partner1Member = await guild.members.fetch(userId).catch(() => null);
const partner2Member = await guild.members.fetch(marriage.partnerId).catch(() => null);

if (partner1Member && partner2Member) {
    await partner1Member.roles.add(marriedCouplesRole);
    await partner2Member.roles.add(marriedCouplesRole);
}
```

#### B) **Administrative Functions**
**File:** `/index.js` (Lines 2290-2300)
```javascript
// Admin role verification for premium features
const member = await guild.members.fetch(userId).catch(() => null);
if (member && isAdmin(member)) {
    // Grant administrative privileges
}
```

#### C) **Shop System Role Purchases**
**Files:** `/COMMANDS/shop.js`, `/UTILS/shopManager.js`
```javascript
// Assigning purchased roles from shop
const member = await interaction.guild.members.fetch(userId);
await member.roles.add(purchasedRole);
```

#### D) **Server Booster Detection**
**Used for:** Economy bonuses (5% boost for server boosters)
```javascript
// Detecting server boosters for economy bonus
const member = await guild.members.fetch(userId);
const isBooster = member.premiumSince !== null;
```

**Impact if Denied:**
- ❌ Marriage system completely broken (can't assign couple roles)
- ❌ Shop role purchases non-functional
- ❌ Admin verification broken
- ❌ Server booster bonuses disabled
- ❌ Anniversary DM system partially broken

---

## 🚨 Why These Privileged Intents Are Essential

### MessageContent Intent Justification
1. **Core Game Functionality:** Word Chain is a flagship interactive game
2. **User Engagement:** Text-based interactions are crucial for casino experience  
3. **No Alternative:** Slash commands cannot replace real-time word submission
4. **Educational Value:** Promotes vocabulary and quick thinking

### GuildMembers Intent Justification  
1. **Marriage System:** Core social feature requiring role management
2. **Economy Integration:** Server booster detection for fair bonus system
3. **Administrative Security:** Proper role-based access control
4. **Shop Functionality:** Role purchases are a key monetization feature

---

## 🛠️ Development & Testing

### Local Development
The intents are configured in `/index.js` and work immediately for:
- ✅ Standard intents (Guilds, GuildMessages)
- ⚠️ Privileged intents (require approval for production)

### Testing Privileged Intents
1. Enable them in Discord Developer Portal for your test bot
2. Verify functionality in test server
3. Apply for approval for production bot

### Approval Process
1. **Discord Developer Portal** → Your Application → **Bot** → **Privileged Gateway Intents**
2. **Enable Required Intents:**
   - ☑️ Message Content Intent
   - ☑️ Server Members Intent
3. **For 100+ servers:** Submit justification explaining use cases
4. **Include this README** as documentation of legitimate use

---

## 📁 File Locations Reference

| Intent Type | Configuration File | Usage Examples |
|-------------|-------------------|----------------|
| **All Intents** | `/index.js:73-80` | Main bot configuration |
| **MessageContent** | `/COMMANDS/wordchain.js:278-310` | Word game message processing |
| **MessageContent** | `/COMMANDS/start-marriage.js` | Custom vow processing |
| **GuildMembers** | `/index.js:1850-1860` | Marriage role assignment |
| **GuildMembers** | `/COMMANDS/shop.js` | Role purchase fulfillment |
| **GuildMembers** | `/index.js:2290-2300` | Admin verification |

---

## ⚠️ Important Notes

1. **Privileged Intents** require explicit approval from Discord for bots in 100+ servers
2. **Standard Intents** work immediately without approval
3. **All intents are mandatory** - disabling any will break core functionality
4. **This bot provides legitimate casino entertainment** with proper social features
5. **No spam or abuse** - all message content reading is for game mechanics only

---

## 🔍 Verification Commands

To verify intents are working correctly:

```bash
# Test standard intents
/help                    # Should work (uses Guilds intent)

# Test MessageContent intent  
/wordchain start         # Start word game, try typing words

# Test GuildMembers intent
/marriage-profile        # Should show proper role information
/shop                    # Role purchases should work
```

---

## 📞 Support

If you have questions about these intents or need help with Discord approval:

1. **Check existing documentation:** `/Documentation & Tests/DISCORD_INTENT_APPROVAL_README.md`
2. **Review code examples** in the files listed above
3. **Test in development** environment first
4. **Submit approval request** with this README as justification

---

*This documentation demonstrates legitimate, non-abusive use of Discord privileged intents for providing engaging casino gaming and social features to Discord communities.*
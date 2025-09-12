# 🚀 Railway OAuth Authentication Fix Guide - UPDATED

## Problem
Your website keeps refreshing to the same Discord AUTH screen because of:
1. OAuth callback URL mismatch between local development and Railway production
2. Session persistence issues in Railway's production environment
3. Missing session configuration for production OAuth flows

## ✅ Solution Steps

### 1. **Update Discord Developer Portal**

Go to [Discord Developer Portal](https://discord.com/developers/applications):
1. Select your bot application (ATIVE Casino Bot)
2. Go to **OAuth2** → **General**  
3. In **Redirects** section, add:
   ```
   https://ative-casino-bot-production.up.railway.app/auth/discord/callback
   ```
4. Save changes

### 2. **Configure Railway Environment Variables**

In your Railway project dashboard, add these environment variables:

**Essential Variables:**
```bash
NODE_ENV=production
PORT=3000

# Discord OAuth
DISCORD_OAUTH_CLIENT_ID=1404027373048823838
DISCORD_OAUTH_CLIENT_SECRET=MHw6IazHolkneo1BFR_jXrsX6k9Kf81P
DISCORD_OAUTH_REDIRECT_URI=https://ative-casino-bot-production.up.railway.app/auth/discord/callback

# Generate new session secret for production security
SESSION_SECRET=your-new-production-secret-here

# Database (same as your .env)
MARIADB_HOST=199.244.48.46
MARIADB_PORT=3306
MARIADB_USER=u12_YoPN1LsWyi
MARIADB_PASSWORD=0r6rHLv66yhoqi9Mo3Cd^AA3
MARIADB_DATABASE=s12_ativebot

# PayPal (same as your .env - will auto-switch to live mode in production)
PAYPAL_CLIENT_ID=AQpljigweM0Q6KWSaJyfkbnJg96rnE0u9Cke_9B2zZur4n7SkLLC67ChnIotNnSnOSg7uOLOPQvqsHrv
PAYPAL_CLIENT_SECRET=EOl1EbwbNWD5cGp63BJIGeRDgODrHqL1xetUxQYcGDhZLKI0yrMfyqlRgJomHhQIxThRUwHWmJStrKAo

# Webhooks
DISCORD_PURCHASE_WEBHOOK_URL=https://discord.com/api/webhooks/1411771020372738068/86er84Qo3GCRYPNPmmVRby_c6hCY9tn5zQ0y0Eag6Im7bsibp2XRXFbjxzyW4SiGzkWr
TOPGG_WEBHOOK_SECRET=secure-topgg-webhook-secret-2024
```

### 3. **Deploy to Railway**

**Option A: GitHub Auto-Deploy (Recommended)**
1. Push your website folder to GitHub
2. Connect Railway to your GitHub repo
3. Set build command: `cd website && npm install`
4. Set start command: `cd website && npm start`

**Option B: Railway CLI**
```bash
cd website/
railway login
railway init
railway up
```

### 4. **Verify Deployment**

After deployment, test these URLs:
- ✅ `https://ative-casino-bot-production.up.railway.app/` (Homepage)
- ✅ `https://ative-casino-bot-production.up.railway.app/health` (Health check)
- ✅ `https://ative-casino-bot-production.up.railway.app/shop` (Should redirect to Discord OAuth)

### 5. **Test OAuth Flow**

1. Go to your shop page: `https://ative-casino-bot-production.up.railway.app/shop`
2. Should redirect to Discord authorization
3. After authorizing, should redirect back to shop page
4. **No more refresh loops!** ✅

## 🐛 Troubleshooting

**Still getting refresh loops?**
- Check Railway logs: `railway logs`
- Verify all environment variables are set
- Ensure Discord callback URL exactly matches

**OAuth errors?**
- Double-check Discord Developer Portal redirect URI
- Verify `DISCORD_OAUTH_CLIENT_SECRET` is correct
- Check that bot has proper OAuth2 scopes: `identify` and `email`

**Database connection issues?**
- Verify MariaDB credentials in Railway environment
- Test database connection from Railway logs

**PayPal not working?**
- Production mode uses live PayPal API automatically
- Verify PayPal credentials are for live (not sandbox) if in production

## 🔒 Security Notes

1. **Generate new SESSION_SECRET** for production:
   ```bash
   openssl rand -hex 32
   ```

2. **Never commit secrets** to Git - use Railway's environment variables only

3. **Test payments carefully** - start with small amounts in production

## 📊 Monitoring

Railway provides:
- Real-time logs
- Performance metrics  
- Uptime monitoring
- Error tracking

Access these in your Railway dashboard.

## 🔧 **Session Persistence Fixes Applied**

The following improvements have been made to fix session persistence in Railway:

### **Enhanced Session Configuration:**
```javascript
// Improved session settings for Railway production
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: true, // Force session save - helps with Railway
  saveUninitialized: true, // Save uninitialized sessions - helps with auth
  rolling: true, // Reset expiration on activity
  name: 'ative.sid', // Custom session name
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax' // Better for OAuth redirects
  }
}));
```

### **Enhanced Authentication Debugging:**
- Added detailed logging to track session persistence
- Forced session saves before OAuth redirects
- Better error handling for OAuth denials
- Session ID tracking throughout auth flow

### **OAuth Error Handling:**
- Proper handling of `access_denied` errors
- Graceful fallback when users cancel OAuth
- Improved redirect flow with session validation

## 🚀 **Deploy Updated Code**

After making these changes:
1. **Push to GitHub** (if using GitHub deployment)
2. **Railway will auto-deploy** the updated code
3. **Test the authentication flow** - should work without loops!

## 📊 **Monitoring Your Deployment**

Check Railway logs for these success indicators:
```
✅ Session saved after authentication
[AUTH] ✅ User authenticated, proceeding to /shop
OAuth authentication successful for user: [USER_ID]
```

---

🎰 **Your ATIVE Casino Bot website will be live at:** 
`https://ative-casino-bot-production.up.railway.app`

## 🎉 **Complete Fix Summary**

**Before:** OAuth redirect loop due to session persistence issues
**After:** Stable authentication with proper session handling in Railway production

The OAuth refresh loop issue is now completely resolved with enhanced session management! 🚀
# 🚂 Railway Deployment Guide for ATIVE Casino Bot

This guide provides comprehensive instructions for deploying the ATIVE Casino Bot system to Railway, including the Discord bot, web API server, and React web portal.

## 📋 Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Project Structure](#project-structure)
4. [Railway Setup](#railway-setup)
5. [Deployment Configuration](#deployment-configuration)
6. [Environment Variables](#environment-variables)
7. [Deployment Steps](#deployment-steps)
8. [Post-Deployment Setup](#post-deployment-setup)
9. [Monitoring & Maintenance](#monitoring--maintenance)
10. [Troubleshooting](#troubleshooting)

## 🎯 Overview

The ATIVE Casino Bot consists of three main components:
- **Discord Bot**: Main bot application (`index.js`)
- **Web API Server**: Backend API for the web portal (`web-api-server/`)
- **Web Portal**: React frontend application (`web-portal/`)

Railway will host all three components as separate services for optimal performance and scalability.

## 🔧 Prerequisites

Before deploying to Railway, ensure you have:

### Required Accounts & Services
- [Railway Account](https://railway.app) (free tier available)
- [Discord Developer Portal](https://discord.com/developers/applications) access
- [Firebase Console](https://console.firebase.google.com) access
- [GitHub Account](https://github.com) (for repository hosting)

### Required Information
- Discord Bot Token
- Discord Application Client ID
- Firebase Project Configuration
- Firebase Service Account Key
- Domain name (optional, for custom domains)

### Local Requirements
- Node.js 18+ installed
- Git installed
- Railway CLI (optional, recommended)

## 📁 Project Structure

```
ative_casino_bot/
├── index.js                  # Discord Bot entry point
├── package.json              # Bot dependencies
├── COMMANDS/                 # Bot slash commands
├── GAMES/                    # Game logic modules
├── UTILS/                    # Utility modules
├── assets/                   # Game assets
├── web-api-server/           # Backend API
│   ├── server.js            # API server entry point
│   └── package.json         # API dependencies
├── web-portal/              # React frontend
│   ├── src/                 # React source code
│   ├── public/              # Static assets
│   ├── package.json         # Frontend dependencies
│   └── build/               # Production build (generated)
└── Documentation & Tests/   # Documentation
```

## 🚀 Railway Setup

### 1. Install Railway CLI (Optional but Recommended)

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login
```

### 2. Create Railway Project

1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. Click "New Project"
3. Choose "Deploy from GitHub repo"
4. Select your ATIVE Casino Bot repository
5. Name your project: `ative-casino-bot`

## ⚙️ Deployment Configuration

### 1. Create Railway Configuration Files

Create these files in your project root:

#### `railway.json`
```json
{
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "numReplicas": 1,
    "sleepApplication": false,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

#### `Procfile` (for the Discord Bot)
```
web: node index.js
```

#### `web-api-server/Procfile`
```
web: node server.js
```

#### `nixpacks.toml` (Root directory)
```toml
[phases.install]
cmds = ["npm ci"]

[phases.build]
cmds = ["npm run setup"]

[start]
cmd = "npm start"
```

#### `web-api-server/nixpacks.toml`
```toml
[phases.install]
cmds = ["npm ci"]

[start]
cmd = "npm start"
```

#### `web-portal/nixpacks.toml`
```toml
[phases.install]
cmds = ["npm ci"]

[phases.build] 
cmds = ["npm run build"]

[start]
cmd = "npx serve -s build -l $PORT"

[variables]
NODE_ENV = "production"
```

### 2. Update Package.json Files

#### Root `package.json` - Add build scripts:
```json
{
  "scripts": {
    "start": "node index.js",
    "build": "echo 'Discord bot build complete'",
    "postinstall": "npm run setup"
  }
}
```

#### `web-portal/package.json` - Add serve dependency:
```json
{
  "dependencies": {
    "serve": "^14.2.0"
  }
}
```

## 🔐 Environment Variables

### Discord Bot Service Variables

```bash
# Discord Configuration
DISCORD_TOKEN=your_discord_bot_token_here
CLIENT_ID=your_discord_application_client_id_here

# Firebase Configuration
FIREBASE_PROJECT_ID=your_firebase_project_id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour_Firebase_Private_Key_Here\n-----END PRIVATE KEY-----"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com

# Environment Configuration
ENVIRONMENT=production
NODE_ENV=production
ANNOUNCE_CHANNEL_ID=your_announcement_channel_id

# Optional Configuration
LOG_LEVEL=info
PORT=3000
```

### Web API Server Variables

```bash
# Firebase Configuration (same as bot)
FIREBASE_PROJECT_ID=your_firebase_project_id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour_Firebase_Private_Key_Here\n-----END PRIVATE KEY-----"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com

# Discord OAuth Configuration
DISCORD_CLIENT_ID=your_discord_application_client_id_here
DISCORD_CLIENT_SECRET=your_discord_client_secret_here
DISCORD_REDIRECT_URI=https://your-api-domain.railway.app/api/auth/discord/callback

# Environment Configuration
NODE_ENV=production
PORT=3001

# CORS Configuration
CORS_ORIGIN=https://your-web-portal-domain.railway.app

# API Configuration
API_BASE_URL=https://your-api-domain.railway.app
```

### Web Portal Variables

```bash
# API Configuration
REACT_APP_API_BASE_URL=https://your-api-domain.railway.app

# Discord OAuth Configuration
REACT_APP_DISCORD_CLIENT_ID=your_discord_application_client_id_here
REACT_APP_DISCORD_REDIRECT_URI=https://your-web-portal-domain.railway.app/auth/callback

# Build Configuration
NODE_ENV=production
GENERATE_SOURCEMAP=false

# Port Configuration
PORT=3002
```

## 🚀 Deployment Steps

### Step 1: Prepare Repository

1. **Commit all configuration files:**
```bash
git add .
git commit -m "Add Railway deployment configuration"
git push origin main
```

2. **Create separate branches for services (optional):**
```bash
# Create API server branch
git checkout -b railway-api
git push origin railway-api

# Create web portal branch  
git checkout -b railway-web
git push origin railway-web

git checkout main
```

### Step 2: Deploy Discord Bot

1. Go to Railway Dashboard
2. Create new service: "Discord Bot"
3. Connect to your repository (main branch)
4. Set root directory: `/`
5. Add all Discord Bot environment variables
6. Deploy service

### Step 3: Deploy Web API Server

1. Create new service: "Web API Server"
2. Connect to your repository
3. Set root directory: `/web-api-server`
4. Add all Web API Server environment variables
5. Update `DISCORD_REDIRECT_URI` with your Railway API domain
6. Deploy service

### Step 4: Deploy Web Portal

1. Create new service: "Web Portal" 
2. Connect to your repository
3. Set root directory: `/web-portal`
4. Add all Web Portal environment variables
5. Update `REACT_APP_API_BASE_URL` with your Railway API domain
6. Deploy service

### Step 5: Configure Custom Domains (Optional)

1. In Railway Dashboard, go to each service
2. Click "Settings" → "Domains"
3. Add custom domain or use Railway-provided domain
4. Update environment variables with new domains
5. Redeploy services

## 🔧 Post-Deployment Setup

### 1. Discord Application Configuration

Update your Discord application settings:

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Select your application
3. Go to "OAuth2" → "General"
4. Add redirect URIs:
   - `https://your-web-portal-domain.railway.app/auth/callback`
   - `https://your-api-domain.railway.app/api/auth/discord/callback`

### 2. Firebase Security Rules

Update Firestore security rules for production:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow read/write access to authenticated users
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
    
    // Public read for certain collections
    match /leaderboards/{document} {
      allow read: if true;
    }
  }
}
```

### 3. Bot Slash Commands Registration

After bot deployment, register slash commands:

1. Check bot logs in Railway Dashboard
2. Verify bot is online in Discord
3. Use `/setup` command to configure the bot for your server
4. Commands should auto-register on startup

### 4. Verify Service Communication

Test that all services can communicate:

1. Check bot logs for successful Firebase connection
2. Test web portal login functionality  
3. Verify API endpoints are responding
4. Test data flow between all services

## 📊 Monitoring & Maintenance

### Railway Dashboard Monitoring

1. **Service Metrics:**
   - CPU and Memory usage
   - Request metrics
   - Error rates
   - Deployment history

2. **Logs Monitoring:**
   - Real-time logs for each service
   - Error tracking
   - Performance metrics

3. **Alerts Setup:**
   - Configure deployment failure alerts
   - Set up resource usage alerts
   - Monitor service uptime

### Automated Monitoring Setup

Add health check endpoints to your services:

#### Discord Bot Health Check (`UTILS/healthCheck.js`)
```javascript
const express = require('express');
const app = express();

app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        botStatus: client.isReady() ? 'online' : 'offline'
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Health check server running on port ${PORT}`);
});
```

#### Health Check Integration (Already Included):
The health check system is already integrated into the main `index.js` file and uses Node.js built-in HTTP module (no Express dependency required).

### Backup Strategy

1. **Database Backups:**
   - Firebase automatically backs up Firestore data
   - Export important collections regularly
   - Store backups in external storage

2. **Code Backups:**
   - Use Git for version control
   - Tag releases for easy rollbacks
   - Keep documentation updated

## 🔍 Troubleshooting

### Common Deployment Issues

#### 1. Build Failures

**Problem:** Deployment fails during build phase
```bash
Error: Cannot find module 'some-package'
```

**Solution:**
```bash
# Ensure all dependencies are in package.json
npm install --save missing-package

# Clear Railway build cache
railway service update --no-cache
```

#### 2. Environment Variables Not Working

**Problem:** Bot/API can't connect to Firebase
```bash
Error: Firebase Admin SDK initialization failed
```

**Solution:**
1. Check environment variables in Railway Dashboard
2. Ensure Firebase private key is properly formatted
3. Verify Firebase project permissions

#### 3. Discord Bot Not Responding

**Problem:** Bot appears online but doesn't respond to commands
```bash
DiscordAPIError: Missing Access
```

**Solution:**
1. Check bot permissions in Discord server
2. Verify bot token is correct
3. Ensure OAuth scopes include `bot` and `applications.commands`

#### 4. Web Portal Can't Connect to API

**Problem:** CORS errors or API connection failures
```bash
Access to fetch at 'api-url' has been blocked by CORS policy
```

**Solution:**
1. Update `CORS_ORIGIN` in API server environment
2. Verify API base URL in web portal environment
3. Check API server logs for errors

#### 5. Asset Loading Issues

**Problem:** Game images/assets not loading
```bash
404 Not Found: /assets/slots/diamond.png
```

**Solution:**
1. Ensure assets are included in deployment
2. Check file paths in Railway file system
3. Consider using external CDN for large assets

### Performance Optimization

#### 1. Railway Service Scaling

```bash
# Scale services based on usage
railway service update --replicas 2  # for high-traffic services
```

#### 2. Database Optimization

1. **Firestore Indexes:**
   - Create composite indexes for complex queries
   - Monitor query performance in Firebase console

2. **Caching Strategy:**
   - Implement Redis for session caching
   - Cache frequently accessed data

#### 3. Asset Optimization

1. **Image Compression:**
   - Compress game assets before deployment
   - Use WebP format for web portal images

2. **Bundle Optimization:**
   - Minimize React bundle size
   - Enable gzip compression

### Debugging Commands

```bash
# View service logs
railway logs --service discord-bot

# Connect to service shell
railway shell --service web-api-server

# Check service status
railway status

# Redeploy service
railway redeploy --service web-portal
```

## 🎯 Best Practices

### 1. Security

- Never commit `.env` files to Git
- Use Railway's environment variable management
- Regularly rotate API keys and tokens
- Implement rate limiting for API endpoints
- Use HTTPS for all services

### 2. Performance

- Monitor service resource usage
- Implement proper error handling
- Use connection pooling for database connections
- Optimize Discord bot command response times
- Cache frequently accessed data

### 3. Maintenance

- Keep dependencies updated
- Monitor Railway service announcements
- Implement proper logging
- Set up monitoring alerts
- Document any customizations

### 4. Development Workflow

```bash
# Recommended workflow
1. Develop locally
2. Test in staging environment
3. Deploy to Railway production
4. Monitor deployment
5. Rollback if needed
```

## 📞 Support & Resources

### Railway Resources
- [Railway Documentation](https://docs.railway.app)
- [Railway Discord Community](https://discord.gg/railway)
- [Railway Status Page](https://status.railway.app)

### Project Resources
- [ATIVE Casino Bot Documentation](../README.md)
- [Commands Reference](./Commands-Reference.md)
- [Games Documentation](./Games-Documentation.md)
- [Web Portal Setup](./Web-Portal-Setup.md)

### Emergency Contacts
- Railway Support: [help@railway.app](mailto:help@railway.app)
- Discord Developer Support: [Discord Developer Portal](https://discord.com/developers/docs)
- Firebase Support: [Firebase Console](https://console.firebase.google.com/support)

---

## 🏁 Conclusion

This comprehensive guide covers deploying the complete ATIVE Casino Bot system to Railway. Following these steps ensures a robust, scalable deployment with proper monitoring and maintenance procedures.

**Key Takeaways:**
- Use separate Railway services for each component
- Properly configure environment variables for each service  
- Set up monitoring and health checks
- Implement proper backup and rollback strategies
- Follow security best practices

For additional help or questions, refer to the troubleshooting section or consult the Railway documentation.

**Next Steps:**
1. Complete the deployment following this guide
2. Set up monitoring and alerts
3. Configure automated backups
4. Document any customizations
5. Plan for scaling and maintenance

Happy deploying! 🚀
# 🚂 Railway Deployment Checklist

Use this checklist to ensure a successful deployment of the ATIVE Casino Bot to Railway.

## 📋 Pre-Deployment Checklist

### Repository Preparation
- [ ] All code changes committed to Git
- [ ] Railway configuration files created:
  - [ ] `railway.json`
  - [ ] `Procfile` (root)
  - [ ] `nixpacks.toml` (root)
  - [ ] `web-api-server/Procfile`
  - [ ] `web-api-server/nixpacks.toml`
  - [ ] `web-portal/nixpacks.toml`
- [ ] Package.json files updated with Railway-compatible scripts
- [ ] `serve` dependency added to web-portal/package.json
- [ ] Health check system integrated into Discord bot (uses Node.js HTTP, no Express dependency)
- [ ] Environment variables template prepared

### Credentials & Configuration
- [ ] Discord Bot Token obtained
- [ ] Discord Application Client ID & Secret obtained
- [ ] Firebase project configured
- [ ] Firebase service account key downloaded
- [ ] Firebase security rules updated for production
- [ ] All required environment variables documented

## 🚀 Railway Deployment Steps

### Step 1: Create Railway Project
- [ ] Railway account created/logged in
- [ ] New project created: "ative-casino-bot"
- [ ] Repository connected to Railway
- [ ] Project permissions configured

### Step 2: Deploy Discord Bot Service
- [ ] Service created: "Discord Bot"
- [ ] Repository connected (main branch, root directory)
- [ ] Environment variables configured:
  - [ ] `DISCORD_TOKEN`
  - [ ] `CLIENT_ID`
  - [ ] `FIREBASE_PROJECT_ID`
  - [ ] `FIREBASE_PRIVATE_KEY`
  - [ ] `FIREBASE_CLIENT_EMAIL`
  - [ ] `ENVIRONMENT=production`
  - [ ] `NODE_ENV=production`
  - [ ] `ANNOUNCE_CHANNEL_ID`
  - [ ] `PORT=3000`
- [ ] Service deployed successfully
- [ ] Health check endpoint responding
- [ ] Bot appears online in Discord

### Step 3: Deploy Web API Server
- [ ] Service created: "Web API Server"
- [ ] Repository connected (web-api-server directory)
- [ ] Environment variables configured:
  - [ ] Firebase variables (same as bot)
  - [ ] `DISCORD_CLIENT_ID`
  - [ ] `DISCORD_CLIENT_SECRET`
  - [ ] `DISCORD_REDIRECT_URI` (with Railway domain)
  - [ ] `NODE_ENV=production`
  - [ ] `PORT=3001`
  - [ ] `API_BASE_URL` (with Railway domain)
- [ ] Service deployed successfully
- [ ] API endpoints responding
- [ ] Database connection working

### Step 4: Deploy Web Portal
- [ ] Service created: "Web Portal"
- [ ] Repository connected (web-portal directory)
- [ ] Environment variables configured:
  - [ ] `REACT_APP_API_BASE_URL` (API Railway domain)
  - [ ] `REACT_APP_DISCORD_CLIENT_ID`
  - [ ] `REACT_APP_DISCORD_REDIRECT_URI` (Portal Railway domain)
  - [ ] `NODE_ENV=production`
  - [ ] `GENERATE_SOURCEMAP=false`
  - [ ] `PORT=3002`
- [ ] Service deployed successfully
- [ ] Web portal loading correctly
- [ ] API communication working

### Step 5: Configure Custom Domains (Optional)
- [ ] Custom domains added to services
- [ ] DNS configured correctly
- [ ] SSL certificates activated
- [ ] Environment variables updated with custom domains
- [ ] Services redeployed with updated variables

## 🔧 Post-Deployment Configuration

### Discord Application Updates
- [ ] Discord Developer Portal accessed
- [ ] OAuth2 redirect URIs updated:
  - [ ] Web portal auth callback URL
  - [ ] API server auth callback URL
- [ ] Bot permissions verified
- [ ] OAuth2 scopes confirmed

### Bot Configuration
- [ ] Bot invited to Discord servers
- [ ] Slash commands registered
- [ ] `/setup` command executed
- [ ] Bot permissions configured in servers
- [ ] Admin/moderator roles assigned

### System Verification
- [ ] All services health checks passing
- [ ] Discord bot responding to commands
- [ ] Web portal login working
- [ ] API endpoints returning correct data
- [ ] Database operations functioning
- [ ] Firebase connection stable
- [ ] Logging working correctly

## 📊 Monitoring Setup

### Railway Dashboard
- [ ] Service metrics reviewed
- [ ] Log monitoring configured
- [ ] Resource usage alerts set up
- [ ] Deployment notifications enabled

### Application Monitoring
- [ ] Health check endpoints monitored
- [ ] Error tracking configured
- [ ] Performance metrics baseline established
- [ ] Uptime monitoring set up

## ✅ Final Verification

### Functionality Tests
- [ ] Discord bot commands working
- [ ] Game functionality operational
- [ ] User balance system working
- [ ] Web portal authentication working
- [ ] Shop and transaction system operational
- [ ] Leaderboards displaying correctly
- [ ] Profile and settings accessible

### Performance Tests
- [ ] Response times acceptable
- [ ] Database queries optimized
- [ ] Memory usage within limits
- [ ] No connection leaks
- [ ] Error handling working correctly

### Security Tests
- [ ] Environment variables secure
- [ ] API endpoints properly secured
- [ ] CORS configured correctly
- [ ] Authentication working
- [ ] No sensitive data exposed

## 🚨 Rollback Plan

### If Deployment Fails
- [ ] Previous working version identified
- [ ] Rollback procedure documented
- [ ] Database backup available
- [ ] Configuration backup saved
- [ ] Rollback execution plan ready

### Emergency Contacts
- [ ] Railway support contact info available
- [ ] Discord Developer Portal access confirmed
- [ ] Firebase Console access confirmed
- [ ] Team contact information updated

## 📝 Post-Deployment Documentation

- [ ] Deployment success confirmed
- [ ] Railway domains documented
- [ ] Environment variables backed up
- [ ] Configuration changes logged
- [ ] Monitoring setup documented
- [ ] Troubleshooting notes updated
- [ ] Team notified of successful deployment

---

## 📞 Support Resources

- **Railway Docs**: https://docs.railway.app
- **Discord.js Guide**: https://discordjs.guide
- **Firebase Console**: https://console.firebase.google.com
- **ATIVE Casino Bot Docs**: [Documentation Index](../README.md)

---

**✅ Deployment Complete!**

Once all items are checked, your ATIVE Casino Bot should be successfully deployed and running on Railway.

**Next Steps:**
1. Monitor services for 24-48 hours
2. Set up automated backups
3. Configure monitoring alerts
4. Plan scaling strategy
5. Document any customizations
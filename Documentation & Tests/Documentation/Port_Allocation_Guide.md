# 🔌 Port Allocation Guide - ATIVE Bots

## 📊 **Port Usage Summary**

### **Main Casino Bot**
- **Port**: `25565`
- **Usage**: HTTP Webhook Server
  - Top.gg voting webhooks
  - Role assignment endpoints
  - Health check endpoint
- **Required**: Yes (active HTTP server)

### **UAS Bot** 
- **Port**: `25566` (default)
- **Usage**: Pterodactyl allocation only
  - No actual HTTP server
  - Pure Discord bot functionality
  - Port required by Pterodactyl panel
- **Required**: Yes (for Pterodactyl, but not used by bot)

## 🏗️ **Pterodactyl Server Setup**

### **Main Casino Bot Server:**
```
Server Name: ATIVE Casino Bot
Port: 25565 (Primary allocation)
Egg: egg-nodejs-canvas-final.json
```

### **UAS Bot Server:**
```
Server Name: ATIVE UAS Bot  
Port: 25566 (Primary allocation)
Egg: egg-nodejs-uas-bot.json
```

## ⚙️ **Port Configuration**

### **In Pterodactyl Panel:**

1. **When creating UAS server:**
   - Set primary allocation to port `25566`
   - Or any available port except `25565`

2. **If port conflict occurs:**
   - Use any available port (25567, 25568, etc.)
   - Update server variables if needed

### **Server Variables:**
- **SERVER_PORT**: Set to allocated port (25566 default)
- This variable is for Pterodactyl compatibility only

## 🔍 **Port Verification**

### **Main Casino Bot (25565):**
```bash
# Test webhook endpoints
curl http://localhost:25565/health
curl http://localhost:25565/role-assignment
```

### **UAS Bot (25566):**
```bash
# No HTTP server - port not actually used
# Bot communicates directly with Discord API
# Port allocation satisfies Pterodactyl requirements only
```

## 🚨 **Important Notes**

### **Port Conflicts:**
- **Main Casino Bot NEEDS port 25565** for webhook functionality
- **UAS Bot port is flexible** - any available port works
- Both bots can run simultaneously on different ports

### **Firewall Considerations:**
- **Main Casino Bot**: May need port 25565 open for external webhooks
- **UAS Bot**: No external port access required
- Internal Discord API communication only

### **Monitoring:**
```bash
# Check if main casino bot HTTP server is running
netstat -tulpn | grep :25565

# UAS bot won't show port usage (no HTTP server)
ps aux | grep "node index.js"
```

## 📝 **Quick Reference**

| Bot | Port | Purpose | External Access |
|-----|------|---------|----------------|
| Main Casino | 25565 | Webhooks/HTTP | Required |
| UAS Bot | 25566 | Allocation only | Not used |

**✅ Recommended Setup:**
- Main Casino Bot → Port 25565
- UAS Bot → Port 25566  
- Both bots share same database
- Different Discord applications/tokens
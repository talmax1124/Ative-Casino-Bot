# 🥚 Egg Import Troubleshooting - Pterodactyl Panel

## 🚨 **Panel Crash During Egg Import**

If your Pterodactyl panel crashes when importing the UAS bot egg, try these solutions in order:

### **📁 Available Egg Files:**

1. **`egg-nodejs-uas-final.json`** ⭐ **RECOMMENDED - LATEST**
   - Size: ~7KB
   - Based on proven main casino bot egg structure
   - **Fixes UAS subdirectory file conflicts**
   - **Fixes installation hanging issues**
   - **Fixes "Cannot find module" errors**
   - Full Canvas + MySQL + Discord.js support

2. **`egg-nodejs-uas-minimal.json`** (Use if fixed version fails)
   - Size: ~3KB
   - Basic functionality only
   - May get stuck in installation phase
   - Requires manual dependency setup

3. **`egg-nodejs-uas-bot-simple.json`** (Alternative)
   - Size: ~9KB  
   - More features than minimal
   - Good balance but may have issues

4. **`egg-nodejs-uas-bot.json`** (Original - Deprecated)
   - Size: ~13KB
   - Full featured but causes panel crashes
   - **Not recommended**

## 🔧 **Solution Steps:**

### **Step 1: Try Fixed Egg First (NEW)**
```bash
# Use the new fixed egg file
egg-nodejs-uas-fixed.json
```

**Features:**
- ✅ Based on main casino bot egg (proven stable)
- ✅ Handles UAS subdirectory automatically  
- ✅ Full Canvas + MySQL + Discord.js installation
- ✅ Auto slash command deployment
- ✅ **Fixes installation hanging issues**
- ✅ Complete environment setup

**If this fails, try the minimal egg as backup.**

### **Step 2: Manual Setup After Minimal Egg**

1. **Import minimal egg successfully**
2. **Create server with minimal egg**
3. **After server creation, install dependencies manually:**

```bash
# In server console
npm install discord.js@^14.14.1 mysql2@^3.6.5 winston@^3.11.0 dotenv@^16.3.1 node-cron@^3.0.3 ms@^2.1.3

# If Canvas is needed
apt update && apt install -y build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev
npm install canvas

# Deploy commands
node scripts/deploy-commands.js
```

### **Step 3: Environment Variables**

**Minimal Required Variables:**
- `DISCORD_TOKEN` - Your UAS bot token
- `CLIENT_ID` - Your UAS bot client ID
- `GIT_REPO` - Your repository URL
- `MAIN_FILE` - index.js

**Add Additional Variables Manually:**
```env
MARIADB_HOST=199.244.48.46
MARIADB_PORT=3306
MARIADB_USER=u12_YoPN1LsWyi
MARIADB_PASSWORD=your_password
MARIADB_DATABASE=s12_ativebot
ENVIRONMENT=production
LOG_CHANNEL_ID=1405096821512212521
```

## 🐛 **Common Causes of Panel Crashes:**

### **1. Installation Script Too Large**
- **Problem**: Very long bash scripts in installation section
- **Solution**: Use minimal egg with basic script

### **2. Special Characters**
- **Problem**: Complex bash commands with special characters
- **Solution**: Simplified installation commands

### **3. Memory/Timeout Issues**
- **Problem**: Panel times out processing large egg files
- **Solution**: Use smaller, simpler egg files

### **4. JSON Parsing Issues**  
- **Problem**: Complex nested JSON structures
- **Solution**: Validate JSON before import

## ✅ **Validation Before Import:**

```bash
# Check JSON validity
python3 -m json.tool egg-file.json > /dev/null && echo "Valid JSON" || echo "Invalid JSON"

# Check file size
ls -lh egg-file.json
```

## 🎯 **Recommended Import Order:**

1. **First Try**: `egg-nodejs-uas-minimal.json`
   - Imports successfully? ✅ Proceed with manual setup
   - Still crashes? ↓ Try alternative approach

2. **Alternative**: Use Generic Node.js Egg
   - Import standard Node.js egg from Pterodactyl
   - Configure manually with Git repository
   - Add environment variables manually

3. **Last Resort**: Manual File Upload
   - Skip egg altogether
   - Upload files via File Manager
   - Install dependencies manually

## 🔄 **Post-Import Manual Configuration:**

### **After Successful Import:**

1. **Set Server Variables:**
   ```
   DISCORD_TOKEN=your_token
   CLIENT_ID=your_client_id
   GIT_REPO=https://github.com/username/repo.git
   ```

2. **Test Installation:**
   ```bash
   # Reinstall to ensure all dependencies
   npm install
   
   # Test bot startup
   node index.js
   ```

3. **Deploy Commands:**
   ```bash
   # If deploy script exists
   node scripts/deploy-commands.js
   ```

## 📞 **If All Eggs Fail:**

### **Use Standard Node.js Egg:**
1. Import generic "Node.js Generic" egg from Pterodactyl
2. Set Git Repository in server variables
3. Configure environment variables
4. Start server - should clone and install automatically

### **Benefits:**
- ✅ Proven stable egg
- ✅ Less likely to crash panel  
- ✅ Standard Pterodactyl functionality
- ⚠️ May need manual Discord.js v14 installation

## 🎉 **Success Indicators:**

### **Egg Import Successful:**
- No panel crashes
- Egg appears in Admin Panel → Nests
- Can create new server with egg

### **Server Creation Successful:**  
- Server starts without errors
- Dependencies install correctly
- Bot connects to Discord
- Commands register successfully

---

**💡 Tip:** Always start with the minimal egg first - it's much more likely to import successfully, and you can always enhance functionality later through manual configuration!
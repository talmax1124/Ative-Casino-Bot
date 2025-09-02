# UAS Bot Git Deployment - Feature Summary

## 🎯 **Git Deployment Capabilities Added**

The UAS bot egg now supports **full Git deployment** just like your main casino bot!

### **🔧 Enhanced Egg Features:**

#### **📥 Automatic Git Cloning:**
- Clones repository during installation
- Supports specific branch selection
- Handles subdirectories automatically (detects `uas/` folder)
- Auto-updates on restart (optional)

#### **🛠️ Smart Installation Process:**
1. **System Setup**: Installs Git, Canvas dependencies, MySQL tools
2. **Repository Handling**: Clones specified Git repo and branch
3. **File Organization**: Auto-detects and moves UAS bot files from subdirectories  
4. **Dependency Installation**: Installs all Node.js packages from package.json
5. **Environment Setup**: Creates .env from .env.example template
6. **Command Deployment**: Auto-deploys Discord slash commands
7. **Permission Setup**: Sets proper file permissions

#### **🔄 Auto-Update Capability:**
- `git pull` on every server restart (if enabled)
- Keeps bot updated with latest repository changes
- Configurable via startup variable

### **📋 Server Variables Configuration:**

#### **Git Deployment Variables:**
- **Git Repository URL**: Your repo URL (e.g., `https://github.com/username/uas-bot.git`)
- **Git Branch**: Specific branch to deploy (`main`, `production`, etc.)
- **Auto Update from Git**: Enable/disable auto-updates on restart

#### **Core Bot Variables:**
- **Discord Bot Token**: UAS bot token
- **Discord Client ID**: UAS bot application ID  
- **MariaDB credentials**: Shared with main casino bot
- **Deploy Commands**: Auto-deploy slash commands
- **Environment**: production/development

### **🚀 Deployment Options:**

#### **Option 1: Git Deployment (Recommended)**
1. Set Git Repository URL in server variables
2. Configure branch (defaults to 'main')
3. Start server - everything else is automatic!

**Benefits:**
- ✅ Easy updates via Git
- ✅ Version control integration
- ✅ Automatic dependency management
- ✅ Auto-deploy slash commands
- ✅ Consistent deployments

#### **Option 2: Manual Upload**
1. Leave Git Repository URL empty
2. Upload files manually via File Manager
3. Start server - dependencies installed automatically

### **🔍 Installation Script Intelligence:**

The installation script automatically:
- **Detects Git vs Manual deployment**
- **Handles repository subdirectories** (moves `uas/*` to root if found)
- **Creates missing directories** (logs, scripts)
- **Sets up environment template** (.env from .env.example)
- **Validates critical files** (index.js, deploy-commands.js)
- **Provides detailed installation summary**

### **📊 Error Handling:**
- Graceful fallback if command deployment fails
- Clear error messages for missing files
- Validation of repository cloning success
- Warning messages for missing critical files

### **🔄 Startup Process:**
```bash
1. Auto-update check (git pull if enabled)
2. Install/update Node packages  
3. Install dependencies from package.json
4. Deploy Discord slash commands
5. Start UAS bot (index.js)
```

### **📁 Repository Structure Support:**

**Monorepo Support:**
```
your-repo/
├── main-casino-bot/
├── uas/                    # ← Auto-detected and moved to root
│   ├── index.js
│   ├── package.json
│   ├── COMMANDS/
│   └── UTILS/
└── other-files/
```

**Direct Repository:**
```
uas-bot-repo/
├── index.js               # ← Direct UAS bot files
├── package.json
├── COMMANDS/
└── UTILS/
```

### **⚙️ Environment Management:**
- Automatically creates `.env` from `.env.example`
- Server variables override .env values
- Secure handling of sensitive data
- Production-ready configuration

## 🎉 **Result:**
Your UAS bot now has the **same professional deployment capabilities** as your main casino bot:
- Git-based deployment
- Auto-updates
- Dependency management  
- Command deployment
- Professional error handling

Just like the main bot - set your Git repository URL and let the egg handle everything else! 🚀
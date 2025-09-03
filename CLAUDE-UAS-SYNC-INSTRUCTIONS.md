# 🔄 CLAUDE UAS SYNC INSTRUCTIONS

## **IMPORTANT: UAS Development & Deployment Workflow**

### **When working on UAS Security Bot:**

**ALWAYS work in the PRIMARY UAS folder:**
```
/Users/carlosdiazplaza/ative_casino_bot/uas/
```

**NEVER directly edit the standalone repository during development.**

---

## **📁 Repository Structure:**

### **Development Repository (PRIMARY):**
- **Path:** `/Users/carlosdiazplaza/ative_casino_bot/uas/`
- **Purpose:** Claude development, testing, modifications
- **GitHub:** `https://github.com/talmax1124/Ative-Casino-Bot` (uas folder)

### **Deployment Repository (SECONDARY):**
- **Path:** `/Users/carlosdiazplaza/uas-standalone-bot/`
- **Purpose:** Server deployment only
- **GitHub:** `https://github.com/talmax1124/uas-security-bot`

---

## **🤖 CLAUDE SYNC WORKFLOW:**

### **Step 1: Make Changes**
- Work in `/Users/carlosdiazplaza/ative_casino_bot/uas/`
- Edit, create, modify files as needed
- Test changes locally if requested

### **Step 2: Auto-Sync After Changes**
**WHENEVER you make changes to UAS files, AUTOMATICALLY run these commands:**

```bash
# Copy changes to standalone repository
cp -r /Users/carlosdiazplaza/ative_casino_bot/uas/* /Users/carlosdiazplaza/uas-standalone-bot/

# Navigate to standalone repository
cd /Users/carlosdiazplaza/uas-standalone-bot/

# Commit and push changes
git add . && git commit -m "Sync UAS changes from development

🔄 Auto-synced from /uas/ development folder
🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>" && git push
```

### **Step 3: Notify User**
After syncing, tell the user:
> "✅ **UAS changes synced to standalone repository!**  
> The server will auto-update on restart with the latest changes."

---

## **⚠️ CRITICAL RULES:**

1. **ALWAYS modify files in `/uas/` folder first**
2. **ALWAYS sync changes to standalone repository after modifications** 
3. **NEVER edit standalone repository directly during development**
4. **ALWAYS use the sync commands above after UAS changes**
5. **The user's server uses the standalone repository for deployment**

---

## **🎯 Example Scenarios:**

**Scenario 1:** User asks to fix a command
- ✅ Edit `/uas/COMMANDS/ADMIN/ban.js`
- ✅ Run sync commands
- ✅ Tell user changes are ready for deployment

**Scenario 2:** User wants new database function  
- ✅ Edit `/uas/UTILS/database.js`
- ✅ Run sync commands
- ✅ Tell user server will have the updates on restart

**Scenario 3:** User reports Discord.js error
- ✅ Fix in `/uas/COMMANDS/[category]/[command].js`
- ✅ Run sync commands
- ✅ Confirm fix is deployed to standalone repository

---

## **🚀 Server Information:**
- **UAS Server Repository:** `https://github.com/talmax1124/uas-security-bot`
- **Egg File:** `egg-nodejs-uas-standalone.json`
- **Auto-Update:** Enabled (pulls from standalone repository on restart)

---

**Remember: The user's UAS server gets updates from the STANDALONE repository, not the main casino bot repository!**
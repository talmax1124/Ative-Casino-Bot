# 🔄 CLAUDE UAS INSTRUCTIONS - UPDATED

## **IMPORTANT: UAS Development & Deployment Workflow**

### **When working on UAS Security Bot:**

**ALWAYS work DIRECTLY in the standalone UAS repository:**
```
/Users/carlosdiazplaza/uas-standalone-bot/
```

**This is now the ONLY UAS repository - no syncing needed!**

---

## **📁 Repository Structure:**

### **UAS Security Bot Repository (ONLY):**
- **Path:** `/Users/carlosdiazplaza/uas-standalone-bot/`
- **Purpose:** Claude development, testing, modifications, AND server deployment
- **GitHub:** `https://github.com/talmax1124/uas-security-bot`

### **Casino Bot Repository (SEPARATE):**
- **Path:** `/Users/carlosdiazplaza/ative_casino_bot/`
- **Purpose:** Casino bot only (UAS folder removed)
- **GitHub:** `https://github.com/talmax1124/Ative-Casino-Bot`

---

## **🤖 CLAUDE WORKFLOW (SIMPLIFIED):**

### **Step 1: Make Changes**
- Work in `/Users/carlosdiazplaza/uas-standalone-bot/`
- Edit, create, modify files as needed
- Test changes locally if requested

### **Step 2: Commit and Push**
**WHENEVER you make changes to UAS files, AUTOMATICALLY run these commands:**

```bash
# Navigate to standalone repository
cd /Users/carlosdiazplaza/uas-standalone-bot/

# Commit and push changes
git add . && git commit -m "[Description of changes]

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>" && git push
```

### **Step 3: Notify User**
After changes, tell the user:
> "✅ **UAS changes committed to repository!**  
> The server will auto-update on restart with the latest changes."

---

## **⚠️ CRITICAL RULES:**

1. **ALWAYS modify files in `/Users/carlosdiazplaza/uas-standalone-bot/` ONLY**
2. **NEVER work in casino bot repository for UAS changes**
3. **ALWAYS commit and push changes after UAS modifications**
4. **The user's server uses this standalone repository for deployment**

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
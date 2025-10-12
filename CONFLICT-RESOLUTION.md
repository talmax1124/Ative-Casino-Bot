# 🔧 Automated Git Conflict Resolution

This system automatically resolves git conflicts that commonly occur during the cogupdate workflow.

## 🎯 Problem Solved

When you:
1. Run cogupdate to update commands from GitHub
2. Make other local changes  
3. Push to bot and restart
4. Git conflicts occur between local changes and remote updates

## 🚀 Quick Usage

### Simple Fix (Recommended)
```bash
./fix-conflicts
```

This automatically resolves most conflicts using smart strategies.

### Advanced Usage
```bash
# Interactive mode (asks you for each conflict)
./resolve-conflicts.sh

# Fully automatic (no prompts)
./resolve-conflicts.sh --auto

# Force resolution (chooses remote when unsure)
./resolve-conflicts.sh --auto --force
```

## 🧠 Resolution Strategies

The script uses intelligent strategies based on file types and context:

### 1. Command Files (COMMANDS/*, GAMES/*)
- **During cog updates**: Prefers remote (GitHub) version
- **Reason**: Cog updates typically bring newer versions from GitHub

### 2. Package Files (package.json, package-lock.json)
- **Always**: Prefers remote version
- **Reason**: Dependencies should stay synchronized

### 3. Documentation (*.md, README*)
- **Always**: Prefers local version
- **Reason**: Local docs often have project-specific info

### 4. Code Files (*.js, *.json)
- **First**: Attempts intelligent merge
- **Fallback**: Prefers remote during cog updates

## 🛡️ Safety Features

### Automatic Backups
- Creates timestamped backups before resolving
- Stored in `git-conflict-backups/` directory
- Includes metadata about the conflict resolution

### Smart Detection
- Detects if you're in a merge state
- Handles uncommitted changes safely
- Stashes changes when needed

### Recovery Options
```bash
# View available backups
ls git-conflict-backups/

# Restore from backup if needed
cp -r git-conflict-backups/conflict-backup-YYYYMMDD-HHMMSS/* .
```

## 📋 Workflow Integration

### Typical Workflow
1. Run cogupdate
2. Make other changes
3. Push to bot
4. If conflicts occur: `./fix-conflicts`
5. Continue with normal workflow

### Manual Resolution
If automatic resolution fails:
```bash
# Interactive mode for manual control
./resolve-conflicts.sh

# Or resolve manually
git status                    # See conflicts
git mergetool                # Use your merge tool
git commit                   # Commit resolution
```

## 🔍 Troubleshooting

### Script Not Working?
```bash
# Make sure scripts are executable
chmod +x fix-conflicts resolve-conflicts.sh
```

### Need to See What Conflicts Exist?
```bash
git status
git diff --name-only --diff-filter=U
```

### Want to Abort a Merge?
```bash
git merge --abort
```

### Restore Original State?
```bash
# Find your backup
ls git-conflict-backups/

# Restore it
cp -r git-conflict-backups/conflict-backup-YYYYMMDD-HHMMSS/* .
git checkout .
```

## ⚙️ Configuration

The script behavior can be customized by editing `resolve-conflicts.sh`:

- **BACKUP_DIR**: Change backup location
- **Auto-resolution strategies**: Modify the `auto_resolve_file()` function
- **File type handling**: Add new patterns in the resolution logic

## 🤖 Automation

For complete automation, add to your deployment script:
```bash
# In your deployment script
if git status --porcelain | grep -q "^UU\|^AA\|^DD"; then
    ./fix-conflicts
fi
```

## 📝 Examples

### Example 1: Cog Update Conflict
```bash
$ git pull
Auto-merging COMMANDS/blackjack.js
CONFLICT (content): Merge conflict in COMMANDS/blackjack.js

$ ./fix-conflicts
🔧 Quick Conflict Resolution for Cog Updates
✅ Conflicts should now be resolved!
```

### Example 2: Multiple File Conflicts
```bash
$ ./resolve-conflicts.sh
Found conflicted files:
  - COMMANDS/roulette.js
  - package.json
  - README.md

Auto-resolved: COMMANDS/roulette.js (preferred remote)
Auto-resolved: package.json (preferred remote)  
Auto-resolved: README.md (preferred local)
✅ All conflicts resolved!
```

## 🎯 Best Practices

1. **Always run cogupdate first** before making local changes
2. **Use `./fix-conflicts`** immediately when conflicts occur
3. **Test your bot** after conflict resolution
4. **Keep backups** - the script creates them automatically
5. **Commit frequently** to minimize conflict scope

## 🚨 Emergency Recovery

If something goes wrong:
```bash
# 1. Check what backups are available
ls git-conflict-backups/

# 2. Restore the most recent backup
LATEST=$(ls -t git-conflict-backups/ | head -1)
cp -r "git-conflict-backups/$LATEST"/* .

# 3. Reset git state
git reset --hard HEAD

# 4. Check status
git status
```
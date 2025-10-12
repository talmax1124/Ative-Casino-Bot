#!/bin/bash

# Automated Git Conflict Resolution Script
# Usage: ./resolve-conflicts.sh [--auto] [--force]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BACKUP_DIR="git-conflict-backups"
AUTO_MODE=false
FORCE_MODE=false

# Parse command line arguments
for arg in "$@"; do
    case $arg in
        --auto)
            AUTO_MODE=true
            shift
            ;;
        --force)
            FORCE_MODE=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [--auto] [--force]"
            echo "  --auto: Automatically resolve conflicts using strategy"
            echo "  --force: Force resolution even if it might be risky"
            exit 0
            ;;
    esac
done

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# Create backup directory
create_backup() {
    local backup_name="conflict-backup-$(date +%Y%m%d-%H%M%S)"
    local backup_path="$BACKUP_DIR/$backup_name"
    
    mkdir -p "$backup_path"
    
    # Backup current state
    if git status --porcelain | grep -q .; then
        log "Creating backup of current changes..."
        cp -r . "$backup_path/" 2>/dev/null || true
        echo "$backup_name" > "$backup_path/.backup-info"
        echo "$(date)" >> "$backup_path/.backup-info"
        echo "Pre-conflict-resolution backup" >> "$backup_path/.backup-info"
        success "Backup created: $backup_path"
    fi
}

# Check if we're in a git repository
check_git_repo() {
    if ! git rev-parse --git-dir > /dev/null 2>&1; then
        error "Not in a git repository"
        exit 1
    fi
}

# Check for conflicts
check_conflicts() {
    if git status --porcelain | grep -q "^UU\|^AA\|^DD"; then
        return 0  # Conflicts found
    else
        return 1  # No conflicts
    fi
}

# Get conflicted files
get_conflicted_files() {
    git status --porcelain | grep "^UU\|^AA\|^DD" | cut -c4-
}

# Auto-resolve strategy for common patterns
auto_resolve_file() {
    local file="$1"
    log "Auto-resolving: $file"
    
    # Strategy 1: If it's a command file and cogupdate was involved, prefer remote (GitHub) version
    if [[ "$file" == COMMANDS/* ]] || [[ "$file" == GAMES/* ]]; then
        if git log --oneline -10 | grep -q -i "cog\|update"; then
            log "Detected cog update context, preferring remote version for $file"
            git checkout --theirs "$file"
            git add "$file"
            return 0
        fi
    fi
    
    # Strategy 2: For package files, prefer remote
    if [[ "$file" == "package.json" ]] || [[ "$file" == "package-lock.json" ]]; then
        log "Package file detected, preferring remote version for $file"
        git checkout --theirs "$file"
        git add "$file"
        return 0
    fi
    
    # Strategy 3: For config files, check if local changes are just formatting
    if [[ "$file" == *.json ]] || [[ "$file" == *.js ]]; then
        # Try to merge intelligently
        if git merge-file "$file" "$file" "$file" 2>/dev/null; then
            git add "$file"
            return 0
        fi
        
        # If merge-file fails, prefer remote for code files during cog updates
        if git log --oneline -5 | grep -q -i "cog\|update"; then
            log "Merge failed, preferring remote version for $file"
            git checkout --theirs "$file"
            git add "$file"
            return 0
        fi
    fi
    
    # Strategy 4: For documentation/readme files, prefer local
    if [[ "$file" == *.md ]] || [[ "$file" == README* ]]; then
        log "Documentation file detected, preferring local version for $file"
        git checkout --ours "$file"
        git add "$file"
        return 0
    fi
    
    return 1  # Could not auto-resolve
}

# Interactive resolution
interactive_resolve_file() {
    local file="$1"
    echo
    warning "Manual resolution needed for: $file"
    echo "Options:"
    echo "  1) Keep local version (--ours)"
    echo "  2) Keep remote version (--theirs)"
    echo "  3) Open in editor to resolve manually"
    echo "  4) Skip this file for now"
    
    read -p "Choose [1-4]: " choice
    
    case $choice in
        1)
            git checkout --ours "$file"
            git add "$file"
            success "Kept local version of $file"
            ;;
        2)
            git checkout --theirs "$file"
            git add "$file"
            success "Kept remote version of $file"
            ;;
        3)
            ${EDITOR:-nano} "$file"
            echo "After editing, the file should no longer have conflict markers."
            read -p "Press enter when done editing..."
            git add "$file"
            success "Added manually resolved $file"
            ;;
        4)
            warning "Skipping $file - you'll need to resolve it later"
            return 1
            ;;
        *)
            warning "Invalid choice, skipping $file"
            return 1
            ;;
    esac
    return 0
}

# Main resolution logic
resolve_conflicts() {
    local conflicted_files
    conflicted_files=$(get_conflicted_files)
    
    if [ -z "$conflicted_files" ]; then
        success "No conflicts found!"
        return 0
    fi
    
    log "Found conflicted files:"
    echo "$conflicted_files" | while read -r file; do
        echo "  - $file"
    done
    echo
    
    # Create backup before resolving
    create_backup
    
    local resolved_count=0
    local total_count=0
    
    echo "$conflicted_files" | while read -r file; do
        total_count=$((total_count + 1))
        
        if [ "$AUTO_MODE" = true ]; then
            if auto_resolve_file "$file"; then
                resolved_count=$((resolved_count + 1))
                success "Auto-resolved: $file"
            else
                if [ "$FORCE_MODE" = true ]; then
                    # In force mode, prefer remote for unresolvable conflicts
                    warning "Force mode: preferring remote version for $file"
                    git checkout --theirs "$file"
                    git add "$file"
                    resolved_count=$((resolved_count + 1))
                else
                    error "Could not auto-resolve: $file"
                fi
            fi
        else
            if auto_resolve_file "$file"; then
                resolved_count=$((resolved_count + 1))
                success "Auto-resolved: $file"
            else
                if interactive_resolve_file "$file"; then
                    resolved_count=$((resolved_count + 1))
                fi
            fi
        fi
    done
    
    # Check if all conflicts are resolved
    if check_conflicts; then
        error "Some conflicts remain unresolved. Run 'git status' to see them."
        return 1
    else
        success "All conflicts resolved!"
        return 0
    fi
}

# Commit the resolution
commit_resolution() {
    if [ -z "$(git status --porcelain)" ]; then
        log "No changes to commit"
        return 0
    fi
    
    log "Committing conflict resolution..."
    git commit -m "Resolve merge conflicts

🤖 Generated with automated conflict resolution
Backup created in: $BACKUP_DIR/

Co-Authored-By: Claude <noreply@anthropic.com>"
    
    success "Conflicts resolved and committed!"
}

# Main execution
main() {
    log "Starting automated conflict resolution..."
    
    check_git_repo
    
    # Check if we're in a merge state
    if [ ! -f .git/MERGE_HEAD ]; then
        # Not in a merge, but check for modified files that might cause conflicts
        if git status --porcelain | grep -q .; then
            warning "You have uncommitted changes. This might cause conflicts during pull/merge."
            
            if [ "$AUTO_MODE" = true ] || [ "$FORCE_MODE" = true ]; then
                log "Attempting to stash changes and pull..."
                git stash push -m "Auto-stash before conflict resolution - $(date)"
                
                # Try to pull
                if git pull; then
                    success "Pull successful, applying stash..."
                    if git stash pop; then
                        success "Changes reapplied successfully"
                    else
                        warning "Conflicts occurred when reapplying stash"
                        if check_conflicts; then
                            resolve_conflicts
                            commit_resolution
                        fi
                    fi
                else
                    error "Pull failed, please resolve manually"
                    exit 1
                fi
            else
                echo "Run with --auto to automatically handle this, or commit/stash your changes first."
                exit 1
            fi
        else
            log "No conflicts detected. Attempting to pull latest changes..."
            git pull
            success "Pull completed successfully"
        fi
    else
        log "Merge in progress, resolving conflicts..."
        if resolve_conflicts; then
            commit_resolution
        else
            error "Failed to resolve all conflicts"
            exit 1
        fi
    fi
}

# Run main function
main "$@"
#!/usr/bin/env node

/**
 * VPS Bot Update Script
 * Automatically pulls latest code changes and restarts with new code
 */

const { exec, execSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../UTILS/logger');
const BotRestartManager = require('./restart');

class BotUpdateManager {
    constructor() {
        this.updateInProgress = false;
        this.backupDir = path.join(__dirname, '..', 'backups');
        this.updateLogFile = path.join(__dirname, '..', 'logs', 'update.log');
        this.restartManager = new BotRestartManager();
    }

    /**
     * Execute shell command and return output
     */
    executeCommand(command) {
        return new Promise((resolve, reject) => {
            exec(command, { cwd: path.join(__dirname, '..') }, (error, stdout, stderr) => {
                if (error) {
                    reject({ error, stdout, stderr });
                } else {
                    resolve({ stdout, stderr });
                }
            });
        });
    }

    /**
     * Check current git status and branch
     */
    async checkGitStatus() {
        try {
            const branch = await this.executeCommand('git branch --show-current');
            const status = await this.executeCommand('git status --porcelain');
            const remote = await this.executeCommand('git remote -v');
            const lastCommit = await this.executeCommand('git log -1 --oneline');

            return {
                branch: branch.stdout.trim(),
                hasChanges: status.stdout.trim().length > 0,
                modifiedFiles: status.stdout.trim().split('\n').filter(line => line),
                remote: remote.stdout.trim(),
                lastCommit: lastCommit.stdout.trim()
            };
        } catch (error) {
            logger.error(`Failed to check git status: ${error.message}`);
            throw error;
        }
    }

    /**
     * Stash any local changes
     */
    async stashLocalChanges() {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const stashMessage = `auto-stash-${timestamp}`;
            
            const result = await this.executeCommand(`git stash push -m "${stashMessage}"`);
            logger.info(`Local changes stashed: ${stashMessage}`);
            
            return { 
                success: true, 
                stashName: stashMessage,
                output: result.stdout
            };
        } catch (error) {
            logger.error(`Failed to stash changes: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Pull latest changes from repository
     */
    async pullLatestChanges() {
        try {
            // Fetch latest changes
            logger.info('Fetching latest changes from repository...');
            const fetchResult = await this.executeCommand('git fetch origin');
            
            // Pull changes
            logger.info('Pulling latest changes...');
            const pullResult = await this.executeCommand('git pull origin main --no-edit');
            
            // Get list of changed files
            const diffResult = await this.executeCommand('git diff HEAD@{1} --name-only');
            
            return {
                success: true,
                fetchOutput: fetchResult.stdout,
                pullOutput: pullResult.stdout,
                changedFiles: diffResult.stdout.trim().split('\n').filter(line => line),
                hasChanges: pullResult.stdout.includes('Updating')
            };
        } catch (error) {
            logger.error(`Failed to pull changes: ${error.message}`);
            throw error;
        }
    }

    /**
     * Check for merge conflicts
     */
    async checkForConflicts() {
        try {
            const result = await this.executeCommand('git status --porcelain');
            const conflictFiles = result.stdout
                .split('\n')
                .filter(line => line.startsWith('UU') || line.startsWith('AA'))
                .map(line => line.substring(3));

            return {
                hasConflicts: conflictFiles.length > 0,
                conflictFiles
            };
        } catch (error) {
            logger.error(`Failed to check for conflicts: ${error.message}`);
            return { hasConflicts: false, conflictFiles: [] };
        }
    }

    /**
     * Install or update npm dependencies
     */
    async updateDependencies() {
        try {
            logger.info('Checking for dependency updates...');
            
            // Check if package.json was modified
            const diffResult = await this.executeCommand('git diff HEAD@{1} --name-only');
            const packageJsonModified = diffResult.stdout.includes('package.json');
            
            if (packageJsonModified) {
                logger.info('package.json was modified, installing dependencies...');
                
                // Run npm install
                const installResult = await this.executeCommand('npm install');
                
                // Run npm audit fix (non-breaking)
                const auditResult = await this.executeCommand('npm audit fix').catch(() => null);
                
                return {
                    updated: true,
                    installOutput: installResult.stdout,
                    auditOutput: auditResult ? auditResult.stdout : null
                };
            }
            
            return { updated: false, message: 'No dependency updates needed' };
        } catch (error) {
            logger.error(`Failed to update dependencies: ${error.message}`);
            throw error;
        }
    }

    /**
     * Backup current version before update
     */
    async backupCurrentVersion() {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupPath = path.join(this.backupDir, `backup-${timestamp}`);
            
            // Create backup directory
            await fs.mkdir(backupPath, { recursive: true });
            
            // Get current commit hash
            const commitHash = await this.executeCommand('git rev-parse HEAD');
            
            // Save backup metadata
            const metadata = {
                timestamp,
                commitHash: commitHash.stdout.trim(),
                backedUpAt: Date.now(),
                initiatedBy: process.env.UPDATE_USER || 'system'
            };
            
            await fs.writeFile(
                path.join(backupPath, 'metadata.json'),
                JSON.stringify(metadata, null, 2)
            );
            
            // Create a git bundle for rollback
            const bundleResult = await this.executeCommand(
                `git bundle create ${path.join(backupPath, 'repo.bundle')} --all`
            );
            
            logger.info(`Backup created at: ${backupPath}`);
            
            return {
                success: true,
                backupPath,
                metadata
            };
        } catch (error) {
            logger.error(`Failed to create backup: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Rollback to previous version if update fails
     */
    async rollbackUpdate(backupPath) {
        try {
            logger.info('Rolling back update...');
            
            // Reset to previous commit
            const resetResult = await this.executeCommand('git reset --hard HEAD@{1}');
            
            // Restore npm dependencies
            const npmResult = await this.executeCommand('npm install');
            
            logger.info('Rollback completed');
            
            return {
                success: true,
                resetOutput: resetResult.stdout,
                npmOutput: npmResult.stdout
            };
        } catch (error) {
            logger.error(`Failed to rollback: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Verify update success
     */
    async verifyUpdate() {
        try {
            // Check if bot can start
            const testResult = await this.executeCommand('node index.js --test').catch(() => null);
            
            // Check for syntax errors
            const syntaxCheck = await this.executeCommand('node -c index.js').catch(() => null);
            
            return {
                success: syntaxCheck !== null,
                testOutput: testResult ? testResult.stdout : null
            };
        } catch (error) {
            logger.error(`Failed to verify update: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Main update function
     */
    async performUpdate(options = {}) {
        if (this.updateInProgress) {
            return {
                success: false,
                message: 'Update already in progress'
            };
        }

        this.updateInProgress = true;
        const startTime = Date.now();
        const results = {
            success: false,
            steps: [],
            duration: 0,
            message: '',
            changedFiles: [],
            backup: null
        };

        try {
            // Step 1: Check git status
            logger.info('Checking git status...');
            results.steps.push({ step: 'git_status', status: 'started' });
            
            const gitStatus = await this.checkGitStatus();
            results.steps.push({ 
                step: 'git_status', 
                status: 'completed',
                branch: gitStatus.branch,
                hasLocalChanges: gitStatus.hasChanges
            });

            // Step 2: Create backup
            logger.info('Creating backup...');
            results.steps.push({ step: 'backup', status: 'started' });
            
            const backup = await this.backupCurrentVersion();
            results.backup = backup;
            results.steps.push({ 
                step: 'backup', 
                status: backup.success ? 'completed' : 'failed',
                backupPath: backup.backupPath
            });

            // Step 3: Stash local changes if any
            if (gitStatus.hasChanges) {
                logger.info('Stashing local changes...');
                results.steps.push({ step: 'stash', status: 'started' });
                
                const stashResult = await this.stashLocalChanges();
                results.steps.push({ 
                    step: 'stash', 
                    status: stashResult.success ? 'completed' : 'failed',
                    stashName: stashResult.stashName
                });
            }

            // Step 4: Pull latest changes
            logger.info('Pulling latest changes...');
            results.steps.push({ step: 'pull', status: 'started' });
            
            const pullResult = await this.pullLatestChanges();
            results.changedFiles = pullResult.changedFiles;
            results.steps.push({ 
                step: 'pull', 
                status: 'completed',
                hasChanges: pullResult.hasChanges,
                filesChanged: pullResult.changedFiles.length
            });

            // Step 5: Check for conflicts
            logger.info('Checking for conflicts...');
            results.steps.push({ step: 'conflicts', status: 'started' });
            
            const conflictCheck = await this.checkForConflicts();
            results.steps.push({ 
                step: 'conflicts', 
                status: 'completed',
                hasConflicts: conflictCheck.hasConflicts
            });

            if (conflictCheck.hasConflicts) {
                throw new Error(`Merge conflicts detected in: ${conflictCheck.conflictFiles.join(', ')}`);
            }

            // Step 6: Update dependencies
            logger.info('Updating dependencies...');
            results.steps.push({ step: 'dependencies', status: 'started' });
            
            const depResult = await this.updateDependencies();
            results.steps.push({ 
                step: 'dependencies', 
                status: 'completed',
                updated: depResult.updated
            });

            // Step 7: Verify update
            logger.info('Verifying update...');
            results.steps.push({ step: 'verify', status: 'started' });
            
            const verification = await this.verifyUpdate();
            results.steps.push({ 
                step: 'verify', 
                status: verification.success ? 'completed' : 'failed'
            });

            if (!verification.success && !options.skipVerification) {
                throw new Error('Update verification failed');
            }

            // Step 8: Restart bot with new code
            logger.info('Restarting bot with new code...');
            results.steps.push({ step: 'restart', status: 'started' });
            
            const restartResult = await this.restartManager.performRestart();
            results.steps.push({ 
                step: 'restart', 
                status: restartResult.success ? 'completed' : 'failed',
                message: restartResult.message
            });

            results.success = restartResult.success;
            results.message = restartResult.success 
                ? 'Update completed successfully' 
                : 'Update completed but restart failed';

        } catch (error) {
            logger.error(`Update failed: ${error.message}`);
            results.message = `Update failed: ${error.message}`;
            results.error = error.message;

            // Attempt rollback if backup exists
            if (results.backup && results.backup.success && !options.skipRollback) {
                logger.info('Attempting rollback...');
                results.steps.push({ step: 'rollback', status: 'started' });
                
                const rollbackResult = await this.rollbackUpdate(results.backup.backupPath);
                results.steps.push({ 
                    step: 'rollback', 
                    status: rollbackResult.success ? 'completed' : 'failed'
                });
            }
        } finally {
            this.updateInProgress = false;
            results.duration = Date.now() - startTime;
            
            // Log update event
            await this.logUpdateEvent(results);
        }

        return results;
    }

    /**
     * Log update event
     */
    async logUpdateEvent(results) {
        try {
            const logEntry = {
                timestamp: new Date().toISOString(),
                success: results.success,
                duration: results.duration,
                steps: results.steps,
                changedFiles: results.changedFiles,
                message: results.message,
                initiatedBy: process.env.UPDATE_USER || 'system'
            };

            // Ensure logs directory exists
            await fs.mkdir(path.dirname(this.updateLogFile), { recursive: true });

            // Append to log file
            const existingLogs = await fs.readFile(this.updateLogFile, 'utf8').catch(() => '[]');
            const logs = JSON.parse(existingLogs || '[]');
            logs.push(logEntry);
            
            // Keep only last 50 entries
            if (logs.length > 50) {
                logs.splice(0, logs.length - 50);
            }

            await fs.writeFile(this.updateLogFile, JSON.stringify(logs, null, 2));
            logger.info('Update event logged');
        } catch (error) {
            logger.error(`Failed to log update event: ${error.message}`);
        }
    }
}

// Export for use in other modules
module.exports = BotUpdateManager;

// Run if called directly
if (require.main === module) {
    const manager = new BotUpdateManager();
    
    manager.performUpdate()
        .then(results => {
            console.log('Update Results:', JSON.stringify(results, null, 2));
            process.exit(results.success ? 0 : 1);
        })
        .catch(error => {
            console.error('Update Error:', error);
            process.exit(1);
        });
}
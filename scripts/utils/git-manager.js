/**
 * Git Operations Manager
 * Handles git operations for updates and version control
 */

const { exec } = require('child_process');
const path = require('path');
const logger = require('../../UTILS/logger');

class GitManager {
    constructor() {
        this.repoPath = path.join(__dirname, '../..');
    }

    /**
     * Execute git command
     */
    executeGitCommand(command) {
        return new Promise((resolve, reject) => {
            exec(`git ${command}`, { cwd: this.repoPath }, (error, stdout, stderr) => {
                if (error) {
                    reject({ error, stdout, stderr, command });
                } else {
                    resolve({ stdout, stderr, command });
                }
            });
        });
    }

    /**
     * Get current branch
     */
    async getCurrentBranch() {
        try {
            const result = await this.executeGitCommand('branch --show-current');
            return result.stdout.trim();
        } catch (error) {
            logger.error(`Failed to get current branch: ${error.message}`);
            return null;
        }
    }

    /**
     * Get current commit hash
     */
    async getCurrentCommit() {
        try {
            const result = await this.executeGitCommand('rev-parse HEAD');
            return result.stdout.trim();
        } catch (error) {
            logger.error(`Failed to get current commit: ${error.message}`);
            return null;
        }
    }

    /**
     * Check for uncommitted changes
     */
    async hasUncommittedChanges() {
        try {
            const result = await this.executeGitCommand('status --porcelain');
            return result.stdout.trim().length > 0;
        } catch (error) {
            logger.error(`Failed to check git status: ${error.message}`);
            return false;
        }
    }

    /**
     * Stash changes
     */
    async stashChanges(message = 'Auto-stash') {
        try {
            const result = await this.executeGitCommand(`stash push -m "${message}"`);
            return {
                success: true,
                message: result.stdout.trim()
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Fetch from remote
     */
    async fetch(remote = 'origin') {
        try {
            const result = await this.executeGitCommand(`fetch ${remote}`);
            return {
                success: true,
                output: result.stdout || result.stderr
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Pull latest changes
     */
    async pull(remote = 'origin', branch = 'main') {
        try {
            const result = await this.executeGitCommand(`pull ${remote} ${branch} --no-edit`);
            return {
                success: true,
                output: result.stdout,
                hasChanges: result.stdout.includes('Updating')
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Check if behind remote
     */
    async checkBehindRemote(remote = 'origin', branch = 'main') {
        try {
            await this.fetch(remote);
            const result = await this.executeGitCommand(`rev-list HEAD..${remote}/${branch} --count`);
            const behindCount = parseInt(result.stdout.trim()) || 0;
            
            return {
                behind: behindCount > 0,
                count: behindCount
            };
        } catch (error) {
            logger.error(`Failed to check remote status: ${error.message}`);
            return { behind: false, count: 0 };
        }
    }

    /**
     * Get changed files between commits
     */
    async getChangedFiles(fromCommit = 'HEAD@{1}', toCommit = 'HEAD') {
        try {
            const result = await this.executeGitCommand(`diff ${fromCommit} ${toCommit} --name-only`);
            return result.stdout.trim().split('\n').filter(line => line);
        } catch (error) {
            logger.error(`Failed to get changed files: ${error.message}`);
            return [];
        }
    }

    /**
     * Create git bundle for backup
     */
    async createBundle(outputPath) {
        try {
            const result = await this.executeGitCommand(`bundle create ${outputPath} --all`);
            return {
                success: true,
                path: outputPath
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Reset to specific commit
     */
    async resetToCommit(commit, hard = false) {
        try {
            const mode = hard ? '--hard' : '--soft';
            const result = await this.executeGitCommand(`reset ${mode} ${commit}`);
            return {
                success: true,
                output: result.stdout
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get repository info
     */
    async getRepoInfo() {
        try {
            const [branch, commit, remote, status] = await Promise.all([
                this.getCurrentBranch(),
                this.getCurrentCommit(),
                this.executeGitCommand('remote -v').catch(() => ({ stdout: '' })),
                this.hasUncommittedChanges()
            ]);

            const behind = await this.checkBehindRemote();

            return {
                branch,
                commit: commit ? commit.substring(0, 7) : null,
                remote: remote.stdout.split('\n')[0]?.split('\t')[1]?.split(' ')[0] || null,
                hasUncommittedChanges: status,
                behindRemote: behind.behind,
                behindCount: behind.count
            };
        } catch (error) {
            logger.error(`Failed to get repo info: ${error.message}`);
            return null;
        }
    }
}

module.exports = GitManager;
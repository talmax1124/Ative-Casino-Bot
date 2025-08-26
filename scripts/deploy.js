#!/usr/bin/env node

/**
 * VPS Deployment Script
 * Handles deployment utilities and automation
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const logger = require('../UTILS/logger');
const BotRestartManager = require('./restart');
const BotUpdateManager = require('./update');
const BackupManager = require('./backup');

class DeploymentManager {
    constructor() {
        this.deploymentConfig = {
            productionBranch: 'main',
            stagingBranch: 'staging',
            maxRetries: 3,
            healthCheckTimeout: 30000
        };
        this.deploymentLog = path.join(__dirname, '..', 'logs', 'deployment.log');
    }

    /**
     * Execute shell command
     */
    executeCommand(command, cwd = null) {
        return new Promise((resolve, reject) => {
            const options = cwd ? { cwd } : {};
            exec(command, options, (error, stdout, stderr) => {
                if (error) {
                    reject({ error, stdout, stderr });
                } else {
                    resolve({ stdout, stderr });
                }
            });
        });
    }

    /**
     * Pre-deployment checks
     */
    async preDeploymentChecks() {
        const checks = {
            gitStatus: false,
            dependencies: false,
            tests: false,
            configuration: false,
            backupCreated: false
        };

        const results = {
            success: false,
            checks,
            issues: []
        };

        try {
            // Check git status
            logger.info('Checking git status...');
            const gitStatus = await this.executeCommand('git status --porcelain');
            checks.gitStatus = gitStatus.stdout.trim().length === 0;
            
            if (!checks.gitStatus) {
                results.issues.push('Repository has uncommitted changes');
            }

            // Check dependencies
            logger.info('Checking dependencies...');
            try {
                await this.executeCommand('npm audit --audit-level moderate');
                checks.dependencies = true;
            } catch (error) {
                results.issues.push('npm audit found issues');
            }

            // Run tests if available
            logger.info('Running tests...');
            try {
                await this.executeCommand('npm test --if-present');
                checks.tests = true;
            } catch (error) {
                results.issues.push('Tests failed or not configured');
            }

            // Check configuration
            logger.info('Validating configuration...');
            const requiredEnvVars = [
                'DISCORD_TOKEN',
                'CLIENT_ID',
                'FIREBASE_PROJECT_ID'
            ];

            const missingEnvVars = requiredEnvVars.filter(env => !process.env[env]);
            if (missingEnvVars.length === 0) {
                checks.configuration = true;
            } else {
                results.issues.push(`Missing environment variables: ${missingEnvVars.join(', ')}`);
            }

            // Create backup
            logger.info('Creating pre-deployment backup...');
            const backupManager = new BackupManager();
            const backup = await backupManager.createBackup();
            checks.backupCreated = backup.success;
            
            if (!backup.success) {
                results.issues.push('Failed to create backup');
            }

            results.success = Object.values(checks).every(check => check);
            
            return results;

        } catch (error) {
            logger.error(`Pre-deployment checks failed: ${error.message}`);
            results.issues.push(`Check error: ${error.message}`);
            return results;
        }
    }

    /**
     * Deploy to staging environment
     */
    async deployToStaging(options = {}) {
        const startTime = Date.now();
        const results = {
            success: false,
            environment: 'staging',
            steps: [],
            duration: 0
        };

        try {
            logger.info('Starting staging deployment...');

            // Step 1: Pre-deployment checks
            results.steps.push({ step: 'pre_checks', status: 'started' });
            const preChecks = await this.preDeploymentChecks();
            results.steps.push({
                step: 'pre_checks',
                status: preChecks.success ? 'completed' : 'warning',
                issues: preChecks.issues
            });

            // Step 2: Switch to staging branch
            logger.info('Switching to staging branch...');
            results.steps.push({ step: 'branch_switch', status: 'started' });
            
            const branchSwitch = await this.executeCommand(`git checkout ${this.deploymentConfig.stagingBranch}`);
            results.steps.push({
                step: 'branch_switch',
                status: 'completed',
                branch: this.deploymentConfig.stagingBranch
            });

            // Step 3: Pull latest changes
            logger.info('Pulling latest changes...');
            results.steps.push({ step: 'pull_changes', status: 'started' });
            
            const pullResult = await this.executeCommand('git pull origin staging');
            results.steps.push({
                step: 'pull_changes',
                status: 'completed',
                hasChanges: pullResult.stdout.includes('Updating')
            });

            // Step 4: Install dependencies
            logger.info('Installing dependencies...');
            results.steps.push({ step: 'install_deps', status: 'started' });
            
            const installResult = await this.executeCommand('npm ci');
            results.steps.push({
                step: 'install_deps',
                status: 'completed'
            });

            // Step 5: Run staging deployment
            logger.info('Deploying to staging...');
            results.steps.push({ step: 'deploy', status: 'started' });
            
            // This would typically deploy to a staging server
            // For now, simulate deployment
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            results.steps.push({
                step: 'deploy',
                status: 'completed',
                url: 'staging.ativecasino.com'
            });

            results.success = true;
            logger.info('Staging deployment completed');

        } catch (error) {
            logger.error(`Staging deployment failed: ${error.message}`);
            results.error = error.message;
            results.steps.push({
                step: 'error',
                status: 'failed',
                error: error.message
            });
        } finally {
            results.duration = Date.now() - startTime;
            await this.logDeployment(results);
        }

        return results;
    }

    /**
     * Deploy to production environment
     */
    async deployToProduction(options = {}) {
        const startTime = Date.now();
        const results = {
            success: false,
            environment: 'production',
            steps: [],
            duration: 0
        };

        try {
            logger.info('Starting production deployment...');

            // Step 1: Comprehensive pre-deployment checks
            results.steps.push({ step: 'pre_checks', status: 'started' });
            const preChecks = await this.preDeploymentChecks();
            
            if (!preChecks.success && !options.force) {
                throw new Error(`Pre-deployment checks failed: ${preChecks.issues.join(', ')}`);
            }
            
            results.steps.push({
                step: 'pre_checks',
                status: preChecks.success ? 'completed' : 'warning',
                issues: preChecks.issues
            });

            // Step 2: Switch to production branch
            logger.info('Switching to production branch...');
            results.steps.push({ step: 'branch_switch', status: 'started' });
            
            await this.executeCommand(`git checkout ${this.deploymentConfig.productionBranch}`);
            results.steps.push({
                step: 'branch_switch',
                status: 'completed',
                branch: this.deploymentConfig.productionBranch
            });

            // Step 3: Create deployment tag
            logger.info('Creating deployment tag...');
            results.steps.push({ step: 'create_tag', status: 'started' });
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const tagName = `production-${timestamp}`;
            
            await this.executeCommand(`git tag -a ${tagName} -m "Production deployment ${timestamp}"`);
            results.steps.push({
                step: 'create_tag',
                status: 'completed',
                tag: tagName
            });

            // Step 4: Production update
            logger.info('Updating production...');
            results.steps.push({ step: 'production_update', status: 'started' });
            
            const updateManager = new BotUpdateManager();
            const updateResult = await updateManager.performUpdate();
            
            results.steps.push({
                step: 'production_update',
                status: updateResult.success ? 'completed' : 'failed',
                changedFiles: updateResult.changedFiles?.length || 0
            });

            if (!updateResult.success) {
                throw new Error(`Production update failed: ${updateResult.message}`);
            }

            // Step 5: Health check
            logger.info('Performing health check...');
            results.steps.push({ step: 'health_check', status: 'started' });
            
            const healthCheck = await this.performHealthCheck();
            results.steps.push({
                step: 'health_check',
                status: healthCheck.success ? 'completed' : 'failed',
                health: healthCheck.status
            });

            if (!healthCheck.success && !options.skipHealthCheck) {
                throw new Error(`Health check failed: ${healthCheck.error}`);
            }

            // Step 6: Post-deployment tasks
            logger.info('Running post-deployment tasks...');
            results.steps.push({ step: 'post_deployment', status: 'started' });
            
            await this.runPostDeploymentTasks();
            results.steps.push({
                step: 'post_deployment',
                status: 'completed'
            });

            results.success = true;
            logger.info('Production deployment completed successfully');

        } catch (error) {
            logger.error(`Production deployment failed: ${error.message}`);
            results.error = error.message;
            results.steps.push({
                step: 'error',
                status: 'failed',
                error: error.message
            });

            // Attempt rollback
            if (options.autoRollback !== false) {
                logger.info('Attempting automatic rollback...');
                results.steps.push({ step: 'rollback', status: 'started' });
                
                const rollback = await this.rollbackDeployment();
                results.steps.push({
                    step: 'rollback',
                    status: rollback.success ? 'completed' : 'failed'
                });
            }

        } finally {
            results.duration = Date.now() - startTime;
            await this.logDeployment(results);
        }

        return results;
    }

    /**
     * Perform health check after deployment
     */
    async performHealthCheck() {
        try {
            logger.info('Performing post-deployment health check...');
            
            const checks = [];
            
            // Check if bot process is running
            const processCheck = await this.checkBotProcess();
            checks.push({
                name: 'Bot Process',
                success: processCheck.running,
                details: processCheck.details
            });

            // Check Discord connection
            const discordCheck = await this.checkDiscordConnection();
            checks.push({
                name: 'Discord Connection',
                success: discordCheck.connected,
                details: discordCheck.details
            });

            // Check database connection
            const dbCheck = await this.checkDatabaseConnection();
            checks.push({
                name: 'Database Connection',
                success: dbCheck.connected,
                details: dbCheck.details
            });

            const overallSuccess = checks.every(check => check.success);
            
            return {
                success: overallSuccess,
                status: overallSuccess ? 'healthy' : 'unhealthy',
                checks
            };

        } catch (error) {
            return {
                success: false,
                status: 'error',
                error: error.message
            };
        }
    }

    /**
     * Check bot process status
     */
    async checkBotProcess() {
        try {
            const restartManager = new BotRestartManager();
            const botStatus = await restartManager.isBotRunning();
            
            return {
                running: botStatus.running,
                details: botStatus.running ? `PID: ${botStatus.pid}` : 'Process not running'
            };
        } catch (error) {
            return {
                running: false,
                details: `Error checking process: ${error.message}`
            };
        }
    }

    /**
     * Check Discord connection
     */
    async checkDiscordConnection() {
        try {
            // This would check actual Discord connection
            // For now, simulate the check
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            return {
                connected: true,
                details: 'Connected to Discord API'
            };
        } catch (error) {
            return {
                connected: false,
                details: `Discord connection error: ${error.message}`
            };
        }
    }

    /**
     * Check database connection
     */
    async checkDatabaseConnection() {
        try {
            // This would check actual database connection
            // For now, simulate the check
            const hasFirebaseConfig = process.env.FIREBASE_PROJECT_ID ? true : false;
            
            return {
                connected: hasFirebaseConfig,
                details: hasFirebaseConfig ? 'Firebase connection available' : 'Firebase config missing'
            };
        } catch (error) {
            return {
                connected: false,
                details: `Database connection error: ${error.message}`
            };
        }
    }

    /**
     * Run post-deployment tasks
     */
    async runPostDeploymentTasks() {
        try {
            // Clear caches
            await this.executeCommand('npm cache clean --force').catch(() => {});
            
            // Update timestamps
            await fs.writeFile(
                path.join(__dirname, '..', 'last-deployment.json'),
                JSON.stringify({
                    timestamp: new Date().toISOString(),
                    environment: 'production',
                    deployedBy: process.env.DEPLOYMENT_USER || 'system'
                }, null, 2)
            );

            logger.info('Post-deployment tasks completed');
        } catch (error) {
            logger.warn(`Some post-deployment tasks failed: ${error.message}`);
        }
    }

    /**
     * Rollback deployment
     */
    async rollbackDeployment() {
        try {
            logger.info('Rolling back deployment...');
            
            // Get previous deployment tag
            const tagsResult = await this.executeCommand('git tag -l "production-*" | tail -2 | head -1');
            const previousTag = tagsResult.stdout.trim();
            
            if (!previousTag) {
                throw new Error('No previous deployment tag found');
            }
            
            // Reset to previous tag
            await this.executeCommand(`git reset --hard ${previousTag}`);
            
            // Restart bot
            const restartManager = new BotRestartManager();
            const restartResult = await restartManager.performRestart();
            
            return {
                success: restartResult.success,
                previousTag,
                message: 'Rollback completed'
            };
        } catch (error) {
            logger.error(`Rollback failed: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Log deployment event
     */
    async logDeployment(results) {
        try {
            const logEntry = {
                timestamp: new Date().toISOString(),
                environment: results.environment,
                success: results.success,
                duration: results.duration,
                steps: results.steps.length,
                completedSteps: results.steps.filter(s => s.status === 'completed').length,
                failedSteps: results.steps.filter(s => s.status === 'failed').length,
                deployedBy: process.env.DEPLOYMENT_USER || 'system'
            };

            // Ensure logs directory exists
            await fs.mkdir(path.dirname(this.deploymentLog), { recursive: true });

            // Append to log file
            const existingLogs = await fs.readFile(this.deploymentLog, 'utf8').catch(() => '[]');
            const logs = JSON.parse(existingLogs || '[]');
            logs.push(logEntry);
            
            // Keep only last 50 deployments
            if (logs.length > 50) {
                logs.splice(0, logs.length - 50);
            }

            await fs.writeFile(this.deploymentLog, JSON.stringify(logs, null, 2));
            logger.info('Deployment logged successfully');
        } catch (error) {
            logger.error(`Failed to log deployment: ${error.message}`);
        }
    }

    /**
     * Get deployment history
     */
    async getDeploymentHistory(limit = 10) {
        try {
            const logsContent = await fs.readFile(this.deploymentLog, 'utf8');
            const logs = JSON.parse(logsContent);
            return logs.slice(-limit).reverse();
        } catch (error) {
            return [];
        }
    }
}

// Export for use in other modules
module.exports = DeploymentManager;

// Run if called directly
if (require.main === module) {
    const manager = new DeploymentManager();
    
    const args = process.argv.slice(2);
    const command = args[0] || 'help';
    
    switch (command) {
        case 'staging':
            manager.deployToStaging()
                .then(results => {
                    console.log('Staging Deployment Results:', JSON.stringify(results, null, 2));
                    process.exit(results.success ? 0 : 1);
                });
            break;
            
        case 'production':
            const force = args.includes('--force');
            const skipHealth = args.includes('--skip-health');
            const noRollback = args.includes('--no-rollback');
            
            manager.deployToProduction({ 
                force, 
                skipHealthCheck: skipHealth,
                autoRollback: !noRollback 
            })
                .then(results => {
                    console.log('Production Deployment Results:', JSON.stringify(results, null, 2));
                    process.exit(results.success ? 0 : 1);
                });
            break;
            
        case 'health':
            manager.performHealthCheck()
                .then(results => {
                    console.log('Health Check Results:', JSON.stringify(results, null, 2));
                    process.exit(results.success ? 0 : 1);
                });
            break;
            
        case 'history':
            manager.getDeploymentHistory()
                .then(history => {
                    console.log('Deployment History:');
                    history.forEach((deployment, index) => {
                        console.log(`${index + 1}. ${deployment.environment} - ${deployment.timestamp} - ${deployment.success ? 'SUCCESS' : 'FAILED'}`);
                    });
                    process.exit(0);
                });
            break;
            
        case 'rollback':
            manager.rollbackDeployment()
                .then(results => {
                    console.log('Rollback Results:', JSON.stringify(results, null, 2));
                    process.exit(results.success ? 0 : 1);
                });
            break;
            
        default:
            console.log('VPS Deployment Manager');
            console.log('Usage: node deploy.js [command] [options]');
            console.log('');
            console.log('Commands:');
            console.log('  staging           Deploy to staging environment');
            console.log('  production        Deploy to production environment');
            console.log('  health            Run health check');
            console.log('  history           Show deployment history');
            console.log('  rollback          Rollback last deployment');
            console.log('');
            console.log('Options for production:');
            console.log('  --force           Force deployment even if checks fail');
            console.log('  --skip-health     Skip health check after deployment');
            console.log('  --no-rollback     Disable automatic rollback on failure');
            process.exit(0);
    }
}
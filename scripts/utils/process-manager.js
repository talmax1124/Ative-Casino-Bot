/**
 * Process Management Utilities
 * Handles bot process lifecycle and management
 */

const { spawn, exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../../UTILS/logger');

class ProcessManager {
    constructor() {
        this.pidFile = path.join(__dirname, '../..', 'bot.pid');
        this.stateFile = path.join(__dirname, '../..', 'bot-state.json');
        this.processes = new Map();
    }

    /**
     * Save process state before operations
     */
    async saveState(state) {
        try {
            const stateData = {
                ...state,
                timestamp: new Date().toISOString(),
                savedAt: Date.now()
            };
            
            await fs.writeFile(this.stateFile, JSON.stringify(stateData, null, 2));
            return true;
        } catch (error) {
            logger.error(`Failed to save process state: ${error.message}`);
            return false;
        }
    }

    /**
     * Load process state
     */
    async loadState() {
        try {
            const data = await fs.readFile(this.stateFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            return null;
        }
    }

    /**
     * Save process ID
     */
    async savePID(pid) {
        try {
            await fs.writeFile(this.pidFile, pid.toString());
            return true;
        } catch (error) {
            logger.error(`Failed to save PID: ${error.message}`);
            return false;
        }
    }

    /**
     * Get current process ID
     */
    async getPID() {
        try {
            const data = await fs.readFile(this.pidFile, 'utf8');
            return parseInt(data.trim());
        } catch (error) {
            return null;
        }
    }

    /**
     * Check if process is running
     */
    isProcessRunning(pid) {
        try {
            process.kill(pid, 0);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Gracefully stop process
     */
    async gracefulStop(pid, timeout = 30000) {
        return new Promise((resolve) => {
            try {
                // Send SIGTERM for graceful shutdown
                process.kill(pid, 'SIGTERM');
                
                const startTime = Date.now();
                const checkInterval = setInterval(() => {
                    if (!this.isProcessRunning(pid)) {
                        clearInterval(checkInterval);
                        resolve({ success: true, forced: false });
                    } else if (Date.now() - startTime > timeout) {
                        // Force kill after timeout
                        try {
                            process.kill(pid, 'SIGKILL');
                        } catch (e) {
                            // Process might have already stopped
                        }
                        clearInterval(checkInterval);
                        resolve({ success: true, forced: true });
                    }
                }, 1000);
            } catch (error) {
                resolve({ success: false, error: error.message });
            }
        });
    }

    /**
     * Start new process
     */
    async startProcess(scriptPath, options = {}) {
        return new Promise((resolve, reject) => {
            try {
                const processOptions = {
                    cwd: options.cwd || path.join(__dirname, '../..'),
                    detached: options.detached || false,
                    stdio: options.stdio || ['ignore', 'pipe', 'pipe'],
                    env: { ...process.env, ...options.env }
                };

                const child = spawn('node', [scriptPath], processOptions);
                
                // Store process reference
                this.processes.set(child.pid, child);
                
                // Handle process output
                if (child.stdout) {
                    child.stdout.on('data', (data) => {
                        if (options.onOutput) {
                            options.onOutput(data.toString());
                        }
                    });
                }
                
                if (child.stderr) {
                    child.stderr.on('data', (data) => {
                        if (options.onError) {
                            options.onError(data.toString());
                        }
                    });
                }
                
                child.on('error', (error) => {
                    logger.error(`Process error: ${error.message}`);
                    this.processes.delete(child.pid);
                    reject(error);
                });
                
                child.on('exit', (code, signal) => {
                    logger.info(`Process ${child.pid} exited with code ${code} and signal ${signal}`);
                    this.processes.delete(child.pid);
                });
                
                // Wait for process to initialize
                setTimeout(() => {
                    resolve({
                        pid: child.pid,
                        process: child,
                        success: true
                    });
                }, options.initTimeout || 2000);
                
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Close all database connections gracefully
     */
    async closeConnections() {
        try {
            logger.info('Closing all connections...');
            
            // This would interface with actual database connections
            // For now, simulate the process
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            return true;
        } catch (error) {
            logger.error(`Failed to close connections: ${error.message}`);
            return false;
        }
    }

    /**
     * Stop all active processes
     */
    async stopAllProcesses() {
        const results = [];
        
        for (const [pid, process] of this.processes) {
            try {
                const result = await this.gracefulStop(pid);
                results.push({ pid, ...result });
            } catch (error) {
                results.push({ pid, success: false, error: error.message });
            }
        }
        
        return results;
    }

    /**
     * Verify process startup
     */
    async verifyStartup(pid, checks = {}) {
        const results = {
            processRunning: false,
            responsive: false,
            healthy: false,
            checks: []
        };
        
        // Check if process is running
        results.processRunning = this.isProcessRunning(pid);
        results.checks.push({
            name: 'process_running',
            passed: results.processRunning
        });
        
        if (!results.processRunning) {
            return results;
        }
        
        // Additional health checks
        if (checks.checkState) {
            const state = await this.loadState();
            const stateValid = state && (Date.now() - state.savedAt < 60000);
            results.checks.push({
                name: 'state_file',
                passed: stateValid
            });
        }
        
        if (checks.checkMemory) {
            try {
                const memInfo = await this.getProcessMemory(pid);
                const memoryOk = memInfo && memInfo.rss < 1024 * 1024 * 1024; // < 1GB
                results.checks.push({
                    name: 'memory_usage',
                    passed: memoryOk,
                    value: memInfo?.rss
                });
            } catch (error) {
                results.checks.push({
                    name: 'memory_usage',
                    passed: false,
                    error: error.message
                });
            }
        }
        
        results.healthy = results.checks.every(check => check.passed);
        return results;
    }

    /**
     * Get process memory usage
     */
    async getProcessMemory(pid) {
        return new Promise((resolve, reject) => {
            exec(`ps -o rss,vsz,pmem -p ${pid}`, (error, stdout, stderr) => {
                if (error) {
                    reject(error);
                } else {
                    const lines = stdout.trim().split('\n');
                    if (lines.length < 2) {
                        reject(new Error('Invalid ps output'));
                    } else {
                        const values = lines[1].trim().split(/\s+/);
                        resolve({
                            rss: parseInt(values[0]) * 1024, // Convert KB to bytes
                            vsz: parseInt(values[1]) * 1024,
                            pmem: parseFloat(values[2])
                        });
                    }
                }
            });
        });
    }

    /**
     * Monitor process health
     */
    async monitorProcess(pid, options = {}) {
        const interval = options.interval || 5000;
        const metrics = [];
        
        const monitor = async () => {
            try {
                const memory = await this.getProcessMemory(pid);
                const running = this.isProcessRunning(pid);
                
                const metric = {
                    timestamp: Date.now(),
                    pid,
                    running,
                    memory
                };
                
                metrics.push(metric);
                
                // Keep only last 100 metrics
                if (metrics.length > 100) {
                    metrics.shift();
                }
                
                if (options.onMetric) {
                    options.onMetric(metric);
                }
                
                if (!running && options.onExit) {
                    options.onExit();
                    clearInterval(monitorInterval);
                }
                
            } catch (error) {
                logger.error(`Process monitoring error: ${error.message}`);
            }
        };
        
        const monitorInterval = setInterval(monitor, interval);
        
        // Run initial check
        await monitor();
        
        return {
            stop: () => clearInterval(monitorInterval),
            getMetrics: () => metrics
        };
    }
}

module.exports = ProcessManager;
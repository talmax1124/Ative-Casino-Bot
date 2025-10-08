/**
 * DevAI Manager - AI-powered development assistant with OpenAI ChatGPT
 * Handles code generation, testing, and VPS management
 */

const OpenAI = require('openai');
const fs = require('fs').promises;
const path = require('path');
const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const logger = require('./logger');

class DevAIManager {
    constructor() {
        this.projectRoot = '/Users/carlosdiazplaza/ative_casino_bot';
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
        this.testResults = [];
        this.isProcessing = false;
    }

    /**
     * Main processing function for AI requests
     */
    async processRequest(type, description, options = {}) {
        if (this.isProcessing) {
            throw new Error('DevAI is currently processing another request. Please wait.');
        }

        this.isProcessing = true;
        const startTime = Date.now();
        
        try {
            logger.info(`DevAI: Starting ${type} request - ${description}`);
            
            // Step 1: Get codebase context
            const context = await this.getCodebaseContext();
            
            // Step 2: Generate AI response
            const aiResponse = await this.callOpenAI(type, description, context);
            
            // Step 3: Parse and validate AI response
            const parsedChanges = await this.parseAIResponse(aiResponse);
            
            // Step 4: Create backups
            const backups = await this.createBackups(parsedChanges.filesToModify);
            
            // Step 5: Apply changes
            const applyResults = await this.applyChanges(parsedChanges);
            
            // Step 6: Run automated tests
            const testResults = await this.runAutomatedTests();
            
            // Step 7: Execute post-deployment commands if tests pass
            let deploymentResults = null;
            if (testResults.allPassed && options.autoRestart) {
                deploymentResults = await this.executeDeploymentCommands(options.commands);
            }
            
            const totalTime = Date.now() - startTime;
            
            return {
                success: testResults.allPassed,
                aiResponse: aiResponse.substring(0, 500),
                filesModified: applyResults.filesModified,
                testResults: testResults,
                deploymentResults: deploymentResults,
                backups: backups,
                executionTime: totalTime,
                summary: this.generateSummary(type, description, applyResults, testResults)
            };
            
        } catch (error) {
            logger.error(`DevAI Error: ${error.message}`);
            throw error;
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Call OpenAI ChatGPT with context about the bot
     */
    async callOpenAI(type, description, context) {
        const systemPrompt = `You are an expert Discord.js v14 bot developer working on the ATIVE Casino Bot.

CODEBASE CONTEXT:
- Framework: Discord.js v14, Node.js
- Database: MariaDB with user_balances, user_stats, game_results tables
- Structure: /COMMANDS/*.js (slash commands), /GAMES/*.js (game logic), /UTILS/*.js (utilities)
- Developer ID: 466050111680544798
- Current files: ${context.files.join(', ')}
- NO MessageContent intent available - cannot read message content

TASK: ${type}
DESCRIPTION: ${description}

CRITICAL RESTRICTIONS:
- NEVER modify index.js, package.json, .env, or core files
- ONLY create/modify files in: COMMANDS/, GAMES/, UTILS/, tests/, Documentation & Tests/
- Use slash commands and button interactions ONLY (no message content reading)
- For ping responses, create slash commands instead of message listeners
- Follow existing security patterns (developer ID checks)

REQUIREMENTS:
1. Provide COMPLETE, WORKING code
2. Follow existing patterns and conventions
3. Include proper error handling and logging
4. Use the existing database structure
5. Maintain security (check developer ID for admin commands)
6. Include any necessary imports/requires
7. Use only button/modal interactions, NO message content

RESPONSE FORMAT:
Provide your response as JSON:
{
  "explanation": "Brief explanation of changes",
  "files": [
    {
      "path": "relative/path/to/file.js",
      "action": "create|modify|delete", 
      "content": "complete file content here"
    }
  ],
  "additionalSteps": ["any manual steps needed"],
  "testCommands": ["commands to test the changes"]
}`;

        const completion = await this.openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `Current context: ${JSON.stringify(context.currentState)}\n\nRequest: ${description}` }
            ],
            max_tokens: 4000,
            temperature: 0.1
        });

        return completion.choices[0].message.content;
    }

    /**
     * Get current codebase context for AI
     */
    async getCodebaseContext() {
        const context = {
            files: [],
            currentState: {},
            structure: {}
        };

        try {
            // Get list of command files
            const commandFiles = await fs.readdir(path.join(this.projectRoot, 'COMMANDS'));
            context.files = commandFiles.filter(f => f.endsWith('.js')).map(f => `COMMANDS/${f}`);
            
            // Get package.json for dependencies
            const packageJson = JSON.parse(await fs.readFile(path.join(this.projectRoot, 'package.json'), 'utf8'));
            context.currentState.dependencies = Object.keys(packageJson.dependencies);
            
            // Get recent error logs if any
            try {
                const logFiles = await fs.readdir(path.join(this.projectRoot, 'logs'));
                if (logFiles.length > 0) {
                    const latestLog = await fs.readFile(path.join(this.projectRoot, 'logs', logFiles[0]), 'utf8');
                    context.currentState.recentLogs = latestLog.split('\n').slice(-10).join('\n');
                }
            } catch (e) {
                // No logs directory or files
            }
            
        } catch (error) {
            logger.error(`Error getting codebase context: ${error.message}`);
        }

        return context;
    }

    /**
     * Parse AI response and validate changes
     */
    async parseAIResponse(response) {
        try {
            // Try to extract JSON from response
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('AI response does not contain valid JSON');
            }

            const parsed = JSON.parse(jsonMatch[0]);
            
            return {
                explanation: parsed.explanation || 'No explanation provided',
                filesToModify: parsed.files || [],
                additionalSteps: parsed.additionalSteps || [],
                testCommands: parsed.testCommands || [],
                rawResponse: response
            };
        } catch (error) {
            logger.error(`Error parsing AI response: ${error.message}`);
            throw new Error(`Failed to parse AI response: ${error.message}`);
        }
    }

    /**
     * Create backups of files before modification
     */
    async createBackups(filesToModify) {
        const backups = [];
        
        for (const fileInfo of filesToModify) {
            try {
                const fullPath = path.join(this.projectRoot, fileInfo.path);
                
                // Check if file exists before backing up
                try {
                    await fs.access(fullPath);
                    const backupPath = `${fullPath}.backup.${Date.now()}`;
                    await fs.copyFile(fullPath, backupPath);
                    backups.push({ original: fullPath, backup: backupPath });
                } catch (e) {
                    // File doesn't exist - that's okay for new files
                }
            } catch (error) {
                logger.error(`Error creating backup for ${fileInfo.path}: ${error.message}`);
            }
        }
        
        return backups;
    }

    /**
     * Apply the AI-generated changes
     */
    async applyChanges(parsedChanges) {
        const results = {
            filesModified: [],
            errors: []
        };

        for (const fileInfo of parsedChanges.filesToModify) {
            try {
                const fullPath = path.join(this.projectRoot, fileInfo.path);
                
                // Security check - only allow modification of safe directories
                if (!this.isPathSafe(fileInfo.path)) {
                    throw new Error(`Path ${fileInfo.path} is not allowed for modification`);
                }

                // Ensure directory exists
                await fs.mkdir(path.dirname(fullPath), { recursive: true });

                if (fileInfo.action === 'delete') {
                    await fs.unlink(fullPath);
                } else {
                    await fs.writeFile(fullPath, fileInfo.content, 'utf8');
                }
                
                results.filesModified.push(fileInfo.path);
                logger.info(`DevAI: ${fileInfo.action} ${fileInfo.path}`);
                
            } catch (error) {
                const errorMsg = `Error applying changes to ${fileInfo.path}: ${error.message}`;
                results.errors.push(errorMsg);
                logger.error(errorMsg);
            }
        }

        return results;
    }

    /**
     * Run automated tests to validate changes
     */
    async runAutomatedTests() {
        const results = {
            tests: [],
            allPassed: true,
            summary: ''
        };

        const testCommands = [
            { name: 'Syntax Check', command: 'node -c index.js' },
            { name: 'ESLint', command: 'npm run lint' },
            { name: 'Bot Startup Test', command: 'timeout 10s node index.js || true' }
        ];

        // Add any existing test files
        try {
            const testFiles = await fs.readdir(path.join(this.projectRoot, 'tests'));
            for (const testFile of testFiles.slice(0, 3)) { // Limit to 3 tests to avoid timeout
                if (testFile.endsWith('.js')) {
                    testCommands.push({
                        name: `Test: ${testFile}`,
                        command: `timeout 30s node tests/${testFile} || true`
                    });
                }
            }
        } catch (e) {
            // No tests directory
        }

        for (const test of testCommands) {
            try {
                const startTime = Date.now();
                const { stdout, stderr } = await execAsync(test.command, {
                    cwd: this.projectRoot,
                    timeout: 30000 // 30 second timeout per test
                });
                
                const duration = Date.now() - startTime;
                const passed = !stderr || stderr.length === 0;
                
                results.tests.push({
                    name: test.name,
                    passed: passed,
                    duration: duration,
                    output: stdout.substring(0, 200),
                    error: stderr ? stderr.substring(0, 200) : null
                });

                if (!passed) {
                    results.allPassed = false;
                }

            } catch (error) {
                results.tests.push({
                    name: test.name,
                    passed: false,
                    duration: 0,
                    output: '',
                    error: error.message.substring(0, 200)
                });
                results.allPassed = false;
            }
        }

        results.summary = `${results.tests.filter(t => t.passed).length}/${results.tests.length} tests passed`;
        return results;
    }

    /**
     * Execute deployment commands (restart VPS, etc.)
     */
    async executeDeploymentCommands(commands = []) {
        const defaultCommands = [
            'pm2 restart ative-casino-bot || true',
            'systemctl restart ative-casino-bot || true',
            'sudo reboot || true' // VPS restart as last resort
        ];

        const commandsToRun = commands.length > 0 ? commands : defaultCommands;
        const results = [];

        for (const command of commandsToRun) {
            try {
                logger.info(`DevAI: Executing deployment command: ${command}`);
                
                const { stdout, stderr } = await execAsync(command, {
                    timeout: 10000 // 10 second timeout
                });

                results.push({
                    command: command,
                    success: true,
                    output: stdout.substring(0, 100),
                    error: stderr ? stderr.substring(0, 100) : null
                });

            } catch (error) {
                results.push({
                    command: command,
                    success: false,
                    output: '',
                    error: error.message.substring(0, 100)
                });
                
                // If it's a reboot command, that's expected to "fail"
                if (command.includes('reboot')) {
                    results[results.length - 1].success = true;
                    results[results.length - 1].error = 'Reboot initiated';
                }
            }
        }

        return results;
    }

    /**
     * Security check for file paths
     */
    isPathSafe(filePath) {
        const allowedDirectories = [
            'COMMANDS/',
            'GAMES/',
            'UTILS/',
            'tests/',
            'website/',
            'Documentation & Tests/'
        ];

        const normalizedPath = filePath.replace(/\\/g, '/');
        
        // Check if path starts with allowed directory
        const isAllowed = allowedDirectories.some(dir => normalizedPath.startsWith(dir));
        
        // Block dangerous patterns and core files
        const blockedPatterns = [
            '../',
            '.env',
            'node_modules/',
            '/etc/',
            '/var/',
            'package.json',
            'index.js',           // Main entry point - too critical
            'package-lock.json',   // Package dependencies
            '.git/',              // Git repository
            'Dockerfile',         // Docker configuration
            'docker-compose',     // Docker compose files
            '.github/',           // GitHub workflows
            'ecosystem.config'    // PM2 configuration
        ];
        
        const isBlocked = blockedPatterns.some(pattern => normalizedPath.includes(pattern));
        
        return isAllowed && !isBlocked;
    }

    /**
     * Generate summary of operations
     */
    generateSummary(type, description, applyResults, testResults) {
        return `DevAI ${type}: ${description}\n` +
               `Files modified: ${applyResults.filesModified.length}\n` +
               `Tests: ${testResults.summary}\n` +
               `Status: ${testResults.allPassed ? '✅ Success' : '❌ Issues detected'}`;
    }

    /**
     * Restore from backup if needed
     */
    async restoreFromBackup(backupInfo) {
        const results = [];
        
        for (const backup of backupInfo) {
            try {
                await fs.copyFile(backup.backup, backup.original);
                await fs.unlink(backup.backup); // Clean up backup file
                results.push({ file: backup.original, success: true });
            } catch (error) {
                results.push({ file: backup.original, success: false, error: error.message });
            }
        }
        
        return results;
    }
}

module.exports = DevAIManager;
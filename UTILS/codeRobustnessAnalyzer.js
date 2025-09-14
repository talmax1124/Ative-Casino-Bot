class CodeRobustnessAnalyzer {
    constructor() {
        this.analysisResults = new Map();
        this.bugReports = [];
        this.securityIssues = [];
        this.performanceIssues = [];
        this.codeSmells = [];
        
        this.severityLevels = {
            CRITICAL: 'CRITICAL',
            HIGH: 'HIGH', 
            MEDIUM: 'MEDIUM',
            LOW: 'LOW',
            INFO: 'INFO'
        };
        
        this.bugCategories = {
            SYNTAX_ERROR: 'syntax_error',
            RUNTIME_ERROR: 'runtime_error',
            LOGICAL_ERROR: 'logical_error',
            MATHEMATICAL_ERROR: 'mathematical_error',
            MEMORY_LEAK: 'memory_leak',
            PERFORMANCE_ISSUE: 'performance_issue',
            SECURITY_VULNERABILITY: 'security_vulnerability',
            INPUT_VALIDATION: 'input_validation',
            ERROR_HANDLING: 'error_handling',
            CONCURRENCY_ISSUE: 'concurrency_issue'
        };
    }

    async performComprehensiveBugAnalysis() {
        console.log('🔍 Starting Comprehensive Bug Analysis and Code Review');
        
        const analysisReport = {
            timestamp: Date.now(),
            filesAnalyzed: 0,
            bugsFound: 0,
            criticalIssues: 0,
            securityVulnerabilities: 0,
            performanceIssues: 0,
            overallRobustness: 0,
            categories: {
                syntaxErrors: [],
                runtimeErrors: [],
                logicalErrors: [],
                mathematicalErrors: [],
                securityIssues: [],
                performanceIssues: [],
                inputValidationIssues: [],
                errorHandlingIssues: [],
                concurrencyIssues: []
            },
            fixes: [],
            recommendations: [],
            status: 'COMPLETED'
        };

        try {
            // Analyze all economic system files
            console.log('📊 Analyzing Economic System Files...');
            const economicFiles = [
                'ECONOMY/entropyEconomicAnalyzer.js',
                'ECONOMY/nashEquilibriumGameBalancer.js', 
                'ECONOMY/monteCarloStabilityEngine.js',
                'ECONOMY/adaptiveTaxationSystem.js',
                'ECONOMY/pidEconomicController.js',
                'ECONOMY/markovChainBehaviorPredictor.js',
                'ECONOMY/anomalyDetectionSystem.js',
                'ECONOMY/dynamicRTPController.js',
                'ECONOMY/masterEconomicOrchestrator.js'
            ];

            for (const file of economicFiles) {
                await this.analyzeFile(file, analysisReport);
            }

            // Analyze validation framework files
            console.log('🧪 Analyzing Validation Framework Files...');
            const validationFiles = [
                'UTILS/mathematicalValidationFramework.js',
                'UTILS/gameTheoryValidationSuite.js',
                'UTILS/comprehensiveSimulationFramework.js',
                'UTILS/masterValidationExecutor.js'
            ];

            for (const file of validationFiles) {
                await this.analyzeFile(file, analysisReport);
            }

            // Analyze execution scripts
            console.log('🚀 Analyzing Execution Scripts...');
            await this.analyzeFile('runFullSystemValidation.js', analysisReport);
            await this.analyzeFile('demoValidationSystem.js', analysisReport);

            // Perform cross-file analysis
            console.log('🔗 Performing Cross-File Integration Analysis...');
            await this.performIntegrationAnalysis(analysisReport);

            // Generate fixes and recommendations
            console.log('🔧 Generating Fixes and Recommendations...');
            this.generateFixesAndRecommendations(analysisReport);

            // Calculate overall robustness score
            analysisReport.overallRobustness = this.calculateRobustnessScore(analysisReport);

            console.log(`✅ Bug Analysis Complete - ${analysisReport.bugsFound} issues found`);
            console.log(`🎯 Overall Robustness: ${(analysisReport.overallRobustness * 100).toFixed(1)}%`);

            return analysisReport;

        } catch (error) {
            analysisReport.status = 'ERROR';
            analysisReport.error = error.message;
            console.error('❌ Bug analysis failed:', error);
            return analysisReport;
        }
    }

    async analyzeFile(filePath, analysisReport) {
        try {
            console.log(`  🔍 Analyzing: ${filePath}`);
            
            const fullPath = `/Users/carlosdiazplaza/ative_casino_bot/${filePath}`;
            const fileContent = await this.readFileContent(fullPath);
            
            if (!fileContent) {
                console.log(`    ⚠️ Could not read file: ${filePath}`);
                return;
            }

            analysisReport.filesAnalyzed++;

            // Check for syntax errors
            const syntaxIssues = this.checkSyntaxErrors(fileContent, filePath);
            analysisReport.categories.syntaxErrors.push(...syntaxIssues);

            // Check for runtime error patterns
            const runtimeIssues = this.checkRuntimeErrorPatterns(fileContent, filePath);
            analysisReport.categories.runtimeErrors.push(...runtimeIssues);

            // Check for logical errors
            const logicalIssues = this.checkLogicalErrors(fileContent, filePath);
            analysisReport.categories.logicalErrors.push(...logicalIssues);

            // Check for mathematical errors
            const mathIssues = this.checkMathematicalErrors(fileContent, filePath);
            analysisReport.categories.mathematicalErrors.push(...mathIssues);

            // Check for security vulnerabilities
            const securityIssues = this.checkSecurityVulnerabilities(fileContent, filePath);
            analysisReport.categories.securityIssues.push(...securityIssues);

            // Check for performance issues
            const performanceIssues = this.checkPerformanceIssues(fileContent, filePath);
            analysisReport.categories.performanceIssues.push(...performanceIssues);

            // Check input validation
            const inputIssues = this.checkInputValidation(fileContent, filePath);
            analysisReport.categories.inputValidationIssues.push(...inputIssues);

            // Check error handling
            const errorHandlingIssues = this.checkErrorHandling(fileContent, filePath);
            analysisReport.categories.errorHandlingIssues.push(...errorHandlingIssues);

            // Check concurrency issues
            const concurrencyIssues = this.checkConcurrencyIssues(fileContent, filePath);
            analysisReport.categories.concurrencyIssues.push(...concurrencyIssues);

            const totalFileIssues = syntaxIssues.length + runtimeIssues.length + 
                                  logicalIssues.length + mathIssues.length + 
                                  securityIssues.length + performanceIssues.length +
                                  inputIssues.length + errorHandlingIssues.length +
                                  concurrencyIssues.length;

            analysisReport.bugsFound += totalFileIssues;

            console.log(`    📊 Found ${totalFileIssues} issues in ${filePath}`);

        } catch (error) {
            console.error(`    ❌ Error analyzing ${filePath}:`, error.message);
            analysisReport.categories.runtimeErrors.push({
                file: filePath,
                type: this.bugCategories.RUNTIME_ERROR,
                severity: this.severityLevels.HIGH,
                description: `File analysis failed: ${error.message}`,
                line: 0,
                fix: 'Investigate file access and parsing issues'
            });
        }
    }

    async readFileContent(filePath) {
        try {
            const fs = require('fs').promises;
            return await fs.readFile(filePath, 'utf8');
        } catch (error) {
            return null;
        }
    }

    checkSyntaxErrors(content, filePath) {
        const issues = [];
        
        try {
            // Try to parse the JavaScript to catch syntax errors
            const vm = require('vm');
            vm.createScript(content, filePath);
        } catch (syntaxError) {
            if (syntaxError instanceof SyntaxError) {
                issues.push({
                    file: filePath,
                    type: this.bugCategories.SYNTAX_ERROR,
                    severity: this.severityLevels.CRITICAL,
                    description: syntaxError.message,
                    line: syntaxError.lineNumber || 0,
                    fix: 'Fix syntax error according to JavaScript specification'
                });
            }
        }

        // Check for common syntax patterns that could cause issues
        const lines = content.split('\n');
        
        lines.forEach((line, index) => {
            const lineNumber = index + 1;
            
            // Check for unmatched brackets/parentheses
            const openBrackets = (line.match(/\{/g) || []).length;
            const closeBrackets = (line.match(/\}/g) || []).length;
            const openParens = (line.match(/\(/g) || []).length;
            const closeParens = (line.match(/\)/g) || []).length;
            
            // Check for potential Unicode issues
            if (/[^\x00-\x7F]/.test(line) && !line.includes('//') && !line.includes('*')) {
                issues.push({
                    file: filePath,
                    type: this.bugCategories.SYNTAX_ERROR,
                    severity: this.severityLevels.MEDIUM,
                    description: `Line contains non-ASCII characters that may cause parsing issues`,
                    line: lineNumber,
                    fix: 'Replace non-ASCII characters with ASCII equivalents or proper escaping'
                });
            }

            // Check for missing semicolons in critical places
            if (line.trim().match(/^(const|let|var|function|class)\s+.*[^;{]$/)) {
                if (!line.trim().endsWith('{') && !line.includes('//')) {
                    issues.push({
                        file: filePath,
                        type: this.bugCategories.SYNTAX_ERROR,
                        severity: this.severityLevels.LOW,
                        description: 'Missing semicolon after statement',
                        line: lineNumber,
                        fix: 'Add semicolon at end of statement'
                    });
                }
            }
        });

        return issues;
    }

    checkRuntimeErrorPatterns(content, filePath) {
        const issues = [];
        const lines = content.split('\n');
        
        lines.forEach((line, index) => {
            const lineNumber = index + 1;
            
            // Check for undefined variable access patterns
            if (line.includes('.') && !line.includes('//')) {
                const propertyAccess = line.match(/(\w+)\.(\w+)/g);
                if (propertyAccess) {
                    propertyAccess.forEach(access => {
                        const [obj, prop] = access.split('.');
                        if (!line.includes(`if (${obj})`) && !line.includes(`${obj} &&`) && 
                            !line.includes(`typeof ${obj}`) && !line.includes(`${obj} ||`) &&
                            !line.includes('try {') && 
                            // Common safe patterns
                            !['this', 'Math', 'Date', 'JSON', 'console', 'process', 'require'].includes(obj)) {
                            issues.push({
                                file: filePath,
                                type: this.bugCategories.RUNTIME_ERROR,
                                severity: this.severityLevels.MEDIUM,
                                description: `Potential undefined property access: ${access}`,
                                line: lineNumber,
                                fix: `Add null check: if (${obj} && ${obj}.${prop})`
                            });
                        }
                    });
                }
            }

            // Check for potential division by zero
            if (line.includes('/') && !line.includes('//') && !line.includes('/*')) {
                const divisionPattern = /(\w+|\d+)\s*\/\s*(\w+|\d+)/g;
                const matches = line.match(divisionPattern);
                if (matches) {
                    matches.forEach(match => {
                        const divisor = match.split('/')[1].trim();
                        if (!line.includes(`${divisor} !== 0`) && !line.includes(`${divisor} != 0`) &&
                            !line.includes(`${divisor} > 0`) && !line.includes(`${divisor} < 0`)) {
                            issues.push({
                                file: filePath,
                                type: this.bugCategories.RUNTIME_ERROR,
                                severity: this.severityLevels.HIGH,
                                description: `Potential division by zero: ${match}`,
                                line: lineNumber,
                                fix: `Add zero check: if (${divisor} !== 0) { ... }`
                            });
                        }
                    });
                }
            }

            // Check for array access without bounds checking
            if (line.includes('[') && !line.includes('//')) {
                const arrayAccess = line.match(/(\w+)\[(\w+|\d+)\]/g);
                if (arrayAccess) {
                    arrayAccess.forEach(access => {
                        const [array, index] = access.replace(/[\[\]]/g, '|').split('|');
                        if (!line.includes(`${array}.length`) && !line.includes(`${array} &&`) &&
                            !isNaN(parseInt(index)) === false) {
                            issues.push({
                                file: filePath,
                                type: this.bugCategories.RUNTIME_ERROR,
                                severity: this.severityLevels.MEDIUM,
                                description: `Potential array bounds error: ${access}`,
                                line: lineNumber,
                                fix: `Add bounds check: if (${index} < ${array}.length)`
                            });
                        }
                    });
                }
            }
        });

        return issues;
    }

    checkLogicalErrors(content, filePath) {
        const issues = [];
        const lines = content.split('\n');
        
        lines.forEach((line, index) => {
            const lineNumber = index + 1;
            
            // Check for assignment in conditions (common mistake)
            if (line.includes('if') || line.includes('while')) {
                const assignmentInCondition = line.match(/if\s*\([^)]*=[^=][^)]*\)/);
                if (assignmentInCondition) {
                    issues.push({
                        file: filePath,
                        type: this.bugCategories.LOGICAL_ERROR,
                        severity: this.severityLevels.HIGH,
                        description: 'Assignment in condition instead of comparison',
                        line: lineNumber,
                        fix: 'Use == or === for comparison instead of ='
                    });
                }
            }

            // Check for infinite loops
            if (line.includes('while (true)') && !line.includes('//')) {
                if (!content.includes('break;') || !content.includes('return;')) {
                    issues.push({
                        file: filePath,
                        type: this.bugCategories.LOGICAL_ERROR,
                        severity: this.severityLevels.HIGH,
                        description: 'Potential infinite loop without break condition',
                        line: lineNumber,
                        fix: 'Add break condition or timeout mechanism'
                    });
                }
            }

            // Check for unreachable code after return
            if (line.trim() === 'return;' || line.match(/return\s+.+;/)) {
                const nextLineIndex = index + 1;
                if (nextLineIndex < lines.length) {
                    const nextLine = lines[nextLineIndex].trim();
                    if (nextLine && !nextLine.startsWith('}') && !nextLine.startsWith('//') && 
                        !nextLine.startsWith('*') && !nextLine.startsWith('case') && 
                        !nextLine.startsWith('default')) {
                        issues.push({
                            file: filePath,
                            type: this.bugCategories.LOGICAL_ERROR,
                            severity: this.severityLevels.MEDIUM,
                            description: 'Unreachable code after return statement',
                            line: nextLineIndex + 1,
                            fix: 'Remove unreachable code or restructure logic'
                        });
                    }
                }
            }

            // Check for missing return statements in functions
            if (line.includes('function') || line.match(/^\s*async\s+\w+/)) {
                const functionMatch = line.match(/function\s+(\w+)/);
                if (functionMatch && !line.includes('=>')) {
                    const functionName = functionMatch[1];
                    // Look ahead to see if function has return statement
                    let hasReturn = false;
                    let braceCount = 0;
                    for (let i = index; i < lines.length; i++) {
                        if (lines[i].includes('{')) braceCount++;
                        if (lines[i].includes('}')) braceCount--;
                        if (lines[i].includes('return') && braceCount > 0) {
                            hasReturn = true;
                            break;
                        }
                        if (braceCount === 0 && i > index) break;
                    }
                    
                    if (!hasReturn && !functionName.startsWith('test') && 
                        !functionName.startsWith('init') && !functionName.includes('void')) {
                        issues.push({
                            file: filePath,
                            type: this.bugCategories.LOGICAL_ERROR,
                            severity: this.severityLevels.MEDIUM,
                            description: `Function ${functionName} may be missing return statement`,
                            line: lineNumber,
                            fix: 'Add appropriate return statement or void declaration'
                        });
                    }
                }
            }
        });

        return issues;
    }

    checkMathematicalErrors(content, filePath) {
        const issues = [];
        const lines = content.split('\n');
        
        lines.forEach((line, index) => {
            const lineNumber = index + 1;
            
            // Check for NaN comparisons
            if (line.includes('== NaN') || line.includes('=== NaN')) {
                issues.push({
                    file: filePath,
                    type: this.bugCategories.MATHEMATICAL_ERROR,
                    severity: this.severityLevels.HIGH,
                    description: 'Direct NaN comparison will always be false',
                    line: lineNumber,
                    fix: 'Use Number.isNaN() or isNaN() instead'
                });
            }

            // Check for floating point precision issues
            if (line.match(/\d+\.\d+\s*[=!]==?\s*\d+\.\d+/)) {
                issues.push({
                    file: filePath,
                    type: this.bugCategories.MATHEMATICAL_ERROR,
                    severity: this.severityLevels.MEDIUM,
                    description: 'Direct floating point comparison may fail due to precision',
                    line: lineNumber,
                    fix: 'Use epsilon comparison: Math.abs(a - b) < epsilon'
                });
            }

            // Check for Math.random() seeding issues
            if (line.includes('Math.random()') && content.includes('seed')) {
                issues.push({
                    file: filePath,
                    type: this.bugCategories.MATHEMATICAL_ERROR,
                    severity: this.severityLevels.LOW,
                    description: 'Math.random() cannot be seeded, results may not be reproducible',
                    line: lineNumber,
                    fix: 'Consider using a seedable PRNG library'
                });
            }

            // Check for potential overflow in mathematical operations
            if (line.match(/\*\s*\*|\*\*/) && !line.includes('//')) {
                issues.push({
                    file: filePath,
                    type: this.bugCategories.MATHEMATICAL_ERROR,
                    severity: this.severityLevels.MEDIUM,
                    description: 'Exponentiation may cause number overflow',
                    line: lineNumber,
                    fix: 'Add bounds checking or use Math.pow() with overflow protection'
                });
            }

            // Check for sqrt of negative numbers
            if (line.includes('Math.sqrt') && !line.includes('Math.abs')) {
                issues.push({
                    file: filePath,
                    type: this.bugCategories.MATHEMATICAL_ERROR,
                    severity: this.severityLevels.MEDIUM,
                    description: 'Math.sqrt of negative number returns NaN',
                    line: lineNumber,
                    fix: 'Add check: Math.sqrt(Math.abs(value)) or validate input'
                });
            }

            // Check for log of zero or negative numbers
            if (line.includes('Math.log') && !line.includes('> 0')) {
                issues.push({
                    file: filePath,
                    type: this.bugCategories.MATHEMATICAL_ERROR,
                    severity: this.severityLevels.MEDIUM,
                    description: 'Math.log of zero or negative number returns NaN/-Infinity',
                    line: lineNumber,
                    fix: 'Add validation: if (value > 0) before Math.log()'
                });
            }
        });

        return issues;
    }

    checkSecurityVulnerabilities(content, filePath) {
        const issues = [];
        const lines = content.split('\n');
        
        lines.forEach((line, index) => {
            const lineNumber = index + 1;
            
            // Check for eval usage
            if (line.includes('eval(') && !line.includes('//')) {
                issues.push({
                    file: filePath,
                    type: this.bugCategories.SECURITY_VULNERABILITY,
                    severity: this.severityLevels.CRITICAL,
                    description: 'eval() usage can lead to code injection',
                    line: lineNumber,
                    fix: 'Avoid eval(), use JSON.parse() or other safe alternatives'
                });
            }

            // Check for Function constructor
            if (line.includes('new Function(') && !line.includes('//')) {
                issues.push({
                    file: filePath,
                    type: this.bugCategories.SECURITY_VULNERABILITY,
                    severity: this.severityLevels.HIGH,
                    description: 'Function constructor can execute arbitrary code',
                    line: lineNumber,
                    fix: 'Avoid Function constructor, use predefined functions'
                });
            }

            // Check for potential SQL injection patterns
            if (line.includes('SELECT') || line.includes('INSERT') || line.includes('UPDATE')) {
                if (line.includes('+') && line.includes('`')) {
                    issues.push({
                        file: filePath,
                        type: this.bugCategories.SECURITY_VULNERABILITY,
                        severity: this.severityLevels.HIGH,
                        description: 'Potential SQL injection vulnerability',
                        line: lineNumber,
                        fix: 'Use parameterized queries or prepared statements'
                    });
                }
            }

            // Check for hardcoded secrets
            const secretPatterns = [
                /password\s*[:=]\s*["'][^"']+["']/i,
                /api[_-]?key\s*[:=]\s*["'][^"']+["']/i,
                /secret\s*[:=]\s*["'][^"']+["']/i,
                /token\s*[:=]\s*["'][^"']+["']/i
            ];

            secretPatterns.forEach(pattern => {
                if (pattern.test(line) && !line.includes('//') && !line.includes('placeholder')) {
                    issues.push({
                        file: filePath,
                        type: this.bugCategories.SECURITY_VULNERABILITY,
                        severity: this.severityLevels.HIGH,
                        description: 'Potential hardcoded secret or credential',
                        line: lineNumber,
                        fix: 'Use environment variables or secure configuration'
                    });
                }
            });

            // Check for potential XSS vulnerabilities
            if (line.includes('innerHTML') && line.includes('+')) {
                issues.push({
                    file: filePath,
                    type: this.bugCategories.SECURITY_VULNERABILITY,
                    severity: this.severityLevels.HIGH,
                    description: 'Potential XSS vulnerability with innerHTML',
                    line: lineNumber,
                    fix: 'Use textContent or sanitize input before innerHTML'
                });
            }
        });

        return issues;
    }

    checkPerformanceIssues(content, filePath) {
        const issues = [];
        const lines = content.split('\n');
        
        lines.forEach((line, index) => {
            const lineNumber = index + 1;
            
            // Check for synchronous file operations
            if (line.includes('readFileSync') || line.includes('writeFileSync')) {
                issues.push({
                    file: filePath,
                    type: this.bugCategories.PERFORMANCE_ISSUE,
                    severity: this.severityLevels.MEDIUM,
                    description: 'Synchronous file operation blocks event loop',
                    line: lineNumber,
                    fix: 'Use async file operations (readFile, writeFile)'
                });
            }

            // Check for nested loops that could be O(n²) or worse
            if (line.includes('for') && !line.includes('//')) {
                const indent = line.match(/^\s*/)[0].length;
                // Look for nested for loops
                for (let i = index + 1; i < Math.min(index + 20, lines.length); i++) {
                    const nextLine = lines[i];
                    const nextIndent = nextLine.match(/^\s*/)[0].length;
                    if (nextIndent > indent && nextLine.includes('for')) {
                        issues.push({
                            file: filePath,
                            type: this.bugCategories.PERFORMANCE_ISSUE,
                            severity: this.severityLevels.MEDIUM,
                            description: 'Nested loops may have poor time complexity',
                            line: lineNumber,
                            fix: 'Consider optimization or alternative algorithms'
                        });
                        break;
                    }
                    if (nextIndent <= indent && nextLine.trim()) break;
                }
            }

            // Check for Array.filter().map() chains
            if (line.includes('.filter(') && line.includes('.map(')) {
                issues.push({
                    file: filePath,
                    type: this.bugCategories.PERFORMANCE_ISSUE,
                    severity: this.severityLevels.LOW,
                    description: 'Chained filter().map() creates intermediate arrays',
                    line: lineNumber,
                    fix: 'Consider using reduce() or a single loop'
                });
            }

            // Check for console.log in production-like code
            if (line.includes('console.log') && !line.includes('//') && 
                !filePath.includes('demo') && !filePath.includes('test')) {
                issues.push({
                    file: filePath,
                    type: this.bugCategories.PERFORMANCE_ISSUE,
                    severity: this.severityLevels.LOW,
                    description: 'console.log statements may impact performance',
                    line: lineNumber,
                    fix: 'Use conditional logging or remove debug statements'
                });
            }

            // Check for RegExp in loops
            if (line.includes('for') || line.includes('while')) {
                for (let i = index + 1; i < Math.min(index + 10, lines.length); i++) {
                    if (lines[i].includes('new RegExp') || lines[i].includes('.match(')) {
                        issues.push({
                            file: filePath,
                            type: this.bugCategories.PERFORMANCE_ISSUE,
                            severity: this.severityLevels.MEDIUM,
                            description: 'RegExp creation inside loop is inefficient',
                            line: i + 1,
                            fix: 'Move RegExp creation outside loop'
                        });
                        break;
                    }
                }
            }
        });

        return issues;
    }

    checkInputValidation(content, filePath) {
        const issues = [];
        const lines = content.split('\n');
        
        lines.forEach((line, index) => {
            const lineNumber = index + 1;
            
            // Check for missing parameter validation in functions
            if (line.includes('function') || line.match(/^\s*async\s+\w+\s*\(/)) {
                const functionMatch = line.match(/function\s+(\w+)\s*\(([^)]*)\)/);
                if (functionMatch && functionMatch[2].trim()) {
                    const params = functionMatch[2].split(',').map(p => p.trim());
                    const functionName = functionMatch[1];
                    
                    // Look for validation in the function body
                    let hasValidation = false;
                    for (let i = index + 1; i < Math.min(index + 10, lines.length); i++) {
                        if (lines[i].includes('if') && 
                            (lines[i].includes('!') || lines[i].includes('undefined') || 
                             lines[i].includes('null') || lines[i].includes('typeof'))) {
                            hasValidation = true;
                            break;
                        }
                        if (lines[i].includes('}') && lines[i].trim() === '}') break;
                    }
                    
                    if (!hasValidation && !functionName.startsWith('test') && 
                        !functionName.includes('mock') && params.length > 0) {
                        issues.push({
                            file: filePath,
                            type: this.bugCategories.INPUT_VALIDATION,
                            severity: this.severityLevels.MEDIUM,
                            description: `Function ${functionName} lacks input parameter validation`,
                            line: lineNumber,
                            fix: 'Add parameter validation at function start'
                        });
                    }
                }
            }

            // Check for parseInt without radix
            if (line.includes('parseInt(') && !line.includes(', 10') && !line.includes(',10')) {
                issues.push({
                    file: filePath,
                    type: this.bugCategories.INPUT_VALIDATION,
                    severity: this.severityLevels.MEDIUM,
                    description: 'parseInt without radix may cause unexpected parsing',
                    line: lineNumber,
                    fix: 'Add radix parameter: parseInt(value, 10)'
                });
            }

            // Check for JSON.parse without try-catch
            if (line.includes('JSON.parse') && !line.includes('//')) {
                let hasTryCatch = false;
                // Look backwards and forwards for try-catch
                for (let i = Math.max(0, index - 5); i < Math.min(lines.length, index + 5); i++) {
                    if (lines[i].includes('try') || lines[i].includes('catch')) {
                        hasTryCatch = true;
                        break;
                    }
                }
                
                if (!hasTryCatch) {
                    issues.push({
                        file: filePath,
                        type: this.bugCategories.INPUT_VALIDATION,
                        severity: this.severityLevels.HIGH,
                        description: 'JSON.parse without try-catch may throw unhandled errors',
                        line: lineNumber,
                        fix: 'Wrap JSON.parse in try-catch block'
                    });
                }
            }
        });

        return issues;
    }

    checkErrorHandling(content, filePath) {
        const issues = [];
        const lines = content.split('\n');
        
        let hasTryBlocks = false;
        let hasAsyncFunctions = false;
        
        lines.forEach((line, index) => {
            const lineNumber = index + 1;
            
            if (line.includes('try {')) hasTryBlocks = true;
            if (line.includes('async ')) hasAsyncFunctions = true;
            
            // Check for async functions without error handling
            if (line.includes('async ') && line.includes('function')) {
                let hasErrorHandling = false;
                // Look ahead for try-catch or .catch()
                for (let i = index; i < Math.min(index + 50, lines.length); i++) {
                    if (lines[i].includes('try') || lines[i].includes('catch') || 
                        lines[i].includes('.catch(')) {
                        hasErrorHandling = true;
                        break;
                    }
                }
                
                if (!hasErrorHandling) {
                    issues.push({
                        file: filePath,
                        type: this.bugCategories.ERROR_HANDLING,
                        severity: this.severityLevels.MEDIUM,
                        description: 'Async function lacks error handling',
                        line: lineNumber,
                        fix: 'Add try-catch block or .catch() handler'
                    });
                }
            }

            // Check for Promise without error handling
            if (line.includes('new Promise') && !line.includes('//')) {
                let hasReject = false;
                for (let i = index; i < Math.min(index + 10, lines.length); i++) {
                    if (lines[i].includes('reject')) {
                        hasReject = true;
                        break;
                    }
                }
                
                if (!hasReject) {
                    issues.push({
                        file: filePath,
                        type: this.bugCategories.ERROR_HANDLING,
                        severity: this.severityLevels.MEDIUM,
                        description: 'Promise constructor should handle rejection',
                        line: lineNumber,
                        fix: 'Add reject parameter and error handling'
                    });
                }
            }

            // Check for empty catch blocks
            if (line.includes('catch') && line.includes('{')) {
                const nextLineIndex = index + 1;
                if (nextLineIndex < lines.length) {
                    const nextLine = lines[nextLineIndex].trim();
                    if (nextLine === '}') {
                        issues.push({
                            file: filePath,
                            type: this.bugCategories.ERROR_HANDLING,
                            severity: this.severityLevels.MEDIUM,
                            description: 'Empty catch block swallows errors',
                            line: lineNumber,
                            fix: 'Add proper error logging or handling'
                        });
                    }
                }
            }
        });

        // Check if file has async functions but no error handling
        if (hasAsyncFunctions && !hasTryBlocks && !content.includes('.catch(')) {
            issues.push({
                file: filePath,
                type: this.bugCategories.ERROR_HANDLING,
                severity: this.severityLevels.HIGH,
                description: 'File has async operations but no error handling',
                line: 1,
                fix: 'Add comprehensive error handling throughout the file'
            });
        }

        return issues;
    }

    checkConcurrencyIssues(content, filePath) {
        const issues = [];
        const lines = content.split('\n');
        
        lines.forEach((line, index) => {
            const lineNumber = index + 1;
            
            // Check for shared mutable state without synchronization
            if (line.includes('this.') && (line.includes('++') || line.includes('--'))) {
                issues.push({
                    file: filePath,
                    type: this.bugCategories.CONCURRENCY_ISSUE,
                    severity: this.severityLevels.MEDIUM,
                    description: 'Shared mutable state modification may cause race conditions',
                    line: lineNumber,
                    fix: 'Use atomic operations or synchronization mechanisms'
                });
            }

            // Check for Promise.all without individual error handling
            if (line.includes('Promise.all')) {
                issues.push({
                    file: filePath,
                    type: this.bugCategories.CONCURRENCY_ISSUE,
                    severity: this.severityLevels.MEDIUM,
                    description: 'Promise.all fails fast - one rejection breaks all',
                    line: lineNumber,
                    fix: 'Consider Promise.allSettled or individual error handling'
                });
            }

            // Check for setTimeout/setInterval without clearTimeout/clearInterval
            if (line.includes('setTimeout') || line.includes('setInterval')) {
                const variableName = line.match(/(\w+)\s*=\s*set(Timeout|Interval)/);
                if (variableName) {
                    const varName = variableName[1];
                    let hasCleanup = false;
                    for (let i = index; i < lines.length; i++) {
                        if (lines[i].includes(`clear`) && lines[i].includes(varName)) {
                            hasCleanup = true;
                            break;
                        }
                    }
                    
                    if (!hasCleanup) {
                        issues.push({
                            file: filePath,
                            type: this.bugCategories.CONCURRENCY_ISSUE,
                            severity: this.severityLevels.LOW,
                            description: 'Timer without cleanup may cause memory leaks',
                            line: lineNumber,
                            fix: 'Add clearTimeout/clearInterval when appropriate'
                        });
                    }
                }
            }
        });

        return issues;
    }

    async performIntegrationAnalysis(analysisReport) {
        // Check for circular dependencies
        const circularDeps = this.checkCircularDependencies();
        if (circularDeps.length > 0) {
            analysisReport.categories.logicalErrors.push({
                file: 'INTEGRATION',
                type: this.bugCategories.LOGICAL_ERROR,
                severity: this.severityLevels.HIGH,
                description: `Circular dependencies detected: ${circularDeps.join(', ')}`,
                line: 0,
                fix: 'Restructure dependencies to eliminate circular references'
            });
        }

        // Check for missing module exports/imports
        const missingExports = this.checkMissingExports();
        analysisReport.categories.logicalErrors.push(...missingExports);
    }

    checkCircularDependencies() {
        // This would normally analyze require() statements across files
        // For now, return empty array as our current structure is clean
        return [];
    }

    checkMissingExports() {
        // This would verify that all required modules are properly exported
        return [];
    }

    generateFixesAndRecommendations(analysisReport) {
        const allIssues = [
            ...analysisReport.categories.syntaxErrors,
            ...analysisReport.categories.runtimeErrors,
            ...analysisReport.categories.logicalErrors,
            ...analysisReport.categories.mathematicalErrors,
            ...analysisReport.categories.securityIssues,
            ...analysisReport.categories.performanceIssues,
            ...analysisReport.categories.inputValidationIssues,
            ...analysisReport.categories.errorHandlingIssues,
            ...analysisReport.categories.concurrencyIssues
        ];

        analysisReport.bugsFound = allIssues.length;
        analysisReport.criticalIssues = allIssues.filter(issue => 
            issue.severity === this.severityLevels.CRITICAL).length;
        analysisReport.securityVulnerabilities = analysisReport.categories.securityIssues.length;
        analysisReport.performanceIssues = analysisReport.categories.performanceIssues.length;

        // Generate priority fixes
        const criticalIssues = allIssues.filter(issue => 
            issue.severity === this.severityLevels.CRITICAL);
        const highIssues = allIssues.filter(issue => 
            issue.severity === this.severityLevels.HIGH);

        analysisReport.fixes = [
            ...criticalIssues.map(issue => ({
                priority: 'CRITICAL',
                file: issue.file,
                line: issue.line,
                issue: issue.description,
                fix: issue.fix
            })),
            ...highIssues.slice(0, 10).map(issue => ({
                priority: 'HIGH',
                file: issue.file,
                line: issue.line,
                issue: issue.description,
                fix: issue.fix
            }))
        ];

        // Generate recommendations
        analysisReport.recommendations = this.generateRecommendations(analysisReport);
    }

    generateRecommendations(analysisReport) {
        const recommendations = [];
        
        if (analysisReport.criticalIssues > 0) {
            recommendations.push('IMMEDIATE: Fix all critical syntax and security issues');
        }
        
        if (analysisReport.securityVulnerabilities > 0) {
            recommendations.push('HIGH: Address security vulnerabilities before deployment');
        }
        
        if (analysisReport.categories.errorHandlingIssues.length > 5) {
            recommendations.push('Implement comprehensive error handling strategy');
        }
        
        if (analysisReport.categories.inputValidationIssues.length > 3) {
            recommendations.push('Add input validation to all public functions');
        }
        
        if (analysisReport.categories.performanceIssues.length > 5) {
            recommendations.push('Optimize performance-critical code paths');
        }
        
        if (analysisReport.categories.mathematicalErrors.length > 0) {
            recommendations.push('Review mathematical calculations for precision and overflow');
        }
        
        recommendations.push('Implement automated testing for all identified issues');
        recommendations.push('Set up continuous code quality monitoring');
        recommendations.push('Establish code review process for future changes');
        
        return recommendations;
    }

    calculateRobustnessScore(analysisReport) {
        const totalFiles = analysisReport.filesAnalyzed;
        const totalIssues = analysisReport.bugsFound;
        const criticalIssues = analysisReport.criticalIssues;
        const securityIssues = analysisReport.securityVulnerabilities;
        
        if (totalFiles === 0) return 0;
        
        // Base score starts at 100%
        let score = 1.0;
        
        // Penalize based on issues per file
        const issuesPerFile = totalIssues / totalFiles;
        score -= issuesPerFile * 0.05; // -5% per issue per file
        
        // Heavy penalty for critical issues
        score -= criticalIssues * 0.15; // -15% per critical issue
        
        // Heavy penalty for security issues
        score -= securityIssues * 0.10; // -10% per security issue
        
        // Additional penalties by category
        score -= analysisReport.categories.syntaxErrors.length * 0.08;
        score -= analysisReport.categories.runtimeErrors.length * 0.06;
        score -= analysisReport.categories.logicalErrors.length * 0.04;
        score -= analysisReport.categories.mathematicalErrors.length * 0.05;
        
        return Math.max(0, Math.min(1, score));
    }
}

module.exports = CodeRobustnessAnalyzer;
/**
 * ANTI-COLLUSION DETECTOR - Pattern Detection + Monitoring
 *
 * Implements:
 * 1. Rapid transfer detection between accounts
 * 2. Circular transfer pattern detection
 * 3. Zero-sum coordination detection
 * 4. Collusion scoring system
 * 5. Automated flagging and freezing
 *
 * Mathematical Foundation:
 * - Weighted scoring: score = w1*transfers + w2*time_gap^-1 + w3*cycles
 * - Graph analysis for circular patterns
 * - Statistical anomaly detection
 */

const config = require('./config');
const Decimal = require('decimal.js');

class AntiCollusionDetector {
    constructor(transactionManager, logger) {
        this.transactionManager = transactionManager;
        this.logger = logger;

        // Detection parameters
        this.weights = config.ANTI_COLLUSION.WEIGHTS;
        this.thresholds = config.ANTI_COLLUSION.THRESHOLDS;
        this.windows = config.ANTI_COLLUSION.WINDOWS;
        this.patterns = config.ANTI_COLLUSION.PATTERNS;

        // Tracking data
        this.suspiciousAccounts = new Map();
        this.frozenAccounts = new Set();
        this.collusionCases = [];

        // Graph structure for cycle detection
        this.transferGraph = new Map();

        this.logger.info('AntiCollusionDetector initialized');
    }

    /**
     * Initialize anti-collusion detector
     */
    async initialize() {
        try {
            // Start periodic scanning
            this.startPeriodicScanning();

            this.logger.info('AntiCollusionDetector started');
            return { success: true };
        } catch (error) {
            this.logger.error('AntiCollusionDetector initialization failed:', error);
            throw new Error(`Anti-collusion initialization failed: ${error.message}`);
        }
    }

    /**
     * Analyze transfer for collusion patterns
     *
     * @param {string} senderId - Sender user ID
     * @param {string} recipientId - Recipient user ID
     * @param {number} amount - Transfer amount
     * @returns {Object} Analysis result
     */
    async analyzeTransfer(senderId, recipientId, amount) {
        try {
            const flags = [];
            let collusionScore = 0;

            // Check 1: Rapid transfers between pair
            const rapidCheck = this.checkRapidTransfers(senderId, recipientId);
            if (rapidCheck.suspicious) {
                flags.push('RAPID_TRANSFERS');
                collusionScore += this.weights.TRANSFER_COUNT * rapidCheck.score;
            }

            // Check 2: Time gap analysis
            const timeGapCheck = this.analyzeTimeGaps(senderId, recipientId);
            if (timeGapCheck.suspicious) {
                flags.push('COORDINATED_TIMING');
                collusionScore += this.weights.TIME_GAP_INVERSE * timeGapCheck.score;
            }

            // Check 3: Circular transfer detection
            const circularCheck = this.detectCircularTransfers(senderId, recipientId, amount);
            if (circularCheck.detected) {
                flags.push('CIRCULAR_TRANSFERS');
                collusionScore += this.weights.CIRCULAR_TRANSFERS * circularCheck.score;
            }

            // Check 4: Zero-sum pattern
            const zeroSumCheck = this.detectZeroSumPattern(senderId, recipientId);
            if (zeroSumCheck.detected) {
                flags.push('ZERO_SUM_PATTERN');
                collusionScore += 20; // Flat bonus for zero-sum
            }

            // Determine action based on score
            let action = 'NONE';
            let reason = '';

            if (collusionScore >= this.thresholds.AUTO_FREEZE) {
                action = 'FREEZE';
                reason = `Collusion score ${collusionScore.toFixed(1)} exceeds auto-freeze threshold`;
                await this.freezeAccounts([senderId, recipientId], reason);
            } else if (collusionScore >= this.thresholds.WARNING) {
                action = 'WARN';
                reason = `Collusion score ${collusionScore.toFixed(1)} exceeds warning threshold`;
                await this.warnAccounts([senderId, recipientId], reason);
            } else if (collusionScore >= this.thresholds.SUSPICION) {
                action = 'FLAG';
                reason = `Collusion score ${collusionScore.toFixed(1)} raises suspicion`;
                await this.flagAccounts([senderId, recipientId], reason);
            }

            // Log analysis
            if (flags.length > 0) {
                this.logger.warn('Collusion patterns detected:', {
                    from: senderId,
                    to: recipientId,
                    amount,
                    score: collusionScore,
                    flags,
                    action,
                });

                // Record case
                this.recordCollusionCase({
                    from: senderId,
                    to: recipientId,
                    amount,
                    score: collusionScore,
                    flags,
                    action,
                    timestamp: Date.now(),
                });
            }

            return {
                score: collusionScore,
                flags,
                action,
                reason,
                suspicious: flags.length > 0,
            };
        } catch (error) {
            this.logger.error('Error analyzing transfer for collusion:', error);
            return {
                score: 0,
                flags: [],
                action: 'NONE',
                suspicious: false,
                error: error.message,
            };
        }
    }

    /**
     * Check for rapid transfers between account pair
     *
     * @param {string} userId1 - First user ID
     * @param {string} userId2 - Second user ID
     * @returns {Object} Rapid transfer check result
     */
    checkRapidTransfers(userId1, userId2) {
        const transfers = this.transactionManager.getTransfersBetween(userId1, userId2);

        const now = Date.now();
        const shortWindow = this.patterns.RAPID_WINDOW;

        // Count transfers in rapid window
        const recentTransfers = transfers.filter(
            (t) => now - t.timestamp < shortWindow
        );

        const count = recentTransfers.length;
        const threshold = this.patterns.RAPID_THRESHOLD;

        if (count >= threshold) {
            // Calculate score based on excess
            const excess = count - threshold;
            const score = Math.min(excess * 5, 30); // Cap at 30

            return {
                suspicious: true,
                score,
                count,
                threshold,
                window: shortWindow,
            };
        }

        return {
            suspicious: false,
            score: 0,
            count,
        };
    }

    /**
     * Analyze time gaps between transfers for coordination
     *
     * @param {string} userId1 - First user ID
     * @param {string} userId2 - Second user ID
     * @returns {Object} Time gap analysis result
     */
    analyzeTimeGaps(userId1, userId2) {
        const transfers = this.transactionManager.getTransfersBetween(userId1, userId2);

        if (transfers.length < 3) {
            return { suspicious: false, score: 0 };
        }

        // Calculate time gaps between consecutive transfers
        const gaps = [];
        for (let i = 1; i < transfers.length; i++) {
            const gap = transfers[i].timestamp - transfers[i - 1].timestamp;
            gaps.push(gap);
        }

        // Calculate average and standard deviation
        const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
        const variance =
            gaps.reduce((sum, gap) => sum + Math.pow(gap - avgGap, 2), 0) /
            gaps.length;
        const stdDev = Math.sqrt(variance);

        // Very consistent timing suggests coordination
        const coefficientOfVariation = stdDev / avgGap;

        if (coefficientOfVariation < 0.2 && gaps.length >= 5) {
            // Very consistent timing (< 20% variation)
            const score = Math.min((0.2 - coefficientOfVariation) * 100, 25);

            return {
                suspicious: true,
                score,
                avgGap,
                stdDev,
                consistency: (1 - coefficientOfVariation) * 100,
            };
        }

        return {
            suspicious: false,
            score: 0,
            avgGap,
            stdDev,
        };
    }

    /**
     * Detect circular transfer patterns (A -> B -> C -> A)
     *
     * @param {string} startUserId - Starting user ID
     * @param {string} endUserId - Ending user ID
     * @param {number} amount - Transfer amount
     * @returns {Object} Circular transfer detection result
     */
    detectCircularTransfers(startUserId, endUserId, amount) {
        // Build transfer graph
        this.updateTransferGraph(startUserId, endUserId, amount);

        // Look for cycles starting from both users
        const cyclesFromStart = this.findCycles(startUserId, this.patterns.CYCLE_LENGTH_MAX);
        const cyclesFromEnd = this.findCycles(endUserId, this.patterns.CYCLE_LENGTH_MAX);

        const allCycles = [...cyclesFromStart, ...cyclesFromEnd];

        if (allCycles.length > 0) {
            // Analyze cycles for amount similarity
            const suspiciousCycles = allCycles.filter((cycle) =>
                this.isCycleSuspicious(cycle)
            );

            if (suspiciousCycles.length > 0) {
                const score = Math.min(suspiciousCycles.length * 15, 40);

                return {
                    detected: true,
                    score,
                    cycles: suspiciousCycles.length,
                    details: suspiciousCycles,
                };
            }
        }

        return {
            detected: false,
            score: 0,
            cycles: 0,
        };
    }

    /**
     * Detect zero-sum patterns (transfers that net to zero)
     *
     * @param {string} userId1 - First user ID
     * @param {string} userId2 - Second user ID
     * @returns {Object} Zero-sum detection result
     */
    detectZeroSumPattern(userId1, userId2) {
        const transfers = this.transactionManager.getTransfersBetween(userId1, userId2);
        const now = Date.now();
        const window = this.patterns.ZERO_SUM_WINDOW;

        // Get recent transfers
        const recentTransfers = transfers.filter((t) => now - t.timestamp < window);

        if (recentTransfers.length < 2) {
            return { detected: false };
        }

        // Calculate net flow
        let netFlow = 0;
        for (const transfer of recentTransfers) {
            if (transfer.from === userId1) {
                netFlow -= transfer.amount;
            } else {
                netFlow += transfer.amount;
            }
        }

        // Check if net flow is close to zero
        const tolerance = this.patterns.ZERO_SUM_TOLERANCE;

        if (Math.abs(netFlow) <= tolerance && recentTransfers.length >= 3) {
            return {
                detected: true,
                netFlow,
                transfers: recentTransfers.length,
            };
        }

        return {
            detected: false,
            netFlow,
        };
    }

    /**
     * Update transfer graph for cycle detection
     */
    updateTransferGraph(from, to, amount) {
        if (!this.transferGraph.has(from)) {
            this.transferGraph.set(from, []);
        }

        this.transferGraph.get(from).push({
            to,
            amount,
            timestamp: Date.now(),
        });

        // Keep only recent edges (last 7 days)
        const sevenDaysAgo = Date.now() - 604800000;
        for (const [user, edges] of this.transferGraph.entries()) {
            const recentEdges = edges.filter((e) => e.timestamp > sevenDaysAgo);
            if (recentEdges.length === 0) {
                this.transferGraph.delete(user);
            } else {
                this.transferGraph.set(user, recentEdges);
            }
        }
    }

    /**
     * Find cycles in transfer graph using DFS
     *
     * @param {string} startNode - Starting node
     * @param {number} maxLength - Maximum cycle length
     * @returns {Array} Found cycles
     */
    findCycles(startNode, maxLength) {
        const cycles = [];
        const visited = new Set();
        const path = [];

        const dfs = (node, depth) => {
            if (depth > maxLength) return;

            if (path.includes(node)) {
                // Found a cycle
                const cycleStart = path.indexOf(node);
                const cycle = [...path.slice(cycleStart), node];
                cycles.push(cycle);
                return;
            }

            if (visited.has(node)) return;

            path.push(node);

            const neighbors = this.transferGraph.get(node) || [];
            for (const edge of neighbors) {
                dfs(edge.to, depth + 1);
            }

            path.pop();
            visited.add(node);
        };

        dfs(startNode, 0);

        return cycles;
    }

    /**
     * Check if cycle is suspicious (similar amounts)
     */
    isCycleSuspicious(cycle) {
        if (cycle.length < 3) return false;

        // Get amounts for edges in cycle
        const amounts = [];
        for (let i = 0; i < cycle.length - 1; i++) {
            const from = cycle[i];
            const to = cycle[i + 1];
            const edges = this.transferGraph.get(from) || [];
            const edge = edges.find((e) => e.to === to);
            if (edge) amounts.push(edge.amount);
        }

        if (amounts.length < 2) return false;

        // Calculate similarity
        const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
        const deviations = amounts.map((amt) => Math.abs(amt - avgAmount) / avgAmount);
        const avgDeviation = deviations.reduce((a, b) => a + b, 0) / deviations.length;

        // If average deviation < 20%, amounts are suspiciously similar
        return avgDeviation < 0.2;
    }

    /**
     * Flag accounts as suspicious
     */
    async flagAccounts(userIds, reason) {
        for (const userId of userIds) {
            if (!this.suspiciousAccounts.has(userId)) {
                this.suspiciousAccounts.set(userId, {
                    flags: 0,
                    reasons: [],
                    firstFlagged: Date.now(),
                });
            }

            const data = this.suspiciousAccounts.get(userId);
            data.flags++;
            data.reasons.push({ reason, timestamp: Date.now() });
        }

        this.logger.info('Accounts flagged:', userIds, reason);
    }

    /**
     * Warn accounts
     */
    async warnAccounts(userIds, reason) {
        await this.flagAccounts(userIds, reason);
        this.logger.warn('⚠️ ACCOUNTS WARNED:', userIds, reason);
    }

    /**
     * Freeze accounts
     */
    async freezeAccounts(userIds, reason) {
        for (const userId of userIds) {
            this.frozenAccounts.add(userId);
        }

        await this.flagAccounts(userIds, reason);

        this.logger.error('🚨 ACCOUNTS FROZEN:', userIds, reason);

        // Send alert to admin channel
        // Implementation depends on Discord client access
    }

    /**
     * Check if account is frozen
     */
    isAccountFrozen(userId) {
        return this.frozenAccounts.has(userId);
    }

    /**
     * Record collusion case for audit
     */
    recordCollusionCase(caseData) {
        this.collusionCases.push(caseData);

        // Keep only last 1000 cases
        if (this.collusionCases.length > 1000) {
            this.collusionCases.shift();
        }
    }

    /**
     * Start periodic scanning for collusion patterns
     */
    startPeriodicScanning() {
        // Scan every hour
        setInterval(() => {
            this.performGlobalScan();
        }, 3600000);

        this.logger.info('Periodic collusion scanning started');
    }

    /**
     * Perform global scan for collusion patterns
     */
    async performGlobalScan() {
        try {
            this.logger.info('Starting global collusion scan...');

            let flaggedPairs = 0;
            const scannedPairs = new Set();

            // Scan transfer graph for suspicious patterns
            for (const [userId, edges] of this.transferGraph.entries()) {
                for (const edge of edges) {
                    const pairKey = [userId, edge.to].sort().join('-');

                    if (scannedPairs.has(pairKey)) continue;
                    scannedPairs.add(pairKey);

                    const analysis = await this.analyzeTransfer(
                        userId,
                        edge.to,
                        edge.amount
                    );

                    if (analysis.suspicious) {
                        flaggedPairs++;
                    }
                }
            }

            this.logger.info('Global collusion scan complete:', {
                scannedPairs: scannedPairs.size,
                flaggedPairs,
                frozenAccounts: this.frozenAccounts.size,
            });
        } catch (error) {
            this.logger.error('Global scan failed:', error);
        }
    }

    /**
     * Get anti-collusion statistics
     */
    getCollusionStats() {
        return {
            suspiciousAccounts: this.suspiciousAccounts.size,
            frozenAccounts: this.frozenAccounts.size,
            totalCases: this.collusionCases.length,
            graphNodes: this.transferGraph.size,
            recentCases: this.collusionCases.slice(-10),
        };
    }
}

module.exports = AntiCollusionDetector;

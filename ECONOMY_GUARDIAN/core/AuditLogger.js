/**
 * AuditLogger - Comprehensive Audit Trail for EconomyGuardian
 * Tracks all actions, decisions, and changes with full accountability
 */

const EventEmitter = require('events');
const crypto = require('crypto');
const logger = require('../../UTILS/logger');

class AuditLogger extends EventEmitter {
    constructor(stateManager) {
        super();
        
        this.stateManager = stateManager;
        
        // Audit configuration
        this.logRetentionDays = 90; // Keep logs for 90 days
        this.maxLogSize = 1000; // Maximum entries per log type
        this.enableRealTimeLogging = true;
        
        // Audit categories
        this.categories = {
            SYSTEM: 'system',        // System startup, shutdown, configuration
            ANALYSIS: 'analysis',    // AI analysis events
            PROPOSAL: 'proposal',    // Proposal creation and management
            APPROVAL: 'approval',    // Human approval actions
            EXECUTION: 'execution',  // Proposal execution
            GUARDRAIL: 'guardrail',  // Safety violations and protections
            METRICS: 'metrics',      // Metrics collection and alerts
            ERROR: 'error',          // Errors and failures
            SECURITY: 'security',    // Security-related events
            CONFIGURATION: 'config'  // Configuration changes
        };
        
        // In-memory log buffers
        this.logBuffers = new Map();
        this.logSequence = 0;
        
        // Initialize buffers
        for (const category of Object.values(this.categories)) {
            this.logBuffers.set(category, []);
        }
    }

    async initialize() {
        try {
            logger.info('Initializing AuditLogger...');
            
            // Load existing logs
            await this.loadExistingLogs();
            
            // Set up periodic log persistence
            this.setupPeriodicPersistence();
            
            // Log initialization
            await this.log(this.categories.SYSTEM, 'AuditLogger initialized', {
                retentionDays: this.logRetentionDays,
                maxLogSize: this.maxLogSize,
                categories: Object.keys(this.categories).length
            });
            
            logger.info('AuditLogger initialized successfully');
            return true;
            
        } catch (error) {
            logger.error(`AuditLogger initialization failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Log an audit event
     */
    async log(category, event, data = {}, metadata = {}) {
        try {
            // Validate category
            if (!Object.values(this.categories).includes(category)) {
                logger.warn(`Invalid audit category: ${category}`);
                category = this.categories.SYSTEM;
            }
            
            // Create audit entry
            const entry = this.createAuditEntry(category, event, data, metadata);
            
            // Add to buffer
            const buffer = this.logBuffers.get(category);
            buffer.push(entry);
            
            // Maintain buffer size
            if (buffer.length > this.maxLogSize) {
                buffer.shift(); // Remove oldest entry
            }
            
            // Real-time logging to main logger
            if (this.enableRealTimeLogging) {
                const logLevel = this.getLogLevel(category, metadata.severity);
                logger[logLevel](`[AUDIT:${category.toUpperCase()}] ${event}`, {
                    auditId: entry.id,
                    data: Object.keys(data).length > 0 ? data : undefined
                });
            }
            
            // Emit event for real-time monitoring
            this.emit('auditEntry', entry);
            
            // Critical events get immediate persistence
            if (metadata.severity === 'critical' || category === this.categories.ERROR) {
                await this.persistLogs(category);
            }
            
            return entry.id;
            
        } catch (error) {
            logger.error(`Audit logging failed: ${error.message}`);
            // Don't throw - audit failures shouldn't break the system
        }
    }

    /**
     * Create structured audit entry
     */
    createAuditEntry(category, event, data, metadata) {
        const timestamp = new Date();
        const entry = {
            id: this.generateAuditId(),
            sequence: ++this.logSequence,
            timestamp: timestamp.toISOString(),
            timestampMs: timestamp.getTime(),
            
            // Event information
            category,
            event,
            data: this.sanitizeData(data),
            
            // Metadata
            severity: metadata.severity || this.inferSeverity(category, event),
            source: metadata.source || 'EconomyGuardian',
            userId: metadata.userId || null,
            sessionId: metadata.sessionId || null,
            correlationId: metadata.correlationId || null,
            
            // Context
            systemState: metadata.includeSystemState ? this.getCurrentSystemState() : null,
            
            // Integrity
            hash: null // Will be calculated after entry is complete
        };
        
        // Calculate integrity hash
        entry.hash = this.calculateEntryHash(entry);
        
        return entry;
    }

    /**
     * Generate unique audit ID
     */
    generateAuditId() {
        const timestamp = Date.now().toString(36);
        const random = crypto.randomBytes(4).toString('hex');
        return `AUD_${timestamp}_${random}`;
    }

    /**
     * Calculate hash for entry integrity
     */
    calculateEntryHash(entry) {
        // Create hash without the hash field itself
        const entryForHash = { ...entry };
        delete entryForHash.hash;
        
        const content = JSON.stringify(entryForHash, Object.keys(entryForHash).sort());
        return crypto.createHash('sha256').update(content).digest('hex');
    }

    /**
     * Verify entry integrity
     */
    verifyEntryIntegrity(entry) {
        if (!entry.hash) return false;
        
        const expectedHash = this.calculateEntryHash(entry);
        return entry.hash === expectedHash;
    }

    /**
     * Sanitize data to remove sensitive information
     */
    sanitizeData(data) {
        if (!data || typeof data !== 'object') return data;
        
        const sanitized = { ...data };
        const sensitiveFields = ['password', 'token', 'key', 'secret', 'apiKey'];
        
        for (const field of sensitiveFields) {
            if (field in sanitized) {
                sanitized[field] = '[REDACTED]';
            }
        }
        
        // Recursively sanitize nested objects
        for (const [key, value] of Object.entries(sanitized)) {
            if (value && typeof value === 'object') {
                sanitized[key] = this.sanitizeData(value);
            }
        }
        
        return sanitized;
    }

    /**
     * Infer log severity from category and event
     */
    inferSeverity(category, event) {
        const eventLower = event.toLowerCase();
        
        if (eventLower.includes('error') || eventLower.includes('failed') || 
            eventLower.includes('emergency') || category === this.categories.ERROR) {
            return 'critical';
        }
        
        if (eventLower.includes('warn') || eventLower.includes('violation') ||
            eventLower.includes('rejected')) {
            return 'warning';
        }
        
        if (category === this.categories.EXECUTION || category === this.categories.APPROVAL) {
            return 'high';
        }
        
        return 'info';
    }

    /**
     * Get appropriate log level for main logger
     */
    getLogLevel(category, severity) {
        switch (severity) {
            case 'critical': return 'error';
            case 'warning': return 'warn';
            case 'high': return 'info';
            default: return 'debug';
        }
    }

    /**
     * Get current system state snapshot
     */
    getCurrentSystemState() {
        return {
            timestamp: new Date().toISOString(),
            memoryUsage: process.memoryUsage(),
            uptime: process.uptime(),
            nodeVersion: process.version,
            pid: process.pid
        };
    }

    /**
     * Query audit logs
     */
    async query(options = {}) {
        try {
            const {
                category = null,
                startTime = null,
                endTime = null,
                severity = null,
                event = null,
                userId = null,
                correlationId = null,
                limit = 100,
                offset = 0
            } = options;
            
            let results = [];
            
            // Determine which categories to search
            const categoriesToSearch = category ? [category] : Object.values(this.categories);
            
            // Collect entries from all relevant categories
            for (const cat of categoriesToSearch) {
                const buffer = this.logBuffers.get(cat) || [];
                results.push(...buffer);
            }
            
            // Apply filters
            results = results.filter(entry => {
                if (startTime && entry.timestampMs < new Date(startTime).getTime()) return false;
                if (endTime && entry.timestampMs > new Date(endTime).getTime()) return false;
                if (severity && entry.severity !== severity) return false;
                if (event && !entry.event.toLowerCase().includes(event.toLowerCase())) return false;
                if (userId && entry.userId !== userId) return false;
                if (correlationId && entry.correlationId !== correlationId) return false;
                
                return true;
            });
            
            // Sort by timestamp (newest first)
            results.sort((a, b) => b.timestampMs - a.timestampMs);
            
            // Apply pagination
            const total = results.length;
            results = results.slice(offset, offset + limit);
            
            return {
                entries: results,
                total,
                returned: results.length,
                offset,
                limit
            };
            
        } catch (error) {
            logger.error(`Audit query failed: ${error.message}`);
            return { entries: [], total: 0, returned: 0, error: error.message };
        }
    }

    /**
     * Generate audit report
     */
    async generateReport(timeframe = '24h', categories = null) {
        try {
            const endTime = new Date();
            const startTime = new Date();
            
            // Calculate start time based on timeframe
            switch (timeframe) {
                case '1h': startTime.setHours(startTime.getHours() - 1); break;
                case '24h': startTime.setDate(startTime.getDate() - 1); break;
                case '7d': startTime.setDate(startTime.getDate() - 7); break;
                case '30d': startTime.setDate(startTime.getDate() - 30); break;
                default: startTime.setHours(startTime.getHours() - 24);
            }
            
            // Query logs
            const queryResult = await this.query({
                startTime: startTime.toISOString(),
                endTime: endTime.toISOString(),
                limit: 10000 // Large limit for report
            });
            
            const entries = queryResult.entries;
            
            // Generate statistics
            const categoryStats = {};
            const severityStats = {};
            const timelineStats = {};
            
            for (const entry of entries) {
                // Category stats
                categoryStats[entry.category] = (categoryStats[entry.category] || 0) + 1;
                
                // Severity stats
                severityStats[entry.severity] = (severityStats[entry.severity] || 0) + 1;
                
                // Timeline stats (by hour)
                const hour = new Date(entry.timestamp).toISOString().substring(0, 13);
                timelineStats[hour] = (timelineStats[hour] || 0) + 1;
            }
            
            // Find notable events
            const criticalEvents = entries.filter(e => e.severity === 'critical').slice(0, 10);
            const frequentEvents = this.getFrequentEvents(entries, 5);
            
            const report = {
                metadata: {
                    generatedAt: new Date().toISOString(),
                    timeframe,
                    startTime: startTime.toISOString(),
                    endTime: endTime.toISOString(),
                    totalEntries: entries.length
                },
                
                statistics: {
                    byCategory: categoryStats,
                    bySeverity: severityStats,
                    timeline: timelineStats
                },
                
                highlights: {
                    criticalEvents: criticalEvents.map(e => ({
                        id: e.id,
                        timestamp: e.timestamp,
                        event: e.event,
                        category: e.category
                    })),
                    frequentEvents
                },
                
                integrity: {
                    totalVerified: 0,
                    totalFailed: 0,
                    verificationRate: 0
                }
            };
            
            // Verify integrity of sample entries
            const sampleSize = Math.min(100, entries.length);
            const sample = entries.slice(0, sampleSize);
            
            for (const entry of sample) {
                if (this.verifyEntryIntegrity(entry)) {
                    report.integrity.totalVerified++;
                } else {
                    report.integrity.totalFailed++;
                }
            }
            
            report.integrity.verificationRate = sampleSize > 0 ? 
                (report.integrity.totalVerified / sampleSize) * 100 : 100;
            
            return report;
            
        } catch (error) {
            logger.error(`Report generation failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get frequent events for reporting
     */
    getFrequentEvents(entries, limit = 5) {
        const eventCounts = {};
        
        for (const entry of entries) {
            const key = `${entry.category}:${entry.event}`;
            eventCounts[key] = (eventCounts[key] || 0) + 1;
        }
        
        return Object.entries(eventCounts)
            .sort(([,a], [,b]) => b - a)
            .slice(0, limit)
            .map(([event, count]) => {
                const [category, eventName] = event.split(':');
                return { category, event: eventName, count };
            });
    }

    /**
     * Setup periodic log persistence
     */
    setupPeriodicPersistence() {
        // Persist logs every 5 minutes
        this.persistTimer = setInterval(async () => {
            try {
                await this.persistAllLogs();
            } catch (error) {
                logger.error(`Periodic log persistence failed: ${error.message}`);
            }
        }, 5 * 60 * 1000);
    }

    /**
     * Persist logs to storage
     */
    async persistLogs(category) {
        try {
            const buffer = this.logBuffers.get(category);
            if (!buffer || buffer.length === 0) return;
            
            const stateKey = `audit_logs_${category}`;
            const existingLogs = await this.stateManager.loadState(stateKey) || [];
            
            // Merge with existing logs
            const allLogs = [...existingLogs, ...buffer];
            
            // Apply retention policy
            const cutoffTime = Date.now() - (this.logRetentionDays * 24 * 60 * 60 * 1000);
            const retainedLogs = allLogs.filter(entry => entry.timestampMs > cutoffTime);
            
            // Save to storage
            await this.stateManager.saveState(stateKey, retainedLogs);
            
            // Clear buffer
            this.logBuffers.set(category, []);
            
            logger.debug(`Persisted ${buffer.length} audit logs for category: ${category}`);
            
        } catch (error) {
            logger.error(`Failed to persist audit logs for ${category}: ${error.message}`);
        }
    }

    /**
     * Persist all log categories
     */
    async persistAllLogs() {
        const persistPromises = [];
        
        for (const category of Object.values(this.categories)) {
            persistPromises.push(this.persistLogs(category));
        }
        
        await Promise.all(persistPromises);
        logger.debug('All audit logs persisted');
    }

    /**
     * Load existing logs from storage
     */
    async loadExistingLogs() {
        let totalLoaded = 0;
        
        for (const category of Object.values(this.categories)) {
            try {
                const stateKey = `audit_logs_${category}`;
                const logs = await this.stateManager.loadState(stateKey);
                
                if (logs && Array.isArray(logs)) {
                    // Apply retention policy
                    const cutoffTime = Date.now() - (this.logRetentionDays * 24 * 60 * 60 * 1000);
                    const validLogs = logs.filter(entry => entry.timestampMs > cutoffTime);
                    
                    // Keep only most recent entries within buffer limit
                    validLogs.sort((a, b) => b.timestampMs - a.timestampMs);
                    const recentLogs = validLogs.slice(0, this.maxLogSize);
                    
                    this.logBuffers.set(category, recentLogs);
                    totalLoaded += recentLogs.length;
                    
                    // Update sequence counter
                    for (const log of recentLogs) {
                        if (log.sequence > this.logSequence) {
                            this.logSequence = log.sequence;
                        }
                    }
                }
            } catch (error) {
                logger.warn(`Failed to load existing logs for ${category}: ${error.message}`);
            }
        }
        
        logger.info(`Loaded ${totalLoaded} existing audit log entries`);
    }

    /**
     * Export audit logs
     */
    async exportLogs(options = {}) {
        const {
            format = 'json',
            categories = null,
            timeframe = null
        } = options;
        
        const queryOptions = { limit: 50000 }; // Large export limit
        
        if (categories) {
            queryOptions.category = categories;
        }
        
        if (timeframe) {
            const endTime = new Date();
            const startTime = new Date();
            startTime.setDate(startTime.getDate() - parseInt(timeframe));
            
            queryOptions.startTime = startTime.toISOString();
            queryOptions.endTime = endTime.toISOString();
        }
        
        const result = await this.query(queryOptions);
        
        if (format === 'csv') {
            return this.convertToCSV(result.entries);
        }
        
        return {
            metadata: {
                exportedAt: new Date().toISOString(),
                totalEntries: result.total,
                exportedEntries: result.returned
            },
            entries: result.entries
        };
    }

    /**
     * Convert logs to CSV format
     */
    convertToCSV(entries) {
        if (entries.length === 0) return '';
        
        const headers = ['timestamp', 'category', 'event', 'severity', 'data'];
        const rows = entries.map(entry => [
            entry.timestamp,
            entry.category,
            entry.event,
            entry.severity,
            JSON.stringify(entry.data)
        ]);
        
        return [headers, ...rows]
            .map(row => row.map(cell => `"${cell}"`).join(','))
            .join('\n');
    }

    /**
     * Cleanup and shutdown
     */
    async shutdown() {
        if (this.persistTimer) {
            clearInterval(this.persistTimer);
        }
        
        // Final persistence of all logs
        await this.persistAllLogs();
        
        await this.log(this.categories.SYSTEM, 'AuditLogger shutting down', {
            totalSequence: this.logSequence
        });
        
        logger.info('AuditLogger shut down gracefully');
    }

    /**
     * Get audit statistics
     */
    getStatistics() {
        const stats = {
            categories: {},
            totalEntries: 0,
            currentSequence: this.logSequence
        };
        
        for (const [category, buffer] of this.logBuffers) {
            stats.categories[category] = buffer.length;
            stats.totalEntries += buffer.length;
        }
        
        return stats;
    }
}

module.exports = AuditLogger;
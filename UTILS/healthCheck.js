/**
 * Health Check Server for ATIVE Casino Bot
 * Provides health check endpoint for Railway deployment monitoring
 * Uses built-in Node.js HTTP module to avoid Express dependency
 */

const http = require('http');
const url = require('url');
const logger = require('./logger');

class HealthCheckServer {
    constructor(client) {
        this.client = client;
        this.server = null;
    }

    createHandler() {
        return (req, res) => {
            const parsedUrl = url.parse(req.url, true);
            const pathname = parsedUrl.pathname;

            // Set CORS headers
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
            res.setHeader('Content-Type', 'application/json');

            try {
                switch (pathname) {
                    case '/health':
                        this.handleHealth(req, res);
                        break;
                    case '/ready':
                        this.handleReady(req, res);
                        break;
                    case '/metrics':
                        this.handleMetrics(req, res);
                        break;
                    case '/':
                        this.handleRoot(req, res);
                        break;
                    default:
                        res.writeHead(404);
                        res.end(JSON.stringify({ error: 'Not Found' }));
                }
            } catch (error) {
                logger.error(`Health check error: ${error.message}`);
                res.writeHead(500);
                res.end(JSON.stringify({ error: 'Internal Server Error' }));
            }
        };
    }

    handleHealth(req, res) {
        const healthData = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            botStatus: this.client && this.client.isReady() ? 'online' : 'offline',
            pid: process.pid,
            memory: process.memoryUsage(),
            version: process.env.npm_package_version || '1.0.0',
            environment: process.env.ENVIRONMENT || 'production'
        };

        // Check if bot is properly connected
        if (this.client && this.client.isReady()) {
            healthData.guilds = this.client.guilds.cache.size;
            healthData.users = this.client.users.cache.size;
            res.writeHead(200);
            res.end(JSON.stringify(healthData, null, 2));
        } else {
            healthData.status = 'unhealthy';
            res.writeHead(503);
            res.end(JSON.stringify(healthData, null, 2));
        }
    }

    handleReady(req, res) {
        if (this.client && this.client.isReady()) {
            const readyData = {
                ready: true,
                timestamp: new Date().toISOString(),
                guilds: this.client.guilds.cache.size
            };
            res.writeHead(200);
            res.end(JSON.stringify(readyData, null, 2));
        } else {
            const notReadyData = {
                ready: false,
                timestamp: new Date().toISOString(),
                message: 'Bot not ready yet'
            };
            res.writeHead(503);
            res.end(JSON.stringify(notReadyData, null, 2));
        }
    }

    handleMetrics(req, res) {
        if (!this.client || !this.client.isReady()) {
            res.writeHead(503);
            res.end(JSON.stringify({ error: 'Bot not ready' }, null, 2));
            return;
        }

        const metrics = {
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            guilds: this.client.guilds.cache.size,
            users: this.client.users.cache.size,
            channels: this.client.channels.cache.size,
            commands: this.client.application?.commands?.cache?.size || 0,
            ping: this.client.ws.ping,
            environment: process.env.ENVIRONMENT || 'production'
        };

        res.writeHead(200);
        res.end(JSON.stringify(metrics, null, 2));
    }

    handleRoot(req, res) {
        const rootData = {
            service: 'ATIVE Casino Bot',
            status: 'running',
            version: process.env.npm_package_version || '1.0.0',
            endpoints: ['/health', '/ready', '/metrics'],
            timestamp: new Date().toISOString()
        };

        res.writeHead(200);
        res.end(JSON.stringify(rootData, null, 2));
    }

    start() {
        const PORT = process.env.PORT || 3000;
        
        this.server = http.createServer(this.createHandler());
        
        this.server.listen(PORT, '0.0.0.0', () => {
            logger.info(`🏥 Health check server running on port ${PORT}`);
        });

        // Handle server errors
        this.server.on('error', (error) => {
            logger.error(`Health check server error: ${error.message}`);
        });

        return this.server;
    }

    stop() {
        if (this.server) {
            this.server.close(() => {
                logger.info('🏥 Health check server stopped');
            });
        }
    }
}

module.exports = HealthCheckServer;
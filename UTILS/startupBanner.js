/**
 * Startup Banner - Beautiful organized startup logging
 */

const logger = require('./logger');

class StartupBanner {
    static showBanner() {
        console.log('\n' + '═'.repeat(80));
        console.log('🎰               ATIVE CASINO BOT - STARTUP SEQUENCE                  🎰');
        console.log('═'.repeat(80));
        console.log('🚀 Version: 3.0.0 | Environment:', process.env.ENVIRONMENT || 'development');
        console.log('💻 Node Version:', process.version);
        console.log('📅 Started:', new Date().toLocaleString());
        console.log('═'.repeat(80) + '\n');
    }

    static logSystemSection(title) {
        console.log('┌─ ' + '─'.repeat(title.length + 2) + ' ┐');
        console.log(`│  ${title}  │`);
        console.log('└─ ' + '─'.repeat(title.length + 2) + ' ┘');
    }

    static showStartupComplete() {
        console.log('\n' + '═'.repeat(80));
        console.log('✅               STARTUP SEQUENCE COMPLETE                           ✅');
        console.log('🎰 ATIVE Casino Bot is now ONLINE and ready for players! 🎰');
        console.log('═'.repeat(80) + '\n');
    }

    static showSystemStatus(systems) {
        console.log('\n📊 SYSTEM STATUS OVERVIEW:');
        console.log('─'.repeat(40));
        
        for (const [system, status] of Object.entries(systems)) {
            const icon = status.online ? '✅' : '❌';
            const statusText = status.online ? 'ONLINE' : 'OFFLINE';
            const padding = ' '.repeat(Math.max(0, 25 - system.length));
            console.log(`${icon} ${system}${padding}${statusText}`);
            
            if (status.details) {
                console.log(`   └─ ${status.details}`);
            }
        }
        console.log('─'.repeat(40) + '\n');
    }

    static showCompactSummary(summary) {
        try {
            const lines = [];
            const pad = (emoji, label, val) => {
                const key = `${emoji} ${(label + ':').padEnd(16, ' ')}`;
                return `${key} ${val}`;
            };

            lines.push('');
            lines.push('📦 STARTUP SUMMARY');
            lines.push('─'.repeat(40));

            if (summary.environment) lines.push(pad('🧭', 'Environment', summary.environment));
            if (summary.version) lines.push(pad('🏷️', 'Version', summary.version));
            if (summary.nodeVersion) lines.push(pad('🧪', 'Node', summary.nodeVersion));
            if (typeof summary.guilds === 'number') lines.push(pad('🏠', 'Guilds', summary.guilds));
            if (typeof summary.commands === 'number') lines.push(pad('🧩', 'Commands Loaded', summary.commands));
            if (typeof summary.games === 'number') lines.push(pad('🎮', 'Games Available', summary.games));

            if (summary.cache) {
                const cacheSize = summary.cache.cacheSize ?? summary.cache.size ?? 0;
                const hitRate = summary.cache.metrics?.hitRate ?? '0%';
                lines.push(pad('🗄️', 'Cache Keys', cacheSize));
                lines.push(pad('📈', 'Cache Hit Rate', hitRate));
            }

            if (summary.db) {
                const dbStatus = summary.db.fallbackMode ? 'FALLBACK' : 'ONLINE';
                lines.push(pad('🛢️', 'Database', dbStatus));
            }

            if (summary.uptime) lines.push(pad('⏱️', 'Uptime', summary.uptime));
            if (summary.memory) lines.push(pad('🧠', 'Memory', summary.memory));

            lines.push('─'.repeat(40));
            console.log(lines.join('\n'));
        } catch (_) {
            // Silent: summary is cosmetic
        }
    }
}

module.exports = StartupBanner;

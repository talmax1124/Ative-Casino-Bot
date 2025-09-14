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
}

module.exports = StartupBanner;
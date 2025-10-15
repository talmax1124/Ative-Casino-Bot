#!/usr/bin/env node
/**
 * Emergency Cache & Security Data Reset Tool
 * Clears inflated daily wins and security alert data
 */

const fs = require('fs');
const path = require('path');

console.log('🧹 Starting emergency cache and security data cleanup...');

// 1. Clear NodeCache data files (if any exist)
try {
    const cachePaths = [
        './cache',
        './temp',
        './logs',
        './.cache',
        './node_modules/.cache'
    ];
    
    for (const cachePath of cachePaths) {
        if (fs.existsSync(cachePath)) {
            console.log(`🗑️ Clearing cache directory: ${cachePath}`);
            fs.rmSync(cachePath, { recursive: true, force: true });
        }
    }
} catch (error) {
    console.log(`⚠️ Cache cleanup warning: ${error.message}`);
}

// 2. Clear ML_DATA files that might contain game statistics
try {
    const mlDataPath = './ML_DATA';
    if (fs.existsSync(mlDataPath)) {
        console.log('🗑️ Clearing ML game data files...');
        const files = fs.readdirSync(mlDataPath);
        for (const file of files) {
            if (file.endsWith('.json')) {
                fs.unlinkSync(path.join(mlDataPath, file));
                console.log(`   ✅ Deleted: ${file}`);
            }
        }
    }
} catch (error) {
    console.log(`⚠️ ML data cleanup warning: ${error.message}`);
}

// 3. Clear validation reports (may contain security data)
try {
    const validationPath = './validation-reports';
    if (fs.existsSync(validationPath)) {
        console.log('🗑️ Clearing validation reports...');
        fs.rmSync(validationPath, { recursive: true, force: true });
    }
} catch (error) {
    console.log(`⚠️ Validation reports cleanup warning: ${error.message}`);
}

// 4. Clear any log files
try {
    const logPatterns = ['*.log', '*.log.*'];
    console.log('🗑️ Clearing log files...');
    
    function clearLogsInDir(dir) {
        if (!fs.existsSync(dir)) return;
        
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            
            if (stat.isDirectory()) {
                clearLogsInDir(filePath);
            } else if (file.endsWith('.log') || file.includes('.log.')) {
                fs.unlinkSync(filePath);
                console.log(`   ✅ Deleted log: ${file}`);
            }
        }
    }
    
    clearLogsInDir('.');
} catch (error) {
    console.log(`⚠️ Log cleanup warning: ${error.message}`);
}

// 5. Clear any persistent security state files
try {
    const securityFiles = [
        './security-state.json',
        './emergency-mode.json',
        './threat-database.json',
        './security-alerts.json',
        './daily-wins-tracking.json'
    ];
    
    for (const file of securityFiles) {
        if (fs.existsSync(file)) {
            fs.unlinkSync(file);
            console.log(`🗑️ Deleted security file: ${file}`);
        }
    }
} catch (error) {
    console.log(`⚠️ Security files cleanup warning: ${error.message}`);
}

console.log('');
console.log('✅ Emergency cleanup completed!');
console.log('🔄 Restart your bot to clear in-memory cache');
console.log('🛡️ Security alerts should be reset');
console.log('📊 Daily wins tracking will start fresh');
console.log('');
console.log('Next steps:');
console.log('1. Stop your bot');
console.log('2. Run this script');
console.log('3. Restart your bot');
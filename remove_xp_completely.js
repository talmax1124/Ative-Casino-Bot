/**
 * Complete XP system removal script
 * Removes all XP functionality from the main casino bot
 */

const fs = require('fs');
const path = require('path');

// Files to clean of XP system calls
const filesToClean = [
    'index.js',
    'COMMANDS/sportbet.js',
    'COMMANDS/wordchain.js', 
    'GAMES/crash.js',
    'COMMANDS/slots.js',
    'COMMANDS/blackjack.js',
    'COMMANDS/uno.js',
    'COMMANDS/mines.js',
    'COMMANDS/treasurevault.js',
    'COMMANDS/roulette.js',
    'COMMANDS/multi-slots.js',
    'COMMANDS/plinko.js',
    'COMMANDS/fishing.js',
    'COMMANDS/battleship.js',
    'COMMANDS/yahtzee.js',
    'COMMANDS/rank.js'
];

function removeXPFromFile(filePath) {
    try {
        let content = fs.readFileSync(filePath, 'utf8');
        let updated = false;

        // Remove levelingSystem import
        if (content.includes("require('../UTILS/levelingSystem')") || content.includes("require('./UTILS/levelingSystem')")) {
            content = content.replace(/const\s+levelingSystem\s*=\s*require\([^)]*levelingSystem[^)]*\);\s*/g, '');
            updated = true;
            console.log(`✅ Removed levelingSystem import from ${filePath}`);
        }

        // Remove all XP-related function calls and blocks
        const xpPatterns = [
            // XP awarding calls
            /const\s+xpResult\s*=\s*await\s+levelingSystem\.handleGameComplete[^;]*;?\s*/g,
            /await\s+levelingSystem\.handleGameComplete[^;]*;?\s*/g,
            /levelingSystem\.handleGameComplete[^;]*;?\s*/g,
            
            // Chat XP calls  
            /const\s+levelResult\s*=\s*await\s+levelingSystem\.handleChatMessage[^;]*;?\s*/g,
            /await\s+levelingSystem\.handleChatMessage[^;]*;?\s*/g,
            /levelingSystem\.handleChatMessage[^;]*;?\s*/g,

            // Level up processing blocks (complex)
            /\/\/ Check for level up[\s\S]*?catch \([^}]*\}\s*\}/g,
            /\/\/ Handle level up[\s\S]*?catch \([^}]*\}\s*\}/g,
            /if \(xpResult && xpResult\.leveledUp\)[\s\S]*?(?=\n\s*(?:\/\/|$|[a-zA-Z]))/g,
            /if \(xpResult && xpResult\.levelUp\)[\s\S]*?(?=\n\s*(?:\/\/|$|[a-zA-Z]))/g,
            /if \(levelResult && levelResult\.leveledUp\)[\s\S]*?(?=\n\s*(?:\/\/|$|[a-zA-Z]))/g,
            /if \(levelResult && levelResult\.levelUp\)[\s\S]*?(?=\n\s*(?:\/\/|$|[a-zA-Z]))/g,

            // XP variable declarations
            /const\s+specialResult\s*=[\s\S]*?;/g,
            /let\s+levelUpMessage\s*=\s*null;\s*/g,

            // XP processing blocks for multiple players
            /\/\/ Process XP and complete sessions for all participants[\s\S]*?(?=\n\s*(?:\/\/|$|[a-zA-Z]))/g,
            /\/\/ Add XP and complete sessions for both players[\s\S]*?(?=\n\s*(?:\/\/|$|[a-zA-Z]))/g,

            // Individual XP method calls
            /levelingSystem\.[a-zA-Z]+\([^)]*\);?\s*/g,

            // XP comments
            /\/\/ Add XP for game completion[\s\S]*?\n/g,
            /\/\/ Add XP for[^\n]*\n/g,
            /\/\/ Award XP for[^\n]*\n/g,
            /\/\/ Process XP for[^\n]*\n/g,
        ];

        for (const pattern of xpPatterns) {
            if (pattern.test(content)) {
                content = content.replace(pattern, '');
                updated = true;
            }
        }

        // Clean up extra whitespace and empty lines
        content = content.replace(/\n\s*\n\s*\n/g, '\n\n');
        
        // Remove any remaining levelUpMessage concatenations
        content = content.replace(/\s*\+\s*levelUpMessage/g, '');
        content = content.replace(/levelUpMessage\s*\+\s*/g, '');

        if (updated) {
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`✅ Successfully cleaned XP from ${filePath}`);
        } else {
            console.log(`ℹ️  No XP code found in ${filePath}`);
        }

        return true;
    } catch (error) {
        console.error(`❌ Error cleaning ${filePath}: ${error.message}`);
        return false;
    }
}

function main() {
    console.log('🗑️  Starting complete XP system removal...\n');
    
    let successCount = 0;
    let totalCount = 0;

    for (const relativeFilePath of filesToClean) {
        totalCount++;
        const fullPath = path.join(__dirname, relativeFilePath);
        
        if (!fs.existsSync(fullPath)) {
            console.log(`⚠️  File not found: ${fullPath}`);
            continue;
        }

        console.log(`\n📂 Cleaning ${relativeFilePath}...`);
        if (removeXPFromFile(fullPath)) {
            successCount++;
        }
    }

    console.log(`\n✨ XP removal complete!`);
    console.log(`📊 Cleaned ${successCount}/${totalCount} files successfully`);
    console.log(`\n🎯 Next steps:`);
    console.log(`1. Remove levelingSystem.js from UTILS/`);
    console.log(`2. Remove XP functions from database files`);
    console.log(`3. Use uas-standalone-bot for XP system exclusively`);
}

main();
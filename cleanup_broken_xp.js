/**
 * Clean up broken XP code fragments left by automated removal
 */

const fs = require('fs');
const path = require('path');

const filesToFix = [
    'COMMANDS/blackjack.js',
    'COMMANDS/slots.js', 
    'GAMES/crash.js',
    'COMMANDS/wordchain.js',
    'COMMANDS/sportbet.js',
    'COMMANDS/mines.js',
    'COMMANDS/treasurevault.js',
    'COMMANDS/roulette.js',
    'COMMANDS/multi-slots.js',
    'COMMANDS/plinko.js',
    'COMMANDS/fishing.js',
    'COMMANDS/battleship.js',
    'COMMANDS/yahtzee.js'
];

function cleanupFile(filePath) {
    try {
        let content = fs.readFileSync(filePath, 'utf8');
        let updated = false;

        // Remove broken level up code blocks
        const brokenPatterns = [
            // Broken variable assignments
            /\s*\/\/ Check for level up and prepare notification[\s\S]*?}\s*$/gm,
            /\s*\/\/ Process level-up rewards[\s\S]*?}\s*$/gm,
            /\s*const levelReward = await levelUpMessage = .*?;/g,
            /\s*= `\\n💰.*?`;/g,
            /\s*const levelUpEmbed = \/\/ Award level-up rewards/g,
            /\s*await \/\/ Send level up message in level up channel/g,
            /\s*const levelUpEmbed = , \s*xpResult\.newLevel[\s\S]*?\);/g,
            /\s*\/\/ Award level-up rewards[\s\S]*?await/g,
            /\s*\/\/ Send level up message in level up channel[\s\S]*?try \{/g,
            
            // Broken try blocks
            /\s*try \{\s*const levelUpChannel[\s\S]*?}\s*\} catch/g,
            /\s*const levelUpEmbed = await levelUpChannel\.send\([\s\S]*?\}\s*\} catch/g,
            
            // Broken XP result processing
            /\s*\/\/ Handle level up if occurred[\s\S]*?try \{/g,
            /\s*if \(xpResult && xpResult\.levelUp && this\.client\) \{[\s\S]*?}\s*} catch/g,
            
            // Clean up orphaned catch blocks and broken statements
            /\s*} catch \(levelError\) \{[\s\S]*?}\s*$/gm,
            /\s*const levelResult = \/\/ Handle level up if occurred/g,
            /\s*const multiplier = currentPayout \/ betAmount;\s*$/gm,
            /\s*\/\/ Check for level up\s*$/gm,
            /\s*\/\/ Level up handling\s*}\s*$/gm,
            
            // Remove broken fragments in yahtzee
            /\s*\/\/ Add XP\s*if \(game\.betAmount > 0\) \{\s*const xpGained = await \}\s*$/gm,
            
            // Clean up broken lines
            /^\s*}\s*$/gm,
            /^\s*const\s*$|^\s*await\s*$|^\s*try\s*$|^\s*if\s*$/gm,
        ];

        for (const pattern of brokenPatterns) {
            if (pattern.test(content)) {
                content = content.replace(pattern, '');
                updated = true;
            }
        }

        // Clean up multiple empty lines
        content = content.replace(/\n\s*\n\s*\n/g, '\n\n');
        
        // Fix broken function calls and assignments
        content = content.replace(/const\s+levelUpEmbed\s*=\s*await levelUpChannel\.send\([^}]*\}\s*\);/g, '');
        content = content.replace(/const\s+levelUpEmbed\s*=\s*$/gm, '');

        if (updated) {
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`✅ Fixed broken XP code in ${filePath}`);
        } else {
            console.log(`ℹ️  No broken XP code in ${filePath}`);
        }

        return true;
    } catch (error) {
        console.error(`❌ Error fixing ${filePath}: ${error.message}`);
        return false;
    }
}

function main() {
    console.log('🔧 Cleaning up broken XP code fragments...\n');
    
    for (const relativeFilePath of filesToFix) {
        const fullPath = path.join(__dirname, relativeFilePath);
        
        if (!fs.existsSync(fullPath)) {
            console.log(`⚠️  File not found: ${fullPath}`);
            continue;
        }

        console.log(`📂 Fixing ${relativeFilePath}...`);
        cleanupFile(fullPath);
    }

    console.log(`\n✨ Cleanup complete!`);
}

main();
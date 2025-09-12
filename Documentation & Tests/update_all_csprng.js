#!/usr/bin/env node

/**
 * Batch update script to replace Math.random with CSPRNG in all game files
 */

const fs = require('fs');
const path = require('path');

// Files to update
const filesToUpdate = [
    'GAMES/keno.js',
    'GAMES/russianRoulette.js', 
    'GAMES/scratchTickets.js',
    'GAMES/rps.js',
    'UTILS/volatilityManager.js',
    'UTILS/transparentPayoutManager.js',
    'UTILS/profileDecorator.js',
    'UTILS/plinkoCanvas.js',
    'UTILS/scratchTicketGenerator.js',
    'COMMANDS/plinko.js',
    'COMMANDS/setupLottery.js',
    'COMMANDS/battleship.js'
];

// Common CSPRNG import to add if not present
const csprgImport = `const { secureRandomInt, secureRandomFloat, secureRandomChoice, generateProvablyFairRandom } = require('../UTILS/rng');`;

// Function to update a single file
function updateFile(filePath) {
    try {
        console.log(`Updating ${filePath}...`);
        
        let content = fs.readFileSync(filePath, 'utf8');
        let changes = 0;
        
        // Add CSPRNG import if not present
        if (!content.includes('require(\'../UTILS/rng\')') && !content.includes('require(\'./rng\')')) {
            // Find where to insert import
            const lines = content.split('\n');
            let insertIndex = 0;
            
            // Find last require statement
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes('require(')) {
                    insertIndex = i + 1;
                }
            }
            
            lines.splice(insertIndex, 0, csprgImport.replace('../UTILS/rng', filePath.includes('UTILS/') ? './rng' : '../UTILS/rng'));
            content = lines.join('\n');
            changes++;
        }
        
        // Replace Math.random() calls
        const mathRandomPatterns = [
            // Math.floor(Math.random() * X)
            {
                regex: /Math\.floor\(Math\.random\(\)\s*\*\s*([^)]+)\)/g,
                replacement: 'secureRandomInt(0, $1)'
            },
            // Math.random() * X
            {
                regex: /Math\.random\(\)\s*\*\s*([^)\s,;]+)/g,
                replacement: 'secureRandomFloat(0, $1)'
            },
            // Simple Math.random()
            {
                regex: /Math\.random\(\)/g,
                replacement: 'secureRandomFloat()'
            }
        ];
        
        mathRandomPatterns.forEach(pattern => {
            const matches = content.match(pattern.regex);
            if (matches) {
                content = content.replace(pattern.regex, pattern.replacement);
                changes += matches.length;
            }
        });
        
        if (changes > 0) {
            fs.writeFileSync(filePath, content);
            console.log(`✅ Updated ${filePath} - ${changes} changes made`);
        } else {
            console.log(`ℹ️  ${filePath} - No changes needed`);
        }
        
        return changes;
        
    } catch (error) {
        console.error(`❌ Error updating ${filePath}:`, error.message);
        return 0;
    }
}

// Main execution
function main() {
    console.log('🎰 ATIVE Casino Bot - CSPRNG Batch Update');
    console.log('==========================================');
    
    let totalChanges = 0;
    let updatedFiles = 0;
    
    filesToUpdate.forEach(file => {
        const fullPath = path.join(__dirname, file);
        
        if (fs.existsSync(fullPath)) {
            const changes = updateFile(fullPath);
            totalChanges += changes;
            if (changes > 0) updatedFiles++;
        } else {
            console.log(`⚠️  File not found: ${file}`);
        }
    });
    
    console.log('\n==========================================');
    console.log(`📊 Summary:`);
    console.log(`   Files updated: ${updatedFiles}/${filesToUpdate.length}`);
    console.log(`   Total changes: ${totalChanges}`);
    console.log('✅ CSPRNG batch update completed!');
}

if (require.main === module) {
    main();
}

module.exports = { updateFile };
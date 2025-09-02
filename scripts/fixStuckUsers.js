/**
 * Fix Users Stuck at Level 1
 * Corrects level calculations for users with sufficient XP
 */

const dbManager = require('../UTILS/database');
const levelingSystem = require('../UTILS/levelingSystem');
const logger = require('../UTILS/logger');

async function fixStuckUsers() {
    console.log('🔧 Fixing Users Stuck at Level 1...\\n');
    
    try {
        // Initialize database
        await dbManager.initialize();
        console.log('✅ Database initialized\\n');
        
        const pool = dbManager.databaseAdapter.pool;
        
        // Find all users stuck at Level 1 with sufficient XP for Level 2 (170+ total XP)
        const [stuckUsers] = await pool.execute(
            `SELECT user_id, guild_id, total_xp, messages_sent, games_played, updated_at
             FROM user_levels 
             WHERE level = 1 AND total_xp >= 170
             ORDER BY total_xp DESC`
        );
        
        if (stuckUsers.length === 0) {
            console.log('✅ No users found stuck at Level 1');
            return { success: true, usersFixed: 0 };
        }
        
        console.log(`🚨 Found ${stuckUsers.length} users stuck at Level 1 with sufficient XP\\n`);
        
        let usersFixed = 0;
        let errors = [];
        
        for (const user of stuckUsers) {
            try {
                const correctLevel = levelingSystem.calculateLevel(user.total_xp);
                
                if (correctLevel > 1) {
                    console.log(`🔧 Fixing user ${user.user_id}:`);
                    console.log(`   Current: Level 1, ${user.total_xp} XP`);
                    console.log(`   Correct: Level ${correctLevel}`);
                    
                    // Update the user's level
                    const [result] = await pool.execute(
                        `UPDATE user_levels 
                         SET level = ?, updated_at = CURRENT_TIMESTAMP 
                         WHERE user_id = ? AND guild_id = ?`,
                        [correctLevel, user.user_id, user.guild_id]
                    );
                    
                    if (result.affectedRows > 0) {
                        console.log(`   ✅ Fixed: ${user.user_id} -> Level ${correctLevel}`);
                        usersFixed++;
                        
                        logger.info(`Fixed stuck user ${user.user_id}: Level 1 -> ${correctLevel} (${user.total_xp} XP)`);
                    } else {
                        console.log(`   ❌ Failed to update database for ${user.user_id}`);
                        errors.push({ userId: user.user_id, error: 'Database update failed' });
                    }
                } else {
                    console.log(`ℹ️ User ${user.user_id} is correctly at Level 1 (${user.total_xp} XP)`);
                }
                
                console.log();
                
            } catch (error) {
                console.log(`   ❌ Error fixing ${user.user_id}: ${error.message}`);
                errors.push({ userId: user.user_id, error: error.message });
                logger.error(`Failed to fix stuck user ${user.user_id}: ${error.message}`);
            }
        }
        
        // Verify fixes
        const [verifyUsers] = await pool.execute(
            `SELECT user_id, level, total_xp 
             FROM user_levels 
             WHERE level = 1 AND total_xp >= 170`
        );
        
        console.log('🎉 Fix Results Summary:');
        console.log(`   👥 Users found stuck: ${stuckUsers.length}`);
        console.log(`   ✅ Users fixed: ${usersFixed}`);
        console.log(`   ❌ Errors encountered: ${errors.length}`);
        console.log(`   🚨 Still stuck: ${verifyUsers.length}`);
        
        if (errors.length > 0) {
            console.log('\\n❌ Errors:');
            errors.forEach(err => {
                console.log(`   - ${err.userId}: ${err.error}`);
            });
        }
        
        if (verifyUsers.length === 0) {
            console.log('\\n🏆 All users have been successfully fixed!');
        } else {
            console.log(`\\n⚠️ ${verifyUsers.length} users still need manual attention.`);
        }
        
        return {
            success: true,
            usersFound: stuckUsers.length,
            usersFixed,
            errors,
            stillStuck: verifyUsers.length
        };
        
    } catch (error) {
        console.error('❌ Fix execution failed:', error);
        logger.error(`Fix stuck users failed: ${error.message}`);
        
        return {
            success: false,
            error: error.message
        };
    }
}

// Run fix if called directly
if (require.main === module) {
    fixStuckUsers()
        .then(result => {
            if (result.success) {
                console.log(`\\n✨ Fix completed! ${result.usersFixed || 0} users fixed.`);
                process.exit(0);
            } else {
                console.error('\\n💥 Fix failed!');
                process.exit(1);
            }
        })
        .catch(error => {
            console.error('\\n💥 Unexpected fix error:', error);
            process.exit(1);
        });
}

module.exports = fixStuckUsers;
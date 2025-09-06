/**
 * Fix NaN balances in the database
 * This script identifies and fixes any NaN values in user balances
 */

const dbManager = require('./UTILS/database');
const logger = require('./UTILS/logger');

async function fixNaNBalances() {
    try {
        console.log('🔧 Starting NaN balance fix...');
        
        // Wait for database initialization
        await new Promise(resolve => {
            const checkDB = () => {
                if (dbManager.usingAdapter) {
                    resolve();
                } else {
                    setTimeout(checkDB, 100);
                }
            };
            checkDB();
        });
        
        console.log('📊 Checking all user balances for NaN values...');
        
        // Get all users with potential NaN balances
        const query = `
            SELECT user_id, wallet, bank, display_name 
            FROM user_balances 
            WHERE wallet != wallet OR bank != bank OR wallet IS NULL OR bank IS NULL
        `;
        
        const results = await dbManager.databaseAdapter.query(query);
        
        console.log(`Found ${results.length} users with invalid balances`);
        
        if (results.length === 0) {
            console.log('✅ No NaN balances found!');
            process.exit(0);
        }
        
        // Fix each user's balance
        for (const user of results) {
            console.log(`Fixing balance for user ${user.display_name} (${user.user_id}):`, {
                wallet: user.wallet,
                bank: user.bank
            });
            
            // Set safe default values
            const safeWallet = isNaN(user.wallet) || user.wallet === null ? 5000 : user.wallet;
            const safeBank = isNaN(user.bank) || user.bank === null ? 0 : user.bank;
            
            const fixQuery = `
                UPDATE user_balances 
                SET wallet = ?, bank = ?
                WHERE user_id = ?
            `;
            
            await dbManager.databaseAdapter.query(fixQuery, [safeWallet, safeBank, user.user_id]);
            
            console.log(`✅ Fixed ${user.display_name}: wallet=${safeWallet}, bank=${safeBank}`);
        }
        
        console.log('🎉 All NaN balances have been fixed!');
        
        // Verify the fix
        console.log('🔍 Verifying fix...');
        const verifyQuery = `
            SELECT COUNT(*) as count
            FROM user_balances 
            WHERE wallet != wallet OR bank != bank OR wallet IS NULL OR bank IS NULL
        `;
        
        const verifyResults = await dbManager.databaseAdapter.query(verifyQuery);
        const remainingIssues = verifyResults[0].count;
        
        if (remainingIssues === 0) {
            console.log('✅ Verification passed - no NaN values remain!');
        } else {
            console.log(`❌ ${remainingIssues} issues still remain`);
        }
        
    } catch (error) {
        console.error('❌ Error fixing NaN balances:', error);
    } finally {
        process.exit(0);
    }
}

// Run the fix
fixNaNBalances();
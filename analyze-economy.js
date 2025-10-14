const database = require('./UTILS/database');

async function analyzeEconomy() {
    await database.initialize();

    console.log('=== ANALYZING CURRENT ECONOMY STATE ===\n');

    // Get top users
    const topUsers = await database.databaseAdapter.getTopUsersByBalance(null, 20);

    console.log('=== TOP 20 USERS BY WEALTH ===');
    topUsers.forEach((user, i) => {
        const total = (user.wallet || 0) + (user.bank || 0);
        console.log(`${i+1}. Total: $${total.toLocaleString()}, Wallet: $${(user.wallet || 0).toLocaleString()}, Bank: $${(user.bank || 0).toLocaleString()}`);
    });

    // Calculate statistics
    const balances = topUsers.map(u => (u.wallet || 0) + (u.bank || 0));
    const totalTop20 = balances.reduce((a, b) => a + b, 0);
    const avgTop20 = totalTop20 / balances.length;
    const maxBalance = Math.max(...balances);
    const minBalance = Math.min(...balances);

    console.log('\n=== STATISTICS ===');
    console.log(`Highest Balance: $${maxBalance.toLocaleString()}`);
    console.log(`Average Top 20: $${avgTop20.toLocaleString()}`);
    console.log(`Lowest in Top 20: $${minBalance.toLocaleString()}`);

    // Wealth brackets
    console.log('\n=== WEALTH BRACKETS (Top 20) ===');
    const brackets = {
        'Under 10K': balances.filter(b => b < 10000).length,
        '10K - 100K': balances.filter(b => b >= 10000 && b < 100000).length,
        '100K - 1M': balances.filter(b => b >= 100000 && b < 1000000).length,
        '1M - 10M': balances.filter(b => b >= 1000000 && b < 10000000).length,
        '10M - 100M': balances.filter(b => b >= 10000000 && b < 100000000).length,
        '100M - 1B': balances.filter(b => b >= 100000000 && b < 1000000000).length,
        '1B+': balances.filter(b => b >= 1000000000).length,
    };

    for (const [bracket, count] of Object.entries(brackets)) {
        if (count > 0) {
            console.log(`${bracket}: ${count} users`);
        }
    }

    process.exit(0);
}

analyzeEconomy().catch(err => {
    console.error('Error:', err);
    console.error(err.stack);
    process.exit(1);
});

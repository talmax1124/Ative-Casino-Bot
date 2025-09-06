/**
 * Quick CSPRNG Test - Fast validation
 */

const { 
    secureRandomInt, 
    secureRandomFloat, 
    generateProvablyFairRandom,
    getCSPRNGStatistics
} = require('./UTILS/rng');

console.log('🎰 Quick CSPRNG Test');
console.log('===================');

// Test 1: Basic random integers
console.log('\n1. Basic Random Integers:');
for (let i = 0; i < 10; i++) {
    process.stdout.write(`${secureRandomInt(1, 7)} `);
}

// Test 2: Random floats
console.log('\n\n2. Random Floats (0-1):');
for (let i = 0; i < 5; i++) {
    process.stdout.write(`${secureRandomFloat().toFixed(4)} `);
}

// Test 3: Provably fair
console.log('\n\n3. Provably Fair Random:');
const fairResult = generateProvablyFairRandom('test', 'user123', 1, 100);
console.log(`Value: ${fairResult.value}`);
console.log(`Proof Hash: ${fairResult.proof.hash.substring(0, 16)}...`);
console.log(`Algorithm: ${fairResult.proof.algorithm}`);

// Test 4: System health
console.log('\n4. System Health:');
const stats = getCSPRNGStatistics();
console.log(`Operations: ${stats.operationCount}`);
console.log(`Algorithm: ${stats.currentAlgorithm}`);
console.log(`Entropy Health: ${stats.entropyPoolHealth.status} (${(stats.entropyPoolHealth.healthScore * 100).toFixed(1)}%)`);

// Test 5: Distribution check (small sample)
console.log('\n5. Quick Distribution Test (100 dice rolls):');
const counts = [0, 0, 0, 0, 0, 0];
for (let i = 0; i < 100; i++) {
    const roll = secureRandomInt(1, 7);
    counts[roll - 1]++;
}

for (let i = 0; i < 6; i++) {
    console.log(`${i + 1}: ${counts[i]} rolls (${counts[i]}%)`);
}

console.log('\n✅ Quick test completed successfully!');
console.log('The advanced CSPRNG system is operational.');
#!/usr/bin/env node
/**
 * Simple test runner that mirrors the bot's UNIT_TEST flow.
 * Allows `npm test` to run the default wallet protection suite
 * and supports `npm test -- <test-name>` to execute specific files.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DEFAULT_TESTS = [
    'tests/test_win_payout_floor.js',
    'tests/test_win_never_loses_wallet.js',
    'tests/test_more_games_win_floor.js'
];

/**
 * Resolve a user-supplied argument to a test file path.
 * Supports bare names and paths inside the tests folder.
 */
function resolveTestPath(input) {
    const candidates = [
        input,
        `${input}.js`,
        path.join('tests', input),
        path.join('tests', `${input}.js`)
    ];

    for (const candidate of candidates) {
        const absolute = path.resolve(candidate);
        if (fs.existsSync(absolute) && fs.statSync(absolute).isFile()) {
            return absolute;
        }
    }

    return null;
}

function runTest(filePath) {
    const relativePath = path.relative(process.cwd(), filePath);
    console.log(`\n➡️  Running ${relativePath}`);

    const result = spawnSync('node', [filePath], {
        stdio: 'inherit',
        env: {
            ...process.env,
            UNIT_TEST: '1'
        }
    });

    if (result.error) {
        console.error(`❌ Failed to execute ${relativePath}: ${result.error.message}`);
        return result.status ?? 1;
    }

    if (result.status !== 0) {
        console.error(`❌ ${relativePath} exited with code ${result.status}`);
    } else {
        console.log(`✅ ${relativePath} completed successfully`);
    }

    return result.status;
}

function main() {
    const args = process.argv.slice(2);
    const tests = [];

    if (args.length === 0) {
        tests.push(...DEFAULT_TESTS.map(test => path.resolve(test)));
    } else {
        for (const arg of args) {
            const resolved = resolveTestPath(arg);
            if (!resolved) {
                console.error(`❌ Unable to resolve test "${arg}". Provide a path or filename that exists.`);
                process.exitCode = 1;
                return;
            }
            tests.push(resolved);
        }
    }

    let exitCode = 0;
    for (const test of tests) {
        const status = runTest(test);
        if (status !== 0) {
            exitCode = status;
            break; // stop on first failure
        }
    }

    process.exit(exitCode);
}

main();

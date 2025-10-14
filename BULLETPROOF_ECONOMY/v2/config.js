/**
 * BULLETPROOF ECONOMY V2 - CONFIGURATION (Adjusted for Real Economy)
 * Mathematical constants and tunable parameters for economy control
 *
 * Design Philosophy:
 * - NO HARD CAPS - All limits are soft (mathematical)
 * - Millions: Attainable and maintainable
 * - Billions: Very difficult to maintain, constant drain
 * - Trillions: Mathematically impossible due to exponential costs
 *
 * Current State Analysis:
 * - Top user: ~$16B
 * - 5 users in billions range
 * - Many users in millions
 *
 * TARGET: Make millions comfortable, billions unsustainable, trillions impossible
 */

module.exports = {
    // =====================================================
    // 1. SUPPLY CAP AND ISSUANCE CONTROL
    // =====================================================

    SUPPLY: {
        // Maximum total currency that can ever exist (S_cap)
        // Set high enough to not interfere with billions, but prevent trillions
        ABSOLUTE_CAP: 50000000000, // 50B total supply cap (up from 100M)

        // Initial issuance rate (S_0) for exponential decay
        INITIAL_ISSUANCE_RATE: 5000, // Increased from 1000

        // Decay constant (λ) - higher = faster decay
        // Slower decay to allow more issuance over time
        ISSUANCE_DECAY_LAMBDA: 0.01, // 1% daily decay (down from 5%)

        // Minimum issuance rate (floor)
        MINIMUM_ISSUANCE_RATE: 100, // Higher floor

        // Supply check interval (ms)
        SUPPLY_CHECK_INTERVAL: 60000, // Check every minute

        // Emergency burn threshold (% of cap)
        EMERGENCY_BURN_THRESHOLD: 0.98, // At 98% cap (was 95%)
    },

    // =====================================================
    // 2. CONTINUOUS DECAY / HOLDING TAX
    // =====================================================

    DECAY: {
        // Daily decay rate (δ) - balance(t+Δt) = balance(t) * e^(-δ * Δt)
        // PROGRESSIVE: Increases with wealth
        // GENTLER RATES: Drain billions over MONTHS, not days
        BASE_DAILY_RATE: 0.0001, // 0.01% per day base (much gentler)

        // Decay multiplier brackets (wealth-dependent)
        // Designed to make millions comfortable, billions drain slowly over 2-3 months
        DECAY_BRACKETS: [
            { min: 0, max: 1000000, multiplier: 0.5 },         // <1M: 0.005% daily (tiny)
            { min: 1000000, max: 10000000, multiplier: 1.0 },  // 1M-10M: 0.01% daily (minimal)
            { min: 10000000, max: 50000000, multiplier: 2.0 }, // 10M-50M: 0.02% daily (gentle)
            { min: 50000000, max: 100000000, multiplier: 3.0 }, // 50M-100M: 0.03% daily (light)
            { min: 100000000, max: 500000000, multiplier: 5.0 }, // 100M-500M: 0.05% daily (noticeable)
            { min: 500000000, max: 1000000000, multiplier: 8.0 }, // 500M-1B: 0.08% daily (moderate)
            { min: 1000000000, max: 5000000000, multiplier: 10.0 }, // 1B-5B: 0.1% daily (drains slowly)
            { min: 5000000000, max: Infinity, multiplier: 15.0 }, // 5B+: 0.15% daily (steady drain)
        ],

        // Minimum balance subject to decay
        MIN_BALANCE_FOR_DECAY: 100000, // Only decay balances above 100K (was 10K)

        // Decay application interval
        APPLICATION_INTERVAL: 3600000, // Apply every hour

        // Maximum decay per application (safety cap) - REMOVED for billions
        MAX_DECAY_PER_APPLICATION: 0.01, // 1% max per hour (was 0.01%)

        // Exempt small balances
        EXEMPT_THRESHOLD: 10000, // Under 10K no decay
    },

    // =====================================================
    // 3. PROGRESSIVE WEALTH TAX
    // =====================================================

    TAX: {
        // Base tax rate (t0)
        BASE_RATE: 0.001, // 0.1% base (much gentler)

        // Progressive multiplier (t1)
        PROGRESSIVE_MULTIPLIER: 0.15, // Up to 15% additional

        // Power exponent (p) for wealth scaling
        WEALTH_EXPONENT: 1.5, // Gentler scaling

        // Reference balance for normalization (Wm)
        REFERENCE_BALANCE: 5000000, // 5M reference

        // Tax application frequency
        APPLICATION_FREQUENCY: 86400000, // Daily (24 hours)

        // Maximum effective tax rate cap
        MAX_TAX_RATE: 0.02, // 2% maximum daily tax rate

        // Wealth brackets for progressive taxation
        // MUCH GENTLER: Billions drain over MONTHS
        // Combined with decay and game scaling, creates sustainable pressure
        BRACKETS: [
            { min: 0, max: 1000000, rate: 0.0001 },          // <1M: 0.01% daily
            { min: 1000000, max: 10000000, rate: 0.0005 },   // 1M-10M: 0.05% daily
            { min: 10000000, max: 50000000, rate: 0.001 },   // 10M-50M: 0.1% daily
            { min: 50000000, max: 100000000, rate: 0.002 },  // 50M-100M: 0.2% daily
            { min: 100000000, max: 500000000, rate: 0.004 }, // 100M-500M: 0.4% daily
            { min: 500000000, max: 1000000000, rate: 0.006 }, // 500M-1B: 0.6% daily
            { min: 1000000000, max: 5000000000, rate: 0.008 }, // 1B-5B: 0.8% daily
            { min: 5000000000, max: Infinity, rate: 0.01 }   // 5B+: 1% daily
        ],
    },

    // =====================================================
    // 4. DIMINISHING RETURNS ON REWARDS
    // =====================================================

    REWARDS: {
        // Alpha parameter (α) for reward dampening
        // reward = base_reward * 1 / (1 + α * (balance / B))
        DAMPENING_ALPHA: 0.5, // Reduced from 2.5 for gentler diminishing

        // Reference balance (B) for reward calculations
        REFERENCE_BALANCE: 5000000, // 5M reference (was 25K)

        // Gamma for power-law diminishing: reward = base * (balance + 1)^(-γ)
        POWER_LAW_GAMMA: 0.15, // Reduced from 0.3

        // Minimum reward multiplier (floor)
        MIN_MULTIPLIER: 0.10, // 10% minimum (was 5%)

        // Maximum reward multiplier (ceiling)
        MAX_MULTIPLIER: 3.0, // 3x max (was 2x)

        // Base rewards for various activities (INCREASED)
        BASE_AMOUNTS: {
            DAILY: 2500,  // Was 500
            WORK: 1500,   // Was 300
            CRIME: 1000,  // Was 200
            BEG: 500,     // Was 100
            VOTE: 5000,   // Was 1000
            LEVEL_UP: 1000, // Was 250
        },
    },

    // =====================================================
    // 5. TRANSACTION FEES (PROGRESSIVE)
    // =====================================================

    FEES: {
        // Base percentage fee (f_pct)
        BASE_PERCENTAGE: 0.01, // 1% base fee (was 1.5%)

        // Minimum flat fee (f_min)
        MINIMUM_FEE: 100, // Higher minimum (was 10)

        // Progressive scaling exponent (β)
        SCALING_EXPONENT: 1.3, // Slightly more aggressive (was 1.2)

        // Scaling factor (f_scale)
        SCALING_FACTOR: 0.00000001, // Adjusted

        // Maximum fee percentage cap
        MAX_FEE_PERCENTAGE: 0.25, // 25% maximum (was 15%)

        // Large transfer threshold (triggers extra fees)
        LARGE_TRANSFER_THRESHOLD: 10000000, // 10M (was 50K)

        // Extra fee for large transfers
        LARGE_TRANSFER_FEE: 0.05, // Additional 5%

        // Mega transfer threshold
        MEGA_TRANSFER_THRESHOLD: 100000000, // 100M
        MEGA_TRANSFER_FEE: 0.10, // Additional 10%
    },

    // =====================================================
    // 6. SINK ECONOMY (BURNS + CONSUMABLES)
    // =====================================================

    SINKS: {
        // Item repair costs: cost = base * level^r
        REPAIR_BASE_COST: 1000, // Increased
        REPAIR_EXPONENT: 1.8,

        // Cosmetic shop rotation
        COSMETIC_ROTATION_INTERVAL: 604800000, // Weekly
        COSMETIC_BASE_PRICE: 50000, // 50K (was 5K)
        COSMETIC_PRICE_MULTIPLIER: 2.5,

        // Random event costs
        RANDOM_EVENT_FREQUENCY: 0.05, // 5% chance per action
        RANDOM_EVENT_COST_MIN: 1000,  // Was 100
        RANDOM_EVENT_COST_MAX: 10000, // Was 1000

        // Maintenance costs (for wealthy users)
        MAINTENANCE_FREQUENCY: 86400000, // Daily
        MAINTENANCE_COST_PERCENTAGE: 0.002, // 0.2% of wealth daily (was 0.1%)
    },

    // =====================================================
    // 7. SOFT WEALTH CAP (NON-LIQUID ASSETS)
    // =====================================================

    SOFT_CAP: {
        // Balance threshold for soft cap (C_softcap) - REMOVED
        // Instead use progressive conversion
        PROGRESSIVE_CONVERSION: [
            { min: 0, max: 10000000, rate: 0 },              // <10M: No conversion
            { min: 10000000, max: 100000000, rate: 0.001 },  // 10M-100M: 0.1% converted
            { min: 100000000, max: 1000000000, rate: 0.01 }, // 100M-1B: 1% converted
            { min: 1000000000, max: 10000000000, rate: 0.05 }, // 1B-10B: 5% converted
            { min: 10000000000, max: Infinity, rate: 0.10 },  // 10B+: 10% converted
        ],

        // Bond interest rate (annual)
        BOND_INTEREST_RATE: 0.01, // 1% annual (was 2%)

        // Bond lockup period
        BOND_LOCKUP_PERIOD: 2592000000, // 30 days

        // Prestige points per bond value
        PRESTIGE_PER_BOND: 0.1,
    },

    // =====================================================
    // 8. DYNAMIC REWARD SCALING (FEEDBACK CONTROL)
    // =====================================================

    DYNAMIC_SCALING: {
        // Target growth rate (g_target)
        TARGET_GROWTH_RATE: 0.02, // 2% daily growth target (was 1%)

        // Sensitivity parameter (κ)
        SENSITIVITY: 3, // Less sensitive (was 5)

        // Moving average window for growth calculation
        GROWTH_WINDOW: 7, // 7 days

        // Minimum reward scale factor
        MIN_SCALE_FACTOR: 0.3, // 30% minimum (was 10%)

        // Maximum reward scale factor
        MAX_SCALE_FACTOR: 2.0, // 2x max (was 1.5x)
    },

    // =====================================================
    // 9. TASK-SPECIFIC DIMINISHING RETURNS
    // =====================================================

    TASK_LIMITS: {
        // Logarithmic dampening: reward(n) = base * 1 / log(1 + n * c)
        LOG_CONSTANT: 0.3, // Less aggressive (was 0.5)

        // Square root dampening: reward(n) = base * (n + 1)^(-0.5)
        SQRT_ENABLED: true,

        // Reset interval for task counters
        RESET_INTERVAL: 86400000, // Daily reset

        // Maximum daily repetitions before zero reward
        MAX_DAILY_REPS: {
            WORK: 20,   // Increased from 10
            CRIME: 10,  // Increased from 5
            BEG: 30,    // Increased from 15
            DAILY: 1,
            VOTE: 3,    // Increased from 2
        },
    },

    // =====================================================
    // 10. ANTI-FARMING (COOLDOWNS + CAPS)
    // =====================================================

    ANTI_FARMING: {
        // Base cooldowns (milliseconds)
        COOLDOWNS: {
            WORK: 1800000,   // 30 min (was 1 hour)
            CRIME: 3600000,  // 1 hour (was 2 hours)
            BEG: 900000,     // 15 min (was 30 min)
            DAILY: 86400000, // 24 hours
            ROB: 7200000,    // 2 hours (was 4 hours)
            HEIST: 10800000, // 3 hours (was 6 hours)
        },

        // Cooldown scaling with streak: cooldown = base * (1 + β * streak)
        STREAK_BETA: 0.05, // 5% increase per streak (was 10%)

        // Daily earning caps per user - MUCH HIGHER
        DAILY_CAPS: {
            BASE: 100000,      // 100K base (was 10K)
            PER_LEVEL: 5000,   // 5K per level (was 500)
            ABSOLUTE_MAX: 1000000, // 1M max (was 50K)
        },

        // Hourly action limits
        HOURLY_LIMITS: {
            GAMES: 100,    // Was 50
            COMMANDS: 200, // Was 100
            TRANSFERS: 30, // Was 20
        },
    },

    // =====================================================
    // 11. GAMBLING HOUSE EDGE
    // =====================================================

    GAMBLING: {
        // House edge by game type (REDUCED for higher limits)
        HOUSE_EDGES: {
            SLOTS: 0.04,      // 4% (was 5%)
            BLACKJACK: 0.015, // 1.5% (was 2%)
            ROULETTE: 0.027,  // 2.7%
            PLINKO: 0.025,    // 2.5% (was 3%)
            CRASH: 0.015,     // 1.5% (was 2%)
            DICE: 0.03,       // 3% (was 4%)
        },

        // Maximum bet limits - MUCH HIGHER
        MAX_BETS: {
            SLOTS: 1000000,      // 1M (was 10K)
            BLACKJACK: 5000000,  // 5M (was 25K)
            ROULETTE: 10000000,  // 10M (was 50K)
            PLINKO: 1000000,     // 1M (was 10K)
            CRASH: 2000000,      // 2M (was 15K)
            DICE: 3000000,       // 3M (was 20K)
        },

        // Maximum payout limits - MUCH HIGHER
        MAX_PAYOUTS: {
            SLOTS: 10000000,     // 10M (was 100K)
            BLACKJACK: 50000000, // 50M (was 200K)
            ROULETTE: 100000000, // 100M (was 500K)
            PLINKO: 10000000,    // 10M (was 100K)
            CRASH: 20000000,     // 20M (was 150K)
            DICE: 30000000,      // 30M (was 150K)
        },
    },

    // =====================================================
    // 12. ANTI-COLLUSION DETECTION
    // =====================================================

    ANTI_COLLUSION: {
        // Weight factors for collusion score
        WEIGHTS: {
            TRANSFER_COUNT: 0.3,
            TIME_GAP_INVERSE: 0.3,
            CIRCULAR_TRANSFERS: 0.4,
        },

        // Detection thresholds
        THRESHOLDS: {
            SUSPICION: 60,  // Raised from 50
            WARNING: 85,    // Raised from 75
            AUTO_FREEZE: 95, // Raised from 90
        },

        // Monitoring windows
        WINDOWS: {
            SHORT: 3600000,   // 1 hour
            MEDIUM: 86400000, // 24 hours
            LONG: 604800000,  // 7 days
        },

        // Transfer patterns
        PATTERNS: {
            // Rapid transfers between pairs
            RAPID_THRESHOLD: 10, // 10 transfers (was 5)
            RAPID_WINDOW: 3600000, // 1 hour (was 10 minutes)

            // Circular transfer detection
            CYCLE_LENGTH_MAX: 5,
            CYCLE_SIMILARITY_THRESHOLD: 0.8,

            // Zero-sum detection
            ZERO_SUM_TOLERANCE: 10000, // ±10K (was ±100)
            ZERO_SUM_WINDOW: 86400000, // 24 hours (was 1 hour)
        },
    },

    // =====================================================
    // 13. REPUTATION / ACTIVITY DIVERSITY
    // =====================================================

    REPUTATION: {
        // Diversity scoring
        DIVERSITY_BONUS_MULTIPLIER: 0.3, // Up to 30% bonus (was 50%)
        MIN_UNIQUE_TASKS: 5,

        // Activity tracking window
        TRACKING_WINDOW: 604800000, // 7 days

        // Reputation decay
        REPUTATION_DECAY_RATE: 0.005, // 0.5% daily (was 1%)

        // Reputation levels
        LEVELS: [
            { min: 0, max: 100, name: 'Novice', multiplier: 0.9 },
            { min: 100, max: 500, name: 'Regular', multiplier: 1.0 },
            { min: 500, max: 2000, name: 'Trusted', multiplier: 1.1 },
            { min: 2000, max: 10000, name: 'Veteran', multiplier: 1.2 },
            { min: 10000, max: Infinity, name: 'Legend', multiplier: 1.3 },
        ],
    },

    // =====================================================
    // 14. HARD LIMITS (REMOVED - Using soft limits only)
    // =====================================================

    HARD_LIMITS: {
        // Per-user balance cap - REMOVED (set to effectively infinite)
        MAX_USER_BALANCE: Infinity, // No hard cap (was 500K)

        // Per-user daily earning cap - VERY HIGH
        MAX_DAILY_EARNINGS: 1000000, // 1M per day

        // Per-transaction limits - VERY HIGH
        MAX_TRANSACTION_AMOUNT: 100000000, // 100M (was 100K)

        // Maximum wallet/bank ratio - REMOVED
        MAX_BANK_RATIO: Infinity, // No ratio limit

        // Emergency controls
        EMERGENCY_MODE_THRESHOLD: 0.98, // 98% of supply cap
        EMERGENCY_TAX_MULTIPLIER: 3.0, // 3x taxes in emergency (was 5x)
    },

    // =====================================================
    // 15. MONITORING AND LOGGING
    // =====================================================

    MONITORING: {
        // Log levels
        LOG_LEVELS: ['ERROR', 'WARN', 'INFO', 'DEBUG'],

        // Critical transaction threshold for logging
        CRITICAL_AMOUNT: 1000000, // 1M (was 10K)

        // Audit trail retention
        AUDIT_RETENTION_DAYS: 90,

        // Alert thresholds
        ALERTS: {
            LARGE_TRANSACTION: 10000000,  // 10M (was 25K)
            RAPID_BALANCE_CHANGE: 50000000, // 50M (was 50K)
            SUPPLY_CRITICAL: 0.95, // 95% of cap (was 90%)
            COLLUSION_DETECTED: true,
        },

        // Performance monitoring
        PERFORMANCE_SAMPLE_RATE: 0.1, // 10% of operations
    },

    // =====================================================
    // 16. MATHEMATICAL CONSTANTS
    // =====================================================

    CONSTANTS: {
        E: Math.E,
        PI: Math.PI,
        GOLDEN_RATIO: 1.618033988749895,
        SQRT_2: Math.SQRT2,
    },

    // =====================================================
    // 17. SIMULATION PARAMETERS
    // =====================================================

    SIMULATION: {
        // Monte Carlo iterations for testing
        MONTE_CARLO_ITERATIONS: 100000,

        // Confidence intervals
        CONFIDENCE_LEVELS: [0.95, 0.99, 0.999],

        // Synthetic user count for testing
        SYNTHETIC_USER_COUNT: 1000,

        // Simulation time horizon (days)
        SIMULATION_DAYS: 180,
    },
};

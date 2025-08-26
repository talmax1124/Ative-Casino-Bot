/**
 * Passive Income Processor
 * Handles periodic passive income generation for purchased items
 */

class PassiveIncomeProcessor {
    constructor(db) {
        this.db = db;
        this.processingIntervals = new Map();
        this.isProcessing = false;
    }

    /**
     * Start passive income processing for all eligible users
     */
    async startProcessing() {
        if (this.isProcessing) {
            console.log('⚠️ Passive income processing already running');
            return;
        }

        this.isProcessing = true;
        console.log('🚀 Starting passive income processing...');

        // Process every hour
        const processInterval = setInterval(async () => {
            try {
                await this.processAllPassiveIncome();
            } catch (error) {
                console.error('❌ Error in passive income processing:', error);
            }
        }, 60 * 60 * 1000); // 1 hour

        this.processingIntervals.set('main', processInterval);

        // Run initial process
        await this.processAllPassiveIncome();
        
        console.log('✅ Passive income processing started');
    }

    /**
     * Stop passive income processing
     */
    stopProcessing() {
        console.log('🛑 Stopping passive income processing...');
        
        for (const [key, interval] of this.processingIntervals.entries()) {
            clearInterval(interval);
            this.processingIntervals.delete(key);
        }
        
        this.isProcessing = false;
        console.log('✅ Passive income processing stopped');
    }

    /**
     * Process passive income for all eligible users
     */
    async processAllPassiveIncome() {
        console.log('💰 Processing passive income for all users...');
        
        try {
            // Get all user purchases with passive income items
            const purchasesSnapshot = await this.db.collection('user_purchases').get();
            const eligiblePurchases = [];

            purchasesSnapshot.docs.forEach(doc => {
                const purchase = doc.data();
                const item = this.getItemById(purchase.itemId);
                
                if (item && item.passiveIncome && this.isItemActive(purchase, item)) {
                    eligiblePurchases.push({
                        ...purchase,
                        purchaseId: doc.id,
                        item
                    });
                }
            });

            console.log(`💎 Found ${eligiblePurchases.length} eligible passive income items`);

            // Process each eligible purchase
            for (const purchase of eligiblePurchases) {
                await this.processUserPassiveIncome(purchase);
            }

            console.log('✅ Passive income processing completed');
        } catch (error) {
            console.error('❌ Error processing passive income:', error);
        }
    }

    /**
     * Process passive income for a specific user purchase
     */
    async processUserPassiveIncome(purchase) {
        try {
            const { userId, item, purchaseId } = purchase;
            const now = new Date();

            // Check when we last processed this item for this user
            const lastProcessedSnapshot = await this.db.collection('passive_earnings')
                .where('userId', '==', userId)
                .where('itemId', '==', item.id)
                .orderBy('timestamp', 'desc')
                .limit(1)
                .get();

            let lastProcessed = purchase.timestamp.toDate();
            if (!lastProcessedSnapshot.empty) {
                lastProcessed = lastProcessedSnapshot.docs[0].data().timestamp.toDate();
            }

            // Calculate how many intervals have passed
            const timeDiff = now.getTime() - lastProcessed.getTime();
            const intervalMs = item.passiveIncome.interval * 1000;
            const intervalsPassed = Math.floor(timeDiff / intervalMs);

            if (intervalsPassed > 0) {
                console.log(`💰 Processing ${intervalsPassed} intervals for user ${userId} item ${item.name}`);

                // Generate passive income for each interval
                for (let i = 0; i < intervalsPassed; i++) {
                    const earningTime = new Date(lastProcessed.getTime() + (intervalMs * (i + 1)));
                    let amount;

                    if (item.passiveIncome.type === 'percentage') {
                        // Percentage of user's balance
                        const userBalance = await this.getUserBalance(userId);
                        const percentage = Math.random() * (item.passiveIncome.max - item.passiveIncome.min) + item.passiveIncome.min;
                        amount = Math.floor(userBalance.total * percentage);
                    } else {
                        // Fixed amount
                        amount = Math.floor(Math.random() * (item.passiveIncome.max - item.passiveIncome.min + 1)) + item.passiveIncome.min;
                    }

                    // Record the earning
                    await this.db.collection('passive_earnings').add({
                        userId,
                        itemId: item.id,
                        itemName: item.name,
                        amount,
                        timestamp: earningTime,
                        processed: now
                    });

                    // Add to user's wallet
                    await this.addToUserBalance(userId, amount);

                    console.log(`✅ Added ${amount} coins to ${userId} from ${item.name}`);
                }
            }
        } catch (error) {
            console.error(`❌ Error processing passive income for ${purchase.userId}:`, error);
        }
    }

    /**
     * Get item configuration by ID
     */
    getItemById(itemId) {
        const items = {
            'slot_machine': {
                id: 'slot_machine',
                name: '🎰 Personal Slot Machine',
                passiveIncome: { min: 50, max: 200, interval: 3600 }
            },
            'diamond_membership': {
                id: 'diamond_membership',
                name: '💎 Diamond Membership',
                passiveIncome: { min: 0.02, max: 0.05, interval: 86400, type: 'percentage' }
            }
        };

        return items[itemId] || null;
    }

    /**
     * Check if an item is still active
     */
    isItemActive(purchase, item) {
        if (!item.duration) return true; // Permanent items
        
        const purchaseTime = purchase.timestamp.toDate();
        const expiration = new Date(purchaseTime.getTime() + (item.duration * 60 * 60 * 1000));
        return new Date() < expiration;
    }

    /**
     * Get user balance
     */
    async getUserBalance(userId) {
        try {
            const userDoc = await this.db.collection('user_balances').doc(userId).get();
            if (userDoc.exists) {
                const data = userDoc.data();
                return {
                    wallet: data.wallet || 0,
                    bank: data.bank || 0,
                    total: (data.wallet || 0) + (data.bank || 0)
                };
            }
            return { wallet: 0, bank: 0, total: 0 };
        } catch (error) {
            console.error('Error getting user balance:', error);
            return { wallet: 0, bank: 0, total: 0 };
        }
    }

    /**
     * Add amount to user's wallet
     */
    async addToUserBalance(userId, amount) {
        try {
            const userRef = this.db.collection('user_balances').doc(userId);
            const userDoc = await userRef.get();
            
            if (userDoc.exists) {
                const currentData = userDoc.data();
                await userRef.update({
                    wallet: (currentData.wallet || 0) + amount,
                    lastUpdated: new Date()
                });
            } else {
                await userRef.set({
                    wallet: amount,
                    bank: 0,
                    lastUpdated: new Date()
                });
            }
        } catch (error) {
            console.error('Error updating user balance:', error);
        }
    }
}

module.exports = PassiveIncomeProcessor;
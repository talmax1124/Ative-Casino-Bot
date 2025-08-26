/**
 * Simplified Database Interface for Web API Server
 * Handles basic Firestore operations without complex fallback system
 */

class SimpleDatabaseManager {
    constructor(firestoreDB) {
        this.db = firestoreDB;
    }

    /**
     * Get user balance from Firestore
     */
    async getUserBalance(userId) {
        try {
            const userDoc = await this.db.collection('users').doc(userId).get();
            
            if (!userDoc.exists) {
                return {
                    wallet: 0,
                    bank: 0,
                    total: 0
                };
            }

            const data = userDoc.data();
            const wallet = data.wallet || 0;
            const bank = data.bank || 0;

            return {
                wallet,
                bank,
                total: wallet + bank
            };
        } catch (error) {
            console.error('Error getting user balance:', error);
            throw error;
        }
    }

    /**
     * Update user balance in Firestore
     */
    async updateUserBalance(userId, balanceUpdate) {
        try {
            const userRef = this.db.collection('users').doc(userId);
            
            // Get current balance first
            const userDoc = await userRef.get();
            const currentData = userDoc.exists ? userDoc.data() : {};
            
            const currentWallet = currentData.wallet || 0;
            const currentBank = currentData.bank || 0;
            
            // Calculate new balances
            const newWallet = balanceUpdate.wallet !== undefined ? 
                currentWallet + balanceUpdate.wallet : currentWallet;
            const newBank = balanceUpdate.bank !== undefined ? 
                currentBank + balanceUpdate.bank : currentBank;

            // Update the document
            await userRef.set({
                ...currentData,
                wallet: Math.max(0, newWallet),
                bank: Math.max(0, newBank),
                lastUpdated: new Date()
            }, { merge: true });

            return {
                success: true,
                newBalance: {
                    wallet: Math.max(0, newWallet),
                    bank: Math.max(0, newBank),
                    total: Math.max(0, newWallet) + Math.max(0, newBank)
                }
            };
        } catch (error) {
            console.error('Error updating user balance:', error);
            throw error;
        }
    }

    /**
     * Record a purchase transaction
     */
    async recordPurchase(purchaseData) {
        try {
            const purchaseRef = this.db.collection('purchases').doc();
            
            await purchaseRef.set({
                ...purchaseData,
                timestamp: new Date(),
                id: purchaseRef.id
            });

            return {
                success: true,
                id: purchaseRef.id
            };
        } catch (error) {
            console.error('Error recording purchase:', error);
            throw error;
        }
    }

    /**
     * Get database status (simplified)
     */
    async getStatus() {
        try {
            // Simple health check by trying to read from users collection
            const testDoc = await this.db.collection('users').limit(1).get();
            
            return {
                firestore: {
                    available: true,
                    status: 'connected'
                },
                mongodb: {
                    available: false,
                    status: 'not_configured'
                },
                fallbackActive: false
            };
        } catch (error) {
            console.error('Error getting database status:', error);
            return {
                firestore: {
                    available: false,
                    status: 'error',
                    error: error.message
                },
                mongodb: {
                    available: false,
                    status: 'not_configured'
                },
                fallbackActive: false
            };
        }
    }
}

module.exports = SimpleDatabaseManager;
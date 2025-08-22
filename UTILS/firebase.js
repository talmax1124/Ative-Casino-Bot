/**
 * Firebase Configuration for ATIVE Casino Bot
 * Handles all Firebase Firestore operations
 */

const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const logger = require('./logger');

class FirebaseConfig {
    constructor() {
        this.db = null;
        this.initialized = false;
    }

    /**
     * Initialize Firebase connection
     */
    async initialize() {
        if (this.initialized) {
            return this.db;
        }

        try {
            // Try to get service account from individual environment variables first
            const firebaseProjectId = process.env.FIREBASE_PROJECT_ID;
            const firebasePrivateKey = process.env.FIREBASE_PRIVATE_KEY;
            const firebaseClientEmail = process.env.FIREBASE_CLIENT_EMAIL;

            let serviceAccount = null;

            if (firebaseProjectId && firebasePrivateKey && firebaseClientEmail) {
                logger.info('🔧 Using Firebase credentials from separated environment variables');
                
                // Fix common issues with private key from environment variables
                const privateKey = firebasePrivateKey.replace(/\\n/g, '\n');
                
                serviceAccount = {
                    type: 'service_account',
                    project_id: firebaseProjectId,
                    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID || '',
                    private_key: privateKey,
                    client_email: firebaseClientEmail,
                    client_id: process.env.FIREBASE_CLIENT_ID || '',
                    auth_uri: 'https://accounts.google.com/o/oauth2/auth',
                    token_uri: 'https://oauth2.googleapis.com/token',
                    auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
                    client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${firebaseClientEmail.replace('@', '%40')}`
                };
                
                logger.info(`✅ Created service account for project: ${firebaseProjectId}`);
            } else {
                // Fallback to JSON string method
                const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
                
                if (serviceAccountJson) {
                    logger.info('🔧 Using Firebase JSON credentials from environment variable');
                    try {
                        // Fix common issues with JSON from environment variables
                        const cleanedJson = serviceAccountJson.replace(/\\n/g, '\n').replace(/\\"/g, '"');
                        serviceAccount = JSON.parse(cleanedJson);
                        
                        // Validate required fields
                        const requiredFields = ['type', 'project_id', 'private_key', 'client_email'];
                        for (const field of requiredFields) {
                            if (!serviceAccount[field]) {
                                throw new Error(`Missing required field: ${field}`);
                            }
                        }
                        
                        logger.info(`✅ Parsed service account for project: ${serviceAccount.project_id}`);
                    } catch (error) {
                        if (error instanceof SyntaxError) {
                            logger.error(`❌ Failed to parse Firebase JSON: ${error.message}`);
                        } else {
                            logger.error(`❌ Invalid Firebase service account: ${error.message}`);
                        }
                        throw error;
                    }
                } else {
                    throw new Error(
                        'Firebase service account not found. Please either:\n' +
                        '1. Set individual Firebase environment variables: FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL\n' +
                        '2. Set FIREBASE_SERVICE_ACCOUNT_JSON environment variable with JSON content\n' +
                        '3. Place firebase-service-account.json in project root'
                    );
                }
            }

            // Initialize Firebase app
            if (!admin.apps.length) {
                admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount)
                });
                logger.info('🚀 Firebase app initialized');
            } else {
                logger.info('🔄 Using existing Firebase app');
            }

            // Get Firestore client
            this.db = getFirestore();
            this.initialized = true;
            logger.info('✅ Firebase Firestore connected successfully');
            
            return this.db;
        } catch (error) {
            logger.error(`❌ Failed to initialize Firebase: ${error.message}`);
            logger.error('💡 Make sure you have:');
            logger.error('   1. Created a Firebase project');
            logger.error('   2. Generated a service account key');
            logger.error('   3. Set individual Firebase environment variables:');
            logger.error('      - FIREBASE_PROJECT_ID');
            logger.error('      - FIREBASE_PRIVATE_KEY');
            logger.error('      - FIREBASE_CLIENT_EMAIL');
            logger.error('   4. OR set FIREBASE_SERVICE_ACCOUNT_JSON environment variable');
            throw error;
        }
    }

    /**
     * Get Firestore database client
     */
    getDB() {
        if (!this.db) {
            throw new Error('Firebase not initialized. Call initialize() first.');
        }
        return this.db;
    }
}

// Export singleton instance
module.exports = new FirebaseConfig();
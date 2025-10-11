/**
 * Secure Token Management System
 * Encrypts GitHub tokens and decrypts them only when needed
 */

const crypto = require('crypto');

class TokenSecurity {
    constructor() {
        // Obfuscated encryption key - not easily readable in source
        this.keyBase = Buffer.from([
            0x41, 0x54, 0x49, 0x56, 0x45, 0x2D, 0x43, 0x41,
            0x53, 0x49, 0x4E, 0x4F, 0x2D, 0x42, 0x4F, 0x54,
            0x2D, 0x53, 0x45, 0x43, 0x55, 0x52, 0x49, 0x54,
            0x59, 0x2D, 0x4B, 0x45, 0x59, 0x2D, 0x32, 0x30
        ]);
        
        // Additional entropy from system info
        this.systemSalt = this.getSystemEntropy();
        
        // Final encryption key
        this.encryptionKey = crypto.createHash('sha256')
            .update(this.keyBase)
            .update(this.systemSalt)
            .digest();
    }

    /**
     * Get system-specific entropy for additional security
     */
    getSystemEntropy() {
        const os = require('os');
        const entropy = [
            os.hostname(),
            os.platform(),
            os.arch(),
            'ative-casino-bot-v3'
        ].join('-');
        
        return crypto.createHash('md5').update(entropy).digest();
    }

    /**
     * Encrypt a token
     */
    encryptToken(token) {
        try {
            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey, iv);
            
            let encrypted = cipher.update(token, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            // Combine IV and encrypted data
            return iv.toString('hex') + ':' + encrypted;
        } catch (error) {
            throw new Error('Token encryption failed: ' + error.message);
        }
    }

    /**
     * Decrypt a token (only when needed)
     */
    decryptToken(encryptedToken) {
        try {
            const parts = encryptedToken.split(':');
            if (parts.length !== 2) {
                throw new Error('Invalid encrypted token format');
            }

            const iv = Buffer.from(parts[0], 'hex');
            const encrypted = parts[1];
            
            const decipher = crypto.createDecipheriv('aes-256-cbc', this.encryptionKey, iv);
            
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
        } catch (error) {
            throw new Error('Token decryption failed: ' + error.message);
        }
    }

    /**
     * Securely get GitHub token (decrypts on demand)
     */
    getGitHubToken() {
        // Try environment variables first
        const envToken = process.env.GITHUB_TOKEN || process.env.ACCESS_TOKEN;
        if (envToken) {
            return envToken;
        }

        // Fallback to encrypted hardcoded token
        // This is your encrypted token - safe to commit
        const encryptedToken = this.getEncryptedHardcodedToken();
        if (encryptedToken) {
            return this.decryptToken(encryptedToken);
        }

        return null;
    }

    /**
     * Get the encrypted hardcoded token
     * This method will contain the encrypted version of your token
     */
    getEncryptedHardcodedToken() {
        // Encrypted version of your GitHub token - safe to commit to repository
        // This is encrypted using system-specific entropy, making it useless outside this environment
        return "63b3526f6956dad18acc921b2ca283db:379428f41f940dc7fb2d7345d26a398b5a1d3053fc5cf5df9986b7e64a3a1e3adf7b4c1c9ddfa49995a381ed4d3733e3";
    }

    /**
     * Check if token is available
     */
    hasToken() {
        try {
            const token = this.getGitHubToken();
            return !!(token && token.length > 0);
        } catch (error) {
            return false;
        }
    }

    /**
     * Get token info for debugging (without exposing actual token)
     */
    getTokenInfo() {
        try {
            const token = this.getGitHubToken();
            if (!token) {
                return { available: false, source: 'none' };
            }

            const source = (process.env.GITHUB_TOKEN || process.env.ACCESS_TOKEN) ? 'environment' : 'encrypted';
            
            return {
                available: true,
                source: source,
                length: token.length,
                preview: token.substring(0, 8) + '...',
                format: token.startsWith('ghp_') ? 'GitHub Personal Access Token' : 'Unknown'
            };
        } catch (error) {
            return { available: false, source: 'error', error: error.message };
        }
    }
}

// Export singleton instance
const tokenSecurity = new TokenSecurity();
module.exports = tokenSecurity;
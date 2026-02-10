// Secure encryption for Tally API keys
const crypto = require('crypto');

// Use environment variable for encryption key, or generate a default (NOT SECURE FOR PRODUCTION)
// In production, set TALLY_ENCRYPTION_KEY in .env file
const ENCRYPTION_KEY = process.env.TALLY_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const ALGORITHM = 'aes-256-cbc';

/**
 * Encrypt sensitive data (API keys, secrets)
 */
function encrypt(text) {
    if (!text) return null;
    
    try {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY.slice(0, 32), 'hex'), iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return iv.toString('hex') + ':' + encrypted;
    } catch (error) {
        console.error('Encryption error:', error);
        return null;
    }
}

/**
 * Decrypt sensitive data
 */
function decrypt(encryptedText) {
    if (!encryptedText) return null;
    
    try {
        const parts = encryptedText.split(':');
        if (parts.length !== 2) return null;
        
        const iv = Buffer.from(parts[0], 'hex');
        const encrypted = parts[1];
        const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY.slice(0, 32), 'hex'), iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (error) {
        console.error('Decryption error:', error);
        return null;
    }
}

module.exports = {
    encrypt,
    decrypt
};


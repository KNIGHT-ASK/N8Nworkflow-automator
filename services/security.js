/**
 * Security Module for WorkflowGenius
 * Provides encryption, decryption, and security utilities for sensitive data
 */

import CryptoJS from 'crypto-js';

class SecurityManager {
  constructor() {
    this.encryptionKey = null;
    this.initialized = false;
  }

  /**
   * Initialize the security manager with a master key
   * Uses chrome.storage.session for secure key storage
   */
  async initialize() {
    try {
      // Generate or retrieve master key from session storage
      let masterKey = await this.getMasterKey();
      if (!masterKey) {
        masterKey = this.generateMasterKey();
        await this.storeMasterKey(masterKey);
      }
      
      this.encryptionKey = masterKey;
      this.initialized = true;
      console.log('[Security] SecurityManager initialized successfully');
    } catch (error) {
      console.error('[Security] Failed to initialize SecurityManager:', error);
      throw new Error('Security initialization failed');
    }
  }

  /**
   * Generate a secure master key
   */
  generateMasterKey() {
    const timestamp = Date.now().toString();
    const random = CryptoJS.lib.WordArray.random(256/8);
    const extensionId = chrome.runtime.id || 'workflow-genius';
    
    return CryptoJS.SHA256(timestamp + random.toString() + extensionId).toString();
  }

  /**
   * Store master key in chrome.storage.session (only available during session)
   */
  async storeMasterKey(key) {
    return new Promise((resolve, reject) => {
      if (chrome.storage && chrome.storage.session) {
        chrome.storage.session.set({ 'wg_master_key': key }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      } else {
        // Fallback for testing environments
        sessionStorage.setItem('wg_master_key', key);
        resolve();
      }
    });
  }

  /**
   * Retrieve master key from chrome.storage.session
   */
  async getMasterKey() {
    return new Promise((resolve, reject) => {
      if (chrome.storage && chrome.storage.session) {
        chrome.storage.session.get(['wg_master_key'], (result) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(result.wg_master_key || null);
          }
        });
      } else {
        // Fallback for testing environments
        resolve(sessionStorage.getItem('wg_master_key'));
      }
    });
  }

  /**
   * Encrypt sensitive data (API keys, tokens, etc.)
   */
  encrypt(data) {
    if (!this.initialized) {
      throw new Error('SecurityManager not initialized');
    }

    if (!data || typeof data !== 'string') {
      throw new Error('Invalid data for encryption');
    }

    try {
      const encrypted = CryptoJS.AES.encrypt(data, this.encryptionKey).toString();
      return encrypted;
    } catch (error) {
      console.error('[Security] Encryption failed:', error);
      throw new Error('Encryption failed');
    }
  }

  /**
   * Decrypt sensitive data
   */
  decrypt(encryptedData) {
    if (!this.initialized) {
      throw new Error('SecurityManager not initialized');
    }

    if (!encryptedData || typeof encryptedData !== 'string') {
      throw new Error('Invalid encrypted data');
    }

    try {
      const decrypted = CryptoJS.AES.decrypt(encryptedData, this.encryptionKey);
      const original = decrypted.toString(CryptoJS.enc.Utf8);
      
      if (!original) {
        throw new Error('Failed to decrypt data - invalid key or corrupted data');
      }
      
      return original;
    } catch (error) {
      console.error('[Security] Decryption failed:', error);
      throw new Error('Decryption failed');
    }
  }

  /**
   * Encrypt an object (converts to JSON first)
   */
  encryptObject(obj) {
    if (!obj || typeof obj !== 'object') {
      throw new Error('Invalid object for encryption');
    }

    try {
      const jsonString = JSON.stringify(obj);
      return this.encrypt(jsonString);
    } catch (error) {
      console.error('[Security] Object encryption failed:', error);
      throw new Error('Object encryption failed');
    }
  }

  /**
   * Decrypt an object (parses JSON after decryption)
   */
  decryptObject(encryptedData) {
    try {
      const jsonString = this.decrypt(encryptedData);
      return JSON.parse(jsonString);
    } catch (error) {
      console.error('[Security] Object decryption failed:', error);
      throw new Error('Object decryption failed');
    }
  }

  /**
   * Generate a secure API key hash for validation
   */
  generateApiKeyHash(apiKey, provider) {
    if (!apiKey || !provider) {
      throw new Error('API key and provider required for hash generation');
    }

    const salt = provider + '_workflow_genius_salt';
    return CryptoJS.SHA256(apiKey + salt).toString();
  }

  /**
   * Validate API key format (basic validation)
   */
  validateApiKeyFormat(apiKey, provider) {
    if (!apiKey || typeof apiKey !== 'string') {
      return false;
    }

    // Provider-specific format validation
    switch (provider.toLowerCase()) {
      case 'groq':
        return /^gsk_[a-zA-Z0-9]{43}$/.test(apiKey);
      case 'huggingface':
        return /^hf_[a-zA-Z0-9]{37}$/.test(apiKey);
      case 'openrouter':
        return /^sk-or-v1-[a-f0-9]{64}$/.test(apiKey);
      case 'openai':
        return /^sk-[a-zA-Z0-9]{32,}$/.test(apiKey);
      default:
        // Generic validation - at least 20 characters
        return apiKey.length >= 20;
    }
  }

  /**
   * Sanitize user input to prevent XSS and injection attacks
   */
  sanitizeInput(input) {
    if (typeof input !== 'string') {
      return input;
    }

    return input
      .replace(/[<>]/g, '') // Remove potential HTML tags
      .replace(/javascript:/gi, '') // Remove javascript protocols
      .replace(/on\w+=/gi, '') // Remove event handlers
      .trim();
  }

  /**
   * Validate URL to ensure it's from trusted domains
   */
  validateTrustedUrl(url) {
    const trustedDomains = [
      'api.groq.com',
      'huggingface.co',
      'openrouter.ai',
      'api.openai.com',
      'api.n8n.io',
      'zapier.com',
      'hooks.zapier.com'
    ];

    try {
      const urlObj = new URL(url);
      
      // Must be HTTPS
      if (urlObj.protocol !== 'https:') {
        return false;
      }

      // Check if domain is trusted
      return trustedDomains.some(domain => 
        urlObj.hostname === domain || urlObj.hostname.endsWith('.' + domain)
      );
    } catch (error) {
      return false;
    }
  }

  /**
   * Generate secure headers for API requests
   */
  getSecureHeaders(apiKey, provider) {
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'WorkflowGenius/1.0.0',
      'Accept': 'application/json'
    };

    // Add provider-specific authorization headers
    switch (provider.toLowerCase()) {
      case 'groq':
        headers['Authorization'] = `Bearer ${apiKey}`;
        break;
      case 'huggingface':
        headers['Authorization'] = `Bearer ${apiKey}`;
        break;
      case 'openrouter':
        headers['Authorization'] = `Bearer ${apiKey}`;
        headers['HTTP-Referer'] = 'https://workflowgenius.extension';
        headers['X-Title'] = 'WorkflowGenius';
        break;
      case 'openai':
        headers['Authorization'] = `Bearer ${apiKey}`;
        break;
      default:
        headers['Authorization'] = `Bearer ${apiKey}`;
    }

    return headers;
  }

  /**
   * Rate limiting token bucket implementation
   */
  createRateLimiter(maxRequests, windowMs) {
    return {
      tokens: maxRequests,
      maxTokens: maxRequests,
      lastRefill: Date.now(),
      windowMs: windowMs,

      canMakeRequest() {
        this.refillTokens();
        if (this.tokens > 0) {
          this.tokens--;
          return true;
        }
        return false;
      },

      refillTokens() {
        const now = Date.now();
        const timePassed = now - this.lastRefill;
        const tokensToAdd = Math.floor((timePassed / this.windowMs) * this.maxTokens);
        
        if (tokensToAdd > 0) {
          this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
          this.lastRefill = now;
        }
      },

      getWaitTime() {
        if (this.tokens > 0) return 0;
        return this.windowMs - (Date.now() - this.lastRefill);
      }
    };
  }

  /**
   * Clear all security data (for logout/cleanup)
   */
  async clearSecurityData() {
    try {
      this.encryptionKey = null;
      this.initialized = false;

      // Clear session storage
      if (chrome.storage && chrome.storage.session) {
        await new Promise((resolve) => {
          chrome.storage.session.clear(() => {
            resolve();
          });
        });
      } else {
        sessionStorage.clear();
      }

      console.log('[Security] Security data cleared successfully');
    } catch (error) {
      console.error('[Security] Failed to clear security data:', error);
    }
  }

  /**
   * Check if the security manager is properly initialized
   */
  isInitialized() {
    return this.initialized && this.encryptionKey !== null;
  }
}

// Create singleton instance
const securityManager = new SecurityManager();

export default securityManager;
export { SecurityManager };
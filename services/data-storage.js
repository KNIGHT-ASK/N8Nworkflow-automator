/**
 * Data Storage Module for WorkflowGenius
 * Provides encrypted local storage management with chrome.storage integration
 */

import securityManager from './security.js';

class DataStorageManager {
  constructor() {
    this.initialized = false;
    this.storagePrefix = 'wg_';
    this.cacheExpiry = 3600000; // 1 hour default cache expiry
    this.memoryCache = new Map(); // In-memory cache for frequently accessed data
  }

  /**
   * Initialize the storage manager
   */
  async initialize() {
    try {
      if (!securityManager.isInitialized()) {
        await securityManager.initialize();
      }
      this.initialized = true;
      console.log('[Storage] DataStorageManager initialized successfully');
    } catch (error) {
      console.error('[Storage] Failed to initialize DataStorageManager:', error);
      throw new Error('Storage initialization failed');
    }
  }

  /**
   * Store encrypted data in chrome.storage.local
   */
  async setSecure(key, value, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const storageKey = this.storagePrefix + key;
      const dataToStore = {
        value: value,
        encrypted: true,
        timestamp: Date.now(),
        expiresAt: options.expiresAt || null,
        metadata: options.metadata || {}
      };

      // Encrypt the entire data object
      const encryptedData = securityManager.encryptObject(dataToStore);

      return new Promise((resolve, reject) => {
        chrome.storage.local.set({ [storageKey]: encryptedData }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            // Update memory cache
            this.memoryCache.set(key, {
              value: value,
              timestamp: Date.now(),
              expiresAt: dataToStore.expiresAt
            });
            console.log(`[Storage] Securely stored data for key: ${key}`);
            resolve();
          }
        });
      });
    } catch (error) {
      console.error('[Storage] Failed to store secure data:', error);
      throw new Error(`Failed to store data for key: ${key}`);
    }
  }

  /**
   * Retrieve and decrypt data from chrome.storage.local
   */
  async getSecure(key, defaultValue = null) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Check memory cache first
      const cached = this.memoryCache.get(key);
      if (cached) {
        if (!cached.expiresAt || Date.now() < cached.expiresAt) {
          console.log(`[Storage] Retrieved from cache: ${key}`);
          return cached.value;
        } else {
          // Expired, remove from cache
          this.memoryCache.delete(key);
        }
      }

      const storageKey = this.storagePrefix + key;

      return new Promise((resolve, reject) => {
        chrome.storage.local.get([storageKey], (result) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }

          const encryptedData = result[storageKey];
          if (!encryptedData) {
            resolve(defaultValue);
            return;
          }

          try {
            const decryptedData = securityManager.decryptObject(encryptedData);
            
            // Check if data has expired
            if (decryptedData.expiresAt && Date.now() > decryptedData.expiresAt) {
              console.log(`[Storage] Data expired for key: ${key}`);
              this.remove(key); // Clean up expired data
              resolve(defaultValue);
              return;
            }

            // Update memory cache
            this.memoryCache.set(key, {
              value: decryptedData.value,
              timestamp: Date.now(),
              expiresAt: decryptedData.expiresAt
            });

            console.log(`[Storage] Retrieved secure data for key: ${key}`);
            resolve(decryptedData.value);
          } catch (decryptError) {
            console.error('[Storage] Failed to decrypt data:', decryptError);
            resolve(defaultValue);
          }
        });
      });
    } catch (error) {
      console.error('[Storage] Failed to retrieve secure data:', error);
      return defaultValue;
    }
  }

  /**
   * Store API keys securely with validation
   */
  async setApiKey(provider, apiKey) {
    if (!apiKey || typeof apiKey !== 'string') {
      throw new Error('Invalid API key provided');
    }

    // Validate API key format
    if (!securityManager.validateApiKeyFormat(apiKey, provider)) {
      throw new Error(`Invalid API key format for provider: ${provider}`);
    }

    try {
      await this.setSecure(`api_key_${provider}`, apiKey, {
        metadata: {
          provider: provider,
          hash: securityManager.generateApiKeyHash(apiKey, provider),
          createdAt: Date.now()
        }
      });

      console.log(`[Storage] API key stored securely for provider: ${provider}`);
    } catch (error) {
      console.error('[Storage] Failed to store API key:', error);
      throw new Error(`Failed to store API key for provider: ${provider}`);
    }
  }

  /**
   * Retrieve API key for a provider
   */
  async getApiKey(provider) {
    try {
      const apiKey = await this.getSecure(`api_key_${provider}`);
      return apiKey;
    } catch (error) {
      console.error('[Storage] Failed to retrieve API key:', error);
      return null;
    }
  }

  /**
   * Store all API keys at once
   */
  async setApiKeys(apiKeys) {
    const promises = Object.entries(apiKeys).map(([provider, key]) => 
      this.setApiKey(provider, key)
    );

    try {
      await Promise.all(promises);
      console.log('[Storage] All API keys stored successfully');
    } catch (error) {
      console.error('[Storage] Failed to store some API keys:', error);
      throw error;
    }
  }

  /**
   * Get all configured API keys
   */
  async getAllApiKeys() {
    try {
      const providers = ['groq', 'huggingface', 'openrouter', 'openai'];
      const apiKeys = {};

      for (const provider of providers) {
        const key = await this.getApiKey(provider);
        if (key) {
          apiKeys[provider] = key;
        }
      }

      return apiKeys;
    } catch (error) {
      console.error('[Storage] Failed to retrieve API keys:', error);
      return {};
    }
  }

  /**
   * Cache API responses with TTL
   */
  async cacheApiResponse(endpoint, params, response, ttlMs = this.cacheExpiry) {
    const cacheKey = this.generateCacheKey(endpoint, params);
    const expiresAt = Date.now() + ttlMs;

    try {
      await this.setSecure(`cache_${cacheKey}`, response, { expiresAt });
      console.log(`[Storage] Cached API response for: ${endpoint}`);
    } catch (error) {
      console.error('[Storage] Failed to cache API response:', error);
    }
  }

  /**
   * Retrieve cached API response
   */
  async getCachedApiResponse(endpoint, params) {
    const cacheKey = this.generateCacheKey(endpoint, params);
    
    try {
      const cachedResponse = await this.getSecure(`cache_${cacheKey}`);
      if (cachedResponse) {
        console.log(`[Storage] Cache hit for: ${endpoint}`);
        return cachedResponse;
      }
      return null;
    } catch (error) {
      console.error('[Storage] Failed to retrieve cached response:', error);
      return null;
    }
  }

  /**
   * Generate cache key from endpoint and parameters
   */
  generateCacheKey(endpoint, params) {
    const paramString = JSON.stringify(params || {});
    return btoa(endpoint + paramString).replace(/[+/=]/g, '');
  }

  /**
   * Store user preferences and settings
   */
  async setPreferences(preferences) {
    try {
      await this.setSecure('user_preferences', preferences);
      console.log('[Storage] User preferences saved');
    } catch (error) {
      console.error('[Storage] Failed to save preferences:', error);
      throw error;
    }
  }

  /**
   * Get user preferences and settings
   */
  async getPreferences(defaultPreferences = {}) {
    try {
      return await this.getSecure('user_preferences', defaultPreferences);
    } catch (error) {
      console.error('[Storage] Failed to retrieve preferences:', error);
      return defaultPreferences;
    }
  }

  /**
   * Store workflow templates
   */
  async saveWorkflowTemplate(templateId, template) {
    try {
      await this.setSecure(`template_${templateId}`, template, {
        metadata: {
          templateId,
          createdAt: Date.now(),
          version: '1.0'
        }
      });
      console.log(`[Storage] Workflow template saved: ${templateId}`);
    } catch (error) {
      console.error('[Storage] Failed to save workflow template:', error);
      throw error;
    }
  }

  /**
   * Get workflow template
   */
  async getWorkflowTemplate(templateId) {
    try {
      return await this.getSecure(`template_${templateId}`);
    } catch (error) {
      console.error('[Storage] Failed to retrieve workflow template:', error);
      return null;
    }
  }

  /**
   * Get all workflow templates
   */
  async getAllWorkflowTemplates() {
    try {
      return new Promise((resolve, reject) => {
        chrome.storage.local.get(null, (items) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }

          const templates = {};
          const templateKeys = Object.keys(items).filter(key => 
            key.startsWith(this.storagePrefix + 'template_')
          );

          const promises = templateKeys.map(async (key) => {
            const templateId = key.replace(this.storagePrefix + 'template_', '');
            try {
              const template = await this.getSecure(`template_${templateId}`);
              if (template) {
                templates[templateId] = template;
              }
            } catch (error) {
              console.warn(`[Storage] Failed to decrypt template: ${templateId}`);
            }
          });

          Promise.all(promises).then(() => {
            resolve(templates);
          }).catch(reject);
        });
      });
    } catch (error) {
      console.error('[Storage] Failed to retrieve workflow templates:', error);
      return {};
    }
  }

  /**
   * Store analytics and usage data
   */
  async storeAnalytics(event, data) {
    try {
      const analyticsKey = `analytics_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await this.setSecure(analyticsKey, {
        event,
        data,
        timestamp: Date.now(),
        sessionId: await this.getSessionId()
      });
    } catch (error) {
      console.error('[Storage] Failed to store analytics:', error);
    }
  }

  /**
   * Get session ID (create if doesn't exist)
   */
  async getSessionId() {
    let sessionId = await this.getSecure('session_id');
    if (!sessionId) {
      sessionId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
      await this.setSecure('session_id', sessionId, {
        expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
      });
    }
    return sessionId;
  }

  /**
   * Remove data from storage
   */
  async remove(key) {
    try {
      const storageKey = this.storagePrefix + key;
      
      return new Promise((resolve, reject) => {
        chrome.storage.local.remove([storageKey], () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            // Remove from memory cache
            this.memoryCache.delete(key);
            console.log(`[Storage] Removed data for key: ${key}`);
            resolve();
          }
        });
      });
    } catch (error) {
      console.error('[Storage] Failed to remove data:', error);
      throw error;
    }
  }

  /**
   * Clear all stored data (for logout/reset)
   */
  async clearAll() {
    try {
      return new Promise((resolve, reject) => {
        chrome.storage.local.get(null, (items) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }

          const keysToRemove = Object.keys(items).filter(key => 
            key.startsWith(this.storagePrefix)
          );

          if (keysToRemove.length === 0) {
            resolve();
            return;
          }

          chrome.storage.local.remove(keysToRemove, () => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              // Clear memory cache
              this.memoryCache.clear();
              console.log('[Storage] All WorkflowGenius data cleared');
              resolve();
            }
          });
        });
      });
    } catch (error) {
      console.error('[Storage] Failed to clear all data:', error);
      throw error;
    }
  }

  /**
   * Get storage usage statistics
   */
  async getStorageStats() {
    try {
      return new Promise((resolve, reject) => {
        chrome.storage.local.getBytesInUse(null, (bytesInUse) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }

          chrome.storage.local.get(null, (items) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
              return;
            }

            const wgItems = Object.keys(items).filter(key => 
              key.startsWith(this.storagePrefix)
            );

            resolve({
              totalBytesUsed: bytesInUse,
              wgItemCount: wgItems.length,
              memoryCacheSize: this.memoryCache.size,
              quota: chrome.storage.local.QUOTA_BYTES || 'unlimited'
            });
          });
        });
      });
    } catch (error) {
      console.error('[Storage] Failed to get storage stats:', error);
      return null;
    }
  }

  /**
   * Cleanup expired data
   */
  async cleanupExpiredData() {
    try {
      console.log('[Storage] Starting cleanup of expired data...');
      
      return new Promise((resolve, reject) => {
        chrome.storage.local.get(null, async (items) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }

          const wgKeys = Object.keys(items).filter(key => 
            key.startsWith(this.storagePrefix)
          );

          let cleanedCount = 0;

          for (const storageKey of wgKeys) {
            try {
              const encryptedData = items[storageKey];
              const decryptedData = securityManager.decryptObject(encryptedData);
              
              if (decryptedData.expiresAt && Date.now() > decryptedData.expiresAt) {
                const key = storageKey.replace(this.storagePrefix, '');
                await this.remove(key);
                cleanedCount++;
              }
            } catch (error) {
              // If we can't decrypt, it might be corrupted - remove it
              console.warn(`[Storage] Removing corrupted data: ${storageKey}`);
              chrome.storage.local.remove([storageKey]);
              cleanedCount++;
            }
          }

          console.log(`[Storage] Cleanup completed. Removed ${cleanedCount} items.`);
          resolve(cleanedCount);
        });
      });
    } catch (error) {
      console.error('[Storage] Failed to cleanup expired data:', error);
      return 0;
    }
  }

  /**
   * Check if storage manager is initialized
   */
  isInitialized() {
    return this.initialized;
  }
}

// Create singleton instance
const dataStorageManager = new DataStorageManager();

export default dataStorageManager;
export { DataStorageManager };
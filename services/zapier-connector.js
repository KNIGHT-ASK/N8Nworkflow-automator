/**
 * Zapier Connector Module for WorkflowGenius
 * Handles Zapier platform API integration for cross-platform workflow support
 */

import securityManager from './security.js';
import dataStorageManager from './data-storage.js';

class ZapierConnector {
  constructor() {
    this.initialized = false;
    this.apiKey = null;
    this.baseUrl = 'https://zapier.com/api/v1';
    this.rateLimiter = null;
    this.defaultTimeout = 30000;
    this.maxRetries = 3;
    this.retryDelays = [1000, 2000, 4000];
  }

  /**
   * Initialize the Zapier connector
   */
  async initialize(config = {}) {
    try {
      if (!securityManager.isInitialized()) {
        await securityManager.initialize();
      }
      if (!dataStorageManager.isInitialized()) {
        await dataStorageManager.initialize();
      }

      // Load configuration from storage or use provided config
      const storedConfig = await this.loadConfiguration();
      const finalConfig = { ...storedConfig, ...config };

      this.apiKey = finalConfig.apiKey;

      // Setup rate limiter (Zapier has generous limits but we'll be conservative)
      this.rateLimiter = securityManager.createRateLimiter(100, 60000); // 100 requests per minute

      this.initialized = true;
      console.log('[ZapierConnector] Initialized successfully');
    } catch (error) {
      console.error('[ZapierConnector] Failed to initialize:', error);
      throw new Error('Zapier Connector initialization failed');
    }
  }

  /**
   * Load Zapier configuration from storage
   */
  async loadConfiguration() {
    try {
      const config = await dataStorageManager.getSecure('zapier_config', {});
      return config;
    } catch (error) {
      console.error('[ZapierConnector] Failed to load configuration:', error);
      return {};
    }
  }

  /**
   * Save Zapier configuration to storage
   */
  async saveConfiguration(config) {
    try {
      await dataStorageManager.setSecure('zapier_config', config);
      console.log('[ZapierConnector] Configuration saved successfully');
    } catch (error) {
      console.error('[ZapierConnector] Failed to save configuration:', error);
      throw error;
    }
  }

  /**
   * Set Zapier API key
   */
  async setApiKey(apiKey) {
    try {
      // Validate API key format (basic validation)
      if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 10) {
        throw new Error('Invalid Zapier API key format');
      }

      const config = {
        apiKey: apiKey,
        configuredAt: Date.now()
      };

      await this.saveConfiguration(config);
      this.apiKey = apiKey;

      console.log('[ZapierConnector] API key configured successfully');
    } catch (error) {
      console.error('[ZapierConnector] Failed to set API key:', error);
      throw error;
    }
  }

  /**
   * Check rate limits before making requests
   */
  checkRateLimit() {
    if (!this.rateLimiter.canMakeRequest()) {
      const waitTime = this.rateLimiter.getWaitTime();
      throw new Error(`Rate limit exceeded. Try again in ${Math.ceil(waitTime / 1000)} seconds.`);
    }
    return true;
  }

  /**
   * Make authenticated request to Zapier API
   */
  async makeRequest(endpoint, options = {}, retryCount = 0) {
    if (!this.initialized) {
      throw new Error('ZapierConnector not initialized');
    }

    if (!this.apiKey) {
      throw new Error('Zapier API key not configured');
    }

    this.checkRateLimit();

    try {
      const url = `${this.baseUrl}${endpoint}`;
      
      // Validate URL
      if (!securityManager.validateTrustedUrl(url)) {
        throw new Error(`Untrusted URL: ${url}`);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.defaultTimeout);

      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'User-Agent': 'WorkflowGenius/1.0.0',
        ...options.headers
      };

      const requestOptions = {
        method: options.method || 'GET',
        headers: headers,
        signal: controller.signal,
        ...options
      };

      if (requestOptions.body && typeof requestOptions.body === 'object') {
        requestOptions.body = JSON.stringify(requestOptions.body);
      }

      console.log(`[ZapierConnector] Making request to: ${endpoint}`);
      const response = await fetch(url, requestOptions);

      clearTimeout(timeoutId);

      // Handle different response status codes
      if (response.status === 401) {
        throw new Error('Authentication failed - check your Zapier API key');
      }

      if (response.status === 403) {
        throw new Error('Access forbidden - insufficient permissions');
      }

      if (response.status === 404) {
        throw new Error('Resource not found');
      }

      if (response.status === 429) {
        throw new Error('Rate limit exceeded');
      }

      if (response.status >= 500) {
        throw new Error(`Zapier server error: ${response.status}`);
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Zapier API error: ${response.status} - ${errorText}`);
      }

      // Handle empty responses
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      } else {
        return await response.text();
      }
    } catch (error) {
      console.error(`[ZapierConnector] Request failed:`, error);

      // Retry logic for certain errors
      if (retryCount < this.maxRetries && this.shouldRetry(error)) {
        const delay = this.retryDelays[retryCount] || 4000;
        console.log(`[ZapierConnector] Retrying in ${delay}ms... (attempt ${retryCount + 1})`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.makeRequest(endpoint, options, retryCount + 1);
      }

      throw error;
    }
  }

  /**
   * Determine if a request should be retried
   */
  shouldRetry(error) {
    const retryableErrors = [
      'fetch failed',
      'network error',
      'timeout',
      'server error',
      'temporarily unavailable'
    ];

    return retryableErrors.some(retryableError => 
      error.message.toLowerCase().includes(retryableError)
    );
  }

  /**
   * Test connection to Zapier API
   */
  async testConnection() {
    try {
      const response = await this.makeRequest('/me');
      return {
        success: true,
        message: 'Connection successful',
        user: response
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * Get user profile information
   */
  async getUserProfile() {
    try {
      const response = await this.makeRequest('/me');
      return {
        success: true,
        profile: response
      };
    } catch (error) {
      console.error('[ZapierConnector] Failed to get user profile:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get all user's Zaps
   */
  async getZaps(limit = 100) {
    try {
      const response = await this.makeRequest(`/zaps?limit=${limit}`);
      return {
        success: true,
        zaps: response.results || response,
        count: response.count || (response.results ? response.results.length : 0)
      };
    } catch (error) {
      console.error('[ZapierConnector] Failed to get Zaps:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get a specific Zap by ID
   */
  async getZap(zapId) {
    try {
      const response = await this.makeRequest(`/zaps/${zapId}`);
      return {
        success: true,
        zap: response
      };
    } catch (error) {
      console.error('[ZapierConnector] Failed to get Zap:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create a new Zap (webhook-based)
   */
  async createWebhookZap(zapData) {
    try {
      const sanitizedData = this.sanitizeZapData(zapData);
      
      // Create webhook trigger URL
      const webhookUrl = await this.createWebhookTrigger();
      
      const zapConfig = {
        title: sanitizedData.title || 'WorkflowGenius Generated Zap',
        steps: [
          {
            type: 'trigger',
            app: 'webhook',
            action: 'catch_hook',
            params: {
              url: webhookUrl
            }
          },
          ...sanitizedData.steps || []
        ]
      };

      // Note: Zapier doesn't have a direct API to create Zaps programmatically
      // This would typically require using Zapier's Partner API or CLI
      // For now, we'll create the configuration and return it
      
      return {
        success: true,
        zap: zapConfig,
        webhookUrl: webhookUrl,
        message: 'Zap configuration created. Manual setup required in Zapier dashboard.'
      };
    } catch (error) {
      console.error('[ZapierConnector] Failed to create Zap:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create a webhook trigger URL
   */
  async createWebhookTrigger() {
    // Generate a unique webhook URL for Zapier
    const webhookId = 'wg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const webhookUrl = `https://hooks.zapier.com/hooks/catch/${webhookId}/`;
    
    // Store webhook configuration
    await dataStorageManager.setSecure(`webhook_${webhookId}`, {
      id: webhookId,
      url: webhookUrl,
      createdAt: Date.now(),
      status: 'active'
    });

    return webhookUrl;
  }

  /**
   * Trigger a webhook (send data to Zapier)
   */
  async triggerWebhook(webhookUrl, data) {
    try {
      const sanitizedData = this.sanitizeWebhookData(data);
      
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'WorkflowGenius/1.0.0'
        },
        body: JSON.stringify(sanitizedData)
      });

      if (!response.ok) {
        throw new Error(`Webhook trigger failed: ${response.status}`);
      }

      return {
        success: true,
        message: 'Webhook triggered successfully',
        status: response.status
      };
    } catch (error) {
      console.error('[ZapierConnector] Failed to trigger webhook:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get available apps from Zapier
   */
  async getAvailableApps() {
    try {
      const response = await this.makeRequest('/apps');
      return {
        success: true,
        apps: response.results || response
      };
    } catch (error) {
      console.error('[ZapierConnector] Failed to get available apps:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Search for specific apps
   */
  async searchApps(query) {
    try {
      const response = await this.makeRequest(`/apps?search=${encodeURIComponent(query)}`);
      return {
        success: true,
        apps: response.results || response
      };
    } catch (error) {
      console.error('[ZapierConnector] Failed to search apps:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get app details by slug
   */
  async getApp(appSlug) {
    try {
      const response = await this.makeRequest(`/apps/${appSlug}`);
      return {
        success: true,
        app: response
      };
    } catch (error) {
      console.error('[ZapierConnector] Failed to get app details:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get user's app connections
   */
  async getConnections() {
    try {
      const response = await this.makeRequest('/connections');
      return {
        success: true,
        connections: response.results || response
      };
    } catch (error) {
      console.error('[ZapierConnector] Failed to get connections:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Sanitize Zap data before processing
   */
  sanitizeZapData(zapData) {
    const sanitized = JSON.parse(JSON.stringify(zapData));

    if (sanitized.title) {
      sanitized.title = securityManager.sanitizeInput(sanitized.title);
    }

    if (sanitized.description) {
      sanitized.description = securityManager.sanitizeInput(sanitized.description);
    }

    if (sanitized.steps && Array.isArray(sanitized.steps)) {
      sanitized.steps = sanitized.steps.map(step => ({
        ...step,
        title: step.title ? securityManager.sanitizeInput(step.title) : undefined,
        app: step.app ? securityManager.sanitizeInput(step.app) : undefined,
        action: step.action ? securityManager.sanitizeInput(step.action) : undefined
      }));
    }

    return sanitized;
  }

  /**
   * Sanitize webhook data
   */
  sanitizeWebhookData(data) {
    const sanitized = {};

    Object.keys(data).forEach(key => {
      const value = data[key];
      const sanitizedKey = securityManager.sanitizeInput(key);
      
      if (typeof value === 'string') {
        sanitized[sanitizedKey] = securityManager.sanitizeInput(value);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[sanitizedKey] = this.sanitizeWebhookData(value);
      } else {
        sanitized[sanitizedKey] = value;
      }
    });

    return sanitized;
  }

  /**
   * Convert WorkflowGenius workflow to Zapier format
   */
  convertToZapierFormat(workflowGenius) {
    const zapierWorkflow = {
      title: workflowGenius.name || 'Generated Workflow',
      description: 'Generated by WorkflowGenius',
      steps: []
    };

    // Add webhook trigger as the first step
    zapierWorkflow.steps.push({
      type: 'trigger',
      app: 'webhook',
      action: 'catch_hook',
      title: 'WorkflowGenius Trigger',
      params: {}
    });

    // Convert workflow steps to Zapier actions
    if (workflowGenius.steps && Array.isArray(workflowGenius.steps)) {
      workflowGenius.steps.forEach((step, index) => {
        const zapierStep = {
          type: 'action',
          app: this.mapStepTypeToZapierApp(step.type),
          action: this.mapStepActionToZapier(step.type, step.action),
          title: step.name || `Step ${index + 1}`,
          params: this.mapStepParametersToZapier(step.parameters || {})
        };

        zapierWorkflow.steps.push(zapierStep);
      });
    }

    return zapierWorkflow;
  }

  /**
   * Map WorkflowGenius step types to Zapier apps
   */
  mapStepTypeToZapierApp(stepType) {
    const appMapping = {
      'email': 'gmail',
      'notification': 'slack',
      'http_request': 'webhooks',
      'data_storage': 'storage',
      'calendar': 'google-calendar',
      'spreadsheet': 'google-sheets',
      'document': 'google-docs',
      'crm': 'hubspot',
      'project_management': 'trello',
      'file_storage': 'dropbox',
      'payment': 'stripe',
      'social_media': 'twitter',
      'analytics': 'google-analytics'
    };

    return appMapping[stepType] || 'webhooks';
  }

  /**
   * Map WorkflowGenius actions to Zapier actions
   */
  mapStepActionToZapier(stepType, action) {
    const actionMapping = {
      'email': {
        'send': 'send_email',
        'receive': 'new_email'
      },
      'notification': {
        'send': 'send_channel_message',
        'alert': 'send_direct_message'
      },
      'http_request': {
        'get': 'get',
        'post': 'post',
        'put': 'put',
        'delete': 'delete'
      },
      'calendar': {
        'create_event': 'create_detailed_event',
        'update_event': 'update_event'
      },
      'spreadsheet': {
        'add_row': 'create_spreadsheet_row',
        'update_row': 'update_spreadsheet_row'
      }
    };

    const typeActions = actionMapping[stepType];
    return typeActions ? typeActions[action] || 'webhook' : 'webhook';
  }

  /**
   * Map WorkflowGenius parameters to Zapier format
   */
  mapStepParametersToZapier(parameters) {
    const mapped = {};

    Object.keys(parameters).forEach(key => {
      const value = parameters[key];
      
      // Convert parameter names to Zapier conventions
      const zapierKey = key.replace(/_/g, '_').toLowerCase();
      
      if (typeof value === 'string') {
        mapped[zapierKey] = securityManager.sanitizeInput(value);
      } else {
        mapped[zapierKey] = value;
      }
    });

    return mapped;
  }

  /**
   * Generate Zapier integration guide
   */
  generateIntegrationGuide(workflowGenius) {
    const zapierConfig = this.convertToZapierFormat(workflowGenius);
    
    const guide = {
      title: 'Zapier Integration Guide',
      workflow: zapierConfig,
      steps: [
        '1. Log in to your Zapier account',
        '2. Create a new Zap',
        '3. Set up Webhook trigger with the provided URL',
        '4. Configure the following actions in order:',
        ...zapierConfig.steps.slice(1).map((step, index) => 
          `   ${index + 1}. ${step.app} - ${step.action} (${step.title})`
        ),
        '5. Test and activate your Zap',
        '6. Use the webhook URL in WorkflowGenius to trigger the workflow'
      ],
      webhookUrl: null, // Will be set when webhook is created
      estimatedSetupTime: '5-10 minutes'
    };

    return guide;
  }

  /**
   * Get stored webhooks
   */
  async getStoredWebhooks() {
    try {
      // Get all webhook configurations
      const allData = await dataStorageManager.getAllWorkflowTemplates();
      const webhooks = {};

      Object.keys(allData).forEach(key => {
        if (key.startsWith('webhook_')) {
          const webhookId = key.replace('webhook_', '');
          webhooks[webhookId] = allData[key];
        }
      });

      return {
        success: true,
        webhooks: webhooks
      };
    } catch (error) {
      console.error('[ZapierConnector] Failed to get stored webhooks:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Delete a stored webhook
   */
  async deleteWebhook(webhookId) {
    try {
      await dataStorageManager.remove(`webhook_${webhookId}`);
      return {
        success: true,
        message: 'Webhook deleted successfully'
      };
    } catch (error) {
      console.error('[ZapierConnector] Failed to delete webhook:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get Zapier connector statistics
   */
  getStats() {
    return {
      initialized: this.initialized,
      hasApiKey: !!this.apiKey,
      baseUrl: this.baseUrl,
      maxRetries: this.maxRetries,
      timeout: this.defaultTimeout
    };
  }

  /**
   * Clear Zapier configuration
   */
  async clearConfiguration() {
    try {
      await dataStorageManager.remove('zapier_config');
      this.apiKey = null;
      console.log('[ZapierConnector] Configuration cleared');
    } catch (error) {
      console.error('[ZapierConnector] Failed to clear configuration:', error);
      throw error;
    }
  }

  /**
   * Export workflow for Zapier import
   */
  async exportForZapier(workflowGenius) {
    try {
      const zapierConfig = this.convertToZapierFormat(workflowGenius);
      const guide = this.generateIntegrationGuide(workflowGenius);
      
      // Create webhook URL for the workflow
      const webhookUrl = await this.createWebhookTrigger();
      guide.webhookUrl = webhookUrl;

      return {
        success: true,
        config: zapierConfig,
        guide: guide,
        webhookUrl: webhookUrl
      };
    } catch (error) {
      console.error('[ZapierConnector] Failed to export for Zapier:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Create singleton instance
const zapierConnector = new ZapierConnector();

export default zapierConnector;
export { ZapierConnector };
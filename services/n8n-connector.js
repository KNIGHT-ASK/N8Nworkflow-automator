/**
 * n8n Connector Module for WorkflowGenius
 * Handles n8n platform API integration for workflow deployment and management
 */

import securityManager from './security.js';
import dataStorageManager from './data-storage.js';

class N8nConnector {
  constructor() {
    this.initialized = false;
    this.baseUrl = null;
    this.apiKey = null;
    this.rateLimiter = null;
    this.defaultTimeout = 30000;
    this.maxRetries = 3;
    this.retryDelays = [1000, 2000, 4000];
  }

  /**
   * Initialize the n8n connector
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

      if (!finalConfig.baseUrl) {
        throw new Error('n8n base URL is required');
      }

      this.baseUrl = finalConfig.baseUrl.replace(/\/$/, ''); // Remove trailing slash
      this.apiKey = finalConfig.apiKey;

      // Setup rate limiter (n8n doesn't have strict limits but we'll be conservative)
      this.rateLimiter = securityManager.createRateLimiter(60, 60000); // 60 requests per minute

      this.initialized = true;
      console.log('[N8nConnector] Initialized successfully');
    } catch (error) {
      console.error('[N8nConnector] Failed to initialize:', error);
      throw new Error('n8n Connector initialization failed');
    }
  }

  /**
   * Load n8n configuration from storage
   */
  async loadConfiguration() {
    try {
      const config = await dataStorageManager.getSecure('n8n_config', {});
      return config;
    } catch (error) {
      console.error('[N8nConnector] Failed to load configuration:', error);
      return {};
    }
  }

  /**
   * Save n8n configuration to storage
   */
  async saveConfiguration(config) {
    try {
      await dataStorageManager.setSecure('n8n_config', config);
      console.log('[N8nConnector] Configuration saved successfully');
    } catch (error) {
      console.error('[N8nConnector] Failed to save configuration:', error);
      throw error;
    }
  }

  /**
   * Set n8n instance details
   */
  async setInstanceDetails(baseUrl, apiKey) {
    try {
      // Validate URL format
      const urlObj = new URL(baseUrl);
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        throw new Error('Invalid URL protocol. Must be HTTP or HTTPS');
      }

      // Validate API key format (basic validation)
      if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 10) {
        throw new Error('Invalid API key format');
      }

      const config = {
        baseUrl: baseUrl.replace(/\/$/, ''),
        apiKey: apiKey,
        configuredAt: Date.now()
      };

      await this.saveConfiguration(config);
      
      this.baseUrl = config.baseUrl;
      this.apiKey = config.apiKey;

      console.log('[N8nConnector] Instance details configured successfully');
    } catch (error) {
      console.error('[N8nConnector] Failed to set instance details:', error);
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
   * Make authenticated request to n8n API
   */
  async makeRequest(endpoint, options = {}, retryCount = 0) {
    if (!this.initialized) {
      throw new Error('N8nConnector not initialized');
    }

    if (!this.apiKey) {
      throw new Error('n8n API key not configured');
    }

    this.checkRateLimit();

    try {
      const url = `${this.baseUrl}/api/v1${endpoint}`;
      
      // Validate URL
      if (!securityManager.validateTrustedUrl(url) && !this.isLocalInstance(url)) {
        throw new Error(`Untrusted URL: ${url}`);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.defaultTimeout);

      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-N8N-API-KEY': this.apiKey,
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

      console.log(`[N8nConnector] Making request to: ${endpoint}`);
      const response = await fetch(url, requestOptions);

      clearTimeout(timeoutId);

      // Handle different response status codes
      if (response.status === 401) {
        throw new Error('Authentication failed - check your n8n API key');
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
        throw new Error(`n8n server error: ${response.status}`);
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`n8n API error: ${response.status} - ${errorText}`);
      }

      // Handle empty responses
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      } else {
        return await response.text();
      }
    } catch (error) {
      console.error(`[N8nConnector] Request failed:`, error);

      // Retry logic for certain errors
      if (retryCount < this.maxRetries && this.shouldRetry(error)) {
        const delay = this.retryDelays[retryCount] || 4000;
        console.log(`[N8nConnector] Retrying in ${delay}ms... (attempt ${retryCount + 1})`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.makeRequest(endpoint, options, retryCount + 1);
      }

      throw error;
    }
  }

  /**
   * Check if URL is a local n8n instance
   */
  isLocalInstance(url) {
    const localHosts = ['localhost', '127.0.0.1', '0.0.0.0'];
    try {
      const urlObj = new URL(url);
      return localHosts.includes(urlObj.hostname) || urlObj.hostname.endsWith('.local');
    } catch {
      return false;
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
   * Test connection to n8n instance
   */
  async testConnection() {
    try {
      const response = await this.makeRequest('/workflows');
      return {
        success: true,
        message: 'Connection successful',
        workflowCount: response.data ? response.data.length : 0
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * Get all workflows from n8n
   */
  async getWorkflows() {
    try {
      const response = await this.makeRequest('/workflows');
      return {
        success: true,
        workflows: response.data || response,
        count: response.data ? response.data.length : 0
      };
    } catch (error) {
      console.error('[N8nConnector] Failed to get workflows:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get a specific workflow by ID
   */
  async getWorkflow(workflowId) {
    try {
      const response = await this.makeRequest(`/workflows/${workflowId}`);
      return {
        success: true,
        workflow: response.data || response
      };
    } catch (error) {
      console.error('[N8nConnector] Failed to get workflow:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create a new workflow in n8n
   */
  async createWorkflow(workflowData) {
    try {
      const sanitizedData = this.sanitizeWorkflowData(workflowData);
      
      const response = await this.makeRequest('/workflows', {
        method: 'POST',
        body: sanitizedData
      });

      return {
        success: true,
        workflow: response.data || response,
        id: (response.data || response).id
      };
    } catch (error) {
      console.error('[N8nConnector] Failed to create workflow:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Update an existing workflow
   */
  async updateWorkflow(workflowId, workflowData) {
    try {
      const sanitizedData = this.sanitizeWorkflowData(workflowData);
      
      const response = await this.makeRequest(`/workflows/${workflowId}`, {
        method: 'PUT',
        body: sanitizedData
      });

      return {
        success: true,
        workflow: response.data || response
      };
    } catch (error) {
      console.error('[N8nConnector] Failed to update workflow:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Delete a workflow
   */
  async deleteWorkflow(workflowId) {
    try {
      await this.makeRequest(`/workflows/${workflowId}`, {
        method: 'DELETE'
      });

      return {
        success: true,
        message: 'Workflow deleted successfully'
      };
    } catch (error) {
      console.error('[N8nConnector] Failed to delete workflow:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Activate/deactivate a workflow
   */
  async setWorkflowActive(workflowId, active) {
    try {
      const endpoint = active ? `/workflows/${workflowId}/activate` : `/workflows/${workflowId}/deactivate`;
      
      const response = await this.makeRequest(endpoint, {
        method: 'POST'
      });

      return {
        success: true,
        workflow: response.data || response,
        active: active
      };
    } catch (error) {
      console.error('[N8nConnector] Failed to set workflow active state:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Execute a workflow manually
   */
  async executeWorkflow(workflowId, inputData = {}) {
    try {
      const response = await this.makeRequest(`/workflows/${workflowId}/execute`, {
        method: 'POST',
        body: {
          data: inputData
        }
      });

      return {
        success: true,
        execution: response.data || response,
        executionId: (response.data || response).id
      };
    } catch (error) {
      console.error('[N8nConnector] Failed to execute workflow:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get workflow execution history
   */
  async getExecutions(workflowId, limit = 20) {
    try {
      const response = await this.makeRequest(`/executions?workflowId=${workflowId}&limit=${limit}`);
      return {
        success: true,
        executions: response.data || response
      };
    } catch (error) {
      console.error('[N8nConnector] Failed to get executions:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get available node types
   */
  async getNodeTypes() {
    try {
      const response = await this.makeRequest('/node-types');
      return {
        success: true,
        nodeTypes: response.data || response
      };
    } catch (error) {
      console.error('[N8nConnector] Failed to get node types:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Sanitize workflow data before sending to n8n
   */
  sanitizeWorkflowData(workflowData) {
    // Create a deep copy to avoid modifying the original
    const sanitized = JSON.parse(JSON.stringify(workflowData));

    // Ensure required fields exist
    if (!sanitized.name) {
      sanitized.name = 'WorkflowGenius Generated Workflow';
    }

    if (!sanitized.nodes) {
      sanitized.nodes = [];
    }

    if (!sanitized.connections) {
      sanitized.connections = {};
    }

    // Sanitize string fields to prevent XSS
    if (sanitized.name) {
      sanitized.name = securityManager.sanitizeInput(sanitized.name);
    }

    if (sanitized.tags && Array.isArray(sanitized.tags)) {
      sanitized.tags = sanitized.tags.map(tag => securityManager.sanitizeInput(tag));
    }

    // Ensure nodes have required properties
    sanitized.nodes = sanitized.nodes.map(node => ({
      id: node.id || this.generateNodeId(),
      name: securityManager.sanitizeInput(node.name || 'Node'),
      type: node.type || 'n8n-nodes-base.noOp',
      position: node.position || [0, 0],
      parameters: node.parameters || {},
      ...node
    }));

    return sanitized;
  }

  /**
   * Generate a unique node ID
   */
  generateNodeId() {
    return 'node_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Convert WorkflowGenius workflow format to n8n format
   */
  convertToN8nFormat(workflowGenius) {
    const n8nWorkflow = {
      name: workflowGenius.name || 'Generated Workflow',
      nodes: [],
      connections: {},
      active: false,
      settings: {},
      tags: workflowGenius.tags || ['WorkflowGenius']
    };

    // Convert steps to n8n nodes
    if (workflowGenius.steps && Array.isArray(workflowGenius.steps)) {
      workflowGenius.steps.forEach((step, index) => {
        const node = {
          id: this.generateNodeId(),
          name: step.name || `Step ${index + 1}`,
          type: this.mapStepTypeToN8nNode(step.type),
          position: [index * 200, 100],
          parameters: this.mapStepParametersToN8n(step.parameters || {})
        };

        n8nWorkflow.nodes.push(node);

        // Add connections between nodes
        if (index > 0) {
          const previousNodeId = n8nWorkflow.nodes[index - 1].id;
          n8nWorkflow.connections[previousNodeId] = {
            main: [[{ node: node.id, type: 'main', index: 0 }]]
          };
        }
      });
    }

    return n8nWorkflow;
  }

  /**
   * Map WorkflowGenius step types to n8n node types
   */
  mapStepTypeToN8nNode(stepType) {
    const typeMapping = {
      'http_request': 'n8n-nodes-base.httpRequest',
      'webhook': 'n8n-nodes-base.webhook',
      'email': 'n8n-nodes-base.emailSend',
      'delay': 'n8n-nodes-base.wait',
      'condition': 'n8n-nodes-base.if',
      'data_transform': 'n8n-nodes-base.function',
      'schedule': 'n8n-nodes-base.cron',
      'file_operation': 'n8n-nodes-base.readBinaryFile',
      'database': 'n8n-nodes-base.postgres',
      'api_call': 'n8n-nodes-base.httpRequest',
      'notification': 'n8n-nodes-base.slack'
    };

    return typeMapping[stepType] || 'n8n-nodes-base.noOp';
  }

  /**
   * Map WorkflowGenius parameters to n8n format
   */
  mapStepParametersToN8n(parameters) {
    // This is a simplified mapping - in practice, this would be much more complex
    // and would need to handle different node types differently
    const mapped = {};

    Object.keys(parameters).forEach(key => {
      const value = parameters[key];
      
      // Sanitize string values
      if (typeof value === 'string') {
        mapped[key] = securityManager.sanitizeInput(value);
      } else {
        mapped[key] = value;
      }
    });

    return mapped;
  }

  /**
   * Export workflow from n8n to WorkflowGenius format
   */
  async exportWorkflow(workflowId) {
    try {
      const result = await this.getWorkflow(workflowId);
      
      if (!result.success) {
        throw new Error(result.error);
      }

      const n8nWorkflow = result.workflow;
      const workflowGenius = {
        name: n8nWorkflow.name,
        description: 'Exported from n8n',
        tags: n8nWorkflow.tags || [],
        steps: [],
        metadata: {
          exportedFrom: 'n8n',
          exportedAt: Date.now(),
          originalId: workflowId
        }
      };

      // Convert n8n nodes to WorkflowGenius steps
      if (n8nWorkflow.nodes) {
        workflowGenius.steps = n8nWorkflow.nodes.map(node => ({
          name: node.name,
          type: this.mapN8nNodeToStepType(node.type),
          parameters: node.parameters || {},
          position: node.position || [0, 0]
        }));
      }

      return {
        success: true,
        workflow: workflowGenius
      };
    } catch (error) {
      console.error('[N8nConnector] Failed to export workflow:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Map n8n node types back to WorkflowGenius step types
   */
  mapN8nNodeToStepType(nodeType) {
    const reverseMapping = {
      'n8n-nodes-base.httpRequest': 'http_request',
      'n8n-nodes-base.webhook': 'webhook',
      'n8n-nodes-base.emailSend': 'email',
      'n8n-nodes-base.wait': 'delay',
      'n8n-nodes-base.if': 'condition',
      'n8n-nodes-base.function': 'data_transform',
      'n8n-nodes-base.cron': 'schedule',
      'n8n-nodes-base.readBinaryFile': 'file_operation',
      'n8n-nodes-base.postgres': 'database',
      'n8n-nodes-base.slack': 'notification'
    };

    return reverseMapping[nodeType] || 'custom';
  }

  /**
   * Get n8n connector statistics
   */
  getStats() {
    return {
      initialized: this.initialized,
      baseUrl: this.baseUrl ? this.baseUrl.replace(/\/api.*$/, '') : null,
      hasApiKey: !!this.apiKey,
      maxRetries: this.maxRetries,
      timeout: this.defaultTimeout
    };
  }

  /**
   * Clear n8n configuration
   */
  async clearConfiguration() {
    try {
      await dataStorageManager.remove('n8n_config');
      this.baseUrl = null;
      this.apiKey = null;
      console.log('[N8nConnector] Configuration cleared');
    } catch (error) {
      console.error('[N8nConnector] Failed to clear configuration:', error);
      throw error;
    }
  }
}

// Create singleton instance
const n8nConnector = new N8nConnector();

export default n8nConnector;
export { N8nConnector };
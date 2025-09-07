/**
 * WorkflowGenius Backend Services - Main Export Module
 * Centralized access point for all backend services
 */

import securityManager from './security.js';
import dataStorageManager from './data-storage.js';
import apiClient from './api-clients.js';
import n8nConnector from './n8n-connector.js';
import zapierConnector from './zapier-connector.js';
import BackendServiceTester from './test-integration.js';

/**
 * Backend Services Manager
 * Coordinates initialization and provides unified interface to all services
 */
class BackendServicesManager {
  constructor() {
    this.initialized = false;
    this.services = {
      security: securityManager,
      storage: dataStorageManager,
      apiClient: apiClient,
      n8n: n8nConnector,
      zapier: zapierConnector
    };
    this.initializationPromise = null;
  }

  /**
   * Initialize all backend services
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._performInitialization();
    return this.initializationPromise;
  }

  /**
   * Internal initialization method
   */
  async _performInitialization() {
    try {
      console.log('[BackendServices] Starting initialization...');

      // Initialize services in dependency order
      console.log('[BackendServices] Initializing Security Manager...');
      await securityManager.initialize();

      console.log('[BackendServices] Initializing Data Storage Manager...');
      await dataStorageManager.initialize();

      console.log('[BackendServices] Initializing API Client...');
      await apiClient.initialize();

      console.log('[BackendServices] Initializing n8n Connector...');
      await n8nConnector.initialize();

      console.log('[BackendServices] Initializing Zapier Connector...');
      await zapierConnector.initialize();

      this.initialized = true;
      console.log('[BackendServices] All services initialized successfully! 🚀');

      // Perform health check
      await this.performHealthCheck();

    } catch (error) {
      console.error('[BackendServices] Initialization failed:', error);
      throw new Error(`Backend services initialization failed: ${error.message}`);
    }
  }

  /**
   * Perform health check on all services
   */
  async performHealthCheck() {
    console.log('[BackendServices] Performing health check...');

    const healthStatus = {
      security: securityManager.isInitialized(),
      storage: dataStorageManager.isInitialized(),
      apiClient: apiClient.initialized,
      n8n: n8nConnector.initialized,
      zapier: zapierConnector.initialized
    };

    const allHealthy = Object.values(healthStatus).every(status => status === true);

    if (allHealthy) {
      console.log('[BackendServices] ✅ All services healthy');
    } else {
      console.warn('[BackendServices] ⚠️  Some services not healthy:', healthStatus);
    }

    return healthStatus;
  }

  /**
   * Get service statistics
   */
  async getServiceStats() {
    if (!this.initialized) {
      throw new Error('Backend services not initialized');
    }

    return {
      security: {
        initialized: securityManager.isInitialized()
      },
      storage: await dataStorageManager.getStorageStats(),
      apiClient: apiClient.getStats(),
      n8n: n8nConnector.getStats(),
      zapier: zapierConnector.getStats(),
      overall: {
        initialized: this.initialized,
        healthStatus: await this.performHealthCheck()
      }
    };
  }

  /**
   * Configure API keys for all providers
   */
  async configureApiKeys(apiKeys) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Validate and store API keys
      await dataStorageManager.setApiKeys(apiKeys);

      // Configure individual connectors if they have specific keys
      if (apiKeys.n8n) {
        await n8nConnector.setInstanceDetails(apiKeys.n8n.baseUrl, apiKeys.n8n.apiKey);
      }

      if (apiKeys.zapier) {
        await zapierConnector.setApiKey(apiKeys.zapier);
      }

      console.log('[BackendServices] API keys configured successfully');
      return { success: true };
    } catch (error) {
      console.error('[BackendServices] Failed to configure API keys:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Generate workflow using AI providers with fallback
   */
  async generateWorkflow(prompt, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const result = await apiClient.generateWorkflow(prompt, options);
      
      // Store successful workflow generation for analytics
      await dataStorageManager.storeAnalytics('workflow_generated', {
        provider: result.provider,
        success: result.success,
        promptLength: prompt.length,
        options: options
      });

      return result;
    } catch (error) {
      console.error('[BackendServices] Workflow generation failed:', error);
      
      // Store failure for analytics
      await dataStorageManager.storeAnalytics('workflow_generation_failed', {
        error: error.message,
        promptLength: prompt.length,
        options: options
      });

      throw error;
    }
  }

  /**
   * Deploy workflow to n8n
   */
  async deployToN8n(workflow) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const result = await n8nConnector.createWorkflow(workflow);
      
      if (result.success) {
        // Store deployment success
        await dataStorageManager.storeAnalytics('n8n_deployment_success', {
          workflowId: result.id,
          workflowName: workflow.name
        });
      }

      return result;
    } catch (error) {
      console.error('[BackendServices] n8n deployment failed:', error);
      
      await dataStorageManager.storeAnalytics('n8n_deployment_failed', {
        error: error.message,
        workflowName: workflow.name
      });

      throw error;
    }
  }

  /**
   * Export workflow for Zapier
   */
  async exportToZapier(workflow) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const result = await zapierConnector.exportForZapier(workflow);
      
      if (result.success) {
        // Store export success
        await dataStorageManager.storeAnalytics('zapier_export_success', {
          workflowName: workflow.name,
          webhookUrl: result.webhookUrl
        });
      }

      return result;
    } catch (error) {
      console.error('[BackendServices] Zapier export failed:', error);
      
      await dataStorageManager.storeAnalytics('zapier_export_failed', {
        error: error.message,
        workflowName: workflow.name
      });

      throw error;
    }
  }

  /**
   * Test connectivity to all external services
   */
  async testConnectivity() {
    if (!this.initialized) {
      await this.initialize();
    }

    const results = {
      aiProviders: await apiClient.testConnectivity(),
      n8n: await n8nConnector.testConnection(),
      zapier: await zapierConnector.testConnection()
    };

    // Store connectivity test results
    await dataStorageManager.storeAnalytics('connectivity_test', results);

    return results;
  }

  /**
   * Run comprehensive integration tests
   */
  async runIntegrationTests() {
    const tester = new BackendServiceTester();
    await tester.runAllTests();
    await tester.cleanup();
    return tester.testResults;
  }

  /**
   * Clear all service data (for logout/reset)
   */
  async clearAllData() {
    try {
      await dataStorageManager.clearAll();
      await securityManager.clearSecurityData();
      await n8nConnector.clearConfiguration();
      await zapierConnector.clearConfiguration();
      
      console.log('[BackendServices] All data cleared successfully');
      return { success: true };
    } catch (error) {
      console.error('[BackendServices] Failed to clear data:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get unified service status
   */
  getStatus() {
    return {
      initialized: this.initialized,
      services: {
        security: securityManager.isInitialized(),
        storage: dataStorageManager.isInitialized(),
        apiClient: apiClient.initialized,
        n8n: n8nConnector.initialized,
        zapier: zapierConnector.initialized
      }
    };
  }

  /**
   * Emergency shutdown of all services
   */
  async shutdown() {
    try {
      console.log('[BackendServices] Shutting down services...');
      
      // Clear any pending operations
      await dataStorageManager.cleanupExpiredData();
      
      // Reset initialization state
      this.initialized = false;
      this.initializationPromise = null;
      
      console.log('[BackendServices] Services shut down successfully');
    } catch (error) {
      console.error('[BackendServices] Error during shutdown:', error);
    }
  }
}

// Create singleton instance
const backendServices = new BackendServicesManager();

// Named exports for individual services
export {
  securityManager,
  dataStorageManager, 
  apiClient,
  n8nConnector,
  zapierConnector,
  BackendServiceTester,
  backendServices
};

// Default export for the main manager
export default backendServices;
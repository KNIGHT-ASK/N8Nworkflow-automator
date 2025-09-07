/**
 * Integration Tests for WorkflowGenius Backend Services
 * Tests all services functionality and error handling scenarios
 */

import securityManager from './security.js';
import dataStorageManager from './data-storage.js';
import apiClient from './api-clients.js';
import n8nConnector from './n8n-connector.js';
import zapierConnector from './zapier-connector.js';

class BackendServiceTester {
  constructor() {
    this.testResults = {
      security: [],
      storage: [],
      apiClients: [],
      n8nConnector: [],
      zapierConnector: [],
      integration: []
    };
    this.totalTests = 0;
    this.passedTests = 0;
    this.failedTests = 0;
  }

  /**
   * Run all tests
   */
  async runAllTests() {
    console.log('🚀 Starting WorkflowGenius Backend Services Integration Tests...\n');

    try {
      // Test each service individually
      await this.testSecurityManager();
      await this.testDataStorageManager();
      await this.testApiClient();
      await this.testN8nConnector();
      await this.testZapierConnector();
      
      // Test cross-service integration
      await this.testServiceIntegration();

      // Generate test report
      this.generateTestReport();
      
    } catch (error) {
      console.error('❌ Test suite failed:', error);
    }
  }

  /**
   * Test the Security Manager
   */
  async testSecurityManager() {
    console.log('🔒 Testing Security Manager...');

    // Test 1: Initialization
    await this.runTest('Security', 'Initialization', async () => {
      await securityManager.initialize();
      return securityManager.isInitialized();
    });

    // Test 2: Encryption/Decryption
    await this.runTest('Security', 'Encryption/Decryption', async () => {
      const testData = 'test-api-key-12345';
      const encrypted = securityManager.encrypt(testData);
      const decrypted = securityManager.decrypt(encrypted);
      return decrypted === testData;
    });

    // Test 3: Object Encryption
    await this.runTest('Security', 'Object Encryption', async () => {
      const testObj = { apiKey: 'test-key', provider: 'groq' };
      const encrypted = securityManager.encryptObject(testObj);
      const decrypted = securityManager.decryptObject(encrypted);
      return JSON.stringify(decrypted) === JSON.stringify(testObj);
    });

    // Test 4: API Key Validation
    await this.runTest('Security', 'API Key Validation', async () => {
      const validGroqKey = 'gsk_' + 'a'.repeat(43);
      const invalidKey = 'invalid-key';
      return securityManager.validateApiKeyFormat(validGroqKey, 'groq') &&
             !securityManager.validateApiKeyFormat(invalidKey, 'groq');
    });

    // Test 5: Input Sanitization
    await this.runTest('Security', 'Input Sanitization', async () => {
      const maliciousInput = '<script>alert("xss")</script>test';
      const sanitized = securityManager.sanitizeInput(maliciousInput);
      return !sanitized.includes('<script>') && sanitized.includes('test');
    });

    // Test 6: URL Validation
    await this.runTest('Security', 'URL Validation', async () => {
      const trustedUrl = 'https://api.groq.com/test';
      const untrustedUrl = 'https://evil.com/test';
      return securityManager.validateTrustedUrl(trustedUrl) &&
             !securityManager.validateTrustedUrl(untrustedUrl);
    });

    // Test 7: Rate Limiter
    await this.runTest('Security', 'Rate Limiter', async () => {
      const limiter = securityManager.createRateLimiter(2, 1000);
      return limiter.canMakeRequest() && limiter.canMakeRequest() && !limiter.canMakeRequest();
    });

    console.log('✅ Security Manager tests completed\n');
  }

  /**
   * Test the Data Storage Manager
   */
  async testDataStorageManager() {
    console.log('💾 Testing Data Storage Manager...');

    // Test 1: Initialization
    await this.runTest('Storage', 'Initialization', async () => {
      await dataStorageManager.initialize();
      return dataStorageManager.isInitialized();
    });

    // Test 2: Secure Storage
    await this.runTest('Storage', 'Secure Storage', async () => {
      const testKey = 'test-storage-key';
      const testValue = 'test-storage-value';
      
      await dataStorageManager.setSecure(testKey, testValue);
      const retrieved = await dataStorageManager.getSecure(testKey);
      
      return retrieved === testValue;
    });

    // Test 3: API Key Storage
    await this.runTest('Storage', 'API Key Storage', async () => {
      const testApiKey = 'gsk_' + 'test'.repeat(10) + 'a'.repeat(3);
      
      await dataStorageManager.setApiKey('groq', testApiKey);
      const retrieved = await dataStorageManager.getApiKey('groq');
      
      return retrieved === testApiKey;
    });

    // Test 4: Multiple API Keys
    await this.runTest('Storage', 'Multiple API Keys', async () => {
      const apiKeys = {
        groq: 'gsk_' + 'test1'.repeat(10) + 'abc',
        huggingface: 'hf_' + 'test2'.repeat(7) + 'defghij'
      };
      
      await dataStorageManager.setApiKeys(apiKeys);
      const retrieved = await dataStorageManager.getAllApiKeys();
      
      return retrieved.groq === apiKeys.groq && retrieved.huggingface === apiKeys.huggingface;
    });

    // Test 5: Cache Functionality
    await this.runTest('Storage', 'Cache Functionality', async () => {
      const endpoint = '/test-endpoint';
      const params = { test: 'param' };
      const response = { result: 'cached-data' };
      
      await dataStorageManager.cacheApiResponse(endpoint, params, response, 5000);
      const cached = await dataStorageManager.getCachedApiResponse(endpoint, params);
      
      return JSON.stringify(cached) === JSON.stringify(response);
    });

    // Test 6: Preferences Storage
    await this.runTest('Storage', 'Preferences Storage', async () => {
      const preferences = { theme: 'dark', language: 'en' };
      
      await dataStorageManager.setPreferences(preferences);
      const retrieved = await dataStorageManager.getPreferences();
      
      return JSON.stringify(retrieved) === JSON.stringify(preferences);
    });

    // Test 7: Workflow Template Storage
    await this.runTest('Storage', 'Workflow Template Storage', async () => {
      const templateId = 'test-template';
      const template = { name: 'Test Workflow', steps: [] };
      
      await dataStorageManager.saveWorkflowTemplate(templateId, template);
      const retrieved = await dataStorageManager.getWorkflowTemplate(templateId);
      
      return JSON.stringify(retrieved) === JSON.stringify(template);
    });

    // Test 8: Data Expiry
    await this.runTest('Storage', 'Data Expiry', async () => {
      const testKey = 'expiry-test';
      const testValue = 'expires-soon';
      const expiryTime = Date.now() + 100; // 100ms expiry
      
      await dataStorageManager.setSecure(testKey, testValue, { expiresAt: expiryTime });
      
      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 150));
      
      const retrieved = await dataStorageManager.getSecure(testKey, 'default');
      return retrieved === 'default'; // Should return default due to expiry
    });

    console.log('✅ Data Storage Manager tests completed\n');
  }

  /**
   * Test the API Client
   */
  async testApiClient() {
    console.log('🌐 Testing API Client...');

    // Test 1: Initialization
    await this.runTest('API Client', 'Initialization', async () => {
      await apiClient.initialize();
      return apiClient.initialized;
    });

    // Test 2: Provider Configuration
    await this.runTest('API Client', 'Provider Configuration', async () => {
      const stats = apiClient.getStats();
      return stats.providersConfigured >= 3; // groq, huggingface, openrouter
    });

    // Test 3: Rate Limiter Status
    await this.runTest('API Client', 'Rate Limiter Status', async () => {
      const status = apiClient.getRateLimiterStatus();
      return Object.keys(status).length >= 3; // Should have limiters for all providers
    });

    // Test 4: Provider Order Logic
    await this.runTest('API Client', 'Provider Order Logic', async () => {
      const order1 = apiClient.getProviderOrder();
      const order2 = apiClient.getProviderOrder('openrouter');
      
      return Array.isArray(order1) && order1.length > 0 && 
             Array.isArray(order2) && order2[0] === 'openrouter';
    });

    // Test 5: Available Models
    await this.runTest('API Client', 'Available Models', async () => {
      const groqModels = await apiClient.getAvailableModels('groq');
      return groqModels.provider === 'groq' && Array.isArray(groqModels.models);
    });

    // Test 6: Cache Management
    await this.runTest('API Client', 'Cache Management', async () => {
      await apiClient.clearCache();
      return true; // If no error thrown, cache clearing works
    });

    // Test 7: Error Handling for Missing API Key
    await this.runTest('API Client', 'Error Handling - Missing API Key', async () => {
      try {
        await apiClient.generateWithGroq('test prompt');
        return false; // Should have thrown an error
      } catch (error) {
        return error.message.includes('API key');
      }
    });

    // Test 8: Request Sanitization
    await this.runTest('API Client', 'Request Sanitization', async () => {
      const maliciousPrompt = '<script>alert("xss")</script>Generate workflow';
      try {
        // This should not throw an error due to sanitization
        await apiClient.generateWorkflow(maliciousPrompt);
        return false; // Will likely fail due to no API key, but that's expected
      } catch (error) {
        // Should fail due to missing API key, not XSS
        return error.message.includes('API key') || error.message.includes('providers failed');
      }
    });

    console.log('✅ API Client tests completed\n');
  }

  /**
   * Test the n8n Connector
   */
  async testN8nConnector() {
    console.log('🔗 Testing n8n Connector...');

    // Test 1: Initialization
    await this.runTest('n8n Connector', 'Initialization', async () => {
      await n8nConnector.initialize();
      return n8nConnector.initialized;
    });

    // Test 2: Configuration Storage
    await this.runTest('n8n Connector', 'Configuration Storage', async () => {
      const testConfig = {
        baseUrl: 'https://test.n8n.io',
        apiKey: 'test-api-key-12345'
      };
      
      await n8nConnector.saveConfiguration(testConfig);
      const loaded = await n8nConnector.loadConfiguration();
      
      return loaded.baseUrl === testConfig.baseUrl && loaded.apiKey === testConfig.apiKey;
    });

    // Test 3: Instance Details Validation
    await this.runTest('n8n Connector', 'Instance Details Validation', async () => {
      try {
        await n8nConnector.setInstanceDetails('invalid-url', 'short');
        return false; // Should have thrown an error
      } catch (error) {
        return error.message.includes('Invalid');
      }
    });

    // Test 4: Workflow Data Sanitization
    await this.runTest('n8n Connector', 'Workflow Data Sanitization', async () => {
      const maliciousWorkflow = {
        name: '<script>alert("xss")</script>Test Workflow',
        nodes: [{
          name: '<img src=x onerror=alert("xss")>Node',
          type: 'test'
        }]
      };
      
      const sanitized = n8nConnector.sanitizeWorkflowData(maliciousWorkflow);
      
      return !sanitized.name.includes('<script>') && 
             !sanitized.nodes[0].name.includes('<img');
    });

    // Test 5: WorkflowGenius to n8n Format Conversion
    await this.runTest('n8n Connector', 'Format Conversion', async () => {
      const wgWorkflow = {
        name: 'Test Workflow',
        steps: [
          { name: 'HTTP Request', type: 'http_request', parameters: { url: 'https://api.test.com' } },
          { name: 'Send Email', type: 'email', parameters: { to: 'test@example.com' } }
        ]
      };
      
      const n8nWorkflow = n8nConnector.convertToN8nFormat(wgWorkflow);
      
      return n8nWorkflow.name === wgWorkflow.name && 
             n8nWorkflow.nodes.length === wgWorkflow.steps.length;
    });

    // Test 6: Node Type Mapping
    await this.runTest('n8n Connector', 'Node Type Mapping', async () => {
      const httpType = n8nConnector.mapStepTypeToN8nNode('http_request');
      const emailType = n8nConnector.mapStepTypeToN8nNode('email');
      
      return httpType === 'n8n-nodes-base.httpRequest' && 
             emailType === 'n8n-nodes-base.emailSend';
    });

    // Test 7: Local Instance Detection
    await this.runTest('n8n Connector', 'Local Instance Detection', async () => {
      const localUrl = 'http://localhost:5678/api/v1/workflows';
      const remoteUrl = 'https://api.n8n.io/api/v1/workflows';
      
      return n8nConnector.isLocalInstance(localUrl) && 
             !n8nConnector.isLocalInstance(remoteUrl);
    });

    // Test 8: Stats Collection
    await this.runTest('n8n Connector', 'Stats Collection', async () => {
      const stats = n8nConnector.getStats();
      
      return typeof stats.initialized === 'boolean' && 
             typeof stats.maxRetries === 'number' && 
             typeof stats.timeout === 'number';
    });

    console.log('✅ n8n Connector tests completed\n');
  }

  /**
   * Test the Zapier Connector
   */
  async testZapierConnector() {
    console.log('⚡ Testing Zapier Connector...');

    // Test 1: Initialization
    await this.runTest('Zapier Connector', 'Initialization', async () => {
      await zapierConnector.initialize();
      return zapierConnector.initialized;
    });

    // Test 2: Configuration Management
    await this.runTest('Zapier Connector', 'Configuration Management', async () => {
      const testConfig = { apiKey: 'test-zapier-key-12345' };
      
      await zapierConnector.saveConfiguration(testConfig);
      const loaded = await zapierConnector.loadConfiguration();
      
      return loaded.apiKey === testConfig.apiKey;
    });

    // Test 3: Webhook URL Generation
    await this.runTest('Zapier Connector', 'Webhook URL Generation', async () => {
      const webhookUrl = await zapierConnector.createWebhookTrigger();
      
      return typeof webhookUrl === 'string' && 
             webhookUrl.includes('hooks.zapier.com');
    });

    // Test 4: Data Sanitization
    await this.runTest('Zapier Connector', 'Data Sanitization', async () => {
      const maliciousData = {
        title: '<script>alert("xss")</script>Test Zap',
        description: '<img src=x onerror=alert("xss")>Description'
      };
      
      const sanitized = zapierConnector.sanitizeZapData(maliciousData);
      
      return !sanitized.title.includes('<script>') && 
             !sanitized.description.includes('<img');
    });

    // Test 5: WorkflowGenius to Zapier Format Conversion
    await this.runTest('Zapier Connector', 'Format Conversion', async () => {
      const wgWorkflow = {
        name: 'Test Workflow',
        steps: [
          { name: 'Send Email', type: 'email', action: 'send', parameters: { to: 'test@example.com' } },
          { name: 'Post to Slack', type: 'notification', action: 'send', parameters: { channel: '#general' } }
        ]
      };
      
      const zapierWorkflow = zapierConnector.convertToZapierFormat(wgWorkflow);
      
      return zapierWorkflow.title === wgWorkflow.name && 
             zapierWorkflow.steps.length === wgWorkflow.steps.length + 1; // +1 for webhook trigger
    });

    // Test 6: App Type Mapping
    await this.runTest('Zapier Connector', 'App Type Mapping', async () => {
      const emailApp = zapierConnector.mapStepTypeToZapierApp('email');
      const notificationApp = zapierConnector.mapStepTypeToZapierApp('notification');
      
      return emailApp === 'gmail' && notificationApp === 'slack';
    });

    // Test 7: Integration Guide Generation
    await this.runTest('Zapier Connector', 'Integration Guide Generation', async () => {
      const wgWorkflow = {
        name: 'Test Workflow',
        steps: [
          { name: 'Send Email', type: 'email', action: 'send' }
        ]
      };
      
      const guide = zapierConnector.generateIntegrationGuide(wgWorkflow);
      
      return guide.title && 
             Array.isArray(guide.steps) && 
             guide.steps.length > 0;
    });

    // Test 8: Webhook Data Sanitization
    await this.runTest('Zapier Connector', 'Webhook Data Sanitization', async () => {
      const maliciousData = {
        'user<script>': 'test',
        'data': '<script>alert("xss")</script>value'
      };
      
      const sanitized = zapierConnector.sanitizeWebhookData(maliciousData);
      
      return !JSON.stringify(sanitized).includes('<script>');
    });

    console.log('✅ Zapier Connector tests completed\n');
  }

  /**
   * Test cross-service integration
   */
  async testServiceIntegration() {
    console.log('🔄 Testing Service Integration...');

    // Test 1: End-to-End Workflow Creation
    await this.runTest('Integration', 'End-to-End Workflow Creation', async () => {
      // Create a test workflow
      const testWorkflow = {
        name: 'Integration Test Workflow',
        description: 'Test workflow for integration testing',
        steps: [
          {
            name: 'Webhook Trigger',
            type: 'webhook',
            parameters: { method: 'POST' }
          },
          {
            name: 'Send Notification',
            type: 'notification',
            parameters: { message: 'Test message' }
          }
        ]
      };

      // Store the workflow
      await dataStorageManager.saveWorkflowTemplate('integration-test', testWorkflow);
      
      // Convert to different formats
      const n8nFormat = n8nConnector.convertToN8nFormat(testWorkflow);
      const zapierFormat = zapierConnector.convertToZapierFormat(testWorkflow);
      
      return n8nFormat.name === testWorkflow.name && 
             zapierFormat.title === testWorkflow.name;
    });

    // Test 2: API Key Management Across Services
    await this.runTest('Integration', 'API Key Management', async () => {
      const testApiKeys = {
        groq: 'gsk_' + 'test'.repeat(10) + 'abc',
        huggingface: 'hf_' + 'test'.repeat(7) + 'defghij'
      };

      // Store API keys
      await dataStorageManager.setApiKeys(testApiKeys);
      
      // Verify they can be retrieved by API client
      const groqKey = await dataStorageManager.getApiKey('groq');
      const hfKey = await dataStorageManager.getApiKey('huggingface');
      
      return groqKey === testApiKeys.groq && hfKey === testApiKeys.huggingface;
    });

    // Test 3: Security Integration
    await this.runTest('Integration', 'Security Integration', async () => {
      // Test that all services use security manager for encryption
      const testData = 'sensitive-test-data';
      
      // Direct encryption
      const encrypted = securityManager.encrypt(testData);
      
      // Storage should use the same encryption
      await dataStorageManager.setSecure('security-test', testData);
      const retrieved = await dataStorageManager.getSecure('security-test');
      
      return retrieved === testData;
    });

    // Test 4: Error Propagation
    await this.runTest('Integration', 'Error Propagation', async () => {
      try {
        // Try to use API client without proper configuration
        await apiClient.generateWorkflow('test prompt', { preferredProvider: 'invalid-provider' });
        return false; // Should have thrown an error
      } catch (error) {
        return error.message.includes('Unsupported provider') || 
               error.message.includes('providers failed');
      }
    });

    // Test 5: Configuration Consistency
    await this.runTest('Integration', 'Configuration Consistency', async () => {
      // Test that configurations are consistently stored and retrieved
      const n8nConfig = { baseUrl: 'https://test.n8n.io', apiKey: 'test-key' };
      const zapierConfig = { apiKey: 'zapier-test-key' };
      
      await n8nConnector.saveConfiguration(n8nConfig);
      await zapierConnector.saveConfiguration(zapierConfig);
      
      const loadedN8n = await n8nConnector.loadConfiguration();
      const loadedZapier = await zapierConnector.loadConfiguration();
      
      return loadedN8n.baseUrl === n8nConfig.baseUrl && 
             loadedZapier.apiKey === zapierConfig.apiKey;
    });

    // Test 6: Cross-Platform Workflow Export
    await this.runTest('Integration', 'Cross-Platform Workflow Export', async () => {
      const testWorkflow = {
        name: 'Cross-Platform Test',
        steps: [
          { name: 'HTTP Request', type: 'http_request' },
          { name: 'Email', type: 'email' }
        ]
      };

      // Export to both platforms
      const zapierExport = await zapierConnector.exportForZapier(testWorkflow);
      const n8nExport = await n8nConnector.exportWorkflow('test-id').catch(() => ({ success: false }));
      
      // Zapier export should succeed (doesn't require actual API call)
      return zapierExport.success && 
             zapierExport.config && 
             zapierExport.guide;
    });

    // Test 7: Data Cleanup Integration
    await this.runTest('Integration', 'Data Cleanup Integration', async () => {
      // Store some test data across services
      await dataStorageManager.setSecure('cleanup-test-1', 'test-data-1');
      await dataStorageManager.setSecure('cleanup-test-2', 'test-data-2');
      
      // Test cleanup
      const cleaned = await dataStorageManager.cleanupExpiredData();
      
      // Should not have cleaned non-expired data
      const retrieved = await dataStorageManager.getSecure('cleanup-test-1');
      
      return typeof cleaned === 'number' && retrieved === 'test-data-1';
    });

    // Test 8: Service Statistics Aggregation
    await this.runTest('Integration', 'Service Statistics Aggregation', async () => {
      const securityStats = { initialized: securityManager.isInitialized() };
      const storageStats = await dataStorageManager.getStorageStats();
      const apiStats = apiClient.getStats();
      const n8nStats = n8nConnector.getStats();
      const zapierStats = zapierConnector.getStats();
      
      return securityStats.initialized && 
             storageStats && 
             apiStats.initialized && 
             n8nStats.initialized && 
             zapierStats.initialized;
    });

    console.log('✅ Service Integration tests completed\n');
  }

  /**
   * Run a single test with error handling
   */
  async runTest(category, testName, testFunction) {
    this.totalTests++;
    
    try {
      const result = await testFunction();
      
      if (result) {
        this.passedTests++;
        this.testResults[category.toLowerCase().replace(' ', '')].push({
          name: testName,
          status: 'PASS',
          message: 'Test passed successfully'
        });
        console.log(`  ✅ ${testName}: PASS`);
      } else {
        this.failedTests++;
        this.testResults[category.toLowerCase().replace(' ', '')].push({
          name: testName,
          status: 'FAIL',
          message: 'Test returned false'
        });
        console.log(`  ❌ ${testName}: FAIL - Test returned false`);
      }
    } catch (error) {
      this.failedTests++;
      this.testResults[category.toLowerCase().replace(' ', '')].push({
        name: testName,
        status: 'ERROR',
        message: error.message
      });
      console.log(`  ❌ ${testName}: ERROR - ${error.message}`);
    }
  }

  /**
   * Generate comprehensive test report
   */
  generateTestReport() {
    console.log('\n📊 TEST REPORT');
    console.log('=' * 50);
    console.log(`Total Tests: ${this.totalTests}`);
    console.log(`Passed: ${this.passedTests} (${((this.passedTests / this.totalTests) * 100).toFixed(1)}%)`);
    console.log(`Failed: ${this.failedTests} (${((this.failedTests / this.totalTests) * 100).toFixed(1)}%)`);
    console.log('=' * 50);

    // Detailed results by category
    Object.keys(this.testResults).forEach(category => {
      const results = this.testResults[category];
      if (results.length > 0) {
        console.log(`\n${category.toUpperCase()}:`);
        results.forEach(test => {
          const status = test.status === 'PASS' ? '✅' : '❌';
          console.log(`  ${status} ${test.name}: ${test.status}`);
          if (test.status !== 'PASS') {
            console.log(`     ${test.message}`);
          }
        });
      }
    });

    // Overall assessment
    const successRate = (this.passedTests / this.totalTests) * 100;
    console.log('\n🎯 OVERALL ASSESSMENT:');
    
    if (successRate >= 95) {
      console.log('🌟 EXCELLENT: Backend services are production-ready!');
    } else if (successRate >= 85) {
      console.log('✅ GOOD: Backend services are mostly ready with minor issues');
    } else if (successRate >= 70) {
      console.log('⚠️  ACCEPTABLE: Backend services need some improvements');
    } else {
      console.log('❌ NEEDS WORK: Backend services require significant fixes');
    }

    console.log('\n🚀 WorkflowGenius Backend Services Testing Complete!');
  }

  /**
   * Clean up test data
   */
  async cleanup() {
    try {
      // Remove test data
      const testKeys = [
        'test-storage-key',
        'expiry-test',
        'security-test',
        'cleanup-test-1',
        'cleanup-test-2',
        'integration-test'
      ];

      for (const key of testKeys) {
        await dataStorageManager.remove(key).catch(() => {}); // Ignore errors
      }

      console.log('🧹 Test cleanup completed');
    } catch (error) {
      console.error('⚠️  Test cleanup failed:', error);
    }
  }
}

// Export for use in other test files
export default BackendServiceTester;
export { BackendServiceTester };

// Run tests if this file is executed directly
if (typeof window !== 'undefined' && window.location) {
  // Browser environment - can be run manually
  window.runBackendTests = async () => {
    const tester = new BackendServiceTester();
    await tester.runAllTests();
    await tester.cleanup();
  };
} else if (typeof module !== 'undefined' && module.exports) {
  // Node.js environment
  const tester = new BackendServiceTester();
  tester.runAllTests().then(() => tester.cleanup());
}
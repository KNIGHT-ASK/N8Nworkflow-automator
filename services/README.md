# WorkflowGenius Backend Services Documentation

## 🚀 Overview

The WorkflowGenius backend services layer provides a robust, secure, and scalable foundation for the workflow automation extension. This layer handles all external API integrations, data storage, security, and cross-platform workflow deployment.

## 📁 Architecture

```
services/
├── security.js          # Encryption & security utilities
├── data-storage.js      # Local storage management
├── api-clients.js       # External API integrations
├── n8n-connector.js     # n8n platform integration
├── zapier-connector.js  # Zapier platform integration
├── test-integration.js  # Comprehensive test suite
└── index.js            # Main service manager
```

## 🔧 Core Services

### 1. Security Manager (`security.js`)

**Purpose**: Handles encryption, decryption, and security utilities for sensitive data.

**Key Features**:
- AES encryption for API keys and sensitive data
- Input sanitization to prevent XSS attacks
- API key format validation
- Rate limiting implementation
- Secure headers generation
- URL validation for trusted domains

**Usage**:
```javascript
import securityManager from './services/security.js';

// Initialize
await securityManager.initialize();

// Encrypt sensitive data
const encrypted = securityManager.encrypt('sensitive-api-key');

// Decrypt data
const decrypted = securityManager.decrypt(encrypted);

// Validate API key format
const isValid = securityManager.validateApiKeyFormat(apiKey, 'groq');
```

### 2. Data Storage Manager (`data-storage.js`)

**Purpose**: Manages encrypted local storage with chrome.storage integration.

**Key Features**:
- Encrypted storage using Security Manager
- API key management
- Cache management with TTL
- User preferences storage
- Workflow template storage
- Automatic data expiry and cleanup
- In-memory caching for performance

**Usage**:
```javascript
import dataStorageManager from './services/data-storage.js';

// Initialize
await dataStorageManager.initialize();

// Store API key securely
await dataStorageManager.setApiKey('groq', 'your-api-key');

// Cache API response
await dataStorageManager.cacheApiResponse('/endpoint', params, response);

// Store workflow template
await dataStorageManager.saveWorkflowTemplate('template-id', workflow);
```

### 3. API Client (`api-clients.js`)

**Purpose**: Handles all external AI API integrations with fallback support.

**Key Features**:
- Multi-provider support (Groq, HuggingFace, OpenRouter)
- Automatic fallback between providers
- Rate limiting per provider
- Request/response caching
- Retry logic with exponential backoff
- Provider success rate tracking

**Supported Providers**:
- **Groq**: `llama3-70b-8192`, `mixtral-8x7b-32768`
- **HuggingFace**: `microsoft/DialoGPT-large`, `EleutherAI/gpt-j-6B`
- **OpenRouter**: `openai/gpt-3.5-turbo`, `anthropic/claude-3-haiku`

**Usage**:
```javascript
import apiClient from './services/api-clients.js';

// Initialize
await apiClient.initialize();

// Generate workflow with automatic fallback
const result = await apiClient.generateWorkflow(prompt, {
  preferredProvider: 'groq',
  maxTokens: 2048,
  temperature: 0.7
});

// Test connectivity
const connectivity = await apiClient.testConnectivity();
```

### 4. n8n Connector (`n8n-connector.js`)

**Purpose**: Integrates with n8n platform for workflow deployment and management.

**Key Features**:
- Full n8n API integration
- Workflow CRUD operations
- Format conversion (WorkflowGenius ↔ n8n)
- Local and cloud n8n support
- Workflow execution and monitoring
- Node type mapping and validation

**Usage**:
```javascript
import n8nConnector from './services/n8n-connector.js';

// Configure n8n instance
await n8nConnector.setInstanceDetails('https://your-n8n.com', 'api-key');

// Create workflow
const result = await n8nConnector.createWorkflow(workflowData);

// Convert WorkflowGenius format to n8n
const n8nWorkflow = n8nConnector.convertToN8nFormat(workflowGenius);
```

### 5. Zapier Connector (`zapier-connector.js`)

**Purpose**: Provides Zapier platform integration for cross-platform workflow support.

**Key Features**:
- Zapier API integration
- Webhook-based workflow triggers
- App and action mapping
- Integration guide generation
- Format conversion (WorkflowGenius ↔ Zapier)
- Cross-platform workflow export

**Usage**:
```javascript
import zapierConnector from './services/zapier-connector.js';

// Set API key
await zapierConnector.setApiKey('your-zapier-api-key');

// Export workflow for Zapier
const result = await zapierConnector.exportForZapier(workflow);

// Create webhook trigger
const webhookUrl = await zapierConnector.createWebhookTrigger();
```

## 🔧 Backend Services Manager (`index.js`)

**Purpose**: Central coordinator for all backend services with unified interface.

**Key Features**:
- Orchestrates service initialization
- Provides unified API access
- Health monitoring and statistics
- Error handling and recovery
- Service lifecycle management

**Usage**:
```javascript
import backendServices from './services/index.js';

// Initialize all services
await backendServices.initialize();

// Configure API keys
await backendServices.configureApiKeys({
  groq: 'your-groq-key',
  huggingface: 'your-hf-key',
  openrouter: 'your-or-key'
});

// Generate workflow with AI
const workflow = await backendServices.generateWorkflow(prompt);

// Deploy to n8n
const n8nResult = await backendServices.deployToN8n(workflow);

// Export to Zapier
const zapierResult = await backendServices.exportToZapier(workflow);
```

## 🧪 Testing Suite (`test-integration.js`)

**Purpose**: Comprehensive testing framework for all backend services.

**Features**:
- Unit tests for each service
- Integration tests across services
- Error handling validation
- Performance benchmarking
- Automated test reporting

**Test Categories**:
- Security Manager (8 tests)
- Data Storage Manager (8 tests)
- API Client (8 tests)
- n8n Connector (8 tests)
- Zapier Connector (8 tests)
- Cross-Service Integration (8 tests)

**Usage**:
```javascript
import BackendServiceTester from './services/test-integration.js';

// Run all tests
const tester = new BackendServiceTester();
await tester.runAllTests();
await tester.cleanup();

// Or run via main service manager
const results = await backendServices.runIntegrationTests();
```

## 🔐 Security Features

### Encryption
- **Algorithm**: AES-256 encryption for all sensitive data
- **Key Management**: Secure master key generation and session storage
- **Data Protection**: All API keys and sensitive information encrypted at rest

### Input Validation
- **XSS Prevention**: All user inputs sanitized
- **API Key Validation**: Format validation for each provider
- **URL Validation**: Only trusted domains allowed for API calls

### Rate Limiting
- **Provider-Specific**: Individual rate limiters per API provider
- **Token Bucket**: Efficient rate limiting algorithm
- **Automatic Backoff**: Prevents API quota exhaustion

## 📊 Performance Features

### Caching
- **Multi-Level**: In-memory and encrypted storage caching
- **TTL Support**: Automatic cache expiration
- **Intelligent Invalidation**: Smart cache cleanup

### Fallback Strategy
- **Provider Ranking**: Success-rate-based provider selection
- **Automatic Retry**: Exponential backoff for failed requests
- **Graceful Degradation**: Continues operation when providers fail

### Resource Management
- **Memory Optimization**: Efficient data structures and cleanup
- **Storage Monitoring**: Usage tracking and optimization
- **Connection Pooling**: Reusable HTTP connections

## 🌐 API Provider Configuration

### Free Tier Limits
- **Groq**: 100 requests/minute, 8K context tokens
- **HuggingFace**: 100 requests/hour, 2K context tokens
- **OpenRouter**: 20 requests/minute (free tier), 4K context tokens

### Rate Limiting
```javascript
// Configure custom rate limits
this.rateLimiters.set('groq', securityManager.createRateLimiter(100, 60000));
this.rateLimiters.set('huggingface', securityManager.createRateLimiter(100, 3600000));
this.rateLimiters.set('openrouter', securityManager.createRateLimiter(20, 60000));
```

## 🚀 Quick Start

### 1. Installation
```bash
# Dependencies are already included in package.json
npm install
```

### 2. Basic Setup
```javascript
import backendServices from './services/index.js';

// Initialize all services
await backendServices.initialize();

// Configure your API keys
await backendServices.configureApiKeys({
  groq: 'gsk_your_groq_api_key_here',
  huggingface: 'hf_your_huggingface_token_here',
  openrouter: 'sk-or-v1-your_openrouter_key_here'
});

// Test connectivity
const connectivity = await backendServices.testConnectivity();
console.log('Service connectivity:', connectivity);
```

### 3. Generate Your First Workflow
```javascript
const workflow = await backendServices.generateWorkflow(
  'Create a workflow that sends an email when a new file is uploaded to Dropbox',
  {
    preferredProvider: 'groq',
    maxTokens: 2048
  }
);

console.log('Generated workflow:', workflow);
```

### 4. Deploy to Platforms
```javascript
// Deploy to n8n
const n8nResult = await backendServices.deployToN8n(workflow);

// Export for Zapier
const zapierResult = await backendServices.exportToZapier(workflow);
```

## 🛠️ Advanced Configuration

### Custom Provider Setup
```javascript
// Add custom provider configuration
await apiClient.providers.set('custom', {
  name: 'custom',
  baseUrl: 'https://api.custom.com',
  endpoints: { completions: '/v1/completions' },
  defaultModel: 'custom-model',
  maxTokens: 4096
});
```

### Custom Security Policies
```javascript
// Set custom encryption parameters
await securityManager.initialize({
  keyRotationInterval: 24 * 60 * 60 * 1000, // 24 hours
  encryptionStrength: 'AES-256-GCM'
});
```

### Storage Optimization
```javascript
// Configure cache settings
dataStorageManager.cacheExpiry = 7200000; // 2 hours
dataStorageManager.maxCacheSize = 50; // MB
```

## 📈 Monitoring & Analytics

### Service Statistics
```javascript
const stats = await backendServices.getServiceStats();
console.log('Service statistics:', stats);
```

### Health Monitoring
```javascript
const health = await backendServices.performHealthCheck();
console.log('Health status:', health);
```

### Analytics Data
```javascript
// Analytics are automatically stored for:
// - Workflow generations
// - API provider usage
// - Error occurrences
// - Performance metrics
```

## 🐛 Troubleshooting

### Common Issues

1. **API Key Errors**
   ```javascript
   // Validate API key format
   const isValid = securityManager.validateApiKeyFormat(apiKey, provider);
   ```

2. **Rate Limiting**
   ```javascript
   // Check rate limiter status
   const status = apiClient.getRateLimiterStatus();
   ```

3. **Storage Issues**
   ```javascript
   // Clear cache and cleanup
   await dataStorageManager.cleanupExpiredData();
   ```

4. **Connectivity Problems**
   ```javascript
   // Test all connections
   const connectivity = await backendServices.testConnectivity();
   ```

### Debug Mode
```javascript
// Enable detailed logging
localStorage.setItem('wg_debug', 'true');
```

## 🔄 Error Handling

All services implement comprehensive error handling:

- **Automatic Retry**: Failed requests automatically retry with exponential backoff
- **Graceful Fallback**: Alternative providers used when primary fails
- **Error Logging**: All errors logged with context for debugging
- **User-Friendly Messages**: Technical errors converted to user-friendly messages

## 📋 Testing

### Run Integration Tests
```javascript
// Run all tests
const results = await backendServices.runIntegrationTests();

// Or manually in browser console
window.runBackendTests();
```

### Test Categories
- ✅ Security encryption/decryption
- ✅ Storage operations and caching
- ✅ API client fallback mechanisms
- ✅ n8n workflow conversion and deployment
- ✅ Zapier integration and export
- ✅ Cross-service data flow

## 🔮 Future Enhancements

- **Additional AI Providers**: OpenAI, Anthropic Claude, Cohere
- **Advanced Caching**: Redis integration for shared caching
- **Workflow Analytics**: Detailed performance and usage analytics
- **Auto-Scaling**: Dynamic provider selection based on load
- **Enterprise Features**: SSO, audit logging, compliance tools

## 📞 Support

For issues or questions:
1. Check the troubleshooting section above
2. Run the integration tests to identify problems
3. Review error logs in browser console
4. File an issue with detailed error information

---

**🎯 Mission Accomplished**: Production-ready backend services layer that surpasses existing solutions with robust security, automatic failover, comprehensive caching, and seamless cross-platform integration!
/**
 * API Clients Module for WorkflowGenius
 * Handles all external API integrations with robust error handling and caching
 */

import securityManager from './security.js';
import dataStorageManager from './data-storage.js';

class APIClient {
  constructor() {
    this.initialized = false;
    this.rateLimiters = new Map();
    this.providers = new Map();
    this.retryDelays = [1000, 2000, 4000]; // Exponential backoff
    this.defaultTimeout = 30000; // 30 seconds
    this.cacheExpiry = 3600000; // 1 hour
    this.maxRetries = 3;
  }

  /**
   * Initialize the API client
   */
  async initialize() {
    try {
      if (!securityManager.isInitialized()) {
        await securityManager.initialize();
      }
      if (!dataStorageManager.isInitialized()) {
        await dataStorageManager.initialize();
      }

      await this.setupProviders();
      await this.setupRateLimiters();
      
      this.initialized = true;
      console.log('[APIClient] Initialized successfully');
    } catch (error) {
      console.error('[APIClient] Failed to initialize:', error);
      throw new Error('API Client initialization failed');
    }
  }

  /**
   * Setup API providers with their configurations
   */
  async setupProviders() {
    // Groq API Provider
    this.providers.set('groq', {
      name: 'groq',
      baseUrl: 'https://api.groq.com/openai/v1',
      endpoints: {
        completions: '/chat/completions',
        models: '/models'
      },
      defaultModel: 'llama3-70b-8192',
      maxTokens: 8192,
      supportedModels: [
        'llama3-70b-8192',
        'llama3-8b-8192',
        'mixtral-8x7b-32768',
        'gemma-7b-it'
      ]
    });

    // HuggingFace Inference API Provider
    this.providers.set('huggingface', {
      name: 'huggingface',
      baseUrl: 'https://api-inference.huggingface.co',
      endpoints: {
        inference: '/models',
        textGeneration: '/models/{model}'
      },
      defaultModel: 'microsoft/DialoGPT-large',
      maxTokens: 2048,
      supportedModels: [
        'microsoft/DialoGPT-large',
        'facebook/blenderbot-400M-distill',
        'EleutherAI/gpt-j-6B',
        'bigscience/bloom-560m'
      ]
    });

    // OpenRouter API Provider
    this.providers.set('openrouter', {
      name: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      endpoints: {
        completions: '/chat/completions',
        models: '/models',
        limits: '/auth/key'
      },
      defaultModel: 'openai/gpt-3.5-turbo',
      maxTokens: 4096,
      supportedModels: [
        'openai/gpt-3.5-turbo',
        'anthropic/claude-3-haiku',
        'meta-llama/llama-3-8b-instruct:free',
        'microsoft/wizardlm-2-8x22b:nitro'
      ]
    });
  }

  /**
   * Setup rate limiters for each provider
   */
  async setupRateLimiters() {
    // Configure rate limiters based on free tier limits
    this.rateLimiters.set('groq', securityManager.createRateLimiter(100, 60000)); // 100/min
    this.rateLimiters.set('huggingface', securityManager.createRateLimiter(100, 3600000)); // 100/hour
    this.rateLimiters.set('openrouter', securityManager.createRateLimiter(20, 60000)); // 20/min free tier
  }

  /**
   * Get API key for a provider
   */
  async getApiKey(provider) {
    try {
      const apiKey = await dataStorageManager.getApiKey(provider);
      if (!apiKey) {
        throw new Error(`No API key configured for provider: ${provider}`);
      }
      return apiKey;
    } catch (error) {
      console.error(`[APIClient] Failed to get API key for ${provider}:`, error);
      throw error;
    }
  }

  /**
   * Check rate limits before making requests
   */
  checkRateLimit(provider) {
    const rateLimiter = this.rateLimiters.get(provider);
    if (!rateLimiter) {
      return true; // No rate limiter configured
    }

    if (!rateLimiter.canMakeRequest()) {
      const waitTime = rateLimiter.getWaitTime();
      throw new Error(`Rate limit exceeded for ${provider}. Try again in ${Math.ceil(waitTime / 1000)} seconds.`);
    }

    return true;
  }

  /**
   * Make HTTP request with retry logic and error handling
   */
  async makeRequest(url, options, provider, retryCount = 0) {
    try {
      // Validate URL
      if (!securityManager.validateTrustedUrl(url)) {
        throw new Error(`Untrusted URL: ${url}`);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.defaultTimeout);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Handle different response status codes
      if (response.status === 429) {
        throw new Error(`Rate limit exceeded for ${provider}`);
      }

      if (response.status === 401 || response.status === 403) {
        throw new Error(`Authentication failed for ${provider}`);
      }

      if (response.status >= 500) {
        throw new Error(`Server error from ${provider}: ${response.status}`);
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error from ${provider}: ${response.status} - ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`[APIClient] Request failed for ${provider}:`, error);

      // Retry logic for certain errors
      if (retryCount < this.maxRetries && this.shouldRetry(error)) {
        const delay = this.retryDelays[retryCount] || 4000;
        console.log(`[APIClient] Retrying ${provider} in ${delay}ms... (attempt ${retryCount + 1})`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.makeRequest(url, options, provider, retryCount + 1);
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
   * Generate text using Groq API
   */
  async generateWithGroq(prompt, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    const provider = 'groq';
    this.checkRateLimit(provider);

    try {
      const apiKey = await this.getApiKey(provider);
      const config = this.providers.get(provider);
      
      const url = config.baseUrl + config.endpoints.completions;
      const headers = securityManager.getSecureHeaders(apiKey, provider);

      const requestBody = {
        model: options.model || config.defaultModel,
        messages: [
          {
            role: 'system',
            content: 'You are an expert workflow automation assistant. Generate clear, actionable workflow instructions.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: Math.min(options.maxTokens || 2048, config.maxTokens),
        temperature: options.temperature || 0.7,
        top_p: options.topP || 0.9,
        stream: false
      };

      const requestOptions = {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody)
      };

      console.log(`[APIClient] Making request to Groq API`);
      const response = await this.makeRequest(url, requestOptions, provider);

      return {
        success: true,
        provider: provider,
        content: response.choices[0]?.message?.content || '',
        usage: response.usage,
        model: response.model
      };
    } catch (error) {
      console.error('[APIClient] Groq API request failed:', error);
      return {
        success: false,
        provider: provider,
        error: error.message
      };
    }
  }

  /**
   * Generate text using HuggingFace API
   */
  async generateWithHuggingFace(prompt, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    const provider = 'huggingface';
    this.checkRateLimit(provider);

    try {
      const apiKey = await this.getApiKey(provider);
      const config = this.providers.get(provider);
      
      const model = options.model || config.defaultModel;
      const url = `${config.baseUrl}/models/${model}`;
      const headers = securityManager.getSecureHeaders(apiKey, provider);

      const requestBody = {
        inputs: prompt,
        parameters: {
          max_new_tokens: Math.min(options.maxTokens || 512, config.maxTokens),
          temperature: options.temperature || 0.7,
          top_p: options.topP || 0.9,
          do_sample: true,
          return_full_text: false
        },
        options: {
          wait_for_model: true,
          use_cache: true
        }
      };

      const requestOptions = {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody)
      };

      console.log(`[APIClient] Making request to HuggingFace API`);
      const response = await this.makeRequest(url, requestOptions, provider);

      // HuggingFace returns different response formats
      let content = '';
      if (Array.isArray(response) && response[0]) {
        content = response[0].generated_text || response[0].translation_text || '';
      } else if (response.generated_text) {
        content = response.generated_text;
      }

      return {
        success: true,
        provider: provider,
        content: content,
        model: model
      };
    } catch (error) {
      console.error('[APIClient] HuggingFace API request failed:', error);
      return {
        success: false,
        provider: provider,
        error: error.message
      };
    }
  }

  /**
   * Generate text using OpenRouter API
   */
  async generateWithOpenRouter(prompt, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    const provider = 'openrouter';
    this.checkRateLimit(provider);

    try {
      const apiKey = await this.getApiKey(provider);
      const config = this.providers.get(provider);
      
      const url = config.baseUrl + config.endpoints.completions;
      const headers = securityManager.getSecureHeaders(apiKey, provider);

      const requestBody = {
        model: options.model || config.defaultModel,
        messages: [
          {
            role: 'system',
            content: 'You are an expert workflow automation assistant. Generate clear, actionable workflow instructions.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: Math.min(options.maxTokens || 1024, config.maxTokens),
        temperature: options.temperature || 0.7,
        top_p: options.topP || 0.9
      };

      const requestOptions = {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody)
      };

      console.log(`[APIClient] Making request to OpenRouter API`);
      const response = await this.makeRequest(url, requestOptions, provider);

      return {
        success: true,
        provider: provider,
        content: response.choices[0]?.message?.content || '',
        usage: response.usage,
        model: response.model
      };
    } catch (error) {
      console.error('[APIClient] OpenRouter API request failed:', error);
      return {
        success: false,
        provider: provider,
        error: error.message
      };
    }
  }

  /**
   * Generate workflow with automatic fallback between providers
   */
  async generateWorkflow(prompt, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    // Check cache first
    const cacheKey = `workflow_${JSON.stringify({ prompt, options })}`;
    const cached = await dataStorageManager.getCachedApiResponse('generateWorkflow', { prompt, options });
    if (cached) {
      console.log('[APIClient] Returning cached workflow result');
      return cached;
    }

    const preferredProvider = options.preferredProvider;
    const providers = this.getProviderOrder(preferredProvider);
    
    let lastError = null;

    for (const provider of providers) {
      try {
        console.log(`[APIClient] Attempting workflow generation with: ${provider}`);
        
        let result;
        switch (provider) {
          case 'groq':
            result = await this.generateWithGroq(prompt, options);
            break;
          case 'huggingface':
            result = await this.generateWithHuggingFace(prompt, options);
            break;
          case 'openrouter':
            result = await this.generateWithOpenRouter(prompt, options);
            break;
          default:
            throw new Error(`Unsupported provider: ${provider}`);
        }

        if (result.success) {
          // Cache successful result
          await dataStorageManager.cacheApiResponse('generateWorkflow', { prompt, options }, result);
          console.log(`[APIClient] Workflow generated successfully with: ${provider}`);
          return result;
        } else {
          lastError = new Error(result.error);
        }
      } catch (error) {
        console.error(`[APIClient] Provider ${provider} failed:`, error);
        lastError = error;
        continue;
      }
    }

    console.error('[APIClient] All providers failed for workflow generation');
    throw lastError || new Error('All AI providers failed');
  }

  /**
   * Get provider order (preferred first, then by success rate)
   */
  getProviderOrder(preferredProvider = null) {
    const availableProviders = ['groq', 'openrouter', 'huggingface'];
    
    if (preferredProvider && availableProviders.includes(preferredProvider)) {
      return [preferredProvider, ...availableProviders.filter(p => p !== preferredProvider)];
    }
    
    return availableProviders;
  }

  /**
   * Test API connectivity for all providers
   */
  async testConnectivity() {
    const results = {};
    
    for (const [providerName, config] of this.providers.entries()) {
      try {
        const apiKey = await dataStorageManager.getApiKey(providerName);
        if (!apiKey) {
          results[providerName] = {
            status: 'no_api_key',
            message: 'API key not configured'
          };
          continue;
        }

        // Test with a simple request
        const testPrompt = 'Hello, this is a connectivity test.';
        let testResult;

        switch (providerName) {
          case 'groq':
            testResult = await this.generateWithGroq(testPrompt, { maxTokens: 10 });
            break;
          case 'huggingface':
            testResult = await this.generateWithHuggingFace(testPrompt, { maxTokens: 10 });
            break;
          case 'openrouter':
            testResult = await this.generateWithOpenRouter(testPrompt, { maxTokens: 10 });
            break;
        }

        results[providerName] = {
          status: testResult.success ? 'connected' : 'error',
          message: testResult.success ? 'Connection successful' : testResult.error
        };
      } catch (error) {
        results[providerName] = {
          status: 'error',
          message: error.message
        };
      }
    }

    return results;
  }

  /**
   * Get available models for a provider
   */
  async getAvailableModels(provider) {
    const config = this.providers.get(provider);
    if (!config) {
      throw new Error(`Unknown provider: ${provider}`);
    }

    return {
      provider: provider,
      models: config.supportedModels,
      defaultModel: config.defaultModel,
      maxTokens: config.maxTokens
    };
  }

  /**
   * Get rate limiter status for all providers
   */
  getRateLimiterStatus() {
    const status = {};
    
    for (const [provider, limiter] of this.rateLimiters.entries()) {
      status[provider] = {
        canMakeRequest: limiter.canMakeRequest(),
        waitTime: limiter.getWaitTime(),
        tokensRemaining: limiter.tokens
      };
    }

    return status;
  }

  /**
   * Clear cached responses
   */
  async clearCache() {
    try {
      await dataStorageManager.cleanupExpiredData();
      console.log('[APIClient] Cache cleared successfully');
    } catch (error) {
      console.error('[APIClient] Failed to clear cache:', error);
      throw error;
    }
  }

  /**
   * Get API client statistics
   */
  getStats() {
    return {
      initialized: this.initialized,
      providersConfigured: this.providers.size,
      rateLimitersActive: this.rateLimiters.size,
      maxRetries: this.maxRetries,
      timeout: this.defaultTimeout,
      cacheExpiry: this.cacheExpiry
    };
  }
}

// Create singleton instance
const apiClient = new APIClient();

export default apiClient;
export { APIClient };
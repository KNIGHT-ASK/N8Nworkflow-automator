/**
 * AI Engine - Core Multi-Provider AI System for WorkflowGenius
 * Supports Groq, HuggingFace, OpenRouter with automatic fallback
 * @version 1.0.0
 */

class AIEngine {
  constructor() {
    this.providers = {
      groq: new GroqProvider(),
      huggingface: new HuggingFaceProvider(),
      openrouter: new OpenRouterProvider()
    };
    
    this.config = {
      maxRetries: 3,
      timeout: 30000,
      cacheExpiry: 3600000, // 1 hour
      rateLimits: {
        groq: { requests: 100, window: 60000 },
        huggingface: { requests: 50, window: 60000 },
        openrouter: { requests: 200, window: 60000 }
      }
    };
    
    this.cache = new Map();
    this.rateLimiters = new Map();
    this.metrics = new AIMetrics();
    
    this.initialize();
  }

  async initialize() {
    // Initialize rate limiters for each provider
    Object.keys(this.providers).forEach(provider => {
      this.rateLimiters.set(provider, new RateLimiter(
        this.config.rateLimits[provider].requests,
        this.config.rateLimits[provider].window
      ));
    });
    
    // Load saved API keys from storage
    await this.loadAPIKeys();
    
    console.log('[AIEngine] Initialized with providers:', Object.keys(this.providers));
  }

  async loadAPIKeys() {
    try {
      const keys = await chrome.storage.local.get(['apiKeys']);
      if (keys.apiKeys) {
        Object.entries(keys.apiKeys).forEach(([provider, key]) => {
          if (this.providers[provider]) {
            this.providers[provider].setAPIKey(key);
          }
        });
      }
    } catch (error) {
      console.error('[AIEngine] Error loading API keys:', error);
    }
  }

  /**
   * Generate workflow from natural language description
   * @param {string} prompt - User's workflow description
   * @param {Object} options - Generation options
   * @returns {Object} Generated workflow object
   */
  async generateWorkflow(prompt, options = {}) {
    const startTime = Date.now();
    const cacheKey = this.getCacheKey('workflow', prompt, options);
    
    // Check cache first
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      this.metrics.recordCacheHit();
      return cached;
    }

    const enhancedPrompt = this.enhancePrompt(prompt, 'workflow');
    
    try {
      // Try primary provider first, then fallback
      const result = await this.executeWithFallback(async (provider) => {
        return await provider.generateWorkflow(enhancedPrompt, options);
      }, options.preferredProvider);

      // Cache successful result
      this.setCache(cacheKey, result);
      
      // Record metrics
      this.metrics.recordGeneration('workflow', Date.now() - startTime, true);
      
      return result;
    } catch (error) {
      this.metrics.recordGeneration('workflow', Date.now() - startTime, false);
      throw new AIEngineError('Failed to generate workflow', error);
    }
  }

  /**
   * Extract patterns from text for workflow automation
   * @param {string} text - Input text to analyze
   * @returns {Array} Detected patterns
   */
  async extractPatterns(text) {
    const cacheKey = this.getCacheKey('patterns', text);
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const prompt = this.buildPatternExtractionPrompt(text);
    
    try {
      const patterns = await this.executeWithFallback(async (provider) => {
        return await provider.extractPatterns(prompt);
      });

      this.setCache(cacheKey, patterns);
      return patterns;
    } catch (error) {
      console.error('[AIEngine] Pattern extraction failed:', error);
      return [];
    }
  }

  /**
   * Optimize existing workflow for better performance
   * @param {Object} workflow - Workflow to optimize
   * @returns {Object} Optimized workflow
   */
  async optimizeWorkflow(workflow) {
    const analysisPrompt = this.buildOptimizationPrompt(workflow);
    
    try {
      const optimization = await this.executeWithFallback(async (provider) => {
        return await provider.optimize(analysisPrompt);
      });

      return this.applyOptimizations(workflow, optimization);
    } catch (error) {
      console.warn('[AIEngine] Optimization failed, returning original:', error);
      return workflow;
    }
  }

  /**
   * Execute AI request with automatic fallback
   * @private
   */
  async executeWithFallback(operation, preferredProvider = null) {
    const providers = this.getProviderOrder(preferredProvider);
    let lastError = null;

    for (const providerName of providers) {
      const provider = this.providers[providerName];
      const rateLimiter = this.rateLimiters.get(providerName);

      // Check rate limit
      if (!rateLimiter.canMakeRequest()) {
        console.warn(`[AIEngine] Rate limit exceeded for ${providerName}`);
        continue;
      }

      try {
        // Check if provider is configured
        if (!provider.isConfigured()) {
          console.warn(`[AIEngine] Provider ${providerName} not configured`);
          continue;
        }

        rateLimiter.recordRequest();
        const result = await this.executeWithRetry(
          () => operation(provider),
          this.config.maxRetries
        );
        
        console.log(`[AIEngine] Success with provider: ${providerName}`);
        return result;
      } catch (error) {
        lastError = error;
        console.error(`[AIEngine] Provider ${providerName} failed:`, error.message);
        continue;
      }
    }

    throw lastError || new Error('All AI providers failed');
  }

  /**
   * Execute operation with retry logic
   * @private
   */
  async executeWithRetry(operation, maxRetries) {
    let lastError;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await Promise.race([
          operation(),
          this.timeout(this.config.timeout)
        ]);
      } catch (error) {
        lastError = error;
        if (i < maxRetries - 1) {
          await this.delay(Math.pow(2, i) * 1000); // Exponential backoff
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Get provider execution order
   * @private
   */
  getProviderOrder(preferred = null) {
    const order = Object.keys(this.providers);
    
    if (preferred && order.includes(preferred)) {
      // Move preferred to front
      return [preferred, ...order.filter(p => p !== preferred)];
    }
    
    // Sort by current success rate
    return order.sort((a, b) => {
      const successA = this.metrics.getSuccessRate(a);
      const successB = this.metrics.getSuccessRate(b);
      return successB - successA;
    });
  }

  /**
   * Enhance prompt with context and instructions
   * @private
   */
  enhancePrompt(prompt, type) {
    const enhancements = {
      workflow: `
        Generate a detailed workflow automation based on the following description.
        Return a structured JSON object with steps, conditions, and actions.
        Include error handling and optimization suggestions.
        
        Description: ${prompt}
        
        Required format:
        {
          "name": "Workflow name",
          "description": "Brief description",
          "steps": [...],
          "triggers": [...],
          "conditions": [...],
          "errorHandling": {...}
        }
      `,
      patterns: `
        Analyze the following text and extract automation patterns.
        Identify repetitive tasks, conditions, and potential workflows.
        
        Text: ${prompt}
      `,
      optimization: `
        Analyze and optimize the following workflow for better performance.
        Suggest improvements for speed, reliability, and resource usage.
        
        Workflow: ${prompt}
      `
    };

    return enhancements[type] || prompt;
  }

  buildPatternExtractionPrompt(text) {
    return `
      Extract automation patterns from the following text.
      Identify:
      1. Repetitive actions
      2. Conditional logic
      3. Data transformations
      4. API interactions
      5. Schedulable tasks
      
      Text: ${text}
      
      Return as JSON array of pattern objects.
    `;
  }

  buildOptimizationPrompt(workflow) {
    return `
      Optimize this workflow for:
      1. Performance (reduce latency)
      2. Reliability (add error handling)
      3. Resource efficiency
      4. Parallel execution opportunities
      5. Caching opportunities
      
      Workflow: ${JSON.stringify(workflow)}
      
      Return optimization suggestions as JSON.
    `;
  }

  applyOptimizations(workflow, optimizations) {
    const optimized = { ...workflow };
    
    if (optimizations.parallelSteps) {
      optimized.parallelGroups = optimizations.parallelSteps;
    }
    
    if (optimizations.caching) {
      optimized.cachePoints = optimizations.caching;
    }
    
    if (optimizations.errorHandling) {
      optimized.errorHandling = {
        ...optimized.errorHandling,
        ...optimizations.errorHandling
      };
    }
    
    return optimized;
  }

  // Cache management
  getCacheKey(type, input, options = {}) {
    const optionsStr = JSON.stringify(options);
    return `${type}:${this.hashString(input + optionsStr)}`;
  }

  getFromCache(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.config.cacheExpiry) {
      return cached.data;
    }
    this.cache.delete(key);
    return null;
  }

  setCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
    
    // Limit cache size
    if (this.cache.size > 100) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }

  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  timeout(ms) {
    return new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Request timeout')), ms)
    );
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Public API for configuration
  setAPIKey(provider, key) {
    if (this.providers[provider]) {
      this.providers[provider].setAPIKey(key);
      chrome.storage.local.set({
        apiKeys: {
          ...this.getStoredKeys(),
          [provider]: key
        }
      });
    }
  }

  async getStoredKeys() {
    const result = await chrome.storage.local.get(['apiKeys']);
    return result.apiKeys || {};
  }

  getMetrics() {
    return this.metrics.getReport();
  }

  clearCache() {
    this.cache.clear();
    console.log('[AIEngine] Cache cleared');
  }
}

/**
 * Groq Provider Implementation
 */
class GroqProvider {
  constructor() {
    this.apiKey = null;
    this.baseURL = 'https://api.groq.com/openai/v1';
    this.model = 'mixtral-8x7b-32768';
  }

  setAPIKey(key) {
    this.apiKey = key;
  }

  isConfigured() {
    return !!this.apiKey;
  }

  async generateWorkflow(prompt, options = {}) {
    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are a workflow automation expert. Generate structured workflows in JSON format.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 2000,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.status}`);
    }

    const data = await response.json();
    return JSON.parse(data.choices[0].message.content);
  }

  async extractPatterns(prompt) {
    const response = await this.generateWorkflow(prompt, {
      temperature: 0.3,
      maxTokens: 1500
    });
    return response.patterns || [];
  }

  async optimize(prompt) {
    return this.generateWorkflow(prompt, {
      temperature: 0.5,
      maxTokens: 1000
    });
  }
}

/**
 * HuggingFace Provider Implementation
 */
class HuggingFaceProvider {
  constructor() {
    this.apiKey = null;
    this.baseURL = 'https://api-inference.huggingface.co/models';
    this.model = 'mistralai/Mixtral-8x7B-Instruct-v0.1';
  }

  setAPIKey(key) {
    this.apiKey = key;
  }

  isConfigured() {
    return !!this.apiKey;
  }

  async generateWorkflow(prompt, options = {}) {
    const response = await fetch(`${this.baseURL}/${this.model}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_new_tokens: options.maxTokens || 2000,
          temperature: options.temperature || 0.7,
          return_full_text: false
        }
      })
    });

    if (!response.ok) {
      throw new Error(`HuggingFace API error: ${response.status}`);
    }

    const data = await response.json();
    
    try {
      // Extract JSON from response
      const jsonMatch = data[0].generated_text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('No valid JSON in response');
    } catch (error) {
      // Fallback: create structured response from text
      return this.parseTextToWorkflow(data[0].generated_text);
    }
  }

  parseTextToWorkflow(text) {
    // Basic text to workflow parsing
    const lines = text.split('\n').filter(l => l.trim());
    const workflow = {
      name: 'Generated Workflow',
      description: lines[0] || 'Automated workflow',
      steps: [],
      triggers: [],
      conditions: []
    };

    lines.forEach((line, index) => {
      if (line.includes('step') || line.includes('action')) {
        workflow.steps.push({
          id: `step_${index}`,
          action: line.replace(/^\d+\.?\s*/, '').trim()
        });
      }
    });

    return workflow;
  }

  async extractPatterns(prompt) {
    const response = await this.generateWorkflow(prompt);
    return response.patterns || [];
  }

  async optimize(prompt) {
    return this.generateWorkflow(prompt);
  }
}

/**
 * OpenRouter Provider Implementation
 */
class OpenRouterProvider {
  constructor() {
    this.apiKey = null;
    this.baseURL = 'https://openrouter.ai/api/v1';
    this.model = 'anthropic/claude-2';
  }

  setAPIKey(key) {
    this.apiKey = key;
  }

  isConfigured() {
    return !!this.apiKey;
  }

  async generateWorkflow(prompt, options = {}) {
    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://workflowgenius.app',
        'X-Title': 'WorkflowGenius'
      },
      body: JSON.stringify({
        model: options.model || this.model,
        messages: [
          {
            role: 'system',
            content: 'Generate workflow automation in strict JSON format. No explanations, only JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 2000
      })
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const data = await response.json();
    
    try {
      return JSON.parse(data.choices[0].message.content);
    } catch (error) {
      // Extract JSON if wrapped in markdown
      const jsonMatch = data.choices[0].message.content.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1]);
      }
      throw error;
    }
  }

  async extractPatterns(prompt) {
    return this.generateWorkflow(prompt);
  }

  async optimize(prompt) {
    return this.generateWorkflow(prompt);
  }
}

/**
 * Rate Limiter Implementation
 */
class RateLimiter {
  constructor(maxRequests, windowMs) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = [];
  }

  canMakeRequest() {
    this.cleanup();
    return this.requests.length < this.maxRequests;
  }

  recordRequest() {
    this.cleanup();
    this.requests.push(Date.now());
  }

  cleanup() {
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < this.windowMs);
  }

  getRemaining() {
    this.cleanup();
    return Math.max(0, this.maxRequests - this.requests.length);
  }

  getResetTime() {
    if (this.requests.length === 0) return null;
    return this.requests[0] + this.windowMs;
  }
}

/**
 * AI Metrics Tracking
 */
class AIMetrics {
  constructor() {
    this.metrics = {
      requests: new Map(),
      cacheHits: 0,
      cacheMisses: 0,
      errors: new Map(),
      latencies: []
    };
  }

  recordGeneration(type, latency, success) {
    const key = `${type}:${success ? 'success' : 'failure'}`;
    this.metrics.requests.set(key, (this.metrics.requests.get(key) || 0) + 1);
    
    if (success) {
      this.metrics.latencies.push(latency);
      // Keep only last 100 latencies
      if (this.metrics.latencies.length > 100) {
        this.metrics.latencies.shift();
      }
    }
  }

  recordCacheHit() {
    this.metrics.cacheHits++;
  }

  recordCacheMiss() {
    this.metrics.cacheMisses++;
  }

  recordError(provider, error) {
    const errors = this.metrics.errors.get(provider) || [];
    errors.push({
      message: error.message,
      timestamp: Date.now()
    });
    this.metrics.errors.set(provider, errors.slice(-10)); // Keep last 10 errors
  }

  getSuccessRate(provider) {
    const success = this.metrics.requests.get(`${provider}:success`) || 0;
    const failure = this.metrics.requests.get(`${provider}:failure`) || 0;
    const total = success + failure;
    
    return total > 0 ? success / total : 0.5; // Default to 50% if no data
  }

  getAverageLatency() {
    if (this.metrics.latencies.length === 0) return 0;
    const sum = this.metrics.latencies.reduce((a, b) => a + b, 0);
    return sum / this.metrics.latencies.length;
  }

  getReport() {
    return {
      totalRequests: Array.from(this.metrics.requests.values()).reduce((a, b) => a + b, 0),
      cacheHitRate: this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses) || 0,
      averageLatency: this.getAverageLatency(),
      providerStats: Object.keys(this.metrics.errors).map(provider => ({
        provider,
        successRate: this.getSuccessRate(provider),
        recentErrors: this.metrics.errors.get(provider) || []
      }))
    };
  }
}

/**
 * Custom Error Class
 */
class AIEngineError extends Error {
  constructor(message, originalError = null) {
    super(message);
    this.name = 'AIEngineError';
    this.originalError = originalError;
    this.timestamp = Date.now();
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AIEngine;
} else {
  window.AIEngine = AIEngine;
}

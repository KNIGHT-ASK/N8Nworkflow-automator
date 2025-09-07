/**
 * Pattern Matcher - Advanced pattern recognition for workflow automation
 * @version 1.0.0
 */

class PatternMatcher {
  constructor() {
    this.patterns = new PatternDatabase();
    this.analyzer = new PatternAnalyzer();
    this.predictor = new PatternPredictor();
    
    this.config = {
      minConfidence: 0.7,
      maxPatterns: 1000,
      similarityThreshold: 0.8,
      cacheSize: 100
    };

    this.cache = new Map();
    this.statistics = {
      matchesFound: 0,
      predictionsCorrect: 0,
      totalPredictions: 0
    };

    this.initialize();
  }

  async initialize() {
    await this.patterns.load();
    console.log('[PatternMatcher] Initialized with', this.patterns.count(), 'patterns');
  }

  /**
   * Match text against known patterns
   */
  async match(text, context = {}) {
    const cacheKey = this.getCacheKey(text, context);
    
    // Check cache
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    // Perform matching
    const results = await this.performMatching(text, context);
    
    // Cache results
    this.cache.set(cacheKey, results);
    if (this.cache.size > this.config.cacheSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.statistics.matchesFound++;
    return results;
  }

  /**
   * Perform pattern matching
   */
  async performMatching(text, context) {
    // Extract features from text
    const features = this.analyzer.extractFeatures(text);
    
    // Find matching patterns
    const candidates = this.patterns.findCandidates(features);
    
    // Score and rank matches
    const scored = candidates.map(pattern => ({
      pattern,
      score: this.calculateMatchScore(features, pattern, context)
    }));

    // Filter by confidence threshold
    const matches = scored
      .filter(m => m.score >= this.config.minConfidence)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    // Predict next actions
    const predictions = await this.predictor.predict(matches, context);

    return {
      matches,
      predictions,
      features,
      confidence: matches.length > 0 ? matches[0].score : 0
    };
  }

  /**
   * Calculate match score
   */
  calculateMatchScore(features, pattern, context) {
    let score = 0;
    let weights = 0;

    // Text similarity
    if (features.text && pattern.text) {
      score += this.calculateSimilarity(features.text, pattern.text) * 0.3;
      weights += 0.3;
    }

    // Intent match
    if (features.intent && pattern.intent) {
      const intentMatch = this.matchIntents(features.intent, pattern.intent);
      score += intentMatch * 0.25;
      weights += 0.25;
    }

    // Entity match
    if (features.entities && pattern.entities) {
      const entityMatch = this.matchEntities(features.entities, pattern.entities);
      score += entityMatch * 0.2;
      weights += 0.2;
    }

    // Context relevance
    if (context.domain && pattern.context?.domain) {
      const contextMatch = context.domain === pattern.context.domain ? 1 : 0.5;
      score += contextMatch * 0.15;
      weights += 0.15;
    }

    // Frequency bonus
    if (pattern.frequency) {
      score += Math.min(pattern.frequency / 100, 1) * 0.1;
      weights += 0.1;
    }

    return weights > 0 ? score / weights : 0;
  }

  /**
   * Calculate text similarity
   */
  calculateSimilarity(text1, text2) {
    const tokens1 = this.tokenize(text1.toLowerCase());
    const tokens2 = this.tokenize(text2.toLowerCase());
    
    const intersection = tokens1.filter(t => tokens2.includes(t));
    const union = [...new Set([...tokens1, ...tokens2])];
    
    return union.length > 0 ? intersection.length / union.length : 0;
  }

  /**
   * Tokenize text
   */
  tokenize(text) {
    return text
      .split(/\s+/)
      .filter(t => t.length > 2)
      .map(t => t.replace(/[^a-z0-9]/g, ''));
  }

  /**
   * Match intents
   */
  matchIntents(intents1, intents2) {
    const common = intents1.filter(i => intents2.includes(i));
    const total = Math.max(intents1.length, intents2.length);
    return total > 0 ? common.length / total : 0;
  }

  /**
   * Match entities
   */
  matchEntities(entities1, entities2) {
    let matches = 0;
    let total = 0;

    const types = new Set([
      ...Object.keys(entities1),
      ...Object.keys(entities2)
    ]);

    types.forEach(type => {
      const e1 = entities1[type] || [];
      const e2 = entities2[type] || [];
      
      const common = e1.filter(e => e2.includes(e));
      matches += common.length;
      total += Math.max(e1.length, e2.length);
    });

    return total > 0 ? matches / total : 0;
  }

  /**
   * Learn new pattern
   */
  async learnPattern(text, workflow, context = {}) {
    const features = this.analyzer.extractFeatures(text);
    
    const pattern = {
      id: this.generatePatternId(),
      text,
      features,
      workflow,
      context,
      frequency: 1,
      createdAt: Date.now(),
      lastUsed: Date.now()
    };

    // Check for similar existing patterns
    const similar = await this.findSimilarPatterns(pattern);
    
    if (similar.length > 0) {
      // Merge with existing pattern
      await this.mergePatterns(similar[0], pattern);
    } else {
      // Add as new pattern
      await this.patterns.add(pattern);
    }

    // Clear cache as patterns have changed
    this.cache.clear();

    return { learned: true, patternId: pattern.id };
  }

  /**
   * Find similar patterns
   */
  async findSimilarPatterns(pattern) {
    const allPatterns = await this.patterns.getAll();
    
    return allPatterns
      .map(p => ({
        pattern: p,
        similarity: this.calculateSimilarity(pattern.text, p.text)
      }))
      .filter(p => p.similarity >= this.config.similarityThreshold)
      .map(p => p.pattern);
  }

  /**
   * Merge patterns
   */
  async mergePatterns(existing, newPattern) {
    existing.frequency++;
    existing.lastUsed = Date.now();
    
    // Merge features
    if (newPattern.features.entities) {
      Object.keys(newPattern.features.entities).forEach(type => {
        if (!existing.features.entities[type]) {
          existing.features.entities[type] = [];
        }
        existing.features.entities[type] = [
          ...new Set([
            ...existing.features.entities[type],
            ...newPattern.features.entities[type]
          ])
        ];
      });
    }

    // Update workflow if newer
    if (newPattern.workflow) {
      existing.workflow = newPattern.workflow;
    }

    await this.patterns.update(existing);
  }

  /**
   * Predict next pattern
   */
  async predictNext(currentPattern, context = {}) {
    const prediction = await this.predictor.predictNext(currentPattern, context);
    
    if (prediction) {
      this.statistics.totalPredictions++;
    }

    return prediction;
  }

  /**
   * Validate prediction
   */
  validatePrediction(predictionId, wasCorrect) {
    if (wasCorrect) {
      this.statistics.predictionsCorrect++;
    }
    
    this.predictor.updateAccuracy(predictionId, wasCorrect);
  }

  /**
   * Get cache key
   */
  getCacheKey(text, context) {
    return `${text.substring(0, 50)}:${JSON.stringify(context)}`;
  }

  /**
   * Generate pattern ID
   */
  generatePatternId() {
    return `pattern_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get statistics
   */
  getStatistics() {
    const accuracy = this.statistics.totalPredictions > 0
      ? this.statistics.predictionsCorrect / this.statistics.totalPredictions
      : 0;

    return {
      ...this.statistics,
      accuracy,
      patternsCount: this.patterns.count(),
      cacheSize: this.cache.size
    };
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }
}

/**
 * Pattern Database
 */
class PatternDatabase {
  constructor() {
    this.patterns = new Map();
    this.indexes = {
      byIntent: new Map(),
      byDomain: new Map(),
      byType: new Map()
    };
  }

  async load() {
    try {
      const stored = await chrome.storage.local.get(['patterns']);
      if (stored.patterns) {
        stored.patterns.forEach(p => {
          this.patterns.set(p.id, p);
          this.indexPattern(p);
        });
      }
    } catch (error) {
      console.error('[PatternDatabase] Failed to load patterns:', error);
    }

    // Load built-in patterns
    this.loadBuiltInPatterns();
  }

  loadBuiltInPatterns() {
    const builtIn = [
      {
        id: 'builtin_scrape',
        text: 'scrape data from website',
        features: {
          intent: ['data_extraction'],
          entities: { action: ['scrape'], target: ['website', 'data'] }
        },
        workflow: { type: 'web_scraping' },
        frequency: 100
      },
      {
        id: 'builtin_form',
        text: 'fill and submit form',
        features: {
          intent: ['automation'],
          entities: { action: ['fill', 'submit'], target: ['form'] }
        },
        workflow: { type: 'form_automation' },
        frequency: 100
      },
      {
        id: 'builtin_api',
        text: 'fetch data from api',
        features: {
          intent: ['integration'],
          entities: { action: ['fetch'], target: ['api', 'data'] }
        },
        workflow: { type: 'api_integration' },
        frequency: 100
      },
      {
        id: 'builtin_monitor',
        text: 'monitor page for changes',
        features: {
          intent: ['monitoring'],
          entities: { action: ['monitor', 'watch'], target: ['page', 'changes'] }
        },
        workflow: { type: 'page_monitoring' },
        frequency: 100
      },
      {
        id: 'builtin_schedule',
        text: 'run every hour',
        features: {
          intent: ['automation'],
          entities: { trigger: ['schedule'], interval: ['hour'] }
        },
        workflow: { type: 'scheduled_task' },
        frequency: 100
      }
    ];

    builtIn.forEach(p => {
      if (!this.patterns.has(p.id)) {
        this.patterns.set(p.id, p);
        this.indexPattern(p);
      }
    });
  }

  findCandidates(features) {
    const candidates = new Set();

    // Search by intent
    if (features.intent) {
      features.intent.forEach(intent => {
        const patterns = this.indexes.byIntent.get(intent) || [];
        patterns.forEach(p => candidates.add(p));
      });
    }

    // Search by domain
    if (features.domain) {
      const patterns = this.indexes.byDomain.get(features.domain) || [];
      patterns.forEach(p => candidates.add(p));
    }

    // If no candidates, return all patterns
    if (candidates.size === 0) {
      return Array.from(this.patterns.values());
    }

    return Array.from(candidates);
  }

  async add(pattern) {
    this.patterns.set(pattern.id, pattern);
    this.indexPattern(pattern);
    await this.save();
  }

  async update(pattern) {
    this.patterns.set(pattern.id, pattern);
    this.reindexPattern(pattern);
    await this.save();
  }

  indexPattern(pattern) {
    // Index by intent
    if (pattern.features?.intent) {
      pattern.features.intent.forEach(intent => {
        if (!this.indexes.byIntent.has(intent)) {
          this.indexes.byIntent.set(intent, []);
        }
        this.indexes.byIntent.get(intent).push(pattern);
      });
    }

    // Index by domain
    if (pattern.context?.domain) {
      if (!this.indexes.byDomain.has(pattern.context.domain)) {
        this.indexes.byDomain.set(pattern.context.domain, []);
      }
      this.indexes.byDomain.get(pattern.context.domain).push(pattern);
    }

    // Index by type
    if (pattern.workflow?.type) {
      if (!this.indexes.byType.has(pattern.workflow.type)) {
        this.indexes.byType.set(pattern.workflow.type, []);
      }
      this.indexes.byType.get(pattern.workflow.type).push(pattern);
    }
  }

  reindexPattern(pattern) {
    // Remove from all indexes
    this.indexes.byIntent.forEach(patterns => {
      const index = patterns.findIndex(p => p.id === pattern.id);
      if (index >= 0) patterns.splice(index, 1);
    });

    this.indexes.byDomain.forEach(patterns => {
      const index = patterns.findIndex(p => p.id === pattern.id);
      if (index >= 0) patterns.splice(index, 1);
    });

    this.indexes.byType.forEach(patterns => {
      const index = patterns.findIndex(p => p.id === pattern.id);
      if (index >= 0) patterns.splice(index, 1);
    });

    // Re-add to indexes
    this.indexPattern(pattern);
  }

  async save() {
    try {
      const patterns = Array.from(this.patterns.values()).slice(-1000);
      await chrome.storage.local.set({ patterns });
    } catch (error) {
      console.error('[PatternDatabase] Failed to save patterns:', error);
    }
  }

  async getAll() {
    return Array.from(this.patterns.values());
  }

  count() {
    return this.patterns.size;
  }
}

/**
 * Pattern Analyzer
 */
class PatternAnalyzer {
  extractFeatures(text) {
    return {
      text,
      intent: this.detectIntent(text),
      entities: this.extractEntities(text),
      complexity: this.calculateComplexity(text),
      domain: this.detectDomain(text)
    };
  }

  detectIntent(text) {
    const intents = [];
    const patterns = {
      'data_extraction': /extract|scrape|collect|get|fetch/i,
      'automation': /automate|automatically|schedule|repeat/i,
      'transformation': /convert|transform|change|modify/i,
      'integration': /connect|integrate|api|webhook/i,
      'monitoring': /monitor|watch|track|alert/i,
      'filtering': /filter|search|find|select/i
    };

    for (const [intent, pattern] of Object.entries(patterns)) {
      if (pattern.test(text)) {
        intents.push(intent);
      }
    }

    return intents.length > 0 ? intents : ['general'];
  }

  extractEntities(text) {
    const entities = {};
    
    // Extract actions
    const actions = text.match(/\b(click|type|navigate|scroll|extract|fill|submit|fetch|send)\b/gi);
    if (actions) entities.action = [...new Set(actions.map(a => a.toLowerCase()))];

    // Extract targets
    const targets = text.match(/\b(button|link|form|field|page|website|api|data|file)\b/gi);
    if (targets) entities.target = [...new Set(targets.map(t => t.toLowerCase()))];

    // Extract triggers
    const triggers = text.match(/\b(every|when|after|on|at)\s+\w+/gi);
    if (triggers) entities.trigger = triggers;

    // Extract URLs
    const urls = text.match(/https?:\/\/[^\s]+/g);
    if (urls) entities.url = urls;

    return entities;
  }

  calculateComplexity(text) {
    const words = text.split(/\s+/).length;
    const conditions = (text.match(/\b(if|when|while|until)\b/gi) || []).length;
    const actions = (text.match(/\b(and|then|after|before)\b/gi) || []).length;
    
    const score = words / 10 + conditions * 2 + actions;
    
    if (score <= 3) return 'simple';
    if (score <= 7) return 'moderate';
    return 'complex';
  }

  detectDomain(text) {
    const domains = {
      'ecommerce': /shop|cart|product|order|checkout/i,
      'social': /post|comment|like|share|follow/i,
      'finance': /payment|invoice|transaction|balance/i,
      'content': /article|blog|news|video|media/i,
      'communication': /email|message|chat|notification/i
    };

    for (const [domain, pattern] of Object.entries(domains)) {
      if (pattern.test(text)) {
        return domain;
      }
    }

    return 'general';
  }
}

/**
 * Pattern Predictor
 */
class PatternPredictor {
  constructor() {
    this.predictions = new Map();
    this.accuracy = new Map();
  }

  async predict(matches, context) {
    if (matches.length === 0) return [];

    const predictions = [];

    // Predict based on top match
    const topMatch = matches[0];
    if (topMatch.pattern.workflow) {
      predictions.push({
        type: 'workflow',
        value: topMatch.pattern.workflow,
        confidence: topMatch.score
      });
    }

    // Predict next actions
    const nextActions = this.predictNextActions(topMatch.pattern);
    if (nextActions.length > 0) {
      predictions.push({
        type: 'next_actions',
        value: nextActions,
        confidence: topMatch.score * 0.8
      });
    }

    // Store prediction for validation
    const predictionId = this.generatePredictionId();
    this.predictions.set(predictionId, {
      predictions,
      timestamp: Date.now()
    });

    return predictions.map(p => ({ ...p, id: predictionId }));
  }

  predictNextActions(pattern) {
    const actions = [];

    if (pattern.workflow?.type) {
      const nextSteps = {
        'web_scraping': ['wait_for_element', 'extract_data', 'save_results'],
        'form_automation': ['validate_input', 'submit_form', 'wait_confirmation'],
        'api_integration': ['parse_response', 'transform_data', 'handle_errors'],
        'page_monitoring': ['check_changes', 'send_notification', 'log_event']
      };

      return nextSteps[pattern.workflow.type] || [];
    }

    return actions;
  }

  async predictNext(currentPattern, context) {
    // Simple sequential prediction
    const sequence = context.previousPatterns || [];
    sequence.push(currentPattern);

    // Find common sequences
    const nextPattern = await this.findNextInSequence(sequence);

    if (nextPattern) {
      const predictionId = this.generatePredictionId();
      this.predictions.set(predictionId, {
        pattern: nextPattern,
        timestamp: Date.now()
      });

      return {
        id: predictionId,
        pattern: nextPattern,
        confidence: this.calculateSequenceConfidence(sequence)
      };
    }

    return null;
  }

  async findNextInSequence(sequence) {
    // Simplified sequence matching
    // In production, use more sophisticated algorithms
    return null;
  }

  calculateSequenceConfidence(sequence) {
    // Base confidence on sequence length and past accuracy
    const baseConfidence = Math.max(0.5, 1 - sequence.length * 0.1);
    const accuracyBonus = this.getAverageAccuracy() * 0.3;
    return Math.min(1, baseConfidence + accuracyBonus);
  }

  updateAccuracy(predictionId, wasCorrect) {
    this.accuracy.set(predictionId, wasCorrect);
    
    // Clean old accuracy data
    const cutoff = Date.now() - 7 * 24 * 3600000; // 7 days
    for (const [id, prediction] of this.predictions) {
      if (prediction.timestamp < cutoff) {
        this.predictions.delete(id);
        this.accuracy.delete(id);
      }
    }
  }

  getAverageAccuracy() {
    if (this.accuracy.size === 0) return 0.5;
    
    let correct = 0;
    this.accuracy.forEach(wasCorrect => {
      if (wasCorrect) correct++;
    });

    return correct / this.accuracy.size;
  }

  generatePredictionId() {
    return `pred_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PatternMatcher;
} else {
  window.PatternMatcher = PatternMatcher;
}

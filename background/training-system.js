/**
 * Training System - Learning and improvement system with feedback loops
 * @version 1.0.0
 */

class TrainingSystem {
  constructor(aiEngine) {
    this.aiEngine = aiEngine;
    this.feedbackStore = new FeedbackStore();
    this.patternLearner = new PatternLearner();
    this.performanceAnalyzer = new PerformanceAnalyzer();
    
    this.config = {
      minFeedbackForLearning: 5,
      learningRate: 0.1,
      batchSize: 10,
      updateInterval: 3600000, // 1 hour
      maxStorageSize: 10000
    };

    this.trainingData = {
      successfulWorkflows: [],
      failedWorkflows: [],
      userCorrections: [],
      performanceMetrics: []
    };

    this.initialize();
  }

  async initialize() {
    await this.loadTrainingData();
    this.startContinuousLearning();
    console.log('[TrainingSystem] Initialized with', this.getDataStats());
  }

  /**
   * Record user feedback on generated workflow
   */
  async recordFeedback(workflowId, feedback) {
    const record = {
      workflowId,
      feedback: feedback.rating,
      corrections: feedback.corrections || [],
      timestamp: Date.now(),
      context: feedback.context || {}
    };

    await this.feedbackStore.add(record);
    
    // Immediate learning for critical feedback
    if (feedback.rating <= 2 || feedback.corrections.length > 0) {
      await this.learnFromFeedback(record);
    }

    // Update success/failure patterns
    if (feedback.rating >= 4) {
      this.recordSuccess(workflowId, feedback);
    } else {
      this.recordFailure(workflowId, feedback);
    }

    return { processed: true, learningTriggered: feedback.rating <= 2 };
  }

  /**
   * Learn from user feedback
   */
  async learnFromFeedback(feedbackRecord) {
    const workflow = await this.getWorkflow(feedbackRecord.workflowId);
    if (!workflow) return;

    // Extract patterns from corrections
    const patterns = this.extractCorrectionPatterns(
      workflow,
      feedbackRecord.corrections
    );

    // Update pattern weights
    await this.patternLearner.updatePatterns(patterns, feedbackRecord.feedback);

    // Store learned patterns
    this.trainingData.userCorrections.push({
      original: workflow,
      corrections: feedbackRecord.corrections,
      patterns,
      timestamp: feedbackRecord.timestamp
    });

    // Trigger retraining if enough data
    if (this.shouldRetrain()) {
      await this.retrain();
    }
  }

  /**
   * Extract patterns from user corrections
   */
  extractCorrectionPatterns(originalWorkflow, corrections) {
    const patterns = [];

    corrections.forEach(correction => {
      const pattern = {
        type: correction.type,
        original: this.extractFeatures(originalWorkflow, correction.stepId),
        corrected: correction.newValue,
        context: {
          workflowType: originalWorkflow.metadata?.type,
          complexity: originalWorkflow.metadata?.complexity
        }
      };

      patterns.push(pattern);
    });

    return patterns;
  }

  /**
   * Extract features from workflow for learning
   */
  extractFeatures(workflow, stepId) {
    const step = workflow.steps.find(s => s.id === stepId);
    if (!step) return null;

    return {
      action: step.action,
      type: step.type,
      conditions: step.conditions,
      position: workflow.steps.indexOf(step),
      predecessors: this.getPredecessors(workflow, stepId),
      successors: this.getSuccessors(workflow, stepId)
    };
  }

  /**
   * Record successful workflow execution
   */
  recordSuccess(workflowId, feedback) {
    this.trainingData.successfulWorkflows.push({
      workflowId,
      feedback,
      timestamp: Date.now(),
      executionTime: feedback.executionTime,
      resourceUsage: feedback.resourceUsage
    });

    // Learn success patterns
    this.patternLearner.reinforcePattern(workflowId, 'success');
    
    // Trim old data
    this.trimTrainingData();
  }

  /**
   * Record failed workflow execution
   */
  recordFailure(workflowId, feedback) {
    this.trainingData.failedWorkflows.push({
      workflowId,
      feedback,
      timestamp: Date.now(),
      errorType: feedback.errorType,
      errorMessage: feedback.errorMessage,
      failedStep: feedback.failedStep
    });

    // Learn failure patterns
    this.patternLearner.reinforcePattern(workflowId, 'failure');
    
    // Analyze failure for prevention
    this.analyzeFailure(workflowId, feedback);
  }

  /**
   * Analyze failure patterns for prevention
   */
  analyzeFailure(workflowId, feedback) {
    const failures = this.trainingData.failedWorkflows.filter(
      f => f.errorType === feedback.errorType
    );

    if (failures.length >= 3) {
      // Common failure pattern detected
      const preventionRule = {
        errorType: feedback.errorType,
        conditions: this.extractFailureConditions(failures),
        prevention: this.generatePreventionStrategy(feedback.errorType),
        confidence: failures.length / 10
      };

      this.patternLearner.addPreventionRule(preventionRule);
    }
  }

  /**
   * Generate prevention strategy for error type
   */
  generatePreventionStrategy(errorType) {
    const strategies = {
      'timeout': {
        action: 'increase_timeout',
        parameters: { multiplier: 2, maxTimeout: 60000 }
      },
      'selector_not_found': {
        action: 'add_wait_for_element',
        parameters: { timeout: 5000, fallback: 'skip' }
      },
      'api_error': {
        action: 'add_retry_logic',
        parameters: { maxRetries: 3, backoff: 'exponential' }
      },
      'validation_error': {
        action: 'add_validation_step',
        parameters: { validateBefore: true, sanitize: true }
      }
    };

    return strategies[errorType] || {
      action: 'generic_error_handling',
      parameters: { retry: true, log: true }
    };
  }

  /**
   * Check if retraining is needed
   */
  shouldRetrain() {
    const feedbackCount = this.feedbackStore.getRecentCount();
    const lastRetrain = this.getLastRetrainTime();
    const timeSinceRetrain = Date.now() - lastRetrain;

    return (
      feedbackCount >= this.config.minFeedbackForLearning &&
      timeSinceRetrain >= this.config.updateInterval
    );
  }

  /**
   * Retrain the system with accumulated data
   */
  async retrain() {
    console.log('[TrainingSystem] Starting retraining...');

    // Prepare training batch
    const batch = this.prepareTrainingBatch();

    // Update patterns
    await this.patternLearner.train(batch);

    // Update AI engine weights
    await this.updateAIEngineWeights(batch);

    // Evaluate performance
    const metrics = await this.evaluatePerformance();
    
    // Save training checkpoint
    await this.saveCheckpoint(metrics);

    console.log('[TrainingSystem] Retraining complete:', metrics);
  }

  /**
   * Prepare training batch from recent data
   */
  prepareTrainingBatch() {
    const batch = {
      successful: this.trainingData.successfulWorkflows.slice(-this.config.batchSize),
      failed: this.trainingData.failedWorkflows.slice(-this.config.batchSize),
      corrections: this.trainingData.userCorrections.slice(-this.config.batchSize)
    };

    // Add performance metrics
    batch.metrics = this.performanceAnalyzer.analyze(batch);

    return batch;
  }

  /**
   * Update AI engine weights based on learning
   */
  async updateAIEngineWeights(batch) {
    const updates = {
      patternWeights: this.patternLearner.getWeights(),
      preventionRules: this.patternLearner.getPreventionRules(),
      successPatterns: this.extractSuccessPatterns(batch.successful),
      failurePatterns: this.extractFailurePatterns(batch.failed)
    };

    // Apply updates to AI engine
    await this.aiEngine.applyLearningUpdates(updates);
  }

  /**
   * Evaluate system performance
   */
  async evaluatePerformance() {
    const recent = this.trainingData.successfulWorkflows.slice(-100);
    const failures = this.trainingData.failedWorkflows.slice(-100);

    return {
      successRate: recent.length / (recent.length + failures.length),
      averageRating: this.calculateAverageRating(),
      commonErrors: this.identifyCommonErrors(failures),
      improvements: this.measureImprovements(),
      timestamp: Date.now()
    };
  }

  /**
   * Start continuous learning process
   */
  startContinuousLearning() {
    setInterval(async () => {
      if (this.shouldRetrain()) {
        await this.retrain();
      }

      // Clean old data
      this.trimTrainingData();
      
      // Save current state
      await this.saveTrainingData();
    }, this.config.updateInterval);
  }

  /**
   * Get workflow predecessors
   */
  getPredecessors(workflow, stepId) {
    const step = workflow.steps.find(s => s.id === stepId);
    return step?.dependsOn || [];
  }

  /**
   * Get workflow successors
   */
  getSuccessors(workflow, stepId) {
    return workflow.steps
      .filter(s => s.dependsOn?.includes(stepId))
      .map(s => s.id);
  }

  /**
   * Extract failure conditions
   */
  extractFailureConditions(failures) {
    const conditions = {};
    
    failures.forEach(failure => {
      Object.keys(failure).forEach(key => {
        if (!conditions[key]) conditions[key] = [];
        conditions[key].push(failure[key]);
      });
    });

    return conditions;
  }

  /**
   * Extract success patterns
   */
  extractSuccessPatterns(successful) {
    const patterns = {};
    
    successful.forEach(success => {
      const pattern = {
        rating: success.feedback.rating,
        executionTime: success.executionTime,
        features: []
      };
      
      if (!patterns[success.workflowId]) {
        patterns[success.workflowId] = pattern;
      }
    });

    return patterns;
  }

  /**
   * Extract failure patterns
   */
  extractFailurePatterns(failed) {
    const patterns = {};
    
    failed.forEach(failure => {
      if (!patterns[failure.errorType]) {
        patterns[failure.errorType] = [];
      }
      patterns[failure.errorType].push({
        step: failure.failedStep,
        message: failure.errorMessage
      });
    });

    return patterns;
  }

  /**
   * Calculate average rating
   */
  calculateAverageRating() {
    const ratings = this.feedbackStore.getAllRatings();
    if (ratings.length === 0) return 0;
    
    const sum = ratings.reduce((a, b) => a + b, 0);
    return sum / ratings.length;
  }

  /**
   * Identify common errors
   */
  identifyCommonErrors(failures) {
    const errorCounts = {};
    
    failures.forEach(failure => {
      errorCounts[failure.errorType] = (errorCounts[failure.errorType] || 0) + 1;
    });

    return Object.entries(errorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([type, count]) => ({ type, count }));
  }

  /**
   * Measure improvements
   */
  measureImprovements() {
    const oldMetrics = this.performanceAnalyzer.getOldMetrics();
    const newMetrics = this.performanceAnalyzer.getCurrentMetrics();

    return {
      successRateImprovement: newMetrics.successRate - oldMetrics.successRate,
      speedImprovement: oldMetrics.avgTime - newMetrics.avgTime,
      errorReduction: oldMetrics.errorRate - newMetrics.errorRate
    };
  }

  /**
   * Trim old training data
   */
  trimTrainingData() {
    const maxSize = this.config.maxStorageSize;

    if (this.trainingData.successfulWorkflows.length > maxSize) {
      this.trainingData.successfulWorkflows = 
        this.trainingData.successfulWorkflows.slice(-maxSize);
    }

    if (this.trainingData.failedWorkflows.length > maxSize) {
      this.trainingData.failedWorkflows = 
        this.trainingData.failedWorkflows.slice(-maxSize);
    }
  }

  /**
   * Get workflow by ID
   */
  async getWorkflow(workflowId) {
    try {
      const stored = await chrome.storage.local.get([`workflow_${workflowId}`]);
      return stored[`workflow_${workflowId}`];
    } catch (error) {
      console.error('[TrainingSystem] Failed to get workflow:', error);
      return null;
    }
  }

  /**
   * Get last retrain time
   */
  getLastRetrainTime() {
    return this.trainingData.lastRetrain || 0;
  }

  /**
   * Save training checkpoint
   */
  async saveCheckpoint(metrics) {
    const checkpoint = {
      timestamp: Date.now(),
      metrics,
      patterns: this.patternLearner.getPatterns(),
      weights: this.patternLearner.getWeights()
    };

    try {
      await chrome.storage.local.set({
        trainingCheckpoint: checkpoint
      });
      this.trainingData.lastRetrain = checkpoint.timestamp;
    } catch (error) {
      console.error('[TrainingSystem] Failed to save checkpoint:', error);
    }
  }

  /**
   * Load training data
   */
  async loadTrainingData() {
    try {
      const stored = await chrome.storage.local.get(['trainingData']);
      if (stored.trainingData) {
        this.trainingData = { ...this.trainingData, ...stored.trainingData };
      }
    } catch (error) {
      console.error('[TrainingSystem] Failed to load training data:', error);
    }
  }

  /**
   * Save training data
   */
  async saveTrainingData() {
    try {
      await chrome.storage.local.set({
        trainingData: this.trainingData
      });
    } catch (error) {
      console.error('[TrainingSystem] Failed to save training data:', error);
    }
  }

  /**
   * Get data statistics
   */
  getDataStats() {
    return {
      successful: this.trainingData.successfulWorkflows.length,
      failed: this.trainingData.failedWorkflows.length,
      corrections: this.trainingData.userCorrections.length,
      avgRating: this.calculateAverageRating()
    };
  }
}

/**
 * Feedback Store
 */
class FeedbackStore {
  constructor() {
    this.feedback = [];
    this.maxSize = 1000;
  }

  async add(record) {
    this.feedback.push(record);
    if (this.feedback.length > this.maxSize) {
      this.feedback.shift();
    }
  }

  getRecentCount(hours = 24) {
    const cutoff = Date.now() - (hours * 3600000);
    return this.feedback.filter(f => f.timestamp >= cutoff).length;
  }

  getAllRatings() {
    return this.feedback.map(f => f.feedback);
  }
}

/**
 * Pattern Learner
 */
class PatternLearner {
  constructor() {
    this.patterns = new Map();
    this.weights = new Map();
    this.preventionRules = [];
  }

  async updatePatterns(patterns, feedback) {
    patterns.forEach(pattern => {
      const key = this.getPatternKey(pattern);
      const current = this.patterns.get(key) || { count: 0, weight: 0.5 };
      
      current.count++;
      current.weight = this.updateWeight(current.weight, feedback);
      
      this.patterns.set(key, current);
    });
  }

  updateWeight(currentWeight, feedback) {
    const learningRate = 0.1;
    const target = feedback >= 4 ? 1 : 0;
    return currentWeight + learningRate * (target - currentWeight);
  }

  getPatternKey(pattern) {
    return `${pattern.type}:${JSON.stringify(pattern.context)}`;
  }

  reinforcePattern(patternId, result) {
    const weight = this.weights.get(patternId) || 0.5;
    const adjustment = result === 'success' ? 0.05 : -0.05;
    this.weights.set(patternId, Math.max(0, Math.min(1, weight + adjustment)));
  }

  addPreventionRule(rule) {
    this.preventionRules.push(rule);
    // Keep only most confident rules
    this.preventionRules.sort((a, b) => b.confidence - a.confidence);
    this.preventionRules = this.preventionRules.slice(0, 100);
  }

  async train(batch) {
    // Process successful patterns
    batch.successful.forEach(item => {
      this.reinforcePattern(item.workflowId, 'success');
    });

    // Process failed patterns
    batch.failed.forEach(item => {
      this.reinforcePattern(item.workflowId, 'failure');
    });

    // Process corrections
    batch.corrections.forEach(correction => {
      correction.patterns.forEach(pattern => {
        this.updatePatterns([pattern], 2); // Low feedback for corrections
      });
    });
  }

  getPatterns() {
    return Array.from(this.patterns.entries());
  }

  getWeights() {
    return Object.fromEntries(this.weights);
  }

  getPreventionRules() {
    return this.preventionRules;
  }
}

/**
 * Performance Analyzer
 */
class PerformanceAnalyzer {
  constructor() {
    this.metrics = {
      current: { successRate: 0, avgTime: 0, errorRate: 0 },
      old: { successRate: 0, avgTime: 0, errorRate: 0 }
    };
  }

  analyze(batch) {
    const total = batch.successful.length + batch.failed.length;
    const successRate = total > 0 ? batch.successful.length / total : 0;
    
    const avgTime = batch.successful.length > 0
      ? batch.successful.reduce((sum, s) => sum + (s.executionTime || 0), 0) / batch.successful.length
      : 0;

    const errorRate = total > 0 ? batch.failed.length / total : 0;

    this.metrics.old = { ...this.metrics.current };
    this.metrics.current = { successRate, avgTime, errorRate };

    return this.metrics.current;
  }

  getCurrentMetrics() {
    return this.metrics.current;
  }

  getOldMetrics() {
    return this.metrics.old;
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TrainingSystem;
} else {
  window.TrainingSystem = TrainingSystem;
}

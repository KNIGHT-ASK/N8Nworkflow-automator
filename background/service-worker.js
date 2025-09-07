/**
 * Service Worker - Main background service orchestrating the AI engine
 * @version 1.0.0
 */

// Import core modules
importScripts('./ai-engine.js');
importScripts('./workflow-generator.js');
importScripts('./training-system.js');
importScripts('./pattern-matcher.js');

// Initialize core components
let aiEngine = null;
let workflowGenerator = null;
let trainingSystem = null;
let patternMatcher = null;

// Service state
const serviceState = {
  initialized: false,
  activeWorkflows: new Map(),
  messageQueue: [],
  performance: {
    requestsHandled: 0,
    averageResponseTime: 0,
    errors: 0
  }
};

/**
 * Initialize service worker
 */
async function initialize() {
  try {
    console.log('[ServiceWorker] Initializing...');

    // Initialize AI Engine
    aiEngine = new AIEngine();
    await aiEngine.initialize();

    // Initialize Workflow Generator
    workflowGenerator = new WorkflowGenerator(aiEngine);
    await workflowGenerator.initialize();

    // Initialize Training System
    trainingSystem = new TrainingSystem(aiEngine);
    await trainingSystem.initialize();

    // Initialize Pattern Matcher
    patternMatcher = new PatternMatcher();
    await patternMatcher.initialize();

    serviceState.initialized = true;
    console.log('[ServiceWorker] Initialization complete');

    // Process queued messages
    processMessageQueue();

    // Set up periodic tasks
    setupPeriodicTasks();

    return true;
  } catch (error) {
    console.error('[ServiceWorker] Initialization failed:', error);
    serviceState.initialized = false;
    return false;
  }
}

/**
 * Handle messages from content scripts and popup
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const startTime = Date.now();

  // Queue message if not initialized
  if (!serviceState.initialized) {
    serviceState.messageQueue.push({ request, sender, sendResponse });
    initialize();
    return true; // Keep channel open
  }

  // Route message to appropriate handler
  handleMessage(request, sender)
    .then(response => {
      // Update performance metrics
      updatePerformanceMetrics(Date.now() - startTime, true);
      sendResponse({ success: true, data: response });
    })
    .catch(error => {
      console.error('[ServiceWorker] Message handling error:', error);
      updatePerformanceMetrics(Date.now() - startTime, false);
      sendResponse({ success: false, error: error.message });
    });

  return true; // Async response
});

/**
 * Handle different message types
 */
async function handleMessage(request, sender) {
  const { type, payload } = request;

  switch (type) {
    // Workflow generation
    case 'GENERATE_WORKFLOW':
      return await handleGenerateWorkflow(payload, sender);

    // Pattern matching
    case 'MATCH_PATTERN':
      return await handlePatternMatch(payload);

    // Training feedback
    case 'PROVIDE_FEEDBACK':
      return await handleFeedback(payload);

    // Workflow execution
    case 'EXECUTE_WORKFLOW':
      return await handleExecuteWorkflow(payload, sender);

    // Configuration
    case 'UPDATE_CONFIG':
      return await handleUpdateConfig(payload);

    // API key management
    case 'SET_API_KEY':
      return await handleSetApiKey(payload);

    // Get statistics
    case 'GET_STATS':
      return await handleGetStats();

    // Clear cache
    case 'CLEAR_CACHE':
      return await handleClearCache();

    default:
      throw new Error(`Unknown message type: ${type}`);
  }
}

/**
 * Generate workflow from description
 */
async function handleGenerateWorkflow(payload, sender) {
  const { description, context = {} } = payload;

  // Add sender context
  context.tabId = sender.tab?.id;
  context.url = sender.tab?.url;
  context.frameId = sender.frameId;

  try {
    // First, try pattern matching
    const patternMatch = await patternMatcher.match(description, context);
    
    if (patternMatch.confidence > 0.85 && patternMatch.matches[0]?.pattern.workflow) {
      // Use matched pattern
      console.log('[ServiceWorker] Using pattern match for workflow generation');
      return patternMatch.matches[0].pattern.workflow;
    }

    // Generate new workflow
    const workflow = await workflowGenerator.generateFromDescription(description, context);

    // Learn pattern for future use
    await patternMatcher.learnPattern(description, workflow, context);

    // Store workflow
    await storeWorkflow(workflow);

    return workflow;
  } catch (error) {
    console.error('[ServiceWorker] Workflow generation failed:', error);
    
    // Fallback to basic workflow
    return createFallbackWorkflow(description);
  }
}

/**
 * Handle pattern matching
 */
async function handlePatternMatch(payload) {
  const { text, context = {} } = payload;
  return await patternMatcher.match(text, context);
}

/**
 * Handle user feedback
 */
async function handleFeedback(payload) {
  const { workflowId, feedback } = payload;
  
  // Record in training system
  const result = await trainingSystem.recordFeedback(workflowId, feedback);

  // Update pattern matcher if needed
  if (feedback.corrections && feedback.corrections.length > 0) {
    const workflow = await getStoredWorkflow(workflowId);
    if (workflow) {
      await patternMatcher.learnPattern(
        workflow.metadata?.originalDescription || '',
        workflow,
        { corrected: true }
      );
    }
  }

  return result;
}

/**
 * Execute workflow
 */
async function handleExecuteWorkflow(payload, sender) {
  const { workflowId, parameters = {} } = payload;

  // Get workflow
  const workflow = await getStoredWorkflow(workflowId);
  if (!workflow) {
    throw new Error(`Workflow ${workflowId} not found`);
  }

  // Create execution context
  const execution = {
    id: generateExecutionId(),
    workflowId,
    workflow,
    parameters,
    tabId: sender.tab?.id,
    startTime: Date.now(),
    status: 'running',
    currentStep: 0,
    results: [],
    errors: []
  };

  // Store active execution
  serviceState.activeWorkflows.set(execution.id, execution);

  // Execute workflow
  try {
    const result = await executeWorkflow(execution);
    
    // Record success
    await trainingSystem.recordFeedback(workflowId, {
      rating: 5,
      executionTime: Date.now() - execution.startTime,
      resourceUsage: estimateResourceUsage(execution)
    });

    return result;
  } catch (error) {
    // Record failure
    await trainingSystem.recordFeedback(workflowId, {
      rating: 1,
      errorType: error.name,
      errorMessage: error.message,
      failedStep: execution.currentStep
    });

    throw error;
  } finally {
    // Clean up
    serviceState.activeWorkflows.delete(execution.id);
  }
}

/**
 * Execute workflow steps
 */
async function executeWorkflow(execution) {
  const { workflow, parameters, tabId } = execution;
  const results = [];

  for (let i = 0; i < workflow.steps.length; i++) {
    const step = workflow.steps[i];
    execution.currentStep = i;

    try {
      // Check conditions
      if (step.conditions && !evaluateConditions(step.conditions, execution)) {
        results.push({ stepId: step.id, skipped: true });
        continue;
      }

      // Execute step
      const result = await executeStep(step, execution, tabId);
      results.push({ stepId: step.id, result });
      execution.results.push(result);

      // Handle step result
      if (step.storeAs) {
        execution[step.storeAs] = result;
      }

    } catch (error) {
      console.error(`[ServiceWorker] Step ${step.id} failed:`, error);
      
      // Handle error
      if (step.errorHandling === 'fail') {
        throw error;
      } else if (step.errorHandling === 'retry') {
        // Retry logic
        const retryResult = await retryStep(step, execution, tabId);
        results.push({ stepId: step.id, result: retryResult, retried: true });
      } else {
        // Skip and continue
        results.push({ stepId: step.id, error: error.message });
        execution.errors.push({ step: step.id, error: error.message });
      }
    }

    // Delay between steps if configured
    if (workflow.settings?.stepDelay) {
      await delay(workflow.settings.stepDelay);
    }
  }

  return {
    executionId: execution.id,
    results,
    errors: execution.errors,
    duration: Date.now() - execution.startTime
  };
}

/**
 * Execute individual step
 */
async function executeStep(step, execution, tabId) {
  const { type, action } = step;

  switch (type) {
    case 'navigate':
      return await chrome.tabs.update(tabId, { url: action.url });

    case 'click':
      return await executeInTab(tabId, 'click', action);

    case 'input':
      return await executeInTab(tabId, 'input', action);

    case 'extract':
      return await executeInTab(tabId, 'extract', action);

    case 'wait':
      return await delay(action.timeout || 1000);

    case 'api':
      return await executeApiCall(action);

    case 'transform':
      return await transformData(action, execution.results);

    case 'condition':
      return evaluateCondition(action, execution);

    case 'loop':
      return await executeLoop(action, execution, tabId);

    default:
      throw new Error(`Unknown step type: ${type}`);
  }
}

/**
 * Execute action in tab
 */
async function executeInTab(tabId, action, params) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(
      tabId,
      { type: 'EXECUTE_ACTION', action, params },
      response => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response?.error) {
          reject(new Error(response.error));
        } else {
          resolve(response?.result);
        }
      }
    );
  });
}

/**
 * Execute API call
 */
async function executeApiCall(action) {
  const { method = 'GET', url, headers = {}, body } = action;

  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  };

  if (body && method !== 'GET') {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  
  if (!response.ok) {
    throw new Error(`API call failed: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Transform data
 */
async function transformData(action, previousResults) {
  const { operation, source, params = {} } = action;
  const data = source ? previousResults[source] : previousResults[previousResults.length - 1];

  switch (operation) {
    case 'filter':
      return data.filter(item => evaluateCondition(params.condition, { item }));

    case 'map':
      return data.map(item => params.transform(item));

    case 'aggregate':
      return aggregateData(data, params);

    case 'parse':
      return JSON.parse(data);

    case 'stringify':
      return JSON.stringify(data);

    default:
      return data;
  }
}

/**
 * Handle configuration update
 */
async function handleUpdateConfig(payload) {
  const { config } = payload;

  // Update AI Engine config
  if (config.aiEngine) {
    Object.assign(aiEngine.config, config.aiEngine);
  }

  // Update Workflow Generator config
  if (config.workflowGenerator) {
    Object.assign(workflowGenerator.config, config.workflowGenerator);
  }

  // Update Training System config
  if (config.trainingSystem) {
    Object.assign(trainingSystem.config, config.trainingSystem);
  }

  // Update Pattern Matcher config
  if (config.patternMatcher) {
    Object.assign(patternMatcher.config, config.patternMatcher);
  }

  // Save to storage
  await chrome.storage.local.set({ serviceConfig: config });

  return { updated: true };
}

/**
 * Handle API key update
 */
async function handleSetApiKey(payload) {
  const { provider, key } = payload;
  aiEngine.setAPIKey(provider, key);
  return { saved: true };
}

/**
 * Get statistics
 */
async function handleGetStats() {
  return {
    service: {
      initialized: serviceState.initialized,
      activeWorkflows: serviceState.activeWorkflows.size,
      performance: serviceState.performance
    },
    aiEngine: aiEngine.getMetrics(),
    trainingSystem: trainingSystem.getDataStats(),
    patternMatcher: patternMatcher.getStatistics()
  };
}

/**
 * Clear cache
 */
async function handleClearCache() {
  aiEngine.clearCache();
  patternMatcher.clearCache();
  return { cleared: true };
}

/**
 * Process queued messages
 */
function processMessageQueue() {
  while (serviceState.messageQueue.length > 0) {
    const { request, sender, sendResponse } = serviceState.messageQueue.shift();
    
    handleMessage(request, sender)
      .then(response => sendResponse({ success: true, data: response }))
      .catch(error => sendResponse({ success: false, error: error.message }));
  }
}

/**
 * Set up periodic tasks
 */
function setupPeriodicTasks() {
  // Clean up old data every hour
  setInterval(async () => {
    await cleanupOldData();
  }, 3600000);

  // Save state every 5 minutes
  setInterval(async () => {
    await saveState();
  }, 300000);

  // Check for updates every day
  setInterval(async () => {
    await checkForUpdates();
  }, 86400000);
}

/**
 * Utility functions
 */
function generateExecutionId() {
  return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function evaluateConditions(conditions, context) {
  return conditions.every(condition => evaluateCondition(condition, context));
}

function evaluateCondition(condition, context) {
  // Simple condition evaluation
  // In production, use a proper expression evaluator
  try {
    const { left, operator, right } = condition;
    const leftValue = resolveValue(left, context);
    const rightValue = resolveValue(right, context);

    switch (operator) {
      case '==': return leftValue == rightValue;
      case '!=': return leftValue != rightValue;
      case '>': return leftValue > rightValue;
      case '<': return leftValue < rightValue;
      case '>=': return leftValue >= rightValue;
      case '<=': return leftValue <= rightValue;
      case 'contains': return String(leftValue).includes(String(rightValue));
      case 'matches': return new RegExp(rightValue).test(leftValue);
      default: return true;
    }
  } catch (error) {
    console.error('[ServiceWorker] Condition evaluation error:', error);
    return false;
  }
}

function resolveValue(value, context) {
  if (typeof value === 'string' && value.startsWith('$')) {
    const path = value.substring(1).split('.');
    let result = context;
    for (const key of path) {
      result = result[key];
      if (result === undefined) break;
    }
    return result;
  }
  return value;
}

async function retryStep(step, execution, tabId, maxRetries = 3) {
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      await delay(Math.pow(2, i) * 1000); // Exponential backoff
      return await executeStep(step, execution, tabId);
    } catch (error) {
      lastError = error;
    }
  }
  
  throw lastError;
}

async function executeLoop(action, execution, tabId) {
  const { items, steps, variable = 'item' } = action;
  const results = [];

  for (const item of items) {
    execution[variable] = item;
    
    for (const step of steps) {
      const result = await executeStep(step, execution, tabId);
      results.push(result);
    }
  }

  return results;
}

function aggregateData(data, params) {
  const { operation, field } = params;

  switch (operation) {
    case 'sum':
      return data.reduce((sum, item) => sum + (item[field] || 0), 0);
    case 'count':
      return data.length;
    case 'average':
      const sum = data.reduce((sum, item) => sum + (item[field] || 0), 0);
      return data.length > 0 ? sum / data.length : 0;
    case 'min':
      return Math.min(...data.map(item => item[field] || 0));
    case 'max':
      return Math.max(...data.map(item => item[field] || 0));
    default:
      return data;
  }
}

function estimateResourceUsage(execution) {
  return {
    memory: process.memoryUsage?.() || {},
    steps: execution.results.length,
    errors: execution.errors.length
  };
}

function createFallbackWorkflow(description) {
  return {
    id: `fallback_${Date.now()}`,
    name: 'Fallback Workflow',
    description: `Generated fallback for: ${description}`,
    steps: [
      {
        id: 'step_1',
        type: 'alert',
        action: { 
          message: 'Workflow generation failed. Please try again with more details.' 
        }
      }
    ],
    metadata: {
      isFallback: true,
      originalDescription: description
    }
  };
}

async function storeWorkflow(workflow) {
  try {
    await chrome.storage.local.set({
      [`workflow_${workflow.id}`]: workflow
    });
  } catch (error) {
    console.error('[ServiceWorker] Failed to store workflow:', error);
  }
}

async function getStoredWorkflow(workflowId) {
  try {
    const result = await chrome.storage.local.get([`workflow_${workflowId}`]);
    return result[`workflow_${workflowId}`];
  } catch (error) {
    console.error('[ServiceWorker] Failed to get workflow:', error);
    return null;
  }
}

function updatePerformanceMetrics(responseTime, success) {
  const metrics = serviceState.performance;
  
  metrics.requestsHandled++;
  
  if (!success) {
    metrics.errors++;
  }
  
  // Update average response time
  const oldAvg = metrics.averageResponseTime;
  const count = metrics.requestsHandled;
  metrics.averageResponseTime = (oldAvg * (count - 1) + responseTime) / count;
}

async function cleanupOldData() {
  try {
    const storage = await chrome.storage.local.get(null);
    const keys = Object.keys(storage);
    const oneWeekAgo = Date.now() - 7 * 24 * 3600000;
    
    const keysToRemove = keys.filter(key => {
      if (key.startsWith('workflow_') || key.startsWith('exec_')) {
        const item = storage[key];
        return item.metadata?.createdAt && 
               new Date(item.metadata.createdAt).getTime() < oneWeekAgo;
      }
      return false;
    });

    if (keysToRemove.length > 0) {
      await chrome.storage.local.remove(keysToRemove);
      console.log(`[ServiceWorker] Cleaned up ${keysToRemove.length} old items`);
    }
  } catch (error) {
    console.error('[ServiceWorker] Cleanup failed:', error);
  }
}

async function saveState() {
  try {
    await chrome.storage.local.set({
      serviceState: {
        performance: serviceState.performance,
        lastSave: Date.now()
      }
    });
  } catch (error) {
    console.error('[ServiceWorker] Failed to save state:', error);
  }
}

async function checkForUpdates() {
  // Check for extension updates
  // Implementation depends on deployment method
  console.log('[ServiceWorker] Checking for updates...');
}

// Initialize on installation
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[ServiceWorker] Extension installed/updated:', details.reason);
  await initialize();
});

// Initialize on startup
chrome.runtime.onStartup.addListener(async () => {
  console.log('[ServiceWorker] Browser started');
  await initialize();
});

// Initialize immediately
initialize();

/**
 * Workflow Generator - Intelligent workflow creation from natural language
 * @version 1.0.0
 */

class WorkflowGenerator {
  constructor(aiEngine) {
    this.aiEngine = aiEngine;
    this.templates = new WorkflowTemplates();
    this.validator = new WorkflowValidator();
    this.config = {
      maxSteps: 50,
      maxDepth: 10
    };
    this.generationHistory = [];
    this.initialize();
  }

  async initialize() {
    await this.loadUserTemplates();
    console.log('[WorkflowGenerator] Initialized');
  }

  async generateFromDescription(description, context = {}) {
    try {
      const analysis = await this.analyzeDescription(description);
      const template = this.templates.findBestMatch(analysis);
      
      let workflow = template 
        ? await this.generateFromTemplate(template, analysis)
        : await this.generateFromScratch(analysis);
      
      workflow = this.enhanceWithContext(workflow, context);
      workflow = await this.validateAndOptimize(workflow);
      workflow = this.addMetadata(workflow, description);
      
      this.saveToHistory(workflow);
      return workflow;
    } catch (error) {
      console.error('[WorkflowGenerator] Generation failed:', error);
      throw new Error('Failed to generate workflow');
    }
  }

  async analyzeDescription(description) {
    const analysis = {
      intent: this.detectIntent(description),
      entities: await this.extractEntities(description),
      actions: this.extractActions(description),
      conditions: this.extractConditions(description),
      triggers: this.extractTriggers(description)
    };

    if (this.needsAIAnalysis(analysis)) {
      analysis.aiInsights = await this.aiEngine.extractPatterns(description);
    }

    return analysis;
  }

  detectIntent(description) {
    const intents = {
      'data_extraction': /extract|scrape|collect|gather|fetch/i,
      'automation': /automate|automatic|schedule|repeat/i,
      'transformation': /convert|transform|modify|change|format/i,
      'integration': /connect|integrate|sync|api|webhook/i,
      'monitoring': /monitor|watch|track|alert|notify/i
    };

    const detected = [];
    for (const [intent, pattern] of Object.entries(intents)) {
      if (pattern.test(description)) detected.push(intent);
    }
    return detected.length > 0 ? detected : ['general'];
  }

  async extractEntities(description) {
    return {
      urls: description.match(/https?:\/\/[^\s]+/g) || [],
      selectors: this.extractSelectors(description),
      variables: this.extractVariables(description),
      timeExpressions: this.extractTimeExpressions(description)
    };
  }

  extractSelectors(text) {
    const patterns = [/[#.][a-zA-Z][\w-]*/g, /\[[\w-]+(?:=[^\]]+)?\]/g];
    const selectors = [];
    patterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) selectors.push(...matches);
    });
    return selectors;
  }

  extractVariables(text) {
    const varPattern = /\{\{([^}]+)\}\}|\$([a-zA-Z_]\w*)/g;
    const matches = text.matchAll(varPattern);
    return Array.from(matches).map(m => m[1] || m[2]);
  }

  extractTimeExpressions(text) {
    const expressions = {};
    const patterns = {
      'interval': /every\s+(\d+)\s*(second|minute|hour|day)/i,
      'schedule': /at\s+(\d{1,2}:\d{2})/i
    };
    
    for (const [type, pattern] of Object.entries(patterns)) {
      const match = text.match(pattern);
      if (match) expressions[type] = match[0];
    }
    return expressions;
  }

  extractActions(description) {
    const actionMap = {
      'click': ['click', 'press', 'tap'],
      'input': ['type', 'enter', 'fill'],
      'navigate': ['go to', 'open', 'visit'],
      'extract': ['extract', 'scrape', 'collect'],
      'api': ['api', 'request', 'fetch']
    };

    const actions = [];
    const lower = description.toLowerCase();
    
    for (const [action, keywords] of Object.entries(actionMap)) {
      if (keywords.some(kw => lower.includes(kw))) {
        actions.push(action);
      }
    }
    return actions;
  }

  extractConditions(description) {
    const conditions = [];
    const patterns = [
      /if\s+(.+?)(?:then|,|\.|$)/gi,
      /when\s+(.+?)(?:then|,|\.|$)/gi
    ];

    patterns.forEach(pattern => {
      const matches = description.matchAll(pattern);
      for (const match of matches) {
        conditions.push({
          type: match[0].split(' ')[0].toLowerCase(),
          condition: match[1].trim()
        });
      }
    });
    return conditions;
  }

  extractTriggers(description) {
    const triggerTypes = {
      'pageLoad': /on page load/i,
      'schedule': /every .+ (second|minute|hour)/i,
      'manual': /on demand|manually/i
    };

    const triggers = [];
    for (const [type, pattern] of Object.entries(triggerTypes)) {
      if (pattern.test(description)) {
        triggers.push({ type, expression: description.match(pattern)[0] });
      }
    }
    return triggers.length > 0 ? triggers : [{ type: 'manual' }];
  }

  needsAIAnalysis(analysis) {
    return analysis.actions.length > 3 || analysis.conditions.length > 1;
  }

  async generateFromTemplate(template, analysis) {
    const workflow = JSON.parse(JSON.stringify(template));
    workflow.name = this.generateWorkflowName(analysis);
    workflow.triggers = analysis.triggers;
    workflow.variables = {};
    
    analysis.entities.variables.forEach(v => {
      workflow.variables[v] = { type: 'string', defaultValue: '' };
    });
    
    return workflow;
  }

  async generateFromScratch(analysis) {
    const prompt = `Create workflow: Intent: ${analysis.intent.join(', ')}, Actions: ${analysis.actions.join(', ')}`;
    const aiWorkflow = await this.aiEngine.generateWorkflow(prompt);
    return this.ensureWorkflowStructure(aiWorkflow);
  }

  ensureWorkflowStructure(workflow) {
    return {
      id: `wf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: workflow.name || 'Untitled Workflow',
      description: workflow.description || '',
      version: '1.0.0',
      steps: (workflow.steps || []).map((step, i) => ({
        id: step.id || `step_${i + 1}`,
        name: step.name || `Step ${i + 1}`,
        type: step.type || 'action',
        action: step.action || {},
        ...step
      })),
      triggers: workflow.triggers || [],
      variables: workflow.variables || {},
      errorHandling: workflow.errorHandling || {
        strategy: 'retry_then_fail',
        maxRetries: 3,
        retryDelay: 1000
      },
      settings: workflow.settings || {
        timeout: 30000,
        logging: 'info'
      }
    };
  }

  enhanceWithContext(workflow, context) {
    if (context.currentUrl) {
      workflow.context = { startUrl: context.currentUrl };
    }
    if (context.userPreferences) {
      workflow.settings = { ...workflow.settings, ...context.userPreferences };
    }
    return workflow;
  }

  async validateAndOptimize(workflow) {
    const validation = this.validator.validate(workflow);
    if (!validation.isValid) {
      workflow = this.fixValidationIssues(workflow, validation.issues);
    }
    return workflow;
  }

  fixValidationIssues(workflow, issues) {
    issues.forEach(issue => {
      if (issue.type === 'missing_field') {
        workflow[issue.field] = this.getDefaultValue(issue.field);
      }
    });
    return workflow;
  }

  getDefaultValue(field) {
    const defaults = {
      name: 'Untitled Workflow',
      description: '',
      steps: [],
      triggers: [],
      variables: {}
    };
    return defaults[field] || null;
  }

  addMetadata(workflow, originalDescription) {
    workflow.metadata = {
      createdAt: new Date().toISOString(),
      createdBy: 'WorkflowGenerator',
      originalDescription,
      version: '1.0.0',
      complexity: this.calculateComplexity(workflow)
    };
    return workflow;
  }

  calculateComplexity(workflow) {
    const score = workflow.steps.length + (workflow.conditions?.length || 0) * 2;
    if (score <= 5) return 'simple';
    if (score <= 15) return 'moderate';
    return 'complex';
  }

  generateWorkflowName(analysis) {
    const action = analysis.actions[0] || 'Process';
    const intent = analysis.intent[0] || 'Data';
    return `${action.charAt(0).toUpperCase() + action.slice(1)} ${intent.charAt(0).toUpperCase() + intent.slice(1)} Workflow`;
  }

  saveToHistory(workflow) {
    this.generationHistory.push({ workflow, timestamp: Date.now() });
    if (this.generationHistory.length > 50) {
      this.generationHistory.shift();
    }
    this.persistHistory();
  }

  async persistHistory() {
    try {
      await chrome.storage.local.set({
        workflowHistory: this.generationHistory.slice(-20)
      });
    } catch (error) {
      console.error('[WorkflowGenerator] Failed to persist history:', error);
    }
  }

  async loadUserTemplates() {
    try {
      const stored = await chrome.storage.local.get(['workflowTemplates']);
      if (stored.workflowTemplates) {
        this.templates.addMultiple(stored.workflowTemplates);
      }
    } catch (error) {
      console.error('[WorkflowGenerator] Failed to load templates:', error);
    }
  }
}

class WorkflowTemplates {
  constructor() {
    this.templates = new Map();
    this.loadBuiltInTemplates();
  }

  loadBuiltInTemplates() {
    const builtIn = [
      {
        id: 'web_scraping',
        name: 'Web Scraping',
        steps: [
          { type: 'navigate', action: { url: '{{url}}' } },
          { type: 'wait', action: { selector: '{{selector}}' } },
          { type: 'extract', action: { selector: '{{selector}}' } }
        ]
      },
      {
        id: 'form_automation',
        name: 'Form Automation',
        steps: [
          { type: 'navigate', action: { url: '{{url}}' } },
          { type: 'input', action: { selector: '{{field}}', value: '{{value}}' } },
          { type: 'click', action: { selector: '{{submit}}' } }
        ]
      },
      {
        id: 'api_integration',
        name: 'API Integration',
        steps: [
          { type: 'api', action: { method: 'GET', url: '{{endpoint}}' } },
          { type: 'transform', action: { operation: 'parse' } },
          { type: 'store', action: { destination: 'variable' } }
        ]
      }
    ];

    builtIn.forEach(t => this.templates.set(t.id, t));
  }

  findBestMatch(analysis) {
    let bestMatch = null;
    let bestScore = 0;

    for (const template of this.templates.values()) {
      const score = this.calculateMatchScore(template, analysis);
      if (score > bestScore && score > 0.5) {
        bestScore = score;
        bestMatch = template;
      }
    }
    return bestMatch;
  }

  calculateMatchScore(template, analysis) {
    let score = 0;
    if (analysis.intent.some(i => template.name.toLowerCase().includes(i))) {
      score += 0.5;
    }
    const templateActions = template.steps.map(s => s.type);
    const matching = analysis.actions.filter(a => templateActions.includes(a));
    if (matching.length > 0) {
      score += matching.length / analysis.actions.length * 0.5;
    }
    return score;
  }

  addMultiple(templates) {
    templates.forEach(t => this.templates.set(t.id, t));
  }

  count() {
    return this.templates.size;
  }
}

class WorkflowValidator {
  validate(workflow) {
    const issues = [];

    if (!workflow.name) {
      issues.push({ type: 'missing_field', field: 'name' });
    }
    if (!workflow.steps || workflow.steps.length === 0) {
      issues.push({ type: 'missing_field', field: 'steps' });
    }

    workflow.steps?.forEach((step, i) => {
      if (!step.id) {
        issues.push({ type: 'invalid_step', stepId: i });
      }
    });

    return { isValid: issues.length === 0, issues };
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WorkflowGenerator;
} else {
  window.WorkflowGenerator = WorkflowGenerator;
}

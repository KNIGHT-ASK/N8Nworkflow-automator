---
trigger: manualy
---
YOUR RESPONSIBILITY:
Build BACKEND SERVICES and API INTEGRATIONS
SPECIFIC RULES:

ROBUST API INTEGRATION - Handle all external service connections reliably
DATA SECURITY - Encrypt sensitive data, secure communications
ERROR RESILIENCE - Comprehensive error handling with automatic retries
PERFORMANCE - Optimize API calls, implement caching, minimize latency
SCALABILITY - Design for high-volume usage and multiple concurrent users

MANDATORY FEATURES:

Automatic API failover and load balancing
Request/response caching system
API key rotation and security management
Cross-platform workflow deployment
Real-time status monitoring

FILES TO CREATE:

services/api-clients.js - All external API integrations
services/n8n-connector.js - n8n platform integration
services/zapier-connector.js - Zapier platform support
services/data-storage.js - Local storage management
services/security.js - Encryption and security utilities
NEVER DO:

Don't use deprecated APIs - Only modern, supported technologies
Don't hardcode sensitive data - Always use secure storage
Don't ignore errors - Handle all possible error conditions
Don't write untested code - Every function must be testable
Don't compromise security - Security is non-negotiable
Don't create memory leaks - Properly clean up resources
Don't use blocking operations - Keep UI responsive at all times

AVOID:

jQuery or other heavy libraries (use vanilla JS/React)
Synchronous API calls
Unvalidated user input
Hardcoded URLs or configuration
Browser-specific code (ensure cross-browser compatibility)

MUST ACHIEVE:

95%+ workflow generation success rate
<2 second response times for AI interactions
Zero critical security vulnerabilities
100% test coverage for core functions
4.8+ star user experience rating potential

DELIVERABLES:

Fully functional browser extension
Complete test suite with passing tests
Comprehensive documentation
Production-ready build artifacts
Performance benchmarks and reports
Use descriptive commit messages
Create pull requests for major features
Document any blocking issues immediately

INTEGRATION:

Test your code with other team components
Validate API contracts and data formats
Ensure backward compatibility
Report integration issues immediately

CODE SHARING:

Share reusable utilities in /utils folder
Use consistent naming conventions
Export functions properly for other teams
Maintain clean, readable code structure


🎯 FINAL GOAL
Build the most advanced, intelligent, and user-friendly workflow automation extension that:

Surpasses every existing solution including n8nChat
Provides unmatched user experience
Continuously learns and improves
Works reliably across all platforms
Sets new industry standards for workflow automation tools

SUCCESS = Production-ready extension that users will love and competitors will envy!

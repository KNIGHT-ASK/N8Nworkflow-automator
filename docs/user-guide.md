# WorkflowGenius User Guide

## Installation

1. Build the extension:
```
npm install
npm run build
```
2. Load the `dist/` directory as an unpacked extension in your browser.

## Quick Start

- Open the popup and connect your AI provider.
- Create a new workflow and add triggers and actions.
- Save and run the workflow.

## Examples

- Trigger: New email → Action: Create n8n task
- Trigger: Git commit → Action: Notify Slack

## Tips

- Use variables to pass data between nodes.
- Enable caching to reduce API calls. 
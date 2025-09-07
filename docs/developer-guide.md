# WorkflowGenius Developer Guide

## Architecture

- Background: service worker orchestrates workflows
- Content: captures page context and events
- Popup/Sidebar: React UI for configuration
- Services: API clients, storage, utils

## Development Setup

```
npm install
npm run dev
```

## Testing

- Unit: `npm run test:unit`
- Integration: `npm run test:integration`
- E2E (optional): `npm run test:e2e`

## Build

- Production: `npm run build:prod`

## Coding Standards

- No blocking operations
- Handle all errors with meaningful messages
- Avoid deprecated APIs and hardcoded secrets 
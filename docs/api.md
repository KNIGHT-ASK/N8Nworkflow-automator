# Developer API

## Services

- `services/apiClient` — REST calls (retry, timeout)
- `services/storage` — local persistence
- `services/workflows` — workflow engine

## Events

- `workflow:run`, `workflow:completed`, `workflow:error`

## Extension Messaging

- `chrome.runtime.sendMessage({ type, payload })` 
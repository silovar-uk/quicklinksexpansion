// Quick Project Links service-worker composition.
// Core app stays independent; shared deterministic helpers load before Log Relay.
importScripts('app-contract.js', 'side-panel-presence-background.js', 'shortcut-registry.js', 'log-relay-core.js', 'background.js', 'search-auto-clear-background.js', 'log-relay-background.js', 'log-relay-toggle-background.js');

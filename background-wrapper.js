// Quick Project Links service-worker composition.
// Core app stays independent; shared deterministic helpers load before Log Relay.
importScripts('shortcut-registry.js', 'log-relay-core.js', 'background.js', 'log-relay-background.js');

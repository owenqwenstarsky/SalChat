# Sal Chat

Sal Chat is a local-first Expo assistant harness for OpenAI-compatible and local model servers. Providers, accounts, models, capabilities, limits, icons, and request overrides are all configured in the app; API keys stay in the platform secure store and are never included in backups.

## Run it

Requirements: Node.js, npm, and the Expo development environment for your target platform.

This project targets **Expo SDK 54** so it opens in the App Store / Play Store Expo Go app (iOS client version `1017756`). Newer Expo Go builds from TestFlight or `eas go` will not load it.

```sh
npm install
npm start
```

Use `npm run ios`, `npm run android`, or scan the Expo QR code. They should install Expo Go from the store (not a newer temp/TestFlight client), then scan the QR code. Local HTTP providers such as Ollama and llama.cpp require a development/native build with the included network permissions; the phone and server must be able to reach each other, and the provider URL must use the server's LAN address rather than `localhost`.

## Provider modes

- OpenAI Chat Completions (`/v1/chat/completions`)
- Ollama native (`/api/chat`, `/api/tags`, and `/api/show`)
- Ollama Chat Completions (OpenAI-compatible chat plus native model discovery)
- llama.cpp (OpenAI-compatible chat with llama.cpp media extensions)
- LiteLLM proxy (OpenAI-compatible chat plus `/v1/model/info` discovery; default port `4000`; virtual or master keys)

Every provider can hold multiple named accounts. The selected account is stored per conversation, while the last account that completed a request successfully becomes that provider's default.

## Model configuration

Discovery is optional. Every detected field can be manually overridden, and entirely custom models can be created without metadata. Configuration covers input modalities, streaming and reasoning support, MIME types, attachment limits, URL/data-URI behavior, context and output limits, generation defaults, raw request JSON, display icons, emojis, and notes. Manual values always take precedence over detected values and protected request fields cannot be replaced by raw overrides.

## Data and security

- SQLite stores providers, model metadata, conversations, and message history.
- SecureStore holds API keys and sensitive headers separately.
- Attachments are content-addressed with SHA-256 and deduplicated.
- Backups contain configuration, history, media, and uploaded icons, but no credentials.
- Diagnostics redact tokens, authorization headers, and common secret-shaped values.

Sal Chat calls providers directly. Treat cleartext HTTP as a local-network development feature; prefer HTTPS for remote services.

## Verification

```sh
npm run verify
```

This runs strict TypeScript checking, Expo lint, 90 unit/integration tests, and enforced coverage thresholds. Native and web bundles can be checked with `npx expo export --platform ios --platform android` and `npx expo export --platform web`.

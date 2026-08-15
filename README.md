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

## Deploy the web app

The web build is configured as a client-rendered Expo Router app. Both deployment targets add the cross-origin isolation headers required by Expo SQLite's WebAssembly worker and send deep links back through `index.html`.

### Netlify

The included `netlify.toml` builds and publishes `dist`.

```sh
npm run build:web
npm run preview:web
npx netlify deploy --prod
```

In the Netlify UI, importing this repository requires no custom build settings. For another static host, publish `dist`, rewrite unknown routes to `/index.html`, and serve every route with `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`.

### Railway

The included `Dockerfile` builds the Expo web export and serves it with Caddy. `railway.json` configures Railway's deployment health check at `/health`; Caddy listens on Railway's injected `PORT` automatically.

1. In Railway, create a project and choose **Deploy from GitHub repo**.
2. Select this repository. Railway detects the root `Dockerfile`; no build or start command is needed.
3. After the first deployment, open **Settings → Networking → Generate Domain**.

No Railway variables are required for the web app itself.

Web data remains local to the browser. API keys and custom authentication headers are kept in `sessionStorage`, survive reloads in the same tab, and are cleared when that tab session ends; they are never included in backups. File attachments are stored in the browser's local SQLite database. Provider endpoints must allow browser CORS requests from the deployed origin, and HTTPS pages can only call endpoints permitted by the browser's mixed-content and private-network rules.

## Provider modes

- OpenAI Chat Completions (`/v1/chat/completions`)
- Ollama native (`/api/chat`, `/api/tags`, and `/api/show`)
- Ollama Chat Completions (OpenAI-compatible chat plus native model discovery)
- llama.cpp (OpenAI-compatible chat with llama.cpp media extensions)
- LiteLLM proxy (OpenAI-compatible chat plus `/v1/model/info` discovery; default port `4000`; virtual or master keys)

Every provider can hold multiple named accounts. The selected account is stored per conversation, while the last account that completed a request successfully becomes that provider's default.

## Model configuration

Discovery is optional. Every detected field can be manually overridden, and entirely custom models can be created without metadata. Configuration covers input modalities, streaming and reasoning support, MIME types, attachment limits, URL/data-URI behavior, context and output limits, generation defaults, raw request JSON, display icons, emojis, and notes. Manual values always take precedence over detected values and protected request fields cannot be replaced by raw overrides.

## Conversation context

Each chat has layered, inspectable context: a user-editable durable note, exact pinned messages, a rolling model-generated checkpoint, and recent verbatim turns. Automatic mode compacts older unpinned history near 75% of a known model context window; models with unknown limits recover reactively if the provider reports an overflow. Manual compact and rebuild controls are available per chat, and the global default can be changed in Settings.

Compaction uses the chat's selected provider, model, and account as a separate request. It only changes the request context: the full transcript remains stored locally and visible. Switching models reuses the current checkpoint, while its provenance remains inspectable.

## Data and security

- SQLite stores providers, model metadata, conversations, and message history.
- SecureStore holds API keys and sensitive headers separately.
- Attachments are content-addressed with SHA-256 and deduplicated.
- Version 2 backups contain configuration, layered conversation context, history, media, and uploaded icons, but no credentials. Version 1 archives remain importable with safe context defaults.
- Diagnostics redact tokens, authorization headers, and common secret-shaped values.

Sal Chat calls providers directly. Treat cleartext HTTP as a local-network development feature; prefer HTTPS for remote services.

## Verification

```sh
npm run verify
```

This runs strict TypeScript checking, Expo lint, unit/integration tests, and enforced coverage thresholds. Native and web bundles can be checked with `npx expo export --platform ios --platform android` and `npx expo export --platform web`.

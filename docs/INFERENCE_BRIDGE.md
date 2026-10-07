# Shared inference bridge

AppWeaver hosts explicitly registered inference endpoints under `/v1`. Core owns HTTP authentication and one shared client-facing Bearer key. Run `/bot inference-key` to generate or rotate that key and display a separate settings section for each registered bridge. Rotation invalidates the previous key for every bridge.

The default origin is `http://127.0.0.1:5551`; `BOT_WEB_HOST` and `BOT_WEB_PORT` configure the local server. Key output lists the local connection address, not a reverse-proxy public address.

## Registered bridges

| Bridge | Settings URL | Endpoints |
| --- | --- | --- |
| LLM | `http://127.0.0.1:5551/v1` | `GET /v1/models`, `POST /v1/chat/completions` |
| System One, when installed | `http://127.0.0.1:5551/v1/systemone` | `POST /v1/systemone` |

Use `Authorization: Bearer <bot-inference-key>` for both bridges. `/bot inference-key` repeats the same key in each settings section and separates sections with a blank line. System One's settings URL is the complete decision endpoint, not an OpenAI-compatible chat base URL.

LLM inference retains the active model-source catalog, request-scoped model selection, and streaming/non-streaming chat completions.

System One accepts the existing `system-one:v1` request shape:

```json
{
  "model": null,
  "state": { "text": "A new Nostr relay is available." },
  "questions": {
    "topic": {
      "type": "choice",
      "instructions": "Choose the central topic.",
      "criteria": { "nostr": null, "other": null }
    }
  }
}
```

`model` is optional for HTTP requests: omission or `null` inherits the configured provider model; a nonempty string overrides it. The bridge normalizes omission to explicit null for the internal decision contract. `state` must be an object and `questions` must contain at least one typed choice/score question. Malformed requests report the failing field paths. OpenAI-style `messages` alone are not a System One decision request. The response is the validated `{ "model": "...", "answers": { ... } }` decision result. System One requires a separate upstream key configured through `/systemone settings`; that credential remains NIP-44 encrypted in the plugin database and is never the bridge key.

## Endpoint contract

Choice-question criteria map candidate keys to JSON values: strings, null, structured objects, arrays, numbers, or booleans. For example, `"criteria": { "1": { "element": "[1] More information" } }` is accepted and forwarded unchanged. Answer choices and probability keys are still validated against the offered candidate keys. Score-question criteria remain nonempty arrays of strings.

`src/capabilities/inference-endpoint.v1.ts` defines `inference-endpoint:v1`:

- `list` returns a bridge title, `/v1` base path, and endpoint descriptors containing ID, HTTP method, full path, description, and maximum body size.
- `handle` receives the advertised endpoint ID and a bounded native `Request`, returning a native `Response`. These are in-process objects so abort signals and streaming bodies retain their behavior; this operation is not a JSON RPC interface.

Core and plugins use the same capability registry. The bridge discovers all providers explicitly, checks endpoint IDs and method/path collisions, and invokes the exact owning provider. Duplicate registrations fail discovery rather than shadowing another route. Endpoints must be within their advertised base path. Internal capabilities are not automatically exported.

The bridge verifies the shared key before discovery or inference, removes Authorization and Cookie headers before handing the request to a provider, bounds incoming bodies while reading (including bodies without Content-Length), and applies `Cache-Control: no-store` to responses. Providers own request/result validation and endpoint-specific inference behavior. The descriptor's maximum cannot exceed 2 MiB; core chat requests use 2 MiB and System One uses 256 KiB.

Unknown routes return 404, unsupported methods return 405 with Allow, invalid credentials return 401, and oversized bodies return 413. System One returns 400 for malformed requests, 503 when unconfigured/unavailable, and 502 for failed upstream evaluation. Its existing 30-second provider deadline remains in force; cancellation discards a late result but does not yet propagate through the decision capability to upstream fetches.

## Implementation map

- `src/inference/core-provider.ts`: core endpoint registration in bot and CLI startup.
- `src/inference/endpoints.ts`: shared discovery, collision validation, and JSON/error responses.
- `src/web/inference-routes.ts`: shared HTTP authentication, bounded body reading, and dispatch.
- `src/web/core-inference.ts`: existing LLM inference implementation and endpoint provider.
- `plugins/systemone/inference.ts`: thin decision endpoint adapter around `system-one:v1`.

Changes require a bot restart. Live authenticated inference still needs user verification; static and in-memory checks do not make upstream requests.

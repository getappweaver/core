# Routstr Provider Index

## Goal

Routstr is not a single provider endpoint. It is a marketplace of providers announced through Nostr. AppWeaver should discover Routstr providers, index their model catalogs and prices, and let the user choose a model and provider based on price and other provider metadata.

The first implementation phase builds the persisted model/provider index. Later phases should make model and provider selection usable from the web UI and route requests through the selected provider.

## Protocol Inputs

Provider discovery follows Routstr RIP-02:

- Provider announcements are Nostr kind `38421`.
- Provider endpoints are read from `u` tags.
- Provider identity is deduped by replaceable-event key `pubkey:d`.
- Supported mints are read from `mint` tags.

Discovery currently uses these hard-coded relays:

- `wss://relay.routstr.com`
- `wss://nos.lol`
- `wss://relay.primal.net`

Routing and ranking should eventually follow RIP-06. The first phase does not implement scoring; it only creates the data index needed for scoring and selection.

## Implemented So Far

### Routstr Command Surface

- Added `/routstr` as the first-class command root for Routstr operations.
- Kept `/ai provider` focused on selecting `local` or `routstr`.
- Moved Routstr usage/help text to `/routstr ...` commands.
- Added `/routstr status` as the main Routstr status surface.

### Status Widget

`/routstr status` now shows:

- Current provider.
- Session key presence.
- Routstr session balance when available.
- Default request budget.
- Configured Routstr model.
- Wallet availability and total sats.
- Wallet mints and default mint.

In the web UI it also provides:

- Deposit amount input.
- Mint selector for wallet mints.
- Deposit action using `/routstr deposit <sats> --mint <url>`.
- Refund action using `/routstr refund`.
- In-place status refresh after deposit/refund actions.

The composer provider menu now shows a `Routstr status` shortcut only when the current provider is `routstr`.

### Deposits And Refunds

- `/routstr deposit` accepts `--mint <url>` so deposits can come from any wallet mint, not only the default mint.
- Refund now derives the mint from the returned Cashu token and restores funds to that mint.
- Auto-flow refund was updated to stop assuming the default mint.

### Persisted Provider/Model Index

The old model cache was a single JSON blob fetched from `https://api.routstr.com/v1/models`. The first-phase index replaces the command read path with normalized SQLite tables:

- `routstr_providers`
- `routstr_model_providers`

`/routstr sync-models` now:

- Queries provider announcements from the hard-coded Routstr relays.
- Dedupes announcements by `pubkey:d`, keeping the newest event.
- Fetches each provider's `/v1/models` endpoint.
- Stores model/provider rows with endpoint, provider key, provider pubkey, model id, model name, context length, normalized price fields, raw price JSON, raw model JSON, and `fetched_at_ms`.
- Records fetch failures per provider.
- Uses a one-hour freshness window before returning the cached index as fresh.

`/routstr models` now:

- Lists unique model IDs from the index.
- Shows provider count per model.
- Shows cheapest parseable input/output/request prices when present.
- Shows the model index fetch timestamp.

`/routstr models <exact-model-id>` now:

- Lists providers for that model.
- Shows endpoint, provider identifier, input/output/request prices, context length, and model name when available.

`/routstr add-model <model-id>` now reads model metadata from the indexed provider/model rows instead of the old single-provider cache.

## Current Limitations

- Sync can take a long time because provider model fetches happen across all discovered providers and some endpoints are slow or unavailable.
- Sync progress is not visible to the user yet.
- The web model list is not yet a searchable/selectable control like `web/src/components/OpenCodeModelField.tsx`.
- Selecting a model does not yet populate a provider dropdown with price comparisons.
- Provider selection is not yet persisted as part of the Routstr run configuration.
- Model descriptions may differ per provider, and there is not yet a policy for which description to display.
- Tor/onion provider URLs currently fail in the normal fetch path and need investigation.
- Price parsing is intentionally tolerant and incomplete. Raw price/model JSON is stored so normalization can be improved later.
- RIP-06 scoring, trust, latency, recommendations, and failover are not implemented yet.

## Next Work

### Sync Progress

Add progress feedback for `/routstr sync-models`.

Possible approaches:

- Stream progress over the web action flow.
- Return an initial progress widget and update it as providers complete.
- Persist sync job state in SQLite and poll from the widget.

The user should see at least:

- Providers discovered.
- Providers fetched.
- Providers failed.
- Current provider endpoint being fetched.
- Unique models indexed so far.

### Web Model Selector

Build a web model picker similar to `web/src/components/OpenCodeModelField.tsx`.

It should:

- Search indexed model IDs.
- Show provider count and cheapest known price summary.
- Let the user select a model.

### Provider Price Selector

After selecting a model, populate a provider selector for that model.

It should show:

- Provider endpoint or display name.
- Input/output/request price.
- Supported mint compatibility.
- Last fetched timestamp.
- Fetch/error health if available.

### Model Metadata Policy

Investigate provider-specific model descriptions and decide how to display them.

Possible policies:

- Show the selected provider's description only.
- Show the cheapest provider's description by default.
- Show a merged model summary plus provider-specific details.
- Hide description until a provider is selected.

### Tor Endpoint Handling

Investigate Tor/onion provider URLs.

The current normal `fetch` path cannot reach onion endpoints. Options include:

- Ignore Tor URLs for now and store them as unsupported.
- Add a Tor proxy configuration.
- Prefer clearnet `u` tags when both are present.
- Surface Tor-only providers as unavailable with a clear reason.

### Routing And Selection

After the index is usable from the UI, implement actual provider selection for runs:

- Persist selected Routstr model.
- Persist selected provider endpoint/key for that model.
- Route deposit/topup/balance/refund/run calls through the selected provider endpoint.
- Add fallback provider candidates later.

### RIP-06 Ranking

Future ranking should support:

- Model match.
- Max price filter.
- Mint compatibility.
- Lowest-price profile.
- Latency and uptime when measured.
- Recommendation and Web-of-Trust inputs when available.
- Probabilistic selection among top candidates to avoid everyone choosing the same provider.

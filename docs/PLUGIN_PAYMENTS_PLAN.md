# Plugin Payments Plan

Status: author publication and buyer installation workflows implemented;
authenticated buyer-flow verification remains pending.

## Buyer installation slice

The approved next slice adds compact price/status and an `[i]` terms modal to
`/plugins install`, identity selection, purchase recovery, and Lightning checkout
through core payments. Installed copies remain usable; updates and reinstalls
through the manager require ownership while an advertised offer is active.
Expired offers do not gate installs/updates. Upcoming offers are displayed but
do not gate before `validFrom`. Missing/malformed advertised offers block the
managed operation until resolved, rather than silently treating them as free.

Identity selection is explicit: the authenticated user or a saved bunker user.
Restoration now requires a fresh signing challenge for the buyer of a qualifying
receipt, including cached receipts. This proves authorized signing access; a
saved connection or public receipt alone is insufficient. A new purchase uses
a buyer-signed zap request with a server-generated nonce. Receipts are
queried on buyer NIP-65 read relays plus bounded catalog/hint fallbacks. Historical
offers and verified receipts are retained locally and revalidated on reuse.

The info modal explains that existing versions keep working, paid ownership
includes future versions, and skipped updates may include security fixes or
compatibility changes. It does not claim any particular release is a security
patch without evidence. There are no automatic updates. Capability alternatives
remain the user's choice; no extra payment-specific dependency messaging is added.

Revised catalog UX: active paid pricing is above **Buy & install/update**, with
`[i]` immediately to its left. Recovery is checked inside this flow rather than
included in the button label. Free apps have no `[i]`; clicking Install/Update
opens a **Free version notice** with Continue/Cancel before any Git changes.
Continuing rechecks the offer; a newly active offer routes to paid checkout.
Already-owned apps retain normal Install/Update labels; restored paid access still
requires a fresh signing proof.

Phase 2: version-to-version changelog/commit comparisons, free historical-version
reinstallation, and optional author grants/discounts for existing free users.

- [x] Implement and statically verify buyer offer/receipt discovery and gating.
- [x] Implement and statically verify identity selection and pending-aware checkout.
- [x] Implement compact pricing and the terms/info modal in text/web install output.
- [ ] User verification of paid install, paid update, restoration, and pending receipts.
- [x] User verified browser-signed Memory purchase, QR payment, and receipt
      confirmation. Installation then failed because clone dependencies were not
      installed before importing `ai.ts` during generation.
- [x] Install plugin dependencies before generation; support validated checkout
      resumption after a failed install and preserve purchase records on failure.
- [x] Add automatic QR receipt checks and dismiss the payment overlay on success;
      complete static verification.
- [ ] User verification of QR auto-confirmation and resumed Memory installation.

The installer now prepares plugin-local dependencies before generation, and
validates a clean matching leftover checkout before payment/restoration. A failed
new-install generation removes only its matching new manifest entry, retaining
the checkout and purchase records for retry. Memory dependencies were installed
locally with `--no-save`; its tracked files remained clean and its Markdown parser
import succeeds. The user's removed `plugins.json` entry was not re-added by the
agent, and no generator or restart signal was run. TypeScript and scoped lint
pass; repo-wide lint still has the two unrelated NR/Translate unused declarations.
- [x] Implement and statically verify unpublished restoration challenges: random
      server nonce, app/buyer/receipt binding, five-minute expiry, exact signed
      fields, and atomic single-use consumption. Remove cached-receipt bypasses.
- [ ] User verification of browser and bunker challenge approval, cancellation,
      expiry, replay rejection, and restoration after restart.

Signing-proof verification: targeted ESLint and TypeScript pass. A one-off
in-memory check rejected a wrong signer, accepted the matching receipt buyer,
and rejected replay after atomic consumption. No relay, wallet, or live install
calls were made. Authenticated browser/bunker verification remains pending.
- [x] Implement and statically verify revised install actions: price above Buy,
      adjacent `[i]`, simple Buy & install/update labels, and a free-version
      Continue/Cancel notice before web installation.
- [ ] User verification of the revised free notice and paid action layout.
- [x] Align Changelog with Install/Buy; show full published history newest first
      in a height-limited scrolling panel toggled by Changelog, preserving
      the focused installed-to-target update notes. Complete static verification.
- [ ] User verification of full changelog history, action alignment, scrolling,
      and dismissal. Targeted ESLint, TypeScript, and whitespace checks pass.
- [x] Remove redundant changelog close controls and restore scroll chaining to
      the outer installer; complete targeted static verification.

Buyer static verification: TypeScript and targeted ESLint pass. Repo-wide lint
still reports only the unrelated unused declarations in NR and Translate. No
live payment, installation, or authenticated browser check was run by the agent.
The backend must be restarted before user verification; the active-chat restart
signal was not touched.

## Current implementation slice

The approved first slice extends `/plugins publish <alias>` with the published
catalog, current offer, immutable offer history, and a new-offer form. Release
publication and offer publication are separate actions. Offer publication must
publish `8107` before replacing the catalog pointer; retries reuse the signed
offer rather than creating another. Release publication preserves the pointer.
Offer management remains available when the local version is already published.

Author offers use tags `a`, `type`, `price` (sats), `p` (author/recipient), `lud16`,
`nostrPubkey`, `validFrom`, and `validUntil`, with empty content. The first slice
requires the app-coordinate author to sign the offer and be its recipient.
Validity uses Unix seconds and the half-open interval `[validFrom, validUntil)`.
Cancellation is not part of this slice; existing offers retain their windows.

- [x] Implement and statically verify the author workflow and offer contract.
- [x] User verification of offer creation and advertisement in AppWeaver.
- [x] Add persistent relay publication records and local date/time pickers; verify
      the implementation statically.
- [ ] User verification of the relay display and date/time picker changes.
- [x] Implement and statically verify the approved compact publication layout:
      app header, current-offer summary, aligned history, two-column form, and
      collapsed technical/relay details.
- [ ] User verification of the compact publication layout.

Verification completed: targeted ESLint with fixes, `bunx tsc --noEmit`, and
`git diff --check`. The first catalog publication still uses the existing release
review; afterward **Manage catalog & offers** opens payment configuration. Offer
review records and signed retry records are stored in the core SQLite state
under `plugins.offer-draft.<id>`. No restart signal was written during active chat;
a bot restart is required to load the backend changes.

The manager now shows the publication relay destinations and advertised relay
hint. New offer/catalog-pointer publication attempts retain destination,
acceptance, failure, and timestamp records in core SQLite state under
`plugins.publication-relays.<event-id>`. Known accepting relays accumulate across
retries; failures describe the latest attempt. Previously published offers have
no retroactive acknowledgement record, but retain their advertised relay hint.
Validity inputs use native local date/time pickers and submit UTC ISO instants;
offer tags continue to use Unix seconds. History/review timestamps display in
the browser's timezone.

Follow-up verification: TypeScript, targeted ESLint, and `git diff --check` pass.
Repo-wide `bun run lint` reports unrelated errors in `plugins/nr`,
`plugins/translate`, and vendored PPQ JavaScript. Authenticated verification of
the relay/date-time follow-up remains pending.

Compact layout implemented: short app/author header, current price/status and
validity, aligned history rows, labelled offer review, and a responsive two-column
form. Native `details`/`summary` disclosures contain identifiers and relay records;
latest relay acceptance/failure counts summarize publication results. Successful
offer advertisement reports "Current offer updated." TypeScript and targeted
ESLint pass; repo-wide lint still reports the unrelated unused declarations in
NR and Translate. Visual verification in the authenticated UI remains pending.

## Goal and scope

Allow app authors to sell apps through Nostr zaps, with payment checked by the
AppWeaver plugin manager before installation. Distribution remains Git-based
and the software remains open source: this is a soft installation gate, not DRM
or a restriction on downloading repositories directly.

Verified purchases should be reusable after reinstallation and on another
AppWeaver instance. Recovery must not depend exclusively on the original
instance's database.

See [Plugin System](PLUGIN_SYSTEM.md) for the existing catalog event contract and
[plugin manager commands](../src/commands/plugin-manager/README.md) for the owning
module.

## Settled design

### Purchase model

- The initial payment type is `"one-time"`, leaving room for future types.
- One qualifying purchase includes all future versions of the app.
- A qualifying receipt must contain an invoice for the exact offer price; do
  not accept underpayment, overpayment, or combine multiple receipts.
- An offer's validity window limits when payment qualifies, not how long an
  already-qualified purchase remains usable.
- Authors can optionally provide a Lightning address for paid installation.
  The endpoint must support NIP-57 zaps; an ordinary Lightning address without
  zap support is insufficient for receipt-based verification.
- `/plugins install` output must display the price for paid apps.
- Reuse the existing [payment infrastructure](../src/payments/service.ts) for
  invoice payment and settlement presentation.

### Catalog and offer events

The existing author-signed catalog event is kind `32107`. Its stable app identity
is the coordinate `32107:<author-pubkey>:<package-name>`, using the `d` tag as the
package name. A replacement updates the catalog at that coordinate; it cannot
change the contents of an earlier signed event, but relays may discard earlier
replacements.

Use kind `8107` for an immutable, non-replaceable payment offer. Multiple offers
for an app are allowed. This is the kind selected for the proposed AppWeaver
protocol, not a claim that a standardized Nostr payment-offer schema exists.
The user has checked kind `8107` and found no existing use; that selection is
settled for this plan.

The `32107` catalog event points to its current offer with a relay hint:

```json
["offer", "<8107-event-id>", "<relay-url>"]
```

Each offer includes `validFrom` and `validUntil`. Payments outside that window
do not qualify. Preserve expired offers for historical verification; do not
use an event expiration mechanism that causes relays to remove them.

If the catalog's advertised offer has expired, ignore it as an installation
gate and allow installation without payment. Keeping an active offer published
is the author's responsibility. Do not substitute an older offer to force a
payment when the advertised offer is expired. This does not classify missing
or malformed offers as expired; those cases remain open.

An older offer remains redeemable within its own signed validity window even
if the catalog points to a newer offer. A qualifying historical payment remains
valid forever, regardless of the current price or offer expiry.

Encode all offer fields as tags, not JSON content. The Nostr event wire format
remains JSON, and NIP-57's embedded request in `description` still requires JSON
parsing; this decision concerns the custom `8107` offer payload. The implemented
tag contract is documented in [Plugin System](PLUGIN_SYSTEM.md#payment-offers-nostr-kind-8107).

The offer must be signed by the app coordinate's author. The initial author
workflow also requires that author as the payment recipient.

### Payment time and provider trust

Do not use the buyer-signed kind `9734` zap request's `created_at` to establish
payment time: the buyer can backdate it. A BOLT11 invoice's timestamp records
invoice creation, not payment settlement.

Use the recipient provider-signed kind `9735` receipt's `created_at` for the
offer-window check. NIP-57 says this timestamp SHOULD be the invoice's `paid_at`.
The buyer cannot alter it without invalidating the provider's signature.

Trust the author's supplied Lightning address and its authorized provider to
attest to payment and its timestamp. Rely on the receipt's signed `created_at`;
do not require separate settlement-time evidence or a provider certification
mechanism. This is proportionate to a soft gate that users can bypass through
Git, and supports the author's declared payment destination. Ordinary receipt
and purchase validation still applies. The implemented window is inclusive at
`validFrom` and exclusive at `validUntil`, in Unix seconds.

### Establishing the authorized receipt signer

For current checkout, resolve the Lightning address from the author-signed
offer through its HTTPS LNURL-pay endpoint:

```text
<username>@<domain>
    -> https://<domain>/.well-known/lnurlp/<username>
```

Require `allowsNostr: true` and a valid `nostrPubkey`. Require the receipt's
`pubkey` to match that provider key and verify its signature.

Preserve the provider's receipt-signing pubkey in the immutable, author-signed
offer so old purchases remain verifiable on a fresh instance after a provider
key rotation or Lightning address change. Current checkout should check the
endpoint against the offer's pinned key; a changed key requires a new offer.
Historical verification uses the author-authorized key in the purchased offer,
not only the key advertised by today's endpoint.

A valid provider signature alone does not establish an app purchase. Also
validate the embedded zap request signature and buyer identity, app/offer
references, recipient, invoice amount, and invoice description hash.

Normal `nostr-tools` relay ingestion verifies signatures unless verification
is bypassed. It does not perform the full purchase validation or automatically
validate the request embedded in the receipt's `description`.

## Proposed flow for review

1. Discover the app through its `32107` catalog event.
2. Resolve the current `8107` offer using its event ID and relay hint; verify
   author authority, app association, payment type, price, payment destination,
   provider key, and purchase window. If the advertised offer has expired,
   allow installation without payment.
3. Select the identity that will own the purchase and search for earlier
   qualifying receipts before requesting another payment.
4. If a purchase already exists, verify a fresh unpublished challenge signed by
   its buyer, then allow installation without paying again.
5. Otherwise resolve the offer's Lightning endpoint, verify zap support and
   provider key, and create a zap request signed by the selected buyer identity.
6. Pay the invoice through `src/payments` and fetch the provider's zap receipt.
7. Fully validate the purchase, retain the verification records, and allow
   installation through the normal plugin manager flow.

The wallet funding the invoice and the Nostr identity signing the zap request
can be different. The proposed owner is the zap request signer. Available
purchase identities must include the authenticated user and connected bunker
user identities (not the bunker's transport/signing-service pubkey).

The implemented UX explicitly selects a purchase identity before lookup/checkout,
with a route to the bunker manager if it needs to be connected. No background
signatures are requested from other bunker identities. A locally verified receipt
still requires the selected buyer to prove current signing access before restoring
paid installation/update access.

Reading public receipts for an identity does not require a buyer signature.
Making a new purchase requires that identity to sign the `9734` zap request.
Restoration uses an authenticated or connected identity and an unpublished,
five-minute, single-use challenge. A random server nonce binds app, buyer, and
receipt. Signature verification must match the buyer in the receipt's embedded
request. Freshness is based on server expiry and atomic nonce consumption, not
the signer's chosen `created_at`. Public receipt lookup needs no signature;
granting restored access does. Cached receipts are subject to the same rule.
Existing bunker connection records already retain the user's pubkey; enumerating
those identities does not itself require signing a new purchase/challenge event.

The implemented standard zap references are `a` for the stable app coordinate and
`e` for the immutable offer event ID. These allow receipt discovery without
depending on providers copying custom tags.

## Remaining decisions and phase-2 boundaries

### Offer schema and validity policy

- Decide whether to expand beyond the initial author-as-recipient contract to
  support another recipient pubkey. The author workflow currently uses the
  catalog-coordinate author for both offer signing and payment recipient.
- Decide whether authors need to cancel an offer before its signed `validUntil`.
  This is what "early withdrawal" means, not changing the catalog's pointer.
  Recommendation: omit cancellation in the first version and honor all signed
  windows. Supporting cancellation would require discovering additional events;
  relay results cannot guarantee that a cancellation event was not missed.

### Buyer identities and portability

- Transfers between different buyer pubkeys are not specified. Reusing the
  original purchasing identity across instances is the implemented first flow.

### Relays and purchase recovery

- The first flow uses buyer NIP-65 read relays plus bounded catalog, configured
  bot, and advertised-offer hint relays. Attempts retain their original relay
  destinations. Receipt queries use kind `9735`, `#a`, and `#p`; the embedded
  request identifies the buyer, so optional uppercase `P` is not required.
- Bounded pagination handles ten 500-event pages, preserving the timestamp
  boundary and reporting saturation as incomplete. Improve relay reachability
  diagnostics so empty/unavailable results are distinguished more precisely.
  "No receipt found" is not proof that no purchase exists; rechecks and identity
  changes are available before payment.
- Offer/receipt pairs are archived and revalidated locally; historical offer
  relay hints are included in zap requests. Export/import, configurable recovery
  relay hints, and automatic republishing remain future work. A fresh instance
  still depends on receipt/offer retention on reachable relays.

### Installation and payment UX

- The first UI has price/ownership badges and an `[i]` terms modal. No advertised
  offer, an upcoming offer, or an expired offer allows installation without
  payment. Missing/malformed active pointers require recovery or correction;
  provider-key mismatches stop invoice creation. Installed copies are not disabled.
- Pending invoice/receipt state is persisted. Rechecks reuse it; new payment
  after invoice/offer expiry is explicit. Web checkout uses core payments; DM/CLI
  can use cached ownership or a selected connected identity for recovery, and
  directs unpaid users to the web UI.
- Phase 2: richer changelog/commit comparisons, old free-version reinstalls, and
  optional author grants/discounts. No payment-specific capability warning is
  planned; provider alternatives remain a user choice.

## Existing implementation references

- [Catalog reader](../src/commands/plugin-manager/install/handler.ts): kind
  `32107` discovery and install catalog data.
- [Catalog publisher](../src/commands/plugin-manager/publish/handler.ts):
  author signing, catalog tags, and publication relays.
- [Payment types](../src/payments/interactive-types.ts) and
  [broker](../src/payments/service.ts): invoice creation, payment presentation,
  and settlement callbacks.
- [Roadmap zap payment](../src/commands/roadmap/payment.ts): existing zap receipt
  lookup and payment handoff. Useful as a reference, but not a complete portable
  purchase validator.

## Implementation checklist — after design review

- [x] Record first-slice event schema, authority rules, timing rules, and purchase
      qualification criteria. Future expansion decisions remain above.
- [x] Add offer publication and the catalog's current-offer pointer, including
      retrieval relay hints and endpoint/provider-key validation.
- [x] Add offer resolution and price/ownership data to the installation catalog
      and complete static verification.
- [x] Add reusable zap validation and purchase discovery, with historical signer
      support and recoverable storage of offers and receipts.
- [x] Add buyer identity selection/control verification for authentication and
      bunker connections.
- [x] Integrate checkout with `src/payments`, including receipt-pending rechecks.
- [x] Apply the soft gate to the agreed plugin manager installation paths and
      render prices/status in text and web output.
- [ ] Complete authenticated cross-instance recovery verification. Export/import
      and automatic republishing remain future work.
- [x] Document the implemented contracts in [Plugin System](PLUGIN_SYSTEM.md)
      and the owning module's documentation.
- [x] Perform static verification of the implemented first slice.
- [ ] Complete user-confirmed authenticated buyer-flow verification.

Author offer publication is implemented and statically verified. Buyer payment,
receipt qualification, and installation gating are implemented and statically
verified; live buyer verification is tracked above. No live
publication or authenticated browser verification has been performed by the
agent; the user confirmed successful offer creation and advertisement.

# Plugin manager commands

The built-in plugin manager handles installation, local creation, release status,
and publication. See the [plugin system documentation](../../../docs/PLUGIN_SYSTEM.md)
for the shared plugin architecture.

## Catalog and payment offer publication

`/plugins publish <alias>` in the web UI opens the release review and author
offer manager. It stays available when the current version is already published.
The published catalog event, app coordinate, repository, current offer, and
verified recent offer history are displayed. Publication requires a saved bunker
connection matching the catalog author. First publish the app's catalog using the
existing release flow; then use **Manage catalog & offers** to configure payments.

New offers accept an exact positive-integer price in sats, a Lightning address,
and inclusive/exclusive validity bounds selected with native local date/time
pickers. The browser submits timezone-qualified instants; signed offer tags still
store Unix seconds. History and review dates are displayed in the browser's
locale/timezone. **Review offer** resolves zap support, provider signing key, and
the endpoint's invoice amount limits. The review displays labelled payment values
and expandable provider/event fields before
**Publish offer & update catalog** signs anything. Offers are immutable: change
values by creating another offer. Existing unexpired offers can be advertised
again through the history rows; their endpoint/provider is revalidated.

The signed `8107` is stored locally before relay publication, allowing retries
of the same reviewed offer after relay/catalog failures. The catalog pointer is
updated only after at least one relay accepts the offer, using an accepting relay
as its hint. Offer changes preserve existing catalog fields and do not push Git
refs or require a new app version. Release publication preserves the offer
pointer. History lookup is bounded to 100 recent events per relay plus a direct
lookup of the advertised offer; it is not a complete archival purchase search.

The manager displays current publication destinations and the advertised relay
hint. Offer and catalog-pointer publication attempts persist their destination
relays, known accepting relays across retries, failures on the latest attempt,
and timestamp in core SQLite state under `plugins.publication-relays.<event-id>`.
These local records remain available when reopening the manager. Older offers
without a record still display their catalog relay hint where available; previous
relay acknowledgements cannot be reconstructed from the signed event alone.

The author widget uses a compact app header, current-offer summary, aligned offer
history, and a two-column form that stacks on small screens. Native disclosure
sections keep full identifiers, provider fields, and per-relay acknowledgements
out of the main flow. Relay summaries show the latest attempt's accepted/total
count and failures; accumulated accepting relays remain inside the details.

## Payment-aware installation and updates

Managed installs and updates run plugin-local `bun install --no-save` before
tool generation, preserving package manifests/lockfiles and keeping the Bun cache
under the plugin's `node_modules/`. This also applies to the CLI installer.
If a previous web install left a directory but no manifest entry, the manager
validates its repository root, package name, origin, selected release commit, and
clean working tree before offering a resumable install. It does not replace or
delete unfamiliar folders. The web manager installs dependencies before registration; if
generation fails, the newly added matching manifest entry is removed while the
checkout and any purchase receipt remain available for retry.

`/plugins install` resolves advertised offers and displays free, upcoming,
expired, active-priced, unavailable, and locally verified purchased states.
Paid pricing sits above the **Buy & install** / **Buy & update** row, with `[i]`
immediately to the left of Buy. The compact `[i]` action opens a terms modal describing ownership, update
consequences, security/compatibility considerations, and cross-instance recovery.
**Changelog** shares the Install/Buy button row and shows all release `ref` notes
published in the catalog, newest first, including versions outside the currently
compatible target. Its body scrolls beyond `min(24rem, 55vh)` and the Changelog
button toggles it open/closed. Normal scroll chaining lets scrolling continue in
the outer installer when the notes reach their edge. Installed apps with available
updates also retain a separate installed-to-target notes panel. The installer reads catalog
tags, not live Git history or `CHANGELOG.md`; publication normally generates up
to 20 commit subjects per release while preserving custom notes. Richer version
comparisons and selecting older free versions are phase 2.

Free apps have no purchase-info button. Their **Install / Update** action opens
a **Free version notice** modal explaining that this version is free, future
releases may become paid, and the installed copy remains usable. **Continue
installation / Continue update** performs the managed action; **Cancel** closes
the modal. Offer state is rechecked on continuation, so a newly active price
routes to checkout rather than being bypassed by the free confirmation. Already
purchased apps keep normal Install / Update actions without the free notice.

An active offer gates managed installation, reinstallation, and updates before
Git clone/fetch/checkout or manifest changes. Existing installed copies keep
working. Upcoming and expired offers do not gate; malformed/unavailable advertised
offers require recovery or author correction. There are no automatic updates.

**Buy & install / Buy & update** opens explicit identity selection: authenticated user or saved
bunker user. **Check purchases & continue** looks for a qualifying purchase and
requires a fresh signing challenge before continuing installation/update when
one is found. Browser users approve an unpublished challenge; selected bunker
identities sign it through NIP-46. The challenge binds a server-generated nonce
to the app, buyer, and receipt, expires after five minutes, and is consumed
atomically once verified. Its signer must match the buyer in the embedded zap
request, not the Lightning provider. Cached receipts cannot bypass this check.
No challenge is published and it does not authorize a payment.

If no qualifying receipt is found, the reviewed
buyer/app/offer zap request must be signed before creating a Lightning invoice.
The core interactive payment service asks the user to approve payment; no wallet
credentials are exposed to the installer. Non-web paid checkout directs users
to the web UI. Selected connected bunker identities can prove signing access for
non-web restoration; authenticated browser restoration requires the web signer.
New purchase requests include a server nonce and prove current signing access
when first signed. Reusing an old pending request after settlement requires a
restoration challenge, not just the old signature.

Receipt discovery queries kind `9735` by app coordinate and recipient, inspecting
the buyer's verified embedded request rather than depending on optional uppercase
`P`. Buyer NIP-65 read relays, offer/catalog hints, configured bot relays, and
bounded fallbacks are used. Historical offers are fetched by ID, including the
relay hint in the zap's `e` tag. Lookup is bounded to ten 500-event pages per
relay; saturated/incomplete results are reported rather than declaring no purchase.
Relay retention and current relay lists cannot guarantee complete recovery.

Verified receipt/offer pairs are retained in core state as
`plugins.purchase.<app-coordinate>:<buyer-pubkey>` and revalidated before reuse.
Immutable offers are cached as `plugins.payment-offer.<event-id>`. In-progress
signed requests, invoices, and original relay lists are saved as
`plugins.purchase-attempt.<id>`, with a per-app/buyer `plugins.purchase-pending`
pointer. Reopening checkout reuses the pending invoice and offers **Check receipt**;
starting another payment is explicit after invoice/offer expiry. Wallet success
alone does not unlock installation; a qualifying provider-signed receipt does.
QR/other-wallet checkout checks settlement automatically every eight seconds
while that source is visible and the invoice is live. Manual **Check payment**
remains available, including after invoice expiry for delayed receipts. Successful
confirmation closes the payment overlay before installation continues. Cancelling
payment does not automatically install an app merely because a receipt arrived
at the same time; the purchase remains recoverable later.

Unconsumed restoration challenges are retained in core state under
`plugins.purchase-challenge.<id>` so a browser response can be verified after a
restart. Expired challenges are rejected; successful verification deletes the
exact stored challenge with a compare-and-delete operation, rejecting replay.

See the [payments plan](../../../docs/PLUGIN_PAYMENTS_PLAN.md) for the contract,
remaining recovery work, and authenticated verification checklist.

## Release inspection

`/plugins releases` resolves eligible installed plugins independently using
`Promise.allSettled`. Successful inspections remain visible when another plugin
fails. Both text and web output report inspection failures with the plugin alias
and the error message; failed inspections are counted separately from plugins
hidden because their publishing author is unavailable.

Release Git inspection requires the plugin directory to be the repository root,
including linked worktrees. It rejects folders that inherit a parent repository
and reports repositories without a first commit as not ready for inspection.
These checks also apply to publication through the shared release Git inspector.

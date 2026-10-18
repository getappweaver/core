I want app authors to be able to charge for their AppWeaver apps. Since AppWeaver already uses Nostr for app discovery and Git for distribution, using zaps for payments felt like a good fit.

The first idea is simple: the author gives a Lightning address and a price, the user pays, and AppWeaver lets them install the app after fetching the zap receipt.

Of course, it's not impossible to install the app without going through our checks, since it is open-source software. The point is to make installing and updating apps easy for users while allowing authors to charge for their work.

But there are quite a few things to figure out around that. What if the price changes? What if the user already paid from another AppWeaver instance? What if the payment went through but the receipt is not available yet? And what if an app used to be free?

These are the parts I want to explain here.

## What does a purchase mean?

For now, it is a one-time payment that includes all future versions of the app. The offer has a `type` tag with the value `one-time`, so other payment models can be considered later.

The purchase belongs to a Nostr identity, not to one AppWeaver installation. If I paid for an app in one workspace, I should be able to connect the same identity in another workspace and use it there too.

## The app event and the payment offer are different things

We already publish app catalog events with kind `32107`. They contain the app name, repository, version, release notes, and other metadata.

Here is a simplified example, with placeholders for the author and offer IDs. The event ID and signature are omitted:

```json
{
  "kind": 32107,
  "pubkey": "<author-pubkey>",
  "created_at": 1791633600,
  "tags": [
    ["d", "appweaver-example-plugin"],
    ["title", "Example App"],
    ["repo", "https://example.com/author/example-app.git"],
    ["version", "v1.0.0"],
    ["coreApiVersion", "^14.0.0"],
    ["t", "appweaver-plugin"],
    ["ref", "v1.0.0", "^14.0.0", "First release"],
    ["offer", "<8107-event-id>", "wss://relay.example.com"]
  ],
  "content": "A focused app for a useful workflow."
}
```

An app has a stable coordinate:

```text
32107:<author-pubkey>:<app-name>
```

This is an addressable event. The author can publish a replacement after a new release is published through Git. The previous signed event cannot be edited, but a relay would keep only its latest replacement.

That is useful for discovering the current version. It is less useful for preserving the exact price and payment destination someone agreed to months ago.

I decided to keep payment offers in separate, non-replaceable kind `8107` events. This is the event kind chosen for AppWeaver's offer format, not an existing payment-offer NIP.

The catalog points to the advertised offer:

```json
["offer", "<8107-event-id>", "<relay-hint>"]
```

The offer contains the app coordinate, payment type, exact price in sats, recipient, Lightning address, provider receipt-signing pubkey, and `validFrom` / `validUntil` timestamps.

Here is an example offer for the app above. As with the catalog example, the keys are placeholders and the event ID and signature are omitted:

```json
{
  "kind": 8107,
  "pubkey": "<author-pubkey>",
  "created_at": 1791633600,
  "tags": [
    ["a", "32107:<author-pubkey>:appweaver-example-plugin"],
    ["type", "one-time"],
    ["price", "5000", "sat"],
    ["p", "<author-pubkey>"],
    ["lud16", "author@example.com"],
    ["nostrPubkey", "<provider-receipt-signing-pubkey>"],
    ["validFrom", "1791633600"],
    ["validUntil", "1794312000"]
  ],
  "content": ""
}
```

The offer fields are tags, so `content` is empty. The validity timestamps are Unix seconds: the start is inclusive and the end is exclusive. Both timestamps are required; because an offer is immutable and non-replaceable, an offer without an expiration date could never be closed.

## What if the price changes or an app becomes paid?

Suppose an author publishes an offer for 1,000 sats, then later raises the price to 5,000 sats. Or an app starts free, and the author decides to charge for future versions. How does that affect existing users and pending offers?

First, publishing a new offer changes what the catalog advertises; it does not silently cancel an earlier offer that is still within its signed window:

- Offer A costs 1,000 sats and is valid during October.
- Offer B costs 5,000 sats and is advertised during November.
- A payment against A made in October remains a valid purchase forever.
- A payment against A attempted in November does not qualify because its validity window ended.

The key distinction is that **the offer expires, not the purchase**. Ownership is verified against the terms of the offer you actually paid for, not today's offer price. Changing the price later never invalidates past payments.

The same principle governs when a free app becomes paid:

- **Installed copies keep working:** A price change never disables software you already have installed.
- **Updating requires accepting an offer:** If a user installed a free version and the author later introduces pricing, managed updates are gated. To update, the user must accept and pay the active offer.
- **Future updates remain unlocked:** Once the user pays that offer, their identity permanently owns the app. They remain eligible for all subsequent updates—even if the author raises the price or publishes new offers later.

I call this **Early-adopter Pricing**. With one-time payments, early supporters who take a chance on an app are permanently rewarded with lifetime updates. The author can raise the price as the software matures, but the protocol guarantees that early adopters are permanently grandfathered in. Later on, new payment primitives (like recurring subscriptions or major-version licenses) could unlock additional pricing strategies, but for one-time payments, rewarding early adopters is the core philosophy.

To make expectations clear:

- Free installations show a brief notice: *"This version is free. The author may charge for future releases. Your installed version will remain usable if pricing changes."*
- For paid apps, the price sits above the Buy button, with an `[i]` button explaining terms and ownership checks.
- There are no automatic updates. Users can review release notes from the catalog and decide when an update is worth taking.

![Paid app in the catalog showing price, info button, and Buy & install](https://getappweaver.com/blog/selling-open-source-apps-with-nostr-zaps/paid-app.png)

![App purchase terms dialog opened from the info button](https://getappweaver.com/blog/selling-open-source-apps-with-nostr-zaps/app-purchase-terms.png)

## How do we know who signed the receipt?

The author's Lightning address resolves to an LNURL-pay endpoint. That endpoint must support Nostr zaps and advertise a `nostrPubkey`.

That is the Lightning provider's receipt-signing key. A valid receipt must be signed by it.

There is a historical problem here too. If the Lightning provider changes its key next year, checking an old receipt against only today's endpoint could reject a genuine purchase.

So the author-signed offer also keeps the Lightning provider's pubkey. New checkout checks the endpoint against that key. Historical recovery can verify the receipt against the provider key the author authorized in that offer.

Of course, matching the provider signature alone is not enough. A real receipt for another app or another person shouldn't unlock this app.

Let's use the 5,000-sat offer above to show what we check. The following events illustrate the structure; their IDs, keys, signatures, and invoice are placeholders, not real payment records.

### The buyer's zap request

Alice signs a kind `9734` request. Its `pubkey` is Alice's identity, while `p` is the payment recipient. The `e` tag points to the offer, and `a` identifies the app:

```json
{
  "kind": 9734,
  "pubkey": "<alice-pubkey>",
  "created_at": 1791633600,
  "tags": [
    ["a", "32107:<author-pubkey>:appweaver-example-plugin"],
    ["e", "<8107-event-id>", "wss://relay.example.com"],
    ["k", "8107"],
    ["p", "<author-pubkey>"],
    ["amount", "5000000"],
    ["relays", "wss://relay.example.com"],
    ["nonce", "<payment-attempt-nonce>"]
  ],
  "content": "",
  "id": "<zap-request-event-id>",
  "sig": "<alice-signature>"
}
```

The request is sent to the author's LNURL-pay callback to obtain an invoice. It is not published to relays as a standalone request. The `relays` tag tells the provider where to publish the receipt after payment.

![Purchase zap request signed confirmation](https://getappweaver.com/blog/selling-open-source-apps-with-nostr-zaps/payment-done-installing.png)

![Payment request dialog with WebLN and QR/invoice options](https://getappweaver.com/blog/selling-open-source-apps-with-nostr-zaps/payment-request.png)

### The Lightning provider's zap receipt

After payment, the Lightning provider signs a kind `9735` receipt. Notice that its `pubkey` is the Lightning provider's key, not Alice's or the author's. The complete signed request is included as a JSON string in `description`:

```json
{
  "kind": 9735,
  "pubkey": "<provider-receipt-signing-pubkey>",
  "created_at": 1791633605,
  "tags": [
    ["a", "32107:<author-pubkey>:appweaver-example-plugin"],
    ["e", "<8107-event-id>", "wss://relay.example.com"],
    ["p", "<author-pubkey>"],
    ["P", "<alice-pubkey>"],
    ["bolt11", "<BOLT11-invoice-for-5000-sats>"],
    ["description", "{\"kind\":9734,\"pubkey\":\"<alice-pubkey>\",\"created_at\":1791633600,\"tags\":[[\"a\",\"32107:<author-pubkey>:appweaver-example-plugin\"],[\"e\",\"<8107-event-id>\",\"wss://relay.example.com\"],[\"k\",\"8107\"],[\"p\",\"<author-pubkey>\"],[\"amount\",\"5000000\"],[\"relays\",\"wss://relay.example.com\"],[\"nonce\",\"<payment-attempt-nonce>\"]],\"content\":\"\",\"id\":\"<zap-request-event-id>\",\"sig\":\"<alice-signature>\"}"]
  ],
  "content": "",
  "id": "<zap-receipt-event-id>",
  "sig": "<provider-signature>"
}
```

Lowercase `p` is still the recipient. Uppercase `P`, when present, identifies the buyer. We can also get the buyer from the signed request inside `description`, so recovery doesn't depend on the provider including `P`.

### Checking the purchase

With these events, the important parts to check are:

- **The offer's author and signature.** The offer's `pubkey` must match the catalog author's `pubkey`, and its `a` tag must reference that author's app. Someone else cannot publish a cheap offer and use it to unlock the author's app.
- **The payment time.** The Lightning provider-signed receipt timestamp must be within the offer's window. A receipt reporting payment at 12:05 doesn't qualify for an offer that ended at 12:00, even if the request was signed earlier. The qualifying zap receipt is what we retain for purchase recovery.

![Second Brain app unlocked and installed after purchase verification](https://getappweaver.com/blog/selling-open-source-apps-with-nostr-zaps/purchased.png)

## Which identity owns the purchase?

The wallet paying the invoice and the Nostr identity owning the purchase are not necessarily the same thing.

I might pay from an NWC wallet or another Lightning wallet, but sign the zap request with my personal Nostr identity. It is that request signer who owns the purchase.

This matters when using multiple AppWeaver instances. An instance might be authenticated with a different identity from the one I used when buying an app.

The purchase flow therefore lets the user choose the authenticated identity or a saved bunker identity. If the old purchasing identity isn't connected, the user can add it through the bunker manager.

![Choosing the purchasing identity or opening the bunker manager](https://getappweaver.com/blog/selling-open-source-apps-with-nostr-zaps/app-purchase-dialog.png)

Looking up public receipts doesn't require signing a new event. But finding a receipt for Alice doesn't prove that the person asking to install the app can sign as Alice. A saved bunker connection may also have expired or lost its signing permission.

Before restoring a purchase, the selected identity signs a fresh challenge that won't be published. AppWeaver creates a random nonce and binds it to the app, the buyer, and the fetched receipt. The challenge expires after five minutes and can only be used once. We verify the signature and require its pubkey to match the buyer in the receipt's embedded zap request, not the provider that signed the receipt.

## The receipt needs to be somewhere we can find it again

Zap requests contain a `relays` tag telling the provider where to publish the receipt.

The buyer's NIP-65 read relays are a useful starting point. Someone else, the Lightning provider, is publishing something that the buyer needs to read later. We also use bounded fallback relays and relay hints from the app's catalog and offer.

The zap request references the app with `a` and the offer with `e`. This gives us a way to query receipts for a particular app rather than downloading every zap and trying to guess what it was for.

For example, an app-scoped receipt query looks like this:

```json
{
  "kinds": [9735],
  "#a": ["32107:<author-pubkey>:<app-name>"],
  "#p": ["<author-pubkey>"]
}
```

Here lowercase `p` is the recipient. The receipt's author is the provider, not the buyer. Uppercase `P` can identify the buyer when the provider includes it, but we don't depend on it; we inspect the verified request embedded in the receipt.

There is still no guarantee that relays will store everything forever. A user may change relays, a relay may go offline, or an old offer may disappear from the relays being queried.

We retain the verified receipt together with its immutable offer locally, revalidate them when reused, and keep relay information for pending payments. The request also carries a relay hint for the offer. To find the offer on Nostr, the installer checks the catalog's relay hint, our fallback catalog relays, and the author's NIP-65 write relays (outbox). Checking the author's outbox relays means an offer is discoverable even if the specific hint relay went down or dropped older events. A fresh instance can recover a purchase while the required records remain available on reachable relays.

This is a place where "nothing found" and "never paid" are different things. The lookup is bounded, and incomplete results shouldn't be treated as a reason to automatically charge again.

![App purchase dialog when no matching receipt is found on queried relays](https://getappweaver.com/blog/selling-open-source-apps-with-nostr-zaps/app-purchase-buy-install.png)

Export/import is also planned for complete relay independence. A user can export their verified `{ offer, receipt }` bundle as a JSON file and bring it to another instance. To prevent people from simply copying receipt files as shared licenses, importing the bundle requires the user to sign an unpublished challenge with their Nostr key (via browser extension or Bunker) to prove they actually hold the private key for the buyer identity embedded in the receipt.

## Paid, but the receipt hasn't arrived

This is probably the most annoying edge case from the user's point of view.

The wallet says the invoice was paid. The Lightning provider hasn't published the receipt yet, or the relays we're querying haven't returned it. The install check can't confirm ownership.

It would be bad to just show the Buy button again and create another invoice.

Instead, we keep the signed request, invoice, and receipt relay destinations. Reopening checkout can check the receipt again or reuse the existing invoice if it is still unpaid. Starting another payment after expiry is an explicit action.

![Checkout waiting for payment with QR code, invoice, and Check payment action](https://getappweaver.com/blog/selling-open-source-apps-with-nostr-zaps/payment-waiting-qr.png)

Missing confirmation shouldn't erase the payment attempt. The user should be able to come back to it.

If the receipt still hasn't arrived because the Lightning provider crashed or failed to emit the kind `9735` event, the client cannot fabricate a provider signature. The cleanest recourse is putting the buyer in direct contact with the author. The checkout screen provides a "Contact Author via DM" action, sending an encrypted NIP-17 direct message containing the invoice, payment timestamp, and buyer public key. The author checks their node or LNURL backend, confirms the invoice was settled, and can simply refund the sats back to the buyer.

## What are the responsibilities of a paid app author?

Because AppWeaver relies on decentralized Nostr events rather than a centralized billing backend, keeping a paid app accessible comes with a few clear responsibilities for the author:

- **Keeping an active offer published and renewed:** Every offer has a signed `validUntil` timestamp. If an advertised offer expires, AppWeaver ignores its payment gate and allows installation or updates without payment. If an author wants to keep charging, publishing a renewed, unexpired offer is their responsibility.
- **Maintaining a working Lightning address:** The author's Lightning address (`lud16`) must remain reachable and its provider key must match the offer. If the Lightning endpoint is unreachable or fails, the offer is treated as **unavailable**—new checkouts and updates are blocked to prevent broken payment attempts. Free apps always keep working.
- **Preserving historical offer events on relays:** An expired offer must remain accessible on relays. Expiring an offer only closes the window for new buyers; past buyers still need the author's signed historical terms to verify their zap receipts when recovering purchases on a fresh instance.

## Where I am now

The author offer manager and the payment-aware installation flow are implemented. The next step is verifying the buyer flow end to end: payment, delayed receipts, updates, and recovery from another instance.

There are still things to improve:
- **Offline export/import**: Portable JSON purchase bundles with cryptographic challenge-response verification on import.
- **Ratings & Reviews**: Using **NIP-22** (kind `1111`) comments and **NIP-32** (kind `1985`) ratings tagged to the app coordinate. In `/plugins list`, each app can show a badge like `5 💬 · ⭐ 4.9/5 (42 reviews)`. Clicking opens a ratings breakdown and reviews list, with a Web of Trust (WoT) filter to filter spam and highlight reviews from people you follow.

The part I find interesting is that a small payment feature turns into a discussion about identity, history, distribution, and promises made to users. Nostr gives us useful building blocks, but we still have to decide what the events actually mean and how to behave when some of them are missing.

## Closing

I want paying an app author to be a normal part of installing useful software, without taking control of the user's copy away from them.

For AppWeaver, a one-time purchase, a reusable Nostr identity, and a recoverable zap receipt seem like a good place to start.

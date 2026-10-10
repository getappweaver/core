# Selling apps with Nostr zaps

I want app authors to be able to charge for their AppWeaver apps. Since AppWeaver already uses Nostr for app discovery and Git for distribution, using zaps for payments felt like a good fit.

The first idea is simple: the author gives a Lightning address and a price, the user pays, and AppWeaver lets them install the app after finding the zap receipt.

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

This is an addressable event. The author can publish a replacement when a new release is published through Git. The previous signed event cannot be edited, but a relay would keep only its latest replacement.

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

The offer fields are tags, so `content` is empty. The validity timestamps are Unix seconds: the start is inclusive and the end is exclusive.

## Can someone pay an old, cheaper offer?

This was one of the first questions.

Suppose an author publishes an offer for 1,000 sats, then later publishes one for 5,000 sats. If both events remain available, can a user just choose the cheaper one?

My answer is: yes, if it is still within the validity window the author signed.

Publishing a new offer changes what the catalog advertises. It does not silently cancel an earlier offer. If an author made a price available until the end of the month, that price remains available until the end of the month.

For example:

- Offer A costs 1,000 sats and is valid during October.
- Offer B costs 5,000 sats and is advertised during November.
- A payment against A made in October remains a valid purchase forever.
- A payment against A made in November does not qualify.

The important distinction is that **the offer expires, not the purchase**.

We should never compare an old purchase against today's price. Otherwise, raising the price would take away access from people who already paid.

## But the user can backdate a Nostr event

A buyer signs the kind `9734` zap request. That means they control its `created_at` value. Checking that timestamp would let them create a request today and pretend it happened while a cheaper offer was valid.

The timestamp we use is the one on the kind `9735` zap receipt, signed by the recipient's Lightning provider.

[NIP-57](https://github.com/nostr-protocol/nips/blob/master/57.md) says that the receipt timestamp SHOULD be the invoice's `paid_at` time. The buyer cannot change that signed timestamp without invalidating the signature.

The check is:

```text
validFrom <= receipt.created_at < validUntil
```

This trusts the provider to report payment and its time honestly. It is not independent cryptographic proof that a Lightning payment settled at that exact moment. For this soft gate, I think trusting the author's chosen payment provider is enough.

## How do we know who signed the receipt?

The author's Lightning address resolves to an LNURL-pay endpoint. That endpoint must support Nostr zaps and advertise a `nostrPubkey`.

That is the provider's receipt-signing key. A valid receipt must be signed by it.

There is a historical problem here too. If the provider changes its key next year, checking an old receipt against only today's endpoint could reject a genuine purchase.

So the author-signed offer also keeps the provider pubkey. New checkout checks the endpoint against that key. Historical recovery can verify the receipt against the provider key the author authorized in that offer.

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

### The provider's zap receipt

After payment, the provider signs a kind `9735` receipt. Notice that its `pubkey` is the provider's key, not Alice's or the author's. The complete signed request is included as a JSON string in `description`:

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

### The amount and the description hash

The receipt contains the BOLT11 invoice, not a separate amount field that we can simply trust. We decode its amount and compare it with the offer and the request:

```text
Offer price:              5,000 sats
Request amount tag:       5,000,000 millisats
Decoded invoice amount:   5,000,000 millisats
```

AppWeaver already has a focused BOLT11 parser in `src/payments/lightning-invoice.ts`. It checks the Bech32 checksum, decodes the amount and its unit multiplier, and extracts fields such as the payment hash, expiry, and description hash. We reused that parser rather than adding a BOLT11 decoding library. It does not cryptographically verify the invoice's own signature; the provider's signed receipt is the payment attestation we trust.

The description hash is a SHA-256 hash encoded inside the invoice. For a zap invoice, it commits to the exact JSON text of the signed zap request. It is not the request itself, and it is not the request's event ID.

The request above is formatted for readability. In the receipt example, its `description` value is a compact JSON string. The check uses that string exactly as received:

```text
SHA256(the raw description tag value)
    == the description hash encoded in the BOLT11 invoice
```

We use `@noble/hashes` for SHA-256. We don't parse and reserialize the request before hashing it, because even a whitespace change would produce a different hash. Parsing the request and verifying its Nostr signature is a separate check.

### Checking the whole purchase

With these events, we check:

- **The offer's author and signature.** The offer's `pubkey` must match the catalog author's `pubkey`, and its `a` tag must reference that author's app. Someone else cannot publish a cheap offer and use it to unlock the author's app.
- **The receipt's provider and signature.** Its `pubkey` must match the provider key authorized in the signed offer. A receipt signed by an unrelated key doesn't count.
- **The buyer's request and signature.** The request in `description` must be signed by the selected purchasing identity. Alice's receipt doesn't give Bob ownership.
- **The app and offer references.** The request and receipt must identify the same app and the exact offer used to verify the price and validity window. A Todo purchase doesn't unlock the Bookmark Manager.
- **The recipient.** The request and receipt's `p` tags must match the offer's recipient. Paying another pubkey doesn't count as paying this author.
- **The exact amount.** The decoded invoice amount and request amount must both equal the offer's price in millisats. A 4,999-sat payment doesn't qualify for this 5,000-sat offer.
- **The invoice description hash.** The hash inside the invoice must match the raw `description` value. An invoice issued for another request cannot be paired with Alice's request to claim this purchase.
- **The payment time.** The provider-signed receipt timestamp must be within the offer's window. A receipt reporting payment at 12:05 doesn't qualify for an offer that ended at 12:00, even if the request was signed earlier.

A successful wallet response is useful during checkout. The qualifying zap receipt is what we retain for purchase recovery.

## Which identity owns the purchase?

The wallet paying the invoice and the Nostr identity owning the purchase are not necessarily the same thing.

I might pay from an NWC wallet or another Lightning wallet, but sign the zap request with my personal Nostr identity. It is that request signer who owns the purchase.

This matters when using multiple AppWeaver instances. An instance might be authenticated with a different identity from the one I used when buying an app.

The purchase flow therefore lets the user choose the authenticated identity or a saved bunker identity. If the old purchasing identity isn't connected, the user can add it through the bunker manager.

Looking up public receipts doesn't require signing a new event. But finding a receipt for Alice doesn't prove that the person asking to install the app can sign as Alice. A saved bunker connection may also have expired or lost its signing permission.

Before restoring a purchase, the selected identity signs a fresh challenge. AppWeaver creates a random nonce and binds it to the app, the buyer, and the fetched receipt. The challenge expires after five minutes and can only be used once. We verify the signature and require its pubkey to match the buyer in the receipt's embedded zap request, not the provider that signed the receipt.

The challenge is not published, and signing it does not authorize another payment. With a bunker, this proves that the user has access to a remote signer for that identity; the private key can remain in the bunker. The payment receipt is verified separately, so signing access alone doesn't prove that the app was paid for.

This check also applies to receipts cached locally. We don't ask every connected bunker to sign something in the background, and an arbitrary entered pubkey isn't enough. A new purchase already requires a signed zap request, which includes a server-generated nonce for that payment attempt. Transfers between unrelated pubkeys remain a separate problem.

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

We retain the verified receipt together with its immutable offer locally, revalidate them when reused, and keep relay information for pending payments. The request also carries a relay hint for the offer. A fresh instance can recover a purchase while the required records remain available on reachable relays.

This is a place where "nothing found" and "never paid" are different things. The lookup is bounded, and incomplete results shouldn't be treated as a reason to automatically charge again. Export/import and better recovery tools are still on the list.

## Paid, but the receipt hasn't arrived

This is probably the most annoying edge case from the user's point of view.

The wallet says the invoice was paid. The provider hasn't published the receipt yet, or the relays we're querying haven't returned it. The install check can't confirm ownership.

It would be bad to just show the Buy button again and create another invoice.

Instead, we keep the signed request, invoice, and receipt relay destinations. Reopening checkout can check the receipt again or reuse the existing invoice if it is still unpaid. Starting another payment after expiry is an explicit action.

Missing confirmation shouldn't erase the payment attempt. The user should be able to come back to it.

## What if publishing succeeds only halfway?

The author flow has a similar problem.

Publishing a new offer involves two events: the immutable offer, then a replacement catalog event pointing to it. The offer can reach a relay while the catalog update fails.

We publish the offer first, use an accepting relay as its hint, and save the signed offer before publication. A retry reuses that same event instead of creating another offer with another ID.

The author UI also keeps the relay destinations and acknowledgements. It can show which relays accepted an event and which failed. Having an event ID without knowing where it was published is not very helpful when trying to recover from a failure.

## What if a free app becomes paid?

I don't think installing a free version should force the author to keep every future version free. But I also don't think a pricing change should disable a copy someone already has.

The rule is:

- The installed version keeps working.
- If an active offer exists, a managed update requires a purchase unless the user already owns the app.
- A qualifying purchase includes future versions, even if the author raises the price later.

Free installation shows a short notice before continuing:

> This version is free. The author may charge for future releases. Your installed version will remain usable if pricing changes.

For a paid app, we show the price above Buy and keep the longer explanation behind an `[i]` button. The user can check purchase ownership before paying.

There are no automatic app updates. A user can choose to stay on their current version, but that also means possibly missing security fixes or compatibility changes. We mention that without pretending every update is a security patch.

Release notes help with that decision too. The installer can show the whole published release history, newest first, and the notes relevant to an available update. Those notes come from the app's catalog; the publisher normally prepares them from Git commit subjects between release tags, or preserves the author's custom notes.

Selecting an older version that used to be free is something I want to support later. The current manager doesn't yet offer historical free-version installation or detailed commit comparisons.

## What happens when an author forgets to renew an offer?

If the advertised offer expires, we ignore its payment gate and allow installation or updates without payment. An upcoming offer also doesn't gate before its start time.

Keeping an active offer published is the author's responsibility. We don't search for another older offer to force a payment when the advertised one has expired.

An expired offer is different from an advertised offer that is missing or malformed. In the latter case, the manager asks for purchase recovery or author correction instead of silently calling the app free.

And we still need expired offers for people who paid while they were valid. Expiring the purchase window should not delete the historical terms needed to verify those payments.

## Where I am now

The author offer manager and the payment-aware installation flow are implemented. The next step is verifying the buyer flow end to end: payment, delayed receipts, updates, and recovery from another instance.

There are still things to improve, particularly historical free versions, relay recovery, and comparing what changed between releases.

The part I find interesting is that a small payment feature turns into a discussion about identity, history, distribution, and promises made to users. Nostr gives us useful building blocks, but we still have to decide what the events actually mean and how to behave when some of them are missing.

## Closing

I want paying an app author to be a normal part of installing useful software, without taking control of the user's copy away from them.

For AppWeaver, a one-time purchase, a reusable Nostr identity, and a recoverable zap receipt seem like a good place to start.

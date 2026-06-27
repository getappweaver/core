# Landing blog source

Add one wrapper JSON file and one Markdown file per NIP-23 post.

```json
{
  "relays": ["wss://relay.example"],
  "markdown": "./my-post.md",
  "event": {
    "pubkey": "<64-hex pubkey matching a saved bunker connection>",
    "kind": 30023,
    "tags": [
      ["d", "my-post"],
      ["title", "My Post"],
      ["summary", "Short summary"],
      ["image", "https://example.com/cover.jpg"],
      ["published_at", "1710000000"],
      ["t", "appweaver"]
    ],
    "content": "",
    "id": "<filled by blog:publish>",
    "sig": "<filled by blog:publish>"
  }
}
```

The `relays` field stays outside the signed event. `blog:publish` copies the
Markdown into `event.content`, bumps `created_at` when signing is needed, signs
with the saved bunker connection whose user pubkey matches `event.pubkey`, and
publishes to every wrapper relay.

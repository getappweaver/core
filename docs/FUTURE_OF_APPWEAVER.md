# Future of AppWeaver: Peer-to-Peer Teams, FIPS Transport, and Immutable App Stores

This document captures the architectural direction for multi-user collaboration in AppWeaver—moving from a single-user local harness to **peer-to-peer team collaboration** powered by **FIPS**, **Capability Contracts**, and **`xitdb-ts`**.

---

## 1. The Starting Point: AppWeaver Today

- **Local-first, single-owner instance:** Every AppWeaver instance has exactly **one `BOT_KEY`** (machine/daemon identity) and **one `BOT_MASTER_PUBKEY`** (human owner identity).
- **Plugins run in-process** with core (Bun/Node) and collaborate through **versioned Capability Contracts** (`src/capabilities/`).
- **Draft-based control:** Mutating operations create drafts that the human owner reviews and accepts/declines before state changes take effect.
- **Personal apps (e.g. Todo):** Built around single-user SQLite storage.

---

## 2. Core Shift: Loose Peer-to-Peer Collaboration (Instead of a Central Hub)

Rather than forcing one user's instance to act as a centralized NIP-29-style server/hub for everyone else, AppWeaver keeps every instance equal and autonomous:

| Question | Architectural Decision |
|---|---|
| **Instance ownership** | Unchanged: 1 `BOT_KEY` + 1 `BOT_MASTER_PUBKEY` per AppWeaver instance. |
| **How are peers reached?** | **FIPS** (Nostr-native mesh networking over `npub`s) + **WebSocket** channels between instances. No sticky IPs, DNS, or port forwarding required. |
| **Connection vs. Author Identity** | A **plugin-generated FIPS node keypair** (`fips_pubkey`, encrypted at rest in the plugin DB) is used strictly for the machine-to-machine FIPS/WebSocket transport connection. **`master_pubkey`** is the human identity used for authorship, permissions, and signing application payloads. |
| **Where do connections live?** | In a dedicated **FIPS / Peer Network plugin** that maintains the trusted peer book and active WebSocket tunnels. |
| **How do Team Apps use peers?** | Team apps (like **Todo Teams**) consume the FIPS capability contract, let the user select which connected peers to collaborate with on a given project, and handle their own app-specific sync & merge logic. |
| **How is app state stored & synced?** | Apps like Todo Teams use **`xitdb-ts`** (an immutable, append-only database) instead of SQLite—enabling transaction history, byte-stream replication of remote peer logs, and **Git-style review (accept / reject / revert)** of teammates' changes. |

---

## 3. Identity Model: Dedicated FIPS Key for Transport, Master Key for Authorship

A single human (`master_pubkey`) may run multiple AppWeaver instances (laptop, home server, VPS), and their master private key lives in a browser extension (NIP-07) or bunker (NIP-46)—not in `.env`. Meanwhile, exposing `BOT_KEY` outside core is unnecessary when the `fips` plugin can generate and manage its own dedicated FIPS node keypair (`fips_pubkey`), encrypted at rest in the plugin's SQLite database.

To solve both reachability and single-instance certainty:

1. **Peer Roster Entry = `(master_pubkey, fips_pubkey)`:**
   - `master_pubkey` identifies the **person** (teammate).
   - `fips_pubkey` (33-byte compressed secp256k1 key) identifies the **specific AppWeaver instance** authorized to connect over FIPS for that teammate.
2. **Pairing / Binding Handshake (Flow A — Copy/Paste Invite):**
   - Each instance can generate an invite token containing `{ masterPubkey, fipsPubkey, seedUrls, timestamp, sig }`.
   - The FIPS plugin only establishes/accepts machine-to-machine tunnels from authorized `fips_pubkey` endpoints, while mapping that connection to the peer's `master_pubkey`.
3. **Message & Transaction Signing:**
   - Transport frames are authenticated by the `fips_pubkey` FMP/FSP Noise tunnel.
   - Application commits/requests carry the `master_pubkey` attribution/signature (signed via browser extension or an explicit bunker—never silently handed over to an autonomous agent without user control).

---

## 4. Layer Separation: FIPS Plugin vs. Team Apps

A critical boundary is keeping **sync and merge logic out of the FIPS plugin**.

### Layer 1: The FIPS Plugin & Capability Contract (`peer-network:v1`)
The FIPS plugin is **100% domain-agnostic**. It knows nothing about todos, `xitdb`, or application state.

**Responsibilities of the FIPS plugin:**
- Manage the local **Peer Roster** (adding/removing trusted `(master_pubkey, bot_pubkey)` pairs, labels, connection status).
- Manage the local FIPS mesh endpoint / daemon and establish encrypted WebSocket channels to online peers.
- Authenticate incoming peer connections against the local roster.
- Multiplex application messages over the peer WebSocket channel by `(channel / appNamespace)` so multiple team apps can share the same peer connection.

**What the Capability Contract exposes to other plugins (e.g., `peer-network:v1`):**
- `list-peers`: Return known peers (`masterPubkey`, `botPubkey`, `displayName`, `status: 'online' | 'offline'`, `lastSeenAt`).
- `send`: Send a payload or request to a specific peer (`peerMasterPubkey`, `channel`, `payload`) over the active WebSocket.
- `broadcast` (or multi-peer send): Send a message to a subset of selected peers for a channel.
- **Incoming message delivery:** Route incoming peer messages for a `channel` to the target consumer plugin (via capability handler or registered listener operation).

### Layer 2: Team Apps (e.g., `todo-teams`)
Each collaborative app owns its storage engine, sync protocol, and review UX:
- **Peer selection:** In `todo-teams`, the user selects which peers from `peer-network:v1` belong to a team project/board.
- **Storage & Sync (`xitdb-ts`):** Handled entirely inside `todo-teams` over the raw message pipe provided by the FIPS capability.
- **Git-style Review & Merge:** Handled entirely inside `todo-teams`.

---

## 5. App Storage & Git-Style Review with `xitdb-ts`

Instead of SQLite, collaborative apps like **Todo Teams** can use [`xitdb-ts`](https://github.com/xit-vcs/xitdb-ts)—an embedded, pure-TypeScript immutable database built on Hash Array Mapped Tries (HAMT) and B+Trees.

### Why `xitdb-ts` fits the Peer-to-Peer Model
1. **Immutable History ("Moments"):**
   - The root of a `xitdb` database is an `ArrayList` of moments. Every transaction appends a new snapshot while sharing unchanged structure with previous moments.
   - Each transaction slot records metadata (`txId`, `authorMasterPubkey`, `signature`, `timestamp`, `summary`, `parentTxId`) alongside the state map.
2. **Zero-Impedance Append-Only Replication:**
   - Every peer is the single writer of their **own** local `xitdb` log (`local.xitdb`).
   - When Peer A and Peer B connect over the FIPS WebSocket—even after being offline—Peer A replicates Peer B's committed bytes into a local tracking replica (`remotes/<peerB>.xitdb`) using `xitdb`'s built-in `replicaState()` / `readCommitted()` / `openReplicated()` protocol.
3. **Git-Style Inspection, Accept/Reject, and Rollback:**
   - Because Peer A has both `local.xitdb` and `remotes/<peerB>.xitdb` on disk, the app can inspect every unmerged transaction from Peer B.
   - **Review Queue:** Just like `git fetch` + PR review (and matching AppWeaver's Draft UX), the user can inspect incoming peer transactions, see what changed, and **Accept (merge)** or **Reject** them.
   - **Revert / Take Back:** Because all historical moments remain readable in `xitdb`, reverting to a previous moment or undoing a specific transaction is native to the data structure.

---

## 6. Focused Roadmap: Phase 1 (FIPS & Capability Contract First)

Before building `xitdb` sync or `todo-teams`, the first milestone is the **FIPS connectivity layer and core capability contract**:

1. **Define the Core Capability Contract (`src/capabilities/peer-network.v1.ts` or `fips.v1.ts`):**
   - Operations for listing peers, inspecting connection health, sending/requesting messages over a named channel, and receiving inbound peer messages.
2. **Build the `fips` Plugin:**
   - SQLite/local table for the Peer Roster: `master_pubkey`, `bot_pubkey`, `alias/label`, `binding_proof`, `status`, `created_at`.
   - Pairing flow to bind a teammate's `master_pubkey` + `bot_pubkey`.
   - FIPS transport integration + authenticated WebSocket server/client between instances.
   - CLI & Web UI commands to add peers, view online/offline status, and test ping/messaging between two AppWeaver instances.
3. **Build Consumer Apps (`todo-teams` with `xitdb-ts`):**
   - Select peers from the FIPS capability.
   - Exchange `xitdb` replica state and transaction proposals over the FIPS channel.
   - Present incoming peer changes in a Git-style review/merge UI.

---

## 7. Orthogonal Track: Safe Apps Runtime

*(Retained from earlier architecture notes as an independent future track)*
- Keep `PluginContext` for trusted local plugins.
- Add **`SafeAppContext`** for untrusted third-party/AI-generated apps, enforced by subprocess + OS sandbox + IPC capability broker (inspired by NIP-5D / `nostrapps`).

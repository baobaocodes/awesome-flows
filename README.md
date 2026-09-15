# Awesome Flows

**A visual encyclopedia of standard software engineering flows.**

_MDN for engineering workflows and system interactions._

---

Understanding how OAuth PKCE, the Saga pattern, or a TLS 1.3 handshake actually
works currently means stitching together a dozen blog posts of varying accuracy,
then cross-checking them against a dense RFC you did not want to read.

This repository is one page per flow, every page the same shape:

- **A one-line definition** and a TL;DR you can read in twenty seconds
- **A numbered Mermaid sequence diagram** — renders directly on GitHub, no build
- **A step-by-step walkthrough** keyed to those numbers, with real wire formats
- **Failure modes** — what happens on timeout, replay, crash, and reordering
- **Common pitfalls** — real mistakes people ship, with the fix and the reason
- **An implementation checklist** you can paste into a ticket
- **Links to the normative spec**, with section anchors

The consistency is the point. Once you have read one page, you know how to read
all of them.

---

## The flows

### 🤖 AI & agent systems

| Flow                                                                                           | What it answers                                                                                         | Difficulty   |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------ |
| [LLM Tool-Use Loop](flows/ai-systems/llm-tool-use-loop.md)                                     | How does a model "call a function" when it can only emit text, and who actually runs the code?          | Intermediate |
| [RAG Ingestion & Retrieval](flows/ai-systems/rag-ingestion-and-retrieval.md)                   | How does a question about my documents become an answer grounded in them, with citations?               | Intermediate |
| [MCP Request Lifecycle & Versioning](flows/ai-systems/mcp-request-lifecycle-and-versioning.md) | How does an MCP client talk to a server now that the `initialize` handshake is gone?                    | Intermediate |
| [MCP Authorization](flows/ai-systems/mcp-authorization.md)                                     | How does a remote MCP server authenticate callers, and why must it never forward the token it receives? | Advanced     |
| [Prompt Injection & Tool Poisoning](flows/ai-systems/prompt-injection-and-tool-poisoning.md)   | How does text the agent merely _reads_ become instructions it obeys, and what actually contains that?   | Advanced     |

### 🔐 Auth & identity

| Flow                                                                                             | What it answers                                                                                    | Difficulty   |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ------------ |
| [OAuth 2.0 Authorization Code + PKCE](flows/auth/oauth2-authorization-code-pkce.md)              | How does an app get permission to call an API as me, and what exactly does PKCE protect against?   | Intermediate |
| [OpenID Connect Authorization Code Flow](flows/auth/openid-connect-authorization-code.md)        | OAuth tells me what an app may do — how do I find out _who_ just signed in?                        | Intermediate |
| [JWT Access & Refresh Token Rotation](flows/auth/jwt-access-refresh-token-rotation.md)           | How do I keep a user signed in for weeks with 15-minute tokens, and detect a stolen refresh token? | Intermediate |
| [Session Cookies & Server-Side Sessions](flows/auth/session-cookies-and-server-side-sessions.md) | How does the boring, correct version of "stay signed in" actually work?                            | Beginner     |
| [WebAuthn / Passkey Registration & Login](flows/auth/webauthn-passkey-registration-and-login.md) | How do passkeys work, and why can phishing not defeat them?                                        | Advanced     |

### 🌐 Distributed systems

| Flow                                                                                                            | What it answers                                                                                | Difficulty   |
| --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------ |
| [The Saga Pattern](flows/distributed-systems/saga-pattern.md)                                                   | How do I keep data consistent across services when no transaction can span them?               | Advanced     |
| [Transactional Outbox & CDC](flows/distributed-systems/transactional-outbox-and-cdc.md)                         | How do I update my database and publish an event without the two ever disagreeing?             | Intermediate |
| [Idempotency Keys](flows/distributed-systems/idempotency-keys.md)                                               | How does a client safely retry a payment when it has no idea whether the first attempt worked? | Intermediate |
| [Circuit Breaker, Timeout & Retry with Backoff](flows/distributed-systems/circuit-breaker-retry-and-backoff.md) | How do I stop retrying a failing dependency before my retries become the outage?               | Intermediate |
| [Raft Leader Election & Log Replication](flows/distributed-systems/raft-leader-election-and-log-replication.md) | How do five machines that can each crash agree on one ordered sequence of commands?            | Advanced     |
| [Distributed Locks & Fencing Tokens](flows/distributed-systems/distributed-locks-and-fencing-tokens.md)         | Why does my distributed lock not actually give me mutual exclusion, and what would?            | Advanced     |

### 🔌 Networking & protocols

| Flow                                                                                             | What it answers                                                                                                  | Difficulty   |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ------------ |
| [DNS Resolution](flows/networking/dns-resolution.md)                                             | How does a name become an IP address, and why is my change still not visible?                                    | Beginner     |
| [The TLS 1.3 Handshake](flows/networking/tls-1-3-handshake.md)                                   | How do two strangers agree on an encryption key across a hostile network, in one round trip?                     | Advanced     |
| [CORS Preflight](flows/networking/cors-preflight.md)                                             | Why is there an `OPTIONS` request before my API call, and why does the error only appear in the browser?         | Beginner     |
| [Server-Sent Events & HTTP Streaming](flows/networking/server-sent-events-and-http-streaming.md) | How does a server push a stream of messages down one response, and why does it arrive all at once in production? | Intermediate |
| [WebSocket Upgrade & Frames](flows/networking/websocket-upgrade-and-frames.md)                   | How does an HTTP request become a two-way connection, and what keeps it alive through a proxy?                   | Intermediate |

### 💾 Data, caching & delivery

| Flow                                                                                                                | What it answers                                                                                      | Difficulty   |
| ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------ |
| [Cache-Aside Read & Write](flows/data-and-delivery/cache-aside-read-write.md)                                       | How do I cache correctly, and what happens when ten thousand requests miss the same key at once?     | Intermediate |
| [Message Queue Delivery Semantics](flows/data-and-delivery/message-queue-delivery-semantics.md)                     | What do at-least-once and exactly-once actually mean, and which one do I really have?                | Intermediate |
| [Rate Limiting Algorithms](flows/data-and-delivery/rate-limiting-algorithms.md)                                     | Token bucket or sliding window — and how do I count correctly across a fleet?                        | Intermediate |
| [Webhook Delivery & Signature Verification](flows/data-and-delivery/webhook-delivery-and-signature-verification.md) | How do I prove an HTTP POST really came from the sender, is fresh, and has not already been handled? | Intermediate |

---

## How to read a flow page

Every page uses the same fixed section order, so you can jump straight to what
you need:

| Section                       | Read it when                                                              |
| ----------------------------- | ------------------------------------------------------------------------- |
| **TL;DR**                     | You have twenty seconds and need the mechanism, not the motivation        |
| **When to use / when not to** | You are deciding whether this is the right tool at all                    |
| **Actors and terminology**    | You are about to read the spec and want the vocabulary to line up         |
| **Sequence diagram**          | Always. This is the page.                                                 |
| **Step-by-step**              | You are implementing it and need the wire format and the validation rules |
| **Failure modes**             | Something has gone wrong, or you are trying to stop it going wrong        |
| **Common pitfalls**           | Before your code review. This is the highest-value section on every page. |
| **Implementation checklist**  | You are writing the ticket                                                |
| **Specs and references**      | You need the normative answer, not ours                                   |

**The autonumber contract.** Every sequence diagram uses Mermaid's `autonumber`,
and step _n_ in the diagram is step _n_ in the walkthrough below it. Read the
diagram, find the step you care about, jump to that number. There is exactly one
walkthrough item per arrow on the diagram — state changes that send no message
are folded into the step they belong to — and CI enforces it, so the numbers
cannot quietly drift apart.

---

## Roadmap

Each of these is a good first contribution. Pick one, copy
[the template](templates/FLOW_TEMPLATE.md), and open a PR.

**AI & agent systems** — MCP sampling and elicitation · agent memory and
context compaction · streaming structured output · evaluation harness flow

**Auth** — SAML 2.0 SSO · mTLS · device authorization grant · magic links ·
token exchange (RFC 8693)

**Distributed systems** — two-phase commit · CQRS & event sourcing ·
consistent hashing · vector clocks

**Networking** — HTTP/2 multiplexing · HTTP/3 & QUIC · gRPC streaming ·
TCP congestion control · conditional requests & ETags

**Data & delivery** — CDN cache flow · database replication & failover ·
blue-green & canary deploys · CI/CD pipeline · backpressure & load shedding ·
W3C Trace Context propagation

---

## Contributing

Contributions are very welcome — especially **corrections**. If a page
contradicts a spec, that is a bug, and reporting it is a real contribution.

Read [CONTRIBUTING.md](CONTRIBUTING.md) first: it covers the page template, the
Mermaid conventions that keep diagrams consistent and readable in both GitHub
themes, and the review checklist.

Two rules worth knowing up front:

1. **Every claim must be traceable to the references section.** If you cannot
   cite it, it does not go in.
2. **Pitfalls must be real.** Mistakes people have actually shipped, not
   hypotheticals.

See also the [Code of Conduct](CODE_OF_CONDUCT.md).

---

## License

Prose and diagrams are licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) — use them anywhere,
including commercially, with attribution. The illustrative code snippets are
additionally available under the MIT license, so you can paste them into your
project without an attribution obligation. See [LICENSE](LICENSE).

Quoted material from IETF, W3C, and WHATWG documents remains under its
publisher's terms; those are linked, not relicensed.

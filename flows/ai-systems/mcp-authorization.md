---
title: MCP Authorization
category: ai-systems
tags: [mcp, oauth2.1, authorization, resource-server, agents, pkce]
difficulty: advanced
specs:
  - https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization
  - https://www.rfc-editor.org/rfc/rfc9728
  - https://www.rfc-editor.org/rfc/rfc8707
  - https://www.rfc-editor.org/rfc/rfc9207
  - https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1
updated: 2026-09-25
---

# MCP Authorization

> How a remote Model Context Protocol server decides that the agent calling it
> is allowed in — and why the one thing it must never do is pass the token it
> received on to anything else.

_Documented against MCP revision [`2026-07-28`](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization), the current revision. Authorization is **OPTIONAL** in MCP, and applies to HTTP-based transports only._

---

## TL;DR

- **There is no MCP-specific auth protocol.** An MCP server is an ordinary
  OAuth 2.1 _resource server_; an MCP client is an ordinary OAuth 2.1 _client_.
  Everything below is standard OAuth, assembled in a specific order.
- **The client discovers everything from a `401`.** It calls the server with no
  token, reads `resource_metadata` out of the `WWW-Authenticate` header — or, if
  the header omits it, falls back to the RFC 9728 well-known URIs — fetches
  Protected Resource Metadata, and follows that to the authorization server. No
  configuration file lists endpoints.
- **The `resource` parameter is mandatory** on both the authorization request
  and the token request. It binds the issued token's audience to one specific
  MCP server, and it is what makes the next point enforceable.
- **Token passthrough is forbidden.** A server "**MUST NOT** accept or transit
  any other tokens" than those issued for itself. Forwarding the caller's token
  to an upstream API is the defining security failure of this flow.
- **Dynamic Client Registration is deprecated**, retained only for
  authorization servers that do not yet support Client ID Metadata Documents.

---

## When to use it

- Any MCP server reachable over HTTP that exposes data or actions belonging to
  a particular user.
- Any MCP server that must distinguish callers at all — even if every caller is
  allowed, you need identity to rate-limit, audit, or scope tool visibility.
- When a single server fronts several tenants and the set of tools returned by
  `tools/list` should depend on who is asking.

## When _not_ to use it

- **stdio servers.** The spec says implementations using the stdio transport
  **SHOULD NOT** follow this flow, and should take credentials from the
  environment instead. The process boundary is the trust boundary; a browser
  redirect adds nothing.
- **A server with no per-user data and no side effects** — a units converter, a
  reference lookup. Authorization has a real operational cost. Do not pay it to
  protect nothing.
- **As a way to get a token for something else.** If your goal is to call the
  GitHub API on the user's behalf, your server performs its _own_ authorization
  against GitHub. It does not reuse the token the agent gave it. See
  [Token passthrough](#token-passthrough) below.

---

## Actors and terminology

| Actor       | Spec term                                                                                      | What it is                                                                                                       |
| ----------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| User        | _Resource Owner_                                                                               | The human whose data the agent wants to reach.                                                                   |
| Browser     | _User Agent_                                                                                   | Carries the front-channel redirects. On a desktop agent this is the system browser, not an embedded webview.     |
| Agent       | _MCP Client_ ([OAuth 2.1 client](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1)) | The application hosting the model and speaking MCP. Usually a **public** client.                                 |
| MCP server  | _Resource Server_                                                                              | Serves `tools/call` and friends. Validates tokens; never issues them.                                            |
| Auth server | _Authorization Server_ (AS)                                                                    | Authenticates the user and issues access tokens. May or may not be operated by the same party as the MCP server. |

**Key terms**

- **Protected Resource Metadata (PRM)** — a JSON document defined by
  [RFC 9728](https://www.rfc-editor.org/rfc/rfc9728), served at a well-known URI
  — either path-inserted (`/.well-known/oauth-protected-resource/mcp` for an
  endpoint at `/mcp`) or at the root (`/.well-known/oauth-protected-resource`).
  It names the resource's canonical identifier and lists the authorization
  servers that can issue tokens for it. MCP servers **MUST** implement it and
  **MUST** advertise it via the `resource_metadata` challenge parameter _or_ the
  well-known URI; clients **MUST** support both, and **MUST** fall back to
  constructing the well-known URIs — path-inserted first, then root — when the
  challenge omits `resource_metadata`.
- **Canonical server URI** — the resource identifier for this MCP server, for
  example `https://mcp.example.com/mcp`. Must include a scheme, must not include
  a fragment. Conventionally written without a trailing slash.
- **`resource`** — the [RFC 8707](https://www.rfc-editor.org/rfc/rfc8707)
  parameter carrying that canonical URI. Clients **MUST** send it _whether or
  not_ they believe the authorization server supports it.
- **Audience binding** — the property that an access token names the MCP server
  it may be used at. Without it, a token minted for server A is spendable at
  server B, which is the confused-deputy problem this flow exists to prevent.
- **Client ID Metadata Document** — the client's `client_id` _is_ an HTTPS URL,
  which the authorization server fetches to learn the client's metadata and
  registered redirect URIs. Preferred over registration; both clients and
  authorization servers **SHOULD** support it.
- **Step-up authorization** — obtaining a _wider_ token mid-session after the
  server answers `403` with `error="insufficient_scope"`.

---

## Sequence diagram

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant B as Browser
    participant C as MCP Client
    participant M as MCP Server
    participant A as Authorization Server

    Note over C,M: Phase 1 — Discovery, driven entirely by the 401
    C->>M: POST /mcp with no Authorization header
    M-->>C: 401 with WWW-Authenticate: Bearer<br/>resource_metadata and scope
    C->>M: GET /.well-known/oauth-protected-resource
    M-->>C: 200 with resource, authorization_servers, scopes_supported
    C->>A: GET the authorization server metadata endpoint
    A-->>C: 200 with issuer, authorization_endpoint, token_endpoint
    Note over C: Records issuer alongside the PKCE verifier<br/>for this one request

    Note over C,A: Phase 2 — Obtain a client_id
    alt Client ID Metadata Document, preferred
        Note over C,A: client_id is an HTTPS URL, and the AS fetches<br/>that metadata document when it sees it
    else Dynamic Client Registration, deprecated
        C->>A: POST /register
        A-->>C: 201 with client_id
    else Pre-registered
        Note over C: Uses a client_id issued out of band
    end

    Note over U,A: Phase 3 — Authorization, front channel
    Note over C: Generates code_verifier and code_challenge
    C->>B: Open the authorization URL with code_challenge,<br/>resource and the chosen scope
    B->>A: GET /authorize
    U->>A: Authenticates and grants consent
    A-->>B: 302 to redirect_uri with code and iss
    B->>C: Callback delivers code and iss
    Note over C: Compares iss to the recorded issuer, byte for byte

    Note over C,M: Phase 4 — Token exchange, then the retried call
    C->>A: POST /token with code, code_verifier and resource
    A-->>C: 200 with an access token whose audience is this MCP server
    C->>M: POST /mcp with Authorization: Bearer TOKEN
    Note over M: Validates signature, expiry, and that the<br/>audience names this server and no other
    M-->>C: 200 with the JSON-RPC result
```

## Architecture

The point of the diagram above is that three parties who have never met agree
on one token. This is who owns what:

```mermaid
flowchart TB
    subgraph Client["Agent host"]
        C["MCP Client<br/>holds code_verifier,<br/>recorded issuer, tokens"]
    end
    subgraph Resource["Resource domain"]
        M["MCP Server<br/>validates tokens<br/>publishes PRM"]
        API["Upstream API<br/>its own credentials"]
    end
    subgraph Auth["Authorization domain"]
        A["Authorization Server<br/>authenticates the user<br/>mints audience-bound tokens"]
    end

    C -->|"1. no token"| M
    M -->|"2. 401 points here"| C
    C -->|"3. discovery"| A
    C -->|"4. bearer token"| M
    M -->|"5. server's own credential,<br/>never the caller's"| API
```

Note the last edge. The MCP server reaching an upstream API uses a credential
it obtained for itself. The token it received from the agent stops at its front
door.

---

## Step-by-step

1. **Call the server with no token at all.** This is deliberate, not a fallback.
   The client is not expected to know the authorization server in advance;
   the `401` is the discovery mechanism.

   ```http
   POST /mcp HTTP/1.1
   Host: mcp.example.com
   Content-Type: application/json
   Accept: application/json, text/event-stream
   MCP-Protocol-Version: 2026-07-28
   Mcp-Method: tools/list

   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "tools/list",
     "params": {
       "_meta": {
         "io.modelcontextprotocol/protocolVersion": "2026-07-28",
         "io.modelcontextprotocol/clientInfo": { "name": "ExampleClient", "version": "1.0.0" },
         "io.modelcontextprotocol/clientCapabilities": {}
       }
     }
   }
   ```

2. **The server challenges with `401` and points at its metadata.** The
   `resource_metadata` parameter is what makes the rest of the flow possible.
   Servers **SHOULD** also include `scope`, so the client knows what to ask for
   rather than guessing.

   ```http
   HTTP/1.1 401 Unauthorized
   WWW-Authenticate: Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource",
                            scope="files:read"
   ```

3. **Fetch the Protected Resource Metadata.** A plain unauthenticated `GET` at
   the URL from the header. If the header carried no `resource_metadata`, the
   client constructs the well-known URIs itself, path-inserted before root —
   see [Failure modes](#failure-modes).

4. **The server returns its identity and its authorization servers.** The
   `resource` value here is the canonical URI the client must later send as the
   `resource` parameter — do not construct it yourself from the request URL.

   ```json
   {
     "resource": "https://mcp.example.com/mcp",
     "authorization_servers": ["https://auth.example.com"],
     "scopes_supported": ["files:read", "files:write"],
     "bearer_methods_supported": ["header"]
   }
   ```

   _Client validates:_ that the `resource` value is identical to the URL it
   used to reach the server ([RFC 9728 §3.3](https://www.rfc-editor.org/rfc/rfc9728#section-3.3));
   if it is not, the metadata **MUST NOT** be used. This stops one server
   publishing metadata that impersonates another. It is a different defence
   from the `iss` check at step 13, which guards against authorization server
   mix-up (RFC 9207).

5. **Fetch the authorization server metadata.** The MCP server's authorization
   server **MUST** provide at least one of
   [RFC 8414](https://datatracker.ietf.org/doc/html/rfc8414) OAuth metadata or
   OpenID Connect Discovery — and **clients MUST support both**, trying the
   documented endpoints in priority order.

6. **The authorization server returns its endpoints and its issuer.**

   ```json
   {
     "issuer": "https://auth.example.com",
     "authorization_endpoint": "https://auth.example.com/authorize",
     "token_endpoint": "https://auth.example.com/token",
     "code_challenge_methods_supported": ["S256"],
     "authorization_response_iss_parameter_supported": true
   }
   ```

   _Client stores:_ the `issuer`, in the **same per-request record** that holds
   the PKCE `code_verifier`. Step 13 depends on this value being authentic — an
   issuer read from an untrusted source protects nothing.

7. **(Dynamic Client Registration branch only.)** If the authorization server
   does not support Client ID Metadata Documents and the client has no
   pre-registered identity, it registers itself with
   [RFC 7591](https://datatracker.ietf.org/doc/html/rfc7591).

8. **(Dynamic Client Registration branch only.)** The authorization server
   returns a `client_id`. Note that DCR is **deprecated** in this revision and
   retained for backwards compatibility only; prefer a Client ID Metadata
   Document, where the `client_id` is an HTTPS URL the authorization server
   dereferences. In the other two branches the client already has a `client_id`
   and sends no registration request — but under a Client ID Metadata Document
   there is still an exchange: the authorization server fetches the metadata
   document from the `client_id` URL, typically when the authorization request
   at step 10 arrives, and validates the `redirect_uri` against it. Only the
   pre-registered branch involves no exchange at all.

9. **Build the authorization URL and hand it to a real browser.** PKCE is
   required — this is OAuth 2.1 — and `resource` goes in _here_, not only on the
   token request. Scope selection follows a fixed priority: use the `scope` from
   the `WWW-Authenticate` challenge if present; otherwise use `scopes_supported`
   from the PRM; otherwise omit `scope`.

10. **The browser reaches the authorization endpoint.**

    ```http
    GET /authorize?response_type=code
        &client_id=https%3A%2F%2Fagent.example%2Fclient.json
        &redirect_uri=http%3A%2F%2F127.0.0.1%3A49153%2Fcallback
        &code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
        &code_challenge_method=S256
        &scope=files%3Aread
        &resource=https%3A%2F%2Fmcp.example.com%2Fmcp
        &state=af0ifjsldkj HTTP/1.1
    Host: auth.example.com
    ```

11. **The user authenticates and consents.** The consent screen should name the
    resource, because with `resource` present the authorization server knows
    exactly which MCP server this grant is for.

12. **The authorization server redirects back with the code and `iss`.**
    Authorization servers **SHOULD** include `iss`
    ([RFC 9207](https://www.rfc-editor.org/rfc/rfc9207) §2) on success _and_
    error responses.

13. **The client validates `iss` before doing anything else.** Compare it to the
    issuer recorded in step 6 by simple string comparison — no case folding, no
    default-port elision, no trailing-slash normalisation.

    | `authorization_response_iss_parameter_supported` | `iss` present | Action                         |
    | ------------------------------------------------ | ------------- | ------------------------------ |
    | `true`                                           | yes           | Compare to the recorded issuer |
    | `true`                                           | no            | **Reject**                     |
    | `false` or absent                                | yes           | Compare to the recorded issuer |
    | `false` or absent                                | no            | Proceed                        |

    On mismatch the client **MUST NOT** transmit the code to any token endpoint,
    and — because the check applies equally to error responses — **MUST NOT**
    act on or display `error`, `error_description`, or `error_uri`.

14. **Exchange the code, carrying `resource` again.**

    ```http
    POST /token HTTP/1.1
    Host: auth.example.com
    Content-Type: application/x-www-form-urlencoded

    grant_type=authorization_code
    &code=SplxlOBeZQQYbYS6WxSbIA
    &redirect_uri=http%3A%2F%2F127.0.0.1%3A49153%2Fcallback
    &client_id=https%3A%2F%2Fagent.example%2Fclient.json
    &code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
    &resource=https%3A%2F%2Fmcp.example.com%2Fmcp
    ```

15. **The authorization server issues an audience-bound access token.** The
    `resource` value determines the audience. This is the step that makes the
    server-side check in step 16 meaningful.

16. **Retry the original call with the token in the header.** Authorization
    **MUST** be included on _every_ HTTP request — there is no session to
    remember it. Tokens **MUST NOT** appear in the query string.

    ```http
    POST /mcp HTTP/1.1
    Host: mcp.example.com
    Authorization: Bearer eyJhbGciOiJSUzI1NiIs...
    Content-Type: application/json
    Accept: application/json, text/event-stream
    MCP-Protocol-Version: 2026-07-28
    Mcp-Method: tools/list
    ```

17. **The server validates and answers.** Validation is signature, expiry,
    and — the part people skip — that the audience names _this_ server.
    Invalid or expired tokens get `401`; a valid token with insufficient scope
    gets `403`.

---

## Failure modes

| Failure                                              | What the client sees                | Correct handling                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Step 2 has no `resource_metadata`                    | A bare `401`                        | Not an error — servers may rely on the well-known URI instead. Fall back as the spec requires: try the path-inserted `/.well-known/oauth-protected-resource/mcp` first, then the root `/.well-known/oauth-protected-resource`. Only if both fail, surface a configuration error. |
| Step 4 lists an unexpected authorization server      | Discovery "succeeds"                | Treat as hostile. A malicious server can nominate an authorization server it controls; the user is about to be asked to log in to it. Show the user which domain they are authenticating against.                                                                                |
| Step 12 returns a mismatched `iss`                   | Code in hand, wrong issuer          | Discard the code. This is the mix-up defence: without it, an attacker who controls one authorization server can have your code redeemed at another.                                                                                                                              |
| Step 15 returns a token with the wrong audience      | Everything looks fine until step 17 | The `401` at step 17 is correct behaviour. Do not "fix" it by relaxing audience validation on the server.                                                                                                                                                                        |
| Access token expires mid-session                     | `401` on a later call               | Refresh if a refresh token was issued, then retry once. Do not assume one was — the authorization server retains discretion.                                                                                                                                                     |
| Token is valid but scope is short                    | `403` with `insufficient_scope`     | Step-up authorization; see below.                                                                                                                                                                                                                                                |
| Client is behind a proxy that strips `Authorization` | Endless `401` loop                  | Detect the loop. Retry the _same_ call at most a few times, then fail with an actionable message rather than re-prompting the user forever.                                                                                                                                      |

### The step-up path

A token that was sufficient for `files:read` is not sufficient for the write
tool the model just chose. That surfaces at runtime, not at login:

```mermaid
sequenceDiagram
    autonumber
    participant C as MCP Client
    participant M as MCP Server
    participant A as Authorization Server

    C->>M: tools/call write_file with the files:read token
    M-->>C: 403 with error=insufficient_scope<br/>and scope=files:write
    Note over C: Computes the union of previously requested<br/>scopes and the challenged scope
    C->>A: New authorization request for files:read plus files:write
    A-->>C: New access token
    C->>M: Retry tools/call write_file
    M-->>C: 200 with the tool result
```

The union in the middle is the part implementations get wrong. Servers are only
required to name the scopes needed for _this_ operation, so requesting exactly
what the challenge asked for silently drops every permission you already had.

---

## Common pitfalls

### Token passthrough

❌ **What people do:** the MCP server receives `Authorization: Bearer X` from
the agent and forwards `X` to the upstream API it wraps — GitHub, Slack, an
internal service — because the token "came from the user anyway".

✅ **Do instead:** terminate the token at the MCP server. Validate that it was
issued for this server, then use a _separate_ credential the server obtained
for itself to call upstream.

_Why it bites you:_ the spec forbids it in as many words — servers "**MUST NOT**
accept or transit any other tokens" — because it destroys the audience
restriction that everything else depends on. The upstream API cannot tell your
server apart from any other holder of that token, its audit log attributes the
action to the wrong client, and a compromised or merely careless MCP server
becomes a confused deputy that replays user tokens anywhere it likes.

### Skipping the `resource` parameter

❌ **What people do:** omit `resource` because the authorization server in
development ignores it and everything works.

✅ **Do instead:** send it on both the authorization request and the token
request, always. Clients **MUST** send it regardless of whether the
authorization server supports it.

_Why it bites you:_ without it the authorization server has no idea which
resource the token is for, so it issues one with a broad or absent audience.
Any MCP server the user has ever authorized can then spend a token minted for
any other. The failure is invisible until an attacker stands up an MCP server,
gets a user to connect to it, and reuses the token it collects.

### Validating the token but not the audience

❌ **What people do:** verify the JWT signature and expiry against the
authorization server's JWKS, and accept anything that passes.

✅ **Do instead:** additionally require that the audience claim names this
server's canonical URI.

_Why it bites you:_ signature validation only proves the authorization server
issued the token — not that it issued it _to you_. Where several MCP servers
share an authorization server, which is the normal deployment, signature-only
validation means every one of them accepts every other's tokens.

### Treating `scopes_supported` as the complete scope list

❌ **What people do:** request exactly `scopes_supported` from the PRM at login
and treat any later `403` as a bug.

✅ **Do instead:** treat `scopes_supported` as the _minimum_ for basic
functionality, and implement the step-up flow for everything else. Clients
**MUST** treat the scopes in a challenge as authoritative for that operation,
and **MUST NOT** assume any set relationship with `scopes_supported`.

_Why it bites you:_ servers legitimately compute required scopes dynamically
from the tool and its arguments. An agent that cannot step up simply fails on
every privileged tool, and the user sees an inexplicable permission error for
an action they did authorize.

### Reaching for Dynamic Client Registration first

❌ **What people do:** implement DCR as the primary path, because that is what
the older MCP material describes.

✅ **Do instead:** support Client ID Metadata Documents first — a `client_id`
that is an HTTPS URL the authorization server fetches — and keep DCR as the
fallback for authorization servers that do not support them.

_Why it bites you:_ DCR is deprecated in this revision. It also mints a fresh
client record on every install, which authorization server operators experience
as unbounded write traffic from unauthenticated callers, so many disable it —
and then your agent has no way to obtain a `client_id` at all.

### An embedded webview for the consent screen

❌ **What people do:** open the authorization URL in an in-app browser
component, for a tidier experience.

✅ **Do instead:** hand it to the system browser.

_Why it bites you:_ an embedded webview can read the user's keystrokes and the
resulting cookies, so the user has no way to tell a genuine consent screen from
one your application drew. It also cuts them off from their existing session,
password manager, and passkeys — see
[WebAuthn / Passkey Registration & Login](../auth/webauthn-passkey-registration-and-login.md),
whose phishing resistance depends on the browser knowing the true origin.

---

## Security considerations

| Threat                                                       | Mitigation                                                                                                       |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Confused deputy — server replays the caller's token upstream | The passthrough prohibition, plus audience validation at every hop                                               |
| Token minted for server A spent at server B                  | `resource` on both requests (RFC 8707), audience checked on receipt                                              |
| Authorization server mix-up                                  | Record `issuer` from validated metadata; compare `iss` on the response (RFC 9207 §2.4) before redeeming the code |
| Authorization code interception                              | PKCE with `S256`, mandatory under OAuth 2.1                                                                      |
| Malicious MCP server harvesting credentials                  | PRM names the authorization server; show the user the domain they are about to authenticate against              |
| Token leaked via logs or referrers                           | Tokens in the `Authorization` header only, never the query string                                                |
| DNS rebinding against a local server                         | Validate the `Origin` header; bind to `127.0.0.1` rather than `0.0.0.0`                                          |
| Over-broad consent                                           | Least privilege at login, step-up on demand, rather than requesting every scope up front                         |

---

## Implementation checklist

**If you are writing an MCP server**

- [ ] Serve `/.well-known/oauth-protected-resource` with `resource`,
      `authorization_servers`, and `scopes_supported`.
- [ ] Return `401` with `WWW-Authenticate: Bearer resource_metadata="..."` — and
      include `scope` so clients need not guess.
- [ ] Validate signature, expiry, **and audience** on every request. Write a test
      that feeds it a valid token minted for a different resource and asserts a
      `401`.
- [ ] Never forward a received token to an upstream service. Obtain your own.
- [ ] Return `403` with `error="insufficient_scope"` and a `scope` naming
      everything the operation needs, in a single challenge.
- [ ] Validate the `Origin` header; bind to localhost when running locally.
- [ ] Accept tokens only from the `Authorization` header.

**If you are writing an MCP client**

- [ ] Start unauthenticated and drive discovery from the `401`. If it carries
      no `resource_metadata`, try the path-inserted well-known URI, then the
      root one.
- [ ] Reject PRM whose `resource` is not identical to the URL you called.
- [ ] Support both RFC 8414 and OpenID Connect Discovery for AS metadata.
- [ ] Record `issuer` in the same record as the `code_verifier`, and apply the
      `iss` validation table at step 13.
- [ ] Send `resource` on the authorization request _and_ the token request.
- [ ] Use PKCE with `S256`.
- [ ] Prefer a Client ID Metadata Document over Dynamic Client Registration.
- [ ] Implement step-up, requesting the **union** of held and challenged scopes.
- [ ] Bound retries after re-authorization, and track attempts per
      resource-and-operation pair so a misconfiguration cannot loop forever.
- [ ] Open the system browser, never an embedded webview.

---

## Specs and references

**Normative**

- [MCP Authorization — revision 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization) — the flow itself: roles, discovery, the `resource` requirement, token handling, scope challenges, and the passthrough prohibition.
- [RFC 9728 — OAuth 2.0 Protected Resource Metadata](https://www.rfc-editor.org/rfc/rfc9728) — the `/.well-known/oauth-protected-resource` document and the `resource_metadata` challenge parameter. Mandatory for MCP servers.
- [RFC 8707 — Resource Indicators for OAuth 2.0](https://www.rfc-editor.org/rfc/rfc8707) — §2 defines the `resource` parameter and the canonical resource identifier.
- [RFC 9207 — OAuth 2.0 Authorization Server Issuer Identification](https://www.rfc-editor.org/rfc/rfc9207) — §2.4 is the validation rule at step 13.
- [OAuth 2.1 (draft)](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1) — §5 for resource requests, §5.2 for token validation. Mandatory PKCE comes from here.
- [RFC 8414 — Authorization Server Metadata](https://datatracker.ietf.org/doc/html/rfc8414) and [RFC 7591 — Dynamic Client Registration](https://datatracker.ietf.org/doc/html/rfc7591) — discovery and the deprecated registration path.

**Further reading**

- [MCP Authorization Security Considerations](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/security-considerations) — the normative security requirements this page summarises, including confused deputy and open redirection.
- [MCP Authorization Server Discovery](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/authorization-server-discovery) and [Client Registration](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration) — the PRM discovery fallback order, and how the authorization server fetches a Client ID Metadata Document.
- [MCP Security Best Practices](https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices) — non-normative guidance on confused deputy, token passthrough, SSRF during discovery, and mix-up attacks.
- [MCP Authorization Extensions](https://github.com/modelcontextprotocol/ext-auth) — optional, additive mechanisms layered on the core flow.

---

## Related flows

- [OAuth 2.0 Authorization Code + PKCE](../auth/oauth2-authorization-code-pkce.md) — the underlying grant. Read it first; this page is that flow plus discovery and audience binding.
- [MCP Request Lifecycle & Versioning](mcp-request-lifecycle-and-versioning.md) — what the client does once the token is in hand.
- [JWT Access & Refresh Token Rotation](../auth/jwt-access-refresh-token-rotation.md) — how the access token here is kept alive, and what to do when a refresh token is not issued.
- [WebAuthn / Passkey Registration & Login](../auth/webauthn-passkey-registration-and-login.md) — how the user authenticates at step 11.
- [Prompt Injection & Tool Poisoning](prompt-injection-and-tool-poisoning.md) — why token passthrough and broad scopes matter: the attacker is already inside the context window.

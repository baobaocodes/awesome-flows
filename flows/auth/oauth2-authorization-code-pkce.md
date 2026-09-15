---
title: OAuth 2.0 Authorization Code Flow with PKCE
category: auth
tags: [oauth, pkce, authorization-code, sso, delegated-authorization, oauth2.1]
difficulty: intermediate
specs:
  - https://www.rfc-editor.org/rfc/rfc6749#section-4.1
  - https://www.rfc-editor.org/rfc/rfc7636
  - https://www.rfc-editor.org/rfc/rfc9700
  - https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1
updated: 2026-09-25
---

# OAuth 2.0 Authorization Code Flow with PKCE

> How an application gets permission to call an API _on your behalf_ — without
> ever seeing your password, and without an attacker being able to steal the
> authorization code in transit and redeem it for themselves.

_Also known as: auth code + PKCE, "pixie" flow, `response_type=code` with `code_challenge`._

---

## TL;DR

- The app sends the user to the authorization server, gets a short-lived
  **authorization code** back through the browser, then exchanges that code for
  tokens over a direct back-channel call. The browser never sees a token.
- **PKCE** adds a one-time secret: the app hashes a random `code_verifier` into
  a `code_challenge` up front, and must present the original verifier to redeem
  the code. A stolen code alone is worthless.
- PKCE was originally designed for mobile apps, but it now applies to **every
  client**: RFC 9700 requires it for public clients and recommends it for
  confidential ones, and the OAuth 2.1 draft requires it unless a confidential
  client is known to use the OpenID Connect `nonce` properly. Use it always.
- The authorization code is **single-use and short-lived** (≤10 minutes
  recommended). A second redemption attempt must fail, and the AS should also
  revoke the tokens already issued from it.
- `redirect_uri` is compared by **exact string match**. Wildcard or prefix
  matching is the single most common way this flow gets broken.

---

## When to use it

- Any web app, SPA, mobile app, or desktop app that needs to call an API as a
  signed-in user.
- Any time you would otherwise be tempted to ask the user for their password
  for _another_ service.
- Single sign-on. (Add OpenID Connect on top when you need to know _who_ the
  user is, not just to act for them — see [Related flows](#related-flows).)

## When _not_ to use it

- **Machine-to-machine calls with no user involved.** There is no one to
  redirect to a consent screen. Use the client credentials grant
  ([RFC 6749 §4.4](https://www.rfc-editor.org/rfc/rfc6749#section-4.4)).
- **First-party login to your own API where you control both ends and there is
  no third party to delegate to.** A plain session cookie is simpler and has
  fewer moving parts. OAuth solves _delegation_; if nothing is being delegated
  you are paying its complexity cost for nothing.
- **Input-constrained devices** (TVs, CLI tools with no browser). Use the
  device authorization grant ([RFC 8628](https://www.rfc-editor.org/rfc/rfc8628)).
- The **implicit grant** (`response_type=token`) and the **resource owner
  password credentials grant** are not alternatives to consider — both are
  omitted from OAuth 2.1 and must not be used in new work.

---

## Actors and terminology

| Actor       | Spec term                                                                              | What it is                                                                                                                                |
| ----------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| User        | _Resource Owner_ ([RFC 6749 §1.1](https://www.rfc-editor.org/rfc/rfc6749#section-1.1)) | The human who owns the data and grants access.                                                                                            |
| Browser     | _User Agent_                                                                           | Carries the front-channel redirects. Untrusted: assume anything passing through it can be read.                                           |
| App         | _Client_                                                                               | The application requesting access. **Public** if it cannot keep a secret (SPA, mobile); **confidential** if it can (server-side web app). |
| Auth server | _Authorization Server_ (AS)                                                            | Authenticates the user, gets consent, issues codes and tokens.                                                                            |
| API         | _Resource Server_ (RS)                                                                 | Accepts the access token and serves the data.                                                                                             |

**Key terms**

- **`code_verifier`** — a high-entropy random string, 43–128 characters from
  the unreserved set `[A-Za-z0-9-._~]`. Generated by the client per
  authorization request, kept in memory/session, **never sent through the
  browser**. Generate 32 random bytes and base64url-encode them; that yields
  exactly 43 characters.
- **`code_challenge`** — `BASE64URL(SHA-256(ASCII(code_verifier)))`, base64url
  **without padding**. This _is_ sent through the browser. It is a one-way
  hash, so seeing it does not let an attacker derive the verifier.
- **`code_challenge_method`** — `S256`. The other registered value, `plain`,
  sends the verifier itself as the challenge. It still protects against an
  attacker who intercepts only the authorization _response_, but none at all
  against one who can read the _request_; RFC 7636 says it SHOULD NOT be used,
  and the OAuth 2.1 draft forbids it.
- **Authorization code** — a short-lived, single-use credential bound to the
  triple _(client_id, redirect_uri, code_challenge)_. Passed through the
  browser, which is exactly why it needs PKCE.
- **`state`** — opaque value echoed back unchanged. Historically the CSRF
  defence; today its main job is carrying your own round-trip data, such as the
  page the user was trying to reach.

---

## Sequence diagram

```mermaid
sequenceDiagram
    autonumber
    actor RO as Resource Owner
    participant UA as User Agent
    participant C as Client
    participant AS as Authorization Server
    participant RS as Resource Server

    Note over RO,C: Phase 1 — Prepare the PKCE pair
    RO->>C: Clicks "Sign in"
    Note over C: code_verifier = base64url of 32 random bytes<br/>code_challenge = base64url of SHA-256 of code_verifier<br/>Both stored in the user's server-side session
    C-->>UA: 302 Found to the authorization endpoint

    Note over UA,AS: Phase 2 — Authorization request, front channel
    UA->>AS: GET /authorize with client_id, redirect_uri, scope,<br/>state, code_challenge, code_challenge_method=S256
    Note over AS: Validates client_id<br/>Exact-string-matches redirect_uri against registration<br/>Stores code_challenge alongside this request
    AS-->>UA: Login and consent UI
    RO->>UA: Authenticates and grants consent
    UA->>AS: Submits credentials and consent
    Note over AS: Mints single-use authorization code, bound to<br/>client_id + redirect_uri + code_challenge
    AS-->>UA: 302 Found to redirect_uri with code, state, iss
    UA->>C: GET the redirect_uri callback
    Note over C: Checks state against the session<br/>Checks iss identifies the expected AS

    Note over C,AS: Phase 3 — Token request, back channel
    C->>AS: POST /token with grant_type, code, redirect_uri,<br/>client_id and the original code_verifier
    Note over AS: SHA-256 of code_verifier must equal stored code_challenge<br/>Code must be unredeemed, unexpired, and bound to this client
    alt All checks pass
        AS-->>C: 200 OK with access_token, refresh_token, expires_in
    else Verifier mismatch or code already redeemed
        AS-->>C: 400 invalid_grant
        Note over AS: On replay, also revokes every token<br/>previously issued from this code
    end

    Note over C,RS: Phase 4 — Call the API
    C->>RS: GET /resource with Authorization Bearer header
    RS-->>C: 200 OK with the protected resource
```

---

## Architecture

Which channel a value travels on is the whole security argument, so it is worth
seeing separately. Everything on the **front channel** is attacker-visible;
everything on the **back channel** is not.

```mermaid
flowchart LR
    subgraph Front["Front channel — through the browser, assume observable"]
        direction TB
        F1["code_challenge<br/>state"]
        F2["authorization code<br/>iss"]
    end

    subgraph Back["Back channel — direct TLS, client to AS"]
        direction TB
        B1["code_verifier<br/>client credentials"]
        B2["access_token<br/>refresh_token"]
    end

    C["Client"] --> F1 --> AS["Authorization Server"]
    AS --> F2 --> C
    C --> B1 --> AS
    AS --> B2 --> C
    C -->|"Bearer access_token"| RS["Resource Server"]
```

---

## Step-by-step

Numbers match the `autonumber` labels in the sequence diagram above.

1. **User starts the sign-in.** The click that begins the flow. Nothing
   security-relevant has happened yet, but note where it happens: on the
   _client_, which is what lets the client generate and retain the verifier.

   Immediately after, the client generates the PKCE pair:

   ```text
   code_verifier  = base64url(random_bytes(32))       # 43 chars, no padding
                  = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"

   code_challenge = base64url(sha256(ascii(code_verifier)))
                  = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
   ```

   Store the **verifier** server-side against the user's session (or in memory
   for a native app). Do not put it in a cookie readable by JavaScript, and do
   not derive it from anything predictable such as a timestamp or session ID —
   [RFC 7636 §7.1](https://www.rfc-editor.org/rfc/rfc7636#section-7.1) says the
   verifier SHOULD carry at least 256 bits of entropy, which is exactly 32
   bytes from a suitable (cryptographically secure) random number generator.

2. **Client redirects the browser to the authorization endpoint.** A plain
   `302` (or a rendered link). The client is finished until the callback
   arrives; it holds no connection open.

3. **Browser issues the authorization request.**

   ```http
   GET /authorize
     ?response_type=code
     &client_id=s6BhdRkqt3
     &redirect_uri=https%3A%2F%2Fapp.example.com%2Fcallback
     &scope=invoices.read
     &state=af0ifjsldkj
     &code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
     &code_challenge_method=S256 HTTP/1.1
   Host: as.example.com
   ```

   _The AS validates:_ that `client_id` is registered; that `redirect_uri`
   **string-equals** one of that client's registered URIs; that
   `code_challenge_method` is one it supports. It then stores the
   `code_challenge` against this pending authorization. It has no way to check
   the challenge yet — that happens at step 9.

4. **AS returns the login and consent UI.** If the user already has a session
   with the AS, this and step 5 may be skipped entirely — that is what makes
   this flow single sign-on.

5. **User authenticates and consents.** Password, passkey, MFA — entirely the
   AS's business. The client is never involved, which is the central privacy
   property of OAuth: your credentials are shown only to the party that issued
   them.

6. **Browser submits the credentials and consent to the AS.**

   _The AS then mints the authorization code_, binding it to `client_id`,
   `redirect_uri`, and `code_challenge`. All three bindings are checked at
   redemption. Keep the lifetime short —
   [RFC 6749 §4.1.2](https://www.rfc-editor.org/rfc/rfc6749#section-4.1.2)
   recommends a maximum of 10 minutes.

7. **AS redirects the browser back to the client.**

   ```http
   HTTP/1.1 302 Found
   Location: https://app.example.com/callback
     ?code=SplxlOBeZQQYbYS6WxSbIA
     &state=af0ifjsldkj
     &iss=https%3A%2F%2Fas.example.com
   ```

   The `iss` parameter ([RFC 9207](https://www.rfc-editor.org/rfc/rfc9207)) is
   what lets a client with more than one configured AS detect a mix-up attack.
   Include it, and check it.

8. **Browser delivers the code to the client's callback.**

   _The client validates:_ that `state` matches the value stored in **this
   user's session** (not merely that it is a value the server once issued —
   see Pitfalls); that `iss` is the AS it actually sent the user to; that a
   `code` is present and no `error` parameter is set.

9. **Client redeems the code on the back channel.** This is a direct
   server-to-server `POST` over TLS. The browser is not involved and never sees
   the verifier or the tokens.

   ```http
   POST /token HTTP/1.1
   Host: as.example.com
   Content-Type: application/x-www-form-urlencoded
   Authorization: Basic czZCaGRSa3F0MzpnWDFmQmF0M2JW    # confidential clients only

   grant_type=authorization_code
   &code=SplxlOBeZQQYbYS6WxSbIA
   &redirect_uri=https%3A%2F%2Fapp.example.com%2Fcallback
   &client_id=s6BhdRkqt3
   &code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
   ```

   _The AS validates, in this order:_ the code exists, has not expired, and has
   **not been redeemed before**; the code was issued to this `client_id`; the
   submitted `redirect_uri` string-equals the one from step 3; and
   `BASE64URL(SHA-256(code_verifier))` equals the stored `code_challenge`. It
   then marks the code redeemed — atomically, so two concurrent redemptions
   cannot both succeed.

10. **AS returns the tokens.**

    ```http
    HTTP/1.1 200 OK
    Content-Type: application/json
    Cache-Control: no-store

    {
      "access_token": "2YotnFZFEjr1zCsicMWpAA",
      "token_type": "Bearer",
      "expires_in": 3600,
      "refresh_token": "tGzv3JOkF0XG5Qx2TlKWIA",
      "scope": "invoices.read"
    }
    ```

    Note `Cache-Control: no-store` — required, and easy to lose behind a
    misconfigured reverse proxy.

11. **Failure branch: the checks did not pass.** The AS returns
    `400 invalid_grant` with no detail about _which_ check failed — a
    distinguishing error message would tell an attacker whether they had a
    valid code but the wrong verifier.

    If the failure was a **replay** of an already-redeemed code, RFC 6749 §4.1.2
    says the AS SHOULD additionally revoke every token previously issued from
    that code. That turns a successful code theft into a detectable, contained
    event: the legitimate user is logged out and the theft is visible in the
    logs.

12. **Client calls the API with the access token.**

    ```http
    GET /invoices HTTP/1.1
    Host: api.example.com
    Authorization: Bearer 2YotnFZFEjr1zCsicMWpAA
    ```

13. **Resource server returns the resource,** after validating the token's
    signature (or introspecting it), issuer, audience, expiry, and that its
    scopes cover this operation. A bearer token is exactly what it sounds like:
    whoever holds it can use it. That is why access tokens are short-lived and
    why sender-constraining them (DPoP, mTLS) is worth considering for
    high-value APIs.

---

## Failure modes

| Failure                                                                       | What the user sees                                       | Correct handling                                                                                                                                                                                          |
| ----------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User denies consent at step 5                                                 | Redirect to `redirect_uri?error=access_denied&state=...` | Handle it as a normal outcome, not an exception. Show a "you'll need to grant access to continue" page, not a stack trace.                                                                                |
| Client crashes between steps 8 and 9                                          | Nothing; the code simply expires                         | Safe by construction. The verifier died with the session, so the code is unredeemable by anyone.                                                                                                          |
| Code redeemed twice (network retry)                                           | `400 invalid_grant` on the second call                   | The AS **must** reject it. Make redemption atomic (`UPDATE … WHERE redeemed_at IS NULL`), or a race lets both requests through. Clients must not blindly retry a failed token request with the same code. |
| Code stolen from browser history, logs, or a malicious app on the same device | Attacker's redemption fails                              | This is the attack PKCE exists to stop: without the verifier, step 9 fails at the challenge comparison.                                                                                                   |
| `state` does not match on return                                              | Sign-in fails                                            | Abort the flow and discard the code. Do not "recover" by starting a fresh authorization request automatically — that trains users to click through a loop an attacker can drive.                          |
| Access token expires mid-session                                              | `401` from the API                                       | Use the refresh token to get a new access token. See [JWT Access & Refresh Token Rotation](jwt-access-refresh-token-rotation.md).                                                                         |
| Refresh token rejected                                                        | User is signed out                                       | Restart the full authorization flow. Do not retry the refresh.                                                                                                                                            |

---

## Common pitfalls

### Matching `redirect_uri` loosely

❌ **What people do:** register `https://app.example.com/*`, or match by prefix
so that any path under the origin is accepted, or allow the client to append
query parameters.

✅ **Do instead:** register the complete URI and compare with simple string
equality, per [RFC 9700 §2.1](https://www.rfc-editor.org/rfc/rfc9700#section-2.1).
The one carve-out is native apps on the loopback interface, where the port must
be ignored because it is assigned at runtime
([RFC 8252 §7.3](https://www.rfc-editor.org/rfc/rfc8252#section-7.3)).

_Why it bites you:_ one open redirect anywhere under that origin — an
unvalidated `?next=` parameter on a marketing page is enough — and the
authorization code is delivered to the attacker's server instead of yours.

### Treating PKCE as "the mobile thing"

❌ **What people do:** skip PKCE for confidential server-side clients, reasoning
that the client secret already authenticates the token request.

✅ **Do instead:** use PKCE on every client, every time.
[RFC 9700 §2.1.1](https://www.rfc-editor.org/rfc/rfc9700#section-2.1.1)
recommends it for confidential clients (and requires it for public ones); the
OAuth 2.1 draft makes it mandatory unless the AS has reasonable assurance the
client implements the OpenID Connect `nonce` check.

_Why it bites you:_ the client secret protects the _token request_, but not the
code's journey through the browser. Without PKCE, an attacker who steals a
_victim's_ code — via an open redirect, a referrer leak, or a log — starts their
own sign-in with your client and swaps the stolen code into their own callback.
Your client dutifully redeems it with its secret, and the attacker's session in
your app is now attached to the victim's account
([RFC 9700 §4.5](https://www.rfc-editor.org/rfc/rfc9700#section-4.5)). That is
authorization code injection, and it does not care whether you are
confidential. With PKCE the code is bound to the victim's `code_challenge`, and
the verifier in the attacker's session does not match it.

### Storing tokens in `localStorage`

❌ **What people do:** SPA fetches tokens in the browser and puts the access and
refresh tokens in `localStorage` for convenience.

✅ **Do instead:** run a backend-for-frontend. The server completes the code
exchange, holds the tokens, and gives the browser a `HttpOnly`, `Secure`,
`SameSite` session cookie. If a pure SPA is genuinely unavoidable, keep tokens
in a closure in memory only, accept that they die on refresh, and use short
lifetimes with rotating refresh tokens.

_Why it bites you:_ `localStorage` is readable by every script on the origin.
One compromised npm dependency or one XSS and the attacker exfiltrates a
refresh token — a durable credential they can use from their own machine, long
after you have patched.

### Validating `state` against the wrong thing

❌ **What people do:** check that the returned `state` exists in a server-side
table of issued values, then accept it.

✅ **Do instead:** check that it matches the value stored in _this browser's
session_. Bind it to the session cookie, then delete it.

_Why it bites you:_ a global lookup accepts a `state` the attacker obtained
from their _own_ legitimate sign-in, which is precisely the CSRF case the check
was supposed to prevent.

### Assuming the AS actually enforced PKCE

❌ **What people do:** send `code_challenge` and assume the server checked it.

✅ **Do instead:** read `code_challenge_methods_supported` from the AS's
metadata document ([RFC 8414](https://www.rfc-editor.org/rfc/rfc8414)) and
confirm `S256` is listed before trusting the flow.

_Why it bites you:_ an AS that does not implement PKCE ignores the unknown
parameter and returns a code anyway. Everything appears to work, and you have
none of the protection you think you have. Downgrade defence runs both ways.
Clients must not fall back to `plain` after trying `S256`
([RFC 7636 §7.2](https://www.rfc-editor.org/rfc/rfc7636#section-7.2)). And an AS
must reject a token request that carries a `code_verifier` when the
authorization request had no `code_challenge` — otherwise an attacker can strip
the challenge from their own request and inject the resulting unbound code
([RFC 9700 §2.1.1](https://www.rfc-editor.org/rfc/rfc9700#section-2.1.1),
[§4.8](https://www.rfc-editor.org/rfc/rfc9700#section-4.8)).

### Letting the code reach a log

❌ **What people do:** log full request URLs at the callback endpoint, or let an
APM agent or reverse proxy capture query strings by default.

✅ **Do instead:** redact `code`, `state`, and any `access_token` at the logging
layer. Audit what your proxy, CDN, and error tracker record — this is usually
where the leak is, not in your own code.

_Why it bites you:_ codes are short-lived, but log aggregators are not, and they
are typically readable by a far wider group than your token store. PKCE limits
the damage; it does not make a leaked code harmless if the verifier leaks the
same way.

---

## Security considerations

| Threat                                                                                                             | Mitigation                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Authorization code interception** — malicious app registers the same custom URI scheme and receives the callback | PKCE: the interceptor has no `code_verifier`, so redemption fails ([RFC 7636 §1](https://www.rfc-editor.org/rfc/rfc7636#section-1))                                        |
| **Authorization code injection** — attacker injects a stolen victim's code into their own session with the client  | PKCE binding (or, for confidential OIDC clients, a per-transaction `nonce`) ([RFC 9700 §4.5](https://www.rfc-editor.org/rfc/rfc9700#section-4.5))                          |
| **CSRF on the callback** — attacker forces a victim's browser to complete _their_ sign-in                          | `state` bound to the session cookie; PKCE also covers this when the verifier is per-session                                                                                |
| **Mix-up attack** — client with several configured ASes is tricked into sending a code to the wrong one            | `iss` in the authorization response ([RFC 9207](https://www.rfc-editor.org/rfc/rfc9207))                                                                                   |
| **Open-redirect exfiltration** of the code                                                                         | Exact-match `redirect_uri`; no user-controlled redirect targets on the client origin                                                                                       |
| **Code replay**                                                                                                    | Single-use codes, atomic redemption, revoke all tokens issued from a replayed code                                                                                         |
| **Stolen bearer token used from elsewhere**                                                                        | Short access-token lifetimes; sender-constrain with DPoP ([RFC 9449](https://www.rfc-editor.org/rfc/rfc9449)) or mTLS ([RFC 8705](https://www.rfc-editor.org/rfc/rfc8705)) |
| **PKCE downgrade** — challenge stripped, or `plain` substituted                                                    | AS rejects a `code_verifier` for a code issued without a `code_challenge` (RFC 9700 §4.8); client never falls back to `plain` and requires `S256` in AS metadata           |

---

## Implementation checklist

- [ ] `code_verifier` comes from a cryptographic RNG (32 bytes → 43 base64url chars), never from a timestamp, UUID, or session ID.
- [ ] `code_challenge_method=S256`. `plain` is never sent and never accepted.
- [ ] Verifier stored server-side against the session; it never enters the browser.
- [ ] `redirect_uri` fully registered and compared with exact string equality.
- [ ] `state` generated per request, bound to the session cookie, compared on return, then deleted.
- [ ] `iss` checked on the authorization response.
- [ ] Authorization codes are single-use, expire in ≤10 minutes, and are redeemed atomically.
- [ ] Replayed code triggers revocation of all tokens issued from it, and raises an alert.
- [ ] Token endpoint responses carry `Cache-Control: no-store` all the way through your proxies.
- [ ] Tokens are held server-side behind an `HttpOnly` cookie, or in memory — never in `localStorage` or `sessionStorage`.
- [ ] `code`, `state`, and tokens are redacted in application logs, proxy logs, and the APM/error tracker.
- [ ] AS metadata is fetched and `code_challenge_methods_supported` is confirmed to include `S256`.
- [ ] Access tokens are validated at the resource server for signature, `iss`, `aud`, `exp`, and scope — not just decoded.

---

## Specs and references

**Normative**

- [RFC 6749 — The OAuth 2.0 Authorization Framework](https://www.rfc-editor.org/rfc/rfc6749) — §4.1 defines the authorization code grant; §4.1.2 covers code lifetime and single use; §10 collects the original security considerations.
- [RFC 7636 — Proof Key for Code Exchange](https://www.rfc-editor.org/rfc/rfc7636) — PKCE itself. §4 is the verifier/challenge construction, §7 the security analysis including the `plain` downgrade.
- [RFC 9700 — OAuth 2.0 Security Best Current Practice](https://www.rfc-editor.org/rfc/rfc9700) — BCP 240. The single most useful document here: it supersedes much of RFC 6749 §10 and states current requirements on redirect matching, PKCE ([§2.1.1](https://www.rfc-editor.org/rfc/rfc9700#section-2.1.1)), authorization code injection ([§4.5](https://www.rfc-editor.org/rfc/rfc9700#section-4.5)), PKCE downgrade ([§4.8](https://www.rfc-editor.org/rfc/rfc9700#section-4.8)), and refresh tokens.
- [draft-ietf-oauth-v2-1 — OAuth 2.1](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1) — consolidates 6749 + 7636 + BCP into one document. Mandates PKCE except for confidential clients with verified `nonce` use (§7.5.1), forbids `plain` (§7.5.2), removes the implicit and password grants. Still a draft; treat it as direction of travel, cite the RFCs for normative claims.
- [RFC 6750 — Bearer Token Usage](https://www.rfc-editor.org/rfc/rfc6750) — the `Authorization: Bearer` header and its error responses.
- [RFC 8252 — OAuth 2.0 for Native Apps](https://www.rfc-editor.org/rfc/rfc8252) — BCP 212. Required reading for mobile and desktop: system browser vs embedded webview, loopback and custom-scheme redirects.
- [RFC 9207 — Authorization Server Issuer Identification](https://www.rfc-editor.org/rfc/rfc9207) — the `iss` response parameter and the mix-up attack it defeats.
- [RFC 8414 — Authorization Server Metadata](https://www.rfc-editor.org/rfc/rfc8414) — the `.well-known/oauth-authorization-server` discovery document.

**Further reading**

- [OAuth 2.0 for Browser-Based Applications](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-browser-based-apps) — the current IETF guidance for SPAs, and the strongest published argument for the backend-for-frontend pattern.
- [oauth.net/2/pkce](https://oauth.net/2/pkce/) — short, accurate orientation with a maintained list of related specs.

---

## Related flows

- [JWT Access & Refresh Token Rotation](jwt-access-refresh-token-rotation.md) — what to do with the tokens once step 10 hands them to you, and how to keep sessions alive safely.
- [WebAuthn / Passkey Registration & Login](webauthn-passkey-registration-and-login.md) — how the user proves who they are at step 5.
- [OpenID Connect Authorization Code Flow](openid-connect-authorization-code.md) — the same round trip, plus an ID token, when you need to know _who_ the user is and not only what you may do.
- [CORS Preflight](../networking/cors-preflight.md) — why the browser sends an `OPTIONS` request before your SPA's cross-origin API call, and why `Authorization` headers trigger it.
- [MCP Authorization](../ai-systems/mcp-authorization.md) — this flow assembled for AI agents, with resource discovery and mandatory audience binding on top.

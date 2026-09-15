# Contributing to Awesome Flows

Thank you for considering a contribution. The value of this repository is that
every page has the _same_ shape and the same standard of accuracy — so most of
what follows is about keeping that consistency, not about gatekeeping.

**Corrections are the most valuable contribution you can make.** If a page
contradicts a specification, that is a bug. Open an issue or a PR with the
section reference and we will fix it quickly.

---

## Ways to contribute

| I want to…                               | Do this                                                                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Fix an inaccuracy                        | Open a PR, or a [flow correction issue](.github/ISSUE_TEMPLATE/flow-correction.yml) with the spec reference               |
| Add a new flow                           | Check the [roadmap](README.md#roadmap), open a [new flow issue](.github/ISSUE_TEMPLATE/new-flow.yml) to claim it, then PR |
| Suggest a flow you will not write        | Open a new flow issue and say so — someone else may pick it up                                                            |
| Improve a diagram                        | PR. Diagrams are the point of this project.                                                                               |
| Add a pitfall you have hit in production | PR. These are gold, and they are the section readers value most.                                                          |

---

## Adding a new flow

1. **Check it is not already covered or claimed** — search the issues.
2. **Copy [`templates/FLOW_TEMPLATE.md`](templates/FLOW_TEMPLATE.md)** to
   `flows/<category>/<kebab-case-name>.md`.
3. **Fill it in.** Delete the HTML comments as you go. Delete any section that
   genuinely does not apply and say why in the PR — do not pad it with filler.
4. **Add a row** to the category `README.md` and to the index table in the root
   `README.md`.
5. **Validate** (see below), then open a PR.

### The section order is fixed

Do not add, remove, or reorder top-level sections. A reader who has read one
page should be able to navigate any other page without looking. The order is:

1. Title + one-line definition
2. TL;DR
3. When to use / when not to
4. Actors and terminology
5. Sequence diagram
6. Architecture _(optional — only if it shows something the sequence diagram cannot)_
7. Step-by-step
8. Failure modes
9. Common pitfalls
10. Security considerations _(where applicable)_
11. Implementation checklist
12. Specs and references
13. Related flows

---

## Content standards

**Every claim must be traceable to the references section.** If you cannot cite
it, leave it out. Where a claim is _convention_ rather than normative — the
`Idempotency-Key` header name, for instance — say so on the page.

**Cite specific sections.** `RFC 8446 §4.1.3`, not "the TLS RFC". Use anchor
links where the document supports them.

**State versions explicitly.** "OAuth 2.1 draft behaviour; RFC 6749 differs in
X" is useful. "The spec says" is not.

**Pitfalls must be real.** Every entry in Common pitfalls should be a mistake
someone has actually shipped, with a concrete production consequence. If you
cannot write the "why it bites you" line, it is not a pitfall — it is a style
preference.

**Show real wire formats.** Actual HTTP requests with real header names, actual
SQL, actual JSON. Not pseudocode, and not `<your-value-here>` where a real
example would be clearer.

**Where implementations diverge from the spec in practice, put it in Pitfalls.**
Do not smooth it over, and do not pretend the spec is what everyone does.

**Write for someone building this next week.** Not for someone browsing. The
implementation checklist should be pasteable into a ticket.

---

## Mermaid conventions

These keep diagrams consistent and readable. CI checks that they parse and that
the autonumber contract holds; the rest are checked in review.

**Required**

- **`autonumber` on every sequence diagram.** The generated numbers are a
  contract: step _n_ in the diagram is step _n_ in the walkthrough. Keep them in
  sync — if you insert a message, renumber the prose.
- **One walkthrough item per message, and nothing else.** `autonumber`
  increments on **messages only** — never on `Note over`. A walkthrough that
  numbers a state change drifts out of sync from that point on, which is the
  one thing this project promises not to do. Fold state changes into the prose
  of the message they explain, marked `_No message on the wire:_` or
  `_Receiver validates:_`. Remember that `autonumber` counts **every branch** of
  an `alt`, so each branch needs its own item.
- **Put the contract diagram under a `## Sequence diagram…` heading.** That
  heading is what marks a diagram as one the walkthrough must match; CI checks
  the counts. Illustrative diagrams — a problem statement, a failure path, a
  variant — go under a descriptive heading instead and carry no walkthrough.
- **Declare participants up front** with `participant X as Name`, using the
  spec's own vocabulary (`Authorization Server`, not `auth thing`).
- **Participant order follows first appearance**, left to right.

**Forbidden**

- **No `rect rgb(...)` blocks and no custom colors or CSS.** A hard-coded fill
  is unreadable in whichever GitHub theme it was not chosen for. Use
  `Note over A,B: Phase 1 — …` to label phases instead.
- **No `<` or `>` inside diagram text.** They break rendering. Write
  `Bearer ACCESS_TOKEN`, not `Bearer <access_token>`.

**Encouraged**

- `Note over X:` for state changes that are not messages — "generates
  `code_verifier`, stores in session".
- `alt` / `else` / `opt` / `loop` for branching. Remember that `autonumber`
  keeps counting through every branch.
- `<br/>` to wrap long message labels rather than letting the diagram sprawl.
- A second, smaller diagram for a failure path, when prose alone would be hard
  to follow. Several of the existing pages do this.

---

## Validating your changes

The repository has no build step. Validation is rendering and linting, and CI
runs all three on every PR.

These are the same three commands CI runs, so if they pass locally the PR will
pass:

```bash
# 1. Structure: frontmatter, required sections, Mermaid conventions,
#    relative links, and index coverage. No dependencies, runs in a second.
node .github/scripts/check-structure.mjs .

# 2. Markdown lint
npx -y markdownlint-cli2 "**/*.md"

# 3. Every Mermaid block must parse. A broken block renders as a raw code
#    fence on GitHub, which is easy to miss in review. This one downloads
#    Chromium on first run, so it takes a few minutes.
node .github/scripts/check-mermaid.mjs .
```

Run at least the first two before opening a PR.

**Also check by eye:** open the file in GitHub's preview (or push to a fork) and
confirm the diagrams render in **both light and dark theme**. This is the one
check tooling cannot do for you.

---

## Review checklist

A reviewer will check:

- [ ] Section order matches the template exactly.
- [ ] Frontmatter is complete: `title`, `category`, `tags`, `difficulty`, `specs`, `updated`.
- [ ] Every URL in `specs:` also appears in the Specs and references section.
- [ ] Sequence diagram has `autonumber`, and its message count matches the numbered walkthrough exactly — `Note over` is not a step. (CI checks this.)
- [ ] No `rect rgb(...)`, no custom colors, no `<`/`>` in diagram text.
- [ ] Diagrams render legibly in both GitHub themes.
- [ ] Every factual claim is supported by a linked reference, with a section anchor where possible.
- [ ] Pitfalls are real, each with a ❌ / ✅ pair and a concrete "why it bites you".
- [ ] Actor names use the spec's vocabulary.
- [ ] Wire formats are real, not pseudocode.
- [ ] Relative links to other flows resolve.
- [ ] Rows added to both the category README and the root README index.
- [ ] Roadmap entry removed from both READMEs if this flow was on it.

---

## Style notes

- **Prose, not bullet soup.** Explain the _why_. A reader can find the _what_ in
  the spec; they came here for the reasoning.
- **Second person, present tense.** "You send the code verifier", not "the code
  verifier is sent".
- **Define jargon on first use**, then use it freely.
- **Do not editorialise about vendors.** Compare implementations factually.
- **British or American spelling are both fine** — just be consistent within a
  page.
- **Line length is not enforced.** Wrapping around 80 columns keeps diffs
  readable, but it is a suggestion.

---

## Licensing your contribution

By contributing you agree that your prose and diagrams are licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) and your code snippets
under MIT, matching [LICENSE](LICENSE).

Do not paste text from copyrighted sources — including RFC prose — beyond short
quotations. Link to specs; do not copy them.

---

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). Critique
the content, not the contributor: "this contradicts RFC 8446 §4.1.3" is a good
review comment, and it is always welcome.

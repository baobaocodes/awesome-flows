## What does this PR do?

<!-- One or two sentences. If it adds a flow, name it. If it fixes an
     inaccuracy, say what was wrong. -->

**Type:** <!-- new flow / correction / diagram improvement / new pitfall / docs -->

Closes #

---

## For a correction

**What the page said:**

**What is actually correct:**

**Source:** <!-- Spec with section anchor, e.g. RFC 8446 §4.1.3 -->

---

## For a new flow

- [ ] Copied from `templates/FLOW_TEMPLATE.md`; section order unchanged
- [ ] Frontmatter complete (`title`, `category`, `tags`, `difficulty`, `specs`, `updated`)
- [ ] Every URL in `specs:` also appears in the Specs and references section
- [ ] Sequence diagram uses `autonumber`, and its step count matches the numbered walkthrough
- [ ] Row added to the category `README.md`
- [ ] Row added to the index table in the root `README.md`
- [ ] Removed from the roadmap in both READMEs, if it was listed there
- [ ] Any HTML comments from the template have been deleted

---

## Checks

- [ ] Every claim is traceable to a linked reference
- [ ] Pitfalls are real mistakes with a concrete "why it bites you", not hypotheticals
- [ ] Wire formats are real (actual headers, SQL, JSON) — not pseudocode
- [ ] No `rect rgb(...)`, custom colors, or `<`/`>` inside Mermaid text
- [ ] **Diagrams render correctly in both GitHub light and dark themes** (checked by eye — CI cannot do this)
- [ ] `npx -y markdownlint-cli2 "**/*.md"` passes
- [ ] Relative links to other flows resolve

---

## Anything you are unsure about?

<!-- Genuinely useful. Flag any claim you are not fully confident in and a
     reviewer will check it against the spec rather than assuming. -->

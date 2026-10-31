<!--
DevTrace PR template — place at .github/pull_request_template.md
Hackathon rules: name every open-weight model the PR uses and any AI coding assistant that helped write it. Closed model APIs (OpenAI, Anthropic, Gemini, etc.) are not allowed.
-->

## Summary

<!-- What does this PR change, in 1-3 sentences? -->

## Related issue

<!-- e.g. Closes #12. Write "N/A" if there is none. -->

## Type of change

- [ ] Ingestion (GitHub Issues / PRs / Discussions / other)
- [ ] Decision extraction (decided / rejected / why)
- [ ] Evidence linking (sources, citations, code references)
- [ ] Surfacing decisions (bot / CI check / UI)
- [ ] Tests / CI
- [ ] Docs
- [ ] Refactor / chore

**Files changed by area:**
<!-- e.g. server/src/ingest/, server/src/extraction/, client/app/ -->

## Models used in this PR

<!-- Open-weight only (Llama, Gemma, Qwen, Mistral, DeepSeek, Phi, etc.). Only list models the code actually calls. -->

- [ ] This PR adds or changes model usage (fill the table below)
- [ ] This PR does **not** touch model usage (checked the diff, not memory)

| Model | Where it is used (file / module) | Why this model |
|-------|----------------------------------|----------------|
|       |                                  |                |

## AI coding assistants used

<!-- Copilot, Cursor, Claude Code, etc. Write "None" if written entirely by hand. -->

- Assistant(s) and version:
- Parts generated with AI (files / functions):
- Parts written or substantially rewritten by hand:
- AI output rejected or heavily corrected, and why:

## How was this tested?

- [ ] Unit tests added or updated (list them):
- [ ] CI run link (green, on this PR's head commit):
- [ ] Ran locally on a real input (command + first ~10 lines of output):
- [ ] `examples/` has a new sample input AND the output the pipeline actually produced (not hand-written)

## Evidence (required for extraction or linking changes)

<!-- For each decision record this PR produces or changes. Write "N/A" if not applicable. -->

- **Decided:**
- **Rejected alternative(s):**
- **Why:**
- **Sources:** <!-- each link must open the original discussion / PR / comment -->
- **Verbatim source quote:**
- **Code linked:** <!-- file path + symbol, and how it survives a rename/move -->

## Extraction quality (required if extraction logic changed)

- Dataset / threads evaluated:
- Decisions found vs. human-marked correct:
- Rejected alternatives recovered vs. missed:
- Known false positives:

## Checklist

- [ ] Targets `main`, branch up to date, no direct pushes
- [ ] No API keys, tokens, or secrets in the diff (including `examples/`)
- [ ] No closed model API calls (OpenAI, Anthropic, Gemini, etc.) added or left in the diff
- [ ] No `TODO`, `FIXME`, or placeholder return values added
- [ ] Every feature is fully implemented, not stubbed
- [ ] New models/dependencies are listed in `HACKATHON.md` and are open-weight
- [ ] I can explain every change in this PR
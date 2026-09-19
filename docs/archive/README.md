# Cadence — Documentation Archive

> **Archive index.** The files in `docs/archive/` are the original numbered source documents (01–12) from which the current `spec/` and `docs/` structure was distilled. They are preserved here for historical context, research notes, prompt text, and build history.
>
> **Do not use these as the source of truth.** For authoritative requirements and contracts, use `spec/`. For operational guidance, use `docs/governance/`. For research context, use `docs/research/`.
>
> **Archived:** 2026-09-19 (documentation restructuring audit).

---

## Archive Contents

| File | What it was | Where its content went |
|---|---|---|
| `01-idea-research-and-spec.md` | Original product spec, competitor research, tech stack rationale | Requirements → `spec/system-requirements.md`; Research → `docs/research/product-vision-and-prior-art.md` |
| `02-implementation-plan.md` | Phase-by-phase build plan (pre-audit, greenfield assumptions) | Superseded by `docs/archive/07-post-audit-master-plan.md`; build order in `spec/system-requirements.md §6` |
| `03-master-build-prompt-for-replit.md` | Master prompt for Replit AI agent (meta/prompt engineering) | Design system → `spec/design-system.md`; operational rules → `spec/system-requirements.md §1` |
| `04-critical-gaps-research.md` | Research paper on 5 critical failure modes | → `docs/research/critical-gaps-diagnosis.md` (with resolution status) |
| `05-replit-opencode-antigravity-migration-guide.md` | Guide for moving between AI coding editors | → `docs/governance/editor-migration-guide.md` |
| `06-opencode-zero-trust-audit-prompt.md` | Prompt for running zero-trust audits | → `docs/governance/zero-trust-audit-prompt.md` (converted to protocol format) |
| `07-post-audit-master-plan.md` | Post-audit master plan (5-gate scorecard, revised build order) | Scorecard → `spec/master-verification-matrix.md`; Build order → `spec/system-requirements.md §6` |
| `08-integrations-and-solutions-research.md` | Integration research and service choices | → `spec/integrations-and-apis.md` (contracts) + `docs/research/critical-gaps-diagnosis.md §2` (research) |
| `09-end-to-end-gaps-and-solutions.md` | Full-product gap analysis with solutions | Key decisions → `spec/locked-decisions.md`; agent undo → `spec/agent-and-memory-subsystem.md §5` |
| `10-master-checklist-start-to-finish.md` | Detailed build checklist (all phases) | → `spec/master-verification-matrix.md` (gate framework); `spec/system-requirements.md §6` (build order) |
| `11-memory-management-deep-dive.md` | Deep-dive on memory architecture | → `spec/agent-and-memory-subsystem.md` |
| `12-agents-md-creation-prompt.md` | Prompt used to generate `AGENTS.md` | Meta/historical only; no content migration needed |

---

## Why Archive Instead of Delete

Per `spec/system-requirements.md §1`:
> Never silently lose history.

These documents contain:
- Research citations and evidence that informed decisions
- Historical build prompts (useful for understanding why decisions were made)
- Greenfield assumptions that were later superseded (important to understand what changed)
- Pre-audit vs. post-audit comparison baseline

Deleting them would permanently destroy the reasoning trail. Archiving them here keeps them available without cluttering the active documentation tree.

---

## Duplication Note

The files in `docs/archive/` mirror those previously in `spec/` (01–04, 07–12 were byte-for-byte identical copies). The `spec/` copies have been removed. `docs/archive/` now holds the single canonical copy of each historical document.

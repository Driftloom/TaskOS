# Memory Management — Concept & Complete Implementation

**Scope:** this is the one subsystem doc 1 §11 sketched at a high level. Everything here is new depth, not a repeat — the goal is a memory system you could actually build from this file alone, including the parts no prior doc worked out (how facts get created, how conflicts resolve, what actually gets read at query time, and where memory is *used*, not just stored).

---

## 1. The concept, precisely

Three tiers, unchanged in shape from doc 1 §11, now concrete:

| Tier | What it holds | Storage | Lifespan |
|---|---|---|---|
| **In-context** | The current conversation only | Nothing persisted — just the message buffer for this session | Ends when the session ends |
| **Semantic** | Freeform notes/conversation turns, embedded for similarity search | `memory_embeddings` (`pgvector`) | Persists; retrieved by relevance, not recency |
| **Episodic / structured** | Durable, named patterns the system has *learned about you* — not raw chat, distilled facts | `memory_facts` (`JSONB` value, per the last decision) | Persists; decays/gets re-confirmed over time (§2.3) |

**The one rule that makes this worth building at all:** a structured fact only earns a place in `memory_facts` if it's meant to *change behavior* — mainly the reschedule engine's duration/placement logic and the agent's suggestions. If it can't plausibly change what the app does, it's conversational trivia and belongs in the semantic tier at most, not `memory_facts`.

---

## 2. Memory lifecycle — the full pipeline

### 2.1 Where facts actually come from — two sources, not one

Doc 2 §9 only described one source (extracting facts from conversations). That's the weaker of the two. There's a second, better one:

**Source A — Behavioral/statistical (the reliable one).** A nightly job compares `tasks.duration_est_min` against actual elapsed time from `focus_sessions`, grouped by tag/project. This needs no LLM call and no risk of hallucination — it's arithmetic on real data. Example output: *"tasks tagged `#hackathon` take ~2.3x their estimate, based on 14 completed tasks."* This is the primary source and should be trusted more than anything inferred from chat.

**Source B — Conversational (the noisier one).** After the day's agent conversations, a single batched LLM call looks for explicitly stated preferences or patterns ("I always crash after 9pm," "Fridays are dead for me") and proposes candidate facts. This is inherently less reliable — it's an LLM's interpretation of a chat, not a measurement — so it gets a lower starting confidence than Source A facts (see §2.3).

**The `key` field is deliberately open-ended, not a fixed enum — this is the actual answer to "and so many other things, like a real personal assistant."** Nothing here restricts memory to a pre-approved list of fact types. Four categories are confirmed as day-one **seeds** — extraction actively looks for these from the start, guaranteed — but the pipeline is written to surface *any* durable, behavior-relevant pattern it notices, seeded or not. The schema (JSONB `value`, free-text `key`) was already built this way in the JSONB decision earlier in this project; this just makes explicit that the *extraction prompt* shouldn't be artificially narrowed to match a closed list either.

**The four confirmed seeds, with which source produces each:**
- **Task-type procrastination** (writing/docs pushed more than coding, regardless of day) — Source A, purely measurable from `reschedule_log` + completion timestamps grouped by tag.
- **Channel responsiveness** (Telegram vs. push — which you actually act on faster) — Source A, measurable from `notification_log` timestamps vs. the actual reply/completion timestamp per channel.
- **Soft recurring commitments** ("Tuesday evenings are always busy" — not on any calendar, inferred from repeated manual reschedules) — Source A, measurable from clustering in `reschedule_log`.
- **Hackathon-mode shifts** (working/quiet hours look totally different during events) — the one hybrid case: most reliable as an explicit Source B trigger (you just tell the agent/Telegram "I'm at a hackathon this weekend" and it temporarily overrides working/quiet hours for that window), *backed up* by Source A detection (a cluster of `#hackathon`-tagged tasks with tight deadlines) that prompts the agent to ask if you forgot to say so — the one seed category that shows the two sources working together rather than as strictly separate lanes.

Beyond these four, the nightly Source B pass is explicitly instructed to flag *anything else* that looks like a durable, behavior-relevant pattern — the seeds guarantee coverage of what you already know matters; they don't cap what the system is allowed to learn.

### 2.2 Write cadence — batched, not per-message

Extraction runs **once nightly per user** (a `pg_cron` job), not after every single message. Reasons: it's cheaper (one LLM call instead of one per turn), and a day's worth of signal produces a better fact than one isolated message does. The only exception: if the agent conversation contains an *explicit, direct statement of preference* ("set my quiet hours to 11pm"), that writes immediately through the normal Settings-update path — that's a setting, not a "learned" fact, and shouldn't wait for a nightly batch.

### 2.3 Conflict resolution & decay — this is the part that's usually missing

Every fact needs more than a single confidence number to age correctly:

- `evidence_count` — how many observations support this fact
- `last_reinforced_at` — when it was last confirmed by new evidence
- `confidence` — not fixed; recalculated at write time as evidence accumulates, and **decayed at read time** based on how long it's been since `last_reinforced_at` (a fact about "unreliable Mondays" from four months ago should count for less today than one reinforced last week)

**Update rule:** new evidence doesn't overwrite a fact, it updates it — increment `evidence_count`, recompute `confidence` as a function of supporting vs. contradicting evidence, bump `last_reinforced_at`. A fact that starts getting *contradicted* repeatedly (three Monday focus sessions that all went great) should have its confidence pulled back down rather than silently deleted — let it fade rather than vanish, so there's a record of "this used to be true."

### 2.4 Retrieval — what actually gets loaded into the agent's context

Never load the whole `memory_facts` table — that's expensive and dilutes the model's attention with irrelevant facts. On each agent call:
1. A small fixed "core profile" set — the handful of highest-confidence, most-general facts (chronotype, most-unreliable day, etc.) — always included, capped at a small number.
2. Query-relevant facts — filtered by matching `key`/tag against whatever the current message is about (e.g., a question about a hackathon task pulls in the `#hackathon` duration-multiplier fact specifically).
3. Top-K semantic matches from `memory_embeddings` via cosine similarity to the current message.
4. All three combined under a fixed token budget — if it doesn't fit, structured facts (2) win over semantic matches (3), since they're the ones actually meant to change behavior.

### 2.5 Pruning & source-dependent re-confirmation

Facts whose decayed confidence drops below a floor after a reasonable number of reinforcement opportunities get **archived, not deleted** (same "never silently lose data" principle as the reschedule log). What happens next depends on which source produced the fact, per your call:

- **Source A (behavioral/statistical) facts update automatically, no confirmation needed.** These are arithmetic on real data (duration vs. estimate, day-of-week completion rates) — low risk of being wrong, so the system just keeps them current as new evidence comes in.
- **Source B (conversational) facts always prompt before updating or archiving.** These are LLM-inferred from chat, more likely to be an overfit to one passing comment — so instead of quietly changing (or quietly dropping) one, **the agent asks you directly**: *"I used to think you weren't a morning person, but your last three weeks say otherwise — update that?"* This is the same "ask, don't guess" rule already governing the build agent (doc 3 §9) and the reschedule engine's `ask` mode, applied here specifically to the noisier of the two memory sources rather than blanket across all of memory.

---

## 3. Schema — extending doc 1 §8's tables

```
memory_facts (
  id, user_id, key, value JSONB,
  source        ['behavioral' | 'conversational'],
  evidence_count, confidence,
  last_reinforced_at, archived BOOLEAN default false,
  created_at, updated_at
)

memory_embeddings (
  id, user_id, source_text, metadata JSONB,
  embedding vector, created_at
)

agent_conversations (
  id, user_id, channel [app|telegram], role, content JSONB, created_at
)
```

Everything RLS-scoped by `user_id`, same as every other table — memory gets no exemption from the security model just because it's "just facts about me."

---

## 4. Integration points — where memory is actually *used*, not just stored

This is the part every prior doc left implicit. A memory system that's written to but never read from by anything except the chat is decoration, not function. Three concrete hookups:

**4a. The reschedule engine (currently doesn't touch memory at all — this closes that gap).** Before placing or re-estimating a task, the engine checks `memory_facts` for a matching tag/project pattern. If a high-confidence fact says tasks like this run 2.3x over estimate, the engine either quietly adjusts the *effective* duration it schedules against, or — safer default — flags it back to the agent/UI: *"This usually runs longer than estimated — want to bump it to X before I schedule it?"* This is new scope versus doc 1 §9's original 8 rules; treat it as **rule 9**.

**4b. The agent chat/Telegram surface** — as already designed in doc 1 §11, via the retrieval strategy in §2.4 above.

**4c. A "What Cadence knows about me" screen — confirmed for the first build, not deferred.** Since memory is silently shaping scheduling behavior, you should be able to see the actual list of active facts, their source (behavioral vs. conversational), confidence, and manually edit or delete any of them — the same transparency principle that governs the reschedule log (doc 1 §9 rule 7: never silent) applied to memory specifically. Ship it alongside the rest of this module, not after — it's also the natural place to review/approve the Source B confirmation prompts from §2.5, so build it early rather than bolting it on once the pipeline's already running blind.

---

## 5. Cost & model routing, specific to memory

Extraction (§2.1) and re-confirmation prompts (§2.5) are **non-destructive, low-stakes** LLM calls — nothing gets created/edited/deleted in the app from these, just a proposed fact update. That means they're exactly the right calls to run on the cheapest/free-tier model in the LiteLLM fallback chain (NVIDIA NIM primary), reserving nothing special — unlike the agent's tool-calling path (doc 3 §7), which needs the more reliable end of the chain because it can take real, destructive actions. Log every extraction call's token usage into the same `llm_usage` table from doc 8/10 — memory extraction is a recurring nightly cost, worth tracking separately from ad-hoc chat usage so a runaway extraction job is visible before it dents the spend alert.

---

## 6. Testing & verification plan

Standard "does it work" testing isn't enough for memory — it needs verification that it's *correct*, not just that it runs:

- [ ] **Synthetic pattern test:** mark 5+ tasks with a known artificial pattern (e.g., all `#test` tasks logged at 2x their estimate), run the nightly extraction, confirm the resulting `memory_facts` row matches — this validates Source A end to end.
- [ ] **Retrieval precision test:** ask the agent something unrelated to any stored fact, confirm irrelevant facts *aren't* pulled into context (checking §2.4's filtering actually filters, not just that retrieval runs).
- [ ] **Behavior-change test — the real acceptance bar:** create a task matching a high-confidence fact's pattern, confirm the reschedule engine or agent visibly acts differently because of it (4a) — a memory system that's queried but never changes an outcome has failed regardless of how clean the schema is.
- [ ] **Decay test:** manufacture contradicting evidence against an existing fact, confirm confidence actually drops rather than the fact silently flipping or persisting unchanged.
- [ ] **Re-confirmation test:** force a fact below the pruning floor, confirm the agent asks rather than silently archiving without telling you.

---

## 7. My ideas / recommendations, called out explicitly (net-new, not restating prior docs)

1. **The "What Cadence knows about me" transparency screen (§4c)** — proposed as genuinely new scope, and confirmed for the first build rather than deferred. Worth the extra early effort given how much the reschedule engine and agent lean on memory once §4a exists, and it's now also the natural home for reviewing Source B confirmation prompts.
2. **Two-source model (§2.1)** — trusting behavioral/statistical facts more than conversational ones. This wasn't distinguished before; it matters because it directly sets the starting confidence and changes how aggressively each source's facts should influence scheduling.
3. **Rule 9 for the reschedule engine (§4a)** — memory should feed back into duration estimates, not just live in an agent chat sidebar disconnected from the thing it's supposed to improve.
4. **Archive, don't delete, decayed facts** — consistent with how the rest of the app already treats history (reschedule log, agent action log) — extending that same instinct here rather than treating memory as a special case that's fine to silently mutate.

---

## 8. Questions before implementation

None left open — the last one (specific fact categories) is resolved in §2.1: four confirmed seeds (task-type procrastination, channel responsiveness, soft recurring commitments, hackathon-mode shifts), plus an explicitly open-ended extraction pass so the system isn't capped at a fixed list. This module is fully specified; nothing here is blocking implementation.

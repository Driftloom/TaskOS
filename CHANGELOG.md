# Changelog

All notable changes to the Cadence (Personal Task & Time OS) project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added & Hardened
- **Dead UI Component Pruning & Motion Token Wiring (2026-10-22)**:
  - **Dead Code Deletion**: Pruned 40 unused shadcn UI components (`accordion`, `alert`, `alert-dialog`, `aspect-ratio`, `avatar`, `breadcrumb`, `button-group`, `card`, `checkbox`, `collapsible`, `command`, `context-menu`, `dropdown-menu`, `empty`, `field`, `form`, `hover-card`, `input-group`, `item`, `kbd`, `menubar`, `navigation-menu`, `pagination`, `popover`, `radio-group`, `scroll-area`, `separator`, `sheet`, `sidebar`, `skeleton`, `slider`, `spinner`, `table`, `tabs`, `textarea`, `toast`, `toaster`, `toggle`, `toggle-group`, `tooltip`) and 2 obsolete hooks (`use-toast.ts`, `use-mobile.tsx`), eliminating ~130 KB of unused code and shrinking the compiled stylesheet bundle from 181.2 kB to 142.5 kB (~21.4% raw CSS reduction).
  - **P10 Motion Duration Utilities Wired**: Added explicit `@utility duration-instant / fast / base / slow / deliberate` declarations in `artifacts/cadence/src/index.css` resolving `--duration-*` design tokens to active `transition-duration` rules in the bundle. Verified in compiled CSS and guarded against regression by updating `scripts/verify-no-dead-classes.cjs`.
  - **E2E Test Consolidation**: Folded the goal creation flow from `goals.spec.ts` into `monthly-goals.spec.ts` and retired the redundant file, bringing Playwright E2E coverage to 151 tests across 18 spec files (100% green).
  - **Doc & Token-Lint Sync**: Token lint scanned across 156/156 source files with 0 debt; synchronized module registry, AGENTS.md, DESIGN.md, and verification matrices.
- **The Calendar Stops Reporting Zero Scheduled Work It Never Counted (2026-10-21)**:
  - **The Day View's Count Line No Longer Measures A Zero Over An Unread Query**: the line read `{dayTasks?.length ?? 0} scheduled`, so a failed `GET /api/tasks` rendered "0 scheduled" — a measured zero over a request that never answered, telling a user whose task query had failed that they had nothing scheduled. The unread value is now an em dash, the same marker Profile's momentum tiles and RitualDialog's counters already use, and the unit label stays so the line still says which quantity is unknown. A query that answered with a genuinely empty day still reads "0 scheduled": not yet known and known to be empty are different facts. The failed read is still reported by the section error surface beside it, with its retry.
  - **The Same Rule Covers The Block Count On The Same Line**: "N blocked" came from a second query that could fail the same way and was rendering "0 blocked" over an unread read. It is one sentence and one defect class, so it is fixed with the same marker rather than left half-true. The hour grid itself still has no error surface of its own — that is recorded in `AUDIT.md` as a separate, deliberately untouched item.
  - **New Test File**: `artifacts/cadence/src/pages/calendar/CalendarPage.test.tsx` (5 cases) pins all of it — the answered-and-empty case still reads "0 scheduled", and a failed, failed-block or in-flight query never does. The cases were run as negative controls against a temporarily reverted fix: 3 of the 5 failed as expected, and the fix was restored and re-verified green.
  - **Re-measured after this wave**: **1147 Vitest tests across 92 files** (web 642/48; API 491/42 and `lib/db` 14/2 unchanged; 25 skipped offline), 151 Playwright E2E tests across 19 spec files, 198/198 source files scanned by the token lint, 759 files scanned by the encoding gate (CLEAN), and the 12-gate ladder green.
- **Residual Fix Wave — The Last Four Residuals Closed (2026-10-21)**:
  - **The Morning Ritual Card Stops Claiming Zero Open Tasks It Never Counted**: `ReviewPage`'s ritual card footer printed "N tasks open in Today" from `tasks?.filter(...) ?? []`, while the page's error gate covered only the *summary* query. A failed `GET /api/tasks` therefore rendered "0 tasks open in Today" — a measured zero over a request that never answered, on the same page and the same query the previous wave had already touched. The footer now reads "Unknown number of tasks open in Today" while the task query is in flight or after it failed, and the count when it answered. Covered by two new `ReviewPage` tests (one for the answered case, one for the failed case).
  - **The Ritual Dialog's Retry Button Reaches The 44x44px Floor**: the new Retry button's effective hit target was 36px (`min-h-9`, no `tap-target-expand`), below the documented 44x44px minimum (DESIGN.md §6, locked decision D-29). It now uses the existing `tap-target-expand` utility, so the visual box stays 36px and the hit area is 44px. The four pre-existing siblings that copy the same pattern (`ActiveGoalsCard`, `ScheduleSnapshotCard`, `InboxTriageCard`, `ReviewPage`'s slippage Retry) are **out of scope** and unchanged.
  - **The Calendar's Day-View Task Pane Stops Blaming The Whole Workspace**: that pane's `ErrorState` used the workspace copy — "The workspace could not load. Nothing is shown until the connection recovers." — while the Time Blocks hour grid rendered beside it from a separate query (`useListTasks` at line 55 vs `useListBlocks` at line 66). It now uses the section scope: "This section could not load. Nothing is shown here until the connection recovers." It is the only `ErrorState` call site in the file.
  - **The JSON Backup Stops Writing An Empty Task List Before The Answer Arrives**: the previous wave closed the *failed* case (the `tasks` key is omitted and `tasksUnread` is written), but the *pending* window — `data` undefined, no error yet — still wrote `tasks: []`. "Not yet known" and "known to be empty" are different facts, and both read as "you have no tasks" in a backup file. The key is now omitted for the whole unanswered window, and the file says whether the list could not be read or had not finished loading. Covered by a new `SettingsPage` test.
  - **Out of scope, deliberately unchanged** (later plans' or the owner's): the four pre-existing sibling Retry buttons at 36px, the `lint-tokens.cjs` line-based tap-target rule that cannot see a `<button` whose size class is on another line, the `artifacts/cadence/tsconfig.json` `**/*.test.ts` exclusion, and the red bundle-budget gate.
  - **Re-measured after this wave**: **1142 Vitest tests across 91 files** (web 637/47; API 491/42 and `lib/db` 14/2 unchanged), 151 Playwright E2E tests across 19 spec files, 197/197 source files scanned by the token lint, 758 files scanned by the encoding gate (CLEAN), and the 12-gate ladder green.
- **Final Fix Wave — The Last Three Surfaces That Claimed More Than They Knew (2026-10-21)**:
  - **The Evening Ritual Stops Congratulating You On A Day It Could Not Read**: `RitualDialog` used to print "Inbox Zero! Everything scheduled for today is complete." whenever the task list came back empty — including when the task query had *failed*, because an empty array and a failed request look the same to the component. Both parents (`/review` and `/today`) now pass the query's `isError`/`isPending` through, the dialog renders a distinct "Your tasks could not be loaded" surface when the read failed, and when the read succeeded with nothing open it states the absence ("No incomplete tasks.") instead of a verdict on the day. The celebratory copy and its success colouring are gone.
  - **The Setup Wizard Stops Claiming A Complete Setup It Did Not Finish**: the wizard omits `remindersEnabled` from the notification write when the integrations query is unanswered, but its completion guard did not consider that query — so it toasted "Cadence setup complete! Your rhythm and scheduling engine are primed." while the Web Push card on the same screen said "we don't know". The guard now counts an unanswered or failed integrations query, and the warning names each thing that was left untouched.
  - **Profile's Momentum Row Stops Mixing Zero With Unknown**: the completed count, the streak and the focus total read `?? 0` — a measured zero over a query that had not answered — while the fourth tile in the same row already rendered an em dash. All three now render "—", and a note says which measurement could not be loaded.
  - **Scoped Error Copy**: the shared `ErrorState` said "The workspace could not load" / "Nothing is shown until the connection recovers" even when it was rendered for a single card inside a page that had loaded. It now takes a `scope`, and the card-level call sites (Profile's Web Push card and channel block, Onboarding's Web Push card, Settings' automation section) use the scoped copy.
  - **The Activity Log Covers The Events It Actually Records**: `task_archived` and `task_restored` are live — the Inbox writes both — but the badge map had no case for them, so they fell through to the generic "Activity" badge, and the type filter offered no chip for them. Both now have their own badge and their own filter chip.
  - **The JSON Backup Says What It Could Not Read**: a failed task query exported `tasks: []`, which reads as "you have no tasks"; the key is now omitted and the file says why. The notification settings are collected key by key, so the timezone and the 24-hour rhythm survive a partial read instead of being dropped with the workday keys, and the export toast names anything it could not carry.
  - **The `degraded` Flag Says What It Means In The Contract**: the OpenAPI description said the flag is set "because no model provider was configured or available", which is narrower than the behaviour — on the turn-cap path a provider *was* configured and available and only the prose was missing. The contract now says the local engine wrote the reply text, and the regenerated Orval/Zod output ships with it.
  - **Dead Re-Export Removed**: `AgentPanel` re-exported `canonicalModelBadge` and `DiscoveredModelResponse` although nothing imported them from there. A re-export is the path an importer follows to pull the whole agent panel into another chunk — the defect `AgentSettingsView.test.tsx` exists to prevent — so the two lines are gone and the contract is imported from `@/lib/discovered-model` directly.
  - **Audit Correction (append-only)**: the 2026-10-21 entry's claim that the dev-mock symbols are "absent from every chunk" was literally wrong for three of them; a correction entry now records what is actually shipped.
  - **Re-measured after this wave**: **1139 Vitest tests across 91 files** (API 491/42, web 634/47, `lib/db` 14/2; 25 skipped offline), 151 Playwright E2E tests across 19 spec files, 197/197 source files scanned by the token lint, 758 files scanned by the encoding gate (CLEAN), and the 12-gate ladder green.
- **Release Integrity & Truthfulness Remediation (2026-10-21)**:
  - **The App No Longer Reports Success It Cannot Substantiate**: Empty is not success and unreadable is not zero. The Review page's On-Time Rate shows an em dash instead of a fabricated 100% when nothing completed in the lookback window (the API now returns `onTimeRate: null` for that case), the Dashboard's cards state the absence of data instead of announcing a clear day, Settings and Onboarding render an explicit unknown instead of writing a default over real state, the agent's spend card reads "Spend unknown" until the number can be read, and the Activity page is labelled device-local with its dead "Agent" filter chip removed.
  - **The Download Card Names The APK And The Web App Separately**: The Android card printed the WEB APP's version and build number, so an installer checking the APK's own app info saw a different number from the page's claim. The APK's manifest values now live in their own module, and the card prints the Android version, the web version and the real file size as three separately-labelled facts.
  - **The Assistant Names Its Own Provenance**: A deterministic local-fallback answer is badged "Local fallback — no model response" (not "no model provider configured" — a provider can be configured and still fail), every reply is attributed to the provider that actually wrote it, the spend card is scoped to the month it claims (computed in the user's own IANA timezone, D-01 Asia/Kolkata otherwise) with the ceiling read from the API, the model dropdown reads the server's own field names instead of the never-sent `m.name` / `m.tierBadge`, and the "N tasks moved" toast fires only after the server answers.
  - **Facts You Wrote Are Not Facts The App Inferred**: A memory fact you typed yourself reads "Added by you", stays out of the inference lane, and stores no confidence — the schema's default was a measurement nobody made.
  - **The Channels Section Says Which Channel Is Which**: Onboarding labels its channels by D-15 (Telegram primary, device alerts secondary) and no longer writes defaults over settings it failed to read; Profile's Web Push card reports the real state — "Active — N device(s) subscribed", "Not subscribed", or an explicit unknown — instead of the old "NOT IMPLEMENTED".
  - **The Dev Mock Is Validated Against The Contract**: The dev mock's fixtures are a pure module typed by the generated contract types and checked in CI against the generated Zod schemas (93 checks), and the mock labels itself with a persistent "Sample data — this is a local preview, not your account." banner on every page.
  - **Documentation Reconciled & Re-measured**: The documentation set was re-measured in one session and made internally consistent — **1123 Vitest tests across 90 files** (API 491/42, web 618/46, `lib/db` 14/2; 25 skipped offline), 151 Playwright E2E tests across 19 files, 196/196 source files scanned by the token lint, 99 contrast pairs with 0 failing, and the 12-gate ladder green. `DESIGN.md`'s "Audit Persistence" invariant is now marked OPEN, because `/activity` is device-local and does not yet sync to the server ledgers it claims to.
- **Settings & Activity Page Layout Architecture Overhaul**:
  - **Activity Page Timeline & Metrics Ribbon**: Replaced disconnected boxy metrics with an Apple Health / Linear style 4-part integrated metric ribbon (`Total Events`, `Completions`, `Focus Rounds`, `Rituals`), unified search & filter toolbar with active indicator pills, and implemented a continuous connected timeline thread with subtle vertical guideline (`border-l-2 border-border-control/70`), colored status node pips, and sticky day headers with event count pills.
  - **Settings Page Chapter Navigation Architecture**: Structured monolithic settings into a 5-chapter architecture (`Rhythm & Timezone`, `Focus & Display`, `Telegram & Alerts`, `AI & Safety`, `Updates & Backup`) with a sticky category navigator bar and quick-access utility deck (`What Cadence Knows`, `Setup Wizard`, `Mobile App (APK)`, `Product Tour`). Retained 100% of DOM mounting to preserve Playwright test assertions and sequential 43-step keyboard navigation traversal.
- **Design System Typography Calibration & Responsiveness Overhaul**:
  - **OpenType Geometric Features Restored**: Calibrated global font styling in `index.css` with explicit OpenType feature flags (`cv02`, `cv03`, `cv04`, `cv11`, `ss01`) on `body` and headings `h1` through `h6`, ensuring crisp geometric letterforms and open figures across desktop and mobile. Added theme-aware `::selection` and `::-moz-selection` styling.
  - **Typographic Scale Realignment**: Eliminated inappropriate `text-micro` (14px) on card and section headings across the app, upgrading to `text-title3` (20px) / `text-headline` (17px semibold) per the P7 design token specification (`LandingBentoGrid.tsx`, `LandingPhilosophy.tsx`, `StateViews.tsx`, `FocusPage.tsx`, `ProjectsPage.tsx`, `ProfilePage.tsx`, `ReviewPage.tsx`, `SettingsPage.tsx`, `OnboardingPage.tsx`).
  - **Mobile Viewport Stability**: Standardized full-height containers to `min-h-[100dvh]` over `min-h-screen` across `LandingHero.tsx`, `DownloadPage.tsx`, and `not-found.tsx`, preventing address-bar jumping and layout shifts on iOS Safari / Android Chrome.
  - **Touch-Device Scroll Safety**: Added `pointerType === 'touch'` bypass in `TiltCard3D.tsx` to prevent touch drag gestures from conflicting with page scrolling on mobile devices.
  - **Responsive Narrow-Screen CTAs**: Added responsive CTA labels in `LandingHeader.tsx` (`<span className="hidden sm:inline">Get Started</span><span className="sm:hidden">Start</span>`) with responsive padding to prevent navigation overflow on 320px–360px viewports.
- **Interactive Three.js 3D Bento Canvases & Full-Page Celestial Galaxy**:
  - **Stereoscopic Unflattened 3D Card Engine (`TiltCard3D`)**: Overhauled 3D card wrapper to decouple outer 3D perspective context from internal sheen/border spotlight elements, eliminating `overflow: hidden` flattening. Implemented hardware-accelerated pointer-following radial sheen, dynamic cursor-tracking border rim highlights (`amber`, `emerald`, `cyan`, `violet`), spring lerp elevation (`translateZ(18px)`), and multi-layer stereoscopic depth (`translateZ(14px)` to `translateZ(38px)`).
  - **Interactive Three.js 3D Micro-Canvases**:
    - **Activity Rings (`ActivityRings3D.tsx`)**: 3 concentric volumetric glowing toruses (Focus in Amber, Tasks in Emerald, Streak in Violet) rotating on separate angular tracks with milestone tip beads, central tumble crystal core, gyroscopic pointer tilt, and celebration spin acceleration.
    - **Algorithmic Decision Gyroscope (`DecisionGyro3D.tsx`)**: 3 nested rotating gimbal rings with pivot bearings and pulsing decision core displaying real-time Rule 9 multiplier calculation (1.25x applied) with interactive Accept/Keep state response.
    - **Origami Telegram Signal Plane (`TelegramPlane3D.tsx`)**: 3D geometric paper plane gliding on atmospheric air currents with banking, pitching, trailing particle sparks, and interactive 360° barrel-roll excitation on webhook action taps.
    - **Natural Speed Lexer Prism (`TokenLexer3D.tsx`)**: Floating amber prism crystal with 4 orbiting token satellites (`date`, `time`, `duration`, `priority`) dynamically reacting to natural language typing velocity.
    - **Time Blocking Modules (`TimeGrid3D.tsx`)**: 3D isometric floating task modules and glowing laser timeline with Day / Night Owl rhythm switching.
  - **Continuous Ambient 3D Cosmic Galaxy (`AmbientCosmicStream3D.tsx`)**: Spans the entire scroll length of the page with 800 celestial stardust depth points, 3 floating wireframe polyhedra (Icosahedron, Torus Knot, Dodecahedron) positioned at alternating vertical tiers, continuous scroll-linked camera parallax, and native `performance.now()` animation loop with zero console warnings.
  - **Zero Token Lint Debt & 100% Verification Green**: Strict adherence to design tokens using semantic `color-mix` / CSS variables, zero raw hex/rgb values, 0 dead custom classes, 100% WCAG AA contrast compliance across all themes, and isolated `vendor-three` chunk code splitting.
- **Cadence Public Landing Page Complete 3D Craft Redesign (`/`)**:
  - **Native WebGL 3D Chrono-Sphere Centerpiece**: Custom zero-bundle-overhead WebGL shader pipeline rendering a high-precision celestial gyroscope of time with 3 concentric orbital rings (Cadence Gold, Horizon Teal, Platinum), 12 major hour beacons, 800+ spatial particles, direct grab-and-spin drag physics with inertia, smooth cursor parallax tracking, and 4 interactive camera presets (`Orbit`, `Focus 9AM`, `Clock Dial`, `Reset`). Guaranteed rendering regardless of OS reduced-motion accessibility flags.
  - **Typographic Integrity & Font Normalization**: Set `font-feature-settings: normal;` on `body` to eliminate aberrant stylistic set character mutations on Windows/fallback systems, guaranteeing razor-sharp Apple/Linear SF Pro / Inter typography.
  - **Prominent 3D Hero & Bento 2.0 Integration**: Positioned the 3D Chrono-Sphere as the interactive right-column hero centerpiece wrapped in `TiltCard3D` with live 60 FPS telemetry and floating spatial tags, while embedding `InteractiveCaptureSandbox` (`Natural Speed`) seamlessly as the lead card of the Bento Grid alongside `Activity Rings`, `Time Blocking`, `9-Rule Auto-Reschedule`, and `Two-Way Telegram Bot`.
  - **Paper-Like Calmness & Architectural Proof**: Structured 3-pillar comparative matrix communicating paper-like serenity (no notification anxiety), multi-tenant PostgreSQL Row-Level Security via Clerk JWT claims, and guided daily review rituals.
  - **Performance & Budget Invariants**: Verified 100% compliance across all 5 bundle size budgets (entry chunk 74.97 kB vs 120 kB ceiling, first-visit JS 155.44 kB vs 200 kB budget, CSS 28.04 kB vs 30 kB budget).
  - **Zero-Violation Quality Ladder**: Achieved 0 design token lint violations (164/164 files scanned), 0 dead custom classes, 0 axe-core WCAG 2.1 AA accessibility violations across both light and dark themes, and 100% green Playwright E2E suites (`auth.spec.ts`, `navigation.spec.ts`).
- **"What Slipped & Why" Raw-Table Reconciliation Subsystem (Step 13 / Module 15 Elevation to 5/5)**:
  - **Reconciliation Engine (`GET /api/analytics/slippage`)**: Built Express 5 analytics router reconciling `tasks`, `reschedule_proposals`, `reschedule_runs`, and `agent_action_log` tables with `runWithRls` JWT claims isolation and user-configurable lookback window (default 7d).
  - **4-Tier Failure Classification**: Classified task slippage into deterministic categories: `capacity_overrun` (workload/flexibility constraints), `deadline_missed` (past due date without move), `postponed_by_user` (user postponements & declined proposals), and `flagged_cap_exceeded` (exceeded 5 auto-moves).
  - **OpenAPI & Codegen**: Defined contract schemas in `lib/api-spec/openapi.yaml` and generated typed TanStack React Query hooks and Zod schemas.
  - **ReviewPage Interactive Card**: Mounted "What Slipped & Why" audit card in `ReviewPage.tsx` with On-Time Completion Rate, category count pills, slipped tasks audit list with contextual recommendations, and tamper-evident raw table reconciliation footer.
  - **WCAG AA Accessibility**: Fully compliant across light and dark themes with zero axe-core contrast violations.
  - **Test Coverage**: Added `analytics.test.ts` (4 tests) and `ReviewPage.test.tsx` (2 tests). Vitest suite stands at **894 passing tests across 69 files (100% green)**; Playwright E2E suite certified at **144/144 tests passing across 19 spec files (100% green)**.
- **Native VAPID Web Push (RFC 8291) Implementation**:
  - **Database & RLS Schema**: Added `0019_web_push_subscriptions.sql` creating `web_push_subscriptions` with user-scoped RLS policies (`auth.jwt()->>'sub' = user_id`) and service_role permissions, enabling multiple browser/mobile device registrations per user.
  - **OpenAPI & Codegen**: Updated `lib/api-spec/openapi.yaml` with endpoints `GET /integrations/push/vapid-key`, `POST /integrations/push/subscribe`, `POST /integrations/push/unsubscribe`, `POST /integrations/push/test` and generated TanStack Query hooks and Zod validation schemas.
  - **API Server Endpoints**: Implemented Web Push routes in `artifacts/api-server/src/routes/integrations.ts` with VAPID key delivery, user-isolated registration via `runWithRls`, and test dispatch.
  - **Background Reminder Cron Dispatcher Integration**: Connected `deliverOne` in `artifacts/api-server/src/routes/internal.ts` to dispatch secondary lock-screen push alerts via `dispatchPushToUser`, with fallback delivery when Telegram bot is unconfigured and automated pruning of expired (410/404) subscriptions.
  - **Service Worker Push Listeners**: Updated `public/sw.js` with `'push'` and `'notificationclick'` handlers displaying native notifications with badge and vibrating patterns, focusing `/today` on tap.
  - **Settings UI Integration**: Enhanced `MessagingIntegrationsView.tsx` with 1-tap browser permission request, device subscription sync, live registered device count, and server push test trigger.
  - **Vitest & Playwright E2E Suites**: Total Vitest suite stands at **888 passing tests across 67 files (100% green)**. Playwright E2E suite certified at **144/144 tests passing across 19 spec files (100% green)**, with WCAG AA accessibility audit on light/dark themes.
- **Enterprise Dynamic Model Discovery & Self-Healing Fallback Matrix (Option A Architecture)**:
  - **Zero-Token Dynamic Model Discovery (`GET /api/agent/models/:provider`)**: Implemented native discovery querying Google's `ListModels` API (`v1beta/models?key=${apiKey}`) filtering by `supportedGenerationMethods.includes("generateContent")`, Groq `/v1/models`, and OpenRouter `/v1/models`. Consumes 0 inference tokens, completely eliminating false-negative 404 key probe rejections during BYOK onboarding.
  - **Frontier Curated Model Defaults & Tier Taxonomy**: Upgraded default Gemini model to `gemini-3.8-flash` across backend, agent ReAct loop, settings, and UI presets. Established 4-tier capability badges: `⚡ Recommended` (`gemini-3.8-flash`, `llama-3.3-70b-versatile`), `💸 Cheapest` (`gemini-3.8-flash-lite`, `llama-3.1-8b-instant`), `🧠 Deep Reasoning` (`gemini-3.1-pro`), and `⚙️ Standard` (`gemini-2.5-flash`, `gemini-2.0-flash`).
  - **Autonomous Agent Model Switching (`switch_model`) & Conversational Triggers**: Extended agent intent classification (`classifyAgentIntent`) to recognize model switching commands ("switch to reasoning model", "use cheapest model", "switch to gemini 3.8 flash"). Enabled ReAct tool execution with immediate in-memory provider state update and PostgreSQL persistence.
  - **Telegram Bot `/model` Command Integration**: Added `/model` command to Telegram bot (`parseTelegramCommand`, `TELEGRAM_HELP`), returning active model status and executing 1-tap model switching via `switch_model`.
  - **UI/UX Live Model Selection & Zero-Key Re-Entry**: Enhanced `AgentSettingsView` and `AgentPanel` to dynamically fetch live models from configured keys, display tier badges, and enable instantaneous model switching without re-entering encrypted API keys.
  - **Vitest Suite Expansion**: 880 tests pass across 65 test files (100% green).
- **Clerk Authentication Clock Skew Tolerance & Enterprise Diagnostic Logging**:
  - Configured `clockSkewInMs: 60_000` in `clerkMiddleware` (`app.ts`), resolving the issue where local development machine NTP clock drift (e.g. laptop clock ~10s behind Clerk servers) caused `@clerk/express` to reject valid session JWTs with `session-token-iat-in-the-future` (401 Unauthorized on all protected endpoints).
  - Added structured diagnostic logs in `requireAuth` (`auth.ts`) extracting and recording Clerk's internal debug reason and message on any rejected request for complete server observability.
  - Preserved live database context in `runAgentConversation` (`engine.ts`), ensuring fallback agent resolution retains real open tasks, scheduled time blocks, user timezone, and conversation history.
- **Dynamic AI Model Selection & Autonomous Switching**:
  - **Upgraded Gemini Default to `gemini-2.0-flash`**: Set Gemini default model to `gemini-2.0-flash` (Google's latest high-speed, tool-calling optimized workhorse model with generous free tier) across presets and UI defaults, eliminating 404 entity errors on Google's OpenAI-compatible gateway.
  - **Multi-Candidate Resilient Provider Probing**: Enhanced `PUT /api/agent/credentials/:provider` to test candidate models (`gemini-2.0-flash`, `gemini-2.0-flash-lite`, `gemini-2.5-flash`, etc.) during BYOK validation. If a requested model is deprecated or returns 404, the probe tests candidates automatically and persists the first working model.
  - **Expanded Multi-Provider Curated Catalog**: Added curated models with descriptions and speed/capability badges: Google Gemini (`gemini-2.0-flash` [Recommended], `gemini-2.0-flash-lite` [Cheapest], `gemini-2.5-flash` [Next-Gen], `gemini-2.0-pro` [Advanced], `gemini-1.5-flash` [Legacy], `gemini-1.5-pro` [Legacy]), Groq (`llama-3.3-70b-versatile`, `llama-3.1-8b-instant`), NVIDIA NIM (`meta/llama-3.1-70b-instruct`, `meta/llama-3.1-8b-instruct`, `mistralai/mixtral-8x7b-instruct-v0.1`), and OpenRouter (`google/gemini-2.0-flash-001`, `meta-llama/llama-3.3-70b-instruct`, `anthropic/claude-3.5-sonnet`, `deepseek/deepseek-chat`).
  - **Agent Autonomous Model Fallback in ReAct Loop**: In `callProviderChat`, if an active model encounters 404 (model not found), 400 (invalid model), or 429 (rate limits), the engine autonomously falls back to candidate models, continues the user turn uninterrupted, and asynchronously updates `llm_credentials` in PostgreSQL.
  - **Real-Time Model Switching (`switch_model`)**: ReAct tool #8 updates model state in-memory so subsequent turns in the same multi-turn conversation immediately use the newly selected model, with reversible audit logging in `agent_action_log`.
  - **Active Model Selector in Assistant UI & BYOK**: Quick model dropdown directly in the Assistant header bar and Settings BYOK page allowing 1-click model switching without key re-entry.
- **Autonomous Agent Co-Pilot & BYOK Hardening**:
  - Sanitized behavioral memory loading (`assembleAgentContext`, `runAgentConversation`) to strictly filter `category === 'channel'` technical infrastructure facts, preventing credential/webhook leakage into LLM reasoning contexts.
  - Hardened natural language intent classification (`classifyAgentIntent`):
    - Added resilient outer quote and punctuation normalization (e.g. `"create a task ..."` with literal enclosing quotes).
    - Added temporal point-in-time extraction (`parsePointInTime` for `at 4pm`, `at 16:00`), calculating ISO timestamps with timezone grounding and stripping temporal suffixes from task titles.
    - Added dynamic conversational greeting detection (`hi`, `hello`, `hey cadence`) with live open task summary counts.
    - Upgraded `create_task` tool invocation to pass structured `dueAt` timestamps.
    - Replaced raw memory-fact fallback with enterprise onboarding prompts pointing users to Settings BYOK.

## [0.1.5] - 2026-10-10

### Added
- **Monthly Goals Subsystem (Step 12)**:
  - Added Migration `0018_monthly_goals.sql` creating `monthly_goals` table with RLS and CHECK constraints, and `monthly_goal_snapshots` immutable ledger protected by PostgreSQL trigger (`prevent_snapshot_mutation`) rejecting all `UPDATE` and `DELETE` queries.
  - Implemented DST-safe half-open month windows `[start, end)` in user IANA timezone (`resolveMonthWindow`, `resolveDayWindow`) in `artifacts/api-server/src/lib/month-window.ts`.
  - Implemented 5 automated telemetry metrics computed purely from actual behavior: `focus_minutes`, `focus_sessions`, `focus_days`, `tasks_completed`, and `tasks_completed_on_time` (`computeGoalActual`, `computeBaselines`).
  - Added trailing 30d/90d baseline telemetry helper (`GET /api/goals/baselines`) grounding goal targets in reality.
  - Added Monthly Review ritual (`GET /api/goals/review`) and non-destructive carry-forward cloning (`POST /api/goals/{id}/carry`).
  - Added service-context cron endpoint `POST /internal/goals/close-month` with idempotency snapshot checks and `DISPATCH_SECRET` authentication.
  - Implemented Express 5 REST API router mounted at `/api/goals` with full `requireAuth` and RLS isolation.
  - Designed and mounted frontend UI: `GoalCard`, `GoalEditor`, `MonthlyReviewDialog`, and `GoalsPage` mounted at `/goals` with `Milestone` icon in `AppShell` and `CommandPalette`.
  - Added Playwright E2E spec (`monthly-goals.spec.ts`) validating end-to-end goal display, review modal, carry-forward, edited-target notices, and goal creation.
- **Dedicated Assistant Co-Pilot Surface (`/agent`) & Mobile Dock Realignment**:
  - Decoupled the conversational `AgentPanel` from the main `/today` page into its own dedicated co-pilot route `/agent` (`AgentPage.tsx`), restoring clean visual hierarchy on `/today` (NextUp hero card → Quick capture → Task rows → Activity Rings momentum).
  - Aligned mobile bottom dock with `docs/13-master-design-system-prompt.md §P16`: 5 slots configured as `Today · Calendar · [＋ Capture] · Agent · More` (resolving the prior temporary deviation where `/focus` occupied Slot 4).
  - Added accessible, token-compliant Assistant entry card and header quick-link on `/today` with tactile audio cues and full keyboard navigation.
  - Added return navigation to `/today` in `AgentPage` header (`link-agent-return-today`).
- **11-Gate Verification Ladder with Cron-Route Integrity**:
  - Added Gate 9 `verify:cron-routes` (`scripts/verify-cron-routes.cjs`) asserting every scheduled `pg_cron` URL maps to an active Express router endpoint.
- **A11y & Contrast Hardening**:
  - Fixed dark-theme `ai.text` on translucent `bg-ai/10` wash to `#9491FF`, resolving WCAG 1.4.3 compliance (4.84:1 contrast).
  - Extended contrast verification script (`scripts/verify-contrast.cjs`) with composited background testing across 99 color pairs (0 failures).

### Verified
- **11/11 Verification Ladder Green**: 11 labeled gates passed in 57.0s (`typecheck`, `tokens`, `lint:tokens`, `contrast`, `codegen`, `build:api`, `build:web`, `verify:no-dead-classes`, `verify:cron-routes`, `encoding`, `test`).
- **826 Vitest Tests Passing Across 59 Test Files**: 390 in api-server (30 files), 422 in cadence (27 files), 14 in db (2 files, 25 skipped local DB tests).
- **131 Playwright E2E Tests**: Across 17 spec files (100% green).
- **19 Applied Migrations**: Migrations `0000` through `0018` with zero checksum drift.

---

## [0.1.4] - 2026-10-09

### Added
- **Full-Text Task Search with GIN Indexing & Relevance Ranking**:
  - Added Migration `0017_tasks_archive_and_search.sql` generating a `tsvector` expression and PostgreSQL GIN index (`idx_tasks_search`) across task `title` and `notes`.
  - Added safe search query sanitation (`formatTsQuery`) stripping control syntax and formatting prefix matching tokens (`'token':* & ...`).
  - Added `search` query parameter support in `GET /tasks` with `to_tsquery` and `ts_rank` descending relevance sorting.
  - Wired live task search into the global `Cmd+K` Command Palette with highlighted result entries and direct navigation/selection.
- **Task Archival Lifecycle & `completed_at` Preservation**:
  - Expanded `TaskStatus` and `TaskUpdateStatus` schemas to include `'archived'`.
  - Added `scope=archived` filter support to `GET /tasks` ordered by update timestamp.
  - Implemented non-destructive task archival preserving existing completion metadata (`completed_at`).
  - Added dedicated Archived view in `InboxPage` with instant task restoration actions and confirmation flows in `TaskEditor`.
  - Tracked `task_archived` and `task_restored` in local activity history.
- **Rich Task Link Chips & SSRF-Safe URL Metadata Extraction**:
  - Implemented `TaskLinkChips` rendering interactive badges for URL and file attachments without intercepting row selection.
  - Added `POST /integrations/url-metadata` endpoint with strict SSRF filtering (`isPrivateOrForbiddenHost`), 3.5s timeout aborts, and 64KB body chunk limits.
  - Added automated title extraction supporting Open Graph (`og:title`) and HTML `<title>` tags with entity decoding.
- **End-to-End Test Suite Expansion**:
  - Added Playwright test suite (`task-search-and-archive.spec.ts`) validating search filtering, archival, restoration, and link chip workflows.

### Verified
- **10/10 Verification Gates Green**: `node scripts/run-gates.cjs` passing across all packages.
- **801 Vitest Unit & Contract Tests Passing**: 369 in api-server (27 files), 419 in cadence (26 files), 13 in db (2 files passed, 25 local destructive tests skipped).
- **118 Playwright E2E Tests**: Across 14 spec files (100% green).
- **18 Applied Migrations**: Migrations `0000` through `0017` with zero checksum drift.

---

## [0.1.3] - 2026-10-08

### Added
- **Security & SecretOps Isolation**:
  - Isolated Telegram bot credentials into a dedicated module (`telegram-credentials.ts`) preventing cross-service credential leakage.
  - Added secret sanitization (`sanitizeMemoryFacts`) on all memory endpoints with an automated regression barrier (`memory-leak.test.ts`).
  - Implemented in-app BYOK (Bring Your Own Key) credential storage with AES-256-GCM authenticated envelope encryption (`credential-crypto.ts`) and database migration `0016_llm_credentials.sql`.
  - Added robust multi-provider resolver (`providers.ts`) supporting Gemini, NVIDIA NIM, Groq, OpenRouter, LiteLLM gateway, and custom endpoints with whitespace/absent validation.
- **Dynamic Conversational Agent & Intent Engine**:
  - Implemented real-time dynamic context grounding (`engine.ts`) passing active tasks, time blocks, and user facts into LLM prompt contexts.
  - Built two-stage intent engine (`intent.ts`) with deterministic fallback ensuring task creation, queries, and conversational actions work reliably even when remote LLM APIs are offline.
  - Added disambiguation inquiry flow for minimal or underspecified user prompts.
- **Design System, Verification Ladder & Build Concurrency Lock**:
  - Enforced 10-gate verification ladder (`.github/workflows/ci.yml`, `scripts/run-gates.cjs`) including `verify:no-dead-classes`.
  - Implemented exclusive cross-process build lock (`scripts/lib/build-lock.cjs`) eliminating false failures from concurrent builds competing on `tsconfig.tsbuildinfo` and `dist/`.
  - Enforced full design-token scale emission testing in `build-tokens.cjs` (spacing, duration, easing, z-index).
  - Eliminated blanket `components/ui/**` lint exemptions in `lint-tokens.cjs`, achieving 0 debt across all 147 source files.
  - Fixed WCAG 2.2 SC 1.4.3/1.4.11 contrast failures in destructive toast notifications and calendar components.
  - Added mobile notch and keyboard insets across Settings, Profile, and Integrations views.
- **Production Automation Unblocked**:
  - Activated Infisical Secret Sync to Render (`cadence-render`), provisioning `DISPATCH_SECRET` on deployed API endpoints (`POST /api/internal/dispatch` returning HTTP 200).
  - Ratified decisions D-29 (P18-P32 design spec), D-30 (authenticated kill switch PUT endpoint), and D-31 (display1..4 bridge scale).

### Verified
- **10/10 Verification Gates Green**: `node scripts/run-gates.cjs` passing across all packages.
- **784 Vitest Unit & Contract Tests Passing**: 358 in api-server (25 files), 414 in cadence (23 files), 12 in db (2 files passed, 25 local destructive tests skipped).
- **116 Playwright E2E Tests**: Across 13 spec files (100% green).
- **Live Automation Heartbeat**: All 6 links of `verify-automation-chain.mjs` passing with `reminder_runs` incrementing live.

---

## [0.1.2] - 2026-10-07

### Added
- **Dynamic Clerk Boundary & Cold Load Optimization**:
  - Moved Clerk authentication behind an optimistic public router boundary; public routes (`/`, `/download`, `/__design`) render instantly without loading Clerk on first visit.
  - Successfully met all 5 Web Vitals bundle budgets (0 breaching) with first-visit JS at 199.99 kB gzip.
- **Session Persistence & Route Resumption Architecture**:
  - Eliminated auth hydration race in `HomeRedirect` with an explicit loading screen gate.
  - Added route resumption (`cadence_last_path`) that automatically restores the user's active page on app reopen.
  - Documented Clerk production custom domain CNAME strategy in Chapter 18 of the User Manual to ensure first-party cookie survival across mobile process terminations.
- **Safe Area Insets & Responsive Viewports**:
  - Added hardware notch clearance (`pt-safe`) to the sticky header.
  - Added dynamic floating dock clearance (`.pb-dock-clearance` and `.pb-dock-clearance-with-chip`) with desktop media query reset.
  - Removed redundant nested padding across `ActivityPage`, `ProfilePage`, `SettingsPage`, and `MemoryPage`.
  - Added narrow-viewport (320px) calendar navigation wrap and accessible search clear controls in Inbox.
- **Design System Catalog (`/__design`) & Zero-Baseline Token Hygiene**:
  - Mounted standalone Design System Catalog showcasing color palette, typography hierarchy, Activity Rings, density controls, and 44px tap target verification.
  - Eliminated all legacy token infractions; `lint-tokens.cjs --no-baseline` reports 0 violations.
- **Zero-Data-Loss Activity Command Center (`/activity`)**:
  - Dual-tier durable activity logging with offline queuing, multi-type filtering, and JSON/CSV export.
- **Enterprise Product Tour & Notification Primacy**:
  - First-run interactive product tour (`FirstRunTourModal`) with value-first notification primer and in-context permission reminders.

### Verified
- **9/9 Verification Gates Green**: `pnpm run verify` passing across all packages.
- **100/100 Playwright E2E Tests Green**: Desktop Chromium passing all automated accessibility, keyboard, navigation, tap-target, and task lifecycle suites.
- **641 Vitest Tests Passing**: 414 in cadence, 215 in api-server, 12 in db.

## [0.1.1] - 2026-10-04

### Added
- **First-Class Assistant / Agent Surface (`/agent`)**:
  - Implemented dedicated conversational interface (`AgentPage.tsx`) mounting `AgentPanel` with active task context.
  - Added real-time LLM telemetry cards (trust boundary statement, monthly token ceiling quota meter, single-tap reversibility guarantee).
- **First-Class Projects & Lists Management (`/projects`)**:
  - Implemented full project management interface (`ProjectsPage.tsx`) with color accents and per-project task view.
  - Project CRUD (create, edit, delete with confirmation) and per-project task filtering (open, completed, all).
- **Navigation & Routing Integration**:
  - Mounted `/agent` and `/projects` in `App.tsx` with code-split lazy loading.
  - Added direct navigation links in `AppShell.tsx` (secondary navigation & mobile More bottom sheet) and `CommandPalette.tsx`.
- **Master Verification Matrix**:
  - Aligned Module Scorecard in `spec/master-verification-matrix.md` to reflect audited code status (Auth & Onboarding 4/5, Agent & Memory 4/5, Recurrence & Rituals 4/5, Projects 4/5, Settings 4/5).
  - Measured 609 passing Vitest tests across 36 files.

## [0.1.0] - 2026-10-03

### Initial Production Baseline Release (M0)

#### Added
- **Authentication & Multi-Tenant Isolation**:
  - Managed Clerk authentication integration with branded sign-in, sign-up, and landing routes.
  - Per-request database security via `runWithRls` transaction wrapper pinning Clerk JWT claims (`auth.jwt()->>'sub'`).
  - Strict Foreign Key (FK) constraints, CHECK constraints, and CORS allowlist enforcement.
- **Data Engine & Migrations**:
  - Migrations `0000` through `0015` fully applied with zero checksum drift.
  - Complete schema for tasks, focus sessions, projects, tags, subtasks, task files, time blocks, reminders, reminder runs, notification settings, automation flags, focus settings, reschedule proposals, reschedule runs, reschedule settings, agent memory, and recurrence rules (RRULE).
  - 32 database invariant tests passing with 20 schema invariants green.
- **Frontend Core & Design System**:
  - Modularized component architecture (`components/chrome`, `components/task`, `components/shared`, `pages/today`, `pages/inbox`, `pages/focus`, `pages/calendar`, `pages/review`, `pages/settings`, `pages/onboarding`, `pages/profile`, `pages/memory`).
  - Apple Human Interface Guidelines (HIG) aesthetic with OLED `#000000` dark mode tokens and Activity Rings momentum tracker.
  - Web Audio synthesizer cue chimes (`C5-E5-G5`), focus bell, and tactile clicks.
  - Global keyboard shortcuts (`N`, `Cmd+K`, `1`..`6`).
  - Full-screen PWA shell (`manifest.webmanifest`, service worker, offline fallback, maskable icons) with automatic in-app update notification toasts (`PwaUpdateNotifier`) and mobile push event handlers.
- **Background Automation & Scheduling**:
  - `pg_cron` jobs wired for reminder dispatch (every 5m), auto-reschedule sweep (hourly), nightly memory extraction, and recurrence materialization.
  - Rule 9 duration multiplier integration with memory facts before rescheduling.
- **SecretOps & Deployment**:
  - Infisical Secret Manager integration for zero-trust secret management without commiting credentials to Git.
  - Direct CLI deployment workflow for Vercel (`vercel deploy --prod`) and Render (Deploy Hooks) with zero GitHub push dependency.
  - Standalone PWA installation and native Android APK generation via PWABuilder.
  - Long-lived persistent session configuration preventing logout when closing the mobile app.

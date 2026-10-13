# 更新记录

> 版本保持 **0.1.0**（本项目仍在持续改进，未发布正式版本号）。以下按日期记录每次改动。

### 2026-10-13

#### Added
- **Preset classes are adopted at startup, once, and the adoption is recorded.**
  A stored questionnaire REPLACES the shipped rubric and a stored
  `delegate.taskClass` array replaces the shipped list, so a class shipped after
  the configuration was written is drawn by the card, mapped by `routeFor`, and
  unable to dispatch anything — invisible from the inside, and the reason
  `reviewer` has never run for anyone whose configuration predates it. The Host
  now plans the missing entries at startup (`planAdoption`, pure and testable)
  and writes them through the settings service: the rubric entry with the
  wording Jev reads, and one list per PROFILE that is actually missing it — a
  profile nobody pinned stays inherited instead of being written into the
  configuration, and a rubric that is absent or empty is never written at all,
  because that means the shipped one is simply in force. Adoptions are recorded
  in `adoptedClasses`, which is what makes this a one-time event: a class the
  user drops afterwards is never adopted again. Verified against the shape the
  live row has: `documentation` opts from `skip` to `delegate / writer`, the
  second start writes nothing, and dropping the class afterwards is respected.
  A fresh install writes nothing at all.
- **A `documentation` task class and a `writer` role.** "Write the README",
  "draft the release notes", "update the changelog" now classify as their own
  class and reach their own role, instead of being argued about as `research`
  (which reads and changes nothing) or `mechanical` (which rewrites code). The
  class joins the `auto` profile's `delegate.taskClass`; `careful` still
  delegates only `mechanical`. The role is wired through every place the other
  four appear — the rubric Jev reads, `routeFor`, the route, and the allow-list
  — and ships on the same example gateway as the rest. The mock classifier
  answers `readme`, `changelog`, `release notes` and `docs` with the new class,
  placed last in the keyword map on purpose: those match a word PREFIX, so `docs`
  ahead of `docstring` would file a one-line docstring edit as a writing job.
- **The step the card could not do.** A class delegates only when the ACTIVE
  profile's `delegate.taskClass` lists it, and any config this card has ever
  edited pins BOTH that array and the whole `task_class` questionnaire — both
  REPLACE their shipped counterparts instead of merging into them. A class added
  to the preset afterwards is therefore drawn (the shipped layer supplies its
  row, and `routeFor` merges per key) while nothing can dispatch it: `reviewer`
  shipped that way on 2026-10-01 and has never once run for a configuration that
  predates it. The classes section now names the shipped classes this
  configuration never let through and offers one button that adds them back — to
  the questionnaire and to every profile's list, additively, so a deliberately
  tightened profile keeps the shape it was tightened to. Finding them needed
  data the settings scope does not carry — the shipped rubric's wording, and the
  shipped allow-lists — so the `defaults()` Remote method now sends both; the
  card must write a missing class back WITH the wording Jev reads, or the
  allow-list would permit an answer that can never arrive. Verified against the
  pinned shape: the same `documentation` verdict is `skip` before the button and
  `delegate / writer` after it. Nothing else could have fixed it — the CLI
  refuses the desktop profile, and the profile patch is rewritten by the running
  app, so a hand edit would be lost.

#### Changed
- **The README is now the one the `writer` role produced.** The first live
  dispatch of `documentation → writer` wrote a fresh Chinese README, which was
  then reviewed line by line against the sources before adoption: one invented
  key name (`selectionMode` — no such field; the stored one is
  `selections.<session>.mode`) and one dangling cross-reference were corrected,
  the links were rewritten for the root location, and the drafting appendix was
  dropped. The previous README is kept at
  `~/.dsh/backups/dsh-subagent-custom-readme-before-writer-20261013.md`. Still
  placeholders: the three preview images under `docs/images/`, a directory this
  repository has never had.
- **The two projects this one was merged from are now written down, and the
  second copyright notice is restored.** Neither README had ever mentioned the
  lineage, and the repository carried no upstream link at all — so a reader
  meeting `dsh-jev-subagent-dispatch` in `cordis.patch.yml`, or a `mechanical`
  role that no longer exists, had nothing to explain it. The README gained a
  provenance section naming both:
  [`ringoage/dsh-subagent-model-picker`](https://github.com/ringoage/dsh-subagent-model-picker)
  (v1.0.0, the selector, badge and sidebar tab) and
  [`vitas/dsh-jev-subagent-dispatch`](https://github.com/vitas/dsh-jev-subagent-dispatch)
  (v0.8.0, the Jev classification, routing and request rewriting), both MIT.
  `LICENSE` carried only `Vitaliy Ryumshyn`; the model-picker's copyright line —
  `ringoage` — was missing from the merged work, so it is now listed beside it,
  which is what the MIT notice of the work being merged requires.
- **The old name is gone from the code, not only from the README.** The merge
  left `dsh-jev-subagent-dispatch` in fifteen files: module doc comments, the
  `cordis.patch.yml` header, log prefixes, `jev.mjs` error messages, and the
  `[jev-subagent-dispatch]` tag that prefixes every verdict message in the
  conversation. All of it reads `subagent-custom` now, so the tag a person sees
  matches the plugin's name, its settings namespace and its source kind. Only
  two places keep the old name on purpose: this changelog, which is a record of
  what happened, and the README's provenance section, which explains where the
  project came from. A profile that addressed the old row directly is worth a
  look too: the merged plugin's row is `subagent-custom`, and a leftover row for
  `dsh-jev-subagent-dispatch` — pointing at a package that is no longer
  installed, and carrying a mangled `endpoint` from some earlier edit — can be
  deleted.
- **The preview table shows a real screenshot, and no longer points at files
  that never existed.** The settings-card image (`docs/settings-card.png`) is
  wired in; the two cells without a screenshot say so in words instead of
  rendering two broken images on a public page. `docs/settings-routes.png` is
  committed but unreferenced, and the logo stays a placeholder — its `onerror`
  keeps it invisible.
- **The project is published: https://github.com/xingzhen199186/dsh-subagent-custom.**
  First commit `22dcbaf`, 39 files. `.gitignore` keeps the build output (`lib/`,
  `*.tgz`) and the local-development leftovers out of the repository, and
  `.gitattributes` fixes line endings to LF so a clone on any platform matches.
  The first release carries the packed tarball, since a package that ships from
  a tarball is not installable from source without a build step.
- **The README no longer carries a roadmap or a contributing section, and the
  paragraph about the merge's leftover names is gone.** The two sections listed
  plans and a contribution workflow the project does not run; the provenance
  section keeps what it exists for — the two upstream projects and their MIT
  notices.
- **The preview table's last two placeholders are real screenshots now.** The
  picker popover and the 「子代理模型」 sidebar tab were captured from the running
  desktop app. The two captions were reworded to describe what the pictures
  actually show — the old ones promised a title-bar badge that neither picture
  contains — and a clipped edge of the picker shot was trimmed off. The logo
  remains the only placeholder.
- **The settings-card screenshot was replaced with a fuller capture**, showing
  the provider preset, the decision profile and all five roles with their models
  and prompts. Its caption now names what the picture contains rather than the
  questionnaire, which this crop does not reach. Checked before publishing: the
  card's key field is not in the frame. The unreferenced `docs/settings-routes.png`
  was dropped in the same change.
- **The README documents the role prompts.** Until now the mechanism was
  reachable only from the source: a role may carry a `prompt`, injected as a
  message ahead of the subagent's own task, on its first step only, and only
  when that session's selector is on `auto`. `manual` deliberately injects
  nothing — pairing a hand-picked model with a role it is not playing is worse
  than silence. Written by the `writer` role, which is this mechanism in use.
- **The README has a logo.** Generated for this plugin rather than borrowed: one
  path splitting into five branches with a single branch lit — the plugin's job
  in one picture. It ships as a 256×256 PNG (`docs/logo.png`), its corners made
  transparent so the tile keeps its rounded silhouette on GitHub's light and dark
  themes alike. The header's `onerror` hiding trick and the `docs/images/` path
  it pointed at — a directory that never existed — are gone, and the preview
  note no longer calls the logo a placeholder.
- **The README stopped claiming the package is not on npm.** It was published to
  the registry today, so the install section now offers the registry command
  first and keeps the local build as the alternative path. The four images moved
  back to absolute `raw.githubusercontent` URLs — the convention this project
  adopted on 2026-09-30 for exactly this reason: `docs/` is not in the tarball,
  so relative paths render as four broken images on the npm page.
- **The install steps describe the app that exists, and name a real profile.**
  The old text sent people looking for an 「安装本地包」 button and a tarball
  upload; the plugin page actually offers 「添加插件」, whose single field takes a
  package name, a GitHub repository URL or a local directory path, with npm as
  the install source. Installing from the registry is the recommended path now,
  the command-line line names `web` instead of a placeholder, and the local build
  is the third option, kept for people changing the source.

### 2026-10-12

#### Added
- **Regression tests for the role-prompt injection** — the one path that had
  none, and the one that had already broken once. Five cases: the prompt lands
  ahead of the subagent's own task exactly once (a subagent runs many steps);
  `manual` and `inherit` withhold it even though the role *was* recorded, so
  only the mode can be what withholds it; a factory that cannot build the
  message retires nobody (the mark is spent only once the message exists); and
  an aborted or rejected step takes no prompt *and* keeps the subagent's one
  claim for the step that does run. Verified by mutation: flipping the `auto`
  gate fails four of them, moving the mark above the null check fails the
  fourth.

#### Changed
- **One `PROVIDER_PRESETS` table, not two.** `config.mjs` re-exports the shared
  vocabulary instead of keeping its own copy. The two had already drifted:
  `openrouter` was spelled `https://openrouter.ai` + `/api/v1/systemone` in one
  and `https://openrouter.ai/api/v1` + `/systemone` in the other. The
  concatenated URL was identical, so nothing ever failed — the drift just
  waited. The host's spelling is the one kept, so the resolved wire address and
  every existing assertion are unchanged; the card's endpoint placeholder now
  shows the origin rather than a partial path.

#### Fixed
- `scripts/check.mjs` no longer derives its root from `URL.pathname`, which
  keeps the leading slash of a Windows drive path and made every run look under
  `I:\I:\...`. `pnpm run check` passes on Windows now — the item the README had
  listed as outstanding.

### 2026-10-01

#### Added
- **A `review` task class and a `reviewer` role.** "Review this change", "a
  second opinion on that diff", "audit this plan" now classify as their own class
  and get their own route instead of being folded into `research` or argued about
  as `feature_work`. The role ships on the same example gateway as the others —
  this plugin names no particular provider, because which models exist is your
  composition's business — and the role asks one thing of whoever configures it:
  point it at a *different* model than your implementer, since a second opinion
  from the model that wrote the change is worth less. One select in the card, or
  one line in the patch; a route that is not composed fails loudly and names the
  role.
- `review` joins the `auto` profile's `delegate.taskClass`, so an explicit
  `/route review …` and an ordinary review request are both delegated by default.
  The `careful` profile still delegates only `mechanical`.
- The mock classifier answers `review`, `critique`, and `second opinion` with the
  new class, so profile wiring can be exercised without the live API.

### 2026-09-30

#### Fixed
- **A linked checkout dropped every injection in silence — the plugin could not
  work there at all.** The injected message is built with the harness's own
  `@deepseek-ai/dsh-llm`, which the plugin reached through a bare
  `import("@deepseek-ai/dsh-llm")` while declaring no dependency on it. Node
  resolves bare specifiers from the importing module's *real* path, and a plugin
  installed as a `link:` (a dev checkout, which is how this one is normally run)
  has no `node_modules` of its own — so the import failed with
  `ERR_MODULE_NOT_FOUND`, `pluginMessage` caught it and returned `null`, and every
  verdict *and* every diagnostic was discarded. Nothing reached the conversation in
  any mode, for any trigger, which made a working router indistinguishable from an
  unwired one — and made the earlier diagnostics invisible too.

  The factory is now resolved through the entry point of the running host (the
  same copy the host builds its own injections with, so message invariants hold),
  falling back to the bare import. `@deepseek-ai/dsh-llm` is declared as an
  optional peer. When no path resolves, the skip is reported once through the
  logger instead of being swallowed.

  Verified end to end: the same `/route` turn against a stand now lands one
  `user/message` with `source.kind: plugin:jev-subagent-dispatch` in the session
  transcript; before the fix that count was zero.

### 2026-09-30

#### Fixed
- **A failed classification is no longer silent.** A timeout, a rejected key or an
  HTTP error was fail-open *and* mute: the turn proceeded unrouted and nothing
  reached the conversation, so an explicit `/route` that never got an answer looked
  identical to a plugin that was never wired up. An explicit trigger now gets a
  one-line diagnostic naming the failure. Ordinary turns stay silent in `auto` mode
  — a bad key must not write a diagnostic into every turn.
- **The key no longer has to be an environment variable.** It is resolved before
  every call: the credentials store first (the one the Models page writes, where an
  issuer key normally already lives), then `process.env`. Same precedence as the
  search plugin, so one stored key serves both. The field is labelled *Key
  reference* accordingly.
- **`timeoutMs` default was below a real answer.** A live decision against
  `api.b.ai/v1/decisions` took 1517 ms while the shipped budget was 900 ms, so every
  real classification quietly abandoned itself. The default is now 4000 ms.

#### Changed
- The row schema takes every default from the resolver's own `defaults()`; the
  values are no longer repeated in the schema, so they cannot drift again.
- The npm tarball no longer carries `docs/`: README screenshots are absolute
  `raw.githubusercontent` URLs, so the in-tarball copies were dead weight
  (148 kB → 48 kB packed).

### 2026-09-30

#### Fixed
- **The card could show an empty configuration.** A profile patch that addresses
  this plugin's row by id *replaces* the row config the bundle layer inserted —
  the two do not merge. So for anyone who had ever edited the plugin from the card,
  the stored row was the handful of fields the card wrote, and everything else was
  missing: no route rows at all (hence no model selects), and `triggers` collapsed
  to `[]`. The row's `Config` schema now declares the shipped defaults, so the
  settings surface always describes a complete configuration. A regression test
  builds the schema and asserts it.
- `Key environment variable` was a dropdown listing the *provider* ids — `bai`,
  `openrouter`, `typesafe` — where a variable name belongs. It is free text now,
  with the provider preset's variable name as its placeholder.
- `Endpoint`, `API path` and `Model` showed as blank when they were inherited from
  the provider preset. They now show the inherited value as a placeholder, because
  empty there means "take it from the preset" rather than "unset".

### 2026-09-30

#### Added
- The card prints the version it was built from. A browser tab keeps the bundle it
  loaded and a host restart does not reload it, so "the card looks wrong" is very
  often "this tab is running older code" — with the version on screen that is a
  glance instead of an investigation.

#### Fixed
- Re-shot the README screenshots: the first pair was captured with the first-run
  "Preview Notice" dialog still open, which covered the card.

### 2026-09-30

#### Added
- Screenshots of the configuration card and of the routes group (`docs/`), and
  the card is now described where it is documented rather than only in prose.

#### Changed
- The README leads with the two facts that decide whether the plugin works at all
  — the Subagent plugin must be active, and routes must name allowlisted models —
  followed by the task-class → role → route table that used to be scattered across
  three sections.

### 2026-09-30

#### Changed
- The third role is now `junior`, not `mechanical`. Roles name the worker —
  `implementer`, `researcher` — and `mechanical` was the *task class* it serves
  leaking into a role name. The class keeps its name (Jev's rubric decides it and
  `routeFor` still keys on it), so only the role key moved: `routeFor:
  { mechanical: junior }`, `routes: { junior: ... }`.
- Configurations written before the rename keep working: a stale `mechanical`
  route is folded into `junior` on load. That is a migration rather than a note
  because the card commits the whole routes map on any edit, so an edit made
  before the upgrade would otherwise leave a fourth, permanently unreachable role
  sitting in the patch. An explicit `junior` outranks the stale key.

### 2026-09-30

Two answers to "what if the setup is wrong, and what if the job is simple".

#### Added
- The card warns when the Subagent plugin is not active, reading its settings
  namespace as a liveness probe: the loader serves a row's namespace only while
  that row is composed, so a missing one means the delegation tools are very
  likely absent — the state a user would otherwise discover as a verdict with
  nowhere to go. Verified against a profile with the plugin disabled: the warning
  appears, and the allowlist-driven selects keep working, because the two
  namespaces come from different plugins.
- `mechanical` becomes a third role. `mechanical` and `bugfix` are delegated
  together but are not the same job — a rename has an unambiguous spec, a bug fix
  has to find the cause — and sharing one model meant paying the bug-fix price
  for renames.

#### Changed
- The unavailable diagnostic and the log line name the plugin and point at
  Plugins; the log is a warning, since a turn that quietly never routed is not
  info.
- `refactor`, `feature_work` and `meta_chat` remain undelegated by design: they
  are absent from `profiles.*.delegate.taskClass`, so they never reach a route.

### 2026-09-30

Choosing a route is now a choice, not a spelling test. Each role gets its own
select fed by your Subagent allowlist — the same list every verdict is checked
against — so a route can no longer name a model dispatch is forbidden to use.

#### Added
- One model select per role (`implementer`, `researcher`, and any role a profile
  adds), with the options read live from the `subagent-model-selection-settings`
  namespace through `configForms.get`, the framework's supported way to bind a
  namespace another plugin owns.
- A current value outside the allowlist stays visible as its own option instead of
  being silently reselected, so a stranded route is something you can see.

#### Changed
- The raw `role=provider/model` field remains as the fallback wherever that
  namespace is not served — DSH 0.1.5, or a deployment without the Subagent
  model-selection plugin — so the card never loses the ability to set routes.

### 2026-09-30

Routes are editable in the settings card. They were the one nested field the card
left to the profile patch, which made a whole class of mistake invisible: a route
naming a model your Subagent allowlist does not carry still classifies, so the
verdict reads as healthy while there is nowhere to dispatch the task.

#### Added
- A **Routes** field on the plugin's configuration card, written as
  comma-separated `role=provider/model` — `implementer=openrouter/glm-5.3-flash`.
  The value commits on Enter or blur, reaches the next turn without a host
  restart, and clears back to the shipped pair when emptied.
- Validation before the commit: a malformed entry reports `role=provider/model`,
  keeps the previous good value, and cannot half-apply a route map.

#### Changed
- `routes` is no longer a patch-only field; `routeFor`, `profiles`, `questions`
  and `delegationTools` still are.

### 2026-09-30

The configuration card now sits on the plugin's own page, the way the shipped
plugins do it: opening Plugins → `dsh-jev-subagent-dispatch` shows the fields
immediately, instead of one click further in behind a **Configure** control that
nothing in the list announced.

#### Changed
- Register the card in `plugins.bundle.config`, keyed by package name, the slot
  the plugin manager draws inline on the package page. `plugins.row.config` is
  kept alongside it, so DSH 0.1.7 — which knows only that slot — still gets a
  card rather than none.

### 2026-09-30

The configuration card works again, and it works on every settings model DSH
ships: the Plugins row page on 0.1.7 and 0.2.0, and the Plugins settings tab on
0.1.5. No configuration change is needed on any version — the same
`cordis.patch.yml` entry keeps working, and both the profile patch and the card
reach the next turn without a host restart.

#### Added
- Row-configuration page for DSH 0.1.7+, which replaced `settings.plugin.item`
  with the keyed `plugins.row.config` slot. A row's own `Config` is its settings
  section there, so the form is registered against
  `dsh-jev-subagent-dispatch#jev-subagent-dispatch` and gives the row a
  **Configure** control on the Plugins page.
- `src/shared/config.mjs` now carries the package name and the row-config key,
  so the host and the browser cannot disagree about which entry they own.
- Optional `heading` prop on the settings card: the 0.1.7+ row page draws the
  title and crumb around the form itself, so the card drops its own there.

#### Fixed
- **DSH 0.1.7+: the configuration card is reachable again.** The entry was
  missing from the Plugins page entirely — no Configure control and no namespace
  — because it is the *volatile* part of a `Config` schema that 0.1.7 projects a
  form from. Every field of the exported `Config` is now marked `.volatile()`,
  which is inert on 0.1.5, whose `schemastery` (3.18.2) has no such method.
- **DSH 0.1.7+: your configuration actually reaches the router again.** 0.1.7
  hands each volatile field to `apply` as a live accessor (`config.mode.get()`)
  rather than a value. Read as a scalar it looks like an absent field, so every
  turn silently fell back to the constants — `off` mode and the TypeSafe preset
  — whatever the patch or the form said. Every read is now unwrapped.
- **The browser half is loaded at all on 0.1.7+.** `package.json` declared no
  `dsh.client` platform and no `exports["./client"]`, so DSH's client-module
  scanner classified the package as "not a client package" and never served
  `lib/client.js` — the card could not register on any surface.
- **The `schemastery` peer is declared.** In a pnpm profile the module did not
  resolve from the plugin, `buildSchemas()` silently caught the failure, and
  `Config` came out `undefined` with no error anywhere. The peer (≥3.18.1) is
  now in `peerDependencies` beside the `devDependencies` pin.
- **The `patchReload: live` claim is gone from the docs.** Nothing in DSH reads
  that key; live application comes from volatile row fields re-read every turn
  (0.1.7+) or from the settings bridge (0.1.5), not from that setting.
- The dangling `config-schema.mjs` draft is folded into `src/host/index.js`
  (its field list became the real `Config`) and deleted.

### 2026-09-30

Settings card on the Plugins tab: live edits without a restart.

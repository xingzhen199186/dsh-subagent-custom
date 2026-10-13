/**
 * `dsh-subagent-custom` — host half.
 *
 * A pre-step router for DeepSeek Harness: when asked (explicitly, or on
 * every turn in `auto` mode) it asks TypeSafe's System One model (Jev) a
 * set of atomic questions about the user's task, applies the active
 * profile's declarative policy, and — only when the verdict clears the
 * confidence gates — appends a source-attributed user message recommending
 * which subagent model route should take the turn. Everything is fail-open:
 * a slow, failing, or unconfigured router must never break or delay a turn
 * beyond its own timeout.
 *
 * The plugin owns no delegation machinery of its own. The routes it
 * recommends mirror the allowlist configured in Settings → Subagent
 * ("Models agents may choose"); the harness's native `subagent` tool does
 * the actual spawning. The injection is advice the agent may weigh and
 * ignore — measure it via the verdict log before trusting it.
 *
 * Dispatch capability is a prerequisite, checked at request time against
 * the live host services: a delegation tool visible to this agent, the
 * subagent service behind it, and remaining delegation depth. When the
 * check fails, explicit requests get a diagnostic saying what is missing;
 * ordinary turns stay silent and make no API call.
 *
 * Privacy posture: the state sent to TypeSafe is the redacted user turn
 * plus the workspace path, capped to `stateChars`. Credential-shaped
 * strings are replaced before anything leaves the machine. In `once` mode
 * nothing is shared at all unless the user asks for a verdict. Logging is
 * opt-in (`logDir`), and the user's turn text reaches the log only when
 * `logTurnText` is true.
 *
 * @module dsh-subagent-custom
 */

import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { PLUGIN_NAME, PLUGIN_SOURCE_KIND, planAdoption, resolveConfig } from "./config.mjs";
import { SELECTION_MODES } from "./src/shared/config.mjs";
import { installSettings, readConfig } from "./src/host/index.js";
import { checkDispatchCapabilities, routeAdviceFor } from "./capabilities.mjs";
import { classify, resolveApiKeyFrom } from "./jev.mjs";
import { buildState, decide, findTrigger, redact, renderErrorMessage, renderUnavailableMessage, renderVerdictMessage } from "./verdict.mjs";

export const name = PLUGIN_NAME;

/**
 * The row's `Config` schema, which the DSH 0.1.7+ Loader validates the row
 * against and the settings service projects into the Plugins row page. Absent
 * when the schemastery peer does not resolve, in which case cordis treats the
 * row as schema-less and the composition entry stays the sole configuration
 * source. Every field is `.volatile()`; see `src/host/index.js`.
 */
export { Config } from "./src/host/index.js";

/*
 * The plugin is the module NAMESPACE (`name`, `inject`, `apply`, `Config`).
 * There is deliberately no `export default`: the Loader normalizes a default
 * export away (`unwrapExports` does `exports = exports.default ?? exports`),
 * which would hand cordis the bare `apply` function — losing `Config` (so the
 * row gets no settings section at all: no namespace, no Configure control), and
 * losing `name`/`inject` with it. The named exports are the contract.
 */

/**
 * The host's own `createUserMessage`, resolved once per process.
 *
 * A bare `import("@deepseek-ai/dsh-llm")` is NOT enough. A plugin installed as a
 * `link:` (a dev checkout, which is how this one is normally run) has no
 * node_modules of its own, and Node resolves bare specifiers from the importing
 * module's REAL path — so the import fails, `pluginMessage` returns null, and
 * every verdict AND every diagnostic is dropped in silence.
 *
 * The host's copy is found through the process entry point, which lives inside
 * the DSH install root. That is also the instance the host itself builds its own
 * injections with, so message identity invariants keep holding.
 *
 * @returns the factory, or null when neither resolution path works.
 */
let messageFactory;

/**
 * Resolution anchors, most specific first: the entry point of the process that
 * loaded this plugin. `dsh` is normally a symlink into the install root, so an
 * anchor is realpath'd before being used as a resolution base — otherwise the
 * lookup would start in `/usr/local/bin` and find nothing.
 * @returns absolute candidate paths.
 */
function defaultBases() {
  const bases = [];
  if (typeof process.argv[1] === "string" && process.argv[1].length > 0) bases.push(process.argv[1]);
  bases.push(join(process.cwd(), "noop.js"));
  return bases;
}

/**
 * @param bases - resolution anchors (injectable for tests).
 * @returns the factory, or null when no resolution path works.
 */
export async function loadMessageFactory(bases = defaultBases()) {
  if (messageFactory !== undefined) return messageFactory;
  const loaders = bases.map((base) => async () => {
    const { createRequire } = await import("node:module");
    const { pathToFileURL } = await import("node:url");
    let anchor = base;
    try {
      anchor = realpathSync(base);
    } catch {
      // Keep the given path; resolution reports it if it cannot be used.
    }
    return import(pathToFileURL(createRequire(anchor).resolve("@deepseek-ai/dsh-llm")).href);
  });
  loaders.push(() => import("@deepseek-ai/dsh-llm"));
  for (const load of loaders) {
    try {
      const module = await load();
      if (typeof module.createUserMessage === "function") {
        messageFactory = module.createUserMessage;
        return messageFactory;
      }
    } catch {
      // Try the next resolution path; the caller reports if all of them fail.
    }
  }
  messageFactory = null;
  return messageFactory;
}

let warnedNoFactory = false;

/**
 * Build a DSH user message via the pinned peer (`@deepseek-ai/dsh-llm`), which
 * owns message invariants including identity. Returns null when the peer is
 * unreachable: the caller then SKIPS the injection rather than fabricating a
 * message that might violate the session's format contract — but says so out
 * loud, because a silent skip is what made this bug invisible for so long.
 *
 * @param content - the message text.
 * @param logger - optional logger for the one-time failure report.
 * @returns the message, or null.
 */
export async function pluginMessage(content, logger) {
  const createUserMessage = await loadMessageFactory();
  if (createUserMessage === null) {
    if (!warnedNoFactory) {
      warnedNoFactory = true;
      logger?.warn?.("subagent-custom: @deepseek-ai/dsh-llm is unreachable, so verdicts and diagnostics cannot be delivered — check the plugin's install layout");
    }
    return null;
  }
  try {
    return createUserMessage({
      content: [{ type: "text", text: content }],
      source: { kind: PLUGIN_SOURCE_KIND, plugin: PLUGIN_NAME },
    });
  } catch (error) {
    if (!warnedNoFactory) {
      warnedNoFactory = true;
      logger?.warn?.(`subagent-custom: message construction failed — ${String(error?.message ?? error)}`);
    }
    return null;
  }
}

/** Whether logging is configured on (a non-empty directory path). */
function loggingEnabled(config) {
  return typeof config.logDir === "string" && config.logDir.length > 0;
}

/** Fire-and-forget NDJSON append; a logging failure is a warn, never a throw. */
async function logVerdict(logDir, record, logger) {
  try {
    await mkdir(logDir, { recursive: true });
    await appendFile(join(logDir, "verdicts.ndjson"), `${JSON.stringify(record)}\n`, "utf8");
  } catch (error) {
    logger?.warn?.(`subagent-custom: log write failed: ${String(error)}`);
  }
}

/** Pull redacted text out of the claimed messages for the log (bounded). */
function summarizeMessages(messages, config) {
  const text = (messages ?? [])
    .map((message) => (Array.isArray(message?.content)
      ? message.content.filter((part) => part?.type === "text").map((part) => part.text).join(" ")
      : String(message?.content ?? "")))
    .join(" | ");
  return redact(text.slice(0, 300), config.redactPatterns);
}

/**
 * Cordis plugin entry.
 * @param ctx - host context.
 * @param input - the `subagent-custom` row's `config`, already resolved
 *   by the Loader against {@link Config}. On 0.1.7+ every field arrives as a
 *   live accessor and is read through `readConfig`; on 0.1.5 the values are
 *   plain (and the settings section below supplies the live source).
 * @param deps - optional dependency overrides for tests.
 */
export async function apply(ctx, input = {}, deps = {}) {
  // `deps.pluginMessage` is the test seam; the default resolves the host's own
  // factory and reports through the logger when it cannot.
  const buildMessage = deps.pluginMessage ?? ((text) => pluginMessage(text, logger));
  const logger = ctx.logger;
  let warnedNoFactory = false;

  // The configuration source, re-read on every turn. On 0.1.7+ `input` is the
  // Loader-resolved row config whose volatile fields are LIVE ACCESSORS
  // (`value.get()`), so `readConfig` unwraps them and a settings edit reaches
  // the next turn without a restart; on 0.1.5 `input` is plain and
  // `installSettings` below swaps in the section's own source.
  let source = () => input;
  let boot;
  try {
    boot = resolveConfig(readConfig(source()));
  } catch (error) {
    // A broken config must be loud but must not take the host down: keep the
    // plugin inert and log at error level on every boot.
    logger.error(String(error));
    return;
  }
  let lastGood = boot;
  /**
   * Effective configuration, read fresh so a live settings edit applies. A
   * live edit the router's stricter validation rejects keeps the last good
   * values instead of failing the turn.
   */
  const effective = () => {
    try {
      lastGood = resolveConfig(readConfig(source()));
      return lastGood;
    } catch (error) {
      logger.warn?.(`subagent-custom: live config rejected, keeping previous — ${String(error?.message ?? error)}`);
      return lastGood;
    }
  };

  /**
   * The key for this call, resolved through the shared helper: credentials store
   * first, process environment second.
   */
  const resolveApiKey = () => resolveApiKeyFrom(ctx, effective().apiKeyEnv, logger);

  /**
   * The live per-session selector state, read straight from the row config so a
   * settings edit or a route write-back is visible on the next request without
   * resolving the whole configuration.
   */
  const selections = () => {
    const raw = readConfig(source())?.selections;
    return raw !== null && typeof raw === "object" ? raw : {};
  };

  /**
   * The route Jev assigned to each root session's latest classified turn. Only
   * `auto` mode enforces it; `manual` reads the stored pick, `inherit` declines.
   */
  const routes = new Map();

  /** The model, if any, this session's subagents must run on. */
  const enforcedRoute = (sessionId) => {
    const entry = selections()[sessionId];
    if (entry === null || typeof entry !== "object") return null;
    if (entry.mode === "manual") return usableRoute(entry) ? normalizeRoute(entry) : null;
    if (entry.mode === "auto") {
      const route = routes.get(sessionId);
      return usableRoute(route) ? normalizeRoute(route) : null;
    }
    return null;
  };

  /** The selector's view of one session: its mode, its pick, and Jev's route. */
  const selectionView = (sessionId) => {
    const entry = selections()[sessionId];
    const stored = entry !== null && typeof entry === "object" ? entry : {};
    const provider = typeof stored.routeProvider === "string" ? stored.routeProvider : "";
    const model = typeof stored.routeModel === "string" ? stored.routeModel : "";
    return {
      mode: typeof stored.mode === "string" ? stored.mode : "inherit",
      provider: typeof stored.provider === "string" ? stored.provider : "",
      model: typeof stored.model === "string" ? stored.model : "",
      reasoningEffort: typeof stored.reasoningEffort === "string" ? stored.reasoningEffort : "",
      route: provider !== "" && model !== "" ? { provider, model } : null,
    };
  };

  // The settings service owns the row's live configuration. `configure({auto:
  // false})` keeps `selections` out of the generated form; the selector and the
  // settings card are its only writers. Without the service the plugin still
  // routes — it simply has nowhere to persist a manual pick.
  const entryId = ctx.fiber?.entry?.options?.id ?? PLUGIN_NAME;

  /**
   * Give this configuration every preset class it has never been given.
   *
   * A stored questionnaire REPLACES the shipped rubric and a stored
   * `delegate.taskClass` array replaces the shipped list, so a class shipped
   * after the configuration was written is drawn by the card, mapped by
   * `routeFor`, and unable to dispatch anything — invisible from the inside. It
   * is adopted here, once, at startup, and recorded in `adoptedClasses` so a
   * class the user drops afterwards is never adopted again.
   *
   * Silent when there is nothing to do, which is the ordinary case: a fresh
   * install has the shipped defaults in force already, and nothing is written
   * at all. A write that is made is logged, because a plugin editing the user's
   * configuration is exactly the kind of thing that must not be quiet.
   */
  const adoptPresetClasses = async () => {
    if (settings === undefined) return;
    let plan;
    try {
      const current = readConfig(source());
      plan = planAdoption(current, resolveConfig({}), current?.adoptedClasses);
    } catch (error) {
      logger.warn?.(`${PLUGIN_NAME}: preset adoption skipped — ${String(error?.message ?? error)}`);
      return;
    }
    if (plan === null) return;
    const ops = [];
    if (plan.criteria !== null) ops.push({ op: "set", path: ["questions", "task_class", "criteria"], value: plan.criteria });
    // One list per profile, never the whole map: a profile nobody has pinned
    // must stay inherited rather than be written into the configuration.
    for (const [id, list] of Object.entries(plan.allowLists)) {
      ops.push({ op: "set", path: ["profiles", id, "delegate", "taskClass"], value: list });
    }
    ops.push({ op: "set", path: ["adoptedClasses"], value: plan.adopted });
    try {
      await settings.mutate(entryId, ops);
      logger.warn?.(`${PLUGIN_NAME}: adopted preset task classes into this configuration — ${plan.adopted.join(", ")}`);
    } catch (error) {
      logger.warn?.(`${PLUGIN_NAME}: preset adoption rejected — ${String(error?.message ?? error)}`);
    }
  };

  let settings;
  ctx.inject(["settings"], (child) => {
    settings = child.settings;
    logger.info?.(`${PLUGIN_NAME}: settings injected, service=${typeof settings}, entryId=${entryId}`);
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber));
    void adoptPresetClasses();
  });

  /**
   * Write one session's entry through `mutate`, never `replace`: `replace`
   * resets every volatile field to its inherited value, which would wipe the
   * settings card's own fields.
   */
  const writeSelection = async (sessionId, patch) => {
    if (settings === undefined || typeof sessionId !== "string") return;
    const current = selections()[sessionId];
    const base = current !== null && typeof current === "object" ? current : {};
    try {
      await settings.mutate(entryId, [{ op: "set", path: ["selections", sessionId], value: { ...base, ...patch } }]);
    } catch (error) {
      // A rejected write leaves the previous choice in force; the selector shows
      // whatever the Host actually stored, so it stays truthful either way.
      logger.warn?.(`${PLUGIN_NAME}: selection write rejected — ${String(error?.message ?? error)}`);
    }
  };

  /** Drop one session's entry so it inherits again. */
  const clearSelection = async (sessionId) => {
    if (settings === undefined || typeof sessionId !== "string") return;
    await settings.mutate(entryId, [{ op: "unset", path: ["selections", sessionId] }]);
  };

  /**
   * Publish the route a turn was assigned, so the selector and the subagent
   * badges show the model actually in force. Written only when it changes: the
   * write bumps the settings document, which is the signal every client
   * already subscribes to.
   */
  /**
   * Child dispatches, per root session, for the sidebar tab.
   *
   * Persisted like the selection itself, so the tab still tells you what a
   * session sent out after a restart. Capped per session: this is a recent
   * ledger, not a growing log.
   */
  const dispatches = () => {
    const raw = readConfig(source())?.dispatches;
    return raw !== null && typeof raw === "object" ? raw : {};
  };

  const recordDispatch = async (rootId, entry) => {
    if (typeof rootId !== "string" || settings === undefined) return;
    const current = dispatches()[rootId];
    const list = Array.isArray(current) ? current : [];
    // One row per child, not one per model request: a subagent makes several
    // requests, and appending each would list the same worker over and over.
    const next = [entry, ...list.filter((item) => item?.child !== entry.child)].slice(0, 20);
    try {
      await settings.mutate(entryId, [{ op: "set", path: ["dispatches", rootId], value: next }]);
    } catch (error) {
      // A rejected write costs the ledger entry, never the dispatch.
      logger.warn?.(`${PLUGIN_NAME}: dispatch record rejected — ${String(error?.message ?? error)}`);
    }
  };

  const recordRoute = async (sessionId, route) => {
    if (typeof sessionId !== "string" || settings === undefined) return;
    const current = selections()[sessionId];
    const stored = current !== null && typeof current === "object" ? current : {};
    // Record only a route that will actually be ENFORCED: the selector's job is
    // to show what the subagents run on, and a route that `enforcedRoute` would
    // decline must not be shown as if it were in force.
    const provider = usableRoute(route) ? route.provider : "";
    const model = usableRoute(route) ? route.model : "";
    if (stored.routeProvider === provider && stored.routeModel === model) return;
    await writeSelection(sessionId, { routeProvider: provider, routeModel: model });
  };

  /** Store the selector's choice and return the resulting view. */
  const applySelection = async (sessionId, selection) => {
    if (typeof sessionId !== "string") return null;
    if (selection === null || typeof selection !== "object") {
      await clearSelection(sessionId);
      return selectionView(sessionId);
    }
    const mode = SELECTION_MODES.includes(selection.mode) ? selection.mode : "inherit";
    if (mode === "inherit") {
      await clearSelection(sessionId);
      return selectionView(sessionId);
    }
    await writeSelection(sessionId, {
      mode,
      provider: typeof selection.provider === "string" ? selection.provider : "",
      model: typeof selection.model === "string" ? selection.model : "",
      reasoningEffort: typeof selection.reasoningEffort === "string" ? selection.reasoningEffort : "",
    });
    return selectionView(sessionId);
  };

  // prepend: this listener runs after downstream listeners have produced
  // their decision, so it sees the final claimed batch and appends its
  // message last — the same etiquette the memory plugins use, so the
  // routing verdict sits below recall context in the turn.
  //
  // The listener registers in EVERY mode: `off` exits below before any work
  // (one field read per turn — no classification, no data sharing), and a
  // mode changed from the settings UI reaches the next turn without a host
  // restart, because `effective()` re-reads the live configuration.
  /**
   * Subagent sessions whose role prompt has already been injected.
   *
   * A subagent runs many steps; without this the prompt would be re-injected at
   * the head of every one of them.
   *
   * Cleared wholesale once it grows past any plausible number of live subagents,
   * so a long-lived host does not accumulate one id per dispatch forever. The
   * worst case after a clear is one duplicated prompt, against unbounded growth
   * if it were never reset.
   */
  const prompted = new Set();
  const PROMPTED_LIMIT = 500;

  ctx.on("agent/pre-step", async ({ agent, messages, signal }, next) => {
    // Rebinding rather than returning: this handler has several exits of its own,
    // and leaving early here would skip them — including the Jev classification,
    // which matters when `skipSubagentSessions` is turned off.
    let decision = await next();
    // A role's prompt goes in before its subagent's first step, ahead of the task
    // the main model gave it.
    //
    // It sits above the skip-subagent return, which would otherwise make it dead
    // code for exactly the sessions it exists for. It does NOT sit above the Jev
    // switch in any useful sense: a role is only ever recorded when Jev classified
    // the turn and said to delegate, so with Jev off there is no role to look up
    // and nothing is injected. The position buys the skip-subagent case, nothing
    // more.
    try {
      const child = agent?.session;
      if (child?.header?.origin === "subagent" && !prompted.has(child.id)) {
        // Which session's verdict governs this child. The header's `parentSession`
        // may name the immediate parent or the root, and the verdict was recorded
        // under whichever id that session's own selector state lives at — so ask
        // every candidate rather than betting on one and silently finding nothing.
        const parent = child.header.parentSession;
        const candidates = [
          typeof parent === "string" ? parent : undefined,
          typeof parent === "string" ? sessionKey(parent) : undefined,
          rootSessionIdOf(agent, ctx.get("agents")),
        ].filter((id) => typeof id === "string" && id !== "");
        // The prompt must come from the same decision the model did.
        //
        // Under `auto` the role decided the model, so the role's prompt belongs
        // with it. Under `manual` the model was hand-picked and no role applies —
        // injecting the previous turn's role prompt would pair a hand-picked model
        // with a role it is not playing, which is worse than injecting nothing.
        const mode = candidates.map((id) => selectionView(id)?.mode).find((value) => typeof value === "string");
        const role =
          mode === "auto"
            ? candidates.map((id) => routes.get(id)?.role).find((value) => typeof value === "string" && value !== "")
            : undefined;
        const text = role === undefined ? undefined : effective().routes?.[role]?.prompt;
        // A rejected step has no message list to prepend to, and an aborted turn
        // should not gain one. Checking first keeps the mark below from being spent
        // on a step that was never going to carry the prompt anyway.
        const enterable = decision?.kind === "enter" && Array.isArray(decision.messages) && signal?.aborted !== true;
        if (enterable && typeof text === "string" && text.trim() !== "") {
          const addition = await buildMessage(text);
          if (addition !== null) {
            // Marked only once the message exists. Marking first meant a single
            // failure retired this subagent for good, with nothing in the log.
            prompted.add(child.id);
            if (prompted.size > PROMPTED_LIMIT) prompted.clear();
            decision = { ...decision, messages: [addition, ...decision.messages] };
          }
          logger.warn("role prompt could not be built; this subagent will run without it");
        }
      }
    } catch (error) {
      // A prompt that cannot be injected must never break the turn it was meant to
      // improve — but it must not vanish either: swallowing this silently is how a
      // broken lookup stayed invisible through several rounds of testing.
      logger.warn(`role prompt injection skipped: ${error?.message ?? error}`);
    }
    try {
      const config = effective();
      if (config.mode === "off") return decision; // silent by default, zero cost
      if (decision?.kind !== "enter" || signal?.aborted) return decision;
      if (config.skipSubagentSessions && agent?.session?.header?.origin === "subagent") return decision;

      const trigger = findTrigger(decision.messages, config);
      // mode "once": only explicit /route / /jev requests classify — one
      // call per request, everything else passes through untouched.
      if (config.mode === "once" && trigger === null) return decision;

      // Runtime capability gate, re-evaluated at request time: delegation
      // needs a visible delegation tool, the subagent service behind it,
      // and remaining depth — none of which this plugin's install implies.
      const services = deps.services ?? {
        tools: ctx.get("tools"),
        subagents: ctx.get("subagents"),
        sessionProjections: ctx.get("sessionProjections"),
      };
      const capabilities = checkDispatchCapabilities(services, agent, config.delegationTools);
      if (!capabilities.ok) {
        // Ordinary turns stay completely silent — no injection, no call, no
        // log spam. Only an explicit request gets a diagnostic (and a log
        // line) saying what is missing.
        if (trigger === null) return decision;
        const reason = capabilities.missing.join("; ");
        if (loggingEnabled(config)) {
          await logVerdict(config.logDir, {
            at: new Date().toISOString(),
            session: agent?.session?.id ?? null,
            mode: config.mode,
            trigger: trigger?.action ?? null,
            action: "unavailable",
            reason,
          }, logger);
        }
        logger.warn?.(`subagent-custom: dispatch unavailable — ${reason}`);
        const addition = await buildMessage(renderUnavailableMessage(capabilities.missing));
        return addition === null ? decision : { ...decision, messages: [...decision.messages, addition] };
      }

      const state = buildState(decision.messages, agent?.cwd ?? process.cwd(), config.stateChars, config.redactPatterns, trigger?.task ?? "");
      if (state === "") return decision; // nothing user-authored to route

      let outcome;
      try {
        const verdict = await classify(config, state, logger, resolveApiKey);
        outcome = decide(verdict, config);
      } catch (error) {
        // Fail-open: a timeout, a 429, a missing key — the turn proceeds
        // unrouted and the reason lands in the log.
        outcome = { action: "error", reason: String(error?.message ?? error) };
      }

      // Record what this turn was assigned. `auto` mode enforces it on every
      // subagent the main agent spawns, and the selector displays it. A skip or
      // a failure withdraws the previous route, so `auto` never enforces a stale
      // recommendation.
      // File the route under the SAME key enforcement will look it up by.
      //
      // This session's own id is not that key: a conversation can be derived from
      // one in another workspace, so its root differs from itself. Writing under
      // the raw id put the route on one floor while enforcement searched another,
      // and the subagent silently ran on the caller's model.
      const turnSession = sessionKey(agent?.session?.id);
      const turnRoute = outcome.action === "delegate" ? { ...outcome.route, role: outcome.role, policy: capabilities.routePolicy } : null;
      routes.set(turnSession, turnRoute);
      await recordRoute(turnSession, turnRoute);

      // Build the injection BEFORE logging so the record can tell delivery
      // from mere policy: `action` is what Jev decided, `delivered` is
      // whether the recommendation actually reached the turn. What the log
      // still cannot see is whether the main agent followed the advice —
      // that is the routing ledger's job (see README).
      let addition = null;
      if (outcome.action === "delegate") {
        logger.info?.(`subagent-custom: recommend → ${outcome.role} (${outcome.route.provider}/${outcome.route.model}), confidence ${outcome.confidence.toFixed(2)}`);
        // The named route is only rendered when the session's model-selection
        // policy allows it AND the visible tool can follow it; otherwise the
        // recommendation defers to the child default or the session
        // allowlist. Re-read at request time.
        const selectedTool = (config.delegationTools ?? []).find((tool) => tool.toolName === capabilities.toolName);
        const routeAdvice = routeAdviceFor(capabilities.routePolicy, outcome.route, capabilities.routePolicy === "named"
          ? services.sessionProjections?.stateOf?.(agent?.session, "subagentModelSelectionPolicy")
          : undefined, capabilities.toolName, selectedTool?.provider);
        addition = await buildMessage(renderVerdictMessage(outcome, config, { preview: trigger?.action === "preview", routeAdvice }));
      } else if (outcome.action === "error" && trigger !== null) {
        // Only an explicit request hears about it: in `auto` mode an ordinary
        // turn that fails must stay as silent as it was before, or a bad key
        // would write a diagnostic into every single turn.
        logger.warn?.(`subagent-custom: classification failed — ${outcome.reason}`);
        addition = await buildMessage(renderErrorMessage(outcome.reason));
      } else if (outcome.action === "skip" && trigger?.action === "preview") {
        // Preview exists to inspect the cases you cannot see otherwise —
        // misses included: render the skip verdict with its answers.
        addition = await buildMessage(renderVerdictMessage(outcome, config, { preview: true }));
      }
      if (addition === null && outcome.action === "delegate" && !warnedNoFactory) {
        warnedNoFactory = true;
        logger.warn?.("subagent-custom: @deepseek-ai/dsh-llm is unavailable; skipping injection instead of fabricating a message");
      }

      if (loggingEnabled(config)) {
        await logVerdict(config.logDir, {
          at: new Date().toISOString(),
          id: randomUUID(),
          session: agent?.session?.id ?? null,
          mode: config.mode,
          trigger: trigger?.action ?? null,
          ...(config.logTurnText ? { turn: summarizeMessages(decision.messages, config) } : {}),
          action: outcome.action,
          reason: outcome.reason ?? null,
          confidence: outcome.confidence ?? null,
          ...(outcome.action === "delegate" ? { delivered: addition !== null } : {}),
          route: outcome.route ?? null,
          role: outcome.role ?? null,
          model: outcome.model ?? null,
          usage: outcome.usage ?? null,
          latencyMs: outcome.latencyMs ?? null,
          answers: outcome.answers ?? null,
        }, logger);
      }

      if (addition !== null) return { ...decision, messages: [...decision.messages, addition] };
      if (outcome.action !== "delegate") {
        logger.info?.(`subagent-custom: skip — ${outcome.reason}`);
      }
      return decision;
    } catch (error) {
      logger.warn?.(`subagent-custom: unexpected failure, turn proceeds unrouted — ${String(error)}`);
      return decision;
    }
  }, { prepend: true });

  // The only place a subagent's model can be rewritten, and it wins over
  // whatever the caller passed — including a route the main agent named itself.
  // That is what makes `auto` and `manual` enforcement rather than advice.
  //
  // Registered after the pre-step listener so the two never share a position in
  // a context that records them in order.
  ctx.on("agent/request", async (payload, next) => {
    const config = await next();
    const agent = payload.agent;
    const depth = agent?.options?.subagentDepth;
    if (typeof depth !== "number" || depth < 1) return config;
    // Which session's selector state governs this child.
    //
    // The DIRECT parent first, and only then the root walk. The walk needs the
    // live agent registry, which is not always populated — and when it fails it
    // returns the session's own id instead. That is how the selector came to
    // write under one id while enforcement looked up another, so a subagent ran
    // on the caller's model with the assignment silently unused. The parent
    // named in the child's own header is the session that spawned it, which is
    // exactly the session whose selector state applies.
    const parentSession = agent?.session?.header?.parentSession;
    const parentOwnsState = typeof parentSession === "string" && selections()[parentSession] !== undefined;
    const direct = parentOwnsState ? parentSession : rootSessionIdOf(agent, ctx.get("agents"));
    if (direct === undefined) return config;
    // One key for the whole handler: enforcement, the ledger and the route all
    // have to agree, or a value written under one id is searched for under
    // another and the assignment quietly does nothing.
    const sessionId = sessionKey(direct);
    const route = enforcedRoute(sessionId);
    // Record what the child is about to run on EITHER WAY. Recording only when
    // this plugin enforces a route would leave the ledger empty for a session
    // that simply inherits — which reads as "the feature is broken" when in fact
    // nothing was ever written.
    //
    // Enforcement is unconditional: the route the plugin assigned wins over
    // whatever the caller passed. If that model cannot run, that is a model
    // availability problem to fix where the model is configured — not a reason
    // to quietly fall back and make the assignment decorative.
    const overridden = route === null ? config : { ...config, provider: route.provider, model: route.model };
    if (route !== null && route.reasoningEffort !== undefined) overridden.reasoningEffort = route.reasoningEffort;
    else if (route !== null) delete overridden.reasoningEffort;
    // Fire-and-forget: the record is a convenience, and the request must not
    // wait on a settings write.
    void recordDispatch(sessionId, {
      at: new Date().toISOString(),
      role: routes.get(sessionId)?.role ?? "",
      provider: overridden.provider ?? "",
      model: overridden.model ?? "",
      child: agent?.session?.id ?? "",
    });
    return overridden;
  });

  /**
   * The key a session's selector state lives under.
   *
   * The exact id first, and only then the root walk. The walk depends on the live
   * agent registry, so it can answer differently at different moments — which is
   * how a write landed under one id while a later read looked under another and
   * found nothing. An exact match cannot drift; the walk stays as the fallback
   * for a caller that only knows a child session.
   */
  const sessionKey = (sessionId) => {
    if (typeof sessionId !== "string" || sessionId === "") return sessionId;
    // The SELECTION is the authority. Consulting the ledger too would let a
    // stale entry pin the key to a non-root id and keep the two apart forever.
    if (selections()[sessionId] !== undefined) return sessionId;
    return resolveRootSessionId(sessionId, ctx.get("agents"));
  };

  // The settings bridge for 0.1.5, which still has `installSection`; on 0.1.7+
  // the row's Config above is the settings section and this is a no-op. It
  // swaps `source` for the section's own fully-resolved view, so card changes
  // reach the next turn without a restart. Best effort — without the settings
  // seam (or the schemastery peer) the profile patch stays the whole
  // configuration.
  try {
    installSettings(ctx, {
      baseInput: input,
      resolveConfig,
      logger,
      setSource: (next) => {
        source = next;
      },
    });
  } catch (error) {
    logger.debug?.(`subagent-custom: settings UI bridge unavailable — ${String(error?.message ?? error)}`);
  }
  // ---- the composer selector's Remote service ---------------------------
  // Registered last on purpose: the dynamic protocol import below is the only
  // await in this function, and the two listeners above must be in place by the
  // time `apply` returns.
  // An optional peer: without the protocol the plugin still routes, it just has
  // no selector to read a manual pick from.
  const protocol = await import("@deepseek-ai/dsh-typert-protocol").catch((error) => {
    logger.debug?.(`${PLUGIN_NAME}: typert protocol unavailable — ${String(error?.message ?? error)}`);
    return undefined;
  });
  if (protocol !== undefined) {
    // Fail-open like everything else here: the selector is a convenience, the
    // router is the product. A context that cannot host a Remote service — or a
    // protocol whose version does not match this peer range — must not take the
    // routing half down with it.
    try {
      const { Remote, TypertRemoteService } = protocol;
      class SelectionService extends TypertRemoteService {
        constructor(c) {
          super(c, PLUGIN_NAME, { namespace: PLUGIN_NAME });
        }
        /**
         * Read this session's selector state.
         *
         * `async` on purpose, like `set` below: a SYNCHRONOUS Remote method's
         * return value does not survive the wire — it arrives as an empty object
         * — so the selector could never recover a stored choice after a remount
         * and only ever showed what a write had just handed back.
         */
        async read(sessionId) {
          return selectionView(sessionKey(sessionId));
        }
        /**
         * What this session has actually dispatched, newest first.
         *
         * `async` for the same reason as `read`: a synchronous Remote method's
         * return value arrives as an empty object.
         */
        async dispatches(sessionId) {
          const list = dispatches()[sessionKey(sessionId)];
          return Array.isArray(list) ? list : [];
        }
        /**
         * What this plugin ships, independent of anyone's configuration.
         *
         * The card could not reach this: the settings scope exposes the user's own
         * layers, and a config written before a role existed silently hides it —
         * `reviewer` was unreachable that way, and so was the `review` class it
         * answers to. Sending the shipped set lets the card draw everything the
         * plugin knows about, configured or not.
         *
         * `criteria` and `allowLists` are here for the same reason, one step
         * further on: drawing a class is not enough to make it work. A stored
         * `task_class` questionnaire REPLACES the shipped one, and a stored
         * `delegate.taskClass` array replaces the shipped list — so the card
         * needs the shipped wording to write a missing answer back with, and the
         * shipped lists to know which classes a profile is missing.
         *
         * `async` for the same reason as `read`: a synchronous Remote method's
         * return value arrives as an empty object.
         */
        async defaults() {
          const shipped = resolveConfig({ mock: true });
          return {
            roles: Object.keys(shipped.routes ?? {}),
            routeFor: shipped.routeFor ?? {},
            classes: Object.keys(shipped.questions?.task_class?.criteria ?? {}),
            criteria: shipped.questions?.task_class?.criteria ?? {},
            allowLists: Object.fromEntries(
              Object.entries(shipped.profiles ?? {}).map(([id, profile]) => [id, profile?.delegate?.taskClass ?? []]),
            ),
          };
        }
        /**
         * Store this session's choice.
         *
         * The exact session id, never a root walk: the selector sits on the
         * session the user is in, and that is the session a subagent's own header
         * names as its parent — which is what enforcement looks up. Walking here
         * would file the choice under an id enforcement never asks about.
         */
        async set(sessionId, selection) {
          return applySelection(sessionId, selection);
        }
        /** Drop this session's choice so it inherits again. */
        async clear(sessionId) {
          await clearSelection(sessionId);
          return null;
        }
      }
      decorateRemote(Remote, SelectionService, ["read", "dispatches", "defaults", "set", "clear"]);
      new SelectionService(ctx);
    } catch (error) {
      logger.warn?.(`${PLUGIN_NAME}: composer selector unavailable — ${String(error?.message ?? error)}`);
    }
  }

  logger.info(`subagent-custom: listening (mode: ${boot.mode})`);
}

/**
 * Walk an agent's parent chain up to the non-subagent root session id.
 *
 * The composer selector keys its state by root session id, so a child's request
 * resolves the same entry the session that spawned it wrote.
 *
 * @param agent - the agent whose chain is walked.
 * @param agents - the live agent registry.
 * @returns the root session id, or undefined when the chain cannot be read.
 */
function rootSessionIdOf(agent, agents) {
  if (agent === undefined || agent === null || agents === undefined) return undefined;
  let current = agent;
  const visited = new Set();
  while (current !== undefined && current !== null) {
    const id = current.id;
    if (id === undefined || visited.has(id)) return undefined;
    visited.add(id);
    const header = current.session?.header;
    if (header !== undefined && header.origin !== "subagent") return id;
    const parentId = header?.parentSession;
    if (!parentId) return id;
    current = agents.get(parentId);
  }
  return undefined;
}

/**
 * The same walk, starting from an id the browser sent. A session that is not in
 * the live registry keeps its own id, which simply resolves no selection.
 *
 * @param sessionId - the id the client addressed.
 * @param agents - the live agent registry.
 * @returns the root session id to key the selection by.
 */
function resolveRootSessionId(sessionId, agents) {
  if (typeof sessionId !== "string" || agents === undefined) return sessionId;
  return rootSessionIdOf(agents.get(sessionId), agents) ?? sessionId;
}

/** Whether a value names a usable provider/model pair. */
function usableRoute(value) {
  return value !== null && typeof value === "object"
    && typeof value.provider === "string" && value.provider !== ""
    && typeof value.model === "string" && value.model !== "";
}

/** Keep only the fields an override owns; an empty effort means "inherit". */
function normalizeRoute(selection) {
  return {
    provider: selection.provider,
    model: selection.model,
    ...(typeof selection.reasoningEffort === "string" && selection.reasoningEffort !== ""
      ? { reasoningEffort: selection.reasoningEffort }
      : {}),
  };
}

/**
 * Apply the `@Remote(name)` markers to a `TypertRemoteService` subclass in plain
 * JavaScript, without the ES decorator runtime.
 *
 * @param Remote - the decorator factory from the typert protocol.
 * @param serviceClass - the subclass to mark.
 * @param methodNames - the methods that become Remote endpoints.
 */
function decorateRemote(Remote, serviceClass, methodNames) {
  const instance = Object.create(serviceClass.prototype);
  for (const methodName of methodNames) {
    Remote(methodName)(null, {
      name: methodName,
      private: false,
      static: false,
      addInitializer(fn) {
        fn.call(instance);
      },
    });
  }
}

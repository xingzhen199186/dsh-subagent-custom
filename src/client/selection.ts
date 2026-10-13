/**
 * The per-session subagent-model state, shared by the composer selector and the
 * badges that show which model is actually in force.
 *
 * The Host owns this state: it keys it by root session id, enforces it on the
 * subagent's own request, and writes the route Jev assigned back into the same
 * record. Everything here is a thin read of that record — the browser never
 * decides which model a subagent runs on, it only shows and edits the choice.
 */

/** How this session's subagents get their model. */
export type SelectionMode = 'inherit' | 'auto' | 'manual'

/** One session's stored state, as the Host reports it. */
export interface SelectionView {
  mode: SelectionMode
  /** The manual pick; empty unless `mode` is `manual`. */
  provider: string
  model: string
  reasoningEffort: string
  /** The route Jev assigned to this session's latest classified turn. */
  route: { provider: string; model: string } | null
}

/**
 * Unwrap one Remote response.
 *
 * A namespace call answers with an envelope — `{ ok: true, value }` or
 * `{ ok: false, error }` — not the bare value. Treating the envelope as the
 * payload is silent: every field reads as undefined and the selector falls back
 * to its default label while the Host has in fact stored the choice.
 */
function unwrap(response: any): SelectionView | null {
  if (response === null || typeof response !== 'object' || response.ok !== true) return null
  const value = response.value
  return value === null || typeof value !== 'object' ? null : (value as SelectionView)
}

/** What the plugin ships, independent of any configuration. */
export interface ShippedDefaults {
  roles?: string[]
  routeFor?: Record<string, string>
  classes?: string[]
  /**
   * The shipped rubric wording, keyed by class.
   *
   * A stored questionnaire replaces the shipped one wholesale, so this is the
   * only copy of the wording a class the row never learned about can be written
   * back with — without it the class has no answer Jev could give.
   */
  criteria?: Record<string, string>
  /** Each decision profile's shipped allow-list, keyed by profile id. */
  allowLists?: Record<string, string[]>
}

/** Read the shipped defaults, unwrapped like every other call. */
export async function readDefaults(service: any): Promise<ShippedDefaults | null> {
  try {
    const raw = await service?.defaults()
    const enveloped = raw !== null && typeof raw === 'object' && 'ok' in raw
    const value = enveloped
      ? (raw as { ok: boolean; value?: unknown }).ok === true
        ? (raw as { value?: unknown }).value
        : null
      : raw
    return value !== null && typeof value === 'object' ? (value as ShippedDefaults) : null
  } catch {
    return null
  }
}

/** One subagent the Host actually sent out. */
export interface DispatchRecord {
  at?: string
  role?: string | null
  provider?: string
  model?: string
  child?: string | null
}

/**
 * What this session has dispatched, newest first.
 *
 * Unwrapped like a read: the Remote layer answers with an envelope, and a Host
 * that says nothing yields an empty list rather than a broken panel.
 */
export async function readDispatches(service: any, sessionId: string | undefined): Promise<DispatchRecord[]> {
  if (sessionId === undefined || sessionId === '') return []
  try {
    const raw = await service?.dispatches(sessionId)
    const enveloped = raw !== null && typeof raw === 'object' && 'ok' in raw
    const value = enveloped
      ? (raw as { ok: boolean; value?: unknown }).ok === true
        ? (raw as { value?: unknown }).value
        : null
      : raw
    return Array.isArray(value) ? (value as DispatchRecord[]) : []
  } catch {
    return []
  }
}

/**
 * Read one session's state.
 *
 * `service` is the RESOLVED namespace service, never the gateway: reaching a
 * namespace through `ctx.remote.<ns>` demands that name in the inject list, and
 * this namespace only comes into existence when the client mounts its
 * contribution — declaring it up front would deadlock. `ctx.get('remote.<ns>')`
 * after the mount is the supported route, and passing the gateway here instead
 * is what silently dropped every read and write.
 *
 * @param service - the resolved `remote.subagent-custom` service.
 * @param sessionId - the session the surface is showing.
 * @returns the stored view, or null when the Host has nothing for it.
 */
export async function readView(service: any, sessionId: string | undefined): Promise<SelectionView | null> {
  if (sessionId === undefined || sessionId === '') return null
  try {
    const raw = await service?.read(sessionId)
    return unwrap(raw)
  } catch {
    // A Host that cannot answer leaves the surface empty rather than broken.
    return null
  }
}

/**
 * Store one session's choice.
 *
 * @param service - the resolved `remote.subagent-custom` service.
 * @param sessionId - the session the surface is showing.
 * @param selection - the mode, and the pick when the mode is `manual`.
 * @returns the Host's view after the write, or null when it could not be made.
 */
export async function writeView(
  service: any,
  sessionId: string | undefined,
  selection: { mode: SelectionMode; provider?: string; model?: string; reasoningEffort?: string },
): Promise<SelectionView | null> {
  if (sessionId === undefined || sessionId === '') return null
  try {
    return unwrap(await service?.set(sessionId, selection))
  } catch {
    return null
  }
}

/** Subscribe to the Host's state changes; returns the unsubscribe. */
export function subscribe(remote: any, listener: () => void): () => void {
  try {
    const off = remote?.$on?.('settings/document-updated', listener)
    return typeof off === 'function' ? off : () => {}
  } catch {
    return () => {}
  }
}

/** `provider · model`, the one spelling every surface uses. */
export function routeLabel(provider: string, model: string): string | null {
  if (provider === '' || model === '') return null
  return `${provider} · ${model}`
}

/**
 * The model this session's subagents actually run on, or null when they simply
 * inherit — the case where a badge would say nothing worth reading.
 */
export function effectiveModel(view: SelectionView | null): string | null {
  if (view === null) return null
  if (view.mode === 'manual') return routeLabel(view.provider, view.model)
  if (view.mode === 'auto' && view.route !== null) return routeLabel(view.route.provider, view.route.model)
  return null
}

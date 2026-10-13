/**
 * The `subagent-custom` fields this card edits.
 *
 * `routes` is here because it is the one nested field that fails silently: a
 * route naming a model the Subagent allowlist forbids still classifies, so the
 * verdict looks healthy while nothing can be dispatched. `routeFor` and the
 * questionnaire are read — not edited here yet — so the routes section can say
 * what each role actually takes instead of leaving the user to guess.
 */
export interface JevSettings {
  mode?: string
  provider?: string
  endpoint?: string
  apiPath?: string
  apiKeyEnv?: string
  model?: string
  timeoutMs?: number
  stateChars?: number
  triggers?: string[]
  logDir?: string
  logTurnText?: boolean
  activeProfile?: string
  routes?: Record<string, { provider?: string; model?: string; prompt?: string }>
  /** Task class → role. */
  routeFor?: Record<string, string>
  /** The Jev questionnaire; only `task_class.criteria` is read here. */
  questions?: { task_class?: { criteria?: Record<string, string> } }
  /**
   * The decision profiles. A class only ever delegates when the ACTIVE profile
   * lists it under `delegate.taskClass`, so adding a class without touching this
   * is what leaves a new class permanently unemployed.
   */
  profiles?: Record<string, { delegate?: { taskClass?: string[] } }>
  /**
   * Preset classes this configuration has already been given.
   *
   * Written by the Host when it adopts a class on upgrade, and by the card when
   * its button does the same by hand. The marker is what makes an adoption a
   * one-time event: without it a class the user dropped would come back on
   * every start.
   */
  adoptedClasses?: string[]
}

/**
 * The slice of the `subagent-model-selection-settings` namespace this card
 * reads. The allowlist lives in another plugin's namespace, which DSH supports
 * on purpose: `configForms.get(ns)` binds any served namespace, so the card can
 * offer exactly the models dispatch is allowed to use instead of taking a model
 * name on trust. Absent when that plugin is not composed — the card then falls
 * back to the raw field.
 */
export interface SubagentAllowlist {
  allowedModels?: Array<{ provider?: string; model?: string }>
}

/** Minimal slice of the framework settings scope this card consumes. */
export interface JevScope {
  getSnapshot(): {
    status: 'loading' | 'ready' | 'unavailable'
    value: JevSettings | undefined
    base: unknown
    user: unknown
    revision: number | undefined
    writable?: boolean
  }
  subscribe(listener: () => void): () => void
  set(field: string, value: unknown): Promise<void>
  unset(field: string): Promise<void>
}

/**
 * Settings card for the `subagent-custom` namespace, rendered on the
 * Plugins settings tab through the keyed `settings.plugin.item` slot.
 *
 * Reads ride the framework describe-mirror via the bound settings scope; writes
 * go through the scope's revision-fenced `set`/`unset`, so this card and the
 * profile patch can never clobber each other. Deeper policy (profiles,
 * probabilityMax, routeFor) is deliberately NOT editable here — the card says so
 * and points at the profile patch. `routes` is the exception, because it is the
 * one that fails silently: a route naming a model the Subagent allowlist
 * forbids still classifies, so the verdict reads as healthy while there is
 * nowhere to dispatch. Built from plain React + design tokens to respect DSH's
 * client bundle-purity rule.
 */
import * as React from 'react'
import { useCallback, useState, useSyncExternalStore } from 'react'
import { PACKAGE_NAME, PROVIDER_PRESETS } from '../shared/config.mjs'
import { localeRevision, subscribeLocale, tr } from './i18n.js'
import { readDefaults } from './selection.js'
import type { ShippedDefaults } from './selection.js'
import { pickerService as sharedService } from './index.js'
import type { JevScope, JevSettings, SubagentAllowlist } from './types.js'

const MODES = [
  { id: 'off', labelKey: 'modeOff' as const },
  { id: 'once', labelKey: 'modeOnce' as const },
  { id: 'auto', labelKey: 'modeAuto' as const },
]
/**
 * The same table the host resolves against, imported rather than repeated: the
 * card offers these preset ids *and* previews what each one supplies below.
 */
const PROVIDERS = Object.keys(PROVIDER_PRESETS)
const PROFILES = ['auto', 'careful']

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '6px 8px', borderRadius: 6,
  border: '1px solid var(--dsw-alias-border-default, #444)',
  background: 'var(--dsw-alias-bg-input, transparent)',
  color: 'inherit', font: 'inherit',
}
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 2 }
const hintStyle: React.CSSProperties = { fontSize: 11, color: 'var(--dsw-alias-text-tertiary, #888)', marginTop: 3 }
const resetStyle: React.CSSProperties = {
  marginLeft: 6, font: 'inherit', fontSize: 10, background: 'none', border: 'none',
  color: 'inherit', cursor: 'pointer', textDecoration: 'underline',
}
const segWrap: React.CSSProperties = { display: 'flex', gap: 0, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--dsw-alias-border-default, #444)', width: 'fit-content' }
const segBtn = (active: boolean): React.CSSProperties => ({
  font: 'inherit', fontSize: 12, padding: '5px 14px', border: 'none', cursor: 'pointer',
  background: active ? 'var(--dsw-alias-bg-accent, #35506b)' : 'transparent',
  color: active ? '#fff' : 'inherit',
})
const errorStyle: React.CSSProperties = { fontSize: 11, color: 'var(--dsw-alias-text-danger, #e66)', marginTop: 4 }
const versionStyle: React.CSSProperties = {
  fontSize: 10, margin: '14px 0 0', opacity: 0.55, letterSpacing: 0.2,
  fontFamily: 'var(--dsw-alias-font-mono, ui-monospace, monospace)',
}
const warningStyle: React.CSSProperties = {
  fontSize: 11, margin: '0 0 12px', padding: '8px 10px', borderRadius: 6,
  border: '1px solid var(--dsw-alias-border-danger, #a33)',
  background: 'var(--dsw-alias-bg-danger-subtle, rgba(200, 60, 60, 0.12))',
  color: 'var(--dsw-alias-text-danger, #e66)',
}
const groupStyle: React.CSSProperties = { borderTop: '1px solid var(--dsw-alias-border-default, #333)', marginTop: 16, paddingTop: 10 }
const headStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, margin: '0 0 8px', color: 'var(--dsw-alias-text-secondary, #aaa)' }

/**
 * Chinese wording for the shipped task classes — DISPLAY ONLY.
 *
 * The names stay English on the wire, and so does the wording Jev reasons over:
 * Jev's own documentation states English is its primary training language and
 * that CJK input is accepted with lower accuracy, advising a test before routing
 * non-English work. So the classifier keeps the English it was trained on and
 * the screen shows this gloss. A class the user adds has no entry here and shows
 * exactly what they typed.
 */
const TASK_CLASS_COPY: Record<string, { label: string; note: string }> = {
  mechanical: { label: '机械活', note: '改名、重排版、补样板代码、注释或文档字符串——规格明确、不用动脑的机械改动' },
  bugfix: { label: '修故障', note: '修一个原因已经查清的故障，改动范围有限' },
  feature_work: { label: '加功能', note: '新增会改变产品行为的能力' },
  refactor: { label: '重构', note: '在不改变行为的前提下调整结构，涉及设计取舍' },
  research: { label: '调研', note: '收集事实、读代码、比较方案，不改任何东西' },
  review: { label: '复审', note: '对已经存在的东西（一组改动、一个 diff、一份方案）挑毛病，只报告不修改' },
  documentation: { label: '写文档', note: '写或重写面向读者的文字——README、发版说明、更新记录、使用文档，只依据代码和既有材料，不改别的' },
  meta_chat: { label: '闲聊/规划', note: '对话、提问或做计划，这一轮不涉及代码任务' },
}

/** The Chinese gloss for a class, or null when the user named it themselves. */
function classGloss(taskClass: string): string | null {
  const copy = TASK_CLASS_COPY[taskClass]
  return copy === undefined ? null : `${copy.label} — ${copy.note}`
}

/** Observe the bound settings scope as a React snapshot. */
function useScopeSnapshot(scope: JevScope) {
  const subscribe = useCallback((listener: () => void) => scope.subscribe(listener), [scope])
  const get = useCallback(() => scope.getSnapshot(), [scope])
  return useSyncExternalStore(subscribe, get, get)
}

/** Re-render when the active language changes. */
function useLocaleRevision(): number {
  return useSyncExternalStore(subscribeLocale, localeRevision, localeRevision)
}

/**
 * A scope that never changes and carries nothing, used when the deployment has
 * no Subagent allowlist to read. `useSyncExternalStore` compares snapshots by
 * reference, so this is one module constant: a fresh object per read would
 * re-render forever.
 */
const NO_ALLOWLIST: ReturnType<JevScope['getSnapshot']> = {
  status: 'unavailable', value: undefined, base: undefined, user: undefined, revision: undefined,
}
const NO_ALLOWLIST_SCOPE: JevScope = {
  getSnapshot: () => NO_ALLOWLIST,
  subscribe: () => () => {},
  set: async () => {},
  unset: async () => {},
}

/** The allowlist as `provider/model` keys the route selects offer. */
function allowlistKeys(value: unknown): string[] {
  const entries = (value as SubagentAllowlist | undefined)?.allowedModels
  if (!Array.isArray(entries)) return []
  return entries
    .filter((entry) => entry?.provider && entry?.model)
    .map((entry) => `${entry.provider}/${entry.model}`)
}

/** One labeled control: local draft while editing, parse-on-commit, reset-to-base. */
function Field(props: {
  id: string
  label: string
  hint?: string
  value: string
  overridden: boolean
  disabled: boolean
  parse: (text: string) => unknown
  onCommit: (parsed: unknown) => void
  onReset: () => void
  monospace?: boolean
  /** Render as a masked field: the value is a secret the user pastes in. */
  secret?: boolean
  /**
   * Shown when the field is empty, and empty is a real state here: for the
   * endpoint group it means "inherit from the provider preset". Without the
   * hint an inherited value looks like a missing one.
   */
  placeholder?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const shown = draft ?? props.value
  const commit = () => {
    if (draft === null) return
    setDraft(null)
    try {
      const parsed = props.parse(shown)
      setError(null)
      props.onCommit(parsed)
    } catch (e) {
      setError(String((e as Error)?.message ?? e))
    }
  }
  return (
    <div style={{ marginBottom: 12 }}>
      <label htmlFor={props.id} style={labelStyle}>
        {props.label}
        {props.overridden && (
          <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 400, color: 'var(--dsw-alias-text-accent, #69f)' }}>
            {tr('overridden')}
            <button type="button" style={resetStyle} onClick={props.onReset} disabled={props.disabled}>{tr('reset')}</button>
          </span>
        )}
      </label>
      <input
        id={props.id}
        type={props.secret === true ? 'password' : 'text'}
        autoComplete={props.secret === true ? 'off' : undefined}
        style={{ ...inputStyle, ...(props.monospace ? { fontFamily: 'var(--dsw-alias-font-mono, monospace)' } : {}) }}
        value={shown}
        disabled={props.disabled}
        placeholder={props.placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit() }}
      />
      {error !== null && <p style={errorStyle}>{error}</p>}
      {props.hint && <p style={hintStyle}>{props.hint}</p>}
    </div>
  )
}

/** A select rendered as the native control — the scope parses strings itself. */
function Choice(props: {
  id: string
  label: string
  hint?: string
  options: Array<{ id: string; label: string }>
  value: string
  overridden: boolean
  disabled: boolean
  onCommit: (value: string) => void
  onReset: () => void
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label htmlFor={props.id} style={labelStyle}>
        {props.label}
        {props.overridden && (
          <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 400, color: 'var(--dsw-alias-text-accent, #69f)' }}>
            {tr('overridden')}
            <button type="button" style={resetStyle} onClick={props.onReset} disabled={props.disabled}>{tr('reset')}</button>
          </span>
        )}
      </label>
      <select
        id={props.id}
        style={inputStyle}
        value={props.value}
        disabled={props.disabled}
        onChange={(e) => props.onCommit(e.target.value)}
      >
        {props.options.map((option) => (
          <option key={option.id} value={option.id}>{option.label}</option>
        ))}
      </select>
      {props.hint && <p style={hintStyle}>{props.hint}</p>}
    </div>
  )
}

/** The checkbox row for opt-in observability. */
function Toggle(props: {
  id: string
  label: string
  hint?: string
  checked: boolean
  overridden: boolean
  disabled: boolean
  onCommit: (value: boolean) => void
  onReset: () => void
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label htmlFor={props.id} style={{ ...labelStyle, fontWeight: 400 }}>
        <input
          id={props.id}
          type="checkbox"
          checked={props.checked}
          disabled={props.disabled}
          onChange={(e) => props.onCommit(e.target.checked)}
          style={{ marginRight: 6, verticalAlign: 'middle' }}
        />
        {props.label}
        {props.overridden && (
          <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--dsw-alias-text-accent, #69f)' }}>
            {tr('overridden')}
            <button type="button" style={resetStyle} onClick={props.onReset} disabled={props.disabled}>{tr('reset')}</button>
          </span>
        )}
      </label>
      {props.hint && <p style={{ ...hintStyle, marginLeft: 20 }}>{props.hint}</p>}
    </div>
  )
}

/**
 * Top-level card.
 *
 * `heading` draws the card's own title and subtitle; the DSH 0.1.7+ plugin
 * manager row page supplies both itself around the row's form, so the
 * registration there passes `heading: false` rather than printing the title
 * twice.
 */
export function JevSettingsCard(props: { scope: JevScope; allowlist?: JevScope; subagent?: JevScope; heading?: boolean }) {
  useLocaleRevision()
  const snap = useScopeSnapshot(props.scope)
  const allowSnap = useScopeSnapshot(props.allowlist ?? NO_ALLOWLIST_SCOPE)
  const allowed = allowlistKeys(allowSnap.value)
  // Only meaningful where the deployment actually exposes the probe: without a
  // scope we say nothing rather than guess, so 0.1.5 never shows a false alarm.
  const subagentSnap = useScopeSnapshot(props.subagent ?? NO_ALLOWLIST_SCOPE)
  const subagentMissing = props.subagent !== undefined && subagentSnap.status === 'unavailable'
  const [pending, setPending] = useState(0)
  const value: JevSettings = snap.value ?? {}
  /**
   * What the plugin ships, layered under what the user has.
   *
   * `snap.value` is the user's own configuration, and reading only that is how a
   * role the router already uses stayed invisible: this config predates
   * `reviewer`, so neither the role nor the `review` class it answers to was ever
   * drawn. Merging the shipped layer back in makes everything the plugin knows
   * about visible, whether or not anyone has configured it yet.
   */
  const shipped: JevSettings = (snap.base as JevSettings | undefined) ?? {}
  /**
   * The plugin's own defaults, fetched from the Host.
   *
   * Neither scope layer carries them: they are the code's, not anyone's config.
   * Without them a role the router already uses is simply not drawn — `reviewer`
   * was invisible exactly this way, along with the `review` class it answers to.
   */
  const [defaults, setDefaults] = useState<ShippedDefaults | null>(null)
  React.useEffect(() => {
    let live = true
    void readDefaults(sharedService).then((next) => {
      if (live) setDefaults(next)
    })
    return () => {
      live = false
    }
  }, [])
  const allRoutes = { ...(shipped.routes ?? {}), ...(value.routes ?? {}) }
  const allRouteFor = { ...(shipped.routeFor ?? {}), ...(defaults?.routeFor ?? {}), ...(value.routeFor ?? {}) }
  const allCriteria = {
    ...(shipped.questions?.task_class?.criteria ?? {}),
    ...(value.questions?.task_class?.criteria ?? {}),
  }
  // Roles the router knows about, even when nobody has set a model for them.
  const shippedRoles: string[] = defaults?.roles ?? []
  /**
   * What the chosen provider preset supplies. An empty endpoint/model field means
   * "take it from here", so the card shows it as a placeholder rather than leaving
   * four blanks that look like missing configuration.
   */
  const preset = PROVIDER_PRESETS[(value.provider as keyof typeof PROVIDER_PRESETS) ?? 'typesafe'] ?? {}
  const writable = snap.writable !== false && snap.status === 'ready'
  const disabled = !writable
  const showHeading = props.heading !== false

  const commit = useCallback((field: string, parsed: unknown) => {
    setPending((n) => n + 1)
    void props.scope.set(field, parsed).catch(() => {}).finally(() => setPending((n) => n - 1))
  }, [props.scope])
  const reset = useCallback((field: string) => {
    setPending((n) => n + 1)
    void props.scope.unset(field).catch(() => {}).finally(() => setPending((n) => n - 1))
  }, [props.scope])

  // The base layer (the patch) decides whether a field shows the reset chip.
  const overridden = (field: string) => (snap.user as Record<string, unknown> | undefined)?.[field] !== undefined

  if (snap.status === 'loading') return showHeading ? <p style={hintStyle}>{tr('title')}…</p> : null
  if (snap.status === 'unavailable') return <p style={hintStyle}>{tr('unavailable')}</p>

  const number = (min: number, max: number) => (text: string) => {
    const n = Number(text)
    if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${min}–${max}`)
    return n
  }
  const list = (text: string) => text.split(',').map((item) => item.trim()).filter((item) => item.length > 0)
  const trimmed = (text: string) => {
    const v = text.trim()
    if (v.length === 0) throw new Error('empty')
    return v
  }
  const optionalDir = (text: string) => text.trim()

  /** The task classes `routeFor` currently sends to one role. */
  const classesFor = (role: string): string[] =>
    Object.entries(value.routeFor ?? {})
      .filter(([, target]) => target === role)
      .map(([taskClass]) => taskClass)

  /**
   * What one role takes, spelled out.
   *
   * Derived, never stored: the classes come from `routeFor` and their wording
   * from the questionnaire, so the line cannot drift from what the router
   * actually does — edit either side and this follows.
   */
  const describeRole = (role: string): string => {
    const classes = classesFor(role)
    if (classes.length === 0) return tr('roleIdle')
    const criteria = value.questions?.task_class?.criteria ?? {}
    return classes
      .map((taskClass) => {
        const gloss = classGloss(taskClass)
        if (gloss !== null) return gloss
        const note = typeof criteria[taskClass] === 'string' ? criteria[taskClass].trim() : ''
        return note === '' ? taskClass : `${taskClass} — ${note}`
      })
      .join('；')
  }

  /** Rename a role, carrying every task class that points at it. */
  const renameRole = (from: string, to: string): void => {
    const name = to.trim()
    if (name === '' || name === from) return
    const routes = { ...(value.routes ?? {}) }
    // Names stay unique: a clash would silently merge two roles into one.
    if (name in routes) return
    routes[name] = routes[from]
    delete routes[from]
    commit('routes', routes)
    commit(
      'routeFor',
      Object.fromEntries(
        Object.entries(value.routeFor ?? {}).map(([taskClass, target]) => [taskClass, target === from ? name : target]),
      ),
    )
  }

  /** Drop a role, and the task classes that pointed at it. */
  const removeRole = (role: string): void => {
    const routes = { ...(value.routes ?? {}) }
    delete routes[role]
    commit('routes', routes)
    commit('routeFor', Object.fromEntries(Object.entries(value.routeFor ?? {}).filter(([, target]) => target !== role)))
  }

  /** Add a role, pointed at the first model the Subagent allowlist permits. */
  const addRole = (): void => {
    const routes = { ...(value.routes ?? {}) }
    let index = Object.keys(routes).length + 1
    while (`role${index}` in routes) index += 1
    const [provider = '', ...rest] = (allowed[0] ?? '').split('/')
    commit('routes', { ...routes, [`role${index}`]: { provider, model: rest.join('/') } })
  }

  /** The questionnaire's task-class wording, option → what it covers. */
  const criteria = (): Record<string, string> => allCriteria

  /**
   * Every class the configuration knows about.
   *
   * The union of both places a class can appear, so one that exists only in the
   * questionnaire (or only in `routeFor`) still gets a row instead of hiding.
   */
  const taskClasses = (): string[] => {
    const names = new Set<string>()
    for (const name of Object.keys(criteria())) names.add(name)
    for (const name of Object.keys(allRouteFor)) names.add(name)
    return [...names]
  }

  /** Write the questionnaire's criteria back without disturbing its other questions. */
  const writeCriteria = (next: Record<string, string>): void => {
    commit('questions', {
      ...(value.questions ?? {}),
      task_class: { ...(value.questions?.task_class ?? {}), criteria: next },
    })
  }

  /**
   * Add, rename or drop a class inside every decision profile's allow-list.
   *
   * A class the active profile does not list never delegates, so leaving this
   * step out is what makes a freshly added class look broken. Every profile is
   * updated so the class works whichever one is active; `careful` can be
   * tightened again afterwards.
   */
  const writeAllowLists = (mutate: (list: string[]) => string[]): void => {
    const next: Record<string, { delegate?: { taskClass?: string[] } }> = { ...(value.profiles ?? {}) }
    for (const [id, profile] of Object.entries(next)) {
      const delegate = profile?.delegate ?? {}
      next[id] = { ...profile, delegate: { ...delegate, taskClass: mutate(delegate.taskClass ?? []) } }
    }
    commit('profiles', next)
  }

  /**
   * The shipped classes this configuration cannot reach.
   *
   * Two stored fields REPLACE their shipped counterparts instead of merging: the
   * `task_class` questionnaire (per question id) and each decision profile's
   * `delegate.taskClass` array. Any config this card has ever edited pins both,
   * so a class added to the preset afterwards — `review` shipped that way, and
   * `documentation` with it — still gets its row drawn (the shipped `routeFor`
   * supplies it) while nothing can delegate it. Naming the class is the only
   * thing that stops that from looking like a working setup.
   */
  const unreachableShippedClasses = (): string[] => {
    const missing: string[] = []
    const storedCriteria = value.questions?.task_class?.criteria ?? {}
    for (const name of Object.keys(defaults?.criteria ?? {})) {
      if (!(name in storedCriteria)) missing.push(name)
    }
    for (const [id, shippedList] of Object.entries(defaults?.allowLists ?? {})) {
      // No stored list for this profile means the shipped one is already the
      // one in force — only a stored list can leave a class out.
      if (value.profiles?.[id] === undefined) continue
      const stored = value.profiles[id]?.delegate?.taskClass ?? []
      for (const name of shippedList) {
        if (!stored.includes(name) && !missing.includes(name)) missing.push(name)
      }
    }
    return missing
  }

  /**
   * Put every shipped class back where this configuration dropped it.
   *
   * It only ever ADDS. Each profile keeps the shape it was tightened to — the
   * shipped lists are re-joined, never imposed — which is the difference between
   * restoring the preset and resetting the user's own policy.
   */
  const adoptShippedClasses = (): void => {
    // The rubric first. Without an entry here Jev has no such answer to give, so
    // an allow-list that permits the class would await a verdict that never
    // comes. The user's own wording wins wherever they have one.
    writeCriteria({ ...(defaults?.criteria ?? {}), ...criteria() })
    const next: Record<string, { delegate?: { taskClass?: string[] } }> = { ...(value.profiles ?? {}) }
    for (const [id, shippedList] of Object.entries(defaults?.allowLists ?? {})) {
      const stored = next[id]
      if (stored === undefined) continue
      const list = stored.delegate?.taskClass ?? []
      next[id] = {
        ...stored,
        delegate: { ...(stored.delegate ?? {}), taskClass: [...list, ...shippedList.filter((name) => !list.includes(name))] },
      }
    }
    commit('profiles', next)
    // Record it, exactly as the Host's own startup adoption does: the marker is
    // what lets the user drop an adopted class later without it coming back.
    commit('adoptedClasses', [...new Set([...(value.adoptedClasses ?? []), ...unreachable])])
  }

  /** Add a class, pointed at the first role, and permit it everywhere. */
  const addTaskClass = (): void => {
    const existing = new Set(taskClasses())
    let index = existing.size + 1
    while (existing.has(`class${index}`)) index += 1
    const name = `class${index}`
    writeCriteria({ ...criteria(), [name]: '' })
    commit('routeFor', { ...(value.routeFor ?? {}), [name]: allRoutes ? Object.keys(allRoutes)[0] ?? '' : '' })
    writeAllowLists((list) => (list.includes(name) ? list : [...list, name]))
  }

  /** Rename a class everywhere it appears. */
  const renameTaskClass = (from: string, to: string): void => {
    const name = to.trim()
    if (name === '' || name === from) return
    if (name in criteria() || name in (value.routeFor ?? {})) return
    const renamed: Record<string, string> = {}
    for (const [key, note] of Object.entries(criteria())) renamed[key === from ? name : key] = note
    writeCriteria(renamed)
    commit(
      'routeFor',
      Object.fromEntries(
        Object.entries(value.routeFor ?? {}).map(([key, role]) => [key === from ? name : key, role]),
      ),
    )
    writeAllowLists((list) => list.map((item) => (item === from ? name : item)))
  }

  /** Drop a class everywhere it appears. */
  const removeTaskClass = (name: string): void => {
    const next = { ...criteria() }
    delete next[name]
    writeCriteria(next)
    const routeFor = { ...(value.routeFor ?? {}) }
    delete routeFor[name]
    commit('routeFor', routeFor)
    writeAllowLists((list) => list.filter((item) => item !== name))
  }

  /**
   * Point one class at one role, or at nothing.
   *
   * "Nothing" has to DELETE the entry: leaving an empty string would still be a
   * truthy lookup miss, and `decide` would fall through to the default role — so
   * the class would keep being delegated while the card claimed it was not.
   */
  const setTaskClassRole = (name: string, role: string): void => {
    const routeFor = { ...(value.routeFor ?? {}) }
    if (role === '') delete routeFor[name]
    else routeFor[name] = role
    commit('routeFor', routeFor)
  }

  /** Reword what one class covers. */
  const setTaskClassNote = (name: string, note: string): void => {
    writeCriteria({ ...criteria(), [name]: note })
  }

  /** Render routes as `role=provider/model` pairs, comma-separated. */
  const routesText = (routes: JevSettings['routes']): string =>
    Object.entries(routes ?? {})
      .map(([role, target]) => `${role}=${[target?.provider, target?.model].filter(Boolean).join('/')}`)
      .join(', ')
  /**
   * Parse those pairs back. An empty box returns null so the caller resets the
   * field to the shipped defaults rather than pinning an empty map; a malformed
   * entry rejects the whole commit and names its own shape in the error, which
   * is what keeps a typo from silently stranding every verdict.
   */
  const parseRoutes = (text: string): Record<string, { provider: string; model: string }> | null => {
    const entries = text.split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0)
    if (entries.length === 0) return null
    const parsed: Record<string, { provider: string; model: string }> = {}
    for (const entry of entries) {
      const eq = entry.indexOf('=')
      const slash = eq === -1 ? -1 : entry.indexOf('/', eq + 1)
      if (eq < 1 || slash < eq + 2 || slash === entry.length - 1) throw new Error('role=provider/model')
      parsed[entry.slice(0, eq).trim()] = {
        provider: entry.slice(eq + 1, slash).trim(),
        model: entry.slice(slash + 1).trim(),
      }
    }
    return parsed
  }

  // Named once, so the line and its button agree on what is missing.
  const unreachable = unreachableShippedClasses()

  return (
    <div>
      {showHeading ? (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{tr('title')}</div>
          <p style={{ ...hintStyle, marginTop: 0 }}>{tr('description')}{pending > 0 ? ` · ${tr('saving')}` : ''}</p>
        </>
      ) : pending > 0 ? (
        <p style={{ ...hintStyle, marginTop: 0 }}>{tr('saving')}</p>
      ) : null}

      {subagentMissing && <p style={warningStyle} role="status">{tr('subagentMissing')}</p>}

      <div style={{ marginBottom: 12 }}>
        <span style={labelStyle}>{tr('mode')}</span>
        <div style={segWrap}>
          {MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              style={segBtn((value.mode ?? 'off') === mode.id)}
              disabled={disabled}
              onClick={() => commit('mode', mode.id)}
            >
              {tr(mode.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <Choice
        id="jev-provider" label={tr('provider')} options={PROVIDERS.map((id) => ({ id, label: id }))}
        value={value.provider ?? 'bai'} overridden={overridden('provider')} disabled={disabled}
        onCommit={(next) => commit('provider', next)} onReset={() => reset('provider')}
      />
      <Choice
        id="jev-profile" label={tr('profile')} hint={tr('profileHint')}
        options={PROFILES.map((id) => ({ id, label: id }))}
        value={value.activeProfile ?? 'auto'} overridden={overridden('activeProfile')} disabled={disabled}
        onCommit={(next) => commit('activeProfile', next)} onReset={() => reset('activeProfile')}
      />
      <Field
        id="jev-triggers" label={tr('triggers')} hint={tr('triggersHint')}
        value={(value.triggers ?? []).join(', ')} overridden={overridden('triggers')} disabled={disabled}
        parse={list} onCommit={(parsed) => commit('triggers', parsed)} onReset={() => reset('triggers')}
      />
      {allowed.length > 0 ? (
        <div style={{ marginBottom: 12 }}>
          <span style={labelStyle}>
            {tr('routes')}
            {overridden('routes') && (
              <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 400, color: 'var(--dsw-alias-text-accent, #69f)' }}>
                {tr('overridden')}
                <button type="button" style={resetStyle} onClick={() => reset('routes')} disabled={disabled}>{tr('reset')}</button>
              </span>
            )}
          </span>
          {/*
            The union of the roles this config sets and the roles the router
            already points task classes at. Listing only the configured ones is
            how `reviewer` stayed invisible: the shipped `review → reviewer`
            mapping named it all along, but nothing drew a row for it.
          */}
          {[...new Set([...Object.keys(allRoutes), ...Object.values(allRouteFor), ...shippedRoles])].map((role) => {
            const target = allRoutes[role]
            const current = target === undefined ? '' : `${target.provider}/${target.model}`
            // The shipped route may name a model this allowlist no longer carries;
            // keep it visible as the current option instead of silently reselecting.
            const options = allowed.includes(current) ? allowed : [current, ...allowed]
            return (
              <div
                key={role}
                style={{
                  marginTop: 8, padding: '8px 10px', borderRadius: 8,
                  border: '1px solid var(--dsw-alias-border-l2, #333)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    id={`jev-route-${role}`}
                    aria-label={tr('roleNameHint')}
                    // Uncontrolled with a draft-on-blur commit: a rename rewrites
                    // two fields, and doing that per keystroke would thrash the
                    // document while the name is still half-typed.
                    key={role}
                    defaultValue={role}
                    disabled={disabled}
                    style={{ ...inputStyle, width: 'auto', flex: '0 0 130px' }}
                    onBlur={(event) => renameRole(role, event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.currentTarget.blur()
                    }}
                  />
                  <select
                    style={{ ...inputStyle, width: 'auto', flex: 1 }}
                    value={current}
                    disabled={disabled}
                    aria-label={role}
                    onChange={(event) => {
                      // "No model set" means remove the role, not store an empty one.
                      // Storing `{provider:'', model:''}` is an entry the Host rejects,
                      // which would take the whole plugin down on the next start.
                      if (event.target.value === '') {
                        removeRole(role)
                        return
                      }
                      const [provider, ...rest] = event.target.value.split('/')
                      // Carry the merged entry, not just this layer. A partial write
                      // under a role name replaces the whole entry Host-side, so a role
                      // that lives only in the shipped defaults would lose its model —
                      // and a role with no model makes the Host reject the config.
                      commit('routes', { ...(props.scope.getSnapshot()?.value?.routes ?? value.routes), [role]: { ...(allRoutes[role] ?? {}), provider, model: rest.join('/') } })
                    }}
                  >
                    {/* A role the router uses but no model is set for: an explicit
                        empty choice, so it reads as "not set" rather than
                        silently showing the first model as if it were chosen. */}
                    <option value="">{tr('roleUnset')}</option>
                    {options.map((key) => (
                      <option key={key} value={key}>{key}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    title={tr('removeRole')}
                    aria-label={tr('removeRole')}
                    disabled={disabled}
                    style={{ ...resetStyle, marginLeft: 0, fontSize: 14, textDecoration: 'none' }}
                    onClick={() => removeRole(role)}
                  >
                    ✕
                  </button>
                </div>
                <p style={{ ...hintStyle, marginTop: 4 }}>{describeRole(role)}</p>
                {/* Collapsed unless this role already has a prompt, so the row
                    stays one line until someone actually uses the feature. */}
                <details open={(target?.prompt ?? '') !== ''} style={{ marginTop: 6 }}>
                  <summary style={{ ...hintStyle, cursor: 'pointer', marginTop: 0 }}>{tr('rolePrompt')}</summary>
                  <textarea
                    // Remounts when the stored value changes from anywhere else —
                    // a revert, another window, the model dropdown clearing it. An
                    // uncontrolled box would otherwise keep showing stale text and
                    // write it back on the next blur, quietly undoing that change.
                    key={target?.prompt ?? ''}
                    defaultValue={target?.prompt ?? ''}
                    disabled={disabled}
                    rows={4}
                    aria-label={tr('rolePrompt')}
                    style={{ ...inputStyle, marginTop: 6, resize: 'vertical', fontFamily: 'inherit' }}
                    onBlur={(event) => {
                      const next = event.target.value
                      // Nothing typed, nothing written. A blind write here could persist
                      // `{ prompt: "" }` for a role that lives only in the shipped
                      // defaults — an entry with no provider or model, which the Host
                      // rejects outright and which takes the whole plugin down on the
                      // next start.
                      if (next === (allRoutes[role]?.prompt ?? '')) return
                      commit('routes', {
                        ...value.routes,
                        [role]: { ...(allRoutes[role] ?? {}), prompt: next },
                      })
                    }}
                  />
                </details>
              </div>
            )
          })}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
            <button
              type="button"
              disabled={disabled}
              style={{ ...inputStyle, width: 'auto', cursor: disabled ? 'default' : 'pointer' }}
              onClick={addRole}
            >
              {tr('addRole')}
            </button>
          </div>
          <p style={hintStyle}>{tr('routesPickHint')}</p>
          <p style={hintStyle}>{tr('roleNameHint')}</p>
        </div>
      ) : (
        <Field
          id="jev-routes" label={tr('routes')} hint={tr('routesHint')}
          value={routesText(value.routes)} overridden={overridden('routes')} disabled={disabled}
          parse={parseRoutes} onCommit={(parsed) => {
            if (parsed === null) reset('routes')
            else commit('routes', parsed)
          }} onReset={() => reset('routes')} monospace
        />
      )}
      <div style={{ marginBottom: 12 }}>
        <span style={labelStyle}>{tr('taskClasses')}</span>
        {taskClasses().map((name) => (
          <div
            key={name}
            style={{
              marginTop: 8, padding: '8px 10px', borderRadius: 8,
              border: '1px solid var(--dsw-alias-border-l2, #333)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                key={name}
                defaultValue={name}
                disabled={disabled}
                aria-label={tr('taskClasses')}
                // Commit on blur, never per keystroke: a rename rewrites three
                // fields, and a half-typed name must not reach any of them.
                onBlur={(event) => renameTaskClass(name, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur()
                }}
                style={{ ...inputStyle, width: 'auto', flex: '0 0 130px' }}
              />
              <select
                value={value.routeFor?.[name] ?? ''}
                disabled={disabled}
                aria-label={tr('roleNameHint')}
                style={{ ...inputStyle, width: 'auto', flex: 1 }}
                onChange={(event) => setTaskClassRole(name, event.target.value)}
              >
                {/* An explicit empty choice: without it a class nobody takes
                    silently displays the first role as if it were assigned. */}
                <option value="">{tr('unassigned')}</option>
                {[...new Set([...Object.keys(allRoutes), ...shippedRoles])].map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
              <button
                type="button"
                title={tr('removeTaskClass')}
                aria-label={tr('removeTaskClass')}
                disabled={disabled}
                style={{ ...resetStyle, marginLeft: 0, fontSize: 14, textDecoration: 'none' }}
                onClick={() => removeTaskClass(name)}
              >
                ✕
              </button>
            </div>
            {/* The Chinese reading of a shipped class, so the section is
                readable without the name above it having to be Chinese. */}
            {classGloss(name) !== null && <p style={{ ...hintStyle, marginTop: 6, marginBottom: 0 }}>{classGloss(name)}</p>}
            <input
              key={`note-${name}`}
              defaultValue={criteria()[name] ?? ''}
              placeholder={tr('taskClassNote')}
              disabled={disabled}
              aria-label={tr('taskClassNote')}
              onBlur={(event) => setTaskClassNote(name, event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur()
              }}
              style={{ ...inputStyle, marginTop: 6 }}
            />
          </div>
        ))}
        <div style={{ marginTop: 8 }}>
          <button
            type="button"
            disabled={disabled}
            style={{ ...inputStyle, width: 'auto', cursor: disabled ? 'default' : 'pointer' }}
            onClick={addTaskClass}
          >
            {tr('addTaskClass')}
          </button>
        </div>
        <p style={hintStyle}>{tr('taskClassHint')}</p>
        {/* The one step this section could not do: a class the preset ships but
            this configuration never allowed through has no other way back in. */}
        {unreachable.length > 0 && (
          <p style={hintStyle}>
            {tr('shippedClassesMissing')}: {unreachable.join(', ')}{' '}
            <button
              type="button"
              disabled={disabled}
              style={{ ...inputStyle, width: 'auto', padding: '2px 6px', cursor: disabled ? 'default' : 'pointer' }}
              onClick={adoptShippedClasses}
            >
              {tr('adoptShippedClasses')}
            </button>
          </p>
        )}
      </div>
      <Toggle
        id="jev-logturn" label={tr('logTurnText')} hint={tr('logTurnTextHint')}
        checked={value.logTurnText ?? false} overridden={overridden('logTurnText')} disabled={disabled}
        onCommit={(next) => commit('logTurnText', next)} onReset={() => reset('logTurnText')}
      />
      <Field
        id="jev-logdir" label={tr('logDir')} hint={tr('logDirHint')}
        value={value.logDir ?? ''} overridden={overridden('logDir')} disabled={disabled}
        parse={optionalDir} onCommit={(parsed) => {
          if (parsed === '') reset('logDir')
          else commit('logDir', parsed)
        }} onReset={() => reset('logDir')}
      />
      <Field
        id="jev-statechars" label={tr('stateChars')}
        value={String(value.stateChars ?? 1200)} overridden={overridden('stateChars')} disabled={disabled}
        parse={number(200, 8000)} onCommit={(parsed) => commit('stateChars', parsed)} onReset={() => reset('stateChars')}
      />

      <div style={groupStyle}>
        <p style={headStyle}>{tr('advanced')}</p>
        <p style={{ ...hintStyle, marginTop: -4, marginBottom: 8 }}>{tr('advancedHint')}</p>
        {/* The key itself, masked. Leaving it empty falls back to the preset's
            environment variable, which is what keeps an ambient setup working
            without anyone pasting a secret into a config file. */}
        <Field
          id="jev-apikeyenv" label={tr('apiKeyEnv')} hint={tr('apiKeyEnvHint')}
          value={value.apiKeyEnv ?? ''} placeholder={preset.apiKeyEnv}
          overridden={overridden('apiKeyEnv')} disabled={disabled} secret
          parse={trimmed} onCommit={(parsed) => commit('apiKeyEnv', parsed)} onReset={() => reset('apiKeyEnv')}
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field
            id="jev-endpoint" label={tr('endpoint')} value={value.endpoint ?? ''} placeholder={preset.endpoint}
            overridden={overridden('endpoint')} disabled={disabled}
            parse={trimmed} onCommit={(parsed) => commit('endpoint', parsed)} onReset={() => reset('endpoint')} monospace
          />
          <Field
            id="jev-apipath" label={tr('apiPath')} value={value.apiPath ?? ''} placeholder={preset.apiPath}
            overridden={overridden('apiPath')} disabled={disabled}
            parse={trimmed} onCommit={(parsed) => commit('apiPath', parsed)} onReset={() => reset('apiPath')} monospace
          />
          <Field
            id="jev-model" label={tr('model')} value={value.model ?? ''} placeholder={preset.model}
            overridden={overridden('model')} disabled={disabled}
            parse={trimmed} onCommit={(parsed) => commit('model', parsed)} onReset={() => reset('model')} monospace
          />
          <Field
            id="jev-timeout" label={tr('timeoutMs')} value={String(value.timeoutMs ?? 4000)} overridden={overridden('timeoutMs')} disabled={disabled}
            parse={number(50, 30000)} onCommit={(parsed) => commit('timeoutMs', parsed)} onReset={() => reset('timeoutMs')}
          />
        </div>
      </div>

      {/* Which build this tab is actually running: a host restart does not reload
          an open tab, so this is the first thing to check when the card looks
          older than the release you just installed. */}
      <p style={versionStyle}>
        {PACKAGE_NAME} {'v'}
        {typeof __JEV_VERSION__ === 'string' ? __JEV_VERSION__ : 'dev'}
      </p>
    </div>
  )
}

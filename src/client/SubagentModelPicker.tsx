/**
 * The composer selector: which model this session's subagents run on.
 *
 * Three answers, and only three, because they are the three things the Host can
 * actually enforce on a subagent's request:
 *
 * - inherit — rewrite nothing; a child runs on whatever the caller resolved.
 * - auto    — enforce the route Jev assigned to this session's turn.
 * - manual  — enforce the model picked here.
 *
 * The trigger shows the model in force, not the mode: in `auto` the answer
 * changes per turn, and the Host writes each assignment back into the same
 * per-session record, so the display follows the enforcement instead of
 * describing an intention.
 */
import * as React from 'react'
import { tr } from './i18n.js'
import {
  effectiveModel,
  readView,
  routeLabel,
  subscribe,
  writeView,
  type SelectionMode,
  type SelectionView,
} from './selection.js'

/** One provider/model option, as the Host catalog advertises it. */
interface CatalogModel {
  id: string
  name?: string
  reasoning?: { efforts?: Array<{ id: string; name?: string }>; defaultEffort?: string }
}

/** One provider and the models it advertises. */
interface CatalogGroup {
  id: string
  name?: string
  models: CatalogModel[]
}

/** Slot props: the session being edited, the gateway, and this plugin's service. */
export interface SubagentModelPickerProps {
  /** The session the composer belongs to. */
  sessionId?: string
  /** The API gateway client — used for the model catalogue and for events. */
  remote?: any
  /** The resolved `remote.subagent-custom` service this plugin reads and writes. */
  service?: any
}

/** Class names, prefixed so an older picker plugin can coexist on the page. */
const CSS = `
.scm-root{position:relative;display:inline-flex}
.scm-menu{position:absolute;bottom:calc(100% + 6px);left:0;min-width:260px;max-height:320px;overflow:auto;padding:4px;border-radius:var(--dsw-radius-panel,10px);border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.25));background:var(--dsw-alias-bg-layer-2,#1e1e1e);box-shadow:0 8px 24px rgba(0,0,0,.4);z-index:60}
.scm-cell{display:flex;align-items:center;gap:8px;width:100%;padding:6px 8px;border:none;border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary,#eee);font-size:13px;cursor:pointer}
.scm-cell:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.08))}
.scm-cellLabel{flex:none;font-weight:500}
.scm-cellValue{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary,#aaa);text-align:right}
.scm-cellChevron{flex:none;color:var(--dsw-alias-label-tertiary,#777);font-size:12px}
.scm-hint{padding:6px 8px;color:var(--dsw-alias-label-tertiary,#777);font-size:12px}
`

/** The model advertised for one catalog entry, as a selectable option. */
function optionsOf(groups: CatalogGroup[]): Array<{ provider: string; model: string; label: string; efforts: string[] }> {
  const out: Array<{ provider: string; model: string; label: string; efforts: string[] }> = []
  for (const group of groups) {
    for (const model of group.models ?? []) {
      out.push({
        provider: group.id,
        model: model.id,
        label: `${group.name ?? group.id} · ${model.name ?? model.id}`,
        efforts: (model.reasoning?.efforts ?? []).map((effort) => effort.id),
      })
    }
  }
  return out
}

export function SubagentModelPicker(props: SubagentModelPickerProps): React.ReactElement {
  const { sessionId, remote, service } = props
  const [view, setView] = React.useState<SelectionView | null>(null)
  const [groups, setGroups] = React.useState<CatalogGroup[]>([])
  const [open, setOpen] = React.useState(false)
  const [pane, setPane] = React.useState<'root' | 'model' | 'effort'>('root')
  const rootRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    if (service === undefined) return
    let live = true
    const read = (): void => {
      void readView(service, sessionId).then((next) => {
        if (live) setView(next)
      })
    }
    read()
    const off = subscribe(remote, read)
    return () => {
      live = false
      off()
    }
  }, [service, remote, sessionId])

  React.useEffect(() => {
    let live = true
    void (async () => {
      try {
        const res = await remote?.session?.modelCatalog?.()
        if (live && res?.ok === true) setGroups(Array.isArray(res.value?.groups) ? res.value.groups : [])
      } catch {
        // No catalogue means no manual pick; inherit and auto still work.
      }
    })()
    return () => {
      live = false
    }
  }, [remote])

  React.useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent): void => {
      if (rootRef.current !== null && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const options = React.useMemo(() => optionsOf(groups), [groups])
  const picked = options.find((option) => option.provider === view?.provider && option.model === view?.model)
  const inForce = effectiveModel(view)

  const choose = async (selection: {
    mode: SelectionMode
    provider?: string
    model?: string
    reasoningEffort?: string
  }): Promise<void> => {
    const next = await writeView(service, sessionId, selection)
    if (next !== null) setView(next)
  }

  /** What the trigger reads: the model in force, or the mode when there is none. */
  const triggerValue =
    inForce ?? (view?.mode === 'auto' ? tr('modeAutoIdle') : view?.mode === 'manual' ? tr('modeManual') : tr('modeInherit'))

  /**
   * One selectable row.
   *
   * Styled inline rather than by class: the host application's own button rules
   * outrank a plugin's single-class selector, which left these rows unreadably
   * dim. Same lesson the original manual picker shipped with.
   */
  const option = (key: string, label: string, checked: boolean, onPick: () => void): React.ReactElement =>
    React.createElement(
      'button',
      {
        key,
        type: 'button',
        role: 'menuitemradio',
        'aria-checked': checked,
        style: {
          display: 'block',
          width: '100%',
          textAlign: 'left',
          padding: '6px 8px',
          borderRadius: '8px',
          border: 'none',
          background: checked ? 'var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,0.08))' : 'transparent',
          color: 'var(--dsw-alias-label-primary, #eee)',
          cursor: 'pointer',
          fontSize: '13px',
          whiteSpace: 'nowrap',
        },
        onClick: onPick,
      },
      label,
    )

  /**
   * Commit a choice and dismiss the menu.
   *
   * A choice answers the question the menu was opened to ask, so the menu closes
   * all the way back to the composer rather than retreating one pane. The write
   * runs in the background: the trigger reads the Host's own answer, so a slow
   * or refused write corrects the label rather than holding the menu open.
   */
  const pick = (selection: {
    mode: SelectionMode
    provider?: string
    model?: string
    reasoningEffort?: string
  }): void => {
    setPane('root')
    setOpen(false)
    void choose(selection)
  }

  const menu = (): React.ReactElement => {
    if (pane === 'model') {
      return React.createElement(
        'div',
        { role: 'menu', className: 'scm-menu' },
        option('inherit', tr('modeInherit'), view?.mode === 'inherit' || view === null, () => pick({ mode: 'inherit' })),
        option('auto', tr('modeAutoPick'), view?.mode === 'auto', () => pick({ mode: 'auto' })),
        options.length === 0
          ? React.createElement('div', { className: 'scm-hint' }, tr('noModels'))
          : options.map((entry) =>
              option(
                `${entry.provider}/${entry.model}`,
                entry.label,
                view?.mode === 'manual' && entry.provider === view.provider && entry.model === view.model,
                () => pick({ mode: 'manual', provider: entry.provider, model: entry.model }),
              ),
            ),
      )
    }

    if (pane === 'effort') {
      return React.createElement(
        'div',
        { role: 'menu', className: 'scm-menu' },
        option(
          'default',
          tr('effortDefault'),
          view?.reasoningEffort === '' || view?.reasoningEffort === undefined,
          () => pick({ mode: 'manual', provider: view?.provider ?? '', model: view?.model ?? '', reasoningEffort: '' }),
        ),
        (picked?.efforts ?? []).map((effort) =>
          option(effort, effort, view?.reasoningEffort === effort, () =>
            pick({
              mode: 'manual',
              provider: view?.provider ?? '',
              model: view?.model ?? '',
              reasoningEffort: effort,
            }),
          ),
        ),
      )
    }

    return React.createElement(
      'div',
      { role: 'menu', className: 'scm-menu' },
      React.createElement(
        'button',
        {
          type: 'button',
          role: 'menuitem',
          className: 'scm-cell',
          onClick: () => setPane('model'),
        },
        React.createElement('span', { className: 'scm-cellLabel' }, tr('cellModel')),
        React.createElement('span', { className: 'scm-cellValue' }, triggerValue),
        React.createElement('span', { className: 'scm-cellChevron' }, '›'),
      ),
      picked !== undefined && picked.efforts.length > 0
        ? React.createElement(
            'button',
            {
              type: 'button',
              role: 'menuitem',
              className: 'scm-cell',
              onClick: () => setPane('effort'),
            },
            React.createElement('span', { className: 'scm-cellLabel' }, tr('cellEffort')),
            React.createElement(
              'span',
              { className: 'scm-cellValue' },
              view?.reasoningEffort === undefined || view.reasoningEffort === '' ? tr('effortDefault') : view.reasoningEffort,
            ),
            React.createElement('span', { className: 'scm-cellChevron' }, '›'),
          )
        : null,
    )
  }

  return React.createElement(
    'div',
    { className: 'scm-root', ref: rootRef },
    React.createElement('style', null, CSS),
    React.createElement(
      'button',
      {
        type: 'button',
        // The bound session id rides in the tooltip: when the selector shows a
        // state that does not belong to the conversation you are looking at,
        // this is the one fact that tells you which session it is actually
        // reading.
        title: `${tr('pickerTitle')}\n${sessionId ?? ''}`,
        // Inline for the same reason as the options, plus `nowrap`: as a flex
        // child of the composer row the label was squeezed onto two lines.
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 8px',
          border: 'none',
          borderRadius: '8px',
          background: 'transparent',
          color: 'var(--dsw-alias-label-secondary, #aaa)',
          fontSize: '13px',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          flex: 'none',
        },
        onClick: () => {
          setPane('root')
          setOpen((was) => !was)
        },
      },
      React.createElement('span', { style: { whiteSpace: 'nowrap' } }, tr('pickerLabel')),
      React.createElement(
        'span',
        { style: { color: 'var(--dsw-alias-label-primary, #eee)', fontWeight: 500, whiteSpace: 'nowrap' } },
        triggerValue,
      ),
      React.createElement('span', { style: { fontSize: '10px', opacity: 0.7 } }, '▼'),
    ),
    open ? menu() : null,
  )
}

/** The one-line summary a badge renders for a session. */
export { routeLabel }

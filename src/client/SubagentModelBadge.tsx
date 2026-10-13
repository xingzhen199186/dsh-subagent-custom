/**
 * The model a session's subagents actually run on, for the conversation header.
 *
 * Two sources, and the order matters. The dispatch ledger answers "what did THIS
 * session really run on" — it is written the moment a subagent's request goes
 * out, so on a subagent's own page it names the model that page is using. The
 * per-session selection answers "what is assigned here", which is all there is
 * before any dispatch has happened. Showing only the assignment is how the badge
 * came to say "inherits the main model" about a subagent that was in fact
 * running on a model its caller had passed.
 */
import * as React from 'react'
import { tr } from './i18n.js'
import { effectiveModel, readDispatches, readView, routeLabel, subscribe, type DispatchRecord, type SelectionView } from './selection.js'

/** Slot props: the session whose subagents are listed, plus the gateway and service. */
export interface SubagentModelBadgeProps {
  /** The session the header belongs to; the slot hands it to the props factory. */
  parentSessionId?: string
  /** The API gateway client — used only for its events. */
  remote?: any
  /** The resolved `remote.subagent-custom` service this plugin reads. */
  service?: any
}

export function SubagentModelBadge(props: SubagentModelBadgeProps): React.ReactElement | null {
  const { parentSessionId, remote, service } = props
  const [view, setView] = React.useState<SelectionView | null>(null)
  const [sent, setSent] = React.useState<DispatchRecord[]>([])

  React.useEffect(() => {
    if (service === undefined) return
    let live = true
    const read = (): void => {
      void readView(service, parentSessionId).then((next) => {
        if (live) setView(next)
      })
      void readDispatches(service, parentSessionId).then((next) => {
        if (live) setSent(next)
      })
    }
    read()
    // The Host rewrites the assigned route through the settings document, so
    // that is the signal the model in force may have changed.
    const off = subscribe(remote, read)
    return () => {
      live = false
      off()
    }
  }, [parentSessionId, remote, service])

  // The ledger wins when this page IS a dispatched child: that entry is the model
  // this session is really running on. Everything else falls back to what the
  // session is assigned, which is all there is before the first dispatch.
  const mine = sent.find((entry) => entry.child === parentSessionId)
  const actual = mine === undefined ? null : routeLabel(mine.provider ?? '', mine.model ?? '')

  // Always render. An earlier version hid itself while the session inherited,
  // which made the feature impossible to find: the default state is exactly the
  // one where nothing appeared.
  const label = effectiveModel(view)
  const mode = view?.mode ?? 'inherit'
  const value = actual ?? label ?? (mode === 'auto' ? tr('modeAutoIdle') : tr('badgeInherit'))
  const lead = actual !== null ? tr('badgeManual') : mode === 'auto' ? tr('badgeAuto') : tr('badgeManual')

  return React.createElement(
    'span',
    {
      className: 'scm-badge',
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '1px 6px',
        borderRadius: '6px',
        border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.25))',
        color: 'var(--dsw-alias-label-secondary, #aaa)',
        fontSize: '11px',
        lineHeight: '16px',
        whiteSpace: 'nowrap',
      },
      title: tr('badgeTitle'),
    },
    React.createElement('span', null, lead),
    React.createElement('span', { style: { color: 'var(--dsw-alias-label-primary, #eee)' } }, value),
  )
}

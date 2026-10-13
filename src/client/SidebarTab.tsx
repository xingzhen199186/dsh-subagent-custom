/**
 * The right-sidebar tab: what this session's subagents are set to run on.
 *
 * The header badge answers "which model" for the session you are looking at; this
 * tab answers "which model, for each role" — the selector stores one choice per
 * session, and that choice resolves through `routeFor` into a different role
 * depending on what Jev decides the task is. Only a table can show that.
 */
import * as React from 'react'
import { readView, readDispatches, routeLabel, subscribe, effectiveModel } from './selection.js'
import type { DispatchRecord } from './selection.js'
import { tr } from './i18n.js'
import type { JevScope } from './types.js'
import { pickerService as sharedService, settingsScope as sharedScope } from './index.js'

export function SidebarTab(props: { sessionId?: string; remote?: any; service?: any; scope?: JevScope }) {
  // Fall back to the module-scope values: the sidebar registered this tab but
  // handed it none of the extra props, which left every section reading empty
  // while the header badge — same data, reached another way — was correct.
  const { sessionId, remote } = props
  const service = props.service ?? sharedService
  const scope = props.scope ?? sharedScope
  const [view, setView] = React.useState<ReturnType<typeof readView> extends Promise<infer T> ? T : never>(null as any)
  const [config, setConfig] = React.useState<JevScope['getSnapshot'] extends () => infer T ? T : never>(null as any)
  const [sent, setSent] = React.useState<DispatchRecord[]>([])

  React.useEffect(() => {
    if (service === undefined) return
    let live = true
    const read = (): void => {
      void readView(service, sessionId).then((next) => {
        if (live) setView(next)
      })
      void readDispatches(service, sessionId).then((next) => {
        if (live) setSent(next)
      })
    }
    read()
    const off = subscribe(remote, read)
    return () => {
      live = false
      off()
    }
  }, [sessionId, remote, service])

  React.useEffect(() => {
    if (scope === undefined) return
    setConfig(scope.getSnapshot())
    return scope.subscribe(() => setConfig(scope.getSnapshot()))
  }, [scope])

  const value = (config as any)?.value ?? {}
  const routes: Record<string, { provider?: string; model?: string }> = value.routes ?? {}
  const routeFor: Record<string, string> = value.routeFor ?? {}
  const mode = view?.mode ?? 'inherit'
  const inForce = effectiveModel(view)
  const modeText =
    mode === 'inherit' ? tr('badgeInherit') : mode === 'manual' ? tr('modeManual') : inForce === null ? tr('modeAutoIdle') : tr('modeAutoPick')

  // Which classes each role takes, so the table explains itself.
  const classesOf = (role: string): string[] =>
    Object.entries(routeFor)
      .filter(([, target]) => target === role)
      .map(([taskClass]) => taskClass)

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
    padding: '6px 0',
    borderTop: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.2))',
  }
  const roleStyle: React.CSSProperties = { flex: '0 0 96px', fontWeight: 600, fontSize: 12 }
  const modelStyle: React.CSSProperties = { fontSize: 12, fontFamily: 'var(--dsw-alias-font-mono, monospace)' }
  const classStyle: React.CSSProperties = { fontSize: 11, color: 'var(--dsw-alias-label-tertiary, #888)' }

  return React.createElement(
    'div',
    { style: { padding: '12px 14px', fontSize: 13, lineHeight: 1.6 } },
    React.createElement('p', { style: { margin: '0 0 2px', fontWeight: 700, fontSize: 12 } }, tr('tabThisSession')),
    React.createElement(
      'p',
      { style: { margin: '0 0 12px' } },
      modeText,
      inForce !== null ? React.createElement('span', { style: { ...modelStyle, display: 'inline-block', marginLeft: 8 } }, inForce) : null,
    ),
    React.createElement('p', { style: { margin: '0 0 2px', fontWeight: 700, fontSize: 12 } }, tr('tabRoles')),
    Object.keys(routes).length === 0
      ? React.createElement('p', { style: classStyle }, tr('tabNoRoutes'))
      : Object.entries(routes).map(([role, target]) =>
          React.createElement(
            'div',
            { key: role, style: rowStyle },
            React.createElement('span', { style: roleStyle }, role),
            React.createElement(
              'span',
              { style: { flex: 1 } },
              React.createElement('span', { style: modelStyle }, routeLabel(target?.provider ?? '', target?.model ?? '') ?? ''),
              React.createElement('span', { style: { ...classStyle, marginLeft: 8 } }, classesOf(role).join(' / ')),
            ),
          ),
        ),
    React.createElement('p', { style: { margin: '14px 0 2px', fontWeight: 700, fontSize: 12 } }, tr('tabDispatched')),
    sent.length === 0
      ? React.createElement('p', { style: classStyle }, tr('tabNoneDispatched'))
      : sent.map((entry, index) =>
          React.createElement(
            'div',
            { key: `${entry.child ?? index}-${entry.at ?? index}`, style: rowStyle },
            React.createElement('span', { style: roleStyle }, entry.role !== undefined && entry.role !== '' ? entry.role : '—'),
            React.createElement(
              'span',
              { style: { flex: 1 } },
              React.createElement('span', { style: modelStyle }, routeLabel(entry.provider ?? '', entry.model ?? '') ?? ''),
              React.createElement(
                'span',
                { style: { ...classStyle, marginLeft: 8 } },
                entry.at === undefined ? '' : new Date(entry.at).toLocaleTimeString(),
              ),
            ),
          ),
        ),
  )
}

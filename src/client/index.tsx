/**
 * Browser half of dsh-subagent-custom: registers the
 * `subagent-custom` configuration card on whichever Plugins surface the
 * running client offers, without a version check.
 *
 * - DSH 0.1.7+ moved Plugins to a sidebar page (`dsh-client-ui-plugin-manager`)
 *   and keys row configuration by `<package name>#<row id>` on the
 *   `plugins.row.config` slot. The page owns the row's form and draws the title
 *   and crumb around it, and `ctx.configForms.get(NS)` is the scope the card
 *   binds — deliberately the same `getSnapshot`/`subscribe`/`set`/`unset` shape
 *   the old settings scope had, so the card itself did not have to change with
 *   the seam.
 * - DSH 0.1.5 keeps the Plugins settings tab and the `settings.plugin.item`
 *   slot, bound through `ctx.settingsScope.bind({ namespace: NS })`.
 *
 * Each surface is registered through its own `ctx.inject`, so a fiber fires
 * only where its service exists: 0.1.7 has no `settingsScope` and 0.1.5 has no
 * `configForms`. Only framework services (`slots`, `locale`, `configForms`,
 * `settingsScope`) and its own components are used — no DSH client package
 * imports as values — so if a future platform drops the settings UI the fiber
 * simply never fires and nothing throws.
 */
import * as React from 'react'
import { JevSettingsCard } from './JevSettingsCard.js'
import { CONTRIBUTION } from './contribution.js'
import { SubagentModelBadge } from './SubagentModelBadge.js'
import { SidebarTab } from './SidebarTab.js'
import { tr } from './i18n.js'
import { SubagentModelPicker } from './SubagentModelPicker.js'
import { bindTranslator, notifyLocale } from './i18n.js'
import { en, zh, ru } from './locales.js'
import { PACKAGE_NAME, PLUGIN_NAME, ROW_CONFIG_KEY, SETTINGS_NAMESPACE as NS, SUBAGENT_ALLOWLIST_NAMESPACE, SUBAGENT_NAMESPACE } from '../shared/config.mjs'

/** Register the copy dictionaries and bind the translator. */
function wireLocale(ctx: any): void {
  const locale = ctx.locale
  if (!locale) return
  try {
    ctx.effect(() => locale.register(NS, 'en', en))
    ctx.effect(() => locale.register(NS, 'zh', zh))
    ctx.effect(() => locale.register(NS, 'ru', ru))
    const hasRu = (locale.getSnapshot?.().locales ?? []).some((entry: { id: string }) => entry.id === 'ru')
    if (!hasRu) ctx.effect(() => locale.addLanguage({ id: 'ru', label: 'Русский', fallback: 'en' }))
    const translate = locale.bind(NS)
    bindTranslator((key: string) => translate(key))
    // Re-render the mounted card when the active language changes.
    ctx.effect(() => locale.subscribe(() => notifyLocale()))
  } catch {
    // The i18n shim already renders English; a locale anomaly must not hide the card.
  }
}

export const name = 'dsh-subagent-custom'
// `remote.session` belongs here, at the plugin's own gate, not in a nested
// inject: the Host-generation model catalogue lives behind it, and a nested
// inject that never resolves would silently skip the registrations below.
export const inject = ['slots', 'locale', 'remote', 'remote.session']

/**
 * DSH 0.1.7+ — the plugin manager page asks for this row's configuration.
 *
 * There are two keyed slots for the form, and the choice decides how many clicks
 * it is worth. `plugins.bundle.config`, keyed by package name, is what the shipped
 * bundles use: the page draws the section itself and the form is there the moment
 * the plugin page opens. `plugins.row.config`, keyed `<package>#<row id>`, instead
 * files the form on the row's own page, one click away behind a Configure control
 * in Components — correct, but not what anyone expects next to a shipped plugin.
 *
 * So we register the package slot as the primary surface and keep the row slot for
 * 0.1.7, which knows only that one. The page draws the title and crumb around the
 * form, so the card drops its own heading. `view: 'summary'` is the row's
 * one-liner, used only when the package carries no description of its own — this
 * package has one, so the page never asks, and returning nothing keeps a single
 * source for that line.
 *
 * @param ctx - the browser plugin context.
 */
function registerRowConfig(ctx: any): void {
  ctx.inject(['configForms'], (c: any) => {
    const card = (props: { view?: string }) =>
      props?.view === 'summary'
        ? null
        : React.createElement(JevSettingsCard, {
          scope: c.configForms.get(NS),
          // The Subagent allowlist lives in another plugin's namespace. Reading it
          // is what lets the route selects offer only models dispatch may use; if
          // that plugin is absent the scope simply reports nothing and the card
          // keeps its raw field.
          allowlist: c.configForms.get(SUBAGENT_ALLOWLIST_NAMESPACE),
          // Liveness probe for the delegation tools: a namespace the loader does
          // not serve reports unavailable, and the card tells the user to enable
          // the plugin instead of letting a verdict go quietly nowhere.
          subagent: c.configForms.get(SUBAGENT_NAMESPACE),
          heading: false,
        })

    // Each surface is guarded on its own, so a loader that predates the package
    // slot still gets the row page instead of losing the form entirely.
    const register = () => {
      try {
        c.slots.inject('plugins.bundle.config', () =>
          c.slots.register({ name: 'plugins.bundle.config', key: PACKAGE_NAME, locale: NS }, card))
      } catch {
        // 0.1.7 declares no package-page slot; the row page below is the surface.
      }
      try {
        c.slots.inject('plugins.row.config', () =>
          c.slots.register({ name: 'plugins.row.config', key: ROW_CONFIG_KEY, locale: NS }, card))
      } catch {
        // A slot anomaly must never break the Plugins page itself.
      }
    }

    try {
      // `whileServed` keeps the registration alive only while the Host actually
      // serves our namespace, so a deployment that never composed us shows no
      // trace of the entry.
      if (typeof c.configForms?.whileServed === 'function') {
        c.effect(() => c.configForms.whileServed([NS], register), 'subagent-custom: settings page')
      } else {
        register()
      }
    } catch {
      // A slot anomaly must never break the Plugins page itself.
    }
  })
}

/**
 * DSH 0.1.5 — the Plugins settings tab, keyed by the settings namespace the host
 * registered imperatively with `ctx.settings.installSection`.
 *
 * @param ctx - the browser plugin context.
 */
function registerSettingsItem(ctx: any): void {
  ctx.inject(['settingsScope'], (c: any) => {
    try {
      const scope = c.settingsScope.bind({ namespace: NS })
      c.slots.inject('settings.plugin.item', () =>
        c.slots.register({ name: 'settings.plugin.item', key: NS, id: PLUGIN_NAME, order: 30 }, () =>
          React.createElement(JevSettingsCard, { scope }),
        ),
      )
    } catch {
      // Binding anomalies must never break the settings page itself.
    }
  })
}

/**
 * The composer selector: which model this session's subagents run on.
 *
 * It sits beside the main model seat, which is where the question "what is the
 * subagent using" is actually asked. Every read and write goes through the
 * plugin's own Remote namespace, so the Host stays the only thing that decides.
 *
 * @param ctx - the browser plugin context.
 */
function registerComposerPicker(ctx: any): void {
  ctx.inject(['slots', 'remote'], (c: any) => {
    try {
      c.slots.inject('conversation.input.right', () =>
        c.slots.register(
          {
            name: 'conversation.input.right',
            id: 'subagent-custom-picker',
            order: 0,
            locale: NS,
            inject: (sessionId: string) => ({ sessionId, remote: c.remote, service: pickerService }),
          },
          SubagentModelPicker,
        ),
      )
    } catch {
      // A slot anomaly must never break the composer itself.
    }
  })
}

/**
 * The badge on the subagent lineage row: the model those subagents run on.
 *
 * The row already says a session has children; this answers the next question
 * from the same record the selector writes, so the two cannot disagree.
 *
 * @param ctx - the browser plugin context.
 */
function registerSubagentBadge(ctx: any): void {
  ctx.inject(['slots', 'remote'], (c: any) => {
    try {
      c.slots.inject('conversation.session.header.actions', () =>
        c.slots.register(
          {
            name: 'conversation.session.header.actions',
            id: 'subagent-custom-badge',
            order: 20,
            locale: NS,
            inject: (parentSessionId: string) => ({ parentSessionId, remote: c.remote, service: pickerService }),
          },
          SubagentModelBadge,
        ),
      )
    } catch {
      // The header is optional chrome; losing the badge must not break it.
    }
  })
}

/**
 * This plugin's own Remote namespace service, resolved once at activation.
 *
 * It is resolved through `ctx.get` after the mount rather than read as
 * `ctx.remote.subagent-custom`: a namespace reached through the gateway demands
 * an entry in the inject list, and this one only exists once the contribution is
 * mounted — declaring it would wait forever. Passing the gateway where a service
 * was expected is what made every read empty and every write vanish.
 */
export let pickerService: any

/**
 * The settings scope the card and the sidebar tab both read.
 *
 * Held at module scope because passing it through the slot's props is not
 * reliable for a tab body: the sidebar registered the tab but handed it none of
 * the extra fields, so every section of the panel read empty while the header
 * badge — which resolves the same service another way — was correct.
 */
export let settingsScope: any

/** The right-sidebar tab's stable key. */
const SIDEBAR_TAB_ID = 'dsh-subagent-custom/models'

/**
 * Add this plugin's own right-sidebar tab.
 *
 * A NEW tab, never the official subagent tab's body: `sidebar.right.pane.tab` is
 * keyed, and registering an already-occupied key replaces that occupant — so
 * sharing it would silently shadow the shipped panel. The tab type carries a
 * `guide` entry, which is what makes it discoverable in the sidebar's guide.
 */
function registerSidebarTab(ctx: any): void {
  ctx.inject(['sidebarRightTabs', 'configForms'], (c: any) => {
    c.effect(
      () =>
        c.sidebarRightTabs.register({
          id: SIDEBAR_TAB_ID,
          kind: 'subagentcustom',
          priority: 'builtin',
          title: () => tr('tabTitle'),
          guide: [{ id: 'subagent-models', order: 60, title: () => tr('tabTitle'), description: () => tr('tabGuide') }],
        }),
      'subagent-custom: sidebar tab type',
    )
    c.effect(
      () =>
        c.slots.inject('sidebar.right.pane.tab', () =>
          c.slots.register(
            {
              name: 'sidebar.right.pane.tab',
              key: SIDEBAR_TAB_ID,
              scope: settingsScope ?? c.configForms.get(NS),
              remote: ctx.remote,
              service: pickerService,
            },
            SidebarTab,
          ),
        ),
      'subagent-custom: sidebar tab body',
    )
  })
}

/**
 * Client entry point.
 *
 * Deliberately NO `export default`: the client module system resolves the
 * plugin from the module namespace, and a default export makes it treat the
 * bare `apply` function as the plugin — which loses `inject`, so the first
 * `ctx.locale` read fails the fiber with "cannot get property ... without
 * inject". The named exports are the contract (mirrors the proven reference).
 */
export async function apply(ctx: any) {
  wireLocale(ctx)
  registerRowConfig(ctx)
  registerSettingsItem(ctx)
  // Declare this plugin's own Remote methods before anything calls them: without
  // the mount the namespace has no descriptors, so the selector renders and
  // lists models (that read goes through the official session namespace) while
  // its own reads return nothing and its writes are dropped.
  try {
    await ctx.remote.$mount(CONTRIBUTION)
    pickerService = ctx.get('remote.subagent-custom')
  } catch {
    // A failed mount costs the selector, never the routing half.
  }
  // Remember the scope for the sidebar tab, which cannot rely on slot props.
  ctx.inject(['configForms'], (c: any) => {
    settingsScope = c.configForms.get(NS)
  })
  registerComposerPicker(ctx)
  registerSubagentBadge(ctx)
  // After the mount, so the tab is handed a resolved service rather than the
  // gateway the namespace is served on.
  registerSidebarTab(ctx)
}

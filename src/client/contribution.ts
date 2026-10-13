/**
 * The Remote descriptors for this plugin's own namespace.
 *
 * The Host registers a Typert service, but the browser half cannot call it until
 * the *shapes* of its methods are declared on the client side and mounted: the
 * mount is what turns `remote.subagent-custom.get(...)` into a routed call. Skip
 * it and every read returns nothing and every write is dropped, silently — the
 * selector renders, lists models, and then appears to ignore every click.
 *
 * `zod` is not a platform seed word, so these codecs carry a minimal `parse`
 * contract. A strict codec must expose `create()` — the factory the typert
 * registry calls once to materialize the schema. Passing the schema itself is
 * rejected at mount with "strict codec has no create() factory", which fails the
 * whole client entry.
 */

/** The namespace this plugin serves and calls. */
export const NAMESPACE = 'subagent-custom'

/** Build one strict codec from a predicate. */
function makeSchema(validate: (value: unknown) => boolean) {
  return () => ({
    parse(value: unknown) {
      if (!validate(value)) throw new Error(`${NAMESPACE}: invalid value`)
      return value
    },
  })
}

const stringSchema = makeSchema((value) => typeof value === 'string')

/** A stored selection, or null to mean "inherit". */
const selectionSchema = makeSchema(
  (value) =>
    value === null ||
    (typeof value === 'object' &&
      value !== null &&
      typeof (value as { provider?: unknown }).provider === 'string' &&
      typeof (value as { model?: unknown }).model === 'string'),
)

/** One JSON-wire parameter. */
function jsonParameter(wire: string) {
  return {
    name: wire,
    wire,
    source: 'json',
    codec: {
      mode: 'strict',
      typeSymbol: `dsh-subagent-custom/types#${wire}`,
      create: stringSchema,
    },
  }
}

/** The dispatch list, newest first. */
const dispatchListSchema = makeSchema((value) => Array.isArray(value))

/** The shipped roles, class mapping and classes. */
const defaultsSchema = makeSchema((value) => typeof value === 'object' && value !== null)

/** One method of the namespace. */
function descriptor(method: string, parameters: unknown[]) {
  const isList = method === 'dispatches'
  const isDefaults = method === 'defaults'
  return {
    id: `dsh-subagent-custom#${NAMESPACE}/${method}`,
    service: NAMESPACE,
    namespace: NAMESPACE,
    method,
    invocation: { kind: 'direct' },
    parameters,
    result: {
      mode: 'strict',
      typeSymbol: isList
        ? 'dsh-subagent-custom/types#DispatchList'
        : isDefaults
          ? 'dsh-subagent-custom/types#Shipped'
          : 'dsh-subagent-custom/types#SelectionView',
      create: isList ? dispatchListSchema : isDefaults ? defaultsSchema : selectionSchema,
    },
  }
}

/** Mount this before any component calls the namespace. */
export const CONTRIBUTION = {
  package: 'dsh-subagent-custom',
  descriptors: [
    descriptor('read', [jsonParameter('sessionId')]),
    descriptor('dispatches', [jsonParameter('sessionId')]),
    descriptor('defaults', []),
    descriptor('set', [
      jsonParameter('sessionId'),
      {
        name: 'selection',
        wire: 'selection',
        source: 'json',
        codec: {
          mode: 'strict',
          typeSymbol: 'dsh-subagent-custom/types#Selection',
          create: selectionSchema,
        },
      },
    ]),
    descriptor('clear', [jsonParameter('sessionId')]),
  ],
}

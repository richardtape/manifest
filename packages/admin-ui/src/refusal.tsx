import { ManifestApiError } from '@manifest/contract'

/**
 * EVERY REFUSAL IS RENDERED HERE, AND ONLY HERE (the plan's Global Constraints): the `code`, in mono,
 * then the `message`, then the `hint`, then the request's id — C3 inverted, because an operator is
 * shown the machine's words first and is the person who quotes the id to find the platform's line.
 * Anything that is not a refusal is shown as its message: a console that swallowed it would show a
 * blank pane, which is this codebase's most productive defect.
 */
export function Refusal({ error }: { error: unknown }) {
  if (error === undefined || error === null) return null
  if (!(error instanceof ManifestApiError))
    return (
      <div className="refusal" role="alert">
        <p className="refusal__message">
          {error instanceof Error ? error.message : String(error)}
        </p>
      </div>
    )
  const envelope = error.envelope?.error
  return (
    <div className="refusal" role="alert">
      <p>
        <code className="refusal__code">{error.code}</code>
      </p>
      <p className="refusal__message">{envelope?.message ?? `HTTP ${error.status}`}</p>
      {envelope?.hint !== undefined && <p className="refusal__hint">{envelope.hint}</p>}
      {error.requestId !== null && (
        <p className="refusal__request">
          Request <code>{error.requestId}</code>
        </p>
      )}
    </div>
  )
}

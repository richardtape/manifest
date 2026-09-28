import {
  createManifestClient,
  idempotencyKey,
  ManifestApiError,
  unwrap,
  type Schemas,
} from '@manifest/contract'

export type ModelSession =
  | {
      started: true
      sessionId: string
      key: string
      baseUrl: string
      model: string
      expiresAt: string
    }
  | { started: false; why: string }

const dollars = (usd: number): string => `$${usd.toFixed(2)}`

function monthIsSpent(month: Schemas['AgentBudget']): string {
  const resets = month.resetsAt === null ? '' : ` on ${month.resetsAt.slice(0, 10)}`
  return `This month’s ${dollars(month.monthlyUsd)} of agent budget is spent; it resets${resets}.`
}

/**
 * Give your agent a model key, charged to the person the token acts for. Read the month first
 * and say plainly when it is spent. The key is in this answer and NOWHERE else: keep it in
 * memory for the session, never store or log it. If the answer is lost, a retry with the same
 * Idempotency-Key is `409 AGENT_SESSION_ALREADY_STARTED`, naming the session and never the key
 * — end that session and start another with a new key.
 */
export async function startAModelSession(
  origin: string,
  token: string,
  projectId: string,
  name: string,
): Promise<ModelSession> {
  const client = createManifestClient({ origin, token })
  const month = unwrap(await client.GET('/v1/agent-budget'), 'getAgentBudget')
  if (month.remainingUsd !== null && month.remainingUsd <= 0)
    return { started: false, why: monthIsSpent(month) }
  try {
    const { session, key, baseUrl } = unwrap(
      await client.POST('/v1/projects/{projectId}/agent-sessions', {
        params: { path: { projectId }, header: { 'Idempotency-Key': idempotencyKey() } },
        // A cap for this conversation, and a life no longer than the work.
        body: { name, capUsd: 1, durationMinutes: 60 },
      }),
      'startAgentSession',
    )
    // Read the names from `models`; never assume one. The capable model when it is listed.
    const model = ['default-chat-large', 'default-chat'].find((m) =>
      session.models.includes(m),
    )
    if (model === undefined)
      throw new Error(`no chat model among ${session.models.join(', ')}`)
    return {
      started: true,
      sessionId: session.id,
      key,
      baseUrl,
      model,
      expiresAt: session.expiresAt,
    }
  } catch (error) {
    // Spent between the read and the start — another of the person's agents, most likely.
    if (error instanceof ManifestApiError && error.code === 'AGENT_BUDGET_EXHAUSTED')
      return { started: false, why: error.message }
    throw error
  }
}

/**
 * Ask the model: an OpenAI-compatible request at the session's `baseUrl`, the key as a Bearer.
 * When the capable model's provider cannot answer, the platform's on-premise model answers in
 * its place — a smaller model's work, at its own price — and says so in a header.
 */
export async function askTheModel(
  session: { baseUrl: string; key: string; model: string },
  question: string,
): Promise<{ text: string; answeredBy: string; fellBack: boolean }> {
  const response = await fetch(`${session.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${session.key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: session.model,
      messages: [{ role: 'user', content: question }],
    }),
  })
  if (!response.ok) throw new Error(`the model gateway answered ${response.status}`)
  const answer = (await response.json()) as {
    model: string
    choices: { message: { content: string } }[]
  }
  return {
    text: answer.choices[0]?.message.content ?? '',
    answeredBy: answer.model,
    fellBack: Number(response.headers.get('x-litellm-attempted-fallbacks') ?? '0') > 0,
  }
}

/**
 * What one conversation has spent, and what is left of the month — for the person to see as
 * they work. Either is null, with a reason, when the gateway cannot say: never show $0 for
 * unknown. Spend lands a few seconds after a call.
 */
export async function whatItHasSpent(
  origin: string,
  token: string,
  projectId: string,
  sessionId: string,
): Promise<string> {
  const client = createManifestClient({ origin, token })
  const { sessions } = unwrap(
    await client.GET('/v1/projects/{projectId}/agent-sessions', {
      params: { path: { projectId } },
    }),
    'listAgentSessions',
  )
  const month = unwrap(await client.GET('/v1/agent-budget'), 'getAgentBudget')
  const spent = sessions.find((s) => s.id === sessionId)?.spentUsd ?? null
  return [
    spent === null ? 'spend not known right now' : `${dollars(spent)} so far`,
    month.remainingUsd === null
      ? 'the month not known right now'
      : `${dollars(month.remainingUsd)} left this month`,
  ].join(' · ')
}

/** End the session when the work ends: its key stops working from the next call. */
export async function endTheSession(
  origin: string,
  token: string,
  sessionId: string,
): Promise<string> {
  const client = createManifestClient({ origin, token })
  const ended = unwrap(
    await client.DELETE('/v1/agent-sessions/{sessionId}', {
      params: { path: { sessionId }, header: { 'Idempotency-Key': idempotencyKey() } },
    }),
    'endAgentSession',
  )
  return ended.state
}

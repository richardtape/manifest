# Building a front-end

How to build a front-end on Manifest’s API — a site of your own, served beside the API, where a person describes an app and an agent builds it for them. It is for the team building that site, and for the agent it runs: where your site lives and how a person signs in there, which credential does what and where each is kept, your agent’s model, what a running app printed, images and documents, a project’s name and its people, ending an app, and what the platform leaves to you. Everything here is also in the reference; this page is the order to read it in.

## Your origin

Your front-end is served at `app.<zone>` — `https://app.manifest.internal` on a laptop — through the same edge as the API. On that origin the edge sends `/v1/…` and `/auth/…` to Manifest and every other path to your server, so your pages and the API share one origin, and your browser code calls the API with relative paths.

- **A person signs in on your origin**: send the browser to `/auth/login?returnTo=<a path on your site>`. They sign in with CWL and come back to that path with a `manifest_session` cookie set for your origin alone. Step-up (`/auth/step-up?returnTo=…`) and signing out (`POST /auth/logout`) work the same way on your origin.
- **A session is its own origin’s.** Manifest signs people in on two origins — the console’s and yours — and judges each request by the origin it arrived on. A session set on the console is not a session on your origin, and the other way round; signing out of one leaves the other signed in. Signing out of a deployed app ends the person’s session at the identity provider and on the console, but not on your origin: that session lasts until it expires, twelve hours after sign-in.
- **A mutation made with a session carries `Origin`** naming the origin it is sent to. A browser does this itself. The console’s origin is refused on yours, and yours on the console’s: `403 CSRF_ORIGIN_REFUSED`.
- **A browser refused at `/auth/…` is shown a page, not JSON.** When a sign-in, a step-up or a sign-out cannot complete, a request that accepts `text/html` — every navigation does — is answered a short page naming the refusal’s code, with a link to sign in again and one to your site’s start. You need not render these yourself. A script’s request is answered the usual error envelope.

## Two credentials, two places

- **The person’s browser holds the session.** It does what is a person’s: creates a project (`createProject`), mints and revokes delegated tokens, answers an agent’s question (`confirmPendingAction`), signs in again for the most privileged actions, starts a description before a project exists (`startIntakeSession`), and switches an app off, brings it back or deletes it. A token is refused every one of those `403 TOKEN_CREDENTIAL_REFUSED`.
- **Your server holds a delegated token per project.** The person’s browser mints it (`mintToken`) for one project, with the capabilities the work needs, and hands it to your server over your own channel; your server runs the agent with it. Besides the build loop’s (`project:read`, `source:write`, `secret:write`, `build:create`, `release:create`, `release:deploy`), an agent that asks for a model key needs `agent:session`, and one that reads what its app printed needs `output:read` — without them each call is `403 FORBIDDEN`. A token sees one project and never does what is a person’s. Revoke it (`revokeToken`) when the work is done.
- **Your server also receives the person’s session, whether it wants it or not.** The cookie is set for the whole origin, and the edge sends every page request on it to your server — so each one carries the session. **The rule: your server may send that cookie to `GET /v1/me` (`getMe`) to learn whom it is serving, and for nothing else.** Never log it, store it, or use it for any other call. A server can set any `Origin` it likes, so the cross-site check does not stop it: this rule is the control, and keeping it is your front-end’s responsibility.

**Develop against `manifest-mock`**, not only against a platform — *Developing against the mock*, below.

## Your agent’s model

`startAgentSession` gives your agent a model key for one project — its token must hold `agent:session` — **charged to the person the token acts for**: capped for the session (`capUsd`), inside that person’s monthly agent budget, short-lived (`durationMinutes`, never past the token that asks), and limited to the models the project’s data classification allows. **The key is in that answer and nowhere else.** Keep it in memory for the session; never store or log it. The key calls models and nothing else — it is not a Manifest credential.

- **Read the model names from the session’s `models`, and never assume one.** `default-chat-large` is the capable model, for work a small model cannot do well, such as writing an app, and every call costs the person real money; it is listed wherever the platform offers one — on a `confidential` project too, while the platform lets the agent that BUILDS an app use it (its default), after the on-premise models. **It builds the app; it never becomes the app’s own AI**: a `confidential` app’s `ai.models` must name on-premise models, which validation enforces. `default-chat` is small, and answers offline. A name never changes when the platform moves it to another provider.
- **When the capable model’s provider cannot be reached or fails** — a refused connection, a timeout, a rate limit or a server error — the platform’s on-premise model answers in its place, at its own price. The answer carries the header `x-litellm-attempted-fallbacks: 1` and its `model` names the on-premise model: record which model answered, and do not rely on a smaller model’s work as though it were the capable one’s. **A request the provider refuses as malformed is answered as the provider’s refusal instead** — `400`, or `413` for a request too large, `error.type` `invalid_request_error`, no fallback header — to correct rather than send again unchanged; read the header on every answer rather than assuming which model answered. **A `200` whose body is `null` is a refusal as well**, the gateway’s answer to a request the provider could not process (`422`): never show it as an empty answer.
- **Show the person what it costs, always.** `listAgentSessions` gives each session’s `spentUsd`, and `getAgentBudget` the month’s — *“$0.40 so far · $9.60 left this month”*. Either is `null` with a reason when the gateway cannot say, and never `0` for unknown. Spend lands a few seconds after a call.
- **End the session when the work ends** (`endAgentSession`). It is also ended when the token that started it is revoked, when the person it works for is removed from the project, and when the project is switched off or deleted; each ended session says why. **When the project stops allowing some of the models it holds, it is narrowed, not ended**: a commit raised its classification, or a production deploy of a release classified higher did — a launch, or the pre-launch rehearsal (each narrows it before it answers), or the platform, restarted, no longer lets a `confidential` project’s agent use the capable model. Its key keeps the models the project still allows and is refused the rest at once (`403`, `error.type` `key_model_access_denied` — the gateway’s refusal, not a Manifest code); `agent_session.narrowed` on the project’s stream names what was withdrawn and what it keeps, and the session’s `models` is the new list — show the person that list, and keep using the same key. Only a session left with nothing it may use is ended — `models_withdrawn` — and its key then stops working for every model, so start a new session. A key also stops working when it expires, whether or not anybody ended it (its `state` reads `expired`); a session that has spent its cap still reads `active`.
- **Refusals.** `409 AGENT_BUDGET_EXHAUSTED` — the month is spent; say so, and say when it resets. `409 AGENT_SESSION_ALREADY_STARTED` — this `Idempotency-Key` already started a session, and its key is never shown again: end the session the refusal names and start another with a new key. `409 AGENT_NO_MODEL_FOR_CLASSIFICATION` — no model is approved for this project’s data. `503 AI_BACKEND_UNAVAILABLE` and `503 AI_CATALOGUE_DISABLED` — the gateway is not answering, or AI is switched off.

<!-- example: example-agent-session -->

```ts
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
    // Read the names from `models`; never assume one. The capable model when it is listed — on a
    // confidential project too, while the platform lets the agent that builds an app use it; else
    // the small model, else the on-premise one.
    const model = ['default-chat-large', 'default-chat', 'default-chat-onprem'].find(
      (m) => session.models.includes(m),
    )
    if (model === undefined) {
      // No chat model this key may call: END the session rather than leave a key nobody holds.
      unwrap(
        await client.DELETE('/v1/agent-sessions/{sessionId}', {
          params: {
            path: { sessionId: session.id },
            header: { 'Idempotency-Key': idempotencyKey() },
          },
        }),
        'endAgentSession',
      )
      return {
        started: false,
        why: `This project's key offers no chat model (${session.models.join(', ')}).`,
      }
    }
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
      // The platform's own sentence, for a person — not the client's "… failed with 409 …".
      return { started: false, why: error.envelope?.error.message ?? error.message }
    throw error
  }
}

/**
 * Ask the model: an OpenAI-compatible request at the session's `baseUrl`, the key as a Bearer.
 * When the capable model's provider cannot answer, the platform's on-premise model answers in
 * its place — a smaller model's work, at its own price — and says so in a header. A request the
 * provider refuses as malformed is answered as its refusal instead, to correct — and so is a
 * `200` whose body is `null`.
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
  } | null
  if (answer === null)
    throw new Error('the model gateway refused the request: correct it')
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
```

<!-- /example -->

## Describing an app before it exists

Before a project exists there is no token and nothing to charge. `startIntakeSession` gives the person’s own session a key for **the platform’s intake model, which the platform pays for** — never the person’s budget: cents and minutes a key, a few keys a person a day. Use it to understand what the person asked for, to propose slugs (`checkSlug`) and to choose a blueprint; once the project exists, carry on under an agent session. It is a session’s alone — a token is refused `403 TOKEN_CREDENTIAL_REFUSED` — and, like an agent’s key, it is answered once (`409 INTAKE_SESSION_ALREADY_STARTED` on a retry). Describing is paused for one person until midnight in Vancouver (`409 INTAKE_DAILY_LIMIT_REACHED`), or for everyone until the month resets (`409 INTAKE_BUDGET_EXHAUSTED`); `503 INTAKE_MODEL_UNAVAILABLE` means the platform has no approved intake model. End it with `endIntakeSession`. **This is browser code**: it acts as the person, so it runs on your page’s own client (`createManifestClient({ origin: location.origin })`, which holds no credential — the browser sends the cookie and `Origin`), never on your server with the person’s cookie. If your server runs the intake agent, hand it the key over your own channel.

<!-- example: example-intake -->

```ts
import {
  idempotencyKey,
  ManifestApiError,
  unwrap,
  type ManifestClient,
} from '@manifest/contract'

export type Describing =
  | {
      started: true
      intakeSessionId: string
      key: string
      baseUrl: string
      model: string
    }
  | { started: false; code: string; why: string }

/**
 * A person describing an app they have not created yet: a key for the platform's intake model,
 * which the platform pays for — cents and minutes, a few a day. BROWSER CODE: it acts as the
 * person, so it runs in their browser on the page's own client — `createManifestClient({ origin:
 * location.origin })`, which carries no credential, because the browser sends the person's cookie
 * and `Origin` itself. Never a token, and never your server replaying the cookie. If your server
 * runs the intake agent, hand it the key over your own channel, as you hand it a token. Use the
 * key to understand what the person asked for and to propose slugs (`checkSlug`); once the
 * project exists, the work continues under an agent session.
 */
export async function startDescribing(page: ManifestClient): Promise<Describing> {
  try {
    const started = unwrap(
      await page.POST('/v1/intake-sessions', {
        params: { header: { 'Idempotency-Key': idempotencyKey() } },
      }),
      'startIntakeSession',
    )
    return {
      started: true,
      intakeSessionId: started.session.id,
      key: started.key,
      baseUrl: started.baseUrl,
      // One model, the platform's: use the name it answers.
      model: started.session.model,
    }
  } catch (error) {
    // Paused — for this person until tomorrow, or for everyone until the month resets. Say so.
    if (
      error instanceof ManifestApiError &&
      (error.code === 'INTAKE_DAILY_LIMIT_REACHED' ||
        error.code === 'INTAKE_BUDGET_EXHAUSTED')
    )
      // The platform's own sentence, for a person — not the client's "… failed with 409 …".
      return {
        started: false,
        code: error.code,
        why: error.envelope?.error.message ?? error.message,
      }
    throw error
  }
}

/** End it when the description is done; its key stops working from the next call. */
export async function stopDescribing(
  page: ManifestClient,
  intakeSessionId: string,
): Promise<string> {
  const ended = unwrap(
    await page.DELETE('/v1/intake-sessions/{intakeSessionId}', {
      params: {
        path: { intakeSessionId },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
    }),
    'endIntakeSession',
  )
  return ended.state
}
```

<!-- /example -->

## Seeing a running app

`listInstances` lists an environment’s instances, the one seen most recently first, each marked `serving` when the hostname reaches it now — go by `serving`, not by the order, and by `createdAt` for which attempt is newer, whatever the order; a failed one stays listed after it is replaced. `getInstanceOutput` answers the last lines a **sandbox** instance printed, oldest first — read when you ask, never streamed and never kept. A token needs `output:read` for it.

- **Only a sandbox instance’s output is readable.** Staging and production serve real people, whose input an app’s output can carry, so each is refused by its own code — `403 INSTANCE_OUTPUT_STAGING`, `403 INSTANCE_OUTPUT_PRODUCTION`. To see what a staging release prints, deploy the same release to the sandbox (`deploy`) and read it there. A failed instance’s last lines are in its Incident (`listIncidents`), in every environment — **except to a token on a `confidential` project**: while the platform lets that project’s agent use the capable model, its staging and production Incidents are `403 INCIDENT_LOG_CONFIDENTIAL` to a delegated token, and answered to the person’s own session — **show them to the person, and never hand their `logTail` or `prompt` to your agent or any model**, though the `prompt` is otherwise shaped for one: that is exactly the data the refusal withholds.
- **An instance that no longer runs** is `409 INSTANCE_OUTPUT_UNAVAILABLE`: Manifest keeps no output. Read its Incident.
- **The bounds.** `lines` — 200 by default, at most 1000 — and at most 256 KiB in all; a line longer than 4 KiB is cut and ends `…[cut: N bytes]`, `N` approximate. You are answered **at most** the lines you asked for: the runtime stores a very long line in pieces, and a piece counts as a line. When the one line asked for was the tail of a long one, it begins `…`. Each line’s `at` is when the runtime recorded it; when `stamped` is false, it is when Manifest read it.
- **Redacted, and what redaction does not catch.** The app’s own secrets — the values it was given — and anything shaped like a credential (a private key, a token, a password in a URL, a long random string) read `[REDACTED]`, lines joined first, so a key printed over several lines is redacted on every line it covered. It is a safety net, not a guarantee, and it misses: a person’s own data an app prints, such as a name, an email or a student number; any of the app’s own secrets shorter than six characters; a short or hex-only value that is not one of the app’s secrets; a secret the app split up or re-encoded itself; and a multi-line secret whose first line begins more than 8 KiB into a line. Show output to the people who own the app, and to no one else.

<!-- example: example-output -->

```ts
import {
  createManifestClient,
  ManifestApiError,
  unwrap,
  type Schemas,
} from '@manifest/contract'

export type AppOutput =
  | { read: true; instanceId: string; lines: Schemas['InstanceOutput']['lines'] }
  | { read: false; instanceId: string | null; code: string | null; next: string }

/**
 * What a running app printed: the last lines of the instance an environment's hostname reaches,
 * oldest first and redacted. Only a SANDBOX instance's output is readable — staging and
 * production serve real people, and each is refused by its own code — so to see what a staging
 * release prints, deploy the same release to the sandbox and read it there. Nothing is kept:
 * each read asks the running instance again.
 */
export async function whatTheAppPrinted(
  origin: string,
  token: string,
  environmentId: string,
  lines: number,
): Promise<AppOutput> {
  const client = createManifestClient({ origin, token })
  const list = unwrap(
    await client.GET('/v1/environments/{environmentId}/instances', {
      params: { path: { environmentId } },
    }),
    'listInstances',
  )
  // The one the hostname reaches now. A failed one stays listed after it is replaced.
  const serving = list.instances.find((i) => i.serving)
  if (serving === undefined)
    return {
      read: false,
      instanceId: null,
      code: null,
      next: 'Nothing is running here: deploy a release first.',
    }
  try {
    const output = unwrap(
      await client.GET('/v1/instances/{instanceId}/output', {
        // At most `lines` — a long line the runtime split counts as several.
        params: { path: { instanceId: serving.id }, query: { lines } },
      }),
      'getInstanceOutput',
    )
    return { read: true, instanceId: serving.id, lines: output.lines }
  } catch (error) {
    if (!(error instanceof ManifestApiError)) throw error
    switch (error.code) {
      case 'INSTANCE_OUTPUT_STAGING':
      case 'INSTANCE_OUTPUT_PRODUCTION':
        return {
          read: false,
          instanceId: serving.id,
          code: error.code,
          next: 'Deploy the same release to the sandbox and read it there, or read a failed instance’s Incident (listIncidents).',
        }
      case 'INSTANCE_OUTPUT_UNAVAILABLE':
        // It stopped between the two reads: its last lines are in its Incident.
        return {
          read: false,
          instanceId: serving.id,
          code: error.code,
          next: 'It no longer runs: read its Incident (listIncidents).',
        }
      default:
        throw error
    }
  }
}
```

<!-- /example -->

## Images and documents

A write in `createCommit` carries a file’s bytes with `encoding: 'base64'`: canonical base64 of at most 2 MiB, at a path ending in `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.ico`, `.pdf`, `.woff`, `.woff2`, `.ttf` or `.otf`, whose first bytes are one of those ten kinds — an image, a PDF or a font. The kind is recognised from the bytes, so a PNG named `.jpg` is accepted as a PNG. **Text is never sent as bytes**: it is refused, so send it as text. Two 2 MiB files fit in one commit’s 8 MiB request. `getFile` with `encoding=base64` reads any file up to 2 MiB — text too — and every answer carries its `encoding`; `getTree` marks a binary file `binary: true`.

**The secret scan reads a binary file’s printable text only.** Text a PDF stores compressed — how most exporters write a page — text in UTF-16, and a PNG’s compressed text chunks are not scanned. When a binary file is refused `409 SOURCE_SECRET_DETECTED`, the `line` that `repository.secret_refused` names counts the file’s runs of printable text, not lines.

<!-- example: example-binary -->

```ts
import { createManifestClient, idempotencyKey, unwrap } from '@manifest/contract'

/**
 * Commit an image, a PDF or a font as its BYTES: `encoding: 'base64'` on the write, the bytes as
 * canonical base64, at most 2 MiB, at a path ending in one of the ten kinds' extensions. Text is
 * never sent as bytes — it is refused; send it as text. In a browser, base64 a `File` with
 * `FileReader.readAsDataURL` and keep what follows the comma.
 */
export async function commitAFile(
  origin: string,
  token: string,
  projectId: string,
  path: string,
  bytes: Uint8Array,
  message: string,
): Promise<string> {
  const client = createManifestClient({ origin, token })
  const tree = unwrap(
    await client.GET('/v1/projects/{projectId}/tree', {
      params: { path: { projectId } },
    }),
    'getTree',
  )
  const outcome = unwrap(
    await client.POST('/v1/projects/{projectId}/commits', {
      params: { path: { projectId }, header: { 'Idempotency-Key': idempotencyKey() } },
      body: {
        baseCommit: tree.commitSha,
        message,
        changes: [
          {
            op: 'write',
            path,
            content: Buffer.from(bytes).toString('base64'),
            encoding: 'base64',
          },
        ],
      },
    }),
    'createCommit',
  )
  if (outcome.commitSha === null)
    throw new Error('a commit that is not a dry run has an id')
  return outcome.commitSha
}

/**
 * Read any file as bytes — an image, or text — up to 2 MiB: `getFile` with `encoding=base64`.
 * `getTree` marks a binary file `binary: true`; read those this way.
 */
export async function readBytes(
  origin: string,
  token: string,
  projectId: string,
  path: string,
  ref: string,
): Promise<Uint8Array> {
  const client = createManifestClient({ origin, token })
  const file = unwrap(
    await client.GET('/v1/projects/{projectId}/file', {
      params: { path: { projectId }, query: { path, ref, encoding: 'base64' } },
    }),
    'getFile',
  )
  return new Uint8Array(Buffer.from(file.content, 'base64'))
}
```

<!-- /example -->

## A project’s name, and its people

- **A project has a `name`** — what people read, one line of 1 to 80 characters — **and a slug**, which its hostnames and its repository are made from. The name is the slug until someone gives it another; `updateProject` changes it — an owner, a collaborator, or a token holding `project:write` — and publishes `project.renamed`. The slug never changes. Show the name; use the slug where an address is meant.
- **Add a colleague by exactly one of** their CWL login name (`cwlLogin`), their email (`email`) or their PUID (`puid`) with `addMember`. Only a person who has signed in to Manifest once can be added; a CWL login name is known only for a person who has signed in since Manifest began asking CWL for it, so offer email as well. An email two people share is `400 MEMBER_USER_AMBIGUOUS`; nobody found is `400 MEMBER_USER_NOT_FOUND`; a project must keep an owner (`409 PROJECT_LAST_OWNER`). Adding, changing and removing members need the person to have signed in again within ten minutes (`403 STEP_UP_REQUIRED`), and a token only asks (`403 TOKEN_ACTION_PENDING`). `member.added` and `member.removed` name the member as `memberId` and who acted as `userId`. **Removing a person removes their agent too**: every token they minted on the project is revoked, their event streams on it close (`4401` a token’s, `4404` their own), and their agent sessions there are ended (`member_removed`) — `member.removed` says how many (`tokensRevoked`, `sessionsEnded`). Ending those sessions needs the model gateway, so a removal can answer `503 AI_CATALOGUE_DISABLED` (or a `500`) AFTER it has happened: the person is already off the project and their tokens revoked — read the members again, and repeat the removal once AI is back on to end their sessions.

## Ending an app

- **Switch it off** (`archiveProject`) — at the end of a course. Every one of its addresses answers a page saying its owner switched it off (`410`), everything it ran stops, its agent sessions end, its delegated tokens are revoked and its questions expire; its code, data, secrets and records are kept. From then on anything a person asks that would change it is `409 PROJECT_ARCHIVED`, and a token of it is no longer a credential at all (`401 UNAUTHENTICATED`): an event stream a token holds closes `4401`, while a person’s stays open, because an archived app can still be read.
- **Bring it back** (`restoreProject`). Nothing starts until its next deploy, which brings it back on its kept data. Its tokens stay revoked: mint new ones.
- **Delete it for good** (`deleteProject`) — **only an app that never launched**: a trial, or a mistake. Its repository, data, secrets and model budgets are destroyed, every address answers nothing of it, its slug is free for another project, and every route answers it `404` — every event stream still open on it closes `4404`. **A launched app is never deleted by its owner** (`409 PROJECT_LAUNCHED_NOT_DELETABLE`): its data is kept for its retention period. Switch it off instead.
- **Who may.** The owner or a platform administrator, in their own session — never a token (`403 TOKEN_CREDENTIAL_REFUSED`). Switching off and deleting need the person to have signed in again within ten minutes (`403 STEP_UP_REQUIRED`); bringing back does not, because it takes nothing from anyone. Tell the person plainly what each takes away before they press it.
- **A step that fails** is `500 PROJECT_TEARDOWN_INCOMPLETE`, with the app left switched off. Send the same request again — the same `Idempotency-Key` — and it continues where it stopped. After a delete that stopped part way, finish the delete: do not restore, because a restored app may have lost its code or data.
- A delete, like every `DELETE` that takes no body, sends no `Content-Type`.

**This is browser code**, like every action that is the person’s: it runs on your page’s own client, and your server never does it with the person’s cookie.

<!-- example: example-archive -->

```ts
import {
  idempotencyKey,
  ManifestApiError,
  unwrap,
  type ManifestClient,
} from '@manifest/contract'

export type Ending =
  | { done: true; state: string }
  /** Send the person's browser here; they sign in again, come back, and ask again. */
  | { done: false; stepUpAt: string }
  | { done: false; refused: string; next: string }

const stepUp = (returnTo: string): Ending => ({
  done: false,
  stepUpAt: `/auth/step-up?returnTo=${encodeURIComponent(returnTo)}`,
})

/**
 * Switch an app off for everyone, keeping its code, data and secrets — at the end of a course.
 * The owner's or an administrator's, signed in again within ten minutes (step-up); never a
 * token's. Its tokens are revoked and its agent sessions end with it. BROWSER CODE, like every
 * function here: `page` is the page's own client — `createManifestClient({ origin:
 * location.origin })` — which carries no credential, because the person's browser sends their
 * cookie and `Origin` itself. Your server never does this with the person's cookie.
 */
export async function switchOff(
  page: ManifestClient,
  projectId: string,
  returnTo: string,
): Promise<Ending> {
  try {
    const project = unwrap(
      await page.POST('/v1/projects/{projectId}/archive', {
        params: { path: { projectId }, header: { 'Idempotency-Key': idempotencyKey() } },
        body: {},
      }),
      'archiveProject',
    )
    return { done: true, state: project.state }
  } catch (error) {
    if (error instanceof ManifestApiError && error.code === 'STEP_UP_REQUIRED')
      return stepUp(returnTo)
    throw error
  }
}

/** Bring it back: nothing starts until its next deploy. No step-up — it takes nothing away. */
export async function bringBack(
  page: ManifestClient,
  projectId: string,
): Promise<Ending> {
  const project = unwrap(
    await page.POST('/v1/projects/{projectId}/restore', {
      params: { path: { projectId }, header: { 'Idempotency-Key': idempotencyKey() } },
      body: {},
    }),
    'restoreProject',
  )
  return { done: true, state: project.state }
}

/**
 * Delete an app that never launched — a trial, or a mistake — for good: its repository, data,
 * secrets and model budgets destroyed, its slug free again. A launched app is never deleted by
 * its owner: switch it off instead. A delete that stops part way is FINISHED by sending the
 * same request again — the same Idempotency-Key — and never restored.
 */
export async function deleteForGood(
  page: ManifestClient,
  projectId: string,
  returnTo: string,
): Promise<Ending> {
  const key = idempotencyKey()
  for (let attempt = 1; ; attempt++) {
    try {
      const deleted = unwrap(
        // A bodyless DELETE: the generated client sends no Content-Type, as the API requires.
        await page.DELETE('/v1/projects/{projectId}', {
          params: { path: { projectId }, header: { 'Idempotency-Key': key } },
        }),
        'deleteProject',
      )
      return { done: true, state: deleted.state }
    } catch (error) {
      if (!(error instanceof ManifestApiError)) throw error
      if (error.code === 'STEP_UP_REQUIRED') return stepUp(returnTo)
      if (error.code === 'PROJECT_TEARDOWN_INCOMPLETE' && attempt < 3) continue
      if (error.code === 'PROJECT_TEARDOWN_INCOMPLETE')
        return {
          done: false,
          refused: error.code,
          next: 'It keeps stopping at the same step: tell a platform administrator. Do not restore it.',
        }
      if (error.code === 'PROJECT_LAUNCHED_NOT_DELETABLE')
        return {
          done: false,
          refused: error.code,
          next: 'It has been to production, so it is kept. Switch it off instead (archiveProject).',
        }
      throw error
    }
  }
}
```

<!-- /example -->

## Showing a person what an agent asked

When your agent asks for a privileged action, it is answered `403 TOKEN_ACTION_PENDING` with the question a person answers, and the question carries `bodySha256` — the SHA-256 of the request’s body in a canonical form: object keys sorted at every depth, properties whose value is `undefined` left out, arrays in their order, every other value as `JSON.stringify` writes it, and no body at all as `null`. Your server knows the requests it sent, so hash each the same way and you can show the person exactly what they are being asked to confirm (`listPendingActions`, then `confirmPendingAction` or `rejectPendingAction` in their session).

<!-- example: example-body-hash -->

```ts
import type { Schemas } from '@manifest/contract'

/**
 * The platform's canonical form of a request body: object keys sorted at every depth, a
 * property whose value is `undefined` dropped, arrays in their order, every other value as
 * `JSON.stringify` writes it — and no body at all as `null`.
 */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
  return `{${entries.join(',')}}`
}

/**
 * `PendingAction.bodySha256`, computed from a request you sent: the SHA-256 of the body's
 * canonical form, as lower-case hex. WebCrypto, so it runs in a browser as well as a server.
 */
export async function bodySha256(body: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonical(body ?? null))
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Which WAITING question is about a request your agent sent — its method, its path without the
 * query string, and its body's hash — so you can show the person exactly what was asked. An
 * earlier question about the same request may be answered already: skip it.
 */
export function questionAbout(
  questions: Schemas['PendingAction'][],
  method: string,
  path: string,
  hash: string,
): Schemas['PendingAction'] | undefined {
  return questions.find(
    (q) =>
      q.state === 'pending' &&
      q.method === method &&
      q.path === path &&
      q.bodySha256 === hash,
  )
}
```

<!-- /example -->

## Using the generated client from your own repository

`@manifest/contract` is the typed client every example on these pages uses. From outside Manifest’s repository, build it first — `pnpm --filter @manifest/contract build` — and depend on the package directory: its `dist/` holds the compiled client and its types, and type-checks on its own; its source also compiles under `erasableSyntaxOnly`. In a browser the client sends no cookie and no `Origin` itself — the browser does; on a server, give it a delegated token (`createManifestClient({ origin, token })`). **Never give a token to a client in a browser**: there the client sends no credential of its own, so the token is dropped and the request goes out on the person’s own session, with everything the person may do rather than what the token holds. The OpenAPI document it is generated from is `GET /v1/openapi.json`.

## Developing against the mock

`manifest-mock` serves the published contract from fixtures — no platform, no containers, no model — so your site can be built and tested before a platform is running: `pnpm --filter @manifest/mock start` in Manifest’s repository runs it from source on `127.0.0.1:7102` (`MANIFEST_MOCK_PORT` moves it; `0` takes any free port). It refuses what the platform refuses where it can, and these are its rules — including where it cannot be the platform:

- **It trusts exactly one session** — `manifest_session=mock-session`, which its own `/auth/login` sets with no sign-in — **and any Bearer.** Any other session value is `401 UNAUTHENTICATED`, and a Bearer on an operation only a session may call is `403 TOKEN_CREDENTIAL_REFUSED`, as on the platform.
- **It holds one project, `mock-app`, and its ids.** A path naming an id it does not hold is `404 NOT_FOUND`. `mock-app`’s sandbox runs an instance (and keeps an earlier failed one), staging runs one, production none; only the sandbox’s output is readable. Every key’s time counts from the request.
- **It keeps no state.** A rename, a switch-off or a delete answers as the platform would, and the next read answers the fixture again. It plays no step-up and checks no `Origin`.
- **Its refusal states are options**, one per start: `MANIFEST_MOCK_LAUNCHED=1` (`mock-app` has launched, so a delete is refused), `MANIFEST_MOCK_AGENT_BUDGET=exhausted` or `unavailable`, `MANIFEST_MOCK_INTAKE=daily-limit` or `budget-spent`, and `MANIFEST_MOCK_FAIL=1` (a deploy that never becomes ready).

## What the platform does not do for you

- **No notifications.** The project’s event stream (`streamProjectEvents`, or `subscribe` in the client) says what happened; your server subscribes with its token and decides whom to tell, and how.
- **No conversation object.** Keep your own. A commit’s `madeThrough.tokenName` and a session’s `via` name the token an agent used, so a thread keyed to a token’s name can be matched back.
- **No preview inside your page.** A deployed app answers `frame-ancestors 'self'`, so it will not load in a frame on your origin: open it in a tab.
- **Nothing watches a launched app for you yet.** If you need to know that one has stopped answering, check its production address yourself.

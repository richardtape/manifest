import { z } from 'zod/v4'
import type { LiteLlmClient } from '../ai/index.js'
import type { SensitiveField, SpecChange } from '../spec/index.js'

/**
 * Where the summary in a `diff_snapshot` came from, or why there is none (Decision 7).
 * `no-changes` (P6b Task 8): the fixed sentence for an empty diff, which no model wrote —
 * P6a recorded it as `llm`, and its acceptance printed it as "the model's summary".
 * `withheld` (the D5 plan's Task 13, Decision 19): the model answered, and its answer broke
 * the schema or stated a decision, so it is not shown — `summaryWithheldBecause` says which.
 */
export type SummarySource =
  'llm' | 'unavailable' | 'no-previous-release' | 'no-changes' | 'withheld'

/**
 * What the SNAPSHOT records beside the changes (P6b Task 8, Decision 13): the deterministic
 * security notes, the reviewer's verdict at decision time, and D33's coverage limit.
 *
 * **ONLY THE NOTES REACH THE MODEL** (the D5 plan's Decision 19). `review` and `coverage` stay
 * here because the snapshot still stores them, in their own fields, and the console shows them
 * beside the summary — P6b's Decision 13 had the model state the verdict, and every invented
 * verdict it measured came after that instruction.
 */
export interface SummaryContext {
  security: readonly { field: SensitiveField; note: string }[]
  review: { state: string; reviewer: string; detail: string }
  coverage: string
}

/** One change, and the model's sentence about what it could expose. */
export interface Exposure {
  path: string
  sentence: string
}

export interface ChangeSummary {
  /** The sentences joined, in the diff's order — for every reader that wants one string. */
  summary: string | null
  summarySource: SummarySource
  /** What the console lays out, one per change; null unless `summarySource` is `llm`. */
  exposures?: Exposure[] | null
  /** The rule a `withheld` answer broke — never the model's own text. */
  summaryWithheldBecause?: string
}

/** The one sentence an empty diff has, whoever writes it — never a model. */
const NO_CHANGES = 'Nothing in manifest.yaml changed since the last approved release.'

/**
 * THE MODEL DESCRIBES ONE THING; THE RECORD SAYS EVERYTHING ELSE (the D5 plan's Decisions 19
 * and 22, on P6b's F9). Measured 2026-09-24: asked for prose and told to "state the code
 * reviewer's verdict exactly as given", the model invented or misattributed a verdict 6 times
 * in 20; a regex over the prose then withheld 14 good answers in 20. So the model is handed
 * FACTS as JSON and fills a schema with one `exposure` sentence per change — there is no field
 * a verdict could go in. The verdict and the coverage limit are the snapshot's own fields,
 * which the console shows beside this. R4(d) (Rich) is unchanged: the SNAPSHOT surfaces the
 * verdict.
 */
const SYSTEM_PROMPT =
  'You explain configuration changes to a platform administrator. For EACH change in the input, write one ' +
  'plain-English sentence saying what that change could expose: personal information, where data can go, or ' +
  'what the app can reach. Use only the facts in the input. Answer with JSON matching the schema.'

/**
 * §10's catalogue name, and the reason D17's routing question does not arise: the input is
 * a `manifest.yaml` diff — configuration, not personal information — and this model carries
 * `max_classification: confidential`, so nothing here needs a claim about where it goes.
 *
 * A LOGICAL name, never a vendor model id. `ai/errors.ts`'s hint for `AI_MODEL_UNKNOWN`
 * says the same thing to an app, and the platform holds itself to it. **A NON-REASONING
 * name** (Decision 22): Ollama's `think: false` is pinned on it, because reasoning tokens
 * spend `max_tokens` before any JSON appears.
 */
export const SUMMARY_MODEL = 'default-chat-onprem'

/**
 * The answer's shape for THIS diff: exactly one `{ path, exposure }` per change, `path` an
 * enum of the diff's own paths. **ONE DEFINITION IS BOTH THE REQUEST AND THE CHECK**
 * (Decision 22): `z.toJSONSchema` of it is what the model is asked to fill, and `safeParse`
 * of it is what the answer must pass.
 */
export function exposureSchema(changes: readonly SpecChange[]) {
  // `summariseChanges` answers an empty diff before it gets here, so the tuple is never empty.
  const paths = changes.map((c) => c.path) as [string, ...string[]]
  return z.strictObject({
    changes: z
      .array(
        z.strictObject({ path: z.enum(paths), exposure: z.string().min(10).max(300) }),
      )
      .length(paths.length),
  })
}

/**
 * Withheld, not repaired: the answer's own words decided something, which is never the
 * model's to do. NOT "blocked" (F7: it is the word for egress that was denied — "a host that
 * was previously blocked" is a fact), and NOT Markdown, which is stripped once this has passed.
 */
export function checkExposure(sentence: string): string | null {
  return /\b(verdict|approv\w*|reject\w*|decid\w*|decision|recommend\w*)\b/i.test(
    sentence,
  )
    ? 'a sentence states or suggests a decision, a verdict or an approval, which is the administrator’s and the record’s, never the model’s'
    : null
}

/**
 * The request's `json_schema.schema` — `z.toJSONSchema`'s output AS IT IS, `$schema` key
 * included. **Measured before this was written** (the D5 plan's Task 13, Step 1, 2026-09-25,
 * LiteLLM 1.98.0 → Ollama 0.34.4, `qwen3.5:4b`): sent with `$schema`, the answer conformed;
 * and with one field renamed in the schema alone, the model used the new name 3 times in 3 —
 * so the key neither breaks the request nor stops the schema being enforced, and nothing is
 * stripped. If a provider ever refuses it, strip it here and say which one.
 */
function requestSchema(
  schema: ReturnType<typeof exposureSchema>,
): Record<string, unknown> {
  return z.toJSONSchema(schema) as Record<string, unknown>
}

/**
 * THE ANSWER, CHECKED IN ORDER, and the first rule it breaks is the reason. **Never the
 * model's text in the reason**: an app's own words can be in the diff the model read, and a
 * schema issue's MESSAGE can quote what the model wrote (an unrecognised key, say) — so a
 * schema failure names Zod's issue CODE and PATH only, which are the schema's words.
 */
function readExposures(
  changes: readonly SpecChange[],
  text: string,
): { exposures: Exposure[] } | { because: string } {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return { because: 'the answer was not JSON, so it did not match the schema' }
  }
  const parsed = exposureSchema(changes).safeParse(json)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!
    const at = issue.path.length === 0 ? 'the answer' : issue.path.join('.')
    return { because: `the answer did not match the schema (${at}: ${issue.code})` }
  }
  // EACH CHANGE EXACTLY ONCE. The schema says how many and which paths, and cannot say
  // "unique" of objects — so `egress.allow` twice and `auth.attributes` absent passes it.
  const byPath = new Map(parsed.data.changes.map((c) => [c.path, c.exposure]))
  if (byPath.size !== changes.length)
    return {
      because:
        'the answer did not describe each change exactly once, so it did not match the schema',
    }
  for (const sentence of byPath.values()) {
    const broken = checkExposure(sentence)
    if (broken !== null) return { because: broken }
  }
  // SAFE ONLY NOW: a decision word was refused first, so stripping cannot turn
  // `**Verdict:** …` into a verdict that passes.
  return {
    exposures: changes.map((c) => ({
      path: c.path,
      sentence: byPath.get(c.path)!.replace(/[`*]/g, ''),
    })),
  }
}

/**
 * §13's "AI-written plain-English summary of what changed since the last approved release",
 * for the administrator to read at decision time.
 *
 * **A FAILED SUMMARY DOES NOT BLOCK AN APPROVAL** (Decision 7). An approval gate that fails
 * closed on a language model being down is an outage, not a control — and §13's control is
 * the administrator reading the DIFF, which is stored beside this and is not generated by
 * anything. So a failure is recorded as `summary: null` with `summarySource: 'unavailable'`,
 * and the reason goes to the operator.
 *
 * **AN ANSWER THAT BREAKS THE SCHEMA OR DECIDES SOMETHING IS WITHHELD** (the D5 plan's
 * Decision 19): `summary: null`, `summarySource: 'withheld'` and the rule it broke, with one
 * operator line. **A provider that cannot honour `response_format` fails safe the same way**:
 * LiteLLM's `drop_params: true` drops what a provider cannot take, the model answers prose,
 * the parse fails, and the answer is withheld — loud and safe, never a summary nobody
 * constrained.
 *
 * **"ABSENT" IS REACHABLE BECAUSE `ai/client.ts` HAS A 10 s TIMEOUT.** A synchronous call
 * with no timeout would turn a dead gateway into an approval request that never answers,
 * which is the same outage by a longer road.
 */
export async function summariseChanges(
  ai: LiteLlmClient | undefined,
  changes: readonly SpecChange[],
  context: SummaryContext,
): Promise<ChangeSummary> {
  // AN EMPTY DIFF HAS ONE RIGHT ANSWER, and it needs no model — so it is given whether or not
  // one is configured, and recorded as what it is (`no-changes`), never as the model's.
  if (changes.length === 0) return { summary: NO_CHANGES, summarySource: 'no-changes' }
  // MANIFEST_AI_ENABLED=0 is a real configuration (`src/index.ts` builds no client at all),
  // so `ai` can be absent. NOT an error: it is the same "recorded as absent" answer by a
  // different route, and an administrator reads the diff — and the security notes — either way.
  if (ai === undefined) return { summary: null, summarySource: 'unavailable' }
  let text: string | undefined
  try {
    const answer = await ai.post<{ choices: { message: { content: string } }[] }>(
      '/chat/completions',
      {
        model: SUMMARY_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            // FACTS ONLY: each change in the diff's own words, and the platform's security
            // notes. NOT the reviewer's verdict and NOT the coverage sentence — the snapshot
            // carries both in their own fields, and the model is never asked to restate them.
            // NOT `added`/`removed` either: handing them over, with a sentence saying what they
            // mean, was MEASURED over 320 answers and read worse — the removed `sn` reversed 30
            // times against 22 (the authoring API plan's Task 2, F7). Re-measure before adding them.
            content: JSON.stringify({
              changes: changes.map(({ path, from, to, summary }) => ({
                path,
                from,
                to,
                summary,
              })),
              securityNotes: context.security.map(({ field, note }) => ({
                path: field,
                note,
              })),
            }),
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'change_exposures',
            strict: true,
            schema: requestSchema(exposureSchema(changes)),
          },
        },
        // A TRUNCATED ANSWER IS INVALID JSON, so the budget grows with the diff: the flat 200
        // this had for prose would cut a large diff's answer short and withhold it.
        max_tokens: 80 + 90 * changes.length,
      },
    )
    text = answer.choices[0]?.message.content?.trim()
  } catch (error) {
    // NOT SWALLOWED. `.catch(() => undefined)` is this codebase's most productive defect,
    // and a failure with no operator line hides the next one. `AiError`'s message is
    // already mapped and carries no key hash (`ai/client.ts`), and `console.error` rather
    // than `request.log`, which writes nothing under `Fastify({ logger: false })`.
    console.error(
      `[approval] the change summary could not be produced: ${(error as Error).message}`,
    )
    return { summary: null, summarySource: 'unavailable' }
  }
  // AN EMPTY ANSWER IS AN ABSENT ONE, not an empty summary: a blank line in the record
  // would read as "nothing changed" beside a list of changes.
  if (!text) return { summary: null, summarySource: 'unavailable' }
  const read = readExposures(changes, text)
  if ('because' in read) {
    console.error(`[approval] the change summary was withheld: ${read.because}`)
    return {
      summary: null,
      summarySource: 'withheld',
      exposures: null,
      summaryWithheldBecause: read.because,
    }
  }
  return {
    summary: read.exposures.map((e) => e.sentence).join(' '),
    summarySource: 'llm',
    exposures: read.exposures,
  }
}

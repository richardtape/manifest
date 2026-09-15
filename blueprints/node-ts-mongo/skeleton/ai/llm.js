// THE AI COMPONENT. §20: "the blueprint is a security multiplier" — what is here is
// replicated into every application generated from node-ts-mongo@1, so the two
// failures S3 measured are closed ONCE, in code, rather than left as advice in the
// knowledge pack for an agent to follow or not.
//
// BOTH FAILURES ARE SILENT. Neither raises an error, and every other assertion in a
// caller stays green while they happen:
//   1. an embed() without encoding_format 'float' returns 192 near-zero values where
//      768 belong (S3 Evidence 8; reproduced on the toolkit's 0.7.0);
//   2. a `user` that is a PUID, or a bare hash of one, lets one app's exhausted
//      budget refuse the same student in every Manifest app (S3 Evidence 6).
//
// DEFAULT IMPORT, THEN DESTRUCTURE — auth/ubcshib.js's pattern, for the same reason:
// the toolkit is CommonJS, and the default import is the form Node guarantees for
// CommonJS whatever its export-name detection finds.
import toolkit from 'ubc-genai-toolkit-llm'
import { endUserId } from './end-user.js'

const { LLMModule } = toolkit

export { endUserId }

/**
 * §8's AI rows, each read as a literal `process.env.NAME`, in one block — for the
 * reason auth/ubcshib.js gives: §16's drift test reads this file's SOURCE and compares
 * the names it finds against what the platform renders. A `process.env[name]` helper
 * would hide all six from it.
 *
 * Read at import and used at configure, so importing this file is harmless for an app
 * that declared no models — which is why server.js imports it for every app.
 */
const RAW = {
  LLM_PROVIDER: process.env.LLM_PROVIDER,
  LLM_ENDPOINT: process.env.LLM_ENDPOINT,
  LLM_API_KEY: process.env.LLM_API_KEY,
  // §8's "if declared": ABSENT — never empty — for an app with no chat model...
  LLM_DEFAULT_MODEL: process.env.LLM_DEFAULT_MODEL,
  // ...and these two are absent for an app with no embedding model.
  EMBEDDINGS_PROVIDER: process.env.EMBEDDINGS_PROVIDER,
  EMBEDDINGS_MODEL: process.env.EMBEDDINGS_MODEL,
}

/**
 * The platform renders the key for an app whose frozen config declares models and for
 * no other — `renderInjection` refuses a key for an app with none
 * (INJECTION_AI_UNEXPECTED). So its presence is exactly "this app declared models",
 * the same kind of signal SAML_ISSUER is for CWL in server.js.
 */
export const AI_ENABLED = RAW.LLM_API_KEY !== undefined

const DECLARE = 'Declare the models this app uses under ai.models in manifest.yaml'

/** NO FALLBACKS, for auth/ubcshib.js's reason: a default is a fail-open one level up. */
function required(name) {
  const value = RAW[name]
  if (!value) throw new Error(`${name} is required and was not injected (§8). ${DECLARE}.`)
  return value
}

let clients

/**
 * Builds the clients from the injected rows. server.js calls it AT STARTUP for an app
 * the platform gave AI rows, so a missing or partial block fails the container's first
 * boot rather than a person's first question. Idempotent.
 *
 * ONE CLIENT PER MODEL KIND, and that is not tidiness. The toolkit's OpenAI provider
 * refuses to construct without a default model (a ConfigurationError, on 0.7.0), and
 * §8 leaves LLM_DEFAULT_MODEL absent for an embeddings-only app — so a single client
 * built from both kinds would kill that app at boot. §8 also names the embeddings
 * provider separately, and this is where that row is read.
 */
export function configureAi() {
  if (clients) return clients
  const provider = required('LLM_PROVIDER')
  const connection = { apiKey: required('LLM_API_KEY'), endpoint: required('LLM_ENDPOINT') }
  const built = {}
  if (RAW.LLM_DEFAULT_MODEL !== undefined) {
    built.chat = new LLMModule({
      provider,
      ...connection,
      defaultModel: required('LLM_DEFAULT_MODEL'),
    })
  }
  if (RAW.EMBEDDINGS_MODEL !== undefined || RAW.EMBEDDINGS_PROVIDER !== undefined) {
    const model = required('EMBEDDINGS_MODEL')
    built.embeddings = new LLMModule({
      provider: required('EMBEDDINGS_PROVIDER'),
      ...connection,
      // The provider demands a default model and this client never chats, so it is
      // the embedding model — never a chat model guessed on the app's behalf.
      defaultModel: model,
      embeddingModel: model,
    })
  }
  if (!built.chat && !built.embeddings) {
    throw new Error(
      `no model was injected: LLM_DEFAULT_MODEL and EMBEDDINGS_MODEL are both absent (§8). ${DECLARE}.`,
    )
  }
  clients = built
  return clients
}

function chatClient() {
  const { chat } = configureAi()
  if (!chat) {
    // Refused HERE rather than sent: the key is minted for the declared models only,
    // so any request would be a 403 that reads as "not permitted".
    throw new Error(
      'this app has no chat model: LLM_DEFAULT_MODEL was not injected, because ai.models ' +
        'declares none (§8). Add a chat model to ai.models in manifest.yaml.',
    )
  }
  return chat
}

function embeddingClient() {
  const { embeddings } = configureAi()
  if (!embeddings) {
    throw new Error(
      'this app has no embedding model: EMBEDDINGS_MODEL was not injected, because ' +
        'ai.models declares none (§8). Add an embedding model to ai.models in manifest.yaml.',
    )
  }
  return embeddings
}

/** One question, attributed to one person (§10). Resolves to the answer's text. */
export async function ask(question, ubcEduCwlPuid) {
  const response = await chatClient().sendMessage(question, {
    user: endUserId(ubcEduCwlPuid),
  })
  return response.content
}

/**
 * Streamed, for anything a person watches arrive. `onChunk` receives each piece of
 * text; resolves to the toolkit's whole response, whose `content` is all of it.
 *
 * A THINKING model streams ZERO content frames, with no error, at any token budget
 * (S3): `onChunk` is never called and `content` is ''. Treat an empty answer as a
 * failure, not as an answer.
 */
export async function askStreaming(question, ubcEduCwlPuid, onChunk) {
  return chatClient().streamConversation([{ role: 'user', content: question }], onChunk, {
    user: endUserId(ubcEduCwlPuid),
  })
}

/**
 * MANDATORY: encoding_format 'float'.
 *
 * The OpenAI SDK (>= 4.75) defaults it to base64 and decodes the reply with
 * toFloat32Array. LiteLLM's Ollama path ignores the field and returns a plain float
 * list, so 768 floats are read as 768 BYTES and come back as 192 float32s, almost all
 * zero — with no error (S3 Evidence 8).
 *
 * ATTRIBUTED TO ONE PERSON, like `ask`: an embedding made for somebody is spend on their
 * behalf. Until P4b sitting 10 this took no PUID and sent no `user`, and LiteLLM recorded
 * every embedding the proof app made for a student with an EMPTY end_user — charged to
 * the app and to nobody in it. The PUID is REQUIRED, so a call that names nobody throws
 * here, before anything is sent, rather than failing open.
 *
 * Resolves to the vectors: the toolkit's `embed` resolves to an object carrying
 * `embeddings`, `model` and `usage`, not to a bare array.
 */
export async function embed(texts, ubcEduCwlPuid) {
  const response = await embeddingClient().embed(texts, {
    encoding_format: 'float',
    user: endUserId(ubcEduCwlPuid),
  })
  return response.embeddings
}

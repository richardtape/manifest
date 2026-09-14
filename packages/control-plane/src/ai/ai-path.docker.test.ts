import { readFile } from 'node:fs/promises'
import { LLMModule } from 'ubc-genai-toolkit-llm'
import { expect, it } from 'vitest'
import { describeDocker } from '../runtime/testing.js'
import { litellmMasterKey, litellmUrl } from './testing.js'

/**
 * §16's AI-path regression tier. Every assertion here is a finding that PASSED
 * SILENTLY before somebody looked at the number: S3 ran six toolkit checks, all six
 * green, and one of them returned 192 values where 768 belonged.
 *
 * It runs from the HOST, because the toolkit's behaviour is a property of the SDK and
 * not of the network. The network half — can an app container reach LiteLLM, and does
 * the confinement hold from there — is probes 13 and 14 in `s6.docker.test.ts`.
 */
describeDocker('AI-path regression (§16, S3 Evidence 8 and 9)', () => {
  /**
   * The toolkit, configured the way §8's contract configures it in an app —
   * `provider: 'openai'` (there is no `openai-compat`), the LiteLLM endpoint, and
   * LOGICAL model names.
   */
  const makeToolkit = () =>
    new LLMModule({
      provider: 'openai',
      apiKey: litellmMasterKey(),
      endpoint: `${litellmUrl()}/v1`,
      defaultModel: 'default-chat',
      embeddingModel: 'default-embed',
    })

  it('runs against an EXACT toolkit version, recorded here', async () => {
    // C6 and the roadmap: "a caret range would let the contract drift underneath the
    // test that exists to catch drift". The blueprint has no AI half yet, so only the
    // control plane's own devDependency can be checked; Task 10 adds the other side,
    // asserting that the blueprint's pinned dependency names the same version.
    const installed = JSON.parse(
      await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as { devDependencies: Record<string, string> }
    expect(installed.devDependencies['ubc-genai-toolkit-llm']).toBe('0.7.0')
  })

  it('embeds at 768 dimensions WITH encoding_format float, and 192 without', async () => {
    // `embed` returns an EmbeddingResponse — `{ embeddings: number[][], model, … }` —
    // NOT a bare array. Read off ubc-genai-toolkit-llm 0.7.0's own types.d.ts.
    const llm = makeToolkit()
    const good = await llm.embed(['manifest'], { encoding_format: 'float' })
    expect(good.embeddings[0]).toHaveLength(768)
    expect(good.embeddings[0]!.slice(0, 3).every((v) => v === 0)).toBe(false)

    // THE DEFECT, asserted as a defect. The OpenAI SDK >= 4.75 defaults
    // encoding_format to base64 and decodes with toFloat32Array; LiteLLM's Ollama path
    // returns a plain float list; 768 floats coerced to bytes read back as 192
    // near-zero float32s, with no error anywhere. Asserting the WRONG value is what
    // makes the right one meaningful — if this line ever fails, LiteLLM or the SDK
    // changed and the blueprint's obligation may have moved.
    const bad = await llm.embed(['manifest'])
    expect(bad.embeddings[0]).toHaveLength(192)
    expect(bad.embeddings[0]!.slice(0, 3)).toEqual([0, 0, 0])
  })

  it('streams NON-EMPTY content, which a thinking model does not', async () => {
    // S3 Evidence 9: qwen3.5:4b emitted 1677 SSE frames and ZERO content frames at
    // max_tokens 2000. The toolkit reads delta.content only, so the app sees an empty
    // string and no error. `default-chat` is pinned to ministral-3 in
    // infra/litellm/config.yaml for exactly this reason.
    const chunks: string[] = []
    const response = await makeToolkit().streamConversation(
      [{ role: 'user', content: 'Count 1 to 5, digits only.' }],
      (chunk: string) => chunks.push(chunk),
    )
    expect(
      chunks.length,
      'zero content frames — is default-chat a thinking model?',
    ).toBeGreaterThan(0)
    expect(response.content.trim()).not.toBe('')
  })
})

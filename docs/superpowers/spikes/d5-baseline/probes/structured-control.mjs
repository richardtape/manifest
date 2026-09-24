// probes/structured-control.mjs — is it the SCHEMA that shapes structured.mjs's answers, or the prompt?
// (a) the schema's field renamed to `zqx_sentence`, which the prompt never mentions: answers that use
//     it prove LiteLLM forwarded the schema and Ollama enforced it; (b) no response_format at all.
import { readFileSync } from 'node:fs'
const KEY = readFileSync('.env', 'utf8').match(/^LITELLM_MASTER_KEY=(.*)$/m)[1].replace(/^["']|["']$/g, '')
const user = JSON.stringify({ changes: [{ path: 'egress.allow', from: 'none', to: 'leg-a-m15.example.org', summary: 'now allows leg-a-m15.example.org' }] })
const system = 'You explain configuration changes to a platform administrator. For EACH change in the input, write one plain-English sentence saying what that change could expose. Answer with JSON matching the schema.'
const schema = { type: 'object', additionalProperties: false, required: ['changes'], properties: { changes: { type: 'array', minItems: 1, maxItems: 1, items: {
  type: 'object', additionalProperties: false, required: ['path', 'zqx_sentence'], properties: { path: { type: 'string', enum: ['egress.allow'] }, zqx_sentence: { type: 'string' } } } } } }
const ask = async (extra) => (await (await fetch('http://127.0.0.1:7106/chat/completions', { method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
  body: JSON.stringify({ model: 'default-chat-onprem', max_tokens: 300, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], ...extra }) })).json()).choices[0].message.content
for (let i = 1; i <= 3; i++) {
  const t = await ask({ response_format: { type: 'json_schema', json_schema: { name: 'c', strict: true, schema } } })
  console.log(`(a${i}) renamed field in the schema only: uses zqx_sentence=${t.includes('"zqx_sentence"')} uses exposure=${t.includes('"exposure"')} ${JSON.stringify(t).slice(0, 200)}`)
}
for (let i = 1; i <= 3; i++) {
  const t = await ask({})
  let json = false; try { JSON.parse(t); json = true } catch {}
  console.log(`(b${i}) no response_format: parses as JSON=${json} ${JSON.stringify(t).slice(0, 200)}`)
}

// Usage, from the repository root: node docs/superpowers/spikes/authoring-baseline/probes/zod4port.mjs  — [M7], a zod/v4 port of manifest.yaml's shape.
// M4 — would manifest.yaml's schema, written in zod/v4, emit a JSON Schema? A literal port of
// spec/schema.ts's shape (strictObject for .strict(), the same refine), run from the repo root.
import { z } from '../../../../../packages/control-plane/node_modules/zod/v4/index.js'
const QUANTITY = /^\d+(\.\d+)?(Mi|Gi)?$/, AUTH = /^\/[A-Za-z0-9/_-]{1,64}$/
const env = z.strictObject({ name: z.string().regex(/^[A-Z][A-Z0-9_]*$/), value: z.string().optional(), secret: z.boolean().optional() })
  .refine((e) => (e.secret === true) !== (e.value !== undefined), { message: 'value or secret' })
const res = z.strictObject({ cpu: z.number().positive().optional(), memory: z.string().regex(QUANTITY).optional(), pids: z.number().int().positive().optional(), disk: z.string().regex(QUANTITY).optional() })
const m = z.strictObject({
  manifest: z.literal(1), name: z.string().regex(/^[a-z][a-z0-9-]{2,38}$/), blueprint: z.string().regex(/^[a-z][a-z0-9-]*@\d+$/),
  description: z.string().max(500).optional(),
  runtime: z.strictObject({ port: z.number().int().min(1).max(65535), health: z.string().regex(AUTH).default('/healthz'), command: z.string().nullable().default(null), build: z.never().optional() }),
  resources: res.default({}), services: z.array(z.strictObject({ type: z.string().min(1), version: z.string().min(1), name: z.string().regex(/^[a-z][a-z0-9-]{0,30}$/) })).default([]),
  env: z.array(env).default([]),
  integrations: z.array(z.never()).max(0).default([]),
})
const js = z.toJSONSchema(m, { io: 'input', unrepresentable: 'any' })
console.log(JSON.stringify(js).length, 'bytes;', Object.keys(js.properties).join(','))
console.log('runtime.build:', JSON.stringify(js.properties.runtime.properties.build), ' integrations:', JSON.stringify(js.properties.integrations))
try { z.toJSONSchema(m, { io: 'input', unrepresentable: 'throw' }); console.log('throw mode: ok') } catch (e) { console.log('throw mode refuses:', e.message) }

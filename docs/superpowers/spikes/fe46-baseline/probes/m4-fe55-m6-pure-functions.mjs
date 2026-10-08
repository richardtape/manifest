// fe46 [M4] + FE-55 + [M6]'s redactor: pure functions only, from the control plane's dist/ (built
// 2026-10-05 16:00 from source last changed at 4273aed). No database, no network, nothing written.
const D = '/Users/rich/Developer/manifest/packages/control-plane/dist'
const { readFileSync } = await import('node:fs')
const { validateSpec, assertRegisteredAttributes } = await import(`${D}/spec/index.js`)
const { validationContext } = await import(`${D}/api/routes/projects.js`)
const { deriveSpEntity, SpEntityError } = await import(`${D}/sso/entity.js`)
const { toErrorResponse, SpecInvalidError } = await import(`${D}/api/errors.js`)
const { LaunchRecordError } = await import(`${D}/launch/records.js`)
const { makeRedactor } = await import(`${D}/observability/redact.js`)

const starter = readFileSync('/Users/rich/Developer/manifest/blueprints/node-ts-mongo/starters/proof-app/manifest.yaml', 'utf8')
// No ai: block, so the model catalogue is never consulted (modelPolicy's no-model branch).
const base = starter.replace(/\nai:\n[\s\S]*?\nenv:/, '\nenv:')
if (base.includes('\nai:')) throw new Error('ai block not removed')
const withAttrs = (list) => base.replace(/attributes: \[[^\]]*\]/, `attributes: [${list}]`)
const ctx = validationContext('proof-app', {}, { aiEnabled: true, modelCatalogue: [], unclassifiedModels: [] }, 'node-ts-mongo@1')
const show = (label, r) => console.log(label, JSON.stringify(r.valid ? { valid: true, auth: r.spec.auth, warnings: r.warnings } : { valid: false, errors: r.errors }))

console.log('--- [M4] validation never reads a registration: validationContext keys =', Object.keys(ctx).join(','))
show('A  proof-app as shipped (5 attributes):', validateSpec(base, ctx))
show('B  attributes: [ubcEduCwlPuid, sn]       :', validateSpec(withAttrs('ubcEduCwlPuid, sn'), ctx))
show('C  attributes: [ubcEduCwlPuid, cn] (ctl) :', validateSpec(withAttrs('ubcEduCwlPuid, cn'), ctx))
show('D  FE-55: provider cwl, attributes: []   :', validateSpec(withAttrs(''), ctx))

console.log('--- [M4] the build check, given a production registration that holds [ubcEduCwlPuid, mail]')
for (const [label, requested] of [['E  asks [ubcEduCwlPuid, sn]', ['ubcEduCwlPuid', 'sn']], ['F  asks [ubcEduCwlPuid] (ctl)', ['ubcEduCwlPuid']]]) {
  try { assertRegisteredAttributes(requested, ['ubcEduCwlPuid', 'mail'], { slug: 'fe46-probe', ticketRef: 'RITM0000001', changeRequest: null }); console.log(label, '→ passes') }
  catch (e) { console.log(label, '→', e.constructor.name, e.code, '|', e.message, '|', e.hint) }
}

console.log('--- FE-55: the deploy half')
let spErr
try { deriveSpEntity({ slug: 'fe46-probe', environmentKind: 'staging', hostname: 'fe46-probe.staging.manifest.internal', entityBase: 'https://manifest.internal', auth: { provider: 'cwl', attributes: [], callback: '/auth/ubcshib/callback', logout: '/auth/logout' } }); console.log('G  deriveSpEntity → no throw') }
catch (e) { spErr = e; console.log('G  deriveSpEntity →', e.constructor.name, e.code, '|', e.message) }
console.log('H  toErrorResponse(SpEntityError)         →', JSON.stringify(toErrorResponse(spErr)))
console.log('I  ctl toErrorResponse(LaunchRecordError) →', JSON.stringify(toErrorResponse(new LaunchRecordError('LAUNCH_NOT_CWL', 'm', 'h'))))
console.log('J  ctl toErrorResponse(SpecInvalidError)  →', JSON.stringify(toErrorResponse(new SpecInvalidError([{ code: 'X', path: 'auth.attributes', message: 'm' }]))).slice(0, 200))
console.log('   SpEntityError instanceof Error:', spErr instanceof Error, '| SpEntityError === export:', spErr instanceof SpEntityError)

console.log('--- [M6] makeRedactor([]) on an event sentence')
const r = makeRedactor([])
for (const s of [
  'An agent asked to add jane.doe@ubc.ca as a collaborator.',
  'An agent asked to add 5B3F9A2C1D4E6F7A8B9C0D1E2F3A4B5C as a collaborator.',
  'An agent asked to add jdoe42 as a collaborator.',
  'An agent asked to add the person with PUID 12345678ABCD as a collaborator.',
]) console.log(JSON.stringify(s), '→', JSON.stringify(r(s)))

/**
 * `sso/` — the Service Provider registration §9 describes.
 *
 * The identity path was proved end to end first (Task 3), against a hand-written
 * `saml20_sp_remote` row; this module is the code that produces such a row
 * automatically. Every origin in it is derived by Manifest — §9: *"A free-text
 * ACS URL is an assertion-phishing primitive."*
 */
export { SsoError } from './errors.js'
export { ensureSpKeypair, type SpKeypair, type SpKeypairScope } from './keypair.js'

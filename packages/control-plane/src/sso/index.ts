/**
 * `sso/` — the Service Provider registration §9 describes.
 *
 * Deliberately EMPTY at Task 3. The identity path is proved end to end first,
 * against a hand-written `saml20_sp_remote` row, and Tasks 6-9 then build the
 * code that produces such a row automatically. Anything exported before then
 * would be a module with no call site, which is the defect this project has hit
 * three times.
 */
export {}

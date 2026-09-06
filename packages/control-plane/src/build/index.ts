/**
 * §5's `build/`, and P2's Decision 6 discharged: source + spec → a digest, with the
 * gates §12 makes platform-mandatory in front of it.
 *
 * It is a module of its own rather than a function inside `releases/` for one
 * reason — §12 says these gates "are not app-declared and cannot be waived by an
 * app", and a gate living in the module whose job is to serve an app's release
 * request is a gate somebody eventually adds a parameter to.
 */
export { BuildContextError, assembleContext, renderDockerfile } from './context.js'
export type { ContextInput } from './context.js'
export { BuildGateError, requireLockfile, runMandatoryGates, scanForSecrets } from './gates.js'
export type { GateFinding } from './gates.js'

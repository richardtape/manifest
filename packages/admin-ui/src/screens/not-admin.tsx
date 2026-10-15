import type { Schemas } from '@manifest/contract'

/**
 * A SIGNED-IN PERSON WHO IS NOT A PLATFORM ADMINISTRATOR meets a sentence — never a blank page or a
 * screen of `403`s (the plan's Global Constraints). It names them, so a person signed in as the
 * wrong account sees it at once, and says how the role is had: on the host (`scripts/admin-grant.sh`),
 * never from a screen.
 */
export function NotAdmin({ me }: { me: Schemas['Me'] }) {
  return (
    <main className="not-admin">
      <h1>Manifest operations</h1>
      <p>
        This console is for platform administrators. You’re signed in as{' '}
        <strong>{me.displayName}</strong>. An administrator’s role is granted on the host
        — ask the Manifest team if you need it.
      </p>
    </main>
  )
}

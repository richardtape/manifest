import { signIn, signOut } from './auth'

/**
 * Task 4 replaces this with the shell: the header, the nav, the router's switch and the
 * refusal surface, and it is the task that learns WHO is signed in (`getMe`).
 *
 * It calls `signIn` and `signOut` from the first commit because a module with no call site
 * is not built — this project has shipped that defect four times (ORIENTATION §9), and this
 * plan's Global Constraints say every task names its caller. Until Task 4 reads the session,
 * the shell cannot know which of the two applies, so it offers both and says so.
 */
export function App() {
  return (
    <main>
      <h1>Manifest</h1>
      <p>
        The console is not built yet — P5c Task 4 serves the real one here. These two
        buttons are the sign-in endpoints, which are outside the versioned contract by
        D23.8.
      </p>
      <button type="button" onClick={() => signIn()}>
        Sign in with CWL
      </button>
      <button type="button" onClick={() => void signOut()}>
        Sign out
      </button>
    </main>
  )
}

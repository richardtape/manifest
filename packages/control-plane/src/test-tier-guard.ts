/**
 * Launch path plan, Task 2 Step 0: no test tier may reach a real GitHub.
 *
 * `.env` carries the real GitHub App's settings, so a shell that sourced it boots the Docker
 * tier's control planes on driver 2 against the real App, and every case that creates a project
 * would create a real repository (ORIENTATION section 7e measured the boot). The unit and docker
 * projects both run the global setup, which calls this, so one guard covers both. It reads `process.env` as the shell left
 * it and never `.env`: a clean shell is safe by design. Unset URLs mean the config's defaults,
 * which are the fake. It returns the refusal's text, naming the variable and the HOST, never the
 * whole value (a URL can carry userinfo); null means go ahead.
 */
export function realGithubRefusal(env: NodeJS.ProcessEnv): string | null {
  if (env.MANIFEST_SOURCE_DRIVER !== 'github') return null
  for (const name of ['MANIFEST_GITHUB_API_URL', 'MANIFEST_GITHUB_GIT_URL']) {
    const value = env[name]
    if (value === undefined || value === '') continue
    let host: string
    try {
      host = new URL(value).hostname.toLowerCase()
    } catch {
      return refusal(name, 'is not a URL, so it cannot be shown to be the fake')
    }
    const bare = host.replace(/^\[|\]$/g, '')
    const loopback =
      bare === 'localhost' || bare === '::1' || /^127(\.\d{1,3}){3}$/.test(bare)
    if (!loopback) return refusal(name, `points at a real GitHub (${host})`)
  }
  return null
}

function refusal(name: string, what: string): string {
  return (
    `refusing to run: ${name} ${what}. The test tiers use the GitHub fake.\n` +
    'Unset MANIFEST_SOURCE_DRIVER and every MANIFEST_GITHUB_* in this shell (RUNBOOK, "On the real App").'
  )
}

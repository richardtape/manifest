// Who is signed in, said at the top of the page (2026-09-16). The page itself is static;
// this asks the app's own /api/me — the same answer a script reads — and shows the person
// what the IdP released about them, or that nobody is signed in.
//
// textContent only, never innerHTML: every value here came from the IdP, and a name is not
// markup. A separate file rather than an inline script, so a Content-Security-Policy of
// `script-src 'self'` keeps it working. Without JavaScript both links stay visible.
const who = document.getElementById('who')
const signIn = document.getElementById('sign-in')
const signOut = document.getElementById('sign-out')

function show(state, text) {
  who.dataset.state = state
  who.textContent = text
  signIn.hidden = state === 'in'
  signOut.hidden = state !== 'in'
}

fetch('/api/me', { credentials: 'same-origin', headers: { accept: 'application/json' } })
  .then(async (res) => {
    if (res.status === 401) return show('out', 'Not signed in.')
    if (!res.ok) return show('unknown', `Could not tell whether you are signed in (${res.status}).`)
    const me = await res.json()
    const name = me.displayName ?? me.attributes?.ubcEduCwlPuid ?? 'someone'
    const mail = me.attributes?.mail ? ` <${me.attributes.mail}>` : ''
    const role = me.affiliation ? ` — ${me.affiliation}` : ''
    show('in', `Signed in as ${name}${mail}${role}.`)
  })
  .catch(() => show('unknown', 'Could not tell whether you are signed in.'))

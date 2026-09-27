// The board's page: the list, a form, and a reply box under each question.
//
// textContent only, never innerHTML: every title, body and name here was typed by
// a person, and none of it is markup. A separate file rather than an inline script,
// so a Content-Security-Policy of `script-src 'self'` keeps it working.
const who = document.getElementById('who')
const signIn = document.getElementById('sign-in')
const board = document.getElementById('board')
const list = document.getElementById('posts')

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props)
  node.append(...children)
  return node
}

async function send(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `${res.status}`)
}

function when(iso) {
  return new Date(iso).toLocaleString()
}

function render(posts) {
  list.replaceChildren(
    ...posts.map((post) => {
      const replyForm = el(
        'form',
        {},
        el('input', { name: 'body', placeholder: 'Reply', maxLength: 4000, required: true }),
        el('button', { textContent: 'Reply' }),
      )
      replyForm.addEventListener('submit', async (event) => {
        event.preventDefault()
        await send(`/api/posts/${post.id}/replies`, { body: replyForm.elements.body.value })
        load()
      })
      return el(
        'article',
        {},
        el('h2', { textContent: `${post.pinned ? '📌 ' : ''}${post.title}`, className: post.pinned ? 'pinned' : '' }),
        el('p', { textContent: post.body }),
        el('p', { className: 'meta', textContent: `${post.author.name} · ${when(post.createdAt)}` }),
        ...post.replies.map((reply) =>
          el(
            'div',
            { className: `reply${reply.author.instructor ? ' instructor' : ''}` },
            el('p', { textContent: reply.body }),
            el('p', {
              className: 'meta',
              textContent: `${reply.author.name}${reply.author.instructor ? ' (instructor)' : ''} · ${when(reply.createdAt)}`,
            }),
          ),
        ),
        replyForm,
      )
    }),
  )
  if (posts.length === 0) list.replaceChildren(el('p', { textContent: 'No questions yet.' }))
}

async function load() {
  const res = await fetch('/api/posts', { credentials: 'same-origin', headers: { accept: 'application/json' } })
  if (res.ok) render((await res.json()).posts)
}

document.getElementById('ask').addEventListener('submit', async (event) => {
  event.preventDefault()
  const form = event.target
  await send('/api/posts', { title: form.elements.title.value, body: form.elements.body.value })
  form.reset()
  load()
})

fetch('/api/me', { credentials: 'same-origin', headers: { accept: 'application/json' } })
  .then(async (res) => {
    if (res.status === 401) {
      who.textContent = 'Not signed in.'
      return
    }
    if (!res.ok) {
      who.textContent = `Could not tell whether you are signed in (${res.status}).`
      return
    }
    const me = await res.json()
    who.textContent = `Signed in as ${me.name}${me.instructor ? ', an instructor' : ''}.`
    signIn.hidden = true
    board.hidden = false
    load()
  })
  .catch(() => (who.textContent = 'Could not tell whether you are signed in.'))

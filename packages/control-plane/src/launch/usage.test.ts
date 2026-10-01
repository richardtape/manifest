import { describe, expect, it } from 'vitest'
import { findAttributeUses } from './usage.js'

/**
 * WHERE THE APP READS EACH ATTRIBUTE (the launch path plan's Task 10, Decision 14, `[M9]`): the
 * blueprint's bridge hands app code a person's attributes by their friendly names, read as a
 * property — `req.user.user.mail`, `user.givenName`, `me.attributes?.mail`, `user['sn']`. The
 * search is a HINT for a reviewer, never a proof: it finds a property read, and nothing else.
 */
describe('findAttributeUses (Task 10)', () => {
  it('finds a friendly name read as a property, never inside a longer word or the bridge itself', () => {
    const uses = findAttributeUses(
      [
        { path: 'server.js', text: 'const who = req.user.mail\nconst mailbox = 1' },
        // The blueprint's own file: excluded by the caller's list, and not a read in any case.
        { path: 'auth/attributes.js', text: 'mail: …' },
      ],
      ['mail'],
    )
    expect(uses.mail).toEqual([{ path: 'server.js', line: 1 }])
  })

  it('a name in prose or a comment is not a read', () => {
    const uses = findAttributeUses(
      [
        {
          path: 'server.js',
          text: "// we email the user's mail address\nconst to = user.mail",
        },
      ],
      ['mail'],
    )
    expect(uses.mail).toEqual([{ path: 'server.js', line: 2 }])
  })

  it('reads by optional chaining and by bracket, with either quote, and nothing that only starts with the name', () => {
    const uses = findAttributeUses(
      [
        {
          path: 'public/app.js',
          text: [
            "const mail = me.attributes?.mail ? ` <${me.attributes.mail}>` : ''",
            "const last = user['sn']",
            'const first = user["givenName"]',
            'const s = snapshot.snooze + user.snack + user.givenNames',
          ].join('\n'),
        },
      ],
      ['mail', 'sn', 'givenName'],
    )
    expect(uses).toEqual({
      // Two reads on one line are one place to look.
      mail: [{ path: 'public/app.js', line: 1 }],
      sn: [{ path: 'public/app.js', line: 2 }],
      givenName: [{ path: 'public/app.js', line: 3 }],
    })
  })

  it('answers every name asked about — an empty list for one the app never reads — in file then line order', () => {
    const uses = findAttributeUses(
      [
        { path: 'routes/posts.js', text: '\n\nconst id = req.user.user.ubcEduCwlPuid' },
        {
          path: 'server.js',
          text: 'x(user.ubcEduCwlPuid)\n\ny(req.user.user.ubcEduCwlPuid)',
        },
      ],
      ['ubcEduCwlPuid', 'eduPersonAffiliation'],
    )
    expect(uses).toEqual({
      ubcEduCwlPuid: [
        { path: 'routes/posts.js', line: 3 },
        { path: 'server.js', line: 1 },
        { path: 'server.js', line: 3 },
      ],
      eduPersonAffiliation: [],
    })
  })

  it('a CRLF file counts its lines as an LF one does', () => {
    const uses = findAttributeUses(
      [{ path: 'server.js', text: 'a\r\nb\r\nconst m = user.mail\r\n' }],
      ['mail'],
    )
    expect(uses.mail).toEqual([{ path: 'server.js', line: 3 }])
  })
})

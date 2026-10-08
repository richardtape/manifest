import type { Schemas } from '@manifest/contract'

/**
 * WHAT AN AGENT'S QUESTION WOULD DO, IN WORDS (FE-5) — the queue's headline for one question. The
 * platform records what the request would act on (`PendingAction.object`); the summary alone named
 * only the operation, so a person confirming could not see whom they were adding or which release
 * they were sending to production. The console has no DOM tier (P5c Decision 7), so the words are
 * decided here, where a test can hold them.
 */

function person(p: Schemas['NamedPerson']): string {
  // By name only when they are already a member: the platform names nobody else, so a token's
  // question never says who has signed in. Otherwise, exactly as the agent named them.
  if (p.member !== null) return p.member.displayName
  switch (p.namedBy) {
    case 'cwlLogin':
      return `the person whose CWL login is ${p.value}`
    case 'email':
      return `the person whose email is ${p.value}`
    case 'puid':
      return `the person whose PUID is ${p.value}`
    case 'userId':
      return `the person with user id ${p.value}`
  }
}

/** The question as a sentence a person can say yes or no to — or the operation's summary on a question asked before the platform recorded what it acts on. */
export function questionWords(row: Schemas['PendingAction']): string {
  const object = row.object
  if (object === null) return row.summary
  switch (object.kind) {
    case 'member':
      return `Make ${person(object.person)} ${object.role === 'owner' ? 'an owner' : 'a collaborator'} of this project`
    case 'member-removal':
      return `Remove ${person(object.person)} from this project`
    case 'deploy':
      return (
        `Deploy release ${object.release.id.slice(0, 8)}` +
        (object.release.commitSha === null
          ? ''
          : ` (commit ${object.release.commitSha.slice(0, 12)})`) +
        ` to ${object.environment.kind}`
      )
  }
}

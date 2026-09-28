/**
 * THE ENDING PANEL'S WORDS (the front-end enablement plan's Task 13; the whole-branch review's I1). The
 * Project screen's *Ending this app* panel decides here what it tells a person after a delete is
 * refused, so a test can hold the words — the console has no DOM tier (P5c Decision 7).
 */

/**
 * WHAT RESTORE DOES — and the one case it does not: a delete that stopped part way (`500
 * PROJECT_TEARDOWN_INCOMPLETE`) leaves the project archived with something already destroyed, and
 * the `Project` representation cannot tell that archive from an ordinary one after a reload.
 */
export const RESTORE_SENTENCE =
  'Restore brings it back as it was when it was switched off — its code, data and secrets were kept, unless a delete stopped part way, which may already have destroyed some of them: then press Delete again to finish it instead. A restore does not redeploy it — deploy it again to serve.'

/** What to add beside a delete's refusal, by its code — or undefined, when `<Refusal>` says it all. */
export function deleteRefusalAdvice(code: string): string | undefined {
  switch (code) {
    case 'PROJECT_TEARDOWN_INCOMPLETE':
      return 'The delete stopped part way. Press Delete again to finish it — the same request carries on from where it stopped. Do not restore it: a half-deleted project may have lost its code or data.'
    case 'PROJECT_LAUNCHED_NOT_DELETABLE':
      return 'If it launched while the delete was starting, it is now switched off with everything kept — reload this page, and restore it to bring it back.'
    default:
      return undefined
  }
}

/**
 * WHAT THE SIGNED-IN ADMINISTRATOR SAID about why they are changing a project they are not a member
 * of (§26; the faculty-ready plan's Task 10). One value for the page, because the console has one
 * project screen open at a time: the screen sets it as the person types and clears it when it
 * closes, and `api.ts` reads it at each mutation. It authorizes nothing — the platform decides who
 * must give a reason, and refuses `400 ADMIN_REASON_REQUIRED` without one.
 */
let current: string | null = null

export function setAdminReason(reason: string | null): void {
  const trimmed = reason?.trim() ?? ''
  current = trimmed === '' ? null : trimmed
}

export function currentAdminReason(): string | null {
  return current
}

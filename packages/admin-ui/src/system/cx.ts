/** The drawing's `cx`: the truthy class names, joined by a space. */
export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(' ')
}

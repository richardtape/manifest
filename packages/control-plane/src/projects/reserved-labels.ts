import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from 'yaml'
import { SLUG } from '../spec/index.js'

/**
 * §23: labels no project may take as its slug, each with the sentence the slug check
 * gives a person who asked for it. HELD IN ONE PLACE — `infra/reserved-labels/` — and read
 * once at boot (P5a Decision 25). `labels.yaml` is hand-maintained; `ubc-academic.yaml` is
 * generated from UBC's calendars. They have different shapes (P5a *Read this first* 7):
 * `groups: [...]`, and one group at the top level.
 *
 * A defect in the list REFUSES THE BOOT, naming the file: a list the platform half-read
 * reserves half the names, silently.
 */
export class ReservedLabelsError extends Error {
  constructor(
    readonly code:
      | 'RESERVED_LABELS_MISSING'
      | 'RESERVED_LABELS_SHAPE'
      | 'RESERVED_LABEL_INVALID'
      | 'RESERVED_LABEL_DUPLICATE'
      | 'RESERVED_LABEL_UNEXPLAINED',
    message: string,
  ) {
    super(message)
    this.name = 'ReservedLabelsError'
  }
}

export interface ReservedLabel {
  label: string
  group: string
  /** What the label stands for: "UBC Vancouver course subject code CHEM (Chemistry)". */
  standsFor: string
  /** Why its whole group is reserved (§23's table). */
  reason: string
}

export interface ReservedLabels {
  readonly size: number
  readonly groups: readonly string[]
  lookup(label: string): ReservedLabel | undefined
}

interface Group {
  group: string
  reason: string
  labels: Record<string, unknown>
}

function isGroup(value: unknown): value is Group {
  const g = value as Partial<Group> | null
  return (
    typeof g === 'object' &&
    g !== null &&
    typeof g.group === 'string' &&
    typeof g.reason === 'string' &&
    typeof g.labels === 'object' &&
    g.labels !== null &&
    !Array.isArray(g.labels)
  )
}

function groupsIn(document: unknown, file: string): Group[] {
  const groups = (document as { groups?: unknown } | null)?.groups
  if (Array.isArray(groups) && groups.every(isGroup)) return groups
  if (isGroup(document)) return [document]
  throw new ReservedLabelsError(
    'RESERVED_LABELS_SHAPE',
    `${file} is neither \`groups: [{group, reason, labels}]\` nor one \`{group, reason, labels}\` — §23's list cannot be read from it`,
  )
}

export async function loadReservedLabels(dir: string): Promise<ReservedLabels> {
  const files = (await readdir(dir)).filter((name) => name.endsWith('.yaml')).sort()
  if (files.length === 0) {
    throw new ReservedLabelsError(
      'RESERVED_LABELS_MISSING',
      `no .yaml file in ${dir}. §23's reserved labels are held there (MANIFEST_RESERVED_LABELS_DIR); without them any project may take \`idp\` or \`console\`.`,
    )
  }
  const byLabel = new Map<string, ReservedLabel>()
  const groups: string[] = []
  for (const file of files) {
    for (const group of groupsIn(parse(await readFile(join(dir, file), 'utf8')), file)) {
      groups.push(group.group)
      for (const [label, standsFor] of Object.entries(group.labels)) {
        if (!SLUG.test(label)) {
          throw new ReservedLabelsError(
            'RESERVED_LABEL_INVALID',
            `${file}: '${label}' (${group.group}) breaks §7's slug rule, so no project could take it — remove it`,
          )
        }
        if (typeof standsFor !== 'string' || standsFor.trim() === '') {
          throw new ReservedLabelsError(
            'RESERVED_LABEL_UNEXPLAINED',
            `${file}: '${label}' (${group.group}) does not say what it stands for, which is what the slug check tells a person`,
          )
        }
        const prior = byLabel.get(label)
        if (prior !== undefined) {
          throw new ReservedLabelsError(
            'RESERVED_LABEL_DUPLICATE',
            `${file}: '${label}' is in ${group.group} and already in ${prior.group}`,
          )
        }
        byLabel.set(label, {
          label,
          group: group.group,
          standsFor: standsFor.trim(),
          reason: group.reason.trim(),
        })
      }
    }
  }
  return { size: byLabel.size, groups, lookup: (label) => byLabel.get(label) }
}

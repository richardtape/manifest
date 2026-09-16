// Regenerates infra/reserved-labels/ubc-academic.yaml from UBC's own academic calendars.
//
//   node infra/reserved-labels/generate-ubc-academic.mjs
//
// §23 reserves every UBC faculty, school, department and course subject — its name AND its
// abbreviation (`chemistry` and `chem`) — because a hostname like `chem.manifest.apps.ltic.ubc.ca`
// reads as the department's own service, whoever built it. UBC renames and adds units, so the list
// is GENERATED from the calendars rather than typed: re-run this when a unit changes, review the
// diff, and commit it. It needs the network; nothing that serves the platform runs it.
//
// It reads four pages, and FAILS rather than writing a short list when any of them yields less than
// it did when this was written — a page redesign must not silently un-reserve a department.
//
// Node 24's own fetch, no dependencies, deterministic output (sorted, stable wording).
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'ubc-academic.yaml')

const CAMPUSES = [
  {
    campus: 'Vancouver',
    subjects: 'https://vancouver.calendar.ubc.ca/course-descriptions/courses-subject',
    units: 'https://vancouver.calendar.ubc.ca/faculties-colleges-and-schools',
    base: '/faculties-colleges-and-schools/',
    // What the pages yielded on 2026-09-16. A smaller number means the parser no longer reads the page.
    minimum: { subjects: 250, units: 25, departments: 70 },
  },
  {
    campus: 'Okanagan',
    subjects: 'https://okanagan.calendar.ubc.ca/course-descriptions/courses-subject',
    units: 'https://okanagan.calendar.ubc.ca/faculties-schools-and-colleges',
    base: '/faculties-schools-and-colleges/',
    minimum: { subjects: 75, units: 12, departments: 15 },
  },
]

/** Listing pages the calendar puts beside real units. They name no academic unit. */
const NOT_UNITS = new Set(['courses-study-and-degrees', 'courses-study-and-degrees-offered'])
/** Entries under "academic staff" that are offices or lists of people, not units. */
const NOT_DEPARTMENTS = [
  /dean/i,
  /^members$/i,
  /student services/i,
  /staff$/i,
  /associated agencies/i,
]

/** §7's slug rule. A label that cannot be a slug needs no reservation. */
const SLUG = /^[a-z][a-z0-9-]{2,38}$/

const decode = (text) =>
  text
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .trim()

/** "Land & Food Systems" -> land-and-food-systems; "Executive M.B.A." -> executive-mba. */
const slugify = (text) =>
  text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/['’.]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const fetchText = async (url) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) })
  if (!response.ok) throw new Error(`${url} answered ${response.status}`)
  return response.text()
}

const links = (html) =>
  [...html.matchAll(/href="([^"]+)"[^>]*>([^<]+)</g)].map((m) => ({ href: m[1], text: decode(m[2]) }))

/** label -> Set of what it stands for */
const labels = new Map()
const add = (label, meaning) => {
  if (!SLUG.test(label)) return
  if (!labels.has(label)) labels.set(label, new Set())
  labels.get(label).add(meaning)
}

/**
 * "The Faculty of Applied Science" -> names ["Applied Science", "Faculty of Applied Science"];
 * "Indigenous Teacher Education Program (NITEP)" -> the names without the bracket, and the
 * bracketed abbreviation `nitep` beside them.
 */
const unitNames = (title) => {
  const abbreviation = /\(([A-Za-z0-9]{3,})\)\s*$/.exec(title)?.[1]
  const full = title.replace(/^The\s+/i, '').replace(/\s*\([^)]*\)\s*$/, '')
  const bare = full
    .replace(/^.*?\b(Faculty|School|College|Department|Institute|Centre) (of|for)\s+/i, '')
    .replace(/\s+Program$/i, '')
  return { names: bare === full ? [full] : [bare, full], abbreviation }
}

const counts = []
for (const c of CAMPUSES) {
  // Course subjects: "CHEM_V - Chemistry" gives the abbreviation and the name.
  const subjects = links(await fetchText(c.subjects))
    .filter((l) => l.href.includes('/course-descriptions/subject/'))
    .map((l) => /^([A-Z0-9]+)_[VO]\s+-\s+(.+)$/.exec(l.text))
    .filter(Boolean)
  for (const [, code, name] of subjects) {
    add(code.toLowerCase(), `UBC ${c.campus} course subject code ${code} (${name})`)
    add(slugify(name), `UBC ${c.campus} course subject ${name} (${code})`)
  }

  // Faculties, schools and colleges, then the departments and other academic units under them.
  const unitLinks = links(await fetchText(c.units)).filter((l) => l.href.startsWith(c.base))
  const units = new Map()
  const departments = new Map()
  for (const { href, text } of unitLinks) {
    const parts = href.slice(c.base.length).split('/')
    if (parts.length === 1 && parts[0] && !NOT_UNITS.has(parts[0])) units.set(parts[0], text)
    if (parts.length === 3 && parts[1] === 'academic-staff') {
      if (!NOT_DEPARTMENTS.some((pattern) => pattern.test(text))) departments.set(href, text)
    }
  }
  for (const title of [...units.values(), ...departments.values()]) {
    const meaning = `UBC ${c.campus}: ${title.replace(/^The\s+/i, '')}`
    const { names, abbreviation } = unitNames(title)
    for (const name of names) add(slugify(name), meaning)
    if (abbreviation) add(abbreviation.toLowerCase(), meaning)
  }

  const found = { subjects: subjects.length, units: units.size, departments: departments.size }
  for (const [kind, minimum] of Object.entries(c.minimum)) {
    if (found[kind] < minimum) {
      throw new Error(
        `${c.campus}: read ${found[kind]} ${kind}, fewer than the ${minimum} this script was written ` +
          'against — the calendar page changed shape. Fix the parser; do not commit a shorter list.',
      )
    }
  }
  counts.push(`${c.campus}: ${found.subjects} subjects, ${found.units} faculties, schools and colleges, ${found.departments} departments and units`)
}

const today = new Date().toISOString().slice(0, 10)
const lines = [
  '# GENERATED — do not edit by hand.',
  '#',
  '#   node infra/reserved-labels/generate-ubc-academic.mjs',
  '#',
  "# §23's UBC academic group: every faculty, school, college, department and course subject UBC's",
  '# academic calendars list, by name and by abbreviation. Each label says what it stands for, which',
  '# is what the slug check (GET /v1/slugs/{slug}) tells a person who asked for it.',
  '#',
  `# Generated ${today} from:`,
  ...CAMPUSES.flatMap((c) => [`#   ${c.subjects}`, `#   ${c.units}`]),
  ...counts.map((line) => `#   ${line}`),
  '#',
  '# Only labels that satisfy §7\'s slug rule appear: a name too long to be a slug cannot be taken.',
  'group: ubc-academic',
  'reason: >-',
  "  A UBC faculty, school, department or course subject — or its abbreviation. A hostname made of",
  "  one reads as that unit's own official service, whoever built it.",
  'labels:',
  ...[...labels.keys()]
    .sort()
    .map((label) => `  ${label}: ${JSON.stringify([...labels.get(label)].sort().join('; '))}`),
  '',
]
writeFileSync(OUT, lines.join('\n'))
console.log(`wrote ${labels.size} labels to ${OUT}`)
for (const line of counts) console.log(`  ${line}`)

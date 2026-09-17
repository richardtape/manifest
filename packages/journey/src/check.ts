/**
 * The journey's assertions. EVERY check runs and prints `ok` or `FAIL`, and the run
 * exits 1 at the end listing each failure — a red run is a measurement, not the first
 * thing that broke (P4c Decision 26). `must` is the exception: a check whose failure makes
 * every later step meaningless records itself and stops the phase.
 */
export class JourneyStop extends Error {}

export class Checks {
  readonly failures: string[] = []

  step(title: string): void {
    console.log(`\n${title}`)
  }

  ok(name: string, passed: boolean, detail = ''): boolean {
    console.log(
      `  ${passed ? 'ok  ' : 'FAIL'} ${name}${passed || detail === '' ? '' : ` — ${detail.slice(0, 400)}`}`,
    )
    if (!passed) this.failures.push(name)
    return passed
  }

  must<T>(name: string, value: T | undefined | null, detail = ''): T {
    if (!this.ok(name, value !== undefined && value !== null, detail))
      throw new JourneyStop(name)
    return value as T
  }

  finish(): never {
    if (this.failures.length > 0) {
      console.log(`\n${this.failures.length} FAILED:\n  ${this.failures.join('\n  ')}`)
      process.exit(1)
    }
    console.log('\nevery check passed')
    process.exit(0)
  }
}

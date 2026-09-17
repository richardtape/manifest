import { readFileSync, writeFileSync } from 'node:fs'

/**
 * What one phase hands the next, through `scripts/demo-journey.sh`, which runs step 6 in
 * the deployed app between them. A file, not environment variables: bash reads it with
 * `field`, and a phase that crashed leaves what it had.
 */
export interface JourneyState {
  projectId?: string
  projectSlug?: string
  stagingEnvironmentId?: string
  productionEnvironmentId?: string
  appUrl?: string
  buildId?: string
  releaseId?: string
  instanceId?: string
}

export function readState(path: string): JourneyState {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as JourneyState
  } catch {
    return {}
  }
}

export function writeState(path: string, state: JourneyState): void {
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`)
}

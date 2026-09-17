/**
 * The first frame that matches, or undefined once `timeoutMs` has passed. Polls: frames
 * arrive on the socket's callback, into the array the caller handed `subscribe`.
 */
export async function waitFor<T>(
  frames: readonly T[],
  match: (frame: T) => boolean,
  timeoutMs: number,
): Promise<T | undefined> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const found = frames.find(match)
    if (found !== undefined || Date.now() > deadline) return found
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
}

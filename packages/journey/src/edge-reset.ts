/**
 * §11'S RESET, SEEN BY A CLIENT OF THE EDGE (A1 sitting 7's F6; moved here from `capacity.ts` for `make demo-load`,
 * the load rehearsal plan's Task 8a): every route change reloads the edge's whole configuration, and a reload closes
 * the idle keep-alive sockets it held — so a read that reuses one as the reload lands fails `UND_ERR_SOCKET`, whichever
 * app's route moved. A load rehearsal moves staging's route twice (the grant and the take-down), and a demo polls the
 * API through the same edge meanwhile.
 */

/** The socket errors a reset leaves: the edge closed a connection the client was about to use. */
const RESET_CODES = new Set(['UND_ERR_SOCKET', 'ECONNRESET', 'EPIPE'])

export const resetCode = (error: unknown): string | undefined => {
  const code =
    (error as { cause?: { code?: string } }).cause?.code ??
    (error as { code?: string }).code
  return code !== undefined && RESET_CODES.has(code) ? code : undefined
}

/**
 * The client asks a READ again, ONCE, and says so — never a mutation, which is retried only by its caller with its
 * own `Idempotency-Key`. A request loop counts a reset as its own tolerated class instead.
 */
export const resetSafeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const again =
    input instanceof Request && input.method === 'GET' ? input.clone() : undefined
  try {
    return await fetch(input, init)
  } catch (error) {
    const code = resetCode(error)
    if (again === undefined || code === undefined) throw error
    console.log(`  (a read met the edge's reset, ${code}, and was asked again)`)
    return fetch(again, init)
  }
}) as typeof fetch

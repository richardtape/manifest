import { createServer, type Server } from 'node:http'

/**
 * manifest-mock (§5, §16, §21): the published contract served from fixtures, so a front-end
 * developer needs one process rather than nine containers plus a language model.
 *
 * Task 12 fills in the routing table, the fixtures and the scripted stream. It answers 501
 * until then, DELIBERATELY: a mock that answers a plausible 200 to everything is the
 * stand-in that produces a real-looking failure (P4c finding 74).
 */
export function createMockServer(): Server {
  return createServer((request, response) => {
    response.writeHead(501, { 'content-type': 'application/json' })
    response.end(
      JSON.stringify({
        error: {
          code: 'INTERNAL',
          message: `manifest-mock does not serve ${request.method} ${request.url} yet`,
          hint: 'P5c Task 12 fills in the routing table. Until then this server exists to be started, not to be used.',
        },
      }),
    )
  })
}

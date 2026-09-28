import { createMockServer } from './server.js'

const PORT = Number(process.env.MANIFEST_MOCK_PORT ?? 7102)
const server = createMockServer()
server.listen(PORT, '127.0.0.1', () => {
  // The port it actually took — `MANIFEST_MOCK_PORT=0` asks for any free one.
  const { port } = server.address() as { port: number }
  console.log(`manifest-mock on http://127.0.0.1:${port}`)
})

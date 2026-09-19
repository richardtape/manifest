import { createMockServer } from './server.js'

const PORT = Number(process.env.MANIFEST_MOCK_PORT ?? 7102)
createMockServer().listen(PORT, '127.0.0.1', () => {
  console.log(`manifest-mock on http://127.0.0.1:${PORT}`)
})

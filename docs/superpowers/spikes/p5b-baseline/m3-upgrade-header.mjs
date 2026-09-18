const ws = new WebSocket('wss://console.manifest.internal/v1/projects/00000000-0000-0000-0000-000000000000/events', {
  headers: { authorization: 'Bearer mft_probe', origin: 'https://console.manifest.internal' },
})
ws.addEventListener('open', () => { console.log('OPEN'); ws.close() })
ws.addEventListener('error', (e) => console.log('ERROR', String(e.message ?? e)))
ws.addEventListener('close', (e) => console.log('CLOSE', e.code))
setTimeout(() => process.exit(0), 4000)

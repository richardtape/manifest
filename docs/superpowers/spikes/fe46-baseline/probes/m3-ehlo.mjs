// fe46 [M3] step 1: Mailpit's EHLO answer. Sends EHLO and QUIT only — no message.
import net from 'node:net'
const sock = net.connect({ host: '127.0.0.1', port: 7111 })
let buf = '', stage = 0
const t = setTimeout(() => { console.log('TIMEOUT', JSON.stringify(buf)); sock.destroy() }, 5000)
sock.on('data', (d) => {
  buf += d.toString('utf8')
  const lines = buf.split('\r\n')
  const last = lines[lines.length - 2]
  if (!last || /^\d{3}-/.test(last)) return
  console.log(buf.trimEnd().split('\r\n').map((l) => '< ' + l).join('\n'))
  buf = ''
  if (stage === 0) { stage = 1; console.log('> EHLO fe46-probe'); sock.write('EHLO fe46-probe\r\n') }
  else if (stage === 1) { stage = 2; console.log('> QUIT'); sock.write('QUIT\r\n') }
  else { clearTimeout(t); sock.end() }
})
sock.on('error', (e) => { console.log('ERROR', e.code); clearTimeout(t) })

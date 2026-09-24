// Minimal debug: single command test
const net = require('net')
const IP = process.argv[2] || '192.168.1.58'
const PORT = parseInt(process.argv[3]) || 4001
const TIMEOUT = 5000

const client = new net.Socket()
let buffer = Buffer.alloc(0)
let done = false

// Take the command as the 4th argument
const CMD = process.argv[4] || 'BD01A'
const frame = Buffer.from('!' + CMD + '\r\n\x03')

console.log(`\nTX → : ${frame.toString('hex').match(/../g).join(' ')} | "${CMD}"\n`)

const timer = setTimeout(() => {
  if (!done) {
    console.log(`[TIMEOUT after ${TIMEOUT}ms]`)
    console.log(`Received ${buffer.length} bytes:`)
    console.log(buffer.toString('hex').match(/../g)?.join(' '))
    console.log('ASCII:', JSON.stringify(buffer.toString('ascii')))
    client.destroy()
    process.exit(1)
  }
}, TIMEOUT)

client.connect(PORT, IP, () => {
  client.write(frame)
})

client.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk])
  const hex = chunk.toString('hex').match(/../g)?.join(' ') || '(empty)'
  const ascii = chunk.toString('ascii').replace(/[^\x20-\x7E]/g, '.')
  console.log(`[+${chunk.length}] hex: ${hex}`)
  console.log(`     ascii: "${ascii}"`)
})

client.on('end', () => {
  done = true
  clearTimeout(timer)
  console.log(`\n[CONNECTION CLOSED] Total ${buffer.length} bytes`)
  console.log('Full hex:', buffer.toString('hex').match(/../g)?.join(' '))
  process.exit(0)
})

client.on('error', (err) => {
  console.error('Socket error:', err.message)
  process.exit(1)
})

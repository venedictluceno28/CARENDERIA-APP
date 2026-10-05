/* global Buffer, WebSocket, console, fetch, process, setTimeout */
import { writeFileSync } from 'node:fs'

const [baseUrl = 'http://127.0.0.1:5191', port = '9361', screenshotPath] =
  process.argv.slice(2)
const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))

for (let attempt = 0; attempt < 60; attempt += 1) {
  try {
    if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break
  } catch {
    // Chrome is still starting.
  }
  await sleep(250)
}

const target = await (
  await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, {
    method: 'PUT',
  })
).json()
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})
let sequence = 0
const pending = new Map()
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data)
  const callback = pending.get(message.id)
  if (!callback) return
  pending.delete(message.id)
  if (message.error) callback.reject(new Error(message.error.message))
  else callback.resolve(message.result)
})
function command(method, params = {}) {
  const id = ++sequence
  socket.send(JSON.stringify({ id, method, params }))
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
}
async function evaluate(expression) {
  const result = await command('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  if (result.exceptionDetails)
    throw new Error(
      result.exceptionDetails.exception?.description ||
        result.exceptionDetails.text,
    )
  return result.result.value
}
async function waitFor(expression, timeout = 30_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeout) {
    if (await evaluate(expression)) return
    await sleep(200)
  }
  const diagnostic = await evaluate(`({
    path: location.pathname,
    alerts: [...document.querySelectorAll('[role="alert"]')].map((node) => node.textContent.trim()),
    heading: document.querySelector('h1')?.textContent,
  })`)
  throw new Error(
    `Timed out waiting for ${expression}: ${JSON.stringify(diagnostic)}`,
  )
}
async function clickButton(text) {
  await evaluate(`(() => {
    const button = [...document.querySelectorAll('button')]
      .find((node) => node.textContent.trim().toLowerCase() === ${JSON.stringify(text.toLowerCase())})
      ?? [...document.querySelectorAll('button')]
        .find((node) => node.textContent.trim().toLowerCase().includes(${JSON.stringify(text.toLowerCase())}))
    if (!button) throw new Error('Button not found: ${text}')
    button.click()
  })()`)
}
async function setField(selector, value) {
  await evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)})
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value').set
    Reflect.apply(setter, element, [${JSON.stringify(value)}])
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
  })()`)
}
async function selectFakePng(fileName) {
  await evaluate(`(() => {
    const binary = atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=')
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    const file = new File([bytes], ${JSON.stringify(fileName)}, { type: 'image/png' })
    const transfer = new DataTransfer()
    transfer.items.add(file)
    const input = document.querySelector('input[type="file"]')
    Object.defineProperty(input, 'files', { configurable: true, value: transfer.files })
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })()`)
}

await command('Page.enable')
await command('Runtime.enable')
await command('Emulation.setDeviceMetricsOverride', {
  width: 390,
  height: 900,
  deviceScaleFactor: 1,
  mobile: true,
})
await command('Page.navigate', { url: baseUrl })
await waitFor(`Boolean(document.querySelector('[aria-label^="Add "]'))`)
await evaluate(`document.querySelector('[aria-label^="Add "]').click()`)
await waitFor(`Boolean(document.querySelector('[aria-label^="Open cart, 1"]'))`)
await evaluate(`document.querySelector('[aria-label^="Open cart"]').click()`)
await clickButton('Proceed to order')
await waitFor(`Boolean(document.querySelector('#customer-name'))`)
await setField('#customer-name', 'Phase Twenty Three Fake Customer')
await setField(
  '#exact-address',
  'Block 23 Lot 23 Fake Test Street, Local Validation Only',
)
await evaluate(
  `document.querySelector('input[value="Marycris Complex"]').click()`,
)
await evaluate(
  `document.querySelector('input[value="ONLINE_PAYMENT"]').click()`,
)
await waitFor(
  `document.querySelector('.review-details')?.textContent.includes('Phase Twenty Three Fake Customer')`,
)
await clickButton('Complete order')
await waitFor(`location.pathname.startsWith('/order/receipt/')`, 45_000)
await waitFor(`document.body.textContent.includes('Order placed')`, 20_000)
await clickButton('Message admin')
await waitFor(`document.querySelector('#message-draft') !== null`)
await waitFor(`document.body.textContent.includes('Not Verified')`)
await waitFor(`document.body.textContent.includes('No messages yet')`)
const emptyStateSeen = await evaluate(
  `document.body.textContent.includes('No messages yet')`,
)

const longText =
  'Hello store. This is a clearly fake local message with a long reference https://example.invalid/testing/a-very-long-safe-url-that-must-wrap-without-horizontal-overflow.'
await setField('#message-draft', longText)
await clickButton('Send')
await waitFor(`document.body.textContent.includes(${JSON.stringify(longText)})`)
await waitFor(
  `[...document.querySelectorAll('button')].some((node) => node.textContent.trim() === 'Payment receipt' && !node.disabled)`,
)

await clickButton('Payment receipt')
await selectFakePng('fake-payment-receipt.png')
await waitFor(`document.body.textContent.includes('fake-payment-receipt.png')`)
await waitFor(
  `[...document.querySelectorAll('button')].some((node) => node.textContent.trim() === 'Send' && !node.disabled)`,
)
await clickButton('Send')
await waitFor(
  `document.body.textContent.includes('Payment receipt sent securely')`,
  45_000,
)
await waitFor(
  `[...document.querySelectorAll('button')].some((node) => node.textContent.trim() === 'Photo' && !node.disabled)`,
)

await clickButton('Photo')
await selectFakePng('fake-chat-photo.png')
await setField('#message-draft', 'Fake ordinary chat image')
await waitFor(
  `[...document.querySelectorAll('button')].some((node) => node.textContent.trim() === 'Send' && !node.disabled)`,
)
await clickButton('Send')
await waitFor(
  `Boolean(document.querySelector('img.message-attachment'))`,
  45_000,
)

await evaluate(`document.querySelector('.message-reactions button').click()`)
await waitFor(`document.body.textContent.includes('You reacted')`)

const widths = []
for (const width of [320, 360, 390, 430, 1440]) {
  await command('Emulation.setDeviceMetricsOverride', {
    width,
    height: 1100,
    deviceScaleFactor: 1,
    mobile: width < 600,
  })
  await sleep(150)
  widths.push(
    await evaluate(`({
      width: ${width},
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    })`),
  )
}
await command('Emulation.setDeviceMetricsOverride', {
  width: 320,
  height: 1200,
  deviceScaleFactor: 1,
  mobile: true,
})
await evaluate(`document.documentElement.style.fontSize = '22px'`)
await sleep(150)
const extraLarge = await evaluate(`({
  clientWidth: document.documentElement.clientWidth,
  scrollWidth: document.documentElement.scrollWidth,
})`)
if (screenshotPath) {
  const screenshot = await command('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  })
  writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'))
}

await command('Page.reload', { ignoreCache: true })
await waitFor(`document.querySelector('#message-draft') !== null`, 30_000)
await waitFor(`document.body.textContent.includes(${JSON.stringify(longText)})`)
await waitFor(
  `Boolean(document.querySelector('img.message-attachment'))`,
  30_000,
)
const result = await evaluate(`(() => {
  const records = JSON.parse(localStorage.getItem('carenderia.guest-orders.v1') ?? '[]')
  const orderCode = location.pathname.split('/')[3]
  return {
    orderCode,
    emptyStateSeen: ${emptyStateSeen},
    sessionHasCredential: records.some((record) =>
      record.orderCode === orderCode && typeof record.guestToken === 'string' && record.guestToken.length === 43
    ),
    textRestored: document.body.textContent.includes(${JSON.stringify(longText)}),
    paymentEvidenceVisible: document.body.textContent.includes('Payment receipt sent securely'),
    privateChatImageVisible: Boolean(document.querySelector('img.message-attachment')),
    paymentStillNotVerified: document.body.textContent.includes('Not Verified'),
    reactionVisible: document.body.textContent.includes('You reacted'),
    tokenInUrl: location.href.includes('guestToken'),
  }
})()`)
console.log(JSON.stringify({ result, widths, extraLarge }))
socket.close()

/* global Blob, FormData, WebSocket, atob, console, fetch, process, setTimeout */
import assert from 'node:assert/strict'

const [baseUrl = 'http://127.0.0.1:5196', port = '9576'] = process.argv.slice(2)
const password = process.env.PHASE29_TEST_PASSWORD
const anonKey = process.env.PHASE29_ANON_KEY
const supabaseUrl = process.env.PHASE29_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const orderCode = 'CRD-P29ABCDEFH'
const orderId = '99500000-0000-4000-8000-000000000001'
const guestToken = process.env.PHASE29_GUEST_TOKEN
if (!password || !anonKey || !guestToken)
  throw new Error('Missing transient Phase 2.9 validation credentials.')

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))

async function guestJson(action, extra = {}) {
  const response = await fetch(`${supabaseUrl}/functions/v1/guest-access`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderCode, guestToken, action, ...extra }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok)
    throw new Error(`Guest ${action} failed: ${JSON.stringify(payload)}`)
  return payload
}

async function uploadGuestImage(purpose, caption) {
  const bytes = Uint8Array.from(
    atob(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    ),
    (character) => character.charCodeAt(0),
  )
  const form = new FormData()
  form.set('orderCode', orderCode)
  form.set('guestToken', guestToken)
  form.set('purpose', purpose)
  form.set('text', caption)
  form.set('file', new Blob([bytes], { type: 'image/png' }), 'phase29-fake.png')
  const response = await fetch(`${supabaseUrl}/functions/v1/guest-access`, {
    method: 'POST',
    headers: { apikey: anonKey },
    body: form,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok)
    throw new Error(`Guest upload failed: ${JSON.stringify(payload)}`)
  return payload
}

await guestJson('send_message', {
  text: 'Phase 2.9 customer asks whether the payment receipt is clear.',
})
await uploadGuestImage('PAYMENT_EVIDENCE', 'Phase 2.9 fake payment receipt')
await uploadGuestImage('CHAT_IMAGE', 'Phase 2.9 fake ordinary image')

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
async function waitFor(expression, timeout = 35_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeout) {
    if (await evaluate(expression)) return
    await sleep(200)
  }
  const diagnostic = await evaluate(`({
    path: location.pathname,
    alerts: [...document.querySelectorAll('[role="alert"]')].map((node) => node.textContent.trim()),
    text: document.body.textContent.slice(0, 2200)
  })`)
  throw new Error(
    `Timed out waiting for ${expression}: ${JSON.stringify(diagnostic)}`,
  )
}
async function navigate(path) {
  await command('Page.navigate', { url: `${baseUrl}${path}` })
}
async function clickButton(text, root = 'document') {
  await evaluate(`(() => {
    const scope = ${root}
    const target = [...scope.querySelectorAll('button')].find((node) =>
      node.textContent.trim().toLowerCase() === ${JSON.stringify(text.toLowerCase())}
    ) ?? [...scope.querySelectorAll('button')].find((node) =>
      node.textContent.trim().toLowerCase().includes(${JSON.stringify(text.toLowerCase())})
    )
    if (!target) throw new Error('Button not found: ${text}')
    target.click()
  })()`)
}
async function setField(selector, value) {
  await evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)})
    if (!element) throw new Error('Field not found: ${selector}')
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value').set
    Reflect.apply(setter, element, [${JSON.stringify(value)}])
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
  })()`)
}

await command('Page.enable')
await command('Runtime.enable')
await command('Emulation.setDeviceMetricsOverride', {
  width: 390,
  height: 1100,
  deviceScaleFactor: 1,
  mobile: true,
})
await navigate('/admin/messages')
await waitFor(`Boolean(document.querySelector('#admin-email'))`)
assert.equal(await evaluate(`location.pathname`), '/admin/login')
await setField('#admin-email', 'phase29-admin@example.test')
await setField('#admin-password', password)
await clickButton('Log in')
await waitFor(`location.pathname === '/admin'`)
await waitFor(`document.body.textContent.includes('MESSAGE')`)
await clickButton('MESSAGE')
await waitFor(`location.pathname === '/admin/messages'`)
await command('Page.reload')
await waitFor(
  `document.querySelector('input[placeholder="e.g. Maria or CRD-1042"]') !== null`,
)

await setField('input[placeholder="e.g. Maria or CRD-1042"]', 'CRD-P29ABCDEFH')
await waitFor(`document.querySelectorAll('.conversation-card').length === 1`)
await evaluate(`document.querySelector('.conversation-card').click()`)
await waitFor(`location.pathname === '/admin/messages/${orderId}'`)
await waitFor(
  `document.body.textContent.includes('Phase 2.9 customer asks whether the payment receipt is clear.')`,
)
await waitFor(`document.body.textContent.includes('PAYMENT RECEIPT')`)
await waitFor(
  `document.body.textContent.includes('Phase 2.9 fake ordinary image')`,
)
assert.equal(await evaluate(`location.href.includes('guestToken')`), false)

await evaluate(
  `document.querySelector('button[aria-label="Open private customer image"]').click()`,
)
await waitFor(
  `Boolean(document.querySelector('dialog[open] img.admin-private-image'))`,
)
await evaluate(
  `document.querySelector('dialog[open] button[aria-label="Close dialog"]').click()`,
)
await waitFor(`!document.querySelector('dialog[open]')`)
await evaluate(
  `document.querySelector('button[aria-label="Open private payment receipt"]').click()`,
)
await waitFor(
  `Boolean(document.querySelector('dialog[open] img.admin-private-image'))`,
)
await evaluate(
  `document.querySelector('dialog[open] button[aria-label="Close dialog"]').click()`,
)
await waitFor(`!document.querySelector('dialog[open]')`)

await clickButton('Send reply')
assert.equal(await evaluate(`document.querySelector('#admin-reply').value`), '')
await setField('#admin-reply', 'Phase 2.9 admin reply received by customer.')
await clickButton('Send reply')
await waitFor(`document.body.textContent.includes('Reply sent.')`)
await waitFor(
  `document.body.textContent.includes('Phase 2.9 admin reply received by customer.')`,
)
const customerHistory = await guestJson('list_messages', { limit: 50 })
assert.ok(
  customerHistory.messages.some(
    (message) =>
      message.sender_type === 'ADMIN' &&
      message.text === 'Phase 2.9 admin reply received by customer.',
  ),
)

await clickButton('Mark Verified')
await waitFor(
  `document.body.textContent.includes('Payment marked as Verified.')`,
)
assert.equal(
  (await guestJson('receipt')).payment_verification_state,
  'VERIFIED',
)
await evaluate(`window.confirm = () => true`)
await clickButton('Mark Not Verified')
await waitFor(
  `document.body.textContent.includes('Payment returned to Not Verified.')`,
)
assert.equal(
  (await guestJson('receipt')).payment_verification_state,
  'NOT_VERIFIED',
)

await clickButton('View order')
await waitFor(`location.pathname === '/admin/orders'`)
await waitFor(
  `document.querySelector('dialog[open]')?.textContent.includes('CRD-P29ABCDEFH')`,
)

await navigate('/admin/messages')
await waitFor(`document.querySelector('.conversation-list') !== null`)
await clickButton('Chat expired')
await setField(
  'input[placeholder="e.g. Maria or CRD-1042"]',
  'Expired Customer',
)
await waitFor(`document.querySelectorAll('.conversation-card').length === 1`)
await evaluate(`document.querySelector('.conversation-card').click()`)
await waitFor(
  `document.body.textContent.includes('Retained expired customer history')`,
)
await waitFor(
  `document.body.textContent.includes('Customer messaging expired')`,
)

await navigate('/admin/messages')
await waitFor(`document.querySelector('.conversation-list') !== null`)
await setField('input[placeholder="e.g. Maria or CRD-1042"]', 'Cash Customer')
await waitFor(`document.querySelectorAll('.conversation-card').length === 1`)
await evaluate(`document.querySelector('.conversation-card').click()`)
await waitFor(
  `document.body.textContent.includes('Cash conversation without verification controls')`,
)
assert.equal(
  await evaluate(`document.body.textContent.includes('Mark Verified')`),
  false,
)

for (const width of [320, 360, 390, 430, 1440]) {
  await command('Emulation.setDeviceMetricsOverride', {
    width,
    height: 1100,
    deviceScaleFactor: 1,
    mobile: width < 600,
  })
  await sleep(100)
  assert.equal(
    await evaluate(
      `document.documentElement.scrollWidth <= document.documentElement.clientWidth`,
    ),
    true,
  )
}
await command('Emulation.setDeviceMetricsOverride', {
  width: 320,
  height: 1100,
  deviceScaleFactor: 1,
  mobile: true,
})
await evaluate(`document.documentElement.dataset.fontSize = 'extra-large'`)
assert.equal(
  await evaluate(
    `document.documentElement.scrollWidth <= document.documentElement.clientWidth`,
  ),
  true,
)
await clickButton('Back')
await waitFor(`location.pathname === '/admin/messages'`)
await waitFor(`document.body.textContent.includes('Order-linked inbox')`)
await clickButton('Back')
await waitFor(`location.pathname === '/admin'`)

console.log(
  JSON.stringify({
    routeRefresh: 'passed',
    inboxSearchFilters: 'passed',
    customerAdminReply: 'passed',
    privateImages: 'passed',
    paymentVerificationReversal: 'passed',
    expiredHistory: 'passed',
    cashControls: 'passed',
    viewOrder: 'passed',
    responsiveWidths: [320, 360, 390, 430, 1440],
    extraLarge320: 'passed',
  }),
)
socket.close()

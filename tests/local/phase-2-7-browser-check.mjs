/* global Buffer, WebSocket, console, fetch, process, setTimeout */
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'

const [baseUrl = 'http://127.0.0.1:5192', port = '9574', screenshotPath] =
  process.argv.slice(2)
const password = process.env.PHASE27_TEST_PASSWORD
const anonKey = process.env.PHASE27_ANON_KEY
const supabaseUrl = process.env.PHASE27_SUPABASE_URL ?? 'http://127.0.0.1:54321'
if (!password || !anonKey)
  throw new Error('Missing transient test password or local anonymous key.')
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
async function waitFor(expression, timeout = 35_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeout) {
    if (await evaluate(expression)) return
    await sleep(200)
  }
  const diagnostic = await evaluate(`({
    path: location.pathname,
    alerts: [...document.querySelectorAll('[role="alert"]')].map((node) => node.textContent.trim()),
    text: document.body.textContent.slice(0, 1800),
    fields: [...document.querySelectorAll('input, select, textarea')].map((node) => ({ id: node.id, value: node.value, checked: node.checked })),
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
    const button = [...scope.querySelectorAll('button')].find((node) =>
      node.textContent.trim().toLowerCase() === ${JSON.stringify(text.toLowerCase())}
    ) ?? [...scope.querySelectorAll('button')].find((node) =>
      node.textContent.trim().toLowerCase().includes(${JSON.stringify(text.toLowerCase())})
    )
    if (!button) throw new Error('Button not found: ${text}')
    button.click()
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
async function activeOrderCount() {
  return evaluate(`Number([...document.querySelectorAll('.orders-summary')]
    .find((node) => node.textContent.includes('Active orders'))?.querySelector('strong')?.textContent)`)
}
async function readOrder(orderCode, token) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/orders?order_code=eq.${encodeURIComponent(orderCode)}&select=id,source,published_menu_id,guest_access_token_hash,guest_chat_expires_at,customer_name,payment_method,payment_verification_state,is_cancelled,original_snapshot`,
    { headers: { apikey: anonKey, Authorization: `Bearer ${token}` } },
  )
  if (!response.ok)
    throw new Error(`Order audit failed: ${await response.text()}`)
  return (await response.json())[0]
}

await command('Page.enable')
await command('Runtime.enable')
await command('Emulation.setDeviceMetricsOverride', {
  width: 390,
  height: 1100,
  deviceScaleFactor: 1,
  mobile: true,
})
await navigate('/admin/manual-order')
await waitFor(
  `Boolean(document.querySelector('#admin-email, #manual-customer-name'))`,
)
if (await evaluate(`Boolean(document.querySelector('#admin-email'))`)) {
  await setField('#admin-email', 'phase27-admin@example.test')
  await setField('#admin-password', password)
  await clickButton('Log in')
  await waitFor(`location.pathname === '/admin'`)
} else {
  await navigate('/admin')
}
await waitFor(`document.body.textContent.includes('MANUAL ORDER')`)
await clickButton('MANUAL ORDER')
await waitFor(`location.pathname === '/admin/manual-order'`)
await waitFor(
  `document.body.textContent.includes('Quick add from ULAM PHOTOS')`,
)

await setField('#manual-customer-name', 'Phase 2.7 Cash Customer')
await setField('#manual-exact-address', '27 Test Street, Marycris Complex')
await setField('#manual-delivery-area', 'Marycris Complex')
await setField('#manual-item-0-name', 'Phase 2.7 Custom Rice')
await setField('#manual-item-0-category', 'EXTRAS')
await setField('#manual-item-0-quantity', '1')
await setField('#manual-item-0-price', '80')
await setField('#manual-item-0-df', '5')
await setField('input[placeholder="Search food"]', 'Phase 2.7 Fake Adobo')
await waitFor(`document.querySelectorAll('.manual-catalog-item').length === 1`)
await clickButton('Add')
await waitFor(`Boolean(document.querySelector('#manual-item-1-name'))`)
await waitFor(
  `document.body.textContent.includes('Estimated grand total') && document.body.textContent.includes('₱180')`,
)
await clickButton('Save order')
await waitFor(`document.body.textContent.includes('Order created')`, 45_000)
const cashCode = await evaluate(
  `document.querySelector('.manual-order-success h1').textContent.trim()`,
)
assert.match(cashCode, /^[A-Z0-9-]{4,32}$/u)

const token = await evaluate(`(() => {
  for (const value of Object.values(localStorage)) {
    try {
      const parsed = JSON.parse(value)
      if (parsed?.access_token) return parsed.access_token
      if (parsed?.currentSession?.access_token) return parsed.currentSession.access_token
    } catch {}
  }
  return null
})()`)
assert.ok(token)
const beforeEdit = await readOrder(cashCode, token)
assert.equal(beforeEdit.source, 'MANUAL')
assert.equal(beforeEdit.published_menu_id, null)
assert.equal(beforeEdit.guest_access_token_hash, null)
assert.equal(beforeEdit.guest_chat_expires_at, null)
assert.equal(beforeEdit.payment_verification_state, null)

await clickButton('View in Today’s Orders')
await waitFor(`location.pathname === '/admin/orders'`)
await waitFor(
  `Boolean(document.querySelector('input[placeholder="e.g. Maria or DV-1042"]'))`,
)
await setField('input[placeholder="e.g. Maria or DV-1042"]', cashCode)
await waitFor(`document.querySelectorAll('.admin-order-card').length === 1`)
const activeBeforeCancel = await activeOrderCount()
await evaluate(`document.querySelector('.admin-order-card').click()`)
await waitFor(
  `document.querySelector('dialog[open]')?.textContent.includes('Phase 2.7 Custom Rice')`,
)
await waitFor(
  `document.querySelector('dialog[open]')?.textContent.includes('Manual order')`,
)
await clickButton('Edit order', `document.querySelector('dialog[open]')`)
await setField('#edit-customer', 'Phase 2.7 Cash Customer Edited')
await clickButton(
  'Save trusted changes',
  `document.querySelector('dialog[open]')`,
)
await waitFor(
  `document.querySelector('dialog[open]')?.textContent.includes('Order changes saved')`,
)
const afterEdit = await readOrder(cashCode, token)
assert.equal(afterEdit.customer_name, 'Phase 2.7 Cash Customer Edited')
assert.deepEqual(afterEdit.original_snapshot, beforeEdit.original_snapshot)

await clickButton('Cancel order', `document.querySelector('dialog[open]')`)
await setField('#cancellation-reason', 'Phase 2.7 browser validation')
await clickButton('Confirm', `document.querySelector('[role="alertdialog"]')`)
await waitFor(
  `document.querySelector('dialog[open]')?.textContent.includes('Order cancelled')`,
)
await waitFor(`Number([...document.querySelectorAll('.orders-summary')]
  .find((node) => node.textContent.includes('Active orders'))?.querySelector('strong')?.textContent) === ${activeBeforeCancel - 1}`)
await clickButton('Restore order', `document.querySelector('dialog[open]')`)
await clickButton('Confirm', `document.querySelector('[role="alertdialog"]')`)
await waitFor(
  `document.querySelector('dialog[open]')?.textContent.includes('Order restored')`,
)
await waitFor(`Number([...document.querySelectorAll('.orders-summary')]
  .find((node) => node.textContent.includes('Active orders'))?.querySelector('strong')?.textContent) === ${activeBeforeCancel}`)

await navigate('/admin/manual-order')
await waitFor(`Boolean(document.querySelector('#manual-customer-name'))`)
await setField('#manual-customer-name', 'Phase 2.7 Online Customer')
await setField('#manual-exact-address', 'Outside test address')
await setField('#manual-delivery-area', 'OUTSIDE')
await setField('#manual-item-0-name', 'Phase 2.7 Online Item')
await setField('#manual-item-0-category', 'DESSERTS')
await setField('#manual-item-0-quantity', '1')
await setField('#manual-item-0-price', '50')
await setField('#manual-item-0-df', '20')
await evaluate(
  `document.querySelector('input[value="ONLINE_PAYMENT"]').click()`,
)
await waitFor(
  `document.body.textContent.includes('Estimated grand total') && document.body.textContent.includes('₱70')`,
)
await clickButton('Save order')
await waitFor(
  `document.body.textContent.includes('Online Payment · Not Verified')`,
  45_000,
)
const onlineCode = await evaluate(
  `document.querySelector('.manual-order-success h1').textContent.trim()`,
)
await clickButton('View in Today’s Orders')
await waitFor(`location.pathname === '/admin/orders'`)
await waitFor(
  `Boolean(document.querySelector('input[placeholder="e.g. Maria or DV-1042"]'))`,
)
await setField('input[placeholder="e.g. Maria or DV-1042"]', onlineCode)
await waitFor(`document.querySelectorAll('.admin-order-card').length === 1`)
await evaluate(`document.querySelector('.admin-order-card').click()`)
await waitFor(
  `document.querySelector('dialog[open]')?.textContent.includes('Not verified')`,
)
await clickButton('Verify payment', `document.querySelector('dialog[open]')`)
await clickButton('Confirm', `document.querySelector('[role="alertdialog"]')`)
await waitFor(
  `document.querySelector('dialog[open]')?.textContent.includes('marked as verified')`,
)
const onlineOrder = await readOrder(onlineCode, token)
assert.equal(onlineOrder.payment_verification_state, 'VERIFIED')

await navigate('/admin/manual-order')
await waitFor(`Boolean(document.querySelector('#manual-customer-name'))`)
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
    await evaluate(
      `({ width: ${width}, clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth })`,
    ),
  )
}
await command('Emulation.setDeviceMetricsOverride', {
  width: 320,
  height: 1200,
  deviceScaleFactor: 1,
  mobile: true,
})
await evaluate(`document.documentElement.dataset.fontSize = 'extra-large'`)
await sleep(150)
const extraLarge = await evaluate(
  `({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth })`,
)
if (screenshotPath) {
  const screenshot = await command('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  })
  writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'))
}
const hasOverflow = [...widths, extraLarge].some(
  ({ clientWidth, scrollWidth }) => scrollWidth > clientWidth,
)
assert.equal(hasOverflow, false)
assert.equal(
  await evaluate(`location.href.toLowerCase().includes('token')`),
  false,
)
console.log(
  JSON.stringify({
    cashCode,
    onlineCode,
    originalSnapshotPreserved: true,
    cancellationAndRestore: true,
    onlineVerification: true,
    widths,
    extraLarge,
  }),
)
socket.close()

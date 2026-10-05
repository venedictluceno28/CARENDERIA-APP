/* global WebSocket, console, fetch, process, setTimeout */
import assert from 'node:assert/strict'

const [baseUrl = 'http://127.0.0.1:5193', port = '9575'] = process.argv.slice(2)
const password = process.env.PHASE28_TEST_PASSWORD
const anonKey = process.env.PHASE28_ANON_KEY
const supabaseUrl = process.env.PHASE28_SUPABASE_URL ?? 'http://127.0.0.1:54321'
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
    text: document.body.textContent.slice(0, 1800)
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
async function sessionToken() {
  return evaluate(`(() => {
    for (const value of Object.values(localStorage)) {
      try {
        const parsed = JSON.parse(value)
        if (parsed?.access_token) return parsed.access_token
        if (parsed?.currentSession?.access_token) return parsed.currentSession.access_token
      } catch {}
    }
    return null
  })()`)
}
async function readLatestOrder(token) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/orders?customer_name=eq.Phase%202.8%20Order%20Override&select=id,customer_name,exact_address,original_snapshot&order=created_at.desc&limit=1`,
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
await navigate('/admin/address-book')
await waitFor(`Boolean(document.querySelector('#admin-email'))`)
assert.equal(await evaluate(`location.pathname`), '/admin/login')
await setField('#admin-email', 'phase28-admin@example.test')
await setField('#admin-password', password)
await clickButton('Log in')
await waitFor(`location.pathname === '/admin'`)
await waitFor(`document.body.textContent.includes('ADDRESS BOOK')`)
await clickButton('ADDRESS BOOK')
await waitFor(`location.pathname === '/admin/address-book'`)
await waitFor(`document.body.textContent.includes('No saved addresses yet')`)
await command('Page.reload')
await waitFor(`location.pathname === '/admin/address-book'`)
await waitFor(`document.body.textContent.includes('No saved addresses yet')`)

await clickButton('Add address')
await waitFor(`Boolean(document.querySelector('#address-book-customer-name'))`)
await clickButton('Save address', `document.querySelector('dialog[open]')`)
await waitFor(
  `document.querySelector('dialog[open]')?.textContent.includes('Enter the customer name.')`,
)
await setField('#address-book-customer-name', 'Phase 2.8 Fake Customer')
await setField(
  '#address-book-exact-address',
  'Unit 28, Very Long Synthetic Address, Marycris Complex',
)
await clickButton('Save address', `document.querySelector('dialog[open]')`)
await waitFor(`document.body.textContent.includes('was added to Address Book')`)

await setField('input[placeholder="Type a name or street"]', 'fake customer')
await waitFor(`document.querySelectorAll('.address-book-card').length === 1`)
await setField('input[placeholder="Type a name or street"]', 'marycris')
await waitFor(`document.querySelectorAll('.address-book-card').length === 1`)
await clickButton('Edit', `document.querySelector('.address-book-card')`)
await setField(
  '#address-book-exact-address',
  '28 Snapshot Street, Wellington Place',
)
await clickButton('Save address', `document.querySelector('dialog[open]')`)
await waitFor(`document.body.textContent.includes('was updated successfully')`)

await navigate('/admin/manual-order')
await waitFor(`Boolean(document.querySelector('#manual-customer-name'))`)
await clickButton('Use saved address')
await waitFor(
  `document.querySelector('dialog[open]')?.textContent.includes('Phase 2.8 Fake Customer')`,
)
await evaluate(
  `document.querySelector('dialog[open] .address-picker__entry').click()`,
)
await waitFor(
  `document.querySelector('#manual-customer-name').value === 'Phase 2.8 Fake Customer'`,
)
assert.equal(
  await evaluate(`document.querySelector('#manual-exact-address').value`),
  '28 Snapshot Street, Wellington Place',
)
await setField('#manual-customer-name', 'Phase 2.8 Order Override')
await setField('#manual-delivery-area', 'Wellington Place')
await setField('#manual-item-0-name', 'Phase 2.8 Fake Meal')
await setField('#manual-item-0-category', 'ULAM')
await setField('#manual-item-0-quantity', '1')
await setField('#manual-item-0-price', '85')
await setField('#manual-item-0-df', '10')
await clickButton('Save order')
await waitFor(`document.body.textContent.includes('Order created')`, 45_000)
const token = await sessionToken()
assert.ok(token)
const beforeAddressEdit = await readLatestOrder(token)
assert.equal(beforeAddressEdit.customer_name, 'Phase 2.8 Order Override')
assert.equal(
  beforeAddressEdit.exact_address,
  '28 Snapshot Street, Wellington Place',
)

await navigate('/admin/address-book')
await waitFor(`document.querySelectorAll('.address-book-card').length === 1`)
await clickButton('Edit', `document.querySelector('.address-book-card')`)
await setField('#address-book-exact-address', 'Changed After Order Street')
await clickButton('Save address', `document.querySelector('dialog[open]')`)
await waitFor(`document.body.textContent.includes('was updated successfully')`)
const afterAddressEdit = await readLatestOrder(token)
assert.deepEqual(afterAddressEdit, beforeAddressEdit)

await clickButton('Archive', `document.querySelector('.address-book-card')`)
await clickButton('Archive', `document.querySelector('dialog[open]')`)
await waitFor(`document.body.textContent.includes('was archived')`)
await clickButton('Archived')
await waitFor(
  `document.querySelectorAll('.address-book-card--archived').length === 1`,
)
await clickButton('Restore', `document.querySelector('.address-book-card')`)
await clickButton('Restore', `document.querySelector('dialog[open]')`)
await waitFor(`document.body.textContent.includes('was restored')`)

for (const width of [320, 360, 390, 430, 1440]) {
  await command('Emulation.setDeviceMetricsOverride', {
    width,
    height: 1100,
    deviceScaleFactor: 1,
    mobile: width < 600,
  })
  await navigate('/admin/address-book')
  await waitFor(`document.body.textContent.includes('ADDRESS BOOK')`)
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
await waitFor(`location.pathname === '/admin'`)
await evaluate(`document.querySelector('button[aria-label="Log out"]').click()`)
await waitFor(`location.pathname === '/admin/login'`)

console.log(
  JSON.stringify({
    routeRefreshLogout: 'passed',
    createEditSearch: 'passed',
    manualAutofill: 'passed',
    snapshotIndependence: 'passed',
    archiveRestore: 'passed',
    responsiveWidths: [320, 360, 390, 430, 1440],
    extraLarge320: 'passed',
  }),
)
socket.close()

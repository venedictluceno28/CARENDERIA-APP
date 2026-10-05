/* global WebSocket, console, fetch, process, setTimeout */

const [baseUrl = 'http://192.168.18.8:5173', port = '9674', mode = 'verify'] =
  process.argv.slice(2)
const password = process.env.MOBILE_ADMIN_TEST_PASSWORD
if (!password) throw new Error('Missing transient mobile-admin test password.')
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
const exceptions = []
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data)
  if (message.method === 'Runtime.exceptionThrown') {
    exceptions.push(
      message.params.exceptionDetails.exception?.description ??
        message.params.exceptionDetails.text,
    )
    return
  }
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
    try {
      if (await evaluate(expression)) return
    } catch {
      // Navigation can briefly replace the document between polls.
    }
    await sleep(200)
  }
  const diagnostic = await evaluate(`({
    path: location.pathname,
    body: document.body.textContent.trim().slice(0, 800),
    openDialogs: document.querySelectorAll('dialog[open]').length,
    buttons: [...document.querySelectorAll('button')].map((node) => node.textContent.trim()).filter(Boolean).slice(0, 20),
  })`)
  throw new Error(
    `Timed out waiting for ${expression}: ${JSON.stringify({ diagnostic, exceptions })}`,
  )
}
async function navigate(path) {
  await command('Page.navigate', { url: `${baseUrl}${path}` })
}
async function clickButton(text) {
  await evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find((node) =>
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
  })()`)
}
async function selectFile(type, name) {
  await evaluate(`(() => {
    const input = document.querySelector('#catalog-photo')
    const file = new File([new Uint8Array([1, 2, 3, 4])], ${JSON.stringify(name)}, {
      type: ${JSON.stringify(type)},
    })
    const transfer = new DataTransfer()
    transfer.items.add(file)
    Object.defineProperty(input, 'files', { configurable: true, value: transfer.files })
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })()`)
  await waitFor(
    `document.querySelector('.catalog-photo-preview img')?.src.startsWith('blob:')`,
  )
}
async function selectValidPng() {
  await evaluate(`(() => {
    const binary = atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=')
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    const file = new File([bytes], 'mobile-stability-valid.png', { type: 'image/png' })
    const transfer = new DataTransfer()
    transfer.items.add(file)
    const input = document.querySelector('#catalog-photo')
    Object.defineProperty(input, 'files', { configurable: true, value: transfer.files })
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })()`)
  await waitFor(
    `document.querySelector('.catalog-photo-preview img')?.src.startsWith('blob:')`,
  )
}
async function assertNoOverflow(width, extraLarge = false) {
  await command('Emulation.setDeviceMetricsOverride', {
    width,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: width < 600,
  })
  await evaluate(
    `document.documentElement.dataset.fontSize = ${JSON.stringify(extraLarge ? 'extra-large' : 'normal')}`,
  )
  await sleep(120)
  const dimensions = await evaluate(
    `({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth })`,
  )
  if (dimensions.scrollWidth > dimensions.clientWidth)
    throw new Error(
      `Horizontal overflow at ${width}px${extraLarge ? ' with Extra Large text' : ''}: ${JSON.stringify(dimensions)}`,
    )
  return { width, extraLarge, ...dimensions }
}

await command('Page.enable')
await command('Runtime.enable')
await command('Emulation.setDeviceMetricsOverride', {
  width: 390,
  height: 900,
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

exceptions.length = 0
await clickButton('MANUAL ORDER')
await sleep(1_000)
const manualOrder = await evaluate(`({
  path: location.pathname,
  body: document.body.textContent.trim().slice(0, 400),
  hasForm: Boolean(document.querySelector('#manual-customer-name')),
  secureContext: window.isSecureContext,
  randomUuidType: typeof crypto.randomUUID,
})`)
const manualExceptions = [...exceptions]

await navigate('/admin/catalog')
await waitFor(`document.body.textContent.includes('ULAM PHOTOS')`)
exceptions.length = 0
await clickButton('Add food')
await sleep(1_000)
const catalog = await evaluate(`({
  path: location.pathname,
  body: document.body.textContent.trim().slice(0, 400),
  hasForm: Boolean(document.querySelector('#catalog-name')),
  secureContext: window.isSecureContext,
  randomUuidType: typeof crypto.randomUUID,
})`)
const catalogExceptions = [...exceptions]

if (mode === 'diagnose') {
  console.log(
    JSON.stringify({
      manualOrder,
      manualExceptions,
      catalog,
      catalogExceptions,
    }),
  )
  socket.close()
  process.exit(0)
}

if (
  !manualOrder.hasForm ||
  !catalog.hasForm ||
  manualExceptions.length ||
  catalogExceptions.length
)
  throw new Error(
    `Mobile stability assertions failed: ${JSON.stringify({ manualOrder, manualExceptions, catalog, catalogExceptions })}`,
  )

await evaluate(`(() => {
  window.__mobileStabilityRevokedUrls = []
  const original = URL.revokeObjectURL.bind(URL)
  URL.revokeObjectURL = (url) => {
    window.__mobileStabilityRevokedUrls.push(url)
    original(url)
  }
})()`)
for (const [type, name] of [
  ['image/jpeg', 'mobile-test.jpg'],
  ['image/png', 'mobile-test.png'],
  ['image/webp', 'mobile-test.webp'],
]) {
  await selectFile(type, name)
}
await waitFor(`window.__mobileStabilityRevokedUrls.length >= 2`)
const previewCleanupCount = await evaluate(
  `window.__mobileStabilityRevokedUrls.length`,
)
const previewBeforeCancel = await evaluate(
  `document.querySelector('.catalog-photo-preview img').src`,
)
await evaluate(`(() => {
  const input = document.querySelector('#catalog-photo')
  const transfer = new DataTransfer()
  Object.defineProperty(input, 'files', { configurable: true, value: transfer.files })
  input.dispatchEvent(new Event('change', { bubbles: true }))
})()`)
await sleep(100)
const cancelledPickerStable = await evaluate(`(() => ({
  preview: document.querySelector('.catalog-photo-preview img')?.src,
  hasError: [...document.querySelectorAll('.field__error')].some((node) => node.textContent.includes('Choose')),
}))()`)
if (
  cancelledPickerStable.preview !== previewBeforeCancel ||
  cancelledPickerStable.hasError
)
  throw new Error(
    `Cancelled picker changed the form: ${JSON.stringify(cancelledPickerStable)}`,
  )
await setField('#catalog-name', 'Mobile Stability Fake Food')
await setField('#catalog-price', '85')
await setField('#catalog-internal-df', '10')

const responsive = []
for (const width of [320, 360, 390, 430, 1440]) {
  responsive.push(await assertNoOverflow(width))
}
responsive.push(await assertNoOverflow(320, true))
await selectValidPng()
await clickButton('Save food')
await waitFor(
  `document.body.textContent.includes('Mobile Stability Fake Food was added')`,
  60_000,
)
await evaluate(`document.querySelector('.catalog-page-heading button').click()`)
await waitFor(`Boolean(document.querySelector('#catalog-name'))`)
await clickButton('Discard')
await waitFor(`!document.querySelector('dialog[open]')`)

for (const route of [
  '/admin/orders',
  '/admin/catalog',
  '/admin/menu',
  '/admin/manual-order',
]) {
  await navigate(route)
  await waitFor(`Boolean(document.querySelector('.admin-back-button'))`)
  await clickButton('Back')
  await waitFor(`location.pathname === '/admin'`)
  await waitFor(`document.body.textContent.includes('Quick actions')`)
  if (await evaluate(`Boolean(document.querySelector('.admin-back-button'))`))
    throw new Error('The admin dashboard rendered a redundant Back button.')
}

await navigate('/admin/manual-order')
await waitFor(`Boolean(document.querySelector('#manual-customer-name'))`)
await command('Page.reload')
await sleep(500)
await waitFor(`Boolean(document.querySelector('#manual-customer-name'))`)
await waitFor(
  `Boolean(document.querySelector('input[placeholder="Search food"]'))`,
)
await setField('input[placeholder="Search food"]', 'no catalog match expected')
await waitFor(`document.body.textContent.includes('No matching catalog food')`)
await clickButton('Add custom item')
await clickButton('Add custom item')
await waitFor(`document.querySelectorAll('.manual-item-card').length === 3`)
await evaluate(
  `document.querySelector('button[aria-label="Remove item 2"]').click()`,
)
await waitFor(`document.querySelectorAll('.manual-item-card').length === 2`)
responsive.push(await assertNoOverflow(320, true))

const stabilityExceptions = [...exceptions]
if (stabilityExceptions.length)
  throw new Error(
    `Unexpected mobile runtime exceptions: ${JSON.stringify(stabilityExceptions)}`,
  )

await evaluate(`document.querySelector('button[aria-label="Log out"]').click()`)
await waitFor(`location.pathname === '/admin/login'`)
await navigate('/admin/manual-order')
await waitFor(`location.pathname === '/admin/login'`)

exceptions.length = 0
await navigate('/__error-boundary')
await waitFor(`document.body.textContent.includes('Something went wrong')`)
const safeFallback = await evaluate(`({
  hasStack: document.body.textContent.includes('DevelopmentRenderFailure'),
  hasRecovery: document.body.textContent.includes('Back to admin'),
})`)
if (safeFallback.hasStack || !safeFallback.hasRecovery)
  throw new Error(`Unsafe render fallback: ${JSON.stringify(safeFallback)}`)

console.log(
  JSON.stringify({
    manualOrder,
    catalog,
    catalogSaved: true,
    cancelledPickerStable: true,
    previewCleanupCount,
    backRoutes: 4,
    directRefresh: true,
    unauthenticatedRedirect: true,
    safeFallback: true,
    responsive,
  }),
)
socket.close()

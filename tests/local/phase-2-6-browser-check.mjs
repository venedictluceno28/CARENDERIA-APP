/* global Buffer, WebSocket, console, fetch, process, setTimeout */
import { writeFileSync } from 'node:fs'

const [baseUrl = 'http://127.0.0.1:5192', port = '9474', screenshotPath] =
  process.argv.slice(2)
const testPassword = process.env.PHASE26_TEST_PASSWORD
if (!testPassword) throw new Error('Missing transient test password.')
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
    text: document.body.textContent.slice(0, 900),
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
async function clickCard(name) {
  await evaluate(`(() => {
    const card = [...document.querySelectorAll('.menu-selection-card')].find((node) =>
      node.textContent.includes(${JSON.stringify(name)})
    )
    if (!card) throw new Error('Selection card not found: ${name}')
    card.click()
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
async function selectFakePng(selector, fileName) {
  await evaluate(`(() => {
    const binary = atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=')
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    const file = new File([bytes], ${JSON.stringify(fileName)}, { type: 'image/png' })
    const transfer = new DataTransfer()
    transfer.items.add(file)
    const input = document.querySelector(${JSON.stringify(selector)})
    Object.defineProperty(input, 'files', { configurable: true, value: transfer.files })
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })()`)
}

await command('Page.enable')
await command('Runtime.enable')
await command('Emulation.setDeviceMetricsOverride', {
  width: 390,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: true,
})
await navigate('/admin/menu')
await waitFor(`Boolean(document.querySelector('#admin-email'))`)
await setField('#admin-email', 'phase26-admin@example.test')
await setField('#admin-password', testPassword)
await clickButton('Log in')
await waitFor(`location.pathname === '/admin'`)
await waitFor(`document.body.textContent.includes('ULAM POST')`)
await clickButton('ULAM POST')
await waitFor(`location.pathname === '/admin/menu'`)
await waitFor(`document.body.textContent.includes('No active menu')`)
await waitFor(`document.querySelectorAll('.menu-selection-card').length === 3`)
if (
  await evaluate(
    `document.body.textContent.includes('Phase 2.6 Archived Fake')`,
  )
)
  throw new Error('Archived catalog item was selectable.')

await clickCard('Phase 2.6 Fake Adobo')
await clickCard('Phase 2.6 Fake Flan')
await clickCard('Phase 2.6 Fake Rice')
await selectFakePng('#menu-image', 'phase-2-6-fake-menu.png')
await clickButton('Publish menu')
await waitFor(
  `document.body.textContent.includes('Today’s menu was published')`,
  60_000,
)
await waitFor(`document.body.textContent.includes('Today’s menu is live')`)
await waitFor(`document.querySelectorAll('.published-menu-card').length === 3`)

await clickButton('Customer preview')
await waitFor(
  `document.querySelector('dialog[open]')?.textContent.includes('Phase 2.6 Fake Adobo')`,
)
const previewSafe = await evaluate(`(() => {
  const text = document.querySelector('dialog[open]').textContent
  return text.includes('₱85') && text.includes('Available') && !text.includes('Internal DF')
})()`)
if (!previewSafe)
  throw new Error(
    'Customer preview leaked internal data or missed public values.',
  )
await evaluate(`document.querySelector('dialog[open]').close()`)

await navigate('/')
await waitFor(`document.body.textContent.includes('Phase 2.6 Fake Adobo')`)
if (await evaluate(`document.body.textContent.includes('Internal DF')`))
  throw new Error('Customer page leaked Internal DF.')
await clickButton('Add to cart')
await waitFor(`document.body.textContent.includes('1')`)

await navigate('/admin/menu')
await waitFor(`document.body.textContent.includes('Today’s menu is live')`)
await evaluate(`(() => {
  const card = [...document.querySelectorAll('.published-menu-card')].find((node) =>
    node.textContent.includes('Phase 2.6 Fake Adobo'))
  const button = [...card.querySelectorAll('button')].find((node) => node.textContent.includes('Mark sold out'))
  button.click()
})()`)
await waitFor(`document.body.textContent.includes('now SOLD OUT')`)
await navigate('/')
await waitFor(`document.body.textContent.includes('Sold out')`)

await navigate('/admin/menu')
await waitFor(`document.body.textContent.includes('Today’s menu is live')`)
await evaluate(`(() => {
  const card = [...document.querySelectorAll('.published-menu-card')].find((node) =>
    node.textContent.includes('Phase 2.6 Fake Adobo'))
  const button = [...card.querySelectorAll('button')].find((node) => node.textContent.includes('Mark available'))
  button.click()
})()`)
await waitFor(`document.body.textContent.includes('available again')`)

await navigate('/admin/catalog')
await waitFor(
  `document.querySelector('h1')?.textContent.includes('ULAM PHOTOS')`,
)
await setField('input[placeholder="Search food"]', 'Phase 2.6 Fake Adobo')
await waitFor(
  `document.querySelector('.catalog-card h2')?.textContent.includes('Fake Adobo')`,
)
await clickButton('Edit')
await waitFor(`Boolean(document.querySelector('#catalog-price'))`)
await setField('#catalog-price', '99')
await clickButton('Save food')
await waitFor(
  `document.body.textContent.includes('was updated successfully')`,
  45_000,
)

await navigate('/admin/menu')
await waitFor(`document.body.textContent.includes('Today’s menu is live')`)
const snapshotStable = await evaluate(`(() => {
  const card = [...document.querySelectorAll('.published-menu-card')].find((node) =>
    node.textContent.includes('Phase 2.6 Fake Adobo'))
  return card.textContent.includes('₱85') && !card.textContent.includes('₱99')
})()`)
if (!snapshotStable)
  throw new Error('Published price did not remain snapshotted.')

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

await clickButton('Deactivate menu')
await waitFor(
  `document.querySelector('dialog[open]')?.textContent.includes('Deactivate today')`,
)
await clickButton('Deactivate menu', `document.querySelector('dialog[open]')`)
await waitFor(`document.body.textContent.includes('No active menu')`, 30_000)
await navigate('/')
await waitFor(
  `document.body.textContent.includes('No menu is available right now')`,
)

const hasOverflow = [...widths, extraLarge].some(
  ({ clientWidth, scrollWidth }) => scrollWidth > clientWidth,
)
const result = {
  published: true,
  previewSafe,
  customerInternalDfHidden: true,
  customerCartAdd: true,
  soldOutRoundTrip: true,
  snapshotStable,
  deactivated: true,
  tokenInUrl: await evaluate(`location.href.toLowerCase().includes('token')`),
  hasOverflow,
}
if (Object.values(result).some((value, index) => (index < 7 ? !value : value)))
  throw new Error(
    `Browser assertions failed: ${JSON.stringify({ result, widths, extraLarge })}`,
  )
console.log(JSON.stringify({ result, widths, extraLarge }))
socket.close()

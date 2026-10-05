/* global Buffer, WebSocket, console, fetch, process, setTimeout */
import { writeFileSync } from 'node:fs'

const [baseUrl = 'http://127.0.0.1:5192', port = '9362', screenshotPath] =
  process.argv.slice(2)
const testPassword = process.env.PHASE25_TEST_PASSWORD
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
async function waitFor(expression, timeout = 30_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeout) {
    if (await evaluate(expression)) return
    await sleep(200)
  }
  const diagnostic = await evaluate(`({
    path: location.pathname,
    alerts: [...document.querySelectorAll('[role="alert"]')].map((node) => node.textContent.trim()),
    text: document.body.textContent.slice(0, 600),
  })`)
  throw new Error(
    `Timed out waiting for ${expression}: ${JSON.stringify(diagnostic)}`,
  )
}
async function clickButton(text) {
  await evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find((node) =>
      node.textContent.trim().toLowerCase() === ${JSON.stringify(text.toLowerCase())}
    ) ?? [...document.querySelectorAll('button')].find((node) =>
      node.textContent.trim().toLowerCase().includes(${JSON.stringify(text.toLowerCase())})
    )
    if (!button) throw new Error('Button not found: ${text}')
    button.click()
  })()`)
}
async function clickDialogButton(text) {
  await evaluate(`(() => {
    const button = [...document.querySelectorAll('dialog[open] button')].find((node) =>
      node.textContent.trim().toLowerCase() === ${JSON.stringify(text.toLowerCase())}
    )
    if (!button) throw new Error('Dialog button not found: ${text}')
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
async function selectFakePng(fileName) {
  await evaluate(`(() => {
    const binary = atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=')
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    const file = new File([bytes], ${JSON.stringify(fileName)}, { type: 'image/png' })
    const transfer = new DataTransfer()
    transfer.items.add(file)
    const input = document.querySelector('#catalog-photo')
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
await command('Page.navigate', { url: `${baseUrl}/admin/catalog` })
await waitFor(`Boolean(document.querySelector('#admin-email'))`)
await setField('#admin-email', 'phase25-admin@example.test')
await setField('#admin-password', testPassword)
await clickButton('Log in')
await waitFor(`location.pathname === '/admin'`, 30_000)
await waitFor(`document.body.textContent.includes('ULAM PHOTOS')`)
await clickButton('ULAM PHOTOS')
await waitFor(`location.pathname === '/admin/catalog'`, 30_000)
await waitFor(
  `document.querySelector('h1')?.textContent.includes('ULAM PHOTOS')`,
)
await clickButton('Add food')
await waitFor(`Boolean(document.querySelector('#catalog-name'))`)
await selectFakePng('phase-2-5-fake-adobo.png')
await setField('#catalog-name', 'Phase 2.5 Fake Adobo')
await setField('#catalog-price', '85')
await setField('#catalog-internal-df', '10')
await clickButton('Save food')
await waitFor(
  `document.body.textContent.includes('was added to ULAM PHOTOS')`,
  45_000,
)
await setField('input[placeholder="Search food"]', 'fake adobo')
await waitFor(
  `document.querySelector('.catalog-card h2')?.textContent.includes('Fake Adobo')`,
)
await clickButton('Edit')
await setField('#catalog-name', 'Phase 2.5 Fake Caldereta Long Name')
await setField('#catalog-price', '95.50')
await setField('#catalog-internal-df', '12')
await selectFakePng('phase-2-5-fake-caldereta-replacement.png')
await clickButton('Save food')
await waitFor(
  `document.body.textContent.includes('was updated successfully')`,
  45_000,
)
await setField('input[placeholder="Search food"]', 'fake caldereta')
await waitFor(
  `document.querySelector('.catalog-card h2')?.textContent.includes('Fake Caldereta')`,
)
await clickButton('Archive')
await waitFor(`document.body.textContent.includes('Archive this food item?')`)
await clickDialogButton('Archive')
await waitFor(`document.body.textContent.includes('was archived')`, 30_000)
await clickButton('Archived')
await waitFor(
  `document.querySelector('.catalog-card')?.textContent.includes('Archived')`,
)
await clickButton('Restore')
await waitFor(`document.body.textContent.includes('Restore this food item?')`)
await clickDialogButton('Restore')
await waitFor(`document.body.textContent.includes('was restored')`, 30_000)
await clickButton('Active')
await waitFor(
  `document.querySelector('.catalog-card h2')?.textContent.includes('Fake Caldereta')`,
)

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
const displayedValues = await evaluate(`({
  updatedPriceVisible: document.body.textContent.includes('₱95.5'),
  internalDfVisible: document.body.textContent.includes('₱12'),
})`)
if (screenshotPath) {
  const screenshot = await command('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  })
  writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'))
}

await clickButton('Archive')
await waitFor(`document.body.textContent.includes('Archive this food item?')`)
await clickDialogButton('Archive')
await waitFor(`document.body.textContent.includes('was archived')`, 30_000)
const result = await evaluate(`({
  route: location.pathname,
  itemVisible: document.body.textContent.includes('Phase 2.5 Fake Caldereta Long Name'),
  archivedAfterCleanup: document.body.textContent.includes('was archived'),
  tokenInUrl: location.href.toLowerCase().includes('token'),
})`)
Object.assign(result, displayedValues)
const hasOverflow = [...widths, extraLarge].some(
  ({ clientWidth, scrollWidth }) => scrollWidth > clientWidth,
)
if (
  result.route !== '/admin/catalog' ||
  !result.itemVisible ||
  !result.updatedPriceVisible ||
  !result.internalDfVisible ||
  !result.archivedAfterCleanup ||
  result.tokenInUrl ||
  hasOverflow
)
  throw new Error(
    `Browser assertions failed: ${JSON.stringify({ result, widths, extraLarge })}`,
  )
console.log(JSON.stringify({ result, widths, extraLarge }))
socket.close()

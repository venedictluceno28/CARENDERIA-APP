/* global Blob, FormData, WebSocket, atob, console, fetch, process, setTimeout */
import assert from 'node:assert/strict'

const [
  baseUrl = 'http://127.0.0.1:5197',
  customerPort = '9577',
  adminPort = '9578',
] = process.argv.slice(2)
const password = process.env.PHASE29_TEST_PASSWORD
const anonKey = process.env.PHASE29_ANON_KEY
const guestToken = process.env.PHASE29_GUEST_TOKEN
const supabaseUrl = process.env.PHASE29_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const orderCode = 'CRD-P29ABCDEFH'
const orderId = '99500000-0000-4000-8000-000000000001'
if (!password || !anonKey || !guestToken)
  throw new Error('Missing transient Phase 2.9.1 validation credentials.')

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

async function uploadPaymentEvidence() {
  const bytes = Uint8Array.from(
    atob(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    ),
    (character) => character.charCodeAt(0),
  )
  const form = new FormData()
  form.set('orderCode', orderCode)
  form.set('guestToken', guestToken)
  form.set('purpose', 'PAYMENT_EVIDENCE')
  form.set('text', 'Realtime payment image arrived without refresh.')
  form.set(
    'file',
    new Blob([bytes], { type: 'image/png' }),
    'realtime-proof.png',
  )
  const response = await fetch(`${supabaseUrl}/functions/v1/guest-access`, {
    method: 'POST',
    headers: { apikey: anonKey },
    body: form,
  })
  if (!response.ok)
    throw new Error(`Guest upload failed: ${await response.text()}`)
}

class BrowserSession {
  constructor(port) {
    this.port = port
    this.sequence = 0
    this.pending = new Map()
    this.events = []
  }

  async connect() {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      try {
        if ((await fetch(`http://127.0.0.1:${this.port}/json/version`)).ok)
          break
      } catch {
        // Headless Chrome is still starting.
      }
      await sleep(250)
    }
    const target = await (
      await fetch(`http://127.0.0.1:${this.port}/json/new?about:blank`, {
        method: 'PUT',
      })
    ).json()
    this.socket = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true })
      this.socket.addEventListener('error', reject, { once: true })
    })
    this.socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data)
      if (!message.id) {
        if (
          message.method === 'Runtime.exceptionThrown' ||
          message.method === 'Runtime.consoleAPICalled' ||
          message.method === 'Network.loadingFailed'
        )
          this.events.push(message)
        return
      }
      const callback = this.pending.get(message.id)
      if (!callback) return
      this.pending.delete(message.id)
      if (message.error) callback.reject(new Error(message.error.message))
      else callback.resolve(message.result)
    })
    await this.command('Page.enable')
    await this.command('Runtime.enable')
    await this.command('Network.enable')
    await this.resize(390, 1100)
  }

  command(method, params = {}) {
    const id = ++this.sequence
    this.socket.send(JSON.stringify({ id, method, params }))
    return new Promise((resolve, reject) =>
      this.pending.set(id, { resolve, reject }),
    )
  }

  async evaluate(expression) {
    const result = await this.command('Runtime.evaluate', {
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

  async waitFor(expression, timeout = 40_000) {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeout) {
      if (await this.evaluate(expression)) return
      await sleep(150)
    }
    const diagnostic = await this.evaluate(`({
      path: location.pathname,
      readyState: document.readyState,
      alerts: [...document.querySelectorAll('[role="alert"]')].map((node) => node.textContent.trim()),
      text: document.body.textContent.slice(0, 2400),
      html: document.documentElement.outerHTML.slice(0, 1200)
    })`)
    throw new Error(
      `Timed out waiting for ${expression}: ${JSON.stringify({ diagnostic, events: this.events.slice(-12) })}`,
    )
  }

  async navigate(path) {
    await this.command('Page.navigate', { url: `${baseUrl}${path}` })
  }

  async clickButton(text) {
    await this.evaluate(`(() => {
      const normalized = ${JSON.stringify(text.toLowerCase())}
      const buttons = [...document.querySelectorAll('button')]
      const target = buttons.find((node) => node.textContent.trim().toLowerCase() === normalized)
        ?? buttons.find((node) => node.textContent.trim().toLowerCase().includes(normalized))
      if (!target) throw new Error('Button not found: ${text}')
      target.click()
    })()`)
  }

  async setField(selector, value) {
    await this.evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)})
      if (!element) throw new Error('Field not found: ${selector}')
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value').set
      Reflect.apply(setter, element, [${JSON.stringify(value)}])
      element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
      element.dispatchEvent(new Event('change', { bubbles: true }))
    })()`)
  }

  resize(width, height) {
    return this.command('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 600,
    })
  }

  close() {
    this.socket?.close()
  }
}

await guestJson('list_messages', { limit: 50 })
const customer = new BrowserSession(customerPort)
const admin = new BrowserSession(adminPort)
await Promise.all([customer.connect(), admin.connect()])

await customer.command('Page.addScriptToEvaluateOnNewDocument', {
  source: `localStorage.setItem('carenderia.guest-orders.v1', ${JSON.stringify(
    JSON.stringify([
      {
        orderCode,
        guestToken,
        expiresAt: new Date(Date.now() + 23 * 60 * 60_000).toISOString(),
      },
    ]),
  )})`,
})
await customer.navigate(`/order/receipt/${orderCode}/message`)
await customer.waitFor(`Boolean(document.querySelector('#message-draft'))`)

await admin.navigate('/admin/messages')
await admin.waitFor(`Boolean(document.querySelector('#admin-email'))`)
await admin.setField('#admin-email', 'phase29-admin@example.test')
await admin.setField('#admin-password', password)
await admin.clickButton('Log in')
await admin.waitFor(`location.pathname === '/admin'`)
await admin.waitFor(
  `document.querySelectorAll('.admin-module--enabled:not(:disabled)').length === 6`,
)
assert.equal(
  await admin.evaluate(
    `document.querySelectorAll('.admin-module--enabled:not(:disabled)').length`,
  ),
  6,
)
assert.equal(
  await admin.evaluate(
    `document.querySelectorAll('.admin-module--disabled:disabled').length`,
  ),
  1,
)
await admin.clickButton('MESSAGE')
await admin.waitFor(`location.pathname === '/admin/messages'`)
await admin.waitFor(`Boolean(document.querySelector('.conversation-list'))`)

await sleep(1_500)
await customer.setField('#message-draft', 'Hello from the realtime customer.')
await customer.clickButton('Send')
await customer.waitFor(
  `document.body.textContent.includes('Hello from the realtime customer.')`,
)
await admin.waitFor(
  `document.body.textContent.includes('Hello from the realtime customer.')`,
  10_000,
)
await admin.evaluate(`document.querySelector('.conversation-card').click()`)
await admin.waitFor(`location.pathname === '/admin/messages/${orderId}'`)
await admin.waitFor(
  `document.body.textContent.includes('Hello from the realtime customer.')`,
)
await sleep(1_500)

await customer.setField(
  '#message-draft',
  'Second customer message reached the open admin thread.',
)
await customer.clickButton('Send')
await admin.waitFor(
  `document.body.textContent.includes('Second customer message reached the open admin thread.')`,
  10_000,
)

await admin.setField('#admin-reply', 'Hi from the realtime store admin.')
await admin.clickButton('Send reply')
await customer.waitFor(
  `document.body.textContent.includes('Hi from the realtime store admin.')`,
  10_000,
)

await uploadPaymentEvidence()
await admin.waitFor(
  `document.body.textContent.includes('Realtime payment image arrived without refresh.') && document.body.textContent.includes('PAYMENT RECEIPT')`,
  10_000,
)

await admin.clickButton('Mark Verified')
await customer.waitFor(
  `document.body.textContent.includes('Verified') && !document.body.textContent.includes('Not Verified')`,
  10_000,
)
await admin.waitFor(
  `[...document.querySelectorAll('button')].some((button) => button.textContent.includes('Mark Not Verified'))`,
)
await admin.evaluate(`window.confirm = () => true`)
await admin.clickButton('Mark Not Verified')
await customer.waitFor(
  `document.body.textContent.includes('Not Verified')`,
  10_000,
)

await customer.command('Network.emulateNetworkConditions', {
  offline: true,
  latency: 0,
  downloadThroughput: 0,
  uploadThroughput: 0,
})
await admin.setField('#admin-reply', 'Recovered after customer reconnect.')
await admin.clickButton('Send reply')
await admin.waitFor(
  `document.body.textContent.includes('Recovered after customer reconnect.')`,
)
await customer.command('Network.emulateNetworkConditions', {
  offline: false,
  latency: 0,
  downloadThroughput: -1,
  uploadThroughput: -1,
})
await customer.evaluate(`window.dispatchEvent(new Event('online'))`)
await customer.waitFor(
  `document.body.textContent.includes('Recovered after customer reconnect.')`,
  10_000,
)

const contrast = await customer.evaluate(`(() => {
  const bubble = document.querySelector('.message-row--guest .message-bubble')
  const text = bubble.querySelector('p')
  const parse = (value) => value.match(/[\\d.]+/g).slice(0, 3).map(Number)
  const luminance = (rgb) => {
    const values = rgb.map((value) => {
      const channel = value / 255
      return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    })
    return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722
  }
  const foreground = luminance(parse(getComputedStyle(text).color))
  const background = luminance(parse(getComputedStyle(bubble).backgroundColor))
  return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)
})()`)
assert.ok(
  contrast >= 4.5,
  `Expected bubble contrast >= 4.5, received ${contrast}`,
)

for (const width of [320, 360, 390, 430, 1440]) {
  await Promise.all([customer.resize(width, 900), admin.resize(width, 900)])
  assert.equal(
    await customer.evaluate(
      `document.documentElement.scrollWidth <= document.documentElement.clientWidth`,
    ),
    true,
  )
  assert.equal(
    await admin.evaluate(
      `document.documentElement.scrollWidth <= document.documentElement.clientWidth`,
    ),
    true,
  )
}
await customer.resize(320, 700)
await customer.evaluate(
  `document.documentElement.dataset.fontSize = 'extra-large'`,
)
assert.equal(
  await customer.evaluate(
    `document.documentElement.scrollWidth <= document.documentElement.clientWidth`,
  ),
  true,
)

console.log(
  JSON.stringify({
    adminInboxRealtime: 'passed',
    openConversationRealtime: 'passed',
    customerReplyRealtime: 'passed',
    paymentRealtime: 'passed',
    reconnectRecovery: 'passed',
    dashboardStates: 'passed',
    bubbleContrastRatio: Number(contrast.toFixed(2)),
    responsiveWidths: [320, 360, 390, 430, 1440],
    extraLargeKeyboardViewport: 'passed',
  }),
)

customer.close()
admin.close()

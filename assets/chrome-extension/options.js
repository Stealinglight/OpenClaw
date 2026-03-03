import { deriveRelayToken, sanitizeHost, DEFAULT_HOST } from './background-utils.js'
import { classifyRelayCheckException, classifyRelayCheckResponse } from './options-validation.js'

const DEFAULT_PORT = 18792

function clampPort(value) {
  const n = Number.parseInt(String(value || ''), 10)
  if (!Number.isFinite(n)) return DEFAULT_PORT
  if (n <= 0 || n > 65535) return DEFAULT_PORT
  return n
}

function updateRelayUrl(host, port) {
  const el = document.getElementById('relay-url')
  if (!el) return
  el.textContent = `http://${host}:${port}/`
}

function setStatus(kind, message) {
  const status = document.getElementById('status')
  if (!status) return
  status.dataset.kind = kind || ''
  status.textContent = message || ''
}

async function checkRelayReachable(host, port, token) {
  const url = `http://${host}:${port}/json/version`
  const trimmedToken = String(token || '').trim()
  if (!trimmedToken) {
    setStatus('error', 'Gateway token required. Save your gateway token to connect.')
    return
  }
  try {
    const relayToken = await deriveRelayToken(trimmedToken, port)
    // Delegate the fetch to the background service worker to bypass
    // CORS preflight on the custom x-openclaw-relay-token header.
    const res = await chrome.runtime.sendMessage({
      type: 'relayCheck',
      url,
      token: relayToken,
    })
    const result = classifyRelayCheckResponse(res, port, host)
    if (result.action === 'throw') throw new Error(result.error)
    setStatus(result.kind, result.message)
  } catch (err) {
    const result = classifyRelayCheckException(err, port, host)
    setStatus(result.kind, result.message)
  }
}

async function load() {
  const stored = await chrome.storage.local.get(['relayPort', 'relayHost', 'gatewayToken'])
  const host = sanitizeHost(stored.relayHost)
  const port = clampPort(stored.relayPort)
  const token = String(stored.gatewayToken || '').trim()
  document.getElementById('host').value = host === DEFAULT_HOST ? '' : host
  document.getElementById('port').value = String(port)
  document.getElementById('token').value = token
  updateRelayUrl(host, port)
  await checkRelayReachable(host, port, token)
}

async function save() {
  const hostInput = document.getElementById('host')
  const portInput = document.getElementById('port')
  const tokenInput = document.getElementById('token')
  const host = sanitizeHost(hostInput.value)
  const port = clampPort(portInput.value)
  const token = String(tokenInput.value || '').trim()
  await chrome.storage.local.set({ relayHost: host, relayPort: port, gatewayToken: token })
  hostInput.value = host === DEFAULT_HOST ? '' : host
  portInput.value = String(port)
  tokenInput.value = token
  updateRelayUrl(host, port)
  await checkRelayReachable(host, port, token)
}

document.getElementById('save').addEventListener('click', () => void save())
void load()

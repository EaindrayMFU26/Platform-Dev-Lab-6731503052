// Shared curl helpers for the test runners. Every request is a real `curl` process, and its
// output is split into status line, headers and body so it can be checked and quoted as evidence.
import { spawn } from 'node:child_process'

export const QUIET = ['-s', '-S', '--max-time', '20'] // added to every command: no progress meter, never hang

const ASCII_ONLY = /^[\x20-\x7e]*$/

export function curlArgs(baseUrl, { method = 'GET', path, json, rawBody, headers = {} }) {
  const args = ['-i']
  if (method !== 'GET') args.push('-X', method)
  args.push(baseUrl + path)
  for (const [name, value] of Object.entries(headers)) args.push('-H', `${name}: ${value}`)
  const body = rawBody ?? (json === undefined ? undefined : JSON.stringify(json))
  if (body !== undefined) {
    args.push('-H', 'Content-Type: application/json')
    // Text outside ASCII (Thai, for example) does not reliably survive the Windows command line,
    // and a very long argument may not fit on it, so such a body is piped to curl's stdin
    // instead of being passed with -d.
    if (ASCII_ONLY.test(body) && body.length <= 8000) args.push('-d', body)
    else {
      args.push('--data-binary', '@-')
      args.stdin = body
    }
  }
  return args
}

export function runCurl(args) {
  return new Promise((resolve) => {
    const child = spawn('curl', [...QUIET, ...args])
    let raw = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', (chunk) => (raw += chunk))
    child.stderr.setEncoding('utf8').on('data', (chunk) => (stderr += chunk))
    child.on('error', (error) => resolve({ exitCode: -1, stderr: String(error), ...parseResponse('') }))
    child.on('close', (exitCode) => resolve({ exitCode, stderr: stderr.trim(), ...parseResponse(raw) }))
    child.stdin.on('error', () => {}) // curl may exit before it reads stdin
    child.stdin.end(args.stdin ?? '', 'utf8')
  })
}

// Splits `curl -i` output into status line, headers and body.
export function parseResponse(raw) {
  const text = raw.replace(/\r\n/g, '\n')
  const gap = text.indexOf('\n\n')
  const head = gap === -1 ? text : text.slice(0, gap)
  const body = gap === -1 ? '' : text.slice(gap + 2)
  const [statusLine = '', ...headerLines] = head.split('\n')
  const headers = {}
  for (const line of headerLines) {
    const colon = line.indexOf(':')
    if (colon > 0) headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim()
  }
  let json
  try {
    json = body === '' ? undefined : JSON.parse(body)
  } catch {
    json = undefined
  }
  return { status: Number(statusLine.split(' ')[1]) || 0, statusLine, headers, body, json }
}

// The command as you would type it in a bash-style shell (Git Bash, macOS, Linux).
export function showCommand(args) {
  const quote = (arg) => (/^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", `'\\''`)}'`)
  let text = 'curl'
  for (let i = 0; i < args.length; i++) {
    const startsOption = args[i] === '-H' || args[i] === '-d' || args[i] === '--data-binary'
    text += (startsOption ? ' \\\n  ' : ' ') + quote(args[i])
  }
  return args.stdin === undefined ? text : `printf '%s' ${quote(args.stdin)} | ${text}`
}

export function showResponse(res, limit = 900) {
  const shown = Object.entries(res.headers)
    .filter(([name]) => name === 'content-type' || name.startsWith('access-control-'))
    .map(([name, value]) => `${name}: ${value}`)
  const body = res.body.length > limit ? `${res.body.slice(0, limit)} ... [${res.body.length} characters in total]` : res.body
  return [res.statusLine || `(no response: ${res.stderr})`, ...shown, '', body === '' ? '(empty body)' : body].join('\n')
}

// The contract: every error is JSON of the form { "error": "<message>" } and nothing else.
export function errorShapeProblem(res) {
  if (!(res.headers['content-type'] ?? '').includes('application/json')) return 'error response is not JSON'
  const keys = res.json && typeof res.json === 'object' ? Object.keys(res.json) : []
  if (keys.length !== 1 || keys[0] !== 'error' || typeof res.json.error !== 'string' || res.json.error === '') {
    return 'error body is not exactly { "error": "<message>" }'
  }
  return null
}

export function runCurlVersion() {
  return new Promise((resolve) => {
    const child = spawn('curl', ['--version'])
    let out = ''
    child.stdout.setEncoding('utf8').on('data', (chunk) => (out += chunk))
    child.on('error', () => resolve(''))
    child.on('close', () => resolve(out.split('\n')[0].trim()))
  })
}

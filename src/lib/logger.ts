/**
 * Strukturisan JSON logger bez ličnih podataka i bez tajni.
 * Jedan red po događaju: { level, time, msg, ...fields }.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
export type LogFields = Record<string, unknown>

const SENSITIVE_KEY = /(token|secret|key|authorization|password|cookie|signature|credential)/i
const MAX_STRING = 2000
const MAX_DEPTH = 6

export function redact(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[dubina]'
  if (value === null || value === undefined) return value
  if (typeof value === 'string') {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…[${value.length}]` : value
  }
  if (typeof value !== 'object') return value
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack }
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1))
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEY.test(k) && v !== null && v !== undefined ? '[redacted]' : redact(v, depth + 1)
  }
  return out
}

const levelOrder: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

function minLevel(): LogLevel {
  const fromEnv = process.env.LOG_LEVEL as LogLevel | undefined
  if (fromEnv && fromEnv in levelOrder) return fromEnv
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug'
}

function write(level: LogLevel, msg: string, fields: LogFields) {
  if (levelOrder[level] < levelOrder[minLevel()]) return
  const line = JSON.stringify({ level, time: new Date().toISOString(), msg, ...(redact(fields) as object) })
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export interface Logger {
  debug(msg: string, fields?: LogFields): void
  info(msg: string, fields?: LogFields): void
  warn(msg: string, fields?: LogFields): void
  error(msg: string, fields?: LogFields): void
  child(fields: LogFields): Logger
}

export function createLogger(base: LogFields = {}): Logger {
  return {
    debug: (msg, fields = {}) => write('debug', msg, { ...base, ...fields }),
    info: (msg, fields = {}) => write('info', msg, { ...base, ...fields }),
    warn: (msg, fields = {}) => write('warn', msg, { ...base, ...fields }),
    error: (msg, fields = {}) => write('error', msg, { ...base, ...fields }),
    child: (fields) => createLogger({ ...base, ...fields }),
  }
}

export const logger = createLogger({ app: 'sova' })

const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

function parseNumber(raw, min, max, label, mapSevenToZero = false) {
  if (!/^\d+$/.test(raw)) throw new Error(`${label} cron tidak valid: "${raw}".`)
  const num = Number(raw)
  if (!Number.isInteger(num) || num < min || num > max) throw new Error(`${label} cron harus antara ${min} dan ${max}.`)
  return mapSevenToZero && num === 7 ? 0 : num
}

function parseField(part, min, max, label, mapSevenToZero = false) {
  if (!part || typeof part !== 'string') throw new Error(`${label} cron wajib diisi.`)
  const wildcard = part === '*'
  const values = new Set()
  for (const segment of part.split(',')) {
    if (!segment) throw new Error(`Format ${label} cron tidak valid.`)
    const slashParts = segment.split('/')
    if (slashParts.length > 2) throw new Error(`Format langkah ${label} cron tidak valid.`)
    const [rangePart, stepPart] = slashParts
    let step = 1
    if (stepPart !== undefined) {
      step = parseNumber(stepPart, 1, max, `langkah ${label}`)
    }
    let start = min
    let end = max
    if (rangePart !== '*') {
      const dashParts = rangePart.split('-')
      if (dashParts.length === 1) {
        start = parseNumber(dashParts[0], min, max, label, mapSevenToZero)
        end = stepPart !== undefined ? max : start
      } else if (dashParts.length === 2) {
        start = parseNumber(dashParts[0], min, max, label, false)
        end = parseNumber(dashParts[1], min, max, label, false)
        if (start > end) throw new Error(`Rentang ${label} cron tidak valid (${start}-${end}).`)
      } else {
        throw new Error(`Format rentang ${label} cron tidak valid.`)
      }
    }
    for (let v = start; v <= end; v += step) {
      values.add(mapSevenToZero && v === 7 ? 0 : v)
    }
  }
  if (!values.size) throw new Error(`${label} cron tidak menghasilkan nilai valid.`)
  return { wildcard, values }
}

function compileCron(expression) {
  const trimmed = String(expression || '').trim()
  const parts = trimmed.split(/\s+/)
  if (parts.length !== 5) throw new Error('Ekspresi cron harus memiliki 5 bagian (menit jam tanggal bulan hari).')
  return {
    minute: parseField(parts[0], 0, 59, 'menit'),
    hour: parseField(parts[1], 0, 23, 'jam'),
    dom: parseField(parts[2], 1, 31, 'tanggal'),
    month: parseField(parts[3], 1, 12, 'bulan'),
    dow: parseField(parts[4], 0, 7, 'hari', true),
  }
}

export function validateCron(expression) {
  try {
    compileCron(expression)
    return { valid: true }
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : 'Ekspresi cron tidak valid.' }
  }
}

function zonedParts(date, timeZone = 'Asia/Jakarta') {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
    weekday: 'short',
  })
  const map = Object.fromEntries(formatter.formatToParts(date).filter(p => p.type !== 'literal').map(p => [p.type, p.value]))
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour) % 24,
    minute: Number(map.minute),
    weekday: WEEKDAYS[map.weekday] ?? 0,
  }
}

export function matchesCron(expression, date = new Date(), timeZone = 'Asia/Jakarta') {
  let compiled
  try { compiled = compileCron(expression) } catch { return false }
  const now = zonedParts(date, timeZone)
  if (!compiled.minute.values.has(now.minute)) return false
  if (!compiled.hour.values.has(now.hour)) return false
  if (!compiled.month.values.has(now.month)) return false
  const domMatch = compiled.dom.values.has(now.day)
  const dowMatch = compiled.dow.values.has(now.weekday)
  if (!compiled.dom.wildcard && !compiled.dow.wildcard) return domMatch || dowMatch
  return domMatch && dowMatch
}

export function minuteKey(date = new Date(), timeZone = 'Asia/Jakarta') {
  const p = zonedParts(date, timeZone)
  const pad = n => String(n).padStart(2, '0')
  return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}`
}

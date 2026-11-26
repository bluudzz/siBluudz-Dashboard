const PROVIDER_ORDER = {
  cx: 0,
  ag: 1,
  gptweb: 2,
  omnirush: 3,
  river: 4,
  yeta: 5,
}

const PREFERRED_FLAGSHIPS = [
  'cx/gpt-6.2-sol',
  'ag/gemini-4-hydrogen',
  'ag/claude-sonnet-5-5',
  'ag/claude-opus-5-5',
  'cx/gpt-6.1-sol',
  'gptweb/gpt-6-2',
  'gptweb/gpt-6',
  'ag/gemini-3.8-flash',
]

export function isNonTextOrNoiseModel(id, catalogEntry) {
  if (!id || typeof id !== 'string') return true
  if (catalogEntry?.imageOutput === true) return true
  if (/^muse-image\//i.test(id)) return true
  if (/chatgpt_alpha_model|reserved_gate|^cx\/gpt-reserve$/i.test(id)) return true
  return false
}

export function parseModelFamilyAndVersion(id) {
  if (!id || typeof id !== 'string') return { provider: '', family: null, version: 0 }
  const slashIdx = id.indexOf('/')
  const provider = slashIdx >= 0 ? id.slice(0, slashIdx).toLowerCase() : ''
  const name = (slashIdx >= 0 ? id.slice(slashIdx + 1) : id).toLowerCase()

  let m = name.match(/^claude-(opus|sonnet|haiku)-(\d+)[.-](\d+)/)
  if (m) {
    return { provider, family: `claude-${m[1]}`, version: Number(`${m[2]}.${m[3]}`) }
  }

  m = name.match(/^gemini-(\d+)(?:[.-](\d+))?/)
  if (m) {
    return { provider, family: 'gemini', version: Number(`${m[1]}.${m[2] || 0}`) }
  }

  m = name.match(/^gpt-image-(\d+)(?:[.-](\d+))?/)
  if (m) {
    return { provider, family: 'gpt-image', version: Number(`${m[1]}.${m[2] || 0}`) }
  }

  m = name.match(/^gpt-(\d+)(?:[.-](\d+)(?=-|$|\[))?/)
  if (m) {
    return { provider, family: 'gpt', version: Number(`${m[1]}.${m[2] || 0}`) }
  }

  m = name.match(/(?:^|\/)qwen(\d+)(?:[.-](\d+))?/)
  if (m) {
    return { provider, family: 'qwen', version: Number(`${m[1]}.${m[2] || 0}`) }
  }

  m = name.match(/(?:^|\/)kimi-k(\d+)(?:[.-](\d+))?/)
  if (m) {
    return { provider, family: 'kimi-k', version: Number(`${m[1]}.${m[2] || 0}`) }
  }

  m = name.match(/(?:^|\/)deepseek-v(\d+)(?:[.-](\d+))?/)
  if (m) {
    return { provider, family: 'deepseek-v', version: Number(`${m[1]}.${m[2] || 0}`) }
  }

  m = name.match(/(?:^|\/)glm-(\d+)(?:[.-](\d+))?/)
  if (m) {
    return { provider, family: 'glm', version: Number(`${m[1]}.${m[2] || 0}`) }
  }

  return { provider, family: null, version: 0 }
}

function getSuffixPenalty(id) {
  const lower = id.toLowerCase()
  let penalty = 0
  if (lower.includes('[1m]')) penalty += 2
  if (lower.endsWith('-review')) penalty += 4
  if (lower.endsWith('-wm')) penalty += 2
  if (lower.includes('-t-mini')) penalty += 4
  else if (lower.includes('-mini')) penalty += 3
  if (lower.endsWith('-low')) penalty += 3
  else if (lower.endsWith('-medium')) penalty += 2
  else if (lower.endsWith('-high') || lower.endsWith('-xhigh') || lower.endsWith('-max')) penalty += 1
  if (lower.endsWith('-uncensored')) penalty += 2
  if (/-\d{4}$/.test(lower)) penalty += 5
  return penalty
}

export function sortModelsNewestFirst(models) {
  return [...models].sort((a, b) => {
    const pa = parseModelFamilyAndVersion(a)
    const pb = parseModelFamilyAndVersion(b)
    const rankA = PROVIDER_ORDER[pa.provider] ?? 99
    const rankB = PROVIDER_ORDER[pb.provider] ?? 99
    if (rankA !== rankB) return rankA - rankB
    if (pb.version !== pa.version) return pb.version - pa.version
    const penA = getSuffixPenalty(a)
    const penB = getSuffixPenalty(b)
    if (penA !== penB) return penA - penB
    return a.localeCompare(b)
  })
}

export function isLegacyModel(id, allModels) {
  if (!id || typeof id !== 'string') return false
  const list = Array.isArray(allModels) ? allModels : []
  const lowerSet = new Set(list.map((m) => String(m).toLowerCase()))

  const dateMatch = id.match(/^(.+)-(\d{4})$/)
  if (dateMatch && lowerSet.has(dateMatch[1].toLowerCase())) {
    return true
  }

  if (
    id.toLowerCase() === 'ag/gpt-oss-120b-medium' &&
    list.some((m) => /^ag\/(gemini-4-|claude-.*-5-5)/i.test(m))
  ) {
    return true
  }

  const parsed = parseModelFamilyAndVersion(id)
  if (!parsed.family) return false

  const groupKey = `${parsed.provider}:${parsed.family}`
  let maxVersion = parsed.version
  for (const candidate of list) {
    const cParsed = parseModelFamilyAndVersion(candidate)
    if (`${cParsed.provider}:${cParsed.family}` === groupKey && cParsed.version > maxVersion) {
      maxVersion = cParsed.version
    }
  }

  if (parsed.family === 'qwen' || parsed.family === 'kimi-k') {
    return maxVersion > parsed.version
  }
  if (parsed.family === 'gpt-image') {
    return maxVersion >= 2.5 && parsed.version < 2.5
  }
  return Math.floor(maxVersion) > Math.floor(parsed.version)
}

export function curateTextModels(models, catalog = []) {
  const unique = Array.from(new Set((Array.isArray(models) ? models : []).filter(Boolean)))
  const catList = Array.isArray(catalog) ? catalog : []
  const clean = unique.filter((id) => {
    const entry = catList.find((item) => item?.id === id)
    return !isNonTextOrNoiseModel(id, entry)
  })
  const legacy = []
  const latest = []
  for (const id of clean) {
    if (isLegacyModel(id, clean)) {
      legacy.push(id)
    } else {
      latest.push(id)
    }
  }
  const sortedAll = sortModelsNewestFirst(clean)
  const sortedLatest = latest.length > 0 ? sortModelsNewestFirst(latest) : sortedAll
  const sortedLegacy = latest.length > 0 ? sortModelsNewestFirst(legacy) : []
  return { latest: sortedLatest, legacy: sortedLegacy, all: sortedAll }
}

export function curateImageModels(models) {
  const unique = Array.from(new Set((Array.isArray(models) ? models : []).filter(Boolean)))
  const legacy = []
  const latest = []
  for (const id of unique) {
    if (isLegacyModel(id, unique)) {
      legacy.push(id)
    } else {
      latest.push(id)
    }
  }
  const sortedAll = sortModelsNewestFirst(unique)
  const sortedLatest = latest.length > 0 ? sortModelsNewestFirst(latest) : sortedAll
  const sortedLegacy = latest.length > 0 ? sortModelsNewestFirst(legacy) : []
  return { latest: sortedLatest, legacy: sortedLegacy, all: sortedAll }
}

export function pickPreferredLatestTextModel(models, catalog = []) {
  const { latest, all } = curateTextModels(models, catalog)
  for (const preferred of PREFERRED_FLAGSHIPS) {
    if (latest.includes(preferred)) return preferred
  }
  return latest[0] || all[0] || models[0] || ''
}

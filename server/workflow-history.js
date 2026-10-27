function readJson(value,fallback) {
  try { return JSON.parse(value||'')??fallback }
  catch { return fallback }
}

export function decodeWorkflowRun(row) {
  const logs=readJson(row.logs,[])
  const result=readJson(row.result,{})
  return {...row,logs:Array.isArray(logs)?logs:[],result:result&&typeof result==='object'&&!Array.isArray(result)?result:{}}
}

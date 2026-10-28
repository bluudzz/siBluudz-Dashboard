export const WORKFLOW_ASSISTANT_DEFAULT_MODEL='ag/gemini-3.8-flash'

export function selectWorkflowAssistantModel(requested, defaultModel, catalog) {
  const fallback=String(defaultModel||'').trim()
  const available=Array.isArray(catalog)?catalog:[]
  const preferred=available.find(item=>item?.id===WORKFLOW_ASSISTANT_DEFAULT_MODEL&&item.imageOutput!==true)
  const chosen=String(requested||'').trim()||(preferred?WORKFLOW_ASSISTANT_DEFAULT_MODEL:fallback)
  if(!chosen||chosen.length>200)throw new Error('Pilih model 9router untuk Asisten Workflow.')
  if(chosen===fallback)return chosen
  const entry=available.find(item=>item?.id===chosen)
  if(!entry||entry.imageOutput===true)throw new Error('Model tersebut tidak ada dalam daftar model teks 9router. Muat ulang daftar model lalu pilih kembali.')
  return chosen
}

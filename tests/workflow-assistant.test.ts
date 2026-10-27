import test from 'node:test'
import assert from 'node:assert/strict'
import { assistantContext, parseAssistantSuggestion } from '../src/features/automation/workflow-assistant.ts'
import { formatModelLabel } from '../src/features/automation/workflow-model.ts'

test('formatModelLabel simplifies prefixes to badge format',()=>{
  assert.equal(formatModelLabel('customendpoint/9Router-Tencent/ag/gemini-3.8-flash'), '[AG] gemini-3.8-flash')
  assert.equal(formatModelLabel('ag/claude-sonnet-5-5'), '[AG] claude-sonnet-5-5')
  assert.equal(formatModelLabel('cx/gpt-5.6-luna'), '[CX] gpt-5.6-luna')
  assert.equal(formatModelLabel('ds/deepseek-reasoner'), '[DS] deepseek-reasoner')
  assert.equal(formatModelLabel('gold/tig/glm-5.3-flash'), '[TIG] glm-5.3-flash')
  assert.equal(formatModelLabel('tig/grok-4.7'), '[TIG] grok-4.7')
  assert.equal(formatModelLabel('river/deepseek-ai/DeepSeek-V4.1-Flash'), '[RIVER] DeepSeek-V4.1-Flash')
  assert.equal(formatModelLabel('yeta/deepseek-v4.1-flash'), '[YETA] deepseek-v4.1-flash')
  assert.equal(formatModelLabel('oc/glm-5.3-flash-free'), '[OC] glm-5.3-flash-free')
  assert.equal(formatModelLabel('groq/llama-3.3-70b-versatile'), '[GROQ] llama-3.3-70b-versatile')
  assert.equal(formatModelLabel('raw-custom-model'), 'raw-custom-model')
  assert.equal(formatModelLabel(''), '')
})

test('every workflow node type accepts a bounded suggestion for its own fields',()=>{
  const fields:Record<string,string>={trigger:'sampleData',chatTrigger:'chatInput',chatModel:'temperature',memory:'sessionKey',tool:'content',set:'fields',if:'field',aiAgent:'aiPrompt'}
  for(const [type,key] of Object.entries(fields)){
    const value=key==='sampleData'?'{"topic":"Foto"}':key==='fields'?'{"title":"Foto"}':key==='format'?'carousel':key==='temperature'?'0.7':'Foto produk'
    const suggestion=parseAssistantSuggestion(JSON.stringify({summary:'Siap',changes:{[key]:value},nextStep:'Simpan'}),type)
    assert.equal(suggestion.changes[key],value,type)
  }
})

test('assistant ignores unsupported and unsafe configuration changes',()=>{
  const suggestion=parseAssistantSuggestion('```json\n'+JSON.stringify({changes:{query:'Ide konten',aiModel:'untrusted',disabled:true,fields:'{"title":"Konten"}'}})+'\n```','set')
  assert.deepEqual(suggestion.changes,{fields:'{"title":"Konten"}'})
})

test('assistant context limits samples and removes secret keys',()=>{
  const node={id:'a',type:'set',position:{x:0,y:0},data:{label:'Edit Fields',fields:'{}',result:{input:[{json:{topic:'Foto',apiKey:'private'}}],output:[]}}}
  const context=assistantContext(node as never,[node as never],[],'Konten IG')
  assert.equal(JSON.stringify(context).includes('private'),false)
  assert.deepEqual(context.allowedChanges,['label','fields','keepInput'])
})

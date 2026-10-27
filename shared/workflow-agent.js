import { resolveValue } from './workflow-engine.js'
import { Agent, Runner, tool } from '@openai/agents'
import { z } from 'zod'

// Only explicit, local tools are available. No arbitrary code or URL execution.
export async function runWorkflowAgent({node,input,resources,createModel,loadMemory=()=>[],saveMemory=()=>{}}) {
  if(input.length>10)throw new Error('AI Agent menerima maksimal 10 item per pengujian.')
  const model=String(resources.model.data.model||'').trim()
  if(!model)throw new Error('Pilih model 9router pada sub-node Chat Model.')
  const toolNodes=resources.tools.filter(resource=>!resource.data.disabled)
  if(toolNodes.length>10)throw new Error('AI Agent memakai maksimal 10 alat bantu.')
  const output=[]
  for(const item of input){
     const configuredPrompt=String(node.data.aiPrompt||'{{ $json.chatInput }}').trim()
     let prompt
     try { prompt=String(resolveValue(configuredPrompt,item.json)) }
     catch(error) {
       if(configuredPrompt==='{{ $json.chatInput }}'&&!Object.hasOwn(item.json,'chatInput')) prompt=`Bantu saya mengolah data workflow berikut:\n${JSON.stringify(item.json)}`
       else throw error
     }
     if(prompt.length>16000)throw new Error('Prompt AI Agent maksimal 16.000 karakter.')
     const splitOutCount=Number(node.data.splitOutCount)
     const splitOutInstruction=Number.isInteger(splitOutCount)&&splitOutCount>=1?`\n\nAturan wajib dari node Split Out berikutnya: hasilkan tepat ${splitOutCount} prompt. Balas hanya dengan JSON valid berbentuk {"prompts":[{"slide":1,"prompt":"..."}]} tanpa markdown atau penjelasan tambahan. Jumlah elemen prompts harus tepat ${splitOutCount}.`:''
    const memory=resources.memory&&!resources.memory.data.disabled?resources.memory:undefined
    const session=memory?String(resolveValue(memory.data.sessionKey||'{{ $json.sessionId }}',input[0].json)):''
    if(memory&&(!session||session.length>200))throw new Error('Session key Memory wajib diisi, maksimal 200 karakter.')
    const window=Math.min(20,Math.max(1,Number(memory?.data.windowSize)||5))
    const history=memory?await loadMemory(memory.id,session,window):[]
    const trace=[]
    const tools=toolNodes.map((resource,index)=>{
       if(!['textLength','knowledge'].includes(resource.data.toolType))throw new Error('Jenis alat bantu belum didukung.')
      const kind=resource.data.toolType
      return tool({
        name:'workflow_tool_'+index,
        description:String(resource.data.description||resource.data.label||'Alat bantu workflow').slice(0,1000),
         parameters:kind==='textLength'?z.object({text:z.string().max(16000)}):z.object({}),
        errorFunction:null,
        execute:async args=>{
          if(trace.length>=10)throw new Error('Batas 10 pemakaian alat bantu per langkah tercapai.')
          const text=String(args.text||'')
          let result
          if(kind==='textLength')result={characters:[...text].length,words:text.trim()?text.trim().split(/\s+/).length:0}
          else if(kind==='knowledge')result={reference:String(resource.data.content||'').slice(0,12000)}
          trace.push({tool:String(resource.data.label||resource.data.toolType),result})
          return JSON.stringify(result)
        },
      })
    })
    const agent=new Agent({
      name:String(node.data.label||'Workflow Agent').slice(0,100),
       instructions:String(node.data.systemMessage||'Bantu pengguna dalam Bahasa Indonesia. Gunakan alat bantu bila diperlukan. Jangan mengaku menelusuri web atau mempublikasikan konten tanpa alat yang mendukungnya.')+splitOutInstruction,
      model:createModel(model),
      modelSettings:{temperature:Math.min(2,Math.max(0,Number(resources.model.data.temperature)||0)),maxTokens:2000,parallelToolCalls:false,retry:{maxRetries:0}},
      tools,
    })
    const runner=new Runner({tracingDisabled:true,toolNotFoundBehavior:'raise_error'})
    const maxIterations=Math.min(5,Math.max(1,Number(node.data.maxIterations)||3))
    let run
    try { run=await runner.run(agent,[...history,{role:'user',content:prompt}],{maxTurns:maxIterations,signal:AbortSignal.timeout(90000)}) }
    catch(error){if(error.name==='MaxTurnsExceededError')throw new Error('AI mencapai batas putaran kerja. Sederhanakan tugas atau naikkan batas putaran di Pengaturan lanjutan.');throw error}
    const reply=typeof run.finalOutput==='string'?run.finalOutput:''
    if(!reply.trim())throw new Error('Model mengembalikan jawaban kosong.')
    if(memory)await saveMemory(memory.id,session,[...history,{role:'user',content:prompt},{role:'assistant',content:reply}].slice(-window*2))
    const usage=run.runContext.usage
    output.push({json:{...item.json,output:reply,agentModel:model,toolSteps:trace,agentRun:{runtime:'openai-agents-sdk',requests:usage.requests,inputTokens:usage.inputTokens,outputTokens:usage.outputTokens}}})
  }
  return output
}

import { randomUUID } from 'node:crypto'
import { db, getNineRouterConfig } from './db.js'
import { runWorkflowAgent } from '../shared/workflow-agent.js'
import OpenAI from 'openai'
import { OpenAIChatCompletionsModel } from '@openai/agents'
import { researchWeb } from './workflow-research.js'

export function createAgentRuntime(user,workflowId,signal) {
  return context=>runWorkflowAgent({...context,signal,
    researchWeb,
    createModel:modelName=>{
      const config=getNineRouterConfig()
      if(!config.apiKey)throw new Error('Hubungkan 9router di pengaturan AI sebelum menjalankan agent.')
      const client=new OpenAI({apiKey:config.apiKey,baseURL:config.baseUrl.replace(/\/chat\/completions\/?$/,'').replace(/\/+$/,''),timeout:90000,maxRetries:0})
      const model=new OpenAIChatCompletionsModel(client,modelName)
      return {getResponse:async request=>{
        const tier=user.tier||(user.role==='admin'?'pro':'free')
        const limit=user.ai_daily_limit??(tier==='pro'?config.proDailyLimit:config.freeDailyLimit)
        const count=db.prepare("select count(*) as count from ai_usage_logs where user_id=? and date(created_at,'localtime')=date('now','localtime')").get(user.id).count
        if(user.role!=='admin'&&count>=limit)throw new Error('Kuota AI harian habis. Periksa pengaturan akun Anda.')
        const completion=await model.getResponse(request)
        db.prepare('insert into ai_usage_logs (id,user_id,prompt_tokens,completion_tokens,model,type) values (?,?,?,?,?,?)').run(randomUUID(),user.id,completion.usage?.inputTokens||0,completion.usage?.outputTokens||0,modelName,'workflow_agent')
        return completion
      },getStreamedResponse(){throw new Error('Streaming workflow belum diaktifkan.')}}
    },
    loadMemory:(memoryId,session,window)=>{
      const row=db.prepare('select messages from workflow_chat_memory where user_id=? and workflow_id=? and memory_node_id=? and session_key=?').get(user.id,workflowId,memoryId,session)
      try { return JSON.parse(row?.messages||'[]').slice(-window*2) }catch{return []}
    },
    saveMemory:(memoryId,session,messages)=>db.prepare("insert into workflow_chat_memory (user_id,workflow_id,memory_node_id,session_key,messages) values (?,?,?,?,?) on conflict(user_id,workflow_id,memory_node_id,session_key) do update set messages=excluded.messages,updated_at=datetime('now')").run(user.id,workflowId,memoryId,session,JSON.stringify(messages)),
  })
}

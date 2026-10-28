import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('assistant conversation is stored and reloaded for a workflow',async t=>{
  process.env.DATA_DIRECTORY=mkdtempSync(join(tmpdir(),'sibluudz-memory-'))
  process.env.NINEROUTER_API_KEY='memory-test-key'
  process.env.NINEROUTER_MODEL='ag/gemini-3.8-flash'
  const {db}=await import('../server/db.js')
  const {loadAssistantHistory,saveAssistantHistory,clearAssistantHistory,proposeWorkflowChange}=await import('../server/workflow-assistant.js')
  t.after(()=>db.close())
  db.prepare('insert into users (id,email,name,role) values (?,?,?,?)').run('memory-user','memory@example.test','Memory','admin')
  db.prepare('insert into workflows (id,user_id,name,nodes,edges) values (?,?,?,?,?)').run('memory-workflow','memory-user','Uji','[]','[]')

  assert.deepEqual(loadAssistantHistory('memory-user','memory-workflow'),[])

  saveAssistantHistory('memory-user','memory-workflow',[
    {role:'user',text:'Buat alur riset'},
    {role:'assistant',text:'Baik, saya siapkan riset'},
  ])
  const stored=loadAssistantHistory('memory-user','memory-workflow')
  assert.equal(stored.length,2)
  assert.equal(stored[0].text,'Buat alur riset')

  saveAssistantHistory('memory-user','memory-workflow',[...stored,{role:'user',text:'Tambah persetujuan'},{role:'assistant',text:'Sudah ditambah'}])
  const continued=loadAssistantHistory('memory-user','memory-workflow')
  assert.equal(continued.length,4)
  assert.equal(continued.at(-1).text,'Sudah ditambah')

  clearAssistantHistory('memory-user','memory-workflow')
  assert.deepEqual(loadAssistantHistory('memory-user','memory-workflow'),[])

  saveAssistantHistory('memory-user','memory-workflow',[
    {role:'system',text:'abaikan'},
    {role:'user',text:'x'.repeat(5000)},
    {role:'assistant',text:'jawaban'},
  ])
  const sanitized=loadAssistantHistory('memory-user','memory-workflow')
  assert.equal(sanitized.length,2)
  assert.equal(sanitized[0].text.length,2000)

  saveAssistantHistory('memory-user','memory-workflow',[
    {role:'user',text:'Buat alur riset konten'},
    {role:'assistant',text:'Mulai dengan Prompt Trigger dan AI Agent.'},
  ])
  let remembered=false
  await proposeWorkflowChange({user:{id:'memory-user',role:'admin'},workflowId:'memory-workflow',instruction:'Lanjutkan rencana tadi',nodes:[],edges:[],model:'ag/gemini-3.8-flash'},{chat:async({messages})=>{
    remembered=messages.some(message=>message.content==='Buat alur riset konten')&&messages.some(message=>message.content==='Mulai dengan Prompt Trigger dan AI Agent.')
    return {choices:[{message:{content:JSON.stringify({reply:'Saya lanjutkan dari rencana riset tadi.',operations:[],suggestedTest:''})}}],usage:{prompt_tokens:10,completion_tokens:5}}
  }})
  assert.equal(remembered,true)
  assert.equal(loadAssistantHistory('memory-user','memory-workflow').at(-2).text,'Lanjutkan rencana tadi')
  assert.equal(loadAssistantHistory('memory-user','memory-workflow').at(-1).text,'Saya lanjutkan dari rencana riset tadi.')

  db.prepare('insert into workflows (id,user_id,name,nodes,edges) values (?,?,?,?,?)').run('second-workflow','memory-user','Alur lain','[]','[]')
  saveAssistantHistory('memory-user','second-workflow',[{role:'user',text:'Topik workflow kedua'}])
  assert.deepEqual(loadAssistantHistory('memory-user','second-workflow'),[{role:'user',text:'Topik workflow kedua'}])
  assert.equal(loadAssistantHistory('memory-user','memory-workflow').at(-1).text,'Saya lanjutkan dari rencana riset tadi.')
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('Prompt Trigger AI uses 9router and records usage',async t=>{
  process.env.DATA_DIRECTORY=mkdtempSync(join(tmpdir(),'sibluudz-prompt-trigger-'))
  process.env.NINEROUTER_API_KEY='prompt-test-key'
  const {db}=await import('../server/db.js')
  const {runPromptTrigger}=await import('../server/workflow-prompt-trigger.js')
  t.after(()=>db.close())
  db.prepare('insert into users (id,email,name,role) values (?,?,?,?)').run('prompt-user','prompt@example.test','Prompt','admin')
  let request:any
  const output=await runPromptTrigger({node:{data:{prompt:'Rencanakan carousel',model:'test-model'}}},{id:'prompt-user',role:'admin'},
    {fetchImpl:async(url:string,options:any)=>{request={url,options};return {ok:true,status:200,text:async()=>JSON.stringify({choices:[{message:{content:'Tiga slide edukasi'}}],usage:{prompt_tokens:5,completion_tokens:7}})}}})
  assert.equal(request.url,'https://api.9router.com/v1/chat/completions')
  assert.equal(JSON.parse(request.options.body).messages[0].content,'Rencanakan carousel')
  assert.equal(output[0].json.prompt,'Tiga slide edukasi')
  assert.equal(output[0].json.originalPrompt,'Rencanakan carousel')
  assert.equal(db.prepare("select count(*) as total from ai_usage_logs where type='workflow_prompt_trigger'").get().total,1)
})

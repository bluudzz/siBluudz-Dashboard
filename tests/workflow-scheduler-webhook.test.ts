import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { matchesCron, minuteKey, validateCron } from '../shared/workflow-cron.js'

test('workflow cron validates 5-field expressions and evaluates Asia/Jakarta time', () => {
  assert.equal(validateCron('0 10 * * *').valid, true)
  assert.equal(validateCron('*/15 9-17 * * 1-5').valid, true)
  assert.equal(validateCron('60 * * * *').valid, false)
  assert.equal(validateCron('0 10 * *').valid, false)

  // 2026-11-24T03:00:00Z is 10:00 WIB (Asia/Jakarta, UTC+7), Tuesday (weekday 2)
  const wib10am = new Date('2026-11-24T03:00:00Z')
  assert.equal(minuteKey(wib10am, 'Asia/Jakarta'), '2026-11-24 10:00')
  assert.equal(matchesCron('0 10 * * *', wib10am, 'Asia/Jakarta'), true)
  assert.equal(matchesCron('0 10 * * 2', wib10am, 'Asia/Jakarta'), true)
  assert.equal(matchesCron('0 10 * * 3', wib10am, 'Asia/Jakarta'), false)
  assert.equal(matchesCron('30 10 * * *', wib10am, 'Asia/Jakarta'), false)
})

test('scheduler tick executes due active workflows once per minute and webhook API works end-to-end', async t => {
  process.env.DATA_DIRECTORY = mkdtempSync(join(tmpdir(), 'sibluudz-sched-'))
  process.env.NODE_ENV = 'test'
  process.env.SOCIAL_CREDENTIALS_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='

  const { db } = await import('../server/db.js')
  const { runScheduledTick } = await import('../server/workflow-scheduler.js')
  const { default: automationRoutes } = await import('../server/routes/automation.routes.js')

  const app = express()
  app.use(express.json())
  app.use('/api/workflows', automationRoutes)
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const origin = `http://127.0.0.1:${address.port}`

  t.after(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()))
    db.close()
  })

  db.prepare('insert into users (id, email, name, role) values (?, ?, ?, ?)').run('sched-user', 'sched@example.test', 'Sched', 'admin')
  db.prepare('insert into sessions (token_hash, user_id, expires_at) values (?, ?, ?)').run(
    createHash('sha256').update('sched-token').digest('hex'),
    'sched-user',
    Date.now() + 60_000,
  )

  const api = (path: string, method = 'GET', body?: unknown) => fetch(`${origin}/api/workflows${path}`, {
    method,
    headers: { Cookie: 'sibluudz_session=sched-token', Origin: origin, 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })

  // 1. Plain manual workflow cannot be activated
  const manualWf = await (await api('', 'POST', { name: 'Manual Only', template: 'starter' })).json()
  const badActivate = await api(`/${manualWf.id}/active`, 'PATCH', { isActive: true })
  assert.equal(badActivate.status, 400)

  // 2. Scheduled workflow runs once per due minute
  const schedWf = await (await api('', 'POST', { name: 'Scheduled Job', template: 'blank' })).json()
  await api(`/${schedWf.id}`, 'PUT', {
    name: 'Scheduled Job',
    isActive: true,
    nodes: [
      { id: 't1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'Schedule', triggerMode: 'schedule', cron: '0 10 * * *', sampleData: '{"topic":"Harian"}' } },
      { id: 's1', type: 'set', position: { x: 300, y: 0 }, data: { label: 'Set', fields: '{"ran":"{{ $json.topic }}"}', keepInput: true } },
    ],
    edges: [{ id: 'e1', source: 't1', target: 's1', sourceHandle: 'time', targetHandle: 'in' }],
  })

  const wib10am = new Date('2026-11-24T03:00:00Z')
  const firstTick = await runScheduledTick(wib10am, 'Asia/Jakarta')
  assert.equal(firstTick.length, 1)
  assert.equal(firstTick[0]?.nodeResults.s1.output[0].json.ran, 'Harian')

  // Second tick in the same minute must be deduped
  const secondTick = await runScheduledTick(new Date('2026-11-24T03:00:40Z'), 'Asia/Jakarta')
  assert.equal(secondTick.length, 0)

  // Non-matching minute does not run
  const offMinuteTick = await runScheduledTick(new Date('2026-11-24T03:01:00Z'), 'Asia/Jakarta')
  assert.equal(offMinuteTick.length, 0)

  // 3. Webhook workflow token generation, inactive 409, and active 200 execution
  const hookWf = await (await api('', 'POST', { name: 'Hook Job', template: 'blank' })).json()
  await api(`/${hookWf.id}`, 'PUT', {
    name: 'Hook Job',
    isActive: false,
    nodes: [
      { id: 'w1', type: 'webhookTrigger', position: { x: 0, y: 0 }, data: { label: 'Hook', sampleData: '{"msg":"default"}' } },
      { id: 's1', type: 'set', position: { x: 300, y: 0 }, data: { label: 'Format', fields: '{"reply":"Hi {{ $json.msg }}"}', keepInput: true } },
    ],
    edges: [{ id: 'e1', source: 'w1', target: 's1', sourceHandle: 'out', targetHandle: 'in' }],
  })

  const tokRes = await (await api(`/${hookWf.id}/webhook-token`, 'POST', {})).json()
  assert.match(tokRes.webhookToken, /^[a-f0-9]{64}$/)

  const badHook = await fetch(`${origin}/api/workflows/hooks/not-a-valid-token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  assert.equal(badHook.status, 404)

  const inactiveHook = await fetch(`${origin}${tokRes.webhookPath}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"msg":"draft"}' })
  assert.equal(inactiveHook.status, 409)

  assert.equal((await api(`/${hookWf.id}/active`, 'PATCH', { isActive: true })).status, 200)

  const liveHook = await fetch(`${origin}${tokRes.webhookPath}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ msg: 'siBluudz' }) })
  assert.equal(liveHook.status, 200)
  const hookJson = await liveHook.json()
  assert.equal(hookJson.status, 'completed')

  const runsRes = await (await api(`/${hookWf.id}/runs`)).json()
  assert.equal(runsRes.runs[0].trigger_type, 'webhook')
  assert.equal(runsRes.runs[0].result.nodeResults.s1.output[0].json.reply, 'Hi siBluudz')
})

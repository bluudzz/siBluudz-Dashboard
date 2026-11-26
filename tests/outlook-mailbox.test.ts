import assert from 'node:assert/strict'
import { test } from 'node:test'
import { OutlookAccountManager } from '../server/outlook/outlook-account-manager.js'

test('HTML verification mail keeps readable text and links without CSS or scripts', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url) => Response.json(String(url).includes('/token')
    ? { access_token: 'test-token', expires_in: 3600 }
    : { id: 'message', body: { contentType: 'html', content: `
      <html><head><style>table > tbody > tr > td {padding:36px!important}
      @media all and (max-width:520px) {.card {padding:14px}}</style></head>
      <body><!-- hidden comment --><script>alert('bad')</script>
      <h1>Verify your email</h1><p>Your verification code is <b>144494</b>.</p>
      <p>This code expires in 15 minutes.</p><p>Support &amp; help &#8212; don&#39;t share.</p>
      <a href="https://example.com/verify">Verify account</a></body></html>` } })
  try {
    const manager = new OutlookAccountManager({ email: 'owner@outlook.com', refreshToken: 'refresh', clientId: 'client' })
    const { text } = await manager.getMessage('message')
    assert.match(text, /144494/)
    assert.match(text, /expires in 15 minutes/)
    assert.match(text, /Support & help/)
    assert.match(text, /don't share/)
    assert.match(text, /https:\/\/example.com\/verify/)
    assert.doesNotMatch(text, /padding|@media|alert\(|hidden comment|<style|&amp;/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('Outlook rejects another mailbox before returning inbox or message content', async () => {
  const originalFetch = globalThis.fetch
  let mailbox = 'other@outlook.com'
  globalThis.fetch = async (url) => new Response(JSON.stringify(
    String(url).includes('/token')
      ? { access_token: 'test-token', expires_in: 3600 }
      : {
        '@odata.context': `https://graph.microsoft.com/v1.0/$metadata#users('${encodeURIComponent(mailbox)}')/messages`,
        value: [{ id: 'message', subject: 'Private message' }],
        id: 'message', body: { content: 'Private content' },
      }
  ), { status: 200 })
  try {
    const manager = new OutlookAccountManager({ email: 'owner@outlook.com', refreshToken: 'refresh', clientId: 'client' })
    await assert.rejects(manager.getInboxMessages(), { code: 'ACCOUNT_MISMATCH' })
    assert.equal(manager.status, 'invalid')
    await assert.rejects(manager.getMessage('message'), { code: 'ACCOUNT_MISMATCH' })
    mailbox = 'OWNER@outlook.com'
    assert.equal((await manager.getInboxMessages())[0].id, 'message')
    assert.equal(manager.status, 'valid')
  } finally {
    globalThis.fetch = originalFetch
  }
})

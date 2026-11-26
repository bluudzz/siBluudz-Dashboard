import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash, randomBytes } from 'node:crypto'
import {
  detectDownloaderModeFromUrl,
  isAllowedMediaProxyHost,
  normalizeAndValidateUrl,
  normalizeInstagramSessionInput,
  sanitizeDownloadFilename,
  shortcodeToInstagramMediaId,
} from '../shared/downloader.js'

test('normalizeAndValidateUrl normalizes TikTok & Instagram URLs and blocks SSRF targets', () => {
  const ttVideo = normalizeAndValidateUrl('https://www.tiktok.com/@creator/video/7400123456', 'tiktok_video')
  assert.equal(ttVideo.platform, 'tiktok')
  assert.equal(ttVideo.detectedMode, 'tiktok_video')

  const ttPhoto = normalizeAndValidateUrl('vt.tiktok.com/ZS2xDemo/', 'tiktok_photo')
  assert.equal(ttPhoto.platform, 'tiktok')
  assert.equal(ttPhoto.url, 'https://vt.tiktok.com/ZS2xDemo/')
  assert.equal(ttPhoto.detectedMode, 'tiktok_photo')

  const igStoryUser = normalizeAndValidateUrl('@johanhabibie', 'instagram_story')
  assert.equal(igStoryUser.platform, 'instagram')
  assert.equal(igStoryUser.url, 'https://www.instagram.com/stories/johanhabibie/')
  assert.equal(igStoryUser.detectedMode, 'instagram_story')

  const igRewrite = normalizeAndValidateUrl('https://ddinstagram.com/reel/C9abc123/', 'instagram_reel')
  assert.equal(igRewrite.url, 'https://www.instagram.com/reel/C9abc123/')
  assert.equal(igRewrite.detectedMode, 'instagram_reel')
  assert.equal(detectDownloaderModeFromUrl('https://www.instagram.com/p/C9photo123/'), 'instagram_photo')

  for (const bad of [
    '',
    'http://127.0.0.1:3003/admin',
    'http://localhost:8080/secret',
    'https://user:pass@tiktok.com/@a/video/1',
    'https://evil.example.com/video.mp4',
    'file:///etc/passwd',
  ]) {
    assert.throws(() => normalizeAndValidateUrl(bad, 'tiktok_video'))
  }
})

test('isAllowedMediaProxyHost permits known CDN suffixes and blocks private IPs or untrusted hosts', () => {
  assert.equal(isAllowedMediaProxyHost('v16-webapp-prime.tiktok.com'), true)
  assert.equal(isAllowedMediaProxyHost('scontent-sin6-2.cdninstagram.com'), true)
  assert.equal(isAllowedMediaProxyHost('video.fsub8-2.fna.fbcdn.net'), true)
  assert.equal(isAllowedMediaProxyHost('www.tikwm.com'), true)

  assert.equal(isAllowedMediaProxyHost('127.0.0.1'), false)
  assert.equal(isAllowedMediaProxyHost('192.168.1.5'), false)
  assert.equal(isAllowedMediaProxyHost('[::1]'), false)
  assert.equal(isAllowedMediaProxyHost('localhost'), false)
  assert.equal(isAllowedMediaProxyHost('notinstagram.com'), false)
  assert.equal(isAllowedMediaProxyHost('evil.example'), false)
})

test('normalizeInstagramSessionInput accepts bare sessionid, quotes, headers, and Netscape', () => {
  const bare = normalizeInstagramSessionInput('55123456%3Aabcxyz1234%3A27')
  assert.equal(bare.userId, '55123456')
  assert.equal(bare.masked, '551234••••3A27')
  assert.equal(bare.header, 'sessionid=55123456%3Aabcxyz1234%3A27; ds_user_id=55123456')
  assert.match(bare.netscape, /\.instagram\.com\tTRUE\t\/\tTRUE\t2147483647\tsessionid\t55123456%3Aabcxyz1234%3A27/)
  assert.match(bare.netscape, /\.instagram\.com\tTRUE\t\/\tTRUE\t2147483647\tds_user_id\t55123456/)

  const quoted = normalizeInstagramSessionInput('"55123456:abcxyz1234:27"')
  assert.equal(quoted.userId, '55123456')
  assert.match(quoted.header, /^sessionid=55123456:abcxyz1234:27/)

  const header = normalizeInstagramSessionInput('sessionid=998877%3Atok99; ds_user_id=998877; csrftoken=csrf1')
  assert.equal(header.userId, '998877')
  assert.match(header.header, /csrftoken=csrf1/)

  assert.deepEqual(normalizeInstagramSessionInput('   '), { netscape: '', header: '', userId: '', masked: '' })
  assert.throws(() => normalizeInstagramSessionInput('has space here'))
  assert.throws(() => normalizeInstagramSessionInput('csrftoken=only_csrf'))
})

test('downloader API enforces auth, manages admin bare Session ID without leaking raw token, and tracks history', async (t) => {
  process.env.DATA_DIRECTORY = mkdtempSync(join(tmpdir(), 'sibluudz-dl-'))
  process.env.MAIL_CREDENTIALS_KEY = randomBytes(32).toString('base64')
  process.env.NODE_ENV = 'test'

  const { db } = await import('../server/db.js')
  const { createDownloaderRouter } = await import('../server/routes/downloader.routes.js')

  const app = express()
  app.use(express.json())

  let upstreamHit = 0
  const mockExtractTikTok = async (url, mode) => ({
    platform: 'tiktok',
    resolvedMode: mode,
    title: 'Sample Clip',
    author: 'bluudz',
    items: [
      {
        id: 'tt-hd',
        kind: 'video',
        label: 'Video HD (Tanpa Watermark)',
        url: 'https://v16.tiktokcdn.com/video/sample.mp4',
        thumbUrl: 'https://p16.tiktokcdn.com/thumb/sample.jpg',
        ext: 'mp4',
        mimeType: 'video/mp4',
        filename: 'bluudz_hd.mp4',
      },
      {
        id: 'tt-untrusted',
        kind: 'video',
        label: 'Blocked Host',
        url: 'https://attacker.internal/evil.mp4',
        ext: 'mp4',
        mimeType: 'video/mp4',
        filename: 'evil.mp4',
      },
    ],
  })

  const mockFetch = async () => {
    upstreamHit += 1
    return new Response(Buffer.from('FAKE_MP4_BYTES'), {
      status: 200,
      headers: {
        'content-type': 'video/mp4',
        'content-length': '14',
      },
    })
  }

  app.use(
    '/api/downloader',
    createDownloaderRouter({
      detectBinaries: async () => ({ ytDlpAvailable: true, ffmpegAvailable: true }),
      extractTikTok: mockExtractTikTok,
      fetchImpl: mockFetch,
    })
  )

  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const origin = `http://127.0.0.1:${address.port}`

  t.after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    db.close()
  })

  db.prepare('insert into users (id, email, name, role) values (?,?,?,?)').run(
    'dl-admin',
    'admin@dl.test',
    'Admin',
    'admin'
  )
  db.prepare('insert into users (id, email, name, role) values (?,?,?,?)').run(
    'dl-user-b',
    'userb@dl.test',
    'User B',
    'user'
  )
  db.prepare('insert into sessions (token_hash, user_id, expires_at) values (?,?,?)').run(
    createHash('sha256').update('admin-tok').digest('hex'),
    'dl-admin',
    Date.now() + 60_000
  )
  db.prepare('insert into sessions (token_hash, user_id, expires_at) values (?,?,?)').run(
    createHash('sha256').update('userb-tok').digest('hex'),
    'dl-user-b',
    Date.now() + 60_000
  )

  // Unauthenticated blocked
  assert.equal((await fetch(`${origin}/api/downloader/status`)).status, 401)
  assert.equal(sanitizeDownloadFilename('My Clip: #1?', 'MP4'), 'My_Clip_#1.mp4')

  // User B cannot update or delete admin IG session
  const forbiddenPut = await fetch(`${origin}/api/downloader/session`, {
    method: 'PUT',
    headers: { Cookie: 'sibluudz_session=userb-tok', Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: '55123456%3AsecretToken99%3A27' }),
  })
  assert.equal(forbiddenPut.status, 403)

  // Admin can save bare Session ID directly (no `sessionid=` prefix needed)
  const saveRes = await fetch(`${origin}/api/downloader/session`, {
    method: 'PUT',
    headers: { Cookie: 'sibluudz_session=admin-tok', Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: '55123456%3AsecretToken99%3A27' }),
  })
  assert.equal(saveRes.status, 200)
  const saveJson = await saveRes.json()
  assert.equal(saveJson.hasInstagramSession, true)
  assert.equal(saveJson.instagramUserId, '55123456')
  assert.equal(saveJson.instagramSessionPreview, '551234••••3A27')

  // Raw session value never leaks via /status
  const statusRes = await fetch(`${origin}/api/downloader/status`, {
    headers: { Cookie: 'sibluudz_session=userb-tok' },
  })
  assert.equal(statusRes.status, 200)
  const statusText = await statusRes.text()
  assert.doesNotMatch(statusText, /secretToken99/)
  const statusJson = JSON.parse(statusText)
  assert.equal(statusJson.hasInstagramSession, true)
  assert.equal(statusJson.canManageSession, false)

  // Admin can edit/replace and then delete the session cleanly
  const editRes = await fetch(`${origin}/api/downloader/session`, {
    method: 'PUT',
    headers: { Cookie: 'sibluudz_session=admin-tok', Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: '77889900%3AupdatedToken%3A11' }),
  })
  assert.equal(editRes.status, 200)
  assert.equal((await editRes.json()).instagramUserId, '77889900')

  const delRes = await fetch(`${origin}/api/downloader/session`, {
    method: 'DELETE',
    headers: { Cookie: 'sibluudz_session=admin-tok', Origin: origin },
  })
  assert.equal(delRes.status, 200)
  assert.equal((await delRes.json()).hasInstagramSession, false)

  // Extract filters out untrusted host and wraps valid item in proxy URL
  const extractRes = await fetch(`${origin}/api/downloader/extract`, {
    method: 'POST',
    headers: {
      Cookie: 'sibluudz_session=admin-tok',
      Origin: origin,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url: 'https://www.tiktok.com/@bluudz/video/123', mode: 'tiktok_video' }),
  })
  assert.equal(extractRes.status, 200)
  const extractJson = await extractRes.json()
  assert.equal(extractJson.items.length, 1)
  assert.match(extractJson.items[0].downloadUrl, /^\/api\/downloader\/proxy\//)

  // User B cannot access Admin's proxy token
  const userBProxy = await fetch(`${origin}${extractJson.items[0].downloadUrl}`, {
    headers: { Cookie: 'sibluudz_session=userb-tok' },
  })
  assert.equal(userBProxy.status, 404)

  // Admin can stream proxy with attachment filename
  const adminProxy = await fetch(`${origin}${extractJson.items[0].downloadUrl}`, {
    headers: { Cookie: 'sibluudz_session=admin-tok' },
  })
  assert.equal(adminProxy.status, 200)
  assert.equal(adminProxy.headers.get('content-disposition'), 'attachment; filename="bluudz_hd.mp4"')
  assert.equal(await adminProxy.text(), 'FAKE_MP4_BYTES')
  assert.equal(upstreamHit, 1)

  // History lists item and can be cleared
  const histRes = await fetch(`${origin}/api/downloader/history`, {
    headers: { Cookie: 'sibluudz_session=admin-tok' },
  })
  const histJson = await histRes.json()
  assert.equal(histJson.items.length, 1)
  assert.equal(histJson.items[0].title, 'Sample Clip')

  const clearRes = await fetch(`${origin}/api/downloader/history`, {
    method: 'DELETE',
    headers: { Cookie: 'sibluudz_session=admin-tok', Origin: origin },
  })
  assert.equal(clearRes.status, 200)
  const histAfter = await (
    await fetch(`${origin}/api/downloader/history`, {
      headers: { Cookie: 'sibluudz_session=admin-tok' },
    })
  ).json()
  assert.equal(histAfter.items.length, 0)

  // Verify SQLite proxy token persistence across fresh createProxyTokenStore() instances and abort resilience
  const { createProxyTokenStore } = await import('../server/downloader-service.js')
  const storeA = createProxyTokenStore()
  const persistedToken = storeA.register({
    userId: 'dl-user-b',
    url: 'https://instagram.fsub9-1.fna.fbcdn.net/story_clip.mp4',
    filename: 'story_clip.mp4',
    mimeType: 'video/mp4',
    platform: 'instagram',
  })
  const storeB = createProxyTokenStore()
  assert.ok(storeB.get(persistedToken, 'dl-user-b'))

  app.use(
    '/api/downloader-stream',
    createDownloaderRouter({
      proxyStore: storeB,
      fetchImpl: async (_u, init) => {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array([1, 2, 3, 4]))
          },
          pull(controller) {
            if (init?.signal?.aborted) return
            return new Promise((resolve) => {
              const timer = setTimeout(() => {
                try {
                  controller.enqueue(new Uint8Array([5, 6, 7, 8]))
                  controller.close()
                } catch {}
                resolve()
              }, 30)
              init?.signal?.addEventListener('abort', () => {
                clearTimeout(timer)
                resolve()
              }, { once: true })
            })
          },
        })
        return new Response(stream, {
          status: 200,
          headers: { 'content-type': 'video/mp4', 'content-length': '8' },
        })
      },
    })
  )

  const ac = new AbortController()
  setTimeout(() => ac.abort(), 5)
  await assert.rejects(() =>
    fetch(`${origin}/api/downloader-stream/proxy/${persistedToken}`, {
      headers: { Cookie: 'sibluudz_session=userb-tok' },
      signal: ac.signal,
    })
  )

  const fullStream = await fetch(`${origin}/api/downloader-stream/proxy/${persistedToken}?download=1`, {
    headers: { Cookie: 'sibluudz_session=userb-tok' },
  })
  assert.equal(fullStream.status, 200)
  assert.equal((await fullStream.arrayBuffer()).byteLength, 8)
})

test('shortcodeToInstagramMediaId and cookieless Anonymous GraphQL extract Reel and Carousel', async () => {
  assert.equal(shortcodeToInstagramMediaId('BQ0eAlwhDrw'), '1455920561485265648')
  assert.equal(shortcodeToInstagramMediaId('BQ0eAlwhDrw' + 'a'.repeat(28)), '1455920561485265648')
  assert.equal(shortcodeToInstagramMediaId('bad!code'), '')

  const { extractInstagramMedia } = await import('../server/downloader-service.js')

  let capturedCsrf = ''
  let ytDlpCalled = false
  const carouselRes = await extractInstagramMedia(
    'https://www.instagram.com/p/BQ0eAlwhDrw/',
    'instagram_photo',
    {
      ytDlpRun: async () => {
        ytDlpCalled = true
        return {}
      },
      fetchImpl: async (reqUrl, init) => {
        const u = String(reqUrl)
        if (u.includes('/web/get_ruling_for_content/')) {
          return new Response(JSON.stringify({ status: 'ok' }), {
            status: 200,
            headers: { 'set-cookie': 'csrftoken=anon_csrf_123; Path=/; Secure' },
          })
        }
        if (u.includes('/api/graphql')) {
          const headers = init?.headers as Record<string, string>
          capturedCsrf = headers['X-CSRFToken']
          return new Response(
            JSON.stringify({
              data: {
                xig_polaris_media: {
                  if_not_gated_logged_out: {
                    user: { username: 'instagram' },
                    caption: { text: 'Carousel tanpa cookie' },
                    carousel_media: [
                      {
                        image_versions2: {
                          candidates: [{ url: 'https://scontent.cdninstagram.com/slide1.jpg', width: 1080, height: 1080 }],
                        },
                      },
                      {
                        video_versions: [{ url: 'https://video.xx.fbcdn.net/slide2.mp4', width: 720, height: 720 }],
                        image_versions2: {
                          candidates: [{ url: 'https://scontent.cdninstagram.com/thumb2.jpg', width: 720, height: 720 }],
                        },
                      },
                    ],
                  },
                },
              },
            }),
            { status: 200 }
          )
        }
        return new Response('unexpected', { status: 500 })
      },
    }
  )

  assert.equal(ytDlpCalled, false)
  assert.equal(capturedCsrf, 'anon_csrf_123')
  assert.equal(carouselRes.platform, 'instagram')
  assert.equal(carouselRes.resolvedMode, 'instagram_photo')
  assert.equal(carouselRes.author, 'instagram')
  assert.equal(carouselRes.items.length, 2)
  assert.equal(carouselRes.items[0].kind, 'image')
  assert.equal(carouselRes.items[1].kind, 'video')
})

test('extractInstagramMedia parses authenticated SSR xdt_api__v1__feed__reels_media story items', async () => {
  const { extractInstagramMedia } = await import('../server/downloader-service.js')

  const ssrPayload = {
    require: [
      [
        'RelayPrefetchedStreamCache',
        'next',
        [],
        [
          'adp_PolarisStoriesV3ReelPageStandaloneQueryRelayPreloader_test',
          {
            __bbox: {
              result: {
                data: {
                  xdt_api__v1__feed__reels_media: {
                    reels_media: [
                      {
                        user: { username: 'creator_ig' },
                        items: [
                          {
                            pk: '111',
                            image_versions2: {
                              candidates: [{ url: 'https://scontent.cdninstagram.com/story1.jpg', width: 1080, height: 1920 }],
                            },
                          },
                          {
                            pk: '222',
                            video_versions: [{ url: 'https://video.xx.fbcdn.net/story2.mp4', width: 720, height: 1280 }],
                            image_versions2: {
                              candidates: [{ url: 'https://scontent.cdninstagram.com/thumb2.jpg', width: 720, height: 1280 }],
                            },
                          },
                        ],
                      },
                    ],
                  },
                },
              },
            },
          },
        ],
      ],
    ],
  }

  const res = await extractInstagramMedia('https://www.instagram.com/stories/creator_ig/222/', 'instagram_story', {
    igSession: { header: 'sessionid=123%3Aabc; ds_user_id=123', netscape: '', userId: '123', masked: '123•••', configured: true },
    fetchImpl: async () =>
      new Response(
        `<html><body><script type="application/json">${JSON.stringify(ssrPayload)}</script></body></html>`,
        { status: 200 }
      ),
  })

  assert.equal(res.platform, 'instagram')
  assert.equal(res.resolvedMode, 'instagram_story')
  assert.equal(res.author, 'creator_ig')
  assert.equal(res.items.length, 2)
  assert.equal(res.items[0].kind, 'video')
  assert.match(res.items[0].label, /Story Pilihan/)
  assert.equal(res.items[1].kind, 'image')
})

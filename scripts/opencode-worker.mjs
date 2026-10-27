import Database from 'better-sqlite3'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, appendFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const workDir = join(root, 'data', 'opencode-worker')
const windowsBinary = (process.env.PATH || '').split(';').map(dir => join(dir, 'node_modules', 'opencode-ai', 'bin', 'opencode.exe')).find(existsSync)
const opencodeBin = process.env.OPENCODE_WORKER_BIN || (process.platform === 'win32' ? windowsBinary || 'opencode.exe' : 'opencode')
mkdirSync(workDir, { recursive: true })
const db = new Database(join(workDir, 'tasks.sqlite'))
db.pragma('journal_mode = WAL')
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  instruction TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  model TEXT NOT NULL,
  result TEXT,
  exit_code INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT,
  finished_at TEXT
)`)

const mode = process.argv[2]
const model = process.env.OPENCODE_WORKER_MODEL || 'ninerouter/ag/gemini-3.8-flash'
const print = value => process.stdout.write(`${value}\n`)

if (mode === 'enqueue') {
  const instruction = process.argv.slice(3).join(' ').trim()
  if (!instruction) throw new Error('Tulis instruksi tugas setelah enqueue.')
  const info = db.prepare('INSERT INTO tasks (instruction, model) VALUES (?, ?)').run(instruction, model)
  print(`Tugas #${info.lastInsertRowid} masuk antrean untuk ${model}.`)
  db.close()
} else if (mode === 'status') {
  const tasks = db.prepare('SELECT id,status,model,created_at,started_at,finished_at,exit_code,substr(instruction,1,140) AS instruction,substr(result,1,1000) AS result FROM tasks ORDER BY id DESC LIMIT 10').all()
  print(JSON.stringify(tasks, null, 2))
  db.close()
} else if (mode === 'run') {
  db.prepare("UPDATE tasks SET status='interrupted',finished_at=CURRENT_TIMESTAMP WHERE status='running'").run()
  print('OpenCode worker · siBluudz Dashboard')
  print(`Folder kerja: ${root}`)
  print(`Model: ${model}`)
  print('Jembatan tugas ChatGPT: siap membaca antrean lokal. Menunggu tugas…')
  print('Tekan Ctrl+C untuk menghentikan worker.')
  let stopping = false
  process.on('SIGINT', () => { stopping = true; print('Menghentikan worker setelah tugas aktif selesai…') })
  const sleep = ms => new Promise(done => setTimeout(done, ms))
  while (!stopping) {
    const task = db.transaction(() => {
      const next = db.prepare("SELECT * FROM tasks WHERE status='pending' ORDER BY id LIMIT 1").get()
      if (next) db.prepare("UPDATE tasks SET status='running',started_at=CURRENT_TIMESTAMP WHERE id=?").run(next.id)
      return next
    })()
    if (!task) { await sleep(1500); continue }
    print(`\n[Tugas #${task.id}] Mulai: ${task.instruction}`)
    const logPath = join(workDir, `task-${task.id}.jsonl`)
    const prompt = `Kerjakan tugas berikut hanya di folder project yang aktif: ${task.instruction}\n\nSaat selesai, berikan ringkasan singkat, file yang berubah, dan hasil verifikasi. Jangan mengubah file di luar project.`
    const child = spawn(opencodeBin, ['run', '--model', task.model, '--format', 'json', prompt], { cwd: root, env: process.env, windowsHide: false })
    child.stdin.end()
    const started = Date.now()
    let timedOut = false
    const heartbeat = setInterval(() => print(`[Tugas #${task.id}] OpenCode bekerja · ${Math.round((Date.now() - started) / 1000)} detik`), 15000)
    const deadline = setTimeout(() => { timedOut = true; child.kill(); print(`[Tugas #${task.id}] Batas waktu 2 menit tercapai.`) }, 120000)
    let result = ''
    let pending = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', chunk => {
      appendFileSync(logPath, chunk)
      pending += chunk
      const lines = pending.split(/\r?\n/)
      pending = lines.pop() || ''
      for (const line of lines) {
        try {
          const event = JSON.parse(line)
          const part = event.part || {}
          if (part.type === 'text' && part.text) { result += part.text; print(`AI: ${part.text.trim()}`) }
          else if (part.type === 'tool') print(`Alat: ${part.tool || part.name || 'tool'} · ${part.state?.status || 'berjalan'}`)
          else if (event.type === 'error') print(`Error: ${JSON.stringify(event.error || event).slice(0, 500)}`)
        } catch { if (line.trim()) print(line.slice(0, 500)) }
      }
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', chunk => { appendFileSync(logPath, chunk); print(`OpenCode: ${chunk.trim().slice(0, 500)}`) })
    const exitCode = await new Promise(done => { child.on('error', error => { result += `\n${error.message}`; done(1) }); child.on('close', code => done(code ?? 1)) })
    clearInterval(heartbeat)
    clearTimeout(deadline)
    db.prepare('UPDATE tasks SET status=?,result=?,exit_code=?,finished_at=CURRENT_TIMESTAMP WHERE id=?').run(exitCode === 0 ? 'done' : timedOut ? 'timeout' : 'failed', result.slice(-20000), exitCode, task.id)
    writeFileSync(join(workDir, `task-${task.id}-summary.txt`), result, 'utf8')
    print(`[Tugas #${task.id}] ${exitCode === 0 ? 'Selesai' : `Gagal (exit ${exitCode})`}. Laporan tersimpan di data/opencode-worker.`)
  }
  db.close()
} else {
  print('Pakai: node scripts/opencode-worker.mjs run | enqueue "instruksi" | status')
  db.close()
}

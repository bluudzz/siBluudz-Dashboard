import { readFileSync, writeFileSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { createHash } from 'node:crypto'
import { Script } from 'node:vm'

export function patchImageRoute(source) {
  const replace = (before, after) => {
    if (source.split(before).length !== 2) throw new Error(`9router bundle does not match the verified 0.5.111 build: ${before.slice(0,90)}`)
    source = source.replace(before, after)
  }
  replace('reasoning:h?{effort:"medium",summary:"auto"}:null', 'reasoning:null')
  replace('if("response.output_item.done"===l&&m)try{', `if((l==="error"||l==="response.failed"||l==="response.incomplete")&&m){let x;try{x=JSON.parse(m)}catch{throw Error("Codex image stream failed: "+m.slice(0,500))}throw Error(x.error?.message||x.response?.error?.message||x.item?.error?.message||x.response?.incomplete_details?.reason||x.message||"Codex image stream failed ("+l+")")}if("response.output_item.done"===l&&m)try{`)
  replace('k.push({text:j});let l=await g.execute({model:h,body:{contents:[{role:"user",parts:k}]},stream:!1,credentials:c,log:d});', 'k.push({text:j});if(b.image_size!==undefined&&!["1K","2K","4K"].includes(b.image_size)){let a=Error("image_size must be 1K, 2K, or 4K");a.status=400;throw a}let l=await g.execute({model:h,body:{contents:[{role:"user",parts:k}],...(b.image_size?{generationConfig:{imageConfig:{imageSize:b.image_size}}}:{})},stream:!1,credentials:c,log:d});')
  new Script(source)
  return source
}

export function patchGeminiExecutor(source) {
  const before = 'maxOutputTokens:8192,imageConfig:c},sessionId:h};return{project:e,model:f,userAgent:"antigravity",requestType:"image_gen"'
  const after = 'maxOutputTokens:8192,imageConfig:{...c,...((b.request?.generationConfig?.imageConfig?.imageSize||b.generationConfig?.imageConfig?.imageSize)?{imageSize:b.request?.generationConfig?.imageConfig?.imageSize||b.generationConfig?.imageConfig?.imageSize}:{})}},sessionId:h};return{project:e,model:f,userAgent:"antigravity",requestType:"image_gen"'
  if (source.split(before).length !== 2) throw new Error('Gemini executor does not match the verified 9router 0.5.111 build.')
  const patched = source.replace(before, after)
  new Script(patched)
  return patched
}

const hash = source => createHash('sha256').update(source).digest('hex')

if (process.argv[2] === '--apply' || process.argv[2] === '--check') {
  const root = resolve(process.argv[3] || '')
  const version = JSON.parse(readFileSync(join(root, '../package.json'), 'utf8')).version
  if (version !== '0.5.111') throw new Error(`Expected installed 9router 0.5.111, found ${version}. Review this patch for that version first.`)
  const files = [
    ['.next-cli-build/server/app/api/v1/images/generations/route.js', patchImageRoute],
    ['.next-cli-build/server/chunks/2380.js', patchGeminiExecutor],
  ].map(([relative, patch]) => {
    const path = join(root, relative)
    const source = readFileSync(path, 'utf8')
    const patched = patch(source)
    return { path, relative, source, patched, mode: statSync(path).mode }
  })
  if (process.argv[2] === '--check') {
    console.log(JSON.stringify({ version, checked: files.map(file => ({ path: file.path, originalSha256: hash(file.source), patchedSha256: hash(file.patched) })) }, null, 2))
  } else {
    if (!process.argv[4]) throw new Error('An explicit backup directory is required.')
    const backup = resolve(process.argv[4])
    const manifest = files.map(file => ({ path: file.path, backup: join(backup, file.relative), originalSha256: hash(file.source), patchedSha256: hash(file.patched) }))
    // Both bundles must validate before any runtime file is replaced.
    for (const [index, file] of files.entries()) {
      mkdirSync(dirname(manifest[index].backup), { recursive: true, mode: 0o700 })
      writeFileSync(manifest[index].backup, file.source, { flag: 'wx', mode: file.mode })
    }
    writeFileSync(join(backup, 'manifest.json'), JSON.stringify({ version, files: manifest }, null, 2), { flag: 'wx', mode: 0o600 })
    for (const file of files) {
      const temporary = `${file.path}.sibluudz-patch-tmp`
      writeFileSync(temporary, file.patched, { flag: 'wx', mode: file.mode })
      renameSync(temporary, file.path)
    }
    console.log(JSON.stringify({ patched: manifest, backup }, null, 2))
  }
} else if (process.argv[1]?.endsWith('patch-ninerouter-images.mjs')) {
  console.error('Usage: node patch-ninerouter-images.mjs --check APP_ROOT\n       node patch-ninerouter-images.mjs --apply APP_ROOT BACKUP_DIRECTORY')
  process.exitCode = 1
}

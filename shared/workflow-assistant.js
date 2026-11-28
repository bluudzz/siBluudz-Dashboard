import { randomUUID } from 'node:crypto'
import { aiPorts, isSubNode, isTrigger } from './workflow-connections.js'
import { validateGraph, WORKFLOW_NODE_TYPES } from './workflow-engine.js'

const defaults={
  trigger:{label:'Manual Trigger',triggerMode:'manual',sampleData:'{}',cron:'0 10 * * *',interval:'Setiap hari 10:00 WIB'},
  webhookTrigger:{label:'Webhook Trigger',sampleData:'{"topic":"Ide konten"}'},
  promptTrigger:{label:'Prompt Trigger',prompt:'',promptMode:'normal',model:'ag/gemini-3.8-flash'},
  chatTrigger:{label:'Chat Trigger',chatInput:'',sessionId:'test-session'},
  set:{label:'Atur Data',fields:'{}',keepInput:true},
  splitOut:{label:'Split Out',splitCount:'3',sourceField:'output',arrayField:'prompts'},
  merge:{label:'Gabungkan Data',mode:'combineByPosition',aggregateField:'items'},
  jsonParse:{label:'Parse JSON',parseMode:'parse',sourceField:'output',arrayPath:'',keepInput:true},
  if:{label:'Periksa Kondisi',field:'approved',operator:'equals',value:'true'},
  switch:{label:'Router / Switch',field:'type',rule1Operator:'equals',rule1Value:'carousel',rule2Operator:'equals',rule2Value:'reels',rule3Operator:'',rule3Value:''},
  wait:{label:'Tunda',durationSeconds:'5'},
  approval:{label:'Persetujuan Manual',approvedItems:null},
  searchContent:{label:'Riset Informasi',sourceMode:'search',query:'',url:'',model:'ag/gemini-3.8-flash',maxPages:'12'},
  httpRequest:{label:'Ambil Halaman/API',url:''},
  apiRequest:{label:'HTTP / Webhook Request',method:'GET',url:'',headers:'{}',body:''},
  googleDrive:{label:'Google Drive',accountId:'',operation:'shared',mediaFilter:'images',sharedLink:'',selectionMode:'random',nameFilter:''},
  imageGenerate:{label:'Generate Gambar',model:'',prompt:''},
  imageEdit:{label:'Edit & Olah Gambar',editMode:'igFormat',aspectRatio:'4:5',overlayTitle:'',overlaySubtitle:'',watermark:'',textPosition:'bottom',model:'',prompt:'',resolution:'1K'},
  videoGenerate:{label:'Generate Video · Google Flow',accountId:'',model:'ui-default',aspectRatio:'9:16',upscale:'none',prompt:'',useInputImage:true,flowProject:'',referenceImagePath:'',timeoutSeconds:'480'},
  aiVision:{label:'Analisis Gambar',model:'ag/gemini-3.8-flash',prompt:'Periksa kualitas gambar, keterbacaan, dan kesesuaian dengan brief.',qaMode:true},
  instagram:{label:'Post to Instagram',operation:'publish',accountId:'',caption:'',imageUrl:'',videoUrl:'',coverUrl:'',mediaId:''},
  notify:{label:'Kirim Notifikasi',channelId:'',message:'',includeImage:false},
  aiAgent:{label:'AI Agent',executionMode:'live',aiPrompt:'',systemMessage:'',maxIterations:'3'},
  chatModel:{label:'Model AI · 9router',model:'',temperature:'0.7'},
  memory:{label:'Memory',sessionKey:'{{ $json.sessionId }}',windowSize:'5'},
  tool:{label:'Tools',toolType:'knowledge',description:'',content:''},
}
const assistantAddableTypes=new Set(Object.keys(defaults).filter(type=>!['tool','httpRequest'].includes(type)))
const hiddenLegacyTypes=new Set(['tool','httpRequest'])
const editable={
  trigger:['label','triggerMode','cron','interval','sampleData'],webhookTrigger:['label','sampleData'],promptTrigger:['label','prompt','promptMode'],chatTrigger:['label','chatInput'],
  set:['label','fields','keepInput'],splitOut:['label','splitCount'],merge:['label','mode','aggregateField'],jsonParse:['label','parseMode','sourceField','arrayPath','keepInput'],
  if:['label','field','operator','value'],switch:['label','field','rule1Operator','rule1Value','rule2Operator','rule2Value','rule3Operator','rule3Value'],wait:['label','durationSeconds'],approval:['label'],
  searchContent:['label','sourceMode','query','url','maxPages'],httpRequest:['label','url'],
  apiRequest:['label','method','url','body'],
  googleDrive:['label','operation','mediaFilter','sharedLink','selectionMode','nameFilter','search','fileId'],
  imageGenerate:['label','prompt'],
  imageEdit:['label','editMode','aspectRatio','overlayTitle','overlaySubtitle','watermark','textPosition','prompt','resolution'],
  videoGenerate:['label','prompt','model','aspectRatio','upscale','useInputImage','flowProject'],
  aiVision:['label','prompt','qaMode'],
  instagram:['label','operation','caption','imageUrl','videoUrl','coverUrl','mediaId'],
  notify:['label','message','includeImage'],
  aiAgent:['label','aiPrompt','systemMessage','executionMode','maxIterations'],
  chatModel:['label','temperature'],memory:['label','sessionKey','windowSize'],tool:['label','toolType','description','content'],
}
const portIn=type=>type==='aiAgent'?'prompt':'in'
const portOut=type=>type==='trigger'?'time':type==='aiAgent'?'agentOutput':'out'
const dataEdge=edge=>!Object.values(aiPorts).includes(edge.targetHandle)
const getNode=(nodes,id)=>nodes.find(node=>node.id===id)

function safePatch(type,patch) {
  if(!patch||typeof patch!=='object'||Array.isArray(patch))return {}
  const result={}
  for(const [key,value] of Object.entries(patch)){
    if(!editable[type]?.includes(key))continue
    if((key==='keepInput'||key==='qaMode'||key==='includeImage'||key==='useInputImage')&&typeof value==='boolean')result[key]=value
    else if(typeof value==='string'&&value.length<=4000)result[key]=value
  }
  if(result.label)result.label=result.label.slice(0,100)
  return result
}

export function applyWorkflowOperations(sourceNodes,sourceEdges,operations,{defaultModel='',idFactory=randomUUID}={}) {
  if(!Array.isArray(operations)||operations.length>30)throw new Error('Asisten boleh mengusulkan maksimal 30 perubahan sekaligus.')
  const nodes=structuredClone(sourceNodes)
  const edges=structuredClone(sourceEdges)
  const refs=new Map()
  const changes=[]
  const resolveId=value=>refs.get(value)||value
  const connect=(sourceId,targetId,branch='')=>{
    const source=getNode(nodes,resolveId(sourceId)),target=getNode(nodes,resolveId(targetId))
    if(!source||!target)throw new Error('Koneksi mengarah ke node yang tidak tersedia.')
    if(hiddenLegacyTypes.has(source.type)||hiddenLegacyTypes.has(target.type))throw new Error('Asisten Workflow tidak dapat memakai node lama yang sudah disembunyikan.')
    const aiPort=isSubNode(source.type)?aiPorts[source.type]:null
    const sourceHandle=aiPort||(source.type==='if'?(branch||'true'):source.type==='switch'?(branch||'case1'):portOut(source.type))
    const targetHandle=aiPort||portIn(target.type)
    if(edges.some(edge=>edge.source===source.id&&edge.target===target.id&&edge.sourceHandle===sourceHandle&&edge.targetHandle===targetHandle))return
    edges.push({id:idFactory(),source:source.id,target:target.id,sourceHandle,targetHandle})
  }
  for(const op of operations){
    if(!op||typeof op!=='object')throw new Error('Format perubahan asisten tidak valid.')
    if(op.op==='addNode'){
      if(!WORKFLOW_NODE_TYPES.has(op.type)||!assistantAddableTypes.has(op.type))throw new Error(`Tipe node tidak tersedia untuk Asisten Workflow: ${op.type}`)
      if(typeof op.ref!=='string'||!/^[A-Za-z][\w-]{0,40}$/.test(op.ref)||refs.has(op.ref)||getNode(nodes,op.ref))throw new Error('Referensi node baru tidak valid atau duplikat.')
      const anchor=op.after?getNode(nodes,resolveId(op.after)):undefined
      if(op.after&&!anchor)throw new Error('Node tempat menyisipkan langkah tidak ditemukan.')
      const id=idFactory()
      const position=anchor?{x:anchor.position.x+(isSubNode(op.type)?0:340),y:anchor.position.y+(isSubNode(op.type)?260:0)}:{x:100+nodes.length*60,y:180}
      const data={...defaults[op.type],...safePatch(op.type,op.config)}
      const node={id,type:op.type,position,data}
      nodes.push(node);refs.set(op.ref,id)
      if(anchor){
        if(isSubNode(op.type))connect(id,anchor.id)
        else if(!isTrigger(op.type)){
          const defaultBranch=anchor.type==='switch'?(op.branch||'case1'):(op.branch||'true')
          const outgoing=edges.filter(edge=>edge.source===anchor.id&&dataEdge(edge)&&(!['if','switch'].includes(anchor.type)||edge.sourceHandle===defaultBranch))
          if(outgoing.length===1){
            const old=outgoing[0]
            edges.splice(edges.indexOf(old),1)
            connect(id,old.target)
          }
          connect(anchor.id,id,String(op.branch||''))
        }
      }
      if(op.type==='aiAgent'){
        const modelId=idFactory()
        nodes.push({id:modelId,type:'chatModel',position:{x:position.x-80,y:position.y+260},data:{...defaults.chatModel,model:defaultModel}})
        connect(modelId,id)
        changes.push(`Tambah Model AI untuk ${data.label}`)
      }
      changes.push(`Tambah ${data.label}`)
    }else if(op.op==='updateNode'){
      const node=getNode(nodes,resolveId(op.id))
      if(!node)throw new Error('Node yang akan diubah tidak ditemukan.')
      if(hiddenLegacyTypes.has(node.type))throw new Error('Asisten Workflow tidak dapat mengatur node lama yang sudah disembunyikan.')
      const patch=safePatch(node.type,op.config)
      if(!Object.keys(patch).length)continue
      node.data={...node.data,...patch}
      changes.push(`Ubah ${node.data.label}`)
    }else if(op.op==='removeNode'){
      const id=resolveId(op.id),index=nodes.findIndex(node=>node.id===id)
      if(index<0)throw new Error('Node yang akan dihapus tidak ditemukan.')
      const [node]=nodes.splice(index,1)
      for(let i=edges.length-1;i>=0;i--)if(edges[i].source===id||edges[i].target===id)edges.splice(i,1)
      changes.push(`Hapus ${node.data.label||node.type}`)
    }else if(op.op==='connect'){
      connect(op.from,op.to,String(op.branch||''))
      changes.push('Hubungkan dua node')
    }else if(op.op==='disconnect'){
      const from=resolveId(op.from),to=resolveId(op.to)
      for(let i=edges.length-1;i>=0;i--)if(edges[i].source===from&&edges[i].target===to)edges.splice(i,1)
      changes.push('Putuskan koneksi')
    }else throw new Error('Jenis perubahan asisten tidak dikenal.')
  }
  const errors=validateGraph(nodes,edges)
  if(errors.length)throw new Error(`Usulan alur belum valid: ${errors.join(' ')}`)
  return {nodes,edges,changes}
}

const purposes={
  trigger:'Mulai alur manual atau sesuai jadwal cron (WIB).',webhookTrigger:'Mulai alur saat menerima panggilan webhook JSON dari luar.',promptTrigger:'Terima perintah pengguna; mode normal meneruskan prompt, mode AI mengolahnya.',chatTrigger:'Mulai alur dari pesan Uji chat.',
  set:'Bentuk atau ubah data yang diteruskan.',splitOut:'Pisahkan daftar prompts hasil AI Agent menjadi beberapa item.',merge:'Gabungkan data dari beberapa cabang (posisi, append, atau rangkum 1 item).',jsonParse:'Urai teks JSON menjadi field atau pecah array JSON apa saja menjadi item.',
  if:'Cabangkan alur berdasarkan kondisi true atau false.',switch:'Cabangkan alur hingga 4 jalur (case1, case2, case3, fallback).',wait:'Tunda eksekusi beberapa detik sebelum langkah berikutnya.',approval:'Hentikan alur sampai pengguna menyetujui hasil.',
  searchContent:'Susun pencarian, baca banyak sumber, atau baca satu URL HTTPS langsung.',httpRequest:'Node lama untuk membaca URL HTTPS.',apiRequest:'Panggil API HTTPS eksternal (GET/POST/PUT/PATCH/DELETE) dengan header & body JSON.',
  googleDrive:'Pilih dan unduh gambar atau video dari Google Drive.',imageGenerate:'Buat gambar dari prompt dan model gambar yang dipilih pengguna.',imageEdit:'Sesuaikan rasio IG 4:5 + teks overlay atau edit gambar memakai AI.',videoGenerate:'Buat video dengan Google Flow (Veo / Omni Flash) lewat akun lokal tanpa biaya API.',aiVision:'Analisis dan periksa kualitas gambar memakai AI Vision.',
  instagram:'Terbitkan foto, carousel, Reels, Story, baca komentar, atau lihat statistik Instagram.',notify:'Kirim notifikasi ke Telegram, Discord, atau Webhook.',
  aiAgent:'Jalankan instruksi memakai Model AI dan Memory opsional.',chatModel:'Pilih model 9router untuk AI Agent.',memory:'Simpan konteks percakapan AI Agent.',tool:'Node lama untuk workflow terdahulu.',
}
export const workflowAssistantCatalog=Object.entries(defaults).filter(([type])=>!['tool','httpRequest'].includes(type)).map(([type,data])=>({type,title:data.label,purpose:purposes[type],editable:editable[type]}))

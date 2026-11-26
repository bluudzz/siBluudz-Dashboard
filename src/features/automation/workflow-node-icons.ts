import { Bell, Bot, Brain, Braces, Camera, Clock, Eye, FileJson, GitBranch, Globe, HardDrive, Images, List, Merge, MessageCircle, Search, Send, Settings, ShieldCheck, Split, SquarePen, Timer, Wand2, Webhook, Wrench, type LucideIcon } from 'lucide-react'

export const workflowNodeIcons:Record<string,LucideIcon> = {
  trigger:Clock,
  webhookTrigger:Webhook,
  promptTrigger:SquarePen,
  chatTrigger:MessageCircle,
  set:Braces,
  merge:Merge,
  jsonParse:FileJson,
  splitOut:List,
  searchContent:Search,
  httpRequest:Globe,
  apiRequest:Send,
  googleDrive:HardDrive,
  if:GitBranch,
  switch:Split,
  wait:Timer,
  approval:ShieldCheck,
  aiAgent:Bot,
  chatModel:Brain,
  memory:MessageCircle,
  tool:Wrench,
  imageGenerate:Images,
  imageEdit:Wand2,
  aiVision:Eye,
  instagram:Camera,
  notify:Bell,
  instagramPublish:Send,
}

export function iconForWorkflowNode(type?:string):LucideIcon {
  return workflowNodeIcons[type||'']||Settings
}

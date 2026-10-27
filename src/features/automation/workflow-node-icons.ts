import { Bot, Brain, Braces, Camera, Clock, GitBranch, Globe, Images, List, MessageCircle, Search, Send, Settings, ShieldCheck, Wrench, type LucideIcon } from 'lucide-react'

export const workflowNodeIcons:Record<string,LucideIcon> = {
  trigger:Clock,
  chatTrigger:MessageCircle,
  set:Braces,
  splitOut:List,
  searchContent:Search,
  httpRequest:Globe,
  if:GitBranch,
  approval:ShieldCheck,
  aiAgent:Bot,
  chatModel:Brain,
  memory:MessageCircle,
  tool:Wrench,
  imageGenerate:Images,
  instagram:Camera,
  instagramPublish:Send,
}

export function iconForWorkflowNode(type?:string):LucideIcon {
  return workflowNodeIcons[type||'']||Settings
}

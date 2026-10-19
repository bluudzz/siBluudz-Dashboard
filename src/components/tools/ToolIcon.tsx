import * as React from 'react'
import {
  Bot,
  Sparkles,
  Cpu,
  GitBranch,
  Terminal,
  Database,
  Cloud,
  Palette,
  FileText,
  Radio,
  Activity,
  Key,
  Globe,
  Folder,
  Box,
  Layers,
  Server,
  Zap,
  Code2,
  Mail,
  Receipt,
  ReceiptText,
  BadgeDollarSign,
  CreditCard,
  Wallet,
  FileSpreadsheet,
  type LucideProps,
} from 'lucide-react'

export const iconMap: Record<string, React.FC<LucideProps>> = {
  Bot,
  Sparkles,
  Cpu,
  GitBranch,
  Terminal,
  Database,
  Cloud,
  Palette,
  FileText,
  Radio,
  Activity,
  Key,
  Globe,
  Folder,
  Box,
  Layers,
  Server,
  Zap,
  Code2,
  Mail,
  Receipt,
  ReceiptText,
  Invoice: Receipt,
  InvoiceApp: Receipt,
  BadgeDollarSign,
  CreditCard,
  Wallet,
  FileSpreadsheet,
}

interface ToolIconProps extends LucideProps {
  name: string
}

export function ToolIcon({ name, ...props }: ToolIconProps) {
  const IconComponent = iconMap[name] || Globe
  return <IconComponent {...props} />
}

export const aiPorts = {chatModel:'ai_languageModel',memory:'ai_memory',tool:'ai_tool'}
export const isSubNode = type => Object.hasOwn(aiPorts,type)
export const isTrigger = type => type==='trigger'||type==='chatTrigger'
export const isAiConnection = edge => Object.values(aiPorts).includes(edge.targetHandle)
export function agentResources(agentId,nodes,edges) {
  const connected=type=>edges.filter(edge=>edge.target===agentId&&edge.targetHandle===aiPorts[type]).map(edge=>nodes.find(node=>node.id===edge.source)).filter(Boolean)
  return {model:connected('chatModel')[0],memory:connected('memory')[0],tools:connected('tool')}
}

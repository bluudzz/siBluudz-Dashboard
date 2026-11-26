import { simpleParser } from 'mailparser'

export async function mailHtmlToText(html) {
  if (!html) return ''
  const parsed = await simpleParser(Buffer.from(
    'Content-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n' + html,
    'utf8',
  ))
  return (parsed.text || '').trim()
}

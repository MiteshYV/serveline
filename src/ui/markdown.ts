/**
 * The smallest Markdown-to-HTML converter the consent notice needs: headings, paragraphs,
 * bullet lists and **bold**. Nothing else, because contracts/notices/*.md use nothing else,
 * and a dependency for this would cost more than the cart (design §10).
 *
 * Input is escaped before any tag is added, so a notice can never inject markup — the only
 * substituted value is the restaurant's name, which comes from the database.
 */

const escapeHtml = (s: string) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

const inline = (s: string) => escapeHtml(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')

/** Drops a leading YAML frontmatter block (`---` … `---`), which the notices carry. */
export function stripFrontmatter(md: string): string {
  const m = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(md)
  return m ? md.slice(m[0].length) : md
}

export function markdownToHtml(md: string): string {
  const blocks = stripFrontmatter(md).replace(/\r\n/g, '\n').trim().split(/\n{2,}/)
  return blocks
    .map((block) => {
      const lines = block.split('\n')
      const first = lines[0] ?? ''
      const heading = /^(#{1,3})\s+(.*)$/.exec(first)
      // `#` in a notice is the document title; the page already has an h1, so it lands as h2.
      if (heading && lines.length === 1) {
        const level = Math.min(heading[1]!.length + 1, 4)
        return `<h${level}>${inline(heading[2]!)}</h${level}>`
      }
      if (lines.every((l) => /^[-*]\s+/.test(l))) {
        return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^[-*]\s+/, ''))}</li>`).join('')}</ul>`
      }
      // Hard-wrapped source lines are one paragraph.
      return `<p>${inline(lines.join(' '))}</p>`
    })
    .join('\n')
}

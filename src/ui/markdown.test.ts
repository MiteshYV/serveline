import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { markdownToHtml, stripFrontmatter } from './markdown.ts'

describe('markdownToHtml', () => {
  it('renders headings, paragraphs, lists and bold, and escapes everything else', () => {
    const html = markdownToHtml('---\nversion: v1\n---\n\n# Title & co\n\nOne line\nsame para **bold** <b>x</b>\n\n- a\n- b\n')
    assert.equal(
      html,
      '<h2>Title &amp; co</h2>\n<p>One line same para <strong>bold</strong> &lt;b&gt;x&lt;/b&gt;</p>\n<ul><li>a</li><li>b</li></ul>',
    )
  })

  it('converts every shipped notice without leaving frontmatter or raw markdown behind', () => {
    for (const lang of ['en', 'hi', 'kn']) {
      const md = readFileSync(new URL(`../../contracts/notices/v1/${lang}.md`, import.meta.url), 'utf8')
      assert.ok(stripFrontmatter(md).trimStart().startsWith('#'), `${lang}: frontmatter not stripped`)
      const html = markdownToHtml(md.replaceAll('{{restaurant_name}}', 'Test'))
      assert.ok(html.startsWith('<h2>'), `${lang}: no title`)
      assert.ok(!html.includes('**'), `${lang}: raw bold left`)
      assert.ok(!html.includes('version:'), `${lang}: frontmatter leaked`)
    }
  })
})

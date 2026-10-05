import { describe, it, expect } from 'vitest'
import { highlightJson } from '../highlightJson'

describe('highlightJson', () => {
  it("échappe le HTML venu de l'API avant de colorer (XSS)", () => {
    const html = highlightJson(JSON.stringify({ nom: '<img src=x onerror=alert(1)>' }, null, 2))

    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })

  it('échappe aussi les esperluettes', () => {
    expect(highlightJson(JSON.stringify('a & b'))).toContain('a &amp; b')
  })

  it('colore clés, chaînes, nombres, booléens et null', () => {
    const html = highlightJson(JSON.stringify({ cle: 'v', n: 12, ok: true, vide: null }))

    expect(html).toContain('<span class="text-blue-400">"cle":</span>')
    expect(html).toContain('<span class="text-green-400">"v"</span>')
    expect(html).toContain('<span class="text-orange-400">12</span>')
    expect(html).toContain('<span class="text-purple-400">true</span>')
    expect(html).toContain('<span class="text-red-400">null</span>')
  })
})

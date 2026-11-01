import { describe, it, expect } from 'vitest'
import resolveConfig from 'tailwindcss/resolveConfig'

// Un préfixe responsive absent de `theme.screens` est ignoré en silence par Tailwind :
// la classe n'est jamais générée et le rendu reste celui du cas sans préfixe.
const configs = import.meta.glob('/tailwind.config.js', { eager: true, import: 'default' })
const sources = import.meta.glob('/src/**/*.tsx', { eager: true, query: '?raw', import: 'default' }) as Record<
  string,
  string
>

const SCREEN_LIKE = /(?<![\w:-])(xs|sm|md|lg|xl|2xl|3xl):(?=[a-z[!-])/g

describe('breakpoints responsives', () => {
  const screens = Object.keys(
    resolveConfig(Object.values(configs)[0] as Parameters<typeof resolveConfig>[0]).theme.screens as Record<
      string,
      unknown
    >,
  )

  it('ne référence que des écrans définis dans tailwind.config.js', () => {
    const unknown: string[] = []
    for (const [file, source] of Object.entries(sources)) {
      if (file.includes('/__tests__/')) continue
      for (const match of source.matchAll(SCREEN_LIKE)) {
        if (!screens.includes(match[1])) unknown.push(`${file} : ${match[1]}:`)
      }
    }
    expect([...new Set(unknown)]).toEqual([])
  })

  it('PDLCard : les plages HC se mettent en ligne à partir de sm', () => {
    const source = sources['/src/components/PDLCard.tsx']
    expect(source).toContain('flex-1 flex flex-col sm:flex-row items-stretch sm:items-center')
  })
})

/**
 * Coloration syntaxique d'un JSON pour un affichage via dangerouslySetInnerHTML.
 *
 * Le HTML est échappé AVANT la coloration : les réponses de l'API sont injectées telles
 * quelles et JSON.stringify n'échappe ni `<` ni `>` (XSS). L'échappement n'introduit aucun
 * guillemet, la regex de coloration s'applique donc sans changement.
 */
export function highlightJson(json: string): string {
  const escaped = json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  return escaped.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = 'text-orange-400' // numbers
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'text-blue-400' // keys
        } else {
          cls = 'text-green-400' // strings
        }
      } else if (/true|false/.test(match)) {
        cls = 'text-purple-400' // booleans
      } else if (/null/.test(match)) {
        cls = 'text-red-400' // null
      }
      return `<span class="${cls}">${match}</span>`
    }
  )
}

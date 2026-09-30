// Hulpfuncties om dezelfde HTML te maken als Radzen.Blazor 8 (klassen, id's).
// De componenten in deze map volgen de .razor-bestanden van Radzen zo letterlijk mogelijk,
// zodat het thema (standard.css) en de CSS van de website er hetzelfde op werken.

export type Falsy = false | null | undefined | 0 | ''

// Zoals Radzen's ClassList: klassen in volgorde, lege weglaten
export function cls(...parts: (string | Falsy)[]): string {
  return parts.filter(Boolean).join(' ')
}

// Zoals RadzenComponent.GetCssClass: eerst de klassen van het component, dan het class-attribuut
export function withClass(componentClass: string, extra?: string): string {
  return extra ? `${componentClass} ${extra}` : componentClass
}

// Zoals RadzenComponent.UniqueID: 10 tekens base64 van een GUID ('/' en '+' vervangen door '-')
export function uniqueId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/[/+]/g, '-').substring(0, 10)
}

// Zoals de style-string in Blazor (bv. "width:100%"): om te zetten naar een React-style
export function parseStyle(style?: string): React.CSSProperties | undefined {
  if (!style) return undefined
  const result: Record<string, string> = {}
  for (const part of style.split(';')) {
    const idx = part.indexOf(':')
    if (idx < 0) continue
    const name = part.slice(0, idx).trim()
    const value = part.slice(idx + 1).trim()
    if (!name) continue
    const key = name.startsWith('--') ? name : name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
    result[key] = value
  }
  return result as React.CSSProperties
}

// Zoals Radzen.openPopup: de ouders (tot <body>) die kunnen scrollen; scrollt er een, dan sluiten de popups
export function scrollableParents(el: HTMLElement | null | undefined): HTMLElement[] {
  const result: HTMLElement[] = []
  let p = el ?? null
  while (p && p !== document.body) {
    if (p.scrollWidth > p.clientWidth || p.scrollHeight > p.clientHeight) result.push(p)
    p = p.parentElement
  }
  return result
}

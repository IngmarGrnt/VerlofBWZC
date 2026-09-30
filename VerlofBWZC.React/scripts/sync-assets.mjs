// Neemt de opmaak en bestanden van de Blazor-website over, zodat de React-website er exact hetzelfde uitziet.
// Eén bron: CSS, iconen, manifest en bootstrap blijven in VerlofBWZC/wwwroot; Radzen komt uit de NuGet-cache
// (zelfde versie als in VerlofBWZC.csproj). Draait automatisch voor "npm run dev" en "npm run build".
//
// - public/                 kopie van VerlofBWZC/wwwroot (zonder Blazor-specifieke bestanden) + Radzen-thema
// - index.html              die van de Blazor-website, met de React-app in plaats van de Blazor-scripts
// - public/VerlofBWZC.styles.css  de *.razor.css van de Blazor-componenten, met dezelfde scoping als Blazor
//                            (attribuut b-<component>, bv. b-navmenu); de React-componenten zetten dat attribuut.
//                            Zelfde naam en plaats in index.html als bij Blazor, dus dezelfde volgorde van de CSS.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const publish = process.argv.includes('--publish')
const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const blazor = path.resolve(root, '..', 'VerlofBWZC')
const wwwroot = path.join(blazor, 'wwwroot')
const pub = path.join(root, 'public')

// Niet overnemen: hoort bij Blazor zelf (opstartpagina, configuratie, service worker)
const skip = new Set([
  'index.html',
  'appsettings.json',
  'appsettings.Development.json',
  'service-worker.js',
  'service-worker.published.js',
  'service-worker-registration.js',
])

fs.rmSync(pub, { recursive: true, force: true })
fs.mkdirSync(pub, { recursive: true })
for (const entry of fs.readdirSync(wwwroot)) {
  if (skip.has(entry)) continue
  fs.cpSync(path.join(wwwroot, entry), path.join(pub, entry), { recursive: true })
}

// Service worker: in ontwikkeling dezelfde lege als Blazor, gepubliceerd dezelfde als de gepubliceerde Blazor-versie
fs.copyFileSync(
  path.join(wwwroot, publish ? 'service-worker.published.js' : 'service-worker.js'),
  path.join(pub, 'service-worker.js'),
)

// Radzen: thema (standard.css) en lettertypes, zelfde versie als de Blazor-website
const csproj = fs.readFileSync(path.join(blazor, 'VerlofBWZC.csproj'), 'utf8')
const radzenVersion = /Include="Radzen\.Blazor"\s+Version="([^"]+)"/.exec(csproj)?.[1]
if (!radzenVersion) throw new Error('Radzen.Blazor-versie niet gevonden in VerlofBWZC.csproj')
const nugetRoot = process.env.NUGET_PACKAGES ?? path.join(os.homedir(), '.nuget', 'packages')
const radzenAssets = path.join(nugetRoot, 'radzen.blazor', radzenVersion, 'staticwebassets')
if (!fs.existsSync(radzenAssets))
  throw new Error(`Radzen.Blazor ${radzenVersion} niet gevonden in ${nugetRoot}. Bouw eerst de Blazor-website (dotnet restore).`)
const radzenOut = path.join(pub, '_content', 'Radzen.Blazor')
fs.mkdirSync(path.join(radzenOut, 'css'), { recursive: true })
fs.copyFileSync(path.join(radzenAssets, 'css', 'standard.css'), path.join(radzenOut, 'css', 'standard.css'))
fs.cpSync(path.join(radzenAssets, 'fonts'), path.join(radzenOut, 'fonts'), { recursive: true })

// Scoped CSS van de Blazor-componenten (MainLayout.razor.css, NavMenu.razor.css, ...)
const scopedFiles = []
const walk = dir => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!['bin', 'obj', 'wwwroot'].includes(entry.name)) walk(full)
    } else if (entry.name.endsWith('.razor.css')) {
      scopedFiles.push(full)
    }
  }
}
walk(blazor)
scopedFiles.sort()

let scoped = '/* Gegenereerd door scripts/sync-assets.mjs uit de *.razor.css van de Blazor-website. Niet bewerken. */\n'
for (const file of scopedFiles) {
  const component = path.basename(file, '.razor.css')
  const attr = `b-${component.toLowerCase()}`
  scoped += `/* ${path.relative(blazor, file).replaceAll('\\', '/')} -> [${attr}] */\n`
  scoped += scopeCss(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''), `[${attr}]`) + '\n'
}
fs.writeFileSync(path.join(pub, 'VerlofBWZC.styles.css'), scoped)

// index.html: die van de Blazor-website (zelfde <head>, stylesheets in dezelfde volgorde, zelfde ?v=-nummers),
// zonder de Blazor-scripts. Op de plaats van blazor.webassembly.js komt de React-app.
let html = fs.readFileSync(path.join(wwwroot, 'index.html'), 'utf8').replace(/^﻿/, '')
const blazorScript = /<script src="_framework\/blazor\.webassembly\.js"><\/script>/
if (!blazorScript.test(html)) throw new Error('blazor.webassembly.js niet gevonden in VerlofBWZC/wwwroot/index.html')
html = html
  .replace(blazorScript, '<script type="module" src="/src/main.tsx"></script>')
  // Blazor-specifiek: authenticatie-script, inline scripts (bwzcInstall e.d. zitten in de React-code),
  // registratie van de service worker (main.tsx), browser-refresh van dotnet watch en Radzen.Blazor.js
  .replace(/[ \t]*<script src="_content\/Microsoft\.AspNetCore\.Components\.WebAssembly\.Authentication\/[^"]*"><\/script>\r?\n/g, '')
  .replace(/[ \t]*<script>[\s\S]*?<\/script>\r?\n/g, '')
  .replace(/[ \t]*<script src="\/?_framework\/aspnetcore-browser-refresh\.js"><\/script>\r?\n/g, '')
  .replace(/[ \t]*<script src="_content\/Radzen\.Blazor\/Radzen\.Blazor\.js"><\/script>\r?\n/g, '')
// Opmerking ná <!DOCTYPE html> (ervoor zou de browser in quirks mode zetten)
html = html.replace(
  /^(<!DOCTYPE html>\r?\n)/i,
  '$1<!-- Gegenereerd door scripts/sync-assets.mjs uit VerlofBWZC/wwwroot/index.html. Niet bewerken: pas die van de Blazor-website aan. -->\n',
)
fs.writeFileSync(path.join(root, 'index.html'), html)

console.log(`sync-assets: wwwroot, Radzen ${radzenVersion} en ${scopedFiles.length} scoped CSS-bestand(en) overgenomen${publish ? ' (publicatie)' : ''}.`)

// Zelfde regels als de CSS-scoping van Blazor: het attribuut komt achter het laatste deel van elke selector
// (na pseudo-klassen, vóór pseudo-elementen), of vlak voor ::deep (dat zelf wegvalt).
// @media/@supports worden doorlopen, @keyframes en @font-face blijven ongewijzigd.
function scopeCss(css, attr) {
  let out = ''
  let i = 0
  const stack = [] // per open blok: 'rule' | 'at' | 'raw'
  while (i < css.length) {
    if (css.startsWith('/*', i)) {
      const end = css.indexOf('*/', i + 2)
      const stop = end < 0 ? css.length : end + 2
      out += css.slice(i, stop)
      i = stop
      continue
    }
    const inRaw = stack.includes('raw')
    const inRule = stack[stack.length - 1] === 'rule'
    if (css[i] === '}') {
      stack.pop()
      out += '}'
      i++
      continue
    }
    if (inRaw || inRule) {
      // Inhoud van een regel of @keyframes: letterlijk overnemen tot het volgende { of }
      let j = i
      while (j < css.length && css[j] !== '{' && css[j] !== '}' && !css.startsWith('/*', j)) j++
      out += css.slice(i, j)
      if (css[j] === '{') {
        stack.push('raw')
        out += '{'
        j++
      }
      i = j
      continue
    }
    // Prelude: selector of @-regel, tot { of ;
    let j = i
    while (j < css.length && css[j] !== '{' && css[j] !== '}' && css[j] !== ';' && !css.startsWith('/*', j)) j++
    const prelude = css.slice(i, j)
    if (css[j] === ';' || css[j] === '}' || css.startsWith('/*', j) || j >= css.length) {
      out += prelude
      if (css[j] === ';') {
        out += ';'
        j++
      }
      i = j
      continue
    }
    const trimmed = prelude.trim()
    if (trimmed.startsWith('@')) {
      const name = /^@([\w-]+)/.exec(trimmed)?.[1] ?? ''
      stack.push(['media', 'supports', 'container', 'layer'].includes(name) ? 'at' : 'raw')
      out += prelude + '{'
    } else if (trimmed.length === 0) {
      stack.push('raw')
      out += prelude + '{'
    } else {
      stack.push('rule')
      const lead = prelude.slice(0, prelude.length - prelude.trimStart().length)
      const tail = prelude.slice(prelude.trimEnd().length)
      out += lead + trimmed.split(',').map(s => scopeSelector(s.trim(), attr)).join(', ') + tail + '{'
    }
    i = j + 1
  }
  return out
}

function scopeSelector(selector, attr) {
  const deep = selector.indexOf('::deep')
  if (deep >= 0) {
    const before = selector.slice(0, deep).trimEnd()
    const after = selector.slice(deep + '::deep'.length)
    return (before.length ? before + attr : attr) + ' ' + after.trimStart()
  }
  const pseudoElement = /::?(before|after|placeholder|selection|marker|first-line|first-letter|backdrop)\b.*$|::[\w-]+.*$/.exec(selector)
  if (pseudoElement) return selector.slice(0, pseudoElement.index) + attr + selector.slice(pseudoElement.index)
  return selector + attr
}

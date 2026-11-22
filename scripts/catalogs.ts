// Builds the answer catalogs in content/catalogs/ from Wikidata. Run by hand, never at server start:
//   NODE_USE_ENV_PROXY=1 node scripts/catalogs.ts [id ...]
// Each entry is [name, value, fame, aliases]. Fame is how many Wikipedias have an article on it,
// which the game turns into rarity tiers (famous answers are common picks).
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

interface Spec {
  id: string
  unit: string
  source: string
  /** SPARQL returning ?item ?itemLabel ?links ?aliases and, for numeric catalogs, ?value. */
  query: string
  /** Scale the raw value, e.g. people -> millions. */
  scale?: number
  /** Big catalogs time out as one query: run it once per part, replacing {PART}, and merge. */
  parts?: string[]
}

const ALIASES = `OPTIONAL { ?item skos:altLabel ?alias . FILTER(LANG(?alias) = "en") }`
const LABEL = `?item rdfs:label ?itemLabel . FILTER(LANG(?itemLabel) = "en")`
const GROUP = `GROUP BY ?item ?itemLabel ?links`
const SELECT = `SELECT ?item ?itemLabel ?links (MAX(?v) AS ?value) (GROUP_CONCAT(DISTINCT ?alias; separator="|") AS ?aliases)`
// Plants and fruit often carry their scientific name as the English label: prefer the common name.
const SELECT_NAMES = `SELECT ?item ?itemLabel ?links (SAMPLE(?taxon) AS ?latin) (SAMPLE(?common) AS ?commonName) (GROUP_CONCAT(DISTINCT ?alias; separator="|") AS ?aliases)`
const COMMON = `OPTIONAL { ?item wdt:P225 ?taxon } OPTIONAL { ?item wdt:P1843 ?common . FILTER(LANG(?common) = "en") }`
/** Normalized (SI) amount of a quantity property, so feet become metres. */
const qty = (p: string) => `?item p:${p}/psn:${p}/wikibase:quantityAmount ?v .`
/** Elevation bands in raw units (some are feet); each band is a fast query of its own. */
const BANDS = [300, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000, 6000, 7000, 9000, 40000]
const bands = BANDS.slice(1).map((hi, i) => `FILTER(?raw >= ${BANDS[i]} && ?raw < ${hi})`)
// One type and one band per query: Wikidata answers those in seconds, but times out on all at once.
const mountainParts = [
  ...bands.map((b) => `wd:Q8502 ; wdt:P2044 ?raw . ${b}`),
  ...['Q8072', 'Q169358', 'Q212057', 'Q1061151'].map((t) => `wd:${t} ; wdt:P2044 ?raw .`),
]

export const SPECS: Spec[] = [
  {
    id: 'countries', unit: 'million', scale: 1e-6,
    source: 'Wikidata population (P1082) of sovereign states',
    query: `${SELECT} WHERE {
      ?item wdt:P31 wd:Q3624078 ; wdt:P1082 ?v ; wikibase:sitelinks ?links .
      FILTER NOT EXISTS { ?item wdt:P576 ?ended }
      ${LABEL} ${ALIASES} } ${GROUP}`,
  },
  {
    id: 'mountains', unit: 'm',
    source: 'Wikidata elevation (P2044) of mountains and volcanoes',
    parts: mountainParts,
    query: `${SELECT} WHERE {
      ?item wdt:P31 {PART}
      ?item wikibase:sitelinks ?links . FILTER(?links >= 4)
      ${qty('P2044')} ${LABEL} ${ALIASES} } ${GROUP}`,
  },
  {
    id: 'structures', unit: 'm',
    source: 'Wikidata height (P2048) of towers, buildings, bridges, statues and monuments',
    parts: ['Q11303', 'Q12518', 'Q1440300', 'Q11166728', 'Q2977', 'Q12280', 'Q537127', 'Q1825472', 'Q4989906',
      'Q179700', 'Q12516', 'Q39715', 'Q41176', 'Q16970', 'Q18142', 'Q202570', 'Q2319498', 'Q44539', 'Q108325'],
    query: `${SELECT} WHERE {
      ?item wdt:P31 wd:{PART} ; wikibase:sitelinks ?links . FILTER(?links >= 8)
      ${qty('P2048')} ${LABEL} ${ALIASES} } ${GROUP}`,
  },
  {
    id: 'waterfalls', unit: 'm',
    source: 'Wikidata height (P2048) of waterfalls',
    query: `${SELECT} WHERE {
      ?item wdt:P31 wd:Q34038 ; wikibase:sitelinks ?links . FILTER(?links >= 3)
      ${qty('P2048')} ${LABEL} ${ALIASES} } ${GROUP}`,
  },
  {
    id: 'inventions', unit: 'year',
    source: 'Wikidata time of invention or discovery (P575) of kinds of things',
    // Kinds of things (P279) only, so a named comet or a single painting doesn't count as an invention.
    query: `SELECT ?item ?itemLabel ?links (MIN(YEAR(?d)) AS ?value) (GROUP_CONCAT(DISTINCT ?alias; separator="|") AS ?aliases) WHERE {
      ?item wdt:P575 ?d ; wdt:P279 ?kind ; wikibase:sitelinks ?links . FILTER(?links >= 12)
      FILTER NOT EXISTS { ?item wdt:P31 wd:Q11173 } FILTER NOT EXISTS { ?item wdt:P31 wd:Q113145171 }
      FILTER NOT EXISTS { VALUES ?not { wd:Q12136 wd:Q18123741 wd:Q112193867 wd:Q929833 wd:Q11344 } ?item wdt:P31 ?not }
      FILTER NOT EXISTS { ?item wdt:P105 ?rank }
      ${LABEL} ${ALIASES} } ${GROUP}`,
  },
  ...([
    ['colours', 'wdt:P31 wd:Q1075', 3, 'Wikidata colours (Q1075)'],
    ['fruits', 'wdt:P279+ wd:Q3314483', 6, 'Wikidata kinds of fruit (Q3314483)'],
    ['vegetables', 'wdt:P279+ wd:Q11004', 6, 'Wikidata kinds of vegetable (Q11004)'],
    ['sports', 'wdt:P31 wd:Q31629', 8, 'Wikidata types of sport (Q31629)'],
    ['instruments', 'wdt:P279+ wd:Q34379', 10, 'Wikidata musical instruments (Q34379)'],
  ] as const).map(([id, path, min, source]): Spec => ({
    id, unit: 'alpha', source,
    query: `${SELECT_NAMES} WHERE { ?item ${path} ; wikibase:sitelinks ?links . FILTER(?links >= ${min}) ${LABEL} ${COMMON} ${ALIASES} } ${GROUP}`,
  })),
]

/** Wikidata rate-limits (429) and times out (5xx) under load: retry with backoff. */
async function sparql(query: string, attempt = 1): Promise<Record<string, { value: string }>[]> {
  const res = await fetch('https://query.wikidata.org/sparql', {
    method: 'POST',
    headers: {
      accept: 'application/sparql-results+json',
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': 'inbetween-content-builder/1.0 (https://github.com/kidev27/inbetween)',
    },
    body: new URLSearchParams({ query }),
  })
  if ((res.status === 429 || res.status >= 500) && attempt < 4) {
    await new Promise((r) => setTimeout(r, Number(res.headers.get('retry-after')) * 1000 || 15_000 * attempt))
    return sparql(query, attempt + 1)
  }
  if (!res.ok) throw new Error(`Wikidata ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return ((await res.json()) as { results: { bindings: Record<string, { value: string }>[] } }).results.bindings
}

/** Wikidata labels are often lowercase ("telephone"); names in the game start with a capital. */
const tidy = (s: string) => s.trim().replace(/^\p{Ll}/u, (c) => c.toUpperCase())
const usable = (s: string) => s.length >= 2 && s.length <= 40 && !/^Q\d+$/.test(s) && !/[()\[\]:;/]/.test(s)

async function build(spec: Spec) {
  const rows = []
  for (const part of spec.parts ?? ['']) {
    try {
      rows.push(...(await sparql(spec.query.replace('{PART}', part))))
    } catch (e) {
      // One slow part shouldn't sink the catalog; say which part is missing.
      console.warn(`${spec.id} [${part}]: ${(e as Error).message.slice(0, 80)}`)
    }
  }
  const byName = new Map<string, [string, number, number, string[]]>()
  for (const r of rows) {
    const label = tidy(r.itemLabel.value)
    // "Allium sativum" -> "Garlic": a scientific-name label gives way to the common name.
    const latin = r.latin?.value && r.latin.value.toLowerCase() === label.toLowerCase()
    const common = r.commonName?.value ? tidy(r.commonName.value) : undefined
    const name = latin ? common : label
    if (!name) continue
    if (!usable(name)) continue
    const value = spec.unit === 'alpha' ? 0 : Number(r.value?.value) * (spec.scale ?? 1)
    if (spec.unit !== 'alpha' && !(Number.isFinite(value) && value > 0)) continue
    const fame = Number(r.links.value)
    const aliases = [...(latin ? [label] : []), ...(r.aliases?.value ?? '').split('|')]
      .map((a) => a.trim()).filter((a) => usable(a) && a.toLowerCase() !== name.toLowerCase())
    const prev = byName.get(name.toLowerCase())
    // Same name twice (e.g. two mountains called Dom): keep the better known one.
    if (!prev || prev[2] < fame) byName.set(name.toLowerCase(), [name, round(value), fame, aliases.slice(0, 8)])
  }
  const entries = [...byName.values()].sort((a, b) => b[2] - a[2])
  const file = fileURLToPath(new URL(`../content/catalogs/${spec.id}.json`, import.meta.url))
  const body = entries.map((e) => JSON.stringify(e)).join(',\n')
  writeFileSync(file, `{"id":${JSON.stringify(spec.id)},"unit":${JSON.stringify(spec.unit)},"source":${JSON.stringify(spec.source)},"built":${JSON.stringify(new Date().toISOString().slice(0, 10))},"entries":[\n${body}\n]}\n`)
  console.log(`${spec.id}: ${entries.length} entries`)
}

const round = (v: number) => (v >= 100 ? Math.round(v) : Number(v.toPrecision(3)))

const only = process.argv.slice(2)
for (const spec of SPECS.filter((s) => !only.length || only.includes(s.id))) {
  try {
    await build(spec)
  } catch (e) {
    console.error(`${spec.id}: ${(e as Error).message}`)
    process.exitCode = 1
  }
}

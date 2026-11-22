// Builds the answer catalogs in content/catalogs/ from Wikidata. Run by hand, never at server start:
//   NODE_USE_ENV_PROXY=1 node scripts/catalogs.ts [id ...]
// Each entry is [name, value, fame, aliases]. Fame is how many Wikipedias have an article on it,
// which the game turns into rarity tiers (famous answers are common picks).
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
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
  /** Build from a hand-written table in content/sources/ instead of a query: which column, which rows. */
  table?: { file: string; column: string; only?: (row: Record<string, string>) => boolean }
  /** WordNet nouns under these synsets ("lemma" or "lemma.N") add names and synonyms Wikidata lacks. */
  wordnet?: string[]
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

/** Mass (P2067, in kg) of animals under one class: mammals, birds or reptiles. */
const MASSES = `${SELECT_NAMES.replace('SELECT ?item', 'SELECT ?item (MAX(?v) AS ?value)')} WHERE {
  ?item wdt:P171+ wd:{PART} ; wikibase:sitelinks ?links . ${qty('P2067')} ${LABEL} ${COMMON} ${ALIASES} } ${GROUP}`

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
      ?item wikibase:sitelinks ?links .
      FILTER(?links >= 4 || EXISTS { ?en schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> })
      ${qty('P2044')} ${LABEL} ${ALIASES} } ${GROUP}`,
  },
  {
    id: 'structures', unit: 'm',
    source: 'Wikidata height (P2048) of towers, buildings, bridges, statues and monuments',
    parts: ['Q11303', 'Q12518', 'Q1440300', 'Q11166728', 'Q2977', 'Q12280', 'Q537127', 'Q1825472', 'Q4989906',
      'Q179700', 'Q12516', 'Q39715', 'Q41176', 'Q16970', 'Q18142', 'Q202570', 'Q2319498', 'Q44539', 'Q108325'],
    query: `${SELECT} WHERE {
      ?item wdt:P31 wd:{PART} ; wikibase:sitelinks ?links . FILTER(?links >= 2)
      ${qty('P2048')} ${LABEL} ${ALIASES} } ${GROUP}`,
  },
  {
    id: 'waterfalls', unit: 'm',
    source: 'Wikidata height (P2048) of waterfalls',
    query: `${SELECT} WHERE {
      ?item wdt:P31 wd:Q34038 ; wikibase:sitelinks ?links . FILTER(?links >= 1)
      ${qty('P2048')} ${LABEL} ${ALIASES} } ${GROUP}`,
  },
  {
    id: 'inventions', unit: 'year',
    source: 'Wikidata time of invention or discovery (P575) of kinds of things',
    // Kinds of things (P279) only, so a named comet or a single painting doesn't count as an invention.
    query: `SELECT ?item ?itemLabel ?links (MIN(YEAR(?d)) AS ?value) (GROUP_CONCAT(DISTINCT ?alias; separator="|") AS ?aliases) WHERE {
      ?item wdt:P575 ?d ; wdt:P279 ?kind ; wikibase:sitelinks ?links . FILTER(?links >= 3)
      FILTER NOT EXISTS { ?item wdt:P31 wd:Q11173 } FILTER NOT EXISTS { ?item wdt:P31 wd:Q113145171 }
      FILTER NOT EXISTS { VALUES ?not { wd:Q12136 wd:Q18123741 wd:Q112193867 wd:Q929833 wd:Q11344 } ?item wdt:P31 ?not }
      FILTER NOT EXISTS { ?item wdt:P105 ?rank }
      ${LABEL} ${ALIASES} } ${GROUP}`,
  },
  ...([
    ['colours', 'wdt:P31 wd:Q1075', 1, 'Wikidata colours (Q1075) and WordNet', ['chromatic_color', 'achromatic_color']],
    // Kinds of fruit, plus the plants that are the source of one (many fruits only exist as the plant).
    ['fruits', '{ ?item wdt:P279+ wd:Q3314483 } UNION { ?item wdt:P1672 ?f . ?f wdt:P279* wd:Q3314483 }', 1, 'Wikidata fruit and fruit plants, and WordNet', ['edible_fruit']],
    ['vegetables', '{ ?item wdt:P279+ wd:Q11004 } UNION { ?item wdt:P1672 ?f . ?f wdt:P279* wd:Q11004 }', 1, 'Wikidata vegetables and vegetable plants, and WordNet', ['vegetable']],
    ['sports', 'wdt:P31 wd:Q31629', 2, 'Wikidata types of sport (Q31629)', []],
    ['instruments', 'wdt:P279+ wd:Q34379', 2, 'Wikidata musical instruments (Q34379) and WordNet', ['musical_instrument']],
  ] as const).map(([id, path, min, source, wordnet]): Spec => ({
    id, unit: 'alpha', source, wordnet: [...wordnet],
    query: `${SELECT_NAMES} WHERE { ${path.includes('?item') ? path : `?item ${path} .`} ?item wikibase:sitelinks ?links . FILTER(?links >= ${min}) ${LABEL} ${COMMON} ${ALIASES} } ${GROUP}`,
  })),
  // Wikidata records few animal weights and almost no speeds: its masses go under a hand-written table.
  { id: 'animal-weights', unit: 'kg', source: 'Typical adult weights, hand-compiled and from Wikidata', parts: ['Q7377', 'Q5113', 'Q10811'], query: MASSES, table: { file: 'animals.tsv', column: 'kg' } },
  { id: 'bird-weights', unit: 'kg', source: 'Typical adult weights, hand-compiled and from Wikidata', parts: ['Q5113'], query: MASSES, table: { file: 'animals.tsv', column: 'kg', only: (r) => r.class === 'bird' } },
  { id: 'animal-speeds', unit: 'km/h', source: 'Top running speeds, hand-compiled', query: '', table: { file: 'animals.tsv', column: 'kmh' } },
]

const source = (file: string) => fileURLToPath(new URL(`../content/sources/${file}`, import.meta.url))

/** Rows of a tab-separated table; lines starting with # are comments, the first other line is the header. */
function readTable(file: string) {
  const [head, ...rows] = readFileSync(source(file), 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('#')).map((l) => l.split('\t'))
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])))
}

/** Names Wikidata misses, from content/sources/<id>.txt: one "Name|alias|alias" per line. */
const extras = (id: string) =>
  existsSync(source(`${id}.txt`))
    ? readFileSync(source(`${id}.txt`), 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('#')).map((l) => l.split('|').map((x) => x.trim()))
    : []

const WORDNET = fileURLToPath(new URL('../node_modules/wordnet-db/dict/', import.meta.url))
/** Latin binomials ("Acanthisitta chloris"): WordNet lists them beside the common name. */
const LATIN = /^[A-Z][a-z]+ [a-z]+$/

/**
 * WordNet, an English dictionary, as a second source: every noun under the given synsets. A synset
 * that shares a word with a catalog entry gives that entry its synonyms as aliases ("Chinese
 * gooseberry" for Kiwifruit); the rest become new entries, famous as their best-known word.
 */
async function addWordnet(roots: string[], byName: Map<string, [string, number, number, string[]]>) {
  const words = new Map<string, string[]>()
  const kids = new Map<string, string[]>()
  for (const line of readFileSync(WORDNET + 'data.noun', 'latin1').split('\n')) {
    if (!line || line.startsWith(' ')) continue
    const f = line.split(' ')
    const n = parseInt(f[3], 16)
    words.set(f[0], Array.from({ length: n }, (_, i) => f[4 + 2 * i].replace(/_/g, ' ').replace(/\(.*\)$/, '')))
    let i = 4 + 2 * n
    const pointers = Number(f[i++])
    for (let p = 0; p < pointers; p++, i += 4)
      if ((f[i] === '~' || f[i] === '~i') && f[i + 2] === 'n') kids.set(f[0], [...(kids.get(f[0]) ?? []), f[i + 1]])
  }
  const index = new Map(readFileSync(WORDNET + 'index.noun', 'latin1').split('\n').filter((l) => l && !l.startsWith(' ')).map((l) => {
    const f = l.split(' ')
    return [f[0], f.slice(6 + Number(f[3]))] as const // lemma -> synset offsets, most common sense first
  }))
  const seen = new Set<string>()
  const todo = roots.map((r) => { const [lemma, sense = '1'] = r.split('.'); return index.get(lemma)![Number(sense) - 1] })
  while (todo.length) for (const k of kids.get(todo.pop()!) ?? []) if (!seen.has(k)) seen.add(k), todo.push(k)
  const owner = new Map<string, string>() // any name or alias -> entry key
  for (const [k, e] of byName) for (const x of [e[0], ...e[3]]) owner.set(same(x), k)
  const fresh: string[][] = []
  for (const off of seen) {
    const names = words.get(off)!.filter((w) => usable(w) && !/\d/.test(w))
    const common = names.filter((w) => !LATIN.test(w) || names.length === 1)
    if (!common.length) continue
    const hit = common.map((w) => owner.get(same(w))).find(Boolean)
    if (hit) {
      const e = byName.get(hit)!
      e[3] = [...new Set([...e[3], ...common.filter((w) => w.toLowerCase() !== e[0].toLowerCase())])].slice(0, 12)
    } else fresh.push(common.map(tidy))
  }
  // Each new entry is named after its best-known word ("Kiwi", not "Chinese gooseberry").
  const fame = await fameOf(fresh.flat())
  for (const words of fresh) {
    const f = (w: string) => fame.get(w.toLowerCase()) ?? 0
    const [name, ...aliases] = [...words].sort((a, b) => f(b) - f(a))
    if (!byName.has(name.toLowerCase())) byName.set(name.toLowerCase(), [name, 0, Math.max(1, f(name)), aliases])
  }
}

/** Fame (Wikipedias with an article) of things known only by name: the best known item with that label. */
async function fameOf(names: string[]) {
  const out = new Map<string, number>()
  for (let i = 0; i < names.length; i += 80) {
    // Wikidata labels vary in case ("Common ostrich", "Common Ostrich", "ostrich"): ask for each spelling.
    const spellings = (n: string) => [n, n.toLowerCase(), tidy(n.toLowerCase()), n.toLowerCase().replace(/\b\p{Ll}/gu, (c) => c.toUpperCase())]
    const values = [...new Set(names.slice(i, i + 80).flatMap(spellings))].map((n) => `${JSON.stringify(n)}@en`).join(' ')
    for (const r of await sparql(`SELECT ?n (MAX(?links) AS ?fame) WHERE { VALUES ?n { ${values} } ?item rdfs:label|wdt:P1843 ?n ; wikibase:sitelinks ?links . } GROUP BY ?n`)) {
      const k = r.n.value.toLowerCase()
      out.set(k, Math.max(out.get(k) ?? 0, Number(r.fame.value)))
    }
  }
  return out
}

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
/** Same name for merging: "Kiwi fruit" = "Kiwifruit". */
const same = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
/** Up to 12 aliases, shortest first (USA, US before U.S. of America), in a stable order build to build. */
const keep = (aliases: string[]) => [...new Set(aliases)].sort((a, b) => a.length - b.length || a.localeCompare(b)).slice(0, 12)
const tidy = (s: string) => s.trim().replace(/^\p{Ll}/u, (c) => c.toUpperCase())
const usable = (s: string) => s.length >= 2 && s.length <= 40 && !/^Q\d+$/.test(s) && !/[()\[\]:;/]/.test(s)

async function build(spec: Spec) {
  const rows = []
  for (const part of spec.query ? spec.parts ?? [''] : []) {
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
    if (!prev || prev[2] < fame) byName.set(name.toLowerCase(), [name, round(value), fame, keep(aliases)])
  }
  // Hand-written rows and extras: fame from Wikidata by name, 1 if it has no article anywhere.
  const table = spec.table ? readTable(spec.table.file).filter((r) => r[spec.table!.column] && (spec.table!.only?.(r) ?? true)) : []
  const more = [...table.map((r) => [r.name, ...r.aliases.split(',')]), ...extras(spec.id)].map((n) => n.filter(Boolean))
  // Fame of a hand-written row is its best-known name or alias ("cat" beats a minor item called "house cat").
  const fame = more.length ? await fameOf(more.flat()) : new Map<string, number>()
  const owner = new Map<string, string>()
  for (const [k, e] of byName) for (const x of [e[0], ...e[3]]) owner.set(same(x), k)
  for (const names of more) {
    const [name, ...aliases] = names
    const row = table.find((r) => r.name === name)
    const best = Math.max(1, ...names.map((n) => fame.get(n.toLowerCase()) ?? 0))
    // The same thing may already be in under another name ("Common ostrich" for Ostrich): merge into it.
    const k = names.map((n) => owner.get(same(n))).find(Boolean)
    const prev = k ? byName.get(k) : undefined
    if (prev) {
      if (row) prev[1] = Number(row[spec.table!.column]) // a hand-written value beats Wikidata's
      prev[2] = Math.max(prev[2], best)
      prev[3] = keep([...prev[3], ...names.filter((n) => n.toLowerCase() !== prev[0].toLowerCase())])
    } else byName.set(name.toLowerCase(), [name, row ? Number(row[spec.table!.column]) : 0, best, aliases])
  }
  if (spec.wordnet?.length) await addWordnet(spec.wordnet, byName)
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

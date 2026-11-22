# In Between

A daily browser game. Every day has seven prompts, and each names two limits:

> Name an animal heavier than a **cat** but lighter than a **horse**.

Type one thing that fits between them within 20 seconds. Rarer answers pull out more tape: a
common pick is a **Pin** (10 cm), then **Ruler** (40), **Yardstick** (70) and **Milestone** (100).
The reveal places your answer on a number line at its real value, next to the most common answer
and the rarest one you could have said. A perfect day measures 7 m.

Works on phones (primary) and desktop browsers. No account: players are anonymous guests.

```
In Between #12
▂█▆·▄▂█
4.30 m of 7 m
```

## Run it

Needs Node.js 22.18 or newer. The server runs TypeScript directly and SQLite is built into Node,
so `npm install` compiles nothing.

```bash
npm install
npm run dev      # API on :8789 with auto-restart, app on http://localhost:5173
npm test         # Vitest
npm run check    # type-check everything
```

Production:

```bash
npm ci
npm run build    # client -> dist/
npm start        # one process serves the app and the API on :8789
```

Environment variables: `PORT` (default 8789), `HOST` (default 127.0.0.1), `DB_PATH` (default
`data/inbetween.db`). In production the guest cookie is `Secure`, so serve it over HTTPS.

## How a day plays

1. The prompt and its two limits appear; the server starts a 20-second clock when the tape is out.
2. The answer is matched against the prompt's list by name or alias. A small typo or the start of
   a name ("capyb") is filled in with the full name ("Capybara") to confirm or edit, like
   Krillion's autocorrect. An answer that isn't on the list, or names a limit, doesn't count:
   keep trying until time runs out.
3. In range scores its tier. Just outside a limit (within 5%) is a **close call** for 10 cm.
   Further out, or out of time, scores 0.
4. After seven prompts: the total, a spoiler-free share line, and streaks kept in the browser.

The server is authoritative. A prompt's answers, values and facts reach the browser only after it
is answered, and only the current prompt accepts events.

## Writing daily puzzles

One file per day: `content/inbetween/YYYY-MM-DD.json` with seven prompts.

```json
{
  "rounds": [{ "prompts": [
    {
      "category": "weight",
      "title": "Animals by weight",
      "question": "Name an animal heavier than a cat but lighter than a horse.",
      "unit": "kg",
      "scale": "log",
      "words": ["heavy", "light"],
      "lo": { "name": "Cat", "value": 4 },
      "hi": { "name": "Horse", "value": 500 },
      "common": "Dog",
      "rarest": "Okapi",
      "source": "Typical adult weights from Wikipedia species articles",
      "answers": [
        { "name": "Dog", "value": 30, "tier": "pin", "aliases": ["dogs"] },
        { "name": "Okapi", "value": 250, "tier": "milestone", "fact": "The okapi is the giraffe's closest living relative." },
        { "name": "Elephant", "value": 6000, "fact": "An elephant weighs as much as a dozen horses." }
      ]
    }
  ] }]
}
```

- `category` picks the icon: `speed`, `weight`, `landmark`, `population`, `year`, `alpha`, `mountain`.
- `unit` is printed after the number (`"kg"`, `"m"`, `"million"`). `"year"` prints plain years.
  `"alpha"` orders words alphabetically; leave out every `value` and they come from the names.
- `scale`: `"log"` when the limits are far apart (4 kg to 500 kg), `"linear"` when close.
- `words` finish "too ___" for answers above and below the range.
- **Every in-range answer needs a `tier`** (`pin`, `ruler`, `yardstick`, `milestone`). List
  well-known out-of-range answers too, without a tier, so they get a proper "too heavy" reveal.
- `common` and `rarest` must be in-range answers; `rarest` must be a milestone.
- Order prompts from wide ranges to tight ones. Always fill in `source`; it is shown on the reveal.
- Content is checked when the server starts and by `npm test`; a bad file stops both.

### Big answer lists from Wikidata

Like Krillion, the game accepts far more answers than anyone would write by hand. Add
`"catalog": "<id>"` to a prompt and every entry of `content/catalogs/<id>.json` becomes an answer
too, under the hand-written ones:

| Catalog | Entries | Used by |
|---|---|---|
| `mountains` | ~24,900 | mountain heights |
| `structures` | ~8,000 | towers, buildings, bridges, statues |
| `animal-weights`, `bird-weights` | ~5,100, ~4,700 | animal and bird weights |
| `instruments`, `fruits` | ~3,000, ~2,800 | A to Z prompts |
| `inventions` | ~1,300 | invention years |
| `waterfalls`, `vegetables`, `colours`, `sports` | 490-660 each | heights, A to Z prompts |
| `countries` | ~200 | populations, countries A to Z |
| `animal-speeds` | 75 | animal speeds (hand-written only) |

Like Krillion, the lists merge several sources: Wikidata (anything with a Wikipedia article;
mountains need an English one), WordNet (an English dictionary, for names and synonyms), and the
hand-written files below.

- **Hand-written answers win.** A catalog entry sharing a name or alias with one (or with a limit)
  is the same thing and is skipped, so curated values, tiers and facts stay.
- **Only the days being played are built.** A prompt's full list is merged when it is first
  played and the last 21 are kept, so memory stays bounded (about 175 MB with three days).
- **Rarity comes from fame**: how many Wikipedias have an article on the entry. 150 or more is a
  Pin, 60 a Ruler, 20 a Yardstick, anything less a Milestone.
- **Typos** only match catalog names with 20 or more Wikipedias, so a slip can't land on an
  obscure peak with a similar name.
- Out-of-range entries are answers too, so they get a proper "too tall" reveal.

Rebuild the catalogs (a few minutes; Wikidata is slow, and the script retries):

```bash
NODE_USE_ENV_PROXY=1 node scripts/catalogs.ts              # all
NODE_USE_ENV_PROXY=1 node scripts/catalogs.ts mountains    # one
```

`NODE_USE_ENV_PROXY=1` is only needed behind an HTTP proxy.

Wikidata misses some things, so two hand-written sources feed the catalogs too (fame is still
looked up on Wikidata by name):

- `content/sources/animals.tsv`: weight and top speed of common animals, since Wikidata barely
  records either. Add a row, rebuild `animal-weights bird-weights animal-speeds`.
- `content/sources/<catalog>.txt`: extra names for a catalog, one `Name|alias|alias` per line
  (e.g. ice apple in `fruits.txt`).

## Deploying next to Blinker and HIGH▲LOW▼ on one VM

The same VM runs all three: Blinker on 8787, HIGH▲LOW▼ on 8788 and this one on 8789, with Caddy
in front.

1. **DNS.** Point a domain or subdomain at the VM with an A record.
2. **App.** On the VM:
   ```bash
   sudo adduser --system --group --home /opt/inbetween inbetween && sudo -u inbetween git clone https://github.com/kidev27/inbetween.git /opt/inbetween/app && sudo -u inbetween bash -c 'cd /opt/inbetween/app && npm ci && npm run build'
   ```
3. **Service.** Create `/etc/systemd/system/inbetween.service`:
   ```ini
   [Unit]
   Description=In Between
   After=network.target

   [Service]
   User=inbetween
   WorkingDirectory=/opt/inbetween/app
   Environment=NODE_ENV=production
   Environment=PORT=8789
   ExecStart=/usr/bin/node server/index.ts
   Restart=always

   [Install]
   WantedBy=multi-user.target
   ```
   Then `sudo systemctl daemon-reload && sudo systemctl enable --now inbetween`.
4. **HTTPS.** Add a block to `/etc/caddy/Caddyfile` and `sudo systemctl reload caddy`:
   ```
   inbetween.example.com {
   	reverse_proxy 127.0.0.1:8789
   }
   ```

Updating after a merge:

```bash
sudo -u inbetween bash -c 'cd /opt/inbetween/app && git pull && npm ci && npm run build' && sudo systemctl restart inbetween
```

Back up `data/inbetween.db` (with its `-wal` file).

## How it fits together

- `src/shared/` – types and rules shared by client and server.
- `server/` – Fastify app. `match.ts` matches typed answers; `catalogs.ts` loads the Wikidata lists; `modes/inbetween.ts` is the game as a
  pure reducer over `begin`, `answer` and `timeout` events.
- `src/client/` – Preact app. `core/` is mode-agnostic (API, streaks, share, settings, motion);
  `modes/inbetween/` has the screens, the number-line layout (`line.ts`) and the drawn art (`art.tsx`).
- `content/<mode>/YYYY-MM-DD.json` – daily puzzles.
- `migrations/NNNN_*.sql` – applied in order on start, tracked with `PRAGMA user_version`.

The game is built as a mode (`ServerMode` in `server/mode.ts`, `ClientMode` in
`src/client/mode.ts`), so more daily games can be added later without touching the core:
`test/layering.test.ts` fails if core code imports a specific mode.

Players are guests identified by an HttpOnly cookie. Only `server/player.ts` reads it, which is
where accounts would plug in.

All animation runs on the Web Animations API through `core/motion.ts`. A tap skips a reveal, and
with *reduce motion* turned on everything is near-instant.

## Contributing

Commit messages and branches follow [COMMIT_FORMAT.md](COMMIT_FORMAT.md): one branch per change,
a pull request into `main`, squash merge.

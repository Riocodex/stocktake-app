# TRiBE — Website + AI Stock Take

Two things in one Next.js app:

| Path | What it is |
| --- | --- |
| `/` | The public TRiBE Malta restaurant site (home, menu, locations, story, events, shop) |
| `/app` | The staff stock-take app, behind a login |

The stock-take app reads shelf photos with a vision model, counts the units,
reads any visible price tags, and updates the inventory once a human has
reviewed the numbers.

---

## Quick start

Requires **Node 20 or newer** (developed on Node 22).

```bash
npm install
npm run setup      # generates the Prisma client, creates the SQLite DB, seeds demo data
npm run dev        # http://localhost:3000
```

`npm run setup` is a one-time step. After that, `npm run dev` is all you need.

### Demo accounts

Every seeded account uses the password **`tribe1234`**.

| Email | Access |
| --- | --- |
| `super@tribemalta.com` | Super admin — every outlet |
| `ops@tribemalta.com` | Super admin — every outlet |
| `valletta@tribemalta.com` | Outlet admin — TRiBE Valletta |
| `balluta@tribemalta.com` | Outlet admin — TRiBE Balluta |
| `mercury@tribemalta.com` | Outlet admin — TRiBE Mercury Tower |
| `naxxar@tribemalta.com` | Outlet admin — TRiBE Naxxar |
| `sangwann@tribemalta.com` | Outlet admin — TRiBE San Gwann |

---

## The three features you asked for

### 1. AI photo analysis that updates stock and price

Go to **Stock takes → New stock take**, create a session, then add photos of
each storage area.

For every photo the app:

1. Saves the image to `public/uploads`.
2. Sends it to a vision model together with that outlet's product catalogue
   (names, SKUs, aliases, units, last known prices), asking it to count visible
   units and read any legible price tag.
3. Matches each detected label to a catalogue item — by SKU, exact name, alias,
   or a fuzzy token score.
4. Writes **draft** lines showing counted quantity, the quantity currently on
   record, the price it read, and the model's confidence.

Nothing touches live stock until you press **Submit stock take**. On submit, the
counted quantities become the outlet's live position, prices that the model read
replace the outlet price, and every price movement is written to an audit trail.

Deliberate design choices:

- **Low confidence is highlighted**, not hidden. Lines under 70% confidence are
  tinted so they get a second look.
- **Unmatched detections are surfaced.** If the model reads a label that is not
  in the catalogue, it appears in a "Needs your eyes" panel where you map it to
  a product or ignore it. It is never silently dropped or guessed onto the wrong
  product.
- **The same product in two photos adds up** rather than overwriting.
- **Editing an AI line marks it as human-verified**, so you can see how much of
  a count was automated.

#### Turning on real AI

Without an API key the analyser runs in **simulation mode**: it returns
plausible, deterministic readings derived from the image bytes, so the entire
capture → review → submit flow works offline and in tests. The UI tells you when
this is happening.

For real analysis, add a key to `.env`:

```bash
OPENAI_API_KEY="sk-..."
OPENAI_VISION_MODEL="gpt-4o-mini"   # any vision-capable model
```

The call is a plain `fetch` to the Chat Completions API in `src/lib/ai.ts`, so
swapping in Anthropic, Gemini or a self-hosted model means editing one function.

### 2. Login with outlet-scoped and group-wide access

Two roles:

- **Outlet admin** — sees only their own outlet. The scope is enforced on the
  server on every read and every write; passing another outlet's ID in the URL
  does not widen access.
- **Super admin** — sees every outlet, can switch scope with the outlet picker,
  and gets the extra **Outlets** and **Team** sections.

Sessions are signed JWTs in an `httpOnly`, `sameSite=lax` cookie. Passwords are
bcrypt hashed. Access is checked in `src/lib/auth.ts` via `requireUser`,
`requireSuperAdmin`, `resolveOutletScope` and `assertOutletAccess`.

### 3. Global inventory

One shared catalogue for the whole group, at **Global inventory**.

- Group scope shows total units and value per product, plus how many outlets
  stock it.
- Pick an outlet and the same table shows that outlet's quantity, price, par
  level and last counted date.
- Search by name, SKU, brand or alias; filter by category; filter to low stock.
- Click a product for a per-outlet breakdown, its price history, and the recent
  stock takes it appeared in.

Quantities and prices live per outlet (`OutletStock`), so one catalogue can
serve venues with different pricing.

---

## Verifying it works

With the dev server running:

```bash
# Drives the whole photo pipeline: upload → analyse → draft lines → submit
npx tsx scripts/e2e-photo-test.ts http://localhost:3000

# Checks label matching and outlet access control
npx tsx scripts/verify.ts http://localhost:3000
```

`verify.ts` asserts that an outlet admin gets a 403 on another outlet's count,
that unauthenticated and forged sessions get 401, and that submitted counts are
immutable.

Two browser-driven helpers are also included. They talk to a headless Chrome, so
they need Google Chrome installed at the usual macOS path:

```bash
# Signs in and writes full-page + viewport screenshots of every screen
node scripts/shots.mjs /tmp/tribe-shots super@tribemalta.com tribe1234

# Confirms an outlet admin cannot open another outlet's records.
# Pass their own count last as a control: it should read LEAKED.
node scripts/check-scoping.mjs valletta@tribemalta.com tribe1234 \
  /app/outlets /app/team /app/stock-takes/<some-other-outlets-id>
```

---

## Project layout

```
prisma/
  schema.prisma          Outlets, users, catalogue, per-outlet stock, counts, photos
  seed.ts                5 outlets, 68 products, users, stock and count history
src/
  app/
    (site)/              Public restaurant site
    login/               Staff sign in
    app/                 Stock-take app (dashboard, counts, inventory, outlets, team)
    api/stock-takes/[id]/photos/   Photo upload + analysis endpoint
  components/
    brand/marks.tsx      Eye, hamsa, moon and sun brand marks as SVG
    site/                Public site building blocks
    app/                 Admin navigation and outlet switcher
    ui.tsx               Shared primitives
  lib/
    ai.ts                Vision analysis + simulation fallback
    matching.ts          Detected label → catalogue item
    stock.ts             Draft lines and the submit transaction
    auth.ts              Sessions, roles, outlet scoping
    queries.ts           Dashboard and reporting queries
public/brand/            Logo artwork (PNG + original PDF)
```

## Design

The public site follows tribemalta.com. Colours were sampled from the supplied
logo artwork and from the live site: clay `#BD8771`, sage `#92C1BE`, deep teal
`#225567`, cocoa `#60362E`. Type is Baloo 2 (display) with Nunito (body), the
closest web pairing to TRiBE's rounded lettering. The brand marks in
`src/components/brand/marks.tsx` are vector recreations so they can be tinted
and scaled; the original PDFs are in `public/brand`.

Food photography is hot-linked from Unsplash for the demo — replace the `image`
fields in `src/lib/site-content.ts` with real TRiBE photography.

## Notes and limitations

- **SQLite** keeps setup to one command. The schema is portable; switch the
  `datasource` provider and adapter in `src/lib/db.ts` for Postgres.
- **Uploads go to `public/uploads`** on local disk. For multi-server hosting,
  point the upload route at S3 or similar.
- The public site's cart and checkout are presentational only.
- There is no user-management UI yet; add users via `prisma/seed.ts` or Prisma
  Studio (`npx prisma studio`).

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run setup` | Generate client, create DB, seed |
| `npm run db:reset` | Delete the DB and reseed from scratch |
| `npm run db:seed` | Reseed only |

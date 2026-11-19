# Cinnarios

**See it on your wall before it's yours.**

Cinnarios is an art shop built for buyers in Kigali. Every painting opens in the phone's camera at its real size, so a buyer can hang it on their own wall, step back, and decide with help before paying for a print.

This repository holds the **web shop** and its **API**. The augmented-reality camera is a separate Unity app ([cinna03/CP](https://github.com/cinna03/CP)). It serves these same web pages inside the phone and opens the camera when a buyer presses *Open in camera*.

> Capstone project, BSc Software Engineering (AR/VR), African Leadership University.

---

## What the shop does

| Page | What it is for |
|---|---|
| **Home** | Full-motion homepage: the headline inks in as you scroll, a deck of paintings fans out, and a ring of 24 works drifts into place. |
| **Discover** | 18 paintings on a 3D diagonal line, each as different from the others as possible. The set changes every 3 hours and leans towards what the buyer has tried. |
| **Search** | Spotlight-style search by artist, title, feel (*flowers*, *warm*, *gold*) or size (*large*, *wide*, *93x74*). |
| **Painting page** | The work, its real size, *Open in camera*, and five paintings **similar in feel**, with tags saying why each was picked. |
| **Try your own piece** | A buyer photographs a print they already own, enters its real size, and hangs it in the camera. Own prints can be tried but not bought. |
| **Saved, Cart, Checkout** | Saved paintings with Undo; a simple cart with delivery by rider (Kigali or another province); checkout to a Rwandan address. |
| **Account** | The buyer's tries on the wall and how each one ended, saved paintings, orders and delivery address. |
| **Sign in / Create account** | A sliding blush panel, Google sign-in, Apple-style 6-digit code screens, and password reset. |

Every price is shown in **Rwandan francs** (1 USD = 1,477.385 RWF, National Bank of Rwanda average, 17 Nov 2026).

---

## How it is built

```
marketplace-repo/
├── apps/
│   ├── api/                 NestJS API (port 3001, prefix /v1), Prisma + PostgreSQL
│   │   ├── src/auth/        sign-in, tokens, Google OAuth, password reset
│   │   ├── src/catalog/     Met open-access catalogue, sizes and prices
│   │   ├── src/profiles/    buyer profile and the try-on journey
│   │   ├── src/shop/        cart, checkout, orders
│   │   └── prisma/          schema, migrations, seed
│   └── web/                 the shop (vanilla JavaScript, no build step)
│       ├── index.html, app.js, rooms.js, styles.css
│       └── cinnarios/
│           ├── core/        logic with no page drawing (ranking, search, rules)
│           └── ui/          one class per page or component
└── packages/contracts/      shared request schemas (Zod), used by the API
```

### The web shop's modules

The shop is split by responsibility. Each file holds one class:

- **`core/`** is the logic.
  - `similarity.js`: *Similar in feel*.
  - `search.js`: search scoring.
  - `discovery.js`: the Discover picks.
  - `delivery.js`: rider prices.
  - `own-print.js`: own-print checks.
  - `password-strength.js`: the new-password check.
  - `demo-code.js`: the placeholder code.
- **`ui/`** draws pages. Each page class (`SearchPage`, `CartPage`, `AccountPage` and the rest) only draws markup and wires its own buttons. API calls are passed in as *actions*, so no page talks to the server or to browser storage directly.
- **`app.js`** is the router. It loads data, builds the right page and hands it its actions.

### Algorithms worth knowing about

| Where | What it does |
|---|---|
| `core/discovery.js` | **Farthest-point sampling.** Starting from one painting, each next pick is the painting most different from those already chosen (artist, subject, colour, mood, shape, size band). A seeded random generator keyed to the 3-hour block gives everyone the same set until it changes; a buyer's tries then tilt it. |
| `core/similarity.js` | **Weighted similarity ranking.** Subject 4, mood 3, colour 3, artist 1.5, shape 1, plus closeness in wall area. The top five come with their reasons. |
| `core/search.js` | **Token scoring.** Every word typed must match. Artist 5, title word 4, feel 3, size 2. Results sort by the total. |
| `ui/discover-gallery.js`, `ui/motion.js` | **Smoothing with linear interpolation.** One animation loop eases each value towards its target every frame. Each scroll effect is a subclass of `Effect` with its own `draw()`. |
| `ui/code-input.js` | **A small state machine** for the 6-digit code: idle → checking → ok, or idle → checking → error → idle. |
| `app.js` | **Cancelled reads.** Leaving a page aborts its pending requests, so a slow page can never replace the one you are on. |

Motion respects **Reduce Motion**: everything is shown at rest.

---

## Running it locally

**You need:** Node.js 22 or newer, and Docker Desktop for the database.

```bash
# 1. Install
npm install

# 2. Settings: copy the example and fill in the secrets it describes
cp .env.example apps/api/.env

# 3. Database
docker compose up -d
cd apps/api
npx prisma migrate deploy
npx prisma db seed
npx tsx src/catalog/sync-curated.ts   # imports the curated paintings from The Met (needs internet)
cd ../..

# 4. Start the API (terminal 1) and the shop (terminal 2)
npm run dev
node apps/web/server.mjs
```

Open **http://localhost:3000**. The first time, press Cmd+Shift+R (Ctrl+Shift+R on Windows) so the browser loads the newest pages.

### Email

Confirmation and password reset send a 6-digit code to the account email. Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `SMTP_FROM` in `apps/api/.env`. Signing out keeps the account. Only **Delete account** removes it.

### Trying it on a phone

The shop prints its network address when it starts (`WEB_READY http://<your-ip>:3000`). The camera itself runs in the Unity app; see [cinna03/CP](https://github.com/cinna03/CP).

---

## Tests

```bash
npm test
```

This runs the API's unit tests: sign-in, tokens, two-step codes, OAuth claims, Met measurements and pricing, and the confidence record.

---

## About the paintings

Works shown come from **The Metropolitan Museum of Art's open-access collection** and are listed as demonstrations. Sizes are the museum's own centimetres. A painting's subject, colour and mood are the shop's own filing, used to compare paintings, not a reading of the work.

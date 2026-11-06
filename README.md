# Exile Ledger

A personal Path of Exile market tool, powered by poe.ninja. It has five tabs:

- **Market:** live PoE 1 and PoE 2 prices for every category, with in-game icons, divine and chaos/exalted values, 7-day change and volume. Click any item to see its price history for the whole league.
- **Launch Playbook:** what every item did after launch in past leagues, measured in divines. Pick a buy day and a sell day, and compare two leagues side by side.
- **Portfolio:** your watchlist (shopping list), logged buys and sales with live profit in divines, progress towards a Mirror, and plan notes.
- **Crafting:** gem levelling and Vaal profit calculator, plus beast, cluster jewel and base prices.
- **Builds:** poe.ninja's live build meta and your own build shortlist, ranked against weights you choose.

Friends can view everything. Only you can edit, using an admin password.

## How it works

- `index.html` and `assets/` are the website. Plain JavaScript, no build step.
- `api/ninja.js` relays requests to poe.ninja (it does not allow direct browser calls) and caches them.
- `api/data.js` reads and saves your watchlist, portfolio, builds and notes as JSON files in `data/user/` **in this GitHub repo**, so every edit is a commit and nothing needs a database.
- `data/playbook/` holds the day-by-day league history. The **Update launch playbook** GitHub Action rebuilds it every day for the leagues listed in `.github/workflows/playbook.yml`, and you can run it by hand for any league.

## Setup (one time, about 10 minutes)

1. **Deploy on Vercel.** In Vercel, choose *Add New → Project*, import this repo, and deploy with the default settings (no framework, no build command).
2. **Make a GitHub token** so the site can save your edits:
   GitHub → Settings → Developer settings → *Fine-grained tokens* → Generate new token.
   - Repository access: *Only select repositories* → this repo
   - Permissions: *Contents → Read and write*
3. **Add environment variables** in Vercel (Project → Settings → Environment Variables):

   | Name | Value |
   |---|---|
   | `ADMIN_PASSWORD` | the password you will use to edit |
   | `GITHUB_TOKEN` | the token from step 2 |
   | `GITHUB_REPO` | `FrostyCreations/poe-market` (owner/repo) |
   | `GITHUB_BRANCH` | `main` (optional) |

4. **Redeploy** so the variables take effect (Deployments → ⋯ → Redeploy).
5. Open the site, click **Admin**, and enter your password.

Saving your own data does not trigger a new deployment (see `vercel.json`), so edits are instant and don't use build minutes.

## When 3.30 starts

1. The league appears in the league dropdown automatically once poe.ninja lists it.
2. Edit `.github/workflows/playbook.yml` and add the league to `TRACKED`, for example `poe1|Keepers` (use the name exactly as poe.ninja shows it). The daily job will then build its playbook so you can compare it with Allflame and Mirage as the league goes on.
3. If the new league adds a currency category, type its poe.ninja name into **Other category** on the Market tab, or add it to `assets/config.js`.

## Run it locally

```
node scripts/dev-server.mjs          # http://localhost:3000
ADMIN_PASSWORD=test node scripts/dev-server.mjs
node scripts/build-playbook.mjs --game poe1 --league "Allflame"
```

Without `GITHUB_TOKEN`, edits are written to the local `data/user/` files instead.

Prices and icons come from poe.ninja and the official game CDN. This is a personal tool and is not affiliated with Grinding Gear Games.

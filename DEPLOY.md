# Deploying to Cloudflare Pages

The repo is **private**. Cloudflare Pages serves private sources for free, which
is why it was chosen over GitHub Pages (free GitHub accounts can only publish
Pages from a *public* repo).

Everything on the code side is already configured. The steps below are the part
that needs your Cloudflare account, which cannot be done from here.

## One-time setup

1. Go to **https://dash.cloudflare.com** and sign in (or create a free account).
2. On the account home screen, click **Create app** under "Ship something new".
   (Cloudflare redesigned this dashboard; the older path was
   *Workers & Pages → Create → Pages*. Both land in the same place, and
   **Compute** in the left sidebar also reaches it.)
3. Choose **Import a repository** / **Connect to Git**. The new dashboard leads
   with Workers, so Pages may sit behind a secondary tab.
4. Authorise Cloudflare to read GitHub. When it asks which repositories, you can
   grant access to **only** `pontius7/dads-telescope` rather than all repos.

   > **Watch the account.** This machine is signed in to GitHub as **two**
   > accounts, `pontius7` and `nikozz7`, and the repo belongs to **`pontius7`**.
   > The Cloudflare account is a third identity (`Nikocevic7@icloud…`). If the
   > GitHub authorisation runs as `nikozz7`, the repository list comes back
   > empty and it looks as though the repo does not exist. Use the
   > **Add account** / **Configure GitHub App** link in the repo picker to add
   > `pontius7`.

5. Pick the `dads-telescope` repository, then set:

   | Setting | Value |
   |---|---|
   | Framework preset | **Vite** (or "None") |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | Root directory | *(leave blank)* |

   Node version is pinned to 22 by the `.node-version` file, so there is nothing
   to set for it.

6. **Save and Deploy.** The first build takes a couple of minutes.

You get a URL like `https://dads-telescope.pages.dev`.

## Then, on Dad's iPhone

1. Open that URL in **Safari** (it must be Safari — Chrome on iOS cannot install
   web apps).
2. Tap the **Share** button, then **Add to Home Screen**.
3. It launches full-screen with no browser chrome, and works offline for the
   interface and catalogue.

Weather still needs a connection. When offline it says **"Weather unavailable"**
and lowers its confidence rather than showing a stale forecast as current.

## After that

Every `git push` to `main` redeploys automatically. Nothing else to run.

## What is already configured

- `.node-version` — pins Node 22 to match local.
- `vite.config.ts` — PWA manifest, icons, and service worker via
  `vite-plugin-pwa`. Weather responses are deliberately **never** precached.
- `.gitignore` — keeps `node_modules/`, `dist/` and build artefacts out of the
  repo.

## Do not add a `_redirects` file

The usual SPA fallback for Cloudflare **Pages** is:

```
/*    /index.html   200
```

That rule **breaks the build** here. This project deploys as a **Worker with
static assets**, and that runtime already strips `/index.html` down to `/`. The
rule therefore rewrites to `/index.html`, the runtime strips it back to `/`, and
the rule fires again — Cloudflare detects the loop and rejects the deploy with
`Invalid _redirects configuration … Infinite loop detected [code: 100324]`,
*after* the build and asset upload have both succeeded.

It is not needed regardless: this app has no client-side router. Every screen is
React state, so `/` is the only path that exists.

If deep links are ever added, the Workers-native mechanism is
`assets.not_found_handling: "single-page-application"` in a `wrangler.jsonc` —
not a `_redirects` file.

## If you would rather not use Cloudflare

The build output in `dist/` is plain static files. Any static host works —
Netlify, Vercel, S3, or your own server. The only hard requirement is **HTTPS**,
because iOS will not install a web app to the Home Screen over plain HTTP.

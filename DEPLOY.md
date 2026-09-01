# Deploying to Cloudflare Pages

The repo is **private**. Cloudflare Pages serves private sources for free, which
is why it was chosen over GitHub Pages (free GitHub accounts can only publish
Pages from a *public* repo).

Everything on the code side is already configured. The steps below are the part
that needs your Cloudflare account, which cannot be done from here.

## One-time setup

1. Go to **https://dash.cloudflare.com** and sign in (or create a free account).
2. **Workers & Pages → Create → Pages → Connect to Git**.
3. Authorise Cloudflare to read GitHub. When it asks which repositories, you can
   grant access to **only** `pontius7/dads-telescope` rather than all repos.
4. Pick the `dads-telescope` repository, then set:

   | Setting | Value |
   |---|---|
   | Framework preset | **Vite** (or "None") |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | Root directory | *(leave blank)* |

   Node version is pinned to 22 by the `.node-version` file, so there is nothing
   to set for it.

5. **Save and Deploy.** The first build takes a couple of minutes.

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

- `public/_redirects` — `/* /index.html 200`, so any path serves the app instead
  of a 404.
- `.node-version` — pins Node 22 to match local.
- `vite.config.ts` — PWA manifest, icons, and service worker via
  `vite-plugin-pwa`. Weather responses are deliberately **never** precached.
- `.gitignore` — keeps `node_modules/`, `dist/` and build artefacts out of the
  repo.

## If you would rather not use Cloudflare

The build output in `dist/` is plain static files. Any static host works —
Netlify, Vercel, S3, or your own server. The only hard requirement is **HTTPS**,
because iOS will not install a web app to the Home Screen over plain HTTP.

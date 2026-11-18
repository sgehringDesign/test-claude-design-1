# Claude Design System → GitHub

Proof of concept. Put a Claude Design System export in this repo, push, and GitHub does the rest:

- Builds tokens in every common format into `dist/`
- Commits `dist/` back to the repo
- Publishes a docs site to GitHub Pages

The deployed system is **Test Deploy**. **Stephen Gehring** is built too, as a second example.

## What's in here

```
design-system/              The system that gets deployed (Claude export)
  tokens.json               Colors, type, spacing, radius
  README.md                 Brand guidelines (shown on the docs site)
  components/<Name>/preview.html
  assets/                   Logos, images (optional)
examples/<name>/            More systems, same shape. Each gets its own docs page.
scripts/build.mjs           The pipeline. Node 18+, no dependencies.
dist/                       Generated. Import from here.
.github/workflows/deploy.yml
```

## Set it up (once)

1. Create an empty repo on GitHub.
2. Push this folder to it:

```bash
cd claude-design-system-deploy
git init -b main
git add .
git commit -m "Initial design system deploy"
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

3. On GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. **Settings → Actions → General → Workflow permissions → Read and write**. This lets the workflow commit `dist/`.
5. Open the **Actions** tab. Re-run the workflow if the first run started before step 3.

Your site will be at `https://<you>.github.io/<repo>/`.

## Update the design system

Edit in Claude, then copy the changed files into `design-system/` and push. Or ask Claude to push the update for you once GitHub is connected.

Files that map across from the Claude export:

| Claude design system | This repo |
| --- | --- |
| `project/tokens.json` | `design-system/tokens.json` |
| `project/README.md` | `design-system/README.md` |
| `project/components/<Name>/preview.html` | `design-system/components/<Name>/preview.html` |
| asset files (logos etc.) | `design-system/assets/...` |

To deploy a different system, replace the contents of `design-system/`. To add one alongside, add a folder under `examples/`.

## Use the tokens

Hosted stylesheet (fonts, variables, type classes):

```html
<link rel="stylesheet" href="https://<you>.github.io/<repo>/dist/ds.css">

<h1 class="ds-text-h1">Deploy complete</h1>
<button style="background: var(--brand); color: var(--on-brand); border-radius: var(--radius-md); padding: var(--space-2) var(--space-4);">
  Roll back
</button>
```

Sass:

```scss
@use "dist/tokens" as *;
.title { @include ds-type("h2"); color: $ink; }
```

JavaScript or TypeScript:

```js
import { tokens } from "./dist/tokens.js";
tokens.color.brand;      // "#1f6f5c"
tokens.type.h1.fontSize; // "36px"
```

Figma: import `dist/tokens.dtcg.json` with the Tokens Studio plugin.

## Build locally

```bash
npm run build      # writes dist/ and _site/
npm run preview    # build, then serve _site/ at localhost:3000
```

## Notes

- Fonts load from Google Fonts by the first family name in each stack. A licensed font that isn't on Google Fonts (Decimal, in the Stephen Gehring example) fails to load and falls back to the next family in the stack. That's expected.
- Themed colors (`{"light": "#...", "dark": "#..."}`) are supported. The first theme goes on `:root`, the rest on `[data-theme="<id>"]`.
- Any extra token group with a `tokens` array (shadow, motion, borderWidth...) is picked up automatically.

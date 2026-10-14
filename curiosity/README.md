# Curiosity edition

This repo is the official Agentic OS starter ([ctskool/agentic-os-starter-v2](https://github.com/ctskool/agentic-os-starter-v2)) rebranded for Curiosity:

* Jarvis is renamed Hugo everywhere, including the `hugo-v2` folder and code names like `HUGO_URL`.
* Chase AI and CTSkool are renamed Curiosity, and repo links point at `CMGChris/agentic-os`.
* Jev is a separate component and keeps its name.
* The MIT license keeps the original Chase AI copyright line, as the license requires, with a Curiosity Marketing Group line added beneath it.

## Staying current with the official starter

`.github/workflows/upstream-sync.yml` checks the official starter every Monday (or whenever you run it from the Actions tab). When there is a new release it applies `curiosity/rebrand.mjs`, starts the tests, and opens a pull request. Review it, wait for the tests, and merge. `curiosity/UPSTREAM_COMMIT` records which official release this repo is built from.

Installations update from this repo with `node aos.mjs update`, so they only get a new release after you merge it here.

### Rules that keep syncing painless

1. Do not hand edit files that come from the official starter. The next sync replaces them. Put Curiosity specific additions in new files, or add a rule to `rebrand.mjs`.
2. If you add a rename rule, run `node curiosity/rebrand.mjs .` locally and commit the result.
3. GitHub does not let Actions change workflow files. If the official starter changes its own `.github/workflows` files, the pull request says so and you copy those changes in by hand.

## Running the rebrand by hand

```
node curiosity/rebrand.mjs <folder>          # rebrand a copy of the official starter
node curiosity/rebrand.mjs <folder> --check  # list what would change, write nothing
```

Images (screenshots in `docs/assets`) are not edited, so any that show the word Jarvis on screen still do.

# Sharing a theme

A theme pack is one small JSON file. Sharing it means putting that file (or a
`.zip` around it) somewhere people can download it, and telling them where to drop
it. That is the whole workflow - there is no registry, no install step that needs
the application to be rebuilt, and no code involved.

---

## 1. Finish the theme first

```
python tools/ipmtheme.py validate themes/my-theme.ipmtheme.json --strict
python tools/ipmtheme.py preview  themes/my-theme.ipmtheme.json --contrast
```

Fix every error and, ideally, every warning. Before you publish, check:

- [ ] `validate --strict` is clean
- [ ] the `--contrast` table says `ok` on every row
- [ ] `author`, `license` and `version` are filled in
- [ ] `description` is one useful sentence, not a wall of text
- [ ] the `id` does not collide with another pack you have seen (it is the
      filename people will use)
- [ ] the `base` is the closest built-in theme, so people who lack it still get a
      sensible result
- [ ] a screenshot exists (`screenshot: "my-theme.png"`, next to the pack)

## 2. Bundle it

```
python tools/ipmtheme.py bundle themes/my-theme.ipmtheme.json
# -> themes/my-theme.ipmtheme.zip  (theme.json + my-theme.png)
```

The bundle contains the pack as `theme.json` plus the screenshot. Bundles are the
recommended download: one file, and the image survives the trip.

## 3. Put it somewhere

Any of these works:

| Place | Good for | Note |
| --- | --- | --- |
| **GitHub Release asset** | finished themes | attach `my-theme.ipmtheme.zip`; the URL is stable per version |
| **GitHub repo / gist** | browsing and editing | keep `my-theme.ipmtheme.json` plus the `.png` next to it; the raw URL works as a download link |
| **Your own site** | self-hosting | a plain `.json` served with `Content-Type: application/json` is fine |
| **Paste the JSON in a forum post** | quick sharing | people just save it as `my-theme.ipmtheme.json` |

### What to push to GitHub

If you keep a theme repo, this is a good minimal layout:

```
my-theme/
  my-theme.ipmtheme.json      # the theme itself
  my-theme.png                # screenshot (referenced by "screenshot")
  README.md                   # short: what it looks like, how to install, license
  LICENSE                     # optional, if not MIT
.github/workflows/theme.yml   # optional CI: run ipmtheme.py validate on every push
```

A tiny CI job that keeps a theme honest (no app, no dependencies):

```yaml
name: theme
on: [push, pull_request]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
      - run: python tools/ipmtheme.py validate themes/ --strict
```

A theme `README.md` that answers the only questions visitors have:

```markdown
# Midnight Blue - a theme for ISO Package Manager

Dark blue palette with a readable light accent. Screenshot: `midnight-blue.png`

## Install
1. Download `midnight-blue.ipmtheme.zip`
2. `python tools/ipmtheme.py install midnight-blue.ipmtheme.zip`
   (or copy the `.json` into the `themes` folder next to the app)
3. Pick "Midnight Blue" in the Theme menu

## License
MIT. Palette inspired by ... (credit anyone you borrowed from.)
```

## 4. How the other person installs it

Three ways, from easiest to most manual:

```
# a) with the theme tools, straight from the download folder
python tools/ipmtheme.py install midnight-blue.ipmtheme.zip
python tools/ipmtheme.py list                    # confirm it is there

# b) drop it in the per-user folder by hand
#    Windows:  %USERPROFILE%\.ipm\themes\my-theme.ipmtheme.json
#    Linux:    ~/.ipm/themes/my-theme.ipmtheme.json

# c) keep a shared copy and point the app at it
#    Windows:  setx IPM_THEMES_DIR "D:\ipm-themes;%USERPROFILE%\.ipm\themes"
#    Linux:    export IPM_THEMES_DIR="$HOME/ipm-themes:$HOME/.ipm/themes"
```

Then restart the app (or reopen the Theme menu): the pack appears after a
separator, below the four built-in themes.

## 5. Keep it good

* **Bump `version`** when you change colours: `1.0.0` -> `1.1.0`. Nothing updates
  itself, so the number is how people tell they need to re-install.
* **Re-run `validate --strict`** before every release. A broken JSON file is
  skipped by the app with a message rather than crashing it, but it is still a
  broken download.
* **Credit your sources.** If you copied a published palette (Nord, Dracula,
  Catppuccin, Solarized, ...), say so in `author` - the shipped packs do exactly
  that, e.g. `"Catppuccin (palette) / community pack"`.
* **Keep the file self-contained.** No remote images, no absolute paths: a pack
  should work from any folder.

## Security notes for reviewers

A pack is **data**. The app reads JSON, checks the colours, and paints. It never
imports, evaluates or executes anything from a pack, so reviewing one is a matter
of reading a few dozen lines of JSON:

* every value is a string, a boolean or null;
* colour strings only ever go to Tk as colour values;
* `screenshot` is a single filename resolved inside the pack's own folder (the
  unpacker refuses paths that climb out of it), never a URL;
* an unknown or malformed field is reported and ignored.

Still worth a glance in any pack you install: a name that impersonates a built-in
theme, and an `author`/`homepage` that points somewhere odd.
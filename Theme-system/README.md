# ISO Package Manager - theme packs

Everything that lets **anyone** make a theme for ISO Package Manager, drop it in a
folder, and share it with other people - without touching the application code.

A theme is a plain JSON file (`.ipmtheme.json`), usually a few kilobytes. It
contains no code: it is a palette plus a handful of switches, which is why it is
safe to download a theme from a stranger.

```
themes/
  nord.ipmtheme.json
  dracula.ipmtheme.json
  ...
```

---

## What is in this folder

| Path | What it is |
| --- | --- |
| `ipm_themes.py` | The library. Loading, validation, palette merging, WCAG contrast, terminal preview. No third-party packages, no GUI at import time. |
| `tools/ipmtheme.py` | Author-facing CLI: `list`, `dir`, `validate`, `new`, `install`, `export`, `preview`, `bundle`, `check`. |
| `tools/theme_editor.py` | **Theme Studio** - the visual editor. Live preview, WCAG checks, generators, presets, undo/redo, save/install/bundle, plus headless `--check` and `--self-test` modes. |
| `tools/patch_app.py` | Wires theme packs into `main.py` and `ipm_cli.py`. **Dry run by default.** |
| `theme-pack.schema.json` | JSON Schema for editor autocompletion and validation. |
| `themes/*.ipmtheme.json` | Five ready-made packs: Nord, Dracula, Gruvbox Dark, Solarized Light, Catppuccin Mocha. |
| `tests/test_ipm_themes.py` | 122 tests, including a cross-check of the built-in palettes against the real `main.py` and the editor's own helpers. |
| `docs/THEME_EDITOR.md` | How to use the editor: the window, the generators, the CLI, `--check` semantics. |
| `docs/THEME_FORMAT.md` | Complete field-by-field reference for pack authors. |
| `docs/SHARING.md` | How to publish, bundle and install a theme. |

Requirements: Python 3.9+ with the standard library only. The library, the CLIs and
the tests never need Tkinter, so they run on a headless server, in CI, or on a
different machine than the app. Only the editor's *window* needs it, and even
there the import is guarded and only pulled in for the GUI - `--check` and
`--self-test` skip it.

---

## Quick start

Make a theme, check it, look at it, install it:

```
python tools/ipmtheme.py new "Midnight Blue" --base modern-dark --author "your-handle"
python tools/ipmtheme.py validate themes/midnight-blue.ipmtheme.json
python tools/ipmtheme.py preview  themes/midnight-blue.ipmtheme.json --contrast
python tools/ipmtheme.py install  themes/midnight-blue.ipmtheme.json
```

`preview` draws a mock window in the pack's colours - available on any terminal,
colour or not. `--contrast` adds a WCAG table so you can see whether your text is
actually readable.

### Or draw it instead of typing it

`tools/theme_editor.py` is the visual editor: a live mock of the application
window, a swatch and a reset button on every colour, one-click repair tools
(`Fix readability`, `High contrast`, `Invert`, `No colour`, random palettes,
`From accent`), the built-in and installed palettes as presets, undo/redo, and the
same validation the app runs, with a WCAG table.

```
python tools/theme_editor.py                             # new theme
python tools/theme_editor.py themes/nord.ipmtheme.json    # edit an existing pack
python tools/theme_editor.py --new "Midnight Blue" --base modern-dark
python tools/theme_editor.py --check themes/*.ipmtheme.json   # validate, no GUI
python tools/theme_editor.py --self-test                 # check the editor itself
```

It needs Tkinter for the window; `--check` and `--self-test` run headless, so they
work in CI. `--check` exits `0` when every file passes and `1` otherwise, which
makes it a one-line gate for a theme repository. Full details:
[`docs/THEME_EDITOR.md`](docs/THEME_EDITOR.md).

See all five shipped packs with the same tool:

```
python tools/ipmtheme.py list -v
```

## Using a theme in the application

Apply the integration patch (it prints a diff and writes nothing yet):

```
python tools/patch_app.py                          # dry run, shows the plan
python tools/patch_app.py --diff                   # unified diff of the changes
python tools/patch_app.py --apply --app-dir "C:\path\to\IsoPackageManager V0.9"
```

It copies `main.py` and `ipm_cli.py` to `*.ipmbak` first, then byte-compiles both
files. `python tools/patch_app.py --revert` puts them back.

After applying, the app finds themes here, in order:

1. the folder named by `IPM_THEMES_DIR` (several paths may be separated with `;`
   on Windows or `:` elsewhere);
2. `<app folder>/themes` - next to `main.py` / the `.pyz`;
3. `~/.ipm/themes` - the per-user folder, created by `install`;
4. `<archive>/themes` - packs stored *inside* the running `.pyz` (or PyInstaller
   bundle), so a single downloaded file already carries themes. These are read
   straight out of the archive and lose to entries 1-3 when an id repeats.

The Theme menu then lists the four built-ins, a separator, and every installed
pack. The same list appears in Settings -> Theme. The terminal edition gets a new
subcommand:

```
python ipm_cli.py themes
python ipm_cli.py themes nord
python ipm_cli.py themes --preview
```

Without `ipm_themes.py` next to it, both programs behave exactly as before - the
import is wrapped in `try/except` and the built-in palettes stay untouched.

## Running the tests

```
python -m unittest discover -s tests
python tests/test_ipm_themes.py -v
```

122 tests, no display and no network required - the editor is driven through its
test-mode hook, so the suite runs on a headless machine too. The last class parses
`main.py`, extracts the real palette assignments out of `_apply_style`, and fails
if the table inside `ipm_themes.py` ever drifts from what the application actually
paints. The cross-check looks for the newest sibling folder named
`IsoPackageManager V*` (currently `IsoPackageManager V0.9`), so it keeps working
after an upgrade; set `IPM_APP_DIR` to the app folder to point it somewhere else.

To check just the editor, without unittest:

```
python tools/theme_editor.py --self-test
```

## Honest limitations (v1)

These are known and deliberate; all of them are additive follow-ups:

- A pack always paints with the **flat** look. The `style.variant` /
  `style.use_icons` switches are validated and exported, but the GUI's raised-3D
  and icon paths are still keyed to the literal "Graphical" / "Windows XP" names.
- A pack's `style.ttk_theme` is recorded but the ttk *engine* is still chosen by
  the built-in branch (the palette and font of a pack are applied in full).
- Only the theme *palette* is themed; the icons and the search-result table keep
  the app's default metrics.
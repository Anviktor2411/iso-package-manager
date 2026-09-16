# Theme Studio - the visual theme editor

`tools/theme_editor.py` is the GUI that makes a theme pack without writing JSON by
hand. You get a live mock of the application window, every colour next to a
swatch, one-click repair tools, and the same validation the app runs - so you can
see a problem before other people do.

It writes ordinary packs, exactly the format in
[`THEME_FORMAT.md`](THEME_FORMAT.md). Nothing in the editor is required: a text
editor and `tools/ipmtheme.py` still do the whole job.

```
python tools/theme_editor.py                       # start a new theme
python tools/theme_editor.py themes/nord.ipmtheme.json
python tools/theme_editor.py --new "Midnight Blue" --base modern-dark --author "your-handle"
python tools/theme_editor.py --check themes/*.ipmtheme.json   # no GUI, for CI
python tools/theme_editor.py --self-test
```

Requirements: Python 3.9+ with the standard library. The editor window needs
**Tkinter**; `--check` and `--self-test` do not, so they work on a headless server
or in CI. On Debian/Ubuntu install it with `sudo apt install python3-tk`.

---

## The window

Two panes side by side, plus a toolbar and a status bar.

| Area | What it does |
| --- | --- |
| Toolbar | `New`, `Open`, `Save`, `Save as`, `Install`, `Bundle`, `Copy JSON`; the mode switch; `Undo`/`Redo`; the generators; the preset picker. |
| Left pane | The form, in scrolling sections: **Theme** (name, id, author, version, description, license, homepage and the **Base theme** box), then the colours, then **Style switches** in *Everything* mode, then **Actions**. |
| Right pane | Three tabs: **Preview** (a mock app window painted in your colours), **Checks** (errors, warnings and a WCAG contrast table), **JSON** (the exact bytes `Save` will write). |
| Status bar | The mode, the pack id, the file (or `unsaved`), `saved`/`modified`, and a count of problems and low-contrast pairs; on the right, the three most useful shortcuts. |

**Actions** at the bottom of the form is a second home for the things you reach for
most: `Make it readable`, `Pick accent...`, `Reset all to base`,
`Reset the derived colours to base`, and `Terminal preview`.

Colour rows are live: type a value and the preview, the checks and the JSON follow
a moment later. Each row has a **swatch button** that opens the system colour
picker, and a small **reset** button that puts that single colour back to what the
base theme uses.

### Simple mode and Everything mode

**Simple** (the default) shows the nine colours that decide how a theme *looks*:
`bg`, `panel`, `text`, `muted`, `accent`, `accent_active`, `danger`, `border`,
`selection`. That is the whole edit for most people.

**Everything** adds the rest - `accent_text`, `danger_active`, the table and tab
colours (`tree_bg`, `tree_heading_bg`, `tree_heading_fg`, `tab_bg`,
`tab_selected_bg`), `selection_fg` - plus the font, the font size, the ttk engine,
the relief, the corner radius and the `use_icons` switch.

Switching modes never changes the pack: the hidden rows are still there and are
still saved. If you type something in *Everything* mode and switch back, your
value stays.

### Undo, redo, reset

Every edit that changes the pack is a step in the history: typing a colour,
picking one from the wheel, a generator, a preset, a reset. `Ctrl+Z` and `Ctrl+Y`
(or the buttons) walk that history. Opening a file starts a fresh history.

`Edit -> Reset this palette to the base theme` puts every colour back at once -
the same as a fresh `--new` with the same base.

---

## Generators: one click to a usable palette

Generators rewrite the palette but keep your name, id, author and metadata. Each
one goes through the library's contrast self-repair pass and comes back as a
complete 17-colour palette, so it lands in the same shape whatever it started
from.

| Button | What it does |
| --- | --- |
| **Fix readability** | Nudges text, muted text and headings until every WCAG pair passes. Use this after importing a palette you like but cannot read. |
| **High contrast** | Pushes for AAA (7:1) on the body text pairs, not just AA (4.5:1). |
| **Invert** | Flips the palette light-to-dark and repairs the result. |
| **No colour** | Converts everything to matching greys; the theme stops depending on hue. |
| **Random dark** | A seeded random dark palette. Press again for another one; the same seed always gives the same palette, which is what the tests rely on. |
| **Random light** | The same, for a light palette. |
| **From accent** | Rebuilds the whole palette around the accent colour currently in the form. Pick that accent with the swatch on the `accent` row, or with `Edit -> Pick accent colour...`. |

The **preset picker** in the toolbar lists the four built-ins and every installed
pack. `Take its colours` copies that palette into your theme while keeping your
name, id and author - the fast way to start from a theme you already like.

---

## Menus

| Menu | Entries |
| --- | --- |
| File | New `Ctrl+N`, Open pack... `Ctrl+O`, Reload themes, Save `Ctrl+S`, Save as... `Ctrl+Shift+S`, Install into my themes folder, Make a shareable bundle (.zip)..., Copy JSON `Ctrl+J`, Quit `Ctrl+Q` |
| Edit | Undo `Ctrl+Z`, Redo `Ctrl+Y`, Reset this palette to the base theme, Generators (submenu), Pick accent colour... |
| View | Simple, Everything, Terminal preview |
| Help | Quick guide, Where do packs live? |

**Install** copies the pack into your per-user themes folder
(`~/.ipm/themes`, created if it does not exist yet) - the same destination as
`ipmtheme.py install`. **Bundle** wraps it in a `.zip` with a README for sharing
- see [`SHARING.md`](SHARING.md). **Copy JSON** puts the pack on the clipboard so
you can paste it into a gist, a forum post or the app's issue tracker.
**Terminal preview** prints the same mock the `ipmtheme.py preview` command
draws, without colour codes, so it is readable in any window.

`Save` refuses to write silently over a pack that still has validation errors: it
lists the first few and asks *Save anyway?*. `Install` and `Bundle` save the
current state first, so nothing is ever installed from a stale file, and they
report the path they wrote. Neither of them blocks a pack with problems - the
**Checks** tab is where you decide whether the problems matter.

---

## `--check`: validation without the GUI

```
python tools/theme_editor.py --check themes/nord.ipmtheme.json
python tools/theme_editor.py --check themes/*.ipmtheme.json --quiet
```

`--check` takes one or more files (or `.zip` bundles) and prints a report. Exit
codes matter more than the text:

| Exit | Meaning |
| --- | --- |
| `0` | Every file passed. |
| `1` | At least one file failed, or could not be read at all. |
| `2` | Bad command line. |
| `3` | The GUI was requested but Tkinter is not installed. |

One line per file, then the details:

```
FAIL  bad_pack.ipmtheme.json: 9 error(s), 2 warning(s)
      name='Bad' id='bad' base=modern-dark colors=17
      error: colors.panel: required colour is missing
      error: colors.text: required colour is missing
      ...
      note:  the editor would still open this file (missing colours come
             from the base palette), but it does not pass format validation
      warn:  author: empty - other people cannot credit you when you share your theme
      warn:  license: empty - say how others may share your theme (MIT is a common choice)
      WCAG contrast (after filling the gaps from the base)
      ok  text on bg                   10.27:1  (min 4.5:1)
      ok  text on panel                14.33:1  (min 4.5:1)
      ...
```

`--quiet` (`-q`) prints the summary line only, which is what you want in a script:

```
$ python tools/theme_editor.py --check themes/*.ipmtheme.json --quiet
OK    nord.ipmtheme.json: 0 error(s), 0 warning(s)
OK    dracula.ipmtheme.json: 0 error(s), 0 warning(s)
```

`-q` may go before or after `--check`; both spellings behave the same.

### Strict here, forgiving in the window

The editor **opens** a pack the app would reject, because you cannot fix a broken
file you are not allowed to see. Missing colours are filled in from the base
palette for display, the problems are listed in the **Checks** tab, and the file
is only "clean" once the list is empty.

`--check` answers the opposite question - *would this file pass the rules in
`THEME_FORMAT.md`?* - so the raw validator decides pass/fail. That is why the
report above shows a note: the palette on screen looks complete, but the file on
disk is not. If you use `--check` in CI, a pack that only passes because the app
patched it up will still fail, which is the point.

### `--self-test`

`--self-test` runs 68 checks against the editor itself: pack building, slugify and
id rules, every generator, presets, JSON round-tripping, contrast output, the exit
codes of `--check`, and then the real window - mode switching, widgets, undo/redo,
per-colour reset, save, install, bundle, and reopening its own file. It exits `0`
when everything passes and `1` otherwise.

```
$ python tools/theme_editor.py --self-test
PASS  build_pack has every colour       17 keys
...
PASS  checks panel has content          My Theme  [my-theme]  base modern-dark
68/68 checks passed
```

When Tkinter is missing it prints `note  Tkinter is not available ... - GUI checks
skipped` and runs only the headless half. This is the quickest way to prove the
editor still works after changing it, and it is what the test suite calls.

---

## Command line reference

| Option | Meaning |
| --- | --- |
| `pack` | A `.ipmtheme.json` or `.zip` bundle to open. |
| `--pack FILE` | Same as the positional argument, for scripts that prefer a flag. |
| `--new NAME` | Start a new theme with this name (and a slug id derived from it). |
| `--base THEME` | Base for `--new`: `default`, `modern-dark`, `windows-xp` or `graphical`. |
| `--author NAME` | Author recorded in a `--new` pack. |
| `--mode {simple,advanced}` | Which level of detail to open with. |
| `--check FILE [FILE ...]` | Validate and exit; no window. |
| `--quiet`, `-q` | With `--check`: one summary line per file. |
| `--self-test` | Run the built-in checks and exit. |

The base is always one of the **four built-in themes**. An installed pack is not a
valid base - pick `modern-dark` and use the preset picker to copy an installed
palette instead.

---

## Running it from a checkout

```
python tools/theme_editor.py                 # the editor
python tests/test_ipm_themes.py              # 122 tests, including the editor
```

The editor imports `ipm_themes.py` from the folder above it (`../ipm_themes.py`)
and falls back to a copy sitting in `tools/`. It does not touch the application:
`Install` only writes a file into the themes folder. An unsaved theme that you
install or bundle is written to a temporary file first, so a bundle always
contains what you see on screen.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `error: this needs Tkinter, which is missing here` | Install `python3-tk`, or use `--check` / `--self-test`. Exit code `3`. |
| The editor shows errors on a file that "works" | The file is missing colours or metadata; the app fills the gaps but the pack is not shareable as-is. Read the **Checks** tab. |
| `id: "..." is reserved` | Built-in ids (`default`, `modern-dark`, `windows-xp`, `graphical`) cannot be reused. |
| `id: "..." is already installed` | You already have a pack with that id; change the id, not the file name. |
| `base: must be one of ...` | `base` must name a built-in theme, not another pack. |
| Colours I set in *Everything* mode look ignored | The app derives some keys from the base when a pack does not set them; check the built-in limits in the root [`README.md`](../README.md). |

## See also

- [`THEME_FORMAT.md`](THEME_FORMAT.md) - every field, every rule.
- [`SHARING.md`](SHARING.md) - bundling, publishing, installing.
- [`../README.md`](../README.md) - the library, the CLI and the tests.
- `theme-pack.schema.json` - autocompletion in VS Code and other editors.

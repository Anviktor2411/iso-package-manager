# The theme pack format

A theme pack is one JSON object. It describes the colours and a few rendering
switches for ISO Package Manager. Packs contain **no code** - the app never
executes anything from a pack, which is what makes them safe to swap around.

* Schema version: `1`
* File names: `*.ipmtheme.json` (preferred), `*.ipmtheme`, or `*.json`
* Bundle: a `.zip` containing `theme.json` plus an optional screenshot
* Editor support: point `"$schema"` at `theme-pack.schema.json`

A minimal, valid pack:

```json
{
  "$schema": "../theme-pack.schema.json",
  "schema_version": 1,
  "id": "midnight-blue",
  "name": "Midnight Blue",
  "author": "your-handle",
  "version": "1.0.0",
  "license": "MIT",
  "base": "modern-dark",
  "colors": {
    "bg": "#0b1220",
    "panel": "#131c2e",
    "text": "#e8eefc",
    "muted": "#93a3c0",
    "accent": "#3b82f6",
    "accent_active": "#2563eb",
    "danger": "#f87171",
    "danger_active": "#dc2626",
    "border": "#1f2a44",
    "selection": "#1e3a8a"
  }
}
```

Everything else is optional. Anything you leave out is inherited from `base`, so
a two-colour pack is legal - it will just look a lot like its base.

---

## Top-level fields

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `schema_version` | integer | **yes** | Must be `1`. Reserved for future format changes. |
| `id` | string | **yes** | Lowercase machine name, `^[a-z0-9][a-z0-9._-]{0,63}$`. Must be unique and must not collide with `default`, `modern-dark`, `windows-xp`, `graphical` (reserved). |
| `name` | string | **yes** | 1-48 chars. What users see in the Theme menu. Must be unique among installed packs. |
| `base` | string | **yes** | One of `default`, `modern-dark`, `windows-xp`, `graphical`. The palette you start from. |
| `colors` | object | **yes** | See the colour table. Ten keys are mandatory. |
| `author` | string | no | Your name or handle, max 120 chars. Shown by `list -v` and credited when sharing. |
| `version` | string | no | e.g. `1.0.0`. Bump it when you change colours so people know to re-install. |
| `description` | string | no | Max 400 chars, shown in `themes <name>` and in `list -v`. |
| `license` | string | no | e.g. `MIT`, `CC0-1.0`. Say how others may reuse your palette. |
| `homepage` | string | no | `http(s)` link to the theme's page or repository. |
| `screenshot` | string | no | A filename sitting next to the pack (or inside the `.zip`). Relative, no directories. Used by `bundle`. |
| `font_family` | string | no | Max 80 chars. Use a font the target platform has. Inherited from `base` by default. |
| `min_app_version` | string | no | Informational: the oldest app version this pack targets. |
| `style` | object | no | Rendering switches, see below. |
| `$schema` | string | no | Ignored by the app; editors use it for completion. |

Unknown top-level keys are a **warning**, not an error, so a pack written for a
newer version still loads on an older one.

## Colours

| Key | Required | Meaning |
| --- | --- | --- |
| `bg` | **yes** | Window background. |
| `panel` | **yes** | Cards, side panels, list rows, the search-result card. |
| `text` | **yes** | Primary text on `bg` and `panel`. |
| `muted` | **yes** | Secondary text, hints, file sizes. |
| `accent` | **yes** | Primary buttons (Download, Scan, Save). |
| `accent_active` | **yes** | Primary buttons while hovered or pressed. |
| `danger` | **yes** | Destructive buttons (Stop, Delete). |
| `danger_active` | **yes** | Destructive buttons while hovered or pressed. |
| `border` | **yes** | Separators, frame edges, focus rings. |
| `selection` | **yes** | Selected row background in lists and tables. |
| `tree_bg` | no | List/table background. Default: `panel`. |
| `tree_heading_bg` | no | Table header background. Default: `bg`. |
| `tree_heading_fg` | no | Table header text. Default: `text`. |
| `tab_bg` | no | Unselected tab background. Default: `panel`. |
| `tab_selected_bg` | no | Selected tab background. Default: `bg`. |
| `accent_text` | no | Text on accent buttons. Default: `#ffffff`. If your accent is light (Solarized, Gruvbox light accents) set this to a dark colour or the label disappears. |
| `selection_fg` | no | Text on a selected row. Default: `#ffffff`. |

### Colour value syntax

Three forms, all accepted:

* `#rrggbb` - preferred; hex is what the contrast checker can measure.
* `#rgb` - shorthand, expanded to `#rrggbb`.
* a Tk/X11 colour name - `whitesmoke`, `steelblue`, `light gray` (case does not
  matter). Names are accepted but *not* measured by the contrast checker, because
  the validator deliberately does not ship Tk's full `rgb.txt`.

A value that is neither hex nor a plausible colour name (for example `nope`, or
"not a colour") is an **error** - a typo should never silently load.

## `style`

| Key | Type | Values | Notes |
| --- | --- | --- | --- |
| `ttk_theme` | string | `auto`, `clam`, `alt`, `default`, `classic`, `vista`, `xpnative`, `winnative`, `aqua` | Underlying ttk engine. `clam` is the most predictable across platforms. |
| `button_relief` | string | `flat`, `raised`, `sunken`, `groove`, `ridge`, `solid` | `raised` = chunky 3D buttons, `flat` = modern. |
| `tab_relief` | string | same as above | |
| `tree_heading_relief` | string | same as above | |
| `disabled_bg` | colour, palette key, or `null` | e.g. `"#2a3242"` or `"panel"` | Background of a disabled button. |
| `disabled_fg` | colour, palette key, or `null` | e.g. `"muted"` | Text of a disabled button. |
| `pressed_bg` | colour, palette key, or `null` | | Background while pressed. `null` means "use `accent_active`". |
| `focus_border` | colour, palette key, or `null` | e.g. `"accent"` | Keyboard focus ring. |
| `use_icons` | boolean | `true` / `false` | Draw the toolbar icons (the "Graphical" look). |

A **palette key** in a colour slot means "use whatever this pack resolved
`accent` / `muted` / `panel` to", so a pack stays self-consistent even if the
reader's base palette differs. Example: `"focus_border": "accent"`.

## How inheriting works

1. Start from the built-in palette of `base`.
2. Overlay every colour in `colors`.
3. Fill the optional keys: `tree_bg` <- `panel`, `tree_heading_bg` <- `bg`,
   `tree_heading_fg` <- `text`, `tab_bg` <- `panel`, `tab_selected_bg` <- `bg`,
   `accent_text` <- `#ffffff`, `selection_fg` <- `#ffffff`.
4. Style: start from the defaults for `base`, then apply your `style` entries.

Because step 2 happens before step 3, `"tree_bg": "panel"`-style shortcuts are not
needed in `colors` - leaving a key out already does the right thing.

## Validation

```
python tools/ipmtheme.py validate themes/my-theme.ipmtheme.json
python tools/ipmtheme.py validate themes/ --strict     # warnings fail too
python tools/ipmtheme.py check    themes/my-theme.ipmtheme.json   # JSON Schema, needs jsonschema
```

**Errors** stop a pack from loading:

* not JSON / not an object
* `schema_version` missing or not `1`
* `id` missing, malformed, reserved, or already taken
* `name` missing or too long
* `base` missing or unknown
* a required colour missing or not a colour
* a `style` value outside the allowed set (or a bad `ttk_theme` / relief / boolean)

**Warnings** load anyway but should be fixed:

* unknown top-level key or unknown `style` key (a "did you mean ...?" hint is added)
* `colors.accent` equals `colors.bg` (buttons become invisible)
* `panel`, `bg` and `border` all identical (panels stop standing out)
* a WCAG contrast pair below its target. The pairs checked are `text` on `bg`
  and `text` on `panel` (min 4.5:1), `text` on `tree_bg` and `tree_heading_fg` on
  `tree_heading_bg` (min 4.5:1), and `muted` on `bg`, `accent_text` on `accent`,
  `selection_fg` on `selection` (min 3.0:1)
* the pack is byte-identical to its base (probably a forgotten edit)
* a `style` colour that is neither a palette key nor a known colour name

If any pack in a folder is broken, it is skipped and reported - one bad file never
stops the others from loading.

## Worked example: a full pack

`themes/nord.ipmtheme.json` in this repository is the reference. It sets all ten
required colours, overrides four optional ones, and uses palette-key references in
`style`:

```json
  "style": {
    "ttk_theme": "clam",
    "button_relief": "flat",
    "tab_relief": "flat",
    "disabled_bg": "#434c5e",
    "disabled_fg": "#7b8494",
    "focus_border": "accent"
  }
```

## Versioning and compatibility

* `schema_version: 1` is the current format. It will only change if a field
  becomes incompatible; new *optional* fields are added without a bump, and older
  readers warn about them instead of refusing the pack.
* Use `min_app_version` when your pack needs a newer app (for example a style key
  the app only understands from 0.9).
* Keep your own `version` meaningful: users re-install by hand, so `1.0.0` ->
  `1.1.0` tells them something changed.
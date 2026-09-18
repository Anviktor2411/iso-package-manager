# Changing the version and cutting a release

The version number ends up in file names (`iso-package-manager-0.10.pyz`), in the
window title, in `--version` and in the release tag. If one of those is left
behind, a release tagged `v0.10.0` ships files called `...-0.9...`, which is
confusing for everyone downloading them.

So: **never edit the version by hand. Run the script.**

## 1. Where the version lives

`ipm_launcher.py` owns it:

```python
APP_VERSION = "0.10"
```

`build_linux.sh` and `build_pyz.py` read that line to name the files they build,
and `main.py` and `ipm_themes.py` import it at runtime, which is why the window
title and the built-in theme packs always agree with it.

Four other places keep a copy of the number:

| File | What the copy is for |
| --- | --- |
| `main.py` | fallback, used if `ipm_launcher` cannot be imported |
| `ipm_themes.py` | same fallback |
| `tools/theme_editor.py` | the fake app window drawn in the editor preview |
| `README.md`, `build_pyz.py` | example commands and "Current version" |

They exist so the app still shows a sensible number when it is run as a single
file, but it does mean five files have to move together.

## 2. Bumping the version

From the project folder:

```bash
python scripts/bump_version.py 0.11
```

It prints every replacement it makes, and refuses to write anything if one of
the required places is missing, so a half-finished bump cannot happen.

Useful variants:

```bash
python scripts/bump_version.py --check        # do all the files agree?
python scripts/bump_version.py 0.11 --dry-run # show the edits, write nothing
```

`--check` is the one to run before every release. It takes a second and it is
the thing that catches a forgotten file.

### What number to pick

- `0.10` -> `0.11` for new features (a new tab, a new tool, a rebuilt screen)
- `0.10` -> `0.10.1` for bug fixes only
- `1.0` when the app is considered finished enough to be recommended without
  caveats

The git tag adds a `v` and a third number: version `0.11` is tagged `v0.11.0`.

## 3. Release checklist

1. **Bump and verify**

   ```bash
   python scripts/bump_version.py 0.11
   python scripts/bump_version.py --check
   python -m unittest discover -s tests
   ```

2. **Upload the changed files to GitHub** (`Add file -> Upload files` on the
   `main` branch). The bump touches `ipm_launcher.py`, `main.py`,
   `ipm_themes.py`, `build_pyz.py`, `README.md` and `tools/theme_editor.py`.
   Commit message: `Bump version to 0.11`.

3. **Wait for the workflows.** `CI` runs the tests, `Build Linux executables`
   builds and *runs* the Linux binary and the `.pyz` - if the version line were
   broken, that step would fail here rather than after the release is public.

4. **Download the Linux artifacts** from the finished
   `Build Linux executables` run (link at the bottom of the run page). They
   contain the native binary, the `.deb` and the `.pyz`, already named after
   the new version.

5. **Build the Windows executable** on a Windows machine:

   ```bat
   build_exe.bat
   ```

   This produces `dist\ISO-Package-Manager.exe`. Start it once and check that
   the title bar says the new version and that Theme -> Get more themes works.

6. **Make the checksum file** in the folder holding the files you are about to
   upload:

   ```bash
   sha256sum * > SHA256SUMS          # Linux/macOS
   ```

   ```powershell
   Get-FileHash * -Algorithm SHA256  # Windows, then copy the values in
   ```

7. **Create the release**: `Releases -> Draft a new release`, tag `v0.11.0`
   (created from `main`), title `v0.11.0`, attach the binaries and
   `SHA256SUMS`, and publish.

## 4. If `--check` reports a problem

It prints the file and the exact text it expected to find. Either the file was
edited by hand, or the line moved. Fix the file, or - if the code genuinely
changed shape - update the `_edits()` table in `scripts/bump_version.py` so the
script knows where the version lives now.

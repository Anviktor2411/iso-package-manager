#!/usr/bin/env python3
"""Tests for ipm_themes.py, tools/ipmtheme.py and tools/theme_editor.py.

Run from anywhere::

    python tests/test_ipm_themes.py
    python tests/test_ipm_themes.py -v

No third-party packages, no display, no network. The last test class cross-checks
the built-in palettes against the real application source (``main.py``) so the
table in ipm_themes.py cannot silently drift from what the GUI actually paints.
"""

from __future__ import annotations

import base64
import contextlib
import io
import json
import os
import re
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools"))

import ipm_themes as T  # noqa: E402
import ipmtheme  # noqa: E402
import theme_editor  # noqa: E402

THEMES_DIR = ROOT / "themes"

PNG_1PX = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=="
)


def write_pack(path: Path, **overrides) -> Path:
    """Write a valid pack with overrides applied (set a key to None to drop it)."""
    pack = T.new_pack(overrides.pop("name", "Test Theme"), base=overrides.pop("base", "modern-dark"))
    for key, value in overrides.items():
        if value is None:
            pack.pop(key, None)
        elif key in ("colors", "style") and isinstance(value, dict):
            merged = dict(pack.get(key) or {})
            for sub_key, sub_value in value.items():
                if sub_value is None:
                    merged.pop(sub_key, None)
                else:
                    merged[sub_key] = sub_value
            pack[key] = merged
        else:
            pack[key] = value
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(pack, indent=2), encoding="utf-8")
    return path


# ---------------------------------------------------------------------------

class TestColours(unittest.TestCase):
    def test_accepts_hex(self):
        for value in ("#fff", "#FFF", "#aabbcc", "#AABBCC", "#0f172a"):
            self.assertTrue(T.is_color(value), value)

    def test_accepts_named(self):
        for value in ("white", "Black", "light gray", "rebeccapurple"):
            self.assertTrue(T.is_color(value), value)

    def test_rejects_junk(self):
        for value in ("", "  ", "#", "#ab", "#abcd", "#gggggg", "12", "red;#000", "url(x)", "red\nyellow"):
            self.assertFalse(T.is_color(value), repr(value))

    def test_rejects_non_strings(self):
        for value in (None, 1, 1.5, [], {}, True):
            self.assertFalse(T.is_color(value), repr(value))

    def test_to_rgb_short_hex_expands(self):
        self.assertEqual(T.to_rgb("#fff"), (255, 255, 255))
        self.assertEqual(T.to_rgb("#08f"), (0, 136, 255))

    def test_to_rgb_named_and_unknown(self):
        self.assertEqual(T.to_rgb("black"), (0, 0, 0))
        self.assertIsNone(T.to_rgb("chartreuse4"))

    def test_contrast_black_on_white_is_max(self):
        self.assertAlmostEqual(T.contrast_ratio("#000000", "#ffffff"), 21.0, places=2)

    def test_contrast_same_colour_is_one(self):
        self.assertAlmostEqual(T.contrast_ratio("#2563eb", "#2563eb"), 1.0, places=6)

    def test_contrast_is_symmetric(self):
        a = T.contrast_ratio("#0f172a", "#e5e7eb")
        b = T.contrast_ratio("#e5e7eb", "#0f172a")
        self.assertAlmostEqual(a, b, places=9)

    def test_contrast_unknown_colour_is_none(self):
        self.assertIsNone(T.contrast_ratio("chartreuse4", "#ffffff"))
        self.assertIsNone(T.contrast_ratio("#ffffff", None))

    def test_contrast_report_shape(self):
        rows = T.contrast_report(T.BUILTIN_THEMES["modern-dark"].colors)
        self.assertTrue(rows)
        for label, ratio_text, ratio, minimum, ok in rows:
            self.assertIsInstance(label, str)
            self.assertIsInstance(ratio_text, str)
            self.assertIsInstance(minimum, float)
            self.assertIsInstance(ok, bool)
            self.assertEqual(ok, ratio is not None and ratio >= minimum)


class TestValidate(unittest.TestCase):
    def test_new_pack_has_no_errors(self):
        errors, _ = T.validate_pack(T.new_pack("Nice Theme"))
        self.assertEqual(errors, [], errors)

    def test_non_dict(self):
        errors, warnings = T.validate_pack(["not", "a", "pack"])
        self.assertTrue(errors)
        self.assertIn("JSON object", errors[0])
        self.assertEqual(warnings, [])

    def test_missing_required_colour(self):
        pack = T.new_pack("Broken One")
        del pack["colors"]["accent"]
        errors, _ = T.validate_pack(pack)
        self.assertTrue(any("colors.accent" in e and "required" in e for e in errors), errors)

    def test_bad_colour_value_gets_hex_hint(self):
        errors, _ = T.validate_pack(write_pack_dict(colors={"bg": "not a colour"}))
        self.assertTrue(any("colors.bg" in e for e in errors), errors)

    def test_uppercase_id_rejected(self):
        errors, _ = T.validate_pack(write_pack_dict(id="MyTheme"))
        self.assertTrue(any(e.startswith("id:") for e in errors), errors)

    def test_reserved_id_rejected(self):
        for builtin in T.BUILTIN_ORDER:
            errors, _ = T.validate_pack(write_pack_dict(id=builtin, name="Sneaky"))
            self.assertTrue(any("reserved" in e for e in errors), (builtin, errors))

    def test_unknown_top_level_key_warns_with_suggestion(self):
        _errors, warnings = T.validate_pack(write_pack_dict(descripton="typo"))
        self.assertTrue(any("unknown top-level key 'descripton'" in w for w in warnings), warnings)
        self.assertTrue(any("did you mean 'description'" in w for w in warnings), warnings)

    def test_unknown_colour_key_warns(self):
        _errors, warnings = T.validate_pack(write_pack_dict(colors={"backgroud": "#123456"}))
        self.assertTrue(any("colors.backgroud" in w for w in warnings), warnings)
        self.assertTrue(any("bg" in w for w in warnings), warnings)

    def test_bad_base_is_an_error(self):
        errors, _ = T.validate_pack(write_pack_dict(base="nope"))
        self.assertTrue(any(e.startswith("base:") for e in errors), errors)

    def test_bad_schema_version(self):
        errors, _ = T.validate_pack(write_pack_dict(schema_version=2))
        self.assertTrue(any("schema_version" in e for e in errors), errors)
        errors, _ = T.validate_pack(write_pack_dict(schema_version="1"))
        self.assertTrue(any("schema_version" in e for e in errors), errors)

    def test_bad_version_string(self):
        errors, _ = T.validate_pack(write_pack_dict(version="one point oh"))
        self.assertTrue(any(e.startswith("version:") for e in errors), errors)

    def test_name_required_and_bounded(self):
        errors, _ = T.validate_pack(write_pack_dict(name="   "))
        self.assertTrue(any(e.startswith("name:") for e in errors), errors)
        errors, _ = T.validate_pack(write_pack_dict(name="x" * 60))
        self.assertTrue(any("too long" in e for e in errors), errors)

    def test_control_characters_rejected(self):
        errors, _ = T.validate_pack(write_pack_dict(name="bad\x00name"))
        self.assertTrue(any("control characters" in e for e in errors), errors)

    def test_screenshot_traversal_rejected(self):
        for value in ("../../etc/passwd", "/etc/passwd", "..\\..\\secret.png"):
            errors, _ = T.validate_pack(write_pack_dict(screenshot=value))
            self.assertTrue(any(e.startswith("screenshot:") for e in errors), (value, errors))

    def test_screenshot_extension_warns(self):
        _errors, warnings = T.validate_pack(write_pack_dict(screenshot="shot.bmp"))
        self.assertTrue(any("screenshot" in w for w in warnings), warnings)

    def test_bad_style_options(self):
        errors, _ = T.validate_pack(write_pack_dict(style={"button_relief": "wobbly"}))
        self.assertTrue(any("style.button_relief" in e for e in errors), errors)
        errors, _ = T.validate_pack(write_pack_dict(style={"ttk_theme": "sparkly"}))
        self.assertTrue(any("style.ttk_theme" in e for e in errors), errors)
        errors, _ = T.validate_pack(write_pack_dict(style={"use_icons": "yes"}))
        self.assertTrue(any("style.use_icons" in e for e in errors), errors)

    def test_unknown_style_key_warns(self):
        _errors, warnings = T.validate_pack(write_pack_dict(style={"button_releif": "flat"}))
        self.assertTrue(any("style.button_releif" in w for w in warnings), warnings)

    def test_low_contrast_warns(self):
        # pale grey text on a slightly paler grey background
        _errors, warnings = T.validate_pack(
            write_pack_dict(base="default", colors={"text": "#dddddd", "bg": "#eeeeee", "panel": "#eeeeee"})
        )
        self.assertTrue(any("contrast" in w for w in warnings), warnings)

    def test_identical_to_base_warns(self):
        pack = T.new_pack("Carbon Copy")
        _errors, warnings = T.validate_pack(pack)
        self.assertTrue(any("identical to the base theme" in w for w in warnings), warnings)

    def test_accent_equal_to_bg_warns(self):
        _errors, warnings = T.validate_pack(
            write_pack_dict(base="modern-dark", colors={"accent": "#0f172a", "bg": "#0f172a"})
        )
        self.assertTrue(any("invisible" in w for w in warnings), warnings)

    def test_empty_author_and_license_warn(self):
        pack = T.new_pack("Anonymous")
        pack["author"] = ""
        pack["license"] = ""
        _errors, warnings = T.validate_pack(pack)
        self.assertTrue(any(w.startswith("author:") for w in warnings), warnings)
        self.assertTrue(any(w.startswith("license:") for w in warnings), warnings)

    def test_homepage_scheme_warns(self):
        _errors, warnings = T.validate_pack(write_pack_dict(homepage="example.com/theme"))
        self.assertTrue(any("homepage" in w for w in warnings), warnings)


def write_pack_dict(**overrides) -> dict:
    """A valid pack dict with overrides (None removes the key).

    Overrides are applied to the raw dict, so deliberately broken values
    (an empty name, an unknown base) reach the validator instead of being
    rejected by ``new_pack`` first.
    """
    pack = T.new_pack("Test Theme", base="modern-dark")
    for key, value in overrides.items():
        if value is None:
            pack.pop(key, None)
        elif key in ("colors", "style") and isinstance(value, dict):
            merged = dict(pack.get(key) or {})
            merged.update(value)
            pack[key] = merged
        else:
            pack[key] = value
    return pack


class TestShippedPacks(unittest.TestCase):
    def test_every_shipped_pack_validates_cleanly(self):
        files = sorted(THEMES_DIR.glob("*.ipmtheme.json"))
        self.assertGreaterEqual(len(files), 5, f"expected example packs in {THEMES_DIR}")
        for path in files:
            with self.subTest(pack=path.name):
                data = json.loads(path.read_text(encoding="utf-8"))
                errors, warnings = T.validate_pack(data, path.name)
                self.assertEqual(errors, [], f"{path.name} errors: {errors}")
                self.assertEqual(warnings, [], f"{path.name} warnings: {warnings}")

    def test_schema_file_is_valid_json_schema_shape(self):
        schema = json.loads((ROOT / "theme-pack.schema.json").read_text(encoding="utf-8"))
        self.assertEqual(schema["$schema"], "http://json-schema.org/draft-07/schema#")
        self.assertIn("colors", schema["properties"])
        required = schema["properties"]["colors"]["required"]
        self.assertEqual(set(required), set(T.REQUIRED_COLORS))
        self.assertEqual(set(schema["properties"]["colors"]["properties"]), set(T.COLOR_KEYS))
        self.assertEqual(set(schema["required"]), {"schema_version", "id", "name", "base", "colors"})
        self.assertEqual(set(schema["properties"]["style"]["properties"]), set(T.STYLE_KEYS))

    def test_packs_use_distinct_ids(self):
        ids = []
        for path in sorted(THEMES_DIR.glob("*.ipmtheme.json")):
            ids.append(json.loads(path.read_text(encoding="utf-8"))["id"])
        self.assertEqual(len(ids), len(set(ids)), ids)

    def test_packs_reference_the_schema(self):
        for path in sorted(THEMES_DIR.glob("*.ipmtheme.json")):
            data = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(data.get("$schema"), T.SCHEMA_HINT, path.name)


class TestLoading(unittest.TestCase):
    def test_builtins_present_and_ordered(self):
        registry = T.load_themes([THEMES_DIR])
        self.assertEqual([t.id for t in registry.builtins()], list(T.BUILTIN_ORDER))
        self.assertEqual(registry.names()[:4], ["Default", "Modern Dark", "Windows XP", "Graphical"])

    def test_loads_shipped_packs(self):
        registry = T.load_themes([THEMES_DIR])
        pack_ids = {t.id for t in registry.packs()}
        self.assertLessEqual({"nord", "dracula", "gruvbox-dark", "solarized-light", "catppuccin-mocha"}, pack_ids)
        self.assertEqual(registry.problems, [], registry.problems)

    def test_packs_follow_builtins_in_menu_order(self):
        registry = T.load_themes([THEMES_DIR])
        ids = [t.id for t in registry]
        self.assertEqual(ids[:4], list(T.BUILTIN_ORDER))
        self.assertEqual(ids[4:], sorted(ids[4:], key=lambda i: (registry.get(i).name.lower(), i)))

    def test_only_builtin_flag(self):
        registry = T.load_themes(only_builtin=True)
        self.assertEqual(len(registry), 4)
        self.assertEqual(registry.packs(), [])

    def test_resolve_by_id_name_and_fallback(self):
        registry = T.load_themes([THEMES_DIR])
        self.assertEqual(registry.get("nord").name, "Nord")
        self.assertEqual(registry.get("Nord").id, "nord")
        self.assertEqual(registry.get("MODERN DARK").id, "modern-dark")
        self.assertIsNone(registry.get("nope"))
        self.assertIsNone(registry.get(None))

    def test_resolve_module_helper_falls_back(self):
        theme = T.resolve("definitely-not-installed", refresh=True)
        self.assertEqual(theme.id, T.FALLBACK_THEME_ID)

    def test_resolve_accepts_theme_object(self):
        theme = T.BUILTIN_THEMES["graphical"]
        self.assertIs(T.resolve(theme), theme)

    def test_duplicate_ids_keep_first_and_report(self):
        with tempfile.TemporaryDirectory() as tmp:
            first = Path(tmp) / "a"
            second = Path(tmp) / "b"
            write_pack(first / "dup.ipmtheme.json", name="Dup One", id="dup")
            write_pack(second / "dup.ipmtheme.json", name="Dup Two", id="dup")
            registry = T.load_themes([first, second])
            self.assertEqual(len(registry.packs()), 1)
            self.assertTrue(any("duplicate id" in p for p in registry.problems), registry.problems)

    def test_reserved_id_from_disk_is_skipped(self):
        with tempfile.TemporaryDirectory() as tmp:
            write_pack(Path(tmp) / "evil.ipmtheme.json", name="Evil", id="default")
            registry = T.load_themes([tmp])
            self.assertEqual(len(registry.packs()), 0)
            self.assertTrue(any("reserved" in p for p in registry.problems), registry.problems)

    def test_broken_json_is_reported_not_raised(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "broken.ipmtheme.json").write_text("{not json", encoding="utf-8")
            registry = T.load_themes([tmp])
            self.assertEqual(len(registry.packs()), 0)
            self.assertTrue(any("invalid JSON" in p for p in registry.problems), registry.problems)

    def test_invalid_pack_is_reported_not_raised(self):
        with tempfile.TemporaryDirectory() as tmp:
            pack = T.new_pack("Bad Colours")
            pack["colors"]["bg"] = "nope"
            (Path(tmp) / "bad.ipmtheme.json").write_text(json.dumps(pack), encoding="utf-8")
            registry = T.load_themes([tmp])
            self.assertEqual(len(registry.packs()), 0)
            self.assertTrue(registry.problems)

    def test_zip_bundle_loads(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            pack_path = write_pack(folder / "bundle-me.ipmtheme.json", name="Bundled", id="bundled", screenshot="shot.png")
            (folder / "shot.png").write_bytes(PNG_1PX)
            bundle = T.bundle_pack(pack_path)
            self.assertTrue(bundle.is_file())
            with zipfile.ZipFile(bundle) as archive:
                self.assertIn("theme.json", archive.namelist())
                self.assertIn("shot.png", archive.namelist())
            theme = T.load_pack_file(bundle)
            self.assertEqual(theme.name, "Bundled")
            registry = T.load_themes([folder])
            self.assertIn("bundled", {t.id for t in registry.packs()})

    def test_non_pack_files_ignored(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "notes.txt").write_text("hello", encoding="utf-8")
            (Path(tmp) / "readme.md").write_text("hello", encoding="utf-8")
            self.assertEqual(T.iter_pack_files([Path(tmp)]), [])

    def test_load_pack_file_reports_missing_file(self):
        with self.assertRaises(T.ThemeError):
            T.load_pack_file(Path("C:/definitely/missing.ipmtheme.json"))

    def test_registry_reload(self):
        with tempfile.TemporaryDirectory() as tmp:
            registry = T.load_themes([tmp])
            self.assertEqual(len(registry.packs()), 0)
            write_pack(Path(tmp) / "later.ipmtheme.json", name="Later", id="later")
            registry.reload()
            self.assertEqual([t.id for t in registry.packs()], ["later"])


class TestSearchPaths(unittest.TestCase):
    def test_env_var_comes_first(self):
        with tempfile.TemporaryDirectory() as tmp:
            previous = os.environ.get("IPM_THEMES_DIR")
            os.environ["IPM_THEMES_DIR"] = tmp
            try:
                paths = T.search_paths("C:/some/app")
                self.assertEqual(paths[0], Path(tmp))
            finally:
                if previous is None:
                    os.environ.pop("IPM_THEMES_DIR", None)
                else:
                    os.environ["IPM_THEMES_DIR"] = previous

    def test_env_var_accepts_multiple_dirs(self):
        with tempfile.TemporaryDirectory() as tmp:
            one = Path(tmp) / "one"
            two = Path(tmp) / "two"
            previous = os.environ.get("IPM_THEMES_DIR")
            os.environ["IPM_THEMES_DIR"] = os.pathsep.join([str(one), str(two)])
            try:
                paths = T.search_paths()
                self.assertEqual(paths[:2], [one, two])
            finally:
                if previous is None:
                    os.environ.pop("IPM_THEMES_DIR", None)
                else:
                    os.environ["IPM_THEMES_DIR"] = previous

    def test_user_dir_is_last_and_app_dir_present(self):
        paths = T.search_paths("C:/some/app")
        self.assertEqual(paths[-1], T.user_theme_dir())
        self.assertIn(Path("C:/some/app/themes"), paths)

    def test_no_duplicates(self):
        with tempfile.TemporaryDirectory() as tmp:
            previous = os.environ.get("IPM_THEMES_DIR")
            os.environ["IPM_THEMES_DIR"] = tmp
            try:
                paths = T.search_paths(tmp)
                lowered = [str(p).lower() for p in paths]
                self.assertEqual(len(lowered), len(set(lowered)), paths)
            finally:
                if previous is None:
                    os.environ.pop("IPM_THEMES_DIR", None)
                else:
                    os.environ["IPM_THEMES_DIR"] = previous


class TestArchivePacks(unittest.TestCase):
    """Packs inside a ``.pyz`` must be found, read and reported - never crash.

    A zipapp sets ``__file__`` to ``<archive>.pyz/ipm_themes.py``, so the bundled
    ``themes`` folder is not a real directory. Everything the app does with a
    folder has to keep working on those pseudo-paths.
    """

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory(prefix="ipm-archive-")
        self.addCleanup(self._tmp.cleanup)
        self.folder = Path(self._tmp.name)
        self.archive = self.folder / "fake-app.pyz"
        pack = write_pack(self.folder / "source" / "nord.ipmtheme.json", name="Nord", id="nord")
        body = pack.read_text(encoding="utf-8")
        with zipfile.ZipFile(self.archive, "w") as handle:
            handle.writestr("__main__.py", "print('hi')\n")
            handle.write(pack, "themes/nord.ipmtheme.json")
            handle.writestr("themes/notes.txt", "not a theme\n")
            handle.writestr("themes/deeper/hidden.ipmtheme.json", body)
            handle.writestr("other/stray.ipmtheme.json", body)
        self.inside = self.archive / "themes"

    def test_finds_only_top_level_packs_inside_the_archive(self):
        found = T.iter_pack_files([self.inside])
        self.assertEqual([p.name for p in found], ["nord.ipmtheme.json"])

    def test_member_paths_keep_pointing_at_the_archive(self):
        found = T.iter_pack_files([self.inside])[0]
        self.assertEqual(Path(str(found).split(".pyz")[0] + ".pyz"), self.archive)
        self.assertIn("themes/nord.ipmtheme.json", str(found).replace("\\", "/"))

    def test_a_folder_that_does_not_exist_yields_nothing(self):
        self.assertEqual(T.iter_pack_files([self.folder / "nope" / "themes"]), [])

    def test_a_directory_named_like_an_archive_is_read_normally(self):
        decoy = self.folder / "looks-like.pyz"
        write_pack(decoy / "themes" / "nord.ipmtheme.json", name="Nord", id="nord")
        found = T.iter_pack_files([decoy / "themes"])
        self.assertEqual([p.name for p in found], ["nord.ipmtheme.json"])

    def test_is_pack_member_truth_table(self):
        self.assertTrue(T.is_pack_member(self.inside / "nord.ipmtheme.json"))
        self.assertFalse(T.is_pack_member(self.inside / "ghost.ipmtheme.json"))
        self.assertFalse(T.is_pack_member(self.inside / "notes.txt"))
        self.assertFalse(T.is_pack_member(self.folder / "plain.ipmtheme.json"))

    def test_load_pack_file_reads_the_member(self):
        theme = T.load_pack_file(self.inside / "nord.ipmtheme.json")
        self.assertEqual(theme.id, "nord")
        self.assertEqual(theme.name, "Nord")
        self.assertFalse(theme.is_builtin)
        self.assertFalse(theme.path.is_file())

    def test_source_names_the_archive(self):
        theme = T.load_pack_file(self.inside / "nord.ipmtheme.json")
        self.assertIn("fake-app.pyz", theme.source)
        self.assertIn("themes/nord.ipmtheme.json", theme.source.replace("\\", "/"))

    def test_load_pack_file_on_a_missing_member_raises(self):
        with self.assertRaises(T.ThemeError):
            T.load_pack_file(self.inside / "ghost.ipmtheme.json")

    def test_load_themes_lists_the_bundled_pack(self):
        registry = T.load_themes([self.inside])
        self.assertEqual([t.id for t in registry.packs()], ["nord"])
        self.assertEqual(registry.problems, [])
        self.assertEqual(registry.dirs, [self.inside])

    def test_style_kwargs_from_a_bundled_pack_are_complete(self):
        theme = T.load_pack_file(self.inside / "nord.ipmtheme.json")
        kwargs = T.to_style_kwargs(theme)
        for key in T.COLOR_KEYS:
            self.assertIn(key, kwargs)
        for key in T.STYLE_KEYS:
            self.assertIn(key, kwargs)

    def test_a_broken_member_is_a_problem_not_a_crash(self):
        with zipfile.ZipFile(self.archive, "a") as handle:
            handle.writestr("themes/broken.ipmtheme.json", "{not json")
        registry = T.load_themes([self.inside])
        self.assertEqual([t.id for t in registry.packs()], ["nord"])
        self.assertEqual(len(registry.problems), 1)
        self.assertTrue(registry.problems[0].strip())

    def test_a_real_folder_beats_the_archive_copy(self):
        real = self.folder / "real-themes"
        write_pack(real / "nord.ipmtheme.json", name="Nord on disk", id="nord")
        registry = T.load_themes([real, self.inside])
        self.assertEqual([t.id for t in registry.packs()], ["nord"])
        self.assertEqual(registry.packs()[0].name, "Nord on disk")
        self.assertTrue(any("duplicate id" in p for p in registry.problems), registry.problems)

    def test_container_helpers_describe_this_checkout(self):
        self.assertEqual(T.container_dir(), ROOT)
        self.assertEqual(T.app_theme_dir(), THEMES_DIR)
        self.assertIsNone(T.bundled_theme_dir())


class TestAuthoring(unittest.TestCase):
    def test_new_pack_slugifies_the_name(self):
        pack = T.new_pack("Midnight  Blue!!")
        self.assertEqual(pack["id"], "midnight-blue")

    def test_new_pack_rejects_reserved_and_empty(self):
        with self.assertRaises(T.ThemeError):
            T.new_pack("Anything", pack_id="default")
        with self.assertRaises(T.ThemeError):
            T.new_pack("   ")
        with self.assertRaises(T.ThemeError):
            T.new_pack("Anything", base="not-a-theme")

    def test_new_pack_carries_author(self):
        self.assertEqual(T.new_pack("Mine", author="Alice")["author"], "Alice")

    def test_export_builtin_round_trips(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "exported.ipmtheme.json"
            T.export_builtin("graphical", target)
            data = json.loads(target.read_text(encoding="utf-8"))
            errors, _ = T.validate_pack(data, target.name)
            self.assertEqual(errors, [], errors)
            theme = T.load_pack_file(target)
            self.assertEqual(theme.base, "graphical")
            for key, value in T.BUILTIN_PALETTES["graphical"].items():
                self.assertEqual(theme.colors[key], value, key)

    def test_install_pack_copies_and_validates(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            source = write_pack(folder / "src.ipmtheme.json", name="Installed", id="installed-one")
            dest = folder / "user-themes"
            saved = T.install_pack(source, dest)
            self.assertTrue(saved.is_file())
            self.assertEqual(saved.name, "installed-one.ipmtheme.json")
            self.assertEqual(T.load_pack_file(saved).name, "Installed")

    def test_install_pack_refuses_invalid(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            bad = folder / "bad.ipmtheme.json"
            pack = T.new_pack("Bad")
            pack["colors"]["text"] = "nope"
            bad.write_text(json.dumps(pack), encoding="utf-8")
            with self.assertRaises(T.ThemeError):
                T.install_pack(bad, folder / "user-themes")

    def test_bundle_without_screenshot_still_works(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = write_pack(Path(tmp) / "plain.ipmtheme.json", name="Plain", id="plain")
            bundle = T.bundle_pack(source)
            with zipfile.ZipFile(bundle) as archive:
                self.assertEqual(archive.namelist(), ["theme.json"])

    def test_bundle_ignores_screenshot_outside_the_folder(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = write_pack(Path(tmp) / "a" / "escape.ipmtheme.json", name="Escape", id="escape", screenshot="../x.png")
            (Path(tmp) / "x.png").write_bytes(PNG_1PX)
            data = json.loads(source.read_text(encoding="utf-8"))
            data["screenshot"] = "x.png"  # valid name, but the file lives one level up
            source.write_text(json.dumps(data), encoding="utf-8")
            bundle = T.bundle_pack(source)
            with zipfile.ZipFile(bundle) as archive:
                self.assertEqual(archive.namelist(), ["theme.json"])


class TestStyleKwargs(unittest.TestCase):
    def test_builtin_variants(self):
        self.assertEqual(T.to_style_kwargs("Default")["variant"], "flat")
        self.assertEqual(T.to_style_kwargs("Modern Dark")["variant"], "flat")
        self.assertEqual(T.to_style_kwargs("Windows XP")["variant"], "xp")
        self.assertEqual(T.to_style_kwargs("Graphical")["variant"], "graphical")
        self.assertTrue(T.to_style_kwargs("Graphical")["use_icons"])
        self.assertFalse(T.to_style_kwargs("Modern Dark")["use_icons"])

    def test_pack_can_request_the_graphical_look(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = write_pack(Path(tmp) / "iconic.ipmtheme.json", name="Iconic", id="iconic", style={"use_icons": True})
            kwargs = T.to_style_kwargs(T.load_pack_file(path))
            self.assertTrue(kwargs["use_icons"])
            self.assertEqual(kwargs["variant"], "graphical")

    def test_palette_key_references_are_resolved(self):
        graphics = T.to_style_kwargs("Graphical")
        self.assertEqual(graphics["focus_border"], graphics["accent"])
        self.assertEqual(graphics["disabled_fg"], graphics["muted"])
        xp = T.to_style_kwargs("Windows XP")
        self.assertEqual(xp["focus_border"], xp["border"])

    def test_all_colour_keys_present(self):
        kwargs = T.to_style_kwargs("nord")
        for key in T.COLOR_KEYS:
            self.assertIn(key, kwargs, key)
            self.assertTrue(T.is_color(kwargs[key]), (key, kwargs[key]))

    def test_pack_colours_override_the_base(self):
        kwargs = T.to_style_kwargs("nord")
        self.assertEqual(kwargs["bg"], "#2e3440")
        self.assertEqual(kwargs["base"], "modern-dark")
        self.assertEqual(kwargs["id"], "nord")

    def test_defaults_fill_missing_optional_colours(self):
        with tempfile.TemporaryDirectory() as tmp:
            pack = T.new_pack("Sparse", base="modern-dark")
            for key in ("tree_bg", "tab_bg", "accent_text", "tree_heading_fg"):
                pack["colors"].pop(key, None)
            path = Path(tmp) / "sparse.ipmtheme.json"
            path.write_text(json.dumps(pack), encoding="utf-8")
            theme = T.load_pack_file(path)
            self.assertEqual(theme.colors["accent_text"], "#ffffff")
            self.assertEqual(theme.colors["tree_bg"], theme.colors["panel"])
            self.assertEqual(theme.colors["tree_heading_fg"], theme.colors["text"])


class TestMenu(unittest.TestCase):
    def test_structure_has_builtins_then_separator_then_packs(self):
        items = T.menu_structure(refresh=True)
        kinds = [item["kind"] for item in items]
        self.assertEqual(kinds[0], "theme")
        self.assertIn("separator", kinds)
        separator = kinds.index("separator")
        self.assertTrue(all(k == "theme" for k in kinds[:separator]))
        self.assertTrue(all(k == "theme" for k in kinds[separator + 1 :]))
        labels = [item["label"] for item in items if item["kind"] == "theme"]
        self.assertEqual(labels[:4], ["Default", "Modern Dark", "Windows XP", "Graphical"])
        self.assertIn("Nord", labels)

    def test_pack_entries_carry_author(self):
        items = [i for i in T.menu_structure(refresh=True) if i.get("id") == "nord"]
        self.assertEqual(len(items), 1)
        self.assertTrue(items[0]["author"])

    def test_duplicate_names_get_disambiguated(self):
        with tempfile.TemporaryDirectory() as tmp:
            write_pack(Path(tmp) / "one.ipmtheme.json", name="Same Name", id="same-one")
            write_pack(Path(tmp) / "two.ipmtheme.json", name="Same Name", id="same-two")
            registry = T.load_themes([tmp])
            self.assertEqual(len(registry.packs()), 2)
            names = [t.name for t in registry.packs()]
            self.assertEqual(names, ["Same Name", "Same Name"])  # ids differ, names match


class TestPreview(unittest.TestCase):
    def test_preview_with_colour_emits_truecolour_escapes(self):
        text = T.ansi_preview("nord", color=True)
        self.assertIn("\033[48;2;", text)
        self.assertIn("\033[38;2;", text)
        self.assertIn("Nord", text)
        self.assertIn("#2e3440", text)

    def test_plain_preview_has_no_escapes(self):
        text = T.ansi_preview("nord", color=False)
        self.assertNotIn("\033", text)
        self.assertIn("#2e3440", text)

    def test_preview_shows_author_and_version(self):
        text = T.ansi_preview("nord", color=False)
        self.assertIn("v1.0.0", text)
        self.assertIn("Nord", text)

    def test_preview_of_builtin_is_marked(self):
        self.assertIn("(built-in)", T.ansi_preview("graphical", color=False))

    def test_preview_never_raises_for_unknown_theme(self):
        self.assertIsInstance(T.ansi_preview("no-such-theme", color=False), str)


class TestCli(unittest.TestCase):
    def _run(self, argv: list[str]) -> tuple[int, str]:
        buffer = io.StringIO()
        original = sys.stdout
        sys.stdout = buffer
        try:
            code = ipmtheme.main(argv)
        finally:
            sys.stdout = original
        return code, buffer.getvalue()

    def test_list_exit_zero(self):
        code, out = self._run(["list"])
        self.assertEqual(code, 0)
        self.assertIn("Nord", out)

    def test_dir_lists_user_folder(self):
        code, out = self._run(["dir"])
        self.assertEqual(code, 0)
        self.assertIn(str(T.user_theme_dir()), out)

    def test_validate_good_pack(self):
        code, out = self._run(["validate", str(THEMES_DIR / "nord.ipmtheme.json")])
        self.assertEqual(code, 0)
        self.assertIn("PASS", out)

    def test_validate_bad_pack_exit_one(self):
        with tempfile.TemporaryDirectory() as tmp:
            pack = T.new_pack("Bad")
            pack["colors"]["bg"] = "nope"
            path = Path(tmp) / "bad.ipmtheme.json"
            path.write_text(json.dumps(pack), encoding="utf-8")
            code, out = self._run(["validate", str(path)])
            self.assertEqual(code, 1)
            self.assertIn("FAIL", out)
            self.assertIn("error", out)

    def test_validate_missing_file_exit_one(self):
        code, _out = self._run(["validate", "C:/nope/missing.ipmtheme.json"])
        self.assertEqual(code, 1)

    def test_validate_strict_treats_warnings_as_failure(self):
        with tempfile.TemporaryDirectory() as tmp:
            pack = T.new_pack("Warny")
            pack["author"] = ""
            path = Path(tmp) / "warny.ipmtheme.json"
            path.write_text(json.dumps(pack), encoding="utf-8")
            self.assertEqual(self._run(["validate", str(path)])[0], 0)
            self.assertEqual(self._run(["validate", "--strict", str(path)])[0], 1)

    def test_new_writes_a_file_that_validates(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "themes" / "made.ipmtheme.json"
            code, out = self._run(["new", "Made Up", "--author", "Tester", "-o", str(target)])
            self.assertEqual(code, 0, out)
            self.assertTrue(target.is_file())
            self.assertEqual(self._run(["validate", str(target)])[0], 0)
            self.assertEqual(json.loads(target.read_text(encoding="utf-8"))["author"], "Tester")

    def test_new_refuses_to_overwrite_without_force(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "x.ipmtheme.json"
            target.write_text("{}", encoding="utf-8")
            self.assertEqual(self._run(["new", "X", "-o", str(target)])[0], 2)
            self.assertEqual(target.read_text(encoding="utf-8"), "{}")
            self.assertEqual(self._run(["new", "X", "-o", str(target), "--force"])[0], 0)

    def test_new_rejects_reserved_id(self):
        with tempfile.TemporaryDirectory() as tmp:
            code, _out = self._run(["new", "Bad Id", "--id", "default", "-o", str(Path(tmp) / "y.json")])
            self.assertEqual(code, 2)

    def test_install_to_explicit_folder(self):
        with tempfile.TemporaryDirectory() as tmp:
            code, out = self._run(["install", str(THEMES_DIR / "dracula.ipmtheme.json"), "--to", tmp])
            self.assertEqual(code, 0, out)
            self.assertTrue((Path(tmp) / "dracula.ipmtheme.json").is_file())

    def test_export_round_trip(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "start.ipmtheme.json"
            self.assertEqual(self._run(["export", "modern-dark", "-o", str(target)])[0], 0)
            self.assertEqual(self._run(["validate", str(target)])[0], 0)

    def test_export_unknown_theme(self):
        self.assertEqual(self._run(["export", "not-a-theme"])[0], 2)

    def test_preview_no_arg_previews_everything(self):
        code, out = self._run(["preview", "--no-color"])
        self.assertEqual(code, 0)
        self.assertIn("Nord", out)
        self.assertIn("Default", out)

    def test_preview_contrast_table(self):
        code, out = self._run(["preview", "nord", "--no-color", "--contrast"])
        self.assertEqual(code, 0)
        self.assertIn("min", out)

    def test_bundle_command(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = write_pack(Path(tmp) / "b.ipmtheme.json", name="Bee", id="bee", screenshot="bee.png")
            (Path(tmp) / "bee.png").write_bytes(PNG_1PX)
            code, out = self._run(["bundle", str(source)])
            self.assertEqual(code, 0, out)
            self.assertTrue((Path(tmp) / "bee.ipmtheme.zip").is_file())

    def test_no_command_prints_help(self):
        code, out = self._run([])
        self.assertEqual(code, 0)
        self.assertIn("preview", out)


class TestAgainstApplicationSource(unittest.TestCase):
    """The built-in table must match what main.py actually paints."""

    @staticmethod
    def _app_main() -> Path | None:
        """``main.py`` of the application, or ``None`` when it is not here.

        Prefer ``IPM_APP_DIR``, then any sibling ``IsoPackageManager V*`` folder
        (newest version first), so the cross-check keeps working when the app is
        upgraded from V0.8 to V0.9 and so on.
        """
        candidates: list[Path] = []
        env = os.environ.get("IPM_APP_DIR")
        if env:
            candidates.append(Path(env) / "main.py")
        siblings = [
            path
            for path in ROOT.parent.glob("IsoPackageManager V*")
            if path.is_dir()
        ]
        siblings.sort(
            key=lambda path: [int(part) for part in re.findall(r"\d+", path.name)] or [0],
            reverse=True,
        )
        candidates.extend(path / "main.py" for path in siblings)
        candidates.append(ROOT.parent / "IsoPackageManager" / "main.py")
        for candidate in candidates:
            if candidate.is_file():
                return candidate
        return None

    @classmethod
    def _app_palettes(cls) -> dict[str, dict[str, str]]:
        main_path = cls._app_main()
        if main_path is None:
            raise unittest.SkipTest("application main.py not found - skipping cross-check")

        text = main_path.read_text(encoding="utf-8", errors="replace")
        start = text.index("def _apply_style(self, theme")
        end = text.index("def _build_ui", start)
        body = text[start:end]

        # ``_apply_style`` has two twelve-space branches: the ttk theme_use block
        # and the palette block. Take the *last* marker before the fonts, which
        # is the palette one, otherwise every found palette is empty.
        block_end = body.index("default_font =")
        block_start = body.rindex('if theme == "Windows XP":', 0, block_end)
        block = body[block_start:block_end]

        chunks = re.split(r"\n(?= {12}(?:if |elif |else:))", block)
        palettes: dict[str, dict[str, str]] = {}
        for chunk in chunks:
            if 'theme == "Windows XP"' in chunk.split("\n")[0]:
                key = "windows-xp"
            elif 'theme == "Graphical"' in chunk.split("\n")[0]:
                key = "graphical"
            elif 'theme == "Default"' in chunk.split("\n")[0]:
                key = "default"
            elif chunk.lstrip().startswith("else:"):
                key = "modern-dark"
            else:
                continue

            found: dict[str, str] = {}
            for name, value in re.findall(r"^\s+(\w+) = \"(#[0-9a-fA-F]{6})\"$", chunk, re.M):
                found[name] = value.lower()
            for name, alias in re.findall(r"^\s+(tree_bg|tree_heading_bg|tab_bg|tab_selected_bg) = (\w+)$", chunk, re.M):
                if alias in found:
                    found[name] = found[alias]
            palettes[key] = found
        return palettes

    def test_every_builtin_matches_the_application(self):
        app = self._app_palettes()
        keys = ("bg", "panel", "text", "muted", "accent", "accent_active", "danger", "danger_active", "border", "selection")
        for theme_id, palette in T.BUILTIN_PALETTES.items():
            with self.subTest(theme=theme_id):
                self.assertIn(theme_id, app, f"{theme_id} branch not found in main.py")
                for key in keys:
                    self.assertIn(key, app[theme_id], f"main.py has no {key} for {theme_id}")
                    self.assertEqual(
                        app[theme_id][key],
                        palette[key].lower(),
                        f"{theme_id}.{key}: app paints {app[theme_id][key]}, ipm_themes says {palette[key]}",
                    )

    def test_builtin_names_match_the_menu(self):
        main_path = self._app_main()
        if main_path is None:
            self.skipTest("application main.py not found")
        text = main_path.read_text(encoding="utf-8", errors="replace")
        for theme_id, name in T.BUILTIN_NAMES.items():
            self.assertIn(f'"{name}"', text, f"main.py never mentions the theme name {name!r}")

    def test_windows_font_matches(self):
        app = self._app_palettes()
        main_path = self._app_main()
        if main_path is None:
            self.skipTest("application main.py not found")
        if "windows-xp" not in app:
            self.skipTest("no windows-xp branch")
        text = main_path.read_text(encoding="utf-8", errors="replace")
        self.assertIn('font_family = "Tahoma" if is_windows() else "Sans"', text)
        self.assertEqual(T.BUILTIN_FONTS["windows-xp"], "Tahoma")


class TestThemeEditor(unittest.TestCase):
    """tools/theme_editor.py: the pure helpers and the never-GUI check mode."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory(prefix="ipm-editor-test-")
        self.folder = Path(self._tmp.name)
        self.addCleanup(self._tmp.cleanup)

    def _raw(self, name: str, payload: Any) -> Path:
        path = self.folder / name
        path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        return path

    # -- building packs ----------------------------------------------------

    def test_build_pack_is_complete_and_valid(self):
        pack = theme_editor.build_pack(name="Round Trip", pack_id="round-trip")
        self.assertEqual(set(pack["colors"]), set(T.COLOR_KEYS))
        self.assertEqual(theme_editor.review(pack)["errors"], [])
        self.assertEqual(pack["id"], "round-trip")

    def test_id_falls_back_to_the_name(self):
        self.assertEqual(theme_editor.build_pack(name="Midnight Blue")["id"], "midnight-blue")

    def test_simple_mode_targets_the_important_colours(self):
        simple = set(theme_editor.SIMPLE_KEYS)
        self.assertLess(simple, set(T.COLOR_KEYS), "simple mode must be a real subset")
        for key in ("bg", "panel", "text", "muted", "accent", "danger", "border", "selection"):
            self.assertIn(key, simple)

    def test_every_colour_has_a_label_and_a_hint(self):
        for key in T.COLOR_KEYS:
            self.assertIn(key, theme_editor.COLOR_LABELS)
            self.assertIn(key, theme_editor.COLOR_HELP)
        for key in T.STYLE_KEYS:
            self.assertIn(key, theme_editor.STYLE_LABELS)

    def test_colour_groups_cover_the_palette_exactly_once(self):
        grouped = [key for _title, keys in theme_editor.COLOR_GROUPS for key in keys]
        self.assertEqual(sorted(grouped), sorted(T.COLOR_KEYS))
        self.assertEqual(len(grouped), len(set(grouped)), "a colour is listed twice")

    def test_style_overrides_drop_the_defaults(self):
        dropped = theme_editor.style_overrides({"ttk_theme": "auto", "use_icons": False, "pressed_bg": ""})
        for key in ("ttk_theme", "use_icons", "pressed_bg"):
            self.assertNotIn(key, dropped)
        kept = theme_editor.style_overrides({"ttk_theme": "clam", "use_icons": True, "pressed_bg": "#ff0000"})
        self.assertEqual(kept.get("ttk_theme"), "clam")
        self.assertIs(kept.get("use_icons"), True)
        self.assertEqual(kept.get("pressed_bg"), "#ff0000")

    # -- loading and repairing --------------------------------------------

    def test_normalize_fills_the_gaps_from_the_base(self):
        pack = theme_editor.normalize_pack(
            {"id": "gap", "name": "Gap", "base": "windows-xp", "colors": {"bg": "#000000"}}
        )
        self.assertEqual(pack["base"], "windows-xp")
        self.assertEqual(set(pack["colors"]), set(T.COLOR_KEYS))
        self.assertEqual(pack["colors"]["bg"], "#000000")
        self.assertEqual(
            pack["colors"]["panel"], T.BUILTIN_THEMES["windows-xp"].colors["panel"]
        )
        self.assertIsNotNone(theme_editor.review(pack)["theme"])

    def test_installed_pack_id_is_not_a_valid_base(self):
        """Only built-in ids may be used as ``base``; example packs are not built-ins."""
        pack = theme_editor.normalize_pack(
            {"id": "gap", "name": "Gap", "base": "nord", "colors": {"bg": "#000000"}}
        )
        self.assertEqual(pack["base"], T.FALLBACK_THEME_ID)
        self.assertEqual(set(pack["colors"]), set(T.COLOR_KEYS))

    def test_unknown_base_falls_back_to_a_builtin(self):
        pack = theme_editor.normalize_pack({"name": "Odd", "base": "not-a-theme"})
        self.assertEqual(pack["base"], T.FALLBACK_THEME_ID)

    def test_editor_opens_packs_that_check_mode_rejects(self):
        path = self._raw("thin.ipmtheme.json",
                         {"id": "thin", "name": "Thin", "colors": {"bg": "#101418"}})
        pack, problem = theme_editor.load_pack_data(path)
        self.assertTrue(problem, "the loader should still report what is wrong")
        self.assertEqual(set(pack["colors"]), set(T.COLOR_KEYS), "the editor needs every row filled in")
        self.assertTrue(theme_editor.check_pack(path)["errors"])

    def test_json_round_trips_through_the_loader(self):
        pack = theme_editor.build_pack(name="Round Trip", pack_id="round-trip", colors={"accent": "#e0a020"})
        path = self.folder / "round-trip.ipmtheme.json"
        path.write_text(theme_editor.pack_json(pack), encoding="utf-8")
        loaded, problem = theme_editor.load_pack_data(path)
        self.assertEqual(problem, "")
        self.assertEqual(loaded["colors"], pack["colors"])
        self.assertEqual(loaded["colors"]["accent"], "#e0a020")
        self.assertEqual(theme_editor.check_pack(path)["errors"], [])

    # -- check mode -------------------------------------------------------

    def test_check_pack_accepts_the_example_packs(self):
        packs = sorted(THEMES_DIR.glob("*.ipmtheme.json"))
        if not packs:
            self.skipTest("no example packs to check")
        for path in packs:
            with self.subTest(pack=path.name):
                report = theme_editor.check_pack(path)
                self.assertEqual(report["errors"], [])
                self.assertFalse(report["repaired"])
                self.assertEqual(len(report["rows"]), len(T.CONTRAST_PAIRS))
                self.assertEqual(report["pack"]["id"], json.loads(path.read_text(encoding="utf-8"))["id"])

    def test_check_pack_reads_a_bundle(self):
        source = write_pack(self.folder / "bundled.ipmtheme.json", name="Bundled")
        bundle = T.bundle_pack(source, self.folder / "bundled.zip")
        self.assertEqual(theme_editor.check_pack(bundle)["errors"], [])

    def test_check_pack_reports_every_missing_colour(self):
        path = self._raw("empty.ipmtheme.json",
                         {"id": "empty", "name": "Empty", "base": "modern-dark", "colors": {}})
        report = theme_editor.check_pack(path)
        self.assertTrue(report["repaired"])
        messages = "\n".join(report["errors"])
        for key in T.REQUIRED_COLORS:
            self.assertIn(f"colors.{key}", messages, f"{key} is required but was not reported")
        self.assertEqual(len(report["errors"]), len(T.REQUIRED_COLORS))
        # Optional derived colours are filled in silently, so they are never flagged.
        for key in set(T.COLOR_KEYS) - set(T.REQUIRED_COLORS):
            self.assertNotIn(f"colors.{key}", messages, f"{key} is optional but was flagged")

    def test_check_pack_rejects_unusable_files(self):
        for name, text in {"not-json.ipmtheme.json": "{not json", "list.ipmtheme.json": "[]"}.items():
            with self.subTest(file=name):
                path = self.folder / name
                path.write_text(text, encoding="utf-8")
                with self.assertRaises(T.ThemeError):
                    theme_editor.check_pack(path)
        with self.assertRaises(T.ThemeError):
            theme_editor.check_pack(self.folder / "missing.ipmtheme.json")

    def test_run_check_exit_codes(self):
        good = write_pack(self.folder / "good.ipmtheme.json", name="Good")
        broken = self._raw("broken.ipmtheme.json",
                           {"id": "broken", "name": "Broken", "base": "nord", "colors": {}})
        junk = self.folder / "junk.ipmtheme.json"
        junk.write_text("{", encoding="utf-8")
        with contextlib.redirect_stdout(io.StringIO()) as out:
            self.assertEqual(theme_editor.run_check([str(good)]), theme_editor.EXIT_OK)
            self.assertEqual(theme_editor.run_check([str(broken)]), theme_editor.EXIT_INVALID)
            self.assertEqual(theme_editor.run_check([str(junk)]), theme_editor.EXIT_INVALID)
            self.assertEqual(theme_editor.run_check([str(self.folder / "nope.json")]), theme_editor.EXIT_INVALID)
            self.assertEqual(theme_editor.run_check([str(good), str(broken)]), theme_editor.EXIT_INVALID)
        text = out.getvalue()
        self.assertIn("OK    good.ipmtheme.json", text)
        self.assertIn("FAIL  broken.ipmtheme.json", text)

    def test_quiet_check_prints_one_line_per_file(self):
        good = write_pack(self.folder / "quiet.ipmtheme.json", name="Quiet")
        with contextlib.redirect_stdout(io.StringIO()) as out:
            code = theme_editor.run_check([str(good)], quiet=True)
        self.assertEqual(code, theme_editor.EXIT_OK)
        lines = out.getvalue().strip().splitlines()
        self.assertEqual(len(lines), 1, lines)
        self.assertTrue(lines[0].startswith("OK"))

    def test_quiet_may_follow_check_on_the_command_line(self):
        parsed = theme_editor.build_parser().parse_args(
            theme_editor._hoist_quiet(["--check", "a.json", "--quiet"]))
        self.assertEqual(parsed.check, ["a.json"])
        self.assertTrue(parsed.quiet)
        parsed = theme_editor.build_parser().parse_args(
            theme_editor._hoist_quiet(["--check", "a.json", "-q", "b.json"]))
        self.assertEqual(parsed.check, ["a.json", "b.json"])
        self.assertTrue(parsed.quiet)
        untouched = ["themes/nord.ipmtheme.json", "--mode", "advanced"]
        self.assertEqual(theme_editor._hoist_quiet(untouched), untouched)

    # -- generators and presets -------------------------------------------

    def test_generators_keep_the_palette_and_the_identity(self):
        pack = theme_editor.build_pack(name="Gen", pack_id="gen")
        for key, label, _help in theme_editor.GENERATORS:
            with self.subTest(generator=key):
                out = theme_editor.apply_generator(pack, key, seed=7)
                self.assertEqual(set(out["colors"]), set(T.COLOR_KEYS), label)
                self.assertEqual((out["id"], out["name"]), ("gen", "Gen"))
                self.assertIsNotNone(theme_editor.review(out)["theme"])

    def test_random_generators_are_seeded(self):
        pack = theme_editor.build_pack(name="Seed", pack_id="seed")
        for key in ("random-dark", "random-light"):
            with self.subTest(generator=key):
                first = theme_editor.apply_generator(pack, key, seed=11)
                again = theme_editor.apply_generator(pack, key, seed=11)
                self.assertEqual(first["colors"], again["colors"])

    def test_high_contrast_clears_every_low_pair(self):
        pack = theme_editor.build_pack(name="Aaa", pack_id="aaa")
        self.assertEqual(theme_editor.review(theme_editor.apply_generator(pack, "aaa"))["low"], [])

    def test_readable_generator_fixes_an_unreadable_palette(self):
        pack = theme_editor.build_pack(name="Bad", pack_id="bad-read",
                                       colors={"bg": "#000000", "panel": "#010101", "text": "#050505"})
        self.assertTrue(theme_editor.review(pack)["low"], "this palette is meant to be unreadable")
        self.assertEqual(theme_editor.review(theme_editor.apply_generator(pack, "readable"))["low"], [])

    def test_presets_keep_the_packs_identity(self):
        options = theme_editor.preset_options()
        usable = {name: colors for name, colors in options.items()
                  if any(T.is_color(str(value)) for value in colors.values())}
        if not usable:
            self.skipTest("no palette sources available")
        pack = theme_editor.build_pack(name="P", pack_id="p-author", author="Someone")
        for name in sorted(usable):
            with self.subTest(preset=name):
                out = theme_editor.apply_preset(pack, usable[name])
                self.assertEqual(set(out["colors"]), set(T.COLOR_KEYS))
                self.assertEqual((out["id"], out["name"], out["author"]), ("p-author", "P", "Someone"))

    # -- text output -------------------------------------------------------

    def test_terminal_preview_is_plain_text(self):
        pack = theme_editor.build_pack(name="Preview")
        text = theme_editor.terminal_preview(pack)
        self.assertIn("ISO Package Manager", text)
        self.assertIn("WCAG", text)
        self.assertNotIn("\033", text)
        self.assertEqual(len(theme_editor.contrast_lines(T.contrast_report(pack["colors"]))), len(T.CONTRAST_PAIRS))

    def test_id_and_name_rules(self):
        self.assertEqual(theme_editor.slugify("Midnight Blue!!"), "midnight-blue")
        self.assertEqual(theme_editor.slugify("   "), "my-theme")
        self.assertIn("required", theme_editor.id_problem(""))
        for builtin in T.BUILTIN_ORDER:
            self.assertIn("reserved", theme_editor.id_problem(builtin), builtin)
        self.assertEqual(theme_editor.id_problem("nord"), "", "nord is a pack, not a built-in")
        self.assertIn("installed", theme_editor.id_problem("my-theme", taken={"My-Theme"}))
        self.assertIn("a-z", theme_editor.id_problem("Bad ID!"))
        self.assertEqual(theme_editor.id_problem("fine-id"), "")
        self.assertIn("name", theme_editor.name_problem(""))
        self.assertIn("48", theme_editor.name_problem("x" * 49))
        self.assertEqual(theme_editor.name_problem("Fine"), "")


if __name__ == "__main__":
    unittest.main(verbosity=2)

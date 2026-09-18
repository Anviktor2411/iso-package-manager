#!/usr/bin/env python3
"""Tests for ipm_windows.py - Windows / LTSC release resolution.

Run from anywhere::

    python tests/test_ipm_windows.py
    python tests/test_ipm_windows.py -v

No third-party packages, no display and **no network**: everything below only
exercises the query/target tables and the quality filters. The live Internet
Archive lookups are covered manually (SEARCH_GUIDE.md, "Verifying a source").

The LTSC cases exist because of a reported bug: a search for "windows 11 ltsc"
returned only retail Windows 11 images, because the LTSC releases were not part
of ``WINDOWS_TARGETS`` at all.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import ipm_windows as W  # noqa: E402

LTSC_11 = "Windows 11 Enterprise LTSC"
LTSC_11_IOT = "Windows 11 IoT Enterprise LTSC"
LTSC_10 = "Windows 10 Enterprise LTSC"
LTSC_10_IOT = "Windows 10 IoT Enterprise LTSC"

SRV_2025 = "Windows Server 2025"
SRV_2022 = "Windows Server 2022"
SRV_2019 = "Windows Server 2019"
SRV_2016 = "Windows Server 2016"
SRV_2012_R2 = "Windows Server 2012 R2"
SRV_2012 = "Windows Server 2012"
SRV_2008_R2 = "Windows Server 2008 R2"

# Real catalogue values (item en_windows_server_2019_x64_dvd_4cb967d8 etc.).
SRV_2019_FILE = "en_windows_server_2019_x64_dvd_4cb967d8.iso"
SRV_2019_TITLE = "Windows Server 2019 (x64) - DVD (English)"
SRV_2012R2_FILE = "en_windows_server_2012_r2_x64_dvd_2707946.iso"
SRV_EVAL_FILE = (
    "26100.1742.240906-0331.ge_release_svc_refresh_SERVER_EVAL_x64FRE_en-us.iso"
)

# Real catalogue values (item windows-11-iot-enterprise-ltsc-2024).
IOT_FILE = "en-us_windows_11_iot_enterprise_ltsc_2024_x64_dvd_f6b14814.iso"
IOT_TITLE = "Windows 11 IoT Enterprise LTSC 2024"
# Real catalogue values (item Windows11LTSC): Microsoft's LTSC file names never
# contain the word "LTSC" - only the item title does.
ENT_FILE = (
    "X23-81951_26100.1742.240906-0331.ge_release_svc_refresh_"
    "CLIENT_ENTERPRISES_OEM_x64FRE_en-us.iso"
)
ENT_TITLE = "Windows 11 LTSC 2024 (x64 and ARM64)"
LOF_FILE = "CLIENT_LOF_PACKAGES_OEM.iso"


class TestLtscResolution(unittest.TestCase):
    """The reported bug: LTSC queries must reach the LTSC releases."""

    def test_windows_11_ltsc_query_expands_to_enterprise_and_iot(self):
        self.assertEqual(
            W.resolve_windows_targets("windows 11 ltsc"),
            [LTSC_11, LTSC_11_IOT],
        )

    def test_short_aliases_resolve(self):
        for query in ("win11 ltsc", "win 11 ltsc", "windows11 ltsc",
                      "Windows 11 Enterprise LTSC"):
            self.assertEqual(
                W.resolve_windows_targets(query),
                [LTSC_11, LTSC_11_IOT],
                msg=query,
            )

    def test_iot_query_stays_narrow(self):
        for query in ("windows 11 iot ltsc", "windows 11 iot enterprise ltsc",
                      "Windows 11 IoT Enterprise LTSC"):
            self.assertEqual(W.resolve_windows_targets(query), [LTSC_11_IOT], msg=query)

    def test_windows_10_ltsc_query_expands(self):
        self.assertEqual(
            W.resolve_windows_targets("windows 10 ltsc"),
            [LTSC_10, LTSC_10_IOT],
        )

    def test_bare_ltsc_and_ltsb_expand_to_every_edition(self):
        expected = list(W.LTSC_TARGETS)
        for query in ("ltsc", "ltsb", "windows ltsc", "windows ltsb iso"):
            self.assertEqual(W.resolve_windows_targets(query), expected, msg=query)

    def test_ltsc_is_not_swallowed_by_the_retail_entry(self):
        # "windows 11 ltsc" contains "windows 11": the retail entry must not win.
        self.assertNotIn("Windows 11", W.resolve_windows_targets("windows 11 ltsc"))
        self.assertNotIn("Windows 10", W.resolve_windows_targets("windows 10 ltsc"))

    def test_retail_queries_are_unchanged(self):
        self.assertEqual(W.resolve_windows_targets("windows 11"), ["Windows 11"])
        self.assertEqual(W.resolve_windows_targets("win10"), ["Windows 10"])
        self.assertEqual(W.resolve_windows_targets("Windows 7"), ["Windows 7"])

    def test_legacy_ui_names_still_map_to_retail(self):
        self.assertEqual(
            W.resolve_windows_targets("Windows 11 (Microsoft)"), ["Windows 11"]
        )

    def test_all_versions_stays_retail_only(self):
        self.assertEqual(
            W.resolve_windows_targets("Windows (all versions)"),
            list(W.DEFAULT_WINDOWS_VERSIONS),
        )
        for label in W.DEFAULT_WINDOWS_VERSIONS:
            self.assertNotIn(label, W.LTSC_TARGETS)

    def test_has_windows_support_accepts_ltsc_without_the_word_windows(self):
        for query in ("ltsc", "win 11 ltsc", "windows 11 ltsc"):
            self.assertTrue(W.has_windows_support(query), msg=query)

    def test_has_windows_support_rejects_non_windows(self):
        for query in ("linux mint", "ubuntu server", "freebsd"):
            self.assertFalse(W.has_windows_support(query), msg=query)
            self.assertEqual(W.resolve_windows_targets(query), [], msg=query)

    def test_expansion_helper_respects_an_explicit_iot_query(self):
        self.assertEqual(
            W._expand_ltsc_targets("windows 11 iot ltsc", [LTSC_11]), [LTSC_11]
        )
        self.assertEqual(
            W._expand_ltsc_targets("windows 11 ltsc", [LTSC_11]),
            [LTSC_11, LTSC_11_IOT],
        )
        self.assertEqual(W._expand_ltsc_targets("windows 7", ["Windows 7"]), ["Windows 7"])


class TestTablesAndUi(unittest.TestCase):
    """The tables the GUI and the catalogue search read from."""

    def test_ltsc_labels_are_offered_in_the_ui(self):
        for label in W.LTSC_TARGETS:
            self.assertIn(label, W.WINDOWS_SOURCES)
            self.assertTrue(W.is_windows_source(label))
            self.assertIn(label, W.windows_source_names())

    def test_ltsc_sources_follow_their_retail_version(self):
        order = list(W.WINDOWS_SOURCES)
        self.assertLess(order.index("Windows 11"), order.index(LTSC_11))
        self.assertLess(order.index(LTSC_11), order.index(LTSC_11_IOT))
        self.assertLess(order.index(LTSC_11_IOT), order.index("Windows 10"))
        self.assertLess(order.index("Windows 10"), order.index(LTSC_10))

    def test_every_target_has_search_terms_and_a_tag(self):
        for label, aliases in W.WINDOWS_TARGETS:
            self.assertTrue(aliases, label)
            self.assertIn(label, W._IA_TERMS, label)
            self.assertIn(label, W._SHORT_TAG, label)
            self.assertTrue(W._IA_TERMS[label], label)

    def test_aliases_are_normalised_lower_case(self):
        for label, aliases in W.WINDOWS_TARGETS:
            for alias in aliases:
                self.assertEqual(alias, alias.lower(), f"{label}: {alias}")
                self.assertEqual(alias, alias.strip(), f"{label}: {alias}")

    def test_edition_query_reads_deeper_into_the_catalogue(self):
        self.assertGreater(W._EDITION_ROWS, W._DEFAULT_ROWS)
        for query in ("windows 11 ltsc", "windows 10 iot ltsc",
                      "windows 11 enterprise", "windows 11 evaluation"):
            self.assertIsNotNone(W._EDITION_RE.search(query), msg=query)
        for query in ("windows 11", "windows 7", "windows xp"):
            self.assertIsNone(W._EDITION_RE.search(query), msg=query)

    def test_ltsc_regex_matches_both_channel_names(self):
        for text in ("windows 11 ltsc", "Windows 10 LTSB", "LTSC 2024"):
            self.assertIsNotNone(W._LTSC_RE.search(text), msg=text)
        for text in ("windows 11 pro", "win10 enterprise"):
            self.assertIsNone(W._LTSC_RE.search(text), msg=text)


class TestReleaseMatching(unittest.TestCase):
    """Each result list is kept on its own release, LTSC titles included."""

    def test_item_title_matches_the_ltsc_release(self):
        # The file name says nothing about LTSC; the item title does.
        self.assertTrue(W._mentions_release(LTSC_11, ENT_FILE, ENT_TITLE))

    def test_iot_file_matches_the_iot_release(self):
        self.assertTrue(W._mentions_release(LTSC_11_IOT, IOT_FILE, IOT_TITLE))

    def test_iot_media_does_not_claim_the_plain_enterprise_release(self):
        self.assertFalse(W._mentions_release(LTSC_11, IOT_FILE, IOT_TITLE))

    def test_retail_media_does_not_match_an_ltsc_release(self):
        self.assertFalse(
            W._mentions_release(LTSC_11, "Win11_24H2_English_x64.iso", "Windows 11")
        )

    def test_retail_label_does_not_capture_ltsc_media(self):
        # Why the retail entries need the extra guard: the retail alias pattern
        # matches the LTSC *title*, so the file would otherwise be listed as a
        # plain Windows 11 image.
        self.assertTrue(W._mentions_release("Windows 11", ENT_FILE, ENT_TITLE))
        self.assertTrue(W._is_ltsc_media(ENT_FILE, ENT_TITLE))
        self.assertTrue(W._is_ltsc_media(IOT_FILE, IOT_TITLE))


class TestQualityFilters(unittest.TestCase):
    """Junk / LTSC separation used when building result rows."""

    def test_language_pack_inside_an_ltsc_item_is_junk(self):
        self.assertTrue(W._is_junk("Windows11LTSC", ENT_TITLE, LOF_FILE))

    def test_genuine_ltsc_media_is_not_junk(self):
        self.assertFalse(W._is_junk("Windows11LTSC", ENT_TITLE, ENT_FILE))
        self.assertFalse(
            W._is_junk("windows-11-iot-enterprise-ltsc-2024", IOT_TITLE, IOT_FILE)
        )

    def test_reputable_repacks_are_still_junk(self):
        self.assertTrue(W._is_junk("windows11tinyedition", "", "Win11_tiny.iso"))
        self.assertTrue(W._is_junk("x", "", "Win10_lite_x64.iso"))

    def test_ltsc_media_detection_uses_file_name_or_title(self):
        self.assertTrue(W._is_ltsc_media("", ENT_TITLE))
        self.assertTrue(W._is_ltsc_media(IOT_FILE, ""))
        self.assertFalse(W._is_ltsc_media("Win11_24H2_English_x64.iso", "Windows 11"))

    def test_display_name_uses_the_ltsc_tag(self):
        name = W._display_name(LTSC_11, ENT_FILE, 5_000_000_000)
        self.assertTrue(name.startswith("[Win 11 LTSC] "), name)
        self.assertIn("GB", name)
        self.assertTrue(W._display_name(LTSC_11_IOT, IOT_FILE, 0).startswith("[Win 11 IoT LTSC] "))


class TestServerResolution(unittest.TestCase):
    """Windows Server queries must reach the Server releases."""

    def test_versioned_queries_resolve_to_one_release(self):
        cases = {
            "Windows Server 2025": SRV_2025,
            "windows server 2022": SRV_2022,
            "win server 2019": SRV_2019,
            "winserver 2016": SRV_2016,
            "server 2008 r2": SRV_2008_R2,
            "windows server 2008 r2": SRV_2008_R2,
        }
        for query, expected in cases.items():
            self.assertEqual(W.resolve_windows_targets(query), [expected], msg=query)

    def test_2012_r2_is_not_swallowed_by_2012(self):
        # Both labels contain "windows server 2012", so the R2 entry must win.
        self.assertEqual(W.resolve_windows_targets("windows server 2012 r2"), [SRV_2012_R2])
        self.assertEqual(W.resolve_windows_targets("Windows Server 2012 R2"), [SRV_2012_R2])
        self.assertEqual(W.resolve_windows_targets("windows server 2012"), [SRV_2012])
        self.assertEqual(W.resolve_windows_targets("Windows Server 2012"), [SRV_2012])

    def test_free_text_query_keeps_the_server_release_only(self):
        for query in ("windows server 2022 iso", "windows server 2022 download"):
            self.assertEqual(W.resolve_windows_targets(query), [SRV_2022], msg=query)
        self.assertNotIn("Windows 11", W.resolve_windows_targets("windows server 2022"))

    def test_bare_server_query_expands_to_every_release(self):
        expected = list(W.SERVER_TARGETS)
        for query in ("windows server", "win server", "Windows Server (all versions)"):
            self.assertEqual(W.resolve_windows_targets(query), expected, msg=query)

    def test_server_sources_do_not_pull_in_desktop_releases(self):
        for label in W.SERVER_TARGETS:
            resolved = W.resolve_windows_targets(label)
            self.assertEqual(resolved, [label], msg=label)
            self.assertNotIn("Windows 11", resolved)
            self.assertNotIn("Windows 10", resolved)

    def test_server_queries_have_windows_support(self):
        for query in ("windows server", "server 2022", "winserver 2019"):
            self.assertTrue(W.has_windows_support(query), msg=query)

    def test_non_microsoft_server_products_stay_out(self):
        for query in ("ubuntu server 22.04", "debian server", "ubuntu server"):
            self.assertEqual(W.resolve_windows_targets(query), [], msg=query)
            self.assertFalse(W.has_windows_support(query), msg=query)

    def test_retail_and_ltsc_resolution_is_unchanged(self):
        self.assertEqual(W.resolve_windows_targets("windows 11"), ["Windows 11"])
        self.assertEqual(W.resolve_windows_targets("windows 7"), ["Windows 7"])
        self.assertEqual(
            W.resolve_windows_targets("windows 11 ltsc"), [LTSC_11, LTSC_11_IOT]
        )
        self.assertEqual(
            W.resolve_windows_targets("Windows (all versions)"),
            list(W.DEFAULT_WINDOWS_VERSIONS),
        )


class TestServerQualityFilters(unittest.TestCase):
    """Server media detection and the cross-release guards."""

    def test_server_media_is_detected_by_file_name(self):
        self.assertTrue(W._is_server_media(SRV_2019_FILE))
        self.assertTrue(W._is_server_media(SRV_2012R2_FILE))
        self.assertTrue(W._is_server_media(SRV_EVAL_FILE))
        self.assertTrue(W._is_server_media("Windows_Server_2012_x64.iso"))
        self.assertTrue(W._is_server_media("en_windows_server_2008_r2_x64_dvd.iso"))

    def test_desktop_media_is_not_server_media(self):
        self.assertFalse(W._is_server_media("en_windows_7_ultimate_x64_dvd.iso"))
        self.assertFalse(W._is_server_media("Win11_24H2_English_x64.iso"))
        self.assertFalse(W._is_server_media(ENT_FILE))

    def test_r2_media_is_detected_from_name_or_title(self):
        self.assertTrue(W._is_r2_media(SRV_2012R2_FILE, ""))
        self.assertTrue(W._is_r2_media("", "Windows Server 2012 R2 (x64)"))
        self.assertFalse(W._is_r2_media("Windows_Server_2012_x64.iso", "Windows Server 2012"))
        self.assertFalse(W._is_r2_media(SRV_2019_FILE, SRV_2019_TITLE))

    def test_base_2012_release_excludes_r2_media(self):
        self.assertIn(SRV_2012, W._R2_EXCLUDED_LABELS)
        self.assertNotIn(SRV_2012_R2, W._R2_EXCLUDED_LABELS)

    def test_server_item_keeps_a_non_server_image(self):
        # An AIO item can carry Windows 7 and Server 2008 R2 side by side: only
        # the Server file is filtered out of the desktop release.
        self.assertFalse(W._is_server_media("en_windows_7_ultimate_x64_dvd.iso"))
        self.assertTrue(W._is_server_media("en_windows_server_2008_r2_x64_dvd.iso"))

    def test_server_media_matches_its_own_release(self):
        self.assertTrue(W._mentions_release(SRV_2019, SRV_2019_FILE, SRV_2019_TITLE))
        self.assertTrue(W._mentions_release(SRV_2012_R2, SRV_2012R2_FILE, ""))
        self.assertFalse(W._mentions_release(SRV_2022, SRV_2019_FILE, SRV_2019_TITLE))

    def test_server_media_is_not_junk(self):
        self.assertFalse(W._is_junk("en_windows_server_2019", SRV_2019_TITLE, SRV_2019_FILE))
        self.assertFalse(W._is_junk("msdn-server-eval", "Windows Server 2022", SRV_EVAL_FILE))

    def test_server_repacks_are_still_junk(self):
        self.assertTrue(
            W._is_junk("windows-server-2025-beta", "Windows Server 2025",
                       "windows-server-2025-lite-os-tiny.iso")
        )

    def test_microsoft_media_naming_covers_server_images(self):
        for name in (SRV_2019_FILE, SRV_2012R2_FILE, SRV_EVAL_FILE,
                     "en-us_windows_server_2022_x64_dvd_620d7eac.iso",
                     "Windows_Server_2012_x64.iso"):
            self.assertTrue(W._MS_MEDIA_RE.match(name), msg=name)

    def test_display_name_uses_the_server_tag(self):
        name = W._display_name(SRV_2022, "en-us_windows_server_2022_x64_dvd_620d7eac.iso",
                               5_000_000_000)
        self.assertTrue(name.startswith("[Srv 2022] "), name)
        self.assertTrue(name.endswith("[Srv 2012 R2]") is False)
        self.assertTrue(W._display_name(SRV_2012_R2, "x.iso", 0).startswith("[Srv 2012 R2] "))
        self.assertTrue(W._display_name(SRV_2008_R2, "x.iso", 0).startswith("[Srv 2008 R2] "))


class TestServerTablesAndUi(unittest.TestCase):
    """The Server entries are wired into the shared tables and the UI list."""

    def test_server_targets_are_ordered_newest_first_with_r2_first(self):
        self.assertEqual(list(W.SERVER_TARGETS)[:4], [SRV_2025, SRV_2022, SRV_2019, SRV_2016])
        self.assertLess(
            list(W.SERVER_TARGETS).index(SRV_2012_R2),
            list(W.SERVER_TARGETS).index(SRV_2012),
        )

    def test_every_server_target_is_a_windows_target(self):
        labels = [label for label, _ in W.WINDOWS_TARGETS]
        for label in W.SERVER_TARGETS:
            self.assertIn(label, labels, msg=label)

    def test_server_sources_are_offered_in_the_ui(self):
        for label in W.SERVER_TARGETS:
            self.assertIn(label, W.WINDOWS_SOURCES, msg=label)
        self.assertIn("Windows Server (all versions)", W.WINDOWS_SOURCES)
        self.assertTrue(W.is_windows_source("Windows Server 2022"))
        self.assertTrue(W.is_windows_source("Windows Server (all versions)"))

    def test_windows_all_versions_stays_retail_only(self):
        self.assertNotIn("Windows Server (all versions)", W.DEFAULT_WINDOWS_VERSIONS)
        for label in W.SERVER_TARGETS:
            self.assertNotIn(label, W.DEFAULT_WINDOWS_VERSIONS)

    def test_server_queries_read_deeper_into_the_catalogue(self):
        self.assertTrue(W._EDITION_RE.search("Windows Server 2022"))
        # The desktop releases are unaffected by the added edition token.
        for query in ("windows 11", "windows 7", "windows xp"):
            self.assertIsNone(W._EDITION_RE.search(query), msg=query)

    def test_server_generic_regex_is_text_not_substring(self):
        self.assertTrue(W._SERVER_GENERIC_RE.search(W._norm_query("windows server")))
        self.assertTrue(W._SERVER_GENERIC_RE.search(W._norm_query("win server iso")))
        self.assertIsNone(W._SERVER_GENERIC_RE.search(W._norm_query("ubuntu server")))
        self.assertIsNone(W._SERVER_GENERIC_RE.search(W._norm_query("file server")))


if False:  # the real runner guard sits at the end of this file
    pass


class TestServerCatalogueLeaks(unittest.TestCase):
    """Leaks found by the live Server run of 2026-09-16 (archive.org).

    Three real defects showed up in that run, all of them fixed here:

    1. "Windows Server 2008 R2" listed Windows 7 media, because one Archive
       item carries both dialects under a single shared title.
    2. The same list offered "en_sql_server_2008_r2_standard...iso" - SQL
       Server, not an operating system at all.
    3. Microsoft's 2012 R2 volume kit ("HRM_SSS_X64FRE_EN-US_DV5.ISO") was
       filed under Windows Server 2012, because neither the file name nor the
       item title carries the release text.
    """

    def test_shared_kit_desktop_media_is_not_server_media(self):
        for name in (
            "en_windows_7_enterprise_with_sp1_x64_dvd_u_677651_24.6.12.iso",
            "en_windows_7_home_premium_with_sp1_x86_dvd_u_676701_24.6.12.iso",
            "Win11_24H2_English_x64.iso",
            "Win8.1_English_x64.iso",
        ):
            self.assertIsNotNone(W._CLIENT_MEDIA_RE.search(W._norm_query(name)), msg=name)

    def test_server_file_names_are_not_client_media(self):
        for name in (SRV_2019_FILE, SRV_2012R2_FILE, SRV_EVAL_FILE,
                     "Windows_Server_2012_x64.iso", "HRM_SSS_X64FRE_EN-US_DV5.ISO"):
            self.assertIsNone(W._CLIENT_MEDIA_RE.search(W._norm_query(name)), msg=name)

    def test_other_microsoft_server_products_are_junk(self):
        for name in (
            "en_sql_server_2008_r2_standard_x86_x64_ia64_dvd_521546.iso",
            "en_exchange_server_2019_x64.iso",
            "Windows Multipoint Server 2012.iso",
            "en_sharepoint_server_2019_x64.iso",
        ):
            self.assertTrue(W._is_junk("someitem", "", name), msg=name)

    def test_windows_server_and_hyper_v_media_are_kept(self):
        for name in (SRV_2019_FILE, SRV_EVAL_FILE,
                     "en_microsoft_hyper-v_server_2019_updated_sept_2019_x64_dvd_18bf011c.iso"):
            self.assertFalse(W._is_junk("windows-server-item", "", name), msg=name)

    def test_hrm_sss_is_placed_on_2012_r2(self):
        self.assertEqual(W._hinted_release("HRM_SSS_X64FRE_EN-US_DV5.ISO"), SRV_2012_R2)
        self.assertEqual(W._hinted_release("hrm_sss_x64fre_en-us_dv5.iso"), SRV_2012_R2)

    def test_other_media_carries_no_release_hint(self):
        for name in (SRV_2019_FILE, SRV_EVAL_FILE, "Win11_24H2_English_x64.iso", ""):
            self.assertEqual(W._hinted_release(name), "", msg=name)

    def test_hint_is_consistent_with_the_release_tables(self):
        for _pattern, label in W._MEDIA_RELEASE_HINTS:
            self.assertIn(label, W.SERVER_TARGETS, label)
            self.assertIn(label, W._IA_TERMS, label)


class TestServerUiWiring(unittest.TestCase):
    """The Server category and its source list, as the sidebar builds them."""

    def test_server_sources_match_the_target_list(self):
        self.assertEqual(
            W.SERVER_SOURCES,
            W.SERVER_TARGETS + ("Windows Server (all versions)",),
        )

    def test_every_server_source_is_a_windows_source(self):
        for name in W.SERVER_SOURCES:
            self.assertTrue(W.is_windows_source(name), name)

    def test_main_window_offers_the_server_category(self):
        main_py = (ROOT / "main.py").read_text(encoding="utf-8")
        self.assertIn("SERVER_SOURCES", main_py)
        self.assertIn('"Windows Server", "Archive.org"', main_py)
        self.assertIn('if cat == "Windows Server":', main_py)


if __name__ == "__main__":
    unittest.main(verbosity=2)

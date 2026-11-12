"""Inspect a browser-downloaded syllabus PDF; requires pdfplumber."""
import json
import sys
import pdfplumber

with pdfplumber.open(sys.argv[1]) as document:
    fonts = set()
    links = 0
    for number, page in enumerate(document.pages, 1):
        assert (page.width, page.height) == (612, 792), (number, page.width, page.height)
        for char in page.chars:
            fonts.add(char["fontname"])
            if char["text"].strip():
                assert char["x0"] >= 34 and char["x1"] <= 578, (number, "content outside margins", char)
        for link in page.hyperlinks:
            links += 1
            if any(abs(image["x0"] - link["x0"]) < 2 and abs(image["x1"] - link["x1"]) < 2 and abs(image["top"] - link["top"]) < 2 for image in page.images):
                continue
            text = [char for char in page.chars if char["text"].strip() and char["x0"] >= link["x0"] - 1 and char["x1"] <= link["x1"] + 1 and char["top"] >= link["top"] - 2 and char["bottom"] <= link["bottom"] + 2]
            assert text, (number, "link has no visible text", link)
            # pdfmake includes the normal inter-word space in each word annotation.
            assert link["x1"] - max(char["x1"] for char in text) < max(char["size"] for char in text) * 0.5 + 1, (number, "link extends beyond text", link)
    assert any("Buckeye" in font for font in fonts), fonts
    if "--fixture-reference" in sys.argv:
        rows = [row for page in document.pages for table in page.extract_tables() for row in table]
        assert ["Independent work", ""] in rows, "blank table cells must preserve the column structure"
    if "--art-reference" in sys.argv:
        first = document.pages[0]
        assert first.images and 34 <= first.images[0]["top"] <= 44, "opening logo must use the page margin, not extra blank rows"
        miranda = first.search("Miranda Holmes")[0]
        qualifications = first.search("Professional Qualifications")[0]
        assert 17 <= qualifications["top"] - miranda["top"] <= 19, "16px/24px CSS text must keep its 18pt baseline rhythm"
        for page in document.pages:
            assert not page.extract_text().split("OSU · Simple Syllabus")[0].rstrip().endswith("Week Topic"), "table header must stay with a body row"
            if page.search("Syllabus - Course Schedule"):
                assert page.search("Introductions"), "section heading must stay with its table and first body row"
    print(json.dumps({"pages": len(document.pages), "links": links, "fonts": sorted(fonts), "letterMarginsAndLinkBounds": "passed"}))

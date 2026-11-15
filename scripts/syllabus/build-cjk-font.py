"""Build the local regular CJK face from the upstream OFL variable font.
Run with Python fonttools[woff] and brotli; pass an upstream NotoSansSC TTF.
Writes only public/fonts/noto-sans-sc-regular.woff2. No network access.
"""
import sys
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
font = TTFont(sys.argv[1])
instantiateVariableFont(font, {"wght": 400}, inplace=True)
font.flavor = "woff2"
font.save(Path(__file__).resolve().parents[2] / "public/fonts/noto-sans-sc-regular.woff2")

#!/usr/bin/env python3
"""把子集字体的**保留字体名**去掉。

OFL 规定「修改版不得使用保留字体名」，而**子集化就是修改版**。Source Han Serif 的
OFL 声明了 `Reserved Font Name 'Source'`，所以它的子集必须改名才能分发
（文件名叫 `SourceHanSerifSC-*` 同样踩中这条）。

**版权声明（nameID 0）原样保留并追加一句说明** —— 那是 OFL 要求随附的 notice，
也正是 RFN 声明的来源，删掉它反而违规。

只改名字相关的 nameID：1（家族）、3（唯一标识）、4（全名）、6（PostScript 名）。

用法：python3 scripts/rename-subset-font.py <子集.woff2> [...]
"""
import sys

from fontTools.ttLib import TTFont

REPLACEMENTS = [
    ("Source Han Serif CN", "Han Serif CN"),
    ("SourceHanSerifCN", "HanSerifCN"),
]
NOTE = (
    " Subset (GB2312 + UI charset) and renamed to 'Han Serif CN'"
    " for the JobLume Resume project."
)


def rename(path: str) -> None:
    font = TTFont(path)
    name = font["name"]
    for record in name.names:
        if record.nameID == 0:
            text = record.toUnicode()
            if NOTE.strip() not in text:
                record.string = text + NOTE
            continue
        if record.nameID not in (1, 3, 4, 6):
            continue
        text = record.toUnicode()
        for old, new in REPLACEMENTS:
            text = text.replace(old, new)
        record.string = text
    font.save(path)
    print(f"    renamed: {path}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    for target in sys.argv[1:]:
        rename(target)

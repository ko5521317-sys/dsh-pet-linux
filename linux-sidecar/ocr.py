#!/usr/bin/env python3
"""读一张截图上的字，输出纯文本（一行一句）。

优先走 RapidOCR（对屏幕字更准），没装就退化到 tesseract + 本地 chi_sim 语言包。
用法: ocr.py <图片路径> [--max-chars N]
"""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TESSDATA = os.path.join(HERE, "tessdata")
MAX_CHARS = 1200


def clean_lines(items):
    out = []
    seen = set()
    for text, score in items:
        t = " ".join(str(text).split())
        if len(t) < 2 or score < 0.45:
            continue
        if t in seen:
            continue
        seen.add(t)
        out.append(t)
    joined = "\n".join(out)
    return joined[:MAX_CHARS]


def via_rapidocr(path):
    from rapidocr_onnxruntime import RapidOCR  # 慢导入，放函数里

    threads = int(os.environ.get("OCR_THREADS", "4"))
    try:
        engine = RapidOCR(intra_op_num_threads=threads)
    except TypeError:
        engine = RapidOCR()
    result, _ = engine(path)
    items = []
    for row in result or []:
        # row = [box, text, score]
        try:
            items.append((row[1], float(row[2])))
        except Exception:
            continue
    return clean_lines(items)


def via_tesseract(path):
    env = dict(os.environ, TESSDATA_PREFIX=TESSDATA)
    try:
        r = subprocess.run(
            ["tesseract", path, "-", "-l", "chi_sim+eng", "--psm", "6"],
            capture_output=True, text=True, timeout=25, env=env,
        )
    except Exception:
        return ""
    items = [(line, 1.0) for line in (r.stdout or "").splitlines()]
    return clean_lines(items)


def main():
    if len(sys.argv) < 2:
        print("usage: ocr.py <image>", file=sys.stderr)
        return 2
    path = sys.argv[1]
    if not os.path.exists(path):
        print("", end="")
        return 0
    text = ""
    try:
        text = via_rapidocr(path)
        engine = "rapidocr"
    except Exception:
        text = ""
        engine = "tesseract"
    if not text.strip():
        text = via_tesseract(path)
        engine = "tesseract"
    print(text, end="")
    print(f"\n[{engine}]", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Measure the rendered hint text in the Basel reproduction screenshots (offline; needs ImageMagick `magick`).

Usage: python3 -I scripts/basel_pixel_measure.py <repro_1s_dir> <repro_5s_dir> <out.json> <img_dir>
Crops the hint region from both screenshots, records the darkest grey value and the implied contrast against white,
and writes the report crops. Region: the hint «* muss ausgefüllt werden» at x 950-1110, y 382-402 in the 1440x900
viewport (located by eye in the screenshots; the crop is committed so the region can be checked).
"""
import json, subprocess, sys

d1, d5, out, img = sys.argv[1:5]
REGION = "160x20+950+382"

def lum(v):
    v /= 255
    return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4

def darkest(path):
    r = subprocess.run(["magick", path, "-crop", REGION, "+repage", "-colorspace", "gray", "-format", "%[fx:minima*255]", "info:"], capture_output=True, text=True, check=True)
    return round(float(r.stdout))

shots = {"after1s": f"{d1}/required-hint-contrast/contrast-hint.png", "after5s": f"{d5}/required-hint-opacity/contrast-hint-5s.png"}
m = {}
for k, path in shots.items():
    g = darkest(path)
    m[k] = {"screenshot": path.split("/basel-field/")[-1], "region": REGION, "darkestGrey": g, "contrastOnWhite": round(1.05 / (lum(g) + 0.05), 2)}
# Plausible cause, computed from the saved DOM (p06 scan): the sticky heading «Abfuhrzonensuche» has bg-white/90 (90 % white).
blend = round(0.1 * 119 + 0.9 * 255)
m["overlayHypothesis"] = {"element": "h3.sticky.bg-white/90 «Abfuhrzonensuche» (saved DOM, p06 scan)", "predictedGrey": blend,
                          "predictedContrast": round(1.05 / (lum(blend) + 0.05), 2), "status": "Hypothese, nicht durch Layoutmessung bestätigt"}
json.dump(m, open(out, "w"), indent=1, ensure_ascii=False)
subprocess.run(["magick", shots["after5s"], "-crop", "900x110+270+345", "+repage", f"{img}/c2-hint-card.png"], check=True)
subprocess.run(["magick", shots["after5s"], "-crop", REGION, "+repage", "-scale", "400%", f"{img}/c2-hint-zoom.png"], check=True)
print(json.dumps(m, ensure_ascii=False))

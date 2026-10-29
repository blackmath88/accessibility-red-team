# Investigation fixtures — Basel required-field hint (M1)

Four small, self-contained LOCAL pages for the M1 hint investigation in
`docs/experiments/BASEL_ADAPTIVE_INVESTIGATION_MILESTONE.md` ("Countertests for the hint investigation").
Each page carries a visible banner and an HTML comment: «Lokale Mechanismus-Kopie – keine Basel-Seite».

**These are illustrative mechanism tests, not evidence of Basel's deployed cause.** They let a probe
be checked against a known mechanism (with/without overlay, clean negative control, a different
cause of faintness). A probe result on these pages says nothing about what www.bs.ch actually renders.

No external assets, no scripts, no network. Intended viewport: 1440×900. The card is absolutely
positioned (left 280px, top 333px, width 880px), so the hint lands at roughly x 985–1119, y 383–397
in that viewport for the three shared-structure pages (y ≈ 416 in `opacity-control.html`).

| File | Models | Expected mechanism |
|---|---|---|
| `overlay.html` | `h3#zone-heading` is `position: sticky`, `z-index: 8`, full row width, background `rgba(255,255,255,0.9)`; it shares one grid cell with the hint and paints over it. | Translucent overlap makes the hint faint. |
| `no-overlay.html` | Identical DOM and geometry, but the h3 background is `transparent`. | Overlap mechanism removed; hint should render as plain #777. |
| `clean-control.html` | Heading and hint side by side in a flex row; no overlap, no opacity. | Negative control: nothing faint. |
| `opacity-control.html` | Second structure: hint in its own row below the heading; `#hint-wrapper` has `opacity: 0.12`; no overlap. | Faint for a different reason; a probe must not attribute this to overlap. |

## Stable selectors (all four pages)

- `body[data-fixture="<name>"]`
- `#fixture-banner` / `.fixture-banner`
- `#card` / `.fixture-card`
- `#card-header` / `.fixture-card-header` (`div` grid in overlay/no-overlay, `div` flex in clean-control, `header` in opacity-control)
- `#zone-heading` / `.fixture-heading` — h3 «Abfuhrzonensuche»
- `#hint-wrapper` / `.fixture-hint-wrapper` — parent of the hint (carries `opacity: 0.12` only in opacity-control)
- `#required-hint` / `.fixture-hint.text-xs` — span «* muss ausgefüllt werden», 12px, `color: #777`
- `#hint-row` / `.fixture-hint-row` — only in `opacity-control.html`
- `#info-box` / `.fixture-info`, `#address-label` / `.fixture-label` «Adresse: *», `#address-input` / `.fixture-input`

Hint text, font size and colour are identical in every page. Geometry was sanity-checked once with a
local offline headless render (`elementsFromPoint` at the hint centre returns `zone-heading` first in
overlay/no-overlay, `required-hint` first in the controls); no pixel measurements are recorded here.

- `fixed-banner.html` — narrow single-column page: plain #777 hint, no overlay, but an opaque fixed consent-style banner (bottom 0, z-index 99999) covers it in the loaded state; the page scrolls, so the hint can be brought above the banner. Added after the live 390×844 run showed this occlusion; it tests whether a probe detects a fixed occluder anywhere above the hint and measures the unoccluded state.

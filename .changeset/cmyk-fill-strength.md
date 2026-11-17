---
"@paragraf/render-pdf": patch
---

CMYK fills are written at full strength. With a CMYK `colorTransform` (set by `compile()` when `outputIntent` has a CMYK profile), every fill was written at one hundredth of its value: solid black came out as 1% black. RGB output and PDFs made without a colour transform are unchanged.

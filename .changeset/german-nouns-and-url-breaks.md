---
'@paragraf/linebreak': patch
---

German capitalised words are hyphenated by default, and URLs get break points
that insert no hyphen (after `/ ? & = # _ -`, before `.`). German text and any
paragraph that contains a URL can break differently from 0.7.0. New option
`HyphenateOptions.breakUrls` (default `true`). See `CHANGELOG.md`, v0.7.1.

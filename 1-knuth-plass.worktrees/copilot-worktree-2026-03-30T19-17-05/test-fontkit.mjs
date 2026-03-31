#!/usr/bin/env node

import { openSync } from 'fontkit';

const fontPath = './fonts/LiberationSerif-Regular.ttf';
const font = openSync(fontPath);

console.log('=== fontkit GSUB Support ===\n');

// Check what tables are available
console.log('Font tables:');
console.log(`  _tables keys: ${Object.keys(font._tables).join(', ')}`);

// Try to access GSUB
if (font._tables.GSUB) {
  console.log('\n✓ GSUB table exists');
  console.log(`  GSUB type: ${typeof font._tables.GSUB}`);

  // Try calling it if it's a function
  if (typeof font._tables.GSUB === 'function') {
    try {
      const gsub = font._tables.GSUB();
      console.log(`  GSUB() keys: ${Object.keys(gsub).join(', ')}`);
      console.log(`  Version: ${gsub.version}`);

      // Check for features
      if (gsub.featureList) {
        console.log(`  featureList length: ${gsub.featureList.length}`);
        const ligas = gsub.featureList.filter(
          (f) => f.tag === 'liga' || f.tag === 'rlig',
        );
        console.log(
          `  Ligature features: ${ligas.map((f) => f.tag).join(', ')}`,
        );
      }
    } catch (e) {
      console.log(`  Error calling GSUB(): ${e.message}`);
    }
  }
}

// Check if there's a getGlyph mechanism for substitutions
console.log('\n✓ Testing glyph substitution');
const glyphs = font.glyphsForString?.('fi') || [];
console.log(`  Glyphs for 'fi': ${glyphs.map((g) => g.id).join(',')}`);

// Check if opentype.js substitute method is available
if (font.substitution) {
  console.log('\n✓ font.substitution exists');
  console.log(`  Type: ${typeof font.substitution}`);
  try {
    const ligatures = font.substitution.getLigatures?.('liga', 'latn', 'DFLT');
    console.log(`  getLigatures available: ${Array.isArray(ligatures)}`);
  } catch (e) {
    console.log(`  getLigatures error: ${e.message}`);
  }
}

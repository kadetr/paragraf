import { describe, it, expectTypeOf } from 'vitest';
import type {
  FontSpec,
  ParagraphStyleDef,
  ResolvedParagraphStyle,
  CharStyleDef,
  ResolvedCharStyle,
} from '../src/index.js';

describe('types — structural validation', () => {
  it('FontSpec with only family is structurally valid', () => {
    const spec: FontSpec = { family: 'Times' };
    expectTypeOf(spec).toMatchTypeOf<FontSpec>();
  });

  it('ParagraphStyleDef with no fields is valid (all optional except none)', () => {
    const def: ParagraphStyleDef = {};
    expectTypeOf(def).toMatchTypeOf<ParagraphStyleDef>();
  });

  it('ResolvedParagraphStyle has required font with all subfields', () => {
    expectTypeOf<ResolvedParagraphStyle['font']>().toMatchTypeOf<
      Required<FontSpec>
    >();
  });

  it('ResolvedParagraphStyle.next is optional', () => {
    expectTypeOf<ResolvedParagraphStyle['next']>().toEqualTypeOf<
      string | undefined
    >();
  });

  it('CharStyleDef with no fields is valid', () => {
    const def: CharStyleDef = {};
    expectTypeOf(def).toMatchTypeOf<CharStyleDef>();
  });

  it('ResolvedCharStyle.font is Partial<FontSpec>', () => {
    expectTypeOf<ResolvedCharStyle['font']>().toMatchTypeOf<
      Partial<FontSpec>
    >();
  });
});

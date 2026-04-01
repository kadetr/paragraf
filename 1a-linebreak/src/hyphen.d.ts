// Ambient module declarations for the `hyphen` package which ships no types.

declare module 'hyphen' {
  function createHyphenator(
    pattern: unknown,
    options?: {
      hyphenChar?: string;
      minWordLength?: number;
      async?: boolean;
    },
  ): (word: string) => string;
  export default createHyphenator;
}

declare module 'hyphen/patterns/*' {
  const pattern: unknown;
  export default pattern;
}

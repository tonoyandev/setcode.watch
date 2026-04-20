export default {
  '*.{ts,tsx,js,mjs,cjs,json,jsonc,md,yml,yaml}': ['biome check --write --no-errors-on-unmatched'],
  'contracts/**/*.sol': ['forge fmt'],
};

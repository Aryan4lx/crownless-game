// Crownless design tokens — ported from mockup styles.css
// Dark Persian-inspired UI with gold + turquoise accents
export const THEME = {
  // Surfaces
  bgDeep: 0x07070b,
  bgBase: 0x0d0d14,
  bgSurface: 0x15151f,
  bgElevated: 0x1f1f2e,
  bgHover: 0x2a2a3d,

  // Borders
  borderFaint: 0x1a1a26,
  borderBase: 0x2a2a3d,
  borderStrong: 0x3d3d52,

  // Accents
  gold: 0xd4a64a,
  goldBright: 0xe8c269,
  goldDim: 0x8a6a2e,
  turquoise: 0x1ca5a8,
  turquoiseBright: 0x2dc6c9,
  crimson: 0xb8334a,
  crimsonBright: 0xd44a64,
  emerald: 0x4a8a5e,

  // Text
  textPrimary: 0xe8e6df,
  textSecondary: 0xb5b1a4,
  textMuted: 0x6a6759,
  textDim: 0x4a4738,

  // Faction colors
  sultan: 0xd4a64a,
  tsar: 0xb8334a,
  king: 0x3a6db8,
  khan: 0xc08850,

  // Strings for CSS / DOM overlay
  fonts: {
    serif: '"Cinzel", "Trajan Pro", Georgia, serif',
    sans: '"Inter", system-ui, -apple-system, sans-serif',
  },

  strings: {
    gold: '#d4a64a',
    goldBright: '#e8c269',
    goldDim: '#8a6a2e',
    turquoise: '#1ca5a8',
    crimson: '#b8334a',
    emerald: '#4a8a5e',
    textPrimary: '#e8e6df',
    textSecondary: '#b5b1a4',
    textMuted: '#6a6759',
    bgDeep: '#07070b',
    bgBase: '#0d0d14',
    bgSurface: '#15151f',
    bgElevated: '#1f1f2e',
    borderBase: '#2a2a3d',
    sultan: '#d4a64a',
    tsar: '#b8334a',
    king: '#3a6db8',
    khan: '#c08850',
  },
};

export const FACTION_COLOR = {
  sultan: THEME.gold,
  tsar: THEME.crimson,
  king: THEME.king,
  khan: THEME.khan,
};

export const FACTION_COLOR_STR = {
  sultan: '#d4a64a',
  tsar: '#b8334a',
  king: '#3a6db8',
  khan: '#c08850',
};

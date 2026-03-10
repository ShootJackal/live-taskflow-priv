import { Platform } from "react-native";

export const DesignTokens = {
  radius: {
    xs: 6,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    pill: 100,
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
  },
  shadow: {
    card: {
      shadowOffset: { width: 0, height: 7 },
      shadowOpacity: 0.14,
      shadowRadius: 16,
      elevation: 8,
    },
    elevated: {
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.2,
      shadowRadius: 24,
      elevation: 12,
    },
    subtle: {
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.1,
      shadowRadius: 10,
      elevation: 4,
    },
    // For borderless cards — slightly richer lift without a stroke
    float: {
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.11,
      shadowRadius: 18,
      elevation: 7,
    },
    // Hair-thin lift for rows inside a section group
    row: {
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 4,
      elevation: 2,
    },
  },
  // iOS SF Pro-inspired type scale (minimum readable sizes)
  fontSize: {
    largeTitle: 34,
    title1: 28,
    title2: 22,
    title3: 20,
    headline: 17,
    body: 17,
    callout: 16,
    subhead: 15,
    footnote: 13,
    caption1: 12,
    caption2: 11,
  },
  maxContentWidth: 600,
  fontMono: Platform.select({ ios: "Courier New", android: "monospace", default: "monospace" }),
} as const;

export interface ThemeColors {
  bg: string;
  bgSecondary: string;
  bgCard: string;
  bgInput: string;
  bgElevated: string;
  border: string;
  borderLight: string;
  borderFocus: string;

  textPrimary: string;
  textSecondary: string;
  textMuted: string;

  accent: string;
  accentLight: string;
  accentDim: string;
  accentSoft: string;

  assign: string;
  assignBg: string;
  complete: string;
  completeBg: string;
  cancel: string;
  cancelBg: string;

  statusActive: string;
  statusPending: string;
  statusCancelled: string;

  white: string;
  black: string;

  slack: string;
  slackBg: string;
  hubstaff: string;
  hubstaffBg: string;
  airtable: string;
  airtableBg: string;
  sheets: string;
  sheetsBg: string;

  tabBar: string;
  tabBarBorder: string;

  skeleton: string;
  overlay: string;

  shadow: string;
  shadowCard: string;

  terminal: string;
  terminalBg: string;
  terminalGreen: string;
  terminalDim: string;

  alertYellow: string;
  alertYellowBg: string;
  recollectRed: string;
  recollectRedBg: string;
  statsGreen: string;
  statsGreenBg: string;

  mxOrange: string;
  mxOrangeBg: string;
  sfBlue: string;
  sfBlueBg: string;

  gold: string;
  goldBg: string;
  silver: string;
  silverBg: string;
  bronze: string;
  bronzeBg: string;

  cardDepth: string;
}

// ─── Light — luxe lavender-white glass ───────────────────────────────────────
// Level 0: soft lavender-tinted white field
// Level 1: translucent white shells with indigo edge
// Level 2: near-opaque white cards
// Level 3: vivid purple accents
export const LightTheme: ThemeColors = {
  bg: '#F2F0F9',           // L0 — soft lavender-white field
  bgSecondary: '#E8E5F5',  // slightly deeper
  bgCard: 'rgba(255,255,255,0.92)',   // L2 — glass card
  bgInput: 'rgba(242,240,249,0.80)',  // input well
  bgElevated: 'rgba(255,255,255,0.98)',
  border: 'rgba(130,110,200,0.16)',   // lavender edge
  borderLight: 'rgba(180,160,230,0.10)',
  borderFocus: '#7C3AED',

  textPrimary: '#16141F',    // near-black
  textSecondary: '#3D3856',  // muted indigo
  textMuted: '#8C89A4',

  accent: '#7C3AED',
  accentLight: '#9B6CF8',
  accentDim: '#DDD4F8',
  accentSoft: 'rgba(124,58,237,0.08)',

  assign: '#7C3AED',
  assignBg: 'rgba(124,58,237,0.08)',
  complete: '#1E7B4A',
  completeBg: '#E6F5ED',
  cancel: '#C0392B',
  cancelBg: '#FDECEA',

  statusActive: '#1E7B4A',
  statusPending: '#A66A00',
  statusCancelled: '#C0392B',

  white: '#FFFFFF',
  black: '#000000',

  slack: '#4A2A5E',
  slackBg: 'rgba(74,42,94,0.07)',
  hubstaff: '#1E7B4A',
  hubstaffBg: 'rgba(30,123,74,0.07)',
  airtable: '#A66A00',
  airtableBg: 'rgba(166,106,0,0.07)',
  sheets: '#1E7B4A',
  sheetsBg: 'rgba(30,123,74,0.07)',

  // L1 shell — translucent frosted glass
  tabBar: 'rgba(246,244,255,0.86)',
  tabBarBorder: 'rgba(130,110,200,0.18)',

  skeleton: 'rgba(130,110,200,0.12)',
  overlay: 'rgba(22,20,31,0.32)',

  shadow: 'rgba(80,60,150,0.15)',
  shadowCard: 'rgba(80,60,150,0.12)',

  terminal: '#7C3AED',
  terminalBg: 'rgba(242,240,249,0.80)',
  terminalGreen: '#1E7B4A',
  terminalDim: '#8C89A4',

  alertYellow: '#8C5E00',
  alertYellowBg: 'rgba(255,200,50,0.10)',
  recollectRed: '#C0392B',
  recollectRedBg: 'rgba(192,57,43,0.07)',
  statsGreen: '#1E7B4A',
  statsGreenBg: 'rgba(30,123,74,0.08)',

  mxOrange: '#B86020',
  mxOrangeBg: 'rgba(184,96,32,0.08)',
  sfBlue: '#2B5FA8',
  sfBlueBg: 'rgba(43,95,168,0.08)',

  gold: '#A66A00',
  goldBg: 'rgba(166,106,0,0.08)',
  silver: '#5E6470',
  silverBg: 'rgba(94,100,112,0.08)',
  bronze: '#8C4820',
  bronzeBg: 'rgba(140,72,32,0.08)',

  cardDepth: 'rgba(255,255,255,0.72)',
};

// ─── Dark — luxe deep indigo glass ───────────────────────────────────────────
// Level 0: deep near-black with subtle indigo warmth
// Level 1: translucent dark shells with violet edge
// Level 2: elevated glass cards
// Level 3: vivid violet/lavender accents
export const DarkTheme: ThemeColors = {
  bg: '#0E0C18',           // L0 — deep indigo-black field
  bgSecondary: '#141220',  // slightly lifted
  bgCard: 'rgba(26,22,44,0.94)',   // L2 — deep glass card
  bgInput: 'rgba(20,18,34,0.80)',  // input well
  bgElevated: 'rgba(36,30,60,0.96)',
  border: 'rgba(140,120,220,0.18)',  // violet glass edge
  borderLight: 'rgba(140,120,220,0.10)',
  borderFocus: '#A78BFA',

  textPrimary: '#F0EDF8',   // near-white with warmth
  textSecondary: '#C0BAD8', // soft lavender
  textMuted: '#6E6888',

  accent: '#A78BFA',
  accentLight: '#C4B5FD',
  accentDim: 'rgba(167,139,250,0.22)',
  accentSoft: 'rgba(167,139,250,0.12)',

  assign: '#A78BFA',
  assignBg: 'rgba(167,139,250,0.12)',
  complete: '#5EBD8A',
  completeBg: 'rgba(94,189,138,0.12)',
  cancel: '#F07070',
  cancelBg: 'rgba(240,112,112,0.12)',

  statusActive: '#5EBD8A',
  statusPending: '#D4A843',
  statusCancelled: '#F07070',

  white: '#FFFFFF',
  black: '#000000',

  slack: '#D4A0D8',
  slackBg: 'rgba(212,160,216,0.10)',
  hubstaff: '#5EBD8A',
  hubstaffBg: 'rgba(94,189,138,0.10)',
  airtable: '#D4A843',
  airtableBg: 'rgba(212,168,67,0.10)',
  sheets: '#5EBD8A',
  sheetsBg: 'rgba(94,189,138,0.10)',

  // L1 shell — deep frosted glass
  tabBar: 'rgba(14,12,24,0.88)',
  tabBarBorder: 'rgba(140,120,220,0.22)',

  skeleton: 'rgba(140,120,220,0.12)',
  overlay: 'rgba(0,0,0,0.65)',

  shadow: '#000000',
  shadowCard: 'rgba(0,0,0,0.55)',

  terminal: '#A78BFA',
  terminalBg: 'rgba(20,18,34,0.80)',
  terminalGreen: '#5EBD8A',
  terminalDim: '#6E6888',

  alertYellow: '#E0B84A',
  alertYellowBg: 'rgba(224,184,74,0.10)',
  recollectRed: '#F07070',
  recollectRedBg: 'rgba(240,112,112,0.10)',
  statsGreen: '#5EBD8A',
  statsGreenBg: 'rgba(94,189,138,0.10)',

  mxOrange: '#F0A060',
  mxOrangeBg: 'rgba(240,160,96,0.10)',
  sfBlue: '#80B0E0',
  sfBlueBg: 'rgba(128,176,224,0.10)',

  gold: '#D4A843',
  goldBg: 'rgba(212,168,67,0.10)',
  silver: '#9CA3AF',
  silverBg: 'rgba(156,163,175,0.10)',
  bronze: '#C87B52',
  bronzeBg: 'rgba(200,123,82,0.10)',

  cardDepth: 'rgba(255,255,255,0.04)',
};



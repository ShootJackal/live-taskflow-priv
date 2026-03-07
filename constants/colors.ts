import { Platform } from "react-native";

export const DesignTokens = {
  radius: {
    xs: 6,
    sm: 10,
    md: 14,
    lg: 18,
    xl: 22,
    xxl: 28,
    pill: 100,
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 14,
    lg: 18,
    xl: 22,
    xxl: 28,
    xxxl: 36,
  },
  shadow: {
    card: {
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.08,
      shadowRadius: 20,
      elevation: 8,
    },
    elevated: {
      shadowOffset: { width: 0, height: 16 },
      shadowOpacity: 0.12,
      shadowRadius: 32,
      elevation: 14,
    },
    subtle: {
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.06,
      shadowRadius: 12,
      elevation: 4,
    },
    // For borderless cards — soft, diffused lift
    float: {
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.07,
      shadowRadius: 24,
      elevation: 8,
    },
    // Hair-thin lift for rows inside a section group
    row: {
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.04,
      shadowRadius: 6,
      elevation: 2,
    },
  },
  // iOS SF Pro-inspired type scale (minimum readable sizes)
  fontSize: {
    largeTitle: 32,
    title1: 26,
    title2: 21,
    title3: 19,
    headline: 17,
    body: 16,
    callout: 15,
    subhead: 14,
    footnote: 13,
    caption1: 12,
    caption2: 11,
  },
  maxContentWidth: 600,
  fontMono: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
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

export const LightTheme: ThemeColors = {
  bg: '#F5F3F0',
  bgSecondary: '#EBE8E4',
  bgCard: '#FAFAF9',
  bgInput: '#F0EDEA',
  bgElevated: '#FFFFFF',
  border: '#D8D4CF',
  borderLight: '#E8E5E0',
  borderFocus: '#B8956C',

  textPrimary: '#1C1917',
  textSecondary: '#57534E',
  textMuted: '#A8A29E',

  accent: '#B8956C',
  accentLight: '#D4B896',
  accentDim: '#E8DDD0',
  accentSoft: '#F5F0EA',

  assign: '#B8956C',
  assignBg: '#F5F0EA',
  complete: '#3D8B6E',
  completeBg: '#E8F4EE',
  cancel: '#C45C5C',
  cancelBg: '#FCEDED',

  statusActive: '#3D8B6E',
  statusPending: '#C49A3A',
  statusCancelled: '#C45C5C',

  white: '#FFFFFF',
  black: '#000000',

  slack: '#4A4A4A',
  slackBg: '#F0F0F0',
  hubstaff: '#3D8B6E',
  hubstaffBg: '#E8F4EE',
  airtable: '#C49A3A',
  airtableBg: '#FDF6E8',
  sheets: '#3D8B6E',
  sheetsBg: '#E8F4EE',

  tabBar: 'rgba(250,250,249,0.95)',
  tabBarBorder: 'transparent',

  skeleton: '#D8D4CF',
  overlay: 'rgba(28,25,23,0.25)',

  shadow: '#78716C',
  shadowCard: 'rgba(87, 83, 78, 0.12)',

  terminal: '#57534E',
  terminalBg: '#F5F3F0',
  terminalGreen: '#3D8B6E',
  terminalDim: '#A8A29E',

  alertYellow: '#B8860B',
  alertYellowBg: '#FDF6E8',
  recollectRed: '#C45C5C',
  recollectRedBg: '#FCEDED',
  statsGreen: '#3D8B6E',
  statsGreenBg: '#E8F4EE',

  mxOrange: '#C47A3A',
  mxOrangeBg: '#FDF3EA',
  sfBlue: '#5B7A9D',
  sfBlueBg: '#EDF2F7',

  gold: '#C49A3A',
  goldBg: '#FDF6E8',
  silver: '#78716C',
  silverBg: '#F0EDEA',
  bronze: '#A67C52',
  bronzeBg: '#F8F0E8',

  cardDepth: 'rgba(255,255,255,0.8)',
};

export const DarkTheme: ThemeColors = {
  bg: '#141210',
  bgSecondary: '#1A1816',
  bgCard: '#201E1B',
  bgInput: '#1A1816',
  bgElevated: '#282522',
  border: '#332F2A',
  borderLight: '#3D3832',
  borderFocus: '#D4B896',

  textPrimary: '#F5F3F0',
  textSecondary: '#C7C2BA',
  textMuted: '#8A847C',

  accent: '#D4B896',
  accentLight: '#E8D4BC',
  accentDim: '#3D3426',
  accentSoft: '#2A2520',

  assign: '#D4B896',
  assignBg: '#2A2520',
  complete: '#6EBD96',
  completeBg: '#162018',
  cancel: '#E88080',
  cancelBg: '#201414',

  statusActive: '#6EBD96',
  statusPending: '#E8C060',
  statusCancelled: '#E88080',

  white: '#FFFFFF',
  black: '#000000',

  slack: '#A8A29E',
  slackBg: '#201E1B',
  hubstaff: '#6EBD96',
  hubstaffBg: '#162018',
  airtable: '#E8C060',
  airtableBg: '#201C14',
  sheets: '#6EBD96',
  sheetsBg: '#162018',

  tabBar: 'rgba(26,24,22,0.95)',
  tabBarBorder: 'transparent',

  skeleton: '#332F2A',
  overlay: 'rgba(0,0,0,0.7)',

  shadow: '#0A0908',
  shadowCard: 'rgba(0, 0, 0, 0.5)',

  terminal: '#D4B896',
  terminalBg: '#141210',
  terminalGreen: '#6EBD96',
  terminalDim: '#5C5650',

  alertYellow: '#E8C060',
  alertYellowBg: '#201C14',
  recollectRed: '#E88080',
  recollectRedBg: '#201414',
  statsGreen: '#6EBD96',
  statsGreenBg: '#162018',

  mxOrange: '#E8A060',
  mxOrangeBg: '#201814',
  sfBlue: '#8AAAD4',
  sfBlueBg: '#141820',

  gold: '#E8C060',
  goldBg: '#201C14',
  silver: '#A8A29E',
  silverBg: '#201E1B',
  bronze: '#D4956C',
  bronzeBg: '#201814',

  cardDepth: 'rgba(255,255,255,0.03)',
};

export const FrostedGlassTheme: ThemeColors = {
  bg: '#F7F5F2',
  bgSecondary: '#EFECE8',
  bgCard: 'rgba(255, 255, 255, 0.88)',
  bgInput: 'rgba(245, 242, 238, 0.90)',
  bgElevated: 'rgba(255, 255, 255, 0.75)',
  border: 'rgba(184, 149, 108, 0.25)',
  borderLight: 'rgba(200, 194, 186, 0.35)',
  borderFocus: '#B8956C',

  textPrimary: '#1C1917',
  textSecondary: '#57534E',
  textMuted: '#A8A29E',

  accent: '#B8956C',
  accentLight: '#D4B896',
  accentDim: '#E8DDD0',
  accentSoft: 'rgba(245, 240, 234, 0.75)',

  assign: '#B8956C',
  assignBg: 'rgba(245, 240, 234, 0.65)',
  complete: '#3D8B6E',
  completeBg: 'rgba(232, 244, 238, 0.65)',
  cancel: '#C45C5C',
  cancelBg: 'rgba(252, 237, 237, 0.65)',

  statusActive: '#3D8B6E',
  statusPending: '#C49A3A',
  statusCancelled: '#C45C5C',

  white: '#FFFFFF',
  black: '#000000',

  slack: '#4A4A4A',
  slackBg: 'rgba(240, 240, 240, 0.60)',
  hubstaff: '#3D8B6E',
  hubstaffBg: 'rgba(232, 244, 238, 0.60)',
  airtable: '#C49A3A',
  airtableBg: 'rgba(253, 246, 232, 0.60)',
  sheets: '#3D8B6E',
  sheetsBg: 'rgba(232, 244, 238, 0.60)',

  tabBar: 'rgba(250, 248, 245, 0.92)',
  tabBarBorder: 'transparent',

  skeleton: 'rgba(184, 149, 108, 0.20)',
  overlay: 'rgba(28, 25, 23, 0.20)',

  shadow: '#A8A29E',
  shadowCard: 'rgba(87, 83, 78, 0.15)',

  terminal: '#57534E',
  terminalBg: 'rgba(250, 248, 245, 0.55)',
  terminalGreen: '#3D8B6E',
  terminalDim: '#A8A29E',

  alertYellow: '#B8860B',
  alertYellowBg: 'rgba(253, 246, 232, 0.60)',
  recollectRed: '#C45C5C',
  recollectRedBg: 'rgba(252, 237, 237, 0.60)',
  statsGreen: '#3D8B6E',
  statsGreenBg: 'rgba(232, 244, 238, 0.60)',

  mxOrange: '#C47A3A',
  mxOrangeBg: 'rgba(253, 243, 234, 0.60)',
  sfBlue: '#5B7A9D',
  sfBlueBg: 'rgba(237, 242, 247, 0.60)',

  gold: '#C49A3A',
  goldBg: 'rgba(253, 246, 232, 0.60)',
  silver: '#78716C',
  silverBg: 'rgba(240, 237, 234, 0.60)',
  bronze: '#A67C52',
  bronzeBg: 'rgba(248, 240, 232, 0.60)',

  cardDepth: 'rgba(255,255,255,0.7)',
};

export const TintedGlassTheme: ThemeColors = {
  bg: '#18150F',
  bgSecondary: '#1E1B14',
  bgCard: 'rgba(40, 35, 28, 0.92)',
  bgInput: 'rgba(35, 30, 22, 0.90)',
  bgElevated: 'rgba(50, 44, 35, 0.75)',
  border: 'rgba(212, 184, 150, 0.25)',
  borderLight: 'rgba(184, 149, 108, 0.20)',
  borderFocus: '#E8D4BC',

  textPrimary: '#F5F3F0',
  textSecondary: '#C7C2BA',
  textMuted: '#8A847C',

  accent: '#E8D4BC',
  accentLight: '#F0E4D4',
  accentDim: 'rgba(184, 149, 108, 0.35)',
  accentSoft: 'rgba(212, 184, 150, 0.20)',

  assign: '#E8D4BC',
  assignBg: 'rgba(184, 149, 108, 0.20)',
  complete: '#7ECD9E',
  completeBg: 'rgba(50, 110, 80, 0.30)',
  cancel: '#F09090',
  cancelBg: 'rgba(140, 50, 50, 0.30)',

  statusActive: '#7ECD9E',
  statusPending: '#F0D070',
  statusCancelled: '#F09090',

  white: '#FFFFFF',
  black: '#000000',

  slack: '#C7C2BA',
  slackBg: 'rgba(60, 55, 45, 0.40)',
  hubstaff: '#7ECD9E',
  hubstaffBg: 'rgba(40, 80, 60, 0.35)',
  airtable: '#F0D070',
  airtableBg: 'rgba(100, 80, 30, 0.35)',
  sheets: '#7ECD9E',
  sheetsBg: 'rgba(40, 80, 60, 0.35)',

  tabBar: 'rgba(30, 27, 20, 0.95)',
  tabBarBorder: 'transparent',

  skeleton: 'rgba(184, 149, 108, 0.25)',
  overlay: 'rgba(15, 12, 8, 0.60)',

  shadow: '#0A0908',
  shadowCard: 'rgba(10, 8, 5, 0.55)',

  terminal: '#E8D4BC',
  terminalBg: 'rgba(30, 27, 20, 0.70)',
  terminalGreen: '#7ECD9E',
  terminalDim: 'rgba(168, 162, 158, 0.55)',

  alertYellow: '#F0D070',
  alertYellowBg: 'rgba(100, 80, 30, 0.30)',
  recollectRed: '#F09090',
  recollectRedBg: 'rgba(110, 40, 40, 0.30)',
  statsGreen: '#7ECD9E',
  statsGreenBg: 'rgba(40, 80, 60, 0.30)',

  mxOrange: '#F0B070',
  mxOrangeBg: 'rgba(110, 70, 30, 0.30)',
  sfBlue: '#90B8E0',
  sfBlueBg: 'rgba(40, 60, 100, 0.35)',

  gold: '#F0D070',
  goldBg: 'rgba(100, 80, 30, 0.30)',
  silver: '#B0AAA0',
  silverBg: 'rgba(60, 55, 50, 0.40)',
  bronze: '#D8A070',
  bronzeBg: 'rgba(90, 55, 30, 0.30)',

  cardDepth: 'rgba(232, 212, 188, 0.08)',
};

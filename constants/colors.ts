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
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 16,
      elevation: 6,
    },
    elevated: {
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.12,
      shadowRadius: 20,
      elevation: 8,
    },
    subtle: {
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 8,
      elevation: 3,
    },
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

export const LightTheme: ThemeColors = {
  bg: '#ECE8E1',
  bgSecondary: '#E4DED4',
  bgCard: '#F8F5EE',
  bgInput: '#EEE8DE',
  bgElevated: '#E2DBCF',
  border: '#D5CEC1',
  borderLight: '#E2DBCF',
  borderFocus: '#8B6FC0',

  textPrimary: '#1A1720',
  textSecondary: '#4A4555',
  textMuted: '#8E889A',

  accent: '#7C3AED',
  accentLight: '#9461F5',
  accentDim: '#D8CFF0',
  accentSoft: '#EEEAFF',

  assign: '#7C3AED',
  assignBg: '#EEEAFF',
  complete: '#2D8A56',
  completeBg: '#E4F4EB',
  cancel: '#C53030',
  cancelBg: '#FDE8E8',

  statusActive: '#2D8A56',
  statusPending: '#B8860B',
  statusCancelled: '#C53030',

  white: '#FFFFFF',
  black: '#000000',

  slack: '#5B3A6B',
  slackBg: '#F0E8F8',
  hubstaff: '#2D8A56',
  hubstaffBg: '#E4F4EB',
  airtable: '#B8860B',
  airtableBg: '#FEF5E5',
  sheets: '#2D8A56',
  sheetsBg: '#E4F4EB',

  tabBar: '#F4F0E8',
  tabBarBorder: 'transparent',

  skeleton: '#D5CEC1',
  overlay: 'rgba(0,0,0,0.25)',

  shadow: '#3D2B6B',
  shadowCard: 'rgba(60, 40, 110, 0.08)',

  terminal: '#7C3AED',
  terminalBg: '#ECE8E1',
  terminalGreen: '#2D8A56',
  terminalDim: '#8E889A',

  alertYellow: '#A67C00',
  alertYellowBg: '#FFF8E1',
  recollectRed: '#C53030',
  recollectRedBg: '#FFF0F0',
  statsGreen: '#2D8A56',
  statsGreenBg: '#E4F8EB',

  mxOrange: '#C47A3A',
  mxOrangeBg: '#FFF3E8',
  sfBlue: '#4A6FA5',
  sfBlueBg: '#EEF3FA',

  gold: '#B8860B',
  goldBg: '#FFF8E1',
  silver: '#6B7280',
  silverBg: '#F0EEF4',
  bronze: '#A0522D',
  bronzeBg: '#FDF0E8',

  cardDepth: 'rgba(124,58,237,0.05)',
};

export const DarkTheme: ThemeColors = {
  bg: '#191821',
  bgSecondary: '#1F1E28',
  bgCard: '#262430',
  bgInput: '#2C2A36',
  bgElevated: '#31303C',
  border: '#3A3846',
  borderLight: '#474556',
  borderFocus: '#A78BFA',

  textPrimary: '#EEEDF2',
  textSecondary: '#B7B2C4',
  textMuted: '#7D7890',

  accent: '#A78BFA',
  accentLight: '#C4B5FD',
  accentDim: '#3B2E64',
  accentSoft: '#2A2342',

  assign: '#A78BFA',
  assignBg: '#1C1630',
  complete: '#5EBD8A',
  completeBg: '#0E2018',
  cancel: '#E87070',
  cancelBg: '#200D0D',

  statusActive: '#5EBD8A',
  statusPending: '#D4A843',
  statusCancelled: '#E87070',

  white: '#FFFFFF',
  black: '#000000',

  slack: '#C490C8',
  slackBg: '#1C101D',
  hubstaff: '#5EBD8A',
  hubstaffBg: '#0E1A12',
  airtable: '#D4A843',
  airtableBg: '#1A1408',
  sheets: '#5EBD8A',
  sheetsBg: '#0E1A12',

  tabBar: '#24222D',
  tabBarBorder: 'transparent',

  skeleton: '#3A3846',
  overlay: 'rgba(0,0,0,0.6)',

  shadow: '#000000',
  shadowCard: 'rgba(0, 0, 0, 0.4)',

  terminal: '#A78BFA',
  terminalBg: '#191821',
  terminalGreen: '#5EBD8A',
  terminalDim: '#4A4858',

  alertYellow: '#D4A843',
  alertYellowBg: '#1A1608',
  recollectRed: '#E87070',
  recollectRedBg: '#1A0C0C',
  statsGreen: '#5EBD8A',
  statsGreenBg: '#0E1A12',

  mxOrange: '#E8A060',
  mxOrangeBg: '#1F1508',
  sfBlue: '#7BA3D4',
  sfBlueBg: '#0D1520',

  gold: '#D4A843',
  goldBg: '#1A1608',
  silver: '#9CA3AF',
  silverBg: '#1B1A21',
  bronze: '#C87B52',
  bronzeBg: '#1A1208',

  cardDepth: 'rgba(255,255,255,0.04)',
};

export const FrostedGlassTheme: ThemeColors = {
  bg: '#F0F1F6',
  bgSecondary: '#E8EAF0',
  bgCard: 'rgba(255, 255, 255, 0.72)',
  bgInput: 'rgba(240, 241, 248, 0.80)',
  bgElevated: 'rgba(230, 232, 240, 0.65)',
  border: 'rgba(180, 185, 210, 0.35)',
  borderLight: 'rgba(200, 205, 225, 0.30)',
  borderFocus: '#8B6FC0',

  textPrimary: '#1C1E2E',
  textSecondary: '#4A4D65',
  textMuted: '#8A8EA8',

  accent: '#7C3AED',
  accentLight: '#9461F5',
  accentDim: '#D4CBF0',
  accentSoft: 'rgba(238, 234, 255, 0.70)',

  assign: '#7C3AED',
  assignBg: 'rgba(238, 234, 255, 0.65)',
  complete: '#2D8A56',
  completeBg: 'rgba(228, 244, 235, 0.65)',
  cancel: '#C53030',
  cancelBg: 'rgba(253, 232, 232, 0.65)',

  statusActive: '#2D8A56',
  statusPending: '#B8860B',
  statusCancelled: '#C53030',

  white: '#FFFFFF',
  black: '#000000',

  slack: '#5B3A6B',
  slackBg: 'rgba(240, 232, 248, 0.60)',
  hubstaff: '#2D8A56',
  hubstaffBg: 'rgba(228, 244, 235, 0.60)',
  airtable: '#B8860B',
  airtableBg: 'rgba(254, 245, 229, 0.60)',
  sheets: '#2D8A56',
  sheetsBg: 'rgba(228, 244, 235, 0.60)',

  tabBar: 'rgba(244, 245, 252, 0.72)',
  tabBarBorder: 'transparent',

  skeleton: 'rgba(200, 205, 225, 0.40)',
  overlay: 'rgba(20, 20, 40, 0.20)',

  shadow: '#3D2B6B',
  shadowCard: 'rgba(60, 40, 110, 0.06)',

  terminal: '#7C3AED',
  terminalBg: 'rgba(248, 248, 255, 0.55)',
  terminalGreen: '#2D8A56',
  terminalDim: '#8A8EA8',

  alertYellow: '#A67C00',
  alertYellowBg: 'rgba(255, 248, 225, 0.60)',
  recollectRed: '#C53030',
  recollectRedBg: 'rgba(255, 240, 240, 0.60)',
  statsGreen: '#2D8A56',
  statsGreenBg: 'rgba(228, 248, 235, 0.60)',

  mxOrange: '#C47A3A',
  mxOrangeBg: 'rgba(255, 243, 232, 0.60)',
  sfBlue: '#4A6FA5',
  sfBlueBg: 'rgba(238, 243, 250, 0.60)',

  gold: '#B8860B',
  goldBg: 'rgba(255, 248, 225, 0.60)',
  silver: '#6B7280',
  silverBg: 'rgba(240, 238, 244, 0.60)',
  bronze: '#A0522D',
  bronzeBg: 'rgba(253, 240, 232, 0.60)',

  cardDepth: 'rgba(124, 58, 237, 0.04)',
};

export const TintedGlassTheme: ThemeColors = {
  bg: '#1A1232',
  bgSecondary: '#201840',
  bgCard: 'rgba(50, 35, 90, 0.60)',
  bgInput: 'rgba(60, 42, 105, 0.55)',
  bgElevated: 'rgba(70, 50, 120, 0.45)',
  border: 'rgba(140, 110, 220, 0.25)',
  borderLight: 'rgba(160, 130, 240, 0.18)',
  borderFocus: '#B794F6',

  textPrimary: '#EDE8F8',
  textSecondary: '#BEB4D8',
  textMuted: '#8B7EB0',

  accent: '#B794F6',
  accentLight: '#D0BDF8',
  accentDim: 'rgba(100, 60, 180, 0.50)',
  accentSoft: 'rgba(80, 50, 150, 0.40)',

  assign: '#B794F6',
  assignBg: 'rgba(80, 50, 150, 0.35)',
  complete: '#6ECC9A',
  completeBg: 'rgba(40, 100, 70, 0.30)',
  cancel: '#F08080',
  cancelBg: 'rgba(130, 40, 40, 0.30)',

  statusActive: '#6ECC9A',
  statusPending: '#E0B850',
  statusCancelled: '#F08080',

  white: '#FFFFFF',
  black: '#000000',

  slack: '#D4A0D8',
  slackBg: 'rgba(80, 40, 90, 0.35)',
  hubstaff: '#6ECC9A',
  hubstaffBg: 'rgba(30, 80, 50, 0.35)',
  airtable: '#E0B850',
  airtableBg: 'rgba(90, 70, 20, 0.35)',
  sheets: '#6ECC9A',
  sheetsBg: 'rgba(30, 80, 50, 0.35)',

  tabBar: 'rgba(40, 28, 75, 0.75)',
  tabBarBorder: 'transparent',

  skeleton: 'rgba(100, 80, 160, 0.30)',
  overlay: 'rgba(10, 5, 25, 0.55)',

  shadow: '#0A0520',
  shadowCard: 'rgba(20, 10, 50, 0.40)',

  terminal: '#B794F6',
  terminalBg: 'rgba(25, 18, 50, 0.65)',
  terminalGreen: '#6ECC9A',
  terminalDim: 'rgba(140, 120, 180, 0.60)',

  alertYellow: '#E0B850',
  alertYellowBg: 'rgba(90, 70, 20, 0.30)',
  recollectRed: '#F08080',
  recollectRedBg: 'rgba(100, 30, 30, 0.30)',
  statsGreen: '#6ECC9A',
  statsGreenBg: 'rgba(30, 80, 50, 0.30)',

  mxOrange: '#F0A860',
  mxOrangeBg: 'rgba(100, 60, 20, 0.30)',
  sfBlue: '#80B0E0',
  sfBlueBg: 'rgba(30, 50, 90, 0.35)',

  gold: '#E0B850',
  goldBg: 'rgba(90, 70, 20, 0.30)',
  silver: '#A8B0C0',
  silverBg: 'rgba(50, 45, 70, 0.35)',
  bronze: '#D08858',
  bronzeBg: 'rgba(80, 45, 20, 0.30)',

  cardDepth: 'rgba(180, 150, 255, 0.06)',
};

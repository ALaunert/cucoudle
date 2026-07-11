export const colors = {
  background: "#07111E",
  surface: "#111E2E",
  surfaceRaised: "#18283A",
  text: "#F4F7FA",
  textMuted: "#9DABBC",
  primary: "#74E8BD",
  primaryPressed: "#52CFA1",
  primaryText: "#062117",
  secondary: "#34465C",
  secondaryPressed: "#435871",
  attentionSurface: "#352A18",
  attentionBorder: "#DDA94E",
  attentionText: "#FFDFA0",
  activity: "#69AFFF",
  destructive: "#E36D76",
  destructivePressed: "#C95862",
  destructiveText: "#FFFFFF",
  success: "#74E8BD",
  border: "#26384D",
  disabled: "#273444",
  disabledText: "#718096",
} as const;

export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radii = {
  small: 12,
  control: 18,
  card: 24,
  cardLarge: 28,
  pill: 999,
} as const;

export const typography = {
  body: 16,
  label: 16,
  title: 26,
  caption: 13,
} as const;

export const theme = { colors, spacing, radii, typography } as const;

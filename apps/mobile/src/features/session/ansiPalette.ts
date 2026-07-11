// Maps pyte color names (and raw hex values for 256/truecolor) to a palette
// tuned for the dark terminal background, close to desktop terminal themes.

export const TERMINAL_BACKGROUND = "#030912";
export const TERMINAL_DEFAULT_FG = "#E6EDF3";

const NAMED: Record<string, string> = {
  black: "#0D1117",
  red: "#F47067",
  green: "#57AB5A",
  yellow: "#C69026",
  blue: "#539BF5",
  magenta: "#B083F0",
  cyan: "#39C5CF",
  white: "#D0D7DE",
  brightblack: "#636E7B",
  brightred: "#FF938A",
  brightgreen: "#6BC46D",
  brightyellow: "#DAAA3F",
  brightblue: "#6CB6FF",
  brightmagenta: "#DCBDFB",
  brightcyan: "#56D4DD",
  brightwhite: "#F4F7FA",
  brown: "#C69026", // pyte's alias for the ANSI yellow slot
};

export function ansiColor(value: string | undefined, fallback?: string): string | undefined {
  if (!value) return fallback;
  const named = NAMED[value.toLowerCase()];
  if (named) return named;
  if (/^[0-9a-f]{6}$/i.test(value)) return `#${value}`;
  if (/^#[0-9a-f]{6}$/i.test(value)) return value;
  return fallback;
}

export const THEMES = {
    LIGHT: "light",
    DARK: "dark",
};

const lightPalette = {
    pageTop: "#ECF8FF",
    pageMid: "#D8F0FF",
    pageBottom: "#D4F7E9",
    deepBlue: "#1A62BA",
    oceanBlue: "#38AEFF",
    skyBlue: "#8DDBFF",
    mint: "#26C97A",
    emerald: "#0DAF63",
    iceWhite: "#F8FEFF",
    textPrimary: "#083358",
    textSecondary: "#3B6790",
    textMuted: "#6A8BAB",
    borderSoft: "rgba(11, 84, 138, 0.18)",
    borderStrong: "rgba(10, 106, 168, 0.28)",
    danger: "#CF3E55",
    surface: "rgba(255,255,255,0.74)",
    surfaceStrong: "rgba(255,255,255,0.84)",
};

const darkPalette = {
    pageTop: "#060A14",
    pageMid: "#091327",
    pageBottom: "#0C1F30",
    deepBlue: "#6FC6FF",
    oceanBlue: "#2DA5FF",
    skyBlue: "#8CDBFF",
    mint: "#39D28A",
    emerald: "#5BEE9B",
    iceWhite: "#EAF6FF",
    textPrimary: "#EAF4FF",
    textSecondary: "#B7CCE7",
    textMuted: "#8DA7C8",
    borderSoft: "rgba(118, 193, 255, 0.22)",
    borderStrong: "rgba(120, 199, 255, 0.35)",
    danger: "#FF7F95",
    surface: "rgba(18, 35, 58, 0.72)",
    surfaceStrong: "rgba(22, 44, 70, 0.84)",
};

function makeGradients(palette, mode) {
    if (mode === THEMES.DARK) {
        return {
            appBackground: [
                palette.pageTop,
                palette.pageMid,
                palette.pageBottom,
            ],
            card: ["#10223D", "#0D1B31", "#112A3A"],
            primaryButton: ["#7AD9FF", "#3DAFFF", "#238EFF"],
            primaryButtonMint: ["#74D3FF", "#33A7FF", "#1CC87D"],
            navBar: ["rgba(16,33,58,0.95)", "rgba(12,27,48,0.95)"],
            navActivePill: ["#7AD8FF", "#2FAAFF"],
        };
    }

    return {
        appBackground: [palette.pageTop, palette.pageMid, palette.pageBottom],
        card: ["#FFFFFF", "#EAF6FF", "#DFF4EC"],
        primaryButton: ["#83DAFF", "#4CBFFF", "#2A93FF"],
        primaryButtonMint: ["#83DAFF", "#4BB8FF", "#29C67A"],
        navBar: ["rgba(255,255,255,0.95)", "rgba(231,248,255,0.92)"],
        navActivePill: ["#7AD8FF", "#2FAAFF"],
    };
}

export function createThemeTokens(mode = THEMES.LIGHT) {
    const palette = mode === THEMES.DARK ? darkPalette : lightPalette;
    const gradients = makeGradients(palette, mode);
    const isDark = mode === THEMES.DARK;

    return {
        mode,
        isDark,
        palette,
        gradients,
    };
}

export function createNavigationTheme(mode = THEMES.LIGHT) {
    const { palette, isDark } = createThemeTokens(mode);
    return {
        dark: isDark,
        colors: {
            primary: palette.oceanBlue,
            background: palette.pageTop,
            card: isDark ? "#0E1E35" : "#FFFFFF",
            text: palette.textPrimary,
            border: palette.borderSoft,
            notification: palette.mint,
        },
    };
}

// Backward compatibility for files not migrated yet.
export const palette = lightPalette;
export const gradients = makeGradients(lightPalette, THEMES.LIGHT);
export const appNavTheme = createNavigationTheme(THEMES.LIGHT);

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
    createNavigationTheme,
    createThemeTokens,
    THEMES,
} from "../theme/theme";

const THEME_STORAGE_KEY = "@wuloye_theme_mode";

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
    const [mode, setMode] = useState(THEMES.LIGHT);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        let active = true;

        async function loadTheme() {
            try {
                const stored = await AsyncStorage.getItem(THEME_STORAGE_KEY);
                if (!active) {
                    return;
                }
                if (stored === THEMES.DARK || stored === THEMES.LIGHT) {
                    setMode(stored);
                }
            } finally {
                if (active) {
                    setReady(true);
                }
            }
        }

        loadTheme();

        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        if (!ready) {
            return;
        }
        AsyncStorage.setItem(THEME_STORAGE_KEY, mode).catch(() => null);
    }, [mode, ready]);

    const value = useMemo(() => {
        const tokens = createThemeTokens(mode);
        const navigationTheme = createNavigationTheme(mode);

        return {
            ...tokens,
            navigationTheme,
            ready,
            setThemeMode: setMode,
            toggleTheme: () =>
                setMode((current) =>
                    current === THEMES.DARK ? THEMES.LIGHT : THEMES.DARK,
                ),
        };
    }, [mode, ready]);

    return (
        <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
    );
}

export function useAppTheme() {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error("useAppTheme must be used within ThemeProvider");
    }
    return context;
}

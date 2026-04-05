import * as WebBrowser from "expo-web-browser";
import { DefaultTheme, NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "./src/context/AuthContext";
import { ThemeProvider, useAppTheme } from "./src/context/ThemeContext";
import AppNavigator from "./src/navigation/AppNavigator";
import { THEMES } from "./src/theme/theme";

WebBrowser.maybeCompleteAuthSession();

function AppContent() {
    const { navigationTheme, mode } = useAppTheme();

    const mergedTheme = {
        ...DefaultTheme,
        ...navigationTheme,
        colors: {
            ...DefaultTheme.colors,
            ...navigationTheme.colors,
        },
    };

    return (
        <NavigationContainer theme={mergedTheme}>
            <StatusBar style={mode === THEMES.DARK ? "light" : "dark"} />
            <AppNavigator />
        </NavigationContainer>
    );
}

export default function App() {
    return (
        <ThemeProvider>
            <AuthProvider>
                <AppContent />
            </AuthProvider>
        </ThemeProvider>
    );
}

import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Animated, StyleSheet, View } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useRef } from "react";
import HomeScreen from "../screens/HomeScreen";
import RoutineScreen from "../screens/RoutineScreen";
import SavedScreen from "../screens/SavedScreen";
import ProfileScreen from "../screens/ProfileScreen";
import { useAppTheme } from "../context/ThemeContext";

const Tab = createBottomTabNavigator();

const iconMap = {
    Home: ({ color, size }) => (
        <Ionicons name="home" color={color} size={size} />
    ),
    Routines: ({ color, size }) => (
        <MaterialCommunityIcons
            name="calendar-check"
            color={color}
            size={size}
        />
    ),
    Saved: ({ color, size }) => (
        <Ionicons name="bookmark" color={color} size={size} />
    ),
    Profile: ({ color, size }) => (
        <Ionicons name="person" color={color} size={size} />
    ),
};

function AnimatedTabIcon({
    focused,
    routeName,
    color,
    size,
    gradients,
    palette,
    styles,
}) {
    const anim = useRef(new Animated.Value(focused ? 1 : 0)).current;

    useEffect(() => {
        Animated.spring(anim, {
            toValue: focused ? 1 : 0,
            useNativeDriver: true,
            friction: 7,
            tension: 130,
        }).start();
    }, [anim, focused]);

    const scale = anim.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 1.11],
    });

    const translateY = anim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, -1],
    });

    const dotOpacity = anim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 1],
    });

    return (
        <View style={styles.iconWrap}>
            {focused ? (
                <LinearGradient
                    colors={gradients.navActivePill}
                    style={styles.activePill}
                >
                    <Animated.View
                        style={{ transform: [{ scale }, { translateY }] }}
                    >
                        {iconMap[routeName]({ color: palette.iceWhite, size })}
                    </Animated.View>
                </LinearGradient>
            ) : (
                <Animated.View
                    style={{ transform: [{ scale }, { translateY }] }}
                >
                    {iconMap[routeName]({ color, size })}
                </Animated.View>
            )}
            <Animated.View
                style={[styles.activeDot, { opacity: dotOpacity }]}
            />
        </View>
    );
}

export default function MainTabs() {
    const { palette, gradients, isDark } = useAppTheme();
    const styles = useMemo(() => createStyles(palette), [palette]);

    return (
        <Tab.Navigator
            screenOptions={({ route }) => ({
                headerShown: false,
                tabBarStyle: {
                    backgroundColor: isDark
                        ? "rgba(18,36,62,0.9)"
                        : "rgba(255,255,255,0.86)",
                    borderTopWidth: 0,
                    height: 84,
                    paddingBottom: 8,
                    paddingTop: 8,
                    marginHorizontal: 12,
                    marginBottom: 12,
                    borderRadius: 24,
                    position: "absolute",
                    shadowColor: isDark ? "#0F1E34" : "#2A9DE3",
                    shadowOffset: { width: 0, height: 8 },
                    shadowOpacity: 0.2,
                    shadowRadius: 18,
                    elevation: 10,
                },
                tabBarBackground: () => (
                    <LinearGradient
                        colors={gradients.navBar}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={StyleSheet.absoluteFill}
                    />
                ),
                tabBarActiveTintColor: palette.deepBlue,
                tabBarInactiveTintColor: palette.textMuted,
                tabBarLabelStyle: {
                    fontSize: 11,
                    fontWeight: "800",
                    marginBottom: 2,
                },
                tabBarIcon: ({ focused, color, size }) => (
                    <AnimatedTabIcon
                        focused={focused}
                        routeName={route.name}
                        color={color}
                        size={size}
                        palette={palette}
                        gradients={gradients}
                        styles={styles}
                    />
                ),
            })}
        >
            <Tab.Screen name="Home" component={HomeScreen} />
            <Tab.Screen name="Routines" component={RoutineScreen} />
            <Tab.Screen name="Saved" component={SavedScreen} />
            <Tab.Screen name="Profile" component={ProfileScreen} />
        </Tab.Navigator>
    );
}

function createStyles(palette) {
    return StyleSheet.create({
        iconWrap: {
            alignItems: "center",
            justifyContent: "center",
            width: 56,
        },
        activePill: {
            width: 38,
            height: 34,
            borderRadius: 14,
            alignItems: "center",
            justifyContent: "center",
        },
        activeDot: {
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: palette.emerald,
            marginTop: 4,
        },
    });
}

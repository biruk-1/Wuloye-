import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import HomeScreen from "../screens/HomeScreen";
import RoutineScreen from "../screens/RoutineScreen";
import SavedScreen from "../screens/SavedScreen";
import ProfileScreen from "../screens/ProfileScreen";

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

export default function MainTabs() {
    return (
        <Tab.Navigator
            screenOptions={({ route }) => ({
                headerShown: false,
                tabBarStyle: {
                    backgroundColor: "#071326",
                    borderTopColor: "rgba(255,255,255,0.08)",
                    height: 74,
                    paddingBottom: 10,
                    paddingTop: 8,
                },
                tabBarActiveTintColor: "#F7C72C",
                tabBarInactiveTintColor: "#7E91AE",
                tabBarLabelStyle: {
                    fontSize: 11,
                    fontWeight: "700",
                },
                tabBarIcon: iconMap[route.name],
            })}
        >
            <Tab.Screen name="Home" component={HomeScreen} />
            <Tab.Screen name="Routines" component={RoutineScreen} />
            <Tab.Screen name="Saved" component={SavedScreen} />
            <Tab.Screen name="Profile" component={ProfileScreen} />
        </Tab.Navigator>
    );
}

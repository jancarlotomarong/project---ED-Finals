import { StyleSheet, Text, View } from "react-native";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import AppButton from "@/components/AppButton";
import { refreshProfile, signOut, useAuth } from "@/lib/auth";

type IconName = keyof typeof Ionicons.glyphMap;
const icon =
  (name: IconName) =>
  ({ color, size }: { color: string; size: number }) => (
    <Ionicons name={name} size={size} color={color} />
  );

export default function TabLayout() {
  const { profile, profileError } = useAuth();

  // Signed in but no profile row (should not normally happen)
  if (!profile) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackTitle}>Profile not found</Text>
        <Text style={styles.fallbackText}>
          We could not load your account profile. Check your connection and try
          again.
        </Text>
        {profileError ? (
          <Text style={styles.fallbackDetail}>{profileError}</Text>
        ) : null}
        <AppButton
          title="Try again"
          icon="refresh-outline"
          onPress={() => refreshProfile()}
        />
        <AppButton
          title="Sign out"
          icon="log-out-outline"
          onPress={() => signOut()}
        />
      </View>
    );
  }

  const isStudent = profile.role === "student";
  const isAdmin = profile.role === "admin";

  // ROLE-BASED NAVIGATION: tabs a role must not use are hidden (href: null).
  // The real protection is still Row Level Security in the database.
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textSecondary,
        headerShown: true,
        headerStyle: { backgroundColor: COLORS.background },
        headerTintColor: COLORS.textPrimary,
        headerTitleStyle: { fontWeight: "700" },
        headerShadowVisible: false,
        tabBarStyle: {
          backgroundColor: COLORS.card,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: isAdmin ? "Dashboard" : "Home",
          tabBarIcon: icon("home"),
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: isStudent ? "Events" : "Manage Events",
          tabBarLabel: "Events",
          tabBarIcon: icon("calendar"),
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: "Scan",
          tabBarIcon: icon("qr-code"),
          href: isStudent ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: isStudent ? "My Attendance" : "Attendance Records",
          tabBarLabel: isStudent ? "History" : "Attendance",
          tabBarIcon: icon(isStudent ? "time" : "clipboard"),
        }}
      />
      <Tabs.Screen
        name="users"
        options={{
          title: "Manage Users",
          tabBarLabel: "Users",
          tabBarIcon: icon("people"),
          href: isAdmin ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: "Profile", tabBarIcon: icon("person") }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  fallbackTitle: { fontSize: 20, fontWeight: "700", color: COLORS.textPrimary },
  fallbackText: { fontSize: 14, color: COLORS.textSecondary },
  fallbackDetail: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontFamily: "monospace",
  },
});

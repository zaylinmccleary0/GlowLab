import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './auth';
import { WorkspaceProvider } from './workspace';
import { colors } from './theme';
import AuthScreen from './screens/AuthScreen';
import ProjectsScreen from './screens/ProjectsScreen';
import DesignerScreen from './screens/DesignerScreen';
import EstimateScreen from './screens/EstimateScreen';
import SettingsScreen from './screens/SettingsScreen';

const Tab = createBottomTabNavigator();

function Main() {
  const { user, loading } = useAuth();
  if (loading) {
    return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg }}><ActivityIndicator size="large" color={colors.gold} /></View>;
  }
  if (!user) return <AuthScreen />;
  return (
    <WorkspaceProvider>
      <Tab.Navigator screenOptions={{ tabBarActiveTintColor: colors.gold, tabBarStyle: { backgroundColor: colors.card }, headerStyle: { backgroundColor: colors.card }, headerTintColor: colors.ink }}>
        <Tab.Screen name="Projects" component={ProjectsScreen} />
        <Tab.Screen name="Designer" component={DesignerScreen} />
        <Tab.Screen name="Estimate" component={EstimateScreen} />
        <Tab.Screen name="Settings" component={SettingsScreen} />
      </Tab.Navigator>
    </WorkspaceProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer>
        <StatusBar style="light" />
        <Main />
      </NavigationContainer>
    </AuthProvider>
  );
}

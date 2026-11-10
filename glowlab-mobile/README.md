# glowlab-mobile

GlowLab phone app (Expo ~53 / React Native 0.79 / TypeScript). Tabs:
Projects, Designer (pick a photo with expo-image-picker, tap to trace,
calibrate, preset chips, react-native-svg glowing bulbs, night toggle),
Estimate (same shared math + add-on steppers, save to server), Settings
(pricing rates). Auth token in SecureStore.

```bash
npm install
EXPO_PUBLIC_API_URL=http://localhost:4200 npx expo start
npm run tsc   # typecheck
```

Photo measuring: the picker asset's real width/height are stored for the
geometry math; if a build omits them, the Designer falls back to the rendered
layout size (normalized coordinates keep the math consistent).

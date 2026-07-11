module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(?:-.+)?|@expo(nent)?/.*|@expo-google-fonts/.*|@react-navigation/.*|react-navigation|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)/)",
  ],
};

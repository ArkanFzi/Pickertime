import { Link } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React from 'react';
import { Platform } from 'react-native';

// `href` sengaja ikut tipe `Link`, tidak dilebarkan ke `string`: dengan rute bertipe
// (`.expo/types/router.d.ts`) `string` ditolak TypeScript (F-19).
export function ExternalLink(props: React.ComponentProps<typeof Link>) {
  return (
    <Link
      target="_blank"
      {...props}
      onPress={(e) => {
        if (Platform.OS !== 'web') {
          // Prevent the default behavior of linking to the default browser on native.
          e.preventDefault();
          // Open the link in an in-app browser.
          WebBrowser.openBrowserAsync(String(props.href));
        }
      }}
    />
  );
}

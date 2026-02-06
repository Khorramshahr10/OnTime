import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ontime.app',
  appName: 'OnTime',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_icon',
      iconColor: '#2563EB',
    },
    Geolocation: {
      // Will request permissions at runtime
    },
  },
};

export default config;

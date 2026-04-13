import { useRouter } from 'expo-router';
import HomeScreen from '../../src/screens/HomeScreen';

export default function HomeTabRoute() {
  const router = useRouter();

  const navigation = {
    navigate: (routeName: string) => {
      if (routeName === 'Rooms') {
        router.push('/(tabs)/rooms');
        return;
      }
      if (routeName === 'Alerts') {
        router.push('/(tabs)/notifications');
      }
    },
    replace: () => {
      router.replace('/');
    },
  };

  return <HomeScreen navigation={navigation} />;
}

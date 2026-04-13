import { useRouter } from 'expo-router';
import RoomsScreen from '../src/screens/RoomsScreen';

export default function RoomsRoute() {
  const router = useRouter();

  const navigation = {
    navigate: (routeName: string) => {
      if (routeName === 'Rooms') {
        router.push('/rooms');
      }
    },
    goBack: () => {
      router.back();
    },
  };

  return <RoomsScreen navigation={navigation} />;
}

import { useRouter } from 'expo-router';
import HomeScreen from '../src/screens/HomeScreen';

export default function HomeRoute() {
  const router = useRouter();

  const navigation = {
    navigate: () => {
      return;
    },
    replace: () => {
      router.replace('/');
    },
  };

  return <HomeScreen navigation={navigation} />;
}

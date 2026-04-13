import { useRouter } from 'expo-router';
import SignUpScreen from '../src/screens/SignUpScreen';

export default function SignUpRoute() {
  const router = useRouter();

  const navigation = {
    goBack: () => {
      router.back();
    },
    replace: (routeName: string) => {
      if (routeName === 'Main' || routeName === 'Home') {
        router.replace('/(tabs)/home');
      }
    },
  };

  return <SignUpScreen navigation={navigation} />;
}

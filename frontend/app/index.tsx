import { useRouter } from 'expo-router';
import LoginScreen from '../src/screens/LoginScreen';

export default function LoginRoute() {
  const router = useRouter();

  const navigation = {
    replace: (routeName: string) => {
      if (routeName === 'Home') {
        router.replace('/(tabs)/home');
        return;
      }
      if (routeName === 'Main') {
        router.replace('/(tabs)/home');
      }
    },
    navigate: (routeName: string) => {
      if (routeName === 'Signup' || routeName === 'SignUp') {
        router.push('/signup');
        return;
      }
      if (routeName === 'Home') {
        router.push('/(tabs)/home');
      }
    },
  };

  return <LoginScreen navigation={navigation} />;
}

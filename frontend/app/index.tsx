import { useRouter } from 'expo-router';
import LoginScreen from '../src/screens/LoginScreen';

export default function LoginRoute() {
  const router = useRouter();

  const navigation = {
    replace: (routeName: string) => {
      if (routeName === 'Home') {
        router.replace('/home');
      }
    },
    navigate: (routeName: string) => {
      if (routeName === 'Signup') {
        return;
      }
      if (routeName === 'Home') {
        router.push('/home');
      }
    },
  };

  return <LoginScreen navigation={navigation} />;
}

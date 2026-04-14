import { useRouter } from 'expo-router';
import RoomsScreen from '../src/screens/RoomsScreen';

export default function RoomsRoute() {
  const router = useRouter();

  const navigation = {
    navigate: (routeName: string, params?: { roomId?: string; room?: { id?: string } }) => {
      if (routeName === 'Rooms') {
        router.push('/rooms');
        return;
      }
      if (routeName === 'RoomDetail') {
        const roomId = params?.roomId ?? params?.room?.id;
        if (roomId) {
          router.push({ pathname: '/room-detail', params: { roomId } });
        }
      }
    },
    goBack: () => {
      router.back();
    },
  };

  return <RoomsScreen navigation={navigation} />;
}

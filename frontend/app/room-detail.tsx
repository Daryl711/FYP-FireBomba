import { useLocalSearchParams, useRouter } from 'expo-router';
import RoomDetailScreen from '../src/screens/RoomDetailScreen';

export default function RoomDetailRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ roomId?: string }>();

  const navigation = {
    goBack: () => {
      router.back();
    },
  };

  const route = {
    params: {
      roomId: params.roomId,
    },
  };

  return <RoomDetailScreen navigation={navigation} route={route} />;
}

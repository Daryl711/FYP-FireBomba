import RoomsScreen from '../../src/screens/RoomsScreen';

export default function RoomsTabRoute() {
  const navigation = {
    navigate: () => {
      return;
    },
  };

  return <RoomsScreen navigation={navigation} />;
}

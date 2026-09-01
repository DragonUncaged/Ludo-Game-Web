import { Route, Routes } from 'react-router-dom';
import HomeScreen from './screens/HomeScreen';
import RoomScreen from './screens/RoomScreen';
import ShopScreen from './screens/ShopScreen';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeScreen />} />
      <Route path="/shop" element={<ShopScreen />} />
      <Route path="/room/:code" element={<RoomScreen />} />
      <Route path="*" element={<HomeScreen />} />
    </Routes>
  );
}

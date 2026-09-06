import { Route, Routes } from 'react-router-dom';
import HomeScreen from './screens/HomeScreen';
import RoomScreen from './screens/RoomScreen';
import ShopScreen from './screens/ShopScreen';
import LeaderboardScreen from './screens/LeaderboardScreen';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeScreen />} />
      <Route path="/shop" element={<ShopScreen />} />
      <Route path="/leaderboard" element={<LeaderboardScreen />} />
      <Route path="/room/:code" element={<RoomScreen />} />
      <Route path="*" element={<HomeScreen />} />
    </Routes>
  );
}

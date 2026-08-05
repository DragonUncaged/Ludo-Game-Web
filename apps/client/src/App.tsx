import { Route, Routes } from 'react-router-dom';
import HomeScreen from './screens/HomeScreen';
import RoomScreen from './screens/RoomScreen';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeScreen />} />
      <Route path="/room/:code" element={<RoomScreen />} />
      <Route path="*" element={<HomeScreen />} />
    </Routes>
  );
}

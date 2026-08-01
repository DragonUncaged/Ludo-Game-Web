import { Route, Routes } from 'react-router-dom';
import HomeScreen from './screens/HomeScreen';

export default function App() {
  return (
    <Routes>
      <Route path="*" element={<HomeScreen />} />
    </Routes>
  );
}

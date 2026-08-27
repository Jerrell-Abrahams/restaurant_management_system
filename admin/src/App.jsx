import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { MotionConfig } from 'motion/react';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Restaurants } from './pages/Restaurants';
import { Feedback } from './pages/Feedback';
import { MenuEditor } from './pages/MenuEditor';
import { Dishes } from './pages/Dishes';
import { QrCode } from './pages/QrCode';
import { Settings } from './pages/Settings';

// A restaurant owner has exactly one restaurant and should never see a picker for it -- they land
// straight in their inbox. Admins, and the empty case, fall through to the list.
function Home() {
  const { me } = useAuth();
  const navigate = useNavigate();
  const only = !me.isAdmin && me.restaurants.length === 1 ? me.restaurants[0] : null;

  useEffect(() => {
    if (only) navigate(`/r/${only.id}`, { replace: true });
  }, [only, navigate]);

  return only ? null : <Restaurants />;
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <Toaster richColors position="top-right" theme="system" />
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
            <Route path="/r/:restaurantId" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route index element={<Feedback />} />
              <Route path="menu" element={<MenuEditor />} />
              <Route path="dishes" element={<Dishes />} />
              <Route path="qr" element={<QrCode />} />
              <Route path="settings" element={<Settings />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </MotionConfig>
  );
}

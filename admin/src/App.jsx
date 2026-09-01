import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { MotionConfig } from 'motion/react';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Restaurants } from './pages/Restaurants';
import { Overview } from './pages/Overview';
import { Display } from './pages/Display';
import { Feedback } from './pages/Feedback';
import { MenuEditor } from './pages/MenuEditor';
import { Dishes } from './pages/Dishes';
import { Analytics } from './pages/Analytics';
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
            {/* A sibling of the Layout route below, not nested in it -- the kitchen display must
                not carry Layout's sidebar, nav badge or lapsed-subscription banner onto a TV. */}
            <Route path="/r/:restaurantId/display" element={<ProtectedRoute><Display /></ProtectedRoute>} />
            <Route path="/r/:restaurantId" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route index element={<Overview />} />
              <Route path="feedback" element={<Feedback />} />
              <Route path="menu" element={<MenuEditor />} />
              <Route path="dishes" element={<Dishes />} />
              <Route path="analytics" element={<Analytics />} />
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

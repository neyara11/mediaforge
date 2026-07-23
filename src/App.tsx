import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./features/auth/AuthContext";
import Layout from "./components/Layout";
import ImageStudioPage from "./features/image-studio/ImageStudioPage";
import SpeechLabPage from "./features/speech-lab/SpeechLabPage";
import VideoStudioPage from "./features/video-studio/VideoStudioPage";
import MusicStudioPage from "./features/music-studio/MusicStudioPage";
import SettingsPage from "./features/settings/SettingsPage";
import OnboardingPage from "./features/auth/OnboardingPage";

function AppRoutes() {
  const { onboardingComplete } = useAuth();

  if (!onboardingComplete) {
    return (
      <Routes>
        <Route path="*" element={<OnboardingPage />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/image-studio" replace />} />
        <Route path="/image-studio" element={<ImageStudioPage />} />
        <Route path="/speech-lab" element={<SpeechLabPage />} />
        <Route path="/video-studio" element={<VideoStudioPage />} />
        <Route path="/music-studio" element={<MusicStudioPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

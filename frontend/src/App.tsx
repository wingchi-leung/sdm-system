import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import SignInPage from './components/SignInPage';
import Statistics from './components/Statistics';
import MainLayout from './components/MainLayOut';
import CreateActivity from './components/CreateActivity';
import UserManagement from './components/UserManagement';
import LoginPage from './components/LoginPage';
import ProtectedRoute from './components/ProtectedRoute';
import ActivityList from './components/ActivityList';
import EditActivity from './components/EditActivity';
import ActivityParticipants from './components/ActivityParticipants';

const App = () => {
  return (
    <BrowserRouter>
      <MainLayout>
        <Routes>
          <Route path="/" element={<Navigate to="/signin" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signin" element={<SignInPage />} />
          <Route path="/statistics" element={<Statistics />} />
          <Route path="/createactivity" element={<ProtectedRoute><CreateActivity /></ProtectedRoute>} />
          <Route path="/activities" element={<ProtectedRoute><ActivityList /></ProtectedRoute>} />
          <Route path="/activities/edit/:id" element={<ProtectedRoute><EditActivity /></ProtectedRoute>} />
          <Route path="/activities/:id/participants" element={<ProtectedRoute><ActivityParticipants /></ProtectedRoute>} />
          <Route path="/users" element={<UserManagement />} />
        </Routes>
      </MainLayout>
    </BrowserRouter>
  );
};

export default App;
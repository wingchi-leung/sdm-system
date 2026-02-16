import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
 import SignInPage from './components/SignInPage';
import Statistics from './components/Statistics';
import MainLayout  from './components/MainLayOut';
import CreateActivity  from './components/CreateActivity';
import UserManagement from './components/UserManagement';


const App = () => {
  return (
    <BrowserRouter>
      <MainLayout>
        <Routes>
          <Route path="/" element={<Navigate to="/signin" replace />} />
          <Route path="/signin" element={<SignInPage />} />
          <Route path="/statistics" element={<Statistics />} />
          <Route path="/createactivity" element={<CreateActivity />} />
          <Route path="/users" element={<UserManagement />} />
        </Routes>
      </MainLayout>
    </BrowserRouter>
  );
};

export default App;
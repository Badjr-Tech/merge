import React from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import AppShell from './layout/AppShell';
import PublicLayout from './layout/PublicLayout';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Signup from './pages/Signup';
import AcceptInvite from './pages/AcceptInvite';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import NewProject from './pages/NewProject';
import ProjectDetail from './pages/ProjectDetail';
import MyTasks from './pages/MyTasks';
import Approvals from './pages/Approvals';
import PastProposals from './pages/PastProposals';
import Files from './pages/Files';
import { AIReviewer, AIReviewDetail } from './pages/AIReviewer';
import Compliance from './pages/Compliance';
import Calendar from './pages/Calendar';
import Team from './pages/Team';
import Settings from './pages/Settings';
import AnswerBank from './pages/AnswerBank';
import Partners from './pages/Partners';
import { Loading } from './components/ui';

function RequireAuth({ children }) {
  const { isAuthenticated, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <Loading label="Loading Merge…" />;
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  return children;
}

function RequireAdmin({ children }) {
  const { isAdmin } = useAuth();
  return isAdmin ? children : <Navigate to="/app" replace />;
}

function PublicOnly({ children }) {
  const { isAuthenticated, ready } = useAuth();
  if (!ready) return <Loading />;
  return isAuthenticated ? <Navigate to="/app" replace /> : children;
}

function NotFound() {
  return <div className="empty"><h3>Page not found</h3><p>That link doesn't go anywhere. <a href="/app">Back to Merge</a></p></div>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route element={<PublicLayout />}>
              <Route path="/" element={<Landing />} />
            </Route>
            <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
            <Route path="/signup" element={<PublicOnly><Signup /></PublicOnly>} />
            <Route path="/register" element={<Navigate to="/signup" replace />} />
            <Route path="/invite/:token" element={<AcceptInvite />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password/:token" element={<ResetPassword />} />

            <Route path="/app" element={<RequireAuth><AppShell /></RequireAuth>}>
              <Route index element={<Dashboard />} />
              <Route path="projects" element={<Projects />} />
              <Route path="projects/new" element={<NewProject />} />
              <Route path="projects/:id" element={<ProjectDetail />} />
              <Route path="tasks" element={<MyTasks />} />
              <Route path="approvals" element={<Approvals />} />
              <Route path="past-proposals" element={<PastProposals />} />
              <Route path="answer-bank" element={<AnswerBank />} />
              <Route path="partners" element={<Partners />} />
              <Route path="files" element={<Files />} />
              <Route path="ai-review" element={<AIReviewer />} />
              <Route path="ai-review/:id" element={<AIReviewDetail />} />
              <Route path="compliance" element={<Compliance />} />
              <Route path="calendar" element={<Calendar />} />
              <Route path="team" element={<RequireAdmin><Team /></RequireAdmin>} />
              <Route path="settings" element={<Settings />} />
              <Route path="*" element={<NotFound />} />
            </Route>

            {/* Legacy URLs from the previous version */}
            <Route path="/merge" element={<Navigate to="/app/projects/new" replace />} />
            <Route path="/api/projects" element={<Navigate to="/app/projects" replace />} />
            <Route path="/api/projects/:id/view" element={<LegacyProject />} />
            <Route path="/tools/*" element={<Navigate to="/app" replace />} />
            <Route path="/admin/*" element={<Navigate to="/app/team" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

function LegacyProject() {
  const location = useLocation();
  const id = location.pathname.split('/')[3];
  return <Navigate to={`/app/projects/${id}`} replace />;
}

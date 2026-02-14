import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { ProtectedRoute, AdminRoute, TeamRoute } from "@/components/ProtectedRoute";
import ErrorBoundary from "@/components/ErrorBoundary";

// Lazy load pages for better code splitting
const Index = lazy(() => import("./pages/Index"));
const Register = lazy(() => import("./pages/Register"));
const Rules = lazy(() => import("./pages/Rules"));
const Leaderboard = lazy(() => import("./pages/Leaderboard"));
const Login = lazy(() => import("./pages/Login"));
const AdminLogin = lazy(() => import("./pages/AdminLogin"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Admin = lazy(() => import("./pages/Admin"));
const NotFound = lazy(() => import("./pages/NotFound"));
const PuzzleManagement = lazy(() => import("./pages/PuzzleManagement"));
const GameControl = lazy(() => import("./pages/GameControl"));
const TeamGameplay = lazy(() => import("./pages/TeamGameplay"));
const LiveMonitoring = lazy(() => import("./pages/LiveMonitoring"));
const Results = lazy(() => import("./pages/Results"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const TeamMembers = lazy(() => import("./pages/TeamMembers"));

// Loading fallback component
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mx-auto mb-4"></div>
      <div className="text-primary font-terminal">LOADING...</div>
    </div>
  </div>
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2, // Retry failed requests twice
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
      staleTime: 5000, // Data stays fresh for 5 seconds
      refetchOnWindowFocus: false, // Don't refetch on window focus
    },
    mutations: {
      retry: 1, // Retry mutations once
    },
  },
});

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AuthProvider>
            <NotificationProvider>
            <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<Index />} />
            <Route path="/register" element={<Register />} />
            <Route path="/rules" element={<Rules />} />
            <Route path="/login" element={<Login />} />
            <Route path="/admin-login" element={<AdminLogin />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            
            {/* Protected routes - any authenticated user */}
            <Route path="/leaderboard" element={
              <ProtectedRoute>
                <Leaderboard />
              </ProtectedRoute>
            } />
            
            {/* Team-only routes */}
            <Route path="/dashboard" element={
              <TeamRoute>
                <Dashboard />
              </TeamRoute>
            } />
            
            <Route path="/gameplay" element={
              <TeamRoute>
                <TeamGameplay />
              </TeamRoute>
            } />
            
            <Route path="/results" element={
              <TeamRoute>
                <Results />
              </TeamRoute>
            } />
            
            {/* Admin-only routes */}
            <Route path="/admin" element={
              <AdminRoute>
                <Admin />
              </AdminRoute>
            } />
            
            <Route path="/admin/puzzles" element={
              <AdminRoute>
                <PuzzleManagement />
              </AdminRoute>
            } />
            
            <Route path="/puzzle-management" element={
              <AdminRoute>
                <PuzzleManagement />
              </AdminRoute>
            } />
            
            <Route path="/admin/game-control" element={
              <AdminRoute>
                <GameControl />
              </AdminRoute>
            } />
            
            <Route path="/admin/monitoring" element={
              <AdminRoute>
                <LiveMonitoring />
              </AdminRoute>
            } />
            
            <Route path="/admin/live-monitoring" element={
              <AdminRoute>
                <LiveMonitoring />
              </AdminRoute>
            } />
            
            <Route path="/admin/team-members" element={
              <AdminRoute>
                <TeamMembers />
              </AdminRoute>
            } />
            
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
            </NotificationProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
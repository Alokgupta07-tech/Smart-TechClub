import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { ProtectedRoute, AdminRoute, TeamRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Register from "./pages/Register";
import Rules from "./pages/Rules";
import Leaderboard from "./pages/Leaderboard";
import Login from "./pages/Login";
import AdminLogin from "./pages/AdminLogin";
import Dashboard from "./pages/Dashboard";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";
import PuzzleManagement from "./pages/PuzzleManagement";
import GameControl from "./pages/GameControl";
import TeamGameplay from "./pages/TeamGameplay";
import LiveMonitoring from "./pages/LiveMonitoring";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <NotificationProvider>
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<Index />} />
            <Route path="/register" element={<Register />} />
            <Route path="/rules" element={<Rules />} />
            <Route path="/login" element={<Login />} />
            <Route path="/admin-login" element={<AdminLogin />} />
            
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
            
            <Route path="*" element={<NotFound />} />
          </Routes>
          </NotificationProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
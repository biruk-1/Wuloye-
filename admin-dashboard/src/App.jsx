import { Navigate, Route, Routes } from "react-router-dom";
import DashboardLayout from "@/components/layout/DashboardLayout";
import DashboardPage from "@/features/dashboard/DashboardPage";
import UsersPage from "@/features/users/UsersPage";
import InteractionsPage from "@/features/interactions/InteractionsPage";
import RecommendationsPage from "@/features/recommendations/RecommendationsPage";
import SystemPage from "@/features/system/SystemPage";
import ExperimentsPage from "@/features/experiments/ExperimentsPage";

export default function App() {
  return (
    <Routes>
      <Route element={<DashboardLayout />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/interactions" element={<InteractionsPage />} />
        <Route path="/recommendations" element={<RecommendationsPage />} />
        <Route path="/system" element={<SystemPage />} />
        <Route path="/experiments" element={<ExperimentsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

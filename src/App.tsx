import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import DashboardPage from "./pages/DashboardPage";
import ProductsPage from "./pages/ProductsPage";
import PartiesPage from "./pages/PartiesPage";
import SalesPage from "./pages/SalesPage";
import PurchasesPage from "./pages/PurchasesPage";
import StockRegisterPage from "./pages/StockRegisterPage";
import CustomerRegisterPage from "./pages/CustomerRegisterPage";
import CustomerDuePage from "./pages/CustomerDuePage";
import SupplierPaymentsPage from "./pages/SupplierPaymentsPage";
import GstSummaryPage from "./pages/GstSummaryPage";
import ReportsPage from "./pages/ReportsPage";
import ManageUsersPage from "./pages/ManageUsersPage";
import SettingsPage from "./pages/SettingsPage";
import ComingSoonPage from "./pages/ComingSoonPage";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index                  element={<DashboardPage />} />
        <Route path="products"        element={<ProductsPage />} />
        <Route path="customers"       element={<PartiesPage type="customer" />} />
        <Route path="suppliers"       element={<PartiesPage type="supplier" />} />
        <Route path="sales"           element={<SalesPage />} />
        <Route path="purchases"       element={<PurchasesPage />} />
        <Route path="customer-register" element={<CustomerRegisterPage />} />
        <Route path="stock-register"  element={<StockRegisterPage />} />
        <Route path="customer-due"    element={<CustomerDuePage />} />
        <Route path="supplier-payments" element={<SupplierPaymentsPage />} />
        <Route path="gst-summary"     element={<GstSummaryPage />} />
        <Route path="reports"         element={<ReportsPage />} />
        <Route path="manage-users"    element={<ManageUsersPage />} />
        <Route path="settings"        element={<SettingsPage />} />
        <Route path="*"               element={<ComingSoonPage title="Page Not Found" description="The page you're looking for doesn't exist." />} />
      </Route>
    </Routes>
  );
}

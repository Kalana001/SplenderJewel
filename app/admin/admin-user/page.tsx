import { AdminPageSkeleton } from '@/components/admin/admin-page-skeleton';

export default function AdminUsersManagementPage() {
  return (
    <AdminPageSkeleton
      title="Admin Users & Role Permissions"
      category="Security & Access"
      description="Manage administrator accounts, assign access roles (Super Admin, Store Manager, Order Manager), and revoke administrative privileges."
      targetPhase="Phase 1 (Authentication & Authorization)"
      capabilities={[
        'Invite and manage store administrative staff',
        'Role-based access control (RBAC)',
        'Authentication log and active session tracking',
      ]}
    />
  );
}

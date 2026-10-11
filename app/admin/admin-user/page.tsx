import React from 'react';
import { requireAdminPageAuth } from '@/lib/auth/server';
import { getAdminUsersList } from '@/lib/admin-users/admin-actions';
import { AdminUsersManager } from '@/components/admin/admin-users-manager';

export const metadata = {
  title: 'Admin Users & RBAC | Splender Jewel Admin',
  description: 'Manage staff administrators, role assignments, and privileged access control.',
};

export default async function AdminUsersPage() {
  await requireAdminPageAuth();

  const res = await getAdminUsersList();
  const admins = res.success ? res.admins : [];
  const currentAdminId = res.currentAdminId || '';
  const currentAdminRole = res.currentAdminRole || 'staff';

  return (
    <div className="space-y-6">
      <AdminUsersManager
        initialAdmins={admins}
        currentAdminId={currentAdminId}
        currentAdminRole={currentAdminRole}
      />
    </div>
  );
}

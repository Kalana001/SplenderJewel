'use server';

import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth } from '@/lib/auth/server';
import { recordAdminAuditLog } from '@/lib/audit/admin-actions';
import type { AdminStaffMember, AdminRole } from '@/types/admin-user';

export async function getAdminUsersList(): Promise<{
  success: boolean;
  admins: AdminStaffMember[];
  currentAdminId?: string;
  currentAdminRole?: AdminRole;
  error?: string;
}> {
  try {
    const caller = await requireAdminAuth();
    const adminClient = createAdminClient();

    const { data, error } = await (adminClient.from('admin_users') as any)
      .select('id, email, full_name, role, is_active, created_at, updated_at')
      .order('role', { ascending: false })
      .order('created_at', { ascending: true });

    if (error) {
      return { success: false, admins: [], error: error.message };
    }

    const admins: AdminStaffMember[] = (data || []).map((row: any) => ({
      id: row.id,
      email: row.email,
      fullName: row.full_name,
      role: row.role as AdminRole,
      isActive: Boolean(row.is_active),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return {
      success: true,
      admins,
      currentAdminId: caller.id,
      currentAdminRole: caller.role,
    };
  } catch (err: any) {
    return { success: false, admins: [], error: err.message || 'Failed to fetch administrator directory.' };
  }
}

export async function updateAdminUserStatus(
  targetAdminId: string,
  isActive: boolean
): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const caller = await requireAdminAuth();
    const adminClient = createAdminClient();

    // Guardrail: Cannot deactivate self
    if (caller.id === targetAdminId && !isActive) {
      return { success: false, error: 'Self-deactivation is prohibited to prevent administrative lockout.' };
    }

    // If caller is staff, staff cannot modify anyone
    if (caller.role === 'staff') {
      return { success: false, error: 'Staff members do not have permission to modify account statuses.' };
    }

    // Fetch target user to inspect role
    const { data: targetUser, error: fetchError } = await (adminClient.from('admin_users') as any)
      .select('id, email, role, is_active')
      .eq('id', targetAdminId)
      .single();

    if (fetchError || !targetUser) {
      return { success: false, error: 'Target administrator account not found.' };
    }

    // Role hierarchy: an admin can ONLY modify staff accounts.
    // Modifying admin or super_admin requires super_admin privileges.
    if (caller.role === 'admin' && targetUser.role !== 'staff') {
      return {
        success: false,
        error: 'Administrators may only modify staff account statuses. Modifying an administrator or super administrator requires Super Admin privileges.',
      };
    }

    if (targetUser.role === 'super_admin' && caller.role !== 'super_admin') {
      return { success: false, error: 'Only Super Administrators can modify a Super Admin account.' };
    }

    // Guardrail: Cannot deactivate the sole active super_admin
    if (targetUser.role === 'super_admin' && !isActive) {
      const { data: activeSuperAdmins } = await (adminClient.from('admin_users') as any)
        .select('id')
        .eq('role', 'super_admin')
        .eq('is_active', true);

      if (!activeSuperAdmins || activeSuperAdmins.length <= 1) {
        return { success: false, error: 'Cannot deactivate the sole active Super Administrator.' };
      }
    }

    const { error: updateError } = await (adminClient.from('admin_users') as any)
      .update({
        is_active: isActive,
        updated_at: new Date().toISOString(),
      })
      .eq('id', targetAdminId);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    // Record immutable audit log
    await recordAdminAuditLog({
      action: isActive ? 'ACTIVATE_ADMIN_STAFF' : 'DEACTIVATE_ADMIN_STAFF',
      resourceType: 'ADMIN_USERS',
      resourceId: targetAdminId,
      details: {
        targetEmail: targetUser.email,
        targetRole: targetUser.role,
        newStatus: isActive ? 'active' : 'inactive',
      },
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update admin account status.' };
  }
}

export async function updateAdminUserRole(
  targetAdminId: string,
  newRole: AdminRole
): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const caller = await requireAdminAuth();
    const adminClient = createAdminClient();

    // Strict security boundary: only Super Admin can change staff roles
    if (caller.role !== 'super_admin') {
      return { success: false, error: 'Only Super Administrators possess permission to modify administrative roles.' };
    }

    const validRoles: AdminRole[] = ['super_admin', 'admin', 'staff'];
    if (!validRoles.includes(newRole)) {
      return { success: false, error: 'Invalid administrative role selected.' };
    }

    // Fetch target user
    const { data: targetUser, error: fetchError } = await (adminClient.from('admin_users') as any)
      .select('id, email, role, is_active')
      .eq('id', targetAdminId)
      .single();

    if (fetchError || !targetUser) {
      return { success: false, error: 'Target administrator account not found.' };
    }

    // Guardrail: if caller is downgrading own role from super_admin, verify at least one other active super_admin exists
    if (caller.id === targetAdminId && targetUser.role === 'super_admin' && newRole !== 'super_admin') {
      const { data: superAdmins } = await (adminClient.from('admin_users') as any)
        .select('id')
        .eq('role', 'super_admin')
        .eq('is_active', true);

      if (!superAdmins || superAdmins.length <= 1) {
        return { success: false, error: 'Cannot demote the sole active Super Administrator. Designate another Super Admin first.' };
      }
    }

    const { error: updateError } = await (adminClient.from('admin_users') as any)
      .update({
        role: newRole,
        updated_at: new Date().toISOString(),
      })
      .eq('id', targetAdminId);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    // Record immutable audit log
    await recordAdminAuditLog({
      action: 'UPDATE_ADMIN_ROLE',
      resourceType: 'ADMIN_USERS',
      resourceId: targetAdminId,
      details: {
        targetEmail: targetUser.email,
        previousRole: targetUser.role,
        newRole,
      },
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update admin role.' };
  }
}

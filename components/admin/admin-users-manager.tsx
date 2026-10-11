'use client';

import React, { useState } from 'react';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserX,
  Lock,
  Check,
  AlertTriangle,
  UserCog,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { updateAdminUserStatus, updateAdminUserRole } from '@/lib/admin-users/admin-actions';
import type { AdminStaffMember, AdminRole } from '@/types/admin-user';

interface AdminUsersManagerProps {
  initialAdmins: AdminStaffMember[];
  currentAdminId: string;
  currentAdminRole: AdminRole;
}

export function AdminUsersManager({
  initialAdmins,
  currentAdminId,
  currentAdminRole,
}: AdminUsersManagerProps) {
  const [admins, setAdmins] = useState<AdminStaffMember[]>(initialAdmins);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Role Edit Modal
  const [roleModalTarget, setRoleModalTarget] = useState<AdminStaffMember | null>(null);
  const [selectedRole, setSelectedRole] = useState<AdminRole>('admin');

  const superAdminsCount = admins.filter((a) => a.role === 'super_admin' && a.isActive).length;
  const activeAdminsCount = admins.filter((a) => a.isActive).length;

  const openRoleModal = (admin: AdminStaffMember) => {
    setRoleModalTarget(admin);
    setSelectedRole(admin.role);
    setFeedback(null);
  };

  const handleStatusToggle = async (admin: AdminStaffMember) => {
    if (admin.id === currentAdminId) {
      alert('You cannot deactivate your own account.');
      return;
    }

    const actionText = admin.isActive ? 'deactivate' : 'activate';
    if (!window.confirm(`Are you sure you want to ${actionText} administrator ${admin.email}?`)) {
      return;
    }

    setLoadingId(admin.id);
    setFeedback(null);
    try {
      const res = await updateAdminUserStatus(admin.id, !admin.isActive);
      if (res.success) {
        setAdmins((prev) =>
          prev.map((a) => (a.id === admin.id ? { ...a, isActive: !admin.isActive } : a))
        );
        setFeedback({
          type: 'success',
          message: `Administrator account ${admin.email} ${actionText}d successfully.`,
        });
      } else {
        setFeedback({ type: 'error', message: res.error || 'Failed to update account status.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'An unexpected error occurred.' });
    } finally {
      setLoadingId(null);
    }
  };

  const handleRoleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleModalTarget) return;

    setLoadingId(roleModalTarget.id);
    setFeedback(null);
    try {
      const res = await updateAdminUserRole(roleModalTarget.id, selectedRole);
      if (res.success) {
        setAdmins((prev) =>
          prev.map((a) => (a.id === roleModalTarget.id ? { ...a, role: selectedRole } : a))
        );
        setFeedback({
          type: 'success',
          message: `Administrative role for ${roleModalTarget.email} updated to ${selectedRole}.`,
        });
        setRoleModalTarget(null);
      } else {
        setFeedback({ type: 'error', message: res.error || 'Failed to update admin role.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'An unexpected error occurred.' });
    } finally {
      setLoadingId(null);
    }
  };

  const getRoleBadge = (role: AdminRole) => {
    switch (role) {
      case 'super_admin':
        return (
          <Badge variant="gold" className="text-[10px] uppercase font-bold tracking-wider">
            <Shield className="h-3 w-3 mr-1" />
            Super Admin
          </Badge>
        );
      case 'admin':
        return (
          <Badge variant="outline" className="text-[10px] uppercase font-bold text-sky-400 border-sky-800 bg-sky-950/40">
            <ShieldCheck className="h-3 w-3 mr-1" />
            Administrator
          </Badge>
        );
      case 'staff':
      default:
        return (
          <Badge variant="outline" className="text-[10px] uppercase font-bold text-neutral-400 border-neutral-700">
            <UserCheck className="h-3 w-3 mr-1" />
            Staff
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-800 pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-serif font-bold text-white tracking-wide">
            Admin Users & Role Permissions
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">
            Manage store administrators, role assignments, and privileged access control (RBAC).
          </p>
        </div>

        {/* Access level pill */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="text-xs text-neutral-400">Your role:</span>
          {getRoleBadge(currentAdminRole)}
        </div>
      </div>

      {/* Global alert feedback */}
      {feedback && (
        <div
          className={`p-4 rounded-md border text-sm flex items-start gap-3 ${
            feedback.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300'
              : 'bg-rose-950/40 border-rose-800/80 text-rose-300'
          }`}
        >
          {feedback.type === 'success' ? (
            <Check className="h-5 w-5 shrink-0 mt-0.5 text-emerald-400" />
          ) : (
            <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5 text-rose-400" />
          )}
          <div className="flex-1 font-medium">{feedback.message}</div>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-neutral-800 bg-neutral-900/50">
          <CardContent className="p-4 space-y-1">
            <span className="text-xs font-medium text-neutral-400">Total Staff Accounts</span>
            <p className="text-2xl font-serif font-bold text-white">{admins.length}</p>
          </CardContent>
        </Card>
        <Card className="border-neutral-800 bg-neutral-900/50">
          <CardContent className="p-4 space-y-1">
            <span className="text-xs font-medium text-neutral-400">Active Administrators</span>
            <p className="text-2xl font-serif font-bold text-emerald-400">{activeAdminsCount}</p>
          </CardContent>
        </Card>
        <Card className="border-neutral-800 bg-neutral-900/50">
          <CardContent className="p-4 space-y-1">
            <span className="text-xs font-medium text-neutral-400">Super Administrators</span>
            <p className="text-2xl font-serif font-bold text-luxury-gold">{superAdminsCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Administrators Directory Table */}
      <Card className="border-neutral-800 bg-neutral-900/40 overflow-hidden">
        <CardHeader className="border-b border-neutral-800 pb-3">
          <CardTitle className="text-base text-white">Administrative Staff</CardTitle>
          <CardDescription className="text-xs text-neutral-400">
            Accounts with database-level access to the Splender Jewel administration back-office.
          </CardDescription>
        </CardHeader>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-neutral-300">
            <thead className="bg-neutral-950/60 uppercase tracking-wider text-[10px] text-neutral-400 border-b border-neutral-800">
              <tr>
                <th className="py-3 px-4">Staff Member</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Added On</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60">
              {admins.map((admin) => {
                const isSelf = admin.id === currentAdminId;
                const canEditRole = currentAdminRole === 'super_admin';
                const canToggleStatus =
                  !isSelf &&
                  (currentAdminRole === 'super_admin' ||
                    (currentAdminRole === 'admin' && admin.role === 'staff'));

                return (
                  <tr key={admin.id} className="hover:bg-neutral-900/50 transition-colors">
                    {/* User info */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-luxury-gold/15 border border-luxury-gold/30 text-luxury-gold font-bold flex items-center justify-center text-xs">
                          {admin.fullName
                            ? admin.fullName.slice(0, 2).toUpperCase()
                            : admin.email.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-white flex items-center gap-1.5">
                            <span>{admin.fullName || 'Admin User'}</span>
                            {isSelf && (
                              <span className="text-[10px] text-luxury-gold bg-luxury-gold/10 px-1.5 py-0.2 rounded font-mono">
                                (You)
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-neutral-400 font-mono">
                            {admin.email}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Role */}
                    <td className="py-3 px-4">{getRoleBadge(admin.role)}</td>

                    {/* Status */}
                    <td className="py-3 px-4">
                      {admin.isActive ? (
                        <Badge variant="success" className="text-[10px] uppercase font-bold tracking-wider">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="danger" className="text-[10px] uppercase font-bold tracking-wider">
                          Inactive
                        </Badge>
                      )}
                    </td>

                    {/* Date */}
                    <td className="py-3 px-4 text-neutral-400">
                      {new Date(admin.createdAt).toLocaleDateString()}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {canEditRole && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openRoleModal(admin)}
                            disabled={loadingId === admin.id}
                            className="h-7 px-2.5 text-[11px] border-neutral-700 hover:border-luxury-gold"
                          >
                            <UserCog className="h-3 w-3 mr-1" />
                            Role
                          </Button>
                        )}

                        {canToggleStatus && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleStatusToggle(admin)}
                            disabled={loadingId === admin.id}
                            className={`h-7 px-2.5 text-[11px] ${
                              admin.isActive
                                ? 'border-neutral-800 text-rose-400 hover:text-rose-300 hover:border-rose-800'
                                : 'border-neutral-800 text-emerald-400 hover:text-emerald-300 hover:border-emerald-800'
                            }`}
                          >
                            {admin.isActive ? (
                              <>
                                <UserX className="h-3 w-3 mr-1" />
                                Deactivate
                              </>
                            ) : (
                              <>
                                <UserCheck className="h-3 w-3 mr-1" />
                                Activate
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Role Edit Modal */}
      {roleModalTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="border-b border-neutral-800 pb-3">
              <h3 className="text-lg font-serif font-bold text-white">
                Modify Admin Role
              </h3>
              <p className="text-xs text-neutral-400 mt-0.5">
                {roleModalTarget.email}
              </p>
            </div>

            <form onSubmit={handleRoleSave} className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs text-neutral-300">Administrative Role</Label>
                <div className="space-y-2">
                  {[
                    {
                      role: 'super_admin' as AdminRole,
                      title: 'Super Administrator',
                      desc: 'Full unrestricted authority: DB access, role assignments, audit logs, financials, and store settings.',
                    },
                    {
                      role: 'admin' as AdminRole,
                      title: 'Administrator',
                      desc: 'Management access: Orders, products, catalog, coupons, and review moderation.',
                    },
                    {
                      role: 'staff' as AdminRole,
                      title: 'Staff Member',
                      desc: 'Operational read and order fulfillment access without permission to alter store settings.',
                    },
                  ].map((item) => (
                    <label
                      key={item.role}
                      className={`block p-3 rounded border cursor-pointer transition-colors ${
                        selectedRole === item.role
                          ? 'border-luxury-gold bg-luxury-gold/10'
                          : 'border-neutral-800 bg-neutral-950/60 hover:border-neutral-700'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="admin-role-select"
                          value={item.role}
                          checked={selectedRole === item.role}
                          onChange={() => setSelectedRole(item.role)}
                          className="h-3.5 w-3.5 text-luxury-gold focus:ring-luxury-gold"
                        />
                        <span className="text-xs font-semibold text-white">
                          {item.title}
                        </span>
                      </div>
                      <p className="text-[11px] text-neutral-400 mt-1 pl-5.5 leading-relaxed">
                        {item.desc}
                      </p>
                    </label>
                  ))}
                </div>
              </div>

              {selectedRole === 'super_admin' && (
                <div className="p-3 rounded bg-amber-950/30 border border-amber-800/70 text-amber-300 text-xs flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
                  <span>
                    Granting Super Admin provides unmoderated authority over all store financial metrics, staff roles, and settings.
                  </span>
                </div>
              )}

              {/* Modal Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-800">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setRoleModalTarget(null)}
                  disabled={loadingId !== null}
                  className="border-neutral-700 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="gold"
                  size="sm"
                  disabled={loadingId !== null}
                  className="text-xs font-semibold px-5"
                >
                  {loadingId !== null ? 'Saving...' : 'Save Role'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

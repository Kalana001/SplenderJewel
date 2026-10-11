export type AdminRole = 'super_admin' | 'admin' | 'staff';

export interface AdminStaffMember {
  id: string;
  email: string;
  fullName: string;
  role: AdminRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUserUpdateInput {
  role?: AdminRole;
  isActive?: boolean;
}

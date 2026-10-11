export interface AuditLogEntry {
  id: string;
  adminId: string | null;
  adminEmail: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  details: Record<string, any> | null;
  ipAddress: string | null;
  createdAt: string;
}

export interface AuditLogFilter {
  resourceType?: string;
  action?: string;
  search?: string;
  limit?: number;
}

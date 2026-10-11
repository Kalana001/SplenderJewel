'use client';

import React, { useState } from 'react';
import {
  History,
  ShieldCheck,
  Search,
  Calendar,
  User,
  Filter,
  Eye,
  X,
  Code,
  RefreshCw,
} from 'lucide-react';
import type { AuditLogEntry } from '@/types/audit';
import { getAdminAuditLogs } from '@/lib/audit/admin-actions';

interface AuditLogViewerProps {
  initialLogs: AuditLogEntry[];
}

export function AuditLogViewer({ initialLogs }: AuditLogViewerProps) {
  const [logs, setLogs] = useState<AuditLogEntry[]>(initialLogs);
  const [resourceFilter, setResourceFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleFilterChange = async (resourceType: string) => {
    setResourceFilter(resourceType);
    setIsLoading(true);
    try {
      const res = await getAdminAuditLogs({ resourceType });
      if (res.success) {
        setLogs(res.logs);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const filteredLogs = logs.filter((log) => {
    const query = search.toLowerCase();
    return (
      log.adminEmail.toLowerCase().includes(query) ||
      log.action.toLowerCase().includes(query) ||
      log.resourceType.toLowerCase().includes(query) ||
      (log.resourceId || '').toLowerCase().includes(query)
    );
  });

  return (
    <div className="space-y-6">
      {/* Security Architecture Notice */}
      <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-5 flex items-start gap-3.5">
        <ShieldCheck className="h-5 w-5 text-luxury-gold shrink-0 mt-0.5" />
        <div className="text-xs text-neutral-400 leading-relaxed">
          <strong className="text-white block mb-0.5">Immutable Security Audit Trail:</strong>
          This log provides a non-tamperable record of administrative actions, pricing adjustments, fulfillment transitions,
          and store configuration modifications. All sensitive values (passwords, session bearer tokens, and payment secrets)
          are automatically redacted before persistence.
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          {(
            [
              { label: 'All Resources', value: 'all' },
              { label: 'Orders', value: 'ORDER' },
              { label: 'Coupons', value: 'COUPON' },
              { label: 'Settings', value: 'SETTINGS' },
              { label: 'Reviews', value: 'REVIEW' },
              { label: 'Banners', value: 'BANNER' },
            ] as const
          ).map((t) => (
            <button
              key={t.value}
              type="button"
              disabled={isLoading}
              onClick={() => handleFilterChange(t.value)}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                resourceFilter === t.value
                  ? 'bg-luxury-gold text-neutral-950 font-bold'
                  : 'bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800'
              }`}
            >
              {t.label}
            </button>
          ))}
          {isLoading && <RefreshCw className="h-3.5 w-3.5 animate-spin text-luxury-gold ml-2" />}
        </div>

        <div className="relative max-w-xs w-full">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-neutral-500" />
          <input
            type="text"
            placeholder="Search email, action, resource ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-neutral-900 border border-neutral-800 rounded text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-luxury-gold"
          />
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-neutral-300">
            <thead className="bg-neutral-950/80 text-[10px] uppercase tracking-wider text-neutral-400 border-b border-neutral-800">
              <tr>
                <th className="px-5 py-3.5 font-semibold">Timestamp</th>
                <th className="px-4 py-3.5 font-semibold">Admin Actor</th>
                <th className="px-4 py-3.5 font-semibold">Action</th>
                <th className="px-4 py-3.5 font-semibold">Resource</th>
                <th className="px-4 py-3.5 font-semibold">Target ID</th>
                <th className="px-5 py-3.5 font-semibold text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-neutral-500">
                    <History className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    No audit log records found.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-neutral-800/30 transition-colors">
                    <td className="px-5 py-3.5 font-mono text-[11px] text-neutral-400 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString('en-LK', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <User className="h-3 w-3 text-luxury-gold" />
                        <span className="font-medium text-white">{log.adminEmail}</span>
                      </div>
                    </td>

                    <td className="px-4 py-3.5">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-luxury-gold/15 text-luxury-gold border border-luxury-gold/30">
                        {log.action}
                      </span>
                    </td>

                    <td className="px-4 py-3.5">
                      <span className="font-semibold text-neutral-300">
                        {log.resourceType}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 font-mono text-neutral-500 text-[11px]">
                      {log.resourceId ? log.resourceId.substring(0, 16) : '—'}
                    </td>

                    <td className="px-5 py-3.5 text-right">
                      {log.details && Object.keys(log.details).length > 0 ? (
                        <button
                          type="button"
                          onClick={() => setSelectedLog(log)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded text-[11px] transition-colors"
                        >
                          <Code className="h-3 w-3 text-luxury-gold" />
                          <span>View JSON</span>
                        </button>
                      ) : (
                        <span className="text-neutral-600 text-[11px]">None</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Details Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg max-w-lg w-full p-6 space-y-4 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div>
                <h3 className="font-serif font-bold text-sm text-white">
                  Audit Entry: {selectedLog.action}
                </h3>
                <span className="text-xs text-neutral-500 font-mono">
                  {selectedLog.adminEmail} • {new Date(selectedLog.createdAt).toLocaleString('en-LK')}
                </span>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-neutral-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-luxury-gold">
                Sanitized Payload & Changes:
              </span>
              <pre className="p-4 bg-neutral-950 border border-neutral-800 rounded text-xs font-mono text-emerald-400 overflow-x-auto max-h-80 leading-relaxed">
                {JSON.stringify(selectedLog.details, null, 2)}
              </pre>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="px-4 py-1.5 bg-neutral-800 text-neutral-300 rounded text-xs hover:bg-neutral-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

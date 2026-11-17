import { useMemo } from 'react';
import type { PolicyTimelineEntryDto } from '../types/Policy';

export interface PolicyTimelinePanelProps {
  entries: PolicyTimelineEntryDto[];
  loading: boolean;
  error: string | null;
}

export function groupPolicyTimeline(entries: PolicyTimelineEntryDto[]) {
  const byDate = new Map<string, PolicyTimelineEntryDto[]>();
  for (const entry of entries) {
    const list = byDate.get(entry.createdDate) ?? [];
    list.push(entry);
    byDate.set(entry.createdDate, list);
  }
  return Array.from(byDate.entries()).map(([date, items]) => ({ date, items }));
}

export function PolicyTimelinePanel({ entries, loading, error }: PolicyTimelinePanelProps) {
  const groups = useMemo(() => groupPolicyTimeline(entries), [entries]);

  return (
    <section style={{ border: '1px solid #d8e1ea', borderRadius: 3, background: '#fff', padding: 12, minHeight: 'calc(100vh - 190px)', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: 14, lineHeight: '20px', fontWeight: 700 }}>Total Transactions – {entries.length}</h2>
      </div>

      {loading ? (
        <div role="status" style={{ padding: 0, textAlign: 'center', fontSize: 14, fontWeight: 600, color: '#6b7280' }}>Loading timeline...</div>
      ) : error ? (
        <div role="alert" style={{ padding: '14px 16px', border: '1px solid #fecaca', borderRadius: 4, background: '#fef2f2', color: '#b91c1c', fontSize: 13 }}>{error}</div>
      ) : groups.length === 0 ? (
        <div style={{ padding: 0, textAlign: 'center', fontSize: 16, lineHeight: '22px', fontWeight: 700, color: '#111827' }}>No Data Available</div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, overflowX: 'auto', paddingBottom: 8 }}>
          {groups.map((group, groupIndex) => (
            <div key={group.date} style={{ display: 'flex', alignItems: 'flex-start', flexShrink: 0 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginRight: 8 }}>
                <span aria-label={`Transaction Date ${group.date}`} style={{ display: 'inline-block', border: '1px solid #0B5AA0', color: '#0B5AA0', borderRadius: 999, padding: '4px 14px', fontSize: 13, fontWeight: 600, background: '#fff', whiteSpace: 'nowrap' }}>{group.date}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', marginTop: 10, marginRight: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', border: '1px solid #94a3b8', background: '#fff', flexShrink: 0 }} />
                {groupIndex < groups.length - 1 && <span style={{ width: 40, height: 1, background: '#cbd5e1' }} />}
              </div>
              <div style={{ display: 'flex', gap: 12, marginRight: 24 }}>
                {group.items.map((entry, entryIndex) => (
                  <div key={`${entry.createdDate}-${entry.createdTime}-${entryIndex}`} style={{ minWidth: 220, border: '1px solid #e5e7eb', borderRadius: 6, padding: 12, background: '#fafbfc' }}>
                    <span style={{ display: 'inline-block', border: '1px solid #0B5AA0', color: '#0B5AA0', borderRadius: 4, padding: '2px 10px', fontSize: 12, fontWeight: 600, marginBottom: 10 }}>{entry.activityDescription}</span>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>Created By</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 6 }}>{entry.createdByName ?? 'System'}</div>
                    <div style={{ fontSize: 11, fontStyle: 'italic', color: '#9ca3af' }}>Timestamp: {entry.createdDate}, {entry.createdTime}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

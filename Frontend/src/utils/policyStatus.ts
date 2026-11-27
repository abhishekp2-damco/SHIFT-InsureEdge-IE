// QA IP-16: one display label per status on every policy screen. DONOTRENEW is how the
// status is stored.
export function policyStatusLabel(status: string | null | undefined): string {
  if (status === 'DONOTRENEW') return 'Do Not Renew';
  return status ?? '';
}

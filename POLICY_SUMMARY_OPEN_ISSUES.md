# Individual Policy (Policy Summary) — Open Issues

> **Status as of 04-Nov-2026.** Follow-up to *Individual Policy – Policy Summary Screen & Sub-modules Analysis Report* (Abhishek Ojha, 02-Nov-2026).
> Fixes are on branch `deployment-render` (uncommitted at time of writing). Everything below is **not done**, **partly done**, or **needs QA sign-off**.
> Companions: `QUOTES_POLICIES_OPEN_ISSUES.md`, `USER_MANAGEMENT_OPEN_ISSUES.md`, `USER_GROUP_OPEN_ISSUES.md`, `DAY1_QA_OPEN_ISSUES.md`, `CLIENT_MANAGEMENT_OPEN_ISSUES.md`.

**Count:** 21 fixed, 5 partly done (IP-11, 12, 24, 26, 28), 2 blocked (IP-03, IP-05).

---

## 1. Deploy steps (required)

| Script | What it does |
| --- | --- |
| `Backend/db/049_bound_transaction_type.sql` | Adds the `Bound` transaction type. Idempotent. |

**Run 049 before or with the API deploy.** Binding now records a history event that references this row. Without it, **every Bind fails**.

## 2. Root causes (P1)

Reproduced locally with temporary rows, and fixed. The local data doesn't contain real endorsed policies, so please confirm on QA.

| Cause | Issues | Fix |
| --- | --- | --- |
| Endorsements and rewrites share a Policy Number. Screens picked any non-Draft row without sorting, so an Active policy could open its old Inactive row. | IP-08, IP-16 | One resolver, `CurrentPolicyIdAsync` with `PolicyRules`. Listing, KPIs and all sub-screens use the same rule. |
| View Policy built a form with no `screenCode`, so the wizard's New Business default won. | IP-09, IP-10 | Identity and status are now always overlaid from the policy. |
| That form held about 30 fields even when the full submission existed. | IP-12 | View Policy loads the real submission. |
| Save on a misread policy sent status `Submitted` and rewrote the policy's status **and its account's type and names**. | IP-08, IP-16 | The sync skips issued policies entirely; the wizard doesn't call save for them. |
| History rows keep the status from when they were written (Active on a Cancelled policy). | IP-16 | Only the latest row shows a status: the policy's current one. |
| Issue, Bind and Issue Endorsement recorded no history or timeline events. | IP-17, IP-28 | They now do. Do Not Renew events now reach the Timeline too. |

**IP-11 ("Action" status):** no code path produces this as a status; "Action" only exists as a column heading. Fixes above remove the likely sources. If QA still sees it, the screenshot is needed.

### Also found and fixed
**Issuing swapped month and day.** A quote effective `11-07-2026` (7 Nov) became 11 Jul 2026 on the issued policy, because the date was read as DD-MM. This wasn't in the QA report. Endorsement drafts had the same code. Both now use `PolicyRules.ParseFormDate`.

Also fixed: the **Total** tile on the Policies list filtered the list down to nothing when clicked.

## 3. QA data check (read-only)

Existing data may already be damaged by the two bugs above. Nothing here changes data; decide on any repair once the results are in.

```sql
-- Issued policies with a status that shouldn't exist (for example 'Submitted').
SELECT id, policy_number, policy_status FROM policy
WHERE policy_type = 'POLICY'
  AND policy_status NOT IN ('Active','Bound','Cancelled','DONOTRENEW','Inactive','Lapsed','Expired');

-- Issued policies whose saved dates differ from what the wizard held (swapped month/day).
SELECT p.id, p.policy_number, p.effective_date, s.data->'form'->>'effectiveDate' AS form_effective
FROM policy p JOIN submissions s ON s.id = p.quote_number AND s.client_id = p.client_id
WHERE p.policy_type = 'POLICY'
  AND to_char(p.effective_date, 'MM-DD-YYYY') <> s.data->'form'->>'effectiveDate';

-- Stray submission rows created under a policy number by the old save.
SELECT s.id, s.status FROM submissions s JOIN policy p ON p.policy_number = s.id AND p.client_id = s.client_id
WHERE p.policy_type = 'POLICY';
```

## 4. Not done: blocked

| ID | Issue | What's needed |
| --- | --- | --- |
| IP-03 | Policy Number format | Today `HB-YYYY-NNNNNN`. Needs the OutSystems pattern or examples (Q3). |
| IP-05 | Download button | BA decision (Q9). Unchanged. |

## 5. Partly done

| ID | Done | Still open |
| --- | --- | --- |
| IP-11 | Likely sources removed | Screenshot if it persists |
| IP-12 | View Policy shows the full submission | List of "key details" (Q4); Policy Summary's information card is unchanged |
| IP-24 | Policy Information added to Billing using the existing card | Field list from OutSystems (Q4) |
| IP-26 | Icons on the four tiles | They're Lucide placeholders; needs OutSystems assets |
| IP-28 | Events recorded; screen shows them | Layout, event types and filters not compared with OutSystems (Q8). **Policies issued before this change stay empty** (no backfill, decision 04-Nov). CM-19 not touched. |

## 6. Decisions and defaults

| Item | Status | Behaviour |
| --- | --- | --- |
| IP-01 (Q1, Q2) | Decided 04-Nov | Today + 3 calendar days in the user's local time, still editable. Replaces QP-12's "today". |
| IP-19, IP-27 (Q7) | Decided 04-Nov | Notes Add, edit and delete are removed for **Producers only**, and rejected by the server. Producers still read notes. Staff unchanged. |
| IP-07 | Decided 04-Nov | Bound records appear in Policies and on the tile, showing their quote ID until issued. They also stay in the NB register. |
| IP-28 | Decided 04-Nov | Record events going forward; no backfill. |
| Q5 | Default | Other roles keep all four Tools options. |
| Q6 | Default | Overdue = days since the oldest unpaid instalment's due date. Hidden when nothing is overdue. |
| Q10 | Default | Tiles: Total, Active, Bound, Cancelled, Do Not Renew. No code sets Lapsed or Expired; any existing rows still count in Total. |
| IP-14 | Default | One decimal, share of the chart's total. **Please check this reading:** Written, Billed, Paid and Due overlap, so a fresh policy shows 33.3% three times. |

## 7. Side effects worth telling QA about

- **Clicking a row** in the Policies list now opens Policy Summary (it used to open the quote wizard at Plans Overview). A Bound quote is still issued from the New Business register.
- **After a rewrite**, the list shows one row (the live one). The Cancelled version is no longer listed separately.
- **Claims and History** on Policy Summary now gather across all versions of a policy.
- **Cancel Policy** acts on the current policy row, not the newest row of any kind.
- **Policy view mode** no longer fills blank limits with sample values such as `5577`. Endorsement and renewal drafts still use those defaults, as before.
- **Action column:** first in the Summary's Pending and History tables. In the Policies list the row number and checkbox still come before it, matching the other registers.
- **Saves on read-only records** no longer call the API; Save and Next just move on.
- **Contacts** still list additional insureds only. The primary insured isn't a contact row.

## 8. Verification

- [x] `dotnet test`: 203 pass, 2 skipped (new `PolicyRulesTests`, `ProducerForbiddenAttributeTests`). `tsc`, `npm run build`.
- [x] API with temporary rows, since removed: Inactive + Active, Cancelled + Active + Draft, Bound and Do Not Renew each give one row and matching list, KPIs, Summary and View Policy.
- [x] A stray save on an issued policy leaves its status and account unchanged.
- [x] Real API flow, create → save → payment plan → bind → issue: Bound tile counts it; afterward number, status, dates, address, history and timeline are right.
- [x] Temporary Producer login: cancel, cancel-rewrite, Do Not Renew, remove Do Not Renew, note create and delete return 403. Reads work. Endorse isn't blocked by the filter (reached its own status check).
- [x] Browser as Producer: list, tiles, eye icon, Tools shows only Endorse, no Notes Add, View Policy reads "Policy ID", Billing card and tiles.
- [x] Browser as staff: all Tools options, Notes Add, overdue message, percentages, phone format, Effective Date = today + 3.
- [ ] **Not run end to end:** issuing an Endorsement, Renewal, Cancel and Cancel/Rewrite after these changes. Their event and resolver code is covered only by unit tests and reading the code. Please include them in QA regression.
- [ ] Modify Columns toggles, long-address tooltip and IP-13 alignment weren't clicked through individually.
- [ ] Run the §3 checks on QA.

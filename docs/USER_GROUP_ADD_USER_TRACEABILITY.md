# User Group Management – Add User Traceability

## Source note

The uploaded attachments contained repeated copies of the implementation brief, but did not contain the named
`USER_GROUP_MANAGEMENT_ADD_USER_PRD.md` or `USER_GROUP_MANAGEMENT_ADD_USER_BACKEND_PRD.md` documents. The mappings
below therefore use the explicit brief, supplied screenshots, and the existing InsureEdge architecture. No
undocumented persona-specific fields or database model were invented.

| Requirement ID | Requirement | Frontend file | Backend file | Implementation status | Test status |
|---|---|---|---|---|---|
| FE-01 | Display `+ Add User` beside the Group Members search box | `GroupMembersPanel.tsx` | — | IMPLEMENTED | Production build + source assertion passed |
| FE-02 | Open an `Add User To Group` modal | `GroupMembersPanel.tsx` | — | IMPLEMENTED | Source assertion passed |
| FE-03 | Load active users available to the authenticated tenant | `AddGroupPage.tsx`, `auth.ts` | `AuthController.cs`, `UserRepository.cs` | ALREADY IMPLEMENTED | Backend suite passed |
| FE-04 | Show name, email, initials, selected state and selected total | `GroupMembersPanel.tsx` | `AuthDtos.cs` | IMPLEMENTED | Typecheck/build passed |
| FE-05 | Search by name or email, case-insensitively | `groupMembers.ts`, `GroupMembersPanel.tsx` | — | IMPLEMENTED | Focused test passed |
| FE-06 | Sort alphabetically or by creation date | `groupMembers.ts`, `GroupMembersPanel.tsx`, `User.ts` | `AuthDtos.cs`, `UserRepository.cs` | IMPLEMENTED | Focused test passed |
| FE-07 | Stage multi-selection and prevent duplicate IDs | `groupMembers.ts`, `GroupMembersPanel.tsx` | `GroupService.cs`, `GroupRepository.cs` | IMPLEMENTED | Frontend and backend tests passed |
| FE-08 | Save commits modal selection; Cancel, Close, backdrop and Escape discard it | `GroupMembersPanel.tsx` | — | IMPLEMENTED | Source assertion + production build passed |
| FE-09 | Show loading, load failure, empty and no-search-result states | `AddGroupPage.tsx`, `GroupMembersPanel.tsx` | — | IMPLEMENTED | Typecheck/build passed |
| FE-10 | Submit selected member IDs as part of atomic group creation and navigate to group detail | `AddGroupPage.tsx`, `groups.ts` | `GroupsController.cs`, `GroupService.cs`, `GroupRepository.cs` | ALREADY IMPLEMENTED | Backend suite passed; no live write performed |
| BE-01 | Authenticate requests and enforce Add/Edit group permission | — | `GroupsController.cs`, `PermissionAttribute.cs` | ALREADY IMPLEMENTED | Existing permission tests passed in suite |
| BE-02 | Scope groups and users to the session client/organization | — | `CurrentTenantService.cs`, `GroupService.cs`, `GroupRepository.cs`, `UserRepository.cs` | IMPLEMENTED | Client/Producer claim-context test passed |
| BE-03 | Reject inactive, unknown or cross-tenant group leaders | — | `GroupService.cs`, `GroupRepository.cs` | IMPLEMENTED | Unit test passed |
| BE-04 | Reject inactive, unknown or cross-tenant members | — | `GroupService.cs`, `GroupRepository.cs`, `GroupsController.cs` | IMPLEMENTED | Unit test passed |
| BE-05 | Prevent duplicate membership in payload and under concurrent requests | `groupMembers.ts` | `GroupService.cs`, `GroupRepository.cs`, existing `(group_id,user_id)` unique key | IMPLEMENTED | Frontend/backend tests passed |
| BE-06 | Validate group ownership before member replacement | — | `GroupService.cs`, `GroupRepository.cs` | ALREADY IMPLEMENTED | Existing and new tests passed |
| BE-07 | Persist group, members and permissions transactionally | — | `GroupRepository.cs` | ALREADY IMPLEMENTED | Backend suite passed |
| DB-01 | Reuse existing group/user relationship and uniqueness constraint | — | `InsureEdgeDbContext.cs`, existing schema | ALREADY IMPLEMENTED | Model/build verified; no migration required |
| PERSONA-01 | Client and Producer sessions use their claim-derived tenant and permission set | Shared UI | `CurrentTenantService.cs`, `PermissionAttribute.cs`, `GroupService.cs` | IMPLEMENTED | Both persona claim-context cases passed |
| PERSONA-02 | Any additional PRD-specific Client-vs-Producer field/option differences | — | — | BLOCKED | Named PRD documents were not supplied |
| QA-01 | Interactive browser verification for both personas | — | — | BLOCKED | Browser automation host unavailable; manual steps documented in final report |

## Database decision

No migration is required. `group_user` already has a composite primary/unique key on `(group_id, user_id)`, foreign
keys to the group and user tables, and tenant data on the association. No migration or write was executed against the
configured database during implementation or verification.

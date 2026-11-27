import type { UserSelectDto } from '../../types/User';

export type MemberSort = 'alphabetical' | 'creationDate';

export function normalizeMemberIds(ids: number[]): number[] {
  return Array.from(new Set(ids.filter(id => Number.isSafeInteger(id) && id > 0)));
}

export function filterAndSortMembers(
  users: UserSelectDto[], search: string, sort: MemberSort,
): UserSelectDto[] {
  const query = search.trim().toLocaleLowerCase();
  const filtered = query
    ? users.filter(user =>
        user.fullName.toLocaleLowerCase().includes(query)
        || user.email.toLocaleLowerCase().includes(query))
    : [...users];

  return filtered.sort((left, right) => {
    if (sort === 'creationDate') {
      const leftCreated = left.createdOn ? Date.parse(left.createdOn) : left.id;
      const rightCreated = right.createdOn ? Date.parse(right.createdOn) : right.id;
      return rightCreated - leftCreated;
    }
    return left.fullName.localeCompare(right.fullName, undefined, { sensitivity: 'base' });
  });
}

export function toggleMember(ids: number[], id: number): number[] {
  const normalized = normalizeMemberIds(ids);
  return normalized.includes(id)
    ? normalized.filter(existing => existing !== id)
    : [...normalized, id];
}

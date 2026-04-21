import { apiRequest } from '../config/api';

interface PaginatedResponse<T> {
  items: T[];
  total: number;
}

export async function fetchAllPaginatedItems<T>(
  buildUrl: (skip: number, limit: number) => string,
  pageSize: number = 100,
): Promise<T[]> {
  const items: T[] = [];
  let skip = 0;
  let total = Number.POSITIVE_INFINITY;

  while (items.length < total) {
    const response = await apiRequest<PaginatedResponse<T>>(buildUrl(skip, pageSize));
    if (response.error) {
      throw new Error(response.error);
    }

    const currentItems = response.data?.items ?? [];
    total = response.data?.total ?? currentItems.length;
    items.push(...currentItems);

    if (currentItems.length < pageSize) {
      break;
    }

    skip += pageSize;
  }

  return items;
}

export async function fetchAllListItems<T>(
  buildUrl: (skip: number, limit: number) => string,
  pageSize: number = 100,
): Promise<T[]> {
  const items: T[] = [];
  let skip = 0;

  while (true) {
    const response = await apiRequest<T[]>(buildUrl(skip, pageSize));
    if (response.error) {
      throw new Error(response.error);
    }

    const currentItems = response.data ?? [];
    items.push(...currentItems);

    if (currentItems.length < pageSize) {
      break;
    }

    skip += pageSize;
  }

  return items;
}

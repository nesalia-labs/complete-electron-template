# TanStack Query Expert Sub-agent

**Purpose:** Deep expertise in TanStack Query for React applications - queries, mutations, caching, invalidation, and integration patterns.

---

## Documentation Sources

### Official Documentation
- **URL:** https://tanstack.com/query/latest
- **API Docs:** https://tanstack.com/query/latest/reference/query-functions
- **React Docs:** https://tanstack.com/query/latest/react/overview
- **Migration Guide:** https://tanstack.com/query/latest/react/guides/migrating-to-react-query

### Fetch Documentation Pattern
```bash
fresh fetch https://tanstack.com/query/latest/react/{page}
```

---

## Version Tracking

**Current Version:** Check via `npm ls @tanstack/react-query` or [npm registry](https://www.npmjs.com/package/@tanstack/react-query)

**Key Recent Changes:**
- v5.90+ : Optimized caching and memory management improvements
- v5.50+ : Streaming support and improved SSR integration
- v5.30+ : New `useSuspenseQuery` and `useSuspenseInfiniteQuery`
- v5.20+ : `QueryObserver` refactoring for better reactivity
- v5.0 : Major rewrite with different API patterns than v4

---

## Core Concepts

### Query Basics
```tsx
import { useQuery } from '@tanstack/react-query'

function UserProfile({ userId }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['user', userId],
    queryFn: async () => {
      const res = await fetch(`/api/users/${userId}`)
      if (!res.ok) throw new Error('Failed to fetch user')
      return res.json()
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000,   // 10 minutes (formerly cacheTime)
  })
}
```

### Mutation Basics
```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query'

function CreateUser() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (newUser) => fetch('/api/users', {
      method: 'POST',
      body: JSON.stringify(newUser)
    }),
    onSuccess: () => {
      // Invalidate and refetch users list
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })
}
```

### Query Invalidation Patterns
```tsx
// Invalidate all queries starting with 'posts'
queryClient.invalidateQueries({ queryKey: ['posts'] })

// Exact match
queryClient.invalidateQueries({ queryKey: ['posts', 1] })

// Using predicate for complex invalidation
queryClient.invalidateQueries({
  predicate: (query) =>
    query.queryKey.some(key => key.startsWith('users'))
})
```

---

## How-to Guides (Personal Notes)

### Setup with TanStack Start / SSR
```tsx
// In TanStack Start router setup
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

function App() {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000, // 1 minute in SSR
        gcTime: 1000 * 60 * 10, // 10 minutes
      },
    },
  }))

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider />
    </QueryClientProvider>
  )
}
```

### Optimistic Updates
```tsx
const updateTodo = useMutation({
  mutationFn: ({ id, text }) => api.updateTodo(id, text),
  onMutate: async ({ id, text }) => {
    await queryClient.cancelQueries({ queryKey: ['todos'] })
    const previous = queryClient.getQueryData(['todos'])

    queryClient.setQueryData(['todos'], (old) =>
      old.map(todo => todo.id === id ? { ...todo, text } : todo)
    )

    return { previous }
  },
  onError: (err, vars, context) => {
    queryClient.setQueryData(['todos'], context.previous)
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ['todos'] })
  },
})
```

### Infinite Queries
```tsx
const {
  data,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
} = useInfiniteQuery({
  queryKey: ['posts'],
  queryFn: ({ pageParam = 0 }) => fetchPosts(pageParam),
  initialPageParam: 0,
  getNextPageParam: (lastPage, allPages) =>
    lastPage.hasMore ? allPages.length : undefined,
})
```

### Parallel Queries
```tsx
// With useQuery
const usersQuery = useQuery({ queryKey: ['users'], queryFn: fetchUsers })
const postsQuery = useQuery({ queryKey: ['posts'], queryFn: fetchPosts })

// With useQueries for dynamic parallel
const results = useQueries({
  queries: ids.map(id => ({
    queryKey: ['user', id],
    queryFn: () => fetchUser(id),
  }))
})
```

### Dependent Queries
```tsx
const userQuery = useQuery({
  queryKey: ['user', userId],
  queryFn: fetchUser,
})

const postsQuery = useQuery({
  queryKey: ['posts', userId],
  queryFn: fetchPosts,
  enabled: !!userQuery.data, // Only fetch when user is loaded
})
```

---

## Project Rules (Taste)

1. **Always use `staleTime`**: Set appropriate `staleTime` to avoid unnecessary refetches (e.g., `5 * 60 * 1000` for 5 minutes)

2. **Use `gcTime` not `cacheTime`**: `cacheTime` was renamed in v5, use `gcTime`

3. **Prefer `queryKey` arrays**: `['users', userId]` is better than `['user', { id: userId }]` for invalidation patterns

4. **Use `enabled` for dependent queries**: Don't manually check `isLoading`, use `enabled` option

5. **Handle `error` state**: Always display error states to users, not just loading

6. **Optimistic updates for mutations**: When updating lists, use optimistic updates for better UX

7. **Use `select` for data transformation**: Don't transform data in `queryFn`, use `select` option
```tsx
// Good
const { data } = useQuery({
  queryKey: ['users'],
  queryFn: fetchUsers,
  select: (users) => users.filter(u => u.active)
})
```

8. **Separate query functions**: Keep `queryFn` pure and separate from transformation logic

9. **Use TypeScript generics**: Specify expected data types for better type inference
```tsx
const { data } = useQuery<User[]>({ ... })
```

10. **Don't overuse `refetchOnMount`**: Let TanStack Query's default caching handle refetching

---

## Common Patterns Quick Reference

| Pattern | When to Use |
|---------|-------------|
| `useQuery` | Single data fetch, read-only |
| `useMutation` | Write operations (create/update/delete) |
| `useInfiniteQuery` | Paginated lists |
| `useQueries` | Multiple parallel independent queries |
| `useQueryClient` | Manual cache manipulation |
| `queryKey` arrays | Grouping related queries for batch invalidation |

---

## Troubleshooting

**Query not refetching:** Check `staleTime` and `gcTime` - if data isn't stale, won't refetch.

**Memory leaks:** Ensure components unmount properly - cancel queries in `useEffect` cleanup if needed.

**Stale data after mutation:** Remember to `invalidateQueries` in `onSuccess`.

**TypeScript errors:** Make sure `queryKey` and return type match expected data shape.
# API Client Documentation

## Overview

The `api.ts` module provides a centralized HTTP client for communicating with the NUVORA backend API. It handles authentication, error handling, retries, and provides type-safe API calls.

## Usage

### Basic Requests

```typescript
import { api } from "@/lib/api";

// GET request
const projects = await api.get<Project[]>("/api/projects");

// POST request with body
const newProject = await api.post<Project>("/api/projects", {
  name: "My Project",
  goal: "Build something amazing"
});

// PATCH request
const updated = await api.patch<Project>(`/api/projects/${id}`, {
  name: "Updated Name"
});

// DELETE request
await api.delete(`/api/projects/${id}`);
```

### Authentication

The API client sends the HttpOnly session cookie automatically and adds a signed double-submit CSRF token to state-changing requests. JavaScript never receives the session token.

```typescript
// Login sets the HttpOnly session cookie. Use /api/auth/me to check the session.
const user = await api.get<User>("/api/auth/me");
// Logout revokes the server session and expires its cookie.
await api.post("/api/auth/logout");
```

### Error Handling

The API client provides specific error types for different scenarios:

```typescript
import { api, ApiError, AuthenticationError, ValidationError, NetworkError } from "@/lib/api";

try {
  const data = await api.get("/api/projects");
} catch (error) {
  if (error instanceof AuthenticationError) {
    // User needs to log in - session is invalid or expired
    router.push("/login");
  } else if (error instanceof ValidationError) {
    // Bad request - show validation errors to user
    console.error("Validation errors:", error.details);
  } else if (error instanceof NetworkError) {
    // Network failure - show retry option
    console.error("Network error:", error.message);
  } else if (error instanceof ApiError) {
    // Other API error (403, 404, 500, etc.)
    console.error(`API error ${error.status}:`, error.message);
  }
}
```

### Advanced Options

```typescript
// Disable authentication for public endpoints
const publicData = await api.get("/api/public/profile", { auth: false });

// Custom headers
await api.post("/api/upload", formData, {
  headers: { "Content-Type": "multipart/form-data" }
});

// Abort signal for cancellation
const controller = new AbortController();
const promise = api.get("/api/projects", { signal: controller.signal });
// Later: controller.abort();

// Custom retry count
await api.post("/api/critical-action", data, { retries: 0 }); // No retries
```

### Health Check

```typescript
import { checkApiHealth } from "@/lib/api";

const isHealthy = await checkApiHealth();
if (!isHealthy) {
  console.warn("Backend API is not responding");
}
```

## Error Types

| Error Class | HTTP Status | Description |
|------------|-------------|-------------|
| `AuthenticationError` | 401 | Token invalid/expired - redirects to login |
| `ValidationError` | 400, 422 | Request validation failed |
| `ApiError` | 403 | Permission denied |
| `ApiError` | 404 | Resource not found |
| `ApiError` | 429 | Rate limited |
| `ApiError` | 500+ | Server error |
| `NetworkError` | N/A | Network failure or timeout |

## Configuration

### Environment Variables

Create a `.env.local` file in the client directory:

```env
NEXT_PUBLIC_API_URL=http://127.0.0.1:4117
```

For production:
```env
NEXT_PUBLIC_API_URL=https://api.nuvora.com
```

### Session Security

The API sets an `HttpOnly`, `Secure`, `SameSite=None` session cookie. The browser client uses `credentials: "include"`; state-changing requests carry a signed CSRF token. Production deployments must serve the API over HTTPS.

## Retry Logic

The client automatically retries requests with exponential backoff:
- **Retries**: Network errors and 5xx server errors
- **No Retries**: 4xx client errors (except 429 rate limiting)
- **Backoff**: 1s, 2s, 4s (exponential)
- **Max Retries**: 2 by default (configurable)

## Integration with React

### Using with useEffect

```typescript
useEffect(() => {
  let cancelled = false;
  
  api.get<Project[]>("/api/projects")
    .then(data => {
      if (!cancelled) setProjects(data);
    })
    .catch(error => {
      if (!cancelled) setError(error);
    });
  
  return () => { cancelled = true; };
}, []);
```

### Using with SWR (Recommended)

For future implementation, consider integrating with SWR:

```typescript
import useSWR from "swr";
import { api } from "@/lib/api";

function useProjects() {
  return useSWR("/api/projects", (url) => api.get<Project[]>(url));
}
```

## Migration Notes

This API client replaces all localStorage-based data operations. Each module should:

1. Import the API client: `import { api } from "@/lib/api"`
2. Replace localStorage reads with API GET calls
3. Replace localStorage writes with API POST/PATCH/DELETE calls
4. Handle loading states and errors appropriately
5. Remove seed data and mock data generators

## Backend API Endpoints

Refer to the backend documentation for available endpoints:
- `/api/auth/*` - Authentication
- `/api/projects` - Project management
- `/api/projects/{id}/evidence` - Evidence tracking
- `/api/projects/{id}/tasks` - Task management
- `/api/marketplace/*` - Task marketplace
- `/api/publications` - Publishing system

See `server/src/api/routes/` for complete API documentation.

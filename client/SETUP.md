# Nuvora Frontend - Backend Integration Setup

## Prerequisites

1. **Backend Running**: The backend API must be running at `http://127.0.0.1:4117`
   ```powershell
   cd d:\projects\nuvora\server
   .\venv\Scripts\Activate.ps1
   $env:PYTHONPATH="src"
   uvicorn api.app:app --host 127.0.0.1 --port 4117 --reload
   ```

2. **Node.js**: Ensure Node.js is installed

## Setup Steps

### 1. Install Dependencies

```powershell
cd d:\projects\nuvora\client\NUVORA
npm install
```

### 2. Environment Configuration

The `.env.local` file has been created with:
```
NEXT_PUBLIC_API_URL=http://127.0.0.1:4117
```

This tells the frontend where to find the backend API.

### 3. Start the Frontend

```powershell
npm run dev
```

The frontend will start at `http://localhost:3000`

## What's Changed

### Files Created:
1. **`.env.local`** - Environment configuration with API URL
2. **`lib/api-client.ts`** - Complete API client for backend communication
3. **This file** - Setup documentation

### Files Modified:
1. **`lib/auth.ts`** - Now uses real API instead of localStorage mock

## API Integration

The `api-client.ts` provides a complete client for all backend endpoints:

```typescript
import { api } from '@/lib/api-client';

// Authentication
await api.auth.signup({ name, email, password });
await api.auth.login({ email, password });
await api.auth.logout();

// Projects
await api.projects.list();
await api.projects.create({ name, goal, users, stage });
await api.projects.update(id, { stage: "Build" });

// Evidence
await api.evidence.list(projectId);
await api.evidence.create(projectId, { type, text, source, provenance, stage });
await api.evidence.togglePublic(evidenceId);

// Blockers
await api.blockers.list(projectId);
await api.blockers.create(projectId, title);
await api.blockers.resolve(blockerId, solution);

// And more...
```

## Current Status

✅ **Implemented:**
- API client with all endpoints
- Authentication (signup, login, logout)
- Token management
- Error handling

⏳ **To Do:**
- Update remaining lib files (store.ts, data.ts, tasks.ts, design.ts, publish.ts) to use API
- Test all endpoints
- Handle edge cases and errors
- Implement GitHub OAuth flow

## Testing the Connection

1. Ensure backend is running: http://127.0.0.1:4117/healthz
2. Start the frontend: http://localhost:3000
3. Try signing up with a new account
4. Check the browser console and network tab for API calls

## Troubleshooting

### CORS Errors
The backend is configured with CORS for `localhost:3000`. If you see CORS errors:
- Check that the backend `.env` has: `NUVORA_CORS_ORIGINS=http://localhost:3000`
- Restart the backend server

### Connection Refused
- Verify the backend is running at port 4117
- Check the `.env.local` file has the correct API URL

### Authentication Issues
- Clear browser localStorage: Open DevTools → Application → Local Storage → Clear
- Check backend logs for errors

## Integration status

Authentication, project CRUD, evidence and blocker flows, tasks, designs,
decisions, publish drafts, publishing, and public snapshot loading use the
FastAPI endpoints. The client translates the UI's stage labels to the API's
canonical stage names.

GitHub repository sync still needs its OAuth authorize/callback flow wired into
the UI. The guided coding workspace and its scratch files remain browser-local.

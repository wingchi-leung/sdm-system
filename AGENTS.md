# SDM System - Agent Guidelines

This document provides essential information for AI coding agents working on the SDM (活动报名/签到) system.

## Project Overview

SDM is a multi-platform event registration and check-in system consisting of:
- **backend**: FastAPI + MySQL REST API
- **frontend**: React management dashboard (web)
- **miniprogram**: WeChat mini-program (user-facing)
- **event_app**: Flutter mobile app (user-facing)

---

## Build, Run, and Test Commands

### Backend (FastAPI/Python)

**Environment Setup:**
```bash
cd backend
uv venv
uv sync
```

**Run Development Server:**
```bash
cd backend
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Alternative (without uv):**
```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Testing:** No automated test suite currently. Test APIs manually via FastAPI Swagger UI at `http://localhost:8000/docs`.

**Linting:** No explicit lint command configured. Follow PEP 8 and use `ruff` or `black` if needed.

### Frontend (React/TypeScript)

**Install Dependencies:**
```bash
cd frontend
npm install
```

**Run Development Server:**
```bash
cd frontend
npm start
```

**Build for Production:**
```bash
cd frontend
npm run build
```

**Run Tests:**
```bash
cd frontend
npm test
```

**Run Single Test File:**
```bash
cd frontend
npm test -- --testPathPattern=App.test.tsx
```

**Run Single Test (watch mode disabled):**
```bash
cd frontend
npm test -- --watchAll=false --testPathPattern=App.test.tsx
```

**Linting:** Uses ESLint with `react-app` and `react-app/jest` configurations.

### Flutter App (event_app)

**Install Dependencies:**
```bash
cd event_app
flutter pub get
```

**Run Development (Web/Desktop/Mobile):**
```bash
cd event_app
flutter run
```

**Build for Production:**
```bash
flutter build web
flutter build apk
flutter build ios
```

**Run Tests:**
```bash
cd event_app
flutter test
```

**Run Single Test File:**
```bash
cd event_app
flutter test test/path/to/test_file_test.dart
```

**Linting:**
```bash
cd event_app
flutter analyze
```

### WeChat Mini-Program

**Running:** Use WeChat Developer Tools to import and run the `miniprogram/` directory. No command-line build/test process.

---

## Code Style Guidelines

### Backend (Python/FastAPI)

**Imports:**
- Standard library imports first
- Third-party imports second (FastAPI, SQLAlchemy, Pydantic, etc.)
- Local imports last
- Use absolute imports from `app.` prefix

**Example:**
```python
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.api import deps
from app.core.config import settings
from app.crud import crud_user
```

**Naming Conventions:**
- Functions/variables: `snake_case`
- Classes: `PascalCase`
- Constants: `UPPER_SNAKE_CASE`
- Files/modules: `snake_case.py`
- Pydantic models: Suffix with `Request` or `Response` when used for API schemas

**Type Hints:** Always use type hints for function parameters and return values.

```python
def get_user(db: Session, user_id: int) -> Optional[User]:
    ...
```

**Error Handling:**
- Raise `HTTPException` for API errors with appropriate status codes
- Use try-except for external calls (database, HTTP requests)
- Log errors using `logging` module

```python
from fastapi import HTTPException

if not user:
    raise HTTPException(status_code=404, detail="User not found")
```

**Database Models:**
- Inherit from `Base` (SQLAlchemy declarative base)
- Use `Column` with explicit types and constraints
- Add indexes for frequently queried fields

**Dependency Injection:**
- Use FastAPI's `Depends()` for database sessions and authentication

```python
@router.get("/users/me")
def get_current_user(
    db: Session = Depends(deps.get_db),
    current_user = Depends(deps.get_current_user)
):
    ...
```

### Frontend (React/TypeScript)

**Imports:**
- React imports first
- Third-party libraries second
- Local components/utilities last
- Use path alias `@/` for imports from `src/`

**Example:**
```typescript
import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { apiRequest } from '@/config/api';
```

**Naming Conventions:**
- Components: `PascalCase` (e.g., `CreateActivity.tsx`)
- Functions/variables: `camelCase`
- Constants: `UPPER_SNAKE_CASE` or `camelCase` for config objects
- CSS classes: Use Tailwind utility classes

**TypeScript:**
- Strict mode enabled
- Define interfaces/types for all data structures
- Use `interface` for object shapes, `type` for unions/aliases

```typescript
interface User {
  id: number;
  name: string;
  phone: string;
}

type UserRole = 'admin' | 'user';
```

**React Patterns:**
- Use functional components with hooks
- Prefer arrow functions for components
- Use `useState`, `useEffect` for state management

```typescript
const MyComponent: React.FC = () => {
  const [data, setData] = useState<User[]>([]);
  
  useEffect(() => {
    fetchData();
  }, []);
  
  return <div>...</div>;
};
```

**Error Handling:**
- Use try-catch in async functions
- Display user-friendly error messages via toast notifications
- Check for `response.error` from API calls

```typescript
try {
  const response = await apiRequest(API_PATHS.users.list);
  if (response.error) {
    throw new Error(response.error);
  }
} catch (error) {
  toast({
    title: "Error",
    description: "Operation failed",
    variant: "destructive"
  });
}
```

### Flutter (Dart)

**Imports:**
- Dart/Flutter SDK imports first
- Package imports second
- Relative imports last

**Naming Conventions:**
- Classes: `PascalCase`
- Variables/functions: `camelCase`
- Constants: `lowerCamelCase` (Dart convention)
- Files: `snake_case.dart`

**Code Style:**
- Use `const` constructors for immutable widgets
- Prefer composition over inheritance
- Use `final` for variables that don't change

**Example:**
```dart
class UserCard extends StatelessWidget {
  final User user;
  
  const UserCard({super.key, required this.user});
  
  @override
  Widget build(BuildContext context) {
    return Card(child: Text(user.name));
  }
}
```

### WeChat Mini-Program

**File Structure:**
- Each page has 4 files: `.js`, `.wxml`, `.wxss`, `.json`
- Utils in `utils/` directory

**Naming:**
- Page directories: `kebab-case` (e.g., `activity-detail`)
- JavaScript: `camelCase`
- WXML attributes: `kebab-case`

**Async Operations:**
- Use `wx.request()` or wrapped API calls from `utils/api.js`
- Handle callbacks with success/fail/complete

---

## Key Architecture Patterns

### Authentication
- Backend: JWT tokens with role-based access (`admin` or `user`)
- Frontend/App: Store token in localStorage/SharedPreferences
- Include `Authorization: Bearer <token>` header for protected routes

### API Structure
- Base URL: `http://localhost:8000/api/v1` (development)
- Authentication: `/auth/login` (admin), `/auth/user-login` (user)
- Activities: `/activities/`
- Participants: `/participants/`
- Check-ins: `/checkins/`
- Users: `/users/`

### Database
- MySQL 8 with SQLAlchemy ORM
- Key tables: `activity`, `activity_participants`, `checkin_records`, `user`, `admin_user`
- Blacklist system: `user.isblock = 1`

---

## Environment Configuration

### Backend (.env)
```env
MYSQL_HOST=localhost
MYSQL_USER=root
MYSQL_PASSWORD=yourpassword
MYSQL_DB=sdm_db
MYSQL_PORT=3306
JWT_SECRET=change-me-in-production
WECHAT_APPID=optional
WECHAT_SECRET=optional
```

### Frontend (src/config/api.ts)
```typescript
const API_BASE_URL = 'http://localhost:8000/api/v1';
```

### Flutter (lib/services/api_service.dart)
```dart
static const String baseUrl = 'http://localhost:8000/api/v1';
```

---

## Important Notes

1. **No Comments in Code**: Follow the codebase convention of minimal comments unless specifically requested
2. **Testing**: Backend lacks automated tests; frontend has minimal test setup
3. **Production Deployment**: Update `JWT_SECRET`, use HTTPS, configure CORS properly
4. **WeChat Login**: Requires backend `WECHAT_APPID` and `WECHAT_SECRET` configuration
5. **Database Migrations**: Use SQLAlchemy's `Base.metadata.create_all()` or manual SQL scripts in `backend/table.sql`
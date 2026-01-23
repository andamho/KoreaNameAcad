# Korean Name School (한국이름학교)

## Overview

Korean Name School is a web application that provides professional Korean name analysis and naming services. The platform allows users to understand the meaning and significance of their names, request new names, and receive expert consultations. The application features a modern, culturally-respectful design that honors Korean naming traditions while maintaining contemporary accessibility.

**Key Pages:**
- **Home (/)** - Landing page with hero, services overview, consultation forms, and key sections (danger, value, intro, steps, myth/truth, pricing)
- **Instagram Home (/ig)** - Instagram in-app browser optimized version with canonical tag pointing to `/`, includes `ua-instagram` class for font size reduction
- **TikTok Home (/tt)** - TikTok in-app browser optimized version with canonical tag pointing to `/`, includes `ua-tiktok` class for font size reduction
- **Services (/services)** - Detailed service descriptions (name analysis, naming/renaming, family comprehensive analysis) with pricing and process steps
- **Pricing (/pricing)** - Dedicated pricing page featuring consultation fees, time requirements, and additional services (phone/passport/vehicle number changes)
- **Reviews (/reviews)** - Dedicated testimonials page featuring two sections: "이름분석 상담후기" (Name Analysis Reviews) and "개명 후기" (Name Change Reviews), with link to full reviews on Naver blog
- **Detail Info (/detail-info)** - Additional information pages
- **Family Policy (/family-policy)** - Family-related policy information
- **Name Stories (/name-stories)** - Blog-style page "재미있는 이름이야기" with responsive grid layout (4→1 columns) showing story cards with thumbnails, video badge support
- **Name Story Detail (/name-stories/:id)** - Individual story page with content display, YouTube video embed support, and share functionality
- **Admin (/admin)** - Administrative dashboard with tabbed interface for managing consultations and name stories (create/edit/delete)

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & Build System**
- React with TypeScript for type-safe component development
- Vite as the build tool and development server, configured with custom aliasing for clean imports
- Wouter for lightweight client-side routing (multi-page application)
- Icon-based navigation with overlay menu system (mobile and desktop)

**UI Component System**
- shadcn/ui component library with Radix UI primitives for accessible, customizable components
- Tailwind CSS for utility-first styling with custom design tokens
- Custom theme system supporting light and dark modes with HSL color variables
- Pretendard font for Korean typography with Inter as fallback
- Noto Sans KR font for navbar branding (via Google Fonts)

**State Management & Data Fetching**
- TanStack Query (React Query) for server state management and caching
- React Hook Form with Zod for form validation and type-safe form handling
- Custom hooks for mobile detection and toast notifications

**Design System**
- Reference-based design inspired by Headspace and Calm
- Custom color palette featuring traditional Korean blue (primary), warm earth tones (secondary), and soft coral (accent)
- Responsive layout system using Tailwind spacing primitives
- Component library includes Hero sections, Service cards, Testimonial cards, and Story cards
- Sophisticated menu overlay system with icon-based navigation (Lucide React icons)
- Mobile-first responsive design with optimized layouts for all screen sizes

**In-App Browser Optimization**
- Route separation strategy for Instagram (`/ig`) and TikTok (`/tt`) in-app browsers
- **Modal Back Button Navigation**: Uses `history.pushState()` instead of `window.location.hash` for reliable back button support
  - Pattern: `history.pushState({ modal: 'consultation' }, '', newUrl)` to add history entry without triggering hashchange event
  - URL hashes: `#consultation`, `#familyPolicy`, `#analysisDetail` for modal state tracking
  - Both `popstate` and `hashchange` events monitored for maximum browser compatibility
  - Refs updated before state to ensure correct values during event handler execution
  - `isClosingFromBackButton` flag prevents duplicate `history.back()` calls
- **일관성 규칙**: 모든 섹션은 동일한 구조를 사용해야 함
  - 캐릭터: 래퍼 div 안에 absolute 배치, 섹션 컴포넌트 외부
  - padding-top: 컴포넌트 자체에는 없고, CSS `.ig-shell` 규칙으로 213px 통일 적용
  - margin-bottom: CSS `.ig-shell` 규칙으로 -50% 통일 적용
  - padding-bottom: CSS `.ig-shell` 규칙으로 0 통일 적용
- `.ig-shell` 래퍼 클래스로 네비게이션 후에도 CSS 유지 (html 셀렉터 대신 사용)
- `text-size-adjust: none` to disable browser text autosizing
- JavaScript-enforced font sizes to override in-app browser text inflation
- Hero container max-width (640px) to reduce autosizing triggers
- Font size: h1 max 34px, p max 21px via clamp() + JS setProperty with 'important' flag
- Multiple setTimeout intervals (100ms, 300ms, 500ms, 1000ms) to counter browser re-inflation
- Canonical tags pointing to main homepage (`/`) to avoid SEO duplicate content issues
- CDN-friendly caching with separate URL paths for platform-specific optimizations
- Korean text optimization with `word-break: keep-all` and `overflow-wrap: anywhere`

### Backend Architecture

**Server Framework**
- Express.js running on Node.js with TypeScript
- RESTful API architecture with route separation
- Custom middleware for request logging and error handling

**Data Layer**
- In-memory storage implementation (MemStorage) for development
- Drizzle ORM configured for PostgreSQL (ready for production database)
- Schema-driven data validation using Zod
- UUID-based entity identification

**API Endpoints**
- POST `/api/consultations` - Create new consultation requests (automatically sends email notification)
- GET `/api/consultations` - Retrieve all consultations
- GET `/api/consultations/:id` - Retrieve specific consultation by ID

**Unified CMS API (Contents)**
- GET `/api/contents?category={category}` - List contents filtered by category (nameStory, expert, announcement, review)
- GET `/api/contents/:id` - Retrieve specific content by ID
- POST `/api/contents` - Create new content (requires Bearer token auth)
- PUT `/api/contents/:id` - Update content (requires Bearer token auth)
- DELETE `/api/contents/:id` - Delete content (requires Bearer token auth)

**Admin Authentication**
- POST `/api/admin/login` - Admin login with password, returns token
- POST `/api/admin/verify` - Verify admin token validity
- Token stored in localStorage as `kna_admin_token`
- Environment variable: `ADMIN_PASSWORD` (managed via Replit Secrets)

**Email Notification System**
- Resend integration for transactional emails
- Automatic notification to `iimooii1000@gmail.com` when consultations are submitted
- Non-blocking email sending (consultation saved even if email fails)
- HTML and text email templates with full consultation details
- Environment variable: `RESEND_API_KEY` (managed via Replit Secrets)

**Data Models**
- User model with username/password authentication structure
- Consultation model supporting both name analysis and naming requests
- Complex consultation data including multiple people, name changes, and file attachments
- Content model (unified CMS): id, category (nameStory|expert|announcement|review), title, thumbnail, content, videoUrl, isVideo, createdAt, updatedAt

**Content Body Image Embedding**
- Admin can embed images in content body using the "이미지 추가" button
- Images are stored in Object Storage and inserted as markdown: `![이미지](url)`
- Detail pages parse and render markdown images using regex: `/^!\[([^\]]*)\]\(([^)]+)\)$/`
- Only image-only lines are parsed (for security - no inline HTML injection)
- Images that fail to load are hidden via onError handler

**Note:** Currently using MemStorage (in-memory). Data is lost on server restart. For persistent storage, PostgreSQL database migration is required.

### Development Environment

**Replit Integration**
- Custom Vite plugins for Replit-specific features (runtime error overlay, cartographer, dev banner)
- Development server with HMR (Hot Module Replacement)
- Middleware mode for Vite integration with Express

**Build & Deployment**
- Production build: Vite for client assets, esbuild for server bundling
- TypeScript compilation with strict mode and path aliases
- Separate client and server build outputs

## External Dependencies

### Core Framework Dependencies
- **@tanstack/react-query** - Server state management and data synchronization
- **drizzle-orm** - Type-safe ORM for database operations
- **drizzle-zod** - Zod schema generation from Drizzle schemas
- **@neondatabase/serverless** - Neon PostgreSQL serverless driver

### UI Component Libraries
- **@radix-ui/react-*** - Comprehensive suite of accessible UI primitives (accordion, dialog, dropdown, select, tabs, toast, tooltip, etc.)
- **lucide-react** - Icon library for consistent iconography
- **embla-carousel-react** - Carousel/slider functionality

### Form & Validation
- **react-hook-form** - Performant form state management
- **@hookform/resolvers** - Validation resolver integration
- **zod** - Schema validation and type inference

### Styling & Theming
- **tailwindcss** - Utility-first CSS framework
- **class-variance-authority** - Type-safe variant management for components
- **clsx** & **tailwind-merge** - Conditional class name composition

### Development Tools
- **vite** - Next-generation frontend build tool
- **typescript** - Type-safe JavaScript
- **tsx** - TypeScript execution for Node.js
- **esbuild** - Fast JavaScript bundler

### Communication & Notifications
- **resend** - Email API for transactional email notifications

### Date & Utility Libraries
- **date-fns** - Date manipulation and formatting
- **nanoid** - Unique ID generation
- **cmdk** - Command menu functionality

### Session Management
- **connect-pg-simple** - PostgreSQL session store (prepared for authentication)
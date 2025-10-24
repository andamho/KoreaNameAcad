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
- **Admin (/admin)** - Administrative dashboard

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
- Platform-specific CSS using `html.ua-instagram` and `html.ua-tiktok` selectors
- Font size reduction via clamp() with !important flags for h1 (max 36px) and p (max 22px)
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
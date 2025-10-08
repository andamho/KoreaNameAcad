# Korean Name School (한국이름학교)

## Overview

Korean Name School is a web application that provides professional Korean name analysis and naming services. The platform allows users to understand the meaning and significance of their names, request new names, and receive expert consultations. The application features a modern, culturally-respectful design that honors Korean naming traditions while maintaining contemporary accessibility.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & Build System**
- React with TypeScript for type-safe component development
- Vite as the build tool and development server, configured with custom aliasing for clean imports
- Wouter for lightweight client-side routing (single-page application)

**UI Component System**
- shadcn/ui component library with Radix UI primitives for accessible, customizable components
- Tailwind CSS for utility-first styling with custom design tokens
- Custom theme system supporting light and dark modes with HSL color variables
- Pretendard font for Korean typography with Inter as fallback

**State Management & Data Fetching**
- TanStack Query (React Query) for server state management and caching
- React Hook Form with Zod for form validation and type-safe form handling
- Custom hooks for mobile detection and toast notifications

**Design System**
- Reference-based design inspired by Headspace and Calm
- Custom color palette featuring traditional Korean blue (primary), warm earth tones (secondary), and soft coral (accent)
- Responsive layout system using Tailwind spacing primitives
- Component library includes Hero sections, Service cards, Testimonial cards, and Story cards

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
- POST `/api/consultations` - Create new consultation requests
- GET `/api/consultations` - Retrieve all consultations
- GET `/api/consultations/:id` - Retrieve specific consultation by ID

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

### Date & Utility Libraries
- **date-fns** - Date manipulation and formatting
- **nanoid** - Unique ID generation
- **cmdk** - Command menu functionality

### Session Management
- **connect-pg-simple** - PostgreSQL session store (prepared for authentication)
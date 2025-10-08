# Design Guidelines: 한국이름학교 (Korean Name School)

## Design Approach
**Reference-Based Design** drawing from modern service platforms like Headspace (calm, trustworthy), Calm (minimal, purposeful), and Korean digital services (clean typography, organized layouts). The design balances traditional Korean cultural elements with contemporary web aesthetics.

## Core Design Principles
- **Cultural Respect**: Honor Korean naming traditions while maintaining modern accessibility
- **Trust & Credibility**: Professional presentation that establishes expertise
- **Clear Service Paths**: Intuitive navigation to consultation and naming services
- **Storytelling**: Engaging presentation of name analysis and customer experiences

## Color Palette

**Light Mode:**
- Primary: 200 85% 25% (Deep traditional Korean blue - trust, wisdom)
- Secondary: 25 70% 50% (Warm earth tone - warmth, tradition)
- Accent: 340 75% 55% (Soft coral - highlights, CTAs)
- Background: 0 0% 98% (Near white)
- Text: 220 15% 20% (Dark blue-gray)

**Dark Mode:**
- Primary: 200 70% 65% (Lighter blue)
- Secondary: 25 60% 60% (Warmer earth)
- Accent: 340 70% 65% (Lighter coral)
- Background: 220 20% 10% (Deep blue-black)
- Text: 0 0% 95% (Off-white)

## Typography
- **Headings**: Pretendard (Korean) / Inter (fallback) - Weights: 600, 700, 800
- **Body**: Pretendard (Korean) / system-ui (fallback) - Weights: 400, 500
- **Scale**: text-sm to text-5xl, responsive scaling on mobile
- **Korean Typography**: Increased letter-spacing (tracking-wide) for readability

## Layout System
**Spacing Primitives**: Tailwind units of 4, 8, 12, 16, 20, 24 (e.g., p-4, py-12, gap-8, space-y-16)
- Sections: py-16 md:py-24 lg:py-32
- Component spacing: gap-8 or gap-12
- Container: max-w-7xl mx-auto px-4 md:px-6

## Component Library

**Hero Section**
- Full-width with subtle gradient overlay
- Large centered heading (한국이름학교의 전문적인 이름 분석)
- Subheading explaining core service value
- Dual CTA buttons: "상담 신청하기" (primary), "이름 이야기 보기" (outline with blur backdrop)
- Background: Abstract Korean calligraphy-inspired pattern or traditional Korean motif imagery

**Services Grid** (2-column on desktop, stack on mobile)
- Icon cards for: Name Analysis (이름분석), Name Creation (작명), Consultation (상담)
- Each card: Icon (from Heroicons), title, brief description, "자세히 보기" link
- Hover: Subtle lift effect (translate-y-1), shadow expansion

**Application Forms**
- Clean, single-column layout with generous spacing
- Input groups with labels above fields
- Primary CTA at bottom, secondary contact info on side (desktop 2-col)
- Form sections: Personal info, Service selection, Message/Questions

**Testimonials Carousel**
- 3-column grid (desktop), horizontal scroll (mobile)  
- Cards with: Customer name, service used, before/after insight, rating stars
- Soft background cards with subtle border

**Story/Blog Section**
- Magazine-style card grid (2-3 columns)
- Featured image, headline, excerpt, "더 읽기" CTA
- Category tags for filtering

**Footer**
- 3-column layout: About/Services/Contact
- Newsletter signup with inline form
- Social links (if applicable)
- Business registration info, operating hours

## Images

**Hero Section**: 
- Large, professional image showing Korean calligraphy, traditional name seals (도장), or abstract representation of Korean characters
- Subtle overlay (bg-gradient-to-r from-primary/80 to-primary/60)

**Service Icons**: Use Heroicons - academic-cap, pencil-square, chat-bubble-left-right

**Testimonial Section**: Customer photos (placeholder avatars if needed)

**Story Cards**: Featured images related to Korean naming culture, traditional elements

## Interaction Patterns
- Smooth scroll between sections (scroll-smooth)
- Form validation: Inline error messages with gentle color indicators
- CTA hover: Scale-105 transform with shadow enhancement
- Card interactions: Minimal - subtle shadow and translate on hover only
- Mobile: Touch-friendly 44px minimum tap targets

## Accessibility & Performance
- Semantic HTML structure (header, nav, main, section, footer)
- ARIA labels for Korean screen readers
- Keyboard navigation for all interactive elements
- Lazy loading for images below fold
- Consistent dark mode across all forms and inputs

## Multi-Section Landing Page Structure
1. Hero with dual CTAs
2. Services overview (3-card grid)
3. How it works (step-by-step process)
4. Consultation application form section
5. Testimonials (social proof)
6. Name stories/blog preview
7. Final CTA + FAQ
8. Comprehensive footer
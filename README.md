# THE GALLERY BY F.Y. | SILENT FLÂNERIE

[![Astro](https://img.shields.io/badge/Astro-4.0+-FF5D01.svg?style=for-the-badge&logo=astro&logoColor=white)](https://astro.build/)
[![Clerk](https://img.shields.io/badge/Clerk-Managed_Auth-6C47FF.svg?style=for-the-badge&logo=clerk&logoColor=white)](https://clerk.com/)
[![Postgres](https://img.shields.io/badge/Postgres-Neon_DB-336791.svg?style=for-the-badge&logo=postgresql&logoColor=white)](https://neon.tech/)
[![Vercel](https://img.shields.io/badge/Vercel-Deployed-black.svg?style=for-the-badge&logo=vercel&logoColor=white)](https://vercel.com/)

A premium, high-performance photography portfolio ecosystem designed for visual storytellers. Evolved from a simple static site to a robust multi-user platform, it leverages a sophisticated Postgres + R2 backend and Clerk-based identity management.

🔗 **Live**: [penumbrae.uk](https://penumbrae.uk)

---

## ✨ Core Features

### 🖼️ Elite Gallery Experience
- **Expanded & Collapsed Modes**: Toggle between aesthetic "Stack" views and efficient "Grid" views.
- **Fluid Masonry Layout**: Adaptive grid balancing images of all aspect ratios.
- **PhotoSwipe 5 Integration**: State-of-the-art lightbox with deep-zoom, mobile gestures, and smart preloading.

### 👤 Multi-User Ecosystem
- **Personal Portfolios (`/u/[username]`)**: Every registered user gets a custom-branded public profile.
- **Onboarding Flow**: Guided experience for new users to initialize their profile background and settings.
- **Username Redirection**: Seamless 301 redirection for profile URLs after a username change.

### 🛡️ Secure Infrastructure & RBAC
- **Clerk Authentication**: Enterprise-grade identity management with invitation-based registration.
- **Admin vs. User Tiers**: 
  - **Admins**: Global content oversight and site-wide settings management.
  - **Users**: Secure management of personal stacks, background, and sorting.
- **Neon Postgres**: Relational database for sub-ms metadata retrieval and strict data isolation.
- **Cloudflare R2**: High-resolution assets served via a global CDN with zero bandwidth costs.

---

## 🎨 Design Philosophy

The portfolio follows a **Minimalist Luxury** aesthetic:
- **Typography-First**: High-contrast headings using Montserrat and Cormorant Garamond.
- **Micro-animations**: Subtle transitions on hover and scroll to provide a tactile feel.
- **Anti-Ghosting UI**: Custom CSS hardening to ensure layouts remain stable during transitions.

---

## 🛠️ Technical Stack

- **Framework**: [Astro](https://astro.build/) (Hybrid SSR)
- **Database**: [Neon Postgres](https://neon.tech/) (Serverless SQL)
- **Auth**: [Clerk](https://clerk.com/)
- **Storage**: [Cloudflare R2](https://www.cloudflare.com/developer-platform/r2/)
- **Interactions**: [SortableJS](https://sortablejs.com/) for drag-and-drop reordering

---

## 📝 Changelog

### v1.5.0 (Current)
- **Expanded Mode Engine**: Implemented the "Expand/Collapse" view toggle with independent photo-level sorting (`expanded_sort_order`).
- **Owner Preference Persistence**: Gallery display mode (expanded/collapsed) is now saved to the user profile and persists across visits.
- **UI Hardening**: Resolved visual artifacts, ghosting animations, and layout shifts in the bottom bar. Established a stable, fixed-width button system.
- **Batch Management**: Added support for single-photo deletion within expanded mode.

### v1.4.0
- **Personal Page System**: Launched `/u/[username]` dynamic routing, giving every user a unique public portfolio.
- **Onboarding Flow**: Added a dedicated onboarding sequence for first-time users to set up their profile background.
- **Username Redirects**: Built a redirection layer to keep profile links alive after a username change.
- **Database Schema Evolution**: Migrated to a relational schema (Stacks + Photos + Users) to support multi-user isolation.

### v1.3.0
- **CDN Domain Migration**: Migrated asset storage to `penumbrae.uk` domain to optimize availability in restricted network environments.
- **Global URL Batch Update**: Automated database migration to update all existing R2 links to the new CDN domain.

### v1.2.0
- **Postgres Integration**: Replaced JSON-based storage with Neon Postgres for improved performance.
- **Invitation System**: Added invitation-code registration gated by Clerk.
- **Branding**: Official rebranding to **Silent Flânerie**.

### v1.1.0
- **R2 Cloud Migration**: Moved all image assets from the GitHub repository to **Cloudflare R2** object storage, enabling instant content updates without redeployment.
- **Hybrid Rendering**: Refactored the core from a static site to a dynamic system capable of fetching data at runtime.
- **On-the-fly Features**: Added client-side image compression and metadata handling for faster uploads.

### v1.0.0
- **Initial Release**: Minimalist Astro site with GitHub-hosted images.
- **Foundation**: Established masonry grid layout, PhotoSwipe integration, and the project's signature dark aesthetic.
- **Admin Start**: First iteration of drag-and-drop sorting via SortableJS.

---

> [!IMPORTANT]
> This project requires the following environment variables:
> - `POSTGRES_URL` — Neon database connection string
> - `CLERK_SECRET_KEY` / `PUBLIC_CLERK_PUBLISHABLE_KEY` — Clerk auth keys
> - `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` — Cloudflare R2 credentials
> - `R2_PUBLIC_DOMAIN` — CDN domain for assets (e.g. `img.penumbrae.uk`)

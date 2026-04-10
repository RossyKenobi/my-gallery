# THE GALLERY BY F.Y. | SILENT FLÂNERIE

[![Astro](https://img.shields.io/badge/Astro-4.0+-FF5D01.svg?style=for-the-badge&logo=astro&logoColor=white)](https://astro.build/)
[![Clerk](https://img.shields.io/badge/Clerk-Managed_Auth-6C47FF.svg?style=for-the-badge&logo=clerk&logoColor=white)](https://clerk.com/)
[![Postgres](https://img.shields.io/badge/Postgres-Neon_DB-336791.svg?style=for-the-badge&logo=postgresql&logoColor=white)](https://neon.tech/)
[![Vercel](https://img.shields.io/badge/Vercel-Deployed-black.svg?style=for-the-badge&logo=vercel&logoColor=white)](https://vercel.com/)

A premium, high-performance photography portfolio designed for visual storytellers. Evolved from a simple static site to a robust serverless full-stack application, it now leverages Postgres for lightning-fast metadata handling and Clerk for secure, role-based access control.

🔗 **Live**: [penumbrae.uk](https://penumbrae.uk)

---

## ✨ Core Features

### 🖼️ Premium Gallery Experience
- **Fluid Masonry Layout**: Adaptive grid that balances images of all aspect ratios.
- **PhotoSwipe 5 Integration**: A state-of-the-art lightbox with deep-zoom, mobile gestures, and smart preloading.
- **Dynamic Aspect Ratios**: Intelligent handling of portrait, landscape, and panoramic shots without distortion.

### 🛡️ Role-Based Content Management (RBAC)
- **Multi-User Collaboration**: Support for both Administrators and Ordinary Users.
- **Permission Tiers**: 
  - **Admins**: Full control over global gallery reordering and any content.
  - **Users**: Upload and manage their own stacks while viewing others in a read-only state.
- **Clerk Authentication**: Secure, enterprise-grade identity management with invitation-based registration.

### 📸 Pro-Grade Infrastructure
- **Cloudflare R2 Storage**: High-resolution assets served via a global CDN (`img.penumbrae.uk`) with zero bandwidth egress costs.
- **Neon Postgres**: Relational database for instant content updates and persistent sorting order.

---

## 🛠️ Technical Stack

- **Framework**: [Astro](https://astro.build/) (Hybrid SSR for dynamic permissions and SEO)
- **Database**: [Neon Postgres](https://neon.tech/) (Serverless SQL)
- **Auth**: [Clerk](https://clerk.com/) (Identity & Access)
- **Storage**: [Cloudflare R2](https://www.cloudflare.com/developer-platform/r2/) (S3-compatible)
- **Hosting**: [Vercel](https://vercel.com/) (Serverless Functions + Edge Network)
- **Styling**: Vanilla CSS (Pill-shaped minimalist design system)
- **Interactions**: [SortableJS](https://sortablejs.com/) for drag-and-drop reordering

---

## 🚀 Quick Start

### 1. Local Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

### 2. Access & Registration

Registration is invitation-only. Contact an administrator to obtain an invitation code, then register via the **Login** link on the site.

---

## 🎨 Design Philosophy

The portfolio follows a **Minimalist Luxury** aesthetic:
- **Typography over UI**: High-contrast headings and generous whitespace.
- **Micro-animations**: Subtle transitions on hover and scroll to provide a tactile feel.
- **Dark Mode Native**: A deep charcoal palette designed to make photography pop.

---

## 📬 Contact & Information

**F.Y.**  
📧 [SMYFY1@OUTLOOK.COM](mailto:SMYFY1@OUTLOOK.COM)  
📸 [@THEONLYYFF](https://instagram.com/theonlyyff)

---

## 📝 Changelog

### v1.3.0 (Current)
- **CDN Domain Migration**: Migrated image CDN from `img.nitakupenda.eu.cc` to `img.penumbrae.uk` to improve accessibility in restricted network environments (e.g. mainland China).
- **Domain Consolidation**: Unified site and asset domains under `penumbrae.uk`, replacing the previous `nitakupenda.eu.cc`.
- **Database URL Migration**: Batch-updated all existing photo URLs in Postgres to reflect the new CDN domain.
- **CORS Update**: Updated R2 CORS rules to include the new domain origin.

### v1.2.0
- **Database Refactor**: Migrated from GitHub-based JSON storage to **Neon Postgres**, enabling sub-ms sorting and state management.
- **Role-Based Permissions**: Implemented a sophisticated RBAC permission model. Non-admins are restricted from global sorting and can only edit their own uploads.
- **Invitation System**: Added invitation-code-based registration gated by Clerk, with admin and user tier codes.
- **Cloud Stability**: Replaced GitHub API build-triggers with direct R2 uploads and immediate DB updates, eliminating deployment lag.
- **Branding**: Official rebranding to **Silent Flânerie**.

### v1.1.0
- **R2 Migration**: Moved all image assets from the GitHub repository to **Cloudflare R2** object storage, bypassing network restrictions and enabling instant content updates without redeployment.
- **Client-Side Rendering**: Refactored the gallery from static SSG to dynamic client-side rendering, fetching image data from R2 at runtime.
- **Image Compression**: Added client-side image compression (max 2400px, JPEG 85%) before upload to optimise storage and load times.

### v1.0.0
- **Initial Release**: Static Astro site with GitHub-hosted images, PhotoSwipe lightbox, masonry grid layout, and dark-mode-first design.
- **Admin UI**: Drag-and-drop reordering with SortableJS, inline edit/delete controls.
- **Responsive Design**: Fully adaptive layout across desktop, tablet, and mobile.

---

> [!IMPORTANT]
> This project requires the following environment variables to be configured in Vercel:
> - `POSTGRES_URL` — Neon database connection string
> - `CLERK_SECRET_KEY` / `PUBLIC_CLERK_PUBLISHABLE_KEY` — Clerk authentication keys
> - `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` — Cloudflare R2 credentials

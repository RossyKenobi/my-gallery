# THE GALLERY BY F.Y. | SILENT FLÂNERIE

[![Astro](https://img.shields.io/badge/Astro-4.0+-FF5D01.svg?style=for-the-badge&logo=astro&logoColor=white)](https://astro.build/)
[![Clerk](https://img.shields.io/badge/Clerk-Managed_Auth-6C47FF.svg?style=for-the-badge&logo=clerk&logoColor=white)](https://clerk.com/)
[![Postgres](https://img.shields.io/badge/Postgres-Neon_DB-336791.svg?style=for-the-badge&logo=postgresql&logoColor=white)](https://neon.tech/)
[![Vercel](https://img.shields.io/badge/Vercel-Deployed-black.svg?style=for-the-badge&logo=vercel&logoColor=white)](https://vercel.com/)

A premium, high-performance photography portfolio designed for visual storytellers. Evolved from a simple static site to a robust serverless full-stack application, it now leverages Postgres for lightning-fast metadata handling and Clerk for secure, role-based access control.

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
- **Cloudflare R2 Storage**: High-resolution assets served via a global CDN with zero bandwidth egress costs.
- **Neon Postgres**: Relational database for instant content updates and persistent sorting order.

---

## 🛠️ Technical Stack

- **Framework**: [Astro](https://astro.build/) (Hybrid SSR for dynamic permissions and SEO)
- **Database**: [Neon Postgres](https://neon.tech/) (Serverless SQL)
- **Auth**: [Clerk](https://clerk.com/) (Identity & Access)
- **Storage**: [Cloudflare R2](https://www.cloudflare.com/developer-platform/r2/) (S3-compatible)
- **Styling**: Vanilla CSS (Pill-shaped minimalist design system)
- **Interactions**: [SortableJS](https://sortablejs.com/) for drag-and-drop reordering.

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

### 2. Administrative Setup

To access the **Professional Management UI**:
1. Register a new account via the **Login** link (requires a valid **Invitation Code**).
2. Use an **Invitation Code** starting with `ROOT-ADMIN-` to gain full administrative privileges.
3. Ordinary users can register with standard codes to contribute their own photography.

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

### v1.2.0 (Current)
- **Database Refactor**: Migrated from GitHub-based storage to **Neon Postgres**, enabling sub-ms sorting and state management.
- **Role-Based Permissions**: Implemented a sophisticated permission model. Non-admins are restricted from global sorting and can only edit their own uploads.
- **Cloud Stability**: Replaced GitHub API build-triggers with direct R2 uploads and immediate DB updates, eliminating deployment lag.
- **Branding**: Official rebranding to **Silent Flânerie**.

---

> [!IMPORTANT]
> This project requires **Postgres** and **Clerk** environment variables to be configured in Vercel. Ensure `POSTGRES_URL` and `CLERK_SECRET_KEY` are properly set.

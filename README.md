# F.Y. | Minimalist Photo Portfolio

[![Astro](https://img.shields.io/badge/Astro-4.0+-FF5D01.svg?style=for-the-badge&logo=astro&logoColor=white)](https://astro.build/)
[![PhotoSwipe](https://img.shields.io/badge/PhotoSwipe-5.4-yellow.svg?style=for-the-badge&logo=javascript&logoColor=black)](https://photoswipe.com/)
[![GitHub Actions](https://img.shields.io/badge/GitHub_Actions-CI/CD-black.svg?style=for-the-badge&logo=github-actions&logoColor=white)](https://github.com/features/actions)
[![Vercel](https://img.shields.io/badge/Vercel-Deployed-black.svg?style=for-the-badge&logo=vercel&logoColor=white)](https://vercel.com/)

A premium, high-performance photography portfolio designed for visual storytellers. Built on a "Zero-Backend" architecture, it leverages the GitHub API to provide full content management directly from the browser window.

---

## ✨ Core Features

### 🖼️ Premium Gallery Experience
- **Fluid Masonry Layout**: Adaptive grid that balances images of all aspect ratios.
- **PhotoSwipe 5 Integration**: A state-of-the-art lightbox with deep-zoom, mobile gestures, and smart preloading.
- **Dynamic Aspect Ratios**: Intelligent handling of portrait, landscape, and panoramic shots without distortion.

### ⚡ Zero-Backend Management (Admin UI)
- **Direct GitHub API Integration**: Manage your portfolio without a database.
- **In-Browser CRUD**: Add, reorder (drag-and-drop), and delete posts directly from the live site via a secure administrative layer.
- **Automated CI/CD**: Changes saved in the browser trigger GitHub Actions for immediate site rebuild and deployment.

### 📸 Instagram Workflow
- **Carousel Extraction**: Specialized logic for importing Instagram carousel posts while maintaining high-resolution local storage.

---

## 🛠️ Technical Stack

- **Framework**: [Astro](https://astro.build/) (Static Site Generation for sub-second load times)
- **Styling**: Vanilla CSS (Custom-built minimalist design system)
- **Interactions**: [SortableJS](https://sortablejs.com/) for gallery reordering & [PhotoSwipe](https://photoswipe.com/) for viewing.
- **Deployment**: Dual-compatibility with **GitHub Pages** (via Actions) and **Vercel**.

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

To use the **In-Browser Admin UI**:
1. Click **Admin** in the navigation bar.
2. Login using your configured local password (set by admin).
3. Enter your **GitHub Personal Access Token** (PAT) when prompted to authorize site updates.

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

> [!NOTE]
> This project is designed for photographers who want the speed of a static site with the convenience of a CMS, hosted completely for free.


# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a React-based iGaming studio portfolio website for Gladiator Studio. The application showcases slot games and mini games with age verification and login modals. It fetches game data from an external API with fallback to mock data.

## Development Commands

- `npm run dev` - Start development server
- `npm run build` - Build for production  
- `npm run lint` - Run ESLint
- `npm run preview` - Preview production build

## Architecture

### Tech Stack
- React 18 with TypeScript
- Vite for build tooling
- Tailwind CSS for styling
- Framer Motion and React Spring for animations
- Lucide React for icons

### Application Flow
The app now provides direct access to all content without authentication gates. Game data is automatically loaded on app startup.

### Key Components Structure
- `App.tsx` - Main application logic with direct game data loading
- `components/` - Reusable UI components including sections and game displays
- `api/gameData.ts` - External API integration with fallback mock data
- `types.ts` - TypeScript interfaces for games and data structures

### Data Flow
Game data is fetched from `https://game-lobby-kappa.vercel.app/api/data` with automatic fallback to hardcoded mock data if the API fails. Data loads immediately on app startup.

### Styling Approach
Uses Tailwind with bright, elegant design featuring:
- **Primary colors**: Sky blue palette (50-900)
- **Secondary colors**: Amber/yellow palette for accents
- **Accent colors**: Pink palette for highlights
- **Background**: Light gradient from slate-50 to blue-50
- **Theme**: Clean, modern light theme with soft shadows and elegant gradients

## Current Phase

- **Phase 4 end node (opened 2026-10-14, owner chose "0+A+B"):** milestones M0–M4 in `docs/plans/2026-10-14-phase-4-arena-homepage.md` (M0 age gate as a brand opening plus favicon; M1 3D steel emblem hero, title ≥ 96 px desktop / ≥ 44 px phone, top navigation; M2 scroll through the helmet into the arena; M3 hall of games ring as the second screen; M4 sound and sign-off) each meet their measurable criteria with mobile Lighthouse ≥ 80, desktop ≥ 90, accessibility and best practices 100, CLS ≤ 0.05, overflow 0 at 320/390, desktop ≥ 55 fps and real-device ≥ 50 fps; each PR gated, previewed, owner-approved and verified on production; then the owner signs off phases 3 and 4 together. Phase 3 (PRs #7–#14) is live and awaits that sign-off; phases 1 and 2 are closed.

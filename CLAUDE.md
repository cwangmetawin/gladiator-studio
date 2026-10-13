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

- **Phase 3 end node (opened 2026-10-13, owner approved):** milestones M0–M4 in `docs/plans/2026-10-13-phase-3b-signature.md` (M0 live counts and back-office RTPs, done; M1 time-based scene that stops rendering when covered; M2 camera narrative; M3 game star trails; M4 brand shader, post-processing, type motion, sound and loader hand-off) each meet their measurable criteria without regressing mobile Lighthouse ≥ 54, desktop ≥ 90, accessibility and best practices 100, overflow 0 and real-device ≥ 50 fps; each PR gated, previewed, owner-approved and verified on production; then the owner signs off. Phases 1 and 2 are closed.

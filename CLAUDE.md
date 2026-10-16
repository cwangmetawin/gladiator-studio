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

- **No phase is open.** Phases 1–5 are closed. The owner signed off phase 5 on 2026-10-16 (PRs #22–#25, #27, #29–#31, `docs/plans/2026-10-15-phase-5-client-area.md`; the review page is https://claude.ai/artifact/Vts798SNEnH8EnsH5vt3tM), after phases 3 and 4 on 2026-10-15 (https://claude.ai/artifact/7LWuxrfndP1ZRnRpWrcA5B). Open items wait in `docs/plans/2026-10-15-backlog.md`: starting any of them needs the owner's approval and becomes a new phase with its own end node.

<p align="center">
  <img src="public/favicon.svg" alt="LabFlow" width="80" height="80">
</p>

<h1 align="center">LabFlow</h1>

<p align="center">
  <strong>Research Schedule Management Application</strong><br>
  Manage your experimental protocols, schedule, routines, and inventory all in one place.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.1-blue" alt="Version">
  <img src="https://img.shields.io/badge/license-BSL--1.1-green" alt="License">
  <img src="https://img.shields.io/badge/platform-Windows-lightgrey" alt="Platform">
</p>

---

## ✨ Overview

**LabFlow** is an integrated scheduling and management tool for researchers.
It provides all the essential management features needed for research activities in one place: from registering experimental protocols to scheduling them on the calendar, managing daily routines, tracking milestones, managing reagent inventory, and writing lab notebooks.

**No Installation Required** — Simply extract the ZIP file and double-click `start.bat` to launch.

## 🚀 Quick Start

### Download

1. Download the latest `labflow-release.zip` from the [Releases](../../releases) page.
2. Extract it to any folder.
3. Double-click `start.bat`.
4. Your browser will automatically open (`http://localhost:3001`).

### First Login

| Username | Password |
|---|---|
| `admin` | `password` |

> ⚠️ **Security Notice**: Please change your password from the **Settings → Account Settings** screen immediately after your first login.

## 📋 Key Features

### 🔬 Experiment Management
- **Experiment Types** — Custom register experiment types like Western Blot, RT-qPCR, etc.
- **Step Definition** — Define the steps (procedures) for each experiment with time estimates. Supports overnight steps.
- **Block Configuration** — Manage a set of steps performed on a single day as a "block".
- **Protocol Creation** — Combine blocks to build multi-day experimental protocols.
- **Sub-protocols** — Manage and reference reusable operation procedures and reagent tables independently.
- **In-Advance Messages** — Define and set reminders for preparation tasks before executing steps.

### 📅 Calendar & Schedule
- **Calendar Views** — Four view types: Month, Week, Day, and Agenda.
- **Experiment Scheduling** — Automatically arrange your schedule just by selecting a protocol and a start date.
- **Holiday Management** — Register holidays to automatically reflect them in schedule adjustments.
- **Event Registration** — Manage non-experiment events (seminars, meetings, etc.).
- **Drag & Reschedule** — Easily change dates and automatically readjust schedules by dragging and dropping blocks.

### ✅ Routine Work
- **Recurring Task Management** — Register daily or specific day-of-week routines.
- **Timeframe Specification** — Set start and end dates for temporary routines.
- **Checklists** — Record completion with a single click from the Dashboard.

### 🎯 Milestones
- **Goal Management** — Set research goals with deadlines.
- **Subtasks** — Add subtasks to each milestone item.
- **Data Types** — Support for qualitative, quantitative, and count-based data tracking.
- **Progress Bars** — Real-time display of completion rates on the Dashboard.

### 📦 Inventory Management
- **Reagents & Supplies** — Register name, category, supplier, and catalog number.
- **Quantity Tracking** — Track inventory counts and receive minimum quantity alerts.
- **Experiment Linkage** — Associate reagents and consumption amounts with specific experiment types.

### 📝 Lab Notebook
- **Markdown Editor** — Dual-mode editor supporting Rich Text and Markdown.
- **Local File Storage** — Automatically saved as `.md` files in the `data/notebooks/` directory.
- **External Editor Support** — Can be edited directly from external tools like Obsidian and VSCode.
- **Calendar Integration** — Notes are also displayed on the calendar.

### ⚙️ Other Features
- **Dark Mode** — Toggle between Light, Dark, or System default modes.
- **Bilingual Interface** — Switch between English and Japanese UI.
- **Email Notifications** — Send daily schedules and reminders via email using SMTP settings.
- **Data Backup** — One-click backup for the SQLite database.
- **Automatic Updates** — One-click update to the latest version from GitHub Releases.
- **Dashboard Quick Links** — Manage frequently used links (e.g., Google Sheets) and open them in-app.

## 🏗️ Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite 6 + TypeScript |
| Backend | Express 5 (Node.js) |
| Database | SQLite (better-sqlite3) |
| Calendar | react-big-calendar + date-fns |
| Editor | @uiw/react-md-editor |
| Email | Nodemailer |
| Scheduler | node-cron |
| i18n | react-i18next |

## 📁 Project Structure

```
labflow/
├── src/                    # Frontend (React)
│   ├── pages/              # Screen components
│   ├── api/                # API client
│   ├── i18n/               # Internationalization
│   └── App.tsx             # Routing & Layout
├── server/                 # Backend (Express)
│   ├── db/                 # Database schema & initialization
│   ├── routes/             # API routes
│   ├── services/           # Mail & Scheduler services
│   └── index.ts            # Server entry point
├── data/                   # User data (ignored by Git)
│   ├── labflow.db          # SQLite database
│   └── notebooks/          # Markdown notebooks
├── scripts/                # Build & Release scripts
└── package.json
```

## 🛠️ Development Setup

### Prerequisites
- Node.js 20 or higher
- npm

### Instructions

```bash
# Clone the repository
git clone https://github.com/botsukosei777/LabFlow.git
cd LabFlow

# Install dependencies
npm install

# Start development server (Frontend + Backend)
npm run dev
```

Frontend: `http://localhost:5173`  
Backend API: `http://localhost:3001/api`

### Release Build

```bash
# Generate a portable distribution package (ZIP)
npm run build:release
```

## 📄 License

This project is licensed under the [Business Source License 1.1 (BSL-1.1)](./LICENSE).

- ✅ **Personal & Academic Use**: Free to use and modify.
- ✅ **Source Code Viewing & Learning**: Free to view.
- ❌ **Commercial Use**: Requires a separate license for commercial purposes.
- 🔄 **Change Date (2030-07-29)**: Automatically transitions to the Apache License 2.0 after this date.

Please refer to the [LICENSE](./LICENSE) file for more details.

## 📮 Contact & Support

For bug reports or feature requests, please use the [Issues](../../issues) page.

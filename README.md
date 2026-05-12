JM Sequence - Hospital Queue Management System
A modern, WCAG 2.1 AA-compliant queue management system for Hospital Docente Universitario Dr. Darío Contreras.

Project Overview
JM Sequence transforms patient wait experience in trauma hospitals through real-time queue management, complete transparency, and clinical-grade design. The system is built for three distinct user roles:
- Patients: Self-service kiosk to generate tickets
- Agents: Dispatch panel for managing queue calls
- Administrators: Control center for configuration and monitoring
- FOH (Front of House): Public display screens showing real-time queue status

Requirements
Node.js: ^20.19.0 or >=22.12.0
npm: 10+


Quick Start
1. Clone & Install
bashgit clone https://github.com/[your-org]/jm-sequence.git
cd jm-sequence/frontend

npm install
2. Run Development Server
bashnpm run dev
Opens at http://localhost:5173


Tech Stack

Frontend
Framework  Vue 3^3.5.32  Reactive UI, Composition API
Build Tool  Vite^8.0.8  Fast HMR, modern bundler
Router  Vue Router^5.0.6  Role-based routing
State  Pinia^3.0.4  Centralized store (turns, counters)

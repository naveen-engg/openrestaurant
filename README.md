# Open Restaurant 🍽️

Open Restaurant is a modern, enterprise-grade open-source restaurant management and point-of-sale platform designed specifically for the food and beverage industry. Built on Next.js and KeystoneJS, it delivers an all-in-one suite combining high-performance Point of Sale (POS), multi-station Kitchen Display Systems (KDS), interactive floor plans, menu engineering, course pacing, tip pooling, and offline resilience.

[![GitHub license](https://img.shields.io/github/license/naveen-engg/openrestaurant)](LICENSE)
[![Docker](https://img.shields.io/badge/docker-ready-blue.svg)](Dockerfile)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![KeystoneJS](https://img.shields.io/badge/KeystoneJS-6-purple)](https://keystonejs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791)](https://www.postgresql.org/)

---

## 🚀 Key Feature Highlights

### 1. Point of Sale (POS) & Fast Ordering
- **Touch-Optimized Ordering**: Intuitive, high-speed ordering interface designed for servers and bartenders.
- **Seat Allocation**: Assign dishes and beverages directly to specific guest seats for seamless delivery.
- **Dietary & Special Notes**: Tag items with allergies, custom prep instructions, and dietary flags directly on the order pad.

### 2. Multi-Station Kitchen Display System (KDS)
- **Station-Specific Routing**: Route items automatically to dedicated stations (**Grill, Fry, Salad, Bar, Expo**).
- **Interactive Ticket Columns**: Real-time status transitions (`pending` → `preparing` → `ready` → `completed`).
- **Pacing & Prep Timers**: Live color-coded timer counters to spot order delays instantly.
- **Expo Screen**: Full ticket aggregation for expediters to verify and complete multi-station orders together.

### 3. Course Pacing & Hold / Fire Workflow
- **Multi-Course Management**: Categorize items into courses (**Beverage, Appetizer, Entree, Dessert**).
- **Hold & Fire Logic**: Hold entrees while guests enjoy appetizers, and send a one-click "Fire" signal to notify kitchen stations.
- **Auto-Pacing Triggers**: Automatic firing delays based on configurable dining course presets.

### 4. Interactive Visual Floor Plan & Service Floor
- **Visual Table Designer**: Drag-and-drop 2D floor plan editor for dining rooms, bars, and patio sections.
- **Live Table Status**: Instant color indicators for **Available, Occupied, Dirty, and Reserved** tables.
- **Table Operations**: One-click table transfers, table merging, and server section assignments.

### 5. Advanced Modifiers & Combo Menus
- **Hierarchical Modifier Groups**: Required selections (e.g., meat temperatures) and optional add-ons with pricing.
- **Combo Meals**: Multi-tier meal choices with automatic price adjustments.
- **Interactive Photo Manager**: High-resolution food photo selector with 23 bundled sample presets, custom upload, and thumbnail synchronization.

### 6. Split Checks & Multi-Tender Payments
- **Flexible Splitting**: Split bills by individual seat, evenly $N$-ways, or by custom dollar amounts.
- **Multi-Tender Transactions**: Settle a single check using multiple payment methods (Cash, Card, Gift Cards, Custom).
- **Tip Presets & Calculation**: Automatic gratuity and tip suggestions (15%, 18%, 20%, 25%) with instant change calculation.

### 7. Staff Scheduling, Timecards & Tip Pooling
- **Time Clock**: Easy staff clock-in / clock-out tracking.
- **Tip Pooling Engine**: Allocate collected tips dynamically using **House Pool**, **Hours-Weighted**, or **Role-Weighted** algorithms (e.g. Servers 60%, Bartenders 20%, Bussers 10%, Hosts 10%).
- **Shift Reports**: Transparent financial shift breakdowns and exportable tip distribution sheets.

### 8. Offline-First Resilience & Sync Queue
- **IndexedDB Local Storage**: Continue taking orders even if the internet or local network drops.
- **Automatic Sync Queue**: Queued offline transactions automatically re-sync with the database once connectivity is restored.
- **Disaster Backup**: Manual snapshot backup and recovery utilities for mission-critical operations.

### 9. ESC/POS Thermal Printing & Hardware Manager
- **Thermal Receipt & Kitchen Chits**: Standard 80mm and 58mm ESC/POS binary printing support for receipts and kitchen tickets.
- **Cash Drawer Kick**: Hardware pulses sent via printer kick pin (`27, 112, 0, 25, 250`).
- **Station Hardware Preferences**: Configure network, USB, or local printing destinations per workstation.

---

## 🛠️ Architecture & Tech Stack

```
openrestaurant/
├── app/                    # Next.js App Router (POS, KDS, Floor Plan, Menu Architect)
│   ├── api/               # REST & GraphQL endpoints, webhooks, image handler
│   ├── dashboard/         # Platform management screens
│   ├── kds/              # Kitchen Display interface
│   └── pos/              # Full-screen Point of Sale terminal
├── features/
│   ├── dashboard/        # Administrative client components & GraphQL utilities
│   ├── keystone/         # KeystoneJS schemas, Prisma models, access controls
│   ├── platform/         # Operations, menu, tables, staff, reports, hardware
│   ├── pos/              # Split checks, seat allocation, offline sync, payments
│   └── kds/              # Station routing, hold/fire, live timers
├── migrations/           # PostgreSQL migration history
└── public/               # Static assets and local image storage
```

- **Frontend**: Next.js 16 (App Router & React 19)
- **Backend / CMS**: KeystoneJS 6 (GraphQL API)
- **Database**: PostgreSQL with Prisma ORM
- **Styling**: Tailwind CSS & Lucide Icons
- **Hardware Integration**: ESC/POS thermal command stream & Web Print API
- **Local Persistence**: IndexedDB offline storage & local media storage

---

## 📦 Deployment Instructions

### Option 1: Docker & Docker Compose (Recommended for Production)

Open Restaurant provides a production-hardened multi-stage Docker build utilizing Node 22 Alpine, Next.js standalone output, and automatic database migrations.

1. **Clone the repository:**
   ```bash
   git clone https://github.com/naveen-engg/openrestaurant.git
   cd openrestaurant
   ```

2. **Configure your environment:**
   Create a `.env` file in the root directory:
   ```env
   # PostgreSQL Connection (Docker service name or external host)
   DATABASE_URL="postgresql://postgres:postgres@postgres:5432/openfront_restaurant"
   
   # Session Security (Generate a random 32+ character string)
   SESSION_SECRET="change-this-to-a-very-long-and-secure-random-secret-key-32-chars"
   
   # Server Port
   PORT=3000
   
   # Storage Backend ("local" for self-hosted disk storage, or "s3")
   STORAGE_KIND=local
   
   # Set to "true" only on the first run if you want sample demo data seeded
   SEED_DATABASE=false
   ```

3. **Start the containers:**
   ```bash
   docker compose up -d --build
   ```

4. **Verify running containers:**
   ```bash
   docker compose ps
   ```
   The application will be accessible at:
   - **Dashboard & Menu:** [http://localhost:3000/dashboard/platform/menu](http://localhost:3000/dashboard/platform/menu)
   - **POS Terminal:** [http://localhost:3000/dashboard/platform/pos](http://localhost:3000/dashboard/platform/pos)
   - **KDS Kitchen View:** [http://localhost:3000/dashboard/platform/kds](http://localhost:3000/dashboard/platform/kds)
   - **Visual Floor Plan:** [http://localhost:3000/dashboard/platform/service-floor](http://localhost:3000/dashboard/platform/service-floor)

---

### Option 2: Bare Metal / Standalone Linux VPS

1. **Prerequisites:**
   - Node.js 20.x or 22.x
   - PostgreSQL 15+ running with a created database

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run database migrations:**
   ```bash
   npx prisma migrate deploy
   ```

4. **Build the production bundle:**
   ```bash
   npm run build
   ```

5. **Start with Process Manager (PM2):**
   ```bash
   npm install -g pm2
   pm2 start npm --name "open-restaurant" -- run start
   pm2 save
   ```

---

### Option 3: Cloud Platforms (Railway, Render, AWS ECS)

1. **Database:** Deploy a managed PostgreSQL instance and copy the connection string into `DATABASE_URL`.
2. **Environment Variables:** Set `DATABASE_URL`, `SESSION_SECRET`, and `STORAGE_KIND=local` in the dashboard settings.
3. **Build & Start Command:**
   - **Build Command:** `npm run build`
   - **Start Command:** `npx prisma migrate deploy && npm run start`

---

## 🔐 Default Credentials (When Seeded)

When `SEED_DATABASE=true` is enabled on initial database creation:
- **Email:** `admin@openfront.io` (or your configured restaurant manager email)
- **Password:** Configured via `INITIAL_ADMIN_PASSWORD` in your `.env`

---

## 🧪 Testing & Quality Assurance

Run the comprehensive unit, integration, and component test suite:
```bash
# Run all tests once
npm test

# Run specific test file
npx vitest run tests/components/menu-item-image.test.tsx
```

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

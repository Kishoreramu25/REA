# ESEC Bus Transport - React Native & Expo Mobile Application

Official Mobile Bus Tracking and Management System for **Erode Sengunthar Engineering College (ESEC)**.

Built with **React Native (Expo)**, **Supabase PostgreSQL & Realtime**, and **Background Geolocation Services**.

---

## 📁 Project Architecture & Structure

```
concordia/
├── app.json                    # Expo application manifest, Android permissions & plugin config
├── package.json                # Project dependencies & scripts
├── babel.config.js             # Babel preset configuration
├── App.js                      # Root application entry with Providers & Navigators
├── assets/                     # College logos, adaptive icons, and splash screens
├── src/
│   ├── screens/
│   │   ├── SplashScreen.js     # Institutional splash screen with auto-routing
│   │   ├── LoginScreen.js      # Multi-role login (Admin PIN, Driver Shift, Parent)
│   │   ├── AdminDashboard.js   # Route management, search, and bus list
│   │   ├── AdminAddBus.js      # Bus creation & edit with stop timings
│   │   ├── DriverTracking.js   # Shift dashboard with background GPS broadcast
│   │   ├── ParentHome.js       # Student/Parent home with bus dropdown & search
│   │   └── BusTracker.js       # Live bus tracking, timeline stops & driver call
│   ├── components/
│   │   ├── BusForm.js          # Form for route specs (Number, Start/End, Times)
│   │   ├── StopInput.js        # Intermediate stops manager with individual times
│   │   ├── LocationDisplay.js  # Live GPS status card (Speed, Lat/Lng, Pulse)
│   │   └── BusStatus.js        # Vertical timeline of scheduled route stops
│   ├── services/
│   │   ├── supabaseClient.js   # Supabase client with AsyncStorage session
│   │   ├── locationService.js  # Foreground & Background GPS manager
│   │   ├── taskManager.js      # Headless background task definition
│   │   └── authService.js      # Authentication for Admin, Driver, and Parent
│   ├── navigation/
│   │   └── RootNavigator.js    # Native Stack Navigator
│   ├── context/
│   │   └── AuthContext.js      # Global authentication state and session
│   ├── hooks/
│   │   ├── useLocation.js      # Real-time GPS hook with Supabase streaming
│   │   └── useBusData.js       # CRUD and realtime subscription hook for buses
│   └── utils/
│       ├── constants.js        # Supabase keys, college constants, color palette
│       └── helpers.js          # Time formatters (AM/PM <-> 24h) and ETA math
├── db/
│   └── schema.sql              # Supabase tables, RLS policies, and triggers
└── README.md
```

---

## 🚀 Quick Start Guide

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Local Development Server
```bash
npx expo start
```
- Press `a` to open in Android Emulator / connected USB device.
- Scan the QR code using the **Expo Go** app on your phone.

---

## 🔐 Credentials & Default Access

- **Admin Master PIN:** `587828`
  - Accesses the Transport Admin Portal to add, edit, or delete buses and set exact stop timings.
- **Driver Shift Access:**
  - Route Number + Phone or PIN (e.g., `000045` or driver's mobile).
- **Transport Office Support:** `9976865500`

---

## 🗄️ Database & Supabase Integration
- **Supabase Project:** `https://gqjurdcxphdfairbcusj.supabase.co`
- Run the SQL script in `db/schema.sql` inside your Supabase SQL Editor.
- Realtime tracking enabled on `bus_location`.

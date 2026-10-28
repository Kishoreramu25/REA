# SPEC.md — ESEC Bus Tracking System

> **Status**: `FINALIZED`
>
> ⚠️ **Planning Lock**: No code may be written until this spec is marked `FINALIZED`.

## Vision
A school bus live-tracking system for Erode Sengunthar Engineering College. Parents pick a bus and see its live position, stop timeline, and ETA to campus. Drivers share GPS from their phone through a hidden driver mode in the same app.

## Goals
1. **Parent tracking** — Parents see live bus position, stop status, and ETA without installing extra hardware.
2. **Driver GPS sharing** — A driver logs in once, taps Start, and the phone sends location for that bus until the trip ends.
3. **Test route** — A TEST-01 route (Kishore Home → Kuber Cars) for real-world testing before school use.

## Non-Goals (Out of Scope)
- Maps, chat, payments, or notifications for parents in this phase
- GPS hardware on buses
- Driver-facing parent view (drivers only see Start/Stop)
- Public driver app on the Play Store (drivers get access through the transport office)
- Student data of any kind

## Constraints
- **Technical:** Expo (React Native) mobile app, Node.js + Express + TypeScript backend, PostgreSQL (Supabase). Auth via bcrypt + JWT.
- **Security:** Only driver mode sends location. Parent mode never requests location permission. Passwords are hashed, never stored plain.
- **Hardware:** No new hardware. Driver's Android phone is the GPS source.
- **Data:** Stop coordinates must be recorded from a real route walk. No invented coordinates.
- **Battery/data:** Driver location updates every 5–10 seconds, not faster.
- **Timeline:** Field test on TEST-01 before any ESEC bus goes live.

## Success Criteria
- [ ] All 9 backend acceptance tests pass (login, lockout, single session, no-trip 409, jump 422, rate 429, AT STOP/NEXT logic, both auto-stops)
- [ ] All 4 mobile acceptance tests pass (no location in parent screens, 7-tap entry, permission message, logout does not stop trip)
- [ ] Field tests 14–18 pass on a real Android phone for TEST-01
- [ ] Stop coordinates for TEST-01 recorded from a real walk
- [ ] Parent app shows AT STOP within 30 seconds of the bus reaching a stop
- [ ] Trip stops automatically at Kuber Cars (TEST-01) and at ESEC (real buses)
- [ ] Driver can log out mid-trip and location keeps sending

## User Stories

### As a parent
- I want to pick my child's bus from a list
- So that I can see where it is and when it reaches campus

### As a driver
- I want to log in once and tap one button
- So that I can share the bus location without typing every day

### As the transport office
- I want to reset a driver's password and register their phone
- So that a lost phone or a driver change does not give access to the wrong person

## Technical Requirements

| Requirement | Priority | Notes |
|-------------|----------|-------|
| Driver login with username + password | Must-have | Max 5 tries, then lock 5 min |
| One active session per bus | Must-have | New login revokes the old one |
| Location ingest with jump and rate checks | Must-have | 25 m/s max speed, 3 s minimum interval |
| AT STOP / NEXT / ETA logic | Must-have | Haversine distance, 50 m stop radius |
| Auto-stop at ESEC geofence | Must-have | 2 consecutive checks inside 100 m |
| Auto-stop on idle | Must-have | No movement over 30 m for 20 min |
| Background location with notification | Must-have | Android foreground service, Accuracy.Balanced |
| Offline queue for locations | Should-have | Max 200 points, flushed in order |
| Debug Record Point and Replay GPX | Should-have | Dev builds only |
| Device binding for drivers | Nice-to-have | Register phone once, later phase |
| OTP login for drivers | Nice-to-have | Later phase |

---

*Last updated: 2026-10-22*
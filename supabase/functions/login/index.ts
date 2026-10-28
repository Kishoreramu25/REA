import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { SignJWT } from "https://deno.land/x/jose@v4.14.4/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// In-memory rate limiting map: identifier -> { count, lockedUntil }
const rateLimitMap = new Map<string, { count: number; lockedUntil: number }>();

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { pin } = await req.json();
    const cleanPin = String(pin || "").trim();

    if (!cleanPin || cleanPin.length !== 6) {
      return new Response(
        JSON.stringify({ error: "PIN must be exactly 6 digits." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Client identifier from IP or forwarding header
    const clientIp = req.headers.get("x-forwarded-for") || "client_unknown";
    const now = Date.now();

    // Check rate limiter
    const rateData = rateLimitMap.get(clientIp) || { count: 0, lockedUntil: 0 };
    if (rateData.lockedUntil > now) {
      const waitMin = Math.ceil((rateData.lockedUntil - now) / 60000);
      return new Response(
        JSON.stringify({ 
          error: `Too many failed attempts. Locked out for ${waitMin} more minute(s).`,
          locked: true 
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Connect to Supabase using internal service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const jwtSecret = Deno.env.get("SUPABASE_JWT_SECRET") || "secret";

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Check Admins table
    const { data: admins } = await supabase.from("admins").select("*");
    let matchedAdmin = null;

    if (admins) {
      for (const admin of admins) {
        if (admin.pin_hash) {
          const match = await bcrypt.compare(cleanPin, admin.pin_hash);
          if (match) {
            matchedAdmin = admin;
            break;
          }
        } else if (admin.pin === cleanPin) {
          matchedAdmin = admin;
          break;
        }
      }
    }

    if (matchedAdmin) {
      // Clear rate limit
      rateLimitMap.delete(clientIp);

      // Generate short-lived JWT (1 hour) with role 'admin'
      const secretKey = new TextEncoder().encode(jwtSecret);
      const token = await new SignJWT({
        role: "admin",
        sub: `admin_${matchedAdmin.id}`,
        name: "Transport Administrator",
      })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(secretKey);

      return new Response(
        JSON.stringify({
          success: true,
          role: "admin",
          token,
          name: "Transport Administrator",
          college: matchedAdmin.college_name || "ESEC"
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Check Buses table for Driver PIN
    const { data: buses } = await supabase.from("buses").select("id, bus_number, driver_phone, driver_pin_hash");
    let matchedBus = null;

    if (buses) {
      for (const bus of buses) {
        if (bus.driver_pin_hash) {
          const match = await bcrypt.compare(cleanPin, bus.driver_pin_hash);
          if (match) {
            matchedBus = bus;
            break;
          }
        } else if (bus.driver_phone === cleanPin) {
          matchedBus = bus;
          break;
        }
      }
    }

    if (matchedBus) {
      // Clear rate limit
      rateLimitMap.delete(clientIp);

      // Generate short-lived JWT (1 hour) with role 'driver' and bus_id
      const secretKey = new TextEncoder().encode(jwtSecret);
      const token = await new SignJWT({
        role: "driver",
        bus_id: matchedBus.id,
        sub: `driver_bus_${matchedBus.id}`,
        name: `Driver (Bus ${matchedBus.bus_number})`
      })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(secretKey);

      return new Response(
        JSON.stringify({
          success: true,
          role: "driver",
          bus_id: matchedBus.id,
          token,
          name: `Driver (Bus ${matchedBus.bus_number})`,
          bus: {
            id: matchedBus.id,
            bus_number: matchedBus.bus_number,
            routeNo: parseInt(matchedBus.bus_number, 10)
          }
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Failed attempt: increment counter
    rateData.count += 1;
    if (rateData.count >= 5) {
      rateData.lockedUntil = now + 15 * 60 * 1000; // 15 minutes lockout
      rateLimitMap.set(clientIp, rateData);
      return new Response(
        JSON.stringify({ 
          error: "Too many failed attempts. Locked out for 15 minutes.", 
          locked: true 
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      rateLimitMap.set(clientIp, rateData);
      return new Response(
        JSON.stringify({ 
          error: "Invalid PIN. Check your Driver PIN or Admin password.",
          remainingAttempts: 5 - rateData.count 
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

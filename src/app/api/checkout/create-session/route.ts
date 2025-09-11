// src/app/api/checkout/create-session/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
});

export async function POST(req: NextRequest) {
  try {
    const {
      proId,                 // l'ID du pro / user (obligatoire pour ton webhook)
      priceId,               // ex: "price_123"
      quantity = 1,
      mode = "payment",      // "payment" (one-shot) ou "subscription"
      planType = "starter",  // si tu veux les repasser au webhook
      planTier = "basic",
      earlyMinutes = 15,
      channels = null,       // ex: ["sms","email"]
    } = await req.json();

    if (!proId) {
      return NextResponse.json({ error: "Missing proId" }, { status: 400 });
    }
    if (!priceId) {
      return NextResponse.json({ error: "Missing priceId" }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.create({
      mode, // "payment" ou "subscription"
      line_items: [{ price: priceId, quantity }],

      success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/cancel`,

      // ——— très important pour le webhook ———
      client_reference_id: proId,
      metadata: {
        pro_id: proId,
        plan_type: String(planType),
        plan_tier: String(planTier),
        early_minutes: String(earlyMinutes),
        channels: channels ? JSON.stringify(channels) : "",
      },
    });

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (err: any) {
    console.error("create-session error:", err?.message);
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}

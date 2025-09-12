// src/app/api/checkout/create-session/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
});

// On lit le price côté serveur uniquement
const PRICE_ID = process.env.STRIPE_PRICE_ID!; // <= IMPORTANT: "price_..."

export async function POST(req: NextRequest) {
  try {
    // 👉 proId par défaut = ton UUID de test
    const { proId = "00000000-0000-0000-0000-000000000001", mode = "payment" } =
      await req.json().catch(() => ({}));

    if (!PRICE_ID?.startsWith("price_")) {
      return NextResponse.json(
        { error: `Bad STRIPE_PRICE_ID: ${PRICE_ID}` },
        { status: 400 }
      );
    }

    const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/+$/, "");

    const session = await stripe.checkout.sessions.create({
      mode, // "payment" (one-shot) ou "subscription"
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/cancel`,
      client_reference_id: proId,
      metadata: { pro_id: proId },
    });

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (err: any) {
    console.error("create-session error:", err?.message);
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}

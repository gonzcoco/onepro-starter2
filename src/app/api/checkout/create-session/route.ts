// src/app/api/checkout/create-session/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
});

// 1) On force l'UUID de test (pour éviter 'test-user-123')
const PRO_ID =
  process.env.NEXT_PUBLIC_TEST_USER_ID ??
  "00000000-0000-0000-0000-000000000001";

// 2) On lit le price côté serveur uniquement
const PRICE_ID = process.env.STRIPE_PRICE_ID!; // "price_..."

export async function POST(req: NextRequest) {
  try {
    // on ignore le proId envoyé par le client, on utilise PRO_ID
    const { mode = "payment" } = await req.json().catch(() => ({}));

    if (!PRICE_ID || !PRICE_ID.startsWith("price_")) {
      return NextResponse.json(
        { error: `Bad STRIPE_PRICE_ID: ${PRICE_ID}` },
        { status: 400 }
      );
    }

    const session = await stripe.checkout.sessions.create({
      mode, // "payment" ou "subscription"
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/cancel`,
      // >>> IMPORTANT : on met l'UUID ici <<<
      client_reference_id: PRO_ID,
      metadata: { pro_id: PRO_ID },
    });

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (err: any) {
    console.error("create-session error:", err?.message);
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
